use crate::protocol::{
    authorize_sender, validate_and_scale_hit_regions, validate_material_scene,
    validate_material_status, DismissAck, HitRegionAck, HitRegionUpdate, MaterialScene,
    MaterialSceneAck, MaterialSceneInput, MaterialStatus, MaterialStatusAck, MaterialStatusKind,
    NativeGeometry, PhysicalHitRect, Point2D, SenderRole, Size2D, WorkAreaMetadata,
    HIT_REGION_LIMIT, INTERACTIVE_LABEL, MATERIAL_LABEL,
};
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex, MutexGuard,
    },
    time::Duration,
};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewWindow, WindowEvent,
};
use windows::Win32::{
    Graphics::Gdi::{
        CombineRgn, CreateRectRgn, DeleteObject, SetWindowRgn, ERROR, HGDIOBJ, HRGN, RGN_OR,
    },
    UI::WindowsAndMessaging::{
        SetWindowPos, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOOWNERZORDER, SWP_NOSIZE,
    },
};

const MATERIAL_SCENE_EVENT: &str = "eva-e1://material-scene";
const MATERIAL_STATUS_EVENT: &str = "eva-e1://material-status";

#[derive(Default)]
struct OverlayInner {
    session_counter: u64,
    controller_session_id: Option<String>,
    last_hit_region_sequence: u64,
    last_material_scene_sequence: u64,
    latest_scene: Option<MaterialScene>,
    latest_status: Option<MaterialStatus>,
}

#[derive(Default)]
pub struct OverlayState {
    inner: Mutex<OverlayInner>,
    closing: AtomicBool,
}

fn lock_state(state: &OverlayState) -> Result<MutexGuard<'_, OverlayInner>, String> {
    state
        .inner
        .lock()
        .map_err(|_| "native overlay state is unavailable".to_owned())
}

fn required_window(app: &AppHandle, label: &str) -> Result<WebviewWindow, String> {
    app.get_webview_window(label)
        .ok_or_else(|| format!("required native window {label:?} is unavailable"))
}

fn order_material_below_main(material: &WebviewWindow, main: &WebviewWindow) -> Result<(), String> {
    let material_hwnd = material.hwnd().map_err(|error| error.to_string())?;
    let main_hwnd = main.hwnd().map_err(|error| error.to_string())?;
    // SAFETY: both HWND values belong to the two fixed E1 windows. Supplying
    // main as hWndInsertAfter places material directly behind it without
    // moving, sizing, activating, or changing owner relationships.
    unsafe {
        SetWindowPos(
            material_hwnd,
            Some(main_hwnd),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER,
        )
    }
    .map_err(|error| error.to_string())
}

fn delete_region(region: HRGN) {
    if !region.is_invalid() {
        // SAFETY: `region` was created by CreateRectRgn and ownership has not
        // been transferred to SetWindowRgn on the paths that call this helper.
        unsafe {
            let _ = DeleteObject(HGDIOBJ(region.0));
        }
    }
}

fn build_region_union(rects: &[PhysicalHitRect]) -> Result<HRGN, String> {
    // SAFETY: coordinates have already been bounded to the native client area.
    let combined = unsafe { CreateRectRgn(0, 0, 0, 0) };
    if combined.is_invalid() {
        return Err("Win32 could not allocate an empty input region".into());
    }

    for rect in rects {
        // SAFETY: rectangle coordinates are finite bounded i32 values with a
        // positive extent, validated before this native allocation.
        let piece = unsafe { CreateRectRgn(rect.left, rect.top, rect.right, rect.bottom) };
        if piece.is_invalid() {
            delete_region(combined);
            return Err("Win32 could not allocate a bounded input rectangle".into());
        }
        // SAFETY: both handles are live GDI regions owned by this function.
        let result = unsafe { CombineRgn(Some(combined), Some(combined), Some(piece), RGN_OR) };
        delete_region(piece);
        if result.0 == ERROR {
            delete_region(combined);
            return Err("Win32 could not combine bounded input rectangles".into());
        }
    }
    Ok(combined)
}

fn set_native_window_region(
    window: &WebviewWindow,
    rects: &[PhysicalHitRect],
) -> Result<(), String> {
    let region = build_region_union(rects)?;
    let hwnd = window.hwnd().map_err(|error| error.to_string())?;
    // SAFETY: the HWND belongs to this fixed Tauri window and `region` is a
    // valid owned HRGN. On success, Windows owns and eventually deletes HRGN.
    let applied = unsafe { SetWindowRgn(hwnd, Some(region), true) };
    if applied == 0 {
        delete_region(region);
        return Err("Win32 rejected the bounded input region".into());
    }
    Ok(())
}

