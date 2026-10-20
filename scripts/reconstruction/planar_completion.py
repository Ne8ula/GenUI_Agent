"""Bounded inferred floor patch, fitted to immutable observed geometry."""
import argparse
import csv
import json
from pathlib import Path

import numpy as np
from PIL import Image

import hypersim as h
from genrc_contract import sha256, write_json
from genrc_geometry import unproject, triangulate, filter_faces
from source_completion import render, locked_composite


def plane_depth(K, pose, height, shape):
    yy, xx = np.indices(shape)
    directions = np.stack([xx+.5, yy+.5, np.ones_like(xx)], -1) @ np.linalg.inv(K).T @ pose[:3, :3].T
    z = np.full(shape, np.nan)
    np.divide(height-pose[2, 3], directions[..., 2], out=z, where=np.abs(directions[..., 2]) > 1e-6)
    z[(z <= .1) | (z > 12)] = np.nan
    return z


def image_gate(original, raw, mask, threshold=8, max_changed_fraction=.01):
    """Raw-image drift gate runs BEFORE compositing; resize only, never realign."""
    if raw.shape != original.shape:
        raw = np.array(Image.fromarray(raw).resize((original.shape[1], original.shape[0]), Image.Resampling.BOX))
    if mask.shape != original.shape[:2] or mask.dtype != bool or mask.all():
        raise ValueError("A bounded boolean edit mask is required")
    delta = np.abs(raw.astype(float)-original.astype(float)).mean(-1)
    changed = float((delta[~mask] > threshold).mean())
    return {"accepted": changed <= max_changed_fraction,
            "outside_changed_fraction": changed, "outside_mae": float(delta[~mask].mean()),
            "threshold_rgb": threshold, "max_changed_fraction": max_changed_fraction,
            "note": "Necessary pixel-registration gate; passing does not establish correct geometry"}


def plane_cells(mask, K, pose, height):
    """Pixel-sized floor quads avoid resampling cracks between inferred/known depths."""
    yy, xx = np.nonzero(mask)
    offsets = np.array([[0, 0], [1, 0], [0, 1], [1, 1]])
    uv = np.stack([xx, yy], -1)[:, None, :] + offsets
    rays = np.concatenate([uv, np.ones((*uv.shape[:2], 1))], -1) @ np.linalg.inv(K).T @ pose[:3, :3].T
    distance = (height-pose[2, 3])/rays[..., 2]
    points = (pose[:3, 3]+rays*distance[..., None]).reshape(-1, 3)
    ids = np.arange(len(xx)*4).reshape(-1, 4)
    faces = np.concatenate([ids[:, [0, 2, 1]], ids[:, [1, 2, 3]]])
    pixels = yy*mask.shape[1]+xx
    return points, faces, np.repeat(pixels, 4)


def dense_filter(points, faces, source_dir, frames, poses, source_K, unit, tolerance=.05, max_reference_depth=12, protect_invalid=False):
    """Reject any vertex/centroid contradicting nearest full-resolution train depth."""
    keep = np.ones(len(faces), bool)
    checked = 0
    for frame in frames:
        ids = np.flatnonzero(keep)
        if not len(ids):
            break
        tri = points[faces[ids]]
        probes = np.concatenate([tri, tri.mean(1)[:, None]], axis=1)
        inv = np.linalg.inv(poses[frame])
        cv = probes @ inv[:3, :3].T + inv[:3, 3]
        uv = cv @ source_K.T
        xy = np.floor(uv[..., :2] / np.maximum(cv[..., 2:], 1e-8)).astype(int)
        visible = (cv[..., 2] > .1) & (xy[..., 0] >= 0) & (xy[..., 0] < 1024) & (xy[..., 1] >= 0) & (xy[..., 1] < 768)
        radial = h.read_h5(source_dir / f"frame.{frame:04d}.depth_meters.hdf5")
        depth = radial * -unit[..., 2]
        # A minimum 3x3 reference avoids treating far-side edge depth as open space.
        references = [depth[(xy[..., 1]+dy).clip(0, 767), (xy[..., 0]+dx).clip(0, 1023)]
                      for dy in (-1, 0, 1) for dx in (-1, 0, 1)]
        samples = np.stack(references)
        samples[~np.isfinite(samples) | (samples <= .1)] = np.inf
        ref = samples.min(0)
        valid = visible & np.isfinite(ref) & (ref <= max_reference_depth)
        checked += int(valid.sum())
        conflict = valid & (cv[..., 2] < ref-tolerance)
        # All nine neighbours invalid: preserve the source-visible opening rather
        # than treating absent depth as permission to invent an opaque surface.
        if protect_invalid:
            conflict |= visible & ~np.isfinite(ref)
        keep[ids[conflict.any(1)]] = False
    return faces[keep], {"rejected_triangles": int((~keep).sum()), "valid_depth_probes": checked,
                         "tolerance_m": tolerance,
                         "max_reference_depth_m": max_reference_depth if np.isfinite(max_reference_depth) else None,
                         "source_invalid_interiors_protected": protect_invalid,
                         "reference": "minimum valid 3x3 full-resolution training depth"}


