//! Owner consolidation decisions (2026-10-03): parking never resizes user
//! windows by default, fit failures are rejected rather than forced, recovery
//! records keep the original geometry and show state, and a torn final
//! journal record fails closed.

mod common;
use common::*;
use eva_w4_stage_broker::adapter::{Placement, ShowState};
use eva_w4_stage_broker::fake::{normal, rect, stage_monitor_id, synthetic_window};
use eva_w4_stage_broker::ids::VariantId;
use eva_w4_stage_broker::journal::{
    from_json_lines, to_json_lines, JournalParseErrorKind, JournalRecord, MemoryJournal,
    MotionPhase, RestoreMode,
};
use eva_w4_stage_broker::motion::contains;
use eva_w4_stage_broker::{
    recover, BrokerConfig, EnterOutcome, ExclusionReason, MemoryRecoveryLock, ParkingPolicy,
    RecoveryOutcome, RestoreConfig,
};

fn default_parking() -> BrokerConfig {
    BrokerConfig {
        parking: ParkingPolicy::RejectIfResizeNeeded,
        ..config()
    }
}

/// 200 x 300 px: fits the 240 px column without resizing.
fn narrow(hwnd: u64, pid: u32, left: i32) -> eva_w4_stage_broker::adapter::WindowInfo {
    synthetic_window(hwnd, pid, "notes", rect(left, 200, left + 200, 500))
}

const STAGE_WORK: eva_w4_stage_broker::adapter::Rect = eva_w4_stage_broker::adapter::Rect {
    left: 0,
    top: 0,
    right: 1920,
    bottom: 1040,
};

#[test]
fn default_policy_is_reject_if_resize_needed() {
    assert_eq!(
        BrokerConfig::default().parking,
        ParkingPolicy::RejectIfResizeNeeded
    );
}

#[test]
fn default_policy_rejects_windows_that_would_need_resizing() {
    // The shared synthetic windows are 600 px wide: wider than the column.
    let mut rig = rig_with(default_parking(), two_windows());
    let (_, report) = rig.enter_all();
    assert_eq!(report.outcome, EnterOutcome::Entered);
    assert_eq!(report.moved_window_count, 0);
    assert_eq!(report.excluded_for(ExclusionReason::DoesNotFit), 2);
    // Rejected, not forced: no journaled intent, no OS call, geometry intact.
    assert_eq!(rig.fake.placement_calls(), 0);
    assert!(!rig
        .journal
        .records()
        .iter()
        .any(|r| matches!(r, JournalRecord::WindowStepIntent { .. })));
    assert_eq!(rig.placement(W1), notes(W1, 201).snapshot.placement);
    assert_eq!(rig.placement(W2), folder(W2, 202).snapshot.placement);
}

#[test]
fn default_policy_parks_a_fitting_window_without_resizing_or_spilling() {
    let mut rig = rig_with(
        default_parking(),
        vec![narrow(W1, 201, 500), narrow(W2, 202, 900)],
    );
    let original = [rig.placement(W1), rig.placement(W2)];
    let (_, report) = rig.enter_all();
    assert_eq!(report.moved_window_count, 2);
    for (hwnd, orig) in [(W1, original[0]), (W2, original[1])] {
        let now = rig.placement(hwnd).normal_rect;
        assert_eq!(now.width(), orig.normal_rect.width(), "never resized");
        assert_eq!(now.height(), orig.normal_rect.height(), "never resized");
        assert!(contains(STAGE_WORK, now), "inside the stage monitor");
        let mon = rig.fake.with(|d| d.windows[&hwnd].snapshot.monitor.clone());
        assert_eq!(mon, stage_monitor_id(), "no spill onto another monitor");
    }
    // Every journaled step stays inside the stage monitor.
    for r in rig.journal.records() {
        if let JournalRecord::WindowStepIntent { target, .. } = r {
            assert!(contains(STAGE_WORK, target.normal_rect));
        }
    }
    let restore = rig.broker.restore(RestoreMode::Graceful).unwrap();
    assert_eq!(restore.restored(), 2);
    assert_eq!(rig.placement(W1), original[0]);
    assert_eq!(rig.placement(W2), original[1]);
}

