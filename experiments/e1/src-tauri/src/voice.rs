// E1-only adaptation of Week 1's narration transport and prompt policy.
// Configuration remains ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID, loaded by the launcher.
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, VecDeque},
    sync::Mutex,
    time::{Duration, Instant},
};
use tokio::sync::oneshot;

const FIXTURE: &str = include_str!("../../fixtures/w-nyc-02.daily.json");
const PROFILE: &str = include_str!("../../../../week1/fixtures/narration/voice-profile.json");
const POLICY: &str = include_str!("../../../../week1/fixtures/narration/prompt-policy.json");
const MAX_AUDIO_BYTES: usize = 400_000;
const RETIRED_LIMIT: usize = 128;
// E1's owner requested a short, immediately readable/spoken weather answer. This explicit
// exception preserves the shared v3 policy rather than padding an answer to 251 characters.
const SHORT_FORM_REASON: &str = "E1 owner-requested concise synthetic today/tomorrow forecast, with facts exposed before speech.";

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum ForecastDay {
    Today,
    Tomorrow,
}
impl ForecastDay {
    fn label(self) -> &'static str {
        match self {
            Self::Today => "today",
            Self::Tomorrow => "tomorrow",
        }
    }
    fn index(self) -> usize {
        match self {
            Self::Today => 0,
            Self::Tomorrow => 1,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NarrationRequest {
    request_id: String,
    fixture_id: String,
    fixture_revision: u8,
    day: ForecastDay,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CancelNarration {
    request_id: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NarrationStatus {
    configured: bool,
    provider: &'static str,
    model: &'static str,
    voice_source: &'static str,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NarrationAudio {
    request_id: String,
    fixture_id: &'static str,
    fixture_revision: u8,
    day: ForecastDay,
    text: String,
    audio_base64: String,
    mime: &'static str,
}
struct Config {
    key: String,
    voice: String,
}
struct Job {
    id: String,
    cancel: oneshot::Sender<()>,
}
#[derive(Default)]
struct NarrationInner {
    job: Option<Job>,
    retired: VecDeque<String>,
    last: Option<Instant>,
    cache_voice: String,
    cache: HashMap<ForecastDay, String>,
}
#[derive(Default)]
pub struct NarrationState {
    inner: Mutex<NarrationInner>,
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')
}
fn config() -> Option<Config> {
    let key = std::env::var("ELEVENLABS_API_KEY")
        .ok()
        .filter(|v| !v.is_empty())?;
    let voice = std::env::var("ELEVENLABS_VOICE_ID").ok().filter(|v| {
        !v.is_empty()
            && v.len() <= 80
            && v.bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
    })?;
    Some(Config { key, voice })
}
fn authorize(label: &str) -> Result<(), &'static str> {
    crate::protocol::authorize_sender(label, crate::protocol::SenderRole::Interactive)
        .map_err(|_| "narration_unauthorized")
}
fn retire(inner: &mut NarrationInner, id: String) {
    if !inner.retired.contains(&id) {
        inner.retired.push_back(id);
    }
    while inner.retired.len() > RETIRED_LIMIT {
        inner.retired.pop_front();
    }
}
fn cancel(inner: &mut NarrationInner, request_id: &str) {
    // Remember cancellation even if IPC delivery overtakes the synthesis request.
    retire(inner, request_id.to_owned());
    if inner.job.as_ref().is_some_and(|job| job.id == request_id) {
        if let Some(job) = inner.job.take() {
            let _ = job.cancel.send(());
        }
    }
}
fn reserve(
    inner: &mut NarrationInner,
    request_id: &str,
) -> Result<oneshot::Receiver<()>, &'static str> {
    if inner.retired.iter().any(|id| id == request_id) {
        return Err("narration_cancelled");
    }
    if let Some(job) = inner.job.take() {
        retire(inner, job.id);
        let _ = job.cancel.send(());
    }
    if inner
        .last
        .is_some_and(|time| time.elapsed() < Duration::from_millis(250))
    {
        retire(inner, request_id.to_owned());
        return Err("narration_busy");
    }
    let (tx, rx) = oneshot::channel();
    inner.job = Some(Job {
        id: request_id.to_owned(),
        cancel: tx,
    });
    inner.last = Some(Instant::now());
    Ok(rx)
}

fn grounded_sentence(
    request: &NarrationRequest,
    fixture: &serde_json::Value,
) -> Result<String, &'static str> {
    if !valid_id(&request.request_id)
        || request.fixture_id != "W-NYC-02"
        || request.fixture_revision != 1
    {
        return Err("invalid_narration_request");
    }
    let expected_context = fixture["fixtureId"] == "W-NYC-02"
        && fixture["schemaVersion"] == "e1.daily-weather-fixture/1"
        && fixture["revision"] == 1
        && fixture["scenarioDate"] == "2026-10-14"
        && fixture["asOfLocal"] == "2026-10-14T08:00:00-04:00"
        && fixture["location"]
            == serde_json::json!({"id":"nyc","label":"New York City","timezone":"America/New_York"})
        && fixture["source"]["kind"] == "synthetic"
        && fixture["units"]
            == serde_json::json!({"temperature":"°C","precipitationProbability":"%","wind":"km/h"});
    if !expected_context
        || fixture["records"]
            .as_array()
            .is_none_or(|records| records.len() != 2)
    {
        return Err("speech_source_unavailable");
    }
    let record = &fixture["records"][request.day.index()];
    let expected = match request.day {
        ForecastDay::Today => {
            serde_json::json!({"day":"today","date":"2026-10-14","condition":"sunny","temperatureC":22,"precipitationProbabilityPercent":5,"windKmh":18})
        }
        ForecastDay::Tomorrow => {
            serde_json::json!({"day":"tomorrow","date":"2026-10-15","condition":"rainy","temperatureC":16,"precipitationProbabilityPercent":85,"windKmh":22})
        }
    };
    if record != &expected {
        return Err("speech_source_unavailable");
    }
    let condition = record["condition"]
        .as_str()
        .ok_or("speech_source_unavailable")?;
    let temperature = record["temperatureC"]
        .as_i64()
        .ok_or("speech_source_unavailable")?;
    Ok(format!("In this synthetic scenario, {} in New York City is {condition}, {temperature} degrees Celsius.", request.day.label()))
}

fn speech_payload(request: &NarrationRequest) -> Result<(String, serde_json::Value), &'static str> {
    let fixture: serde_json::Value =
        serde_json::from_str(FIXTURE).map_err(|_| "speech_source_unavailable")?;
    let sentence = grounded_sentence(request, &fixture)?;
    let policy: serde_json::Value =
        serde_json::from_str(POLICY).map_err(|_| "invalid_voice_profile")?;
    let mut payload: serde_json::Value =
        serde_json::from_str(PROFILE).map_err(|_| "invalid_voice_profile")?;
    if policy["version"] != 1
        || policy["modelId"] != "eleven_v3"
        || payload != serde_json::json!({"model_id":"eleven_v3","voice_settings":{"stability":0.5}})
    {
        return Err("invalid_voice_profile");
    }
    let tags = policy["allowedTags"]
        .as_array()
        .ok_or("invalid_voice_profile")?;
    if !tags.iter().any(|tag| tag == "calm")
        || !tags.iter().any(|tag| tag == "analytical")
        || policy["maxStackedTags"].as_u64().is_none_or(|max| max < 2)
    {
        return Err("invalid_voice_profile");
    }
    let text = format!("[calm] [analytical] {sentence}");
    if text.contains(['<', '>'])
        || text.len() > policy["maxCharacters"].as_u64().unwrap_or(0) as usize
        || (text.len() < policy["targetMinCharacters"].as_u64().unwrap_or(u64::MAX) as usize
            && SHORT_FORM_REASON.is_empty())
    {
        return Err("invalid_speech_prompt");
    }
    payload["text"] = text.into();
    Ok((sentence, payload))
}

