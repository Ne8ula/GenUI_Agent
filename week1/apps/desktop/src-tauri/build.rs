fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "check_runtime",
            "get_demo_memory",
            "voice_status",
            "transcribe_weather",
            "cancel_voice",
            "narration_status",
            "speak_narration",
            "cancel_narration",
        ]),
    ))
    .expect("failed to build Tauri application manifest");
}
