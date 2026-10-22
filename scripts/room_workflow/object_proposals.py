"""Lift source-linked masks into observed 3D object proposals, never full shapes."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

from complete_candidate import checked_fields, validate_reviewed_boundary
from geometry import unproject, point_inside, validate_boundary
from inference import fingerprint
from object_suggestions import decode_mask, validate_result
from pilot import encoded, load_json, sha
from review_result import crop_bounds, validate_files


def lift(mask, transform, camera, depth, valid, rgb):
    left, top, right, bottom = crop_bounds(transform)
    resized = np.asarray(Image.fromarray(mask).resize(
        (right-left, bottom-top), Image.Resampling.NEAREST), bool)
    selected = np.zeros((518, 518), bool)
    selected[top:bottom, left:right] = resized
    valid = valid.astype(bool) & np.isfinite(depth) & (depth > 1e-6)
    points = unproject(depth, camera["intrinsics"], camera["world_to_camera"])
    return lift_points(selected, points, valid, rgb)


def lift_points(mask, points, valid, rgb):
    mask, points, valid, rgb = map(np.asarray, (mask, points, valid, rgb))
    if (mask.ndim != 2 or max(mask.shape) > 1024 or min(mask.shape) < 1
            or mask.dtype != bool or valid.dtype != bool or valid.shape != mask.shape
            or points.shape != (*mask.shape, 3) or rgb.shape != points.shape
            or points.dtype.kind not in 'iuf' or rgb.dtype.kind not in 'iuf'):
        raise ValueError("Mask, pointmap, validity and RGB must share a bounded raster")
    selected = mask & valid & np.isfinite(points).all(axis=-1)
    if np.count_nonzero(selected) < 12:
        return None
    points, colors = points[selected], rgb[selected]
    if not np.isfinite(colors).all() or (colors < 0).any() or (colors > 1).any():
        raise ValueError("Invalid masked source colors")
    lo, hi = np.quantile(points, [.02, .98], axis=0)
    keep = ((points >= lo) & (points <= hi)).all(axis=1)
    points, colors = points[keep], colors[keep]
    if len(points) < 12:
        return None
    indices = np.linspace(0, len(points)-1, min(512, len(points)), dtype=int)
    return {"visible_bounds": [lo.tolist(), hi.tolist()],
            "center": np.median(points, axis=0).tolist(),
            "color": np.median(colors, axis=0).tolist(),
            "support_pixels": int(np.count_nonzero(selected)),
            "points": points[indices].tolist()}


def compatible(a, b):
    if a["image_id"] == b["image_id"] or a["label"] != b["label"]:
        return False
    x, y = np.asarray(a["support"]["visible_bounds"]), np.asarray(b["support"]["visible_bounds"])
    scale = max(np.linalg.norm(x[1]-x[0]), np.linalg.norm(y[1]-y[0]), 1e-6)
    # Thin visible surfaces have zero volume: use extent overlap with a small,
    # relative tolerance, not AABB volume IoU or assumed metric dimensions.
    overlap = np.minimum(x[1], y[1])-np.maximum(x[0], y[0])
    return bool((overlap >= -.05*scale).all() and np.linalg.norm(
        np.asarray(a["support"]["center"])-b["support"]["center"]) < .3*scale)


def associate(observations):
    """Conservative mutual-unique matches; competing sightings remain separate."""
    eligible = [o for o in observations if o["support"] is not None and
                "outside-reviewed-room" not in o["review_reasons"]]
    groups = [[i] for i in range(len(eligible))]
    edges = []
    for i, a in enumerate(eligible):
        for j in range(i+1, len(eligible)):
            b = eligible[j]
            if not compatible(a, b):
                continue
            rivals_a = [o for o in eligible if o["image_id"] == b["image_id"] and compatible(a, o)]
            rivals_b = [o for o in eligible if o["image_id"] == a["image_id"] and compatible(b, o)]
            if len(rivals_a) == len(rivals_b) == 1:
                edges.append((i, j))
            else:
                for item in (a, b):
                    if "ambiguous-cross-view-identity" not in item["review_reasons"]:
                        item["review_reasons"].append("ambiguous-cross-view-identity")
    for i, j in edges:
        ga, gb = next(g for g in groups if i in g), next(g for g in groups if j in g)
        if ga is gb:
            continue
        # Complete-link grouping prevents chains from joining distinct furniture.
        if all(compatible(eligible[x], eligible[y]) for x in ga for y in gb):
            ga.extend(gb); groups.remove(gb)
    output = []
    for group in groups:
        members = [eligible[i] for i in group]
        ids = sorted(o["id"] for o in members)
        reasons = sorted(set(reason for o in members for reason in o["review_reasons"]))
        if len(members) == 1:
            reasons.append("single-view-only")
        output.append({"id": "object-"+fingerprint(ids)[:16], "label": members[0]["label"],
                       "observation_ids": ids, "review_reasons": reasons,
                       "status": "observed-region-proposal", "complete_shape": False})
    return output


def inside_bounds(support, boundary):
    polygon, floor, ceiling = validate_boundary(boundary)
    lo, hi = support["visible_bounds"]
    # Empty corners of an axis-aligned box are not observed object support.
    return bool(lo[2] >= floor and hi[2] <= ceiling and
                all(point_inside(np.asarray(p[:2]), polygon) for p in support["points"]))


def build(request, analysis, suggestions, reviewed):
    validate_result(suggestions, request)
    originals = [{"id": r["id"], "sha256": r["sha256"]} for r in request["images"]]
    if (analysis.get("job_id") != request["job_id"] or
            analysis.get("original_inputs_sha256") != fingerprint({"images": originals, "masks": {}})):
        raise ValueError("Object and analysis sources differ")
    boundary, _ = validate_reviewed_boundary(reviewed, analysis)
    fields, sources = checked_fields(analysis, analysis)
    if sources != originals:
        raise ValueError("Analysis source order differs")
    observations = []
    for i, view in enumerate(suggestions["views"]):
        transform, camera = analysis["preprocessing"][i], analysis["arms"]["A"]["cameras"][i]
        if view["source_size"] != transform["source_size"]:
            raise ValueError("Mask/image normalization differs from analysis")
        for detection in view["detections"]:
            support = lift(decode_mask(detection["mask"], view["mask_size"]), transform, camera,
                           fields["depth"][i], fields["selected_valid"][i], fields["rgb"][i])
            reasons = list(detection["review_reasons"])
            if support is None:
                reasons.append("insufficient-estimated-depth")
            else:
                if not inside_bounds(support, boundary):
                    reasons.append("outside-reviewed-room")
            observations.append({"id": detection["id"], "image_id": view["image_id"],
                                 "source_sha256": view["source_sha256"], "label": detection["label"],
                                 "mask_sha256": detection["mask"]["sha256"],
                                 "review_reasons": reasons, "support": support})
    objects = associate(observations)
    return {"version": 1, "kind": "eva-observed-object-proposals-v1",
            "job_id": request["job_id"], "analysis_binding": analysis["analysis_binding"],
            "suggestions_sha256": fingerprint(suggestions), "review_sha256": fingerprint(reviewed),
            "implementation_sha256": {name: sha(Path(__file__).with_name(name).read_bytes()) for name in
                                      ("object_proposals.py", "complete_candidate.py", "geometry.py", "prediction_fields.py")},
            "coordinate_frame": "analysis", "units": "relative",
            "observations": observations, "objects": objects,
            "limitations": ["Visible depth support only; bounds do not estimate hidden object extents.",
                           "Conservative geometric associations can miss repeated sightings or merge lookalikes.",
                           "No new mesh or full shape is generated. Room containment is a review flag.",
                           "No automatic corrections, SAM 3D execution or physical accuracy claim."]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("request", "analysis", "suggestions", "reviewed", "output"):
        parser.add_argument("--"+name, type=Path, required=True)
    args = parser.parse_args()
    # Full existing worker contract validation precedes private local processing.
    analysis, request = validate_files(args.analysis, args.request)
    suggestions, _ = load_json(args.suggestions, 16*1024**2)
    reviewed, _ = load_json(args.reviewed, 65536)
    result = build(request, analysis, suggestions, reviewed)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("xb") as file:
        file.write(encoded(result))
    print(json.dumps({"status": "proposals-only", "objects": len(result["objects"]),
                      "sha256": sha(args.output.read_bytes())}))
