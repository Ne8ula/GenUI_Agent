# Seed-33 Rust fidelity R5

**Candidate19 implemented and technically verified; architectural realism remains incomplete. Gait timing unchanged/deferred because the generated video is not a usable walking cycle. Accepted baseline: none. Owner acceptance: pending.** Continued 2026-10-13 within the same R5 pass; no duplicate still generation.

## Review candidate19

- [Reference / candidate18 / candidate19](implementation/after/comparison-reference-before-after.png)
- [24-second construction and living clip](implementation/after/candidate-19-motion/rust-construction-and-living-24s.mp4) — 361/361 stepped frames, not a performance measurement.
- [Unstepped observation](implementation/after/candidate-19-motion/realtime/a8514d7305f13cf829b0b024ad5cb953.webm) — 12-second observation after readiness, with navigation/startup retained.
- [100ms figure samples](implementation/after/candidate-19-motion/gait-samples-100ms.png), [1s construction overview](implementation/after/candidate-19-motion/construction-overview-1s.png).
- [Checks and resources](implementation/candidate-19-checkpoint.json), [127-file source manifest](implementation/candidate-19-source.json), [source diff](implementation/source-changes.patch).

**Passed:** 20 Rust tests, 207 app tests, typecheck/WASM/production build, 47 production-browser checks, 361-frame recording. Runtime historical-image requests were actively blocked; controls, resize, reduced-motion pixel invariance, context restoration and allocation failures passed. Main inspected actual before/formed/structure/base captures and temporal sheets, not full-speed playback. Existing Rust dead-code warnings remained nonfatal. Final audit verified127 unchanged captured source hashes, four matching archived Rust files,19 local links and52 media hashes; JSON parsing, Rust formatting and git whitespace checks passed (existing LF/CRLF warnings only). Audit record: `implementation/final-verification.json`.

Implemented: three deterministic shopfront grammars with deeper true openings, transoms/stiles/handles; additional cornice return faces; separate stone/glazing shader branches and quieter residential mullions; static waist shaping, unequal vertical coat folds and a shaped hem. Existing gait solver, period/speed, support transfer, arm/body phase and time-dependent cloth lag are unchanged. No camera/furniture/tile/host/GPU lifecycle edits.

## Measured resources

Matching six-second Windows Chrome samples, 1920×1080 viewport/DPR1, controls visible. These are RAF intervals and CPU generation/submission wall time, not GPU duration or native/WebView2 measurements.

| Sample | RAF median / p95 ms | CPU-submit median / p95 ms | Max WASM bytes |
| --- | --- | --- | --- |
| Candidate18 fresh before (855 samples) | 6.9 / 7.1 | 5.2 / 6.8 | 32,571,392 |
| Candidate19 (862 samples) | 6.9 / 7.1 | 5.3 / 6.7 | 32,833,536 |

Frame p95 is unchanged; the 0.1ms CPU p95 difference is not evidence of a meaningful speedup. **WASM increased262,144 bytes**, not improved. Settled uploads remain approximately2.49MB/frame; requested vertex storage12,058,624 bytes and render targets64,488,960 bytes are unchanged. Historical R3 regressions remain intact.

The full-construction recording is a different scenario: final WASM33,685,504 bytes, requested vertex buffers19,922,944 bytes, render targets74,649,600 bytes with capture controls hidden; 50,762 triangles,12,501 segments,353 objects. Its cached-frame draw time/upload counters are not representative performance samples.

## Inspected references and before-state

- [Contact sheet](references/contact-sheet.png), [fresh architecture/cloth still](references/images/img-01-depth-cloth.png) — selected for architectural depth and static cloth drape only; crossed feet rejected.
- [Fresh video](references/videos/vid-01-support-cloth.mp4), [30 temporal samples at 200ms](references/videos/gait-samples-200ms.png) — **rejected for gait timing**. Near-static split stance, minor foot/arm/cloth motion, cropped head and photographic style; no complete support cycle. No full-speed playback or biomechanical validation claimed.
- [Matching candidate18 before-state](implementation/before/candidate-18-recheck/formed-12000.png), [before checks](implementation/before/candidate-18-recheck/checks.json), [source manifest](implementation/before-source.json).
- [Exact prompts, inputs, approvals, run IDs and inspection](provenance.json).

Main inspected the actual still and video sample sheet with Read. Select deeper shop doors, broad stone piers, dark reveals with narrow lit edges, layered cornice/lintel profiles, sloping rounded shoulders, vertical cloth folds and uneven static hem. Reject crossed feet, incidental furniture/tile/composition changes, and video movement as a walking model.

## Bounded implementation contract

Owner: “Continue the leftover workload,” then “Can you resume the work. What other tasks are there to do, manual mode is on.” Continue Week4's procedural Rust reconstruction, not another phase. Keep the fixed camera, all existing IDs/anchors, furniture, tiles, controls, construction stages and procedural-only runtime. No reference-image pixels or movie playback enter the renderer.

