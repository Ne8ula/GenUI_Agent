"""Bounded offline Hypersim ai_001_004 baseline; no application/UI integration."""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import subprocess
import time
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "docs/research/hypersim/ai_001_004.json"
DEFAULT_DATA = ROOT / ".local/reconstruction/data"
ARCHIVE = "https://docs-assets.developer.apple.com/ml-research/datasets/hypersim/v1/scenes/ai_001_004.zip"
REPO = "https://raw.githubusercontent.com/apple-aiml-research/ml-hypersim/"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def save_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def config():
    value = json.loads(FIXTURE.read_text(encoding="utf-8"))
    if value["scene"] != "ai_001_004" or value["camera"] != "cam_00":
        raise ValueError("This bounded adapter supports ai_001_004/cam_00 only")
    train, evaluation = value["train_frames"], value["evaluation_frames"]
    if not train or not evaluation or set(train) & set(evaluation):
        raise ValueError("Integration/evaluation frames must be nonempty and disjoint")
    for ids in (train, evaluation):
        if len(ids) != len(set(ids)) or any(type(i) is not int or not 0 <= i < 100 for i in ids):
            raise ValueError("Invalid or duplicate frame IDs")
    if not set(value["position_audit_frames"]) <= set(train):
        raise ValueError("Position audit may only inspect integration frames")
    for key, limit in (("max_download_bytes", 512*1024**2), ("max_extracted_bytes", 1024**3),
                       ("max_range_bytes", 32*1024**2)):
        if not 0 < value[key] <= limit:
            raise ValueError("Resource limit outside bounded decision: " + key)
    if not 0.01 <= value["voxel_size_m"] <= 0.1 or not 0 < value["max_depth_m"] <= 12:
        raise ValueError("Geometry resource settings outside bounded decision")
    if not value["voxel_size_m"] <= value["sdf_trunc_m"] <= 0.2:
        raise ValueError("Invalid TSDF truncation")
    for key in ("integration_pixel_stride", "evaluation_pixel_stride"):
        if type(value[key]) is not int or not 1 <= value[key] <= 16:
            raise ValueError("Invalid pixel stride")
    return value


class Budget:
    def __init__(self, limit, consumed=0):
        self.limit, self.used = limit, consumed

    def read(self, url, cap, headers=None, expected_range=None):
        if cap <= 0 or self.used + cap > self.limit:
            raise ValueError("Download budget exceeded before request")
        request = urllib.request.Request(url, headers=headers or {})
        with urllib.request.urlopen(request, timeout=45) as response:
            if expected_range is not None:
                if response.status != 206 or response.headers.get("Content-Range") != expected_range:
                    raise ValueError("Server did not honor the exact bounded range")
            data = response.read(cap + 1)
        self.used += len(data)
        if len(data) > cap:
            raise ValueError("Response exceeded bounded size")
        return data


class RemoteZip(io.RawIOBase):
    def __init__(self, url, budget, max_range, expected_size=None):
        self.url, self.budget, self.max_range, self.pos = url, budget, max_range, 0
        with urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=30) as response:
            self.size = int(response.headers["Content-Length"])
        if expected_size is not None and self.size != expected_size:
            raise ValueError("Archive size changed since previous fetch")

    def seekable(self):
        return True

    def readable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, offset, whence=0):
        self.pos = offset if whence == 0 else self.pos + offset if whence == 1 else self.size + offset
        if not 0 <= self.pos <= self.size:
            raise ValueError("Invalid archive seek")
        return self.pos

    def read(self, n=-1):
        n = min(n if n >= 0 else self.size-self.pos, self.size-self.pos)
        if n == 0:
            return b""
        if n < 0 or n > self.max_range:
            raise ValueError("Oversized archive range")
        end = self.pos+n-1
        data = self.budget.read(self.url, n, {"Range": f"bytes={self.pos}-{end}"},
                                f"bytes {self.pos}-{end}/{self.size}")
        if len(data) != n:
            raise ValueError("Truncated range response")
        self.pos += len(data)
        return data


