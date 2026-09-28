mod conversation;
mod protocol;
mod providers;

use conversation::{w3_advance, w3_delivered, w3_end, w3_start, w3_status, w3_turn, W3State};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(W3State::default())
        .invoke_handler(tauri::generate_handler![
            w3_status,
            w3_start,
            w3_advance,
            w3_turn,
            w3_delivered,
            w3_end
        ])
        .run(tauri::generate_context!())
        .expect("EVA Week 3 could not start");
}
