# Week-one weather candidate

Status: **pending owner review; final native launch blocked**. Prepared 2026-09-16. Revision: `week1-weather-20260916`, working tree based on `83a155f`; [manifest and hashes](../revisions/week1-weather-20260916/manifest.md).

Owner scope: “Implement the next steps, and start creating a distinct visual patten based on the design and planning doc.” This follows the owner's passing step-2 contract run and authorizes the remaining week-one slice. Accepted visual input remains `week1-resize-20260916`. No new phase or visual acceptance is inferred.

## Review exercise

Use `npm.cmd run dev` from the repository root, then open `http://127.0.0.1:1420` for the verified browser fixture. Native development is normally `npm.cmd run desktop:dev`; standalone build/run commands are in the [README](../../../apps/desktop/README.md), with the current launch blocker explicitly recorded.

1. Open EVA. Read seven dates, Celsius temperatures, location and synthetic-source labels.
2. Move the card using the handle or arrow keys; choose Sunday.
3. Add wind. Confirm the same card retains its location and selection. Monday wind is unavailable, not zero.
4. Inspect **Preference used: Celsius** and expand the exact source. Browser must identify its fixture transport; native must say **Rust / bundled record**.
5. Escape closes only the dossier and returns focus to its trigger. Undo preserves position; reset returns to Thursday and the initial position.
6. Dismiss and reopen. Check 400 px narrow, wide/short and reduced-motion layouts. Short windows scroll vertically; all controls remain reachable.
7. After the signing-policy blocker is resolved through the normal policy owner/signing process, retest the final standalone build, close/relaunch, and repeat the full sequence twice.

## Actual results

- Final browser candidate: two complete rehearsals, mouse/keyboard move, selected-day and focus continuity, exact source, seven viewport checks, reduced motion and quiet mode passed.
- Eight JavaScript contract/protocol tests and ten Rust tests passed; Rust formatting and Clippy passed. Production TypeScript/Vite build and debug native compilation passed.
- Preceding native candidate (`native-03`): real Rust source lookup/retry, two rehearsals, normal close/relaunch, synthetic loading/error/timeout, derived Fahrenheit, escaped Markdown, and ignored superseded/late replies passed.
- Final CSS changes stack temperature pairs at intermediate widths and keep the dossier close control visible while scrolling. Final browser candidate covers these changes; final native retest (`native-04`) was blocked before launch by Code Integrity events 3033/3077. Earlier native results do not establish final-build success.
- Before/after images and browser backup recording are in the manifest. Captures are synthetic WebView content; no personal desktop screenshots are included.

## Limitations and decision

Windows policy blocked the final debug executable and previously blocked a release build script. No bypass, signing change, packaging or macOS test was performed. Higgsfield generation was rejected by the account restriction; native styling follows DESIGN.md and the saved brief, with no generated reference claimed. No live connectors, conversational model, voice, private memory, GPU tools or product policy broker are included. This checkpoint does not complete S0–S2 or product milestones.

Owner feedback, 2026-09-16: requested redesign because the UI felt like a PowerPoint and did not resemble the Evangelion-inspired guidelines. Requested an animated eye, stronger effects and simple Whisper weather input, followed by a square-pupil eye reference. This candidate is **superseded, not accepted**. Its historical evidence remains intact. Review the [voice/eye successor](week1-voice-eye.md); native verification and full week-one acceptance remain pending.
