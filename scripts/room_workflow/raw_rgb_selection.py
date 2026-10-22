"""Separate RGB-only capture-design exploration; no inference or dataset replacement."""
import argparse
import hashlib
import itertools
import json
from pathlib import Path
import re
import shutil

import cv2
import numpy as np
from PIL import Image, ImageDraw

from arkit_fetch import BASE, REVISION, download, extract
from analyze_arkit_overlap import POLICY, compare, components, mutual_ratio

URL = f"{BASE}/raw/Validation/42445021/lowres_wide.zip"
EXPECTED_BYTES = 187269832
EXPECTED_FRAMES = 2899
MAX_ARCHIVE = 256 * 1024**2


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def timestamp(path):
    match = re.fullmatch(r"42445021_(\d+\.\d{3})\.png", Path(path).name)
    if not match:
        raise ValueError("Unexpected RGB frame filename")
    return float(match.group(1))


def temporal_sample(paths, interval=1.0):
    ordered = sorted(paths, key=timestamp)
    chosen = [ordered[0]]
    for path in ordered[1:]:
        if timestamp(path) - timestamp(chosen[-1]) >= interval:
            chosen.append(path)
    if chosen[-1] != ordered[-1]:
        chosen.append(ordered[-1])
    return chosen


def connected_seven(records, pairs, beam=256):
    """Bounded report-only search; never claim the beam found a global optimum."""
    edges = {(min(p["a"], p["b"]), max(p["a"], p["b"])) for p in pairs if p["accepted"]}
    adjacency = {i: set() for i in range(len(records))}
    for a, b in edges:
        adjacency[a].add(b)
        adjacency[b].add(a)
    def score(subset):
        times = sorted(records[i]["timestamp"] for i in subset)
        span = times[-1] - times[0]
        spread = sum(min(b-a, 3.0) for a, b in zip(times, times[1:]))
        support = sum((a, b) in edges for a, b in itertools.combinations(sorted(subset), 2))
        return spread, span, support
    states = {(i,) for i in adjacency}
    for _ in range(6):
        candidates = {tuple(sorted((*state, n))) for state in states
                      for n in set().union(*(adjacency[i] for i in state)) - set(state)}
        states = set(sorted(candidates, key=lambda s: (score(s), s), reverse=True)[:beam])
        if not states:
            return None
    return list(max(states, key=lambda s: (score(s), s)))


def validate_selection(records, pairs, indices):
    if len(indices) != 7 or len(set(indices)) != 7 or any(type(i) is not int or not 0 <= i < len(records) for i in indices):
        raise ValueError("Select exactly seven distinct existing frame indices")
    edges = [(p["a"], p["b"]) for p in pairs if p["accepted"]]
    if len(components(indices, edges)) != 1:
        raise ValueError("Selected seven have insufficient connected RGB support")


def freeze_selection(root, report_path, indices, output):
    report = json.loads(report_path.read_text())
    validate_selection(report["records"], report["pairs"], indices)
    output.mkdir(parents=True, exist_ok=False)
    records = [report["records"][i] for i in indices]
    sheet = Image.new("RGB", (7*200, 300), "#17201f")
    draw = ImageDraw.Draw(sheet)
    for col, record in enumerate(records):
        source = root / "extracted" / "lowres_wide" / record["filename"]
        if sha(source) != record["source_sha256"]:
            raise ValueError("Selected source checksum mismatch")
        with Image.open(source) as image:
            image = image.transpose(Image.Transpose.ROTATE_270)
            sheet.paste(image, (col*200+4, 0))
        draw.text((col*200+4, 260), f"{record['index']:02d} {record['timestamp']:.3f}", fill="white")
    draw.text((4, 283), "REVIEWED PARTIAL-ROOM INPUT DESIGN | not full-room coverage or blind validation", fill="#edcb82")
    sheet.save(output / "selected-seven.jpg", quality=93)
    (output / "selection.json").write_text(json.dumps({
        "version": 1, "report_sha256": sha(report_path), "records": records,
        "selection": indices, "scope": "window-sofa-desk connected partial-room candidate",
        "selection_basis": "Operator-selected connected path after RGB-only contact sheet/graph inspection",
        "excluded": "TV cabinet and doorway remain in disconnected components",
        "status": "frozen before any VGA RGB inspection; not an inference request",
    }, indent=2), encoding="utf8")


