//! The stage broker: consent-gated, journaled, conditionally reversible
//! desktop staging. Platform-neutral; all OS access goes through a
//! [`StageAdapter`].
//!
//! Sequencing decision: `enter` begins the session and displaces approved
//! windows (storyboard phase B); `set_far_field` applies the wallpaper (first
//! call at phase D under the opaque veil, later calls for rain/evening). This
//! follows planning §6.4, which keeps the user's original wallpaper visible
//! during clearing. `enter` still takes the variant so the asset is resolved
//! and wallpaper restorability checked before anything moves.

use crate::adapter::{
    AppKey, DesktopStatus, MonitorId, MonitorInfo, Placement, ShowState, StageAdapter,
    WallpaperState, WindowIdentity, WindowInfo, WindowLookup, WindowSnapshot,
};
use crate::cancel::CancelHandle;
use crate::clock::Clock;
use crate::consent::{ConsentChoices, ConsentError, ConsentReceipt, StageEffect};
use crate::error::BrokerError;
use crate::ids::{approved_wallpaper_asset, SceneId, VariantId};
use crate::journal::{EffectId, Journal, JournalRecord, MonitorContext, MotionPhase, RestoreMode};
use crate::ledger::Ledger;
use crate::motion::{contains, edge_slot, plan_steps};
use crate::recovery::{LockGuard, RecoveryLock};
use crate::restore::{restore_from_journal, RestoreConfig, RestoreReport};
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;

/// How a displaced window is parked. Neither option is the approved final
/// choreography; that is chosen through the visual packet and verified on
/// Windows.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ParkingPolicy {
    /// Default. A window is parked only if its edge slot keeps its exact size
    /// inside the stage monitor's work area; otherwise it is excluded
    /// (`DoesNotFit`) and left untouched. EVA never resizes user windows.
    RejectIfResizeNeeded,
    /// Synthetic mock fixture only: fit windows into the `edge_strip_px`
    /// column, shrinking them. Not permission to resize real user windows.
    MockFitToStrip,
}

#[derive(Debug, Clone)]
pub struct BrokerConfig {
    /// Synthetic allowlist rules (from a local, untracked file in practice).
    pub allowlist: BTreeSet<AppKey>,
    pub consent_ttl_ms: u64,
    /// Eased displacement steps per window.
    pub motion_steps: u32,
    /// Width of the edge column, inside the stage monitor's work area, that a
    /// displaced window is fitted into. Slots never leave the stage monitor.
    pub edge_strip_px: i32,
    pub parking: ParkingPolicy,
    pub restore: RestoreConfig,
}

