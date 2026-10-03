//! Window motion, cancellation, failures and conditional window restore.

mod common;
use common::*;
use eva_w4_stage_broker::adapter::{DesktopStatus, WindowIdentity};
use eva_w4_stage_broker::fake::rect;
use eva_w4_stage_broker::ids::VariantId;
use eva_w4_stage_broker::journal::{
    GoneReason, JournalRecord, LeftAloneReason, RestoreMode, RestoreOutcome, UnresolvedReason,
};
use eva_w4_stage_broker::{EffectKind, EnterOutcome, ExclusionReason};

#[test]
fn full_round_trip_restores_windows_gracefully() {
    let mut rig = rig(two_windows());
    let (_, report) = rig.enter_all();
    assert_eq!(report.outcome, EnterOutcome::Entered);
    assert_eq!(report.moved_window_count, 2);
    // 4 eased steps per window, each journaled.
    assert_eq!(rig.fake.placement_calls(), 8);
    // Edge columns 240 px wide, inside the stage monitor's work area.
    let w1_slot = rig.placement(W1);
    assert_eq!(
        (w1_slot.normal_rect.left, w1_slot.normal_rect.right),
        (0, 240)
    );
    let w2_slot = rig.placement(W2);
    assert_eq!(
        (w2_slot.normal_rect.left, w2_slot.normal_rect.right),
        (1920 - 240, 1920)
    );

    let restore = rig.broker.restore(RestoreMode::Graceful).unwrap();
    assert_eq!(restore.restored(), 2);
    assert!(restore.journal_cleared);
    assert!(rig.journal.is_empty());
    assert_eq!(rig.placement(W1), notes(W1, 201).snapshot.placement);
    assert_eq!(rig.placement(W2), folder(W2, 202).snapshot.placement);
    // Graceful return is animated: 6 return steps per window by default.
    assert_eq!(rig.fake.placement_calls(), 8 + 12);
}

#[test]
fn emergency_restore_uses_no_animation_steps() {
    let mut rig = rig(two_windows());
    rig.enter_all();
    let before = rig.fake.placement_calls();
    let restore = rig.broker.restore(RestoreMode::Emergency).unwrap();
    assert_eq!(restore.restored(), 2);
    assert_eq!(
        rig.fake.placement_calls() - before,
        2,
        "one step per window"
    );
}

#[test]
fn partial_move_failure() {
    let mut rig = rig(vec![notes(W1, 201), folder(W2, 202), notes(W3, 203)]);
    // Moves 1..3 are step 1 for W1, W2, W3. After move 4 (W1 step 2), W2's
    // next move fails once.
    rig.fake.on_move(|n, d| {
        if n == 4 {
            d.fail_next_placement.insert(W2);
        }
    });
    let (_, report) = rig.enter_all();
    assert_eq!(report.outcome, EnterOutcome::Entered);
    assert_eq!(report.moved_window_count, 2);
    assert_eq!(report.excluded_for(ExclusionReason::MoveFailed), 1);
    // W2's earlier step was undone; others continued to their slots.
    assert_eq!(rig.placement(W2), folder(W2, 202).snapshot.placement);
    assert_ne!(rig.placement(W1), notes(W1, 201).snapshot.placement);
    assert_ne!(rig.placement(W3), notes(W3, 203).snapshot.placement);
    let records = rig.journal.records();
    assert!(records
        .iter()
        .any(|r| matches!(r, JournalRecord::WindowStepFailed { .. })));
    assert!(records.iter().any(|r| matches!(
        r,
        JournalRecord::RestoreResult {
            outcome: RestoreOutcome::Restored,
            ..
        }
    )));

    let restore = rig.broker.restore(RestoreMode::Graceful).unwrap();
    assert_eq!(restore.restored(), 2);
    assert_eq!(restore.already_settled, 1, "W2 already restored");
    assert!(restore.journal_cleared);
}

#[test]
fn cancel_during_displacement() {
    let mut rig = rig(two_windows());
    let cancel = rig.broker.cancel_handle();
    rig.fake.on_move(move |n, _| {
        if n == 3 {
            cancel.cancel();
        }
    });
    let (_, report) = rig.enter_all();
    assert_eq!(report.outcome, EnterOutcome::Cancelled);
    // Moves stopped after the third; nothing reached its slot.
    let restore = report.restore.expect("restored on cancel");
    assert_eq!(restore.mode, RestoreMode::Graceful);
    assert_eq!(restore.restored(), 2);
    assert!(restore.journal_cleared);
    assert_eq!(rig.placement(W1), notes(W1, 201).snapshot.placement);
    assert_eq!(rig.placement(W2), folder(W2, 202).snapshot.placement);
    let displace_moves = 3;
    let return_moves = rig.fake.placement_calls() - displace_moves;
    assert_eq!(return_moves, 12, "graceful return steps");
}