def visual_proposal(root, filenames, output):
    """Freeze owner-requested visual-coverage proposal, including failed match graph."""
    if len(filenames) != 7 or len(set(filenames)) != 7:
        raise ValueError("Exactly seven distinct source filenames required")
    for name in filenames:
        if name != Path(name).name:
            raise ValueError("Plain filenames required")
        timestamp(name)
    output.mkdir(parents=True, exist_ok=False)
    (output / "source-rgb").mkdir()
    (output / "normalized-rgb").mkdir()
    cv2.setNumThreads(2)
    detector = cv2.SIFT_create(nfeatures=POLICY["features"])
    images, keys, descs, records = [], [], [], []
    for i, name in enumerate(filenames):
        source = root / "extracted" / "lowres_wide" / name
        shutil.copyfile(source, output / "source-rgb" / name)
        with Image.open(source) as image:
            if image.size != (256, 192) or image.mode != "RGB":
                raise ValueError("Unexpected RGB source format")
            image = image.transpose(Image.Transpose.ROTATE_270)
            image.save(output / "normalized-rgb" / name)
            rgb = np.asarray(image)
        k, d = detector.detectAndCompute(cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY), None)
        images.append(rgb); keys.append(k); descs.append(d)
        records.append({"index": i, "filename": name, "timestamp": timestamp(name),
                        "source_sha256": sha(source), "normalized_sha256": sha(output / "normalized-rgb" / name),
                        "source_path": f"source-rgb/{name}", "normalized_path": f"normalized-rgb/{name}",
                        "source_size": [256,192], "normalized_size": [192,256],
                        "rotate_clockwise_degrees": 90, "keypoints": len(k)})
    pairs = []
    for a, b in itertools.combinations(range(7),2):
        matches = mutual_ratio(descs[a],descs[b])
        pa=np.float32([keys[a][i].pt for i,_ in matches]).reshape(-1,2)
        pb=np.float32([keys[b][j].pt for _,j in matches]).reshape(-1,2)
        result,_=compare(pa,pb,[images[a].shape,images[b].shape])
        pairs.append(dict(a=a,b=b,mutual_matches=len(matches),**result))
    report = {
        "version": 1, "script_sha256": sha(__file__), "records": records, "pairs": pairs,
        "policy": POLICY, "components": components(range(7),[(p["a"],p["b"]) for p in pairs if p["accepted"]]),
        "selection_basis": "Human RGB-only visual coverage proposal after parent requested TV/window/sofa/desk/door and shared anchors, irrespective of strict SIFT acceptance.",
        "status": "Frozen exploratory proposal before VGA inspection; no model request or call",
        "expected_visible_anchors": [
            "TV cabinet, window, floor and sofa edge from entrance",
            "Window, radiator and sofa",
            "Sofa, cushions and wall",
            "Sofa plus desk/chair transition",
            "Desk, chair, printer and curtain",
            "Desk/curtain plus doorway; visible hallway must be excluded by confirmed boundary",
            "TV cabinet and lamp, linked visually to entrance view",
        ],
        "limits": [
            "Visual coverage and plausible shared anchors are not verified camera accuracy or reconstructability.",
            "A disconnected strict graph is matcher insufficiency, not proof that no seven-photo room capture can work.",
            "256x192 raw resolution and guided-video acquisition limit generalization to casual photos.",
            "Doorway includes beyond-room pixels; no adjoining room generation is authorized.",
            "Exploratory after earlier results, not blind evaluation. Original pilot and split unchanged.",
        ]}
    (output / "proposal.json").write_text(json.dumps(report,indent=2),encoding="utf8")
    sheet=Image.new("RGB",(1400,320),"#17201f");draw=ImageDraw.Draw(sheet)
    for i,rgb in enumerate(images):
        sheet.paste(Image.fromarray(rgb),(i*200+4,0))
        draw.text((i*200+4,260),f"{i:02d} {records[i]['timestamp']:.3f}",fill="white")
    draw.text((4,282),"FULL-ROOM VISUAL COVERAGE PROPOSAL | strict match failures retained | no verified geometry",fill="#edcb82")
    draw.text((4,300),"Doorway background excluded from intended room boundary | no VGA pixels/model run",fill="white")
    sheet.save(output/"proposal-seven.jpg",quality=93)
    print(json.dumps({"components":report["components"],"proposal_sha256":sha(output/"proposal.json")}))


