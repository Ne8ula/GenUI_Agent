//! Native boundary (fail closed) and redaction.

mod common;
use common::*;
use eva_w4_stage_broker::adapter::{AdapterError, MonitorId, WallpaperRef};
use eva_w4_stage_broker::clock::FakeClock;
use eva_w4_stage_broker::fake::stage_monitor_id;
use eva_w4_stage_broker::ids::{SceneId, VariantId};
use eva_w4_stage_broker::journal::{from_json_lines, to_json_lines, MemoryJournal, RestoreMode};
use eva_w4_stage_broker::unsupported::{NativeAdapterStatus, UnsupportedNativeAdapter};
use eva_w4_stage_broker::{recover, BrokerError, MemoryRecoveryLock, RestoreConfig, StageBroker};
use std::sync::Arc;

#[test]
fn unsupported_native_adapter_fails_closed() {
    for status in [
        NativeAdapterStatus::Unsupported,
        NativeAdapterStatus::NotConfigured,
    ] {
        let journal = MemoryJournal::new();
        let mut broker = StageBroker::new(
            Arc::new(UnsupportedNativeAdapter::new(status)),
            Arc::new(journal.clone()),
            Arc::new(FakeClock::new(0)),
            Arc::new(MemoryRecoveryLock::new()),
            config(),
        );
        let err = broker.prepare(SceneId::ParisTerrace).unwrap_err();
        let expected = match status {
            NativeAdapterStatus::Unsupported => AdapterError::Unsupported {
                operation: "stage_monitor",
            },
            NativeAdapterStatus::NotConfigured => AdapterError::NotConfigured {
                operation: "stage_monitor",
            },
        };
        assert_eq!(err, BrokerError::Adapter(expected));
        assert_eq!(
            broker.issue_consent(ALL).unwrap_err(),
            BrokerError::NotPrepared
        );

        // A receipt from elsewhere cannot be used to enter.
        let mut other = rig(two_windows());
        let receipt = other.consent(ALL);
        assert!(broker.enter(&receipt, VariantId::AfternoonClear).is_err());
        assert!(journal.is_empty());

        // Leftover journal + native adapter: restore and recovery refuse
        // rather than claim success, and the journal is retained.
        other.enter_all_again();
        let text = to_json_lines(&other.journal.records());
        let leftover = MemoryJournal::from_records(from_json_lines(&text).unwrap());
        let mut broker = StageBroker::new(
            Arc::new(UnsupportedNativeAdapter::new(status)),
            Arc::new(leftover.clone()),
            Arc::new(FakeClock::new(0)),
            Arc::new(MemoryRecoveryLock::new()),
            config(),
        );
        let err = broker.restore(RestoreMode::Emergency).unwrap_err();
        assert!(matches!(err, BrokerError::Adapter(_)), "{err:?}");
        let err = recover(
            &leftover,
            &UnsupportedNativeAdapter::new(status),
            &MemoryRecoveryLock::new(),
            &RestoreConfig::default(),
        )
        .unwrap_err();
        assert!(matches!(err, BrokerError::Adapter(_)));
        assert_eq!(leftover.len(), from_json_lines(&text).unwrap().len());
    }
}

trait EnterAgain {
    fn enter_all_again(&mut self);
}
impl EnterAgain for Rig {
    fn enter_all_again(&mut self) {
        let receipt = self.consent(ALL);
        self.broker
            .enter(&receipt, VariantId::AfternoonClear)
            .unwrap();
    }
}

#[test]
fn redacting_debug() {
    let secret = "C:\\Users\\someone\\Pictures\\private.jpg";
    let r = WallpaperRef::from_adapter(secret);
    assert_eq!(format!("{r:?}"), "WallpaperRef(<redacted>)");
    assert!(!format!("{r}").contains("private"));
    assert!(!format!("{r:#?}").contains("private"));
    let m = MonitorId::from_adapter("\\\\?\\DISPLAY#ABC#4&1234");
    assert!(!format!("{m:?}").contains("DISPLAY"));
    assert!(!format!("{m}").contains("DISPLAY"));

    // Composite values and reports inherit redaction.
    let mut rig = rig(two_windows());
    let state = rig.fake.wallpaper(&stage_monitor_id());
    assert!(!format!("{state:?}").contains("fake://"));
    let (receipt, report) = rig.enter_all();
    assert!(!format!("{receipt:?}").contains("monitor:a"));
    rig.broker
        .set_far_field(&receipt, VariantId::AfternoonClear)
        .unwrap();
    let restore = rig.broker.restore(RestoreMode::Graceful).unwrap();
    for text in [format!("{report:?}"), format!("{restore:?}")] {
        assert!(!text.contains("fake://"));
        assert!(!text.contains("monitor:"));
        assert!(!text.contains("notes"), "no app keys in reports");
    }
}
