"""Registered RGBD supplementation; no image model, network, or withheld conditioning."""
import argparse
import csv
import json
from pathlib import Path
import time

import numpy as np
from PIL import Image

import hypersim as h
from genrc_contract import sha256, write_json
from genrc_geometry import unproject, triangulate, filter_faces, free_space_filter, load_observations


def project_samples(points, K, world_to_cv, shape):
    cv = points @ world_to_cv[:3, :3].T + world_to_cv[:3, 3]
    uvh = cv @ K.T
    uv = uvh[:, :2] / np.maximum(cv[:, 2:], 1e-8)
    valid = np.isfinite(cv).all(1) & (cv[:, 2] > .1) & (cv[:, 2] <= 12)
    valid &= (uv[:, 0] >= 0) & (uv[:, 0] < shape[1]) & (uv[:, 1] >= 0) & (uv[:, 1] < shape[0])
    ids = np.flatnonzero(valid)
    xy = np.floor(uv[ids]).astype(int)
    pixel = xy[:, 1] * shape[1] + xy[:, 0]
    error = np.linalg.norm(uv[ids] - (xy + .5), axis=1)
    order = np.lexsort((error, cv[ids, 2], pixel))
    _, first = np.unique(pixel[order], return_index=True)
    select = order[first]
    return pixel[select], cv[ids[select], 2], error[select], ids[select]


def locked_composite(original, candidate, mask):
    if original.shape != candidate.shape or original.shape[:2] != mask.shape or mask.dtype != bool:
        raise ValueError("Registered equal-sized RGB images and a boolean mask required")
    result = original.copy()
    result[mask] = candidate[mask]
    return result


def render(mesh, K, pose, shape=(512, 512)):
    import open3d as o3d
    yy, xx = np.indices(shape)
    directions = np.stack([xx + .5, yy + .5, np.ones_like(xx)], -1) @ np.linalg.inv(K).T @ pose[:3, :3].T
    rays = np.concatenate([np.broadcast_to(pose[:3, 3], directions.shape), directions], -1).astype(np.float32)
    scene = o3d.t.geometry.RaycastingScene()
    scene.add_triangles(o3d.t.geometry.TriangleMesh.from_legacy(mesh))
    hit = scene.cast_rays(o3d.core.Tensor(rays))
    depth = hit["t_hit"].numpy()
    known = np.isfinite(depth)
    rgb = np.zeros((*shape, 3), np.uint8)
    ids = hit["primitive_ids"].numpy()[known].astype(int)
    uv = hit["primitive_uvs"].numpy()[known]
    weights = np.column_stack([1 - uv.sum(1), uv])
    colors = np.asarray(mesh.vertex_colors)[np.asarray(mesh.triangles)[ids]]
    rgb[known] = np.rint(255 * (colors * weights[..., None]).sum(1)).clip(0, 255).astype(np.uint8)
    return depth, rgb


