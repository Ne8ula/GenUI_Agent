"""Frozen-room diagnostics at held-out RGB views registered with SIFT + PnP.

Query poses are estimated from RGB matches to original-view VGGT points, NOT
ground-truth cameras. Reference depth is loaded only after pose estimation.
One training-only scale is reused unchanged. Every failed query stays counted.
"""
import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

from complete_candidate import arrays, geometry_hash
from evaluate_arkit_depth import REVISION, _errors, prepare_reference
from prediction_fields import unpack
from review_result import crop_bounds, make_scene, render

POLICY = {
    "sift_max_features": 3000, "feature_image_long_edge": 1024, "ratio_threshold": .75,
    "mutual_matching": True, "minimum_matches": 30, "ransac_iterations": 5000,
    "ransac_pixel_error_at_518": 3., "ransac_confidence": .999,
    "minimum_inliers": 20, "minimum_inlier_fraction": .25,
    "minimum_inlier_source_views": 2, "minimum_query_hull_fraction": .04,
    "maximum_median_reprojection_pixels": 3., "minimum_positive_depth_fraction": .95,
    "original_depth_policy": "original upper 75 percent confidence selection",
    "intrinsics": "elementwise median of seven frozen estimated original camera intrinsics",
}
SOURCES = {
    "descriptor_distance_ratio_and_mutual_matching": "https://docs.opencv.org/4.10.0/d5/d6f/tutorial_feature_flann_matcher.html",
    "world_to_camera_projection_ransac_and_lm_refinement": "https://docs.opencv.org/4.10.0/d5/d1f/calib3d_solvePnP.html",
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def source_path(root, relative):
    root = Path(root).resolve()
    path = (root/relative).resolve()
    if not path.is_relative_to(root) or path == root:
        raise ValueError("Image path escapes manifest directory")
    return path


def load_source(root, record):
    data = source_path(root, record["path"]).read_bytes()
    if digest(data) != record["sha256"]:
        raise ValueError("RGB bytes differ from frozen manifest")
    with Image.open(source_path(root, record["path"])) as image:
        source = image.convert("RGB")
    if source.size != (record["width"], record["height"]):
        raise ValueError("Manifest RGB dimensions disagree")
    return source


def preprocessing(size):
    width, height = size
    if width >= height:
        nw, nh = 518, round(height*518/width/14)*14
    else:
        nh, nw = 518, round(width*518/height/14)*14
    return {"source_size": [width, height], "resized_size": [nw, nh],
            "padding_left_top": [(518-nw)//2, (518-nh)//2],
            "model_size": [518, 518], "pixel_center_convention": "integer"}


def features(image, transform, sift):
    factor = POLICY["feature_image_long_edge"]/max(image.size)
    size = tuple(round(value*factor) for value in image.size)
    rgb = np.asarray(image.resize(size, Image.Resampling.LANCZOS))
    keypoints, descriptors = sift.detectAndCompute(cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY), None)
    xy = np.array([k.pt for k in keypoints], np.float32).reshape(-1, 2)
    xy *= np.asarray(transform["resized_size"])/np.asarray(size)
    xy += np.asarray(transform["padding_left_top"])
    return xy, descriptors


def anchor_points(xy, depth, selected, camera):
    pixel = np.rint(xy).astype(int)
    valid = ((pixel >= 0) & (pixel < np.array(depth.shape[::-1]))).all(1)
    clipped = pixel.clip([0, 0], np.array(depth.shape[::-1])-1)
    valid &= selected[clipped[:, 1], clipped[:, 0]].astype(bool)
    z = depth[clipped[:, 1], clipped[:, 0]]
    valid &= np.isfinite(z) & (z > 1e-6)
    k, pose = np.asarray(camera["intrinsics"]), np.asarray(camera["world_to_camera"])
    rays = np.column_stack([xy, np.ones(len(xy))])@np.linalg.inv(k).T
    points = (rays*z[:, None]-pose[:, 3])@pose[:, :3]
    return points, valid


def match_anchors(query_descriptors, originals):
    if query_descriptors is None or len(query_descriptors) < 2:
        return [], np.empty((0, 3)), np.empty(0, int)
    matcher = cv2.BFMatcher(cv2.NORM_L2)
    best = {}
    for source_index, source in enumerate(originals):
        descriptors = source["descriptors"]
        if descriptors is None or len(descriptors) < 2:
            continue
        forward = matcher.knnMatch(query_descriptors, descriptors, k=2)
        reverse = matcher.match(descriptors, query_descriptors)
        reverse_ids = {m.queryIdx: m.trainIdx for m in reverse}
        for pair in forward:
            if len(pair) != 2:
                continue
            first, second = pair
            if first.distance >= POLICY["ratio_threshold"]*second.distance:
                continue
            if reverse_ids.get(first.trainIdx) != first.queryIdx:
                continue
            if not source["valid"][first.trainIdx]:
                continue
            record = (first.distance, source["points"][first.trainIdx], source_index)
            if first.queryIdx not in best or record[0] < best[first.queryIdx][0]:
                best[first.queryIdx] = record
    indices = sorted(best)
    return indices, np.array([best[i][1] for i in indices]).reshape(-1, 3), np.array([best[i][2] for i in indices])


def estimate_query_pose(points, xy, source_indices, k, transform, seed=20261020):
    """No reference data or candidate render enters registration or its gates."""
    summary = {"matches": len(points), "status": "registration-failed", "reasons": []}
    if len(points) < POLICY["minimum_matches"]:
        summary["reasons"] = ["insufficient-matches"]
        return None, summary
    cv2.setRNGSeed(seed)
    success, rotation, translation, inliers = cv2.solvePnPRansac(
        np.asarray(points, np.float64), np.asarray(xy, np.float64), np.asarray(k, np.float64), None,
        iterationsCount=POLICY["ransac_iterations"],
        reprojectionError=POLICY["ransac_pixel_error_at_518"],
        confidence=POLICY["ransac_confidence"], flags=cv2.SOLVEPNP_EPNP)
    if not success or inliers is None or len(inliers) < 4:
        summary["reasons"] = ["pnp-ransac-failed"]
        return None, summary
    keep = inliers.ravel()
    rotation, translation = cv2.solvePnPRefineLM(points[keep], xy[keep], k, None, rotation, translation)
    projected = cv2.projectPoints(points, rotation, translation, k, None)[0].reshape(-1, 2)
    residuals = np.linalg.norm(projected-xy, axis=1)
    keep = np.flatnonzero(residuals <= POLICY["ransac_pixel_error_at_518"])
    matrix = cv2.Rodrigues(rotation)[0]
    depths = (points@matrix.T+translation.ravel())[:, 2]
    hull = cv2.convexHull(xy[keep].astype(np.float32)) if len(keep) >= 3 else None
    hull_fraction = float(cv2.contourArea(hull)/np.prod(transform["resized_size"])) if hull is not None else 0.
    median = float(np.median(residuals[keep])) if len(keep) else None
    sources = sorted(set(int(i) for i in source_indices[keep]))
    positive = float((depths[keep] > 0).mean()) if len(keep) else 0.
    summary.update({"inliers": len(keep), "inlier_fraction": len(keep)/len(points),
                    "inlier_source_views": sources, "query_hull_fraction": hull_fraction,
                    "median_reprojection_pixels": median, "positive_depth_fraction": positive})
    checks = [
        (len(keep) >= POLICY["minimum_inliers"], "insufficient-inliers"),
        (len(keep)/len(points) >= POLICY["minimum_inlier_fraction"], "low-inlier-fraction"),
        (len(sources) >= POLICY["minimum_inlier_source_views"], "single-source-support"),
        (hull_fraction >= POLICY["minimum_query_hull_fraction"], "spatially-concentrated-matches"),
        (median is not None and median <= POLICY["maximum_median_reprojection_pixels"], "high-reprojection-error"),
        (positive >= POLICY["minimum_positive_depth_fraction"], "negative-depth-correspondences")]
    summary["reasons"] = [reason for accepted, reason in checks if not accepted]
    if summary["reasons"]:
        return None, summary
    summary["status"] = "registered-estimated-query-pose"
    summary["inlier_indices"] = keep.tolist()
    return np.column_stack([matrix, translation]), summary


def measure_render(depth, rgb, reference, domain, source_rgb, scale):
    hits = domain & np.isfinite(depth) & (depth > 0)
    ref_valid = domain & np.isfinite(reference) & (reference > 0)
    overlap = hits & ref_valid
    return {"image_domain_pixels": int(domain.sum()), "mesh_hit_pixels": int(hits.sum()),
            "valid_reference_pixels": int(ref_valid.sum()), "overlap_pixels": int(overlap.sum()),
            "missing_mesh_at_valid_reference_pixels": int((ref_valid & ~hits).sum()),
            "ray_coverage": float(hits.sum()/domain.sum()),
            "rgb_mae_0_255_on_hits": float(np.abs(rgb.astype(float)-source_rgb)[hits].mean()) if hits.any() else None,
            "reference_depth_errors": _errors(depth[overlap], reference[overlap], scale),
            "status": "ok" if overlap.any() else "no-valid-reference" if not ref_valid.any() else "no-mesh-hits"}


def common_overlap_metrics(depths, reference, domain, scale):
    """Compare exactly the same valid pixels; never optimize poses or geometry."""
    common = domain & np.isfinite(reference) & (reference > 0)
    for depth in depths.values():
        common &= np.isfinite(depth) & (depth > 0)
    return {"pixels": int(common.sum()),
            "policy": "intersection of valid reference and positive finite ray hits from every variant",
            "variants": {name: _errors(depth[common], reference[common], scale)
                         for name, depth in depths.items()}}


def registration_failure_labels(view):
    if view["registration"]["status"] != "registered-estimated-query-pose":
        for record in view["variants"].values():
            record["status"] = "not-rendered-registration-failed"
            record["ray_coverage"] = None
        view["common_overlap_depth"] = None
    return view


def aggregate(views, labels):
    result = {"views_attempted": len(views),
              "registered_views": sum(v["registration"]["status"] == "registered-estimated-query-pose" for v in views),
              "failed_registration_views": [v["id"] for v in views if v["registration"]["status"] != "registered-estimated-query-pose"],
              "variants": {}}
    for label in labels:
        records = [view["variants"][label] for view in views]
        domain = sum(record["image_domain_pixels"] for record in records)
        hits = sum(record["mesh_hit_pixels"] for record in records)
        refs = sum(record["valid_reference_pixels"] for record in records)
        overlaps = sum(record["overlap_pixels"] for record in records)
        registered_domain = sum(view["variants"][label]["image_domain_pixels"] for view in views
                                if view["registration"]["status"] == "registered-estimated-query-pose")
        good = [r for r in records if r.get("reference_depth_errors") is not None]
        result["variants"][label] = {
            "image_domain_pixels_all_queries": domain, "mesh_hit_pixels_all_queries": hits,
            "effective_registered_view_coverage": hits/domain if domain else 0,
            "coverage_meaning": "pixel-weighted registration yield times render coverage conditional on accepted registration; not geometric coverage of unregistered queries",
            "registered_image_domain_pixels": registered_domain,
            "pixel_weighted_registration_yield": registered_domain/domain if domain else 0,
            "conditional_render_coverage_registered_queries": hits/registered_domain if registered_domain else None,
            "valid_reference_pixels_all_queries": refs, "reference_overlap_pixels": overlaps,
            "missing_mesh_or_pose_at_reference_pixels": refs-overlaps,
            "reference_depth_mae_m_on_registered_overlap": sum(r["reference_depth_errors"]["mae_m_after_global_fit"]*r["overlap_pixels"] for r in good)/overlaps if overlaps else None,
            "mean_abs_relative_error_on_registered_overlap": sum(r["reference_depth_errors"]["mean_abs_relative_error"]*r["overlap_pixels"] for r in good)/overlaps if overlaps else None}
    shared = [view["common_overlap_depth"] for view in views
              if view.get("common_overlap_depth") is not None and view["common_overlap_depth"]["pixels"] > 0]
    shared_pixels = sum(record["pixels"] for record in shared)
    result["common_overlap_depth"] = {
        "pixels": shared_pixels,
        "meaning": "all variants compared on the same registered query/reference pixels",
        "variants": {label: {
            "mae_m": sum(record["variants"][label]["mae_m_after_global_fit"]*record["pixels"] for record in shared)/shared_pixels,
            "mean_abs_relative_error": sum(record["variants"][label]["mean_abs_relative_error"]*record["pixels"] for record in shared)/shared_pixels,
        } if shared_pixels else None for label in labels}}
    return result


def revise_report(report_path, result_path, manifest_path, candidate_dir, depth_dir, output):
    """Labels and fixed-pose common-pixel scores only; never rerun registration."""
    report_bytes, result_bytes, manifest_bytes = report_path.read_bytes(), result_path.read_bytes(), manifest_path.read_bytes()
    report, result, manifest = json.loads(report_bytes), json.loads(result_bytes), json.loads(manifest_bytes)
    if report["analysis_sha256"] != digest(result_bytes) or report["manifest_sha256"] != digest(manifest_bytes):
        raise ValueError("Frozen evaluation inputs changed")
    completion_bytes = (candidate_dir/"report.json").read_bytes()
    if report["completion_report_sha256"] != digest(completion_bytes):
        raise ValueError("Frozen completion metadata changed")
    completion = json.loads(completion_bytes)
    rotation = np.asarray(completion["original_to_candidate_rotation"])
    geometries = {"raw": result["arms"]["A"]["geometry"],
                  "fused": json.loads((candidate_dir/"fused-bounded.json").read_bytes()),
                  "completed": json.loads((candidate_dir/"candidate.json").read_bytes())}
    for label, field in (("fused", "fused_geometry_sha256"), ("completed", "candidate_geometry_sha256")):
        if geometry_hash(geometries[label]) != report[field]:
            raise ValueError("Frozen candidate changed")
    meshes, scenes = {}, {}
    for label, geometry in geometries.items():
        v, c, f = arrays(geometry)
        if label == "raw":
            v = v@rotation.T
        meshes[label] = (v, c, f); scenes[label] = make_scene(v, f)
    queries = {record["id"]: record for record in manifest["heldout"]}
    for view in report["views"]:
        registration_failure_labels(view)
        if view["registration"]["status"] != "registered-estimated-query-pose":
            continue
        record = queries[view["id"]]
        transform = preprocessing((record["width"], record["height"]))
        filename = record["source_filename"]
        if Path(filename).name != filename:
            raise ValueError("Invalid reference filename")
        path = depth_dir/filename
        if view["reference"]["status"] == "loaded":
            reference_bytes = path.read_bytes()
            if digest(reference_bytes) != view["reference"]["sha256"]:
                raise ValueError("Frozen reference depth changed")
            reference, domain = prepare_reference(np.asarray(Image.open(path)),
                                                 record["normalization"]["rotate_clockwise_degrees"], transform)
        else:
            reference, domain = np.zeros((518, 518)), np.zeros((518, 518), bool)
            l, t, r, b = crop_bounds(transform); domain[t:b, l:r] = True
        pose = np.asarray(view["estimated_world_to_camera"])
        camera = {"intrinsics": report["query_intrinsics"],
                  "world_to_camera": np.column_stack([pose[:, :3]@rotation.T, pose[:, 3]]).tolist()}
        depths = {label: render(scenes[label], *mesh, camera, [518, 518])[1] for label, mesh in meshes.items()}
        view["common_overlap_depth"] = common_overlap_metrics(depths, reference, domain, report["frozen_training_scale"])
    report.update(aggregate(report["views"], geometries.keys()))
    report["diagnostic_revision"] = {"version": 2, "original_report_sha256": digest(report_bytes),
                                     "registration_rerun": False, "geometry_modified": False,
                                     "change": "Failure labels and effective coverage semantics; common-pixel depth comparison at exact frozen accepted query poses"}
    report["limitations"].append("Per-variant overlap errors use different pixel sets; use common_overlap_depth for matched-pixel comparisons.")
    with output.open("x", encoding="utf-8") as handle:
        handle.write(json.dumps(report, indent=2, allow_nan=False)+"\n")
    return report


def run(result_path, manifest_path, candidate_dir, depth_dir, scale_report_path, output):
    result_bytes, manifest_bytes = result_path.read_bytes(), manifest_path.read_bytes()
    result, manifest = json.loads(result_bytes), json.loads(manifest_bytes)
    if manifest["dataset"] != "ARKitScenes" or manifest["source_revision"] != REVISION:
        raise ValueError("Unexpected manifest")
    if output.exists():
        raise ValueError("Output exists; frozen evidence cannot be overwritten")
    if len(manifest["heldout"]) != 7:
        raise ValueError("Expected all seven frozen held-out queries")
    originals, queries = manifest["originals"], manifest["heldout"]
    if ({r["sha256"] for r in originals} & {r["sha256"] for r in queries}
            or {r["id"] for r in originals} & {r["id"] for r in queries}):
        raise ValueError("Held-out image overlaps original inputs")
    if result["original_input_hashes"] != [{"id": r["id"], "sha256": r["sha256"]} for r in originals]:
        raise ValueError("Original model input mismatch")
    fields = unpack(result["prediction_fields"])
    report_bytes = (candidate_dir/"report.json").read_bytes()
    completion = json.loads(report_bytes)
    if (completion["numerical_ml_fields"]["result_sha256"] != digest(result_bytes)
            or completion["source_analysis_binding"]["analysis_geometry_sha256"] != result["analysis_geometry_sha256"]):
        raise ValueError("Candidate is not bound to frozen numerical analysis")
    scale_bytes = scale_report_path.read_bytes()
    scale_report = json.loads(scale_bytes)
    if (scale_report["frozen_result_sha256"] != digest(result_bytes)
            or scale_report["frozen_manifest_sha256"] != digest(manifest_bytes)
            or [r["id"] for r in scale_report["reference_files"]] != [r["id"] for r in originals]):
        raise ValueError("Scale was not fitted exclusively to these original views")
    scale = scale_report["global_posthoc_scale_m_per_relative_unit"]
    if not isinstance(scale, (int, float)) or not np.isfinite(scale) or scale <= 0:
        raise ValueError("No valid frozen training-only scale")
    rotation = np.asarray(completion["original_to_candidate_rotation"])
    geometry = {"raw": result["arms"]["A"]["geometry"],
                "fused": json.loads((candidate_dir/"fused-bounded.json").read_bytes()),
                "completed": json.loads((candidate_dir/"candidate.json").read_bytes())}
    for label, key in (("fused", "fused_geometry_sha256"), ("completed", "candidate_geometry_sha256")):
        if geometry_hash(geometry[label]) != completion[key]:
            raise ValueError("Candidate geometry changed after freeze")
    meshes, scenes = {}, {}
    for label, mesh in geometry.items():
        v, c, f = arrays(mesh)
        if label == "raw":
            v = v@rotation.T
        meshes[label] = (v, c, f)
        scenes[label] = make_scene(v, f)
    sift = cv2.SIFT_create(nfeatures=POLICY["sift_max_features"])
    source_features = []
    for i, record in enumerate(originals):
        image = load_source(manifest_path.parent, record)
        xy, descriptor = features(image, result["preprocessing"][i], sift)
        points, valid = anchor_points(xy, fields["depth"][i], fields["selected_valid"][i], result["arms"]["A"]["cameras"][i])
        source_features.append({"descriptors": descriptor, "points": points, "valid": valid})
    k = np.median(np.asarray([c["intrinsics"] for c in result["arms"]["A"]["cameras"]]), axis=0)
    output.mkdir(parents=True)
    # Freeze thresholds, pose assumptions, candidate, scale, and query identities
    # on disk before loading a held-out query or its reference depth.
    frozen_policy = {"policy": POLICY, "sources": SOURCES, "query_intrinsics": k.tolist(),
                     "analysis_sha256": digest(result_bytes), "candidate_geometry_sha256": completion["candidate_geometry_sha256"],
                     "scale_report_sha256": digest(scale_bytes), "training_scale": scale,
                     "script_sha256": digest(Path(__file__).read_bytes()),
                     "heldout": [{"id": r["id"], "sha256": r["sha256"]} for r in queries]}
    policy_bytes = (json.dumps(frozen_policy, indent=2)+"\n").encode()
    (output/"frozen-policy.json").write_bytes(policy_bytes)
    views, rows = [], []
    for index, record in enumerate(queries):
        source = load_source(manifest_path.parent, record)
        transform = preprocessing(source.size)
        xy, descriptor = features(source, transform, sift)
        match_ids, points, source_indices = match_anchors(descriptor, source_features)
        pose, registration = estimate_query_pose(points, xy[match_ids], source_indices, k, transform, 20261020+index)
        # Reference only enters after this query's RGB-only registration finishes.
        filename = record["source_filename"]
        if Path(filename).name != filename:
            raise ValueError("Invalid reference filename")
        reference_path = depth_dir/filename
        if reference_path.exists():
            data = reference_path.read_bytes()
            reference, domain = prepare_reference(np.asarray(Image.open(reference_path)),
                                                   record["normalization"]["rotate_clockwise_degrees"], transform)
            reference_record = {"sha256": digest(data), "status": "loaded"}
        else:
            reference = np.zeros((518, 518))
            domain = np.zeros((518, 518), bool)
            l, t, r, b = crop_bounds(transform); domain[t:b, l:r] = True
            reference_record = {"status": "missing-reference"}
        crop = crop_bounds(transform); l, t, r, b = crop
        source_small = source.resize(tuple(transform["resized_size"]), Image.Resampling.BICUBIC)
        source_rgb = np.zeros((518, 518, 3), np.uint8)
        source_rgb[t:b, l:r] = np.asarray(source_small)
        row = Image.new("RGB", (source_small.width*4, source_small.height+44), "#171b21")
        row.paste(source_small, (0, 44))
        ImageDraw.Draw(row).text((6, 5), record["id"]+" | "+registration["status"], fill="white")
        view = {"id": record["id"], "rgb_sha256": record["sha256"], "registration": registration,
                "reference": reference_record, "variants": {}}
        rendered_depths = {}
        for column, label in enumerate(geometry, start=1):
            if pose is not None:
                camera = {"intrinsics": k.tolist(), "world_to_camera": np.column_stack([pose[:, :3]@rotation.T, pose[:, 3]]).tolist()}
                rgb, depth = render(scenes[label], *meshes[label], camera, [518, 518])
                view["estimated_world_to_camera"] = pose.tolist()
            else:
                rgb = np.full((518, 518, 3), 37, np.uint8)
                depth = np.full((518, 518), np.inf)
            view["variants"][label] = measure_render(depth, rgb, reference, domain, source_rgb, scale)
            rendered_depths[label] = depth
            ImageDraw.Draw(row).text((column*source_small.width+5, 27), label, fill="white")
            row.paste(Image.fromarray(rgb).crop(crop), (column*source_small.width, 44))
            Image.fromarray(rgb).crop(crop).save(output/(record["id"]+"-"+label+".png"))
        view["common_overlap_depth"] = common_overlap_metrics(rendered_depths, reference, domain, scale) if pose is not None else None
        registration_failure_labels(view)
        rows.append(row); views.append(view)
    sheet = Image.new("RGB", (rows[0].width, sum(row.height for row in rows)+58), "#171b21")
    ImageDraw.Draw(sheet).text((7, 6), "HELD-OUT RGB QUERY REGISTRATION | SIFT + PnP using frozen original-view VGGT points\nSource / raw / fused / completed. Query pose and intrinsics are ESTIMATED, not reference cameras.\nAll seven queries retained; reference depth never used to fit query pose or modify candidates.", fill="white")
    offset = 58
    for row in rows:
        sheet.paste(row, (0, offset)); offset += row.height
    sheet.save(output/"heldout-review.jpg", quality=93)
    report = {"version": 1, "status": "estimated-query-registration-diagnostic",
              "policy": POLICY, "sources": SOURCES, "frozen_policy_sha256": digest(policy_bytes),
              "query_intrinsics": k.tolist(), "frozen_training_scale": scale,
              "scale_report_sha256": digest(scale_bytes), "analysis_sha256": digest(result_bytes),
              "manifest_sha256": digest(manifest_bytes), "completion_report_sha256": digest(report_bytes),
              "candidate_geometry_sha256": completion["candidate_geometry_sha256"],
              "fused_geometry_sha256": completion["fused_geometry_sha256"],
              "source_hashes": result["original_input_hashes"], "reference_used_to_register": False,
              "candidate_modified": False, "query_depth_used_to_fit_scale": False,
              "views": views, **aggregate(views, geometry.keys()),
              "limitations": ["Query cameras/intrinsics are estimated from matches, not supplied ground truth.",
                              "Depth errors combine reconstruction, query-registration and intrinsic uncertainty.",
                              "Reference scale was fitted previously on original views only and is not recovered metric scale.",
                              "Texture-poor queries can fail registration; failed queries remain in coverage denominators.",
                              "Full shell ray coverage does not establish recovered unseen geometry.",
                              "These nearby video frames are not independently captured casual photos.",
                              "No candidate parameter was tuned against these held-out views."]}
    (output/"report.json").write_text(json.dumps(report, indent=2, allow_nan=False)+"\n", encoding="utf-8")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("result", "manifest", "candidate-dir", "depth-dir", "scale-report", "output"):
        parser.add_argument("--"+name, type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(run(args.result, args.manifest, args.candidate_dir, args.depth_dir,
                         args.scale_report, args.output), indent=2, allow_nan=False))
