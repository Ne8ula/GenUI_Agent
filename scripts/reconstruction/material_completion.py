"""Independent floor material atlas and fixed-geometry texture adapter. No network."""
import argparse
import csv
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

import hypersim as h
from genrc_contract import sha256, write_json
from genrc_geometry import unproject
from source_completion import render


TRAIN = [i for i in range(100) if i not in (12, 37, 62, 87)]
MATERIAL_KEYS = {"schema_version", "kind", "origin", "texture_sha256", "meters_per_tile",
                "world_origin_xy_m", "conditioning_frames", "source_rgb_sha256",
                "source_depth_sha256", "source_texels_sha256", "fully_depth_supported",
                "depth_tolerance_m", "donor_distance_to_patch_m", "source_footprint_px",
                "median_source_pixels_per_texel", "atlas_resolution", "license", "attribution", "limitations"}


def atlas_points(center, height, size=.4, resolution=128):
    axis = (np.arange(resolution)+.5)/resolution-.5
    y, x = np.meshgrid(axis, axis, indexing="ij")
    return np.stack([center[0]+size*x, center[1]+size*y, np.full_like(x, height)], -1)


def project_visible(points, pose, K, reference, tolerance=.008):
    inverse = np.linalg.inv(pose)
    cv = points @ inverse[:3, :3].T + inverse[:3, 3]
    uv = cv @ K.T
    uv = uv[..., :2]/np.maximum(cv[..., 2:], 1e-8)
    xy = np.floor(uv).astype(int)
    valid = (cv[..., 2] > .1) & (xy[..., 0] >= 1) & (xy[..., 0] < reference.shape[1]-1)
    valid &= (xy[..., 1] >= 1) & (xy[..., 1] < reference.shape[0]-1)
    x, y = xy[..., 0].clip(1, reference.shape[1]-2), xy[..., 1].clip(1, reference.shape[0]-2)
    neighbors = np.stack([reference[y+dy, x+dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1)])
    valid &= np.isfinite(neighbors).all(0)
    valid &= (np.abs(neighbors-cv[..., 2]) <= tolerance).all(0)
    return uv, valid


def bilinear(image, xy):
    x = np.clip(xy[..., 0], 0, image.shape[1]-1)
    y = np.clip(xy[..., 1], 0, image.shape[0]-1)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    x1, y1 = np.minimum(x0+1, image.shape[1]-1), np.minimum(y0+1, image.shape[0]-1)
    wx, wy = (x-x0)[..., None], (y-y0)[..., None]
    return (image[y0, x0]*(1-wx)+image[y0, x1]*wx)*(1-wy)+(image[y1, x0]*(1-wx)+image[y1, x1]*wx)*wy


def material_uv(points, origin, size):
    """World XY mirrored repeat. Camera-independent, with continuous tile edges."""
    unit = (np.asarray(points)[..., :2]-origin)/size
    phase = np.mod(unit, 2)
    return np.where(phase <= 1, phase, 2-phase)


def texture_colors(base, points, original_pixels, mask, distances, texture, origin, size):
    uv = material_uv(points, origin, size)
    xy = uv*np.array([texture.shape[1]-1, texture.shape[0]-1])
    low = np.array(Image.fromarray(texture).filter(ImageFilter.GaussianBlur(8)), float)/255
    detail = texture.astype(float)/255-low
    # Transfer only texture detail; keep local reconstructed illumination/color.
    sample = bilinear(detail, xy).clip(-.12, .12)
    weight = np.clip((distances.ravel()[original_pixels]-.005)/.06, 0, 1)
    weight = weight*weight*(3-2*weight)
    editable = mask.ravel()[original_pixels]
    weight = np.where(editable & np.isfinite(weight), weight, 0)
    colors = np.asarray(base).copy()
    colors[editable] = (colors[editable]+sample[editable]*weight[editable, None]).clip(0, 1)
    return colors, uv, weight


