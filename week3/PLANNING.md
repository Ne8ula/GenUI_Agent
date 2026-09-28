# Week 3 — Conversational eye plan

Date: 2026-09-27 · Status: original proposed implementation plan, retained below. A bounded implementation candidate and executed evidence now exist; see [README.md](README.md) and the [pending acceptance record](docs/design/acceptance/w3-conversational-eye.md). No owner acceptance is implied.

Owner's window: one week for a 1–2 minute visual demo. Working target: 2026-10-04, calculated from this conversation; exact presentation time was not supplied.

Design source: [Week 3 design guide](DESIGN.md). Source checkout for this documentation: `53203fa`. Accepted Week 3 baseline: none.

## 1. What we will build

A single eye-like sculpture that listens hands-free, understands a conversational turn, replies through ElevenLabs, and changes expression smoothly to answer the user's emotional context. Speaking over EVA stops its reply and lets the conversation change direction.

Three core visual requirements from the updated design:

- **Recognizable grammar, non-repeating expression:** each stance retains its expressive family while every occurrence creates a fresh composition and motion phrase, not a replayed animation or graphic.
- **GIF-inspired processing:** colorful fragmentation, horizontal streaks and pixel trails around the eye, blending into the response without an artificial loading delay.
- **Tracking boxes throughout:** thin boxes follow the evolving form during idle, listening, processing and speaking; brief restrained highlights suggest attention and observable activity, not a literal display of hidden reasoning.

Success means a live vertical slice, not a movie that merely appears interactive:

**Microphone → speech detection/transcription → conversational reply and stance → validation → ElevenLabs audio → synchronized local expression → interruption and next turn.**

This document plans that slice; it does not report implementation, provider readiness or owner acceptance. Earlier weeks remain archived. The owner's Week 3 pivot is separate from pending E1/S0–S4 gates. The main plan's silent study, weather-first scope and deferred barge-in are not Week 3 requirements; hands-free interruption is now core. No study recruitment or general claim of empathy is included.

## 2. Small implementation boundary

