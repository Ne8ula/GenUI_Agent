#!/usr/bin/env python3
"""Seed-33 pass comparison: captures beside the packet's references, plus a luma-difference measurement.

Evidence tooling only (Pillow and ffmpeg). Nothing here touches the app. Output is never overwritten.

Usage (from week4/app):
  python3 scripts/compare-s33.py --after <EVA_CAPTURE_DIR>/after --out <dir>
Optional: --packet <revision dir>   (default: the w4-20261008-paris-c-hybrid packet next to this checkout)
          --checks <checks.json>    (default: <after>/../checks.json; supplies the build length and still times)
          --height 360              (row height of the sheets)

Writes into --out:
  compare-stills.png    every webgl2 capture still (build 0/25/50/100 %, complete + 5 s, reduced motion) beside the
                        seed-33 still, at the same scale
  compare-complete.png  the complete + 5 s still beside the seed-33 still at 720 px high
  compare-details.png   the seven anchor crops, seed-33 above the capture
  compare-motion.png    the five VB2 key frames (0, 1.25, 2.5, 3.75, 4.96 s) above frames of the captured clip at the same
                        offsets into its idle phase
  luma-diff.json / luma-diff.png / luma-diff.txt
                        per-frame luma difference (ffmpeg signalstats YDIF, 0-255) of VB2 and of each captured MP4,
                        whole clip and build/idle segments, next to VB2's stored mean 3.18 / max 6.2; each clip's idle
                        segment is also read against VB2 as comfort (is it calm?) and as fidelity (does it move about
                        as much?), with the ratio printed: an idle mean far below VB2's (under 0.5x) is reported as a
                        fidelity gap, less life than the reference, as well as a comfort pass

The luma figures describe change between consecutive frames only; they do not say the motion looks right. The stepped
clip is rendered at an exact 30 fps; the real-time clip carries this machine's real frame pacing, so its numbers are
reported both as recorded and for changed frames only.
"""
import argparse, glob, json, os, statistics, subprocess, sys, tempfile
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
# Times of the five VB2 key frames in vid-02-vb2-seed33-only.mp4 (matched to frames 0, 30, 60, 90, 119 at 24 fps).
VB2_KEY_SECONDS = [0.0, 1.25, 2.5, 3.75, 4.958]
VB2_STORED = {"mean": 3.18, "median": 3.13, "p95": 4.77, "max": 6.2}
# An idle luma difference below this fraction of VB2's mean is read as a fidelity gap (less life than the reference),
# not as a comfort pass. The owner-approved clip is calm (mean 3.18) but not still; a capture that moves a fraction of
# that has lost the life the owner approved, however calm it is.
FIDELITY_GAP_RATIO = 0.5
STILL_ORDER = ["build-000pct", "build-025pct", "build-050pct", "build-100pct", "complete-plus-5s", "reduced-complete-plus-5s"]
BIRTH_RAMP_MS = 400  # the host's last particle finishes fading in this long after the build length
WHITE = (255, 255, 255)
INK = (40, 30, 25)


def font(size):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "C:/Windows/Fonts/arial.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def labelled(im, text, size=18, pad=6):
    f = font(size)
    w, h = im.size
    bar = size + 14
    out = Image.new("RGB", (w, h + bar), WHITE)
    out.paste(im, (0, bar))
    ImageDraw.Draw(out).text((pad, 5), text, fill=INK, font=f)
    return out


def scaled(im, height):
    return im.resize((round(im.width * height / im.height), height), Image.LANCZOS)


def hstack(items, gap=12):
    w = sum(i.width for i in items) + gap * (len(items) - 1)
    out = Image.new("RGB", (w, max(i.height for i in items)), WHITE)
    x = 0
    for i in items:
        out.paste(i, (x, 0))
        x += i.width + gap
    return out


def vstack(items, gap=12):
    h = sum(i.height for i in items) + gap * (len(items) - 1)
    out = Image.new("RGB", (max(i.width for i in items), h), WHITE)
    y = 0
    for i in items:
        out.paste(i, (0, y))
        y += i.height + gap
    return out


