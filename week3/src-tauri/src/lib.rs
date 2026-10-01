mod conversation;
mod overlay;
mod protocol;
mod providers;

use conversation::{w3_advance, w3_delivered, w3_end, w3_start, w3_status, w3_turn, W3State};
use overlay::{w3_overlay_luma, w3_overlay_recordable};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(W3State::default())
        .setup(|app| {
            // Floating overlay (batch w3-cloud-20260929-b p2): cover the primary monitor and,
            // on Windows, keep EVA out of screen capture so the backdrop sample never reads
            // its own particles. Failures leave a usable window rather than aborting.
            if let Some(window) = app.get_webview_window("main") {
                let _ = overlay::fit_primary_monitor(&window);
                let _ = overlay::set_capture_excluded(&window, true);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            w3_status,
            w3_start,
            w3_advance,
            w3_turn,
            w3_delivered,
            w3_end,
            w3_overlay_luma,
            w3_overlay_recordable
        ])
        .run(tauri::generate_context!())
        .expect("EVA Week 3 could not start");
}
