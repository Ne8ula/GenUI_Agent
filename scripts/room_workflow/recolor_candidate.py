"""Separate original-photo appearance candidate; geometry and provenance stay fixed."""
import argparse
import base64
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import time

import numpy as np
from PIL import Image, ImageDraw, ImageOps

from complete_candidate import arrays, checked_fields, geometry_hash, write_mesh
from review_result import camera_rays, crop_bounds, make_scene, source_image, validate_files

POLICY = {
    "wallclock_seconds": 120, "memory_bytes": 2*1024**3,
    "minimum_absolute_facing_cosine": .2, "depth_tolerance_voxels": 3.,
    "depth_tolerance_fraction": .02, "visibility_tolerance_voxels": 1.5,
    "selection": "one best-facing projected pixel footprint; no cross-view averaging",
    "occlusion_geometry": "photo-estimated triangles only; authored shell cannot veto source support",
    "color_sampling": "bilinear original RGB; integer centers and inverse PIL half-pixel resize/pad",
    "eligible_geometry": "vertices used only by photo-estimated triangles",
    "unknown": "preserve existing color; source index -1",
}


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def rotated_camera(camera, rotation):
    result = copy.deepcopy(camera)
    pose = np.asarray(camera["world_to_camera"], float).copy()
    pose[:, :3] = pose[:, :3] @ np.asarray(rotation).T
    result["world_to_camera"] = pose.tolist()
    result["center"] = (-pose[:, :3].T @ pose[:, 3]).tolist()
    return result


def original_pixels(canvas_points, transform):
    crop_bounds(transform)
    scale = np.asarray(transform["resized_size"], float)/transform["source_size"]
    return (np.asarray(canvas_points)-transform["padding_left_top"]+.5)/scale-.5


def bilinear(image, points):
    """Caller checks original image bounds; this helper clips only edge neighbors."""
    xy = np.asarray(points, float)
    if (not np.isfinite(xy).all() or np.any(xy < 0)
            or np.any(xy > np.array([image.shape[1]-1, image.shape[0]-1]))):
        raise ValueError("Color sample is outside source pixels")
    lower = np.floor(xy).astype(int)
    upper = np.minimum(lower+1, [image.shape[1]-1, image.shape[0]-1])
    amount = xy-lower
    a = image[lower[:, 1], lower[:, 0]]*(1-amount[:, :1]) + image[lower[:, 1], upper[:, 0]]*amount[:, :1]
    b = image[upper[:, 1], lower[:, 0]]*(1-amount[:, :1]) + image[upper[:, 1], upper[:, 0]]*amount[:, :1]
    return (a*(1-amount[:, 1:])+b*amount[:, 1:])/255.