def prepare(output, geometry):
    output.mkdir(parents=True, exist_ok=False)
    report = json.loads((geometry/"report.json").read_text())
    if sha256(geometry/"candidate.ply") != report["candidate_sha256"]:
        raise ValueError("Geometry changed")
    data = h.ROOT/".local/reconstruction/data-r03"
    fixture = h.ROOT/"docs/research/hypersim/ai_001_004-r03.json"
    config = h.config(fixture)
    h.verify_manifest(data, config, fixture)
    if config["train_frames"] != TRAIN:
        raise ValueError("Incorrect training split")
    K = np.array(report["camera"]["K"])
    source_K = K.copy()
    source_K[:2] *= 1.5
    source_K[0, 2] += 128
    poses = {c["frame"]: np.array(c["world_from_cv_m"]) for c in json.loads(
        (h.ROOT/".local/reconstruction/runs/ai_001_004-r03/cameras.json").read_text())["cameras"]}
    with (data/"camera_parameters.csv").open() as f:
        row = next(r for r in csv.DictReader(f) if r["scene_name"] == config["scene"])
    matrix = np.array([[float(row[f"M_cam_from_uv_{i}{j}"]) for j in range(3)] for i in range(3)])
    unit = h.rays(matrix, 1024, 768)
    height = report["floor_height_m"]
    with np.load(geometry/"provenance.npz") as z:
        center = np.median(unproject(z["inferred_depth_z_m"], K, poses[37])[z["added_mask"]], axis=0)[:2]
    image_dir = data/config["scene"]/"images"
    candidates = []
    best = None
    for index, frame in enumerate(TRAIN):
        depth = h.read_h5(image_dir/"scene_cam_00_geometry_hdf5"/f"frame.{frame:04d}.depth_meters.hdf5")*-unit[..., 2]
        # Coarse source samples identify donor locations only. Atlas visibility is full resolution.
        source_world = unproject(depth, source_K, poses[frame])[::8, ::8].reshape(-1, 3)
        floor = source_world[np.isfinite(source_world).all(1) & (np.abs(source_world[:, 2]-height) < .005)]
        if len(floor) < 100:
            continue
        centers = [np.median(floor[:, :2], axis=0)]
        centers.extend(floor[np.argsort(np.linalg.norm(floor[:, :2]-center, axis=1))[
            np.linspace(0, len(floor)-1, 6).astype(int)], :2])
        for tile_center in centers:
            points = atlas_points(tile_center, height)
            uv, valid = project_visible(points, poses[frame], source_K, depth)
            ratio = float(valid.mean())
            distance = float(np.linalg.norm(tile_center-center))
            candidates.append({"frame": frame, "valid_fraction": ratio, "distance_to_patch_m": distance})
            if valid.all() and (best is None or distance < best["distance"]):
                best = {"frame": frame, "center": tile_center, "uv": uv, "distance": distance}
        if index % 24 == 0:
            print("Checked material donors", index+1, "/ 96", flush=True)
    write_json(output/"donor-search.json", candidates)
    if best is None:
        raise ValueError("No fully depth-supported floor material tile; no fallback to unverified pixels")
    frame = best["frame"]
    rgb_path = image_dir/"scene_cam_00_final_hdf5"/f"frame.{frame:04d}.color.hdf5"
    rgb = h.tone_map(h.read_h5(rgb_path))
    texture = np.rint(bilinear(rgb.astype(float), best["uv"]-.5)).clip(0, 255).astype(np.uint8)
    Image.fromarray(texture).save(output/"material.png")
    np.savez_compressed(output/"source-texels.npz", source_uv_edge=best["uv"], source_frame=frame,
                        plane_points_m=atlas_points(best["center"], height))
    source_spacing = [float(np.median(np.linalg.norm(np.diff(best["uv"], axis=axis), axis=-1))) for axis in (1, 0)]
    source_bounds = best["uv"].reshape(-1, 2)
    write_json(output/"material.json", {
        "schema_version": 1, "kind": "floor-material", "origin": "source-derived-training-tile",
        "texture_sha256": sha256(output/"material.png"), "meters_per_tile": .4,
        "world_origin_xy_m": (best["center"]-.2).tolist(), "conditioning_frames": [frame],
        "source_rgb_sha256": sha256(rgb_path),
        "source_depth_sha256": sha256(image_dir/"scene_cam_00_geometry_hdf5"/f"frame.{frame:04d}.depth_meters.hdf5"),
        "source_texels_sha256": sha256(output/"source-texels.npz"), "fully_depth_supported": True,
        "source_footprint_px": [source_bounds.min(0).tolist(), source_bounds.max(0).tolist()],
        "median_source_pixels_per_texel": source_spacing, "atlas_resolution": [128, 128],
        "depth_tolerance_m": .008, "donor_distance_to_patch_m": best["distance"],
        "license": "CC-BY-SA-3.0", "attribution": "Apple Hypersim; underlying scene assets by Evermotion",
        "limitations": "Repeated/mirrored appearance in missing region is inferred, not observed there."})
    print("Selected frame", frame, "distance", best["distance"], flush=True)


def load_material(material):
    meta = json.loads((material/"material.json").read_text())
    if set(meta) != MATERIAL_KEYS or meta["schema_version"] != 1:
        raise ValueError("Unsupported material manifest")
    if meta["kind"] != "floor-material" or meta["origin"] != "source-derived-training-tile":
        raise ValueError("Explicit verified source material required; a rejected room edit is not a material")
    if meta["fully_depth_supported"] is not True or len(meta["conditioning_frames"]) != 1 or not set(meta["conditioning_frames"]) <= set(TRAIN):
        raise ValueError("Unsupported or withheld conditioning")
    if sha256(material/"material.png") != meta["texture_sha256"] or sha256(material/"source-texels.npz") != meta["source_texels_sha256"]:
        raise ValueError("Material bytes changed")
    size = meta["meters_per_tile"]
    origin = np.array(meta["world_origin_xy_m"], float)
    if not np.isfinite(size) or not .05 <= size <= 2 or origin.shape != (2,) or not np.isfinite(origin).all():
        raise ValueError("Invalid metric UV mapping")
    image = Image.open(material/"material.png")
    if image.mode != "RGB":
        raise ValueError("Opaque RGB material required")
    texture = np.array(image)
    if not 64 <= min(texture.shape[:2]) <= max(texture.shape[:2]) <= 1024 or (texture.max(-1) <= 8).mean() > .01:
        raise ValueError("Invalid material image")
    return meta, texture, origin, size


