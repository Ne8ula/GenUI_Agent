# Speak-only controls - 2026-09-17

Candidate; owner/native review pending. Predecessor: [wind dialogue](../week1-wind-dialogue-20260917/manifest.md), including the subsequent 1000 ms audio tail. Authoring: Codex GPT-6, source edits and Playwright/Edge. Uncommitted working tree; source hashes accompany this record.

| Before | After | Why |
| --- | --- | --- |
| Opaque horizontal bar with Weather and Type shortcuts | Transparent, compact Speak request control | Requested microphone-only entry |
| Black enclosing panel around docked voice controls | Controls sit directly below the eye on transparency | Consistent overlay treatment |

Removed typed-input state and unused fallback styles. Recording/cancel, errors and the recognized request remain functional. No eye, dashboard, narration timing or provider changes.

Windows/Edge, DPR 1, 1440x960 and 400x640 CSS pixels. Same synthetic fixture; blink timing unseeded. PNGs preserve root alpha. Before: [desktop](before/1440.png), [narrow](before/400.png). After: [desktop](after/1440.png), [narrow](after/400.png), [dashboard](after/dashboard.png). After stills visually inspected.

Production build passed (frontend/server TypeScript and Vite). [Browser checks](after/results.json) passed for absent alternate controls, one idle command button, compact transparent borderless wrapper, keyboard focus, microphone submission/weather reveal, transparent docked controls and no page errors. Reproduce with `node scripts/speak-only-smoke.mjs` against the dev server. Synthetic microphone/injected Whisper; narration disabled; no paid requests. Wind dialogue harness updated to enter weather through the microphone and syntax checked; full wind sequence not rerun for this layout change.

Native compositing and real microphone/provider audio not retested. Owner test: launch desktop, inspect the floating Speak request control, request weather and then wind. Acceptance pending; no study phase advancement.
