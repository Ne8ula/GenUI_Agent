# Seed-33 Rust fidelity R3

**Candidate 17: implementation and browser verification complete; owner acceptance pending.** This is progress, not an exact reconstruction or an accepted phase. Astra implemented/integrated; helpers were read-only. No commit, push or phase advancement.

## Start here

- [24-second construction and living scene](implementation/after/candidate-17-motion/rust-construction-and-living-24s.mp4) · [12-second gait close-up](implementation/after/candidate-17-motion/gait-closeup-12s.mp4)
- [Before/after](implementation/after/candidate-17/comparison-before.png) · [Fresh reference comparison](implementation/after/candidate-17/comparison-reference.png) · [Original target comparison](implementation/after/candidate-17/comparison-original.png)
- [Unstepped browser recording](implementation/after/candidate-17-motion/realtime/2dfc1dc76c72c6bcf675843a026998dd.webm)
- [Reference contact sheet](references/contact-sheet.png) · [Selected still](references/images/img-01-fidelity.png) · [Motion reference](references/videos/vid-01-gait.mp4)

## Scope and source

Resume the owner's identified gaps: schematic architecture, too-dark coat and stylized gait. Source `e43c7ae` plus existing dirty Week 4 work; accepted baseline **none**. Candidate 16's 127 source hashes matched before editing; [before manifest](implementation/before-source.json), digest `c346f676d4091826171d0fbf2b652749c3b2fecab14ebaffd9072e5a0e78e89c`. Its [formed](implementation/before/formed-12000.png) and [structure](implementation/before/structure-1800.png) captures were preserved unchanged, with a fresh [47-check before-state browser run](implementation/before/live-recheck/checks.json).

Candidate 17: [127-file source manifest](implementation/candidate-17-source.json), digest `8a64c7726ba6155f56a3cb1229d5296ae446b038dfb892a9f442f2c431f162a0`; [source archive](implementation/source-candidate-17.tgz). Manifest paths are relative to `week4/`; its explicitly documented digest recipe differs from older manifest recipes. The archive omits unchanged historical public images; their hashes remain in the manifest.

Only four authored source files changed from candidate 16: `renderer/src/scene.rs`, `materials.rs`, `gait.rs`, `lib.rs`; generated WASM rebuilt. Host layout/fonts, historical source/assets, GPU lifecycle code, browser drivers and generated JS are unchanged. Runtime references remain forbidden: Rust authors scene geometry, materials, construction, animation and GPU submission; React only hosts it. No image backgrounds, extracted poses or movie playback.

## Fresh references — inspected before source edits

Route: official Figma MCP direct Weave models, one submission per approval. Total **59 Weave workspace credits**, further allowance **zero**; exact prompts/settings/run IDs in [provenance](provenance.json).

| Output | Run / model | Cost and selection |
| --- | --- | --- |
| [Still](references/images/img-01-fidelity.png), 2752×1536 | `5211e4da-37e2-47da-9ced-e681fbc5dad7`; `fal-ai/nano-banana-2/edit`, Nano Banana2.1, 2K/16:9/seed33/High thinking | Structured Approve for5 credits. Select luminous warm-ivory rear coat, directional left light and recessed openings. Reject crossed-foot pose. |
| [Motion](references/videos/vid-01-gait.mp4), 1284×716, 24fps,145frames/6.041667s | `0dfb67c8-c2f5-4183-97aa-5fbd98818d7c`; `kling-3-turbo`, Standard,6s/16:9 | Structured Approve for54 credits. Select coat volume, soft hem and restrained shoulder displacement. Exclude rightward drift, crossed/floating feet and composition changes. |

Main Astra inspected the full still, [500ms overview](references/videos/overview-500ms.png) and [200ms gait samples](references/videos/gait-200ms.png) before editing. Temporal samples, not full-speed playback; audio unreviewed/excluded. Generated foot behavior is not an anatomical truth source. Analytic contacts preserve the owner's left/away requirement.

Recorded implementation guidance: actual openings/returns and projecting trim rather than camera-scaled plates; selective stone lighting; ivory cloth coverage across the torso rather than rim-only light; rolling grounded soles with continuous limb lengths and low swing clearance. Fixed seed33/camera/anchors and warm bone/umber/coral/ochre palette retained. Space Grotesk/IBM Plex host typography unchanged.

## Implementation decisions

- **Architecture:** omit window apertures from the wall mesh, inset dark window surfaces 0.075–0.120 authored units, connect real returns, add projecting sills/lintels and layered cornices/pilasters. Vary balcony presence and curved rails; reduce decorative lines. This adds actual depth, not a reference-image overlay.
- **Coat:** increase interior bead coverage and diffuse illumination, retain folds, separate dark rear head from a folded cloth hood on the back; darken near trousers relative to the coat. Brightness is visibly closer, but silhouette/cloth still look authored and stiff.
- **Gait:** solve ankle height/offset from the rotated ellipsoid sole's lowest point. Stance contact stays fixed through heel settling and toe-off; swing contact rises at most0.035 authored units. Existing limb-length, left/away travel and reduced-motion contracts remain. New tests exercise phase continuity and actual mesh ground clearance; these are not proof of naturalistic movement.
- **Resources:** lower coat/head/hood tessellation for the three smaller distant walkers, preserving stable IDs. Added architecture costs more static geometry; reduced distant rig detail reduces uploads, not necessarily frame time.