#[test]
fn minimum_size_fit_failure_is_rejected_and_undone() {
    // Mock policy shrinks windows; an application minimum size defeats that.
    let mut rig = rig(two_windows());
    rig.fake.with(|d| {
        d.min_size.insert(W1, (500, 400));
    });
    let (_, report) = rig.enter_all();
    assert_eq!(report.excluded_for(ExclusionReason::MoveFailed), 1);
    assert_eq!(report.moved_window_count, 1);
    // W1's partial steps were undone immediately; it is back where it was.
    assert_eq!(rig.placement(W1), notes(W1, 201).snapshot.placement);
    let restore = rig.broker.restore(RestoreMode::Emergency).unwrap();
    assert!(restore.journal_cleared);
    assert_eq!(rig.placement(W2), folder(W2, 202).snapshot.placement);
}

#[test]
fn cancel_mid_move_under_default_policy_restores_original_geometry() {
    let mut rig = rig_with(
        default_parking(),
        vec![narrow(W1, 201, 500), narrow(W2, 202, 900)],
    );
    let original = [rig.placement(W1), rig.placement(W2)];
    let cancel = rig.broker.cancel_handle();
    rig.fake.on_move(move |n, _| {
        if n == 3 {
            cancel.cancel();
        }
    });
    let (_, report) = rig.enter_all();
    assert_eq!(report.outcome, EnterOutcome::Cancelled);
    let restore = report.restore.expect("restored on cancel");
    assert!(restore.journal_cleared);
    assert_eq!(rig.placement(W1), original[0]);
    assert_eq!(rig.placement(W2), original[1]);
}

#[test]
fn recovery_records_keep_original_geometry_and_show_state() {
    let mut maximized = narrow(W1, 201, 500);
    maximized.snapshot.placement = Placement {
        show_state: ShowState::Maximized,
        ..normal(rect(500, 200, 700, 500))
    };
    let original = maximized.snapshot.clone();
    let mut rig = rig_with(default_parking(), vec![maximized]);
    let (_, report) = rig.enter_all();
    assert_eq!(report.moved_window_count, 1);
    let records = rig.journal.records();
    let prior = records
        .iter()
        .find_map(|r| match r {
            JournalRecord::WindowStepIntent {
                phase: MotionPhase::Displace,
                prior,
                ..
            } => Some(prior.clone()),
            _ => None,
        })
        .expect("intent journaled");
    assert_eq!(
        prior, original,
        "full placement, show state, monitor and DPI"
    );

    // Simulated crash: recover from the serialized journal alone.
    let leftover = MemoryJournal::from_records(from_json_lines(&to_json_lines(&records)).unwrap());
    let out = recover(
        &leftover,
        &rig.fake,
        &MemoryRecoveryLock::new(),
        &RestoreConfig::default(),
    )
    .unwrap();
    let RecoveryOutcome::Recovered(rep) = out else {
        panic!("expected recovery, got {out:?}")
    };
    assert_eq!(rep.restored(), 1);
    assert_eq!(rig.placement(W1), original.placement);
    assert_eq!(rig.placement(W1).show_state, ShowState::Maximized);
}

#[test]
fn torn_final_journal_record_fails_closed() {
    let mut rig = rig(two_windows());
    let (receipt, _) = rig.enter_all();
    rig.broker
        .set_far_field(&receipt, VariantId::AfternoonClear)
        .unwrap();
    let text = to_json_lines(&rig.journal.records());
    let intact = from_json_lines(&text).expect("intact journal parses");
    assert!(intact.len() > 3);

    // Fault injection: the final record was cut off mid-write by a crash.
    let body = text.trim_end_matches('\n');
    let last_start = body.rfind('\n').map(|i| i + 1).unwrap_or(0);
    let torn = &body[..last_start + (body.len() - last_start) / 2];
    let calls_before = (rig.fake.placement_calls(), rig.fake.wallpaper_calls());
    let err = from_json_lines(torn).expect_err("torn record must not parse");
    assert_eq!(err.kind, JournalParseErrorKind::Malformed);
    assert_eq!(
        err.line,
        intact.len(),
        "the error names the torn final line"
    );
    // No record is dropped, replayed or partially recovered, and the desktop
    // is untouched: recovery cannot even start from an ambiguous journal.
    assert_eq!(
        (rig.fake.placement_calls(), rig.fake.wallpaper_calls()),
        calls_before
    );
    // A trailing newline cut after the last complete record is not torn.
    let complete_prefix = &body[..last_start];
    assert_eq!(
        from_json_lines(complete_prefix).unwrap().len(),
        intact.len() - 1
    );
}
