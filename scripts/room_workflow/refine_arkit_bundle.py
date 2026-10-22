"""Original-only SIFT support gate and bounded sparse bundle refinement.

No reference depth, held-out image, learned tracker or new model call is read.
Insufficient connected support produces an explicit not-run artifact.
"""
import argparse
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import time

import cv2
import numpy as np
from PIL import Image

POLICY = {"feature_long_edge": 1024, "features_per_image": 3000, "ratio": .75,
          "initial_reprojection_pixels": 8., "minimum_observations_per_camera": 64,
          "minimum_tracks": 100, "maximum_tracks": 1000, "minimum_track_views": 2,
          "require_all_cameras_connected": True, "confidence_selection": "frozen upper 75 percent",
          "solver_max_nfev": 50, "wallclock_seconds": 120, "rss_bytes": 2*1024**3,
          "gauge": "first camera pose and first anchor depth in first-camera coordinates fixed",
          "rotation_bounds_degrees": 3., "translation_bound_extent_fraction": .03,
          "point_bound_extent_fraction": .05, "focal_log_scale_bound": .03,
          "principal_point_and_aspect_ratio": "fixed", "loss": "huber", "f_scale_pixels": 2.,
          "validation": "every fifth track with at least three views reserves its last observation",
          "minimum_reserved_observations": 20}
SOURCES = {
    "official_optional_external_tracks_and_ba": "https://github.com/facebookresearch/vggt/blob/a288dd0f14786c93483e45524328726ab7b1b4ce/demo_colmap.py#L132-L172",
    "official_multiview_track_and_minimum_support": "https://github.com/facebookresearch/vggt/blob/a288dd0f14786c93483e45524328726ab7b1b4ce/vggt/dependency/np_to_pycolmap.py#L10-L71",
    "sparse_bounded_robust_optimizer": "https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.least_squares.html",
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def project(points, camera):
    pose, k = np.asarray(camera["world_to_camera"]), np.asarray(camera["intrinsics"])
    local = points@pose[:, :3].T+pose[:, 3]
    xyh = local@k.T
    return xyh[:, :2]/np.maximum(local[:, 2:], 1e-8), local[:, 2]


def build_tracks(edges):
    """Union matches only if their track has at most one keypoint per image."""
    parent, groups = {}, {}
    def find(node):
        parent.setdefault(node, node); groups.setdefault(node, {node})
        while parent[node] != node:
            parent[node] = parent[parent[node]]; node = parent[node]
        return node
    for _, left, right in sorted(edges, key=lambda e: e[0]):
        a, b = find(left), find(right)
        if a == b:
            continue
        if {n[0] for n in groups[a]} & {n[0] for n in groups[b]}:
            continue
        parent[b] = a; groups[a] |= groups.pop(b)
    return sorted([sorted(group) for group in groups.values() if len(group) >= POLICY["minimum_track_views"]],
                  key=lambda group: (-len(group), group))


def support_gate(tracks, camera_count):
    counts = np.zeros(camera_count, int)
    adjacent = [set() for _ in range(camera_count)]
    for track in tracks:
        frames = {node[0] for node in track}
        for frame in frames:
            counts[frame] += 1
            adjacent[frame].update(frames-{frame})
    components, unseen = [], set(range(camera_count))
    while unseen:
        stack, component = [min(unseen)], set()
        while stack:
            node = stack.pop()
            if node in component:
                continue
            component.add(node); stack.extend(adjacent[node]-component)
        unseen -= component; components.append(sorted(component))
    reasons = []
    if len(tracks) < POLICY["minimum_tracks"]:
        reasons.append("insufficient-tracks")
    if np.any(counts < POLICY["minimum_observations_per_camera"]):
        reasons.append("insufficient-per-camera-support")
    if len(components) != 1:
        reasons.append("disconnected-camera-graph")
    return {"passed": not reasons, "reasons": reasons, "tracks": len(tracks),
            "observations_per_camera": counts.tolist(), "camera_components": components}


def extract_sources(result, request):
    from prediction_fields import unpack
    fields = unpack(result["prediction_fields"])
    sift = cv2.SIFT_create(nfeatures=POLICY["features_per_image"])
    sources = []
    for i, record in enumerate(request["images"]):
        data = base64.b64decode(record["data_base64"], validate=True)
        if sha(data) != record["sha256"]:
            raise ValueError("Original source changed")
        image = Image.open(io.BytesIO(data)).convert("RGB")
        transform = result["preprocessing"][i]
        factor = POLICY["feature_long_edge"]/max(image.size)
        size = tuple(round(v*factor) for v in image.size)
        rgb = np.asarray(image.resize(size, Image.Resampling.LANCZOS))
        keypoints, descriptors = sift.detectAndCompute(cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY), None)
        xy = np.asarray([key.pt for key in keypoints], np.float64).reshape(-1, 2)
        xy *= np.asarray(transform["resized_size"])/size
        xy += transform["padding_left_top"]
        pixel = np.rint(xy).astype(int).clip(0, 517)
        valid = fields["selected_valid"][i, pixel[:, 1], pixel[:, 0]].astype(bool)
        depth = fields["depth"][i, pixel[:, 1], pixel[:, 0]]
        k = np.asarray(result["arms"]["A"]["cameras"][i]["intrinsics"])
        pose = np.asarray(result["arms"]["A"]["cameras"][i]["world_to_camera"])
        rays = np.column_stack([xy, np.ones(len(xy))])@np.linalg.inv(k).T
        points = (rays*depth[:, None]-pose[:, 3])@pose[:, :3]
        sources.append({"xy": xy, "descriptors": descriptors, "valid": valid, "points": points})
    return sources


