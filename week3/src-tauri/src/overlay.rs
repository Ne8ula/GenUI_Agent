//! Floating-overlay support (batch w3-cloud-20260929-b, pass p2; owner-authorized).
//!
//! EVA is a transparent always-on-top window over the primary monitor. Each
//! particle's material (light over dark, ink over bright) follows the
//! brightness behind it, so this module takes a **coarse luminance sample** of
//! the screen area under EVA's own window. Privacy boundary: only a 64x36 grid of 0..1 numbers
//! leaves this module. No pixels are stored, logged, or sent anywhere, and
//! nothing reaches a provider.
//!
//! To avoid reading EVA's own particles, the window is excluded from screen
//! capture (Windows `WDA_EXCLUDEFROMCAPTURE`). That also hides EVA from
//! recorders, so the owner-requested "Visible to recordings" toggle lifts the
//! exclusion; the renderer pauses sampling while it is lifted.
//!
//! Windows only (owner decision). Other platforms report "unsupported" and
//! the renderer stays pure light.

use serde::Serialize;

#[cfg_attr(not(windows), allow(dead_code))]
pub const GRID_COLS: u32 = 64;
#[cfg_attr(not(windows), allow(dead_code))]
pub const GRID_ROWS: u32 = 36;

#[derive(Debug, Serialize)]
pub struct LumaGrid {
    pub cols: u32,
    pub rows: u32,
    pub data: Vec<f32>,
}

/// Rec. 709 luma of 8-bit BGRA pixels, as 0..1 values.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn luma_from_bgra(bgra: &[u8]) -> Vec<f32> {
    bgra.chunks_exact(4)
        .map(|p| (0.0722 * p[0] as f32 + 0.7152 * p[1] as f32 + 0.2126 * p[2] as f32) / 255.0)
        .collect()
}

/// Local, low-rate brightness grid of the screen area behind EVA's window.
#[tauri::command]
pub fn w3_overlay_luma(window: tauri::WebviewWindow) -> Result<LumaGrid, String> {
    #[cfg(windows)]
    {
        let position = window.outer_position().map_err(|e| e.to_string())?;
        let size = window.outer_size().map_err(|e| e.to_string())?;
        win::sample_region(position.x, position.y, size.width as i32, size.height as i32, GRID_COLS as i32, GRID_ROWS as i32)
            .map(|data| LumaGrid { cols: GRID_COLS, rows: GRID_ROWS, data })
    }
    #[cfg(not(windows))]
    {
        let _ = window;
        Err("Backdrop sampling is only implemented on Windows.".into())
    }
}

/// "Visible to recordings": lift (true) or restore (false) capture exclusion.
#[tauri::command]
pub fn w3_overlay_recordable(window: tauri::WebviewWindow, visible: bool) -> Result<(), String> {
    set_capture_excluded(&window, !visible)
}

pub fn set_capture_excluded(window: &tauri::WebviewWindow, excluded: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        win::set_excluded(hwnd.0 as *mut std::ffi::c_void, excluded)
    }
    #[cfg(not(windows))]
    {
        let _ = (window, excluded);
        Ok(())
    }
}

/// Cover the primary monitor's work area (physical pixels; the taskbar stays clear). Called once at startup.
pub fn fit_primary_monitor(window: &tauri::WebviewWindow) -> Result<(), String> {
    let monitor = window.primary_monitor().map_err(|e| e.to_string())?.ok_or("No primary monitor")?;
    let area = monitor.work_area();
    window.set_position(area.position).map_err(|e| e.to_string())?;
    window.set_size(area.size).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(windows)]
mod win {
    //! Minimal hand-declared Win32/GDI calls (no new crate dependency).
    use std::ffi::c_void;

    type Handle = *mut c_void;

    #[repr(C)]
    struct BitmapInfoHeader {
        size: u32,
        width: i32,
        height: i32,
        planes: u16,
        bit_count: u16,
        compression: u32,
        size_image: u32,
        x_pels_per_meter: i32,
        y_pels_per_meter: i32,
        clr_used: u32,
        clr_important: u32,
    }

    #[repr(C)]
    struct BitmapInfo {
        header: BitmapInfoHeader,
        colors: [u32; 1],
    }

    const HALFTONE: i32 = 4;
    const SRCCOPY: u32 = 0x00CC_0020;
    const DIB_RGB_COLORS: u32 = 0;
    const BI_RGB: u32 = 0;
    const WDA_NONE: u32 = 0x0;
    const WDA_EXCLUDEFROMCAPTURE: u32 = 0x11;

    #[link(name = "user32")]
    extern "system" {
        fn GetDC(hwnd: Handle) -> Handle;
        fn ReleaseDC(hwnd: Handle, hdc: Handle) -> i32;
        fn SetWindowDisplayAffinity(hwnd: Handle, affinity: u32) -> i32;
    }