def run(args):
    return subprocess.run(args, capture_output=True, text=True)


def frame_at(mp4, seconds, workdir, tag):
    out = os.path.join(workdir, f"{tag}.png")
    r = run(["ffmpeg", "-v", "error", "-y", "-ss", f"{seconds:.3f}", "-i", mp4, "-frames:v", "1", out])
    if r.returncode != 0 or not os.path.exists(out):
        return None
    return Image.open(out).convert("RGB")


def percentile(values, p):
    if not values:
        return float("nan")
    s = sorted(values)
    pos = (len(s) - 1) * p / 100
    lo, hi = int(pos), min(int(pos) + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)


def ydif_series(path, pre=None):
    """Per-frame YDIF values (frame 0 dropped: it has no predecessor). `pre` is an optional filter run first, e.g. fps=24."""
    chain = ((pre + ",") if pre else "") + "signalstats,metadata=mode=print:key=lavfi.signalstats.YDIF:file=-"
    r = run(["ffmpeg", "-v", "error", "-i", path, "-vf", chain, "-an", "-f", "null", "-"])
    if r.returncode != 0:
        raise SystemExit(f"ffmpeg signalstats failed on {path}: {r.stderr.strip()[:300]}")
    values = [float(line.split("=", 1)[1]) for line in r.stdout.splitlines() if line.startswith("lavfi.signalstats.YDIF=")]
    return values[1:]


def stats(values, fps, offset_frames=1):
    """Summary of a YDIF series. offset_frames converts a series index to a clip frame index (frame 0 was dropped)."""
    if not values:
        return None
    mx = max(values)
    at = values.index(mx) + offset_frames
    return {
        "frames": len(values),
        "mean": round(statistics.fmean(values), 2),
        "median": round(statistics.median(values), 2),
        "p95": round(percentile(values, 95), 2),
        "max": round(mx, 2),
        "maxAtFrame": at,
        "maxAtSeconds": round(at / fps, 2),
    }


def segments(values, fps, build_ms):
    """Whole clip, the build (to build_ms) and the idle part (after the last particle has faded in)."""
    build_end = int(round(build_ms / 1000 * fps))
    idle_start = int(round((build_ms + BIRTH_RAMP_MS) / 1000 * fps))
    out = {"whole": stats(values, fps)}
    # series index i is the difference between clip frames i and i+1, i.e. it belongs to clip frame i+1
    out["build"] = stats(values[: max(build_end - 1, 0)], fps)
    idle = values[max(idle_start - 1, 0):]
    out["idle"] = stats(idle, fps, offset_frames=max(idle_start - 1, 0) + 1)
    return out


def changed_only(values, floor=0.05):
    return [v for v in values if v > floor]


def measure(path, native_fps, build_ms, resample_to=None):
    vals = ydif_series(path)
    entry = {"file": os.path.basename(path), "nativeFps": native_fps, "native": segments(vals, native_fps, build_ms)}
    entry["series"] = [round(v, 3) for v in vals]
    if resample_to and resample_to != native_fps:
        vals24 = ydif_series(path, pre=f"fps={resample_to}")
        entry["resampled"] = {"fps": resample_to, **segments(vals24, resample_to, build_ms)}
        entry["resampledSeries"] = [round(v, 3) for v in vals24]
    ch = changed_only(vals)
    entry["changedFramesOnly"] = {
        "framesChanged": len(ch),
        "framesTotal": len(vals),
        "mean": round(statistics.fmean(ch), 2) if ch else None,
        "max": round(max(ch), 2) if ch else None,
        "note": "frames whose luma differs from the previous frame by more than 0.05; a clip that repeats frames (a slow real-time capture) is reported this way as well",
    }
    return entry