def original_tracks(result, sources):
    matcher, edges, pairs = cv2.BFMatcher(cv2.NORM_L2), [], []
    cameras = result["arms"]["A"]["cameras"]
    for i, source in enumerate(sources):
        for j in range(i+1, len(sources)):
            other = sources[j]
            if source["descriptors"] is None or other["descriptors"] is None:
                pairs.append({"i": i, "j": j, "mutual_depth_valid_matches": 0, "geometry_supported_matches": 0})
                continue
            reverse = {m.queryIdx: m.trainIdx for m in matcher.match(other["descriptors"], source["descriptors"])}
            matches = [a for pair in matcher.knnMatch(source["descriptors"], other["descriptors"], k=2)
                       if len(pair) == 2 for a, b in [pair]
                       if a.distance < POLICY["ratio"]*b.distance and reverse.get(a.trainIdx) == a.queryIdx
                       and source["valid"][a.queryIdx] and other["valid"][a.trainIdx]]
            supported = 0
            for match in matches:
                a, b = match.queryIdx, match.trainIdx
                p1, z1 = project(source["points"][a:a+1], cameras[j])
                p2, z2 = project(other["points"][b:b+1], cameras[i])
                if min(z1[0], z2[0]) <= 0 or max(np.linalg.norm(p1[0]-other["xy"][b]),
                                                np.linalg.norm(p2[0]-source["xy"][a])) > POLICY["initial_reprojection_pixels"]:
                    continue
                supported += 1
                edges.append((match.distance, (i, a), (j, b)))
            pairs.append({"i": i, "j": j, "mutual_depth_valid_matches": len(matches),
                          "geometry_supported_matches": supported})
    tracks = build_tracks(edges)[:POLICY["maximum_tracks"]]
    points, observations = [], []
    for p, track in enumerate(tracks):
        points.append(np.median([sources[i]["points"][k] for i, k in track], axis=0))
        observations.extend((i, p, sources[i]["xy"][k].tolist()) for i, k in track)
    return tracks, np.asarray(points).reshape(-1, 3), observations, pairs


