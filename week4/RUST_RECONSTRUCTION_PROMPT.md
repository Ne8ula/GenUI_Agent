# Seed-33 Rust Reconstruction

## Assignment — execute the corrected vision, not the previous shortcut

Rebuild the entire Seed-33 Paris café scene through **Rust-owned procedural geometry, materials, construction and rendering**. This is an implementation assignment, not a request for another proposal, image-backed visual pass or overlay adjustment. Once the mandatory prerequisites below are satisfied, carry the bounded rebuild through implementation, verification, visual comparison and a reviewable handoff without repeatedly asking permission for routine work.

The owner's controlling requirement is:

> I do not want to use the image as a background during coloring, I want this entire scene to be rebuilt through Rust. […] The reveal process should creating the wireframe from scratch on Rust, then the basic colors, then the details, etc.

**References specify appearance, not runtime pixels.** Rust must construct the scene, not merely control an image reveal. Using Rust alone does not establish fidelity; demonstrate the result visually and structurally.

## 1. Recover context and obey the gates

Read `AGENTS.md`, `docs/development/AGENT_WORKFLOW.md`, `docs/design/FIGMA_WEAVE.md`, `DESIGN.md`, `week4/PLANNING.md` and the latest correction in `week4/docs/design/acceptance/w4-visual-steps.md`. Inspect git status and preserve all existing uncommitted/concurrent work. Stay in `week4/`; do not modify Weeks 1–3, reset, clean, switch the shared branch, commit or push.

The existing raster-backed candidates are historical evidence, **not accepted implementation baselines**. Preserve their assets, recordings and code while replacing their role in the active reconstruction path. Keep the owner-selected Seed-33 aesthetic; the correction changes how it is made, not the intended composition.

**Mandatory visual prerequisite:** obtain fresh, change-specific Weave image AND video references for this complete procedural construction pass through the existing official Figma/Weave connection. Inspect actual outputs and record the scoped packet, selected aspects, run/model IDs, settings, costs, guidance and before-captures before visual source edits. Existing packets guide context but do not automatically authorize this distinct pass. Do not generate merely to test connectivity, inherit an earlier allowance, retry an uncertain submission or substitute another provider. Quote each run and obtain required explicit cost approval. If this prerequisite is missing, perform only read-only/non-visual preparation and report the precise blocker; do not implement a procedural visual substitute to bypass the gate.

References should study the SAME Seed-33 scene at wireframe, base-material, detailed and living stages. Do not let generated references introduce another city, composition, palette or art direction. Exclude generated mistakes explicitly.

## 2. Non-negotiable runtime boundary

Build scene geometry, material evaluation, construction state, animation and GPU draw submission in Rust. Prefer a Rust/WASM renderer embedded in the existing browser fixture so the React host can retain controls and capture integration. JavaScript may load WASM, forward bounded inputs and manage the host; it must not remain the actual scene/material renderer while Rust supplies token metadata.

Inspect available tooling and dependencies before selecting the exact Rust GPU integration. Do not assume an existing Rust renderer exists: the current Week 4 Rust foundation is a stage broker, while the current graphics are TypeScript WebGL2/Canvas2D. Keep visual code separate from broker authority. If the actual environment cannot support the proposed Rust route, disclose that blocker instead of silently substituting TypeScript rendering.

**Forbidden in the new scene path:**

- Reference-image backgrounds, environment plates, projected scene images, figure cutouts, scene atlases, reference-derived masks or generated movie/pose-frame playback.
- Cropping, tracing every source pixel, converting a reference into a pixel-colored point cloud, encoding it into arrays, or disguising it as a procedural texture. Those are image reconstruction shortcuts, not an authored procedural scene.
- Retaining the image-backed scene beneath new wireframes, revealing it with opacity/clipping, or falling back to it when Rust fails.
- Rendering one completed scene to an image and progressively unmasking that image as the construction sequence.

**Allowed:** independently authored vertices, curves, meshes, parameters and material rules informed by visual inspection; seeded mathematical noise; procedural textures generated from those rules; GPU buffers, intermediate render targets, depth buffers and post-processing of the renderer's own live output. Their content must originate in the procedural scene, never in reference pixels. Bundle no reference-derived scene imagery into the new runtime path.

## 3. Fidelity target — do not retreat to a generic wireframe demo

Preserve Seed-33's seated, fixed-camera Paris café composition and its depth relationships: street/façade perspective, roofline and chimneys, lamps, left foreground woven chair, café table, cup/saucer, glass ashtray, near coat-wearing figure, distant walkers and anchored color accents.

Preserve the distinctive **warm bone light on deep umber/near-black, beaded/stippled line structure, sparse fine architectural strands, controlled halftone/dither and restrained coral/ochre/cream accents**. Neither a conventional shaded low-poly city nor photorealistic stock scenery is an acceptable substitute. Do not change the composition to accommodate easier geometry. Do not make a dashboard, card layout or decorative screenshot reproduction.

Represent the recognizable objects as actual procedural geometry with stable IDs and appropriate depth/occlusion. Author enough structure for the reference to remain recognizable without any image layer. Use curves, surfaces and instancing where appropriate: cup/saucer profiles, chair frame and woven lattice, table surface/edge, repeated façade/window details, lamp structure and articulated figure parts. Do not claim unimplemented 3D or head tracking; preserve the existing fixed-camera scope while designing geometry that supports coherent visibility.

## 4. Procedural materials must do the visual work

Every visible material must have an explainable mathematical/geometry origin and explicit parameters. Examples of the required approach:

