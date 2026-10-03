//! Regression tests for the independent review findings (H1, M1, M2, M3).

mod common;
use common::*;
use eva_w4_stage_broker::adapter::{WallpaperKind, WallpaperState, WindowIdentity, WindowSnapshot};
use eva_w4_stage_broker::consent::ConsentError;
use eva_w4_stage_broker::fake::{
    normal, other_monitor_id, rect, stage_monitor_id, synthetic_window,
};
use eva_w4_stage_broker::ids::{SceneId, VariantId};
use eva_w4_stage_broker::journal::{
    EffectId, JournalRecord, LeftAloneReason, MemoryJournal, MonitorContext, MotionPhase,
    RestoreMode, RestoreOutcome,
};
use eva_w4_stage_broker::motion::contains;
use eva_w4_stage_broker::{
    recover, BrokerError, EffectKind, EnterOutcome, FarFieldOutcome, MemoryRecoveryLock,
    RecoveryOutcome, RestoreConfig,
};

fn snapshot(rig: &Rig, hwnd: u64) -> WindowSnapshot {
    rig.fake.with(|d| d.windows[&hwnd].snapshot.clone())
}

/// Windows near the shared edge of a two-monitor desk.
fn edge_windows() -> Vec<eva_w4_stage_broker::adapter::WindowInfo> {
    vec![
        synthetic_window(W1, 201, "notes", rect(1300, 200, 1900, 700)),
        synthetic_window(W2, 202, "folder", rect(1500, 100, 1910, 900)),
        synthetic_window(W3, 203, "notes", rect(100, 600, 900, 1000)),
    ]
}

fn two_monitor_round_trip(mode: RestoreMode) {
    let mut rig = rig(edge_windows());
    let priors: Vec<_> = [W1, W2, W3].iter().map(|h| snapshot(&rig, *h)).collect();
    let (_, report) = rig.enter_all();
    assert_eq!(report.moved_window_count, 3);
    let work = rig.fake.with(|d| d.monitors[0].work_area);
    for hwnd in [W1, W2, W3] {
        let s = snapshot(&rig, hwnd);
        assert_eq!(
            s.monitor,
            stage_monitor_id(),
            "slot stayed on stage monitor"
        );
        assert_eq!(s.dpi, 96);
        assert!(contains(work, s.placement.normal_rect));
    }
    let restore = rig.broker.restore(mode).unwrap();
    assert_eq!(
        restore.outcomes_of(EffectKind::Window),
        vec![RestoreOutcome::Restored; 3],
        "{mode:?}"
    );
    assert!(restore.journal_cleared);
    for (hwnd, prior) in [W1, W2, W3].iter().zip(&priors) {
        assert_eq!(&snapshot(&rig, *hwnd), prior, "{mode:?}");
    }
}

#[test]
fn h1_two_monitor_round_trip_graceful() {
    two_monitor_round_trip(RestoreMode::Graceful);
}

#[test]
fn h1_two_monitor_round_trip_emergency() {
    two_monitor_round_trip(RestoreMode::Emergency);
}

/// A journal in which EVA's own step moved a window onto the other monitor
/// (e.g. an older slot layout, or an OS reassignment). `applied_ctx` is the
/// monitor/DPI recorded on the applied step.
fn cross_monitor_journal(prior: &WindowSnapshot, applied_ctx: (bool, u32)) -> MemoryJournal {
    let target = normal(rect(1800, 200, 2200, 700));
    let effect = EffectId {
        generation: 1,
        seq: 1,
    };
    let identity = WindowIdentity {
        hwnd: W1,
        pid: 201,
        process_start_time: 1_201,
        class_token: Some("class:notes".into()),
    };
    let monitor = if applied_ctx.0 {
        other_monitor_id()
    } else {
        stage_monitor_id()
    };
    MemoryJournal::from_records(vec![
        JournalRecord::SessionBegin {
            session_id: "session-1".into(),
            receipt_id: "receipt-1-1".into(),
            generation: 1,
            monitor: stage_monitor_id(),
            monitor_context: MonitorContext {
                work_area: rect(0, 0, 1920, 1040),
                dpi: 96,
            },
        },
        JournalRecord::WindowStepIntent {
            effect,
            identity,
            phase: MotionPhase::Displace,
            step: 1,
            steps_total: 1,
            prior: prior.clone(),
            from: prior.placement,
            target,
        },
        JournalRecord::WindowStepApplied {
            effect,
            phase: MotionPhase::Displace,
            step: 1,
            applied: target,
            monitor,
            dpi: applied_ctx.1,
        },
    ])
}