def solve_bundle(cameras, points, observations):
    """Sparse, anchored solver; reserved original observations never enter fit."""
    from scipy.optimize import least_squares
    from scipy.sparse import lil_matrix
    n, p = len(cameras), len(points)
    poses = np.asarray([c["world_to_camera"] for c in cameras])
    intrinsics = np.asarray([c["intrinsics"] for c in cameras])
    r0, t0 = poses[0, :, :3], poses[0, :, 3]
    local = points@r0.T+t0
    if p < 1 or local[0, 2] <= 0:
        raise ValueError("No positive scale anchor")
    camera_base = np.asarray([np.r_[cv2.Rodrigues(pose[:, :3])[0].ravel(), pose[:, 3], 0.]
                              for pose in poses[1:]])
    point_mask = np.arange(p*3) != 2
    point_base = local.ravel()[point_mask]
    x0 = np.r_[camera_base.ravel(), point_base]
    extent = max(float(np.linalg.norm(np.ptp(points, axis=0))), .1)
    bound_camera = np.tile([np.deg2rad(3)]*3+[.03*extent]*3+[.03], n-1)
    bounds = np.r_[bound_camera, np.full(len(point_base), .05*extent)]
    cam_idx = np.asarray([o[0] for o in observations], int)
    point_idx = np.asarray([o[1] for o in observations], int)
    xy = np.asarray([o[2] for o in observations], float)
    reserve = np.zeros(len(observations), bool)
    for point in range(p):
        ids = np.flatnonzero(point_idx == point)
        if point % 5 == 0 and len(ids) >= 3:
            reserve[ids[-1]] = True
    train = ~reserve
    def decode(x):
        updated_poses, updated_k = poses.copy(), intrinsics.copy()
        params = x[:7*(n-1)].reshape(-1, 7)
        for i, values in enumerate(params, 1):
            updated_poses[i, :, :3] = cv2.Rodrigues(values[:3])[0]
            updated_poses[i, :, 3] = values[3:6]
            updated_k[i, 0, 0] *= np.exp(values[6]); updated_k[i, 1, 1] *= np.exp(values[6])
        q = local.ravel().copy(); q[point_mask] = x[7*(n-1):]
        world = (q.reshape(-1, 3)-t0)@r0
        return updated_poses, updated_k, world
    def errors(x):
        pp, kk, world = decode(x)
        prediction, depths = np.zeros_like(xy), np.zeros(len(xy))
        for i in range(n):
            selected = cam_idx == i
            camera = {"world_to_camera": pp[i], "intrinsics": kk[i]}
            prediction[selected], depths[selected] = project(world[point_idx[selected]], camera)
        return prediction-xy, depths
    prior_scale = np.r_[np.tile([np.deg2rad(1)]*3+[.01*extent]*3+[.01], n-1),
                        np.full(len(point_base), .02*extent)]
    def residual(x):
        error, _ = errors(x)
        return np.r_[error[train].ravel(), (x-x0)/prior_scale]
    train_ids = np.flatnonzero(train)
    sparsity = lil_matrix((2*len(train_ids)+len(x0), len(x0)), dtype=np.int8)
    point_parameter = np.full(p*3, -1, int); point_parameter[point_mask] = np.arange(len(point_base))+7*(n-1)
    for row, obs in enumerate(train_ids):
        camera, point = cam_idx[obs], point_idx[obs]
        columns = list(range((camera-1)*7, camera*7)) if camera else []
        columns += [int(k) for k in point_parameter[point*3:point*3+3] if k >= 0]
        sparsity[row*2:row*2+2, columns] = 1
    for i in range(len(x0)):
        sparsity[2*len(train_ids)+i, i] = 1
    initial_error, _ = errors(x0)
    optimized = least_squares(residual, x0, bounds=(x0-bounds, x0+bounds), jac_sparsity=sparsity,
                              method="trf", loss="huber", f_scale=2., max_nfev=POLICY["solver_max_nfev"])
    final_error, depths = errors(optimized.x)
    def stats(error, mask):
        lengths = np.linalg.norm(error[mask], axis=1)
        return {"count": int(mask.sum()), "median": float(np.median(lengths)),
                "p90": float(np.quantile(lengths, .9))} if len(lengths) else None
    before, after = stats(initial_error, train), stats(final_error, train)
    before_reserved, after_reserved = stats(initial_error, reserve), stats(final_error, reserve)
    acceptable = (bool(optimized.success) and before_reserved is not None
                  and before_reserved["count"] >= POLICY["minimum_reserved_observations"]
                  and after["median"] <= before["median"]*.95
                  and after_reserved["median"] <= before_reserved["median"]+.2
                  and bool((depths > 0).all()))
    pp, kk, world = decode(optimized.x)
    updated = [dict(camera, world_to_camera=pose.tolist(), intrinsics=k.tolist(),
                    center=(-pose[:, :3].T@pose[:, 3]).tolist())
               for camera, pose, k in zip(cameras, pp, kk)]
    r = residual(x0); z = (r/2.)**2
    initial_cost = float(2*np.sum(np.where(z <= 1, z, 2*np.sqrt(z)-1)))
    return {"status": "candidate-pending-review" if acceptable else "rejected-sparse-refinement",
            "accepted_by_internal_training_gate": acceptable, "solver_success": bool(optimized.success),
            "nfev": optimized.nfev, "initial_objective": initial_cost, "final_objective": optimized.cost,
            "training_before": before, "training_after": after,
            "reserved_original_before": before_reserved, "reserved_original_after": after_reserved,
            "cameras": updated, "sparse_points": world.tolist(),
            "gauge_first_pose_unchanged": bool(np.array_equal(pp[0], poses[0])),
            "gauge_first_anchor_depth_unchanged": bool(np.isclose((world[0]@r0.T+t0)[2], local[0, 2])),
            "dense_candidate_generated": False,
            "meaning": "Sparse refinement only; frozen dense depth must be separately reprojected and reviewed before promotion"}


