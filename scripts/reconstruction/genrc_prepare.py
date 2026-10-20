"""Package verified r03 geometry and training-only depth checks; never invoke cloud."""
import argparse
import csv
import json
from pathlib import Path
import shutil
import zipfile

import numpy as np
import hypersim as h
from genrc_contract import sha256, write_json, validate_manifest, MAX_BUNDLE_BYTES


def prepare(data, run, fixture, output, roi, seed=0, steps=30, seam_m=.01):
    c = h.config(fixture)
    h.verify_manifest(data, c, fixture)
    report = json.loads((run / "report.json").read_text())
    if report["status"] != "complete" or report["fixture"] != c or sha256(data/"manifest.json") != report["input_manifest_sha256"]:
        raise ValueError("Matching completed r03 run required")
    for name in ("room-mesh.ply", "cameras.json"):
        if sha256(run/name) != report["output_sha256"][name]:
            raise ValueError("Source run changed")
    with (data / "camera_parameters.csv").open() as handle:
        row = next(r for r in csv.DictReader(handle) if r["scene_name"] == c["scene"])
    matrix = np.array([[float(row[f"M_cam_from_uv_{i}{j}"]) for j in range(3)] for i in range(3)])
    rays = h.rays(matrix, 1024, 768)
    # Edge-coordinate intrinsics: GenRC uses pixel centers x+.5, y+.5.
    K = np.array([[512/matrix[0,0], 0, 512], [0, 384/matrix[1,1], 384], [0,0,1.]])
    crop_K = K.copy()
    crop_K[0,2] -= 128
    crop_K[:2] *= 512/768
    cameras = {r["frame"]: r for r in json.loads((run/"cameras.json").read_text())["cameras"]}
    if c["revision"] != "r03" or c["evaluation_frames"] != [12,37,62,87]:
        raise ValueError("Only the frozen r03 development fixture is supported")
    output.mkdir(parents=True, exist_ok=False)
    shutil.copyfile(run / "room-mesh.ply", output / "room.ply")
    # All 96 training frames, sparsely sampled. Withheld RGB/depth never enter the bundle.
    frames = c["train_frames"]
    depths = []
    for frame in frames:
        path = data/c["scene"]/"images"/"scene_cam_00_geometry_hdf5"/f"frame.{frame:04d}.depth_meters.hdf5"
        distance = h.read_h5(path)
        z = distance * -rays[...,2]
        depths.append(z[8::16,8::16].astype(np.float32))
    np.savez_compressed(output/"observations.npz", depth=np.array(depths),
        world_to_cv=np.array([np.linalg.inv(cameras[f]["world_from_cv_m"]) for f in frames]),
        K=K, frames=np.array(frames), sample_offset=np.array(8.5), sample_stride=np.array(16))
    manifest = {"version":1, "scene":c["scene"], "condition":"genrc-perspective-pilot",
        "source":{"mesh_sha256":sha256(output/"room.ply"), "report_sha256":sha256(run/"report.json"),
                  "input_manifest_sha256":report["input_manifest_sha256"], "license":c["license"], "attribution":c["attribution"]},
        "files":{name:{"sha256":sha256(output/name), "bytes":(output/name).stat().st_size} for name in ("room.ply","observations.npz")},
        "camera":{"frame":37, "K":crop_K.tolist(), "world_from_cv_m":cameras[37]["world_from_cv_m"], "crop":[128,0,768,768,512]},
        "bounds_m":report["bounds_m"], "seed":seed, "steps":steps, "roi":roi, "seam_m":seam_m,
        "prompt":"A coherent furnished living room. Continue the existing walls, floor, materials and existing furniture. Preserve openings. No additional rooms or new furnishings.",
        "evaluation_status":"development-candidate"}
    validate_manifest(manifest)
    write_json(output/"manifest.json", manifest)
    with zipfile.ZipFile(output/"input.zip", "x", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in ("manifest.json","room.ply","observations.npz"):
            archive.write(output/name, name)
    if (output/"input.zip").stat().st_size > MAX_BUNDLE_BYTES:
        raise ValueError("Bundle exceeds cloud input cap")
    return manifest


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--data", type=Path, default=h.ROOT/".local/reconstruction/data-r03")
    p.add_argument("--run", type=Path, default=h.ROOT/".local/reconstruction/runs/ai_001_004-r03")
    p.add_argument("--fixture", type=Path, default=h.ROOT/"docs/research/hypersim/ai_001_004-r03.json")
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--roi", type=int, nargs=4, default=[0,0,512,512])
    a = p.parse_args()
    prepare(a.data, a.run, a.fixture, a.output, a.roi)
    print("Prepared", a.output/"input.zip", "(no cloud call)")
