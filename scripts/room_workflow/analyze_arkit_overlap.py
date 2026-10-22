"""Exploratory RGB-only input connectivity; never changes a dataset split or model input."""
import argparse
import hashlib
import itertools
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

POLICY = dict(longest_side=1280, features=8000, ratio=0.70, seed=7321,
              ransac_pixels=1.5, confidence=0.999, iterations=10000,
              min_inliers=30, min_fraction=0.35, min_hull_fraction=0.04,
              grid_side=4, min_grid_cells=4)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def mutual_ratio(descriptors_a, descriptors_b):
    if descriptors_a is None or descriptors_b is None or min(len(descriptors_a), len(descriptors_b)) < 2:
        return []
    matcher = cv2.BFMatcher(cv2.NORM_L2)
    def select(a, b):
        return {(m.queryIdx, m.trainIdx) for pair in matcher.knnMatch(a, b, k=2)
                if len(pair) == 2 for m, n in [pair] if m.distance < POLICY["ratio"] * n.distance}
    forward = select(descriptors_a, descriptors_b)
    backward = select(descriptors_b, descriptors_a)
    return sorted((a, b) for a, b in forward if (b, a) in backward)


def spatial_support(points, shape):
    height, width = shape[:2]
    if len(points) < 3:
        return dict(hull_fraction=0.0, grid_cells=0)
    hull = cv2.contourArea(cv2.convexHull(np.asarray(points, np.float32))) / (width * height)
    cells = np.floor(np.asarray(points) / [width, height] * POLICY["grid_side"]).astype(int)
    cells = np.clip(cells, 0, POLICY["grid_side"] - 1)
    return dict(hull_fraction=float(hull), grid_cells=len(set(map(tuple, cells))))


def summarize_model(matrix, mask, points_a, points_b, shapes):
    good = np.zeros(len(points_a), bool) if mask is None else mask.reshape(-1).astype(bool)
    valid = matrix is not None and matrix.shape == (3, 3) and np.isfinite(matrix).all()
    if not valid:
        good[:] = False
    support = [spatial_support(p[good], shape) for p, shape in zip((points_a, points_b), shapes)]
    fraction = float(good.mean()) if len(good) else 0.0
    reasons = []
    if not valid:
        reasons.append("model-fit-failed")
    if int(good.sum()) < POLICY["min_inliers"]:
        reasons.append("too-few-inliers")
    if fraction < POLICY["min_fraction"]:
        reasons.append("low-inlier-fraction")
    if any(s["hull_fraction"] < POLICY["min_hull_fraction"] for s in support):
        reasons.append("localized-hull")
    if any(s["grid_cells"] < POLICY["min_grid_cells"] for s in support):
        reasons.append("localized-grid")
    return dict(inliers=int(good.sum()), fraction=fraction, support=support,
                accepted=not reasons, rejection_reasons=reasons), good


def compare(points_a, points_b, shapes):
    points_a, points_b = np.float32(points_a).reshape(-1, 2), np.float32(points_b).reshape(-1, 2)
    results, masks = {}, {}
    for model in ("fundamental", "homography"):
        matrix, mask, error = None, None, None
        if len(points_a) >= (8 if model == "fundamental" else 4):
            cv2.setRNGSeed(POLICY["seed"])
            try:
                if model == "fundamental":
                    matrix, mask = cv2.findFundamentalMat(
                        points_a, points_b, cv2.FM_RANSAC, POLICY["ransac_pixels"],
                        POLICY["confidence"], POLICY["iterations"])
                else:
                    matrix, mask = cv2.findHomography(
                        points_a, points_b, cv2.RANSAC, POLICY["ransac_pixels"],
                        maxIters=POLICY["iterations"], confidence=POLICY["confidence"])
            except cv2.error as exc:
                error = str(exc)
        results[model], masks[model] = summarize_model(matrix, mask, points_a, points_b, shapes)
        if error:
            results[model]["error"] = error
    accepted = [name for name, result in results.items() if result["accepted"]]
    results["accepted"] = bool(accepted)
    results["classification"] = ("planar-or-rotation-compatible" if results["homography"]["accepted"]
                                 else "epipolar-supported" if results["fundamental"]["accepted"]
                                 else "insufficient-support")
    return results, masks


def components(nodes, edges):
    remaining, result = set(nodes), []
    adjacency = {n: set() for n in nodes}
    for a, b in edges:
        if a in adjacency and b in adjacency:
            adjacency[a].add(b)
            adjacency[b].add(a)
    while remaining:
        todo, found = [min(remaining)], set()
        while todo:
            node = todo.pop()
            if node not in found:
                found.add(node)
                todo.extend(adjacency[node] - found)
        remaining -= found
        result.append(sorted(found))
    return sorted(result, key=lambda group: (-len(group), group))


