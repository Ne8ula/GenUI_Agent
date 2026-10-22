"""Conservative inferred colors for existing authored room planes.

No geometry completion, texture generation, source-photo recoloring or model
execution. Missing/distributed-support failures retain the exact fallback.
"""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

import numpy as np

POLICY = {
    "plane_distance_relative": .045, "normal_angle_degrees": 15,
    "wall_height_fraction": [.55, .95], "minimum_faces": 40, "grid_width": 4,
    "minimum_wall_cells": 4, "minimum_horizontal_cells": 6,
    "minimum_wall_spans": [.25, .15], "minimum_horizontal_spans": [.35, .35],
    "minimum_projected_area_fraction": .01,
    "color_outlier_distance_floor": .06, "color_mad_multiplier": 2.5,
    "maximum_final_color_mad": .10, "wallclock_seconds": 120, "memory_bytes": 2*1024**3,
    "meaning": "inferred appearance on authored closures; not measured material or guaranteed furniture exclusion",
}


def weighted_median(values, weights):
    values, weights = np.asarray(values), np.asarray(weights)
    if len(values) == 0 or not np.isfinite(values).all() or not np.isfinite(weights).all() or np.any(weights <= 0):
        raise ValueError("Invalid robust material samples")
    if values.ndim == 2:
        return np.array([weighted_median(values[:, i], weights) for i in range(values.shape[1])])
    order = np.argsort(values, kind="stable")
    return values[order[np.searchsorted(np.cumsum(weights[order]), weights.sum()*.5)]]


def support(points, areas, minimum, extent, wall):
    uv = (points-minimum)/extent
    cells = np.floor(uv*POLICY["grid_width"]).astype(int).clip(0, POLICY["grid_width"]-1)
    occupied = len(np.unique(cells, axis=0)) if len(points) else 0
    spans = np.ptp(uv, axis=0) if len(points) else np.zeros(2)
    area_fraction = float(areas.sum()/np.prod(extent))
    enough = (len(points) >= POLICY["minimum_faces"]
              and occupied >= POLICY["minimum_wall_cells" if wall else "minimum_horizontal_cells"]
              and np.all(spans >= POLICY["minimum_wall_spans" if wall else "minimum_horizontal_spans"])
              and area_fraction >= POLICY["minimum_projected_area_fraction"])
    return {"faces": len(points), "occupied_cells": occupied, "normalized_spans": spans.tolist(),
            "projected_area_fraction": area_fraction, "passed": bool(enough)}


def apply_plane_colors(mesh, plans):
    """Only authored colors change; shared vertices are copied at identical xyz."""
    out = copy.deepcopy(mesh)
    vertices = np.asarray(out["positions"], float).reshape(-1, 3).tolist()
    colors = np.asarray(out["colors"], float).reshape(-1, 3).tolist()
    normal_values = np.asarray(out["normals"], float).reshape(-1, 3).tolist() if "normals" in out else None
    faces = np.asarray(out["indices"], int).reshape(-1, 3)
    original_faces = faces.copy()
    provenance = np.asarray(out["provenance"])
    duplicates = 0
    for plan in plans:
        if plan["status"] != "inferred":
            continue
        ids = np.asarray(plan["face_indices"], int)
        if np.any(provenance[ids] != "authored-room-shell"):
            raise ValueError("Material update attempted to change photo-derived faces")
        group_vertices = np.unique(faces[ids])
        other_faces = np.ones(len(faces), bool); other_faces[ids] = False
        other_vertices = set(faces[other_faces].ravel())
        for vertex in group_vertices:
            target = int(vertex)
            if vertex in other_vertices:
                target = len(vertices)
                vertices.append(vertices[vertex].copy()); colors.append(colors[vertex].copy())
                if normal_values is not None:
                    normal_values.append(normal_values[vertex].copy())
                local = faces[ids].copy(); local[local == vertex] = target; faces[ids] = local
                duplicates += 1
            colors[target] = list(plan["inferred_rgb"])
    out["positions"] = np.asarray(vertices).ravel().tolist()
    out["colors"] = np.asarray(colors).ravel().tolist()
    out["indices"] = faces.ravel().tolist()
    if normal_values is not None:
        out["normals"] = np.asarray(normal_values).ravel().tolist()
    old_vertices = np.asarray(mesh["positions"]).reshape(-1, 3)
    if not np.array_equal(np.asarray(vertices)[faces], old_vertices[original_faces]):
        raise AssertionError("Material pass changed physical triangles")
    photo = provenance == "photo-estimated"
    if (not np.array_equal(faces[photo], original_faces[photo])
            or not np.array_equal(np.asarray(colors)[faces[photo]],
                                  np.asarray(mesh["colors"]).reshape(-1, 3)[original_faces[photo]])):
        raise AssertionError("Material pass changed photo-derived colors or indices")
    return out, duplicates


