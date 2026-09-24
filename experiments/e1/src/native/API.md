# E1 native overlay bridge contract

Status: frozen integration contract for the owner-authorized E1 Windows overlay. This is an implementation boundary, not E1/S1 acceptance and not a general desktop capability.

Type source: `src/native/types.ts`. Public adapter: `src/native/index.ts` (`e1NativeBridge` and hit-region helpers).

## Window and URL contract

| Window | URL | Native label | Role |
| --- | --- | --- | --- |
| Trusted controller / interaction | `/` | `main` | Sole controller state owner; facts, controls, focus, keyboard, DOM hit-region publication |
| Render-only material | `/?layer=material` | `material` | Authored field only; no controls or authority; always ignores cursor input |
| Browser fallback | `/` without Tauri globals | none | Existing single-view UI; all native methods return `null` or an inert unlisten function |

Both native windows are transparent, undecorated, always-on-top, skip the taskbar, and are sized to the Windows monitor **work area**, not the full monitor. The `material` window is kept immediately below `main`. Native startup leaves `main` fully input-open until the first valid hit-region update. The query parameter chooses rendering only; Rust validates the actual invoking window label for every command.

`getE1RuntimeInfo()` returns exactly one of:

```ts
{ native: false, layer: "browser" }
{ native: true, layer: "interactive" }
{ native: true, layer: "material" }
```

## Public TypeScript signatures

```ts
import {
  collectElementHitRegions,
  createHitRegionUpdate,
  e1NativeBridge,
  getE1RuntimeInfo,
  type MaterialScene,
  type MaterialSceneInput,
  type MaterialStatus,
} from "./native";

const runtime = getE1RuntimeInfo();
const metadata = await e1NativeBridge.getWorkArea();
const hitAck = await e1NativeBridge.publishHitRegions(update);
const sceneAck = await e1NativeBridge.syncMaterialScene(scene);
const stopScenes = await e1NativeBridge.onMaterialScene(handleScene);
const statusAck = await e1NativeBridge.reportMaterialStatus(status);
const stopStatuses = await e1NativeBridge.onMaterialStatus(handleStatus);
const dismissAck = await e1NativeBridge.dismiss();
```

`createHitRegionUpdate(sequence, regions)` fills the current CSS viewport and DPR. `collectElementHitRegions([{ id, element }])` reads bounded `getBoundingClientRect()` values and drops disconnected, hidden, pointer-ignored, or zero-area elements. `getWorkArea()` is cached once per interactive JavaScript context and establishes an opaque native `controllerSessionId`; its `nextHitRegionSequence` and `nextMaterialSceneSequence` are both `1`. A main-WebView reload establishes a new session, opens input, hides old material, and invalidates old scene/status traffic before counters restart. Callers own strictly increasing hit-region and material-scene sequence numbers within that session.

## Hit regions and DPI

The interactive UI publishes only bounded local DOM rectangles using `HitRegionUpdate` (`e1.hit-regions/1`): maximum 64 entries, finite CSS coordinates/sizes, unique short IDs, finite viewport, and DPR. Rust accepts calls only from label `main`, reads the native window scale factor itself, converts CSS coordinates to physical window pixels using floor(left/top) and ceil(right/bottom), clamps to the native client bounds, and applies the Win32 region union.

An empty list deliberately applies an empty native region and keeps input pass-through enabled. Invalid payloads or Win32 failures also force cursor-ignore mode; they never fall back to a full-work-area input surface. Decorative DOM is not published. DOM `pointer-events: none` is supplementary styling, not the native pass-through mechanism.

`WorkAreaMetadata` reports physical origin/size, CSS size, native scale, labels, and the fixed region limit. It exposes no screen pixels, active-application data, arbitrary HWND, or OS target.

## Approved material scene

The controller maps its current trusted E1 snapshot into `MaterialSceneInput` (`e1.material-scene/1`) and calls `syncMaterialScene`. It is a closed, serializable scene: synthetic fixture identity, three records, stable normalized anchors, selection/comparison, authored recipe, bounded transition, renderer choice/load, and bounded development benchmark/failure controls. It contains no HTML, CSS, shader source, script, URL, file path, network destination, permission, or model-authored IPC.

Rust accepts scene publication only from `main`, validates the active native controller session plus all enum/value/count/ID bounds, rejects stale `sceneSequence`, adds the opaque `controllerSessionId`, records the exact `(controllerSessionId, sceneSequence, responseId, revision, transitionId)` identity, and emits only to native label `material` on event `eva-e1://material-scene`.

