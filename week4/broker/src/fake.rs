//! Deterministic in-memory desktop for tests. Not a Windows simulation:
//! it models only what the broker contract needs, with synthetic data.
//!
//! Wallpaper model follows the source-checked `IDesktopWallpaper` shape:
//! the image (and kind) is per monitor; position, background colour and
//! background-enabled state are global. `set_monitor_wallpaper` changes only
//! the named monitor's image and, like `SetWallpaper`, re-enables a disabled
//! background.

use crate::adapter::{
    AdapterError, AppKey, BackgroundColour, DesktopStatus, MonitorId, MonitorInfo, Placement,
    Point, Rect, ShowState, StageAdapter, WallpaperKind, WallpaperPosition, WallpaperRef,
    WallpaperState, WindowIdentity, WindowInfo, WindowLookup, WindowSnapshot,
};
use crate::ids::{approved_wallpaper_asset, AssetId, SceneId, VariantId};
use std::collections::{BTreeMap, BTreeSet};
use std::sync::{Arc, Mutex};

pub const STAGE_MONITOR: &str = "monitor:a";
pub const OTHER_MONITOR: &str = "monitor:b";
pub const EVA_PID: u32 = 100;

type MoveHook = Box<dyn FnMut(u32, &mut FakeDesktop) + Send>;

#[derive(Debug, Clone)]
struct MonitorWallpaper {
    reference: Option<WallpaperRef>,
    kind: WallpaperKind,
}

/// Mutable fake desktop state. Accessed through [`FakeAdapter::with`].
pub struct FakeDesktop {
    pub monitors: Vec<MonitorInfo>,
    pub stage_monitor: MonitorId,
    pub own_pid: u32,
    pub windows: BTreeMap<u64, WindowInfo>,
    wallpapers: BTreeMap<MonitorId, MonitorWallpaper>,
    pub position: WallpaperPosition,
    pub colour: BackgroundColour,
    pub background_enabled: bool,
    assets: BTreeMap<String, WallpaperRef>,
    pub status: DesktopStatus,
    /// `set_window_placement` returns an error for these handles.
    pub fail_placement: BTreeSet<u64>,
    /// The next `set_window_placement` for these handles fails once.
    pub fail_next_placement: BTreeSet<u64>,
    /// `set_window_placement` "succeeds" but lands 7 px off for these.
    pub drift_placement: BTreeSet<u64>,
    pub fail_set_wallpaper: bool,
    /// `set_monitor_wallpaper` returns Ok but changes nothing.
    pub ignore_set_wallpaper: bool,
    pub placement_calls: u32,
    pub wallpaper_calls: u32,
    move_hook: Option<MoveHook>,
}

impl FakeDesktop {
    pub fn monitor_wallpaper(&self, monitor: &MonitorId) -> Option<WallpaperState> {
        self.wallpapers.get(monitor).map(|w| WallpaperState {
            reference: w.reference.clone(),
            position: self.position,
            colour: self.colour,
            background_enabled: self.background_enabled,
            kind: w.kind,
        })
    }

    /// Simulate the user (or OS) choosing a wallpaper on one monitor.
    pub fn user_set_wallpaper(
        &mut self,
        monitor: &MonitorId,
        reference: Option<WallpaperRef>,
        kind: WallpaperKind,
    ) {
        self.wallpapers
            .insert(monitor.clone(), MonitorWallpaper { reference, kind });
    }

    /// Simulate the user moving/resizing/showing a window.
    pub fn user_set_placement(&mut self, hwnd: u64, placement: Placement) {
        if let Some(w) = self.windows.get_mut(&hwnd) {
            w.snapshot.placement = placement;
            w.minimized = placement.show_state == ShowState::Minimized;
            reassign_monitor(&self.monitors, w);
        }
    }

    pub fn close_window(&mut self, hwnd: u64) {
        self.windows.remove(&hwnd);
    }

    pub fn add_window(&mut self, info: WindowInfo) {
        self.windows.insert(info.identity.hwnd, info);
    }

    pub fn placement_of(&self, hwnd: u64) -> Option<Placement> {
        self.windows.get(&hwnd).map(|w| w.snapshot.placement)
    }

    fn lookup(&self, id: &WindowIdentity) -> WindowLookup {
        match self.windows.get(&id.hwnd) {
            None => WindowLookup::Gone,
            Some(w) if w.identity != *id => WindowLookup::HandleReused,
            Some(w) => WindowLookup::Present(w.snapshot.clone()),
        }
    }
}

fn overlap_area(a: Rect, b: Rect) -> i64 {
    let w = i64::from(a.right.min(b.right)) - i64::from(a.left.max(b.left));
    let h = i64::from(a.bottom.min(b.bottom)) - i64::from(a.top.max(b.top));
    if w > 0 && h > 0 {
        w * h
    } else {
        0
    }
}

