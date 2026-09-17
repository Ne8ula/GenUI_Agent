# First native smoke attempt

The native window opened and the keyboard-triggered Rust response succeeded; idle, focus and success captures are preserved. The harness then timed out waiting for an injected failure because it attempted to assign Tauri's non-writable `invoke` property. This attempt is incomplete, not a passed smoke suite. The harness was corrected to inject a synthetic transport response without changing the application. See `../native-02/results.json` for the successful retest. No owner decision was recorded.
