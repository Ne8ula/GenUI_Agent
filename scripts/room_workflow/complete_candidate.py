"""CPU fusion and explicitly assumed single-room enclosure of an executed estimate.

Uses only the model's RGB-derived geometry/cameras and original RGB. This is not
metric reconstruction, a learned completion model, or a confirmed room boundary.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from geometry import MAX_FACES, MAX_VERTICES, add_room_shell, filter_boundary, normals, validate_boundary
from review_result import crop_bounds, make_scene, render, require_executed, source_image, validate_files


def arrays(mesh):
    return (np.asarray(mesh["positions"], float).reshape(-1, 3),
            np.asarray(mesh["colors"], float).reshape(-1, 3),
            np.asarray(mesh["indices"], np.int32).reshape(-1, 3))


def geometry_hash(mesh):
    digest = hashlib.sha256()
    for key in ("positions", "colors", "indices"):
        digest.update(key.encode())
        digest.update(np.asarray(mesh[key], dtype="<u4" if key == "indices" else "<f4").tobytes())
    return digest.hexdigest()


def validate_field_alignment(original, supplemental):
    """Exact camera and retained geometry agreement is required before mixing."""
    for key in ("original_inputs_sha256", "analysis_geometry_sha256"):
        if original.get(key) != supplemental.get(key):
            raise ValueError("Numerical sidecar baseline changed; new analysis review required")
    if original["arms"]["A"]["cameras"] != supplemental["arms"]["A"]["cameras"]:
        raise ValueError("Numerical sidecar cameras changed; new analysis review required")
    if original["preprocessing"] != supplemental["preprocessing"]:
        raise ValueError("Numerical sidecar image transform changed")
    # Source implementation fingerprint can differ solely because field export
    # was added. Never silently substitute a different checkpoint/estimator.
    for key in ("vggt_model", "vggt_checkpoint_revision", "vggt_source_revision", "branches"):
        if original["estimator"].get(key) != supplemental["estimator"].get(key):
            raise ValueError("Numerical sidecar estimator changed")


def field_mask(fields, index, percentile):
    if not 0 <= percentile <= 25:
        raise ValueError("Confidence exclusion must remain within 0 to 25 percent")
    depth, confidence = fields["depth"][index], fields["confidence"][index]
    valid = fields["image_valid"][index].astype(bool) & np.isfinite(depth) & (depth > 1e-6) & np.isfinite(confidence)
    if valid.sum() < 100:
        raise ValueError("Insufficient finite numerical depth")
    threshold = float(np.quantile(confidence[valid], percentile/100))
    return valid & (confidence >= threshold), threshold


def validate_reviewed_boundary(packet, analysis):
    """Validate review data only. The calling broker owns user authorization."""
    expected = {"version", "coordinate_frame", "analysis_binding", "boundary", "openings"}
    if not isinstance(packet, dict) or set(packet) != expected:
        raise ValueError("Reviewed boundary requires exact supported fields")
    if type(packet["version"]) is not int or packet["version"] != 1 or packet["coordinate_frame"] != "analysis":
        raise ValueError("Unsupported reviewed boundary version or coordinate frame")
    expected_binding = analysis.get("analysis_binding")
    keys = {"analysis_geometry_sha256", "model_config_sha256", "original_inputs_sha256"}
    if (not isinstance(expected_binding, dict) or set(expected_binding) != keys
            or packet["analysis_binding"] != expected_binding):
        raise ValueError("Reviewed boundary source binding differs")
    if any(analysis.get(key) != expected_binding[key] for key in keys):
        raise ValueError("Analysis binding disagrees with analysis fields")
    if geometry_hash(analysis["arms"]["A"]["geometry"]) != expected_binding["analysis_geometry_sha256"]:
        raise ValueError("Analysis geometry differs from reviewed source binding")
    boundary, openings = copy.deepcopy(packet["boundary"]), copy.deepcopy(packet["openings"])
    polygon = boundary.get("polygon") if isinstance(boundary, dict) else None
    if (not isinstance(polygon, list) or any(not isinstance(point, list) or len(point) != 2
            or any(type(value) not in (int, float) for value in point) for point in polygon)):
        raise ValueError("Reviewed polygon coordinates must be numeric pairs")
    validate_boundary(boundary)
    # This exercises all opening shape, bounds, overlap and identifier guards
    # before any expensive fusion. Empty source geometry is never returned.
    probe = {"positions": [], "colors": [], "indices": [], "provenance": [], "source_view_indices": []}
    add_room_shell(probe, boundary, openings)
    return boundary, openings


def checked_fields(analysis, fields_result):
    """Strictly unpack a bound numerical result without filesystem access."""
    from prediction_fields import unpack
    require_executed(analysis)
    require_executed(fields_result)
    validate_field_alignment(analysis, fields_result)
    packed = fields_result.get("prediction_fields")
    expected = {"format", "image_ids", "shape", "bytes", "sha256", "data_base64", "meaning"}
    if not isinstance(packed, dict) or set(packed) != expected:
        raise ValueError("Numerical sidecar has unsupported fields")
    sources = analysis.get("original_input_hashes")
    cameras = analysis["arms"]["A"]["cameras"]
    if (not isinstance(sources, list) or len(sources) != len(cameras)
            or any(not isinstance(s, dict) or set(s) != {"id", "sha256"} for s in sources)
            or [s["id"] for s in sources] != [c["image_id"] for c in cameras]
            or packed["image_ids"] != [s["id"] for s in sources]
            or fields_result.get("original_input_hashes") != sources):
        raise ValueError("Numerical sidecar source identities differ")
    if len(analysis["preprocessing"]) != len(sources):
        raise ValueError("Missing per-source preprocessing")
    for camera, transform in zip(cameras, analysis["preprocessing"]):
        crop_bounds(transform)
        k, pose = np.asarray(camera["intrinsics"]), np.asarray(camera["world_to_camera"])
        if (k.shape != (3, 3) or pose.shape != (3, 4) or not np.isfinite(k).all()
                or not np.isfinite(pose).all() or min(k[0, 0], k[1, 1]) <= 0
                or not np.allclose(pose[:, :3].T@pose[:, :3], np.eye(3), atol=1e-4)
                or not np.isclose(np.linalg.det(pose[:, :3]), 1, atol=1e-4)):
            raise ValueError("Invalid numerical sidecar calibration")
    return unpack(packed), copy.deepcopy(sources)


def bound_fused_mesh(vertices, colors, faces, boundary, openings, *, minimum_faces=100):
    """General polygon containment, including concave notches and explicit caps."""
    validate_boundary(boundary)
    inside = filter_boundary(vertices, faces, boundary)
    if inside.sum() < minimum_faces:
        raise ValueError("Too little geometry survives the reviewed boundary")
    bounded = package(vertices, colors, faces[inside])
    bounded["boundary_policy"] = "whole-face containment in supplied reviewed simple polygon; no inferred expansion"
    candidate = copy.deepcopy(bounded)
    add_room_shell(candidate, boundary, openings)
    candidate["representation"] = "TSDF-fused-estimate-plus-authored-enclosure"
    return bounded, candidate, inside


def complete_from_fields(analysis, fields_result, reviewed_boundary, *, voxel=.009, confidence_percentile=5):
    """In-memory CPU conversion for a caller that already authorized review.

    Call the application's full result contract validator before this converter.
    This function additionally checks critical numerical and source bindings.
    It does not authorize anything, read/write files, acquire models, transform
    the coordinate frame, or change cameras/raw geometry. A supplied polygon
    remains exact, including concave regions; partial triangles are discarded.
    """
    if not isinstance(voxel, (int, float)) or isinstance(voxel, bool) or not .003 <= voxel <= .05:
        raise ValueError("Voxel outside bounded CPU range")
    if not isinstance(confidence_percentile, (int, float)) or isinstance(confidence_percentile, bool) or not 0 <= confidence_percentile <= 25:
        raise ValueError("Confidence exclusion outside supported range")
    boundary, openings = validate_reviewed_boundary(reviewed_boundary, analysis)
    fields, sources = checked_fields(analysis, fields_result)
    fused, records = fuse(analysis, {"images": sources}, voxel, fields, confidence_percentile)
    v, c, f = np.asarray(fused.vertices), np.asarray(fused.vertex_colors), np.asarray(fused.triangles)
    bounded, candidate, inside = bound_fused_mesh(v, c, f, boundary, openings)
    return {"geometry": candidate, "fused_geometry": bounded,
            "raw_geometry": copy.deepcopy(analysis["arms"]["A"]["geometry"]),
            "cameras": copy.deepcopy(analysis["arms"]["A"]["cameras"]),
            "boundary": boundary, "openings": openings, "original_to_candidate_rotation": np.eye(3).tolist(),
            "source_analysis_binding": copy.deepcopy(analysis["analysis_binding"]),
            "candidate_geometry_sha256": geometry_hash(candidate), "fused_geometry_sha256": geometry_hash(bounded),
            "numerical_fields_sha256": fields_result["prediction_fields"]["sha256"],
            "numerical_fields_model_config_sha256": fields_result["model_config_sha256"],
            "source_inputs": records, "confidence_excluded_lower_percentile": confidence_percentile,
            "bounded_triangles": int(inside.sum()), "discarded_outside_boundary_triangles": int((~inside).sum()),
            "authored_shell_triangles": len(candidate["indices"])//3-int(inside.sum()),
            "review_scope": "caller-supplied review data; this conversion grants no authority",
            "units": "relative"}


def package(vertices, colors, faces, category="photo-estimated"):
    if not np.isfinite(vertices).all() or not np.isfinite(colors).all():
        raise ValueError("Nonfinite geometry")
    if (vertices.ndim != 2 or vertices.shape[1] != 3 or colors.shape != vertices.shape
            or faces.ndim != 2 or faces.shape[1] != 3 or not np.issubdtype(faces.dtype, np.integer)
            or len(faces) == 0 or faces.min() < 0 or faces.max() >= len(vertices)):
        raise ValueError("Invalid mesh arrays")
    if len(faces) > MAX_FACES:
        raise ValueError("Mesh exceeds face resource cap")
    used, inverse = np.unique(faces, return_inverse=True)
    if len(used) > MAX_VERTICES:
        raise ValueError("Mesh exceeds vertex resource cap")
    vertices, colors, faces = vertices[used], colors[used], inverse.reshape(-1, 3)
    return {"positions": vertices.ravel().tolist(), "colors": np.clip(colors, 0, 1).ravel().tolist(),
            "indices": faces.ravel().tolist(), "normals": normals(vertices, faces).ravel().tolist(),
            "provenance": [category]*len(faces), "source_view_indices": [-1]*len(faces),
            "units": "relative", "representation": "TSDF-fused-estimated-depth",
            "boundary_policy": "provisional fitted one-room rectangle; not owner confirmed"}


def clip_rectangle(vertices, faces, boundary):
    """Whole triangles must be inside: never bridge a clipped boundary."""
    polygon = np.asarray(boundary["polygon"])
    lo = np.r_[polygon.min(0), boundary["floor"]]
    hi = np.r_[polygon.max(0), boundary["ceiling"]]
    return ((vertices[faces] >= lo-1e-8) & (vertices[faces] <= hi+1e-8)).all((1, 2))


def fit_envelope(vertices, centers, distance=.018):
    """Dominant low horizontal plane + orthogonal dominant wall orientation.

    The approximate camera-up direction only selects a plausible floor normal;
    the final normal and offsets are fitted to actual model points. Opposing
    supported wall planes are preferred over extents that can include hallways.
    """
    import open3d as o3d
    o3d.utility.random.seed(20261020)
    cloud = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(vertices)).voxel_down_sample(distance*.75)
    planes = []
    for _ in range(16):
        if len(cloud.points) < 120:
            break
        equation, indices = cloud.segment_plane(distance, 3, 1500)
        if len(indices) < 100:
            break
        points = np.asarray(cloud.points)[indices].copy()
        planes.append({"equation": np.asarray(equation), "points": points, "support": len(points)})
        cloud = cloud.select_by_index(indices, invert=True)
    floors = [p for p in planes if abs(p["equation"][2]) > .8
              and np.median(p["points"][:, 2]) < np.median(centers[:, 2])-.25]
    if not floors:
        raise ValueError("No supported low floor plane; manual boundary required")
    floor_plane = max(floors, key=lambda p: p["support"])
    up = floor_plane["equation"][:3].copy()
    if up[2] < 0:
        up *= -1
    walls = [p for p in planes if abs(p["equation"][:3]@up) < .18]
    if not walls:
        raise ValueError("No supported vertical wall plane")
    wall = max(walls, key=lambda p: p["support"])
    right = wall["equation"][:3].copy()
    right -= up*(right@up)
    right /= np.linalg.norm(right)
    if right[0] < 0:
        right *= -1
    basis = np.array([right, np.cross(up, right), up])
    v, cams = vertices@basis.T, centers@basis.T
    floor = float(np.median(floor_plane["points"]@up)-distance)
    # Ceiling is often unseen in casual photos. This is an explicit assumption.
    ceiling = float(np.quantile(v[:, 2], .995)+distance)
    bounds, evidence = [], []
    for axis in (0, 1):
        candidates = []
        for p in walls:
            normal = p["equation"][:3]@basis.T
            points = p["points"]@basis.T
            # Low vertical furniture fronts must not masquerade as room walls.
            if abs(normal[axis]) > .96 and np.ptp(points[:, 2]) > (ceiling-floor)*.45:
                candidates.append((float(np.median(points[:, axis])), p["support"],
                                   float(np.quantile(points[:, axis], .02)),
                                   float(np.quantile(points[:, axis], .98))))
        center = float(np.median(cams[:, axis]))
        lower = [p for p in candidates if p[0] < min(center-.08, cams[:, axis].min()-.02)]
        upper = [p for p in candidates if p[0] > max(center+.08, cams[:, axis].max()+.02)]
        # Most supported enclosing walls, not the furthest visible room.
        low = max(lower, key=lambda p: p[1])[2]-distance if lower else float(np.quantile(v[:, axis], .005)-distance)
        high = max(upper, key=lambda p: p[1])[3]+distance if upper else float(np.quantile(v[:, axis], .995)+distance)
        if not low < cams[:, axis].min() <= cams[:, axis].max() < high:
            raise ValueError("Fitted room excludes a source camera; manual review required")
        bounds.append((low, high))
        evidence.append({"axis": axis, "wall_candidates": candidates,
                         "lower_origin": "supported-plane" if lower else "assumed-quantile",
                         "upper_origin": "supported-plane" if upper else "assumed-quantile"})
    (x0, x1), (y0, y1) = bounds
    boundary = {"polygon": [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
                "floor": floor, "ceiling": ceiling}
    return basis, boundary, {"floor_normal_original": up.tolist(),
                            "floor_support": floor_plane["support"], "axes": evidence,
                            "ceiling_origin": "assumed upper .995 model-point quantile plus margin",
                            "plane_distance_relative": distance,
                            "planes": [{"equation": p["equation"].tolist(), "support": p["support"]}
                                       for p in planes]}


def fuse(result, request, voxel=.009, fields=None, confidence_percentile=5):
    import open3d as o3d
    arm = result["arms"]["A"]
    vertices, colors, faces = arrays(arm["geometry"])
    source_ids = np.asarray(arm["geometry"]["source_view_indices"])
    volume = o3d.pipelines.integration.ScalableTSDFVolume(
        voxel_length=voxel, sdf_trunc=voxel*4,
        color_type=o3d.pipelines.integration.TSDFVolumeColorType.RGB8)
    records = []
    for i, (record, camera, transform) in enumerate(zip(request["images"], arm["cameras"], result["preprocessing"])):
        left, top, right, bottom = crop_bounds(transform)
        if fields is None:
            own_faces = faces[source_ids == i]
            scene = make_scene(vertices, own_faces)
            _, depth = render(scene, vertices, colors, own_faces, camera, transform["model_size"])
            valid = np.zeros_like(depth, dtype=bool)
            valid[top:bottom, left:right] = True
            valid &= np.isfinite(depth) & (depth > 0)
            threshold = None
            rgb = np.zeros((*depth.shape, 3), np.uint8)
            rgb[top:bottom, left:right] = np.asarray(source_image(record, transform))
        else:
            depth = fields["depth"][i]
            valid, threshold = field_mask(fields, i, confidence_percentile)
            rgb = np.rint(255*fields["rgb"][i]).clip(0, 255).astype(np.uint8)
        depth = np.where(valid, depth, 0).astype(np.float32)
        rgbd = o3d.geometry.RGBDImage.create_from_color_and_depth(
            o3d.geometry.Image(rgb), o3d.geometry.Image(depth), depth_scale=1.,
            depth_trunc=100., convert_rgb_to_intensity=False)
        k = np.asarray(camera["intrinsics"])
        intrinsic = o3d.camera.PinholeCameraIntrinsic(depth.shape[1], depth.shape[0],
                                                    k[0, 0], k[1, 1], k[0, 2], k[1, 2])
        extrinsic = np.eye(4)
        extrinsic[:3] = camera["world_to_camera"]
        volume.integrate(rgbd, intrinsic, extrinsic)
        records.append({"image_id": record["id"], "estimated_depth_pixels": int(valid.sum()),
                        "confidence_threshold": threshold,
                        "original_sha256": record["sha256"]})
    mesh = volume.extract_triangle_mesh()
    mesh.remove_degenerate_triangles()
    mesh.remove_duplicated_triangles()
    mesh.remove_unreferenced_vertices()
    return mesh, records


def write_mesh(path, geometry):
    import open3d as o3d
    v, c, f = arrays(geometry)
    mesh = o3d.geometry.TriangleMesh(o3d.utility.Vector3dVector(v), o3d.utility.Vector3iVector(f))
    mesh.vertex_colors = o3d.utility.Vector3dVector(c)
    mesh.compute_vertex_normals()
    if not o3d.io.write_triangle_mesh(str(path), mesh):
        raise RuntimeError("PLY export failed")
    return mesh


def run(result_path, request_path, output, voxel=.009, fields_result_path=None, confidence_percentile=5,
        boundary_packet=None):
    import open3d as o3d
    result, request = validate_files(result_path, request_path)
    if output.exists():
        raise ValueError("Output exists; retain variants by choosing a fresh directory")
    v, c, f = arrays(result["arms"]["A"]["geometry"])
    fields, field_evidence = None, None
    if fields_result_path is not None:
        from prediction_fields import unpack
        supplemental, _ = validate_files(fields_result_path, request_path)
        validate_field_alignment(result, supplemental)
        packed = supplemental["prediction_fields"]
        if packed["image_ids"] != [record["id"] for record in request["images"]]:
            raise ValueError("Numerical sidecar source order differs")
        fields = unpack(packed)
        field_evidence = {
            "result_sha256": hashlib.sha256(fields_result_path.read_bytes()).hexdigest(),
            "fields_sha256": packed["sha256"], "model_config_sha256": supplemental["model_config_sha256"],
            "source_analysis_binding": supplemental["analysis_binding"],
            "depth_source": "full estimated ML OpenCV-z fields, not supplied dataset depth",
            "confidence_excluded_lower_percentile": confidence_percentile,
            "confidence_meaning": "uncalibrated model score, not correctness probability",
            "baseline_match": "exact geometry fingerprint, cameras, image preprocessing and checkpoint"}
    centers = np.array([camera["center"] for camera in result["arms"]["A"]["cameras"]])
    openings = []
    if boundary_packet is None:
        basis, boundary, fitted = fit_envelope(v, centers)
    else:
        boundary, openings = validate_reviewed_boundary(boundary_packet, result)
        basis = np.eye(3)
        fitted = {"origin": "caller-supplied reviewed polygon in unchanged analysis coordinates",
                  "automatic_fit": False, "automatic_rotation": False}
    fused, inputs = fuse(result, request, voxel, fields, confidence_percentile)
    fv = np.asarray(fused.vertices)@basis.T
    fc, ff = np.asarray(fused.vertex_colors), np.asarray(fused.triangles)
    if boundary_packet is None:
        inside = clip_rectangle(fv, ff, boundary)
        if inside.sum() < 100:
            raise ValueError("Too little geometry survives the proposed boundary")
        bounded = package(fv, fc, ff[inside])
        candidate = json.loads(json.dumps(bounded))
        add_room_shell(candidate, boundary, [])
        candidate["completion"] = {
            "policy": "provisional-single-room-enclosure",
            "origin": "plane-fitted inferred bounds and assumed ceiling; NOT owner confirmed",
            "openings": "all unobserved portals closed by explicitly authored shell; door/window location unknown"}
        candidate["representation"] = "TSDF-fused-estimate-plus-authored-enclosure"
    else:
        bounded, candidate, inside = bound_fused_mesh(fv, fc, ff, boundary, openings)
    output.mkdir(parents=True)
    raw_geometry = package(v@basis.T, c, f)
    raw_geometry["representation"] = "original-estimated-depth-grid-reoriented-only"
    write_mesh(output/"raw-reoriented.ply", raw_geometry)
    write_mesh(output/"fused-unbounded.ply", package(fv, fc, ff))
    write_mesh(output/"fused-bounded.ply", bounded)
    candidate_mesh = write_mesh(output/"candidate.ply", candidate)
    (output/"candidate.json").write_text(json.dumps(candidate, separators=(",", ":")), encoding="utf-8")
    (output/"fused-bounded.json").write_text(json.dumps(bounded, separators=(",", ":")), encoding="utf-8")
    # Blue-noise-like surface samples preserve objects and uniform local spacing.
    o3d.utility.random.seed(20261020)
    points = candidate_mesh.sample_points_poisson_disk(90000, init_factor=3)
    o3d.io.write_point_cloud(str(output/"uniform-surface-points.ply"), points)
    rows, diagnostics = [], []
    cv, cc, cf = arrays(candidate)
    scene = make_scene(cv, cf)
    bv, bc, bf = arrays(bounded)
    observed_scene = make_scene(bv, bf)
    for record, camera, transform in zip(request["images"], result["arms"]["A"]["cameras"], result["preprocessing"]):
        new_camera = dict(camera)
        extrinsic = np.array(camera["world_to_camera"])
        extrinsic[:, :3] = extrinsic[:, :3]@basis.T
        new_camera["world_to_camera"] = extrinsic.tolist()
        rgb, depth = render(scene, cv, cc, cf, new_camera, transform["model_size"])
        observed_rgb, observed_depth = render(observed_scene, bv, bc, bf, new_camera, transform["model_size"])
        crop = crop_bounds(transform)
        source = source_image(record, transform)
        rendered = Image.fromarray(rgb).crop(crop)
        rendered.save(output/(record["id"]+"-completed.png"))
        row = Image.new("RGB", (source.width*2, source.height+26), "#171b21")
        row.paste(source, (0, 26)); row.paste(rendered, (source.width, 26))
        ImageDraw.Draw(row).text((6, 7), record["id"]+" | source / fused + assumed shell", fill="white")
        rows.append(row)
        l, t, r, b = crop
        hit = np.isfinite(observed_depth[t:b, l:r])
        error = np.abs(np.asarray(source).astype(float)-observed_rgb[t:b, l:r]).mean(2)
        diagnostics.append({"image_id": record["id"], "candidate_ray_hit_fraction": float(np.isfinite(depth[t:b, l:r]).mean()),
                            "fused_without_shell_hit_fraction": float(hit.mean()),
                            "fused_without_shell_rgb_mae_0_255_on_hits": float(error[hit].mean()) if hit.any() else None,
                            "meaning": "enclosure ray coverage only, not physical reconstruction accuracy"})
    sheet = Image.new("RGB", (rows[0].width, sum(row.height for row in rows)+45), "#171b21")
    boundary_label = "boundary unconfirmed" if boundary_packet is None else "supplied reviewed boundary"
    ImageDraw.Draw(sheet).text((6, 5), "CPU fusion of executed VGGT estimate | relative scale\nCompleted areas are authored assumptions; "+boundary_label, fill="white")
    y = 45
    for row in rows:
        sheet.paste(row, (0, y)); y += row.height
    sheet.save(output/"candidate-source-review.jpg", quality=93)
    report = {"version": 1, "status": "provisional-completion-candidate", "units": "relative",
              "boundary_confirmed": boundary_packet is not None, "boundary": boundary,
              "boundary_origin": "caller-supplied review data" if boundary_packet is not None else "automatic provisional fit",
              "openings": openings, "original_to_candidate_rotation": basis.tolist(),
              "input_result_sha256": hashlib.sha256(result_path.read_bytes()).hexdigest(),
              "input_request_sha256": hashlib.sha256(request_path.read_bytes()).hexdigest(),
              "source_analysis_binding": result["analysis_binding"],
              "candidate_geometry_sha256": geometry_hash(candidate),
              "fused_geometry_sha256": geometry_hash(bounded),
              "source_inputs": inputs, "plane_fit": fitted, "voxel_relative": voxel,
              "numerical_ml_fields": field_evidence,
              "raw_triangles": len(f), "fused_triangles": len(ff), "bounded_triangles": int(inside.sum()),
              "discarded_outside_boundary_triangles": int((~inside).sum()),
              "authored_shell_triangles": len(candidate["indices"])//3-int(inside.sum()),
              "uniform_surface_points": len(points.points), "source_camera_diagnostics": diagnostics,
              "provenance": {"photo-estimated": "TSDF merging of "+("full estimated VGGT depth fields" if fields is not None else "per-view depth raycast from VGGT surfaces")+"; colors from original RGB; all seven source IDs retained here, no unique face-to-view claim",
                             "authored-room-shell": "Assumed closed room envelope; includes closure of hall-facing and window openings; not recovered geometry"},
              "limitations": ["No metric units or reference-depth/pose use.",
                              "No unseen object reconstruction or learned generative filling.",
                              "Orthogonal walls and flat floor/ceiling are assumptions.",
                              "Closing the shell increases rendered coverage, not evidence of accuracy.",
                              "Depth inconsistency can survive TSDF fusion; raw geometry retained.",
                              "No Shado run or independent held-out geometry evaluation.",
                              "No claimed door/window detection; all selected boundary openings are conservatively closed."]}
    if boundary_packet is not None:
        report["reviewed_boundary_packet"] = copy.deepcopy(boundary_packet)
        report["provenance"]["authored-door-cap"] = "Explicit supplied door rectangle, authored closure rather than detected geometry"
        report["provenance"]["authored-window-cap"] = "Explicit supplied window rectangle, authored closure rather than detected geometry"
        report["limitations"] = [
            "Supplied boundary and openings are caller review data; this command grants no authority.",
            "No metric units, supplied reference depth/pose, independent accuracy or Shado comparison.",
            "Whole faces outside the supplied polygon are discarded, including concave-notch crossings.",
            "All added shell and cap geometry is authored; unknown objects are not reconstructed.",
            "Source-camera diagnostics are in-sample and do not establish unseen geometry accuracy."]
    (output/"report.json").write_text(json.dumps(report, indent=2)+"\n", encoding="utf-8")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--result", type=Path, required=True)
    parser.add_argument("--request", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--voxel", type=float, default=.009)
    parser.add_argument("--fields-result", type=Path)
    parser.add_argument("--confidence-percentile", type=float, default=5)
    parser.add_argument("--boundary-json", type=Path,
                        help="Bound reviewed polygon/caps in original analysis coordinates; disables automatic fit/rotation")
    args = parser.parse_args()
    if not .003 <= args.voxel <= .05:
        parser.error("voxel must be within the bounded CPU range .003 to .05")
    print(json.dumps(run(args.result, args.request, args.output, args.voxel,
                         args.fields_result, args.confidence_percentile,
                         json.loads(args.boundary_json.read_text(encoding="utf-8-sig")) if args.boundary_json else None), indent=2))