- Separate `week3/` workspace; preserve Tauri 2, React/TypeScript and Rust-controlled privileged boundaries. Use one authored procedural renderer, selected through a short motion spike—not an Unreal migration, full 3D world or Blender/Live2D pipeline.
- Preserve provider-neutral TypeScript orchestration and Draft 2020-12 schemas. Inspect reusable Week 1 voice code before adapting it; do not patch the archive. Never infer readiness from old setup notes.
- Day 1 selects one actually accessible speech-to-text route and one conversational model behind adapters. Pin and record their real IDs, transport and cost limits. Existing development-agent subscriptions are not runtime API access.
- One short response per turn, initially capped at two sentences and 60 spoken words; session history bounded to eight completed turns. Proposed ceilings: 30 seconds per user turn and 10 minutes per session. Tune only against the live demo, and enforce limits locally/backend-side.
- Backend validates closed fields for reply, allowed stance, bounded intensity and reviewed delivery cues. Trusted code attaches session/turn/revision IDs. Unknown fields, executable content, invalid provenance, unsupported factual claims and expired/superseded work do not reach speech or motion.
- Use one local controller for expression. Implement the five grammars in [Design Section 6](DESIGN.md#6-motion-grammar): comforting, shared joy, congratulatory, supportive assistance and curious attention. Each defines stable silhouette/energy/timing constraints and bounded variable geometry, materials, paths and choreography—not a catalog of finished clips.
- Compose each occurrence from validated conversational context/intensity, the current continuous form and a fresh locally assigned variation seed. Vary meaningful structure and timing, including tracking-box groupings; do not count a hue swap as a new performance. Keep a bounded session-local record of recent composition parameters to reject immediate repeats without saving speech. Seeds make synthetic fixtures reproducible; live turns must not replay those fixtures. Retarget from current shape and velocity rather than resetting a stance.
- Keep turn-state effects separate from response stance. Actual processing events drive the GIF-inspired fragmentation; actual playback starts the speaking expression. Tracking boxes remain a recurring layer across active-session states, tracking rendered geometry—not the user or their screen. Bound box count, pulse contrast and effect cost; never cover controls/captions. Reduced motion uses static varied compositions with static or hidden boxes.
- No network generation in the animation loop. Fresh graphics are produced procedurally, not through a cloud image/video request per turn. No runtime development-authoring service dependency, image-generation wait, calendar/weather connector, persistent memory or autonomous action.
- React hosts controls and the view; credentials/provider operations stay behind narrow backend contracts. A browser preview may support development but cannot count as native integration evidence.

## 3. Interruption is part of the first slice

Proposed lifecycle: session off → listening → processing → speaking → listening. Speech onset during processing or speaking supersedes the current turn and starts listening for a replacement.

1. Detect plausible user speech locally; request echo cancellation/noise suppression and tune against the real device. Do not mute capture for the whole reply.
2. On confirmed onset, stop/flush playback and queued speech immediately; do not wait for an LLM, transcription or provider cancellation response.
3. Increment the turn generation, cancel outstanding requests where supported, and reject all callbacks carrying an older session/turn/revision ID. Cancellation cannot guarantee the provider stops billing or processing.
4. Preserve a short bounded microphone pre-roll so the first word is not lost. Transcribe the replacement turn, then generate a new response.
5. Mark the old reply interrupted in session context; do not treat unheard text as delivered. End session invalidates everything, releases the microphone and clears transient context.
6. On interruption, stop processing trails and yield tracking-box activity with the eye, blending from the current form toward listening. On End, stop all visual layers; stale events cannot revive boxes, trails or expressions.

Test with loudspeakers, not only headphones. False triggers, missed onset, stale audio and clipped first words are release blockers. Push-to-talk or headphones can be explicit contingency modes, but do not silently satisfy the hands-free target.

## 4. Seven-day sequence

| Day | Bounded work | Evidence / exit condition |
| --- | --- | --- |
| 1 | Inspect full reference motion; spike one grammar with three variations, processing trails and tracking boxes; inspect voice code/provider access and establish contracts | Document renderer choice, bounded variation rules and accessible providers; verify native microphone/playback and cancellable local playback. Surface blockers now. |
| 2 | Build the live microphone–transcription–reply–TTS loop with minimal visuals and basic barge-in | One live turn and one interrupted reply; no credential exposure or old audio revival. |
| 3 | Implement all five grammars, seeded procedural variation, GIF-inspired processing, recurring tracking boxes, continuous retargeting and reduced motion | At least three distinct renditions per grammar, same-family identity and no preset restart on repeat; interrupt all visual layers. |
| 4 | Connect validated stance/context, voice delivery, playback events and session continuity | Full flow with fresh compositions and brief congruent speech; activity effects follow real turn events. Review actual ElevenLabs takes. |
| 5 | Harden echo handling, cancellation, failures, privacy, keyboard controls and variation bounds | Focused tests, real-speaker exercise and frame/timing measurements with boxes and trails active; reject repeated compositions without breaking grammar. |
| 6 | Rehearse the 1–2 minute script; owner tests the candidate; fix blockers | Versioned recording/stills and exact launch/retest instructions. Backup recording labeled as recorded, never live. |
| 7 | Freeze scope, retest fixes and prepare presentation | Reproducible launch, known limitations, owner decision tied to the tested revision. |

Cut additional materials, elaborate particles, multiple voices and excess ornament first. Keep the core grammar variation, GIF-inspired processing and recurring tracking boxes; reduce their complexity rather than replacing them with fixed clips or removing them. Do not cut live voice, smooth transition, interruption, truthful failures or the owner's test. If the live loop cannot meet the window, disclose that and obtain an explicit scope decision rather than label a staged sequence a full slice.

Figma Weave is mandatory development preparation before every frontend/UI change, redesign, reimplementation and each new visual pass, under [the reference-generation gate](../docs/design/FIGMA_WEAVE.md#mandatory-prerequisite-for-every-ui-change), on the owner's 2026-09-28 instruction. All local/Cloud agents must generate new change-specific images through direct Weave models OR reusable workflows and video for motion, inspect outputs, and hand the recorded packet to the UI implementer before edits. No manual graph-building is required per task. Use the guide's categorized review folders with REVIEW.md, reference images/videos and separate before/after app captures. A Week 3 brief should show one identity across the five grammars, multiple renditions of a grammar, GIF-inspired processing, recurring tracking boxes and an interrupted transition. Extract reusable rules, not finished runtime clips. Follow the new guide rather than E1's weather/overlay brief. Establish a finite generation budget and permission before submitting; no old E1 credit allowance transfers. If unavailable, pause frontend/UI work and request the missing access, workflow, cost approval or inspected output; only unrelated non-UI work may continue. No ComfyUI setup or local model downloads.

## 5. Suggested 105-second demonstration

These are synthetic rehearsal prompts, not exact-response scripts. Live replies and visual renditions vary. Tracking boxes recur throughout; processing gaps show the GIF-inspired trails, yielding smoothly to speech. Do not lengthen a real response delay to showcase loading or expose hidden emotion-selection buttons as if the model chose the stance.

| Time | User / action | What the audience should see |
| --- | --- | --- |
| 0–10 s | Start conversation | Microphone visibly enabled; a quietly attentive eye. |
| 10–30 s | “I've had such an annoying day. Nothing went the way I wanted.” | A short comforting response and a softer, calmer form. |
| 30–50 s | “Actually, some good news—my project was selected for the showcase!” | Congratulation and a dimensional bloom, not a hard-cut preset. |
| 50–65 s | “I'm really happy about it.” | Shared happiness, with a gentler motion than the celebration peak. |
| 65–90 s | “But I'm stuck on how to open my presentation.” While EVA answers: “Wait—just give me one opening sentence.” | Supportive assistance; speech stops when interrupted and all effects yield. The revised suggestion uses a fresh supportive composition, recognizably related but not a restarted animation. |
| 90–105 s | End session | Audio, microphone, tracking boxes and processing effects stop; no late response returns. |

The session should also handle a paraphrase and a correction such as “I don't need advice, just listen.” The point is contingent conversation, not precise keyword triggers. The 105-second pacing is a rehearsal target, not a measured latency claim.

## 6. Checks before calling it complete

**Contracts:** valid/invalid stance, unknown fields, intensity limits, oversize text, unsupported facts, missing evidence where required, unauthorized provider settings and old-turn results. Record the Week 3 short-form voice exception and prompt-policy tests.

**Live flow:** genuine microphone input, selected STT/model/ElevenLabs requests, real playback, correct stance and bounded follow-up context. Captions distinguish interim transcription from final reply. No prerecorded or cached response presented as live inference.

**Interruption:** during generation, queued TTS, playback and an expression transition; repeated interruptions; first-word preservation; no self-trigger from EVA's voice; no cancelled audio returning. Exercise Mute, Stop and End separately.

**Failures/privacy:** denied microphone, silence, transcription failure, malformed model reply, slow/network-failed TTS, renderer failure and reconnect. Use clear status and optional text fallback, never pretend that voice succeeded. Verify raw buffers/context are cleared and secrets/private speech are absent from logs and public traces. Provider retention must be checked separately from local deletion.

**Grammar/variation:** capture at least three independently varied renditions of each of the five grammars. Owner review must find recognizable family identity with meaningful differences in composition and motion—not just color. Test consecutive same-stance turns, return after a different stance and mid-transition retargeting without resets. Check parameter/resource bounds, immediate-repeat rejection, deterministic reproduction of synthetic seeds and no fixture replay in live mode. Sampling supplies review evidence, not a mathematical guarantee of perpetual uniqueness.

**Processing/boxes:** verify trails only during actual processing and boxes across idle/listening/processing/speaking. Check attachment to the evolving form, varied grouping, restrained pulses, transition into actual playback, interruption, timeout and End. No fake reasoning labels, camera/screen tracking, obscured controls or high-contrast strobing.

**Visual/accessibility:** matching viewport/DPI stills plus motion recording; keyboard focus, resizing, captions, reduced motion and stable identity. Reduced motion keeps static compositional variation, removes moving trails and uses static or hidden boxes with readable status. Owner listens for natural delivery and judges whether comfort, joy, congratulation and help fit the conversation.

**Measurements:** log local timing metadata only: speech end to first reply audio, interruption onset to playback silence, expression alignment with playback, and frame-time distributions while voice requests are active. Initial engineering targets: typical first audio within 3 seconds of turn end, stop within 200 ms of detected user onset, sustained 60 fps on the demo machine. Also measure physical onset/detection delay separately; report actual distributions and misses. These are targets, not guarantees or results.

Workspace package scripts and exact native launch commands must be documented after implementation and execution; none exists yet to verify. Do not run unrelated archived tests as Week 3 evidence.

## 7. Evidence, provenance and acceptance

Future review evidence belongs under `week3/docs/design/revisions/<revision-id>/`; add `week3/docs/design/INDEX.md` when candidates exist. Use the [main guide's manifest requirements](../DESIGN.md#11-evidence-and-acceptance), including actual tools/models, fixture, display/audio setup, commands, measured results and limitations. Public recordings use deliberately synthetic dialogue with permission to record; never silently retain ordinary microphone sessions.

Create `week3/docs/design/acceptance/w3-conversational-eye.md` when a candidate is ready. Record tested revision, reproducible scenario/commands, expected versus actual results, owner feedback, blockers/retest and explicit decision/date. Acceptance remains pending; this plan is not a completed demo.

Read-only groundwork: main session inspected the local images and sampled media frames. Native `eva-researcher` inspected [LLM-NPC](https://github.com/Ne8ula/LLM-NPC) via Read/WebFetch, configured as Terra (`claude-gpt-5.6-terra[1m]`); independent transport identity was not verified. No NPC runtime was executed. Main-session environment identifies Astra; no independent route-log verification or additional reviewer was used for these guides.

Transfer patterns from inspected NPC code: [structured dialogue and affect](https://github.com/Ne8ula/LLM-NPC/blob/main/Source/LLM_NPC/Dialogue/DialogueComponent.cpp), [local gaze interpolation](https://github.com/Ne8ula/LLM-NPC/blob/main/Source/LLM_NPC/Animation/NPCEyeTrackingComponent.cpp), [bounded emotion state](https://github.com/Ne8ula/LLM-NPC/blob/main/Source/LLM_NPC/Emotion/EmotionComponent.cpp), and [ElevenLabs playback integration](https://github.com/Ne8ula/LLM-NPC/blob/main/Source/LLM_NPC/Dialogue/ElevenLabsTTSComponent.cpp). These unpinned source links describe inspected code, not measured performance. The gaze component was not emotionally coupled; inspected dialogue/TTS callbacks did not establish reliable cancellation or stale-result rejection. Transfer the separation and smoothing principles, not those lifecycle assumptions or the whole NPC stack.

Current limitations: Week 3 runtime, provider access, real-time reference playback, voice quality, frame rate, hands-free echo handling and latency remain unverified. No application tests, paid generation, deployment or owner acceptance occurred during guide preparation.
