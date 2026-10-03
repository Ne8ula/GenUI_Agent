//! Write-ahead ordering, append failure, and the JSON-lines codec.

mod common;
use common::*;
use eva_w4_stage_broker::fake::{stage_monitor_id, FakeAdapter};
use eva_w4_stage_broker::ids::{SceneId, VariantId};
use eva_w4_stage_broker::journal::{
    from_json_lines, to_json_lines, Journal, JournalError, JournalParseErrorKind, JournalRecord,
    MemoryJournal, MotionPhase, RestoreMode,
};
use eva_w4_stage_broker::{BrokerError, MemoryRecoveryLock, StageBroker};
use std::sync::{Arc, Mutex};

/// Journal that snapshots the fake's effect counters at each append, to
/// prove intent records precede the effects they describe.
struct ProbeJournal {
    inner: MemoryJournal,
    fake: FakeAdapter,
    log: Arc<Mutex<Vec<(JournalRecord, u32, u32)>>>,
}

impl Journal for ProbeJournal {
    fn append(&self, record: &JournalRecord) -> Result<(), JournalError> {
        self.log.lock().unwrap().push((
            record.clone(),
            self.fake.placement_calls(),
            self.fake.wallpaper_calls(),
        ));
        self.inner.append(record)
    }
    fn load(&self) -> Result<Vec<JournalRecord>, JournalError> {
        self.inner.load()
    }
    fn clear(&self) -> Result<(), JournalError> {
        self.inner.clear()
    }
}

#[test]
fn journal_written_before_effect() {
    let fake = FakeAdapter::standard();
    fake.with(|d| {
        for w in two_windows() {
            d.add_window(w);
        }
    });
    let log = Arc::new(Mutex::new(Vec::new()));
    let journal = ProbeJournal {
        inner: MemoryJournal::new(),
        fake: fake.clone(),
        log: log.clone(),
    };
    let mut broker = StageBroker::new(
        Arc::new(fake.clone()),
        Arc::new(journal),
        Arc::new(eva_w4_stage_broker::clock::FakeClock::new(0)),
        Arc::new(MemoryRecoveryLock::new()),
        config(),
    );
    broker.prepare(SceneId::ParisTerrace).unwrap();
    let receipt = broker.issue_consent(ALL).unwrap();
    broker.enter(&receipt, VariantId::AfternoonClear).unwrap();
    broker
        .set_far_field(&receipt, VariantId::AfternoonClear)
        .unwrap();

    let log = log.lock().unwrap().clone();
    assert!(matches!(log[0].0, JournalRecord::SessionBegin { .. }));
    assert_eq!(
        (log[0].1, log[0].2),
        (0, 0),
        "session begins before any effect"
    );
    let mut intents = 0;
    for (i, (record, placements, wallpapers)) in log.iter().enumerate() {
        match record {
            JournalRecord::WindowStepIntent { .. } => {
                intents += 1;
                // The very next record is Applied, written after exactly one
                // more placement call.
                let (next, after, _) = &log[i + 1];
                assert!(matches!(next, JournalRecord::WindowStepApplied { .. }));
                assert_eq!(*after, placements + 1);
            }
            JournalRecord::WallpaperIntent { .. } => {
                let (next, _, after) = &log[i + 1];
                assert!(matches!(next, JournalRecord::WallpaperApplied { .. }));
                assert_eq!(*after, wallpapers + 1);
            }
            _ => {}
        }
    }
    assert_eq!(intents, 8);
}

