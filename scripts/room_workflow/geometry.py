"""CPU-only geometry guards. No models, network, downloads, or invented depth."""
import math
import numpy as np

MAX_VERTICES = 200_000
MAX_FACES = 400_000
EPS = 1e-9


def _cross(a, b):
    return float(a[0] * b[1] - a[1] * b[0])


def _on_segment(p, a, b):
    return abs(_cross(b-a, p-a)) <= EPS and np.dot(p-a, p-b) <= EPS


def point_inside(p, polygon):
    """Boundary-inclusive even/odd test for a validated simple polygon."""
    inside = False
    for a, b in zip(polygon, np.roll(polygon, -1, axis=0)):
        if _on_segment(p, a, b):
            return True
        if (a[1] > p[1]) != (b[1] > p[1]):
            x = a[0] + (p[1]-a[1]) * (b[0]-a[0]) / (b[1]-a[1])
            if p[0] < x:
                inside = not inside
    return inside


def _intersections(a, b, c, d):
    """All segment parameter breakpoints, including collinear overlaps."""
    r, s = b-a, d-c
    denominator = _cross(r, s)
    if abs(denominator) > EPS:
        t, u = _cross(c-a, s)/denominator, _cross(c-a, r)/denominator
        return [min(1., max(0., t))] if -EPS <= t <= 1+EPS and -EPS <= u <= 1+EPS else []
    if abs(_cross(c-a, r)) > EPS:
        return []
    rr = float(r @ r)
    if rr <= EPS:
        return [0.] if _on_segment(a, c, d) else []
    ts = sorted([float((c-a) @ r/rr), float((d-a) @ r/rr)])
    return [max(0., ts[0]), min(1., ts[1])] if ts[1] >= 0 and ts[0] <= 1 else []


def validate_boundary(boundary):
    if not isinstance(boundary, dict) or set(boundary) != {"polygon", "floor", "ceiling"}:
        raise ValueError("Boundary requires only polygon, floor, ceiling; holes are unsupported")
    p = np.asarray(boundary["polygon"], dtype=float)
    if p.ndim != 2 or p.shape[1] != 2 or not 3 <= len(p) <= 32 or not np.isfinite(p).all():
        raise ValueError("Invalid floor polygon")
    if np.abs(p).max() > 1e5:
        raise ValueError("Boundary coordinates exceed limit")
    floor, ceiling = boundary["floor"], boundary["ceiling"]
    if isinstance(floor, bool) or isinstance(ceiling, bool) or not all(
        isinstance(v, (int, float)) and math.isfinite(v) for v in (floor, ceiling)
    ) or not 1e-5 < ceiling-floor <= 1e4:
        raise ValueError("Invalid floor/ceiling")
    for i in range(len(p)):
        if np.linalg.norm(p[i]-p[(i+1) % len(p)]) <= EPS:
            raise ValueError("Repeated polygon vertex")
        for j in range(i+1, len(p)):
            if j == i+1 or (i == 0 and j == len(p)-1):
                continue
            if _intersections(p[i], p[(i+1) % len(p)], p[j], p[(j+1) % len(p)]):
                raise ValueError("Self-intersecting floor polygon")
    area = .5*sum(_cross(a, b) for a, b in zip(p, np.roll(p, -1, axis=0)))
    if abs(area) <= EPS:
        raise ValueError("Zero-area floor polygon")
    return p, float(floor), float(ceiling)


def _segment_covered(a, b, polygon):
    ts = [0., 1.]
    for c, d in zip(polygon, np.roll(polygon, -1, axis=0)):
        ts.extend(_intersections(a, b, c, d))
    ts = sorted(set(ts))
    return all(point_inside(a+t*(b-a), polygon) for t in ts) and all(
        point_inside(a+(s+t)*.5*(b-a), polygon) for s, t in zip(ts, ts[1:]))


