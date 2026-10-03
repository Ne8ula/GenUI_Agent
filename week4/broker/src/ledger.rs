//! Reconstruction of owned effects from journal records.
//!
//! The journal is the single source of truth for what EVA owns. The live
//! broker and crash recovery both restore from a ledger folded from the
//! journal, so they apply identical rules.

use crate::adapter::{MonitorId, Placement, WallpaperState, WindowIdentity, WindowSnapshot};
use crate::journal::{EffectId, JournalRecord, RestoreOutcome};
use std::collections::BTreeMap;

#[derive(Debug, Clone)]
pub(crate) struct WallpaperEffect {
    pub monitor: MonitorId,
    pub prior: WallpaperState,
    pub last_applied: Option<WallpaperState>,
    /// Intended state whose application was not verified (interrupted or
    /// failed); still treated as possibly broker-authored.
    pub pending: Option<WallpaperState>,
    /// Read-backs observed right after EVA's own unverified attempts.
    pub observed: Vec<WallpaperState>,
    pub terminal: Option<RestoreOutcome>,
}

impl WallpaperEffect {
    pub fn owns(&self, current: &WallpaperState) -> bool {
        self.last_applied.as_ref() == Some(current)
            || self.pending.as_ref() == Some(current)
            || self.observed.iter().any(|o| o == current)
    }
}

/// Whether a window's current state is broker-authored.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum WindowOwnership {
    Owned,
    /// Placement is broker-authored, and the monitor is one EVA used, but
    /// the DPI is one EVA never observed: the environment changed.
    ContextChanged,
    NotOwned,
}

#[derive(Debug, Clone)]
pub(crate) struct WindowEffect {
    pub identity: WindowIdentity,
    pub prior: WindowSnapshot,
    pub last_applied: Option<Placement>,
    /// (from, target) of a step whose application was not verified.
    pub pending: Option<(Placement, Placement)>,
    pub observed: Vec<Placement>,
    /// Monitor/DPI contexts EVA itself produced or started from: the prior
    /// context, plus every context read back after a broker-authored step.
    pub contexts: Vec<(MonitorId, u32)>,
    pub terminal: Option<RestoreOutcome>,
}

impl WindowEffect {
    fn owns_placement(&self, current: &Placement) -> bool {
        self.last_applied.as_ref() == Some(current)
            || self
                .pending
                .as_ref()
                .is_some_and(|(from, to)| from == current || to == current)
            || self.observed.iter().any(|o| o == current)
    }

    fn add_context(&mut self, monitor: &MonitorId, dpi: u32) {
        if !self.contexts.iter().any(|(m, d)| m == monitor && *d == dpi) {
            self.contexts.push((monitor.clone(), dpi));
        }
    }

    pub fn ownership(&self, current: &WindowSnapshot) -> WindowOwnership {
        if !self.owns_placement(&current.placement) {
            return WindowOwnership::NotOwned;
        }
        if self
            .contexts
            .iter()
            .any(|(m, d)| *m == current.monitor && *d == current.dpi)
        {
            WindowOwnership::Owned
        } else if self.contexts.iter().any(|(m, _)| *m == current.monitor) {
            WindowOwnership::ContextChanged
        } else {
            WindowOwnership::NotOwned
        }
    }
}

#[derive(Debug, Default)]
pub(crate) struct Ledger {
    pub wallpapers: BTreeMap<EffectId, WallpaperEffect>,
    pub windows: BTreeMap<EffectId, WindowEffect>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LedgerError {
    /// 0-based index of the first inconsistent record.
    pub record_index: usize,
}

impl Ledger {
    pub fn from_records(records: &[JournalRecord]) -> Result<Ledger, LedgerError> {
        let mut ledger = Ledger::default();
        for (i, record) in records.iter().enumerate() {
            let err = LedgerError { record_index: i };
            match record {
                JournalRecord::SessionBegin { .. } | JournalRecord::SessionClosed { .. } => {}
                JournalRecord::WallpaperIntent {
                    effect,
                    monitor,
                    prior,
                    target,
                } => {
                    if ledger.windows.contains_key(effect) {
                        return Err(err);
                    }
                    let entry =
                        ledger
                            .wallpapers
                            .entry(*effect)
                            .or_insert_with(|| WallpaperEffect {
                                monitor: monitor.clone(),
                                prior: prior.clone(),
                                last_applied: None,
                                pending: None,
                                observed: Vec::new(),
                                terminal: None,
                            });
                    if &entry.monitor != monitor || &entry.prior != prior {
                        return Err(err);
                    }
                    entry.pending = Some(target.clone());
                    // A new intent after a terminal result means EVA acted
                    // again: the effect is owned again, not settled.
                    entry.terminal = None;
                }
                JournalRecord::WallpaperApplied { effect, applied } => {
                    let entry = ledger.wallpapers.get_mut(effect).ok_or(err)?;
                    entry.last_applied = Some(applied.clone());
                    entry.pending = None;
                }
                JournalRecord::WallpaperFailed { effect, observed } => {
                    let entry = ledger.wallpapers.get_mut(effect).ok_or(err)?;
                    if let Some(o) = observed {
                        entry.observed.push(o.clone());
                    }
                }
                JournalRecord::WindowStepIntent {
                    effect,
                    identity,
                    prior,
                    from,
                    target,
                    ..
                } => {
                    if ledger.wallpapers.contains_key(effect) {
                        return Err(err);
                    }
                    let entry = ledger
                        .windows
                        .entry(*effect)
                        .or_insert_with(|| WindowEffect {
                            identity: identity.clone(),
                            prior: prior.clone(),
                            last_applied: None,
                            pending: None,
                            observed: Vec::new(),
                            contexts: vec![(prior.monitor.clone(), prior.dpi)],
                            terminal: None,
                        });
                    if &entry.identity != identity || &entry.prior != prior {
                        return Err(err);
                    }
                    entry.pending = Some((*from, *target));
                    entry.terminal = None;
                }
                JournalRecord::WindowStepApplied {
                    effect,
                    applied,
                    monitor,
                    dpi,
                    ..
                } => {
                    let entry = ledger.windows.get_mut(effect).ok_or(err)?;
                    entry.last_applied = Some(*applied);
                    entry.pending = None;
                    entry.add_context(monitor, *dpi);
                }
                JournalRecord::WindowStepFailed {
                    effect, observed, ..
                } => {
                    let entry = ledger.windows.get_mut(effect).ok_or(err)?;
                    if let Some(o) = observed {
                        entry.observed.push(o.placement);
                        entry.add_context(&o.monitor, o.dpi);
                    }
                }
                JournalRecord::RestoreIntent { effect, .. } => {
                    if !ledger.wallpapers.contains_key(effect)
                        && !ledger.windows.contains_key(effect)
                    {
                        return Err(err);
                    }
                }
                JournalRecord::RestoreResult { effect, outcome } => {
                    let terminal = outcome.is_terminal().then_some(*outcome);
                    if let Some(w) = ledger.wallpapers.get_mut(effect) {
                        if terminal.is_some() {
                            w.terminal = terminal;
                        }
                    } else if let Some(w) = ledger.windows.get_mut(effect) {
                        if terminal.is_some() {
                            w.terminal = terminal;
                        }
                    } else {
                        return Err(err);
                    }
                }
            }
        }
        Ok(ledger)
    }

    pub fn all_terminal(&self) -> bool {
        self.wallpapers.values().all(|w| w.terminal.is_some())
            && self.windows.values().all(|w| w.terminal.is_some())
    }
}