async fn receive_audio(mut response: reqwest::Response) -> Result<String, &'static str> {
    match response.status().as_u16() {
        200 => (),
        401 | 403 => return Err("narration_auth_failed"),
        429 => return Err("narration_rate_limited"),
        _ => return Err("narration_unavailable"),
    }
    if !response
        .headers()
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.starts_with("audio/mpeg"))
    {
        return Err("narration_unavailable");
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_AUDIO_BYTES as u64)
    {
        return Err("narration_audio_limit");
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "narration_unavailable")?
    {
        if bytes.len() + chunk.len() > MAX_AUDIO_BYTES {
            return Err("narration_audio_limit");
        }
        bytes.extend_from_slice(&chunk);
    }
    if bytes.is_empty() {
        return Err("narration_unavailable");
    }
    Ok(STANDARD.encode(bytes))
}
async fn synthesize(
    payload: serde_json::Value,
    configuration: &Config,
) -> Result<String, &'static str> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .connect_timeout(Duration::from_secs(4))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "narration_unavailable")?;
    let response = client
        .post(format!(
            "https://api.elevenlabs.io/v1/text-to-speech/{}?output_format=mp3_44100_128",
            configuration.voice
        ))
        .header("xi-api-key", &configuration.key)
        .header("Accept", "audio/mpeg")
        .json(&payload)
        .send()
        .await
        .map_err(|_| "narration_unavailable")?;
    receive_audio(response).await
}