def run(output, cells=False, seam_pixels=0, full_floor=False):
    import open3d as o3d
    bundle = h.ROOT / ".local/reconstruction/genrc-pilot-input-v1"
    data = h.ROOT / ".local/reconstruction/data-r03"
    fixture = h.ROOT / "docs/research/hypersim/ai_001_004-r03.json"
    config = h.config(fixture)
    h.verify_manifest(data, config, fixture)
    m = json.loads((bundle / "manifest.json").read_text())
    assert sha256(bundle / "room.ply") == m["source"]["mesh_sha256"]
    output.mkdir(parents=True, exist_ok=False)
    original = o3d.io.read_triangle_mesh(str(bundle / "room.ply"))
    K, pose = np.array(m["camera"]["K"]), np.array(m["camera"]["world_from_cv_m"])
    before, rgb = render(original, K, pose)
    known = np.isfinite(before)
    region = np.zeros(known.shape, bool)
    region[416:, :256] = True
    world = unproject(np.where(known, before, np.nan), K, pose)
    anchors = world[known & region]
    height = float(np.median(anchors[:, 2]))
    residual = np.abs(anchors[:, 2]-height)
    if len(anchors) < 1000 or np.quantile(residual, .95) > .01:
        raise ValueError("Insufficient flat floor support")
    if full_floor:
        region[:] = True
    inferred = plane_depth(K, pose, height, before.shape)
    active = region & ~known & np.isfinite(inferred)
    inferred_world = unproject(inferred, K, pose)
    active &= (inferred_world >= m["bounds_m"][0]).all(-1) & (inferred_world <= m["bounds_m"][1]).all(-1)
    if seam_pixels not in (0, 1, 2):
        raise ValueError("Seam overlap must be bounded to 0, 1 or 2 pixels")
    footprint = active.copy()
    for _ in range(seam_pixels):
        padded = np.pad(footprint, 1)
        footprint = np.logical_or.reduce([padded[dy:dy+512, dx:dx+512] for dy in range(3) for dx in range(3)])
        footprint &= region & (active | (known & (np.abs(world[..., 2]-height) < .005)))
    depth = np.where(active, inferred, np.where(known, before, np.nan))
    points, faces = triangulate(depth, K, pose, active, known, m["bounds_m"])
    color_pixels = np.arange(depth.size)
    if cells:
        points, faces, color_pixels = plane_cells(footprint, K, pose, height)
    faces = filter_faces(points, faces, m["bounds_m"])
    cameras = json.loads((h.ROOT / ".local/reconstruction/runs/ai_001_004-r03/cameras.json").read_text())["cameras"]
    poses = {c["frame"]: np.array(c["world_from_cv_m"]) for c in cameras}
    source_K = K.copy()
    source_K[:2] *= 1.5
    source_K[0, 2] += 128
    with (data / "camera_parameters.csv").open() as f:
        row = next(r for r in csv.DictReader(f) if r["scene_name"] == config["scene"])
    matrix = np.array([[float(row[f"M_cam_from_uv_{i}{j}"]) for j in range(3)] for i in range(3)])
    unit = h.rays(matrix, 1024, 768)
    frames = config["train_frames"]
    assert frames == [i for i in range(100) if i not in (12, 37, 62, 87)]
    print("Checking floor against all 96 full-resolution training depth maps", flush=True)
    faces, checks = dense_filter(points, faces, data / config["scene"] / "images/scene_cam_00_geometry_hdf5",
                                 frames, poses, source_K, unit)
    v, f, c = np.asarray(original.vertices), np.asarray(original.triangles), np.asarray(original.vertex_colors)
    floor_ids = np.flatnonzero(np.abs(v[:, 2]-height) < .005)
    tree = o3d.geometry.KDTreeFlann(o3d.geometry.PointCloud(o3d.utility.Vector3dVector(v[floor_ids])))
    inferred_rgb = rgb.copy()
    donor = np.full((*before.shape, 4), -1, np.int32)
    distances = np.full(before.shape, np.nan)
    texture_points = unproject(inferred, K, pose).reshape(-1, 3)
    for pixel in np.flatnonzero(active):
        # Color samples use target pixel centers, independently of mesh tessellation.
        count, indices, squared = tree.search_knn_vector_3d(texture_points[pixel], 4)
        weights = 1 / np.maximum(np.array(squared), 1e-6)
        weights /= weights.sum()
        inferred_rgb.reshape(-1, 3)[pixel] = np.rint((c[floor_ids[indices]]*weights[:, None]).sum(0)*255)
        donor.reshape(-1, 4)[pixel, :count] = floor_ids[indices]
        distances.ravel()[pixel] = np.sqrt(squared[0])
    colors = locked_composite(rgb, inferred_rgb, active)
    used, inverse = np.unique(faces, return_inverse=True)
    candidate = o3d.geometry.TriangleMesh(o3d.utility.Vector3dVector(np.concatenate([v, points[used]])),
        o3d.utility.Vector3iVector(np.concatenate([f, inverse.reshape(-1, 3)+len(v)])))
    candidate.vertex_colors = o3d.utility.Vector3dVector(np.concatenate([c, colors.reshape(-1, 3)[color_pixels[used]]/255]))
    o3d.io.write_triangle_mesh(str(output / "candidate.ply"), candidate)
    after, after_rgb = render(candidate, K, pose)
    added = ~known & np.isfinite(after)
    occluded = known & np.isfinite(after) & (after < before-.02)
    for name, image in (("before", rgb), ("candidate-target", after_rgb), ("inferred-mask", added.astype(np.uint8)*255)):
        Image.fromarray(image).save(output / f"{name}.png")
    provenance = after_rgb.copy()
    provenance[added] = [255, 122, 30]
    Image.fromarray(provenance).save(output / "provenance.png")
    for label, dx in (("left", -.1), ("right", .1)):
        offset = pose.copy()
        offset[:3, 3] += pose[:3, 0]*dx
        _, image = render(candidate, K, offset)
        Image.fromarray(image).save(output / f"candidate-{label}.png")
    np.savez_compressed(output / "provenance.npz", added_vertex_target_pixels=color_pixels[used], color_donor_original_vertices=donor,
                        color_nearest_distance_m=distances, inferred_depth_z_m=inferred, candidate_depth_z_m=after,
                        original_face_count=len(f), added_mask=added)
    preserved = all(np.array_equal(a, b) for a, b in (
        (np.asarray(candidate.vertices)[:len(v)], v), (np.asarray(candidate.triangles)[:len(f)], f),
        (np.asarray(candidate.vertex_colors)[:len(c)], c)))
    assert preserved and not occluded.any()
    assert not (added & ~region).any()
    assert sha256(bundle / "room.ply") == m["source"]["mesh_sha256"]
    write_json(output / "report.json", {
        "status": "candidate-awaiting-independent-evaluation", "method": "Observed floor plane extension; inferred nearest-floor color",
        "camera": m["camera"], "conditioning_frames": frames, "floor_height_m": height, "pixel_cells": cells,
        "seam_overlap_pixels": seam_pixels, "overlap_known_pixels": int((footprint & known).sum()),
        "region": "all missing rays intersecting the floor within room bounds" if full_floor else "lower-left 256x96 patch",
        "anchor_count": len(anchors), "anchor_abs_residual_p95_m": float(np.quantile(residual, .95)),
        "requested_missing_pixels": int((region & ~known).sum()), "eligible_plane_pixels": int(active.sum()), "repaired_pixels": int(added.sum()),
        "remaining_patch_holes": int((region & ~known & ~added).sum()), "added_triangles": len(faces),
        "before_coverage": float(known.mean()), "after_coverage": float(np.isfinite(after).mean()),
        "original_arrays_preserved": preserved, "occluded_observed_pixels_over_2cm": int(occluded.sum()),
        "changed_known_render_pixels": int((np.any(rgb != after_rgb, axis=-1) & known).sum()),
        "depth_checks": checks, "source_mesh_sha256": m["source"]["mesh_sha256"],
        "candidate_sha256": sha256(output / "candidate.ply"), "script_sha256": sha256(Path(__file__)),
        "limitations": ["Plane and material continuation are inferred, not observed or generated.",
                       "Only floor-plane intersections are attempted; remaining room coverage is unresolved.",
                       "Nearest-floor color transfer can blur wood grain; no learned texture or depth model ran.",
                       "Depth checks sample vertices and centroids; they are not proof of complete physical validity."]})
    print((output / "report.json").read_text())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--cells", action="store_true")
    parser.add_argument("--seam-pixels", type=int, default=0)
    parser.add_argument("--full-floor", action="store_true")
    args = parser.parse_args()
    run(args.output, args.cells, args.seam_pixels, args.full_floor)
