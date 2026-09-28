# E1 core API

Import public contracts from `src/core/index.ts`.

```ts
const controller = new E1Controller();
const snapshot = useSyncExternalStore(
  controller.subscribe,
  controller.getSnapshot,
  controller.getSnapshot,
);
```

`getSnapshot()` keeps the same frozen object until a state/event change and returns a new deeply frozen snapshot after one. The controller has no timers, network, storage, provider, credential, or privileged IPC path.

## Controller methods

```ts
request(location?: string, variant?: "complete" | "missing-cloud"): boolean
select(time: "09:00" | "12:00" | "15:00"): boolean
move(time, { x, y }): boolean
pin(time, pinned): boolean
compare(): boolean
stop(): boolean
setReducedMotion(reduced): boolean
setPlain(plain): boolean
setRecipe(recipe: "part-and-relate" | "withdraw-and-reanchor"): boolean
completeTransition(): boolean
dismiss(): boolean
proposeScore(): Readonly<ModelProposal> | null
acceptScore(input: unknown): ScoreDecision
createDelayedPatch(proposal?: unknown): DelayedScorePatch | null
deliverDelayedPatch(patch: unknown): ScoreDecision
subscribe(listener): () => void
getSnapshot(): Readonly<E1Snapshot>
```

Coordinates are normalized to `[0, 1]`; direct movement clamps finite out-of-range values and marks the anchor as user-moved. Proposal anchors must already be in range and cannot conflict with moved or pinned geometry. Stable time/entity IDs are `09:00`, `12:00`, and `15:00`.

`request()` accepts only NYC/New York City and bundled fixture variants. An unsupported location sets `status: "unavailable"`; it may retain the exact prior NYC fixture for an explicitly labelled prior answer, but it never changes the fixture's location. The missing-cloud variant marks only cloud evidence unavailable, and authored scores omit the cloud-bound occlusion entity.

`proposeScore()` returns a deterministic, development-authored score; it does not call or impersonate a runtime model. `acceptScore()` applies the closed Draft 2020-12 model-proposal schema and host semantic checks, while evidence/provenance, locks, seed, budgets, revision/generation/token, and event timestamps remain host-owned. Invalid proposals retain the current authored/accepted score as the fallback when one exists.

Transitions are declarative state. A renderer may animate `transition.durationMs`, then call `completeTransition()`; the controller never starts an uncontrolled timer. `stop()` advances the cancellation generation/token and interrupts expression while preserving facts. For deterministic late-delivery tests, call `createDelayedPatch()`, change/stop/dismiss the response, and pass the issued object to `deliverDelayedPatch()`; stale, dismissed, replayed, or fabricated patches are rejected.

The trace uses deterministic monotonic timestamps, contains synthetic identifiers rather than raw request text, and is bounded to 128 events by default (configurable from 1–256 for tests). No state is durable.
