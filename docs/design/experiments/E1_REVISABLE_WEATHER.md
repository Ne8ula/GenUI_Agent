# E1 — A weather response that yields and recomposes

Status: bounded E1 exploration, implementation, testing, and documentation **authorized** by the owner's subsequent 2026-09-17 instruction recorded in [AGENTS.md](../../../AGENTS.md), resumed 2026-09-23 under prompted permissions. This supersedes this document's earlier implementation-pending status. Finished E1 candidate acceptance remains pending; no S1/S2 or later phase is accepted. See the [E1 review record](../acceptance/e1.md).

Owner refinement, 2026-09-23: the first assembled candidate is “still too reliant on texts as a display.” The next candidate must make the weather composition and its response to intervention primary, with compact time/temperature anchors and source context. Full factual details remain immediately accessible on demand and in an effect-free plain answer; reducing text must not reduce factual access, keyboard control, or missing-data honesty. This is a revision request, not acceptance.

The subsequent [desktop-overlay refinement](../revisions/e1-20260923-02/REFINEMENT.md) explicitly authorizes implementing genuine Windows transparency and native empty-region input pass-through within E1. The actual desktop, not an enclosing stage or wallpaper simulation, is the composition space. Dispersed anchors and material preserve pins, focus and direct edits within the usable display area. A small accessible local affordance exposes controls; undrawn areas and dismissed surfaces must not block underlying applications. Capture matching before/after evidence and a short native recording over light, dark and busy **synthetic** backgrounds. No desktop-content inspection, new connector, ComfyUI, or later phase is authorized.

Owner addition, 2026-09-24: integrate the actual archived Week 1 procedural eye into the final E1 composition. Reuse its red dither/square-pupil vocabulary without changing `week1/`; make its surrounding pixels transparent, keep it noninteractive in the material window, and bind gaze to explicit selection rather than incidental desktop/pointer activity. Motion is bounded and interruptible; plain answer and dismissal remove it. This adds no voice, screen-content inspection, provider, or study phase.

## Question and scope

Can a small authored response vocabulary make an explicit user intervention legible in the behavior of the whole composition while preserving useful facts and direct control?

Build one synthetic NYC weather episode in the existing Tauri/React/TypeScript/Rust family. Preserve `week1/` as the runnable archive; any new experiment receives a separate workspace only when implementation is authorized. Reuse reviewed assets or small components by reference/copy with provenance, never edit the archive to become the experiment. Use [DESIGN.md](../../../DESIGN.md) as the contract and the [study proposal](../../research/GENERATIVE_UI_INDEPENDENT_STUDY_PROPOSAL.md) as the evaluation direction.

Transit remains a storyboard transfer critique in DESIGN.md. No live connectors, calendar workflow, personal memory vault, voice dependency, camera, Unreal, new GPU packages, ComfyUI, or broad policy-broker implementation is required.

## Reproducible synthetic fixture

Fixture ID `W-NYC-01`, revision 1. Location New York City, timezone America/New_York, date 2026-10-14, fixture as-of 08:00 that day. The exact values below are invented test data, not a weather report.

| Local time | Temperature | Cloud cover | Precipitation probability | Wind |
| --- | --- | --- | --- | --- |
| 09:00 | 18 °C | 70% | 10% | 12 km/h |
| 12:00 | 22 °C | 20% | 5% | 18 km/h |
| 15:00 | 21 °C | 45% | 15% | 16 km/h |

Create one missing-cloud variant and one invalid-location request using these same records; do not fabricate a replacement forecast. Keep fixture IDs, source label, as-of, units, values, and pseudorandom seed visible in the evidence packet. Runtime validation of a synthetic fixture must not be labeled verification of real weather.

## Episode and interventions