#[test]
fn append_failure_means_no_effect() {
    // Session begin cannot be journaled: nothing at all happens.
    let mut rig = rig(two_windows());
    let receipt = rig.consent(ALL);
    rig.journal
        .fail_append_when(|r| matches!(r, JournalRecord::SessionBegin { .. }));
    let e = rig
        .broker
        .enter(&receipt, VariantId::AfternoonClear)
        .unwrap_err();
    assert_eq!(e, BrokerError::Journal(JournalError::AppendFailed));
    assert_eq!(rig.fake.placement_calls(), 0);
    assert!(rig.journal.is_empty());

    // First window step intent cannot be journaled: no window moves.
    let mut rig = common::rig(two_windows());
    let receipt = rig.consent(ALL);
    rig.journal
        .fail_append_when(|r| matches!(r, JournalRecord::WindowStepIntent { .. }));
    assert!(rig
        .broker
        .enter(&receipt, VariantId::AfternoonClear)
        .is_err());
    assert_eq!(rig.fake.placement_calls(), 0);
    assert_eq!(rig.placement(W1), notes(W1, 201).snapshot.placement);

    // Wallpaper intent cannot be journaled: wallpaper untouched.
    let mut rig = common::rig(two_windows());
    let (receipt, _) = rig.enter_all();
    let original = rig.fake.wallpaper(&stage_monitor_id());
    rig.journal
        .fail_append_when(|r| matches!(r, JournalRecord::WallpaperIntent { .. }));
    let e = rig
        .broker
        .set_far_field(&receipt, VariantId::AfternoonClear)
        .unwrap_err();
    assert_eq!(e, BrokerError::Journal(JournalError::AppendFailed));
    assert_eq!(rig.fake.wallpaper_calls(), 0);
    assert_eq!(rig.fake.wallpaper(&stage_monitor_id()), original);

    // Restore intent cannot be journaled: nothing is restored, journal kept.
    rig.journal
        .fail_append_when(|r| matches!(r, JournalRecord::RestoreIntent { .. }));
    let before = rig.fake.placement_calls();
    assert!(rig.broker.restore(RestoreMode::Emergency).is_err());
    assert_eq!(rig.fake.placement_calls(), before);
    assert!(!rig.journal.is_empty());
    rig.journal.stop_failing();
    assert!(
        rig.broker
            .restore(RestoreMode::Emergency)
            .unwrap()
            .journal_cleared
    );
}

#[test]
fn json_lines_round_trip() {
    let mut rig = rig(two_windows());
    let (receipt, _) = rig.enter_all();
    rig.broker
        .set_far_field(&receipt, VariantId::EveningRain)
        .unwrap();
    let records = rig.journal.records();
    assert!(records.len() > 10);
    let text = to_json_lines(&records);
    assert_eq!(text.lines().count(), records.len());
    assert_eq!(from_json_lines(&text).unwrap(), records);
    // CRLF tolerated.
    assert_eq!(
        from_json_lines(&text.replace('\n', "\r\n")).unwrap(),
        records
    );
    // Spot-check the wire format of a step record.
    assert!(records.iter().any(|r| matches!(
        r,
        JournalRecord::WindowStepIntent {
            phase: MotionPhase::Displace,
            ..
        }
    )));
    assert!(text.contains(r#""type":"window_step_intent""#));
}

#[test]
fn json_lines_rejects_unknown_fields_and_malformed_lines() {
    let mut rig = rig(two_windows());
    let (receipt, _) = rig.enter_all();
    rig.broker
        .set_far_field(&receipt, VariantId::AfternoonClear)
        .unwrap();
    let good = to_json_lines(&rig.journal.records());
    let lines: Vec<&str> = good.lines().collect();

    let with_line = |i: usize, replacement: String| {
        let mut l: Vec<String> = lines.iter().map(|s| s.to_string()).collect();
        l[i] = replacement;
        l.join("\n") + "\n"
    };
    let expect = |input: String, line: usize, kind: JournalParseErrorKind| {
        let err = from_json_lines(&input).unwrap_err();
        assert_eq!(err.line, line);
        assert_eq!(err.kind, kind);
        // Error text never echoes line content.
        assert!(!err.to_string().contains("fake://"));
    };

    // Unknown field at the wrapper level.
    expect(
        with_line(
            1,
            lines[1].replacen("{\"v\":1,", "{\"v\":1,\"extra\":true,", 1),
        ),
        2,
        JournalParseErrorKind::Malformed,
    );
    // Unknown field inside a record.
    expect(
        with_line(
            1,
            lines[1].replacen("\"type\":", "\"title\":\"secret\",\"type\":", 1),
        ),
        2,
        JournalParseErrorKind::Malformed,
    );
    // Unknown field nested inside a placement.
    expect(
        with_line(1, lines[1].replacen("\"left\":", "\"z\":0,\"left\":", 1)),
        2,
        JournalParseErrorKind::Malformed,
    );
    // Unknown record type.
    expect(
        with_line(
            2,
            lines[2].replacen("window_step_applied", "window_teleported", 1),
        ),
        3,
        JournalParseErrorKind::Malformed,
    );
    // Truncated / not JSON.
    expect(
        with_line(3, lines[3][..lines[3].len() / 2].to_string()),
        4,
        JournalParseErrorKind::Malformed,
    );
    // Unsupported version.
    expect(
        with_line(0, lines[0].replacen("{\"v\":1,", "{\"v\":2,", 1)),
        1,
        JournalParseErrorKind::UnsupportedVersion(2),
    );
    // Interior blank line.
    expect(
        with_line(2, String::new()),
        3,
        JournalParseErrorKind::BlankLine,
    );
    // Missing required field.
    expect(
        with_line(0, lines[0].replacen("\"generation\":", "\"gen\":", 1)),
        1,
        JournalParseErrorKind::Malformed,
    );
}