1. Introduce deterministic shopfront grammars for the **lowest row, row 3** (source verified: `v=0` is roof, `v=1` ground). Doors/transoms and wider display bays keep physical inset planes, connected jambs and actual wall holes. Preserve existing facade/window/jamb IDs; add bounded deterministic detail only.
2. Layer building-aligned cornice lips/returns and introduce shopfront stone surrounds. Prefer local depth and selective edges over dense repeated mullion grids. Preserve roof anchors and IDs; no wholesale roof/camera redesign.
3. Separate stone and glazing from the shared wall-dot treatment. Keep stable authored local-coordinate material rules and a dark recess. No sampler, runtime shader input, image or screen noise.
4. Static coat-profile refinement only: modest waist shaping, nonuniform vertical folds and a static uneven hem; retain the existing time-dependent lag unchanged. Leave `leg`, foot roll/contact, route/speed, support shift, pelvis/shoulder phase, arm swing and head placement unchanged. A new usable motion reference is required before a later gait-timing change.

Main Astra owned source implementation; helpers read-only. Authored source: `renderer/src/{scene,materials,gait,lib}.rs`; generated WASM through the existing build. Geometry helpers, the two-row evaluator and GPU lifecycle are unchanged. Source HEAD `e43c7ae` plus existing dirty candidate18; all 127 hashes matched before preparation and on resume. Five originals preserved under `implementation/before/source/`; four changed Rust files archived under `implementation/after/candidate-19-source/`. Fresh matching production build/capture completed successfully before edits.

Read-only `eva-researcher` (configured `claude-gpt-5.6-terra[1m]`) inspected prior source and candidate18 capture with Read/Glob/Grep; no edits, tests or new-reference inspection. Its opening-row recommendations disagreed, resolved above from actual source. Provider transport for that helper has not independently been correlated. Session-linked Gateway metadata confirms main Codex `gpt-6-astra` and native reviewer Anthropic `claude-opus-4-8` on 2026-10-13. Ruflo routing was advisory only.

The independent native Opus review found **no confirmed correctness defects** in opening/ID bounds, material12/13 routing, joinery placement or static coat seam/bounds; it confirmed gait solver/timing/temporal lag unchanged. Read-only source reasoning, not an independent test run or aesthetic acceptance. It noted a negligible surround overlap into the adjacent pilaster zone, not an actionable defect.

## Spending and recovered blocker

Still: Nano Banana 2.1 (`fal-ai/nano-banana-2/edit`), run `c4df34e3-7a63-4e37-b911-5a467fc9f7f7`, 2752×1536. Structured owner approval: **5 Weave workspace credits**, submitted once. Input was the already-hosted original Seed33 output; no private/local upload.

The previous Kling model could not be resolved. Veo 3.1 Text to Video (`google-veo3-t2v`) was discovered through the same official MCP. Two quote-only calls were denied by auto mode, the second after explicit quote-only retry permission. No job started from either denial. After the owner resumed in manual mode, the quote succeeded at **90 credits**, separately approved through a structured question. Exactly one video job `4992d768-4dc9-4c73-a988-34f834045f7f` completed: six seconds, Fast, 720p, 24fps/144 frames, silent, seed33, no prompt enhancement/auto-fix. Result retained despite failed gait brief.

**Total approved/spent: 95 credits. Further allowance: zero.** A temporary plan-mode switch paused editing; inspection continued read-only, then the harness exited plan mode. No permission settings were modified or bypassed.

## Remaining work and owner exercise

1. **Gait realism:** unchanged and still stylized. The paid video failed its walking brief and is retained as rejected evidence. A usable fresh motion reference (separately quoted/approved) is needed before changing support/heel/body timing. No further spend is authorized.
2. **Architecture and cloth fidelity:** less repetitive openings and shaped cloth, but broad massing/roof detail remains schematic, the right facade is very dark, and visible dot grids still dominate the coat/stone surfaces. The reference's richer depth/light hierarchy is not reproduced exactly. No physical cloth or contact shadow was added.
3. **Owner visual exercise:** run `npm --prefix week4/app run dev`, then open `http://127.0.0.1:1440/?fixture=1&look=seed33&seed=33&build=12000`. Watch construction and at least ten living seconds; compare the linked before/after and test pause, tiles and reduced motion. No preview server is deliberately left running by the evidence scripts.
4. **Later gated work:** native/WebView2 measurements and other Week4 steps remain separate obligations, not authorized advancement from these checks.

The tests guard all existing facade/window/jamb/roof IDs, every true opening, bounded joinery and static coat seam/shape, plus the existing deterministic scene and gait constraints. Passing them is not anatomical or aesthetic acceptance. **Owner acceptance and every phase gate remain pending.** No commit, push or publication.
