"""One externally inferred ceiling relief; CPU only, no model or raw-mesh loading."""
from __future__ import annotations

from collections import Counter, defaultdict, deque
import hashlib
import io
import json
from pathlib import Path
import stat
import zipfile

import numpy as np
from PIL import Image

SOURCE_SHA256 = "d3296808e9cb9deec138fa1fce02495d5f84a0e894f56008d7013aedc7721bdc"
ROI = [165, 175, 115, 130]
RELATIVE_METADATA = {"encoding": "uint8-grayscale-visualization", "polarity": "brighter-nearer",
    "input_size": [816, 816], "resize": "bilinear-816-to-512",
    "workflow_id": "qUJFuEgj7TehpkadV6TuPr", "node_id": "f66d7639-c4e9-445b-89b6-bea569f8b92e"}
PAYLOAD_FILES = {"source.png", "source-depth.bin", "repaired.png", "relative-depth.png"}
MAX_INPUT, MAX_EXTRACTED, MAX_OUTPUT = 32*1024**2, 64*1024**2, 32*1024**2
THRESHOLDS = {"ring_pixels": 32, "minimum_ring_inliers": 256, "minimum_side_inliers": 32,
    "minimum_supported_sides": 3, "minimum_ring_inlier_fraction": .35,
    "ransac_trials": 128, "plane_relative_error_limit": .015,
    "plane_median_relative_error_limit": .005, "minimum_fragment_samples": 24,
    "minimum_fragment_span_pixels": 8, "maximum_relief_fraction": .4,
    "minimum_external_signal_u8": 3, "minimum_footprint_cells": 64,
    "maximum_footprint_roi_fraction": .85}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def json_bytes(value):
    return (json.dumps(value, sort_keys=True, indent=2, allow_nan=False) + "\n").encode()


def parse_json(data):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError("Duplicate JSON key")
            result[key] = value
        return result
    def invalid(value):
        raise ValueError("Nonfinite JSON token")
    return json.loads(data, object_pairs_hook=pairs, parse_constant=invalid)


def numeric(value, shape):
    result = np.asarray(value)
    if result.shape != shape or result.dtype.kind not in "if" or not np.isfinite(result).all():
        raise ValueError("Invalid finite numeric matrix")
    return result.astype(float)


def validate_manifest(m):
    if (type(m) is not dict or set(m) != {"version", "source_mesh_sha256", "view", "roi", "relative_depth", "files"}
            or type(m["version"]) is not int or m["version"] != 1 or m["source_mesh_sha256"] != SOURCE_SHA256
            or m["roi"] != ROI or any(type(v) is not int for v in m["roi"])
            or m["relative_depth"] != RELATIVE_METADATA):
        raise ValueError("Invalid ceiling scope/provenance manifest")
    view = m["view"]
    if (type(view) is not dict or set(view) != {"id", "width", "height", "near", "far", "K", "world_from_cv"}
            or view["id"] != "ceiling" or any(type(view[k]) is not int or view[k] != 512 for k in ("width", "height"))
            or view["near"] != .025 or view["far"] != 40):
        raise ValueError("Invalid single source camera")
    K = numeric(view["K"], (3, 3))
    if (not np.array_equal(K, [[K[0, 0], 0, 256], [0, K[1, 1], 256], [0, 0, 1]])
            or not 1 <= min(K[0, 0], K[1, 1]) <= max(K[0, 0], K[1, 1]) <= 8192):
        raise ValueError("Invalid half-pixel camera intrinsics")
    pose = numeric(view["world_from_cv"], (4, 4))
    if (not np.array_equal(pose[3], [0, 0, 0, 1]) or (abs(pose[:3, 3]) > 10000).any()
            or not np.allclose(pose[:3, :3].T @ pose[:3, :3], np.eye(3), atol=1e-6, rtol=0)
            or not np.isclose(np.linalg.det(pose[:3, :3]), 1, atol=1e-6, rtol=0)):
        raise ValueError("Invalid rigid OpenCV pose")
    if type(m["files"]) is not dict or set(m["files"]) != PAYLOAD_FILES:
        raise ValueError("Unexpected file inventory")
    for record in m["files"].values():
        if (type(record) is not dict or set(record) != {"sha256", "bytes"}
                or type(record["sha256"]) is not str or len(record["sha256"]) != 64
                or any(c not in "0123456789abcdef" for c in record["sha256"])
                or type(record["bytes"]) is not int or not 0 < record["bytes"] <= MAX_EXTRACTED):
            raise ValueError("Invalid file size/hash binding")
    return m