## Verification and evidence

Actual executed checks:

- `cargo test --manifest-path week4/Cargo.toml -p eva-seed33-renderer --lib`: **15 passed**.
- `npm --prefix week4/app run check`: **207 app tests**, TypeScript, Rust/WASM and production build passed.
- `node week4/app/scripts/capture-rust.mjs <revision>/implementation/after/candidate-17 1469 --production`: **47 checks passed**, no page errors; [report](implementation/after/candidate-17/checks.json). Covers actual Rust/no-media path, construction stages, pause/step, keyboard/focus, reduced pixel invariance, tile toggling, resize, context loss/restore, bounded memory and injected fail-closed allocations.
- `node week4/app/scripts/record-rust.mjs <revision>/implementation/after/candidate-17-motion 1470 --production`: **361/361 frames**, no errors/blocked media; [report](implementation/after/candidate-17-motion/recording.json). Fixed15fps sequence is not a performance test. Separate unstepped observation lasted12.114s.
- First new Rust test run:14/15 passed. The new architecture test incorrectly assumed a planar wall; these authored façades are slightly bilinear. Corrected the test to assert local recess/sill geometry and cast through the opening;15/15 retest passed. No renderer weakening to satisfy that test. Dead-code warnings remain.

Main inspected the formed capture, fresh-reference comparison, [construction samples](implementation/after/candidate-17-motion/construction-overview-1s.png) and [100ms gait samples](implementation/after/candidate-17-motion/gait-samples-100ms.png). Frame samples show bright cloth, connected lower limbs and left/away movement. Full-speed owner judgement remains necessary; no motion-capture/anatomical validation claimed.

## Measured resource tradeoff

Two actual6-second Windows Chrome runs at1920×1080/DPR1, controls-visible canvas1920×933. These are RAF and CPU generation/submission wall times, **not GPU duration** or native/WebView2 measurements. No repeat-distribution/causal performance claim.

| Measurement | Candidate16 fresh before | Candidate17 |
| --- | ---: | ---: |
| Samples | 865 | 815 |
| RAF median / p95 | 6.9 / 7.0ms | 7.0 / 13.8ms |
| CPU submission median / p95 | 5.7 / 6.3ms | 6.2 / 12.1ms |
| Mean uploaded bytes/frame | 3,728,826 | 2,486,295 |
| WASM memory during sample | 31,195,136B | 32,768,000B |
| Requested vertex-buffer storage | 13,631,488B | 12,058,624B |
| Requested live-target storage | 64,488,960B | 64,488,960B |

Uploads/vertex storage decreased, but timing worsened and WASM memory increased: **not an overall performance improvement**. Full-construction recording high-water allocations were34,406,400B WASM,19,922,944B requested vertex storage and74,649,600B targets at1920×1080 canvas. Browser reports ANGLE/NVIDIA RTX5080/D3D11; this is a renderer string, not physical-VRAM accounting. [Checkpoint and resource summary](implementation/candidate-17-checkpoint.json).

## Review and limitations

Independent native `eva-reviewer` found **no confirmed correctness defects** in the frozen scene/gait/material/tests candidate. Source-only review, not executed tests or aesthetic acceptance. They noted narrow IK reach/height headroom: future changes to stride, hip height or foot dimensions must recheck contact/limb-length bounds; no parameter changes are requested by this observation. Their stale-metadata observation was resolved by the candidate17 documentation updates, while source remained unchanged. [Final verification](implementation/final-verification.json): all127 source hashes unchanged after capture/recording,74 local links valid,58 retained media files hashed, JSON/formatting/whitespace checks passed.

Main Gateway metadata confirms Codex `gpt-6-astra`; recovery worker route Codex `gpt-5.6-terra`; review route Anthropic `claude-opus-4-8`. Ruflo routing was advisory only. No Sonnet implementation worker ran.

Remaining: architecture is more dimensional but still repetitive/schematic and broadly lit; woven/light-cell material is regular; coat/shoulders and gait remain stylized; glass is a sparse highlight approximation, not refraction. This pass does not establish an exact reference match or naturalistic gait. No native shell/WebView2, head tracking, camera, voice or desktop effects tested or authorized.

## Next owner exercise

Run `npm --prefix week4/app run dev`, open `http://127.0.0.1:1440/?fixture=1&look=seed33&seed=33&build=12000`. Watch construction, then the rear figure's left/away walk; compare brightness, depth and motion with the linked references. Pause/step, toggle tiles and reduced motion. Judge whether the remaining silhouette/architectural stylization needs revision. **Owner decision and every step remain pending.**
