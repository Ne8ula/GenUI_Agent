"""CPU evidence for an executed photo analysis; no model/network/UI work.

Source-camera renders are in-sample diagnostics, not reconstruction accuracy.
All coordinates/depth remain relative, and the proposed boundary is unconfirmed.
"""
import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageOps


def require_executed(result):
    if (result.get("status") != "complete" or result.get("model_execution") != "executed"
            or result.get("units") != "relative" or result.get("arms", {}).get("A", {}).get("status") != "complete"):
        raise ValueError("Review requires completed, executed relative-coordinate analysis")


def validate_files(result_path, request_path):
    """Reuse the authoritative JS contract, including geometry/input bindings."""
    code = """import fs from 'node:fs'; import {pathToFileURL} from 'node:url';
const {validateWorkerResult}=await import(pathToFileURL(process.argv[1]));
validateWorkerResult(JSON.parse(fs.readFileSync(process.argv[2],'utf8')),
JSON.parse(fs.readFileSync(process.argv[3],'utf8')));"""
    subprocess.run(["node", "--input-type=module", "-e", code,
                    str(Path(__file__).with_name("result.mjs")), str(result_path), str(request_path)],
                   check=True, capture_output=True, text=True)
    result = json.loads(result_path.read_text())
    require_executed(result)
    request = json.loads(request_path.read_text())
    if request["operation"] != "analyze":
        raise ValueError("This evidence command reviews photo analysis only")
    return result, request


def camera_rays(camera, size):
    """OpenCV integer pixel centers, not Open3D pinhole helper's half pixels."""
    width, height = size
    yy, xx = np.indices((height, width))
    k = np.asarray(camera["intrinsics"], dtype=float)
    pose = np.asarray(camera["world_to_camera"], dtype=float)
    directions = np.stack([xx, yy, np.ones_like(xx)], -1) @ np.linalg.inv(k).T @ pose[:, :3]
    origin = -pose[:, :3].T @ pose[:, 3]
    return np.concatenate([np.broadcast_to(origin, directions.shape), directions], -1).astype(np.float32)


def make_scene(vertices, faces):
    import open3d as o3d
    scene = o3d.t.geometry.RaycastingScene()
    if len(faces):
        scene.add_triangles(o3d.core.Tensor(vertices.astype(np.float32)),
                            o3d.core.Tensor(faces.astype(np.uint32)))
    return scene


def render(scene, vertices, colors, faces, camera, size):
    import open3d as o3d
    width, height = size
    depth = np.full((height, width), np.inf, dtype=np.float32)
    rgb = np.full((height, width, 3), [36, 39, 44], dtype=np.uint8)
    if not len(faces):
        return rgb, depth
    hits = scene.cast_rays(o3d.core.Tensor(camera_rays(camera, size)))
    depth = hits["t_hit"].numpy()
    valid = np.isfinite(depth) & (depth > 0)
    ids = hits["primitive_ids"].numpy()[valid].astype(int)
    uv = hits["primitive_uvs"].numpy()[valid]
    weights = np.column_stack([1-uv.sum(1), uv])
    rgb[valid] = np.rint(255*(colors[faces[ids]]*weights[..., None]).sum(1)).clip(0, 255).astype(np.uint8)
    return rgb, depth


def crop_bounds(transform):
    if transform.get("pixel_center_convention") != "integer" or transform.get("model_size") != [518, 518]:
        raise ValueError("Unsupported preprocessing convention")
    left, top = transform["padding_left_top"]
    width, height = transform["resized_size"]
    if not all(type(v) is int for v in (left, top, width, height)) or min(left, top) < 0 or min(width, height) <= 0:
        raise ValueError("Invalid crop")
    if left+width > 518 or top+height > 518:
        raise ValueError("Crop exceeds model frame")
    return left, top, left+width, top+height


def source_image(record, transform):
    data = base64.b64decode(record["data_base64"], validate=True)
    if hashlib.sha256(data).hexdigest() != record["sha256"]:
        raise ValueError("Source bytes changed")
    with Image.open(io.BytesIO(data)) as raw:
        source = ImageOps.exif_transpose(raw).convert("RGB")
    if list(source.size) != transform["source_size"]:
        raise ValueError("Source dimensions differ from preprocessing")
    return source.resize(tuple(transform["resized_size"]), Image.Resampling.BICUBIC)


def surface_samples(vertices, colors, faces, count=100000):
    """Deterministic area-weighted sampling, not uneven depth-grid vertices."""
    triangles = vertices[faces]
    area = np.linalg.norm(np.cross(triangles[:, 1]-triangles[:, 0], triangles[:, 2]-triangles[:, 0]), axis=1)*.5
    if not np.isfinite(area).all() or area.sum() <= 0:
        raise ValueError("No finite surface area")
    rng = np.random.default_rng(20261020)
    select = rng.choice(len(faces), count, p=area/area.sum())
    uv = rng.random((count, 2))
    uv[uv.sum(1) > 1] = 1-uv[uv.sum(1) > 1]
    weights = np.column_stack([1-uv.sum(1), uv])
    return ((triangles[select]*weights[..., None]).sum(1),
            (colors[faces[select]]*weights[..., None]).sum(1))


