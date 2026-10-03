//! Cancellation token observed between motion steps.

use crate::journal::RestoreMode;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Arc;

const NONE: u8 = 0;
const GRACEFUL: u8 = 1;
const EMERGENCY: u8 = 2;

/// Clonable handle that a host (hotkey, tray, voice "cancel") can signal while
/// the broker is executing motion. Emergency always wins over graceful.
#[derive(Debug, Clone, Default)]
pub struct CancelHandle(Arc<AtomicU8>);

impl CancelHandle {
    /// Request cancellation; moved windows are returned with return steps.
    pub fn cancel(&self) {
        self.0.fetch_max(GRACEFUL, Ordering::SeqCst);
    }

    /// Request emergency cancellation; remaining motion is skipped and
    /// restoration is immediate (no animation steps).
    pub fn emergency(&self) {
        self.0.store(EMERGENCY, Ordering::SeqCst);
    }

    pub fn requested(&self) -> Option<RestoreMode> {
        match self.0.load(Ordering::SeqCst) {
            GRACEFUL => Some(RestoreMode::Graceful),
            EMERGENCY => Some(RestoreMode::Emergency),
            _ => None,
        }
    }

    pub(crate) fn reset(&self) {
        self.0.store(NONE, Ordering::SeqCst);
    }
}