def face_inside(triangle, boundary):
    """Conservative WHOLE face containment; never just vertices/centroid.

    For a simple polygon without holes, a filled triangle whose entire boundary
    and interior point are inside cannot surround an exterior component.
    Segment intersections split every exterior interval, including narrow notches.
    This intentionally drops partial triangles instead of pretending to clip them.
    """
    polygon, floor, ceiling = validate_boundary(boundary)
    return _face_inside_validated(np.asarray(triangle, float), polygon, floor, ceiling)


def _face_inside_validated(tri, p, floor, ceiling):
    return bool(np.isfinite(tri).all() and (tri[:, 2] >= floor-EPS).all()
                and (tri[:, 2] <= ceiling+EPS).all()
                and point_inside(tri[:, :2].mean(0), p)
                and all(_segment_covered(a, b, p) for a, b in
                        zip(tri[:, :2], np.roll(tri[:, :2], -1, axis=0))))


def filter_boundary(vertices, faces, boundary):
    polygon, floor, ceiling = validate_boundary(boundary)
    triangles = vertices[faces]
    keep = np.isfinite(triangles).all((1, 2))
    keep &= (triangles[:, :, 2] >= floor-EPS).all(1)
    keep &= (triangles[:, :, 2] <= ceiling+EPS).all(1)
    candidates = np.flatnonzero(keep)
    try:
        from shapely import Polygon, MultiPoint
        area = Polygon(polygon)
        for index in candidates:
            keep[index] = area.covers(MultiPoint(triangles[index, :, :2]).convex_hull)
    except ImportError:
        for index in candidates:
            keep[index] = _face_inside_validated(triangles[index], polygon, floor, ceiling)
    return keep


def unproject(depth, K, world_to_camera):
    """VGGT uses integer pixel centers and OpenCV z-depth, unlike Hypersim."""
    depth, K, pose = np.asarray(depth, float), np.asarray(K, float), np.asarray(world_to_camera, float)
    if depth.ndim != 2 or K.shape != (3, 3) or pose.shape != (3, 4):
        raise ValueError("Invalid depth/calibration shapes")
    if not np.isfinite(K).all() or not np.isfinite(pose).all() or K[0, 0] <= 0 or K[1, 1] <= 0:
        raise ValueError("Invalid calibration values")
    R = pose[:, :3]
    if not np.allclose(R.T @ R, np.eye(3), atol=1e-4) or not np.isclose(np.linalg.det(R), 1, atol=1e-4):
        raise ValueError("Camera rotation must be proper and rigid")
    yy, xx = np.indices(depth.shape)
    rays = np.stack((xx, yy, np.ones_like(xx)), -1) @ np.linalg.inv(K).T
    return (rays * depth[..., None] - pose[:, 3]) @ R


def similarity(source, target):
    """Orientation-preserving least-squares Sim(3): target = s * R source + t."""
    x, y = np.asarray(source, float), np.asarray(target, float)
    if x.shape != y.shape or x.ndim != 2 or x.shape[1] != 3 or len(x) < 6 or not (
        np.isfinite(x).all() and np.isfinite(y).all()
    ):
        raise ValueError("Insufficient finite alignment anchors")
    mx, my = x.mean(0), y.mean(0)
    x0, y0 = x-mx, y-my
    if np.linalg.matrix_rank(x0, tol=1e-8) < 2 or np.linalg.matrix_rank(y0, tol=1e-8) < 2:
        raise ValueError("Degenerate alignment anchors")
    u, values, vt = np.linalg.svd(y0.T @ x0 / len(x))
    correction = np.ones(3)
    correction[-1] = np.linalg.det(u @ vt)
    R = u @ np.diag(correction) @ vt
    scale = float(values @ correction / np.mean(np.sum(x0*x0, axis=1)))
    if not 1e-4 < scale < 1e4:
        raise ValueError("Implausible alignment scale")
    return scale, R, my-scale*R @ mx