def required_entries(c):
    scene, camera = c["scene"], c["camera"]
    detail = f"{scene}/_detail"
    entries = [f"{detail}/metadata_scene.csv", f"{detail}/metadata_cameras.csv"]
    entries += [f"{detail}/{camera}/camera_keyframe_{name}.hdf5"
                for name in ("frame_indices", "positions", "orientations")]
    for frame in c["train_frames"] + c["evaluation_frames"]:
        prefix = f"{scene}/images/scene_{camera}"
        entries += [f"{prefix}_geometry_hdf5/frame.{frame:04d}.depth_meters.hdf5",
                    f"{prefix}_final_hdf5/frame.{frame:04d}.color.hdf5"]
    entries += [f"{scene}/images/scene_{camera}_geometry_hdf5/frame.{frame:04d}.position.hdf5"
                for frame in c["position_audit_frames"]]
    return entries


def destination(root, name):
    path = (root / name).resolve()
    if not path.is_relative_to(root.resolve()) or "\\" in name or ":" in name:
        raise ValueError("Unsafe input path")
    return path


def verify_manifest(data, c):
    manifest = json.loads((data / "manifest.json").read_text(encoding="utf-8"))
    if manifest["status"] != "complete" or manifest["fixture_sha256"] != digest(FIXTURE.read_bytes()):
        raise ValueError("Incomplete fetch or fixture changed")
    expected = set(required_entries(c)) | {"camera_parameters.csv", "metadata_images.csv", "LICENSE.txt"}
    if set(manifest["files"]) != expected:
        raise ValueError("Input manifest does not match bounded selection")
    for name, record in manifest["files"].items():
        if digest(destination(data, name).read_bytes()) != record["sha256"]:
            raise ValueError("Input hash mismatch: " + name)
    return manifest


def fetch(data):
    c = config()
    data.mkdir(parents=True, exist_ok=True)
    manifest_path = data / "manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest["fixture_sha256"] != digest(FIXTURE.read_bytes()):
            raise ValueError("Use a new data directory for a changed fixture")
        if manifest["status"] == "complete":
            verify_manifest(data, c)
            print("Verified cached input manifest", flush=True)
            return
    else:
        manifest = {"status": "fetching", "fixture_sha256": digest(FIXTURE.read_bytes()),
                    "archive": ARCHIVE, "files": {}, "network_bytes": 0,
                    "license": c["license"], "attribution": c["attribution"]}
    budget = Budget(c["max_download_bytes"], manifest["network_bytes"])

    def persist():
        manifest["network_bytes"] = budget.used
        save_json(manifest_path, manifest)

    def save(name, payload, source):
        path = destination(data, name)
        if path.exists() and digest(path.read_bytes()) != digest(payload):
            raise ValueError("Refusing to replace different input: " + name)
        if sum(r["bytes"] for r in manifest["files"].values()) + len(payload) > c["max_extracted_bytes"]:
            raise ValueError("Extraction budget exceeded")
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            temporary = path.with_suffix(path.suffix + ".tmp")
            temporary.write_bytes(payload)
            os.replace(temporary, path)
        manifest["files"][name] = {"sha256": digest(payload), "bytes": len(payload), "source": source}
        persist()

    def cached(name):
        if name not in manifest["files"]:
            return False
        if digest(destination(data, name).read_bytes()) != manifest["files"][name]["sha256"]:
            raise ValueError("Cached input changed: " + name)
        return True

    try:
        if "upstream_commit" not in manifest:
            commit = json.loads(budget.read("https://api.github.com/repos/apple-aiml-research/ml-hypersim/commits/main", 1024**2))["sha"]
            if len(commit) != 40 or any(ch not in "0123456789abcdef" for ch in commit):
                raise ValueError("Invalid upstream revision")
            manifest["upstream_commit"] = commit
            persist()
        raw = REPO + manifest["upstream_commit"] + "/"
        for local, remote, cap in [
            ("camera_parameters.csv", "contrib/mikeroberts3000/metadata_camera_parameters.csv", 2*1024**2),
            ("metadata_images.csv", "evermotion_dataset/analysis/metadata_images.csv", 16*1024**2),
            ("LICENSE.txt", "LICENSE.txt", 1024**2),
        ]:
            if not cached(local):
                save(local, budget.read(raw+remote, cap), raw+remote)
        stream = RemoteZip(ARCHIVE, budget, c["max_range_bytes"], manifest.get("archive_bytes"))
        manifest["archive_bytes"] = stream.size
        with zipfile.ZipFile(stream) as archive:
            selected = required_entries(c)
            if sum(archive.getinfo(name).file_size for name in selected) > c["max_extracted_bytes"]:
                raise ValueError("Selected extraction too large")
            for i, name in enumerate(selected):
                if cached(name):
                    continue
                if archive.getinfo(name).file_size > c["max_range_bytes"]:
                    raise ValueError("Oversized input entry")
                save(name, archive.read(name), ARCHIVE + "#" + name)
                print(f"Fetched {i+1}/{len(selected)}: {name}", flush=True)
        manifest["status"] = "complete"
    except BaseException:
        manifest["status"] = "interrupted-or-failed"
        raise
    finally:
        persist()


