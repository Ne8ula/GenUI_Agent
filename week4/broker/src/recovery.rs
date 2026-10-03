//! Crash recovery from a leftover journal, serialized between the app and
//! the watchdog by a [`RecoveryLock`].

use crate::adapter::StageAdapter;
use crate::error::BrokerError;
use crate::journal::{Journal, RestoreMode};
use crate::restore::{restore_from_journal, RestoreConfig, RestoreReport};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

/// Mutual exclusion between restorers.
///
/// **In-process only.** The provided [`MemoryRecoveryLock`] serializes
/// restorers that share it within one process (the live broker's `restore`
/// and [`recover`]). It does not exclude a separate watchdog process; that
/// needs a per-user named mutex or lock file, which is not implemented.
/// Live effects are also **not lease-serialized against recovery yet**:
/// `enter` and `set_far_field` do not take this lock, so a recoverer running
/// concurrently with a live session's staging is not prevented here. Until a
/// cross-process lock/lease exists, the host must guarantee that recovery
/// only runs when no live session is staging.
pub trait RecoveryLock: Send + Sync {
    /// Non-blocking; `true` if this caller now holds the lock.
    fn try_acquire(&self) -> bool;
    fn release(&self);
}

/// In-memory lock; clones share state (stand-in for app + watchdog).
#[derive(Debug, Clone, Default)]
pub struct MemoryRecoveryLock(Arc<AtomicBool>);

impl MemoryRecoveryLock {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn is_held(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}

impl RecoveryLock for MemoryRecoveryLock {
    fn try_acquire(&self) -> bool {
        self.0
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
    }
    fn release(&self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

pub(crate) struct LockGuard<'a>(&'a dyn RecoveryLock);

impl<'a> LockGuard<'a> {
    pub(crate) fn try_new(lock: &'a dyn RecoveryLock) -> Option<Self> {
        lock.try_acquire().then_some(LockGuard(lock))
    }
}

impl Drop for LockGuard<'_> {
    fn drop(&mut self) {
        self.0.release();
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RecoveryOutcome {
    /// Another restorer holds the lock; this call did nothing.
    AlreadyInProgress,
    /// No leftover journal; nothing done.
    NothingToRecover,
    Recovered(RestoreReport),
}

/// Restore effects left over in `journal` (e.g. after a crash) using the same
/// conditional rules as the live broker, with no animation.
pub fn recover(
    journal: &dyn Journal,
    adapter: &dyn StageAdapter,
    lock: &dyn RecoveryLock,
    cfg: &RestoreConfig,
) -> Result<RecoveryOutcome, BrokerError> {
    let Some(_guard) = LockGuard::try_new(lock) else {
        return Ok(RecoveryOutcome::AlreadyInProgress);
    };
    if journal.load()?.is_empty() {
        return Ok(RecoveryOutcome::NothingToRecover);
    }
    let report = restore_from_journal(adapter, journal, RestoreMode::Emergency, cfg, None, None)?;
    Ok(RecoveryOutcome::Recovered(report))
}