The material layer subscribes with `onMaterialScene`, renders the latest accepted `MaterialScene`, and never calls controller methods directly. The adapter installs the event listener **before** invoking the material-only cached-scene read. Within one host-issued controller session it rejects every `sceneSequence` less than or equal to the accepted sequence; a real newer-session event supersedes an in-flight older cache reply and retired opaque sessions cannot become current again. No lexicographic ordering is inferred from session strings, so a first scene published during startup cannot be lost or replayed over a newer scene.

## Material return channel and transition completion

The material layer reports `MaterialStatus` (`e1.material-status/1`) through `reportMaterialStatus`. Rust accepts it only from native label `material`, bounds renderer counters/frame samples/diagnostics, and requires its `(controllerSessionId, sceneSequence, responseId, revision, transitionId)` to match the latest scene before emitting event `eva-e1://material-status` only to `main`. Native caching and the main adapter both reject a non-increasing `monotonicMs` within the same scene; the adapter rejects lower scene sequences and another controller session. Therefore an older cache reply or stats event cannot overwrite a newer `transition-complete` status.

Status kinds are:

- `scene-applied`: backend accepted the scene;
- `stats`: current actual material renderer and benchmark samples;
- `transition-complete`: the visible material transition settled or snapped to its authored cap;
- `renderer-failure`: an allowlisted code and at most 240 characters of plain diagnostics.

The interactive layer must cache actual native material status for its dev/test harness. It must not report or benchmark a hidden duplicate canvas in `main`.

`controller.completeTransition()` is permitted only after a `transition-complete` status whose five identity fields still equal the controller's current native scene and whose stats report `settled: true`. A stale/mismatched/failure/status-only message never completes the controller transition. Browser fallback may retain the existing same-view completion path because no second WebView exists there.

Benchmark requests travel in `MaterialSceneInput.renderer.benchmark`; duration is capped at 60,000 ms. Measured frame samples return once at completion in `MaterialStatus.stats.benchmark.samplesMs` (maximum 18,000 finite samples, enough for a 30-second 143 Hz run without predecessor truncation). Failure simulation is bounded to the existing authored enum. Diagnostics never include screen content, file paths, private data, arbitrary logs, or raw exceptions.

The eye and relation line also render in `material`; they are host-authored presentation derived from the same accepted scene, not new model-selectable capabilities. The eye has no pointer/audio observer and no native hit region.

Material status ordering uses `performance.timeOrigin + performance.now()` with a minimum strictly increasing increment when two reports share a coarse clock tick. This is an ordering clock, **not** input-latency evidence. Frame distributions use the independent rAF interval samples. A settle may report completion again after a renderer-setting change; an earlier completion attempt may have been legitimately superseded, and the five-field gate still rejects a stale report.

## Dismissal and lifecycle

`dismiss()` is accepted only from `main`. Rust first forces an empty/cursor-ignored interactive surface, then hides/closes both linked windows so no invisible input blocker remains. Reopening requires an explicit new application launch; there is no tray listener, global key capture, cursor polling, screen inspection, connector, or background overlay revival.

The UI maps `Escape` to its local controller dismissal followed by this native dismissal when no more-specific control consumes the key. Native close of either linked window closes the peer. Material renderer failure does not expand the hit region; the main reading/control layer can remain usable until explicit dismissal.

## Native command/event names

These are adapter internals, not UI call sites:

| Direction | Name | Authorized sender/recipient |
| --- | --- | --- |
| invoke | `e1_get_work_area` | `main` sender only; begins one controller session per adapter context |
| invoke | `e1_publish_hit_regions` | `main` sender and active native session only |
| invoke | `e1_sync_material_scene` | `main` sender and active native session only |
| invoke | `e1_get_latest_material_scene` | `material` sender only; startup-race recovery |
| invoke | `e1_report_material_status` | `material` sender only; must echo the delivered session |
| invoke | `e1_get_latest_material_status` | `main` sender and active native session only |
| invoke | `e1_dismiss_overlay` | `main` sender and active native session only |
| event | `eva-e1://material-scene` | native host to `material` only |
| event | `eva-e1://material-status` | native host to `main` only |

No command accepts a window label, HWND, URL, shell command, path, network target, desktop content, or privilege field from JavaScript.
