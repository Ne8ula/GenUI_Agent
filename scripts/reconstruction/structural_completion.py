"""Fit an explicitly inferred architectural envelope to source-supported planes."""
import argparse
import json
from pathlib import Path
import numpy as np
import open3d as o3d
from full_room import context, topology
from planar_completion import dense_filter
from genrc_contract import sha256, write_json


def run(source, output):
    data, poses, unit, K, _ = context()
    report = json.loads((source/"report.json").read_text())
    if sha256(source/"room.ply") != report["mesh_sha256"]:
        raise ValueError("Source changed")
    output.mkdir(parents=True, exist_ok=False)
    mesh = o3d.io.read_triangle_mesh(str(source/"room.ply"))
    v, f, color = np.asarray(mesh.vertices), np.asarray(mesh.triangles), np.asarray(mesh.vertex_colors)
    triangles = v[f]
    cross = np.cross(triangles[:, 1]-triangles[:, 0], triangles[:, 2]-triangles[:, 0])
    area = np.linalg.norm(cross, axis=1)/2
    normal = cross/np.maximum(2*area[:, None], 1e-12)
    centers = triangles.mean(1)
    planes = []
    for axis in range(3):
        aligned = np.abs(normal[:, axis]) > .985
        bins = np.round(centers[aligned, axis]/.025).astype(int)
        weights = np.bincount(bins-bins.min(), weights=area[aligned])
        selected = []
        for peak in np.argsort(weights)[::-1]+bins.min():
            position = peak*.025
            if any(abs(position-p) < .08 for p in selected):
                continue
            support = aligned & (np.abs(centers[:, axis]-position) < .018)
            if area[support].sum() < 1.5:
                continue
            lo, hi = np.quantile(centers[support], [.005, .995], axis=0)
            if axis < 2 and hi[2]-lo[2] < 1.8:
                continue
            if axis == 2 and not (position < .05 or position > 2.5):
                continue
            selected.append(position)
            planes.append({"axis": axis, "position": float(np.median(centers[support, axis])),
                           "support_area_m2": float(area[support].sum()),
                           "support_min": lo.tolist(), "support_max": hi.tolist(),
                           "ids": np.unique(f[support])})
    floor = next(p["position"] for p in planes if p["axis"] == 2 and p["position"] < .05)
    ceiling = next(p["position"] for p in planes if p["axis"] == 2 and p["position"] > 2.5)
    # Architecture bounds, excluding furniture protrusions and noisy scan margins.
    envelope_min = np.array([min(p["position"] for p in planes if p["axis"] == a) for a in (0, 1)]+[floor])
    envelope_max = np.array([max(p["position"] for p in planes if p["axis"] == a) for a in (0, 1)]+[ceiling])
    scene = o3d.t.geometry.RaycastingScene()
    scene.add_triangles(o3d.t.geometry.TriangleMesh.from_legacy(mesh))
    added_v, added_f, added_c, records = [], [], [], []
    offset = 0
    for plane in planes:
        axis = plane["axis"]
        axes = [a for a in range(3) if a != axis]
        lo, hi = np.array(plane["support_min"]), np.array(plane["support_max"])
        if axis == 2:
            lo, hi = envelope_min.copy(), envelope_max.copy()
        else:
            lo[2], hi[2] = floor, ceiling
            # Outer supported planes complete the envelope; internal walls retain
            # their observed span. All visible openings are subsequently depth-vetoed.
            if min(abs(plane["position"]-envelope_min[axis]), abs(plane["position"]-envelope_max[axis])) < .04:
                lo, hi = envelope_min.copy(), envelope_max.copy()
        us = np.linspace(lo[axes[0]], hi[axes[0]], int(np.ceil((hi[axes[0]]-lo[axes[0]])/.03))+1)
        vs = np.linspace(lo[axes[1]], hi[axes[1]], int(np.ceil((hi[axes[1]]-lo[axes[1]])/.03))+1)
        vv, uu = np.meshgrid(vs, us, indexing="ij")
        points = np.zeros((uu.size, 3))
        points[:, axis] = plane["position"]
        points[:, axes[0]], points[:, axes[1]] = uu.ravel(), vv.ravel()
        ids = np.arange(uu.size).reshape(uu.shape)
        a,b,c,d = ids[:-1,:-1].ravel(),ids[:-1,1:].ravel(),ids[1:,:-1].ravel(),ids[1:,1:].ravel()
        faces = np.concatenate([np.stack([a,b,c],1),np.stack([b,d,c],1)])
        distance = scene.compute_distance(o3d.core.Tensor(points.astype(np.float32))).numpy()
        faces = faces[(distance[faces].max(1) > .018)]
        print("Plane", axis, round(plane["position"], 3), len(faces), "proposed faces", flush=True)
        faces, checks = dense_filter(points, faces, data/"ai_001_004/images/scene_cam_00_geometry_hdf5",
                                    list(range(100)), poses, K, unit, tolerance=.02,
                                    max_reference_depth=np.inf, protect_invalid=True)
        used, inverse = np.unique(faces, return_inverse=True)
        # Reuse only material samples from the matching supported plane.
        anchors = v[plane["ids"]]
        cloud = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(anchors))
        tree = o3d.geometry.KDTreeFlann(cloud)
        rgb = np.empty((len(used), 3))
        for i, point in enumerate(points[used]):
            _, nearest, distance2 = tree.search_knn_vector_3d(point, 4)
            weights = 1/np.maximum(np.asarray(distance2), 1e-5)
            rgb[i] = np.average(color[plane["ids"][nearest]], axis=0, weights=weights)
        added_v.append(points[used]); added_f.append(inverse.reshape(-1,3)+offset); added_c.append(rgb)
        offset += len(used)
        records.append({k:value for k,value in plane.items() if k != "ids"} | {"accepted_faces":len(faces),"checks":checks})
    extra_v, extra_f = np.concatenate(added_v), np.concatenate(added_f)
    result = o3d.geometry.TriangleMesh(o3d.utility.Vector3dVector(np.concatenate([v,extra_v])),
                                     o3d.utility.Vector3iVector(np.concatenate([f,extra_f+len(v)])))
    result.vertex_colors = o3d.utility.Vector3dVector(np.concatenate([color,*added_c]))
    o3d.io.write_triangle_mesh(str(output/"room.ply"), result)
    write_json(output/"planes.json", records)
    write_json(output/"report.json", {
        "method":"All-view TSDF plus source-supported architectural plane completion",
        "role":"source-reconstruction-plus-inferred-completion", "conditioning_frames":list(range(100)),
        "source_mesh_sha256":report["mesh_sha256"],"mesh_sha256":sha256(output/"room.ply"),
        "observed_faces":len(f),"inferred_faces":len(extra_f),"topology":topology(result),
        "bounds_m":[result.get_min_bound().tolist(),result.get_max_bound().tolist()],
        "navigation_bounds_m":report["bounds_m"],"script_sha256":sha256(Path(__file__)),
        "limitations":["Outer envelope and unseen wall extensions are hypotheses, not recovered original geometry.",
                       "Materials reuse nearby same-plane source samples; seams and repetition remain possible.",
                       "Visible depth probes veto contradictions; unsampled triangle interiors can still conflict.",
                       "All 100 views condition the room. No held-out accuracy claim."]})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    run(args.source, args.output)
