"""Preserve an exploratory fusion and conservatively cap its provisional room.

This operator diagnostic uses a specified cap in the already fitted candidate
frame. It grants no owner confirmation and never changes the source analysis.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path

import numpy as np
import open3d as o3d
from PIL import Image, ImageDraw

from complete_candidate import arrays, clip_rectangle, geometry_hash, package, write_mesh
from geometry import add_room_shell
from review_result import crop_bounds, make_scene, render, source_image, validate_files


def point_image(points, colors, camera, depth, tolerance=.023):
    pose, k = np.asarray(camera["world_to_camera"]), np.asarray(camera["intrinsics"])
    local = points@pose[:, :3].T+pose[:, 3]
    valid = local[:, 2] > 1e-6
    xyh = local@k.T
    pixels = np.rint(xyh[:, :2]/np.maximum(local[:, 2:], 1e-6)).astype(int)
    h, w = depth.shape
    valid &= (pixels[:, 0] >= 0) & (pixels[:, 0] < w) & (pixels[:, 1] >= 0) & (pixels[:, 1] < h)
    ids = np.flatnonzero(valid)
    ids = ids[np.abs(local[ids, 2]-depth[pixels[ids, 1], pixels[ids, 0]]) <= tolerance]
    image = np.full((h, w, 3), [24, 31, 38], np.uint8)
    # One-pixel dots and front-surface occlusion; point positions are uniform
    # Poisson-disk surface samples, not the original per-view depth grid.
    ids = ids[np.argsort(-local[ids, 2])]
    image[pixels[ids, 1], pixels[ids, 0]] = np.rint(colors[ids]*255).clip(0, 255).astype(np.uint8)
    return Image.fromarray(image), len(ids)


def run(source_folder, result_path, request_path, output, cap_x):
    result, request = validate_files(result_path, request_path)
    prior = json.loads((source_folder/"report.json").read_text())
    if hashlib.sha256(result_path.read_bytes()).hexdigest() != prior["input_result_sha256"]:
        raise ValueError("Source analysis binding changed")
    if hashlib.sha256(request_path.read_bytes()).hexdigest() != prior["input_request_sha256"]:
        raise ValueError("Source photo request changed")
    if output.exists():
        raise ValueError("Refusing to overwrite a completion variant")
    boundary = copy.deepcopy(prior["boundary"])
    lower = min(point[0] for point in boundary["polygon"])
    upper = max(point[0] for point in boundary["polygon"])
    if not lower+.1 < cap_x < upper:
        raise ValueError("Correction must narrow the existing candidate")
    for point in boundary["polygon"]:
        if point[0] == upper:
            point[0] = cap_x
    mesh = o3d.io.read_triangle_mesh(str(source_folder/"fused-unbounded.ply"))
    v, c, f = np.asarray(mesh.vertices), np.asarray(mesh.vertex_colors), np.asarray(mesh.triangles)
    keep = clip_rectangle(v, f, boundary)
    bounded = package(v, c, f[keep])
    candidate = copy.deepcopy(bounded)
    add_room_shell(candidate, boundary, [])
    candidate["completion"] = {"policy": "provisional-single-room-enclosure",
        "origin": "operator narrowed fitted cap to supported room-end wall; NOT owner confirmed",
        "openings": "hall-facing gap closed by authored wall; no detected or generated door"}
    candidate["representation"] = "TSDF-fused-estimate-plus-authored-enclosure"
    output.mkdir(parents=True)
    write_mesh(output/"fused-bounded.ply", bounded)
    completed_mesh = write_mesh(output/"candidate.ply", candidate)
    for name, value in (("candidate.json", candidate), ("fused-bounded.json", bounded)):
        (output/name).write_text(json.dumps(value, separators=(",", ":")))
    o3d.utility.random.seed(20261020)
    cloud = completed_mesh.sample_points_poisson_disk(90000, init_factor=3)
    o3d.io.write_point_cloud(str(output/"uniform-surface-points.ply"), cloud)
    pv, pc = np.asarray(cloud.points), np.asarray(cloud.colors)
    cv, cc, cf = arrays(candidate); bv, bc, bf = arrays(bounded)
    candidate_scene, fused_scene = make_scene(cv, cf), make_scene(bv, bf)
    basis = np.asarray(prior["original_to_candidate_rotation"])
    rows, stats = [], []
    for index, (record, camera, transform) in enumerate(zip(request["images"], result["arms"]["A"]["cameras"], result["preprocessing"])):
        updated = copy.deepcopy(camera)
        pose = np.asarray(camera["world_to_camera"])
        pose[:, :3] = pose[:, :3]@basis.T
        updated["world_to_camera"] = pose.tolist()
        rgb, depth = render(candidate_scene, cv, cc, cf, updated, transform["model_size"])
        fused_rgb, fused_depth = render(fused_scene, bv, bc, bf, updated, transform["model_size"])
        points_image, visible_points = point_image(pv, pc, updated, depth)
        crop = crop_bounds(transform)
        source = source_image(record, transform)
        complete = Image.fromarray(rgb).crop(crop)
        fused = Image.fromarray(fused_rgb).crop(crop)
        dots = points_image.crop(crop)
        center = np.asarray(camera["center"])@basis.T
        inside_camera = (lower <= center[0] <= cap_x and boundary["polygon"][0][1] <= center[1] <= boundary["polygon"][2][1]
                         and boundary["floor"] <= center[2] <= boundary["ceiling"])
        for name, image in (("completed", complete), ("fused", fused), ("points", dots)):
            image.save(output/(record["id"]+"-"+name+".png"))
        row = Image.new("RGB", (source.width*4, source.height+32), "#171b21")
        for column, image in enumerate((source, fused, complete, dots)):
            row.paste(image, (source.width*column, 32))
        label = f"Source {index} | source / fused estimate / authored closure / uniform points"
        if not inside_camera:
            label += " | CAMERA OUTSIDE ROOM: closure occludes source view"
        ImageDraw.Draw(row).text((6, 8), label, fill="white")
        rows.append(row)
        l, t, r, b = crop
        hit = np.isfinite(fused_depth[t:b, l:r])
        error = np.abs(np.asarray(source).astype(float)-fused_rgb[t:b, l:r]).mean(2)
        stats.append({"image_id": record["id"], "camera_inside_provisional_boundary": bool(inside_camera),
            "candidate_ray_hit_fraction": float(np.isfinite(depth[t:b, l:r]).mean()),
            "fused_without_shell_hit_fraction": float(hit.mean()),
            "fused_without_shell_rgb_mae_0_255_on_hits": float(error[hit].mean()) if hit.any() else None,
            "visible_uniform_points": visible_points, "meaning": "conditioning-view diagnostic, not accuracy"})
    def sheet(selected, path):
        image = Image.new("RGB", (rows[0].width, sum(rows[i].height for i in selected)+46), "#171b21")
        ImageDraw.Draw(image).text((6, 6), "Exploratory VGA candidate | provisional room-only boundary; no metric or ground-truth claim\nUniform Poisson-disk points; inferred architecture closes the hall and window.", fill="white")
        y = 46
        for i in selected:
            image.paste(rows[i], (0, y)); y += rows[i].height
        image.save(path, quality=94)
    sheet(list(range(len(rows))), output/"candidate-source-review.jpg")
    sheet([0, 3, 5], output/"comparison-overview.jpg")
    report = copy.deepcopy(prior)
    report.update(boundary=boundary, boundary_confirmed=False,
        boundary_origin="operator provisional correction; excludes photographed hall beyond supported end wall",
        candidate_geometry_sha256=geometry_hash(candidate), fused_geometry_sha256=geometry_hash(bounded),
        bounded_triangles=int(keep.sum()), discarded_outside_boundary_triangles=int((~keep).sum()),
        authored_shell_triangles=len(cf)-int(keep.sum()), source_camera_diagnostics=stats,
        correction={"source_report_sha256": hashlib.sha256((source_folder/"report.json").read_bytes()).hexdigest(),
                    "source_unbounded_fusion_sha256": hashlib.sha256((source_folder/"fused-unbounded.ply").read_bytes()).hexdigest(),
                    "previous_cap_x": upper, "provisional_cap_x": cap_x,
                    "reason": "camera0 is outside room; default camera-inclusive fit incorporated hallway",
                    "refusion": False, "new_model_execution": False,
                    "renderer_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()})
    report["limitations"].append("Source camera0 lies outside the closed room and is deliberately occluded; use an interior view to navigate.")
    (output/"report.json").write_text(json.dumps(report, indent=2)+"\n")
    return {"candidate_geometry_sha256": report["candidate_geometry_sha256"],
            "bounded_triangles": report["bounded_triangles"], "uniform_points": len(pv),
            "camera_inside": [s["camera_inside_provisional_boundary"] for s in stats]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("source-folder", "result", "request", "output"):
        parser.add_argument("--"+name, type=Path, required=True)
    parser.add_argument("--cap-x", type=float, required=True)
    args = parser.parse_args()
    print(json.dumps(run(args.source_folder, args.result, args.request, args.output, args.cap_x)))
