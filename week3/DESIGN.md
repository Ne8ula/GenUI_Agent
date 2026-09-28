# Week 3 — The responsive eye

Date: 2026-09-27 · Status: design proposal for owner review · Accepted visual baseline: none.

## 1. In one sentence

You speak naturally; EVA answers in a human-sounding voice while its eye becomes a smoothly changing emotional sculpture.

Companion: [seven-day implementation plan](PLANNING.md).

## 2. Confirmed direction and scope

The owner requested a Week 3 pivot after feedback that the weather/dashboard direction remained too two-dimensional. Confirmed choices:

- A sculptural, dimensional presence, not a dashboard or navigable 3D world.
- An eye that may soften, bloom, stretch, or dissolve into abstract forms and return.
- An expressive answer to the user's emotional context: comfort complaints, share happiness, congratulate celebrations, and assist frustration.
- Live, hands-free conversation with interruption; a 1–2 minute full vertical-slice demo within one week.

This is the explicitly requested, Week-3-only exception to [the main design guide](../DESIGN.md). It replaces weather compositions, dashboard primitives, the fixed red/bone/black palette, and mandatory dithering for this experiment. It permits the eye to be the principal expressive surface. It does not replace the product architecture, microphone consent, cancellation, accessibility, provenance, or owner acceptance rules in [AGENTS.md](../AGENTS.md). Week 1 and Week 2 stay unchanged; E1 and S0–S4 are not accepted by this pivot. This multimodal demo is not the earlier silent, matched-condition study.

## 3. Reference interpretation

Local references are inspiration, not assets cleared for redistribution or evidence of psychological effects. Filenames below resolve inside [pivot_references/](pivot_references/).

| Reference | Transfer into the design |
| --- | --- |
| `7724e363b83ff22725511c847d83a9a5.jpg`, `a2aec18eff353d2a9732a2d914acfef2.jpg`, `d01064ea01b15de80f039a7772cdfb2e.jpg` — emotion globes, credited in images to @DA.WB | Volumetric silhouettes, internal moving layers, luminous edges; one identity with many material states. |
| `ee205e9fab129f1ec2925451e280263b.jpg` — Feeling Heart, credited in image to Sarah Hart Art | Softness, translucency, tension and openness as expressive dimensions, rather than color alone. |
| `5c73a90a72b20c646c75054781ed0a32.jpg` — insect/specimen collage | Organic/digital contrast and selective grain. Do not reproduce its diagram boxes as dashboard chrome. |
| `12db78e771a340acc35cd34c9e8b2bd8.mp4` — pixel-colored flower | A stable organic identity with changing surface material. |
| `From Klickpin.com- Minimal small business branding ideas that help you create a polished look with very simple and affordable details for women wh.mp4` | Owner-selected reference for tracking-box animation throughout the experience, alongside sculptural organic forms and translucent surfaces. Thin boxes track regions of the changing eye/form; brief appearances and highlights suggest thinking and shifting attention. These visualize observable agent activity, not a literal readout of hidden reasoning. |
| `0268915e2cc8124b9d5b9c99545f8736.gif` | Owner-selected reference for the loading/processing animation: use similar colorful digital fragmentation, horizontal streaks and shifting pixel trails, adapted around the eye's recognizable core rather than the GIF's human figure. Transition smoothly into the response expression when ready; keep the effect interruptible and avoid flashing. |

Inspection so far: five still images and sampled contact sheets of both MP4s and the GIF. Real-time playback, audio, creator provenance and reuse rights have not been verified. Inspect full motion before treating a reference's timing as a target. Create original procedural material.

## 4. Composition and material

Proposed starting composition: one large eye/entity floating in generous empty space on a quiet charcoal stage. A pale stage is an alternate to test, not a second interface. Depth comes from shading, overlapping translucent layers, deformation and restrained perspective—not a framed card or an animated wallpaper.

Preserve a perceptible core, position and material continuity through transformation. The eye may become abstract, but it should still feel like the same presence. Avoid realistic eyeball anatomy and full-body character construction for this week.

Use a small coherent palette with warm pearlescent, cool translucent and brighter iridescent accents. Exact colors follow a visual comparison; none is an emotion classifier or confidence meter. Shape, pace and expansion must carry meaning without color. Retain Space Grotesk / IBM Plex Sans / IBM Plex Mono for the minimal controls and optional captions; changing fonts is not a priority.

Controls remain outside the effect: Start conversation, visible microphone status, Mute microphone, Stop response, End session, captions and reduced motion. Keyboard access and visible focus are required. Technical errors use explicit text, not a sad expression. No emotion dashboard, meters, chat panels or debug labels in the presentation view.

## 5. Respond, do not simply mirror

Interpret the meaning of the conversation and its recent context. The Week 3 default uses the transcript, not acoustic emotion recognition, camera analysis or a claim to know the user's internal feelings. Mixed or ambiguous context gets a restrained response or a natural clarifying question.