#[test]
fn h1_broker_authored_monitor_context_is_owned() {
    let rig = rig(edge_windows());
    let prior = snapshot(&rig, W1);
    // EVA's step left the window mostly on monitor B (fake reassigns by
    // largest overlap, taking B's DPI).
    rig.fake
        .with(|d| d.user_set_placement(W1, normal(rect(1800, 200, 2200, 700))));
    assert_eq!(snapshot(&rig, W1).monitor, other_monitor_id());
    assert_eq!(snapshot(&rig, W1).dpi, 120);

    let journal = cross_monitor_journal(&prior, (true, 120));
    let RecoveryOutcome::Recovered(report) = recover(
        &journal,
        &rig.fake,
        &MemoryRecoveryLock::new(),
        &RestoreConfig::default(),
    )
    .unwrap() else {
        panic!("expected recovery")
    };
    assert_eq!(
        report.outcomes_of(EffectKind::Window),
        vec![RestoreOutcome::Restored]
    );
    assert_eq!(snapshot(&rig, W1), prior, "back on the stage monitor");
}

#[test]
fn h1_unrecorded_monitor_context_is_still_left_alone() {
    // Same window position, but the journal never saw EVA produce monitor B:
    // the move to B is not broker-authored, so it is left alone.
    let rig = rig(edge_windows());
    let prior = snapshot(&rig, W1);
    rig.fake
        .with(|d| d.user_set_placement(W1, normal(rect(1800, 200, 2200, 700))));
    let journal = cross_monitor_journal(&prior, (false, 96));
    let RecoveryOutcome::Recovered(report) = recover(
        &journal,
        &rig.fake,
        &MemoryRecoveryLock::new(),
        &RestoreConfig::default(),
    )
    .unwrap() else {
        panic!()
    };
    assert_eq!(
        report.outcomes_of(EffectKind::Window),
        vec![RestoreOutcome::LeftAlone(LeftAloneReason::UserChanged)]
    );
    assert_eq!(snapshot(&rig, W1).monitor, other_monitor_id());
}

#[test]
fn m1_cancel_requested_before_enter_moves_nothing() {
    for emergency in [false, true] {
        let mut rig = rig(two_windows());
        let receipt = rig.consent(ALL);
        let handle = rig.broker.cancel_handle();
        if emergency {
            handle.emergency();
        } else {
            handle.cancel();
        }
        let report = rig
            .broker
            .enter(&receipt, VariantId::AfternoonClear)
            .unwrap();
        assert_eq!(report.outcome, EnterOutcome::Cancelled);
        assert_eq!(report.moved_window_count, 0);
        assert_eq!(rig.fake.placement_calls(), 0);
        assert!(rig.journal.is_empty(), "nothing journaled");
        assert_eq!(rig.placement(W1), notes(W1, 201).snapshot.placement);
        // The cancelled consent cannot be retried without a new prepare.
        assert!(rig
            .broker
            .enter(&receipt, VariantId::AfternoonClear)
            .is_err());
        assert_eq!(rig.fake.placement_calls(), 0);
        // A fresh prepare starts with a clear token.
        let fresh = rig.consent(ALL);
        assert_eq!(
            rig.broker
                .enter(&fresh, VariantId::AfternoonClear)
                .unwrap()
                .outcome,
            EnterOutcome::Entered
        );
    }
}

#[test]
fn m2_no_new_effects_after_incomplete_esc_restore() {
    let mut rig = rig(two_windows());
    let (receipt, _) = rig.enter_all();
    assert_eq!(
        rig.broker
            .set_far_field(&receipt, VariantId::AfternoonClear)
            .unwrap(),
        FarFieldOutcome::Applied
    );
    rig.fake.with(|d| d.ignore_set_wallpaper = true);
    let restore = rig.broker.restore(RestoreMode::Emergency).unwrap();
    assert_eq!(restore.unresolved(), 1);
    assert!(!restore.journal_cleared);
    assert!(rig.broker.is_closing());

    let calls = (rig.fake.placement_calls(), rig.fake.wallpaper_calls());
    assert_eq!(
        rig.broker
            .set_far_field(&receipt, VariantId::EveningRain)
            .unwrap_err(),
        BrokerError::Closing
    );
    assert_eq!(
        rig.broker
            .enter(&receipt, VariantId::AfternoonClear)
            .unwrap_err(),
        BrokerError::Closing
    );
    assert_eq!(
        (rig.fake.placement_calls(), rig.fake.wallpaper_calls()),
        calls
    );

    // Once the journal clears, the session is over and its receipt spent.
    rig.fake.with(|d| d.ignore_set_wallpaper = false);
    assert!(
        rig.broker
            .restore(RestoreMode::Emergency)
            .unwrap()
            .journal_cleared
    );
    assert!(!rig.broker.is_closing());
    assert_eq!(
        rig.broker
            .enter(&receipt, VariantId::AfternoonClear)
            .unwrap_err(),
        BrokerError::Consent(ConsentError::Consumed)
    );
}