def pack(files):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        for name, data in sorted(files.items()):
            archive.writestr(zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0)), data, compress_type=zipfile.ZIP_DEFLATED)
    if len(output.getvalue()) > MAX_INPUT:
        raise ValueError("Input ZIP exceeds 32 MiB")
    return output.getvalue()


def input_bytes(source):
    """Package flat, allowlisted local bytes without extracting untrusted archives."""
    source = Path(source)
    if source.is_symlink():
        raise ValueError("Symlink input")
    if source.is_dir():
        paths = list(source.iterdir())
        if ({p.name for p in paths} != PAYLOAD_FILES | {"manifest.json"}
                or any(p.is_symlink() or not p.is_file() for p in paths)
                or sum(p.stat().st_size for p in paths) > MAX_EXTRACTED):
            raise ValueError("Unsafe or oversized flat input directory")
        return pack({p.name: p.read_bytes() for p in paths})
    if source.stat().st_size > MAX_INPUT:
        raise ValueError("Input ZIP exceeds 32 MiB")
    return source.read_bytes()


def admit(payload):
    if type(payload) is not bytes or not 0 < len(payload) <= MAX_INPUT:
        raise ValueError("Invalid input ZIP bytes")
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        entries = archive.infolist()
        if (len(entries) != 5 or {e.filename for e in entries} != PAYLOAD_FILES | {"manifest.json"}
                or sum(e.file_size for e in entries) > MAX_EXTRACTED):
            raise ValueError("Unexpected/duplicate/oversized archive members")
        for entry in entries:
            if (entry.flag_bits & 1 or entry.is_dir() or stat.S_IFMT(entry.external_attr >> 16) not in (0, stat.S_IFREG)
                    or entry.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)):
                raise ValueError("Unsafe ZIP member")
        if archive.getinfo("manifest.json").file_size > 16384:
            raise ValueError("Oversized manifest")
        files = {e.filename: archive.read(e) for e in entries}
    m = validate_manifest(parse_json(files["manifest.json"]))
    for name, record in m["files"].items():
        if len(files[name]) != record["bytes"] or digest(files[name]) != record["sha256"]:
            raise ValueError("Input file hash/size mismatch")
    arrays = {}
    for name, key, size, mode in (("source.png", "source_rgb", (512, 512), "RGB"),
            ("repaired.png", "repaired_rgb", (816, 816), "RGB"), ("relative-depth.png", "relative", (816, 816), "L")):
        with Image.open(io.BytesIO(files[name])) as image:
            if image.format != "PNG" or image.size != size or image.mode != mode or getattr(image, "n_frames", 1) != 1:
                raise ValueError("Invalid admitted PNG size/mode")
            arrays[key] = np.array(image.resize((512, 512), Image.Resampling.BILINEAR) if size != (512, 512) else image)
    if len(files["source-depth.bin"]) != 512*512*4:
        raise ValueError("Invalid camera-Z byte count")
    z = np.frombuffer(files["source-depth.bin"], dtype="<f4").reshape(512, 512).copy()
    if not np.isfinite(z).all() or ((z != 0) & ((z < .025) | (z > 40))).any():
        raise ValueError("Invalid source camera-Z")
    arrays["source_depth"] = z
    arrays["relative"] = arrays["relative"].astype(float) / 255
    return m, arrays


def roi_mask():
    mask = np.zeros((512, 512), dtype=bool)
    x, y, w, h = ROI
    mask[y:y+h, x:x+w] = True
    return mask


def ring_mask():
    x, y, w, h = ROI
    ring = np.zeros((512, 512), dtype=bool)
    r = THRESHOLDS["ring_pixels"]
    ring[y-r:y+h+r, x-r:x+w+r] = True
    return ring & ~roi_mask()


def rays(view):
    yy, xx = np.indices((512, 512))
    return np.stack([xx+.5, yy+.5, np.ones_like(xx)], -1) @ np.linalg.inv(view["K"]).T