/// Makes the whole interactive WebView click-through before any risky work.
/// Cursor-ignore remains the final fail-open guard even if the empty HRGN call
/// itself fails.
pub fn fail_input_open(window: &WebviewWindow) -> Result<(), String> {
    let ignore_result = window
        .set_ignore_cursor_events(true)
        .map_err(|error| error.to_string());
    let region_result = set_native_window_region(window, &[]);
    ignore_result.and(region_result)
}

fn apply_bounded_input_region(
    window: &WebviewWindow,
    rects: &[PhysicalHitRect],
) -> Result<(), String> {
    if let Err(error) = window.set_ignore_cursor_events(true) {
        let _ = fail_input_open(window);
        return Err(error.to_string());
    }
    if let Err(error) = set_native_window_region(window, rects) {
        let _ = fail_input_open(window);
        return Err(error);
    }
    if rects.is_empty() {
        return Ok(());
    }
    if let Err(error) = window.set_ignore_cursor_events(false) {
        let _ = fail_input_open(window);
        return Err(error.to_string());
    }
    Ok(())
}

fn invalidate_session(inner: &mut OverlayInner) {
    inner.controller_session_id = None;
    inner.latest_scene = None;
    inner.latest_status = None;
}

fn validate_session(inner: &OverlayInner, supplied: &str) -> Result<(), String> {
    match inner.controller_session_id.as_deref() {
        Some(current) if current == supplied => Ok(()),
        _ => Err("controller session is stale or was not established by native code".into()),
    }
}

