//! Crash recovery from a leftover (serialized) journal and recovery locking.

mod common;
use common::*;
use eva_w4_stage_broker::fake::{rect, stage_monitor_id};
use eva_w4_stage_broker::ids::VariantId;
use eva_w4_stage_broker::journal::{
    from_json_lines, to_json_lines, JournalRecord, LeftAloneReason, MemoryJournal, MotionPhase,
    RestoreMode, RestoreOutcome,
};
use eva_w4_stage_broker::recovery::RecoveryLock;
use eva_w4_stage_broker::{
    recover, BrokerError, EffectKind, MemoryRecoveryLock, RecoveryOutcome, RestoreConfig,
};
use std::sync::Arc;

/// Run a session that "crashes" right after W1's 3rd displacement step was
/// applied by the OS but before it was marked applied. Returns the rig and
/// the serialized leftover journal.
fn crashed_session() -> (Rig, String) {
    let mut rig = rig(two_windows());
    let receipt = rig.consent(ALL);
    rig.journal.fail_append_when(|r| {
        matches!(
            r,
            JournalRecord::WindowStepApplied {
                phase: MotionPhase::Displace,
                step: 3,
                ..
            }
        )
    });
    let err = rig
        .broker
        .enter(&receipt, VariantId::AfternoonClear)
        .unwrap_err();
    assert!(matches!(err, BrokerError::Journal(_)));
    let text = to_json_lines(&rig.journal.records());
    (rig, text)
}

#[test]
fn interrupted_move_recovery() {
    // (a) The OS applied the interrupted step: window is at the intended step.
    let (rig, text) = crashed_session();
    let records = from_json_lines(&text).unwrap();
    let (_, step3_target) = displace_intent(&records, W1, 3);
    assert_eq!(rig.placement(W1), step3_target);
    let leftover = MemoryJournal::from_records(records);
    let out = recover(
        &leftover,
        &rig.fake,
        &MemoryRecoveryLock::new(),
        &RestoreConfig::default(),
    )
    .unwrap();
    let RecoveryOutcome::Recovered(report) = out else {
        panic!("expected recovery, got {out:?}")
    };
    assert_eq!(report.mode, RestoreMode::Emergency);
    assert_eq!(report.restored(), 2);
    assert!(report.journal_cleared);
    assert!(leftover.is_empty());
    assert_eq!(rig.placement(W1), notes(W1, 201).snapshot.placement);
    assert_eq!(rig.placement(W2), folder(W2, 202).snapshot.placement);

    // (b) The crash happened before the OS moved it: window is at the
    // pre-step placement, which is also broker-owned.
    let (rig, text) = crashed_session();
    let records = from_json_lines(&text).unwrap();
    let (step3_from, _) = displace_intent(&records, W1, 3);
    rig.fake.with(|d| d.user_set_placement(W1, step3_from));
    let leftover = MemoryJournal::from_records(records);
    let out = recover(
        &leftover,
        &rig.fake,
        &MemoryRecoveryLock::new(),
        &RestoreConfig::default(),
    )
    .unwrap();
    let RecoveryOutcome::Recovered(report) = out else {
        panic!()
    };
    assert_eq!(report.restored(), 2);
    assert_eq!(rig.placement(W1), notes(W1, 201).snapshot.placement);

    // (c) Anything else is a user change and is left alone.
    let (rig, text) = crashed_session();
    let mut user = rig.placement(W1);
    user.normal_rect = rect(5, 5, 205, 205);
    rig.fake.with(|d| d.user_set_placement(W1, user));
    let leftover = MemoryJournal::from_records(from_json_lines(&text).unwrap());
    let RecoveryOutcome::Recovered(report) = recover(
        &leftover,
        &rig.fake,
        &MemoryRecoveryLock::new(),
        &RestoreConfig::default(),
    )
    .unwrap() else {
        panic!()
    };
    assert!(report
        .outcomes_of(EffectKind::Window)
        .contains(&RestoreOutcome::LeftAlone(LeftAloneReason::UserChanged)));
    assert_eq!(rig.placement(W1), user);
}

#[test]
fn interrupted_wallpaper_recovery() {
    let mut rig = rig(two_windows());
    let (receipt, _) = rig.enter_all();
    let original = rig.fake.wallpaper(&stage_monitor_id());
    rig.journal
        .fail_append_when(|r| matches!(r, JournalRecord::WallpaperApplied { .. }));
    assert!(rig
        .broker
        .set_far_field(&receipt, VariantId::AfternoonClear)
        .is_err());
    let leftover = MemoryJournal::from_records(
        from_json_lines(&to_json_lines(&rig.journal.records())).unwrap(),
    );
    let RecoveryOutcome::Recovered(report) = recover(
        &leftover,
        &rig.fake,
        &MemoryRecoveryLock::new(),
        &RestoreConfig::default(),
    )
    .unwrap() else {
        panic!()
    };
    assert_eq!(
        report.outcomes_of(EffectKind::Wallpaper),
        vec![RestoreOutcome::Restored]
    );
    assert_eq!(rig.fake.wallpaper(&stage_monitor_id()), original);
}

