# Archival discovery

Status: **implemented and production-verified; owner visual acceptance pending.** No new generation or credit spend.

[Production demo](http://127.0.0.1:1441/?scene=paris-arrival) · [Input-only eye](implementation/after/production-02/eye-input-qhd.png) · [Photo discovery](implementation/after/production-02/discovery-5s.png) · [Real browser recording](implementation/after/production-02/discovery-to-paris-realtime.webm) · [26 production checks](implementation/after/production-02/checks.json) · [Source contact sheet](references/contact-sheet.png) · [Recovery/review notes](RECOVERY.md)

[Motion-reference samples](references/owner-video/temporal-samples.png) · [First genuine archival image](references/images/montparnasse-1980/original.jpg) · [Before eye/interface](implementation/before/eye-ui.png) · [Before settled interface](implementation/before/paris-ui.png) · [Scope and decisions](BRIEF.md)

## Authority and inspection

Owner selected real archival photographs and explicitly approved using the supplied video plus verified archive images directly, waiving fresh Weave generation for this bounded pass. No generation/spend. Main inspected the26.8s supplied clip through one-second samples: photo fragments arranged in a shallow rotating depth cluster with fine connections. Do not copy its flower imagery, blue labels or numeric scores. The clip stays local, unuploaded and outside runtime media.

The normal interface shows only the input field and visual experience. Enter submits; Escape pauses; typed local commands can resume, skip or return. Nonvisual accessible names/status remain. No logo, buttons, visible captions or footer. A curated local source selection is disclosed here and in the conversation; the browser does not pretend to perform live internet search.

## Verified first source

**Montparnasse, Paris1980**, Pascal Dolémieux, photographic postcard, Musée Carnavalet inventory **CP1154**.

- [Primary institutional record](https://www.parismuseescollections.paris.fr/fr/musee-carnavalet/oeuvres/montparnasse-paris-1980).
- [Downloaded catalogue-image mirror](https://upload.wikimedia.org/wikipedia/commons/d/d0/Montparnasse%2C_Paris_1980._CP1154.jpg).
- Main's primary-page check returned the explicit rights wording **“CC0 Paris Musées / Musée Carnavalet – Histoire de Paris”** with a CC0 dedication link. This is not inferred from institutional affiliation.
- Date: **1980 from the catalogue title and the object's visible inscription**, not a separately verified capture day/month. Medium: photographic postcard / photomechanical reproduction, not an original negative, generated illustration, drawing or generic proof of daily life throughout Paris.
- Main inspected the actual downloaded image: a street photograph with a foreground costumed person, bus, bicycle, street signs and Montparnasse buildings; the lower postcard margin reads Montparnasse / Paris1980. Do not identify the photographed person or invent their role.
- The runtime may crop the white postcard border and resize the photographic portion; record crop/hash and preserve the original. No colorization, retouching or invented detail.

The owner approved **Photo-linked credits** in the prior session at 2026-10-15 23:37 UTC: multiple real photos may link to a separate source/licence page with crop disclosure; no persistent credit text is required on the main stage. Recovery inspected that recorded answer, not an inferred approval.

Two additional selected sources were verified by native `eva-researcher` against Commons file records, then downloaded and visually inspected by main before integration:

- [Conciergerie, Paris, 1980 — Johnckarnes](https://commons.wikimedia.org/wiki/File:Conciergerie-Paris-1980.jpg), [actual retained image](references/images/conciergerie-1980/original.jpg). CC BY-SA 4.0; date is the uploader's 1980 metadata, not an independently authenticated negative. The image shows the riverside building and its reflection, blue sky and a dark slide border. Preserve original colour and grain; no AI upscaling or invented detail. The image and displayed crops remain CC BY-SA 4.0, independently of application-code licensing.
- [Les escaliers de montmartre 1980 — bigup21](https://commons.wikimedia.org/wiki/File:Les_escaliers_de_montmartre_1980_-_panoramio.jpg), [actual retained image](references/images/montmartre-1980/original.jpg). CC BY 3.0; 1980 is supplied in the description, not the 2008 upload date. The image shows a black-and-white stairway between façades, wall lamp, shutters and cars below. Use the intact portrait and explicitly disclosed display crops.

These are three distinct source photographs, not seven independent records: seven runtime fragments reuse/crop them. Their authorship/date assertions come from the linked catalog/Commons records, not forensic authentication. Runtime links open `/sources/paris-r15/credits.html` at the corresponding image. No photographer endorsement or genuine reconstruction from these photos is claimed.

## Visual and implementation rules

Use black stage, original scene colors and the existing loose red eye. Add a bounded, authored photo-discovery phase before the unchanged30-second construction. Variable-size photo fragments sit at different depths, turn slowly and overlap; thin lines link their positions. Omit blue labels, percentage scores and all decorative text. The scene remains separately authored/image-derived, not reconstructed from these reference photographs.

Keep phase times separate and deterministic. Pause, reset, supersession, failed image loading and reduced motion cannot attach stale photographs or restart a stopped scene. Actual photos are local whitelisted assets; no runtime archive/provider calls, private captures or native OS windows. Main owns code and evidence; native researcher is read-only. No commits, publishing or phase acceptance.

## Implemented result and owner retest

- One persistent input; no normal-state buttons, logo, heading, captions, phase toolbar or footer. Enter submits. Escape pauses. Type `photos`, `pause`, `resume`, `skip`, `return` or `retry` (GPU recovery) and press Enter. Necessary errors remain visible and accessible.
- Three verified photo records form seven bounded, overlapping planes with authored shallow perspective, staggered appearance, slow turning and fine connecting lines. Photo clicks/keyboard focus pause the cluster; clicking opens a local credit page in a separate tab.
- A separate 12-second authored discovery clock hands off once to the existing 30-second construction and independent settled life. Photos are never sampled as scene geometry. The completed canvas remains pixel-identical to the prior R12/R14 endpoint at idle zero.
- While photos load, the existing eye remains visible. Ten-second image timeout, failure, reset and late delivery are bounded. With OS reduced motion, photos remain a static representative cluster; type `continue` for the static Paris scene.

Launch: `npm --prefix week4/app run dev`, then `http://127.0.0.1:1440/?scene=paris-arrival`. Production: `npm --prefix week4/app run build`, then `npm --prefix week4/app run preview`; [production URL](http://127.0.0.1:1441/?scene=paris-arrival).

Owner exercise: submit the initial Paris request; watch photos → eye → four construction layers → settled life. Pause with Escape, open a photo credit, resume, then return. Compare [before eye](implementation/before/recovery/eye.png) / [after eye](implementation/after/production-02/eye-input-qhd.png), [photo cluster](implementation/after/production-02/discovery-5s.png), [narrow view](implementation/after/production-02/photos-narrow.png), and [settled scene](implementation/after/production-02/construction-30s.png). **Owner decision remains pending.**

## Executed verification

- `npm --prefix week4/app run check`: **passed** final TypeScript check, **232 app tests**, Rust/WASM prebuild and Vite production build. Existing unrelated Rust unused/dead-code warnings remain. Rust unit tests were not rerun: no Rust source changed in this pass.
- Development capture: **23 checks passed**; [retained report](implementation/after/check-01/checks.json). The first production attempt failed due to the missing asset allowlist; [failed report retained](implementation/after/production-01/checks.json).
- Corrected final production capture: **26 checks passed**, including source load/credit links, separate clocks, deterministic seek, supersession, pause/resume, exact final-frame preservation, reduced motion, narrow viewport, GPU failure/typed retry, no external media/network, total image failure, loading timeout and late completion after return. [Actual report](implementation/after/production-02/checks.json).
- [Actual production recording](implementation/after/production-02/discovery-to-paris-realtime.webm): 2560×1440, encoded 25 fps, 42.12 s; this encoder rate/duration is not an app-performance benchmark. [Four-second temporal samples](implementation/after/production-02/runtime-temporal-samples.png) inspected; full-speed playback was not reviewed by main. Development recording also retained. Only runtime browser captures are implementation evidence; the supplied flower clip is not played in the app.
- Focused tracked/new-file whitespace checks passed. [27-file source/asset manifest](implementation/source-manifest.json), SHA-256 `4442e9bf429d5871af11e51208f744f8d2e28941e3574215244a9e693e3d63d7`, binds the runtime candidate and capture script.
- Native read-only review found no remaining actionable defects after the loading-eye correction and explicit production allowlist. [Review dispositions and failed-check history](RECOVERY.md).

Reproduce capture after build/preview: `node week4/app/scripts/capture-discovery.mjs <new-empty-absolute-output-directory> http://127.0.0.1:1441 --record`.

## Changes, provenance and limitations

Main edited `app/src/arrival/ArrivalApp.tsx`, `arrival.css`, and `app/vite.config.ts`; added `arrival/discovery.ts`, `arrival/PhotoDiscovery.tsx`, `app/tests/discovery.test.ts`, `app/scripts/capture-discovery.mjs`, and `app/public/sources/paris-r15/` (three photos, credits HTML/JSON). Evidence and status updates are confined to this revision, Week 4 index and acceptance entry. Existing scan renderer, construction/eye geometry, Rust code and Weeks 1–3 were not edited.

Main: harness-reported Astra via native tools; native Terra-configured researchers handled recovery/source checks and Opus-configured reviewer handled read-only code review. Individual worker transport correlation is unverified; [detailed provenance](provenance.json). No new generation, paid calls, commits or publishing.

Visual comparison: the cluster transfers the supplied clip's layered rectangular photographs, gentle perspective and sparse connectors, without its blue labels or scores. It is not an exact motion copy: the orbit is deliberately shallower and seven fragments reuse three photographs. Fine connectors are less prominent than in the supplied clip. Source grain/resolution is preserved, not AI-restored. The transition returns to the existing eye before construction rather than claiming these unrelated archive views geometrically reconstruct the café. Browser-only evidence; no native desktop, live search, voice, true 3D reconstruction, measured framerate target or phase acceptance.