def run(result_path, request_path, output):
    from review_result import validate_files
    result, request = validate_files(result_path, request_path)
    if output.exists():
        raise ValueError("Refusing to overwrite frozen refinement attempt")
    result_bytes, request_bytes = result_path.read_bytes(), request_path.read_bytes()
    output.mkdir(parents=True)
    frozen = {"policy": POLICY, "sources": SOURCES, "analysis_sha256": sha(result_bytes),
              "request_sha256": sha(request_bytes), "script_sha256": sha(Path(__file__).read_bytes()),
              "source_hashes": result["original_input_hashes"],
              "uses_reference_or_heldout": False, "new_model_execution": False}
    (output/"frozen-policy.json").write_text(json.dumps(frozen, indent=2)+"\n")
    features = extract_sources(result, request)
    tracks, points, observations, pairs = original_tracks(result, features)
    gate = support_gate(tracks, len(request["images"]))
    report = {**frozen, "pair_support": pairs, "connectivity": gate,
              "original_feature_counts": [len(s["xy"]) for s in features],
              "status": "not-run-insufficient-track-support", "bundle_adjustment_executed": False,
              "geometry_modified": False, "selected_candidate_modified": False}
    if gate["passed"]:
        refinement = solve_bundle(result["arms"]["A"]["cameras"], points, observations)
        report.update({"status": refinement["status"], "bundle_adjustment_executed": True, "refinement": refinement})
    (output/"report.json").write_text(json.dumps(report, indent=2, allow_nan=False)+"\n")
    return report


def descendant_pids(root_pid, parent_pairs):
    """Include the Windows venv redirector's numerical Python child."""
    selected = {root_pid}
    while True:
        expanded = selected | {pid for pid, parent in parent_pairs if parent in selected}
        if expanded == selected:
            return sorted(selected)
        selected = expanded


