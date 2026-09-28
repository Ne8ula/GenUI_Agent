# Week 3 speech policy

Week 3 implementation policy, 2026-09-27. This is a scoped exception to the [archived voice policy](../../week1/docs/design/VOICE_PROMPTING.md), not a change to it.

- Use the owner's configured, existing ElevenLabs voice. No voice cloning or silent substitute.
- Pin `eleven_v3`, stability `0.5` (Natural). No SSML, arbitrary inline tags, resampling, provider speed override or request stitching.
- **Short-conversation exception:** every Week 3 turn may be shorter than 250 characters. At most two sentences and 60 spoken words; never pad a reply to meet a narration target.
- Rust validates reply, stance, intensity and delivery together. It—not the renderer or provider response—adds an allowlisted delivery cue. Cues guide delivery; neither a successful HTTP response nor a tag establishes naturalness or exact prosody.
- One narrator, one short response per turn. Acknowledge first; offer one low-stakes suggestion or a question, not unsolicited extended advice. Corrections supersede earlier interpretations.
- The conversation model receives only bounded session-local text. There are no fact, web or action connectors. External-fact requests receive a transparent limitation. A model's scope field is **not factual verification**; arbitrary external claims are not authorized by passing the JSON schema. General semantic factuality remains a release-review limitation for this demo.
- Captions and expressive stance begin with actual local playback start. A provider response alone does not mean the answer was spoken. Only completed playback is committed as a delivered assistant turn; interruption must not record unheard text as heard.
- Stop and barge-in stop local audio immediately and invalidate pending work. End additionally releases microphone tracks and clears session context. Mute discards unfinished input but does not cancel an existing answer.

## Privacy and budget

OpenAI receives microphone WAV and bounded recent conversation; ElevenLabs receives only approved reply text with cues. Local recordings/transcripts are not written to disk. Public visual evidence uses synthetic fixtures without microphone audio. JavaScript IPC/base64 strings and provider-owned copies cannot be securely zeroed; dropping references/clearing mutable buffers is not a cryptographic erasure claim.

OpenAI requests disable response storage where supported; that does not eliminate provider abuse-monitoring retention. ElevenLabs zero-retention eligibility has not been verified, and an enterprise-only logging option must not be assumed available. The UI discloses these limitations before microphone activation.

The owner authorized at most **10 short billable rehearsal turns** in this implementation session, with no image/video generation. The Rust process defaults to zero allowance; explicitly set `EVA_W3_MAX_TURNS` to a number up to 10. Failed/cancelled attempted turns consume an allowance and are not automatically retried. Restarting the process resets its in-memory counter; track the total across restarts manually. This is a turn cap, not a dollar-price guarantee or authorization for additional rehearsals.

## Checks still requiring a person

Listen to the actual approved voice. Check comfort, shared joy, congratulation and assistance against the response, including a correction. Test real loudspeakers at presentation volume; energy VAD and requested browser echo cancellation cannot prove absence of self-interruption. Measure acoustic onset separately from the software stop path. Headphones can help diagnosis but do not establish the planned loudspeaker acceptance condition.

## Official references

- [Eleven v3 prompting](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices)
- [ElevenLabs TTS API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)
- [ElevenLabs zero-retention mode](https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode)
- [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data)
- [OpenAI speech transcription](https://developers.openai.com/api/docs/guides/speech-to-text)
