mod protocol;
mod recognition;
mod voice;

#[cfg(target_os = "windows")]
mod overlay;
#[cfg(target_os = "windows")]
mod weave_gpu;

#[cfg(target_os = "windows")]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Owner reported system-wide black screens/freezes during this renderer's
    // transition. Do not create windows or initialize GPU devices until a
    // separately reviewed native recovery replaces this quarantined path.
    const NATIVE_RENDERER_QUARANTINED: bool = true;
    if NATIVE_RENDERER_QUARANTINED {
        eprintln!("E1 native renderer is quarantined after a reported system-wide graphics failure. Use the isolated procedural browser preview; do not run an older executable.");
        return;
    }
    tauri::Builder::default()
        .manage(overlay::OverlayState::default())
        .manage(weave_gpu::GpuState::default())
        .manage(voice::NarrationState::default())
        .manage(recognition::RecognitionState::default())
        .setup(|app| {
            overlay::setup_overlay(app.handle()).map_err(std::io::Error::other)?;
            Ok(())
        })
        .on_window_event(overlay::handle_window_event)
        .invoke_handler(tauri::generate_handler![
            overlay::e1_get_work_area,
            overlay::e1_publish_hit_regions,
            overlay::e1_sync_material_scene,
            overlay::e1_get_latest_material_scene,
            overlay::e1_report_material_status,
            overlay::e1_get_latest_material_status,
            overlay::e1_dismiss_overlay,
            voice::e1_narration_status,
            voice::e1_speak_forecast,
            voice::e1_cancel_narration,
            recognition::e1_recognition_status,
            recognition::e1_begin_recognition,
            recognition::e1_transcribe_utterance,
            recognition::e1_cancel_recognition,
        ])
        .run(tauri::generate_context!())
        .expect("EVA E1 Windows overlay could not start");
}

#[cfg(not(target_os = "windows"))]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    panic!("EVA E1 native overlay is enabled only on Windows in this experiment");
}