def align_to_original(source, target, max_relative_residual=.08):
    """Robust trim-fit on same-original-image pixels; never generated anchors."""
    x, y = np.asarray(source, float), np.asarray(target, float)
    if len(x) < 30:
        raise ValueError("Too few shared-photo alignment anchors")
    keep = np.ones(len(x), bool)
    for _ in range(4):
        scale, R, t = similarity(x[keep], y[keep])
        residual = np.linalg.norm(scale*x @ R.T+t-y, axis=1)
        cutoff = np.quantile(residual, .8)
        keep = residual <= max(cutoff, 1e-8)
    extent = float(np.linalg.norm(np.ptp(y[keep], axis=0)))
    error = float(np.sqrt(np.mean(residual[keep]**2)))
    if extent <= EPS or error/extent > max_relative_residual:
        raise ValueError("Shared-photo alignment residual too high")
    return scale, R, t, {"anchors": len(x), "inliers": int(keep.sum()),
                         "rms_relative_to_extent": error/extent,
                         "scale": scale, "rotation": R.tolist(), "translation": t.tolist(),
                         "meaning": "Estimated B-to-A registration, not accuracy against the real room"}


def normals(vertices, faces):
    result = np.zeros_like(vertices, dtype=float)
    tri = vertices[faces]
    face_normals = np.cross(tri[:, 1]-tri[:, 0], tri[:, 2]-tri[:, 0])
    for j in range(3):
        np.add.at(result, faces[:, j], face_normals)
    lengths = np.linalg.norm(result, axis=1)
    valid = lengths > EPS
    result[valid] /= lengths[valid, None]
    return result


def make_mesh(points, rgb, valid, boundary=None, category="photo-estimated", stride=6):
    """Depth-grid surface patches, not Poisson completion or trained 3DGS."""
    if points.shape[:-1] != valid.shape or rgb.shape != points.shape or points.shape[-1] != 3:
        raise ValueError("Inconsistent mesh arrays")
    if points.ndim != 4 or len(points) > 19 or max(points.shape[1:3]) > 1024:
        raise ValueError("Mesh input exceeds cap")
    v_parts, c_parts, f_parts, source_parts = [], [], [], []
    offset = 0
    for view, (p, color, mask) in enumerate(zip(points, rgb, valid)):
        p, color, mask = p[::stride, ::stride], color[::stride, ::stride], mask[::stride, ::stride]
        h, w = mask.shape
        ids = np.arange(h*w).reshape(h, w)
        a, b, c, d = ids[:-1, :-1], ids[:-1, 1:], ids[1:, :-1], ids[1:, 1:]
        faces = np.concatenate((np.stack((a, c, b), -1).reshape(-1, 3),
                                np.stack((b, c, d), -1).reshape(-1, 3)))
        vertices = p.reshape(-1, 3)
        keep = mask.ravel()[faces].all(1) & np.isfinite(vertices[faces]).all((1, 2))
        faces = faces[keep]
        if len(faces):
            triangles = vertices[faces]
            edge_lengths = np.linalg.norm(triangles-np.roll(triangles, -1, axis=1), axis=2)
            median_edge = np.median(edge_lengths[edge_lengths > EPS]) if np.any(edge_lengths > EPS) else 0
            face_area = np.linalg.norm(np.cross(triangles[:, 1]-triangles[:, 0],
                                               triangles[:, 2]-triangles[:, 0]), axis=1)
            faces = faces[(edge_lengths.max(1) <= median_edge*5) & (face_area > EPS)]
        if boundary is not None and len(faces):
            faces = faces[filter_boundary(vertices, faces, boundary)]
        if not len(faces):
            continue
        used, remapped = np.unique(faces, return_inverse=True)
        v_parts.append(vertices[used]); c_parts.append(color.reshape(-1, 3)[used])
        f_parts.append(remapped.reshape(-1, 3)+offset)
        source_parts.extend([view]*len(faces))
        offset += len(used)
    if not f_parts:
        raise ValueError("No valid bounded mesh faces")
    v, c, f = np.concatenate(v_parts), np.concatenate(c_parts), np.concatenate(f_parts)
    if len(v) > MAX_VERTICES or len(f) > MAX_FACES:
        raise ValueError("Mesh exceeds export budget")
    return {"positions": np.round(v, 9).ravel().tolist(), "colors": np.round(np.clip(c, 0, 1), 6).ravel().tolist(),
            "indices": f.ravel().tolist(), "normals": np.round(normals(v, f), 6).ravel().tolist(),
            "provenance": [category]*len(f), "source_view_indices": source_parts,
            "representation": "estimated-depth-grid-triangles", "units": "relative",
            "boundary_policy": "whole-face containment; intersecting faces are discarded"}


