# E1 faithful Weave recreation

**WITHDRAWN / QUARANTINED. Do not follow this packet's native launch instructions.** The owner subsequently reported system-wide black screens/freezes during Sunny→Rainy and rejected the extracted-frame approach. Prior passing tests did not establish native stability. The replacement is the [procedural CPU preview](../e1-20260924-procedural/README.md); native rendering remains blocked. Everything below is historical evidence, not a current recommendation.

**Historical status: candidate; never accepted.** 2026-09-24. Source: `cb7ac83688c075d2268ff6be06288e47e0467745` plus this working tree. Accepted baseline: none.

## Direction and implementation

The owner rejected the [approximate rendition](../e1-20260924-weave/README.md): generic sun/cloud geometry, shortened motion, and missing original cursor response were not faithful. The correction explicitly requests Rust GPU rendering and the imported keyframes/motion, including droplets and ripples. The subsequent instruction asks for a smaller eye.

- Actual source foreground artwork and 24 fps frame sequences replace the approximation. V1/V2/V3 contain 145/145/241 frames, approximately 6.04/6.04/10.04 seconds. Weather remains live fixture-bound interaction, not a full-desktop movie.
- Native rendering: Rust, wgpu **27.0.1**, DX12 DirectComposition premultiplied alpha, fixed owned material HWND. React remains the accessible control/fact surface with bounded native hit regions. Only one bounded decoded source frame/texture is needed at a time; late scene work is rejected.
- Original Week 1 anatomy, square pupil, red dithering, gaze/tissue easing and blink envelope are reused. Browser: E1-only copy of the actual component. Native: development-authored WGSL port; only the visible eye samples cursor position. No global hook, camera or desktop-content reader.
- **Smaller eye:** 60% of K0's eye size, same center. V1's source foreground scales from .6 to 1; V3 scales back to .6 as the eye returns. This is the owner's explicit size refinement, not an unchanged K0 scale.
- W-NYC-02: invented NYC 2026-10-14 sunny 22 °C / 2026-10-15 rainy 16 °C, America/New_York; as-of October 14 at 08:00. Speech and facts use the same closed validated source. Old intraday records remain separate.
- Native voice reuses Week 1's private configuration helper, Whisper route, ElevenLabs voice ID and shared v3/Natural 0.5 profile. Fixed calm/analytical delivery tags and an explicit two-sentence short-form exception. No arbitrary renderer speech/voice/model/URL payloads. Pending work and playback are cancellable.

## Source and fidelity boundaries

[Asset catalog/provenance](../../../../experiments/e1/quarantine/weave-derived/manifest.json) records original input hashes, frame counts and timing. [Derivation script](../../../../experiments/e1/scripts/derive-weave.py) uses local Pillow/NumPy/SciPy/FFmpeg, not AI generation. Originals are unchanged. Derived catalog: 534 files, 113,349,493 bytes when measured; native decoding is bounded rather than preloading the whole sequence into VRAM.

The exports bake background and text into RGB; they supply **no original alpha**. Source pixels selected by the chroma matte keep their RGB values. Matte edges/very faint translucent details are an extraction limitation. Generated background/camera drift is excluded; the supplied Mock Desktop remains fixed in browser preview and is absent from native rendering. Incorrect/interpolated generated labels are replaced with immediate fixture-bound native text. This is not a claim of pixel-identical reconstruction of the entire opaque video. No new visual assets were generated or uploaded.

## Actual evidence