def apply(material, geometry, output):
    import open3d as o3d
    meta, texture, origin, size = load_material(material)
    report = json.loads((geometry/"report.json").read_text())
    if sha256(geometry/"candidate.ply") != report["candidate_sha256"]:
        raise ValueError("Geometry bytes changed")
    mesh = o3d.io.read_triangle_mesh(str(geometry/"candidate.ply"))
    original_path = h.ROOT/".local/reconstruction/genrc-pilot-input-v1/room.ply"
    if sha256(original_path) != report["source_mesh_sha256"]:
        raise ValueError("Source bytes changed")
    original = o3d.io.read_triangle_mesh(str(original_path))
    n = len(original.vertices)
    with np.load(geometry/"provenance.npz", allow_pickle=False) as z:
        pixels, mask, distances = z["added_vertex_target_pixels"], z["added_mask"], z["color_nearest_distance_m"]
    v, f, old = np.asarray(mesh.vertices).copy(), np.asarray(mesh.triangles).copy(), np.asarray(mesh.vertex_colors).copy()
    if len(pixels) != len(v)-n or mask.shape != (512, 512) or mask.dtype != bool or distances.shape != mask.shape:
        raise ValueError("Invalid geometry provenance")
    if np.any(pixels < 0) or np.any(pixels >= mask.size):
        raise ValueError("Out-of-range provenance")
    colors, uv, weight = texture_colors(old[n:], v[n:], pixels, mask, distances, texture, origin, size)
    mesh.vertex_colors = o3d.utility.Vector3dVector(np.concatenate([old[:n], colors]))
    output.mkdir(parents=True, exist_ok=False)
    o3d.io.write_triangle_mesh(str(output/"candidate.ply"), mesh)
    reread = o3d.io.read_triangle_mesh(str(output/"candidate.ply"))
    if not np.array_equal(v, np.asarray(reread.vertices)) or not np.array_equal(f, np.asarray(reread.triangles)):
        raise ValueError("Geometry changed during material application")
    # PLY color encoding quantizes to uint8; check original color preservation after reload.
    if not np.array_equal(np.asarray(reread.vertex_colors)[:n], old[:n]):
        raise ValueError("Original source colors changed")
    K, pose = np.array(report["camera"]["K"]), np.array(report["camera"]["world_from_cv_m"])
    baseline = o3d.io.read_triangle_mesh(str(geometry/"candidate.ply"))
    max_depth_change = 0.
    for label, dx in (("target", 0), ("left", -.1), ("right", .1)):
        offset = pose.copy()
        offset[:3, 3] += pose[:3, 0]*dx
        before_depth, before_rgb = render(baseline, K, offset)
        after_depth, after_rgb = render(reread, K, offset)
        if not np.array_equal(before_depth, after_depth):
            raise ValueError("Texture stage changed raycast geometry")
        Image.fromarray(after_rgb).save(output/f"candidate-{label}.png")
        Image.fromarray(before_rgb).save(output/f"before-{label}.png")
        if label == "target":
            changed = np.any(before_rgb != after_rgb, axis=-1)
            if (changed & ~mask).any():
                raise ValueError("Protected target pixels changed")
            Image.fromarray(changed.astype(np.uint8)*255).save(output/"changed-mask.png")
    np.savez_compressed(output/"material-provenance.npz", added_vertex_uv=uv, blend_weight=weight,
                        added_vertex_target_pixels=pixels, generated_geometry=False)
    write_json(output/"report.json", {
        "status": "candidate-pending-visual-review", "method": "Depth-verified source atlas, world XY UV, local-color detail transfer",
        "material": meta, "geometry_input_sha256": report["candidate_sha256"],
        "candidate_sha256": sha256(output/"candidate.ply"), "script_sha256": sha256(Path(__file__)),
        "source_mesh_sha256": report["source_mesh_sha256"], "geometry_arrays_identical": True,
        "original_vertex_colors_identical": True, "target_protected_pixels_changed": 0,
        "raycast_depth_identical_target_left_right": True, "max_depth_change_m": max_depth_change,
        "modified_supplement_vertices": int(np.any(colors != old[n:], axis=1).sum()),
        "detail_clamp_rgb": .12, "seam_fade_distance_m": [.005, .065],
        "uv_rule": "world XY mirrored repeat; camera-independent",
        "limitations": ["No new image model or learned depth ran.", "Repeated source material is inferred at destination.",
                       "Only the existing repaired floor patch is affected; remaining room holes persist.",
                       "The mesh stores sampled vertex colors rather than a native GPU texture."]})
    print((output/"report.json").read_text())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["prepare", "apply"])
    parser.add_argument("--geometry", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--material", type=Path)
    args = parser.parse_args()
    if args.action == "prepare":
        prepare(args.output, args.geometry)
    else:
        if args.material is None:
            parser.error("apply requires --material")
        apply(args.material, args.geometry, args.output)
