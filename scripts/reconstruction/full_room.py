"""All-view demonstration reconstruction and global completion, separate from r03."""
import argparse
import csv
import json
from pathlib import Path
import time

import numpy as np
import open3d as o3d
from PIL import Image

import hypersim as h
from genrc_contract import sha256, write_json
from source_completion import render


def context():
    data = h.ROOT/".local/reconstruction/data-r03"
    fixture = h.ROOT/"docs/research/hypersim/ai_001_004-r03.json"
    config = h.config(fixture)
    manifest = h.verify_manifest(data, config, fixture)
    camera_path = h.ROOT/".local/reconstruction/runs/ai_001_004-r03/cameras.json"
    expected_camera_hash = json.loads((camera_path.parent/"report.json").read_text())["output_sha256"]["cameras.json"]
    if sha256(camera_path) != expected_camera_hash:
        raise ValueError("Supplied r03 camera file changed")
    cameras = json.loads(camera_path.read_text())["cameras"]
    poses = {v["frame"]: np.array(v["world_from_cv_m"]) for v in cameras}
    if sorted(poses) != list(range(100)):
        raise ValueError("All 100 calibrated views required")
    with (data/"camera_parameters.csv").open() as f:
        row = next(r for r in csv.DictReader(f) if r["scene_name"] == config["scene"])
    matrix = np.array([[float(row[f"M_cam_from_uv_{i}{j}"]) for j in range(3)] for i in range(3)])
    unit = h.rays(matrix, 1024, 768)
    K = np.array([[1024/(2*matrix[0, 0]), 0, 512], [0, 768/(2*matrix[1, 1]), 384], [0, 0, 1.]])
    return data, poses, unit, K, manifest


def load(data, frame, kind):
    category = "final" if kind == "color" else "geometry"
    return h.read_h5(data/"ai_001_004/images"/f"scene_cam_00_{category}_hdf5"/f"frame.{frame:04d}.{kind}.hdf5")


def topology(mesh):
    f = np.asarray(mesh.triangles)
    edges = np.sort(np.concatenate([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]]), axis=1)
    _, counts = np.unique(edges, return_counts=True, axis=0)
    return {"vertices": len(mesh.vertices), "triangles": len(f),
            "boundary_edges": int((counts == 1).sum()), "nonmanifold_edges": int((counts > 2).sum()),
            "note": "Edge incidence only; zero boundaries is not a self-intersection test."}


def reconstruct(output):
    started = time.monotonic()
    data, poses, unit, K, manifest = context()
    output.mkdir(parents=True, exist_ok=False)
    # Open3D integer-center calibration is edge-coordinate calibration minus half a pixel.
    intrinsic = o3d.camera.PinholeCameraIntrinsic(1024, 768, K[0, 0], K[1, 1], K[0, 2]-.5, K[1, 2]-.5)
    volume = o3d.pipelines.integration.ScalableTSDFVolume(voxel_length=.015, sdf_trunc=.06,
        color_type=o3d.pipelines.integration.TSDFVolumeColorType.RGB8)
    for frame in range(100):
        depth = load(data, frame, "depth_meters")*-unit[..., 2]
        valid = np.isfinite(depth) & (depth > .1) & (depth <= 12)
        depth = np.where(valid, depth, 0).astype(np.float32)
        color = h.tone_map(load(data, frame, "color"))
        rgbd = o3d.geometry.RGBDImage.create_from_color_and_depth(
            o3d.geometry.Image(np.ascontiguousarray(color)), o3d.geometry.Image(np.ascontiguousarray(depth)),
            depth_scale=1, depth_trunc=12, convert_rgb_to_intensity=False)
        volume.integrate(rgbd, intrinsic, np.linalg.inv(poses[frame]))
        if frame % 10 == 0:
            print("Integrated", frame+1, "/100", flush=True)
    mesh = volume.extract_triangle_mesh()
    mesh.compute_vertex_normals()
    cloud = volume.extract_point_cloud()
    if not cloud.has_normals():
        raise ValueError("TSDF oriented points required")
    o3d.io.write_triangle_mesh(str(output/"room.ply"), mesh)
    o3d.io.write_point_cloud(str(output/"oriented-points.ply"), cloud)
    write_json(output/"report.json", {
        "method": "All-100-view supplied-depth TSDF, 15mm voxels, 60mm truncation, full-resolution integration",
        "role": "demonstration-candidate-not-heldout-reconstruction", "conditioning_frames": list(range(100)),
        "evaluation_policy": "All source views are conditioning; source consistency is not held-out accuracy",
        "mesh_sha256": sha256(output/"room.ply"), "input_manifest_sha256": sha256(data/"manifest.json"),
        "oriented_points_sha256": sha256(output/"oriented-points.ply"),
        "upstream_commit": manifest["upstream_commit"], "seconds": time.monotonic()-started,
        "topology": topology(mesh), "bounds_m": [mesh.get_min_bound().tolist(), mesh.get_max_bound().tolist()],
        "script_sha256": sha256(Path(__file__)), "source_r03_preserved": True})
    print("Finished TSDF:", len(mesh.triangles), "triangles", flush=True)