- [Smaller-eye interaction recording](smaller-eye-sequence.mp4): browser preview, native-sized source artwork, real browser cursor input, typed test commands, muted audio; not a microphone/provider exercise.
- [Idle eye](smaller-eye-browser/idle.png), [eye-to-sun](smaller-eye-browser/eye-to-sun.png), [sunny endpoint](smaller-eye-browser/sunny.png), [rain/ripples during motion](smaller-eye-browser/rain-and-ripples-in-motion.png), [rainy endpoint](smaller-eye-browser/rainy.png), [return transition](smaller-eye-browser/return-transition.png), [returned eye](smaller-eye-browser/returned-eye.png), [plain answer](smaller-eye-browser/plain.png).
- [Browser checks](smaller-eye-browser/checks.json): 14 passed, no uncaught errors. Actual Week 1 shader gaze changes with pointer; facts appear before reveal; full source timing; NYC day carryover; return geometry; reduced motion/plain fallback; mid-reveal dismissal. Keyframe comparison is to the derived foreground catalog: sun readback difference 0; rain differs in 1,215 channel bytes by at most **1/255**, a resampling/readback tolerance, not a whole-video fidelity percentage.
- [Actual native smaller eye](native-idle-smaller-eye.png): guarded capture over the separate synthetic test process, Windows 11 / WebView2 153, 2560×1392 CSS/physical pixels, DPR 1. Native status reported `wgpu`; the image shows actual transparent GPU composition. Captured diagnostically after the input probe failed, not evidence that the failed probe passed.
- [Native input blocker](native-input-blocked.json): `SendInput failed`. [Subsequent capture blocker](native-capture-blocked.json): `SetForegroundWindow failed`; capture guard refused an unrelated full-screen overlap. No unrelated content/title was captured, no focus/security restrictions were bypassed. Native weather capture and actual OS click-through remain **unverified for this revision**. Test-native/fixture processes were stopped rather than disturbing that window.

Browser viewport 1440×810, DPR 1; source clock 24 fps. Browser evidence is not native GPU or physical-input evidence. GPU adapter/driver model was not recorded; no new performance benchmark or speed claim is made. Earlier failed diagnostic packets and recordings remain, including the overly strict zero-difference readback test and the initial approximation.

## Executed checks

- TypeScript: passed.
- Vitest: **127 passed** across ten files, including mocked recognition/narration, cancellation, provenance, fixture and renderer contracts.
- Rust: **22 passed**, including actual DX12 WGSL validation, original clip timing, smaller-eye scale endpoints, policy, cancellation, audio bounds and loopback HTTP response tests.
- Rust formatting and clippy `-D warnings`: passed.
- Production frontend build and whitespace check: passed. Vite notes a non-fatal static/dynamic Tauri-core import overlap.
- Native process launch and native `wgpu` status: observed. Full native OS-pointer exercise: blocked as above.
- Live microphone, Whisper, ElevenLabs listening/delivery, subjective voice quality, macOS and new renderer performance sampling: **not run**. No billable provider test call.

## Changed areas and provenance

E1 daily fixture/schema/controller and native projection; `src/voice/` and fixed Rust speech/transcription routes; private-config launch helper; source-frame preview, exact original eye reuse and frame extraction; Rust GPU material renderer/WGSL/DirectComposition integration and dependencies; focused tests/capture helpers; this packet, evidence index, canonical refinement and pending acceptance. Week 1 and original imports are unchanged. An unrelated untracked `brain/` appeared during the session and was left untouched.

Development: main **Astra** and native **Astra forks**, as reported by the harness (`claude-gpt-6-astra[1m]` inherited model). No lower-tier worker substitution. Ruflo routing was advisory only. Tools: Read/Edit/Write, native Agent worktrees, Git status/diffs, Node/Vite/Vitest, Cargo/wgpu, local Playwright, Python/FFmpeg and guarded Windows probe scripts. No commits, pushes, publishing, generation-service jobs, permission bypass or owner acceptance. Exact per-worker provider log correlation was not independently recorded.

## Retest and decision

From root: `npm --prefix experiments/e1 run desktop:dev`. See [run and voice retest](../../../../experiments/e1/README.md). With the synthetic/owner-controlled background unobstructed, test eye tracking, today → tomorrow → dismissal, smaller eye return, source motion/ripples, pin/focus, plain/reduced mode, and actual underlying-app clicks. Enable microphone once for the separate live voice exercise. Listening pauses during narration to prevent echo; visible Stop/Escape interrupts immediately.

Owner accept/revise/reject and date: **pending**. No later phase or participant finding is implied.

## Source consulted

- [wgpu v27 DirectComposition support](https://github.com/gfx-rs/wgpu/releases/tag/v27.0.0): selected for transparent Windows GPU surfaces; actual pinned crate implementation and DX12 shader compilation were checked.
