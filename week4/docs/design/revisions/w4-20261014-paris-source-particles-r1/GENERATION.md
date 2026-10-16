# Weave discovery and staged plan

Live read-only discovery: 2026-10-14, installed official Figma MCP, `weave_find_model` queries `GPT Image`, `Nano Banana`, `Seedance`, `Runway`. These are the account-visible catalog labels/contracts, not independent provider-version verification, actual quotes or completed runs. No substitute provider route. [Review/status](REVIEW.md).

## Still recommendation

**GPT Image 2.5 → Sunburst → quality=max**, text-only, one landscape composition, opaque background, PNG. The owner allowed GPT-Image or Nano Banana at the highest available quality tier. Choose the highest explicit GPT quality rather than the lower/default settings; no model comparison batch needed. Do not promise this catalog version is universally better than Nano Banana.

- Tool ID: `2db90e64-51dd-45b2-870a-66d19a81118e`; model ID: `gpt-image-2.5`.
- Required: `prompt`. Optional `images` up to 16 and `mask`; neither supplied for this first still.
- `model`: Flare / **Sunburst**. `quality`: auto / low / medium / high / xhigh / **max**.
- `image_size`: named ratios including `landscape_16_9`, or custom multiple-of-16 dimensions up to 3840 per side and 3:1. The actual approved request used custom **3840×2160**; the retrieved output independently confirms those dimensions.
- `background`: opaque / transparent / auto; `output_format`: png / jpeg / webp.
- Catalog estimate 8 credits is **not** the cost of the final max-tier request. Obtain an actual quote with exact inputs before asking Approve/Cancel.

Other approved-family options inspected, not selected: Nano Banana Pro (`af5a6789-c7af-4c46-9a42-70222654e55b`, `fal-ai/nano-banana-pro/edit`) exposes 1K/2K/4K; Nano Banana 2.1 (`bebebed5-50c1-4701-98b3-86929db21585`, `fal-ai/nano-banana-2/edit`) exposes 512/1K/2K/4K, `thinking_level=Minimal|High`, aspect ratio and optional web search. Neither provides a directly comparable `quality=max` control. Lower-tier Nano Banana/Lite and older GPT variants were listed but are not fallback authorizations.

## Motion recommendation after still approval

**Seedance 2.5 image-to-video**, not the similarly named reference-to-video entry:

- Tool ID: `cbe8b347-8c85-4e1a-b379-f96f48932f43`; model ID: `bytedance/seedance-2.5/image-to-video`.
- Required `prompt`; optional `image_url` First Frame and `end_image_url` Last Frame. Each supports JPEG/PNG/WebP up to 30 MB according to the live contract.
- Duration strings `4` through `30` or `auto`; 480p/720p/**1080p**; 16:9 and other ratios; `bitrate_mode=standard|high`; `codec=auto|H264`; `draft` default false; `generate_audio` default true; `us_hosted` optional false (catalog says US-only costs 30% extra).
- Proposal: explicit duration, 1080p, high bitrate, H264, draft=false, audio=false, fixed-view wording. No dedicated camera-fixed or seed control is exposed in this 2.5 contract. Endpoint inputs guide continuity; they do not guarantee a pixel-identical join.
- Catalog estimate 280 credits is not a quote for a 30-second request. No video quote/spend now.

Seedance 2.0 image-to-video also exposes first/last frames, 4–15 seconds, Standard/Fast and up to 4K. Seedance 1.5 Pro exposes first/last frames, 4–12 seconds and `camera_fixed`; not silently selected instead of the newer recommendation.

Runway alternatives inspected: Gen-4.5 (`RpA5Ep88oat556S1tqO2`, `rw_4_5_video_original`) exposes **first frame only**, 5/8/10 seconds, up to 1280×720 landscape, seed. Gen-4 similarly exposes first frame only, 2–10 seconds. Gen-3 Turbo (`0khu1v90YJKgX3XwcSdm`, `rw_video`) exposes start/end frames, 5/10 seconds, 1280:768 landscape; the end-frame description is inconsistent (“first frame”), so verify before relying on it. Aleph 2 accepts an existing 2–30s video plus optional edited keyframes, not an equivalent text-only construction generator. No Runway job requested.

## Staged generation / inspection gates

1. **S1 finished composition.** One max-quality text-only still. Record exact prompt/settings, actual quote, structured decision, submission count, returned run ID and inspected output. No authentic archive image will be synthesized or presented as genuine. The composition is a procedural-design illustration, not an archival record. Show it to the owner; a rejected still stays retained.
2. **Owner direction checkpoint.** Ask whether object arrangement/density/gaps/accents match the intended direction. Do not treat the spending approval, agent selection or silence as composition approval.
3. **Boundary frames, separately quoted.** Following the selected composition, prepare consistent generic-desktop, source-window, particle-transfer, detection-start and final-inspection states. Prefer reuse of approved hosted generated outputs as conditioning; obtain separate permission before uploading any local or archival media. Source-window studies must visibly distinguish diagrammatic placeholders from genuine retrieved sources. No generated image may be relabelled as archival material.
4. **Four separate flow studies, individually quoted:** (a) synthetic application minimization/source-window arrival, proposed 6–8s; (b) windows break into construction particles, proposed 6–8s; (c) all four construction stages in one **30s** clip, 0–7 / 7–14 / 14–21 / 21–30s; (d) final hover and click, proposed 8–10s. Only the 30–45s construction duration is an owner requirement; these other timings are proposals. No automatic retry or batch spend.
5. **Continuity inspection.** Match aspect ratio, output resolution, object positions/scales, projection, palette and window geometry. Compare endpoint pixels and temporal samples on both sides of each join; inspect motion speed/direction, contour continuity and object identity. Preserve failed joins and identify defects. If model output cannot satisfy the continuous 30–45s construction, propose separately approved shorter conditioned segments and assemble one continuous deliverable without disguising hard resets as success.
6. **Assembly.** With existing local media tools only, retain individual clips and assemble a review sequence. Rebuild readable verified annotations from curated source data, not generated lettering. Keep archive sources separate from generated concept footage. Record clip timing/joins, encode settings, source hashes and playback limitations. No public hosting.
7. **Implementation scope checkpoint.** Only after the fresh image+video packet is inspected and reviewed: scope Rust procedural object rendering, independent native windows, local interactions and safe restoration. No UI work is authorized by this preparation document.

Every paid run uses its actual quote and explicit structured Approve/Cancel, including retries. `acknowledgedCost` is omitted for quote calls and passed only after approval. Never infer refund, cancellation support, final resolution, workspace identity or successful generation from a catalog entry.
