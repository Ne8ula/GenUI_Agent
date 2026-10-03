//! Injected time source so consent expiry is deterministic in tests.

use std::sync::atomic::{AtomicU64, Ordering};

pub trait Clock: Send + Sync {
    /// Milliseconds on a monotonic-enough wall clock.
    fn now_ms(&self) -> u64;
}

/// Manually advanced clock for tests and fixtures.
#[derive(Debug, Default)]
pub struct FakeClock(AtomicU64);

impl FakeClock {
    pub fn new(start_ms: u64) -> Self {
        FakeClock(AtomicU64::new(start_ms))
    }

    pub fn set(&self, ms: u64) {
        self.0.store(ms, Ordering::SeqCst);
    }

    pub fn advance(&self, ms: u64) {
        self.0.fetch_add(ms, Ordering::SeqCst);
    }
}

impl Clock for FakeClock {
    fn now_ms(&self) -> u64 {
        self.0.load(Ordering::SeqCst)
    }
}
