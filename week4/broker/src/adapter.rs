//! OS adapter boundary.
//!
//! The broker owns policy; an adapter only reports state and performs a
//! single requested operation. Adapters never read window titles, contents or
//! process names. [`crate::fake::FakeAdapter`] is the only adapter that
//! succeeds in this crate; [`crate::unsupported::UnsupportedNativeAdapter`]
//! is the fail-closed placeholder for the not-yet-written Windows adapter.

use crate::ids::AssetId;
use serde::{Deserialize, Serialize};
use std::fmt;

/// Opaque, adapter-resolved wallpaper reference (on Windows, an image path in
/// the private catalog). It is never accepted from the renderer, and its
/// `Debug`/`Display` never print the inner value.
#[derive(Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct WallpaperRef(String);

impl WallpaperRef {
    /// Only an adapter creates references (from its own catalog or from an
    /// OS snapshot).
    pub fn from_adapter(value: impl Into<String>) -> Self {
        WallpaperRef(value.into())
    }

    /// Only an adapter should read the inner value, to pass it to the OS.
    pub fn expose_to_adapter(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for WallpaperRef {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("WallpaperRef(<redacted>)")
    }
}

impl fmt::Display for WallpaperRef {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("<redacted wallpaper reference>")
    }
}

/// Adapter-assigned opaque monitor token. A native adapter must map OS
/// device paths to tokens; because it may still be path-like, `Debug` and
/// `Display` redact it.
#[derive(Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct MonitorId(String);

impl MonitorId {
    pub fn from_adapter(value: impl Into<String>) -> Self {
        MonitorId(value.into())
    }

    pub fn expose_to_adapter(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for MonitorId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("MonitorId(<redacted>)")
    }
}

impl fmt::Display for MonitorId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("<redacted monitor>")
    }
}

/// Synthetic allowlist key supplied by the adapter (e.g. from a local,
/// untracked allowlist rule). Never a title or process name.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct AppKey(pub String);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Rect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl Rect {
    pub fn width(&self) -> i32 {
        self.right - self.left
    }
    pub fn height(&self) -> i32 {
        self.bottom - self.top
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Point {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ShowState {
    Normal,
    Minimized,
    Maximized,
}

/// Full window placement (mirrors the information in `WINDOWPLACEMENT`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Placement {
    pub show_state: ShowState,
    pub normal_rect: Rect,
    pub min_position: Point,
    pub max_position: Point,
}

/// Placement plus monitor/DPI context.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WindowSnapshot {
    pub placement: Placement,
    pub monitor: MonitorId,
    pub dpi: u32,
}

/// A specific window: handle plus process identity. A handle alone is not an
/// identity because handles are recycled.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WindowIdentity {
    pub hwnd: u64,
    pub pid: u32,
    pub process_start_time: u64,
    /// Optional extra check (e.g. a hashed class token); never a title.
    pub class_token: Option<String>,
}

/// What enumeration reports for one window. Contains no titles, contents or
/// process names.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WindowInfo {
    pub identity: WindowIdentity,
    pub app_key: AppKey,
    pub top_level: bool,
    pub visible: bool,
    pub cloaked: bool,
    pub minimized: bool,
    /// Higher integrity than EVA (UIPI would block moves).
    pub elevated: bool,
    pub fullscreen_exclusive: bool,
    pub snapshot: WindowSnapshot,
}