def eligible_vertices(mesh):
    faces = np.asarray(mesh["indices"], int).reshape(-1, 3)
    provenance = np.asarray(mesh["provenance"])
    if len(provenance) != len(faces):
        raise ValueError("Per-face provenance length differs")
    selected = np.zeros(len(mesh["positions"])//3, bool)
    selected[faces[provenance == "photo-estimated"].ravel()] = True
    selected[faces[provenance != "photo-estimated"].ravel()] = False
    return selected


def color_only_copy(mesh, colors):
    colors = np.asarray(colors)
    if colors.shape != (len(mesh["positions"])//3, 3) or not np.isfinite(colors).all() or np.any((colors < 0) | (colors > 1)):
        raise ValueError("Invalid recoloring array")
    result = copy.deepcopy(mesh)
    result["colors"] = colors.ravel().tolist()
    if any(result[key] != value for key, value in mesh.items() if key != "colors"):
        raise ValueError("Appearance experiment changed non-color data")
    return result


def source_gate(z, predicted, visible_depth, facing, valid, voxel):
    tolerance = np.maximum(POLICY["depth_tolerance_voxels"]*voxel,
                           POLICY["depth_tolerance_fraction"]*np.abs(predicted))
    return (valid & np.isfinite(z) & np.isfinite(predicted) & np.isfinite(visible_depth)
            & (z > 0) & (predicted > 0)
            & (np.abs(z-predicted) <= tolerance)
            & (np.abs(z-visible_depth) <= POLICY["visibility_tolerance_voxels"]*voxel)
            & (facing >= POLICY["minimum_absolute_facing_cosine"]))


def raster_pair(scene, vertices, before, after, faces, photo_faces, camera):
    import open3d as o3d
    hits = scene.cast_rays(o3d.core.Tensor(camera_rays(camera, [518, 518])))
    depth = hits["t_hit"].numpy()
    valid = np.isfinite(depth)
    ids = hits["primitive_ids"].numpy()[valid].astype(int)
    uv = hits["primitive_uvs"].numpy()[valid]
    weights = np.column_stack([1-uv.sum(1), uv])
    outputs = []
    for colors in (before, after):
        rgb = np.full((518, 518, 3), [36, 39, 44], np.uint8)
        rgb[valid] = np.rint(255*(colors[faces[ids]]*weights[..., None]).sum(1)).clip(0, 255).astype(np.uint8)
        outputs.append(rgb)
    mask = np.zeros((518, 518), bool)
    mask[valid] = photo_faces[ids]
    return outputs, mask


def run(candidate_dir, analysis_path, fields_path, request_path, output):
    import open3d as o3d
    started = time.monotonic()
    if output.exists():
        raise ValueError("Choose a fresh appearance output directory")
    analysis, request = validate_files(analysis_path, request_path)
    supplemental, _ = validate_files(fields_path, request_path)
    fields, _ = checked_fields(analysis, supplemental)
    candidate_path, report_path = candidate_dir/"candidate.json", candidate_dir/"report.json"
    mesh = json.loads(candidate_path.read_text())
    previous = json.loads(report_path.read_text())
    if (previous["candidate_geometry_sha256"] != geometry_hash(mesh)
            or previous["input_result_sha256"] != digest(analysis_path)
            or previous["input_request_sha256"] != digest(request_path)
            or previous["source_analysis_binding"] != analysis["analysis_binding"]
            or previous["numerical_ml_fields"]["result_sha256"] != digest(fields_path)):
        raise ValueError("Candidate analysis/source binding differs")
    rotation = np.asarray(previous["original_to_candidate_rotation"], float)
    if rotation.shape != (3, 3) or not np.allclose(rotation @ rotation.T, np.eye(3), atol=1e-6) or not np.isclose(np.linalg.det(rotation), 1):
        raise ValueError("Unsupported candidate rotation")
    vertices, before, faces = arrays(mesh)
    eligible = eligible_vertices(mesh)
    photo_faces = np.asarray(mesh["provenance"]) == "photo-estimated"
    normals = np.asarray(mesh["normals"], float).reshape(-1, 3)
    normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-12)
    observed_scene = make_scene(vertices, faces[photo_faces])
    scene = make_scene(vertices, faces)
    after, chosen, best = before.copy(), np.full(len(vertices), -1, np.int16), np.full(len(vertices), -1., float)
    cameras = [rotated_camera(c, rotation) for c in analysis["arms"]["A"]["cameras"]]
    voxel = previous["voxel_relative"]
    frozen = {"policy": POLICY, "candidate_sha256": digest(candidate_path), "candidate_report_sha256": digest(report_path),
              "analysis_sha256": digest(analysis_path), "fields_sha256": digest(fields_path), "request_sha256": digest(request_path),
              "script_sha256": digest(__file__), "source_inputs": analysis["original_input_hashes"],
              "uses_heldout_or_reference": False, "geometry_modified": False, "promotion": "not promoted"}
    output.mkdir(parents=True)
    (output/"frozen-policy.json").write_text(json.dumps(frozen, indent=2))
    eligibility_counts = []
    for index, (record, camera, transform) in enumerate(zip(request["images"], cameras, analysis["preprocessing"])):
        data = base64.b64decode(record["data_base64"], validate=True)
        if hashlib.sha256(data).hexdigest() != record["sha256"]:
            raise ValueError("Source RGB hash mismatch")
        image = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
        if list(image.size) != transform["source_size"]:
            raise ValueError("Source orientation/size differs")
        rgb = np.asarray(image, dtype=float)
        pose, intrinsic = np.asarray(camera["world_to_camera"]), np.asarray(camera["intrinsics"])
        local = vertices @ pose[:, :3].T + pose[:, 3]
        z = local[:, 2]
        projected = local @ intrinsic.T
        xy = projected[:, :2] / np.maximum(z[:, None], 1e-12)
        points = original_pixels(xy, transform)
        safe = (eligible & (z > 1e-6) & (points >= 0).all(1)
                & (points <= np.asarray(image.size)-1).all(1))
        ids = np.flatnonzero(safe)
        pixels = np.rint(xy[ids]).astype(int)
        if np.any(pixels < 0) or np.any(pixels >= 518):
            raise ValueError("Valid source projected outside model canvas")
        to_surface = vertices[ids] - camera["center"]
        facing = np.abs((normals[ids]*to_surface).sum(1))/np.maximum(np.linalg.norm(to_surface, axis=1), 1e-12)
        rays = np.column_stack([np.broadcast_to(camera["center"], (len(ids), 3)), to_surface/z[ids, None]]).astype(np.float32)
        seen = observed_scene.cast_rays(o3d.core.Tensor(rays))["t_hit"].numpy()
        predicted = fields["depth"][index, pixels[:, 1], pixels[:, 0]]
        valid = fields["image_valid"][index, pixels[:, 1], pixels[:, 0]].astype(bool)
        good = source_gate(z[ids], predicted, seen, facing, valid, voxel)
        score = facing**2*intrinsic[0, 0]*intrinsic[1, 1]/np.maximum(z[ids]**2, 1e-12)
        selected = good & (score > best[ids])
        change = ids[selected]
        after[change] = bilinear(rgb, points[change])
        chosen[change], best[change] = index, score[selected]
        eligibility_counts.append(int(good.sum()))
    candidate = color_only_copy(mesh, after)
    (output/"candidate.json").write_text(json.dumps(candidate, separators=(",", ":")))
    write_mesh(output/"candidate.ply", candidate)
    np.savez_compressed(output/"color-attribution.npz", original_colors=before,
                        recolored_colors=after, source_view_index=chosen, selection_score=best)
    rows, metrics = [], []
    for index, (record, camera, transform) in enumerate(zip(request["images"], cameras, analysis["preprocessing"])):
        (old_rgb, new_rgb), photo_mask = raster_pair(scene, vertices, before, after, faces, photo_faces, camera)
        l, t, r, b = crop_bounds(transform)
        source = np.asarray(source_image(record, transform))
        mask = photo_mask[t:b, l:r]
        old, new = old_rgb[t:b, l:r], new_rgb[t:b, l:r]
        old_error, new_error = np.abs(old.astype(float)-source).mean(2), np.abs(new.astype(float)-source).mean(2)
        metrics.append({"image_id": record["id"], "crop_pixels": int(mask.size), "matched_photo_pixels": int(mask.sum()),
                        "before_rgb_mae_0_255": float(old_error[mask].mean()) if mask.any() else None,
                        "after_rgb_mae_0_255": float(new_error[mask].mean()) if mask.any() else None})
        row = Image.new("RGB", (588, 283), "#182020")
        draw = ImageDraw.Draw(row)
        draw.text((4, 4), f"{index:02d} Original / before / source-projected color", fill="white")
        for col, array in enumerate((source, old, new)):
            image = Image.fromarray(array)
            image.thumbnail((196, 259))
            row.paste(image, (col*196, 24))
        rows.append(row)
        Image.fromarray(new).save(output/f"source-{index:02d}-after.png")
    sheet = Image.new("RGB", (1176, 4*283+30), "#182020")
    ImageDraw.Draw(sheet).text((8, 7), "Same geometry/provenance | source-view diagnostic only | authored shell colors preserved", fill="white")
    for i, row in enumerate(rows):
        sheet.paste(row, ((i % 2)*588, 30+(i//2)*283))
    sheet.save(output/"contact-sheet.jpg", quality=93)
    denominator = sum(m["matched_photo_pixels"] for m in metrics)
    report = {**frozen, "status": "appearance-candidate-pending-review",
              "candidate_geometry_sha256": geometry_hash(candidate), "vertex_count": len(vertices),
              "eligible_photo_vertices": int(eligible.sum()), "recolored_vertices": int((chosen >= 0).sum()),
              "unchanged_unknown_or_authored_vertices": int((chosen < 0).sum()),
              "eligible_vertices_per_view": eligibility_counts,
              "selected_vertices_per_view": [int((chosen == i).sum()) for i in range(len(cameras))],
              "unchanged_noncolor_fields": all(candidate[k] == mesh[k] for k in mesh if k != "colors"),
              "matched_photo_pixels_all_views": denominator, "per_view": metrics,
              "before_rgb_mae_0_255": sum(m["before_rgb_mae_0_255"]*m["matched_photo_pixels"] for m in metrics if m["matched_photo_pixels"])/denominator if denominator else None,
              "after_rgb_mae_0_255": sum(m["after_rgb_mae_0_255"]*m["matched_photo_pixels"] for m in metrics if m["matched_photo_pixels"])/denominator if denominator else None,
              "elapsed_seconds": time.monotonic()-started,
              "limitations": ["In-sample RGB agreement only; no held-out or geometric accuracy claim.",
                             "Estimated camera/depth errors can misplace projected colors.",
                             "Single-source selection can introduce seams and cannot recover detail finer than existing vertices.",
                             "Visibility uses photo geometry only; authored shell is excluded from support and color changes.",
                             "Absolute normal-facing score accommodates inconsistent mesh winding; it does not prove physical surface orientation.",
                             "No source texture atlas, invented detail, new geometry, depth, pose or provenance."]}
    (output/"report.json").write_text(json.dumps(report, indent=2))
    print(json.dumps({k: report[k] for k in ("recolored_vertices", "before_rgb_mae_0_255", "after_rgb_mae_0_255", "elapsed_seconds")}), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("candidate", "analysis", "fields", "request", "output"):
        parser.add_argument("--"+name, type=Path, required=True)
    parser.add_argument("--_worker", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args._worker:
        run(args.candidate, args.analysis, args.fields, args.request, args.output)
    else:
        from refine_arkit_bundle import memory_bytes
        command = [sys.executable, str(Path(__file__).resolve()), "--_worker"]
        for name in ("candidate", "analysis", "fields", "request", "output"):
            command += ["--"+name, str(getattr(args, name))]
        child = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                 env=dict(os.environ, OMP_NUM_THREADS="2", OPENBLAS_NUM_THREADS="2"),
                                 creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        started, peak = time.monotonic(), 0
        try:
            while child.poll() is None:
                peak = max(peak, memory_bytes(child))
                if time.monotonic()-started > POLICY["wallclock_seconds"] or peak > POLICY["memory_bytes"]:
                    raise TimeoutError("Appearance experiment resource bound reached")
                time.sleep(.1)
            stdout, stderr = child.communicate()
            if child.returncode:
                raise RuntimeError(stderr[-1500:])
            print(stdout.strip())
            (args.output/"resource-report.json").write_text(json.dumps({"peak_worker_tree_bytes": peak,
                "elapsed_seconds": time.monotonic()-started}, indent=2))
        finally:
            if child.poll() is None:
                if os.name == "nt":
                    subprocess.run(["taskkill", "/PID", str(child.pid), "/T", "/F"], capture_output=True,
                                   creationflags=subprocess.CREATE_NO_WINDOW, timeout=10)
                child.kill()
                child.wait()