/// Like the OS: after a move a window belongs to the monitor its normal
/// rectangle overlaps most, and takes that monitor's DPI. With no overlap
/// at all it keeps its current monitor.
fn reassign_monitor(monitors: &[MonitorInfo], w: &mut WindowInfo) {
    let rect = w.snapshot.placement.normal_rect;
    let best = monitors
        .iter()
        .map(|m| (overlap_area(m.work_area, rect), m))
        .filter(|(area, _)| *area > 0)
        .max_by_key(|(area, _)| *area);
    if let Some((_, m)) = best {
        w.snapshot.monitor = m.id.clone();
        w.snapshot.dpi = m.dpi;
    }
}

/// Clonable handle to a shared [`FakeDesktop`].
#[derive(Clone)]
pub struct FakeAdapter(Arc<Mutex<FakeDesktop>>);

pub fn rect(left: i32, top: i32, right: i32, bottom: i32) -> Rect {
    Rect {
        left,
        top,
        right,
        bottom,
    }
}

pub fn normal(r: Rect) -> Placement {
    Placement {
        show_state: ShowState::Normal,
        normal_rect: r,
        min_position: Point { x: -1, y: -1 },
        max_position: Point { x: -1, y: -1 },
    }
}

pub fn stage_monitor_id() -> MonitorId {
    MonitorId::from_adapter(STAGE_MONITOR)
}

pub fn other_monitor_id() -> MonitorId {
    MonitorId::from_adapter(OTHER_MONITOR)
}

/// A plain eligible-looking synthetic window on the stage monitor.
pub fn synthetic_window(hwnd: u64, pid: u32, app_key: &str, r: Rect) -> WindowInfo {
    WindowInfo {
        identity: WindowIdentity {
            hwnd,
            pid,
            process_start_time: 1_000 + u64::from(pid),
            class_token: Some(format!("class:{app_key}")),
        },
        app_key: AppKey(app_key.to_string()),
        top_level: true,
        visible: true,
        cloaked: false,
        minimized: false,
        elevated: false,
        fullscreen_exclusive: false,
        snapshot: WindowSnapshot {
            placement: normal(r),
            monitor: stage_monitor_id(),
            dpi: 96,
        },
    }
}

impl FakeAdapter {
    /// Two monitors; the stage monitor is `monitor:a`. Both have a static
    /// user wallpaper; global Fill position, black colour, background on.
    /// The catalog holds every approved Paris variant. No windows.
    pub fn standard() -> Self {
        let monitors = vec![
            MonitorInfo {
                id: stage_monitor_id(),
                work_area: rect(0, 0, 1920, 1040),
                dpi: 96,
            },
            MonitorInfo {
                id: other_monitor_id(),
                work_area: rect(1920, 0, 3840, 1040),
                // Different scaling, so a cross-monitor move is visible as a
                // DPI change too.
                dpi: 120,
            },
        ];
        let mut wallpapers = BTreeMap::new();
        wallpapers.insert(
            stage_monitor_id(),
            MonitorWallpaper {
                reference: Some(WallpaperRef::from_adapter("fake://user/wallpaper-a")),
                kind: WallpaperKind::Static,
            },
        );
        wallpapers.insert(
            other_monitor_id(),
            MonitorWallpaper {
                reference: Some(WallpaperRef::from_adapter("fake://user/wallpaper-b")),
                kind: WallpaperKind::Static,
            },
        );
        let assets = VariantId::ALL
            .iter()
            .map(|v| {
                let id = approved_wallpaper_asset(SceneId::ParisTerrace, *v);
                let r = WallpaperRef::from_adapter(format!("fake://catalog/{}", v.as_str()));
                (id.as_str().to_string(), r)
            })
            .collect();
        FakeAdapter(Arc::new(Mutex::new(FakeDesktop {
            monitors,
            stage_monitor: stage_monitor_id(),
            own_pid: EVA_PID,
            windows: BTreeMap::new(),
            wallpapers,
            position: WallpaperPosition::Fill,
            colour: BackgroundColour { r: 0, g: 0, b: 0 },
            background_enabled: true,
            assets,
            status: DesktopStatus::Active,
            fail_placement: BTreeSet::new(),
            fail_next_placement: BTreeSet::new(),
            drift_placement: BTreeSet::new(),
            fail_set_wallpaper: false,
            ignore_set_wallpaper: false,
            placement_calls: 0,
            wallpaper_calls: 0,
            move_hook: None,
        })))
    }

    pub fn with<R>(&self, f: impl FnOnce(&mut FakeDesktop) -> R) -> R {
        f(&mut self.0.lock().unwrap())
    }

    /// Run `hook(n, desktop)` after the n-th successful window placement
    /// (1-based). Lets tests inject user actions, locks, closes or cancels
    /// mid-motion.
    pub fn on_move(&self, hook: impl FnMut(u32, &mut FakeDesktop) + Send + 'static) {
        self.with(|d| d.move_hook = Some(Box::new(hook)));
    }