def complete(source, output, method):
    output.mkdir(parents=True, exist_ok=False)
    report = json.loads((source/"report.json").read_text())
    if sha256(source/"room.ply") != report["mesh_sha256"]:
        raise ValueError("Source mesh changed")
    started = time.monotonic()
    mesh = o3d.io.read_triangle_mesh(str(source/"room.ply"))
    if method == "poisson":
        cloud_hash = sha256(source/"oriented-points.ply")
        if report.get("oriented_points_sha256") != cloud_hash:
            raise ValueError("Oriented point cloud changed")
        cloud = o3d.io.read_point_cloud(str(source/"oriented-points.ply"))
        print("Screened Poisson with", len(cloud.points), "oriented TSDF points", flush=True)
        mesh, density = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(
            cloud, depth=9, scale=1.05, linear_fit=True, n_threads=4)
        np.save(output/"support-density.npy", np.asarray(density))
        # Keep low-support closure explicitly; trimming density would reopen the mesh.
    else:
        raise ValueError("Only verified Poisson backend is supported in this Windows build")
    mesh.remove_degenerate_triangles()
    mesh.remove_duplicated_triangles()
    mesh.remove_unreferenced_vertices()
    mesh.compute_vertex_normals()
    o3d.io.write_triangle_mesh(str(output/"room.ply"), mesh)
    write_json(output/"report.json", {
        "method": method, "role": "inferred-completion-demonstration-candidate", "conditioning_frames": list(range(100)),
        "source_mesh_sha256": report["mesh_sha256"], "mesh_sha256": sha256(output/"room.ply"),
        "oriented_points_sha256": cloud_hash,
        "topology": topology(mesh), "seconds": time.monotonic()-started,
        "bounds_m": [mesh.get_min_bound().tolist(), mesh.get_max_bound().tolist()],
        "script_sha256": sha256(Path(__file__)), "limitations": [
            "Global closure is inferred, not independently observed.",
            "All 100 camera views are conditioning; no held-out accuracy claim.",
            "Inspect openings and source-depth contradictions before promotion."]})
    print(json.dumps(json.loads((output/"report.json").read_text()), indent=2))


def hybrid(source, completion, output):
    """Keep sharper measured surfaces; add only remote, noncontradicting Poisson patches."""
    from planar_completion import dense_filter
    data, poses, unit, K, _ = context()
    base_report = json.loads((source/"report.json").read_text())
    extra_report = json.loads((completion/"report.json").read_text())
    if sha256(source/"room.ply") != base_report["mesh_sha256"] or sha256(completion/"room.ply") != extra_report["mesh_sha256"]:
        raise ValueError("Input mesh changed")
    output.mkdir(parents=True, exist_ok=False)
    base = o3d.io.read_triangle_mesh(str(source/"room.ply"))
    extra = o3d.io.read_triangle_mesh(str(completion/"room.ply"))
    scene = o3d.t.geometry.RaycastingScene()
    scene.add_triangles(o3d.t.geometry.TriangleMesh.from_legacy(base))
    vertices = np.asarray(extra.vertices)
    distances = scene.compute_distance(o3d.core.Tensor(vertices.astype(np.float32))).numpy()
    faces = np.asarray(extra.triangles)
    # Include overlap edges, but never replace the complete observed room with a smoothed refit.
    selected = (distances[faces].max(1) > .025) & (distances[faces].min(1) > .004)
    within = np.all((vertices >= base.get_min_bound()-.02) & (vertices <= base.get_max_bound()+.02), axis=1)
    selected &= within[faces].all(1)
    faces = faces[selected]
    selected_count = len(faces)
    print("Checking", selected_count, "candidate inferred patches against all source depths", flush=True)
    faces, checks = dense_filter(vertices, faces, data/"ai_001_004/images/scene_cam_00_geometry_hdf5",
                                list(range(100)), poses, K, unit, tolerance=.035)
    used, inverse = np.unique(faces, return_inverse=True)
    v, f, c = np.asarray(base.vertices), np.asarray(base.triangles), np.asarray(base.vertex_colors)
    result = o3d.geometry.TriangleMesh(o3d.utility.Vector3dVector(np.concatenate([v, vertices[used]])),
        o3d.utility.Vector3iVector(np.concatenate([f, inverse.reshape(-1, 3)+len(v)])))
    result.vertex_colors = o3d.utility.Vector3dVector(np.concatenate([c, np.asarray(extra.vertex_colors)[used]]))
    o3d.io.write_triangle_mesh(str(output/"room.ply"), result)
    np.savez_compressed(output/"face-provenance.npz", observed_face_count=len(f),
                        inferred_face_ids=np.arange(len(f), len(f)+len(faces)), source_poisson_vertex_ids=used)
    write_json(output/"report.json", {
        "method": "All-view TSDF plus depth-filtered global Poisson gap patches",
        "role": "source-reconstruction-plus-inferred-completion", "conditioning_frames": list(range(100)),
        "source_mesh_sha256": base_report["mesh_sha256"], "completion_mesh_sha256": extra_report["mesh_sha256"],
        "mesh_sha256": sha256(output/"room.ply"), "observed_faces": len(f), "inferred_faces": len(faces),
        "proposed_inferred_faces": selected_count, "depth_checks": checks,
        "original_all_view_arrays_preserved": True, "topology": topology(result),
        "bounds_m": [result.get_min_bound().tolist(), result.get_max_bound().tolist()],
        "navigation_bounds_m": base_report["bounds_m"], "script_sha256": sha256(Path(__file__)),
        "limitations": ["Hidden closure is inferred. No claim of recovered original hidden objects.",
                       "Source consistency uses all conditioning views, not held-out tests.",
                       "Overlapping supplementary surfaces are not a watertight solid."]})
    print("Saved hybrid; inferred faces", len(faces), flush=True)


