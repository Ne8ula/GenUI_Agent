"""Post-freeze held-out depth evaluation; never imported by candidate builders."""
import argparse
import csv
import json
from pathlib import Path
import numpy as np
from PIL import Image
import hypersim as h
from genrc_contract import sha256, write_json
from planar_completion import image_gate


def evaluate(folder):
    report = json.loads((folder / "report.json").read_text())
    assert sha256(folder / "candidate.ply") == report["candidate_sha256"]
    data = h.ROOT / ".local/reconstruction/data-r03"
    with (data / "camera_parameters.csv").open() as f:
        row = next(r for r in csv.DictReader(f) if r["scene_name"] == "ai_001_004")
    matrix = np.array([[float(row[f"M_cam_from_uv_{i}{j}"]) for j in range(3)] for i in range(3)])
    radial = h.read_h5(data / "ai_001_004/images/scene_cam_00_geometry_hdf5/frame.0037.depth_meters.hdf5")
    source = radial * -h.rays(matrix, 1024, 768)[..., 2]
    yy, xx = np.indices((512, 512))
    reference = source[np.floor((yy+.5)*1.5).astype(int), np.floor((xx+.5)*1.5+128).astype(int)]
    with np.load(folder / "provenance.npz") as z:
        depth, added = z["candidate_depth_z_m"], z["added_mask"]
    valid = added & np.isfinite(reference) & (reference > .1) & (reference <= 12)
    error = np.abs(depth[valid]-reference[valid])
    before = np.array(Image.open(h.ROOT / ".local/reconstruction/weave-room-v1/input-room.png").convert("RGB"))
    raw = np.array(Image.open(h.ROOT / "docs/research/hypersim/evidence/weave-room-v1/output-raw.png").convert("RGB"))
    mask = np.array(Image.open(h.ROOT / ".local/reconstruction/weave-room-v1/edit-mask-white.png")) > 0
    result = {"candidate_sha256": report["candidate_sha256"], "evaluation_only_frame": 37,
              "added_pixels": int(added.sum()), "valid_reference_pixels": int(valid.sum()),
              "no_valid_reference_pixels": int((added & ~valid).sum()),
              "added_depth_mae_m": float(error.mean()), "added_depth_p95_m": float(np.quantile(error, .95)),
              "added_depth_max_m": float(error.max()), "fraction_within_5cm": float((error <= .05).mean()),
              "failed_weave_raw_gate": image_gate(before, raw, mask),
              "notes": ["Held-out depth read after candidate hash was frozen; never used for fitting or appearance.",
                        "Reference uses nearest source pixel on the recorded center crop; sampling error remains.",
                        "This evaluates a bounded patch, not whole-room reconstruction quality."]}
    write_json(folder / "evaluation.json", result)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("folder", type=Path)
    evaluate(parser.parse_args().folder)