    pub fn clear_move_hook(&self) {
        self.with(|d| d.move_hook = None);
    }

    pub fn placement_calls(&self) -> u32 {
        self.with(|d| d.placement_calls)
    }

    pub fn wallpaper_calls(&self) -> u32 {
        self.with(|d| d.wallpaper_calls)
    }

    pub fn wallpaper(&self, monitor: &MonitorId) -> WallpaperState {
        self.with(|d| d.monitor_wallpaper(monitor).expect("known monitor"))
    }

    pub fn placement_of(&self, hwnd: u64) -> Option<Placement> {
        self.with(|d| d.placement_of(hwnd))
    }

    pub fn catalog_ref(&self, variant: VariantId) -> WallpaperRef {
        let id = approved_wallpaper_asset(SceneId::ParisTerrace, variant);
        self.with(|d| d.assets.get(id.as_str()).cloned().expect("catalog asset"))
    }
}

impl StageAdapter for FakeAdapter {
    fn desktop_status(&self) -> Result<DesktopStatus, AdapterError> {
        Ok(self.with(|d| d.status))
    }

    fn stage_monitor(&self) -> Result<MonitorInfo, AdapterError> {
        self.with(|d| {
            d.monitors
                .iter()
                .find(|m| m.id == d.stage_monitor)
                .cloned()
                .ok_or(AdapterError::Failed {
                    operation: "stage_monitor",
                })
        })
    }

    fn own_process_id(&self) -> Result<u32, AdapterError> {
        Ok(self.with(|d| d.own_pid))
    }

    fn enumerate_windows(&self) -> Result<Vec<WindowInfo>, AdapterError> {
        Ok(self.with(|d| d.windows.values().cloned().collect()))
    }

    fn find_window(&self, identity: &WindowIdentity) -> Result<WindowLookup, AdapterError> {
        Ok(self.with(|d| d.lookup(identity)))
    }

    fn set_window_placement(
        &self,
        identity: &WindowIdentity,
        placement: &Placement,
    ) -> Result<(), AdapterError> {
        let mut guard = self.0.lock().unwrap();
        let d = &mut *guard;
        match d.lookup(identity) {
            WindowLookup::Gone => return Err(AdapterError::WindowGone),
            WindowLookup::HandleReused => return Err(AdapterError::IdentityMismatch),
            WindowLookup::Present(_) => {}
        }
        if d.fail_placement.contains(&identity.hwnd) || d.fail_next_placement.remove(&identity.hwnd)
        {
            return Err(AdapterError::Failed {
                operation: "set_window_placement",
            });
        }
        let w = d.windows.get_mut(&identity.hwnd).expect("present");
        if w.elevated {
            return Err(AdapterError::AccessDenied);
        }
        let mut applied = *placement;
        if d.drift_placement.contains(&identity.hwnd) {
            applied.normal_rect.left += 7;
            applied.normal_rect.right += 7;
        }
        w.snapshot.placement = applied;
        w.minimized = applied.show_state == ShowState::Minimized;
        reassign_monitor(&d.monitors, w);
        d.placement_calls += 1;
        let n = d.placement_calls;
        if let Some(mut hook) = d.move_hook.take() {
            hook(n, d);
            if d.move_hook.is_none() {
                d.move_hook = Some(hook);
            }
        }
        Ok(())
    }

    fn wallpaper_state(&self, monitor: &MonitorId) -> Result<WallpaperState, AdapterError> {
        self.with(|d| {
            d.monitor_wallpaper(monitor).ok_or(AdapterError::Failed {
                operation: "wallpaper_state",
            })
        })
    }

    fn set_monitor_wallpaper(
        &self,
        monitor: &MonitorId,
        reference: &WallpaperRef,
    ) -> Result<(), AdapterError> {
        self.with(|d| {
            if !d.wallpapers.contains_key(monitor) {
                return Err(AdapterError::Failed {
                    operation: "set_monitor_wallpaper",
                });
            }
            d.wallpaper_calls += 1;
            if d.fail_set_wallpaper {
                return Err(AdapterError::Failed {
                    operation: "set_monitor_wallpaper",
                });
            }
            if d.ignore_set_wallpaper {
                return Ok(());
            }
            d.wallpapers.insert(
                monitor.clone(),
                MonitorWallpaper {
                    reference: Some(reference.clone()),
                    kind: WallpaperKind::Static,
                },
            );
            // Like SetWallpaper: re-enables a disabled background.
            d.background_enabled = true;
            Ok(())
        })
    }

    fn resolve_asset(&self, asset: &AssetId) -> Result<WallpaperRef, AdapterError> {
        self.with(|d| {
            d.assets
                .get(asset.as_str())
                .cloned()
                .ok_or(AdapterError::AssetUnavailable)
        })
    }
}