def run(result_path, request_path, output):
    import open3d as o3d
    result, request = validate_files(result_path, request_path)
    arm = result["arms"]["A"]
    mesh = arm["geometry"]
    vertices = np.asarray(mesh["positions"]).reshape(-1, 3)
    colors = np.asarray(mesh["colors"]).reshape(-1, 3)
    faces = np.asarray(mesh["indices"], dtype=np.int32).reshape(-1, 3)
    source_indices = np.asarray(mesh["source_view_indices"])
    transforms = result["preprocessing"]
    if len(transforms) != len(request["images"]) or source_indices.shape != (len(faces),):
        raise ValueError("Missing per-view preprocessing/source attribution")
    for transform in transforms:
        crop_bounds(transform)
    output.mkdir(parents=True, exist_ok=False)
    legacy = o3d.geometry.TriangleMesh(o3d.utility.Vector3dVector(vertices), o3d.utility.Vector3iVector(faces))
    legacy.vertex_colors = o3d.utility.Vector3dVector(colors)
    legacy.compute_vertex_normals()
    if not o3d.io.write_triangle_mesh(str(output/"photo-estimated.ply"), legacy):
        raise RuntimeError("Mesh write failed")
    samples, sample_colors = surface_samples(vertices, colors, faces)
    cloud = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(samples))
    cloud.colors = o3d.utility.Vector3dVector(sample_colors)
    if not o3d.io.write_point_cloud(str(output/"surface-samples.ply"), cloud):
        raise RuntimeError("Point cloud write failed")
    scene = make_scene(vertices, faces)
    rows, stats = [], []
    for i, (record, camera, transform) in enumerate(zip(request["images"], arm["cameras"], transforms)):
        if record["id"] != camera["image_id"]:
            raise ValueError("Camera ordering changed")
        bounds = crop_bounds(transform)
        left, top, right, bottom = bounds
        region = np.s_[top:bottom, left:right]
        source = source_image(record, transform)
        rendered, depth = render(scene, vertices, colors, faces, camera, transform["model_size"])
        other_faces = faces[source_indices != i]
        cross_scene = make_scene(vertices, other_faces)
        cross_rgb, cross_depth = render(cross_scene, vertices, colors, other_faces, camera, transform["model_size"])
        predicted = Image.fromarray(rendered).crop(bounds)
        cross = Image.fromarray(cross_rgb).crop(bounds)
        for suffix, image in (("source", source), ("all-views", predicted), ("other-views", cross)):
            image.save(output/(record["id"]+"-"+suffix+".png"))
        np.savez_compressed(output/(record["id"]+"-relative-depth.npz"),
                            all_views=depth[region], other_views=cross_depth[region])
        all_hit = np.isfinite(depth[region])
        other_hit = np.isfinite(cross_depth[region])
        source_array = np.asarray(source).astype(float)
        comparison = np.abs(source_array-cross_rgb[region]).mean(2)
        stats.append({"image_id": record["id"], "all_view_hit_fraction": float(all_hit.mean()),
                      "other_view_hit_fraction": float(other_hit.mean()),
                      "other_view_rgb_mae_0_255_on_hits": float(comparison[other_hit].mean()) if other_hit.any() else None,
                      "no_other_view_hits": not bool(other_hit.any())})
        width, height = source.size
        row = Image.new("RGB", (width*3, height+32), "#15191e")
        draw = ImageDraw.Draw(row)
        for column, (label, image) in enumerate((("Source "+record["id"], source),
                                                ("All estimated views", predicted),
                                                ("Other views only", cross))):
            draw.text((column*width+6, 9), label, fill="white")
            row.paste(image, (column*width, 32))
        rows.append(row)
    sheet = Image.new("RGB", (max(row.width for row in rows), sum(row.height for row in rows)+54), "#15191e")
    ImageDraw.Draw(sheet).text((8, 8), "Executed VGGT RGB-only analysis | relative units | boundary UNCONFIRMED\nSource-camera diagnostics; not held-out accuracy or complete-room evidence", fill="white")
    offset = 54
    for row in rows:
        sheet.paste(row, (0, offset))
        offset += row.height
    sheet.save(output/"source-camera-review.jpg", quality=92)
    report = {"version": 1, "job_id": result["job_id"],
              "result_sha256": hashlib.sha256(result_path.read_bytes()).hexdigest(),
              "request_sha256": hashlib.sha256(request_path.read_bytes()).hexdigest(),
              "vertices": len(vertices), "triangles": len(faces), "sampled_surface_points": len(samples),
              "bounds_relative": [vertices.min(0).tolist(), vertices.max(0).tolist()],
              "status": "executed-photo-analysis-review", "units": "relative", "boundary_confirmed": False,
              "views": stats,
              "limitations": ["Source cameras are estimated from these same inputs, not held-out reference poses.",
                              "Other-view render excludes faces attributed to the target view, but VGGT jointly saw all inputs.",
                              "Hit fractions describe ray intersections, not physical correctness or complete room coverage.",
                              "RGB error is diagnostic only and includes lighting/exposure/visibility/model errors.",
                              "Surface samples follow triangle area, including duplicated overlapping per-view surfaces.",
                              "No Shado, authored shell, metric alignment, ground-truth scoring or completed-room claim."]}
    (output/"review.json").write_text(json.dumps(report, indent=2)+"\n", encoding="utf-8")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--result", type=Path, required=True)
    parser.add_argument("--request", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(run(args.result, args.request, args.output), indent=2))