pub fn setup_overlay(app: &AppHandle) -> Result<(), String> {
    let main = required_window(app, INTERACTIVE_LABEL)?;
    let material = required_window(app, MATERIAL_LABEL)?;
    let monitor = main
        .current_monitor()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Windows did not report a monitor for the E1 overlay".to_owned())?;
    let work_area = monitor.work_area();
    let position = PhysicalPosition::new(work_area.position.x, work_area.position.y);
    let size = PhysicalSize::new(work_area.size.width, work_area.size.height);

    for window in [&material, &main] {
        window
            .set_position(position)
            .and_then(|()| window.set_size(size))
            .and_then(|()| window.set_always_on_top(true))
            .and_then(|()| window.set_skip_taskbar(true))
            .and_then(|()| window.set_shadow(false))
            .map_err(|error| error.to_string())?;
    }

    material
        .set_ignore_cursor_events(true)
        .map_err(|error| error.to_string())?;
    fail_input_open(&main)?;

    // Material starts as an empty transparent, input-ignored surface. It loads
    // its event listener before the controller publishes any authored scene.
    material.show().map_err(|error| error.to_string())?;
    main.show().map_err(|error| error.to_string())?;
    order_material_below_main(&material, &main)?;
    main.set_focus().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn e1_get_work_area(
    window: WebviewWindow,
    state: State<'_, OverlayState>,
) -> Result<WorkAreaMetadata, String> {
    authorize_sender(window.label(), SenderRole::Interactive)?;
    if state.closing.load(Ordering::SeqCst) {
        return Err("native overlay is closing".into());
    }
    fail_input_open(&window)?;
    let material = required_window(window.app_handle(), MATERIAL_LABEL)?;
    material
        .set_ignore_cursor_events(true)
        .and_then(|()| material.hide())
        .map_err(|error| error.to_string())?;

    let monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Windows did not report a monitor for the E1 overlay".to_owned())?;
    let work_area = monitor.work_area();
    let scale_factor = window.scale_factor().map_err(|error| error.to_string())?;
    if !scale_factor.is_finite() || !(0.5..=8.0).contains(&scale_factor) {
        return Err("native window scale factor is invalid".into());
    }

    let controller_session_id = {
        let mut inner = lock_state(&state)?;
        inner.session_counter = inner
            .session_counter
            .checked_add(1)
            .ok_or_else(|| "controller session counter exhausted".to_owned())?;
        let session = format!("native-session-{}", inner.session_counter);
        inner.controller_session_id = Some(session.clone());
        inner.last_hit_region_sequence = 0;
        inner.last_material_scene_sequence = 0;
        inner.latest_scene = None;
        inner.latest_status = None;
        session
    };

    Ok(WorkAreaMetadata {
        schema_version: "e1.work-area/1",
        platform: "windows",
        interactive_window_label: INTERACTIVE_LABEL,
        material_window_label: MATERIAL_LABEL,
        origin_physical_px: Point2D {
            x: work_area.position.x,
            y: work_area.position.y,
        },
        size_physical_px: Size2D {
            width: work_area.size.width,
            height: work_area.size.height,
        },
        size_css_px: Size2D {
            width: f64::from(work_area.size.width) / scale_factor,
            height: f64::from(work_area.size.height) / scale_factor,
        },
        scale_factor,
        region_limit: HIT_REGION_LIMIT,
        native_region_enabled: true,
        controller_session_id,
        next_hit_region_sequence: 1,
        next_material_scene_sequence: 1,
    })
}

#[tauri::command]
pub fn e1_publish_hit_regions(
    window: WebviewWindow,
    state: State<'_, OverlayState>,
    controller_session_id: String,
    update: HitRegionUpdate,
) -> Result<HitRegionAck, String> {
    authorize_sender(window.label(), SenderRole::Interactive)?;

    let sequence_check = (|| {
        let mut inner = lock_state(&state)?;
        validate_session(&inner, &controller_session_id)?;
        if update.sequence <= inner.last_hit_region_sequence {
            return Err("hit-region update is stale or duplicated".into());
        }
        inner.last_hit_region_sequence = update.sequence;
        Ok(())
    })();
    if let Err(error) = sequence_check {
        let _ = fail_input_open(&window);
        return Err(error);
    }

    let geometry = match (window.inner_size(), window.scale_factor()) {
        (Ok(size), Ok(scale_factor)) => NativeGeometry {
            width: size.width,
            height: size.height,
            scale_factor,
        },
        (size, scale) => {
            let _ = fail_input_open(&window);
            return Err(format!(
                "native geometry unavailable: size={:?}, scale={:?}",
                size.err(),
                scale.err()
            ));
        }
    };
    let scaled = match validate_and_scale_hit_regions(&update, geometry) {
        Ok(scaled) => scaled,
        Err(error) => {
            let _ = fail_input_open(&window);
            return Err(error);
        }
    };
    apply_bounded_input_region(&window, &scaled.rects)?;

    Ok(HitRegionAck {
        schema_version: "e1.hit-regions-ack/1",
        sequence: update.sequence,
        mode: if scaled.rects.is_empty() {
            "empty"
        } else {
            "bounded-regions"
        },
        applied_region_count: scaled.rects.len(),
        clamped_region_count: scaled.clamped_count,
        input_pass_through: scaled.rects.is_empty(),
        native_scale_factor: geometry.scale_factor,
    })
}

#[tauri::command]
pub fn e1_sync_material_scene(
    window: WebviewWindow,
    state: State<'_, OverlayState>,
    controller_session_id: String,
    scene: MaterialSceneInput,
) -> Result<MaterialSceneAck, String> {
    authorize_sender(window.label(), SenderRole::Interactive)?;
    if state.closing.load(Ordering::SeqCst) {
        return Err("native overlay is closing".into());
    }
    validate_material_scene(&scene)?;

    let full_scene = {
        let mut inner = lock_state(&state)?;
        validate_session(&inner, &controller_session_id)?;
        if scene.scene_sequence <= inner.last_material_scene_sequence {
            return Err("material scene is stale or duplicated".into());
        }
        let full_scene = MaterialScene {
            controller_session_id: controller_session_id.clone(),
            input: scene,
        };
        inner.last_material_scene_sequence = full_scene.input.scene_sequence;
        inner.latest_scene = Some(full_scene.clone());
        inner.latest_status = None;
        full_scene
    };

    let material = required_window(window.app_handle(), MATERIAL_LABEL)?;
    material
        .emit(MATERIAL_SCENE_EVENT, &full_scene)
        .map_err(|error| error.to_string())?;

    Ok(MaterialSceneAck {
        schema_version: "e1.material-scene-ack/1",
        controller_session_id,
        scene_sequence: full_scene.input.scene_sequence,
        delivered: true,
    })
}

#[tauri::command]
pub fn e1_get_latest_material_scene(
    window: WebviewWindow,
    state: State<'_, OverlayState>,
) -> Result<Option<MaterialScene>, String> {
    authorize_sender(window.label(), SenderRole::Material)?;
    Ok(lock_state(&state)?.latest_scene.clone())
}

#[tauri::command]
pub fn e1_report_material_status(
    window: WebviewWindow,
    state: State<'_, OverlayState>,
    status: MaterialStatus,
) -> Result<MaterialStatusAck, String> {
    authorize_sender(window.label(), SenderRole::Material)?;

    {
        let mut inner = lock_state(&state)?;
        let latest = inner
            .latest_scene
            .as_ref()
            .ok_or_else(|| "material status has no accepted scene".to_owned())?;
        validate_material_status(&status, latest)?;
        if inner.latest_status.as_ref().is_some_and(|previous| {
            previous.controller_session_id == status.controller_session_id
                && previous.scene_sequence == status.scene_sequence
                && status.monotonic_ms <= previous.monotonic_ms
        }) {
            return Err("material status is stale or duplicated".into());
        }
        inner.latest_status = Some(status.clone());
    }

    let main = required_window(window.app_handle(), INTERACTIVE_LABEL)?;
    if state.closing.load(Ordering::SeqCst) {
        return Err("native overlay is closing".into());
    }
    if status.kind == MaterialStatusKind::SceneApplied {
        window
            .set_ignore_cursor_events(true)
            .and_then(|()| window.show())
            .map_err(|error| error.to_string())?;
        order_material_below_main(&window, &main)?;
    }
    main.emit(MATERIAL_STATUS_EVENT, &status)
        .map_err(|error| error.to_string())?;

    Ok(MaterialStatusAck {
        schema_version: "e1.material-status-ack/1",
        controller_session_id: status.controller_session_id,
        scene_sequence: status.scene_sequence,
        delivered: true,
    })
}

#[tauri::command]
pub fn e1_get_latest_material_status(
    window: WebviewWindow,
    state: State<'_, OverlayState>,
    controller_session_id: String,
) -> Result<Option<MaterialStatus>, String> {
    authorize_sender(window.label(), SenderRole::Interactive)?;
    let inner = lock_state(&state)?;
    validate_session(&inner, &controller_session_id)?;
    Ok(inner.latest_status.clone())
}

fn hide_and_open_input(app: &AppHandle) {
    if let Some(main) = app.get_webview_window(INTERACTIVE_LABEL) {
        let _ = fail_input_open(&main);
        let _ = main.hide();
    }
    if let Some(material) = app.get_webview_window(MATERIAL_LABEL) {
        let _ = material.set_ignore_cursor_events(true);
        let _ = material.hide();
    }
}

fn schedule_exit(app: AppHandle, state: &OverlayState) {
    if state.closing.swap(true, Ordering::SeqCst) {
        return;
    }
    hide_and_open_input(&app);
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(25));
        app.exit(0);
    });
}