def plot(series_list, out_path, vb2_stats):
    """series_list: [(label, fps, values, colour)]. Time axis in seconds; VB2's mean and max drawn as dashed lines."""
    W, H, L, B, T = 1600, 460, 70, 50, 40
    im = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(im)
    f, fs = font(16), font(14)
    tmax = max((len(v) / fps for _, fps, v, _ in series_list), default=1)
    ymax = max(10.0, max((max(v) for _, _, v, _ in series_list if v), default=1), vb2_stats["max"]) * 1.1

    def px(t, y):
        return (L + (W - L - 20) * t / tmax, H - B - (H - B - T) * y / ymax)

    d.rectangle([L, T, W - 20, H - B], outline=(150, 150, 150))
    for gy in range(0, int(ymax) + 1, 5):
        x0, y0 = px(0, gy)
        d.line([(x0, y0), (W - 20, y0)], fill=(225, 225, 225))
        d.text((8, y0 - 8), f"{gy}", fill=INK, font=fs)
    for gt in range(0, int(tmax) + 1, 2):
        x0, y0 = px(gt, 0)
        d.text((x0 - 8, H - B + 6), f"{gt}s", fill=INK, font=fs)
    for name, y, col in (("VB2 mean 3.18", vb2_stats["mean"], (120, 120, 120)), ("VB2 max 6.2", vb2_stats["max"], (180, 60, 60))):
        a, b = px(0, y), px(tmax, y)
        for x in range(int(a[0]), int(b[0]), 14):
            d.line([(x, a[1]), (min(x + 7, b[0]), b[1])], fill=col, width=1)
        d.text((W - 190, a[1] - 18), name, fill=col, font=fs)
    x = L
    for label, fps, values, colour in series_list:
        pts = [px((i + 1) / fps, v) for i, v in enumerate(values)]
        if len(pts) > 1:
            d.line(pts, fill=colour, width=2)
        d.text((x, 10), label, fill=colour, font=f)
        x += 18 + int(d.textlength(label, font=f)) + 30
    d.text((L, H - 22), "per-frame luma difference (0-255) against the clip's own time; frame 0 omitted", fill=INK, font=fs)
    im.save(out_path)


def read_idle(label, idle, basis):
    """Reads one clip's idle segment against VB2, twice: as comfort and as fidelity.

    Comfort: is the clip at or below VB2's mean and max change? Moving more than the approved clip is the risk.
    Fidelity: is the clip near VB2's amount of change? One far below it (idle mean under FIDELITY_GAP_RATIO times
    VB2's) is calm but has less life than the reference, and is reported as a gap to close, never as a pass.
    The ratios are printed so the reading can be checked against the numbers.
    """
    if not idle:
        return {"clip": label, "basis": basis, "available": False, "text": f"{label}: no idle segment to read"}
    mean_ratio = idle["mean"] / VB2_STORED["mean"]
    max_ratio = idle["max"] / VB2_STORED["max"]
    calm = idle["mean"] <= VB2_STORED["mean"] and idle["max"] <= VB2_STORED["max"]
    gap = mean_ratio < FIDELITY_GAP_RATIO
    comfort = "calm (idle mean and max at or below VB2's)" if calm else "busier than VB2 (idle mean or max above VB2's): check comfort"
    if gap:
        fidelity = f"FIDELITY GAP, less life than the reference (idle mean is {mean_ratio:.3f}x VB2's, below the {FIDELITY_GAP_RATIO:.2f}x line)"
    elif mean_ratio <= 1.0:
        fidelity = "near the reference's amount of change"
    else:
        fidelity = "more change than the reference"
    text = (
        f"{label} idle ({basis}): mean {idle['mean']:.2f} / max {idle['max']:.2f} against VB2 {VB2_STORED['mean']:.2f} / {VB2_STORED['max']:.1f}"
        f" -> ratio {mean_ratio:.3f}x (mean), {max_ratio:.3f}x (max). Comfort: {comfort}. Fidelity: {fidelity}."
    )
    return {
        "clip": label,
        "basis": basis,
        "available": True,
        "idleMean": idle["mean"],
        "idleMax": idle["max"],
        "ratioMean": round(mean_ratio, 3),
        "ratioMax": round(max_ratio, 3),
        "comfortCalm": calm,
        "fidelityGap": gap,
        "comfort": comfort,
        "fidelity": fidelity,
        "text": text,
    }


