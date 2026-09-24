# E1 voice-led weather — Weave node guide

2026-09-24 · Reference-guided keyframes and motion study · Generation and owner acceptance pending.

**This is a step-by-step recipe with a separate prompt for every generation node.** Use **ChatGPT Images 2.0 Edit** for reference-guided stills and **Seedance 2.0** for first/last-frame video. Text enters through **Prompt** nodes; images enter through **Import** nodes.

These names/input types are documented in indexed official Weave pages, not verified in the owner's live account. Look for the GPT Image 2 / ChatGPT Images 2.0 **Edit** entry with image inputs. Select **Seedance 2.0** with **First Frame** and **Last Frame**, not the separately listed **Seedance 2.0 Reference** variant. Confirm the actual inputs, supported sizes, reference count, and cost before running. See [sources](#sources-and-checks).

## Direction

After one explicit microphone enable, the user asks “What's the weather today in NYC?” EVA's actual Week 1 eye becomes a recognizable dithered sun. “What about tomorrow?” keeps NYC context and revises the same composition into clouds and rain. “Dismiss the weather” stops speech and returns to the original eye. Short speech and concise facts will be native behavior, not generated video captions.

The owner selected the **original Week 1 eye and cursor tracking**, plus their supplied **Mock Desktop** as the visual-review setting. **K0-Desktop is now prepared**, so it replaces the earlier guide's missing K0 and lower-left E1 eye origin. Sunny today/rainy tomorrow is a synthetic scenario, not the real NYC forecast. The mock desktop is a fixed backdrop, not weather data.

The current E1 app has no voice or tomorrow fixture; its eye and field are separate, and dismissal removes the UI. This guide does not implement the new interaction or accept E1. Preserve prior evidence, the silent comparison option, and the unchanged Week 1 archive. Canonical references: [DESIGN.md](../../../DESIGN.md), [E1 specification](E1_REVISABLE_WEATHER.md), [pending acceptance](../acceptance/e1.md).

## Step 1 — Import the reference images

**Node type: Import. No AI model or prompt.** Create these two required reference nodes:

| Node name | File to upload | Role |
| --- | --- | --- |
| `BG — Mock Desktop, locked` | [mock-desktop-owner.png](../revisions/e1-20260924-week1-eye-reference/mock-desktop-owner.png) | Owner's supplied desktop, preserved byte-for-byte. The landscape, white wallpaper sun, taskbar, icons, clock, and date are fixed context—not EVA and not live UI. |
| `R1 — Original Week 1 eye detail` | [week1-eye-only.png](../revisions/e1-20260924-week1-eye-reference/week1-eye-only.png) | Fresh close-up of the unchanged Week 1 renderer: anatomical shape, square pupil, eyelid, and red ordered dithering. Detail reference only, not a full-frame endpoint. |

Optional material reference: [the current E1 weather screenshot](../revisions/e1-20260924-01/native/packaged-noon-light.png). If needed, import it as `R2 — E1 material only`, but do not wire it into the minimal recipe. Its pale grid, large test-panel text, and teal circles are not EVA. Its smaller lower-left eye, abstract weather shape, and background must not override K0-Desktop.

Upload the actual files; Weave cannot open local Markdown links or read a computer path from a prompt. Preserve the input order stated below if the model receives images by order rather than by node name.

## Step 2 — Import K0-Desktop as the shared eye endpoint

**Node type: Import. Rename: `K0 — Week 1 eye on Mock Desktop`. No generation prompt.**

Upload **[K0-week1-eye-on-mock-desktop.png](../revisions/e1-20260924-week1-eye-reference/K0-week1-eye-on-mock-desktop.png)**.

This is a **2000 × 1126 full-frame reference composite**, matching the supplied Mock Desktop exactly. The unchanged Week 1 app was freshly rendered at those dimensions, and its eye-only layer was alpha-composited onto the mock desktop without scaling, moving, regenerating, or color-keying the eye. Its original local opaque canvas/frame is preserved. Only the surrounding app controls were hidden for the capture, without changing layout. The background outside the eye and the taskbar were checked pixel-for-pixel unchanged.

This is a **non-generative reference composite**, not a screenshot proving that EVA was running natively on that desktop. The [capture/composite packet](../revisions/e1-20260924-week1-eye-reference/README.md) separates source capture, compositing, and native limitations.

**Wire the exact same K0 file to:**

- **V1 → First Frame:** the reveal begins here.
- **V3 → Last Frame:** dismissal returns here.

