//! Fail-closed placeholder for the native (Windows) adapter.
//!
//! Every operation returns an explicit error and never reports success, so
//! nothing can be claimed as staged or restored before a verified native
//! adapter exists.

use crate::adapter::{
    AdapterError, DesktopStatus, MonitorId, MonitorInfo, Placement, StageAdapter, WallpaperRef,
    WallpaperState, WindowIdentity, WindowInfo, WindowLookup,
};
use crate::ids::AssetId;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NativeAdapterStatus {
    /// No native implementation exists for this platform/build.
    Unsupported,
    /// An implementation exists but was not configured/verified.
    NotConfigured,
}

#[derive(Debug, Clone, Copy)]
pub struct UnsupportedNativeAdapter {
    status: NativeAdapterStatus,
}

impl UnsupportedNativeAdapter {
    pub fn new(status: NativeAdapterStatus) -> Self {
        UnsupportedNativeAdapter { status }
    }

    fn err(&self, operation: &'static str) -> AdapterError {
        match self.status {
            NativeAdapterStatus::Unsupported => AdapterError::Unsupported { operation },
            NativeAdapterStatus::NotConfigured => AdapterError::NotConfigured { operation },
        }
    }
}

impl Default for UnsupportedNativeAdapter {
    fn default() -> Self {
        Self::new(NativeAdapterStatus::Unsupported)
    }
}

impl StageAdapter for UnsupportedNativeAdapter {
    fn desktop_status(&self) -> Result<DesktopStatus, AdapterError> {
        Err(self.err("desktop_status"))
    }
    fn stage_monitor(&self) -> Result<MonitorInfo, AdapterError> {
        Err(self.err("stage_monitor"))
    }
    fn own_process_id(&self) -> Result<u32, AdapterError> {
        Err(self.err("own_process_id"))
    }
    fn enumerate_windows(&self) -> Result<Vec<WindowInfo>, AdapterError> {
        Err(self.err("enumerate_windows"))
    }
    fn find_window(&self, _: &WindowIdentity) -> Result<WindowLookup, AdapterError> {
        Err(self.err("find_window"))
    }
    fn set_window_placement(&self, _: &WindowIdentity, _: &Placement) -> Result<(), AdapterError> {
        Err(self.err("set_window_placement"))
    }
    fn wallpaper_state(&self, _: &MonitorId) -> Result<WallpaperState, AdapterError> {
        Err(self.err("wallpaper_state"))
    }
    fn set_monitor_wallpaper(&self, _: &MonitorId, _: &WallpaperRef) -> Result<(), AdapterError> {
        Err(self.err("set_monitor_wallpaper"))
    }
    fn resolve_asset(&self, _: &AssetId) -> Result<WallpaperRef, AdapterError> {
        Err(self.err("resolve_asset"))
    }
}