def recover(source, output):
    """Recover source RGBD triangles omitted by volumetric fusion, across all views."""
    from genrc_geometry import triangulate
    data, poses, unit, K, _ = context()
    report = json.loads((source/"report.json").read_text())
    if sha256(source/"room.ply") != report["mesh_sha256"]:
        raise ValueError("Source changed")
    output.mkdir(parents=True, exist_ok=False)
    base = o3d.io.read_triangle_mesh(str(source/"room.ply"))
    scene = o3d.t.geometry.RaycastingScene()
    scene.add_triangles(o3d.t.geometry.TriangleMesh.from_legacy(base))
    # Full source grid, correctly calibrated pixel centers.
    yy, xx = np.indices((768, 1024))
    cv_rays = np.stack([xx+.5, yy+.5, np.ones_like(xx)], -1) @ np.linalg.inv(K).T
    vertices, colors, faces = [np.asarray(base.vertices)], [np.asarray(base.vertex_colors)], [np.asarray(base.triangles)]
    count = len(base.vertices)
    records = []
    bounds = [np.asarray(report["bounds_m"][0])-.02, np.asarray(report["bounds_m"][1])+.02]
    for frame in range(100):
        pose = poses[frame]
        directions = cv_rays @ pose[:3, :3].T
        rays = np.concatenate([np.broadcast_to(pose[:3, 3], directions.shape), directions], -1).astype(np.float32)
        predicted = scene.cast_rays(o3d.core.Tensor(rays))["t_hit"].numpy()
        z = load(data, frame, "depth_meters")*-unit[..., 2]
        valid = np.isfinite(z) & (z > .1) & (z <= 12)
        active = valid & (~np.isfinite(predicted) | (predicted > z+.035))
        if active.any():
            points, triangles = triangulate(np.where(valid, z, np.nan), K, pose, active, valid, bounds, max_edge=.05)
            used, inverse = np.unique(triangles, return_inverse=True)
            rgb = h.tone_map(load(data, frame, "color"))
            vertices.append(points[used])
            colors.append(rgb.reshape(-1, 3)[used]/255)
            faces.append(inverse.reshape(-1, 3)+count)
            records.append({"frame": frame, "first_vertex": count, "vertices": len(used),
                            "triangles": len(triangles), "active_pixels": int(active.sum())})
            count += len(used)
        if frame % 20 == 0:
            print("Recovered source view", frame, "vertices", count-len(base.vertices), flush=True)
    result = o3d.geometry.TriangleMesh(o3d.utility.Vector3dVector(np.concatenate(vertices)),
                                      o3d.utility.Vector3iVector(np.concatenate(faces)))
    result.vertex_colors = o3d.utility.Vector3dVector(np.concatenate(colors))
    o3d.io.write_triangle_mesh(str(output/"room.ply"), result)
    write_json(output/"source-patches.json", records)
    write_json(output/"report.json", {
        **report, "method": report["method"]+" and full-resolution source-triangle gap recovery",
        "mesh_sha256": sha256(output/"room.ply"), "parent_mesh_sha256": report["mesh_sha256"],
        "source_recovered_faces": len(result.triangles)-len(base.triangles),
        "source_recovered_vertices": count-len(base.vertices), "source_recovery_frames": [r["frame"] for r in records],
        "bounds_m": [result.get_min_bound().tolist(), result.get_max_bound().tolist()],
        "topology": topology(result), "script_sha256": sha256(Path(__file__)),
        "provenance_ranges": {"tsdf_faces": [0, report["observed_faces"]],
                              "inferred_faces": [report["observed_faces"], len(base.triangles)],
                              "source_patch_faces": [len(base.triangles), len(result.triangles)]}})
    print("Source recovery complete", len(result.triangles), "triangles", flush=True)