def fit_source_plane(source, view):
    ring = ring_mask() & (source > 0)
    X, z = rays(view)[ring], source[ring].astype(float)
    if len(z) < THRESHOLDS["minimum_ring_inliers"]:
        raise ValueError("Insufficient source ceiling ring support")
    rng = np.random.default_rng(0)
    best = np.zeros(len(z), dtype=bool)
    for _ in range(THRESHOLDS["ransac_trials"]):
        indices = rng.choice(len(z), 3, replace=False)
        if abs(np.linalg.det(X[indices])) < 1e-7:
            continue
        beta = np.linalg.solve(X[indices], 1/z[indices])
        q = X @ beta
        inliers = (q > 0) & (abs(z*q - 1) <= THRESHOLDS["plane_relative_error_limit"])
        if inliers.sum() > best.sum():
            best = inliers
    if best.sum() < max(THRESHOLDS["minimum_ring_inliers"], len(z)*THRESHOLDS["minimum_ring_inlier_fraction"]):
        raise ValueError("Insufficient robust source-plane inliers")
    for _ in range(3):
        beta = np.linalg.lstsq(X[best], 1/z[best], rcond=None)[0]
        q = X @ beta
        best = (q > 0) & (abs(z*q - 1) <= THRESHOLDS["plane_relative_error_limit"])
        if best.sum() < THRESHOLDS["minimum_ring_inliers"]:
            raise ValueError("Unstable source-plane fit")
    full_q = rays(view) @ beta
    extent = ring_mask() | roi_mask()
    if (full_q[extent] <= 0).any():
        raise ValueError("Source-plane extrapolation crosses camera horizon")
    plane = np.divide(1., full_q, out=np.zeros_like(full_q), where=full_q > 0)
    if ((plane[extent] < view["near"]) | (plane[extent] > view["far"])).any():
        raise ValueError("Source plane outside admitted depth interval")
    mask = np.zeros((512, 512), dtype=bool)
    mask[ring] = best
    x, y, w, h = ROI
    r = THRESHOLDS["ring_pixels"]
    sides = {"top": mask[y-r:y, x:x+w], "bottom": mask[y+h:y+h+r, x:x+w],
             "left": mask[y:y+h, x-r:x], "right": mask[y:y+h, x+w:x+w+r]}
    counts = {name: int(values.sum()) for name, values in sides.items()}
    supported = sum(n >= THRESHOLDS["minimum_side_inliers"] for n in counts.values())
    error = abs(source[mask] - plane[mask])
    if supported < 3 or np.median(error/plane[mask]) > THRESHOLDS["plane_median_relative_error_limit"]:
        raise ValueError("Insufficient distributed ceiling-plane support or excessive residual")
    return plane, mask, {"inverse_depth_plane_coefficients_cv": beta.tolist(),
        "valid_ring_samples": len(z), "inliers": int(mask.sum()), "rejected_ring_samples": int(len(z)-mask.sum()),
        "side_inliers": counts, "supported_sides": supported,
        "median_absolute_camera_z_residual": float(np.median(error)),
        "p95_absolute_camera_z_residual": float(np.quantile(error, .95)),
        "median_relative_residual": float(np.median(error/plane[mask]))}


def external_residual(relative, support):
    yy, xx = np.indices((512, 512))
    x, y, w, h = ROI
    u, v = (xx+.5-x-w/2)/w, (yy+.5-y-h/2)/h
    design = np.stack([np.ones_like(u), u, v, u*u, u*v, v*v], -1)
    X, values = design[support], relative[support]
    keep = np.ones(len(values), dtype=bool)
    for _ in range(5):
        beta = np.linalg.lstsq(X[keep], values[keep], rcond=None)[0]
        error = values - X @ beta
        sigma = 1.4826 * np.median(abs(error[keep] - np.median(error[keep])))
        keep = abs(error) <= max(3/255, 3*sigma)
        if keep.sum() < 256:
            raise ValueError("Insufficient external background support")
    background = design @ beta
    threshold = max(THRESHOLDS["minimum_external_signal_u8"]/255, 3*sigma)
    residual = relative - background
    active = roi_mask() & (residual > threshold)
    if active.sum() < 64 or active.sum() > np.prod(ROI[2:])*THRESHOLDS["maximum_footprint_roi_fraction"]:
        raise ValueError("External depth lacks a bounded distinguishable fixture residual")
    upper = float(np.quantile(residual[active], .95))
    if upper <= threshold + 1/255:
        raise ValueError("External relative depth signal is too weak")
    normalized = np.zeros((512, 512))
    normalized[active] = np.clip((residual[active]-threshold)/(upper-threshold), 0, 1)
    return normalized, {"background_polynomial": beta.tolist(), "background_inliers": int(keep.sum()),
        "background_sigma": float(sigma), "residual_threshold": float(threshold),
        "positive_residual_q95": upper, "positive_residual_pixels": int(active.sum())}


