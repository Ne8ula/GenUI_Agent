//! EVA Week 4 stage broker (W4-1 non-visual foundation).
//!
//! Platform-neutral policy and state for scoped desktop staging: consent
//! receipts, window scope/eligibility, a write-ahead journal, deterministic
//! eased motion, conditional restoration, and crash recovery. All OS access
//! goes through [`adapter::StageAdapter`]. Only the synthetic
//! [`fake::FakeAdapter`] succeeds here; the native boundary is
//! [`unsupported::UnsupportedNativeAdapter`], which fails closed. Nothing in
//! this crate has been exercised against real Windows APIs.

pub mod adapter;
pub mod broker;
pub mod cancel;
pub mod clock;
pub mod consent;
pub mod error;
/// Synthetic test desktop. Compiled only for this crate's tests or with the
/// non-default `fake` feature, so a production build cannot link it.
#[cfg(any(test, feature = "fake"))]
pub mod fake;
pub mod ids;
pub mod journal;
mod ledger;
pub mod motion;
pub mod recovery;
pub mod renderer;
pub mod restore;
pub mod unsupported;

pub use broker::{
    BrokerConfig, DegradedReason, EnterOutcome, EnterReport, ExclusionReason, FarFieldOutcome,
    PrepareSummary, StageBroker,
};
pub use error::BrokerError;
pub use ledger::LedgerError;
pub use recovery::{recover, MemoryRecoveryLock, RecoveryLock, RecoveryOutcome};
pub use restore::{EffectKind, EffectOutcome, RestoreConfig, RestoreReport};
