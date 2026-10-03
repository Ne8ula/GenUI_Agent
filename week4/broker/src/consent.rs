//! Consent receipts. Receipts are minted by the broker after the consent
//! screen and validated against the broker's own registry, so a forged or
//! edited receipt cannot widen scope.

use crate::adapter::MonitorId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ConsentReceipt {
    pub receipt_id: String,
    pub session_id: String,
    pub generation: u64,
    pub monitor_id: MonitorId,
    pub windows: bool,
    pub wallpaper: bool,
    pub approved_window_count: u32,
    pub issued_at_ms: u64,
    pub expires_at_ms: u64,
}

/// What the person accepted on the consent screen; each item can be declined.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ConsentChoices {
    pub windows: bool,
    pub wallpaper: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum StageEffect {
    Windows,
    Wallpaper,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConsentError {
    /// Not issued by this broker.
    UnknownReceipt,
    Revoked,
    /// Already used for a session that has ended.
    Consumed,
    /// A newer prepare superseded the receipt's generation.
    StaleGeneration,
    WrongSession,
    Expired,
    /// The receipt names a different monitor than the stage monitor.
    MonitorMismatch,
    /// Fields differ from what the broker issued.
    Tampered,
    EffectNotConsented(StageEffect),
    /// More eligible windows exist now than were approved: re-prepare.
    ApprovedCountTooLow {
        approved: u32,
        eligible: u32,
    },
}