#[test]
fn m2_closing_survives_a_failed_restore() {
    let mut rig = rig(two_windows());
    let (receipt, _) = rig.enter_all();
    rig.journal
        .fail_append_when(|r| matches!(r, JournalRecord::RestoreIntent { .. }));
    assert!(rig.broker.restore(RestoreMode::Emergency).is_err());
    rig.journal.stop_failing();
    assert!(rig.broker.is_closing());
    assert_eq!(
        rig.broker
            .set_far_field(&receipt, VariantId::AfternoonClear)
            .unwrap_err(),
        BrokerError::Closing
    );
}

#[test]
fn m2_every_receipt_of_the_session_is_invalid_after_restore() {
    let mut rig = rig(two_windows());
    rig.broker.prepare(SceneId::ParisTerrace).unwrap();
    let first = rig.broker.issue_consent(ALL).unwrap();
    let second = rig.broker.issue_consent(ALL).unwrap();
    assert_eq!(first.session_id, second.session_id);
    rig.broker.enter(&first, VariantId::AfternoonClear).unwrap();
    assert!(
        rig.broker
            .restore(RestoreMode::Graceful)
            .unwrap()
            .journal_cleared
    );
    let calls = rig.fake.placement_calls();
    assert_eq!(
        rig.broker
            .enter(&second, VariantId::AfternoonClear)
            .unwrap_err(),
        BrokerError::Consent(ConsentError::Consumed)
    );
    assert_eq!(rig.fake.placement_calls(), calls);
}

#[test]
fn m2_intent_after_terminal_result_reopens_the_effect() {
    let rig = rig(two_windows());
    let prior = rig.fake.wallpaper(&stage_monitor_id());
    let paris = |v| WallpaperState {
        reference: Some(rig.fake.catalog_ref(v)),
        kind: WallpaperKind::Static,
        ..prior.clone()
    };
    let effect = EffectId {
        generation: 1,
        seq: 1,
    };
    let (t1, t2) = (
        paris(VariantId::AfternoonClear),
        paris(VariantId::EveningRain),
    );
    let journal = MemoryJournal::from_records(vec![
        JournalRecord::WallpaperIntent {
            effect,
            monitor: stage_monitor_id(),
            prior: prior.clone(),
            target: t1.clone(),
        },
        JournalRecord::WallpaperApplied {
            effect,
            applied: t1,
        },
        JournalRecord::RestoreIntent {
            effect,
            mode: RestoreMode::Emergency,
        },
        JournalRecord::RestoreResult {
            effect,
            outcome: RestoreOutcome::Restored,
        },
        // EVA acted again on the same effect after it was settled.
        JournalRecord::WallpaperIntent {
            effect,
            monitor: stage_monitor_id(),
            prior: prior.clone(),
            target: t2.clone(),
        },
        JournalRecord::WallpaperApplied {
            effect,
            applied: t2.clone(),
        },
    ]);
    rig.fake.with(|d| {
        d.user_set_wallpaper(
            &stage_monitor_id(),
            t2.reference.clone(),
            WallpaperKind::Static,
        )
    });
    let RecoveryOutcome::Recovered(report) = recover(
        &journal,
        &rig.fake,
        &MemoryRecoveryLock::new(),
        &RestoreConfig::default(),
    )
    .unwrap() else {
        panic!()
    };
    assert_eq!(report.already_settled, 0, "ownership not lost");
    assert_eq!(
        report.outcomes_of(EffectKind::Wallpaper),
        vec![RestoreOutcome::Restored]
    );
    assert_eq!(rig.fake.wallpaper(&stage_monitor_id()), prior);
    assert_eq!(rig.fake.wallpaper_calls(), 1);
}

#[test]
fn m3_emergency_during_graceful_return_jumps_to_prior() {
    let mut rig = rig(two_windows());
    rig.enter_all();
    assert_eq!(rig.fake.placement_calls(), 8);
    let handle = rig.broker.cancel_handle();
    let h = handle.clone();
    // Move 10 = W1's second graceful return step.
    rig.fake.on_move(move |n, _| {
        if n == 10 {
            h.emergency();
        }
    });
    let restore = rig.broker.restore(RestoreMode::Graceful).unwrap();
    assert_eq!(restore.restored(), 2);
    assert!(restore.journal_cleared);
    // W1: 2 graceful steps + 1 jump; W2: 1 immediate step (not 6 each).
    assert_eq!(rig.fake.placement_calls(), 8 + 2 + 1 + 1);
    assert_eq!(rig.placement(W1), notes(W1, 201).snapshot.placement);
    assert_eq!(rig.placement(W2), folder(W2, 202).snapshot.placement);
    assert_eq!(handle.requested(), None, "token cleared after completion");
}