def selection_report(records, pairs, size=7):
    nodes = list(range(len(records)))
    edges = [(p["a"], p["b"]) for p in pairs if p["accepted"]]
    originals = [i for i, r in enumerate(records) if r["split"] == "originals"]
    original_components = components(originals, edges)
    memberships = {n: i for i, group in enumerate(original_components) for n in group}
    bridges = []
    for n in nodes:
        if n in originals:
            continue
        touched = sorted({memberships[b if a == n else a] for a, b in edges
                          if n in (a, b) and (b if a == n else a) in memberships})
        if len(touched) > 1:
            bridges.append(dict(index=n, original_components=touched))
    connected = []
    for subset in itertools.combinations(nodes, size):
        if len(components(subset, edges)) == 1:
            internal = [p for p in pairs if p["accepted"] and p["a"] in subset and p["b"] in subset]
            score = (sum(n in originals for n in subset), len(internal),
                     sum(max(p["fundamental"]["inliers"], p["homography"]["inliers"]) for p in internal))
            connected.append((score, subset))
    connected.sort(reverse=True)
    return dict(all_components=components(nodes, edges), original_components=original_components,
                direct_bridge_frames=bridges, connected_seven_count=len(connected),
                suggested_exploratory_seven=list(connected[0][1]) if connected else None,
                ranking="retain most originals, then most accepted edges, then summed inlier support",
                acceptance_warning="Connectivity is not sufficient for triangulation, camera accuracy, room coverage or reconstructability.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text())
    # Exclusive output directory prevents replacing an earlier diagnostic.
    args.output.mkdir(parents=True, exist_ok=False)
    cv2.setNumThreads(2)
    records, images, keypoints, descriptors = [], [], [], []
    detector = cv2.SIFT_create(nfeatures=POLICY["features"])
    for split in ("originals", "heldout"):
        for entry in manifest[split]:
            path = (args.manifest.parent / entry["path"]).resolve()
            if args.manifest.parent.resolve() not in path.parents:
                raise ValueError("Image path escapes manifest directory")
            digest = sha(path)
            if digest != entry["sha256"]:
                raise ValueError("Normalized RGB checksum mismatch")
            image = cv2.imread(str(path), cv2.IMREAD_COLOR)
            if image is None:
                raise ValueError(f"Cannot read RGB {path.name}")
            scale = min(1, POLICY["longest_side"] / max(image.shape[:2]))
            image = cv2.resize(image, (round(image.shape[1] * scale), round(image.shape[0] * scale)),
                               interpolation=cv2.INTER_AREA)
            keys, desc = detector.detectAndCompute(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY), None)
            records.append(dict(index=len(records), id=entry["id"], split=split,
                                filename=entry["source_filename"], normalized_sha256=digest,
                                source_sha256_manifest=entry["source_sha256"], shape=list(image.shape),
                                normalization=entry["normalization"], keypoints=len(keys)))
            images.append(image)
            keypoints.append(keys)
            descriptors.append(desc)
    pairs = []
    for a, b in itertools.combinations(range(len(records)), 2):
        matches = mutual_ratio(descriptors[a], descriptors[b])
        pa = np.float32([keypoints[a][i].pt for i, _ in matches]).reshape(-1, 2)
        pb = np.float32([keypoints[b][j].pt for _, j in matches]).reshape(-1, 2)
        result, masks = compare(pa, pb, [images[a].shape, images[b].shape])
        pairs.append(dict(a=a, b=b, mutual_matches=len(matches), **result))
        if result["accepted"]:
            model = "fundamental" if result["fundamental"]["accepted"] else "homography"
            keep = np.flatnonzero(masks[model])
            # Spread the visualization across the actual inlier list; never fabricate links.
            keep = keep[np.linspace(0, len(keep)-1, min(50, len(keep)), dtype=int)]
            draw_matches = [cv2.DMatch(matches[k][0], matches[k][1], 0) for k in keep]
            view = cv2.drawMatches(images[a], keypoints[a], images[b], keypoints[b], draw_matches,
                                  None, flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS)
            view = cv2.resize(view, (960, 640), interpolation=cv2.INTER_AREA)
            cv2.imwrite(str(args.output / f"matches-{a:02d}-{b:02d}.jpg"), view)
        print(f"{a:02d}-{b:02d}: {len(matches)} mutual, {result['classification']}", flush=True)
    selection = selection_report(records, pairs)
    report = dict(version=1, manifest_sha256=sha(args.manifest), script_sha256=sha(__file__),
                  opencv=cv2.__version__, policy=POLICY, records=records, pairs=pairs, selection=selection,
                  source_methods=[
                      "https://docs.opencv.org/4.x/d1/de0/tutorial_py_feature_homography.html",
                      "https://docs.opencv.org/4.x/da/de9/tutorial_py_epipolar_geometry.html"],
                  limitations=[
                      "Exploratory input design after inspecting former held-out RGB; not blind held-out accuracy.",
                      "No depth, supplied poses, mesh or model outputs read; original split and candidates unchanged.",
                      "Thresholds are explicit engineering gates, not externally validated guarantees.",
                      "Rejected edges mean insufficient matcher evidence, not proof of physical non-overlap.",
                      "Accepted F/H fits can include repeated textures; planar/rotation support does not establish 3D parallax.",
                      "Suggested selection is report-only; no model call or dataset replacement."])
    (args.output / "report.json").write_text(json.dumps(report, indent=2), encoding="utf8")
    sheet = Image.new("RGB", (7 * 210, 2 * 330 + 70), "#17201f")
    draw = ImageDraw.Draw(sheet)
    draw.text((12, 10), "ARKitScenes RGB-only overlap diagnostic | O original / H former held-out | split unchanged", fill="white")
    chosen = set(selection["suggested_exploratory_seven"] or [])
    for i, (record, image) in enumerate(zip(records, images)):
        x, y = (i % 7) * 210, (i // 7) * 330 + 50
        thumb = Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
        thumb.thumbnail((202, 269))
        sheet.paste(thumb, (x+4, y))
        label = f"{i:02d} {'O' if record['split']=='originals' else 'H'} {record['filename'].split('_')[-1]}"
        draw.text((x+4, y+273), label, fill="white")
        neighbors = [str(p["b"] if p["a"] == i else p["a"]) for p in pairs if p["accepted"] and i in (p["a"], p["b"])]
        draw.text((x+4, y+289), "Links: " + (",".join(neighbors) or "none"), fill="#edcb82")
        if i in chosen:
            draw.text((x+4, y+305), "Exploratory seven", fill="#a8e0a4")
    sheet.save(args.output / "contact-sheet.jpg", quality=93)
    print(json.dumps(selection, indent=2))


if __name__ == "__main__":
    main()
