use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::{
    collections::VecDeque,
    sync::Mutex,
    time::{Duration, Instant},
};
use tokio::sync::oneshot;

use crate::protocol::{authorize_sender, SenderRole};

const MAX_AUDIO_BYTES: usize = 480_044;
const MAX_CANCELLED_SESSIONS: usize = 32;
const MAX_TRANSCRIPT_BYTES: usize = 1_000;

#[derive(Default)]
struct CaptureState {
    session: Option<String>,
    consumed: bool,
    cancel: Option<oneshot::Sender<()>>,
    cancelled: VecDeque<String>,
    request_times: VecDeque<Instant>,
}

impl CaptureState {
    fn remember_cancelled(&mut self, session: String) {
        if !self.cancelled.contains(&session) {
            self.cancelled.push_back(session);
            if self.cancelled.len() > MAX_CANCELLED_SESSIONS {
                self.cancelled.pop_front();
            }
        }
    }

    fn begin(&mut self, session: &str) -> Result<(), &'static str> {
        if self.cancelled.iter().any(|id| id == session) {
            return Err("recognition_cancelled");
        }
        if self.session.as_deref() == Some(session) {
            return Err("recognition_busy");
        }
        if let Some(cancel) = self.cancel.take() {
            let _ = cancel.send(());
        }
        if let Some(previous) = self.session.take() {
            self.remember_cancelled(previous);
        }
        self.session = Some(session.to_owned());
        self.consumed = false;
        Ok(())
    }

    fn cancel(&mut self, session: &str) {
        self.remember_cancelled(session.to_owned());
        if self.session.as_deref() == Some(session) {
            if let Some(cancel) = self.cancel.take() {
                let _ = cancel.send(());
            }
            self.session = None;
            self.consumed = true;
        }
    }
}

#[derive(Default)]
pub struct RecognitionState(Mutex<CaptureState>);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecognitionSessionRequest {
    session_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TranscriptionRequest {
    session_id: String,
    mime_type: String,
    duration_ms: u32,
    audio_base64: String,
}

#[derive(Serialize)]
pub struct RecognitionStatus {
    configured: bool,
    model: &'static str,
}

#[derive(Serialize)]
pub struct Transcript {
    text: String,
    model: &'static str,
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
}

fn authorize(label: &str) -> Result<(), &'static str> {
    authorize_sender(label, SenderRole::Interactive).map_err(|_| "recognition_not_authorized")
}

fn decode_audio(request: &TranscriptionRequest) -> Result<(Vec<u8>, &'static str), &'static str> {
    if !valid_id(&request.session_id)
        || !(200..=15_000).contains(&request.duration_ms)
        || request.audio_base64.len() > MAX_AUDIO_BYTES.div_ceil(3) * 4
    {
        return Err("recognition_invalid_request");
    }
    let mime = match request.mime_type.as_str() {
        "audio/webm" | "audio/webm;codecs=opus" => "audio/webm",
        "audio/ogg" | "audio/ogg;codecs=opus" => "audio/ogg",
        _ => return Err("recognition_invalid_audio"),
    };
    let bytes = STANDARD
        .decode(&request.audio_base64)
        .map_err(|_| "recognition_invalid_audio")?;
    if !(128..=MAX_AUDIO_BYTES).contains(&bytes.len()) {
        return Err("recognition_invalid_audio");
    }
    let header = &bytes[..bytes.len().min(4096)];
    let valid_container = if mime == "audio/webm" {
        bytes.starts_with(&[0x1a, 0x45, 0xdf, 0xa3])
            && header.windows(4).any(|window| window == b"webm")
    } else {
        bytes.starts_with(b"OggS") && header.windows(8).any(|window| window == b"OpusHead")
    };
    if !valid_container {
        return Err("recognition_invalid_audio");
    }
    Ok((bytes, mime))
}

#[tauri::command]
pub fn e1_recognition_status(
    window: tauri::WebviewWindow,
) -> Result<RecognitionStatus, &'static str> {
    authorize(window.label())?;
    Ok(RecognitionStatus {
        configured: std::env::var("OPENAI_API_KEY").is_ok_and(|key| !key.is_empty()),
        model: "whisper-1",
    })
}

#[tauri::command]
pub fn e1_begin_recognition(
    window: tauri::WebviewWindow,
    request: RecognitionSessionRequest,
    state: tauri::State<'_, RecognitionState>,
) -> Result<(), &'static str> {
    authorize(window.label())?;
    if !valid_id(&request.session_id) {
        return Err("recognition_invalid_request");
    }
    if !std::env::var("OPENAI_API_KEY").is_ok_and(|key| !key.is_empty()) {
        return Err("recognition_not_configured");
    }
    state
        .0
        .lock()
        .map_err(|_| "recognition_unavailable")?
        .begin(&request.session_id)
}

#[tauri::command]
pub fn e1_cancel_recognition(
    window: tauri::WebviewWindow,
    request: RecognitionSessionRequest,
    state: tauri::State<'_, RecognitionState>,
) -> Result<(), &'static str> {
    authorize(window.label())?;
    if !valid_id(&request.session_id) {
        return Err("recognition_invalid_request");
    }
    state
        .0
        .lock()
        .map_err(|_| "recognition_unavailable")?
        .cancel(&request.session_id);
    Ok(())
}

