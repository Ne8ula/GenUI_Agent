//! Consent receipt and session ownership checks.

mod common;
use common::*;
use eva_w4_stage_broker::consent::{ConsentChoices, ConsentError, StageEffect};
use eva_w4_stage_broker::fake::{other_monitor_id, stage_monitor_id};
use eva_w4_stage_broker::ids::{SceneId, VariantId};
use eva_w4_stage_broker::journal::RestoreMode;
use eva_w4_stage_broker::{BrokerError, EnterOutcome, FarFieldOutcome};

fn consent_err(e: BrokerError) -> ConsentError {
    match e {
        BrokerError::Consent(c) => c,
        other => panic!("expected consent error, got {other:?}"),
    }
}

fn assert_nothing_happened(rig: &Rig) {
    assert_eq!(rig.fake.placement_calls(), 0);
    assert_eq!(rig.fake.wallpaper_calls(), 0);
    assert!(rig.journal.is_empty());
}

#[test]
fn consent_wrong_session() {
    let mut rig = rig(two_windows());
    let mut receipt = rig.consent(ALL);
    receipt.session_id = "session-999".into();
    let e = rig
        .broker
        .enter(&receipt, VariantId::AfternoonClear)
        .unwrap_err();
    assert_eq!(consent_err(e), ConsentError::WrongSession);
    assert_nothing_happened(&rig);
}

#[test]
fn consent_stale_generation() {
    let mut rig = rig(two_windows());
    let old = rig.consent(ALL);
    let _newer = rig.consent(ALL); // re-prepare supersedes
    let e = rig
        .broker
        .enter(&old, VariantId::AfternoonClear)
        .unwrap_err();
    assert_eq!(consent_err(e), ConsentError::StaleGeneration);
    assert_nothing_happened(&rig);
}

#[test]
fn consent_expired() {
    let mut rig = rig(two_windows());
    let receipt = rig.consent(ALL);
    rig.clock.advance(120_000);
    let e = rig
        .broker
        .enter(&receipt, VariantId::AfternoonClear)
        .unwrap_err();
    assert_eq!(consent_err(e), ConsentError::Expired);
    assert_nothing_happened(&rig);
}

#[test]
fn consent_revoked() {
    let mut rig = rig(two_windows());
    let receipt = rig.consent(ALL);
    rig.broker.revoke(&receipt.receipt_id);
    let e = rig
        .broker
        .enter(&receipt, VariantId::AfternoonClear)
        .unwrap_err();
    assert_eq!(consent_err(e), ConsentError::Revoked);
    assert_nothing_happened(&rig);

    // Revoking during a session blocks further wallpaper changes.
    let receipt = rig.consent(ALL);
    rig.broker
        .enter(&receipt, VariantId::AfternoonClear)
        .unwrap();
    rig.broker.revoke(&receipt.receipt_id);
    let before = rig.fake.wallpaper_calls();
    let e = rig
        .broker
        .set_far_field(&receipt, VariantId::AfternoonClear)
        .unwrap_err();
    assert_eq!(consent_err(e), ConsentError::Revoked);
    assert_eq!(rig.fake.wallpaper_calls(), before);
}

#[test]
fn consent_unknown_and_tampered_receipts() {
    let mut rig = rig(two_windows());
    let receipt = rig.consent(ConsentChoices {
        windows: true,
        wallpaper: false,
    });
    let mut forged = receipt.clone();
    forged.receipt_id = "receipt-forged".into();
    assert_eq!(
        consent_err(
            rig.broker
                .enter(&forged, VariantId::AfternoonClear)
                .unwrap_err()
        ),
        ConsentError::UnknownReceipt
    );
    let mut escalated = receipt.clone();
    escalated.wallpaper = true;
    assert_eq!(
        consent_err(
            rig.broker
                .enter(&escalated, VariantId::AfternoonClear)
                .unwrap_err()
        ),
        ConsentError::Tampered
    );
    let mut later = receipt.clone();
    later.expires_at_ms += 10_000_000;
    assert_eq!(
        consent_err(
            rig.broker
                .enter(&later, VariantId::AfternoonClear)
                .unwrap_err()
        ),
        ConsentError::Tampered
    );
    assert_nothing_happened(&rig);
}