def infer_materials(mesh, boundary):
    vertices = np.asarray(mesh["positions"], float).reshape(-1, 3)
    colors = np.asarray(mesh["colors"], float).reshape(-1, 3)
    faces = np.asarray(mesh["indices"], int).reshape(-1, 3)
    tri = vertices[faces]
    cross = np.cross(tri[:, 1]-tri[:, 0], tri[:, 2]-tri[:, 0])
    lengths = np.linalg.norm(cross, axis=1)
    normals = cross/np.maximum(lengths[:, None], 1e-15)
    area, centers, rgb = lengths*.5, tri.mean(1), colors[faces].mean(1)
    source = np.asarray(mesh["provenance"]) == "photo-estimated"
    authored = np.flatnonzero(np.asarray(mesh["provenance"]) == "authored-room-shell")
    groups = {}
    for index in authored:
        axis = int(np.argmax(np.abs(normals[index])))
        if abs(normals[index, axis]) < .999:
            raise ValueError("This experiment supports axis-aligned fitted room planes only")
        key = (axis, round(float(centers[index, axis]), 7))
        groups.setdefault(key, []).append(int(index))
    plans = []
    height = boundary["ceiling"]-boundary["floor"]
    for (axis, coordinate), face_ids in sorted(groups.items()):
        wall = axis != 2
        axes = ([1-axis, 2] if wall else [0, 1])
        plane_vertices = tri[face_ids].reshape(-1, 3)
        minimum, maximum = plane_vertices[:, axes].min(0), plane_vertices[:, axes].max(0)
        extent = maximum-minimum
        near = np.max(np.abs(tri[:, :, axis]-coordinate), axis=1) <= POLICY["plane_distance_relative"]
        aligned = np.abs(normals[:, axis]) >= np.cos(np.deg2rad(POLICY["normal_angle_degrees"]))
        valid = source & near & aligned & (area > 1e-12)
        if wall:
            valid &= ((centers[:, 2] >= boundary["floor"]+POLICY["wall_height_fraction"][0]*height)
                      & (centers[:, 2] <= boundary["floor"]+POLICY["wall_height_fraction"][1]*height))
        selected = np.flatnonzero(valid)
        info = support(centers[selected][:, axes], area[selected]*np.abs(normals[selected, axis]),
                       minimum, extent, wall)
        label = ("floor" if abs(coordinate-boundary["floor"]) < 1e-6 else "ceiling") if axis == 2 else f"wall-axis{axis}-{coordinate:.4f}"
        plan = {"plane": label, "axis": axis, "coordinate": coordinate, "face_indices": face_ids,
                "status": "unknown-fallback", "reason": "insufficient-distributed-nearby-surface-support",
                "support_before_color_filter": info, "fallback_rgb": colors[faces[face_ids[0], 0]].tolist(),
                "source_vertex_attribution": "nearby photo-estimated TSDF faces; not unique original-view attribution"}
        if info["passed"]:
            median = weighted_median(rgb[selected], area[selected])
            distance = np.linalg.norm(rgb[selected]-median, axis=1)
            mad = float(weighted_median(distance, area[selected]))
            threshold = max(POLICY["color_outlier_distance_floor"], POLICY["color_mad_multiplier"]*mad)
            kept = selected[distance <= threshold]
            final_support = support(centers[kept][:, axes], area[kept]*np.abs(normals[kept, axis]),
                                    minimum, extent, wall)
            final_rgb = weighted_median(rgb[kept], area[kept])
            final_mad = float(weighted_median(np.linalg.norm(rgb[kept]-final_rgb, axis=1), area[kept]))
            plan.update(support_after_color_filter=final_support, color_mad=final_mad,
                        color_outlier_threshold=threshold)
            if final_support["passed"] and final_mad <= POLICY["maximum_final_color_mad"]:
                plan.update(status="inferred", reason="distributed-near-plane-support-and-robust-color",
                            inferred_rgb=final_rgb.tolist(),
                            supporting_face_indices=kept.tolist())
            else:
                plan["reason"] = "color-support-distribution-or-consistency-failed"
        plans.append(plan)
    updated, duplicates = apply_plane_colors(mesh, plans)
    return updated, plans, duplicates