def largest_cells(mask):
    seen = np.zeros_like(mask)
    largest = []
    for yy, xx in zip(*np.nonzero(mask)):
        if seen[yy, xx]:
            continue
        queue, group = deque([(yy, xx)]), []
        seen[yy, xx] = True
        while queue:
            y, x = queue.popleft()
            group.append((y, x))
            for ny, nx in ((y-1, x), (y+1, x), (y, x-1), (y, x+1)):
                if 0 <= ny < mask.shape[0] and 0 <= nx < mask.shape[1] and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    queue.append((ny, nx))
        if len(group) > len(largest):
            largest = group
    result = np.zeros_like(mask)
    if largest:
        result[tuple(np.array(largest).T)] = True
    return result


def closed_mesh(front_depth, back_depth, active, view, rgb):
    from genrc_geometry import unproject
    cells = active[:-1, :-1] & active[:-1, 1:] & active[1:, :-1] & active[1:, 1:]
    before = int(cells.sum())
    cells = largest_cells(cells)
    # Erode corner contacts instead of inventing connecting geometry.
    while True:
        nw, ne, sw, se = cells[:-1, :-1], cells[:-1, 1:], cells[1:, :-1], cells[1:, 1:]
        diagonal = nw & se & ~ne & ~sw
        opposite = ne & sw & ~nw & ~se
        if not (diagonal.any() or opposite.any()):
            break
        nw[diagonal] = False
        ne[opposite] = False
        cells = largest_cells(cells)
    if cells.sum() < THRESHOLDS["minimum_footprint_cells"]:
        raise ValueError("Insufficient connected fixture footprint")
    ids = np.arange(512*512).reshape(512, 512)
    a, b, c, d = ids[:-1, :-1][cells], ids[:-1, 1:][cells], ids[1:, :-1][cells], ids[1:, 1:][cells]
    front_faces = np.concatenate([np.stack([a, c, b], 1), np.stack([b, c, d], 1)])
    used, inverse = np.unique(front_faces, return_inverse=True)
    front_faces = inverse.reshape(-1, 3)
    front = unproject(front_depth, np.asarray(view["K"]), np.asarray(view["world_from_cv"])).reshape(-1, 3)[used]
    back = unproject(back_depth, np.asarray(view["K"]), np.asarray(view["world_from_cv"])).reshape(-1, 3)[used]
    n = len(used)
    directed = np.concatenate([front_faces[:, [0, 1]], front_faces[:, [1, 2]], front_faces[:, [2, 0]]])
    counts = Counter(tuple(sorted(edge)) for edge in directed.tolist())
    boundary = [(u, v) for u, v in directed.tolist() if counts[tuple(sorted((u, v)))] == 1]
    sides = np.array([[v, u, u+n] for u, v in boundary] + [[v, u+n, v+n] for u, v in boundary], dtype=int)
    faces = np.concatenate([front_faces, front_faces[:, ::-1]+n, sides])
    points = np.concatenate([front, back]).astype("<f4")
    volume = validate_closed_mesh(points, faces)
    colors = np.concatenate([rgb.reshape(-1, 3)[used]]*2)
    return points, faces, colors, {"front_faces": len(front_faces), "back_faces": len(front_faces),
        "side_faces": len(sides), "retained_footprint_cells": int(cells.sum()),
        "discarded_footprint_cells": before-int(cells.sum()), "closed_volume_scan_units_cubed": volume}


