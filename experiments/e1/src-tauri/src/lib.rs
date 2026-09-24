mod protocol;

#[cfg(target_os = "windows")]
mod overlay;

#[cfg(target_os = "windows")]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(overlay::OverlayState::default())
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
        ])
        .run(tauri::generate_context!())
        .expect("EVA E1 Windows overlay could not start");
}

#[cfg(not(target_os = "windows"))]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    panic!("EVA E1 native overlay is enabled only on Windows in this experiment");
}