#[tauri::command]
pub fn e1_dismiss_overlay(
    window: WebviewWindow,
    state: State<'_, OverlayState>,
    controller_session_id: String,
) -> Result<DismissAck, String> {
    authorize_sender(window.label(), SenderRole::Interactive)?;
    {
        let mut inner = lock_state(&state)?;
        validate_session(&inner, &controller_session_id)?;
        invalidate_session(&mut inner);
    }
    schedule_exit(window.app_handle().clone(), &state);
    Ok(DismissAck {
        schema_version: "e1.dismiss-ack/1",
        dismissed: true,
    })
}

pub fn handle_window_event(window: &tauri::Window, event: &WindowEvent) {
    match event {
        WindowEvent::CloseRequested { api, .. }
            if matches!(window.label(), INTERACTIVE_LABEL | MATERIAL_LABEL) =>
        {
            api.prevent_close();
            let state = window.state::<OverlayState>();
            schedule_exit(window.app_handle().clone(), &state);
        }
        WindowEvent::Destroyed if matches!(window.label(), INTERACTIVE_LABEL | MATERIAL_LABEL) => {
            let state = window.state::<OverlayState>();
            schedule_exit(window.app_handle().clone(), &state);
        }
        WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. }
            if window.label() == INTERACTIVE_LABEL =>
        {
            // A stale physical HRGN must never cover a newly sized/DPI-scaled
            // work area while the frontend computes and publishes fresh rects.
            if let Some(main) = window.app_handle().get_webview_window(INTERACTIVE_LABEL) {
                let _ = fail_input_open(&main);
                if let (Ok(material), Ok(size), Ok(position)) = (
                    required_window(window.app_handle(), MATERIAL_LABEL),
                    main.inner_size(),
                    main.outer_position(),
                ) {
                    let _ = material.set_position(position);
                    let _ = material.set_size(size);
                    let _ = material.set_ignore_cursor_events(true);
                }
            }
        }
        _ => {}
    }
}
