# New-session prompt — E1 voice-led weather redesign

Redesign the existing E1 demo using the imported Figma Weave keyframes and animations. The imports are ready. Inspect them, identify the reusable visual/motion rules, and implement the redesign—not another long planning exercise. Stay within E1; do not start a later phase or change the Week 1 archive.

## Start here

Follow `CLAUDE.md`, `AGENTS.md`, and `docs/development/AGENT_WORKFLOW.md`. Check current git status and preserve all existing/uncommitted work. Read the relevant parts of `DESIGN.md`, `docs/design/experiments/E1_REVISABLE_WEATHER.md`, and `docs/design/acceptance/e1.md`. This prompt records the owner's newer direction where older documents describe a silent demo, a separate small eye, or dismissal that hides everything.

Implementation workspace: `experiments/e1/`.

### Imported design references

These files were present when this handoff was written; preserve their originals and inspect their actual contents before making design claims.

**Keyframes — `experiments/e1/weave/keyframes/`:**

- `Gen UI Independent Study_K0 — Week 1 eye on Mock Desktop_2026-09-24_16-45-20.png`
- `Gen UI Independent Study_K1 — NYC today, sunny_2026-09-24_16-45-15.png`
- `Gen UI Independent Study_K2 — NYC tomorrow, rain_2026-09-24_16-45-04.png`

**Animations — `experiments/e1/weave/animations/`:**

- `Gen UI Independent Study_V1 — Eye expands into sunshine_2026-09-24_16-46-24.mp4`
- `Gen UI Independent Study_V2 — Tomorrow revision_2026-09-24_16-46-18.mp4`
- `Gen UI Independent Study_V3 — Dismiss weather_2026-09-24_16-46-52.mp4`

**Original inputs — `experiments/e1/weave/inputs/`:**

- `K0-eye-on-desktop.png` — canonical full-frame starting/return eye on the Mock Desktop.
- `R1-eye-detail.png` — actual original Week 1 eye detail.
- `BG-mock-desktop.png` — clean, fixed Mock Desktop background.

Supporting references:

- `docs/design/experiments/E1_VOICE_WEAVE_BRIEF.md` — node prompts, background constraints, and intended interaction.
- `docs/design/revisions/e1-20260924-week1-eye-reference/README.md` — capture provenance and limitations.
- `docs/design/revisions/e1-20260924-week1-eye-reference/week1-cursor-tracking.mp4` — actual original eye's cursor/gaze/lid behavior, not AI-generated motion.
- `week1/apps/desktop/src/SignalEye.tsx` and `MovingEye.tsx` — original eye implementation; inspect/reuse in an E1-only adaptation, never edit the archive.

Inspect all three images and the timing/representative frames of all three videos. Do not infer animation behavior from filenames or a single thumbnail. Treat the exports as proposed design references, not owner acceptance or proof of working interaction. If a generated eye differs from the actual Week 1 eye, preserve the original eye identity. Identify material conflicts briefly rather than silently copying generation mistakes.

## Required experience

1. The original Week 1 eye is the idle presence. Preserve its recognizable anatomy, square pupil, red dithering, and responsive cursor/gaze/lid feel. Do not replace it with a logo or generic icon.
2. The user explicitly enables the microphone once, then speaks hands-free. Keep microphone/listening state and a stop/off control visible. Do not implement a click for every utterance or a scripted recording disguised as recognition.
3. User: **“What's the weather today in NYC?”** The eye itself expands/morphs into the recognizable sunny dithered composition. No second eye remains beside the weather. EVA gives a short spoken answer and concise readable facts.
4. User: **“What about tomorrow?”** Retain NYC context. Revise the same composition from sun to recognizable clouds and falling rain, without resetting to the eye or opening a new dashboard.
5. User: **“Dismiss the weather.”** Stop speech and pending work immediately; animate back to the exact original eye at its original position and scale. Weather dismissal and microphone-off are distinct actions.

The distinction must be legible in silhouette and motion: sun disk/rays versus cloud contour/separate downward rain streams. Do not revert to abstract density changes. Preserve the common square-cell matrix/dither language and palette.

Use a clearly labeled **synthetic sunny-today/rainy-tomorrow NYC fixture**, not a live weather service. Add/validate the necessary tomorrow data rather than relabeling the current intraday records. Bind speech and text to the same fixture, with explicit scenario date, timezone, and units. The mock taskbar's date is not the forecast clock. Facts must not wait for animation or narration to finish.

## Implementation boundaries

- Keep Tauri 2, React/TypeScript, Rust boundaries, and the existing E1 architecture. Translate the selected visual vocabulary into responsive, interruptible native-rendered behavior. Do not fake interaction by playing the generated videos as the entire application.
- Use the Mock Desktop as a fixed **preview/test backdrop**. Do not animate its existing white sun, landscape, taskbar, icons, or clock. Native E1 must retain actual transparency and nonblocking empty regions; the wallpaper is not a substitute for OS transparency or permission to inspect the user's desktop.
- Preserve user geometry, pins, focus, and relevant local preferences across revisions. Keep keyboard access, plain answer, reduced-motion, and no-audio/no-microphone fallbacks.
- Support cancellation, rapid follow-ups, and dismissal during transitions. Late recognition, speech, or animation work must not revive dismissed/superseded weather. Prevent EVA's spoken audio from triggering its own recognizer.
- Inspect existing voice routes before choosing an implementation. Reuse authorized configuration safely; do not read/log/copy secrets or add a new provider/configuration path merely for convenience. For ElevenLabs work, follow `week1/docs/design/VOICE_PROMPTING.md`. Do not make billable provider test calls without the applicable authorization. Report genuine credential/provider blockers without pretending a mock proves end-to-end voice.
- Preserve the Week 1 tracking feel without adding unrequested global OS surveillance/input hooks, cameras, or desktop-content capture. Disclose any native pointer-delivery limitation.
- Do not generate more Weave/Higgsfield assets, install ComfyUI, publish, commit, or push. Existing imports are sufficient for this redesign pass.

## Working approach and completion

Briefly state what the imported references imply for shape, transitions, and continuity. Then proceed with bounded implementation. Follow the project's native `eva-*` delegation/model rules where substantive independent work benefits; keep one writer per file and isolated worktrees for parallel writers. Do not overwrite other sessions' changes or switch the shared checkout's branch.

Capture the current before-state, then matching after-states and a short interaction recording. Run the focused checks available in E1, including sunny → rainy context carryover, dismissal during motion/speech, return to the original eye, reduced motion, keyboard/focus, microphone denied/unavailable, and cancellation. Distinguish automated/mock checks from a real microphone/provider exercise, and browser evidence from native Windows evidence.

Finish with changed files, actual model/tool provenance, executed checks, known limitations, a reproducible launch command, and a short owner voice-retest script. Keep E1 acceptance pending until the owner explicitly accepts the tested revision.
