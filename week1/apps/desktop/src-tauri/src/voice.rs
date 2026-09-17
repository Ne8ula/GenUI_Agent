use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::{
    sync::Mutex,
    time::{Duration, Instant},
};
use tokio::sync::oneshot;

const MAX_AUDIO: usize = 44 + 16000 * 15 * 2;
type Job = (String, oneshot::Sender<()>);
#[derive(Default)]
pub struct VoiceState {
    job: Mutex<Option<Job>>,
    last: Mutex<Option<Instant>>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VoiceRequest {
    request_id: String,
    audio_base64: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CancelRequest {
    request_id: String,
}
#[derive(Serialize)]
pub struct VoiceStatus {
    configured: bool,
    model: &'static str,
}
#[derive(Serialize)]
pub struct Transcript {
    text: String,
    model: &'static str,
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')
}
fn valid_wave(bytes: &[u8]) -> bool {
    if !(3244..=MAX_AUDIO).contains(&bytes.len()) || !bytes.len().is_multiple_of(2) {
        return false;
    }
    let u16_at = |i| u16::from_le_bytes([bytes[i], bytes[i + 1]]);
    let u32_at = |i| u32::from_le_bytes([bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]]);
    &bytes[0..4] == b"RIFF"
        && &bytes[8..16] == b"WAVEfmt "
        && &bytes[36..40] == b"data"
        && u32_at(4) as usize == bytes.len() - 8
        && u32_at(16) == 16
        && u16_at(20) == 1
        && u16_at(22) == 1
        && u32_at(24) == 16000
        && u32_at(28) == 32000
        && u16_at(32) == 2
        && u16_at(34) == 16
        && u32_at(40) as usize == bytes.len() - 44
}
fn decode(request: &VoiceRequest) -> Result<Vec<u8>, &'static str> {
    if !valid_id(&request.request_id) || request.audio_base64.len() > MAX_AUDIO.div_ceil(3) * 4 {
        return Err("invalid_request");
    }
    let bytes = STANDARD
        .decode(&request.audio_base64)
        .map_err(|_| "invalid_audio")?;
    if !valid_wave(&bytes) {
        return Err("invalid_audio");
    }
    Ok(bytes)
}

#[tauri::command]
pub fn voice_status() -> VoiceStatus {
    VoiceStatus {
        configured: std::env::var("OPENAI_API_KEY").is_ok_and(|key| !key.is_empty()),
        model: "whisper-1",
    }
}
#[tauri::command]
pub fn cancel_voice(
    request: CancelRequest,
    state: tauri::State<'_, VoiceState>,
) -> Result<(), &'static str> {
    if !valid_id(&request.request_id) {
        return Err("invalid_request");
    }
    let mut job = state.job.lock().map_err(|_| "voice_unavailable")?;
    if job.as_ref().is_some_and(|job| job.0 == request.request_id) {
        if let Some((_, cancel)) = job.take() {
            let _ = cancel.send(());
        }
    }
    Ok(())
}
async fn send_audio(bytes: Vec<u8>, key: String) -> Result<Transcript, &'static str> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(25))
        .connect_timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "voice_unavailable")?;
    let file = reqwest::multipart::Part::bytes(bytes)
        .file_name("request.wav")
        .mime_str("audio/wav")
        .map_err(|_| "invalid_audio")?;
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
        .map_err(|e| {
            if e.is_timeout() {
                "voice_cancelled_or_timed_out"
            } else {
                "voice_unavailable"
            }
        })?;
    match response.status().as_u16() {
        200 => (),
        401 => return Err("voice_auth_failed"),
        429 => return Err("voice_rate_limited"),
        _ => return Err("voice_unavailable"),
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "voice_unavailable")? {
        if body.len() + chunk.len() > 8192 {
            return Err("voice_unavailable");
        }
        body.extend_from_slice(&chunk);
    }
    let value: serde_json::Value =
        serde_json::from_slice(&body).map_err(|_| "voice_unavailable")?;
    let text = value
        .get("text")
        .and_then(|v| v.as_str())
        .filter(|s| s.len() <= 1000)
        .ok_or("voice_unavailable")?;
    Ok(Transcript {
        text: text.trim().to_owned(),
        model: "whisper-1",
    })
}
#[tauri::command]
pub async fn transcribe_weather(
    request: VoiceRequest,
    state: tauri::State<'_, VoiceState>,
) -> Result<Transcript, &'static str> {
    let bytes = decode(&request)?;
    let key = std::env::var("OPENAI_API_KEY")
        .ok()
        .filter(|s| !s.is_empty())
        .ok_or("voice_not_configured")?;
    let (tx, rx) = oneshot::channel();
    {
        let mut job = state.job.lock().map_err(|_| "voice_unavailable")?;
        let mut last = state.last.lock().map_err(|_| "voice_unavailable")?;
        if job.is_some() || last.is_some_and(|time| time.elapsed() < Duration::from_secs(2)) {
            return Err("voice_busy");
        }
        *job = Some((request.request_id.clone(), tx));
        *last = Some(Instant::now());
    }
    let result = tokio::select! { result = send_audio(bytes, key) => result, _ = rx => Err("voice_cancelled_or_timed_out") };
    let mut job = state.job.lock().map_err(|_| "voice_unavailable")?;
    if job.as_ref().is_some_and(|job| job.0 == request.request_id) {
        *job = None;
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    fn wave(samples: usize) -> Vec<u8> {
        let mut b = vec![0; 44 + samples * 2];
        let len = b.len();
        b[0..4].copy_from_slice(b"RIFF");
        b[4..8].copy_from_slice(&((len - 8) as u32).to_le_bytes());
        b[8..16].copy_from_slice(b"WAVEfmt ");
        b[16..20].copy_from_slice(&16u32.to_le_bytes());
        b[20..22].copy_from_slice(&1u16.to_le_bytes());
        b[22..24].copy_from_slice(&1u16.to_le_bytes());
        b[24..28].copy_from_slice(&16000u32.to_le_bytes());
        b[28..32].copy_from_slice(&32000u32.to_le_bytes());
        b[32..34].copy_from_slice(&2u16.to_le_bytes());
        b[34..36].copy_from_slice(&16u16.to_le_bytes());
        b[36..40].copy_from_slice(b"data");
        b[40..44].copy_from_slice(&((len - 44) as u32).to_le_bytes());
        b
    }
    #[test]
    fn canonical_audio_is_bounded_by_actual_pcm_duration() {
        assert!(valid_wave(&wave(1600)));
        assert!(valid_wave(&wave(240000)));
        assert!(!valid_wave(&wave(1599)));
        assert!(!valid_wave(&wave(240001)));
        for offset in [0, 4, 8, 16, 20, 22, 24, 28, 32, 34, 36, 40] {
            let mut bad = wave(16000);
            bad[offset] ^= 1;
            assert!(!valid_wave(&bad));
        }
    }
    #[test]
    fn requests_reject_endpoints_paths_and_authority() {
        for extra in ["endpoint", "path", "permission", "model", "apiKey"] {
            let value =
                serde_json::json!({"requestId":"demo-1", "audioBase64":"", extra:"untrusted"});
            assert!(serde_json::from_value::<VoiceRequest>(value).is_err());
        }
        assert!(!valid_id("../private"));
        assert!(!valid_id(&"a".repeat(65)));
        assert!(decode(&VoiceRequest {
            request_id: "demo-1".into(),
            audio_base64: STANDARD.encode(wave(16000))
        })
        .is_ok());
        assert!(decode(&VoiceRequest {
            request_id: "demo-1".into(),
            audio_base64: "not audio".into()
        })
        .is_err());
    }
}