Never use R1's crop, a freshly regenerated eye, or the earlier dark-matte capture as one of these endpoints. K0 governs full-frame location, scale, geometry, and backdrop. The eye center is approximately **(1000, 538)** in this image. Sunny and rainy matter should develop around that origin, remain in the available desktop area, and retract to it. This replaces the earlier lower-left-eye instruction.

Keep BG, K0, K1, and K2 at matching dimensions/framing. If a selected model requires a standard aspect ratio such as 16:9, prepare consistently fitted/padded derivatives of every endpoint once; preserve the full taskbar, avoid independent auto-crops, and reuse the exact same normalized K0 for both transitions. Preserve the 2000 × 1126 master. Do not mix the earlier 2560 × 1392 dark-background study into this sequence.

Supplemental behavior reference: [Week 1 cursor tracking — MP4](../revisions/e1-20260924-week1-eye-reference/week1-cursor-tracking.mp4) / [GIF](../revisions/e1-20260924-week1-eye-reference/week1-cursor-tracking.gif). The eye responds to actual pointer events using its original code; a visible cursor marker was added only to explain the recording. It uses a separate dark review matte and is **not an endpoint or an additional required model input**. Preserve this gaze/lid behavior as a reference for later idle/returned-eye implementation; no E1 tracking code has been changed.

## Step 3 — Generate K1: sunny weather over the Mock Desktop

**Add these nodes:**

- **Prompt** → rename `P1 — Sunny keyframe prompt`.
- **ChatGPT Images 2.0 Edit** → rename `K1 — NYC today, sunny`.

**Connect:** P1 → K1 **Prompt**. Connect **K0, R1, BG**, in that order, to K1's **Image** inputs. This is text + three reference images → image. BG supplies the clean desktop behind the eye, so the model need not invent what the eye was covering. Verify support for three reference images before running.

Use one image per run and the common landscape framing. PNG is preferred if exposed. Paste this complete prompt into P1:

```text
Create ONE sunny-weather keyframe for the existing EVA desktop prototype, using the three attached references. This is a continuation of the actual prototype, not a new application design.

REFERENCE 1 is K0: the full-frame original Week 1 eye on the supplied Mock Desktop. It controls the framing, eye identity, size, and centered spatial origin. REFERENCE 2 is a close-up of that same eye; it controls the anatomical identity and crisp red square-cell ordered dithering. REFERENCE 3 is the CLEAN MOCK DESKTOP with no EVA overlay; use it to preserve and reveal the exact background behind the changing eye.

The desktop is a LOCKED BACKGROUND PLATE. Do not alter, repaint, recolor, blur, relight, crop, zoom, or animate its landscape, sky, lake, mountains, trees, reeds, white wallpaper sun, taskbar, icons, clock, or date. They are not weather data or EVA controls. The white sun already in the wallpaper is NOT the sun to animate. Add EVA's clearly separate red dithered weather layer above this desktop, with no new app window or full-screen backing. Keep the taskbar unobstructed.

Transform the original eye and its local eye surface into an unmistakable sun, expanding around the original eye's centered position. Construct a readable circular disk plus six to eight separated radial rays from the same crisp, screen-aligned square cells. Use coherent ordered dithering with clear negative-space gaps between the rays. The silhouette must communicate sunshine without text, motion, or switching the palette to yellow. Keep the material in-frame and reserve a small stable clear area for later factual text.

Use expressive red (#FF3B35 as the design token), with restrained charcoal/bone support where needed. The eye has BECOME the weather: no separate eye, pupil in the sun, or face remains. The original eye's rectangular surface must not become a rectangular weather card; its material resolves into the sun while the clean desktop is revealed around it.

No vague particle fog, smoke, nebula, photographic weather, smooth gradient sphere, stock weather emoji, bloom, blur, skyline, dashboard, generated numbers, captions, status badges, or controls. Do not reproduce E1's historical test panels if another reference is supplied.

Output one keyframe at the shared full-frame dimensions, not a contact sheet. This sunny condition is a synthetic design scenario, not a real NYC forecast. Only EVA's overlay changes; the Mock Desktop remains the same image.
```

**Review gate:** identify the sun without a caption at actual display size. Check that the desktop—including the white wallpaper sun and taskbar—did not change. Preserve the selected K1; export/reimport it if necessary so a later rerun does not silently change downstream endpoints.

## Step 4 — Generate K2: clouds and rain over the SAME desktop

**Add these nodes:**

- **Prompt** → rename `P2 — Rainy keyframe prompt`.
- **ChatGPT Images 2.0 Edit** → rename `K2 — NYC tomorrow, rain`.

