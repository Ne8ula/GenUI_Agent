"""Export a bounded, provenance-labelled all-view room into the existing browser."""
import argparse
import json
from pathlib import Path

import numpy as np
import open3d as o3d
from PIL import Image
import hypersim as h
from genrc_contract import sha256, write_json
from full_room import context, load, evaluate


def provenance_ranges(raw, hybrid, report, mesh):
    if report["source_mesh_sha256"] != raw["mesh_sha256"] or report["parent_mesh_sha256"] != hybrid["mesh_sha256"]:
        raise ValueError("Source lineage does not match provenance reports")
    a, b, n = raw["topology"]["vertices"], hybrid["topology"]["vertices"], len(mesh.vertices)
    fa, fb = raw["topology"]["triangles"], hybrid["topology"]["triangles"]
    if not 0 < a <= b <= n or not 0 < fa <= fb <= len(mesh.triangles):
        raise ValueError("Noncontiguous provenance")
    faces = np.asarray(mesh.triangles)
    assumed = report.get("assumed_space", {})
    c, fc = assumed.get("base_vertices", n), assumed.get("base_faces", len(faces))
    if not b <= c <= n or not fb <= fc <= len(faces):
        raise ValueError("Invalid assumed-space provenance")
    for group, lo, hi in ((faces[:fa], 0, a), (faces[fa:fb], a, b), (faces[fb:fc], b, c), (faces[fc:], c, n)):
        if len(group) and (np.any(group < lo) or np.any(group >= hi)):
            raise ValueError("Triangle crosses provenance categories")
    return {"fused": [0, a], "inferred": [a, b], "source_recovered": [b, c], "assumed_space": [c, n]}


def write_compact_ply(path, mesh):
    v = np.asarray(mesh.vertices)
    f = np.asarray(mesh.triangles)
    c = np.asarray(mesh.vertex_colors)
    vertices = np.empty(len(v), dtype=[("position", "<f4", (3,)), ("color", "u1", (3,))])
    vertices["position"] = v
    vertices["color"] = np.rint(c*255).clip(0, 255).astype(np.uint8)
    faces = np.empty(len(f), dtype=[("count", "u1"), ("indices", "<i4", (3,))])
    faces["count"] = 3
    faces["indices"] = f
    header = (f"ply\nformat binary_little_endian 1.0\nelement vertex {len(v)}\n"
              "property float x\nproperty float y\nproperty float z\n"
              "property uchar red\nproperty uchar green\nproperty uchar blue\n"
              f"element face {len(f)}\nproperty list uchar int vertex_indices\nend_header\n")
    with path.open("wb") as handle:
        handle.write(header.encode("ascii"))
        vertices.tofile(handle)
        faces.tofile(handle)
    return float(np.max(np.abs(v-vertices["position"])))


def export(source, output, hybrid_source, raw_source):
    source_report = json.loads((source/"report.json").read_text())
    if sha256(source/"room.ply") != source_report["mesh_sha256"]:
        raise ValueError("Source changed")
    output.mkdir(parents=True, exist_ok=False)
    mesh = o3d.io.read_triangle_mesh(str(source/"room.ply"))
    error = write_compact_ply(output/"room.ply", mesh)
    if error > 1e-6 or (output/"room.ply").stat().st_size > 64*1024**2:
        raise ValueError("Browser precision or 64MiB size cap exceeded")
    write_json(output/"report.json", {**source_report, "mesh_sha256": sha256(output/"room.ply"),
                                    "full_precision_mesh_sha256": source_report["mesh_sha256"],
                                    "export_coordinate_error_max_m": error})
    evaluate(output)  # Verify the actual quantized browser artifact, not just its source.
    metrics = json.loads((output/"consistency.json").read_text())
    old = json.loads((h.ROOT/"week4/app/public/assets/hypersim-r03/scene.json").read_text())
    data, poses, _, _, _ = context()
    views = []
    for frame, label in ((12, "The cabinet"), (62, "Shelves and light"), (87, "A second angle"), (37, "The doorway")):
        name = f"source-{frame:04d}.jpg"
        Image.fromarray(h.tone_map(load(data, frame, "color"))).save(output/name, quality=92)
        score = next(m for m in metrics["frames"] if m["frame"] == frame)
        views.append({"frame": frame, "role": "conditioning", "world_from_cv_m": poses[frame].tolist(),
                      "label": label, "source": name, "evaluation": {
                          "hit_coverage": score["coverage"],
                          "within_5cm_fraction_of_all_valid": score["within_5cm_fraction_of_all_valid"]}})
    credits = {**old["credits"],
               "changes": source_report["method"],
               "condition": "All source views used for conditioning; checks are source consistency, not held-out accuracy.",
               "evaluation_status": "demonstration-candidate-owner-acceptance-pending"}
    raw = json.loads((raw_source/"report.json").read_text())
    hybrid = json.loads((hybrid_source/"report.json").read_text())
    ranges = provenance_ranges(raw, hybrid, source_report, mesh)
    write_json(output/"credits.json", credits)
    write_json(output/"scene.json", {
        **old, "revision": output.name.removeprefix("hypersim-"), "vertices": len(mesh.vertices), "triangles": len(mesh.triangles),
        "integration_frames": list(range(100)), "evaluation_frames": [], "views": views, "credits": credits,
        "bounds_m": source_report.get("navigation_bounds_m", source_report["bounds_m"]),
        "geometry_bounds_m": source_report["bounds_m"], "provenance_vertex_ranges": ranges,
        "navigation_regions_m": source_report.get("navigation_regions_m", [source_report["bounds_m"]]),
        "base_candidate_triangles": source_report.get("assumed_space", {}).get("base_faces", len(mesh.triangles)),
        "global_consistency": {k: v for k, v in metrics.items() if k != "frames"},
        "files": {p.name: {"bytes": p.stat().st_size, "sha256": sha256(p)} for p in output.iterdir() if p.is_file()},
        "report_sha256": sha256(output/"report.json")})
    print("Browser asset:", (output/"room.ply").stat().st_size, "bytes; position error", error)


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--source", required=True, type=Path)
    p.add_argument("--output", required=True, type=Path)
    p.add_argument("--hybrid-source", required=True, type=Path)
    p.add_argument("--raw-source", required=True, type=Path)
    a = p.parse_args()
    export(a.source, a.output, a.hybrid_source, a.raw_source)
