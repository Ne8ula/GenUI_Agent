//! Write-ahead journal of desktop effects.
//!
//! Every effect is journaled as an *intent* before the adapter is asked to
//! apply it, and marked *applied* only after a read-back verifies it. If an
//! append fails, the effect is not applied. The production journal belongs
//! in the private per-user app-data directory (not implemented here); this
//! crate ships an in-memory journal plus a strict JSON-lines codec for
//! recovery tests.

use crate::adapter::{MonitorId, Placement, Rect, WallpaperState, WindowIdentity, WindowSnapshot};
use serde::{Deserialize, Serialize};
use std::fmt;
use std::sync::{Arc, Mutex};

/// Journal line format version.
pub const JOURNAL_FORMAT_VERSION: u32 = 1;

/// Identity of one owned effect (one wallpaper change chain on one monitor,
/// or one window's displacement and return).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EffectId {
    pub generation: u64,
    pub seq: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RestoreMode {
    /// Animated return steps, then verification.
    Graceful,
    /// No animation: one restoring step per effect, immediately.
    Emergency,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MotionPhase {
    Displace,
    Return,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LeftAloneReason {
    /// Current state differs from every broker-authored state.
    UserChanged,
    /// The window is where EVA left it, but its monitor/DPI context changed,
    /// so the recorded coordinates are no longer trustworthy.
    MonitorContextChanged,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GoneReason {
    Closed,
    /// The handle now belongs to a different window/process.
    HandleReused,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UnresolvedReason {
    /// The adapter accepted the restore but read-back did not match.
    VerifyMismatch,
    /// The adapter reported an error.
    AdapterError,
}

/// Per-effect restoration result.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RestoreOutcome {
    Restored,
    LeftAlone(LeftAloneReason),
    Gone(GoneReason),
    /// Retained in the journal and reported; retried by a later restore.
    Unresolved(UnresolvedReason),
    /// Desktop locked / secure desktop: nothing attempted; retained.
    Deferred,
}

impl RestoreOutcome {
    /// Terminal outcomes allow the journal entry to be dropped.
    pub fn is_terminal(&self) -> bool {
        matches!(
            self,
            RestoreOutcome::Restored | RestoreOutcome::LeftAlone(_) | RestoreOutcome::Gone(_)
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MonitorContext {
    pub work_area: Rect,
    pub dpi: u32,
}

/// One journal record. Unknown fields and unknown record types are rejected.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum JournalRecord {
    SessionBegin {
        session_id: String,
        receipt_id: String,
        generation: u64,
        monitor: MonitorId,
        monitor_context: MonitorContext,
    },
    WallpaperIntent {
        effect: EffectId,
        monitor: MonitorId,
        /// The user's original state, captured before the first change.
        prior: WallpaperState,
        target: WallpaperState,
    },
    WallpaperApplied {
        effect: EffectId,
        applied: WallpaperState,
    },
    WallpaperFailed {
        effect: EffectId,
        /// Read-back immediately after EVA's own failed/unverified attempt.
        observed: Option<WallpaperState>,
    },
    WindowStepIntent {
        effect: EffectId,
        identity: WindowIdentity,
        phase: MotionPhase,
        step: u32,
        steps_total: u32,
        /// The user's original placement and context.
        prior: WindowSnapshot,
        from: Placement,
        target: Placement,
    },
    WindowStepApplied {
        effect: EffectId,
        phase: MotionPhase,
        step: u32,
        applied: Placement,
        /// Monitor/DPI context read back after the step. A broker-authored
        /// step's context is owned during restore, so an OS monitor
        /// reassignment caused by EVA's own move is not mistaken for a user
        /// change.
        monitor: MonitorId,
        dpi: u32,
    },
    WindowStepFailed {
        effect: EffectId,
        phase: MotionPhase,
        step: u32,
        /// Read-back immediately after EVA's own failed/unverified attempt.
        observed: Option<WindowSnapshot>,
    },
    RestoreIntent {
        effect: EffectId,
        mode: RestoreMode,
    },
    RestoreResult {
        effect: EffectId,
        outcome: RestoreOutcome,
    },
    SessionClosed {
        generation: u64,
    },
}

impl JournalRecord {
    pub fn effect(&self) -> Option<EffectId> {
        match self {
            JournalRecord::SessionBegin { .. } | JournalRecord::SessionClosed { .. } => None,
            JournalRecord::WallpaperIntent { effect, .. }
            | JournalRecord::WallpaperApplied { effect, .. }
            | JournalRecord::WallpaperFailed { effect, .. }
            | JournalRecord::WindowStepIntent { effect, .. }
            | JournalRecord::WindowStepApplied { effect, .. }
            | JournalRecord::WindowStepFailed { effect, .. }
            | JournalRecord::RestoreIntent { effect, .. }
            | JournalRecord::RestoreResult { effect, .. } => Some(*effect),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum JournalError {
    AppendFailed,
    LoadFailed,
    ClearFailed,
    Corrupt(JournalParseError),
}

impl fmt::Display for JournalError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            JournalError::AppendFailed => f.write_str("journal append failed"),
            JournalError::LoadFailed => f.write_str("journal load failed"),
            JournalError::ClearFailed => f.write_str("journal clear failed"),
            JournalError::Corrupt(e) => write!(f, "journal corrupt: {e}"),
        }
    }
}

pub trait Journal: Send + Sync {
    /// Durably append one record. On error, the caller must not apply the
    /// corresponding effect.
    fn append(&self, record: &JournalRecord) -> Result<(), JournalError>;
    fn load(&self) -> Result<Vec<JournalRecord>, JournalError>;
    /// Called only after every owned effect is Restored, LeftAlone or Gone.
    fn clear(&self) -> Result<(), JournalError>;
}

type AppendFailure = Box<dyn Fn(&JournalRecord) -> bool + Send>;

#[derive(Default)]
struct MemoryJournalInner {
    records: Vec<JournalRecord>,
    fail_append: Option<AppendFailure>,
    fail_clear: bool,
    clears: u32,
}

/// In-memory journal. Clones share the same storage, so a test can keep a
/// handle while the broker owns another.
#[derive(Clone, Default)]
pub struct MemoryJournal(Arc<Mutex<MemoryJournalInner>>);

impl fmt::Debug for MemoryJournal {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let inner = self.0.lock().unwrap();
        f.debug_struct("MemoryJournal")
            .field("records", &inner.records.len())
            .finish()
    }
}

impl MemoryJournal {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn from_records(records: Vec<JournalRecord>) -> Self {
        let j = Self::default();
        j.0.lock().unwrap().records = records;
        j
    }

    /// Make `append` fail for any record matching `predicate` (test hook).
    pub fn fail_append_when(&self, predicate: impl Fn(&JournalRecord) -> bool + Send + 'static) {
        self.0.lock().unwrap().fail_append = Some(Box::new(predicate));
    }

    pub fn stop_failing(&self) {
        let mut inner = self.0.lock().unwrap();
        inner.fail_append = None;
        inner.fail_clear = false;
    }

    pub fn fail_clear(&self, fail: bool) {
        self.0.lock().unwrap().fail_clear = fail;
    }

    pub fn records(&self) -> Vec<JournalRecord> {
        self.0.lock().unwrap().records.clone()
    }

    pub fn len(&self) -> usize {
        self.0.lock().unwrap().records.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn clear_count(&self) -> u32 {
        self.0.lock().unwrap().clears
    }
}

impl Journal for MemoryJournal {
    fn append(&self, record: &JournalRecord) -> Result<(), JournalError> {
        let mut inner = self.0.lock().unwrap();
        if let Some(pred) = &inner.fail_append {
            if pred(record) {
                return Err(JournalError::AppendFailed);
            }
        }
        inner.records.push(record.clone());
        Ok(())
    }

    fn load(&self) -> Result<Vec<JournalRecord>, JournalError> {
        Ok(self.0.lock().unwrap().records.clone())
    }

    fn clear(&self) -> Result<(), JournalError> {
        let mut inner = self.0.lock().unwrap();
        if inner.fail_clear {
            return Err(JournalError::ClearFailed);
        }
        inner.records.clear();
        inner.clears += 1;
        Ok(())
    }
}

/// One serialized line: `{"v":1,"record":{"type":...}}`.
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct JournalLine {
    v: u32,
    record: JournalRecord,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JournalParseError {
    /// 1-based line number.
    pub line: usize,
    pub kind: JournalParseErrorKind,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum JournalParseErrorKind {
    /// Not valid JSON, unknown record type or unknown/missing field.
    Malformed,
    UnsupportedVersion(u32),
    /// An empty line before the end of the input.
    BlankLine,
}

impl fmt::Display for JournalParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // Deliberately does not echo line content (it may hold private refs).
        write!(f, "line {}: {:?}", self.line, self.kind)
    }
}

/// Serialize records as JSON lines (one record per line, trailing newline).
pub fn to_json_lines(records: &[JournalRecord]) -> String {
    let mut out = String::new();
    for record in records {
        let line = JournalLine {
            v: JOURNAL_FORMAT_VERSION,
            record: record.clone(),
        };
        // Serialization of these plain data types cannot fail.
        out.push_str(&serde_json::to_string(&line).expect("journal record serializes"));
        out.push('\n');
    }
    out
}

/// Strictly parse JSON lines. Any malformed line rejects the whole input:
/// recovery never acts on a journal it cannot fully interpret.
pub fn from_json_lines(input: &str) -> Result<Vec<JournalRecord>, JournalParseError> {
    let lines: Vec<&str> = input.split('\n').collect();
    let last = lines.len().saturating_sub(1);
    let mut records = Vec::new();
    for (i, raw) in lines.iter().enumerate() {
        let line_no = i + 1;
        let text = raw.strip_suffix('\r').unwrap_or(raw);
        if text.trim().is_empty() {
            if i == last {
                break;
            }
            return Err(JournalParseError {
                line: line_no,
                kind: JournalParseErrorKind::BlankLine,
            });
        }
        let parsed: JournalLine = serde_json::from_str(text).map_err(|_| JournalParseError {
            line: line_no,
            kind: JournalParseErrorKind::Malformed,
        })?;
        if parsed.v != JOURNAL_FORMAT_VERSION {
            return Err(JournalParseError {
                line: line_no,
                kind: JournalParseErrorKind::UnsupportedVersion(parsed.v),
            });
        }
        records.push(parsed.record);
    }
    Ok(records)
}
