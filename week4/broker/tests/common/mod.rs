#![allow(dead_code)]
//! Shared synthetic rig. No real windows, paths or OS calls.

use eva_w4_stage_broker::adapter::{AppKey, Placement, WindowInfo};
use eva_w4_stage_broker::clock::FakeClock;
use eva_w4_stage_broker::consent::{ConsentChoices, ConsentReceipt};
use eva_w4_stage_broker::fake::{rect, synthetic_window, FakeAdapter};
use eva_w4_stage_broker::ids::{SceneId, VariantId};
use eva_w4_stage_broker::journal::{JournalRecord, MemoryJournal, MotionPhase};
use eva_w4_stage_broker::{
    BrokerConfig, EnterReport, MemoryRecoveryLock, ParkingPolicy, StageBroker,
};
use std::sync::Arc;

pub const W1: u64 = 11;
pub const W2: u64 = 12;
pub const W3: u64 = 13;

pub struct Rig {
    pub fake: FakeAdapter,
    pub journal: MemoryJournal,
    pub clock: Arc<FakeClock>,
    pub lock: MemoryRecoveryLock,
    pub broker: StageBroker,
}

pub fn config() -> BrokerConfig {
    BrokerConfig {
        allowlist: ["notes", "folder"]
            .iter()
            .map(|k| AppKey(k.to_string()))
            .collect(),
        motion_steps: 4,
        // The shared synthetic windows (600 px wide) only park when shrunk into
        // the 240 px mock column. Production default is RejectIfResizeNeeded.
        parking: ParkingPolicy::MockFitToStrip,
        ..BrokerConfig::default()
    }
}

pub fn notes(hwnd: u64, pid: u32) -> WindowInfo {
    synthetic_window(hwnd, pid, "notes", rect(400, 200, 1000, 700))
}

pub fn folder(hwnd: u64, pid: u32) -> WindowInfo {
    synthetic_window(hwnd, pid, "folder", rect(800, 300, 1400, 800))
}

pub fn two_windows() -> Vec<WindowInfo> {
    vec![notes(W1, 201), folder(W2, 202)]
}

pub fn rig(windows: Vec<WindowInfo>) -> Rig {
    rig_with(config(), windows)
}

pub fn rig_with(config: BrokerConfig, windows: Vec<WindowInfo>) -> Rig {
    let fake = FakeAdapter::standard();
    fake.with(|d| {
        for w in windows {
            d.add_window(w);
        }
    });
    let journal = MemoryJournal::new();
    let clock = Arc::new(FakeClock::new(1_000_000));
    let lock = MemoryRecoveryLock::new();
    let broker = StageBroker::new(
        Arc::new(fake.clone()),
        Arc::new(journal.clone()),
        clock.clone(),
        Arc::new(lock.clone()),
        config,
    );
    Rig {
        fake,
        journal,
        clock,
        lock,
        broker,
    }
}

pub const ALL: ConsentChoices = ConsentChoices {
    windows: true,
    wallpaper: true,
};

impl Rig {
    pub fn consent(&mut self, choices: ConsentChoices) -> ConsentReceipt {
        self.broker.prepare(SceneId::ParisTerrace).unwrap();
        self.broker.issue_consent(choices).unwrap()
    }

    pub fn enter_all(&mut self) -> (ConsentReceipt, EnterReport) {
        let receipt = self.consent(ALL);
        let report = self
            .broker
            .enter(&receipt, VariantId::AfternoonClear)
            .unwrap();
        (receipt, report)
    }

    pub fn placement(&self, hwnd: u64) -> Placement {
        self.fake.placement_of(hwnd).expect("window present")
    }
}

/// (from, target) of a journaled displacement step for a window.
pub fn displace_intent(records: &[JournalRecord], hwnd: u64, step: u32) -> (Placement, Placement) {
    records
        .iter()
        .find_map(|r| match r {
            JournalRecord::WindowStepIntent {
                identity,
                phase: MotionPhase::Displace,
                step: s,
                from,
                target,
                ..
            } if identity.hwnd == hwnd && *s == step => Some((*from, *target)),
            _ => None,
        })
        .expect("intent present")
}