async fn send_audio(
    bytes: Vec<u8>,
    mime: &'static str,
    key: String,
) -> Result<Transcript, &'static str> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(25))
        .connect_timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "recognition_unavailable")?;
    let file = reqwest::multipart::Part::bytes(bytes)
        .file_name(if mime == "audio/webm" {
            "utterance.webm"
        } else {
            "utterance.ogg"
        })
        .mime_str(mime)
        .map_err(|_| "recognition_invalid_audio")?;
    let form = reqwest::multipart::Form::new()
        .text("model", "whisper-1")
        .text("language", "en")
        .text("response_format", "json")
        .part("file", file);
    let mut response = client
        .post("https://api.openai.com/v1/audio/transcriptions")
        .bearer_auth(key)
        .multipart(form)
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                "recognition_timed_out"
            } else {
                "recognition_unavailable"
            }
        })?;
    match response.status().as_u16() {
        200 => (),
        401 => return Err("recognition_auth_failed"),
        429 => return Err("recognition_rate_limited"),
        _ => return Err("recognition_unavailable"),
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "recognition_unavailable")?
    {
        if body.len() + chunk.len() > 8192 {
            return Err("recognition_unavailable");
        }
        body.extend_from_slice(&chunk);
    }
    let value: serde_json::Value =
        serde_json::from_slice(&body).map_err(|_| "recognition_unavailable")?;
    let text = value
        .get("text")
        .and_then(|value| value.as_str())
        .filter(|text| text.len() <= MAX_TRANSCRIPT_BYTES)
        .ok_or("recognition_unavailable")?;
    Ok(Transcript {
        text: text.trim().to_owned(),
        model: "whisper-1",
    })
}

#[tauri::command]
pub async fn e1_transcribe_utterance(
    window: tauri::WebviewWindow,
    request: TranscriptionRequest,
    state: tauri::State<'_, RecognitionState>,
) -> Result<Transcript, &'static str> {
    authorize(window.label())?;
    let (bytes, mime) = decode_audio(&request)?;
    let key = std::env::var("OPENAI_API_KEY")
        .ok()
        .filter(|key| !key.is_empty())
        .ok_or("recognition_not_configured")?;
    let (tx, rx) = oneshot::channel();
    {
        let mut capture = state.0.lock().map_err(|_| "recognition_unavailable")?;
        if capture.session.as_deref() != Some(&request.session_id) || capture.consumed {
            return Err("recognition_cancelled");
        }
        while capture
            .request_times
            .front()
            .is_some_and(|time| time.elapsed() >= Duration::from_secs(60))
        {
            capture.request_times.pop_front();
        }
        if capture.request_times.len() >= 30 {
            return Err("recognition_rate_limited");
        }
        capture.consumed = true;
        capture.cancel = Some(tx);
        capture.request_times.push_back(Instant::now());
    }
    let result = tokio::select! {
        result = send_audio(bytes, mime, key) => result,
        _ = rx => Err("recognition_cancelled"),
    };
    let mut capture = state.0.lock().map_err(|_| "recognition_unavailable")?;
    if capture.session.as_deref() != Some(&request.session_id) {
        return Err("recognition_cancelled");
    }
    capture.cancel = None;
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(mime_type: &str) -> TranscriptionRequest {
        let mut bytes = vec![0; 128];
        if mime_type.starts_with("audio/webm") {
            bytes[..4].copy_from_slice(&[0x1a, 0x45, 0xdf, 0xa3]);
            bytes[8..12].copy_from_slice(b"webm");
        } else {
            bytes[..4].copy_from_slice(b"OggS");
            bytes[8..16].copy_from_slice(b"OpusHead");
        }
        TranscriptionRequest {
            session_id: "session-1".into(),
            mime_type: mime_type.into(),
            duration_ms: 1000,
            audio_base64: STANDARD.encode(bytes),
        }
    }

    #[test]
    fn only_main_can_request_or_cancel_recognition() {
        assert!(authorize("main").is_ok());
        assert!(authorize("material").is_err());
        assert!(authorize("main ").is_err());
    }

    #[test]
    fn audio_is_bounded_and_known_container_only() {
        assert!(decode_audio(&request("audio/webm;codecs=opus")).is_ok());
        assert!(decode_audio(&request("audio/ogg;codecs=opus")).is_ok());
        let mut bad = request("audio/webm");
        bad.duration_ms = 15_001;
        assert!(decode_audio(&bad).is_err());
        bad.duration_ms = 1000;
        bad.audio_base64 = STANDARD.encode(vec![0; MAX_AUDIO_BYTES + 1]);
        assert!(decode_audio(&bad).is_err());
        bad.audio_base64 = STANDARD.encode(vec![0; 128]);
        assert!(decode_audio(&bad).is_err());
        assert!(decode_audio(&request("text/html")).is_err());
    }

    #[test]
    fn payload_rejects_endpoints_models_paths_and_authority() {
        for field in ["endpoint", "model", "apiKey", "path", "permission"] {
            let value = serde_json::json!({ "sessionId": "test", "mimeType": "audio/webm", "durationMs": 1000, "audioBase64": "", field: "untrusted" });
            assert!(serde_json::from_value::<TranscriptionRequest>(value).is_err());
        }
        assert!(!valid_id("../secrets"));
        assert!(!valid_id(&"a".repeat(65)));
    }

    #[test]
    fn cancellation_prevents_late_begin_and_supersedes_jobs() {
        let mut state = CaptureState::default();
        state.cancel("late");
        assert!(state.begin("late").is_err());
        assert!(state.begin("one").is_ok());
        let (tx, mut rx) = oneshot::channel();
        state.cancel = Some(tx);
        assert!(state.begin("two").is_ok());
        assert!(rx.try_recv().is_ok());
        assert!(state.begin("one").is_err());
        state.cancel("one");
        assert_eq!(state.session.as_deref(), Some("two"));
        state.cancel("two");
        assert!(state.session.is_none());
        assert!(state.begin("two").is_err());
    }
}