| Step | User action | Expected visible behavior | Evidence |
| --- | --- | --- | --- |
| 1 | Request NYC weather | Readable facts/source appear without waiting for animation; a bounded sun-like dither field gathers around noon, with cloud-cover occlusion | Recording and fact-binding trace |
| 2 | Select 15:00, or request afternoon | Immediate selection feedback; field parts and reforms around the selected anchor while noon loses emphasis | Event target and score revision; frame sequence |
| 3 | Move/pin the afternoon fact on the right | Local movement follows input; field attachment follows; no model call is needed | Input-to-frame latency and retained geometry |
| 4 | Compare noon with afternoon | Two labeled facts coexist; composition adapts around the pin instead of resetting it | Stable IDs, lock state, before/after score |
| 5 | Interrupt the revision halfway | Stop arrests pending expression; facts remain usable; no old transition resumes | Cancellation event and recording |
| 6 | Ask for less motion, then plain answer | Reduced intensity takes effect locally; plain answer retains scope, comparison, source, focus, and controls | Accessible reading state and keyboard check |
| 7 | Correct location to an unavailable fixture | Old NYC facts are not relabeled; show unavailable for the requested place and an explicit retained prior answer if useful | Negative fixture and evidence binding |
| 8 | Dismiss, then deliver an old delayed patch | Nothing reappears or speaks; the stale revision is rejected | Late-result rejection trace |

Repeat with the missing-cloud variant. Readable cloud cover becomes “Not provided”; the corresponding cloud effect stops or uses an explicitly unbound neutral rendition. It must not imply clear sky. Repeat in reduced-motion mode and with rendering unavailable.

Two authored interpretations of Step 4 make the design choice reviewable: **part and relate**, where one field separates around the pair; and **withdraw and re-anchor**, where the field clears, then settles around the changed focus. Both preserve information and user geometry. Candidate timings are adjustable parameters, not an inherited 15-second reveal.

## Proposed architecture

Retain Tauri 2 and React/TypeScript. React owns accessible facts, controls, focus, local geometry, and error/provenance presentation. A deterministic response controller owns stable IDs, event order, revisions, locks, cancellation, and resource limits. A small Canvas 2D or authored WebGL layer consumes approved parameters. The fixture still needs no privileged connector. The subsequent transparent-desktop refinement adds narrowly scoped, host-owned Rust commands for the application's own windows, hit regions, and render-scene/status exchange—not desktop-content inspection or a general policy broker. The material window, including the reused Week 1 eye, is noninteractive; the interaction window is clipped to actual local control/reading rectangles.