def memory_bytes(process):
    if os.name == "nt":
        import ctypes
        from ctypes import wintypes
        kernel = ctypes.windll.kernel32
        class Entry(ctypes.Structure):
            _fields_ = [("dwSize", wintypes.DWORD), ("cntUsage", wintypes.DWORD),
                        ("th32ProcessID", wintypes.DWORD), ("th32DefaultHeapID", ctypes.c_size_t),
                        ("th32ModuleID", wintypes.DWORD), ("cntThreads", wintypes.DWORD),
                        ("th32ParentProcessID", wintypes.DWORD), ("pcPriClassBase", wintypes.LONG),
                        ("dwFlags", wintypes.DWORD), ("szExeFile", wintypes.WCHAR*260)]
        kernel.CreateToolhelp32Snapshot.argtypes = [wintypes.DWORD, wintypes.DWORD]
        kernel.CreateToolhelp32Snapshot.restype = wintypes.HANDLE
        kernel.Process32FirstW.argtypes = [wintypes.HANDLE, ctypes.POINTER(Entry)]
        kernel.Process32NextW.argtypes = [wintypes.HANDLE, ctypes.POINTER(Entry)]
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        kernel.OpenProcess.restype = wintypes.HANDLE
        snapshot = kernel.CreateToolhelp32Snapshot(2, 0)
        if snapshot == ctypes.c_void_p(-1).value:
            raise OSError("Cannot enumerate bounded CPU worker tree")
        pairs = []
        try:
            entry = Entry(); entry.dwSize = ctypes.sizeof(entry)
            valid = kernel.Process32FirstW(snapshot, ctypes.byref(entry))
            while valid:
                pairs.append((entry.th32ProcessID, entry.th32ParentProcessID))
                valid = kernel.Process32NextW(snapshot, ctypes.byref(entry))
        finally:
            kernel.CloseHandle(snapshot)
        class Counters(ctypes.Structure):
            _fields_ = [("cb", ctypes.c_ulong), ("PageFaultCount", ctypes.c_ulong),
                        *[(name, ctypes.c_size_t) for name in ("PeakWorkingSetSize", "WorkingSetSize",
                          "QuotaPeakPagedPoolUsage", "QuotaPagedPoolUsage", "QuotaPeakNonPagedPoolUsage",
                          "QuotaNonPagedPoolUsage", "PagefileUsage", "PeakPagefileUsage", "PrivateUsage")]]
        inspect = ctypes.windll.psapi.GetProcessMemoryInfo
        inspect.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong]
        inspect.restype = ctypes.c_int
        total = 0
        for pid in descendant_pids(process.pid, pairs):
            handle = kernel.OpenProcess(0x410, False, pid)
            if not handle:
                # A process can exit between the tree snapshot and inspection.
                if kernel.GetLastError() == 87:
                    continue
                raise OSError("Cannot inspect bounded CPU worker")
            try:
                counters = Counters(); counters.cb = ctypes.sizeof(counters)
                if not inspect(handle, ctypes.byref(counters), counters.cb):
                    raise OSError("Cannot enforce CPU worker memory budget")
                total += max(counters.PeakWorkingSetSize, counters.PrivateUsage)
            finally:
                kernel.CloseHandle(handle)
        return total
    path = Path(f"/proc/{process.pid}/status")
    for line in path.read_text().splitlines():
        if line.startswith("VmRSS:"):
            return int(line.split()[1])*1024
    raise OSError("Cannot enforce CPU worker memory budget")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ("result", "request", "output"):
        parser.add_argument("--"+key, type=Path, required=True)
    parser.add_argument("--_worker", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args._worker:
        report = run(args.result, args.request, args.output)
        print(json.dumps({"status": report["status"], "connectivity": report["connectivity"]}))
        return
    command = [sys.executable, str(Path(__file__).resolve()), "--_worker", "--result", str(args.result),
               "--request", str(args.request), "--output", str(args.output)]
    env = dict(os.environ, OPENBLAS_NUM_THREADS="2", OMP_NUM_THREADS="2", MKL_NUM_THREADS="2")
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env,
                               creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    start, peak = time.monotonic(), 0
    try:
        while process.poll() is None:
            peak = max(peak, memory_bytes(process))
            if peak > POLICY["rss_bytes"] or time.monotonic()-start > POLICY["wallclock_seconds"]:
                raise TimeoutError("CPU refinement resource bound exceeded")
            time.sleep(.1)
        stdout, stderr = process.communicate()
        if process.returncode:
            raise RuntimeError("CPU refinement failed: "+stderr[-1000:])
        print(stdout.strip())
        diagnostics = {"peak_worker_tree_memory_bytes": peak,
                       "memory_measurement": "sum of descendant peak working sets or private bytes, including venv redirector",
                       "elapsed_seconds": time.monotonic()-start}
        (args.output/"resource-report.json").write_text(json.dumps(diagnostics, indent=2)+"\n")
        print(json.dumps(diagnostics))
    finally:
        if process.poll() is None:
            if os.name == "nt":
                subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                               creationflags=subprocess.CREATE_NO_WINDOW, timeout=10)
            process.kill(); process.wait()


if __name__ == "__main__":
    main()