**Connect:** P2 → K2 **Prompt**. Connect **selected K1, R1, BG**, in that order, to K2's **Image** inputs. Use the same dimensions as K1.

Paste into P2:

```text
Revise the selected sunny EVA keyframe into rainy tomorrow within the SAME response and on the SAME Mock Desktop.

REFERENCE 1 is the selected sunny keyframe: keep its framing, overlay position, clear reading area, cell scale, and palette. REFERENCE 2 is the original Week 1 eye for material identity. REFERENCE 3 is the clean Mock Desktop: preserve it exactly and use it to reveal areas previously covered by the sun.

The user only asked, “What about tomorrow?” NYC carries over. Do not open another panel, create a comparison screen, return to the eye, or change the camera.

Replace EVA's red sun disk and rays with a broad, unmistakable rain-cloud silhouette. Give the cloud a coherent body, two or three lobed upper contours, and a readable lower edge. Below it, create clearly separated short vertical rain streams made of square cells, with negative space between streams. Rain must be visibly different from cloud texture, not merely a denser particle cluster.

Keep the SAME crisp ordered-dither matrix, cell scale, and expressive red/charcoal/bone palette. Do not switch to blue to communicate rain. The macro silhouette and downward rain marks must identify the weather in a still frame. Rain is illustrative, not a numerical measurement. No sun rays or separate eye remain in EVA's final rainy overlay.

LOCK THE BACKGROUND: do not change the wallpaper's sky, existing white sun, lighting, lake, mountains, trees, reeds, taskbar, icons, clock, or date. Do not make the wallpaper cloudy or wet, darken the desktop, move the lake reflection, or add rain to the landscape. The rain exists ONLY in EVA's bounded dithered overlay above the desktop. Keep the taskbar unobstructed and retain the clear reading area.

No amorphous fog, drifting smoke, photorealistic clouds, blurred gradients, stock emoji, glass card, enclosing app frame, generated weather numbers, captions, or controls. Output ONE rainy keyframe with the same full-frame dimensions as K1. This is a synthetic scenario, not a live forecast.
```

**Review gate:** distinguish sunshine and rain by shape alone; verify stable cell scale, palette, geometry, and background. Select one K2 before video generation. Do not run an unbounded batch of variations.

## Step 5 — Generate V1: eye → sunshine

**Add these nodes:**

- **Prompt** → rename `P3 — Eye-to-sun motion`.
- **Seedance 2.0** → rename `V1 — Eye expands into sunshine`.

**Connect:** P3 → V1 **Prompt**; **K0-Desktop → First Frame**; **selected K1 → Last Frame**.

Choose matching landscape framing and the shortest suitable supported duration. Disable generated audio if that control exists; otherwise exclude it from the review. Narration is not generated here. Paste into P3:

```text
Animate the supplied first and last frames as ONE continuous transformation of EVA's overlay. Start at the exact original Week 1 eye on the Mock Desktop and finish at the selected red dithered sun composition.

The eye responds immediately. Its red square-cell material opens and expands outward around its existing centered origin. The eyelid and square pupil resolve into a readable circular sun disk; six to eight separated rays emerge from the same material. The eye's local rectangular surface dissolves into the new free-standing silhouette, revealing the desktop behind it. No duplicate eye, eye face in the sun, or weather card remains.

Keep the square-cell matrix crisp and coherent. Use a short purposeful reveal that decelerates into the sunny endpoint, not a swirling particle explosion. If the video duration must be longer, hold the completed endpoint rather than stretching the transformation into a spectacle.

The Mock Desktop is a fixed background plate throughout. No camera cut, pan, zoom, shake, perspective shift, global relighting, or background warping. Do not animate or replace the wallpaper's existing white sun. The landscape, lake reflection, taskbar, icons, clock, and date must remain stationary and unchanged. Only EVA's red dithered layer moves, and it stays above the taskbar.

No new text, weather numbers, captions, controls, unrelated objects, sound, smoke, bloom, motion blur, flashing, or random dust. Preserve the supplied endpoints' framing. This is a silent visual reference for a synthetic response, not a working voice application.
```

**Check:** motion originates in the actual eye, the separate eye disappears, K1 is reached, and background objects do not move. The prompt is a constraint—not a guarantee of perfect pixel or particle identity from a video model.

## Step 6 — Generate V2: sunshine → clouds and rain

**Add these nodes:**

- **Prompt** → rename `P4 — Sun-to-rain motion`.
- **Seedance 2.0** → rename `V2 — Tomorrow revision`.