- Architecture: authored edges/planes and repeated structural elements, with seeded line occupancy, bead spacing, local breakup and depth-aware light treatment.
- Chair: constructed frame and woven/rattan pattern derived from intersecting geometry or local surface coordinates, not a chair photograph.
- Table, cup and saucer: constructed surfaces with restrained procedural tone, stipple and edge highlights; no source-image projection.
- Glass/ashtray: explicit form, rim and authored transparency/highlight behavior; label approximations honestly.
- Figure: articulated body/clothing geometry with procedural warm stipple/bead material. No textured torso cutout attached to procedural legs.
- Color accents: procedural flat/dotted/dithered/scanline materials on identified regions, whose bodies genuinely split into rows/fragments, disappear locally and reconstruct at fixed anchors.

Keep patterns stable in object/local coordinates. Avoid texture swimming, unseeded randomness, full-scene noise or global flashes. Localized chromatic glitch accents may remain, but must corrupt the procedural geometry/material or live renderer output—not sampled reference pixels. Fine tracking rectangles are supplementary; they cannot substitute for material breakup.

## 5. Construction is actual creation, not a reveal trick

Use one deterministic scene model with explicit, inspectable per-object construction stages:

1. **Structure:** strands/edges are born and extend from authored anchors, constructing wireframes in space. No hidden completed image underneath.
2. **Form and base material:** surfaces/volumes assemble from those structures and acquire their basic colors. The same object identities and geometry evolve; do not crossfade to another representation of the whole scene.
3. **Detail:** woven structure, beads, stipple, façade features, rims, clothing detail and local lighting develop from bounded procedural rules.
4. **Living scene:** figures walk, restrained atmosphere moves, and anchored tile bodies continue irregular localized corruption after construction ends.

Stagger components in a readable, near-first progression. Preserve the approved strand language, but rebuild its source procedurally rather than tracing image bands. Local alpha can soften individual primitives; it must not be the mechanism that reveals the environment. Keep the final detailed scene visible and alive rather than settling to a static backdrop.

The near figure faces away and walks slowly left and into depth beside/behind the chair. Use separate limbs, coherent joint constraints, alternating planted/swinging feet, opposing arm motion, modest weight transfer and clothing lag. No rigid sprite glide, approaching/enlarging toward the viewer, disconnected limbs or conspicuously broken knees. Visual inspection—not just kinematic tests—must establish whether the gait looks human.

## 6. Preserve controls and scope

Seed, time and explicit inputs determine output. Preserve pause/resume, scrubbing/manual stepping, local overlay visibility, reduced motion, resize and scene identity. Reduced motion must have a stable representative state, not merely slower flicker. Hide/show must not reset clocks or regenerate unrelated geometry.

Retain existing backend controls where truthfully supported. Do not label a renderer as Rust/GPU when a different path is active. Any fallback must remain procedural and be explicitly labelled; an image-backed fallback is prohibited. If parity cannot be implemented, report the limitation rather than fake it.

Do not add camera access, microphone/voice, provider inference, desktop window movement, wallpaper effects or phase advancement. No ComfyUI installation or external model download. Runtime inputs remain bounded data, never model-generated executable shaders/code.

## 7. Execution ownership and one-shot discipline

Astra owns implementation and integration, per the owner's explicit **NOT Sonnet** instruction. Use project-native agents only within their authorized roles; read-only research/review can assist. At most three workers concurrently, one writer per file, isolated worktrees for parallel writers. Record actual routes/tools without pretending a coordination record is execution.

After prerequisites clear, implement the complete bounded path rather than stopping at a plan, scaffold, one object or passing unit tests. Work in reviewable internal checkpoints: complete scene structure → base materials → detail → construction choreography → live behavior. Compare each against the same scoped reference packet and correct deviations within that pass. A new visual direction needs a new packet, not silent scope expansion.

Do not lower the target to make a test pass. If a technical or visual blocker genuinely prevents completion, retain the partial result and identify exactly what remains; never claim a finished reconstruction.

## 8. Verification that proves the corrected approach

Before calling the candidate ready:

- Test Rust geometry bounds, indices, deterministic seed/time output, construction progression, resource budgets, gait constraints and reduced-motion invariance.
- Verify the build and actual browser/WASM path; test pause, stepping, visibility, resize and failure behavior. Measure real frame/resource behavior, distinguishing fixed-time recordings from real-time performance.
- **Image-dependency negative test:** block/remove access to all historical Seed-33 scene PNGs/atlases/reference files in the test environment, without deleting historical repository assets. The NEW scene must still render its complete geometry, materials and motion. Inspect runtime network requests and compiled/runtime dependencies. Code searches alone are insufficient evidence.
- Capture the same viewport/DPI at wireframe-only, base-color, detailed, fully formed and late post-formation times. These must visibly demonstrate newly constructed objects, not increased exposure of an image.
- Record the whole construction and at least ten post-formation seconds; also capture figure gait and tile-body corruption closely enough to judge them. Inspect actual frames/motion and disclose playback limitations.
- Compare the settled scene directly with Seed-33: silhouette, camera, object positions/proportions, density, warm palette, material character, detail and occlusion. List material fidelity gaps honestly. A recognizable but crude blockout is not final fidelity.
- Provide a provenance inventory explaining every runtime visual resource. Any procedural texture or render target must identify its generator and inputs.

Keep categorized immutable evidence and `REVIEW.md`/`provenance.json` under a new Week 4 revision. Do not overwrite old candidates. Finish with changed files, actual model/tool provenance, executed checks, matched captures/recordings, known gaps, a reproducible run command and the next owner exercise. Tests and agent judgement never grant owner acceptance.

## Definition of success

With every reference image unavailable to the runtime, the viewer still sees the recognizable Seed-33 scene **constructed by Rust from wireframes, through procedural base materials, into detailed living geometry**. Nothing is secretly a reference-image backdrop or cutout. The visuals—not the choice of language or a green test suite—demonstrate the fidelity. Owner acceptance remains pending until explicitly given.