def run(output, stride=2):
    import open3d as o3d
    started = time.monotonic()
    root = h.ROOT
    bundle = root / ".local/reconstruction/genrc-pilot-input-v1"
    data = root / ".local/reconstruction/data-r03"
    fixture = root / "docs/research/hypersim/ai_001_004-r03.json"
    config = h.config(fixture)
    h.verify_manifest(data, config, fixture)
    m = json.loads((bundle / "manifest.json").read_text())
    assert sha256(bundle / "room.ply") == m["source"]["mesh_sha256"]
    if stride not in (1, 2, 4):
        raise ValueError("Bounded sampling strides: 1, 2 or 4")
    output.mkdir(parents=True, exist_ok=False)
    original = o3d.io.read_triangle_mesh(str(bundle / "room.ply"))
    K = np.array(m["camera"]["K"])
    pose = np.array(m["camera"]["world_from_cv_m"])
    target_inverse = np.linalg.inv(pose)
    before_depth, before_rgb = render(original, K, pose)
    known = np.isfinite(before_depth)
    depth = before_depth.copy()
    colors = before_rgb.copy()
    donor = np.full(depth.shape, -1, np.int16)
    donor_pixel = np.full(depth.shape, -1, np.int32)
    error = np.full(depth.shape, np.inf)
    cameras = json.loads((root / ".local/reconstruction/runs/ai_001_004-r03/cameras.json").read_text())["cameras"]
    poses = {c["frame"]: np.array(c["world_from_cv_m"]) for c in cameras}
    with (data / "camera_parameters.csv").open() as f:
        row = next(r for r in csv.DictReader(f) if r["scene_name"] == config["scene"])
    matrix = np.array([[float(row[f"M_cam_from_uv_{i}{j}"]) for j in range(3)] for i in range(3)])
    unit = h.rays(matrix, 1024, 768)
    source_K = K.copy()
    source_K[:2] *= 768 / 512
    source_K[0, 2] += 128
    yy, xx = np.indices((768, 1024))
    source_rays = np.stack([xx + .5, yy + .5, np.ones_like(xx)], -1) @ np.linalg.inv(source_K).T
    source_pixels = np.arange(768 * 1024).reshape(768, 1024)[::stride, ::stride].ravel()
    source_dir = data / config["scene"] / "images"
    frames = config["train_frames"]
    assert frames == [i for i in range(100) if i not in (12, 37, 62, 87)]
    for index, frame in enumerate(frames):
        radial = h.read_h5(source_dir / "scene_cam_00_geometry_hdf5" / f"frame.{frame:04d}.depth_meters.hdf5")
        z = radial * -unit[..., 2]
        sampled = z[::stride, ::stride]
        cv = (source_rays[::stride, ::stride] * sampled[..., None]).reshape(-1, 3)
        world = cv @ poses[frame][:3, :3].T + poses[frame][:3, 3]
        valid = np.isfinite(world).all(1) & (sampled.ravel() > .1) & (sampled.ravel() <= 12)
        valid &= (world >= np.array(m["bounds_m"][0])).all(1) & (world <= np.array(m["bounds_m"][1])).all(1)
        source_ids = np.flatnonzero(valid)
        pixels, distances, errors, selected = project_samples(world[valid], K, target_inverse, depth.shape)
        old = depth.ravel()[pixels]
        choose = ~known.ravel()[pixels] & ((distances < old - .01) | ((np.abs(distances - old) <= .01) & (errors < error.ravel()[pixels])))
        if choose.any():
            pixels, distances, errors, selected = pixels[choose], distances[choose], errors[choose], source_ids[selected[choose]]
            rgb = h.tone_map(h.read_h5(source_dir / "scene_cam_00_final_hdf5" / f"frame.{frame:04d}.color.hdf5"))[::stride, ::stride].reshape(-1, 3)
            depth.ravel()[pixels] = distances
            colors.reshape(-1, 3)[pixels] = rgb[selected]
            donor.ravel()[pixels] = frame
            donor_pixel.ravel()[pixels] = source_pixels[selected]
            error.ravel()[pixels] = errors
        if index % 12 == 0:
            print("Reprojected", index + 1, "/", len(frames), "new pixels", int((donor >= 0).sum()), flush=True)
    active = donor >= 0
    colors = locked_composite(before_rgb, colors, active)
    Image.fromarray(before_rgb).save(output / "before.png")
    Image.fromarray(colors).save(output / "reprojected.png")
    Image.fromarray(active.astype(np.uint8) * 255).save(output / "source-supported-mask.png")
    np.savez_compressed(output / "pixel-provenance.npz", donor_frame=donor, donor_pixel=donor_pixel, target_depth_z_m=depth, reprojection_error_px=error)
    points, faces = triangulate(np.where(np.isfinite(depth), depth, np.nan), K, pose, active, known, m["bounds_m"])
    faces = filter_faces(points, faces, m["bounds_m"])
    faces, checks = free_space_filter(points, faces, load_observations(bundle / "observations.npz"))
    used, inverse = np.unique(faces, return_inverse=True)
    v, f, c = np.asarray(original.vertices), np.asarray(original.triangles), np.asarray(original.vertex_colors)
    candidate = o3d.geometry.TriangleMesh(o3d.utility.Vector3dVector(np.concatenate([v, points[used]])),
        o3d.utility.Vector3iVector(np.concatenate([f, inverse.reshape(-1, 3) + len(v)])))
    candidate.vertex_colors = o3d.utility.Vector3dVector(np.concatenate([c, colors.reshape(-1, 3)[used] / 255]))
    o3d.io.write_triangle_mesh(str(output / "candidate.ply"), candidate)
    np.savez_compressed(output / "mesh-provenance.npz", original_face_ids=np.arange(len(f)), source_supplement_face_ids=np.arange(len(f), len(f)+len(faces)), added_vertex_target_pixels=used)
    after_depth, after_rgb = render(candidate, K, pose)
    Image.fromarray(after_rgb).save(output / "candidate-target.png")
    views = {}
    for label, dx in (("left", -.1), ("right", .1)):
        offset = pose.copy()
        offset[:3, 3] += pose[:3, 0] * dx
        _, preview = render(candidate, K, offset)
        Image.fromarray(preview).save(output / f"candidate-{label}.png")
        views[label] = offset.tolist()
    assert np.array_equal(np.asarray(candidate.vertices)[:len(v)], v)
    assert np.array_equal(np.asarray(candidate.triangles)[:len(f)], f)
    assert np.array_equal(np.asarray(candidate.vertex_colors)[:len(c)], c)
    assert np.array_equal(colors[known], before_rgb[known])
    assert sha256(bundle / "room.ply") == m["source"]["mesh_sha256"]
    report = {"status": "candidate-awaiting-review", "method": "Training RGBD reprojection; no generative image or inferred depth",
        "conditioning_frames": frames, "target_frame": 37, "source_stride": stride, "seconds": time.monotonic()-started,
        "before_coverage": float(known.mean()), "source_image_coverage": float(np.isfinite(depth).mean()), "mesh_coverage": float(np.isfinite(after_depth).mean()),
        "added_pixels": int(active.sum()), "added_triangles": len(faces), "source_mesh_sha256": m["source"]["mesh_sha256"],
        "original_vertices_changed": 0, "original_faces_changed": 0, "observed_rgb_changed": 0, "depth_checks": checks,
        "nearby_poses": views, "camera": m["camera"], "script_sha256": sha256(Path(__file__)),
        "limitations": ["Supplied synthetic RGBD and poses, not RGB-only reconstruction", "New samples are reprojected/resampled source evidence; never describe as generated", "Sparse free-space checks and nearest-pixel splatting can miss boundary errors", "Remaining unsupported regions stay unknown"]}
    write_json(output / "report.json", report)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--stride", default=2, type=int)
    args = parser.parse_args()
    run(args.output, args.stride)