| User context | Response stance | Candidate movement | Voice direction |
| --- | --- | --- | --- |
| Complaining | Comforting, attentive | Soften contour, relax internal motion, gently orient toward the user | Warm acknowledgement; do not rush into fixing |
| Happy | Shared happiness | Lift and broaden; light, buoyant motion | Warm, lightly upbeat |
| Celebrating | Congratulatory | A fuller outward bloom, then an easy settling | Brief, genuinely enthusiastic congratulation |
| Frustrated or stuck | Supportive assistance | Settle and focus; open slightly as an actionable next step is offered | Calm encouragement and one useful next step |
| Unclear or neutral | Curious attention | Stable core, restrained orientation | Ask or listen without assigning an emotion |

These are authored performance hypotheses, not universal emotion mappings. Assistance is a conversational action, not an emotion label. Offer help in speech; do not operate applications or imply a task was completed. Corrections immediately take precedence over the previous interpretation. No sulking, guilt, unwanted intimacy or emotional resistance to interruption.

## 6. Motion grammar

Two independent layers compose the result:

- **Turn state:** idle, listening, processing, speaking, interrupted, unavailable.
- **Response stance:** attentive, comforting, shared joy, congratulatory, supportive assistance.

Listening and processing acknowledge activity without prematurely diagnosing a mood. The reply and stance come from the same validated response. Speaking expression begins with actual playback, not when a network request is sent.

Tracking boxes form a recurring visual layer throughout idle, listening, processing and speaking—not only a loading effect. Keep them sparse and quiet at rest; while processing, let boxes briefly appear, highlight, shift and regroup around the deforming form, alongside the GIF-inspired fragmentation. Drive their activity from actual turn-state events, with locally authored motion suggesting attention rather than exposing or inventing internal reasoning steps. Track the rendered form, not the user's face or screen. Use restrained opacity pulses rather than rapid high-contrast flashing; boxes never obscure captions or controls. On interruption, yield immediately with the eye; on End, stop. Reduced motion uses static outlines or hides the decorative boxes while retaining readable status.

Local authored animation owns every frame. The model proposes only bounded stance/intensity data, never shader code or keyframes. Blend contour, scale, orientation, internal flow, opacity and color from their current values. Retarget midway without resetting the object or its animation clock. Use damped motion or equivalent continuous interpolation; avoid abrupt acceleration, strobing, hard palette cuts and loop restarts.

Initial tuning hypotheses, not measurements: expressive blends around 0.6–1.2 seconds; a gentle return over 1–2 seconds. Interruption does not wait for either: stop speech locally, then release the visual pose smoothly toward listening. Audio amplitude may add a small secondary pulse; it must not choose the emotion or dominate the silhouette.

Reduced motion removes breathing, drift, traveling particles and deformation, retaining a static expression and readable status. Stop and End remain immediate in both modes.

## 7. Voice and conversation

Proposed persona: warm, attentive and lightly playful, with short replies that leave room for the user. Start with the existing approved voice after configuration and listening checks; no new voice cloning.

Follow [the Eleven v3 policy](../week1/docs/design/VOICE_PROMPTING.md): `eleven_v3`, Natural stability `0.5`, approved compatible delivery cues and no SSML. Tags are experimental guidance, not guaranteed performances. Week 3 needs its own documented short-conversation exception; do not stretch brief replies to the extended-narration character target or edit archived policies.

Reply text, affect and delivery are validated together by the backend. The renderer cannot select voice/model settings, arbitrary speech or provider credentials. Keep factual sentence verification separate from expressive styling. Begin with conversational acknowledgement and low-stakes, context-grounded assistance; external factual requests must use an approved verification path or a transparent limitation, not invented facts.

Once the user starts the session, speech detection and turn-taking require no repeated click. Keep listening during EVA's reply so the user can interrupt. Echo cancellation and actual speaker testing are essential: EVA must not converse with its own playback. Mute microphone does not silently end the response; Stop response cancels speech; End session stops both and clears session-only context. On mute, discard any unfinished capture.

Keep raw audio transient and delete after processing/cancellation. Do not retain audio, transcripts or inferred feelings by default. Explain which services receive audio/text before enabling the live session; provider retention settings need verification. No private conversation in public demo evidence.

## 8. Visual review

Compare one neutral pose, four response stances and one interrupted transition at matching viewport/DPI. Judge continuity, legibility, comfort and congruence with actual voice—not screenshots alone. Record a short motion sequence and a reduced-motion rendition once implementation exists.

Store future candidates under `week3/docs/design/revisions/<revision-id>/`, preserving rejected alternatives and the main guide's evidence-manifest fields. First candidate: no runnable Week 3 before-state; use these references as historical context. Owner approval of a tested revision, not this document or generated imagery, establishes the visual baseline.
