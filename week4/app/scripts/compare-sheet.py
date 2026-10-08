#!/usr/bin/env python3
"""Side-by-side comparison sheets: a Weave reference against an implementation capture.

Evidence tooling only (Pillow, as Week 2's derive script used). Nothing here touches the app.
Usage:
  compare-sheet.py --ref <reference.png> --impl <capture.png> --out <dir> --label-ref "P1 (img-01)" --label-impl "browser webgl2"
Writes <out>/compare-full.png (both frames scaled to the same height, labelled) and
<out>/compare-details.png (matching normalised crops of key regions, reference above implementation).
"""
import argparse, os
from PIL import Image, ImageDraw, ImageFont

REGIONS = [
    ("cup and saucer", (0.58, 0.72, 0.82, 0.98)),
    ("ashtray and cigarette", (0.22, 0.80, 0.46, 1.0)),
    ("woman", (0.29, 0.33, 0.45, 0.78)),
    ("chair and table edge", (0.0, 0.46, 0.26, 0.98)),
    ("awning and left facade", (0.0, 0.0, 0.47, 0.72)),
    ("lamp, mansard, walkers", (0.42, 0.14, 0.64, 0.68)),
    ("right facade", (0.58, 0.0, 1.0, 0.75)),
]

def font(size):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "C:/Windows/Fonts/arial.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def labelled(im, text, pad=6):
    f = font(22)
    w, h = im.size
    out = Image.new("RGB", (w, h + 34), (255, 255, 255))
    out.paste(im, (0, 34))
    d = ImageDraw.Draw(out)
    d.text((pad, 6), text, fill=(40, 30, 25), font=f)
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ref", required=True)
    ap.add_argument("--impl", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--label-ref", default="reference")
    ap.add_argument("--label-impl", default="implementation")
    ap.add_argument("--height", type=int, default=720)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    for name in ("compare-full.png", "compare-details.png"):
        if os.path.exists(os.path.join(a.out, name)):
            raise SystemExit(f"refusing to overwrite evidence: {os.path.join(a.out, name)} exists")
    ref = Image.open(a.ref).convert("RGB")
    impl = Image.open(a.impl).convert("RGB")
    H = a.height
    r = ref.resize((round(ref.width * H / ref.height), H), Image.LANCZOS)
    i = impl.resize((round(impl.width * H / impl.height), H), Image.LANCZOS)
    lr, li = labelled(r, a.label_ref), labelled(i, a.label_impl)
    full = Image.new("RGB", (lr.width + li.width + 12, max(lr.height, li.height)), (255, 255, 255))
    full.paste(lr, (0, 0)); full.paste(li, (lr.width + 12, 0))
    full.save(os.path.join(a.out, "compare-full.png"))
    tiles = []
    TH = 300
    for name, (x0, y0, x1, y1) in REGIONS:
        pair = []
        for im, lab in ((ref, a.label_ref), (impl, a.label_impl)):
            c = im.crop((round(x0 * im.width), round(y0 * im.height), round(x1 * im.width), round(y1 * im.height)))
            c = c.resize((round(c.width * TH / c.height), TH), Image.LANCZOS)
            pair.append(labelled(c, f"{name} — {lab}"))
        col = Image.new("RGB", (max(p.width for p in pair), sum(p.height for p in pair) + 8), (255, 255, 255))
        col.paste(pair[0], (0, 0)); col.paste(pair[1], (0, pair[0].height + 8))
        tiles.append(col)
    gap = 16
    W = sum(t.width for t in tiles) + gap * (len(tiles) - 1)
    sheet = Image.new("RGB", (W, max(t.height for t in tiles)), (255, 255, 255))
    x = 0
    for t in tiles:
        sheet.paste(t, (x, 0)); x += t.width + gap
    sheet.save(os.path.join(a.out, "compare-details.png"))
    print(os.path.join(a.out, "compare-full.png"), os.path.join(a.out, "compare-details.png"))

if __name__ == "__main__":
    main()