/// Result of re-finding a recorded window.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WindowLookup {
    Present(WindowSnapshot),
    /// No window has this handle any more.
    Gone,
    /// The handle exists but belongs to another process/start time/class:
    /// it was recycled and must never be acted on.
    HandleReused,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WallpaperPosition {
    Center,
    Tile,
    Stretch,
    Fit,
    Fill,
    Span,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BackgroundColour {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WallpaperKind {
    Static,
    Slideshow,
    Spotlight,
    Span,
    PolicyLocked,
    Unknown,
}

/// Every wallpaper setting that matters for the restore-if-unchanged rule.
///
/// Per Microsoft Learn (`IDesktopWallpaper`, source-checked by the
/// coordinator's research worker, not exercised here): the image is
/// per-monitor, but position, background colour and the background-enabled
/// state are GLOBAL. The broker therefore only ever changes `reference` for
/// one monitor and never writes position, colour or enabled state; it still
/// compares all fields before restoring. `GetWallpaper` returns an empty
/// value for a solid colour or a running slideshow, modelled as `None`.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WallpaperState {
    /// Per-monitor image; `None` when the OS reports an empty value.
    pub reference: Option<WallpaperRef>,
    /// Global.
    pub position: WallpaperPosition,
    /// Global.
    pub colour: BackgroundColour,
    /// Global. `SetWallpaper` re-enables a disabled background, so a disabled
    /// background is treated as not restorable.
    pub background_enabled: bool,
    pub kind: WallpaperKind,
}

impl WallpaperState {
    /// Only a single static, non-empty image, in a non-spanning global mode,
    /// with the background enabled, is treated as restorable per monitor.
    pub fn is_restorable(&self) -> bool {
        self.reference.is_some()
            && self.kind == WallpaperKind::Static
            && self.position != WallpaperPosition::Span
            && self.background_enabled
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MonitorInfo {
    pub id: MonitorId,
    pub work_area: Rect,
    pub dpi: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DesktopStatus {
    Active,
    /// Session locked: pause; never act.
    Locked,
    /// Secure desktop (e.g. UAC prompt): pause; never act.
    SecureDesktop,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AdapterError {
    /// The operation is not implemented on this platform/adapter.
    Unsupported {
        operation: &'static str,
    },
    /// The adapter exists but has not been configured/verified.
    NotConfigured {
        operation: &'static str,
    },
    WindowGone,
    IdentityMismatch,
    AccessDenied,
    AssetUnavailable,
    Failed {
        operation: &'static str,
    },
}

impl fmt::Display for AdapterError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AdapterError::Unsupported { operation } => write!(f, "unsupported: {operation}"),
            AdapterError::NotConfigured { operation } => write!(f, "not configured: {operation}"),
            AdapterError::WindowGone => f.write_str("window gone"),
            AdapterError::IdentityMismatch => f.write_str("window identity mismatch"),
            AdapterError::AccessDenied => f.write_str("access denied"),
            AdapterError::AssetUnavailable => f.write_str("asset unavailable"),
            AdapterError::Failed { operation } => write!(f, "failed: {operation}"),
        }
    }
}

/// The platform boundary. Implementations must re-verify a window identity
/// before acting on it, and must change only the named monitor's wallpaper
/// image (never other monitors, never global position/colour).
pub trait StageAdapter: Send + Sync {
    fn desktop_status(&self) -> Result<DesktopStatus, AdapterError>;
    /// The monitor EVA's window is on.
    fn stage_monitor(&self) -> Result<MonitorInfo, AdapterError>;
    fn own_process_id(&self) -> Result<u32, AdapterError>;
    fn enumerate_windows(&self) -> Result<Vec<WindowInfo>, AdapterError>;
    fn find_window(&self, identity: &WindowIdentity) -> Result<WindowLookup, AdapterError>;
    fn set_window_placement(
        &self,
        identity: &WindowIdentity,
        placement: &Placement,
    ) -> Result<(), AdapterError>;
    fn wallpaper_state(&self, monitor: &MonitorId) -> Result<WallpaperState, AdapterError>;
    /// Sets only the image for one monitor.
    fn set_monitor_wallpaper(
        &self,
        monitor: &MonitorId,
        reference: &WallpaperRef,
    ) -> Result<(), AdapterError>;
    /// Resolves an approved catalog asset id to an opaque reference.
    fn resolve_asset(&self, asset: &AssetId) -> Result<WallpaperRef, AdapterError>;
}
