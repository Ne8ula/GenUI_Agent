# Speech delivery decision — 2026-09-17

Keep the existing configured voice and direct TTS boundary: EVA supplies the three approved sentences and controls playback. Whisper remains input-only. The prior request used Flash v2.5 with stability 0.5 and similarity 0.75, without neighboring text.

ElevenLabs describes Multilingual v2 as a quality-oriented model with more latency/cost than Flash. Selected `eleven_multilingual_v2` for this staged demo, where the owner explicitly wants more time and more natural delivery. This is a candidate choice, not proof that the owner's voice preview used that model. [Official models](https://elevenlabs.io/docs/overview/models).

The official guide says lower stability allows more emotional variation, while very low values can become erratic; it recommends keeping style at zero. Speaker boost modestly reinforces voice similarity. Our conservative candidate uses stability 0.4, similarity 0.75, style 0, speaker boost enabled and speed 0.96. These are chosen settings, not ElevenLabs-prescribed optimal values for this voice. [Voice settings guide](https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech).

`previous_text` and `next_text` are documented continuity hints. Both backends populate them from the adjacent approved sentences. They are not extra spoken text or private memory. [Create speech API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert).

Example construction request (no credentials or voice ID):

```json
{
  "text": "I'm building your weather dashboard now.",
  "model_id": "eleven_multilingual_v2",
  "voice_settings": {
    "stability": 0.4,
    "similarity_boost": 0.75,
    "style": 0,
    "use_speaker_boost": true,
    "speed": 0.96
  },
  "previous_text": "Of course, I'll bring up the weather for Ithaca.",
  "next_text": "Here's your weather dashboard."
}
```

No v3-only emotion tags are inserted into v2 text. Delivery instructions embedded as ordinary text can be spoken aloud. Pauses between complete clips are scheduled locally so cached generations preserve timing and cancellation remains immediate. [Best practices](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices).

Normal choreography lasts 15 seconds: 6 seconds of folder retrieval, approximately 6 seconds of blueprint construction, then a 3-second dashboard reveal. Construction speech starts no earlier than 5 seconds after the request; every later sentence waits at least 1.2 seconds after the preceding clip ends. Presentation speech waits until 700 ms after the finished dashboard. Slow generation can delay speech; a stale construction sentence is dropped once presentation is ready. Reduced motion still skips staging.

Shared backend profile: `fixtures/narration/voice-profile.json`. Provider deadline is now 20 seconds (renderer request 21 seconds); the 400 KB audio cap, 15-second decoded clip cap, fixed phase allowlist, single generation, cancellation and memory-only cache remain. Restart the app/server to clear old cached clips.

Live check: the sandboxed dev server could not reach the provider (`EACCES`). A separately authorized network check received HTTP 200 MP3s for all three exact payloads: 33,898 / 24,285 / 24,703 bytes. Request durations were 1,386 / 1,312 / 975 ms in this one run, not a performance benchmark. Audio stays in a temporary local folder, outside public evidence. No keys or voice ID were logged. Native playback and subjective comparison with the selected voice preview still need an owner exercise.
