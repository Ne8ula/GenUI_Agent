"""Original-only LoFTR track gates and optional bounded sparse BA.

Every pair, including failures, remains in diagnostics. No reference/held-out
data, model execution, dense mesh modification, or network operation.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time

import cv2
import numpy as np

import learned_matcher as matcher
from refine_arkit_bundle import build_tracks, memory_bytes, project, solve_bundle, support_gate, POLICY as BA_POLICY

POLICY = {
    "fundamental_ransac_pixels_at_matcher_resolution": 1.5, "ransac_iterations": 5000,
    "ransac_confidence": .999, "minimum_pair_inliers": 30, "minimum_inlier_fraction": .35,
    "minimum_hull_fraction_each_image": .04, "grid_width": 4, "minimum_grid_cells_each_image": 4,
    "homography_ransac_pixels": 1.5, "planar_dominance_fraction_of_F_inliers": .9,
    "reject_planar_dominant_pairs": True,
    "model_bidirectional_reprojection_pixels": 8., "model_validity": "frozen upper 75 percent",
    "association_radius_analysis_pixels": 1., "reject_ambiguous_spatial_association": True,
    "seed": 0, "maximum_tracks": 1000,
    "bundle_adjustment": BA_POLICY,
    "association_meaning": "unique proximity heuristic, not cycle-verified feature identity",
    "geometry_gate_meaning": "epipolar/spatial check plus existing ML-depth consistency; not independent ground truth",
}


def analysis_points(points, source_transform, analysis_transform):
    """PIL resize/pad map with the recorded integer-center convention."""
    if (analysis_transform.get("source_size") != source_transform["original_size"]
            or analysis_transform.get("model_size") != [518, 518]
            or analysis_transform.get("pixel_center_convention") != "integer"):
        raise ValueError("Unsupported or mismatched analysis preprocessing")
    scale = np.asarray(analysis_transform["resized_size"], float)/source_transform["original_size"]
    return (np.asarray(points, float)+.5)*scale-.5+analysis_transform["padding_left_top"]


def spatial_support(points, size):
    points = np.asarray(points, dtype=np.float32).reshape(-1, 2)
    if len(points) < 3:
        return {"hull_fraction": 0., "grid_cells": 0, "passed": False}
    area = float(cv2.contourArea(cv2.convexHull(points)))/float(np.prod(size))
    cells = np.floor(points/np.asarray(size)*POLICY["grid_width"]).astype(int)
    cells = np.clip(cells, 0, POLICY["grid_width"]-1)
    n = len(np.unique(cells, axis=0))
    return {"hull_fraction": area, "grid_cells": n,
            "passed": area >= POLICY["minimum_hull_fraction_each_image"]
            and n >= POLICY["minimum_grid_cells_each_image"]}


def pair_gate(points0, points1, sizes):
    """Independent epipolar + distributed-support gate before using ML depth."""
    a, b = np.asarray(points0, float).reshape(-1, 2), np.asarray(points1, float).reshape(-1, 2)
    mask = np.zeros(len(a), bool)
    if len(a) < POLICY["minimum_pair_inliers"]:
        return mask, {"status": "insufficient-matches", "inliers": 0}
    cv2.setRNGSeed(POLICY["seed"])
    matrix, inliers = cv2.findFundamentalMat(a, b, cv2.FM_RANSAC,
        POLICY["fundamental_ransac_pixels_at_matcher_resolution"], POLICY["ransac_confidence"],
        POLICY["ransac_iterations"])
    if matrix is None or inliers is None or np.asarray(matrix).shape != (3, 3) or not np.isfinite(matrix).all():
        return mask, {"status": "epipolar-fit-failed", "inliers": 0}
    mask = inliers.ravel().astype(bool)
    homography, h_inliers = cv2.findHomography(a, b, cv2.RANSAC, POLICY["homography_ransac_pixels"],
        maxIters=POLICY["ransac_iterations"], confidence=POLICY["ransac_confidence"])
    h_mask = (h_inliers.ravel().astype(bool) if homography is not None and h_inliers is not None
              and np.isfinite(homography).all() else np.zeros(len(a), bool))
    overlap_fraction = float((h_mask & mask).sum())/max(int(mask.sum()), 1)
    planar = (int(h_mask.sum()) >= POLICY["minimum_pair_inliers"]
              and overlap_fraction >= POLICY["planar_dominance_fraction_of_F_inliers"])
    supports = [spatial_support(p[mask], size) for p, size in zip((a, b), sizes)]
    count, fraction = int(mask.sum()), float(mask.mean())
    passed = (count >= POLICY["minimum_pair_inliers"] and fraction >= POLICY["minimum_inlier_fraction"]
              and all(x["passed"] for x in supports))
    report = {"status": "supported" if passed else "insufficient-distributed-epipolar-support",
              "inliers": count, "inlier_fraction": fraction, "spatial_support": supports,
              "fundamental_matrix": matrix.tolist(), "homography_inliers": int(h_mask.sum()),
              "homography_fraction_of_F_inliers": overlap_fraction, "planar_dominant": planar}
    if passed and planar and POLICY["reject_planar_dominant_pairs"]:
        passed = False
        report["status"] = "planar-or-rotation-dominant-pair"
    return mask if passed else np.zeros(len(a), bool), report


def associate(points, point, radius=1., bins=None, commit=True):
    """Unique spatial association; never bridge an ambiguous keypoint cluster."""
    cell = tuple(np.floor(point/radius).astype(int))
    indices = (range(len(points)) if bins is None else
               [i for dx in (-1, 0, 1) for dy in (-1, 0, 1)
                for i in bins.get((cell[0]+dx, cell[1]+dy), [])])
    candidates = [i for i in indices if np.linalg.norm(points[i]-point) <= radius]
    if len(candidates) > 1:
        return None
    if candidates:
        return candidates[0]
    if not commit:
        return len(points)
    points.append(np.array(point, float))
    if bins is not None:
        bins.setdefault(cell, []).append(len(points)-1)
    return len(points)-1


def assemble(artifact, analysis):
    from prediction_fields import unpack
    fields = unpack(analysis["prediction_fields"])
    cameras, preprocessing = analysis["arms"]["A"]["cameras"], analysis["preprocessing"]
    observations = [[] for _ in cameras]
    spatial_bins = [{} for _ in cameras]
    candidates, pair_reports = [], []
    for pair in artifact["pairs"]:
        i, j = pair["image0"], pair["image1"]
        original = [np.asarray(pair[key], float).reshape(-1, 2) for key in ("points0", "points1")]
        sizes = [artifact["preprocessing"][frame]["resized_size"] for frame in (i, j)]
        scaled = [(p+.5)*artifact["preprocessing"][frame]["scale_xy"]-.5
                  for p, frame in zip(original, (i, j))]
        mask, report = pair_gate(*scaled, sizes)
        report.update(image0=i, image1=j, retained_matches=pair["retained_match_count"])
        pair_reports.append(report)
        if not mask.any():
            report["model_supported_matches"] = 0
            continue
        # VGGT preprocessing maps the original pixels with its recorded resize/pad convention.
        xy = [analysis_points(p, artifact["preprocessing"][frame], preprocessing[frame])
              for p, frame in zip(original, (i, j))]
        world, valid = [], mask.copy()
        for points, frame in zip(xy, (i, j)):
            pixels = np.rint(points).astype(int)
            inside = (pixels >= 0).all(axis=1) & (pixels < 518).all(axis=1)
            pixels = pixels.clip(0, 517)
            valid &= inside & fields["selected_valid"][frame, pixels[:, 1], pixels[:, 0]].astype(bool)
            depth = fields["depth"][frame, pixels[:, 1], pixels[:, 0]]
            k, pose = np.asarray(cameras[frame]["intrinsics"]), np.asarray(cameras[frame]["world_to_camera"])
            rays = np.column_stack([points, np.ones(len(points))])@np.linalg.inv(k).T
            world.append((rays*depth[:, None]-pose[:, 3])@pose[:, :3])
        projected0, z0 = project(world[1], cameras[i])
        projected1, z1 = project(world[0], cameras[j])
        valid &= ((z0 > 0) & (z1 > 0)
                  & (np.linalg.norm(projected0-xy[0], axis=1) <= POLICY["model_bidirectional_reprojection_pixels"])
                  & (np.linalg.norm(projected1-xy[1], axis=1) <= POLICY["model_bidirectional_reprojection_pixels"]))
        supports = [spatial_support(p[valid], size) for p, size in zip(scaled, sizes)]
        report.update(model_supported_matches=int(valid.sum()), model_spatial_support=supports)
        if valid.sum() < POLICY["minimum_pair_inliers"] or not all(x["passed"] for x in supports):
            report["status"] = "insufficient-distributed-model-support"
            continue
        for k in np.flatnonzero(valid):
            candidates.append((float(pair["scores"][k]), i, j, xy[0][k], xy[1][k]))
    edges, ambiguous = [], 0
    for score, i, j, a, b in sorted(candidates, key=lambda item: -item[0]):
        ia = associate(observations[i], a, POLICY["association_radius_analysis_pixels"], spatial_bins[i], False)
        ib = associate(observations[j], b, POLICY["association_radius_analysis_pixels"], spatial_bins[j], False)
        if ia is None or ib is None:
            ambiguous += 1
            continue
        ia = associate(observations[i], a, POLICY["association_radius_analysis_pixels"], spatial_bins[i])
        ib = associate(observations[j], b, POLICY["association_radius_analysis_pixels"], spatial_bins[j])
        edges.append((1-score, (i, ia), (j, ib)))
    tracks = build_tracks(edges)[:POLICY["maximum_tracks"]]
    points, obs = [], []
    for index, track in enumerate(tracks):
        anchors = []
        for frame, key in track:
            xy = observations[frame][key]
            pixel = np.rint(xy).astype(int).clip(0, 517)
            depth = fields["depth"][frame, pixel[1], pixel[0]]
            k, pose = np.asarray(cameras[frame]["intrinsics"]), np.asarray(cameras[frame]["world_to_camera"])
            anchors.append((np.r_[xy, 1.]@np.linalg.inv(k).T*depth-pose[:, 3])@pose[:, :3])
            obs.append((frame, index, xy.tolist()))
        points.append(np.median(anchors, axis=0))
    return tracks, np.asarray(points).reshape(-1, 3), obs, pair_reports, ambiguous


def run(matches_path, analysis_path, request_path, output):
    from review_result import validate_files
    from pilot import load_json
    if output.exists():
        raise ValueError("Refusing to overwrite learned-track attempt")
    analysis, request = validate_files(analysis_path, request_path)
    response, raw = load_json(matches_path, matcher.POLICY["maximum_output_bytes"]+100000)
    artifact = matcher.validate_result(response["artifact"], request)
    frozen = {"policy": POLICY, "matches_sha256": matcher.digest(raw),
              "analysis_sha256": matcher.digest(analysis_path.read_bytes()),
              "request_sha256": matcher.digest(request_path.read_bytes()),
              "implementation_sha256": matcher.digest(Path(__file__).read_bytes()),
              "bundle_implementation_sha256": matcher.digest(Path(__file__).with_name("refine_arkit_bundle.py").read_bytes()),
              "original_input_hashes": artifact["original_input_hashes"],
              "uses_reference_or_heldout": False}
    output.mkdir(parents=True)
    (output/"frozen-policy.json").write_text(json.dumps(frozen, indent=2)+"\n")
    tracks, points, observations, pairs, ambiguous = assemble(artifact, analysis)
    gate = support_gate(tracks, len(analysis["arms"]["A"]["cameras"]))
    report = {**frozen, "connectivity": gate, "pairs": pairs, "ambiguous_associations": ambiguous,
              "status": "not-run-insufficient-track-support", "bundle_adjustment_executed": False,
              "selected_candidate_modified": False, "dense_geometry_modified": False}
    if gate["passed"]:
        reserved = sum(index % 5 == 0 and len(track) >= 3 for index, track in enumerate(tracks))
        report["reserved_original_observations"] = reserved
        if reserved < BA_POLICY["minimum_reserved_observations"]:
            report["status"] = "not-run-insufficient-reserved-original-observations"
        else:
            refinement = solve_bundle(analysis["arms"]["A"]["cameras"], points, observations)
            report.update(status=refinement["status"], bundle_adjustment_executed=True, refinement=refinement)
    (output/"report.json").write_text(json.dumps(report, indent=2, allow_nan=False)+"\n")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("matches", "analysis", "request", "output"):
        parser.add_argument("--"+name, type=Path, required=True)
    parser.add_argument("--_worker", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args._worker:
        result = run(args.matches, args.analysis, args.request, args.output)
        print(json.dumps({"status": result["status"], "connectivity": result["connectivity"]}))
    else:
        command = [sys.executable, str(Path(__file__).resolve()), "--_worker"]
        for name in ("matches", "analysis", "request", "output"):
            command += ["--"+name, str(getattr(args, name))]
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
            env=dict(os.environ, OPENBLAS_NUM_THREADS="2", OMP_NUM_THREADS="2", MKL_NUM_THREADS="2"),
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        start, peak = time.monotonic(), 0
        try:
            while process.poll() is None:
                peak = max(peak, memory_bytes(process))
                if peak > BA_POLICY["rss_bytes"] or time.monotonic()-start > BA_POLICY["wallclock_seconds"]:
                    raise TimeoutError("CPU learned-track refinement resource bound exceeded")
                time.sleep(.1)
            stdout, stderr = process.communicate()
            if process.returncode:
                raise RuntimeError("Learned-track worker failed: "+stderr[-1000:])
            print(stdout.strip())
            resources = {"peak_worker_tree_memory_bytes": peak, "elapsed_seconds": time.monotonic()-start}
            (args.output/"resource-report.json").write_text(json.dumps(resources, indent=2)+"\n")
            print(json.dumps(resources))
        finally:
            if process.poll() is None:
                if os.name == "nt":
                    subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                        creationflags=subprocess.CREATE_NO_WINDOW, timeout=10)
                process.kill(); process.wait()