#[test]
fn emergency_cancel_during_displacement_restores_immediately() {
    let mut rig = rig(two_windows());
    let cancel = rig.broker.cancel_handle();
    rig.fake.on_move(move |n, _| {
        if n == 3 {
            cancel.emergency();
        }
    });
    let (_, report) = rig.enter_all();
    assert_eq!(report.outcome, EnterOutcome::Cancelled);
    let restore = report.restore.unwrap();
    assert_eq!(restore.mode, RestoreMode::Emergency);
    assert_eq!(restore.restored(), 2);
    assert_eq!(rig.fake.placement_calls(), 3 + 2, "no animation steps");
    assert_eq!(rig.placement(W1), notes(W1, 201).snapshot.placement);
}

#[test]
fn reused_window_handle() {
    let mut rig = rig(two_windows());
    rig.enter_all();
    // W1 closes; the OS recycles its handle for an unrelated window.
    let impostor = {
        let mut w = notes(W1, 999);
        w.identity = WindowIdentity {
            hwnd: W1,
            pid: 999,
            process_start_time: 77,
            class_token: Some("class:notes".into()),
        };
        w.snapshot.placement.normal_rect = rect(50, 50, 450, 450);
        w
    };
    rig.fake.with(|d| {
        d.close_window(W1);
        d.add_window(impostor.clone());
    });
    let before = rig.fake.placement_calls();
    let restore = rig.broker.restore(RestoreMode::Graceful).unwrap();
    let outcomes = restore.outcomes_of(EffectKind::Window);
    assert!(outcomes.contains(&RestoreOutcome::Gone(GoneReason::HandleReused)));
    assert_eq!(
        rig.placement(W1),
        impostor.snapshot.placement,
        "never acted on"
    );
    // Only W2's return steps were performed.
    assert_eq!(rig.fake.placement_calls() - before, 6);
    assert!(restore.journal_cleared);
}

#[test]
fn window_closed_before_restore() {
    let mut rig = rig(two_windows());
    rig.enter_all();
    rig.fake.with(|d| d.close_window(W1));
    let restore = rig.broker.restore(RestoreMode::Emergency).unwrap();
    assert_eq!(restore.gone(), 1);
    assert_eq!(restore.restored(), 1);
    assert!(restore
        .outcomes_of(EffectKind::Window)
        .contains(&RestoreOutcome::Gone(GoneReason::Closed)));
    assert!(restore.journal_cleared);
}

#[test]
fn user_moved_window_later() {
    let mut rig = rig(two_windows());
    rig.enter_all();
    let mut user = rig.placement(W1);
    user.normal_rect = rect(300, 300, 700, 700);
    rig.fake.with(|d| d.user_set_placement(W1, user));
    let restore = rig.broker.restore(RestoreMode::Graceful).unwrap();
    assert!(restore
        .outcomes_of(EffectKind::Window)
        .contains(&RestoreOutcome::LeftAlone(LeftAloneReason::UserChanged)));
    assert_eq!(rig.placement(W1), user, "user's placement preserved");
    assert_eq!(rig.placement(W2), folder(W2, 202).snapshot.placement);
    assert!(restore.journal_cleared);
}

#[test]
fn user_interference_mid_motion_stops_that_window() {
    let mut rig = rig(two_windows());
    let grabbed = rect(10, 10, 410, 410);
    rig.fake.on_move(move |n, d| {
        if n == 3 {
            let mut p = d.placement_of(W2).unwrap();
            p.normal_rect = grabbed;
            d.user_set_placement(W2, p);
        }
    });
    let (_, report) = rig.enter_all();
    assert_eq!(report.moved_window_count, 1);
    assert_eq!(
        report.excluded_for(ExclusionReason::UserMovedDuringMotion),
        1
    );
    assert_eq!(rig.placement(W2).normal_rect, grabbed);
    let restore = rig.broker.restore(RestoreMode::Graceful).unwrap();
    assert_eq!(restore.left_alone(), 1);
    assert_eq!(rig.placement(W2).normal_rect, grabbed);
}

