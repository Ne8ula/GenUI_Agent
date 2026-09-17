use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};
use tokio::sync::oneshot;

const LINES: &str = include_str!("../../../../fixtures/narration/weather-lines.json");
const PROFILE: &str = include_str!("../../../../fixtures/narration/voice-profile.json");
const PROMPT_POLICY: &str = include_str!("../../../../fixtures/narration/prompt-policy.json");
const WEATHER: &str = include_str!("../../../../fixtures/connectors/weather-ithaca-week.json");
fn ground_sentence(
    phase: &str,
    mut text: String,
    weather: &serde_json::Value,
) -> Result<String, &'static str> {
    if phase != "present" && phase != "wind-present" {
        return Ok(text);
    }
    if weather["id"] != "weather-ithaca-week"
        || weather["source"] != "synthetic"
        || weather["location"] != "Ithaca, New York"
    {
        return Err("speech_source_unavailable");
    }
    if phase == "wind-present" {
        return Ok(text);
    }
    if weather["days"][0]["date"] != "2026-09-17" || weather["days"][1]["date"] != "2026-09-18" {
        return Err("speech_source_unavailable");
    }
    for (index, token) in ["thursday", "friday"].iter().enumerate() {
        let label = match weather["days"][index]["condition"].as_str() {
            Some("partly-cloudy") => "partly cloudy",
            Some("clear") => "clear",
            Some("cloudy") => "cloudy",
            Some("rain") => "rainy",
            _ => return Err("speech_source_unavailable"),
        };
        text = text.replace(&format!("{{{token}}}"), label);
    }
    if text.contains(['{', '}']) {
        return Err("speech_source_unavailable");
    }
    Ok(text)
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PromptPolicy {
    version: u8,
    model_id: String,
    target_min_characters: usize,
    max_characters: usize,
    max_stacked_tags: usize,
    allowed_tags: Vec<String>,
    quiet_tags: Vec<String>,
    loud_tags: Vec<String>,
    short_form_exceptions: HashMap<String, String>,
}
fn validate_prompt(
    text: &str,
    policy: &PromptPolicy,
    short_reason: Option<&String>,
) -> Result<(), &'static str> {
    if policy.version != 1 || text.len() > policy.max_characters || text.contains(['<', '>']) {
        return Err("invalid_speech_prompt");
    }
    if text.len() < policy.target_min_characters
        && !short_reason.is_some_and(|r| !r.trim().is_empty())
    {
        return Err("short_prompt_needs_review");
    }
    if !text.starts_with('[') {
        return Err("missing_delivery_tag");
    }
    let mut rest = text;
    let mut stacked = 0;
    let mut spoken = false;
    let mut quiet = false;
    let mut loud = false;
    while !rest.is_empty() {
        if rest.starts_with('[') {
            let end = rest.find(']').ok_or("invalid_delivery_tag")?;
            let tag = &rest[1..end];
            stacked += 1;
            if !policy.allowed_tags.iter().any(|t| t == tag) || stacked > policy.max_stacked_tags {
                return Err("invalid_delivery_tag");
            }
            quiet |= policy.quiet_tags.iter().any(|t| t == tag);
            loud |= policy.loud_tags.iter().any(|t| t == tag);
            rest = &rest[end + 1..];
        } else {
            let ch = rest.chars().next().ok_or("invalid_speech_prompt")?;
            if ch == ']' {
                return Err("invalid_delivery_tag");
            }
            if !ch.is_whitespace() {
                stacked = 0;
            }
            spoken |= ch.is_ascii_alphabetic();
            rest = &rest[ch.len_utf8()..];
        }
    }
    if !spoken {
        return Err("missing_spoken_text");
    }
    if quiet && loud {
        return Err("split_extreme_delivery_into_clips");
    }
    Ok(())
}
#[derive(Default)]
pub struct NarrationState {
    job: Mutex<Option<(String, oneshot::Sender<()>)>>,
    last: Mutex<Option<Instant>>,
    cache: Mutex<(String, HashMap<String, String>)>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NarrationRequest {
    request_id: String,
    phase: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CancelNarration {
    request_id: String,
}
#[derive(Serialize)]
pub struct NarrationStatus {
    configured: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NarrationAudio {
    audio_base64: String,
    mime: &'static str,
}
fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')
}
fn config() -> Option<(String, String)> {
    let key = std::env::var("ELEVENLABS_API_KEY")
        .ok()
        .filter(|k| !k.is_empty())?;
    let voice = std::env::var("ELEVENLABS_VOICE_ID").ok().filter(|v| {
        !v.is_empty()
            && v.len() <= 80
            && v.bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
    })?;
    Some((key, voice))
}
fn sentence(request: &NarrationRequest) -> Result<String, &'static str> {
    if !valid_id(&request.request_id) {
        return Err("invalid_request");
    }
    let lines: HashMap<String, String> =
        serde_json::from_str(LINES).map_err(|_| "narration_unavailable")?;
    lines.get(&request.phase).cloned().ok_or("invalid_request")
}
#[tauri::command]
pub fn narration_status() -> NarrationStatus {
    NarrationStatus {
        configured: config().is_some(),
    }
}
#[tauri::command]
pub fn cancel_narration(
    request: CancelNarration,
    state: tauri::State<'_, NarrationState>,
) -> Result<(), &'static str> {
    if !valid_id(&request.request_id) {
        return Err("invalid_request");
    }
    let mut job = state.job.lock().map_err(|_| "narration_unavailable")?;
    if job.as_ref().is_some_and(|j| j.0 == request.request_id) {
        if let Some((_, cancel)) = job.take() {
            let _ = cancel.send(());
        }
    }
    Ok(())
}
fn speech_payload(request: &NarrationRequest) -> Result<serde_json::Value, &'static str> {
    let weather: serde_json::Value =
        serde_json::from_str(WEATHER).map_err(|_| "speech_source_unavailable")?;
    let text = ground_sentence(&request.phase, sentence(request)?, &weather)?;
    let mut payload: serde_json::Value =
        serde_json::from_str(PROFILE).map_err(|_| "narration_unavailable")?;
    let policy: PromptPolicy =
        serde_json::from_str(PROMPT_POLICY).map_err(|_| "narration_unavailable")?;
    if policy.model_id != "eleven_v3"
        || payload != serde_json::json!({"model_id":"eleven_v3","voice_settings":{"stability":0.5}})
    {
        return Err("invalid_voice_profile");
    }
    validate_prompt(
        &text,
        &policy,
        policy.short_form_exceptions.get(&request.phase),
    )?;
    payload["text"] = text.into();
    Ok(payload)
}
async fn synthesize(
    payload: serde_json::Value,
    key: String,
    voice: &str,
) -> Result<String, &'static str> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .connect_timeout(Duration::from_secs(4))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "narration_unavailable")?;
    let mut response = client
        .post(format!(
            "https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_128"
        ))
        .header("xi-api-key", key)
        .header("Accept", "audio/mpeg")
        .json(&payload)
        .send()
        .await
        .map_err(|_| "narration_unavailable")?;
    match response.status().as_u16() {
        200 => (),
        401 | 403 => return Err("narration_auth_failed"),
        _ => return Err("narration_unavailable"),
    }
    if !response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.starts_with("audio/mpeg"))
    {
        return Err("narration_unavailable");
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "narration_unavailable")?
    {
        if bytes.len() + chunk.len() > 400_000 {
            return Err("narration_unavailable");
        }
        bytes.extend_from_slice(&chunk);
    }
    if bytes.is_empty() {
        return Err("narration_unavailable");
    }
    Ok(STANDARD.encode(bytes))
}
#[tauri::command]
pub async fn speak_narration(
    request: NarrationRequest,
    state: tauri::State<'_, NarrationState>,
) -> Result<NarrationAudio, &'static str> {
    let payload = speech_payload(&request)?;
    let (key, voice) = config().ok_or("narration_not_configured")?;
    {
        let cache = state.cache.lock().map_err(|_| "narration_unavailable")?;
        if cache.0 == voice {
            if let Some(audio) = cache.1.get(&request.phase) {
                return Ok(NarrationAudio {
                    audio_base64: audio.clone(),
                    mime: "audio/mpeg",
                });
            }
        }
    }
    let (tx, rx) = oneshot::channel();
    {
        let mut job = state.job.lock().map_err(|_| "narration_unavailable")?;
        let mut last = state.last.lock().map_err(|_| "narration_unavailable")?;
        if job.is_some() || last.is_some_and(|t| t.elapsed() < Duration::from_millis(250)) {
            return Err("narration_busy");
        }
        *job = Some((request.request_id.clone(), tx));
        *last = Some(Instant::now());
    }
    let result = tokio::select! { value = synthesize(payload, key, &voice) => value, _ = rx => Err("narration_unavailable") };
    let mut job = state.job.lock().map_err(|_| "narration_unavailable")?;
    if !job.as_ref().is_some_and(|j| j.0 == request.request_id) {
        return Err("narration_unavailable");
    }
    *job = None;
    let audio_base64 = result?;
    let mut cache = state.cache.lock().map_err(|_| "narration_unavailable")?;
    if cache.0 != voice {
        cache.1.clear();
        cache.0 = voice;
    }
    cache.1.insert(request.phase, audio_base64.clone());
    Ok(NarrationAudio {
        audio_base64,
        mime: "audio/mpeg",
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn v3_profile_and_delivery_stay_backend_owned() {
        let bodies: Vec<_> = [
            "acknowledge",
            "building",
            "present",
            "wind-wait",
            "wind-present",
        ]
        .iter()
        .map(|phase| {
            speech_payload(&NarrationRequest {
                request_id: "test".into(),
                phase: (*phase).into(),
            })
            .unwrap()
        })
        .collect();
        for body in bodies {
            assert_eq!(body["model_id"], "eleven_v3");
            assert_eq!(body["voice_settings"], serde_json::json!({"stability":0.5}));
            assert_eq!(body.as_object().unwrap().len(), 3);
            assert!(body["text"].as_str().unwrap().starts_with('['));
        }
    }
    #[test]
    fn prompt_policy_rejects_ssml_bad_tags_and_extreme_transitions() {
        let policy: PromptPolicy = serde_json::from_str(PROMPT_POLICY).unwrap();
        let reason = "Timed demo line".to_string();
        assert!(validate_prompt("[excited] [laughs] This works!", &policy, Some(&reason)).is_ok());
        assert!(validate_prompt("[warm] Short script.", &policy, None).is_err());
        let extended = format!(
            "[warm] {}",
            "This is a longer piece of narration with room for natural delivery. ".repeat(5)
        );
        assert!(validate_prompt(&extended, &policy, None).is_ok());
        for text in [
            "No tag.",
            "[unknown] Hi.",
            "[warm] <break time='1s'/> Hi.",
            "[warm] [happy] [curious] [calm] Hi.",
            "[whispers] Hello. [shouts] Goodbye!",
            "[warm]",
            "[warm] unmatched ]",
        ] {
            assert!(
                validate_prompt(text, &policy, Some(&reason)).is_err(),
                "{text}"
            );
        }
    }
    #[test]
    fn only_five_approved_scripts_can_leave_backend() {
        for phase in [
            "acknowledge",
            "building",
            "present",
            "wind-wait",
            "wind-present",
        ] {
            let text = sentence(&NarrationRequest {
                request_id: "demo".into(),
                phase: phase.into(),
            })
            .unwrap();
            assert!(text.len() < 240);
        }
        for phase in ["", "__proto__", "weather", "https://example.com"] {
            assert!(sentence(&NarrationRequest {
                request_id: "demo".into(),
                phase: phase.into()
            })
            .is_err());
        }
        assert!(sentence(&NarrationRequest {
            request_id: "../secret".into(),
            phase: "present".into()
        })
        .is_err());
    }
    #[test]
    fn speech_weather_facts_come_from_displayed_fixture() {
        let mut weather: serde_json::Value = serde_json::from_str(WEATHER).unwrap();
        let template = "{thursday} on Thursday and {friday} on Friday";
        assert_eq!(
            ground_sentence("present", template.into(), &weather).unwrap(),
            "partly cloudy on Thursday and clear on Friday"
        );
        weather["days"][0]["condition"] = "rain".into();
        assert_eq!(
            ground_sentence("present", template.into(), &weather).unwrap(),
            "rainy on Thursday and clear on Friday"
        );
        weather["source"] = "live".into();
        assert!(ground_sentence("present", template.into(), &weather).is_err());
        weather["source"] = "synthetic".into();
        weather["days"][0]["date"] = "2026-09-18".into();
        assert!(ground_sentence("present", template.into(), &weather).is_err());
        assert!(ground_sentence("present", template.into(), &serde_json::Value::Null).is_err());
    }
    #[test]
    fn rejects_text_voice_endpoint_and_authority_fields() {
        for extra in ["text", "voiceId", "endpoint", "apiKey", "permission"] {
            let mut value = serde_json::json!({"requestId":"demo","phase":"present"});
            value[extra] = serde_json::json!("untrusted");
            assert!(serde_json::from_value::<NarrationRequest>(value).is_err());
        }
    }
}