def table(rows):
    cols = ["clip / segment", "frames", "mean", "median", "p95", "max", "max at"]
    body = [[r[0], str(r[1]), r[2], r[3], r[4], r[5], r[6]] for r in rows]
    widths = [max(len(str(x[i])) for x in [cols] + body) for i in range(len(cols))]
    fmt = "  ".join("{:<%d}" % w for w in widths)
    lines = [fmt.format(*cols), fmt.format(*["-" * w for w in widths])]
    lines += [fmt.format(*b) for b in body]
    return "\n".join(lines)


def row(label, s):
    if not s:
        return [label, 0, "n/a", "n/a", "n/a", "n/a", "n/a"]
    return [label, s["frames"], f'{s["mean"]:.2f}', f'{s["median"]:.2f}', f'{s["p95"]:.2f}', f'{s["max"]:.2f}', f'{s["maxAtSeconds"]:.2f}s']


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    default_packet = os.path.normpath(os.path.join(here, "..", "..", "docs", "design", "revisions", "w4-20261008-paris-c-hybrid"))
    ap = argparse.ArgumentParser()
    ap.add_argument("--after", required=True, help="the capture's after/ directory")
    ap.add_argument("--out", help="output directory (default: <after>/../compare); must be empty or absent")
    ap.add_argument("--packet", default=default_packet)
    ap.add_argument("--checks")
    ap.add_argument("--height", type=int, default=360)
    a = ap.parse_args()

    after = os.path.abspath(a.after)
    out = os.path.abspath(a.out or os.path.join(after, "..", "compare"))
    checks_path = a.checks or os.path.join(after, "..", "checks.json")
    if os.path.isdir(out) and os.listdir(out):
        raise SystemExit(f"refusing to overwrite evidence: {out} is not empty")
    os.makedirs(out, exist_ok=True)

    seed33_path = os.path.join(a.packet, "references", "images", "img-13-bwa3c-seed33.png")
    vb2_path = os.path.join(a.packet, "references", "videos", "vid-02-vb2-seed33-only.mp4")
    for p in (seed33_path, vb2_path):
        if not os.path.exists(p):
            raise SystemExit(f"missing reference: {p}")
    checks = json.load(open(checks_path)) if os.path.exists(checks_path) else {}
    build_ms = int(checks.get("buildMs", 12000))
    seed33 = Image.open(seed33_path).convert("RGB")
    H = a.height
    written = []

    # ---- stills beside the seed-33 still ------------------------------------------------------------------
    present = {}
    for name in STILL_ORDER:
        f = os.path.join(after, f"webgl2-seed33-{name}.png")
        if os.path.exists(f):
            present[name] = f
    stills_meta = {s["name"]: s for s in checks.get("stills", []) if s.get("backend") == "webgl2"}
    if present:
        rows = []
        for name, f in present.items():
            meta = stills_meta.get(name, {})
            when = f"t {meta['startMs']} ms" if "startMs" in meta else ""
            cap = scaled(Image.open(f).convert("RGB"), H)
            ref = scaled(seed33, H)
            rows.append(hstack([labelled(cap, f"capture {name} {when}".strip()), labelled(ref, "seed-33 still (img-13): the target, complete")]))
        grid = vstack(rows, gap=10)
        grid.save(os.path.join(out, "compare-stills.png"))
        written.append("compare-stills.png")
    complete = present.get("complete-plus-5s")
    if complete:
        cap = Image.open(complete).convert("RGB")
        full = hstack([labelled(scaled(seed33, 720), "seed-33 still (img-13)", 22), labelled(scaled(cap, 720), "capture, complete + 5 s (webgl2)", 22)])
        full.save(os.path.join(out, "compare-complete.png"))
        written.append("compare-complete.png")
        # seven anchor crops, seed-33 above the capture
        tiles = []
        TH = 300
        for name, (x0, y0, x1, y1) in REGIONS:
            pair = []
            for im, lab in ((seed33, "seed-33"), (cap, "capture")):
                c = im.crop((round(x0 * im.width), round(y0 * im.height), round(x1 * im.width), round(y1 * im.height)))
                c = c.resize((round(c.width * TH / c.height), TH), Image.LANCZOS)
                pair.append(labelled(c, f"{name} - {lab}", 16))
            tiles.append(vstack(pair, gap=8))
        hstack(tiles, gap=16).save(os.path.join(out, "compare-details.png"))
        written.append("compare-details.png")

    # ---- motion: VB2 key frames above the captured clip at the same offsets into its idle phase ---------------
    stepped = next(iter(glob.glob(os.path.join(after, "webgl2-stepped-*fps-build-idle.mp4"))), None)
    realtime = os.path.join(after, "webgl2-realtime-build-idle.mp4")
    realtime = realtime if os.path.exists(realtime) else None
    motion_src = stepped or realtime
    with tempfile.TemporaryDirectory() as work:
        if motion_src:
            idle_start_s = (build_ms + BIRTH_RAMP_MS + 100) / 1000
            top, bottom = [], []
            for k, sec in enumerate(VB2_KEY_SECONDS):
                key = os.path.join(a.packet, "references", "videos", f"vid-02-key-0{k + 1}.png")
                ref_im = Image.open(key).convert("RGB") if os.path.exists(key) else frame_at(vb2_path, sec, work, f"vb2-{k}")
                top.append(labelled(scaled(ref_im, H), f"VB2 key {k + 1} - {sec:.2f} s", 16))
                im = frame_at(motion_src, idle_start_s + sec, work, f"impl-{k}")
                if im is None:
                    bottom.append(labelled(Image.new("RGB", (round(H * 16 / 9), H), (230, 230, 230)), f"no frame at {idle_start_s + sec:.2f} s", 16))
                else:
                    bottom.append(labelled(scaled(im, H), f"capture - clip {idle_start_s + sec:.2f} s (idle +{sec:.2f} s)", 16))
            vstack([hstack(top, 8), hstack(bottom, 8)], gap=14).save(os.path.join(out, "compare-motion.png"))
            written.append("compare-motion.png")
            motion_note = f"{os.path.basename(motion_src)}; idle phase assumed to start at {idle_start_s:.2f} s (build {build_ms} ms + ramp {BIRTH_RAMP_MS} ms + 0.1 s)"
        else:
            motion_note = "no captured MP4 found; no motion sheet"

        # ---- luma difference ------------------------------------------------------------------------------
        if run(["ffmpeg", "-version"]).returncode != 0:
            raise SystemExit("ffmpeg is not on PATH; cannot measure luma difference")
        report = {
            "method": "ffmpeg -vf signalstats,metadata=print:key=lavfi.signalstats.YDIF: mean absolute luma difference to the previous frame, 0-255 (yuv420p, limited range as encoded); frame 0 omitted",
            "vb2Stored": {**VB2_STORED, "source": "references/videos/vid-02-stats.json (packet); mean 3.18, median 3.13, p95 4.77, max 6.2 at frame 109; 121 frames at 24 fps"},
            "buildMs": build_ms,
            "idleSegmentStartsAtMs": build_ms + BIRTH_RAMP_MS,
            "motionSheet": motion_note,
            "clips": {},
        }
        # VB2 has no build: its whole clip is its idle motion, so it is not split into segments.
        vb2_vals = ydif_series(vb2_path)
        report["clips"]["vb2"] = {
            "file": os.path.basename(vb2_path),
            "nativeFps": 24,
            "native": {"whole": stats(vb2_vals, 24)},
            "series": [round(v, 3) for v in vb2_vals],
            "note": "VB2 recomputed here with the same command as a cross-check. Frame 0 has no predecessor and is omitted here (120 differences); the stored mean 3.18 averages 121 frames with that first frame counted as 0, which is why the recomputed mean reads about 3.21 (3.21 x 120 / 121 = 3.18). The max, p95 and median agree. Captured clips are measured the same way as the recomputed row.",
        }
        plots = [("VB2 (24 fps)", 24, vb2_vals, (110, 110, 110))]
        rows = [row("VB2 recomputed - whole (24 fps)", report["clips"]["vb2"]["native"]["whole"])]
        colours = {"stepped": (30, 90, 200), "realtime": (200, 110, 20)}
        readings = []
        for label, path, fps in (("stepped", stepped, 30), ("realtime", realtime, 30)):
            if not path:
                continue
            m = measure(path, fps, build_ms, resample_to=24)
            report["clips"][label] = m
            # Read the idle segment at VB2's own frame rate when the clip was resampled to it, else as recorded.
            if m.get("resampled"):
                readings.append(read_idle(label, m["resampled"]["idle"], "resampled to 24 fps, VB2's rate"))
            else:
                readings.append(read_idle(label, m["native"]["idle"], f"native {fps} fps"))
            plots.append((f"{label} ({fps} fps)", fps, m["series"], colours[label]))
            rows.append(row(f"{label} - whole ({fps} fps)", m["native"]["whole"]))
            rows.append(row(f"{label} - build ({fps} fps)", m["native"]["build"]))
            rows.append(row(f"{label} - idle ({fps} fps)", m["native"]["idle"]))
            if "resampled" in m:
                rows.append(row(f"{label} - idle (resampled to 24 fps)", m["resampled"]["idle"]))
                rows.append(row(f"{label} - whole (resampled to 24 fps)", m["resampled"]["whole"]))
        plot([p for p in plots if p[2]], os.path.join(out, "luma-diff.png"), VB2_STORED)
        written.append("luma-diff.png")
        text = table(rows)
        header = (
            f"Luma difference per frame (YDIF, 0-255). VB2 stored: mean {VB2_STORED['mean']}, max {VB2_STORED['max']}.\n"
            "(The recomputed VB2 row omits frame 0, so its mean reads ~3.21; 3.21 x 120/121 = the stored 3.18. Captured clips are measured like the recomputed row.)\n"
        )
        report["reading"] = {
            "fidelityGapRatio": FIDELITY_GAP_RATIO,
            "vb2Reference": {"mean": VB2_STORED["mean"], "max": VB2_STORED["max"]},
            "note": "ratio = captured idle value / VB2 stored value. Comfort asks whether the capture moves more than the approved clip; fidelity asks whether it moves about as much. An idle mean below the gap ratio is calm but has less life than the reference.",
            "clips": readings,
        }
        reading_lines = [r["text"] for r in readings] or ["no captured clip to read against VB2"]
        footer = (
            "\nReading: a captured clip is calm in the VB2 sense when its idle-segment mean and max sit at or below VB2's; the build segment is allowed to move more because beads and tiles are being born. These numbers measure frame-to-frame change, not how the motion looks."
            f"\n\nIdle reading against VB2, as comfort and as fidelity (a gap is any idle mean below {FIDELITY_GAP_RATIO:.2f}x of VB2's {VB2_STORED['mean']:.2f}):\n"
            + "\n".join(reading_lines)
            + "\nA clip that is far below VB2 is calm but has less life than the approved reference: it passes comfort and shows a fidelity gap to close, so it is not a finished match."
        )
        with open(os.path.join(out, "luma-diff.txt"), "w") as fh:
            fh.write(header + text + footer + "\n")
        written.append("luma-diff.txt")
        with open(os.path.join(out, "luma-diff.json"), "w") as fh:
            json.dump(report, fh, indent=2)
            fh.write("\n")
        written.append("luma-diff.json")
        print(header + text + footer)
    print("written:", ", ".join(os.path.join(out, w) for w in written))


if __name__ == "__main__":
    main()