**Connect:** P4 → V2 **Prompt**; the SAME selected **K1 → First Frame**; selected **K2 → Last Frame**. Keep the V1 review settings.

Paste into P4:

```text
Animate the supplied sunny first frame into the supplied rainy last frame as a revision of ONE EVA response. The user has asked, “What about tomorrow?” Do not generate speech or text.

Do not return to the eye, reset the scene, move the camera, or open another panel. Keep EVA's spatial anchor, cell scale, palette, and clear reading area fixed.

The red sun's rays retract into the shared dither field. The disk and ray material reorganize laterally into a coherent cloud with two or three lobed upper contours and a readable lower edge. Once the cloud is recognizable, short separated columns of square cells fall beneath it as rain. EVA's sun is absorbed into the cloud; no EVA sun rays remain at the endpoint.

Communicate rain through clear cloud shape and distinct downward rain streams, NOT merely by increasing dot density. Retain crisp screen-aligned square-cell ordered dithering and the same expressive red/charcoal/bone palette. No realistic clouds, blue recoloring, smoke, blur, glow, flashing, or particle explosion.

The supplied Mock Desktop remains fixed. Do not change its weather, white wallpaper sun, sky, lighting, lake, reflections, taskbar, icons, clock, or date. No background rain, darkening, wet landscape, parallax, pan, zoom, shake, or camera cut. Rain belongs only to EVA's bounded overlay, never the wallpaper. Leave the taskbar visible.

Reach the selected rainy endpoint promptly and hold it long enough to inspect. No new text, numbers, controls, or audio. This is a silent synthetic visual study, not a forecast measurement or a working voice interface.
```

**Check:** cloud shape resolves before rain becomes prominent; rain reads as rain rather than debris. Reuse the same K1 that V1 ends on, not a regenerated sunny approximation.

## Step 7 — Generate V3: dismissal → exact original eye

**Add these nodes:**

- **Prompt** → rename `P5 — Return-to-eye motion`.
- **Seedance 2.0** → rename `V3 — Dismiss weather`.

**Connect:** P5 → V3 **Prompt**; selected **K2 → First Frame**; the SAME **K0-Desktop → Last Frame** used in Step 5.

Paste into P5:

```text
Animate the supplied rainy first frame back to the EXACT original Week 1 eye on the Mock Desktop shown in the supplied last frame. This is an explicit dismissal: withdrawal begins immediately, not after another rain cycle. Make the contraction noticeably quicker than the reveal.

Stop emitting new rain. Existing rain streams shorten and clear while the cloud's square-cell material retracts toward the original centered eye location. Re-form the authored eyelid, iris, square pupil, and original local eye surface at the size and position specified by the last frame. Do not invent a new eye or leave a residual cloud, second eye, falling particles, or weather panel.

Preserve crisp red ordered dithering. Finish settled in the exact supplied K0 composition. Do not add an idle cursor-tracking loop to this clip; cursor response will be native behavior later. If the model requires a longer clip, spend the remaining time holding the original eye rather than delaying dismissal.

The Mock Desktop is immutable. Do not move, repaint, relight, distort, or regenerate its landscape, white wallpaper sun, taskbar, icons, clock, or date. No camera cuts, pans, zooms, shaking, perspective shifts, flashing, smoke, blur, new text, numbers, controls, or audio. Only EVA's overlay changes.

This is a silent visual reference for an immediately cancelable native interaction, not an unavoidable outro that a user must wait through.
```

**Check:** the actual original eye returns at the same full-frame position, scale, and geometry. The exact K0 file is shared with V1. Reject changed eye anatomy, changed desktop pixels, residual rain, or a dismissal that feels like waiting for loading.

## Step 8 — Review and preserve the chosen study

Minimal graph: **three Import nodes** (BG, R1, K0), **five Prompt nodes**, **two ChatGPT Images 2.0 Edit nodes**, and **three Seedance 2.0 nodes**. Optional R2 or reimported selected stills add Import nodes. No Prompt Enhancer or LLM rewriting node is necessary; either could loosen the constraints.

Run in this order: import BG/R1/K0 → generate K1 → inspect/select → generate K2 → inspect/select → generate V1/V2/V3 → review. Confirm model availability/settings and a finite credit/iteration budget before submitting. This guide is not credit-spend authorization. Do not rerun the whole graph to change a single prompt. Preserve original and rejected outputs; retiming a review copy is not a performance measurement.

