# Week 4: Arriving somewhere (EVA builds 1980s Paris)

Date: 2026-10-03 · Status: **proposed planning brief, documentation only.** This is not an implementation, a generation, a mockup or an accepted candidate. · Source revision: `d25d705` (shared checkout, branch `week-3`) · Accepted Week 4 baseline: none · Owner acceptance: pending. None is implied.

Authored by Claude Opus 5.5; integrated/checked by Astra, with bounded technical consistency corrections. [Execution provenance and correction log](AUTHORSHIP.md).

Companion: [art direction and Weave prompt document](DESIGN_PROMPT.md). Governing rules: [AGENTS.md](../AGENTS.md), [Weave gate](../docs/design/FIGMA_WEAVE.md#mandatory-prerequisite-for-every-ui-change), [Week 3 design](../week3/DESIGN.md), [Week 3 plan](../week3/PLANNING.md), [Week 3 acceptance record](../week3/docs/design/acceptance/w3-conversational-eye.md), [voice policy](../week1/docs/design/VOICE_PROMPTING.md).

## 1. The experience

You say aloud, "What does it feel like to be in 1980s Paris, drinking coffee." The Week 3 eye listens and leans in, then opens. For about a minute it draws a place around you. First come the edge of your table and the line of the street at your seated eye height. Then stone, rattan and zinc appear, then watercolour and afternoon light, then people walking past. The approved windows on your desktop step aside, and the Windows wallpaper itself becomes the far sky and rooftops.

When the scene settles, you are seated outdoors at a café. A coffee sits on the table, a cigarette burns down in a glass ashtray, and people in 1980s clothes pass on the pavement. If you shift your head a little, the cup, the table edge and the street move against each other the way they would through a real window. You can ask for rain or for evening, undo that change, or ask to go back. EVA then restores the desktop state it changed, preserving any later changes you made yourself.

This is a **live, deliberately hard-coded Windows demonstration** of an agent that creates experiences. The Paris scene and its variations are authored in advance. Speech, head tracking, rendering and desktop changes happen live. No new environment media is generated at runtime, and the demo never claims otherwise.

**Long-term direction:** generate the experience and subsequent variations live, selecting first- or third-person presentation from the user's context. Week 4 rehearses that interaction with prepared content; arbitrary world generation, runtime media-provider selection and a general perspective switch are not implemented or validated by this slice.

## 2. Owner decisions, recommendations and reconciled conflicts

**Owner decisions (firm, 2026-10-03):**
- EVA moves from a general do-everything assistant to an agent that creates experiences. The Week 3 eye remains the base form, and the scene emerges from it.
- The demo opens with the spoken request above. The viewpoint is first-person, seated outdoors at a café, with coffee, cigarette ashtrays, and passers-by in 1980s fashion. This demo is already first-person, so it needs no perspective switch. An actively smoking cigarette is an art-direction proposal, not an additional owner requirement.
- The scene is an environmental recreation, not a postcard, panorama, video launcher or dashboard. It uses real head-coupled off-axis perspective through MediaPipe, following the approach of icurtis1/off-axis-sneaker, with small seated head movements and planned depth and occlusion. A flat photo, a video or a mouse orbit is not an equivalent.
- The construction is inspired by Animus from Assassin's Creed, as the user named it: wireframe, then construction, then an inhabited world. No clip was supplied or inspected. The principles below are original. No game assets, branded HUD or logos.
- About 60 seconds of construction is **wanted** as an emotionally paced arrival. It is authored, not measured progress.
- Real spoken input and spoken follow-ups. Speech is not optional, and live rendering is not replaced by a movie.
- Real desktop choreography: a creative fullscreen transformation, displacement of approved windows, and a **change to the OS wallpaper** so it serves as the scene background. All of it must be reversible.
- The emotional experience is the top priority.
- No deadline and no generation budget. That is **not** unlimited spending. All new project files go in `week4/`. Weeks 1–3 stay untouched.

**Recommendations (proposals; the owner may revise):** late afternoon in early autumn. A fresh Tauri 2 + React/TS + Rust stage broker + Three.js/WebGL2 app in `week4/`, with MediaPipe in a worker. A depth-compressed "window" scene with a periphery that fades to paper, so a static wallpaper can work as the far field. Authored narrator lines delivered as reviewed Eleven v3 takes. Follow-ups: rain, evening, undo, return, plus honest replies to unknown requests.

**Conflicts, reconciled for Week 4 only (root documents unchanged):**

| Existing guidance | Week 4 handling |
| --- | --- |
| [PLANNING.md §14.3](../PLANNING.md#143-desktop-behavior) says to preserve the user's wallpaper and implies no camera input | The owner explicitly requires a temporary wallpaper change and head tracking. The wallpaper change is consented to, journaled and restored. The camera is opt-in and local-only, with a labelled no-camera mode. |
| DESIGN.md anti-pattern: camera requirements without a research need | The research question is the owner's: does embodied perspective deepen an experience? Camera use stays local and optional, and is never needed for safety controls. |
| PLANNING.md §14.4 and Week 3: no mandatory cinematic sequence; do not stretch delays to show off loading | The minute is requested content, not hidden latency. It can be skipped or cancelled at every moment and is never presented as progress. |
| Week 3: no generated clips or network generation in the animation loop | Kept. The runtime renders natively from reconstructed assets, and Weave is never called at runtime. |

## 3. Live demo script

Before the demo, the demo machine shows two to four **approved synthetic demo windows** (for example a blank notes file and a folder), chosen in a local untracked allowlist. The owner may hide desktop icons by hand; EVA never changes that setting. The Week 4 app starts as the Week 3-style eye. A one-time session consent screen lists microphone, camera and desktop staging: "EVA will move N approved windows on this monitor and temporarily change this monitor's wallpaper. Everything is restored when you leave." Each item can be declined, which selects a labelled degraded mode.

| Beat | Owner says / does | EVA voice (authored proposal, v3 cues experimental) | What happens |
| --- | --- | --- | --- |
| Arrival | "What does it feel like to be in 1980s Paris, drinking coffee." | `[softly] Nineteen-eighties Paris. Stay with me a moment.` | The 60-second construction (§4). |
| Settle | Sits and looks around, moving only slightly | `[softly] There. Your coffee's still warm.` | Live parallax and occlusion. Smoke and steam drift; passers-by pass. |
| Follow-up 1 | "Can it rain?" | `[warm] Let it rain, then. We're under the awning.` | Rain state applied in place (§7). |
| Follow-up 2 | "Make it evening." | `[calm] The lamps come on about now.` | Evening state applied in place. |
| Undo | "Undo that." | `[calm] Back to the rain, then.` | Reverts the last scene change only. |
| Unknown | "Take me to Tokyo." | `[calm] I haven't built that one yet. I can make it rain, bring the evening, or take you home.` | Nothing is generated or claimed. |
| Return | "Take me back." | `[softly] Let's go back. I'll restore what I changed.` | Reverse construction, conditional restoration, eye returns. Esc instead restores immediately without the animation or speech. |

Voice lines are short. Each one needs a documented short-form exception under the [Eleven v3 policy](../week1/docs/design/VOICE_PROMPTING.md): no SSML, no ellipses in short lines, and every take listened to. Cues guide delivery; they do not guarantee it.

## 4. The minute: a storyboard of about 60 seconds

This is an authored reconstruction played on a local clock, not cloud progress. It shows no percentages, progress bars, "loading" labels or claims of live generation. The aesthetic for each phase is defined in [DESIGN_PROMPT.md §8](DESIGN_PROMPT.md#8-the-sixty-second-emotional-arc).

| Phase | Time | Picture | Sound | Desktop / wallpaper | Head coupling (gain) |
| --- | --- | --- | --- | --- | --- |
| A Heard | 0:00–0:05 | The eye leans in; tracking boxes gather on the pupil | Room tone; EVA line 1 | None | 0 |
| B Clearing | 0:05–0:12 | The eye grows to centre; dither cells loosen into paper grain; warm paper floods in | A soft exhale of air; city hum, filtered | Approved windows glide to edge slots | 0 |
| C Survey | 0:12–0:22 | Red survey lines rise from the pupil: horizon at eye height, table-edge ellipse, cup ellipse, street perspective, façade grid. Tracking boxes fly out and lock onto cup, ashtray and chair | Pen scratch; first distant footsteps | The foreground becomes an opaque paper veil | 0 → 0.25 (the lines visibly have depth) |
| D Massing | 0:22–0:32 | Pale planes and volumes; near objects solid but uncoloured, far ones still line | A cup set on a saucer, heard before it is seen | **Wallpaper set while the veil is opaque** | 0.25 → 0.5 |
| E Wash & light | 0:32–0:44 | Watercolour bleeds into near objects first, then the street; sunlight rakes; steam appears; line colour cools from red to sepia | Espresso hiss; murmur of conversation; EVA silent | — | 0.5 → 0.75 |
| F Inhabiting | 0:44–0:54 | The first passer-by crosses as a line figure and fills with colour; cigarette smoke threads upward | Footsteps on stone; a moped far off; a chair scraping | — | 0.75 → 1.0 |
| G Arrival | 0:54–1:00 | Construction remnants dissolve at the edges; the sky and periphery of the foreground turn transparent onto the registered wallpaper; the eye becomes a faint glint on the coffee surface | Full ambience; EVA line 2 at ~0:55; then silence | Wallpaper visibly carries the far field | 1.0 |

**Skip** ("Just take me there", "Skip ahead" or `S`) compresses the remaining phases into a crossfade of about 6 seconds (proposal) to the same end state. It still performs any required, consented wallpaper step not yet reached, under the veil; skip cannot bypass the broker or readiness checks. **Graceful return** ("Take me back") runs a deconstruction of about 5 seconds (proposal), then restoration (§6.4). **Emergency cancel** (Esc, "Cancel", "Stop the experience", or the native restore hotkey) bypasses animation and starts restoration immediately; it takes priority over speech, scene transitions and outstanding results. **Interruption:** user speech stops EVA's voice; Week 4 must re-verify this live rather than inherit an acceptance claim. Construction keeps going unless the utterance is skip, return or cancel. At most one follow-up is queued until arrival; a later request supersedes it, and cancel clears it. **Reduced motion** gives a quiet arrival of about 15 seconds (proposal): crossfaded stills of phases C, D, E and G, windows moved while the screen is veiled, parallax off by default (opt-in), and walkers and smoke kept slow and small. **Failure** at any phase: EVA stops, reports the problem when possible, and restores the desktop without waiting for narration. It never presents a frozen frame as an arrival.

## 5. Authored in advance vs live at runtime

| Element | Authored before the demo | Live at runtime |
| --- | --- | --- |
| User speech | — | Real microphone and speech-to-text (STT) |
| Intent | A closed set of intents, each with paraphrase fixtures | Matching of the live transcript, with deterministic routing |
| EVA voice | Authored lines and reviewed v3 takes (labelled as pre-synthesized) | Playback, interruption, stop |
| Scene | Native geometry and textures reconstructed from inspected Weave references | Each frame rendered on the GPU from the current head pose |
| Construction | Keyframes, curves and sound cues | Playback with pause, skip, cancel and reduced motion |
| Passers-by | Paths, wardrobe sprites or cards, timing pools | Seeded scheduling; no fixture replay presented as live variation |
| Wallpaper images | One render per scene state from the calibrated rest pose, per monitor resolution | Snapshot, set and restore by the broker |
| Windows | Allowlist rules and edge-slot layout | Live enumeration, real moves, journal |
| Head pose | Calibration procedure | MediaPipe landmarks, computed locally |
| Weave | Reference packets; candidate source textures (rights review pending) | **Never called** |

## 6. Scoped architecture

### 6.1 Components

```text
Mic → STT adapter (Rust, Week 3 route re-verified) → transcript
  → Intent router (TS, closed enum) → Scene director (TS state machine, scene IDs)
      ├─ Renderer (React host + Three.js/WebGL2) ← Head pose (MediaPipe Web Worker)
      ├─ Narrator (Rust: approved line IDs → playback; renderer cannot choose text/voice)
      └─ Stage broker (Rust: wallpaper snapshot/set/restore, window journal, recovery)
```

Week 3 is not modified. The eye's CPU Canvas code is **copied** into `week4/`, with its source revision recorded, and composited as a texture inside the WebGL scene. That way its dither cells can disperse into construction particles. Week 3's host passes `--disable-gpu`. Week 4 needs a separate GPU feasibility spike: WebGL2 in Tauri 2 WebView2 on the demo machine, interaction with a transparent window, and frame timing. Find out why Week 3 disabled the GPU before enabling it here. The archived native wgpu experiment is not revived.

IPC is closed. The renderer may call only `stage.prepare(sceneId)`, which returns counts for consent, `stage.enter(variantId)`, `stage.setFarField(variantId)` with fixed enum values, and `stage.restore()`. It never passes window handles, file paths, image bytes or text for speech. Scene data follows an EVA-owned Draft 2020-12 schema that rejects unknown fields.

### 6.2 Head-coupled projection

- MediaPipe Face Landmarker (tasks-vision, VIDEO mode) runs in a **Web Worker** on its own clock. The official guide documents synchronous, blocking inference and recommends a worker. That guide was read for source only; nothing was run or benchmarked. The renderer reads the latest smoothed pose at render rate and never waits on inference.
- Pose: the midpoint between the eyes gives lateral and vertical position. Depth comes from the landmarks' inter-ocular distance and an assumed average interpupillary distance, which is approximate and differs per person. This is **not gaze tracking or metric truth.**
- Calibration: the owner sits at the demo pose and enters the screen's physical width, or reads it from the OS if a spike verifies that. The neutral pose is captured there. Movement is clamped to a small seated head-box (proposal: about ±12 cm lateral, ±8 cm vertical, ±12 cm depth). Smoothing uses a One-Euro or critically damped filter. On tracking loss the view eases to neutral over about 0.8 s (proposal) and resumes without a jump.
- Projection: an asymmetric frustum from the eye position to the physical screen rectangle, using `makePerspective(left, right, top, bottom, near, far)`. The math is implemented independently: the inspected repository's license metadata is `null`, so reuse is unverified.
- Depth staging: place the zero-parallax plane near the cup, so **your coffee stays steady while the world shifts around it.** The street and façade sit behind it with authored depth compression, and parallax gain is tuned so far-field shift stays modest.
- Privacy: face data stays local, and no frames or landmarks are stored or uploaded. The camera indicator stays visible. With no camera, the view holds a static neutral viewpoint with a very slight authored breathing motion, labelled "head tracking off". It is **not** a mouse orbit and does not satisfy the requirement.

### 6.3 Spatial assets

| Band (virtual, compressed) | Content | Construction |
| --- | --- | --- |
| Near, ~0.5–0.9 m | Table top and edge, cup and saucer, glass ashtray and cigarette, coins, neighbour's empty rattan chair at the left edge | Low-poly meshes with painted textures; true occlusion (cup over ashtray, table edge over the pavement) |
| Overhead | Our awning's valance across the top edge | Mesh or card; it frames the view and sheds rain drips |
| Pavement, ~2–5 m | Passer-by lane, lamp post | Depth-sorted cards with authored walk cycles, occluded by the lamp post and the chair |
| Street / façade, ~6–14 m | Opposite façade, balconies, parked car, café across the street | Relief cards or layered planes |
| Far | Roofline, chimneys, sky fading to paper | Rendered layer **plus** the registered wallpaper |

Weave images are references and **possible** texture sources. Layer separation, alpha output or geometry export from Weave is unverified. The plan assumes native reconstruction, with manual matting or repainting where needed.

### 6.4 Wallpaper and window choreography (Windows)

**Intended wallpaper/foreground composition (unverified):** the wallpaper is a render of the same scene from the calibrated rest pose, at the monitor's native resolution, carrying the low-frequency far field: sky, paper vignette and faint rooftops. The GPU foreground draws defined edges and overscans the far field. A near-uniform paper field and soft overlap may hide the mismatch between static wallpaper and head-coupled rendering; this must be tested across the complete calibrated head-box, not asserted as seamless. No hard roofline should straddle that boundary. Planned wallpaper visibility:
1. During clearing, the **original** wallpaper remains behind the displaced windows; the Paris wallpaper is not set until phase D under the opaque veil.
2. At arrival, the foreground's sky and periphery turn transparent onto the Paris wallpaper.
3. Wherever the foreground is transparent or hidden during the experience. Bringing an application forward does not by itself expose wallpaper through an opaque renderer.
4. If the renderer hides or crashes, Paris may remain briefly until restoration. This is a recovery condition, not the normal presentation.

Verification must include a capture with the foreground hidden, so the wallpaper is never only asserted beneath opaque content.

**Broker rules (proposal; APIs to be confirmed in the spike):**
- **Snapshot** the current per-monitor wallpaper path, position mode and background colour, preferably through `IDesktopWallpaper` (per monitor), before any change. If the current configuration is slideshow, Spotlight, span, policy-locked or not restorable, **skip the wallpaper step** (degraded mode, below).
- **Write-ahead journal** in the private per-user app data directory, outside the repository. Record each effect, prior state and broker-authored state before applying it, including checkpoints sufficient to recover an interrupted move. Snapshot full window placement/show state and monitor/DPI context, not only a rectangle. Identify each specific window using its original handle, process ID/start time and additional identity checks; a process/class match alone is not unique, and a recycled handle must not be acted on. Titles and contents are never read or stored. Delete recovery data after verified restoration; disclose and retain unresolved entries only for recovery.
- **Scope:** only allowlisted top-level windows on the demo monitor. EVA's own window is excluded, as are other monitors, minimized, elevated (UIPI) or fullscreen-exclusive windows, and any move that fails. EVA runs unelevated and never requests elevation. It never closes processes, injects input or touches the secure desktop. On session lock or UAC, it pauses.
- **Motion:** eased `SetWindowPos` steps toward edge slots. Smoothness is a hypothesis to measure, and the fallback is the native minimize animation. A DWM-thumbnail proxy is a possible later option.
- **Restore rule:** restore wallpaper only if its current affected settings still match EVA's last applied state; a path/hash check alone must not ignore later user changes to presentation settings. Restore a window only if its identity is still unambiguous and its current placement/show state matches the last broker-authored state, including interrupted movement. Anything the user changed is left alone, with a plain notice. Do not alter global wallpaper position/colour settings or other monitors to stage one monitor. Verify each restore result, serialize watchdog/app recovery so they cannot race, and report unresolved restoration instead of claiming success.
- **Crash recovery:** a small watchdog process (proposal) watches the app process and runs the same restore. On next launch, a leftover journal triggers recovery under the same rules. A global hotkey and a tray item ("Restore desktop") work even when the renderer hangs.

**Degraded modes (labelled; they do not satisfy the full requirement):** wallpaper skipped (foreground-only fullscreen); windows left in place; no camera; no GPU (crossfaded stills); no STT (a typed request labelled "not the live voice demo").

**Privacy:** OS state is ephemeral. Logs keep counts, outcomes and timings only: no titles, paths, screenshots or process names. Synthetic proxy boards may illustrate motion and are labelled **proxy**. Any real recording of window movement uses synthetic demo windows only.

### 6.5 Voice, routing and honesty

Deterministic routing over a closed intent set, extended with paraphrases: `arrive_paris_cafe`, `weather_rain`, `weather_clear`, `light_evening`, `light_afternoon`, `undo`, `skip`, `return_home`, `cancel_experience`, `stop_speaking`, `unknown`. A model-classified closed enum behind validation is a later option, not Week 4 scope. Only the narrator speaks user-facing prose. Historical questions ("What year is it?") get an honest framing line ("This is my picture of the eighties, not a record of one day."). The Week 3 STT/TTS route and its budget are not inherited: they must be re-verified and given a new finite authorization.

## 7. Follow-up matrix (all proposals)

Stable IDs: `scene:paris-1980s-terrace`, `anchor:seat`, `obj:table`, `obj:cup`, `obj:saucer`, `obj:ashtray`, `obj:cigarette`, `obj:awning`, `layer:far`, `actors:passersby`. State: `weather ∈ {clear, rain}`, `light ∈ {afternoon, evening}`, plus an undo stack. Every follow-up changes the scene in place, and none rebuilds it.

| Utterance (paraphrases tolerated) | Change in place (~3–5 s blend) | Preserved | Wallpaper |
| --- | --- | --- | --- |
| "Can it rain?" | Sky greys; rain falls beyond the awning; drips from the valance; the pavement goes glossy with reflections; walkers quicken and some open umbrellas; smoke bends | Seat, table (dry under the awning), cup, ashtray, cigarette, IDs, camera | Set to the rain far-field while the foreground covers the sky |
| "Make it evening." | Blue hour; lamp post and café windows glow; warm light spills onto the table; fewer walkers | Same | Evening (or rain+evening) variant |
| "Stop the rain." | Reverse of rain | Same | Variant |
| "Undo that." | Pops the last scene change | Same | Variant |
| "Skip ahead." (during construction) | ~6 s crossfade to arrival | End state identical; required staging is not skipped | Apply consented arrival variant if phase D was not reached |
| "Take me back." | ~5 s deconstruction, then restoration | Later user desktop changes remain intact | Snapshot restored if still EVA-owned |
| Esc / "Cancel" / "Stop the experience" | Immediate restoration, no animation or speech prerequisite | Same | Snapshot restored if still EVA-owned |
| Unknown place or task | Honest line; no change | Everything | None |

## 8. Weave packet plan (blocked until approved)

Under the [mandatory gate](../docs/design/FIGMA_WEAVE.md#mandatory-prerequisite-for-every-ui-change), each UI pass needs a fresh inspected packet. Route: `direct-model` or `workflow`, with the actual model or workflow ID discovered live. Never guessed. Each run gets an explicit quote and approval. Packets live in `week4/docs/design/revisions/<revision-id>/`, following the guide's layout (REVIEW.md, contact sheet, `references/images/`, `references/videos/`, `implementation/before|after/`, `provenance.json`). That location applies the owner's week4-only rule to the guide's convention. The image and video specifications are in [DESIGN_PROMPT.md §11–§13](DESIGN_PROMPT.md#11-master-prompt).

| Packet | Images | Video (short studies; length is whatever the model supports) | Gates |
| --- | --- | --- | --- |
| P1: arrival | S1 master scene, S2 composition alternatives, C1–C6 construction keyframes, A1–A3 spatial and object sheets | V1 lines→mass, V2 wash bleed, V3 passer-by gait, V4 smoke and steam | Arrival build |
| P2: desktop | D1 choreography board (proxy) | V7 window displacement and return (proxy) | Desktop integration |
| P3: follow-ups | F1 rain, F2 evening, F3 return/deconstruction | V5 rain onset, V6 evening transition, V8 deconstruction | Follow-up build |

Weave output capabilities are unverified: do not assume a single 60-second sequence, layered geometry or editable sources. Plan to assemble the minute natively from approved keyframes and short studies. State boards must include the combined rain+evening case, since the proposed demo reaches it; equivalent state coverage can share a bounded packet.

## 9. Phases and exit criteria (no calendar)

| Phase | Work | Exit criteria |
| --- | --- | --- |
| W4-0 Brief | These two documents | The owner reads the diff; decisions are recorded |
| W4-1 Non-visual foundations | Mocked broker, journal/recovery logic, intent fixtures, projection math, schema and ID-continuity tests. Synthetic tracker fixtures; no camera capture, rendered prototype, window movement or wallpaper change in this step. | Focused tests of the non-visual contracts pass; no visual-completion claim |
| W4-2 Packets P1 + P2 | Quote → approval → generate → inspect → REVIEW.md. P2 covers the actual desktop/transparency spike as well as choreography. | Fresh image/video packets inspected; selection separate from owner acceptance; this document itself waives no gate |
| W4-3 Renderer + desktop feasibility | After P1/P2: GPU/WebGL2 in WebView2, transparency, blockout with head coupling, consented real wallpaper/window round trip using synthetic demo windows | Measured frame-time and pose-to-frame distributions; full head-box seam check; restoration tested on exit, forced kill, interrupted movement and later user changes |
| W4-4 Arrival | The full minute with sound, live spoken requests, skip, emergency cancel, reduced motion and failure handling | Matching captures/motion against the applicable current packets; full Windows run; fresh packet required for any distinct pass not covered |
| W4-5 Follow-ups | P3, then in-place rain/evening/combined-state integration | Fresh packet inspected before edits; deltas preserve IDs; undo and wallpaper synchronization work |
| W4-6 Rehearsal | Owner smoke; `week4/docs/design/acceptance/w4-paris-arrival.md` created, status pending | Owner decision on the tested revision |

## 10. Focused tests and owner smoke

**Automated:**
- Broker: allowlist rejection, other-monitor exclusion, journal written before effects, the restore-if-unchanged rule, recovery from a leftover journal, an unrestorable wallpaper selecting degraded mode.
- Projection: symmetric frustum at centre, sign of the asymmetry, behaviour of near and far points.
- Tracker: smoothing, clamping, ease-out on loss and resume.
- Router: paraphrases, unknown requests, interruption, stale results rejected.
- Timeline: durations sum to about 60 s; skip and cancel work from every phase.
- State: rain, evening and undo preserve all IDs.
- Schema: unknown fields rejected.

**Proposed engineering targets (not measurements):**
- Render at 60 fps at the demo resolution.
- Tracker at 24 fps or better.
- Pose-to-frame latency of 70 ms or less.
- Restore within 3 s of Esc.

**Owner smoke on Windows:**
1. Give consent.
2. Speak the request.
3. Watch the full minute.
4. Lean slightly to test parallax and occlusion.
5. Ask for rain, then evening, then undo.
6. Say an unknown request.
7. Interrupt EVA mid-line.
8. Skip on a second run.
9. Return.
10. Confirm the windows and wallpaper are restored.
11. Repeat once with the camera denied and once with reduced motion.
12. Answer the emotional questions in [DESIGN_PROMPT.md §14](DESIGN_PROMPT.md#14-feedback-questions).

## 11. Blockers and evidence status

**Blockers:**
- A finite per-run Weave cost approval and an inspected P1 packet. These block all UI work.
- Rights and terms review of Weave output before any runtime texture use.
- Sourcing an ambience audio licence.
- A verified camera on the demo machine.
- Results of the WebGL2/GPU spike.
- `IDesktopWallpaper` and placement behaviour on the demo machine.
- A new runtime STT/TTS budget.
- Period-authenticity research (planned checks: francs not euros; no smartphones, QR codes, e-scooters or bike-share; era wardrobe, vehicles, signage and props). None of it has been researched yet.
- Week 3 live-voice acceptance is still pending, so Week 4 inherits an unaccepted live loop.

**Evidence so far:** the six owner references were inspected visually (§2 of [DESIGN_PROMPT.md](DESIGN_PROMPT.md#2-reference-analysis)). They are mood references only: not Weave output, not licensed textures, not documentary evidence. The external off-axis code and the MediaPipe guide were inspected by the main session, not run. **Nothing has been implemented, generated, measured or accepted.**

## 12. Files

Existing: `week4/references/` (six owner JPGs, preserved), this file and [DESIGN_PROMPT.md](DESIGN_PROMPT.md). Planned, not yet created: `week4/src/`, `week4/src-tauri/`, `week4/fixtures/scenes/paris-1980s-terrace.json`, `week4/fixtures/narration/`, `week4/docs/design/revisions/<revision-id>/`, `week4/docs/design/INDEX.md` (once candidates exist), `week4/docs/design/acceptance/w4-paris-arrival.md`. No ComfyUI. No root file changes.

## 13. Implementation references (source inspection, not execution)

- [Off-axis reference implementation](https://github.com/icurtis1/off-axis-sneaker/blob/main/src/utils/offAxisCamera.ts) and [scene integration](https://github.com/icurtis1/off-axis-sneaker/blob/main/src/utils/threeScene.ts): inspected by Astra during feasibility. Code implements and uses the asymmetric frustum; the README alone is not the source of that conclusion. Repository license metadata was null when checked; reuse permission remains unverified.
- [MediaPipe Face Landmarker for web](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js): official documentation inspected by Astra. It documents landmark/matrix outputs and blocking inference; it does not guarantee calibrated eye-position accuracy or our frame budget.
- [IDesktopWallpaper](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nn-shobjidl_core-idesktopwallpaper) and [SetWallpaper](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-idesktopwallpaper-setwallpaper): official Windows API pages inspected by Astra. A specific monitor ID targets one monitor; a null ID targets all monitors and must not be used for this single-monitor scope. Position/background-colour setters are not per-monitor APIs.
- [SetWindowPlacement](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowplacement): official API page inspected by Astra. It restores show state and placement, requires a correctly initialized structure, and can adjust wholly off-screen coordinates. Workspace versus screen coordinates and DPI require explicit testing; no pixel-identical restoration guarantee across monitor changes.

These sources support feasibility, not a completed integration, performance measurement or historical reconstruction.
