# Paris overnight reference-to-implementation pass

Date: 2026-10-15. Source: `565b5ad6c4b62cf903cf903288941ce8f95850ff`, branch `week4`, existing dirty owner tree preserved. No new Paris implementation baseline accepted.

## Owner instructions and limits

- Generate the R7 official refinement directly in ChatGPT/Codex; Weave-only is suspended until the owner restores it. See [active override](../../../../../docs/design/FIGMA_WEAVE.md).
- Preserve R5A foreground/composition/material colors; overlay R6C point mapping and R4C detailed/dither materials within the same surfaces. Use the [official prompt](../w4-20261015-layered-mapping-glyph-r7/prompts/layered-surfaces.txt) unchanged, with model/reference-routing instructions outside it.
- Review the actual image against all three inputs and the owner's comments. Do not revise a satisfactory image. At most **five corrective generations total across this overnight pass**, stopping early on a satisfactory result; no infinite self-review cycle. An unmet hard requirement at the cap is a blocker, not acceptance.
- Then create consistent images describing the four construction stages and the remaining user flow; then actual video references; only after successful inspection create the final implementation handoff and launch a new Astra terminal conversation.
- Work hands-free where the available tools and ordinary permissions allow. No bypassPermissions, account-security bypass, cookie transfer, speculative model identity, fake assets, automatic phase acceptance, commit or push.
- Browser access is limited to the task's ChatGPT/generation pages and local EVA demo. No unrelated sites, chats, account content or online research.
- Owner hopes to inspect a finished visual demo at 10 AM local time. This is a target, not a verified completion promise.

## Current route and recovery

Claude-in-Chrome initially timed out. Owner explicitly approved trying DevTools; its separate profile reached Google sign-in and the owner reported an insecure-browser block. That ChatGPT tab was closed without handling credentials or weakening browser security. The regular Chrome extension reconnected through its normal connection selector. Only ChatGPT was intentionally navigated.

Three original 3840x2160 references uploaded separately, in order:
1. [R5A Glyph fields](../w4-20261015-c-abstract-surfaces-r5/references/images/img-a-glyph-fields.png).
2. [R6C Color-accented scan](../w4-20261015-c-mapping-surfaces-r6/references/images/img-c-color-scan.png).
3. [R4C Layered research](../w4-20261014-paris-hybrid-crossing-r4/references/images/img-c-layered-research.png).

ChatGPT Create image mode was selected. Request explicitly asks for GPT Image 2.5 and no substitution if unavailable. The UI does not expose the underlying image model version: **requested GPT Image 2.5; actual version unverified**. A progress indicator was observed in the new conversation; no claim of completed or inspected output yet. Existing R7 Weave failed-submission outcome remains unresolved; this is a distinct, newly owner-authorized direct-ChatGPT attempt, not a claim that R7 was uncharged.

## Keyframe review rubric

Hard requirements: one oblique unified scene; exactly the existing crossing pair plus two farther people; preserved foreground placement/poses/material palette; warm olive café, brown wood/rattan, off-white clothing and small rust strip; substantial black wall/ground gaps; distinguishable point/glyph/detailed materials overlapping in the same perspective; no doubled doorway/buildings, broad blue/magenta, solid road, scan rings, new objects, extra panes or sensor claims. Two upper-right natural-material generated-study panes with correct labels. No new scan/glyph overlay across people.

Inspect full frame and foreground/material/pane crops, compare directly with originals, and record deviations. The prompt's approximately five-percent colored mapping-sample target is qualitative unless actually measured. Generated model prose is not proof of fidelity, resolution, run identity or model version. If correction is needed, use the original references plus the current candidate and target named discrepancies only; retain every candidate. No pixel-composite substitute for generation.

## Bounded supporting still set (after keyframe selection)

Four individual stage images use the selected keyframe's SAME camera, objects, positions, foreground palette and two-pane vocabulary; no vehicle or other obsolete r1 object is introduced:
1. Detection-inspired, 0–7 seconds: 4–6 thin object-attached open rectangles and short nouns; stable entity IDs; no confidence scores.
2. Segmentation-inspired, 7–14 seconds: B/W point-density/material separation with disconnected silhouettes; no rainbow masks or opaque filled environment.
3. Optical-flow-inspired, 14–21 seconds: short authored trails on the existing crossing figures/particle transfer; architecture anchored; no historical-flow measurement claim.
4. Spatial-reconstruction-inspired, 21–30 seconds: front/back depth, partial sections/occlusion, merging into the layered keyframe with black gaps retained.

Two supporting flow boards: (a) synthetic desktop/research windows → visible source-region particle transfer → stage 1; (b) final scene hover/keyboard focus → pinned object/source explanation → revision preserving unaffected IDs/pins → interrupt/return. These boards may depict several labeled moments but must not change the keyframe's composition. Real source provenance comes from the existing approved local source records; generated details remain illustrative, never archival evidence. No private desktop screenshots or actual unrelated apps are used.

Planned initial still count: keyframe + four stage images + two flow boards = seven. Five corrective generations is a global ceiling, not an allowance per image. No gratuitous variants.

## Motion references (after still inspection)

Generate two bounded actual motion studies if an authorized usable video route is available:
- Construction: source-window particles and four distinct stages resolving to the selected keyframe; fixed camera; no crossfade-only finished-image reveal; duration supported by the actual service, with any inability to cover the requested 30-second sequence disclosed.
- Interaction/return: object-local hover/focus density, pinned explanation, local revision, interruption and orderly return. No camera or real OS action is implied by a concept clip.

Inspect temporal samples and preferably playback; record timing and limits. Preserve generated clips as references, not runtime playback. No new temporal UI work without usable motion evidence. No silent switch back to paid Weave: its per-run structured approval requirement remains binding if that route is used.

## Implementation handoff contract

After actual packets are ready, prepare a standalone prompt naming selected files, rejected deviations, source revision, exact scope and checks. Launch a new terminal session with `claude-gpt-6-astra[1m]`, ordinary permissions, no silent model fallback, no commit/push. Astra owns integration and substantial Rust scene work; at most three bounded native workers, isolated parallel writers. Main reference-authoring session must not race UI edits.

The demo is authored procedural Rust/WASM geometry/particles/materials in the current browser host, not still/video plates or photo-derived final-object pixels. Preserve deterministic clocks, pause/replay, reduced motion, keyboard focus, stable IDs/pins and explicit WebGL2 failure. The current broker is a mocked platform-neutral library: use clearly labeled synthetic desktop windows for this visual demo, not real application minimization/restoration or claims of native implementation. No camera, microphone, voice, installation or production side effects.

Require matching before/after captures, relevant Rust/core/app tests and typechecks/build, and a reproducible local visual-demo command. Retain failed checks and fidelity gaps. No owner acceptance inferred from sleep, automation, generation or green tests.

## Keep-awake

Temporary process-scoped Windows `SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)` request launched, PID 29304. Active status verified from its log. Expires 2026-10-15 10:15 AM local (UTC−04:00); display sleep remains allowed. No persistent power-plan changes. Process can be stopped early; it releases its request on normal exit. This prevents idle system sleep, not explicit shutdown/sleep, lid policy, browser disconnection, model limits or permission prompts. No implementation session has been launched yet.
