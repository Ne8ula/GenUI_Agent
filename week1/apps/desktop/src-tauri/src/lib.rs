use serde::{Deserialize, Serialize};
mod demo_memory;
use demo_memory::get_demo_memory;
mod voice;
use voice::{cancel_voice, transcribe_weather, voice_status, VoiceState};
mod narration;
use narration::{cancel_narration, narration_status, speak_narration, NarrationState};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RuntimeRequest {
    protocol_version: u8,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeReply {
    protocol_version: u8,
    runtime: &'static str,
    message: &'static str,
    app_version: &'static str,
}

// Fixed, read-only probe. No paths, shell, network, or user data.
#[tauri::command]
fn check_runtime(request: RuntimeRequest) -> Result<RuntimeReply, &'static str> {
    if request.protocol_version != 1 {
        return Err("unsupported_protocol");
    }
    Ok(RuntimeReply {
        protocol_version: 1,
        runtime: "tauri",
        message: "The local Rust runtime responded.",
        app_version: env!("CARGO_PKG_VERSION"),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(VoiceState::default())
        .manage(NarrationState::default())
        .invoke_handler(tauri::generate_handler![
            check_runtime,
            get_demo_memory,
            voice_status,
            transcribe_weather,
            cancel_voice,
            narration_status,
            speak_narration,
            cancel_narration
        ])
        .run(tauri::generate_context!())
        .expect("EVA could not start");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn supported_protocol_returns_serialized_contract() {
        let reply = check_runtime(RuntimeRequest {
            protocol_version: 1,
        })
        .unwrap();
        assert_eq!(
            serde_json::to_value(reply).unwrap(),
            serde_json::json!({
                "protocolVersion": 1,
                "runtime": "tauri",
                "message": "The local Rust runtime responded.",
                "appVersion": env!("CARGO_PKG_VERSION")
            })
        );
    }

    #[test]
    fn rejects_unsupported_protocol() {
        assert_eq!(
            check_runtime(RuntimeRequest {
                protocol_version: 2
            })
            .unwrap_err(),
            "unsupported_protocol"
        );
    }

    #[test]
    fn rejects_unknown_missing_and_invalid_fields() {
        for input in [
            r#"{"protocolVersion":1,"permission":"admin"}"#,
            r#"{}"#,
            r#"{"protocolVersion":"1"}"#,
            r#"{"protocolVersion":256}"#,
        ] {
            assert!(serde_json::from_str::<RuntimeRequest>(input).is_err());
        }
    }
}
