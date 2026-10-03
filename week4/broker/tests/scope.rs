//! Window scope and eligibility.

mod common;
use common::*;
use eva_w4_stage_broker::adapter::ShowState;
use eva_w4_stage_broker::fake::{other_monitor_id, rect, synthetic_window, EVA_PID};
use eva_w4_stage_broker::ids::SceneId;
use eva_w4_stage_broker::journal::RestoreMode;
use eva_w4_stage_broker::ExclusionReason;

#[test]
fn allowlist_rejection() {
    let stranger = synthetic_window(21, 301, "mail-client", rect(100, 100, 500, 500));
    let mut rig = rig(vec![notes(W1, 201), stranger]);
    let summary = rig.broker.prepare(SceneId::ParisTerrace).unwrap();
    assert_eq!(summary.eligible_window_count, 1);
    let before = rig.placement(21);
    let (_, report) = rig.enter_all();
    assert_eq!(report.moved_window_count, 1);
    assert_eq!(report.excluded_for(ExclusionReason::NotAllowlisted), 1);
    assert_eq!(
        rig.placement(21),
        before,
        "non-allowlisted window untouched"
    );
    assert_ne!(rig.placement(W1), notes(W1, 201).snapshot.placement);
}

#[test]
fn other_monitor_exclusion() {
    let mut elsewhere = notes(22, 302);
    elsewhere.snapshot.monitor = other_monitor_id();
    elsewhere.snapshot.placement.normal_rect = rect(2000, 100, 2600, 600);
    let mut rig = rig(vec![notes(W1, 201), elsewhere]);
    let before = rig.placement(22);
    let (_, report) = rig.enter_all();
    assert_eq!(report.moved_window_count, 1);
    assert_eq!(report.excluded_for(ExclusionReason::OtherMonitor), 1);
    assert_eq!(rig.placement(22), before);
}

#[test]
fn own_process_exclusion() {
    let eva = synthetic_window(30, EVA_PID, "notes", rect(0, 0, 1920, 1040));
    let mut rig = rig(vec![eva, folder(W2, 202)]);
    let before = rig.placement(30);
    let (_, report) = rig.enter_all();
    assert_eq!(report.moved_window_count, 1);
    assert_eq!(report.excluded_for(ExclusionReason::OwnProcess), 1);
    assert_eq!(rig.placement(30), before, "EVA's own window never moved");
}

#[test]
fn minimized_elevated_fullscreen_exclusion() {
    let mut minimized = notes(41, 401);
    minimized.minimized = true;
    minimized.snapshot.placement.show_state = ShowState::Minimized;
    let mut elevated = notes(42, 402);
    elevated.elevated = true;
    let mut fullscreen = notes(43, 403);
    fullscreen.fullscreen_exclusive = true;
    let mut cloaked = notes(44, 404);
    cloaked.cloaked = true;
    let mut invisible = notes(45, 405);
    invisible.visible = false;
    let mut child = notes(46, 406);
    child.top_level = false;
    let all = vec![
        minimized,
        elevated,
        fullscreen,
        cloaked,
        invisible,
        child,
        folder(W2, 202),
    ];
    let mut rig = rig(all.clone());
    let summary = rig.broker.prepare(SceneId::ParisTerrace).unwrap();
    assert_eq!(summary.eligible_window_count, 1);
    let (_, report) = rig.enter_all();
    assert_eq!(report.moved_window_count, 1);
    for reason in [
        ExclusionReason::Minimized,
        ExclusionReason::Elevated,
        ExclusionReason::FullscreenExclusive,
        ExclusionReason::Cloaked,
        ExclusionReason::Invisible,
        ExclusionReason::NotTopLevel,
    ] {
        assert_eq!(report.excluded_for(reason), 1, "{reason:?}");
    }
    for w in &all[..6] {
        assert_eq!(rig.placement(w.identity.hwnd), w.snapshot.placement);
    }
}

#[test]
fn multiple_windows_from_one_process() {
    // Two windows of one process are separate effects with separate fates.
    let mut rig = rig(vec![notes(W1, 500), folder(W2, 500)]);
    let (_, report) = rig.enter_all();
    assert_eq!(report.moved_window_count, 2);
    let w2_prior = folder(W2, 500).snapshot.placement;
    let mut user = w2_prior;
    user.normal_rect = rect(10, 10, 300, 300);
    rig.fake.with(|d| d.user_set_placement(W2, user));

    let restore = rig.broker.restore(RestoreMode::Graceful).unwrap();
    assert_eq!(restore.restored(), 1);
    assert_eq!(restore.left_alone(), 1);
    assert_eq!(rig.placement(W1), notes(W1, 500).snapshot.placement);
    assert_eq!(rig.placement(W2), user);
    assert!(restore.journal_cleared);
}