impl Default for BrokerConfig {
    fn default() -> Self {
        BrokerConfig {
            allowlist: BTreeSet::new(),
            consent_ttl_ms: 120_000,
            motion_steps: 8,
            edge_strip_px: 240,
            parking: ParkingPolicy::RejectIfResizeNeeded,
            restore: RestoreConfig::default(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum DegradedReason {
    /// Slideshow, Spotlight, span, policy-locked, empty (solid colour),
    /// disabled background or unknown: wallpaper step skipped.
    WallpaperNotRestorable,
    WallpaperNotConsented,
    WindowsNotConsented,
    NoEligibleWindows,
    AssetUnavailable,
    WallpaperSetFailed,
    /// The user changed the wallpaper during the session; EVA stopped
    /// managing it.
    WallpaperUserChanged,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum ExclusionReason {
    OwnProcess,
    NotTopLevel,
    Invisible,
    Cloaked,
    OtherMonitor,
    Minimized,
    Elevated,
    FullscreenExclusive,
    NotAllowlisted,
    MoveFailed,
    /// No safe in-monitor slot without resizing (default parking policy).
    DoesNotFit,
    ClosedDuringMotion,
    UserMovedDuringMotion,
}

/// Counts only, for the consent screen.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PrepareSummary {
    pub eligible_window_count: u32,
    pub wallpaper_restorable: bool,
    pub degraded: Vec<DegradedReason>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EnterOutcome {
    Entered,
    /// Same receipt already entered: no-op.
    AlreadyEntered,
    /// Locked / secure desktop: nothing (further) applied.
    Paused,
    /// Cancellation observed between steps; see `restore`.
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EnterReport {
    pub outcome: EnterOutcome,
    pub moved_window_count: u32,
    pub excluded: BTreeMap<ExclusionReason, u32>,
    pub degraded: Vec<DegradedReason>,
    pub restore: Option<RestoreReport>,
}

impl EnterReport {
    fn new(outcome: EnterOutcome) -> Self {
        EnterReport {
            outcome,
            moved_window_count: 0,
            excluded: BTreeMap::new(),
            degraded: Vec::new(),
            restore: None,
        }
    }
    fn exclude(&mut self, reason: ExclusionReason) {
        *self.excluded.entry(reason).or_insert(0) += 1;
    }
    pub fn excluded_for(&self, reason: ExclusionReason) -> u32 {
        self.excluded.get(&reason).copied().unwrap_or(0)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FarFieldOutcome {
    Applied,
    /// Already showing this variant: no-op.
    NoOp,
    Paused,
    Degraded(DegradedReason),
    /// The user changed the wallpaper; EVA will not overwrite it.
    LeftAlone,
}

struct Prepared {
    session_id: String,
    generation: u64,
    scene: SceneId,
}

#[derive(Debug, Clone)]
enum WallpaperTrack {
    NotConsented,
    Degraded(DegradedReason),
    Ready,
    Owned {
        effect: EffectId,
        prior: WallpaperState,
        last_applied: WallpaperState,
        variant: VariantId,
    },
    UserChanged,
}

struct Active {
    receipt: ConsentReceipt,
    scene: SceneId,
    monitor: MonitorId,
    wallpaper: WallpaperTrack,
    next_seq: u32,
}

impl Active {
    fn next_effect(&mut self) -> EffectId {
        self.next_seq += 1;
        EffectId {
            generation: self.receipt.generation,
            seq: self.next_seq,
        }
    }
}

enum MotionEnd {
    Completed,
    Paused,
    Cancelled(RestoreMode),
}

struct Mover {
    effect: EffectId,
    identity: WindowIdentity,
    prior: WindowSnapshot,
    steps: Vec<Placement>,
    expected: Placement,
    moving: bool,
}

pub struct StageBroker {
    adapter: Arc<dyn StageAdapter>,
    journal: Arc<dyn Journal>,
    clock: Arc<dyn Clock>,
    lock: Arc<dyn RecoveryLock>,
    config: BrokerConfig,
    cancel: CancelHandle,
    generation: u64,
    receipt_counter: u64,
    prepared: Option<Prepared>,
    issued: BTreeMap<String, ConsentReceipt>,
    revoked: BTreeSet<String>,
    consumed: BTreeSet<String>,
    active: Option<Active>,
    /// Set when `restore` starts on an active session; cleared only once the
    /// journal is cleared. While set, `enter` and `set_far_field` fail, even
    /// if the restore was incomplete (unresolved, deferred, clear failed).
    closing: bool,
}

fn classify(
    w: &WindowInfo,
    monitor: &MonitorId,
    own_pid: u32,
    allowlist: &BTreeSet<AppKey>,
) -> Result<(), ExclusionReason> {
    if w.identity.pid == own_pid {
        return Err(ExclusionReason::OwnProcess);
    }
    if !w.top_level {
        return Err(ExclusionReason::NotTopLevel);
    }
    if !w.visible {
        return Err(ExclusionReason::Invisible);
    }
    if w.cloaked {
        return Err(ExclusionReason::Cloaked);
    }
    if &w.snapshot.monitor != monitor {
        return Err(ExclusionReason::OtherMonitor);
    }
    if w.minimized || w.snapshot.placement.show_state == ShowState::Minimized {
        return Err(ExclusionReason::Minimized);
    }
    if w.elevated {
        return Err(ExclusionReason::Elevated);
    }
    if w.fullscreen_exclusive {
        return Err(ExclusionReason::FullscreenExclusive);
    }
    if !allowlist.contains(&w.app_key) {
        return Err(ExclusionReason::NotAllowlisted);
    }
    Ok(())
}

impl StageBroker {
    pub fn new(
        adapter: Arc<dyn StageAdapter>,
        journal: Arc<dyn Journal>,
        clock: Arc<dyn Clock>,
        lock: Arc<dyn RecoveryLock>,
        config: BrokerConfig,
    ) -> Self {
        StageBroker {
            adapter,
            journal,
            clock,
            lock,
            config,
            cancel: CancelHandle::default(),
            generation: 0,
            receipt_counter: 0,
            prepared: None,
            issued: BTreeMap::new(),
            revoked: BTreeSet::new(),
            consumed: BTreeSet::new(),
            active: None,
            closing: false,
        }
    }

    /// Handle for hotkey/tray/voice cancellation while motion runs.
    pub fn cancel_handle(&self) -> CancelHandle {
        self.cancel.clone()
    }

    fn eligible_windows(
        &self,
        monitor: &MonitorId,
        report: Option<&mut EnterReport>,
    ) -> Result<Vec<WindowInfo>, BrokerError> {
        let own_pid = self.adapter.own_process_id()?;
        let mut windows = self.adapter.enumerate_windows()?;
        windows.sort_by_key(|w| w.identity.hwnd);
        let mut eligible = Vec::new();
        let mut excluded = Vec::new();
        for w in windows {
            match classify(&w, monitor, own_pid, &self.config.allowlist) {
                Ok(()) => eligible.push(w),
                Err(reason) => excluded.push(reason),
            }
        }
        if let Some(report) = report {
            for reason in excluded {
                report.exclude(reason);
            }
        }
        Ok(eligible)
    }

    /// Enumerate scope for the consent screen. Supersedes any earlier
    /// prepared session/receipts (bumps the generation). Counts only.
    pub fn prepare(&mut self, scene: SceneId) -> Result<PrepareSummary, BrokerError> {
        let monitor = self.adapter.stage_monitor()?;
        let eligible = self.eligible_windows(&monitor.id, None)?.len() as u32;
        let wallpaper_restorable = self.adapter.wallpaper_state(&monitor.id)?.is_restorable();
        self.generation += 1;
        // A new consent flow starts clean. (`enter` never clears the token,
        // so an Esc raised between prepare and enter is honoured.)
        self.cancel.reset();
        self.prepared = Some(Prepared {
            session_id: format!("session-{}", self.generation),
            generation: self.generation,
            scene,
        });
        let mut degraded = Vec::new();
        if !wallpaper_restorable {
            degraded.push(DegradedReason::WallpaperNotRestorable);
        }
        if eligible == 0 {
            degraded.push(DegradedReason::NoEligibleWindows);
        }
        Ok(PrepareSummary {
            eligible_window_count: eligible,
            wallpaper_restorable,
            degraded,
        })
    }

    /// Mint a receipt for the person's consent choices on the prepared
    /// session. The approved count is re-read now.
    pub fn issue_consent(
        &mut self,
        choices: ConsentChoices,
    ) -> Result<ConsentReceipt, BrokerError> {
        let prepared = self.prepared.as_ref().ok_or(BrokerError::NotPrepared)?;
        let monitor = self.adapter.stage_monitor()?;
        let eligible = self.eligible_windows(&monitor.id, None)?.len() as u32;
        self.receipt_counter += 1;
        let now = self.clock.now_ms();
        let receipt = ConsentReceipt {
            receipt_id: format!("receipt-{}-{}", prepared.generation, self.receipt_counter),
            session_id: prepared.session_id.clone(),
            generation: prepared.generation,
            monitor_id: monitor.id,
            windows: choices.windows,
            wallpaper: choices.wallpaper,
            approved_window_count: if choices.windows { eligible } else { 0 },
            issued_at_ms: now,
            expires_at_ms: now + self.config.consent_ttl_ms,
        };
        self.issued
            .insert(receipt.receipt_id.clone(), receipt.clone());
        Ok(receipt)
    }

    /// Withdraw consent. Future `enter`/`set_far_field` with it fail; effects
    /// already applied remain owned until `restore`.
    pub fn revoke(&mut self, receipt_id: &str) {
        self.revoked.insert(receipt_id.to_string());
    }

    fn validate_for_enter(&self, receipt: &ConsentReceipt) -> Result<MonitorInfo, BrokerError> {
        let issued = self
            .issued
            .get(&receipt.receipt_id)
            .ok_or(ConsentError::UnknownReceipt)?;
        if self.revoked.contains(&receipt.receipt_id) {
            return Err(ConsentError::Revoked.into());
        }
        if self.consumed.contains(&receipt.receipt_id) {
            return Err(ConsentError::Consumed.into());
        }
        if receipt.generation < self.generation || issued.generation < self.generation {
            return Err(ConsentError::StaleGeneration.into());
        }
        let prepared = self.prepared.as_ref().ok_or(ConsentError::WrongSession)?;
        if receipt.session_id != prepared.session_id || issued.session_id != prepared.session_id {
            return Err(ConsentError::WrongSession.into());
        }
        let now = self.clock.now_ms();
        if now >= receipt.expires_at_ms || now >= issued.expires_at_ms {
            return Err(ConsentError::Expired.into());
        }
        if receipt.monitor_id != issued.monitor_id {
            return Err(ConsentError::MonitorMismatch.into());
        }
        if receipt != issued {
            return Err(ConsentError::Tampered.into());
        }
        let monitor = self.adapter.stage_monitor()?;
        if monitor.id != receipt.monitor_id {
            return Err(ConsentError::MonitorMismatch.into());
        }
        Ok(monitor)
    }

    /// Begin the consented session and displace approved windows with eased,
    /// journaled steps. See the module docs for wallpaper sequencing.
    pub fn enter(
        &mut self,
        receipt: &ConsentReceipt,
        variant: VariantId,
    ) -> Result<EnterReport, BrokerError> {
        if self.closing {
            return Err(BrokerError::Closing);
        }
        if let Some(active) = &self.active {
            if active.receipt.receipt_id == receipt.receipt_id {
                if active.receipt != *receipt {
                    return Err(ConsentError::Tampered.into());
                }
                return Ok(EnterReport::new(EnterOutcome::AlreadyEntered));
            }
        }
        let monitor = self.validate_for_enter(receipt)?;
        if self.active.is_some() || !self.journal.load()?.is_empty() {
            return Err(BrokerError::EffectsOutstanding);
        }
        let scene = self
            .prepared
            .as_ref()
            .map(|p| p.scene)
            .ok_or(BrokerError::NotPrepared)?;

        let mut report = EnterReport::new(EnterOutcome::Entered);
        let eligible = if receipt.windows {
            let eligible = self.eligible_windows(&monitor.id, Some(&mut report))?;
            let count = eligible.len() as u32;
            if count > receipt.approved_window_count {
                return Err(ConsentError::ApprovedCountTooLow {
                    approved: receipt.approved_window_count,
                    eligible: count,
                }
                .into());
            }
            eligible
        } else {
            report.degraded.push(DegradedReason::WindowsNotConsented);
            Vec::new()
        };

        if self.adapter.desktop_status()? != DesktopStatus::Active {
            return Ok(EnterReport::new(EnterOutcome::Paused));
        }

        // A cancel (e.g. Esc) raised before staging starts wins: nothing is
        // journaled or applied, and the prepared session is discarded.
        if self.cancel.requested().is_some() {
            self.prepared = None;
            return Ok(EnterReport::new(EnterOutcome::Cancelled));
        }
        self.journal.append(&JournalRecord::SessionBegin {
            session_id: receipt.session_id.clone(),
            receipt_id: receipt.receipt_id.clone(),
            generation: receipt.generation,
            monitor: monitor.id.clone(),
            monitor_context: MonitorContext {
                work_area: monitor.work_area,
                dpi: monitor.dpi,
            },
        })?;

        let wallpaper = if !receipt.wallpaper {
            report.degraded.push(DegradedReason::WallpaperNotConsented);
            WallpaperTrack::NotConsented
        } else if !self.adapter.wallpaper_state(&monitor.id)?.is_restorable() {
            report.degraded.push(DegradedReason::WallpaperNotRestorable);
            WallpaperTrack::Degraded(DegradedReason::WallpaperNotRestorable)
        } else if self
            .adapter
            .resolve_asset(&approved_wallpaper_asset(scene, variant))
            .is_err()
        {
            report.degraded.push(DegradedReason::AssetUnavailable);
            WallpaperTrack::Degraded(DegradedReason::AssetUnavailable)
        } else {
            WallpaperTrack::Ready
        };
        if receipt.windows && eligible.is_empty() {
            report.degraded.push(DegradedReason::NoEligibleWindows);
        }

        self.active = Some(Active {
            receipt: receipt.clone(),
            scene,
            monitor: monitor.id.clone(),
            wallpaper,
            next_seq: 0,
        });

        match self.displace(eligible, &monitor, &mut report)? {
            MotionEnd::Completed => {}
            MotionEnd::Paused => report.outcome = EnterOutcome::Paused,
            MotionEnd::Cancelled(mode) => {
                report.outcome = EnterOutcome::Cancelled;
                report.restore = Some(self.restore(mode)?);
            }
        }
        Ok(report)
    }

    fn displace(
        &mut self,
        eligible: Vec<WindowInfo>,
        monitor: &MonitorInfo,
        report: &mut EnterReport,
    ) -> Result<MotionEnd, BrokerError> {
        let count = eligible.len();
        let n = self.config.motion_steps.max(1);
        let active = self.active.as_mut().ok_or(BrokerError::NotEntered)?;
        let mut movers: Vec<Mover> = Vec::with_capacity(count);
        for (i, w) in eligible.into_iter().enumerate() {
            let prior = w.snapshot;
            let original = prior.placement.normal_rect;
            let slot = edge_slot(
                monitor.work_area,
                original,
                i,
                count,
                self.config.edge_strip_px,
            );
            let resized = slot.width() != original.width() || slot.height() != original.height();
            let unsafe_slot = !contains(monitor.work_area, slot)
                || (resized && self.config.parking == ParkingPolicy::RejectIfResizeNeeded);
            if unsafe_slot {
                // Reject rather than force: nothing is journaled or moved.
                report.exclude(ExclusionReason::DoesNotFit);
                continue;
            }
            let target = Placement {
                show_state: ShowState::Normal,
                normal_rect: slot,
                min_position: prior.placement.min_position,
                max_position: prior.placement.max_position,
            };
            movers.push(Mover {
                effect: active.next_effect(),
                identity: w.identity,
                steps: plan_steps(&prior.placement, &target, n),
                expected: prior.placement,
                prior,
                moving: true,
            });
        }

        let adapter = &*self.adapter;
        let journal = &*self.journal;
        for step_idx in 0..n as usize {
            for m in movers.iter_mut().filter(|m| m.moving) {
                // Checked between every individual step.
                if let Some(mode) = self.cancel.requested() {
                    return Ok(MotionEnd::Cancelled(mode));
                }
                if adapter.desktop_status()? != DesktopStatus::Active {
                    return Ok(MotionEnd::Paused);
                }
                match adapter.find_window(&m.identity) {
                    Ok(WindowLookup::Present(s)) if s.placement == m.expected => {}
                    Ok(WindowLookup::Present(_)) => {
                        m.moving = false;
                        report.exclude(ExclusionReason::UserMovedDuringMotion);
                        continue;
                    }
                    Ok(WindowLookup::Gone) | Ok(WindowLookup::HandleReused) => {
                        m.moving = false;
                        report.exclude(ExclusionReason::ClosedDuringMotion);
                        continue;
                    }
                    Err(_) => {
                        m.moving = false;
                        report.exclude(ExclusionReason::MoveFailed);
                        continue;
                    }
                }
                let target = m.steps[step_idx];
                let step = step_idx as u32 + 1;
                // Write-ahead: if this append fails, nothing is applied.
                journal.append(&JournalRecord::WindowStepIntent {
                    effect: m.effect,
                    identity: m.identity.clone(),
                    phase: MotionPhase::Displace,
                    step,
                    steps_total: n,
                    prior: m.prior.clone(),
                    from: m.expected,
                    target,
                })?;
                let set = adapter.set_window_placement(&m.identity, &target);
                let readback = match adapter.find_window(&m.identity) {
                    Ok(WindowLookup::Present(s)) => Some(s),
                    _ => None,
                };
                let landed = readback
                    .as_ref()
                    .filter(|rb| set.is_ok() && rb.placement == target);
                if let Some(rb) = landed {
                    journal.append(&JournalRecord::WindowStepApplied {
                        effect: m.effect,
                        phase: MotionPhase::Displace,
                        step,
                        applied: target,
                        monitor: rb.monitor.clone(),
                        dpi: rb.dpi,
                    })?;
                    m.expected = target;
                } else {
                    journal.append(&JournalRecord::WindowStepFailed {
                        effect: m.effect,
                        phase: MotionPhase::Displace,
                        step,
                        observed: readback,
                    })?;
                    m.moving = false;
                    report.exclude(ExclusionReason::MoveFailed);
                    // Undo this window's earlier steps (same conditional rules).
                    restore_from_journal(
                        adapter,
                        journal,
                        RestoreMode::Emergency,
                        &self.config.restore,
                        Some(m.effect),
                        None,
                    )?;
                }
            }
        }
        report.moved_window_count = movers.iter().filter(|m| m.moving).count() as u32;
        Ok(MotionEnd::Completed)
    }

    /// Apply (or change) the far-field wallpaper for the active session.
    /// Only the stage monitor's image is changed; global position, colour
    /// and enabled state are never written.
    pub fn set_far_field(
        &mut self,
        receipt: &ConsentReceipt,
        variant: VariantId,
    ) -> Result<FarFieldOutcome, BrokerError> {
        if self.closing {
            return Err(BrokerError::Closing);
        }
        let generation = self.generation;
        let revoked = self.revoked.contains(&receipt.receipt_id);
        let known = self.issued.contains_key(&receipt.receipt_id);
        let active = self.active.as_mut().ok_or(BrokerError::NotEntered)?;
        if !known {
            return Err(ConsentError::UnknownReceipt.into());
        }
        if receipt.receipt_id != active.receipt.receipt_id {
            return Err(ConsentError::WrongSession.into());
        }
        if *receipt != active.receipt {
            return Err(ConsentError::Tampered.into());
        }
        if revoked {
            return Err(ConsentError::Revoked.into());
        }
        if receipt.generation < generation {
            return Err(ConsentError::StaleGeneration.into());
        }
        if !receipt.wallpaper {
            return Err(ConsentError::EffectNotConsented(StageEffect::Wallpaper).into());
        }
        match &active.wallpaper {
            WallpaperTrack::NotConsented => {
                return Err(ConsentError::EffectNotConsented(StageEffect::Wallpaper).into())
            }
            WallpaperTrack::Degraded(r) => return Ok(FarFieldOutcome::Degraded(*r)),
            WallpaperTrack::UserChanged => return Ok(FarFieldOutcome::LeftAlone),
            WallpaperTrack::Ready | WallpaperTrack::Owned { .. } => {}
        }
        if self.adapter.desktop_status()? != DesktopStatus::Active {
            return Ok(FarFieldOutcome::Paused);
        }
        let Ok(target_ref) = self
            .adapter
            .resolve_asset(&approved_wallpaper_asset(active.scene, variant))
        else {
            return Ok(FarFieldOutcome::Degraded(DegradedReason::AssetUnavailable));
        };
        let current = self.adapter.wallpaper_state(&active.monitor)?;
        let (effect, prior) = match &active.wallpaper {
            WallpaperTrack::Ready => {
                if !current.is_restorable() {
                    active.wallpaper =
                        WallpaperTrack::Degraded(DegradedReason::WallpaperNotRestorable);
                    return Ok(FarFieldOutcome::Degraded(
                        DegradedReason::WallpaperNotRestorable,
                    ));
                }
                (active.next_effect(), current.clone())
            }
            WallpaperTrack::Owned {
                effect,
                prior,
                last_applied,
                variant: applied_variant,
            } => {
                if current != *last_applied {
                    // Never overwrite a later user change.
                    active.wallpaper = WallpaperTrack::UserChanged;
                    return Ok(FarFieldOutcome::LeftAlone);
                }
                if *applied_variant == variant {
                    return Ok(FarFieldOutcome::NoOp);
                }
                (*effect, prior.clone())
            }
            _ => unreachable!("handled above"),
        };
        let target = WallpaperState {
            reference: Some(target_ref.clone()),
            position: current.position,
            colour: current.colour,
            background_enabled: current.background_enabled,
            kind: crate::adapter::WallpaperKind::Static,
        };
        self.journal.append(&JournalRecord::WallpaperIntent {
            effect,
            monitor: active.monitor.clone(),
            prior: prior.clone(),
            target: target.clone(),
        })?;
        let set = self
            .adapter
            .set_monitor_wallpaper(&active.monitor, &target_ref);
        let readback = self.adapter.wallpaper_state(&active.monitor).ok();
        if set.is_ok() && readback.as_ref() == Some(&target) {
            active.wallpaper = WallpaperTrack::Owned {
                effect,
                prior,
                last_applied: target.clone(),
                variant,
            };
            self.journal.append(&JournalRecord::WallpaperApplied {
                effect,
                applied: target,
            })?;
            Ok(FarFieldOutcome::Applied)
        } else {
            active.wallpaper = WallpaperTrack::Degraded(DegradedReason::WallpaperSetFailed);
            self.journal.append(&JournalRecord::WallpaperFailed {
                effect,
                observed: readback,
            })?;
            Ok(FarFieldOutcome::Degraded(
                DegradedReason::WallpaperSetFailed,
            ))
        }
    }

    /// Conditionally restore everything the journal says EVA owns. Graceful
    /// returns windows with eased steps; Emergency restores immediately.
    /// Serialized with recovery via the shared lock.
    ///
    /// Once called on an active session, the session is *closing*: `enter`
    /// and `set_far_field` fail until a restore clears the journal, even if
    /// this run is incomplete. An emergency request on the cancel handle is
    /// honoured between graceful return steps. On completion the session's
    /// receipts (all of them, not only the entered one) are consumed and the
    /// prepared session is discarded.
    pub fn restore(&mut self, mode: RestoreMode) -> Result<RestoreReport, BrokerError> {
        let lock = Arc::clone(&self.lock);
        let Some(_guard) = LockGuard::try_new(&*lock) else {
            return Err(BrokerError::RestoreInProgress);
        };
        if self.active.is_some() {
            self.closing = true;
        }
        let report = restore_from_journal(
            &*self.adapter,
            &*self.journal,
            mode,
            &self.config.restore,
            None,
            Some(&self.cancel),
        )?;
        if report.is_complete() {
            if let Some(active) = self.active.take() {
                let session = active.receipt.session_id;
                for (id, r) in &self.issued {
                    if r.session_id == session {
                        self.consumed.insert(id.clone());
                    }
                }
                self.prepared = None;
            }
            self.closing = false;
            self.cancel.reset();
        }
        Ok(report)
    }

    /// True while a started restore has not yet cleared the journal.
    pub fn is_closing(&self) -> bool {
        self.closing
    }

    /// Signal cancellation of in-flight motion and discard a prepared session
    /// that has not been entered (its receipts stop working). Does not by
    /// itself restore: use `restore` (Emergency for Esc).
    pub fn cancel(&mut self) {
        self.cancel.cancel();
        if self.active.is_none() {
            self.prepared = None;
        }
    }

    /// Effects currently owned according to the journal (counts only).
    pub fn owned_effect_count(&self) -> Result<usize, BrokerError> {
        let records = self.journal.load()?;
        let ledger = Ledger::from_records(&records).map_err(BrokerError::Ledger)?;
        Ok(ledger
            .wallpapers
            .values()
            .filter(|w| w.terminal.is_none())
            .count()
            + ledger
                .windows
                .values()
                .filter(|w| w.terminal.is_none())
                .count())
    }
}