Define a closed JSON Schema Draft 2020-12 for the model-proposal portion of the [response-score sketch](../../../DESIGN.md#8-response-representation-and-architecture). Keep trusted evidence/status in a host envelope. Validate evidence references, units, primitive compatibility, resource limits, anchor validity, and base revision after structural validation. Do not put an authoritative `verified` or `permission` field in model output.

Useful event categories: request, fact exposure, explicit selection, local manipulation, pin/lock, score proposed/accepted/rejected, transition start/interrupt/settle, plain-answer change, renderer failure, and dismissal. Store response/revision/entity/fixture IDs and monotonic timestamps. Public traces contain synthetic data only. Event names are proposed contract design, not existing instrumentation.

Start with deterministic authored scores so timing, continuity, and rejection paths are reproducible. This establishes an expressive grammar, **not model-generated co-design**. A subsequent S2 score-composition trial must use an actually available, authorized provider, record its real model/version and inputs, and test unseen combinations of selected time, pin, comparison, and intensity. Include invalid outputs and fallback evidence. Do not claim generativity from manually switching among two movies. Frozen genuine model outputs may be replayed for matched-condition evaluation; label replay and distinguish it from live generation.

## Bounded renderer comparison

Compare the same dither-field primitive in Canvas 2D and development-authored WebGL before considering a new rendering stack. Reuse the archive's experience with WebGL only as implementation context, not a performance result. Confirm which source path is actually rendered.

- Run in the actual Windows Tauri window at 1440×900 and 2560×1440, with documented 100%/150% display scaling where supported. Record physical versus CSS dimensions. A browser run is supplementary.
- Record actual GPU/driver, WebView/runtime, refresh rate, power mode, and display configuration. The owner-reported RTX 5080 does not establish measured capability.
- Use the same fixture, seeded distribution, cell size, compositional recipe, reading layer, and input sequence. Begin with 2,000 field elements; test 8,000 only as a bounded stress case if the first case remains responsive. These are test loads, not requirements for visible complexity.
- Sample frame intervals over at least 30 seconds after warm-up and repeat three times per candidate/load; record median/p95/p99 and long frames. Measure input-to-next-visible-response for at least 30 local selection/manipulation events. Instrumentation and capture overhead must be stated.
- Proposed initial target: a 60 Hz display with p95 frame interval at or below 16.7 ms and p95 local feedback below 100 ms. These are acceptance candidates, not measured performance or universal HCI thresholds. If the display/test method prevents that comparison, report the limitation and use a documented refresh-relative target for owner review.
- Test reduced motion, plain answer, renderer/context failure, resize/DPI change, and dismissal. Check a settled composition for unnecessary continuous rendering. No generation-load benchmark is required while no generation service runs.

Select the simplest candidate meeting legibility, control, and measured response requirements. If neither does, lower effect density/area and retest the affected case. Only propose native `wgpu`, WebGPU, or another renderer after identifying a measured limit; do not replace the foundation on presumed visual superiority.

## What makes this more than a polished effect

| Property | Required demonstration | Failure example |
| --- | --- | --- |
| Contingent | Different explicit target or pin produces a corresponding different expressive transition, traceable to that event | Identical movie after every request |
| Situated | Weather variables and selected period determine appropriate material; qualitative imagery and factual scale remain distinguishable | Same spectacle for any dataset; cloud/rain probability conflated |
| Revisable | An intervention during motion changes the active score while preserving locks and facts | Revision restarts the scene and erases edits |
| Interpretable | Owner can identify what action changed the composition and offer an alternative reading, including “just decoration” | Developers declare attention from their own implementation alone |
| Usable | Correct values/context remain readable, keyboard controls work, plain answer and stop are immediate | Reading waits for a cinematic reveal |

Technical contingency can be demonstrated by traces. Perceived attention requires an account from a person. E1 owner critique supplies design feedback; broader claims require the approved evaluation in the study proposal.

## Checks and review packet

Before requesting the owner's final implementation decision, prepare the runnable experiment and exact commands, fixture/score/schema versions, actual checks, measured renderer comparison, visual recordings, and known limits. Do not populate successful results in advance.

Required checks:

1. Positive scores work; unknown/authority-bearing fields, invalid evidence, raw code/shader strings, excessive budgets, bad units/anchors, and stale revisions are rejected with usable fallbacks.
2. Every step above works by its intended input, with keyboard alternatives. Pin/focus/direct edits survive patches. Stop and dismissal invalidate queued work.
3. Reading layer reports exact fixture values, units, synthetic source, period, and missingness in expressive, plain, reduced-motion, and renderer-failure states.
4. Native-window captures show matching fixture/viewport/DPI, both response alternatives, affected error states, interruption, and a representative motion recording. Do not reuse an old Week 1 capture as current evidence.
5. Performance report separates target, method, measured values, failed cases, and untested platforms. macOS remains unverified until exercised there.
6. No archived Week 1 file changes, no provider/model performance claim from a preset, and no participant data in public evidence.

Proposed owner exercise: run Steps 1–8, repeat once with another selection order and pin position, compare the two authored attending behaviors, and report where the response attends, ignores, obstructs, or surprises. The review decision is accept / revise / reject for the **tested E1 revision**, not proof of a relationship or acceptance of all S1/S2 requirements.

Record actual evidence under `docs/design/revisions/e1-<revision>/`, update [the evidence index](../INDEX.md), and place the pending/final decision in `docs/design/acceptance/e1.md` when an implementation exists. This specification is not that acceptance record.