#[test]
fn competing_watchdog_recovery() {
    let (rig, text) = crashed_session();
    let leftover = MemoryJournal::from_records(from_json_lines(&text).unwrap());
    let shared_lock = MemoryRecoveryLock::new();
    let cfg = RestoreConfig::default();

    // The watchdog holds the lock: the app's recovery does nothing.
    assert!(shared_lock.try_acquire());
    let before = rig.fake.placement_calls();
    assert_eq!(
        recover(&leftover, &rig.fake, &shared_lock, &cfg).unwrap(),
        RecoveryOutcome::AlreadyInProgress
    );
    assert_eq!(rig.fake.placement_calls(), before);
    assert!(!leftover.is_empty());

    // The live broker's restore is serialized by the same lock.
    let mut rig = rig;
    let broker_lock_held = rig.lock.try_acquire();
    assert!(broker_lock_held);
    assert_eq!(
        rig.broker.restore(RestoreMode::Emergency).unwrap_err(),
        BrokerError::RestoreInProgress
    );
    rig.lock.release();

    // Watchdog finishes (simulated by releasing and recovering once).
    shared_lock.release();
    let RecoveryOutcome::Recovered(report) =
        recover(&leftover, &rig.fake, &shared_lock, &cfg).unwrap()
    else {
        panic!()
    };
    assert_eq!(report.restored(), 2);
    assert!(!shared_lock.is_held(), "lock released after recovery");

    // Running recovery again after completion is a no-op.
    let calls = rig.fake.placement_calls();
    assert_eq!(
        recover(&leftover, &rig.fake, &shared_lock, &cfg).unwrap(),
        RecoveryOutcome::NothingToRecover
    );
    assert_eq!(rig.fake.placement_calls(), calls);
}

#[test]
fn competing_recovery_threads_restore_once() {
    let (rig, text) = crashed_session();
    let leftover = Arc::new(MemoryJournal::from_records(from_json_lines(&text).unwrap()));
    let lock = MemoryRecoveryLock::new();
    let before = rig.fake.placement_calls();
    let handles: Vec<_> = (0..2)
        .map(|_| {
            let (j, f, l) = (leftover.clone(), rig.fake.clone(), lock.clone());
            std::thread::spawn(move || recover(&*j, &f, &l, &RestoreConfig::default()).unwrap())
        })
        .collect();
    let outcomes: Vec<RecoveryOutcome> = handles.into_iter().map(|h| h.join().unwrap()).collect();
    let recovered = outcomes
        .iter()
        .filter(|o| matches!(o, RecoveryOutcome::Recovered(_)))
        .count();
    assert_eq!(recovered, 1, "{outcomes:?}");
    assert!(outcomes.iter().all(|o| matches!(
        o,
        RecoveryOutcome::Recovered(_)
            | RecoveryOutcome::AlreadyInProgress
            | RecoveryOutcome::NothingToRecover
    )));
    // Exactly one emergency step per window.
    assert_eq!(rig.fake.placement_calls() - before, 2);
    assert_eq!(rig.placement(W1), notes(W1, 201).snapshot.placement);
}

#[test]
fn duplicate_restore_idempotent() {
    let mut rig = rig(two_windows());
    let (receipt, _) = rig.enter_all();
    rig.broker
        .set_far_field(&receipt, VariantId::AfternoonClear)
        .unwrap();
    let first = rig.broker.restore(RestoreMode::Graceful).unwrap();
    assert_eq!(first.restored(), 3);
    assert!(first.journal_cleared);
    let (p, w) = (rig.fake.placement_calls(), rig.fake.wallpaper_calls());

    let second = rig.broker.restore(RestoreMode::Graceful).unwrap();
    assert!(second.nothing_to_restore);
    assert!(second.outcomes.is_empty());
    let third = rig.broker.restore(RestoreMode::Emergency).unwrap();
    assert!(third.nothing_to_restore);
    assert_eq!(
        (rig.fake.placement_calls(), rig.fake.wallpaper_calls()),
        (p, w)
    );
    // Recovery after a completed restore is also a no-op.
    assert_eq!(
        recover(
            &rig.journal,
            &rig.fake,
            &rig.lock,
            &RestoreConfig::default()
        )
        .unwrap(),
        RecoveryOutcome::NothingToRecover
    );
}