**Background preservation is a pass/fail criterion, not something a prompt can guarantee.** Compare output backgrounds against BG outside EVA's foreground region. Reject drift in wallpaper/taskbar/clock or movement of the wallpaper sun. If a model cannot hold the desktop still, isolate/review its EVA foreground and composite it over the unchanged BG plate with ordinary non-generative editing. Do not pass off a rewritten desktop as the original. A mock-desktop composite does not prove Tauri transparency or native input pass-through.

### Native voice/reading handoff — not part of video generation

| User event | Future native text/audio | Visual behavior |
| --- | --- | --- |
| Enable microphone | Explicit listening state and reachable microphone-off control | Original eye; no weather claim |
| Ask NYC today | Brief verified-fixture answer; `NYC · Today · Sunny` with synthetic-source context | Eye → sun |
| Ask tomorrow | Resolve NYC from session context; brief answer; `NYC · Tomorrow · Rain` | Sun → clouds/rain |
| Dismiss weather | Stop speech and remove weather facts immediately | Rain → original eye |
| Disable microphone | Stop capture; show microphone off | Independent of weather dismissal |

Narration must later use validated fixture facts and real playback events, not a movie timer. Permission precedes listening, and listening stays explicit while the eye is weather. Preserve keyboard/plain-answer/no-audio alternatives and avoid self-triggering from EVA's own speech. Source the returned eye's cursor/gaze behavior from the actual Week 1 implementation/recording, not a generated animation pretending to react.

Use Space Grotesk / IBM Plex Sans / IBM Plex Mono for native text; never dither required facts. The current fixture is 2026-10-14 with three intraday records, not today/tomorrow data. Define the new scenario clock, NYC timezone, rainy-tomorrow fixture, and numeric values explicitly. The date in the mock taskbar is **not** the forecast clock.

Proposed runtime timing—not measured or video-model settings—is immediate local acknowledgement, roughly 600–900 ms for eye-to-sun, 700–1000 ms for sun-to-rain, and 200–350 ms for returning to the eye. Facts do not wait for effects. Stop/dismiss cancels speech and pending work immediately; return animation is nonblocking. Reduced motion uses recognizable static endpoints; rain need not loop forever.

Implement selected behavior as reviewed native components, with actual recognition, continuity, cancellation, fact binding, and native transparency/input checks. The mock wallpaper must not become a fake full-window desktop backing in the real E1 implementation. Visual approval does not accept functioning voice control or close E1.

## Sources and checks

### Official Weave references

- [Text Tools](https://help.weavy.ai/en/articles/12268282-text-tools) — indexed official guidance names Prompt nodes.
- [Helpers Overview](https://help.weavy.ai/en/articles/12268300-helpers-overview) — indexed official guidance describes Import nodes.
- [Edit Image Models Comparison](https://help.weavy.ai/en/articles/12343904-edit-image-models-comparison) — indexed official table lists ChatGPT Images 2.0 Edit, Prompt + Image, and multiple-image inputs.
- [Video Models Comparison](https://help.weavy.ai/en/articles/12344226-video-models-comparison) — indexed official table lists Seedance 2.0 with Prompt and optional First Frame / Last Frame, separately from Seedance 2.0 Reference.
- [How to make animated videos](https://www.figma.com/resource-library/how-to-make-animated-videos/) — full official article fetched; reference-guided stills, selection before animation, and node-based finishing.

Direct fetches of comparison pages returned HTTP 403, so model/input details came from indexed official excerpts, not a live account test. Exact account availability, maximum image count, durations, credit prices, and alpha support remain unverified.

### Local reference and authoring evidence

- [Week 1 eye/K0 reference packet](../revisions/e1-20260924-week1-eye-reference/README.md): actual browser-rendered screenshots, cursor-tracking recording, unchanged-source hashes, viewport/DPI/browser/GPU metadata, and the non-generative Mock Desktop composite. No microphone or speech/provider request was used.
- All 88 listed E1 files matched the earlier [source manifest](../revisions/e1-20260924-01/SOURCE_MANIFEST.json) when references were checked. This is listed-file equality, not new native behavior evidence.
- Main Astra authored/integrated the guide and performed captures/compositing with local Playwright, installed Chromium, Pillow, and FFmpeg. Earlier read-only inspection used native eva-researcher configured for Terra; Gateway recorded Astra/Terra routes, with per-worker route correlation not independently established. Ruflo hooks_route remained advisory only.
- Week 1 source, E1 application source, historical evidence, canonical design, and acceptance records were not edited. New reference assets/metadata and this guide/index are the scoped changes. No assets were uploaded to Weave/Higgsfield, no AI generation job was submitted, and no acceptance was recorded.