#[tauri::command]
pub fn e1_narration_status(window: tauri::WebviewWindow) -> Result<NarrationStatus, &'static str> {
    authorize(window.label())?;
    Ok(NarrationStatus {
        configured: config().is_some(),
        provider: "ElevenLabs",
        model: "eleven_v3",
        voice_source: "Week 1 ELEVENLABS_VOICE_ID",
    })
}
#[tauri::command]
pub fn e1_cancel_narration(
    window: tauri::WebviewWindow,
    request: CancelNarration,
    state: tauri::State<'_, NarrationState>,
) -> Result<(), &'static str> {
    authorize(window.label())?;
    if !valid_id(&request.request_id) {
        return Err("invalid_narration_request");
    }
    let mut inner = state.inner.lock().map_err(|_| "narration_unavailable")?;
    cancel(&mut inner, &request.request_id);
    Ok(())
}
#[tauri::command]
pub async fn e1_speak_forecast(
    window: tauri::WebviewWindow,
    request: NarrationRequest,
    state: tauri::State<'_, NarrationState>,
) -> Result<NarrationAudio, &'static str> {
    authorize(window.label())?;
    let (text, payload) = speech_payload(&request)?;
    let configuration = config().ok_or("narration_not_configured")?;
    let (cached, cancellation) = {
        let mut inner = state.inner.lock().map_err(|_| "narration_unavailable")?;
        if inner.retired.contains(&request.request_id) {
            return Err("narration_cancelled");
        }
        if inner.cache_voice != configuration.voice {
            inner.cache.clear();
            inner.cache_voice.clone_from(&configuration.voice);
        }
        let cached = inner.cache.get(&request.day).cloned();
        let cancellation = if cached.is_some() {
            if let Some(job) = inner.job.take() {
                retire(&mut inner, job.id);
                let _ = job.cancel.send(());
            }
            retire(&mut inner, request.request_id.clone());
            None
        } else {
            Some(reserve(&mut inner, &request.request_id)?)
        };
        (cached, cancellation)
    };
    let audio_base64 = if let Some(audio) = cached {
        audio
    } else {
        let cancellation = cancellation.ok_or("narration_unavailable")?;
        let result = tokio::select! {
            value = synthesize(payload, &configuration) => value,
            _ = cancellation => Err("narration_cancelled"),
        };
        let mut inner = state.inner.lock().map_err(|_| "narration_unavailable")?;
        if !inner
            .job
            .as_ref()
            .is_some_and(|job| job.id == request.request_id)
        {
            return Err("narration_cancelled");
        }
        inner.job = None;
        retire(&mut inner, request.request_id.clone());
        let audio = result?;
        inner.cache.insert(request.day, audio.clone());
        audio
    };
    Ok(NarrationAudio {
        request_id: request.request_id,
        fixture_id: "W-NYC-02",
        fixture_revision: 1,
        day: request.day,
        text,
        audio_base64,
        mime: "audio/mpeg",
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request(day: ForecastDay) -> NarrationRequest {
        NarrationRequest {
            request_id: "synthetic-test".into(),
            fixture_id: "W-NYC-02".into(),
            fixture_revision: 1,
            day,
        }
    }
    #[test]
    fn only_controller_can_request_or_cancel_narration() {
        assert!(authorize("main").is_ok());
        for label in ["material", "remote", ""] {
            assert!(authorize(label).is_err());
        }
    }
    #[test]
    fn two_approved_sentences_match_frontend_fixture_wording() {
        for (day, phrase) in [
            (ForecastDay::Today, "today in New York City is sunny, 22"),
            (
                ForecastDay::Tomorrow,
                "tomorrow in New York City is rainy, 16",
            ),
        ] {
            let (text, payload) = speech_payload(&request(day)).unwrap();
            assert_eq!(
                text,
                format!("In this synthetic scenario, {phrase} degrees Celsius.")
            );
            assert_eq!(payload["text"], format!("[calm] [analytical] {text}"));
            assert_eq!(payload["model_id"], "eleven_v3");
            assert_eq!(
                payload["voice_settings"],
                serde_json::json!({"stability":0.5})
            );
            assert_eq!(payload.as_object().unwrap().len(), 3);
        }
    }
    #[test]
    fn stale_foreign_or_relabelled_sources_cannot_be_spoken() {
        let fixture: serde_json::Value = serde_json::from_str(FIXTURE).unwrap();
        for (path, value) in [
            ("/source/kind", serde_json::json!("live")),
            ("/location/timezone", serde_json::json!("UTC")),
            ("/records/1/date", serde_json::json!("2026-10-14")),
            ("/records/1/temperatureC", serde_json::json!(22)),
            ("/units/temperature", serde_json::json!("°F")),
        ] {
            let mut bad = fixture.clone();
            *bad.pointer_mut(path).unwrap() = value;
            assert!(grounded_sentence(&request(ForecastDay::Tomorrow), &bad).is_err());
        }
        let mut bad = request(ForecastDay::Today);
        bad.fixture_id = "W-NYC-01".into();
        assert!(speech_payload(&bad).is_err());
        bad.fixture_id = "W-NYC-02".into();
        bad.fixture_revision = 2;
        assert!(speech_payload(&bad).is_err());
    }
    #[test]
    fn requests_reject_arbitrary_text_voice_url_and_authority() {
        for extra in [
            "text",
            "voiceId",
            "endpoint",
            "apiKey",
            "permission",
            "path",
            "model",
        ] {
            let mut value = serde_json::json!({"requestId":"test","fixtureId":"W-NYC-02","fixtureRevision":1,"day":"today"});
            value[extra] = "untrusted".into();
            assert!(serde_json::from_value::<NarrationRequest>(value).is_err());
        }
        assert!(serde_json::from_value::<NarrationRequest>(serde_json::json!({"requestId":"test","fixtureId":"W-NYC-02","fixtureRevision":1,"day":"yesterday"})).is_err());
        assert!(!valid_id("../private"));
        assert!(!valid_id(&"a".repeat(65)));
    }
    #[test]
    fn cancellation_before_request_and_supersession_reject_old_work() {
        let mut inner = NarrationInner::default();
        cancel(&mut inner, "already-dismissed");
        assert!(reserve(&mut inner, "already-dismissed").is_err());
        let mut old = reserve(&mut inner, "first").unwrap();
        inner.last = None;
        let _new = reserve(&mut inner, "second").unwrap();
        assert!(old.try_recv().is_ok());
        assert_eq!(inner.job.as_ref().unwrap().id, "second");
        cancel(&mut inner, "first");
        assert_eq!(inner.job.as_ref().unwrap().id, "second");
        cancel(&mut inner, "second");
        assert!(inner.job.is_none());
        for index in 0..256 {
            cancel(&mut inner, &format!("cancel-{index}"));
        }
        assert_eq!(inner.retired.len(), RETIRED_LIMIT);
    }
    #[test]
    fn bounded_http_response_checks_use_only_loopback_mock() {
        use std::{
            io::{Read, Write},
            net::TcpListener,
        };
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        for (status, mime, body, accepted) in [
            (200, "audio/mpeg", vec![1, 2, 3], true),
            (200, "text/html", vec![1], false),
            (401, "audio/mpeg", vec![1], false),
            (200, "audio/mpeg", vec![], false),
            (200, "audio/mpeg", vec![0; MAX_AUDIO_BYTES + 1], false),
        ] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let server = std::thread::spawn(move || {
                let (mut socket, _) = listener.accept().unwrap();
                let mut buffer = [0; 4096];
                let _ = socket.read(&mut buffer);
                let header = format!("HTTP/1.1 {status} Test\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", body.len());
                let _ = socket.write_all(header.as_bytes());
                let _ = socket.write_all(&body);
            });
            let result = runtime.block_on(async {
                let response = reqwest::get(format!("http://{address}/synthetic-test"))
                    .await
                    .unwrap();
                receive_audio(response).await
            });
            assert_eq!(result.is_ok(), accepted);
            server.join().unwrap();
        }
    }
}
