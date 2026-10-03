//! Far-field wallpaper: snapshot, set, degraded modes, conditional restore.

mod common;
use common::*;
use eva_w4_stage_broker::adapter::{WallpaperKind, WallpaperPosition, WallpaperRef};
use eva_w4_stage_broker::fake::{other_monitor_id, stage_monitor_id};
use eva_w4_stage_broker::ids::{SceneId, VariantId};
use eva_w4_stage_broker::journal::{
    JournalRecord, LeftAloneReason, RestoreMode, RestoreOutcome, UnresolvedReason,
};
use eva_w4_stage_broker::{DegradedReason, EffectKind, FarFieldOutcome};

#[test]
fn wallpaper_set_changes_only_stage_monitor_image() {
    let mut rig = rig(two_windows());
    let original = rig.fake.wallpaper(&stage_monitor_id());
    let other_before = rig.fake.wallpaper(&other_monitor_id());
    let (receipt, _) = rig.enter_all();
    // enter does not touch the wallpaper (set later, under the veil).
    assert_eq!(rig.fake.wallpaper_calls(), 0);

    let out = rig
        .broker
        .set_far_field(&receipt, VariantId::AfternoonClear)
        .unwrap();
    assert_eq!(out, FarFieldOutcome::Applied);
    let now = rig.fake.wallpaper(&stage_monitor_id());
    assert_eq!(
        now.reference,
        Some(rig.fake.catalog_ref(VariantId::AfternoonClear))
    );
    // Global position, colour and enabled state untouched; other monitor untouched.
    assert_eq!(now.position, original.position);
    assert_eq!(now.colour, original.colour);
    assert_eq!(now.background_enabled, original.background_enabled);
    assert_eq!(rig.fake.wallpaper(&other_monitor_id()), other_before);

    // Follow-ups change the same owned effect; same variant is a no-op.
    assert_eq!(
        rig.broker
            .set_far_field(&receipt, VariantId::AfternoonRain)
            .unwrap(),
        FarFieldOutcome::Applied
    );
    let calls = rig.fake.wallpaper_calls();
    assert_eq!(
        rig.broker
            .set_far_field(&receipt, VariantId::AfternoonRain)
            .unwrap(),
        FarFieldOutcome::NoOp
    );
    assert_eq!(rig.fake.wallpaper_calls(), calls);

    let restore = rig.broker.restore(RestoreMode::Graceful).unwrap();
    assert_eq!(
        restore.outcomes_of(EffectKind::Wallpaper),
        vec![RestoreOutcome::Restored]
    );
    assert_eq!(rig.fake.wallpaper(&stage_monitor_id()), original);
    assert_eq!(rig.fake.wallpaper(&other_monitor_id()), other_before);
    assert!(restore.journal_cleared);
}

#[test]
fn user_changed_wallpaper_later() {
    let mut rig = rig(two_windows());
    let (receipt, _) = rig.enter_all();
    rig.broker
        .set_far_field(&receipt, VariantId::AfternoonClear)
        .unwrap();
    let user_ref = WallpaperRef::from_adapter("fake://user/new-choice");
    rig.fake.with(|d| {
        d.user_set_wallpaper(
            &stage_monitor_id(),
            Some(user_ref.clone()),
            WallpaperKind::Static,
        )
    });
    // A follow-up must not overwrite the user's choice.
    assert_eq!(
        rig.broker
            .set_far_field(&receipt, VariantId::EveningClear)
            .unwrap(),
        FarFieldOutcome::LeftAlone
    );
    let restore = rig.broker.restore(RestoreMode::Graceful).unwrap();
    assert_eq!(
        restore.outcomes_of(EffectKind::Wallpaper),
        vec![RestoreOutcome::LeftAlone(LeftAloneReason::UserChanged)]
    );
    assert_eq!(
        rig.fake.wallpaper(&stage_monitor_id()).reference,
        Some(user_ref)
    );
    assert!(restore.journal_cleared);
}

#[test]
fn user_changed_only_wallpaper_position_mode_later() {
    let mut rig = rig(two_windows());
    let (receipt, _) = rig.enter_all();
    rig.broker
        .set_far_field(&receipt, VariantId::AfternoonClear)
        .unwrap();
    let calls = rig.fake.wallpaper_calls();
    // Same image, but the user switched the (global) position to Fit.
    rig.fake.with(|d| d.position = WallpaperPosition::Fit);
    let restore = rig.broker.restore(RestoreMode::Emergency).unwrap();
    assert_eq!(
        restore.outcomes_of(EffectKind::Wallpaper),
        vec![RestoreOutcome::LeftAlone(LeftAloneReason::UserChanged)]
    );
    assert_eq!(rig.fake.wallpaper_calls(), calls, "not overwritten");
    assert_eq!(
        rig.fake.wallpaper(&stage_monitor_id()).position,
        WallpaperPosition::Fit
    );
}

