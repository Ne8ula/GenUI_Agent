//! Conditional restoration shared by the live broker and crash recovery.
//!
//! Rules:
//! - Wallpaper is restored only if its current ref, position, colour and kind
//!   equal a broker-authored state; otherwise it is left alone.
//! - A window is restored only if its identity is unambiguous and its current
//!   placement equals a broker-authored placement (for an interrupted step,
//!   either the pre-step or the intended placement); otherwise left alone.
//! - Every restore is read back. A mismatch is Unresolved and stays in the
//!   journal. The journal is cleared only once every effect is Restored,
//!   LeftAlone or Gone.
//! - Locked / secure desktop: nothing is attempted (Deferred).

use crate::adapter::{
    DesktopStatus, StageAdapter, WallpaperState, WindowIdentity, WindowLookup, WindowSnapshot,
};
use crate::cancel::CancelHandle;
use crate::error::BrokerError;
use crate::journal::{
    EffectId, GoneReason, Journal, JournalRecord, LeftAloneReason, MotionPhase, RestoreMode,
    RestoreOutcome, UnresolvedReason,
};
use crate::ledger::{Ledger, WallpaperEffect, WindowEffect, WindowOwnership};
use crate::motion::plan_steps;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RestoreConfig {
    /// Animated return steps per window in Graceful mode.
    pub return_steps: u32,
}

