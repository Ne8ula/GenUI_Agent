// Session-only numeric instrumentation; no text, audio, identity or provider payloads.
export type TimingKind = 'turn-end-to-playback-ms' | 'detected-onset-to-local-stop-ms';
const samples: { kind: TimingKind; ms: number }[] = [];
export function noteTiming(kind: TimingKind, ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return;
  samples.push({ kind, ms });
  if (samples.length > 64) samples.shift();
}
export function localTimings() { return samples.map(sample => ({ ...sample })); }
export function clearTimings() { samples.length = 0; }