def run(folder, result_path, request_path, output):
    import open3d as o3d
    from PIL import Image, ImageDraw
    from complete_candidate import arrays, geometry_hash, write_mesh
    from review_result import validate_files, make_scene, render, source_image, crop_bounds
    if output.exists():
        raise ValueError("Refusing to overwrite appearance variant")
    result, request = validate_files(result_path, request_path)
    source_report = json.loads((folder/"report.json").read_text())
    original = json.loads((folder/"candidate.json").read_text())
    if geometry_hash(original) != source_report["candidate_geometry_sha256"]:
        raise ValueError("Candidate geometry binding mismatch")
    for path, key in ((result_path, "input_result_sha256"), (request_path, "input_request_sha256")):
        if hashlib.sha256(path.read_bytes()).hexdigest() != source_report[key]:
            raise ValueError("Candidate/source binding mismatch")
    output.mkdir(parents=True)
    (output/"frozen-policy.json").write_text(json.dumps({
        "policy": POLICY, "source_candidate_sha256": geometry_hash(original),
        "source_report_sha256": hashlib.sha256((folder/"report.json").read_bytes()).hexdigest(),
        "implementation_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}, indent=2)+"\n")
    updated, plans, duplicates = infer_materials(original, source_report["boundary"])
    updated["appearance"] = {"policy": "robust-source-derived-plane-colors",
        "meaning": POLICY["meaning"], "unknown_planes": [p["plane"] for p in plans if p["status"] != "inferred"]}
    write_mesh(output/"candidate.ply", updated)
    (output/"candidate.json").write_text(json.dumps(updated, separators=(",", ":")))
    v, before, f = arrays(original); _, after, _ = arrays(updated)
    scene = make_scene(v, f)
    basis = np.asarray(source_report["original_to_candidate_rotation"])
    rows, diagnostics = [], []
    for index, (record, camera, transform) in enumerate(zip(request["images"], result["arms"]["A"]["cameras"], result["preprocessing"])):
        camera = copy.deepcopy(camera)
        pose = np.asarray(camera["world_to_camera"]); pose[:, :3] = pose[:, :3]@basis.T
        camera["world_to_camera"] = pose.tolist()
        old_rgb, old_depth = render(scene, v, before, f, camera, transform["model_size"])
        # Existing VGA candidate has no shared plane/photo vertices. Generic
        # topology duplication is handled by a separate scene if ever needed.
        av, ac, af = arrays(updated)
        after_scene = scene if duplicates == 0 else make_scene(av, af)
        new_rgb, new_depth = render(after_scene, av, ac, af, camera, transform["model_size"])
        if not np.array_equal(old_depth, new_depth):
            raise AssertionError("Appearance pass changed ray geometry")
        crop = crop_bounds(transform); source = source_image(record, transform)
        old, new = Image.fromarray(old_rgb).crop(crop), Image.fromarray(new_rgb).crop(crop)
        row = Image.new("RGB", (source.width*3, source.height+28), "#171b21")
        for column, image in enumerate((source, old, new)):
            row.paste(image, (column*source.width, 28))
        ImageDraw.Draw(row).text((6, 7), f"Source {index} | photograph / unchanged geometry, old fallback / inferred plane color", fill="white")
        rows.append(row)
        new.save(output/(record["id"]+"-material.png"))
        changed = np.any(np.asarray(old) != np.asarray(new), axis=2)
        diagnostics.append({"image_id": record["id"], "changed_pixel_fraction": float(changed.mean()),
                            "identical_depth": True, "meaning": "appearance change only, not improved geometry"})
    sheet = Image.new("RGB", (rows[0].width, sum(row.height for row in rows)+42), "#171b21")
    ImageDraw.Draw(sheet).text((6, 5), "Material-only candidate: inferred appearance on authored closures\nPhoto-derived faces, all physical triangles and boundary unchanged; unsupported planes retain fallback.", fill="white")
    y = 42
    for row in rows:
        sheet.paste(row, (0, y)); y += row.height
    sheet.save(output/"material-before-after.jpg", quality=94)
    selected = [0, 1, 5, 6]
    overview = Image.new("RGB", (rows[0].width, sum(rows[i].height for i in selected)+42), "#171b21")
    ImageDraw.Draw(overview).text((6, 5), "Source / before / after | same geometry; inferred appearance only\nSource0 is outside: the closure remains opaque. No invented texture or recovered unseen surface.", fill="white")
    y = 42
    for index in selected:
        overview.paste(rows[index], (0, y)); y += rows[index].height
    overview.save(output/"material-overview.jpg", quality=94)
    report = copy.deepcopy(source_report)
    report.update(candidate_geometry_sha256=geometry_hash(updated), appearance_only=True,
        source_candidate_geometry_sha256=geometry_hash(original), material_policy=POLICY,
        material_planes=plans, duplicated_vertices=duplicates, physical_triangles_unchanged=True,
        photo_face_colors_unchanged=True, all_camera_depth_renders_identical=True,
        material_view_diagnostics=diagnostics, status="provisional-material-appearance-candidate")
    report["limitations"].extend([
        "Plane colors are inferred appearance, not measured material; normals/proximity cannot fully exclude clothing or cabinet backs.",
        "No generated texture; flat colors cannot recover unseen structure or lighting.",
        "Unsupported planes retain exact original fallback and remain unknown."])
    (output/"report.json").write_text(json.dumps(report, indent=2)+"\n")
    return {"candidate_geometry_sha256": report["candidate_geometry_sha256"],
            "planes": [{k: p.get(k) for k in ("plane", "status", "inferred_rgb", "reason")} for p in plans],
            "duplicated_vertices": duplicates}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("folder", "result", "request", "output"):
        parser.add_argument("--"+name, type=Path, required=True)
    parser.add_argument("--_worker", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args._worker:
        print(json.dumps(run(args.folder, args.result, args.request, args.output)))
    else:
        from refine_arkit_bundle import memory_bytes
        command = [sys.executable, str(Path(__file__).resolve()), "--_worker"]
        for name in ("folder", "result", "request", "output"):
            command += ["--"+name, str(getattr(args, name))]
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
            env=dict(os.environ, OPENBLAS_NUM_THREADS="2", OMP_NUM_THREADS="2", MKL_NUM_THREADS="2"),
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        start, peak = time.monotonic(), 0
        try:
            while process.poll() is None:
                peak = max(peak, memory_bytes(process))
                if peak > POLICY["memory_bytes"] or time.monotonic()-start > POLICY["wallclock_seconds"]:
                    raise TimeoutError("Material experiment CPU resource bound exceeded")
                time.sleep(.1)
            stdout, stderr = process.communicate()
            if process.returncode:
                raise RuntimeError("Material worker failed: "+stderr[-1500:])
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