impl Default for RestoreConfig {
    fn default() -> Self {
        RestoreConfig { return_steps: 6 }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum EffectKind {
    Wallpaper,
    Window,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EffectOutcome {
    pub kind: EffectKind,
    pub outcome: RestoreOutcome,
}

/// Counts and outcomes only: no identities, refs, titles or paths.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RestoreReport {
    pub mode: RestoreMode,
    /// Outcomes computed in this run (effects already settled by an earlier
    /// run are skipped and counted in `already_settled`).
    pub outcomes: Vec<EffectOutcome>,
    pub already_settled: u32,
    /// The journal was empty: nothing owned, nothing done.
    pub nothing_to_restore: bool,
    /// Desktop locked / secure desktop at some point: work deferred.
    pub paused: bool,
    pub journal_cleared: bool,
}

impl RestoreReport {
    fn new(mode: RestoreMode) -> Self {
        RestoreReport {
            mode,
            outcomes: Vec::new(),
            already_settled: 0,
            nothing_to_restore: false,
            paused: false,
            journal_cleared: false,
        }
    }

    fn count(&self, pred: impl Fn(&RestoreOutcome) -> bool) -> u32 {
        self.outcomes.iter().filter(|o| pred(&o.outcome)).count() as u32
    }

    pub fn restored(&self) -> u32 {
        self.count(|o| *o == RestoreOutcome::Restored)
    }
    pub fn left_alone(&self) -> u32 {
        self.count(|o| matches!(o, RestoreOutcome::LeftAlone(_)))
    }
    pub fn gone(&self) -> u32 {
        self.count(|o| matches!(o, RestoreOutcome::Gone(_)))
    }
    pub fn unresolved(&self) -> u32 {
        self.count(|o| matches!(o, RestoreOutcome::Unresolved(_)))
    }
    pub fn deferred(&self) -> u32 {
        self.count(|o| *o == RestoreOutcome::Deferred)
    }
    pub fn outcomes_of(&self, kind: EffectKind) -> Vec<RestoreOutcome> {
        self.outcomes
            .iter()
            .filter(|o| o.kind == kind)
            .map(|o| o.outcome)
            .collect()
    }
    /// Every owned effect is settled and the journal was cleared.
    pub fn is_complete(&self) -> bool {
        self.nothing_to_restore || self.journal_cleared
    }
}

fn paused(adapter: &dyn StageAdapter) -> Result<bool, BrokerError> {
    Ok(adapter.desktop_status()? != DesktopStatus::Active)
}

fn read_snapshot(adapter: &dyn StageAdapter, id: &WindowIdentity) -> Option<WindowSnapshot> {
    match adapter.find_window(id) {
        Ok(WindowLookup::Present(s)) => Some(s),
        _ => None,
    }
}

fn emergency_requested(cancel: Option<&CancelHandle>) -> bool {
    cancel.is_some_and(|c| c.requested() == Some(RestoreMode::Emergency))
}

fn record_result(
    journal: &dyn Journal,
    effect: EffectId,
    outcome: RestoreOutcome,
) -> Result<RestoreOutcome, BrokerError> {
    if outcome != RestoreOutcome::Deferred {
        journal.append(&JournalRecord::RestoreResult { effect, outcome })?;
    }
    Ok(outcome)
}

fn restore_wallpaper(
    adapter: &dyn StageAdapter,
    journal: &dyn Journal,
    id: EffectId,
    eff: &WallpaperEffect,
    mode: RestoreMode,
) -> Result<RestoreOutcome, BrokerError> {
    let current = match adapter.wallpaper_state(&eff.monitor) {
        Ok(c) => c,
        Err(_) => {
            return record_result(
                journal,
                id,
                RestoreOutcome::Unresolved(UnresolvedReason::AdapterError),
            )
        }
    };
    if current == eff.prior {
        return record_result(journal, id, RestoreOutcome::Restored);
    }
    if !eff.owns(&current) {
        return record_result(
            journal,
            id,
            RestoreOutcome::LeftAlone(LeftAloneReason::UserChanged),
        );
    }
    // The broker never applies over a non-restorable prior, so an empty prior
    // here means the journal was produced by something else: do not act.
    let Some(prior_ref) = eff.prior.reference.as_ref() else {
        return record_result(
            journal,
            id,
            RestoreOutcome::Unresolved(UnresolvedReason::AdapterError),
        );
    };
    journal.append(&JournalRecord::RestoreIntent { effect: id, mode })?;
    let set = adapter.set_monitor_wallpaper(&eff.monitor, prior_ref);
    let readback: Option<WallpaperState> = adapter.wallpaper_state(&eff.monitor).ok();
    let outcome = match (set, readback.as_ref()) {
        (Ok(()), Some(rb)) if *rb == eff.prior => RestoreOutcome::Restored,
        (Ok(()), _) => RestoreOutcome::Unresolved(UnresolvedReason::VerifyMismatch),
        (Err(_), _) => RestoreOutcome::Unresolved(UnresolvedReason::AdapterError),
    };
    if outcome != RestoreOutcome::Restored {
        journal.append(&JournalRecord::WallpaperFailed {
            effect: id,
            observed: readback,
        })?;
    }
    record_result(journal, id, outcome)
}

fn restore_window(
    adapter: &dyn StageAdapter,
    journal: &dyn Journal,
    id: EffectId,
    eff: &WindowEffect,
    mode: RestoreMode,
    cfg: &RestoreConfig,
    cancel: Option<&CancelHandle>,
) -> Result<RestoreOutcome, BrokerError> {
    let snap = match adapter.find_window(&eff.identity) {
        Ok(WindowLookup::Present(s)) => s,
        Ok(WindowLookup::Gone) => {
            return record_result(journal, id, RestoreOutcome::Gone(GoneReason::Closed))
        }
        Ok(WindowLookup::HandleReused) => {
            return record_result(journal, id, RestoreOutcome::Gone(GoneReason::HandleReused))
        }
        Err(_) => {
            return record_result(
                journal,
                id,
                RestoreOutcome::Unresolved(UnresolvedReason::AdapterError),
            )
        }
    };
    let prior = &eff.prior;
    if snap.placement == prior.placement && snap.monitor == prior.monitor {
        return record_result(journal, id, RestoreOutcome::Restored);
    }
    match eff.ownership(&snap) {
        WindowOwnership::Owned => {}
        WindowOwnership::ContextChanged => {
            return record_result(
                journal,
                id,
                RestoreOutcome::LeftAlone(LeftAloneReason::MonitorContextChanged),
            )
        }
        WindowOwnership::NotOwned => {
            return record_result(
                journal,
                id,
                RestoreOutcome::LeftAlone(LeftAloneReason::UserChanged),
            )
        }
    }

    // An emergency raised before this window started skips its animation.
    let mode = if emergency_requested(cancel) {
        RestoreMode::Emergency
    } else {
        mode
    };
    journal.append(&JournalRecord::RestoreIntent { effect: id, mode })?;
    let mut steps = match mode {
        RestoreMode::Emergency => vec![prior.placement],
        RestoreMode::Graceful => plan_steps(&snap.placement, &prior.placement, cfg.return_steps),
    };
    let mut expected = snap.placement;
    let mut i = 0;
    while i < steps.len() {
        if i > 0 {
            // Emergency raised mid-return: jump straight to the prior
            // placement in one step.
            if emergency_requested(cancel) && steps.len() > i + 1 {
                steps.truncate(i);
                steps.push(prior.placement);
            }
            if paused(adapter)? {
                return Ok(RestoreOutcome::Deferred);
            }
            match adapter.find_window(&eff.identity) {
                Ok(WindowLookup::Present(s)) if s.placement == expected => {}
                Ok(WindowLookup::Present(_)) => {
                    return record_result(
                        journal,
                        id,
                        RestoreOutcome::LeftAlone(LeftAloneReason::UserChanged),
                    )
                }
                Ok(WindowLookup::Gone) => {
                    return record_result(journal, id, RestoreOutcome::Gone(GoneReason::Closed))
                }
                Ok(WindowLookup::HandleReused) => {
                    return record_result(
                        journal,
                        id,
                        RestoreOutcome::Gone(GoneReason::HandleReused),
                    )
                }
                Err(_) => {
                    return record_result(
                        journal,
                        id,
                        RestoreOutcome::Unresolved(UnresolvedReason::AdapterError),
                    )
                }
            }
        }
        let target = steps[i];
        let is_last = i + 1 == steps.len();
        let step = i as u32 + 1;
        journal.append(&JournalRecord::WindowStepIntent {
            effect: id,
            identity: eff.identity.clone(),
            phase: MotionPhase::Return,
            step,
            steps_total: steps.len() as u32,
            prior: prior.clone(),
            from: expected,
            target,
        })?;
        let set = adapter.set_window_placement(&eff.identity, &target);
        let readback = read_snapshot(adapter, &eff.identity);
        let failure = match (&set, readback.as_ref()) {
            // The final step must also land back on the original monitor.
            (Ok(()), Some(rb))
                if rb.placement == target && (!is_last || rb.monitor == prior.monitor) =>
            {
                None
            }
            (Ok(()), _) => Some(UnresolvedReason::VerifyMismatch),
            (Err(_), _) => Some(UnresolvedReason::AdapterError),
        };
        let rb = match (failure, readback) {
            (None, Some(rb)) => rb,
            (failure, observed) => {
                journal.append(&JournalRecord::WindowStepFailed {
                    effect: id,
                    phase: MotionPhase::Return,
                    step,
                    observed,
                })?;
                return record_result(
                    journal,
                    id,
                    RestoreOutcome::Unresolved(failure.unwrap_or(UnresolvedReason::AdapterError)),
                );
            }
        };
        journal.append(&JournalRecord::WindowStepApplied {
            effect: id,
            phase: MotionPhase::Return,
            step,
            applied: target,
            monitor: rb.monitor,
            dpi: rb.dpi,
        })?;
        expected = target;
        i += 1;
    }
    record_result(journal, id, RestoreOutcome::Restored)
}

/// Restore owned effects reconstructed from the journal. `only` limits the
/// run to one effect (used to undo a failed window's earlier steps) and never
/// clears the journal. `cancel`, when given, is checked between graceful
/// return steps: an emergency request turns the rest of the return into one
/// immediate step per window.
pub(crate) fn restore_from_journal(
    adapter: &dyn StageAdapter,
    journal: &dyn Journal,
    mode: RestoreMode,
    cfg: &RestoreConfig,
    only: Option<EffectId>,
    cancel: Option<&CancelHandle>,
) -> Result<RestoreReport, BrokerError> {
    let mut report = RestoreReport::new(mode);
    let records = journal.load()?;
    if records.is_empty() {
        report.nothing_to_restore = true;
        return Ok(report);
    }
    let ledger = Ledger::from_records(&records).map_err(BrokerError::Ledger)?;
    // Fail closed if the adapter cannot even report desktop status.
    let mut is_paused = paused(adapter)?;

    for (id, eff) in &ledger.wallpapers {
        if only.is_some_and(|o| o != *id) {
            continue;
        }
        if eff.terminal.is_some() {
            report.already_settled += 1;
            continue;
        }
        let outcome = if is_paused {
            RestoreOutcome::Deferred
        } else {
            restore_wallpaper(adapter, journal, *id, eff, mode)?
        };
        report.outcomes.push(EffectOutcome {
            kind: EffectKind::Wallpaper,
            outcome,
        });
        is_paused = is_paused || paused(adapter)?;
    }
    for (id, eff) in &ledger.windows {
        if only.is_some_and(|o| o != *id) {
            continue;
        }
        if eff.terminal.is_some() {
            report.already_settled += 1;
            continue;
        }
        let outcome = if is_paused {
            RestoreOutcome::Deferred
        } else {
            restore_window(adapter, journal, *id, eff, mode, cfg, cancel)?
        };
        report.outcomes.push(EffectOutcome {
            kind: EffectKind::Window,
            outcome,
        });
        is_paused = is_paused || paused(adapter)?;
    }
    report.paused = is_paused || report.deferred() > 0;

    if only.is_none() {
        let after = journal.load()?;
        let settled = Ledger::from_records(&after).map_err(BrokerError::Ledger)?;
        if settled.all_terminal() {
            let generation = after
                .iter()
                .filter_map(|r| match r {
                    JournalRecord::SessionBegin { generation, .. } => Some(*generation),
                    _ => None,
                })
                .max()
                .unwrap_or(0);
            journal.append(&JournalRecord::SessionClosed { generation })?;
            report.journal_cleared = journal.clear().is_ok();
        }
    }
    Ok(report)
}