def add_caps(mesh, boundary, openings):
    polygon, floor, ceiling = validate_boundary(boundary)
    if not isinstance(openings, list) or len(openings) > 32:
        raise ValueError("Invalid openings")
    for opening in openings:
        if set(opening) != {"id", "edge_index", "t0", "t1", "bottom", "top", "kind"}:
            raise ValueError("Unknown opening fields")
        edge = opening["edge_index"]
        if type(edge) is not int or not 0 <= edge < len(polygon) or opening["kind"] not in ("door", "window"):
            raise ValueError("Invalid opening edge/kind")
        t0, t1, bottom, top = (opening[k] for k in ("t0", "t1", "bottom", "top"))
        if not all(type(v) in (int, float) and math.isfinite(v) for v in (t0, t1, bottom, top)):
            raise ValueError("Invalid opening numbers")
        if not (0 <= t0 < t1 <= 1 and floor <= bottom < top <= ceiling):
            raise ValueError("Opening exceeds confirmed room boundary")
        a, b = polygon[edge], polygon[(edge+1) % len(polygon)]
        left, right = a+(b-a)*t0, a+(b-a)*t1
        vertices = np.array([[*left, bottom], [*right, bottom], [*right, top], [*left, top]])
        base = len(mesh["positions"])//3
        mesh["positions"].extend(vertices.ravel().tolist())
        mesh["colors"].extend(([.55, .51, .48] if opening["kind"] == "door" else [.45, .58, .62])*4)
        ccw = sum(_cross(a, b) for a, b in zip(polygon, np.roll(polygon, -1, axis=0))) > 0
        cap_faces = np.array([[0, 1, 2], [0, 2, 3]])
        if ccw:
            cap_faces = cap_faces[:, ::-1]
        mesh["indices"].extend((cap_faces+base).ravel().tolist())
        mesh["provenance"].extend(["authored-"+opening["kind"]+"-cap"]*2)
        mesh["source_view_indices"].extend([-1, -1])
    v, f = np.asarray(mesh["positions"], dtype=float).reshape(-1, 3), np.asarray(mesh["indices"], dtype=np.int64).reshape(-1, 3)
    if len(v) > MAX_VERTICES or len(f) > MAX_FACES:
        raise ValueError("Caps exceed mesh budget")
    mesh["normals"] = normals(v, f).ravel().tolist()
    return mesh


def triangulate_polygon(polygon):
    """Ear clipping of a validated simple polygon; never a convex hull fill."""
    p = np.asarray(polygon, float)
    ids = list(range(len(p)))
    if sum(_cross(a, b) for a, b in zip(p, np.roll(p, -1, axis=0))) < 0:
        ids.reverse()
    # Remove straight intermediate points for the floor only; wall edge IDs stay.
    changed = True
    while changed and len(ids) > 3:
        changed = False
        for i in range(len(ids)):
            a, b, c = (p[ids[j % len(ids)]] for j in (i-1, i, i+1))
            if abs(_cross(b-a, c-b)) <= EPS:
                ids.pop(i); changed = True; break
    faces = []
    while len(ids) > 3:
        found = False
        for i in range(len(ids)):
            ia, ib, ic = (ids[j % len(ids)] for j in (i-1, i, i+1))
            a, b, c = p[[ia, ib, ic]]
            if _cross(b-a, c-b) <= EPS:
                continue
            occupied = False
            for other in ids:
                if other in (ia, ib, ic):
                    continue
                q = p[other]
                if min(_cross(b-a, q-a), _cross(c-b, q-b), _cross(a-c, q-c)) >= -EPS:
                    occupied = True; break
            if not occupied:
                faces.append([ia, ib, ic])
                ids.pop(i); found = True; break
        if not found:
            raise ValueError("Floor polygon cannot be triangulated safely")
    if len(ids) == 3:
        faces.append(ids)
    return np.asarray(faces, dtype=np.int64)