#[test]
fn monitor_dpi_change_leaves_window_alone() {
    let mut rig = rig(two_windows());
    rig.enter_all();
    rig.fake
        .with(|d| d.windows.get_mut(&W1).unwrap().snapshot.dpi = 144);
    let restore = rig.broker.restore(RestoreMode::Graceful).unwrap();
    assert!(restore
        .outcomes_of(EffectKind::Window)
        .contains(&RestoreOutcome::LeftAlone(
            LeftAloneReason::MonitorContextChanged
        )));
}

#[test]
fn restore_verification_mismatch() {
    let mut rig = rig(two_windows());
    rig.enter_all();
    rig.fake.with(|d| {
        d.drift_placement.insert(W1);
    });
    let restore = rig.broker.restore(RestoreMode::Emergency).unwrap();
    assert!(restore
        .outcomes_of(EffectKind::Window)
        .contains(&RestoreOutcome::Unresolved(
            UnresolvedReason::VerifyMismatch
        )));
    assert_eq!(restore.restored(), 1);
    assert!(!restore.journal_cleared, "unresolved entry retained");
    assert!(!rig.journal.is_empty());
    assert_eq!(rig.broker.owned_effect_count().unwrap(), 1);

    // Retry after the fault clears: the observed drifted placement is known
    // to be EVA's own result, so the retry restores instead of misreporting
    // a user change. W2 is not touched again.
    rig.fake.with(|d| {
        d.drift_placement.clear();
    });
    let before = rig.fake.placement_calls();
    let retry = rig.broker.restore(RestoreMode::Emergency).unwrap();
    assert_eq!(retry.restored(), 1);
    assert_eq!(retry.already_settled, 1);
    assert_eq!(rig.fake.placement_calls() - before, 1);
    assert!(retry.journal_cleared);
    assert_eq!(rig.placement(W1), notes(W1, 201).snapshot.placement);
}

#[test]
fn session_locked_pauses() {
    let mut rig = rig(two_windows());
    // Locked at enter: nothing applied, nothing journaled.
    rig.fake.with(|d| d.status = DesktopStatus::Locked);
    let receipt = rig.consent(ALL);
    let report = rig
        .broker
        .enter(&receipt, VariantId::AfternoonClear)
        .unwrap();
    assert_eq!(report.outcome, EnterOutcome::Paused);
    assert_eq!(rig.fake.placement_calls(), 0);
    assert!(rig.journal.is_empty());

    // Secure desktop (UAC) appears mid-motion: stop.
    rig.fake.with(|d| d.status = DesktopStatus::Active);
    rig.fake.on_move(|n, d| {
        if n == 3 {
            d.status = DesktopStatus::SecureDesktop;
        }
    });
    let report = rig
        .broker
        .enter(&receipt, VariantId::AfternoonClear)
        .unwrap();
    assert_eq!(report.outcome, EnterOutcome::Paused);
    assert_eq!(rig.fake.placement_calls(), 3);
    rig.fake.clear_move_hook();

    // Wallpaper is also paused.
    assert_eq!(
        rig.broker
            .set_far_field(&receipt, VariantId::AfternoonClear)
            .unwrap(),
        eva_w4_stage_broker::FarFieldOutcome::Paused
    );
    assert_eq!(rig.fake.wallpaper_calls(), 0);

    // Restore while paused is deferred, not faked.
    let restore = rig.broker.restore(RestoreMode::Emergency).unwrap();
    assert!(restore.paused);
    assert_eq!(restore.deferred(), 2);
    assert_eq!(restore.restored(), 0);
    assert!(!restore.journal_cleared);
    assert_eq!(rig.fake.placement_calls(), 3);
    // The session is closing: no new effects even though restore deferred.
    assert_eq!(
        rig.broker
            .set_far_field(&receipt, VariantId::AfternoonClear)
            .unwrap_err(),
        eva_w4_stage_broker::BrokerError::Closing
    );

    rig.fake.with(|d| d.status = DesktopStatus::Active);
    let restore = rig.broker.restore(RestoreMode::Emergency).unwrap();
    assert_eq!(restore.restored(), 2);
    assert!(restore.journal_cleared);
    assert_eq!(rig.placement(W1), notes(W1, 201).snapshot.placement);
}