def validate_closed_mesh(points, faces):
    triangles = points[faces].astype(float)
    edges = triangles-triangles[:, [1, 2, 0]]
    if not np.isfinite(points).all() or (np.linalg.norm(np.cross(edges[:, 0], edges[:, 1]), axis=1) <= 1e-12).any():
        raise ValueError("Nonfinite or degenerate closure")
    directed = Counter(map(tuple, np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]]).tolist()))
    if any(count != 1 or directed[(v, u)] != 1 for (u, v), count in directed.items()):
        raise ValueError("Patch is not a consistently oriented closed edge manifold")
    links = defaultdict(list)
    for a, b, c in faces.tolist():
        links[a].append((b, c)); links[b].append((c, a)); links[c].append((a, b))
    for pairs in links.values():
        graph = defaultdict(set)
        for a, b in pairs:
            graph[a].add(b); graph[b].add(a)
        if any(len(neighbors) != 2 for neighbors in graph.values()):
            raise ValueError("Nonmanifold fixture vertex")
        seen, todo = set(), [next(iter(graph))]
        while todo:
            item = todo.pop()
            if item not in seen:
                seen.add(item); todo.extend(graph[item]-seen)
        if len(seen) != len(graph):
            raise ValueError("Pinched fixture vertex")
    centered = triangles - points.astype(float).mean(0)
    volume = float(np.einsum("ij,ij->i", centered[:, 0], np.cross(centered[:, 1], centered[:, 2])).sum()/6)
    if volume <= 1e-12:
        raise ValueError("Nonpositive closed fixture volume")
    return volume


def reconstruct(m, arrays):
    source, view = arrays["source_depth"], m["view"]
    plane, support, plane_report = fit_source_plane(source, view)
    normalized, external_report = external_residual(arrays["relative"], support)
    deviation = plane - source
    minimum = max(plane_report["p95_absolute_camera_z_residual"]*3, float(np.median(plane[roi_mask()]))*.005)
    fragments = roi_mask() & (normalized > .05) & (source > 0) & (deviation > minimum)
    fragments &= deviation <= plane*THRESHOLDS["maximum_relief_fraction"]
    yy, xx = np.nonzero(fragments)
    if (len(xx) < THRESHOLDS["minimum_fragment_samples"] or np.ptp(xx) < 8 or np.ptp(yy) < 8):
        raise ValueError("Insufficient source fixture fragment calibration; no fallback permitted")
    amplitude = float(np.quantile(deviation[fragments], .95))
    relief = normalized * amplitude
    active = roi_mask() & (relief > np.maximum(plane*1e-5, amplitude*.005))
    front = plane.copy()
    front[active] -= relief[active]
    if ((front[active] < view["near"]) | (front[active] > view["far"])).any():
        raise ValueError("Calibrated fixture exceeds source camera interval")
    points, faces, colors, closure = closed_mesh(front, plane, active, view, arrays["repaired_rgb"])
    calibration = {"source_fragment_pixels": int(fragments.sum()), "source_fragment_span_pixels": [int(np.ptp(xx)), int(np.ptp(yy))],
        "minimum_accepted_deviation": minimum, "relief_q95_scan_units": amplitude,
        "relief_median_scan_units": float(np.median(deviation[fragments])), "units": "supplied camera-Z scan units, not verified physical metres"}
    plane_cv = np.array([*plane_report["inverse_depth_plane_coefficients_cv"], -1.])
    plane_world = np.linalg.inv(np.asarray(view["world_from_cv"])).T @ plane_cv
    report = {"status": "inferred-ceiling-patch-awaiting-review", "source_plane": plane_report,
        "camera": view, "roi": ROI, "patch_bbox": [points.min(0).tolist(), points.max(0).tolist()],
        "fitted_plane_cv": plane_cv.tolist(), "fitted_plane_world": plane_world.tolist(),
        "plane_equation": "a*x+b*y+c*z+d=0; coefficients [a,b,c,d]; supplied scan frame/units",
        "external_depth": external_report, "calibration": calibration, **closure,
        "vertices": len(points), "faces": len(faces), "thresholds": THRESHOLDS,
        "face_provenance": "all-inferred-artistic-completion", "authored_fallback_used": False,
        "source_mesh_loaded_or_modified": False, "whole_image_registration_claimed": False,
        "repaired_rgb_outside_roi_used": False, "relative_depth_ring_used_for_background_fit": True, "registration": RELATIVE_METADATA["resize"],
        "presentation_hide": {"roi": ROI, "view": view, "source_mesh_sha256": SOURCE_SHA256,
            "requires_roi_projection_check": True, "retain_crossing_triangles": True,
            "scope": "metadata only; require positive camera-Z and exact ROI containment as well as patch bbox; never delete source mesh faces"},
        "limitations": ["Relative-depth visualization is not metric depth or independent evidence.",
            "Fixture relief amplitude is source-fragment calibrated; its detailed shape and planar caps are inferred.",
            "Only the approved image ROI is approximately registered; the full generated frame was not admitted as aligned.",
            "Largest connected relief footprint only; disconnected and corner-pinched cells are discarded and counted.",
            "Closed heightfield relief cannot recover hidden fixture topology or prove source fidelity.",
            "Source mesh remains intact; this patch can overlap its original fragments."]}
    return points, faces, colors, report, {"relief": relief, "plane": plane, "active": active}