def rays(matrix, width, height):
    import numpy as np
    if (width, height) != (1024, 768) or matrix.shape != (3, 3) or not np.isfinite(matrix).all():
        raise ValueError("Unsupported dimensions or camera matrix")
    if not np.allclose(matrix, np.diag(np.diag(matrix)), atol=1e-12) or not (matrix[0, 0] > 0 and matrix[1, 1] > 0 and matrix[2, 2] == -1):
        raise ValueError("TSDF adapter only supports centered pinhole intrinsics")
    u = 2*(np.arange(width)+0.5)/width-1
    v = 1-2*(np.arange(height)+0.5)/height
    xx, yy = np.meshgrid(u, v)
    vectors = np.stack([xx, yy, np.ones_like(xx)], axis=-1) @ matrix.T
    return vectors / np.linalg.norm(vectors, axis=-1, keepdims=True)


def validate_pose(rotation, translation, scale):
    import numpy as np
    if rotation.shape != (3, 3) or translation.shape != (3,) or not np.isfinite(rotation).all() or not np.isfinite(translation).all():
        raise ValueError("Invalid pose shape/values")
    if not np.allclose(rotation.T@rotation, np.eye(3), atol=1e-5) or not np.isclose(np.linalg.det(rotation), 1, atol=1e-5):
        raise ValueError("Pose rotation is not a proper rotation")
    if not np.isfinite(scale) or not 0 < scale <= 1:
        raise ValueError("Invalid metric scale")


def world_points(depth, unit_rays, rotation, translation, scale):
    import numpy as np
    validate_pose(rotation, translation, scale)
    if depth.shape != unit_rays.shape[:-1]:
        raise ValueError("Depth/ray shape mismatch")
    valid = np.isfinite(depth) & (depth > 0)
    points = depth[..., None] * (unit_rays @ rotation.T) + translation*scale
    points[~valid] = np.nan
    return points, valid


def camera_extrinsic(rotation, translation, scale):
    import numpy as np
    validate_pose(rotation, translation, scale)
    camera_to_world = np.eye(4)
    camera_to_world[:3, :3] = rotation @ np.diag([1., -1., -1.])
    camera_to_world[:3, 3] = translation*scale
    return np.linalg.inv(camera_to_world)


def read_h5(path):
    import h5py
    with h5py.File(path, "r") as handle:
        dataset = handle["dataset"]
        if dataset.size > 1024*768*4:
            raise ValueError("Oversized HDF5 dataset")
        return dataset[:]


def tone_map(hdr):
    import numpy as np
    if hdr.shape != (768, 1024, 3) or not np.isfinite(hdr).all():
        raise ValueError("Invalid source HDR color")
    rgb = np.maximum(hdr.astype(np.float64), 0)
    return np.round(255 * (rgb / (1+rgb)) ** (1/2.2)).astype(np.uint8)