#[test]
fn unrestorable_wallpaper_selects_degraded_mode() {
    type Setup = fn(&mut eva_w4_stage_broker::fake::FakeDesktop);
    let cases: Vec<(&str, Setup)> = vec![
        ("slideshow", |d| {
            d.user_set_wallpaper(&stage_monitor_id(), None, WallpaperKind::Slideshow)
        }),
        ("spotlight", |d| {
            d.user_set_wallpaper(
                &stage_monitor_id(),
                Some(WallpaperRef::from_adapter("fake://spotlight")),
                WallpaperKind::Spotlight,
            )
        }),
        ("policy-locked", |d| {
            d.user_set_wallpaper(
                &stage_monitor_id(),
                Some(WallpaperRef::from_adapter("fake://policy")),
                WallpaperKind::PolicyLocked,
            )
        }),
        ("unknown", |d| {
            d.user_set_wallpaper(
                &stage_monitor_id(),
                Some(WallpaperRef::from_adapter("fake://x")),
                WallpaperKind::Unknown,
            )
        }),
        ("solid colour (empty ref)", |d| {
            d.user_set_wallpaper(&stage_monitor_id(), None, WallpaperKind::Static)
        }),
        ("global span position", |d| {
            d.position = WallpaperPosition::Span
        }),
        ("background disabled", |d| d.background_enabled = false),
    ];
    for (name, setup) in cases {
        let mut rig = rig(two_windows());
        rig.fake.with(setup);
        let original = rig.fake.wallpaper(&stage_monitor_id());
        let other = rig.fake.wallpaper(&other_monitor_id());
        let summary = rig.broker.prepare(SceneId::ParisTerrace).unwrap();
        assert!(!summary.wallpaper_restorable, "{name}");
        assert!(
            summary
                .degraded
                .contains(&DegradedReason::WallpaperNotRestorable),
            "{name}"
        );
        let receipt = rig.broker.issue_consent(ALL).unwrap();
        let report = rig
            .broker
            .enter(&receipt, VariantId::AfternoonClear)
            .unwrap();
        assert!(
            report
                .degraded
                .contains(&DegradedReason::WallpaperNotRestorable),
            "{name}"
        );
        assert_eq!(report.moved_window_count, 2, "{name}: windows still staged");
        assert_eq!(
            rig.broker
                .set_far_field(&receipt, VariantId::AfternoonClear)
                .unwrap(),
            FarFieldOutcome::Degraded(DegradedReason::WallpaperNotRestorable),
            "{name}"
        );
        assert_eq!(rig.fake.wallpaper_calls(), 0, "{name}");
        assert_eq!(rig.fake.wallpaper(&stage_monitor_id()), original, "{name}");
        assert_eq!(rig.fake.wallpaper(&other_monitor_id()), other, "{name}");
        assert!(!rig
            .journal
            .records()
            .iter()
            .any(|r| matches!(r, JournalRecord::WallpaperIntent { .. })));
    }
}

#[test]
fn wallpaper_set_failure_is_degraded_and_claims_nothing() {
    let mut rig = rig(two_windows());
    let (receipt, _) = rig.enter_all();
    let original = rig.fake.wallpaper(&stage_monitor_id());
    rig.fake.with(|d| d.fail_set_wallpaper = true);
    assert_eq!(
        rig.broker
            .set_far_field(&receipt, VariantId::AfternoonClear)
            .unwrap(),
        FarFieldOutcome::Degraded(DegradedReason::WallpaperSetFailed)
    );
    assert!(!rig
        .journal
        .records()
        .iter()
        .any(|r| matches!(r, JournalRecord::WallpaperApplied { .. })));
    assert_eq!(rig.fake.wallpaper(&stage_monitor_id()), original);
    rig.fake.with(|d| d.fail_set_wallpaper = false);
    let restore = rig.broker.restore(RestoreMode::Emergency).unwrap();
    // Unchanged wallpaper counts as restored; nothing was written.
    assert_eq!(
        restore.outcomes_of(EffectKind::Wallpaper),
        vec![RestoreOutcome::Restored]
    );
    assert_eq!(rig.fake.wallpaper_calls(), 1);
    assert!(restore.journal_cleared);
}

#[test]
fn wallpaper_restore_verification_mismatch() {
    let mut rig = rig(two_windows());
    let (receipt, _) = rig.enter_all();
    let original = rig.fake.wallpaper(&stage_monitor_id());
    rig.broker
        .set_far_field(&receipt, VariantId::EveningRain)
        .unwrap();
    rig.fake.with(|d| d.ignore_set_wallpaper = true);
    let restore = rig.broker.restore(RestoreMode::Emergency).unwrap();
    assert_eq!(
        restore.outcomes_of(EffectKind::Wallpaper),
        vec![RestoreOutcome::Unresolved(UnresolvedReason::VerifyMismatch)]
    );
    assert_eq!(restore.restored(), 2, "windows restored");
    assert!(!restore.journal_cleared);
    assert!(!rig.journal.is_empty());

    rig.fake.with(|d| d.ignore_set_wallpaper = false);
    let placement_calls = rig.fake.placement_calls();
    let retry = rig.broker.restore(RestoreMode::Emergency).unwrap();
    assert_eq!(
        retry.outcomes_of(EffectKind::Wallpaper),
        vec![RestoreOutcome::Restored]
    );
    assert_eq!(retry.already_settled, 2);
    assert_eq!(rig.fake.placement_calls(), placement_calls);
    assert!(retry.journal_cleared);
    assert_eq!(rig.fake.wallpaper(&stage_monitor_id()), original);
}