def acquisition(root):
    root.mkdir(parents=True, exist_ok=False)
    record = download(URL, root / "lowres_wide.zip", MAX_ARCHIVE)
    if record["bytes"] != EXPECTED_BYTES:
        raise ValueError("Archive changed since reviewed HEAD; inspect before extraction")
    # Existing bounded extractor rejects traversal, links, duplicates and bombs.
    extract(root / "lowres_wide.zip", root / "extracted")
    frames = list((root / "extracted" / "lowres_wide").glob("*.png"))
    if len(frames) != EXPECTED_FRAMES:
        raise ValueError("Archive frame count differs from inspected central directory")
    for frame in frames:
        timestamp(frame)
    (root / "acquisition.json").write_text(json.dumps({
        "version": 1, "source_revision": REVISION, "asset": record,
        "frame_count": len(frames), "reference_policy": "RGB only; no depth, camera, mesh, annotations or model execution",
        "orientation": {"source_metadata": "Left", "rotate_clockwise_degrees": 90,
                        "basis": "Fixed capture orientation supplied by parent; verify RGB contact sheet"},
        "role": "separate exploratory capture-design candidate; original pilot unchanged",
    }, indent=2), encoding="utf8")


def refine(root, report_path, output):
    """At most200 extra frames in0.1s increments around failed temporal edges."""
    baseline = json.loads(report_path.read_text())
    if baseline["sample_interval_seconds"] != .5:
        raise ValueError("Refinement requires frozen half-second diagnostic")
    output.mkdir(parents=True, exist_ok=False)
    records = list(baseline["records"])
    accepted = {(p["a"], p["b"]) for p in baseline["pairs"] if p["accepted"]}
    gaps = [i for i in range(len(records)-1) if (i, i+1) not in accepted]
    gaps.sort(key=lambda i: (-min(records[i]["keypoints"], records[i+1]["keypoints"]), i))
    paths = sorted((root / "extracted" / "lowres_wide").glob("*.png"), key=timestamp)
    available_times = np.array([timestamp(p) for p in paths])
    used = {r["filename"] for r in records}
    extra, gap_records = [], []
    for i in gaps[:50]:
        selected = []
        for delta in (.1, .2, .3, .4):
            target = records[i]["timestamp"] + delta
            if target >= records[i+1]["timestamp"]:
                continue
            path = paths[int(np.argmin(abs(available_times-target)))]
            if path.name not in used:
                used.add(path.name); extra.append(path)
                selected.append(path.name)
        gap_records.append({"between": [i, i+1], "added": selected})
    assert len(extra) <= 200
    for path in extra:
        records.append({"index": len(records), "filename": path.name, "timestamp": timestamp(path),
                        "source_sha256": sha(path), "source_size": [256, 192],
                        "normalized_size": [192, 256], "rotate_clockwise_degrees": 90})
    cv2.setNumThreads(2)
    detector = cv2.SIFT_create(nfeatures=POLICY["features"])
    images, keys, descs = [], [], []
    for record in records:
        path = root / "extracted" / "lowres_wide" / record["filename"]
        if sha(path) != record["source_sha256"]:
            raise ValueError("Source RGB changed")
        with Image.open(path) as image:
            if image.size != (256, 192) or image.mode != "RGB":
                raise ValueError("Unexpected source RGB")
            rgb = np.asarray(image.transpose(Image.Transpose.ROTATE_270))
        k, d = detector.detectAndCompute(cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY), None)
        images.append(rgb); keys.append(k); descs.append(d); record["keypoints"] = len(k)
    pairs = list(baseline["pairs"])
    start = len(baseline["records"])
    comparisons = [(a,b) for a,b in itertools.combinations(range(len(records)),2)
                   if b >= start and abs(records[a]["timestamp"]-records[b]["timestamp"]) <= .52]
    if len(comparisons) > 5000:
        raise ValueError("Extra neighbor comparisons exceed bound")
    for a, b in comparisons:
        matches = mutual_ratio(descs[a], descs[b])
        pa = np.float32([keys[a][i].pt for i, _ in matches]).reshape(-1, 2)
        pb = np.float32([keys[b][j].pt for _, j in matches]).reshape(-1, 2)
        result, _ = compare(pa, pb, [images[a].shape, images[b].shape])
        pairs.append(dict(a=a, b=b, mutual_matches=len(matches), **result))
    report = {"version": 1, "script_sha256": sha(__file__), "baseline_report_sha256": sha(report_path),
              "policy": POLICY, "additional_frames": len(extra), "additional_pairs": len(comparisons),
              "gap_selection": "Failed adjacent0.5s edges ranked by smaller endpoint keypoint count descending; first50gaps",
              "gaps": gap_records, "records": records, "pairs": pairs,
              "components": components(range(len(records)), [(p["a"],p["b"]) for p in pairs if p["accepted"]]),
              "limits": baseline["limits"], "selection": "No seven chosen; this tests missing temporal bridges only"}
    (output / "report.json").write_text(json.dumps(report, indent=2), encoding="utf8")
    # Split sheets keep visual inspection practical; baseline indices remain stable.
    for part, offset in enumerate(range(start, len(records), 49)):
        indices = sorted(range(offset, min(offset+49,len(records))), key=lambda i: records[i]["timestamp"])
        sheet = Image.new("RGB", (1400, ((len(indices)+6)//7)*280+35), "#17201f")
        draw = ImageDraw.Draw(sheet)
        draw.text((10, 8), "Additional0.1s RGB neighbors | unchanged matching policy | not inferred geometry", fill="white")
        for col, i in enumerate(indices):
            x,y=(col%7)*200,(col//7)*280+30
            sheet.paste(Image.fromarray(images[i]), (x+4,y))
            draw.text((x+4,y+260), f"{i:03d} {records[i]['timestamp']:.3f}", fill="white")
        sheet.save(output / f"additional-contact-{part}.jpg", quality=93)
    print(json.dumps({"additional_frames": len(extra), "additional_pairs": len(comparisons),
                      "component_sizes": [len(c) for c in report["components"]],
                      "baseline_members_per_component": [[i for i in c if i<start] for c in report["components"]]}))


def analyze(root, output, interval):
    acquisition_record = json.loads((root / "acquisition.json").read_text())
    if acquisition_record["asset"]["sha256"] != sha(root / "lowres_wide.zip"):
        raise ValueError("Archive changed")
    output.mkdir(parents=True, exist_ok=False)
    paths = temporal_sample(list((root / "extracted" / "lowres_wide").glob("*.png")), interval)
    if len(paths) > 128:
        raise ValueError("Temporal sample exceeds 128-image diagnostic bound")
    cv2.setNumThreads(2)
    detector = cv2.SIFT_create(nfeatures=POLICY["features"])
    images, keys, descs, records = [], [], [], []
    for path in paths:
        with Image.open(path) as image:
            if image.size != (256, 192) or image.mode != "RGB":
                raise ValueError("Unexpected source RGB format")
            image = image.transpose(Image.Transpose.ROTATE_270)
            rgb = np.asarray(image)
        k, d = detector.detectAndCompute(cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY), None)
        images.append(rgb); keys.append(k); descs.append(d)
        records.append({"index": len(records), "filename": path.name, "timestamp": timestamp(path),
                        "source_sha256": sha(path), "source_size": [256, 192],
                        "normalized_size": [192, 256], "rotate_clockwise_degrees": 90,
                        "keypoints": len(k)})
    pairs = []
    for a, b in itertools.combinations(range(len(records)), 2):
        matches = mutual_ratio(descs[a], descs[b])
        pa = np.float32([keys[a][i].pt for i, _ in matches]).reshape(-1, 2)
        pb = np.float32([keys[b][j].pt for _, j in matches]).reshape(-1, 2)
        result, _ = compare(pa, pb, [images[a].shape, images[b].shape])
        pairs.append(dict(a=a, b=b, mutual_matches=len(matches), **result))
    suggested = connected_seven(records, pairs)
    report = {
        "version": 1, "script_sha256": sha(__file__), "source_acquisition": acquisition_record,
        "diagnostic_policy": POLICY, "diagnostic_module_sha256": sha(Path(__file__).with_name("analyze_arkit_overlap.py")),
        "sample_interval_seconds": interval, "records": records, "pairs": pairs,
        "components": components(range(len(records)), [(p["a"], p["b"]) for p in pairs if p["accepted"]]),
        "suggested_exploratory_seven": suggested,
        "selection_policy": "Connected beam search (256 states), prioritizing temporal spread with each gap capped at3s, span, then accepted edges. Not exhaustive.",
        "limits": [
            "256x192 source RGB limits fine detail; no learned upscaling used.",
            "Connected F/H graph is not verified parallax, poses, reconstruction or complete room coverage.",
            "Temporal samples from guided iPad scanning are not casual independent phone photos.",
            "Exploratory selection after earlier results; not a new blind held-out test.",
            "No original pilot mutation, supplied depth/poses/mesh, inference request or model call.",
        ],
    }
    (output / "report.json").write_text(json.dumps(report, indent=2), encoding="utf8")
    columns = 7
    sheet = Image.new("RGB", (columns*200, ((len(images)+columns-1)//columns)*290+45), "#17201f")
    draw = ImageDraw.Draw(sheet)
    draw.text((10, 10), "Raw RGB temporal samples | 90deg clockwise | exploration only", fill="white")
    for i, rgb in enumerate(images):
        x, y = (i % columns)*200, (i//columns)*290+40
        sheet.paste(Image.fromarray(rgb), (x+4, y))
        draw.text((x+4, y+259), f"{i:02d} {records[i]['timestamp']:.3f}", fill="white")
        if suggested and i in suggested:
            draw.text((x+4, y+274), "Connected candidate", fill="#edcb82")
    sheet.save(output / "temporal-contact-sheet.jpg", quality=93)
    if suggested:
        selected = Image.new("RGB", (7*200, 290), "#17201f")
        draw = ImageDraw.Draw(selected)
        for col, i in enumerate(suggested):
            selected.paste(Image.fromarray(images[i]), (col*200+4, 0))
            draw.text((col*200+4, 259), f"{i:02d} {records[i]['timestamp']:.3f}", fill="white")
        selected.save(output / "proposed-seven.jpg", quality=93)
    print(json.dumps({"sampled": len(records), "components": report["components"], "suggested": suggested}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["acquire", "analyze", "freeze", "refine", "propose"])
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--interval", type=float, default=1.0)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--selection", type=int, nargs=7)
    parser.add_argument("--filenames", nargs=7)
    args = parser.parse_args()
    private = Path(__file__).resolve().parents[2] / ".local" / "reconstruction"
    if not args.root.resolve().is_relative_to(private.resolve()):
        parser.error("Use a fresh private reconstruction directory")
    if args.action == "acquire":
        acquisition(args.root)
    elif args.action == "analyze":
        if not args.output or not .5 <= args.interval <= 5:
            parser.error("Analysis needs fresh output and interval .5..5 seconds")
        analyze(args.root, args.output, args.interval)
    elif args.action == "freeze":
        if not args.output or not args.report or not args.selection:
            parser.error("Freeze requires report, seven indices and fresh output")
        freeze_selection(args.root, args.report, args.selection, args.output)
    elif args.action == "refine":
        if not args.output or not args.report:
            parser.error("Refinement requires frozen report and fresh output")
        refine(args.root, args.report, args.output)
    else:
        if not args.output or not args.filenames:
            parser.error("Visual proposal needs seven filenames and fresh output")
        visual_proposal(args.root,args.filenames,args.output)


if __name__ == "__main__":
    main()