def score_depth(frame, reference, predicted, valid):
    """Retain missing views in denominators; undefined conditional errors stay null."""
    import numpy as np
    overlap = valid & np.isfinite(predicted)
    errors = np.abs(predicted[overlap]-reference[overlap])
    count = int(valid.sum())
    return {
        "frame": frame,
        "status": "no-valid-reference" if not count else "no-mesh-hits" if not len(errors) else "evaluated",
        "reference_valid_pixels": count,
        "mesh_hit_pixels": int(overlap.sum()),
        "hit_coverage": float(overlap.sum()/count) if count else None,
        "mae_m_on_hits": float(errors.mean()) if len(errors) else None,
        "median_m_on_hits": float(np.median(errors)) if len(errors) else None,
        "p95_m_on_hits": float(np.percentile(errors, 95)) if len(errors) else None,
        "within_5cm_fraction_of_all_valid": float((errors <= 0.05).sum()/count) if count else None,
    }


def reconstruct(data, output):
    import numpy as np
    import open3d as o3d
    from PIL import Image, ImageDraw

    c = config()
    manifest = verify_manifest(data, c)
    if output.exists():
        raise ValueError("Output already exists; choose a new run directory to preserve evidence")
    output.mkdir(parents=True)
    started = time.perf_counter()
    report = {"status": "running", "fixture": c, "input_manifest_sha256": digest((data/"manifest.json").read_bytes()),
              "source_revision": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
              "script_sha256": digest(Path(__file__).read_bytes()), "python": platform.python_version(),
              "numpy": np.__version__, "open3d": o3d.__version__, "condition": c["condition"],
              "attribution": c["attribution"], "dataset_license": "CC-BY-SA-3.0",
              "dataset_license_url": "https://creativecommons.org/licenses/by-sa/3.0/",
              "dataset_license_source": REPO+manifest["upstream_commit"]+"/README.md",
              "downloaded_LICENSE_txt_scope": "Apple toolkit software license, separate from dataset license",
              "tone_mapping": "per-channel Reinhard x/(1+x), gamma 1/2.2, fixed for every frame",
              "evaluation": [], "position_audit": []}
    save_json(output/"report.json", report)
    try:
        with (data/"camera_parameters.csv").open() as handle:
            intrinsics = next(r for r in csv.DictReader(handle) if r["scene_name"] == c["scene"])
        width, height = int(float(intrinsics["settings_output_img_width"])), int(float(intrinsics["settings_output_img_height"]))
        matrix = np.array([[float(intrinsics[f"M_cam_from_uv_{i}{j}"]) for j in range(3)] for i in range(3)])
        unit = rays(matrix, width, height)
        detail = data/c["scene"]/"_detail"
        with (detail/"metadata_scene.csv").open() as handle:
            scene_meta = {r["parameter_name"]: r["parameter_value"] for r in csv.DictReader(handle)}
        scale = float(scene_meta["meters_per_asset_unit"])
        if not np.isclose(scale, float(intrinsics["settings_units_info_meters_scale"]), rtol=1e-5):
            raise ValueError("Conflicting metric-scale metadata")
        indices = read_h5(detail/c["camera"]/"camera_keyframe_frame_indices.hdf5").reshape(-1)
        rotations = read_h5(detail/c["camera"]/"camera_keyframe_orientations.hdf5")
        positions = read_h5(detail/c["camera"]/"camera_keyframe_positions.hdf5")
        if len(set(indices.tolist())) != len(indices) or len(rotations) != len(indices) or len(positions) != len(indices):
            raise ValueError("Ambiguous frame-to-pose mapping")
        pose = {int(frame): (rotations[i], positions[i]) for i, frame in enumerate(indices)}
        with (data/"metadata_images.csv").open() as handle:
            released = {int(r["frame_id"]): r for r in csv.DictReader(handle)
                        if r["scene_name"] == c["scene"] and r["camera_name"] == c["camera"]}
        for frame in c["train_frames"]+c["evaluation_frames"]:
            if frame not in pose or frame not in released or released[frame]["included_in_public_release"].lower() != "true":
                raise ValueError("Unreleased frame or missing pose: " + str(frame))
        image_root = data/c["scene"]/"images"

        def load(frame, suffix, kind="geometry"):
            return read_h5(image_root/f"scene_{c['camera']}_{kind}_hdf5"/f"frame.{frame:04d}.{suffix}.hdf5")

        cameras = []
        for frame in c["train_frames"]+c["evaluation_frames"]:
            rotation, translation = pose[frame]
            extrinsic = camera_extrinsic(rotation, translation, scale)
            cameras.append({"frame": frame, "role": "integration" if frame in c["train_frames"] else "evaluation",
                            "world_from_cv_m": np.linalg.inv(extrinsic).tolist()})
        save_json(output/"cameras.json", {"coordinate_system": "Hypersim world, meters", "cameras": cameras})
        for frame in c["position_audit_frames"]:
            points, valid = world_points(load(frame, "depth_meters")[::8, ::8], unit[::8, ::8], *pose[frame], scale)
            reference = load(frame, "position")[::8, ::8]*scale
            valid &= np.isfinite(reference).all(axis=-1)
            errors = np.linalg.norm(points[valid]-reference[valid], axis=-1)
            if not len(errors):
                raise ValueError("Position audit has no valid samples")
            audit = {"frame": frame, "samples": len(errors), "median_m": float(np.median(errors)),
                     "p95_m": float(np.percentile(errors, 95)), "max_m": float(errors.max())}
            report["position_audit"].append(audit)
            if audit["p95_m"] > 0.01:
                raise ValueError("Coordinate audit exceeds 1 cm p95; do not fuse")
        stride = c["integration_pixel_stride"]
        fx, fy = width/(2*matrix[0, 0]), height/(2*matrix[1, 1])
        intrinsic = o3d.camera.PinholeCameraIntrinsic(len(range(0, width, stride)), len(range(0, height, stride)),
                    fx/stride, fy/stride, (width-1)/(2*stride), (height-1)/(2*stride))
        volume = o3d.pipelines.integration.ScalableTSDFVolume(voxel_length=c["voxel_size_m"],
                    sdf_trunc=c["sdf_trunc_m"], color_type=o3d.pipelines.integration.TSDFVolumeColorType.RGB8)
        for frame in c["train_frames"]:
            radial = load(frame, "depth_meters")
            if radial.shape != (height, width):
                raise ValueError("Invalid depth dimensions")
            planar = radial * -unit[..., 2]
            valid = np.isfinite(planar) & (planar > 0) & (planar <= c["max_depth_m"])
            planar = np.where(valid, planar, 0)[::stride, ::stride].astype(np.float32)
            color = np.ascontiguousarray(tone_map(load(frame, "color", "final"))[::stride, ::stride])
            rgbd = o3d.geometry.RGBDImage.create_from_color_and_depth(o3d.geometry.Image(color),
                    o3d.geometry.Image(np.ascontiguousarray(planar)), depth_scale=1,
                    depth_trunc=c["max_depth_m"], convert_rgb_to_intensity=False)
            volume.integrate(rgbd, intrinsic, camera_extrinsic(*pose[frame], scale))
            print("Integrated", frame, flush=True)
        mesh = volume.extract_triangle_mesh()
        mesh.compute_vertex_normals()
        if not len(mesh.triangles):
            raise ValueError("Empty reconstruction")
        if not o3d.io.write_triangle_mesh(str(output/"room-mesh.ply"), mesh):
            raise OSError("Mesh export failed")
        cloud = volume.extract_point_cloud()
        if not o3d.io.write_point_cloud(str(output/"room-points.ply"), cloud):
            raise OSError("Point export failed")
        # Actual mesh raycasts, never authored preview geometry.
        scene = o3d.t.geometry.RaycastingScene()
        scene.add_triangles(o3d.t.geometry.TriangleMesh.from_legacy(mesh))
        colors = np.asarray(mesh.vertex_colors)
        triangles = np.asarray(mesh.triangles)
        step = c["evaluation_pixel_stride"]
        evaluation_unit = unit[::step, ::step]
        panels = []
        for frame in c["evaluation_frames"]:
            rotation, translation = pose[frame]
            directions = evaluation_unit @ rotation.T
            origins = np.broadcast_to(translation*scale, directions.shape)
            ray_tensor = o3d.core.Tensor(np.concatenate([origins, directions], axis=-1).astype(np.float32))
            hits = scene.cast_rays(ray_tensor)
            predicted = hits["t_hit"].numpy()
            reference = load(frame, "depth_meters")[::step, ::step]
            valid = np.isfinite(reference) & (reference > 0) & (reference * -evaluation_unit[..., 2] <= c["max_depth_m"])
            overlap = valid & np.isfinite(predicted)
            errors = np.abs(predicted[overlap]-reference[overlap])
            record = score_depth(frame, reference, predicted, valid)
            report["evaluation"].append(record)
            observed = tone_map(load(frame, "color", "final"))[::step, ::step]
            rendered = np.full_like(observed, 32)
            hit_mask = np.isfinite(predicted)
            ids = hits["primitive_ids"].numpy()[hit_mask].astype(np.int64)
            uv = hits["primitive_uvs"].numpy()[hit_mask]
            barycentric = np.column_stack([1-uv.sum(axis=1), uv])
            rendered[hit_mask] = np.round(255*np.sum(colors[triangles[ids]]*barycentric[..., None], axis=1)).clip(0, 255).astype(np.uint8)
            error_image = np.full_like(observed, [110, 0, 110])
            error_image[~valid] = 0
            magnitude = np.clip(errors/0.10, 0, 1)
            error_image[overlap] = np.column_stack([255*magnitude, 180*(1-magnitude), np.zeros_like(magnitude)]).astype(np.uint8)
            panels.append((frame, observed, rendered, error_image))
            print("Evaluated", json.dumps(record), flush=True)
        sheet = Image.new("RGB", (3*512, 4*420+70), "#f1f1ed")
        draw = ImageDraw.Draw(sheet)
        for row, (frame, source, rendered, errors) in enumerate(panels):
            for col, (pixels, label) in enumerate([(source, "Source HDR, tone mapped"), (rendered, "Raycast of reconstructed mesh"),
                                                  (errors, "Depth error: green 0 / red >=10 cm / purple missing")]):
                sheet.paste(Image.fromarray(pixels).resize((512, 384)), (col*512, row*420))
                draw.text((col*512+8, row*420+391), f"Frame {frame:04d} | {label}", fill="black")
        draw.text((8, 1688), "Apple Hypersim / Evermotion, CC BY-SA 3.0. Supplied depth + poses; four withheld views. Raw technical evidence.", fill="black")
        sheet.save(output/"evaluation.png")
        report.update({"status": "complete", "vertices": len(mesh.vertices), "triangles": len(mesh.triangles),
                       "point_count": len(cloud.points), "bounds_m": [mesh.get_min_bound().tolist(), mesh.get_max_bound().tolist()],
                       "elapsed_seconds": time.perf_counter()-started,
                       "limits": ["One synthetic room and one camera trajectory", "No RGB-only inference or independent physical ground truth",
                                  "Evaluation error is conditional on mesh hits; coverage is reported separately",
                                  "No UI integration, automatic objects, memory anchors or owner milestone acceptance"]})
        report["output_sha256"] = {p.name: digest(p.read_bytes()) for p in output.iterdir() if p.is_file() and p.name != "report.json"}
    except BaseException as error:
        report.update({"status": "interrupted" if isinstance(error, KeyboardInterrupt) else "failed",
                       "error": str(error), "elapsed_seconds": time.perf_counter()-started})
        raise
    finally:
        save_json(output/"report.json", report)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["fetch", "reconstruct"])
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.command == "fetch":
        fetch(args.data)
    else:
        if args.output is None:
            parser.error("reconstruct requires a fresh --output directory")
        reconstruct(args.data, args.output)


if __name__ == "__main__":
    main()