    #[link(name = "gdi32")]
    extern "system" {
        fn CreateCompatibleDC(hdc: Handle) -> Handle;
        fn CreateCompatibleBitmap(hdc: Handle, width: i32, height: i32) -> Handle;
        fn SelectObject(hdc: Handle, object: Handle) -> Handle;
        fn SetStretchBltMode(hdc: Handle, mode: i32) -> i32;
        fn SetBrushOrgEx(hdc: Handle, x: i32, y: i32, previous: *mut c_void) -> i32;
        fn StretchBlt(dst: Handle, x: i32, y: i32, w: i32, h: i32, src: Handle, sx: i32, sy: i32, sw: i32, sh: i32, rop: u32) -> i32;
        fn GetDIBits(hdc: Handle, bitmap: Handle, start: u32, lines: u32, bits: *mut c_void, info: *mut BitmapInfo, usage: u32) -> i32;
        fn DeleteObject(object: Handle) -> i32;
        fn DeleteDC(hdc: Handle) -> i32;
    }

    pub fn set_excluded(hwnd: Handle, excluded: bool) -> Result<(), String> {
        // SAFETY: hwnd comes from Tauri for this process's own live window.
        let ok = unsafe { SetWindowDisplayAffinity(hwnd, if excluded { WDA_EXCLUDEFROMCAPTURE } else { WDA_NONE }) };
        if ok == 0 { Err("Capture exclusion is unavailable on this Windows version.".into()) } else { Ok(()) }
    }

    /// Averaged (HALFTONE) downscale of a screen region (physical px) into cols x rows luma.
    pub fn sample_region(left: i32, top: i32, width: i32, height: i32, cols: i32, rows: i32) -> Result<Vec<f32>, String> {
        // SAFETY: every GDI handle created here is released before returning, on every path.
        unsafe {
            if width <= 0 || height <= 0 { return Err("Empty sample region".into()); }
            let screen = GetDC(std::ptr::null_mut());
            if screen.is_null() { return Err("Screen unavailable".into()); }
            let memory = CreateCompatibleDC(screen);
            let bitmap = CreateCompatibleBitmap(screen, cols, rows);
            let mut result = Err("Sample failed".to_string());
            if !memory.is_null() && !bitmap.is_null() {
                let previous = SelectObject(memory, bitmap);
                SetStretchBltMode(memory, HALFTONE);
                SetBrushOrgEx(memory, 0, 0, std::ptr::null_mut());
                if StretchBlt(memory, 0, 0, cols, rows, screen, left, top, width, height, SRCCOPY) != 0 {
                    SelectObject(memory, previous);
                    let mut info = BitmapInfo {
                        header: BitmapInfoHeader {
                            size: std::mem::size_of::<BitmapInfoHeader>() as u32,
                            width: cols,
                            height: -rows, // top-down rows
                            planes: 1,
                            bit_count: 32,
                            compression: BI_RGB,
                            size_image: 0,
                            x_pels_per_meter: 0,
                            y_pels_per_meter: 0,
                            clr_used: 0,
                            clr_important: 0,
                        },
                        colors: [0],
                    };
                    let mut bgra = vec![0u8; (cols * rows * 4) as usize];
                    if GetDIBits(memory, bitmap, 0, rows as u32, bgra.as_mut_ptr() as *mut c_void, &mut info, DIB_RGB_COLORS) == rows {
                        result = Ok(super::luma_from_bgra(&bgra));
                    }
                } else {
                    SelectObject(memory, previous);
                }
            }
            if !bitmap.is_null() { DeleteObject(bitmap); }
            if !memory.is_null() { DeleteDC(memory); }
            ReleaseDC(std::ptr::null_mut(), screen);
            result
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn luma_is_zero_for_black_and_one_for_white() {
        let values = luma_from_bgra(&[0, 0, 0, 255, 255, 255, 255, 255]);
        assert_eq!(values.len(), 2);
        assert!(values[0].abs() < 1e-6);
        assert!((values[1] - 1.0).abs() < 1e-4);
    }

    #[test]
    fn luma_weights_green_most_and_blue_least() {
        let blue = luma_from_bgra(&[255, 0, 0, 255])[0];
        let green = luma_from_bgra(&[0, 255, 0, 255])[0];
        let red = luma_from_bgra(&[0, 0, 255, 255])[0];
        assert!(green > red && red > blue);
    }

    #[test]
    fn only_numbers_leave_the_module() {
        let grid = LumaGrid { cols: 2, rows: 1, data: vec![0.0, 1.0] };
        let json = serde_json::to_string(&grid).unwrap();
        assert_eq!(json, r#"{"cols":2,"rows":1,"data":[0.0,1.0]}"#);
    }
}