def ply_bytes(points, faces, colors):
    header = ("ply\nformat binary_little_endian 1.0\ncomment every face inferred artistic completion\n"
        f"element vertex {len(points)}\nproperty float x\nproperty float y\nproperty float z\n"
        "property uchar red\nproperty uchar green\nproperty uchar blue\n"
        f"element face {len(faces)}\nproperty list uchar int vertex_indices\nend_header\n").encode()
    vertices = np.empty(len(points), dtype=[("xyz", "<f4", (3,)), ("rgb", "u1", (3,))])
    vertices["xyz"], vertices["rgb"] = points, colors
    triangles = np.empty(len(faces), dtype=[("count", "u1"), ("ids", "<i4", (3,))])
    triangles["count"], triangles["ids"] = 3, faces
    return header + vertices.tobytes() + triangles.tobytes()


def complete(payload, output):
    m, arrays = admit(payload)
    output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    statistics = {}
    for name, mask in (("ring", ring_mask()), ("roi", roi_mask())):
        values = arrays["source_depth"][mask & (arrays["source_depth"] > 0)]
        statistics[name] = {"valid_pixels": len(values), "total_pixels": int(mask.sum()),
            "camera_z_q05_q50_q95": np.quantile(values, [.05, .5, .95]).tolist() if len(values) else None}
    (output/"admission.json").write_bytes(json_bytes({"input_sha256": digest(payload), "manifest": m,
        "source_depth_statistics": statistics, "thresholds": THRESHOLDS}))
    for key, name in (("source_rgb", "source-512.png"), ("repaired_rgb", "repaired-512.png")):
        Image.fromarray(arrays[key]).save(output/name)
    Image.fromarray(np.rint(arrays["relative"]*255).astype("uint8")).save(output/"relative-depth-512.png")
    (output/"source-depth-512.bin").write_bytes(arrays["source_depth"].astype("<f4").tobytes())
    try:
        points, faces, colors, report, maps = reconstruct(m, arrays)
        (output/"ceiling-patch.ply").write_bytes(ply_bytes(points, faces, colors))
        (output/"fitted-plane-512.bin").write_bytes(maps["plane"].astype("<f4").tobytes())
        (output/"inferred-relief-512.bin").write_bytes(maps["relief"].astype("<f4").tobytes())
        Image.fromarray(maps["active"].astype("uint8")*255).save(output/"relief-mask-512.png")
        report.update(input_sha256=digest(payload), input_manifest=m, source_depth_statistics=statistics,
            files={p.name: {"sha256": digest(p.read_bytes()), "bytes": p.stat().st_size} for p in output.iterdir() if p.is_file()})
        (output/"report.json").write_bytes(json_bytes(report))
        if sum(p.stat().st_size for p in output.iterdir()) > MAX_OUTPUT:
            raise ValueError("Output exceeds 32 MiB")
        return report
    except Exception as error:
        (output/"failure.json").write_bytes(json_bytes({"status": "failed", "error_type": type(error).__name__,
            "message": str(error), "source_depth_statistics": statistics, "thresholds": THRESHOLDS}))
        raise
