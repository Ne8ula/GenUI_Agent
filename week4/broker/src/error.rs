use crate::adapter::AdapterError;
use crate::consent::ConsentError;
use crate::journal::JournalError;
use crate::ledger::LedgerError;
use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BrokerError {
    /// The adapter refused or does not support an operation. Nothing is
    /// claimed as done.
    Adapter(AdapterError),
    /// A journal append/load/clear failed. Any effect whose intent could not
    /// be journaled was not applied.
    Journal(JournalError),
    /// Journal records are inconsistent; nothing was acted on.
    Ledger(LedgerError),
    Consent(ConsentError),
    /// `prepare` has not been called (or was cancelled).
    NotPrepared,
    /// No entered session for this operation.
    NotEntered,
    /// A session still owns unrestored effects; restore first.
    EffectsOutstanding,
    /// Another restorer (app or watchdog) holds the recovery lock.
    RestoreInProgress,
    /// A restore has started for this session and has not yet cleared the
    /// journal; no new effects may be applied.
    Closing,
}

impl fmt::Display for BrokerError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            BrokerError::Adapter(e) => write!(f, "adapter: {e}"),
            BrokerError::Journal(e) => write!(f, "journal: {e}"),
            BrokerError::Ledger(e) => {
                write!(f, "inconsistent journal at record {}", e.record_index)
            }
            BrokerError::Consent(e) => write!(f, "consent: {e:?}"),
            BrokerError::NotPrepared => f.write_str("not prepared"),
            BrokerError::NotEntered => f.write_str("not entered"),
            BrokerError::EffectsOutstanding => f.write_str("unrestored effects outstanding"),
            BrokerError::RestoreInProgress => f.write_str("restore already in progress"),
            BrokerError::Closing => f.write_str("session is closing"),
        }
    }
}

impl std::error::Error for BrokerError {}

impl From<AdapterError> for BrokerError {
    fn from(e: AdapterError) -> Self {
        BrokerError::Adapter(e)
    }
}

impl From<JournalError> for BrokerError {
    fn from(e: JournalError) -> Self {
        BrokerError::Journal(e)
    }
}

impl From<ConsentError> for BrokerError {
    fn from(e: ConsentError) -> Self {
        BrokerError::Consent(e)
    }
}