def add_room_shell(mesh, boundary, openings):
    """Close exactly the confirmed prism. Every added surface is authored.

    Door/window caps replace wall cells in their rectangles; no coplanar full-wall
    face is hidden underneath. No adjacent rooms or exterior geometry is added.
    """
    p, floor, ceiling = validate_boundary(boundary)
    # Reuse complete finite/type/boundary checks without touching the real mesh.
    empty = {"positions": [], "colors": [], "indices": [], "provenance": [], "source_view_indices": []}
    add_caps(empty, boundary, openings)
    seen = set()
    for i, opening in enumerate(openings):
        if not isinstance(opening["id"], str) or not opening["id"] or opening["id"] in seen:
            raise ValueError("Opening IDs must be distinct")
        seen.add(opening["id"])
        for other in openings[:i]:
            if opening["edge_index"] == other["edge_index"] and (
                min(opening["t1"], other["t1"])-max(opening["t0"], other["t0"]) > EPS
                and min(opening["top"], other["top"])-max(opening["bottom"], other["bottom"]) > EPS
            ):
                raise ValueError("Overlapping door/window rectangles")

    def append(vertices, faces, category, color):
        base = len(mesh["positions"])//3
        mesh["positions"].extend(np.asarray(vertices, float).ravel().tolist())
        mesh["colors"].extend(list(color)*len(vertices))
        mesh["indices"].extend((np.asarray(faces)+base).ravel().tolist())
        mesh["provenance"].extend([category]*len(faces))
        mesh["source_view_indices"].extend([-1]*len(faces))

    floor_faces = triangulate_polygon(p)
    for z, faces in ((floor, floor_faces), (ceiling, floor_faces[:, ::-1])):
        append(np.column_stack((p, np.full(len(p), z))), faces, "authored-room-shell", [.52, .50, .46])
    ccw = sum(_cross(a, b) for a, b in zip(p, np.roll(p, -1, axis=0))) > 0
    for edge, (a, b) in enumerate(zip(p, np.roll(p, -1, axis=0))):
        portals = [o for o in openings if o["edge_index"] == edge]
        ts = sorted({0., 1., *(o[k] for o in portals for k in ("t0", "t1"))})
        zs = sorted({floor, ceiling, *(o[k] for o in portals for k in ("bottom", "top"))})
        for t0, t1 in zip(ts, ts[1:]):
            for z0, z1 in zip(zs, zs[1:]):
                tm, zm = (t0+t1)*.5, (z0+z1)*.5
                if any(o["t0"] < tm < o["t1"] and o["bottom"] < zm < o["top"] for o in portals):
                    continue
                left, right = a+(b-a)*t0, a+(b-a)*t1
                vertices = [[*left, z0], [*left, z1], [*right, z1], [*right, z0]]
                faces = np.array([[0, 1, 2], [0, 2, 3]])
                append(vertices, faces if ccw else faces[:, ::-1],
                       "authored-room-shell", [.58, .55, .50])
    add_caps(mesh, boundary, openings)
    mesh["completion"] = {"policy": "confirmed-single-room-prism",
                          "origin": "user-confirmed authored envelope, not observed geometry",
                          "door_window_overlap_policy": "wall cells replaced by explicit caps"}
    return mesh