#[test]
fn consent_monitor_mismatch() {
    let mut rig = rig(two_windows());
    let receipt = rig.consent(ALL);
    assert_eq!(receipt.monitor_id, stage_monitor_id());
    // EVA's window moved to the other monitor after consent.
    rig.fake.with(|d| d.stage_monitor = other_monitor_id());
    let e = rig
        .broker
        .enter(&receipt, VariantId::AfternoonClear)
        .unwrap_err();
    assert_eq!(consent_err(e), ConsentError::MonitorMismatch);
    assert_nothing_happened(&rig);
}

#[test]
fn consent_effect_not_consented() {
    // wallpaper = false: never touch wallpaper.
    let mut rig = rig(two_windows());
    let receipt = rig.consent(ConsentChoices {
        windows: true,
        wallpaper: false,
    });
    let wp_before = rig.fake.wallpaper(&stage_monitor_id());
    rig.broker
        .enter(&receipt, VariantId::AfternoonClear)
        .unwrap();
    let e = rig
        .broker
        .set_far_field(&receipt, VariantId::AfternoonRain)
        .unwrap_err();
    assert_eq!(
        consent_err(e),
        ConsentError::EffectNotConsented(StageEffect::Wallpaper)
    );
    assert_eq!(rig.fake.wallpaper_calls(), 0);
    assert_eq!(rig.fake.wallpaper(&stage_monitor_id()), wp_before);

    // windows = false: never move windows.
    let mut rig = common::rig(two_windows());
    let receipt = rig.consent(ConsentChoices {
        windows: false,
        wallpaper: true,
    });
    assert_eq!(receipt.approved_window_count, 0);
    let report = rig
        .broker
        .enter(&receipt, VariantId::AfternoonClear)
        .unwrap();
    assert_eq!(report.moved_window_count, 0);
    assert_eq!(rig.fake.placement_calls(), 0);
    assert_eq!(
        rig.broker
            .set_far_field(&receipt, VariantId::AfternoonClear)
            .unwrap(),
        FarFieldOutcome::Applied
    );
    assert_eq!(rig.fake.placement_calls(), 0);
}

#[test]
fn consent_count_mismatch() {
    let mut rig = rig(two_windows());
    let receipt = rig.consent(ALL);
    assert_eq!(receipt.approved_window_count, 2);
    rig.fake.with(|d| d.add_window(notes(W3, 203)));
    let e = rig
        .broker
        .enter(&receipt, VariantId::AfternoonClear)
        .unwrap_err();
    assert_eq!(
        consent_err(e),
        ConsentError::ApprovedCountTooLow {
            approved: 2,
            eligible: 3
        }
    );
    assert_nothing_happened(&rig);
    // Re-prepare fixes it.
    let receipt = rig.consent(ALL);
    let report = rig
        .broker
        .enter(&receipt, VariantId::AfternoonClear)
        .unwrap();
    assert_eq!(report.moved_window_count, 3);
}

#[test]
fn second_session_blocked_while_effects_outstanding() {
    let mut rig = rig(two_windows());
    let (first, _) = rig.enter_all();
    // Same receipt again: idempotent no-op.
    let calls = rig.fake.placement_calls();
    let again = rig.broker.enter(&first, VariantId::AfternoonClear).unwrap();
    assert_eq!(again.outcome, EnterOutcome::AlreadyEntered);
    assert_eq!(rig.fake.placement_calls(), calls);

    let second = rig.consent(ALL);
    let e = rig
        .broker
        .enter(&second, VariantId::AfternoonClear)
        .unwrap_err();
    assert_eq!(e, BrokerError::EffectsOutstanding);
    assert_eq!(rig.fake.placement_calls(), calls);

    let report = rig.broker.restore(RestoreMode::Graceful).unwrap();
    assert!(report.journal_cleared);
    // A consumed receipt cannot start another session.
    let e = rig
        .broker
        .enter(&first, VariantId::AfternoonClear)
        .unwrap_err();
    assert!(matches!(e, BrokerError::Consent(_)));
    // A fresh prepare + consent can.
    rig.broker.prepare(SceneId::ParisTerrace).unwrap();
    let third = rig.broker.issue_consent(ALL).unwrap();
    assert_eq!(
        rig.broker
            .enter(&third, VariantId::AfternoonClear)
            .unwrap()
            .outcome,
        EnterOutcome::Entered
    );
}

#[test]
fn cancel_before_enter_discards_prepared_session() {
    let mut rig = rig(two_windows());
    let receipt = rig.consent(ALL);
    rig.broker.cancel();
    let e = rig
        .broker
        .enter(&receipt, VariantId::AfternoonClear)
        .unwrap_err();
    assert_eq!(consent_err(e), ConsentError::WrongSession);
    assert_nothing_happened(&rig);
}
