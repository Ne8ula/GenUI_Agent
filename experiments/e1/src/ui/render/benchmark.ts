// Bounded diagnostic runs, shared with the native material protocol. A 30s
// run fits at up to 600Hz; the runner rejects a prematurely capped sample.
export const BENCHMARK_MIN_DURATION_MS = 1;
export const BENCHMARK_MAX_DURATION_MS = 60_000;
export const BENCHMARK_MAX_SAMPLES = 18_000;
export const BENCHMARK_DEFAULT_DURATION_MS = 30_000;

export function isAcceptableBenchmarkDuration(durationMs: number | undefined): boolean {
  const duration = durationMs ?? BENCHMARK_DEFAULT_DURATION_MS;
  return Number.isFinite(duration) && duration >= BENCHMARK_MIN_DURATION_MS && duration <= BENCHMARK_MAX_DURATION_MS;
}
