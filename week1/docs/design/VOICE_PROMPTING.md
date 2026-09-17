# EVA speech authoring — Eleven v3

Owner direction, 2026-09-17. Applies to every new or revised ElevenLabs script. This supersedes the prior Multilingual v2 profile. Keep EVA's narrator, verification and timing local; no new general-purpose narration IPC or LLM conversation route is introduced.

Use `eleven_v3` with stability `0.5` (Natural). The canonical backend profile is [voice-profile.json](../../fixtures/narration/voice-profile.json); current scripts are [weather-lines.json](../../fixtures/narration/weather-lines.json). Both Rust and the browser-development backend validate the same [prompt policy](../../fixtures/narration/prompt-policy.json). The renderer may request only an approved phase, never choose text, model, voice, credentials or delivery policy.

## Required authoring format

Place bracketed delivery cues before the affected text. Stack up to three compatible cues when useful; reactions such as `[excited] [laughs]` are supported by the authoring policy but should suit the situation. Do not add laughter, frustration or sarcasm to every routine update. The owner's current acknowledgement is:

```text
[speed: 1.25x] [calm] [analytical] Of course. I will pull-up-the-weather in Ithaca.
```

`[speed: 1.25x]` and the hyphenated phrase are the owner's experimental delivery notation, sent literally to v3. HTTP success establishes payload acceptance, not exact speed or word-joining semantics. ElevenLabs does not document this numeric bracket syntax as a deterministic rate control. No resampling/playback-rate change is applied. Listen to each changed script; retain a good take rather than assuming a tag guarantees a particular performance.

Use punctuation intentionally. Ellipses invite pauses and capitals invite emphasis. Keep short action phrases uninterrupted: no comma, ellipsis, line break or inline tag between the verb and its object. For the current short demo lines, avoid ellipses and emphatic capitals because the owner reported unwanted internal pauses. The explicit period after "Of course" remains as requested. The local 1.2-second interval applies between clips; it cannot remove silence already synthesized inside one clip.

Use emotional tags rather than spoken stage directions; never include XML/SSML, including `<break>`. Select a coherent tone for each clip. A whisper-to-shout change must be authored as separate clips; the validator rejects quiet and loud tags in the same clip. For future continuous dramatic narration, render the clips separately and crossfade reviewed silent boundaries in post-production, keeping spoken words intact. The current dashboard lines have deliberate gaps, no extreme transition and no crossfade. An automatic post-production pipeline is not implemented.

Target more than 250 characters for extended narration, with actual relevant spoken context. Do not pad with tags, repeat sentences or send private background information to meet a character count. The owner's later short example preserves compact, stage-specific dashboard speech: the five current phases have explicit short-form exceptions in the policy. A new short script requires a documented exception; longer scripts must also fit the existing decoded-audio limit or be deliberately segmented and reviewed. The 250-character target is prompting guidance, not an ElevenLabs API minimum.

Future script changes must pass TypeScript and Rust prompt-policy checks. Add reviewed tags to the shared allowlist when needed; do not allow arbitrary stage directions or provider settings from the renderer. Preserve facts, permissions, data provenance and sentence verification independently of emotional styling. No general model-generated speech pipeline exists yet; it must use the same authoring and validation boundary when added.

## Pauses and repeat takes

First simplify the sentence and reduce conflicting cues; then regenerate and listen. A naturally worded alternative to test is `[calm] [analytical] I'll pull up the weather in Ithaca.` If Natural still varies too much, evaluate v3 Robust (`1.0`) as a separately reviewed profile change; it may respond less to expressive cues. Do not silently set an unsupported continuous stability value or port v2-only controls. Current policy pins Natural deliberately, so a profile change also updates its tests.

Restart the desktop app/server after edits. The in-memory audio cache deliberately reuses a take throughout a session; restarting clears it. Separate generation does not guarantee identical speech. Do not claim internal pauses are eliminated without listening to the selected voice.

## Official sources checked 2026-09-17

- [V3 best practices](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices): emotional tags, punctuation, voice dependence, Natural/Robust tradeoffs and no v3 SSML break tags.
- [Earlier v3 prompting guide](https://elevenlabs.io/docs/best-practices/prompting): indexed guidance encourages experimenting with prompts over 250 characters; the current consolidated guide no longer states this number. It remains the owner's authoring target.
- [Request stitching](https://elevenlabs.io/docs/eleven-api/guides/how-to/text-to-speech/request-stitching): unavailable for v3; previous/next text and request IDs are omitted.
- [Speech settings](https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech): model-specific controls; the v3 request sends only stability, omitting the prior speed, similarity, style and speaker-boost overrides.

Development test: `npm.cmd test`, `npm.cmd run rust:test`, `npm.cmd run build`. Optional live, billable test: `node scripts/narration-provider-check.mjs`; it uses the same TypeScript payload builder and writes clips only to a temporary local directory, without logging keys or the voice ID. Native playback and subjective delivery always need a listening exercise.

## Weather and wind dialogue refinement

The current five phases are `acknowledge`, `building`, `present`, `wind-wait`, and `wind-present`. The presentation template resolves Thursday/Friday conditions from the same bundled synthetic forecast displayed by the UI. Both backends validate source identity, location and exact fixture dates before factual speech, including before returning cached audio. Unknown conditions or changed dates fail closed; no arbitrary factual model prose is accepted. The existing Sample label continues to identify synthetic data.

After the weather summary asks whether the user wants anything else, the microphone-only wind follow-up plays "Give me a second."; its completion starts five seconds of wind assembly. Once wind is committed and visible, narration introduces it. If narration is unavailable, construction still completes; dismissing, hiding or starting another microphone request cancels pending wind work. This keeps loading progression local and does not claim a five-second provider response time.