def evaluate(folder):
    data, poses, unit, K, _ = context()
    report = json.loads((folder/"report.json").read_text())
    if sha256(folder/"room.ply") != report["mesh_sha256"]:
        raise ValueError("Candidate hash mismatch")
    mesh = o3d.io.read_triangle_mesh(str(folder/"room.ply"))
    scene = o3d.t.geometry.RaycastingScene()
    scene.add_triangles(o3d.t.geometry.TriangleMesh.from_legacy(mesh))
    yy, xx = np.indices((192, 256))
    # Sample exact original source pixel centers, every fourth source pixel.
    directions_cv = np.stack([xx*4+.5, yy*4+.5, np.ones_like(xx)], -1) @ np.linalg.inv(K).T
    metrics = []
    for frame in range(100):
        pose = poses[frame]
        directions = directions_cv @ pose[:3, :3].T
        rays = np.concatenate([np.broadcast_to(pose[:3, 3], directions.shape), directions], -1).astype(np.float32)
        hit = scene.cast_rays(o3d.core.Tensor(rays))
        predicted = hit["t_hit"].numpy()
        reference = (load(data, frame, "depth_meters")*-unit[..., 2])[::4, ::4]
        valid = np.isfinite(reference) & (reference > .1) & (reference <= 12)
        overlap = valid & np.isfinite(predicted)
        error = np.abs(reference[overlap]-predicted[overlap])
        metrics.append({"frame": frame, "valid_reference": int(valid.sum()), "mesh_hits": int(overlap.sum()),
                        "source_background_pixels": int((~np.isfinite(reference)).sum()),
                        "mesh_hits_on_source_background": int((~np.isfinite(reference) & np.isfinite(predicted)).sum()),
                        "coverage": float(overlap.sum()/max(valid.sum(), 1)),
                        "mae_m": float(error.mean()) if len(error) else None,
                        "p95_m": float(np.quantile(error, .95)) if len(error) else None,
                        "within_5cm_fraction_of_all_valid": float((error <= .05).sum()/max(valid.sum(), 1)),
                        "contradiction_over_5cm": int((overlap & (predicted < reference-.05)).sum())})
        if frame in (0, 5, 12, 37, 59, 62, 65, 68, 70, 87):
            preview_K = K.copy()
            preview_K[:2] /= 2
            _, rgb = render(mesh, preview_K, pose, (384, 512))
            Image.fromarray(rgb).save(folder/f"view-{frame:04d}.png")
    write_json(folder/"consistency.json", {
        "type": "all-conditioning-source-consistency-not-heldout", "frames": metrics,
        "mean_coverage": float(np.mean([m["coverage"] for m in metrics])),
        "worst_coverage": float(min(m["coverage"] for m in metrics)),
        "mean_per_view_mae_m": float(np.mean([m["mae_m"] for m in metrics if m["mae_m"] is not None])),
        "contradiction_fraction": sum(m["contradiction_over_5cm"] for m in metrics)/sum(m["valid_reference"] for m in metrics),
        "source_background_hit_fraction": sum(m["mesh_hits_on_source_background"] for m in metrics)/max(1, sum(m["source_background_pixels"] for m in metrics)),
        "mesh_sha256": report["mesh_sha256"]})
    print((folder/"consistency.json").read_text()[-600:], flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["reconstruct", "complete", "hybrid", "recover", "evaluate"])
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--source", type=Path)
    parser.add_argument("--completion", type=Path)
    parser.add_argument("--method", choices=["poisson"], default="poisson")
    args = parser.parse_args()
    if args.action == "reconstruct":
        reconstruct(args.output)
    elif args.action == "complete":
        if not args.source:
            parser.error("complete requires --source")
        complete(args.source, args.output, args.method)
    elif args.action == "hybrid":
        if not args.source or not args.completion:
            parser.error("hybrid requires --source and --completion")
        hybrid(args.source, args.completion, args.output)
    elif args.action == "recover":
        if not args.source:
            parser.error("recover requires --source")
        recover(args.source, args.output)
    else:
        evaluate(args.output)
