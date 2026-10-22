"""Render measured original-photo correspondences without model execution."""
import argparse
import base64
import io
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

import learned_matcher as matcher
from learned_matcher_tracks import POLICY, analysis_points
from prediction_fields import unpack
from refine_arkit_bundle import project

SELECTED = [(0, 3), (1, 2), (1, 6)]


def measured_masks(pair, row, artifact, analysis, fields):
    original = [np.asarray(pair[k], float).reshape(-1, 2) for k in ("points0", "points1")]
    frames = [pair["image0"], pair["image1"]]
    scaled = [(p+.5)*artifact["preprocessing"][i]["scale_xy"]-.5 for p, i in zip(original, frames)]
    cv2.setRNGSeed(POLICY["seed"])
    matrix, mask = cv2.findFundamentalMat(*scaled, cv2.FM_RANSAC,
        POLICY["fundamental_ransac_pixels_at_matcher_resolution"], POLICY["ransac_confidence"],
        POLICY["ransac_iterations"])
    inliers = mask.ravel().astype(bool)
    if int(inliers.sum()) != row["inliers"] or not np.allclose(matrix, row["fundamental_matrix"]):
        raise ValueError("Frozen epipolar diagnostic did not reproduce; do not render changed evidence")
    accepted = np.zeros(len(inliers), bool)
    if row["status"] == "supported":
        accepted = inliers.copy()
        xy = [analysis_points(p, artifact["preprocessing"][i], analysis["preprocessing"][i])
              for p, i in zip(original, frames)]
        world = []
        cameras = analysis["arms"]["A"]["cameras"]
        for points, i in zip(xy, frames):
            pixels = np.rint(points).astype(int)
            inside = (pixels >= 0).all(axis=1) & (pixels < 518).all(axis=1)
            pixels = pixels.clip(0, 517)
            accepted &= inside & fields["selected_valid"][i, pixels[:, 1], pixels[:, 0]].astype(bool)
            depth = fields["depth"][i, pixels[:, 1], pixels[:, 0]]
            k, pose = np.asarray(cameras[i]["intrinsics"]), np.asarray(cameras[i]["world_to_camera"])
            rays = np.column_stack([points, np.ones(len(points))])@np.linalg.inv(k).T
            world.append((rays*depth[:, None]-pose[:, 3])@pose[:, :3])
        a, za = project(world[1], cameras[frames[0]])
        b, zb = project(world[0], cameras[frames[1]])
        accepted &= ((za > 0) & (zb > 0)
                     & (np.linalg.norm(a-xy[0], axis=1) <= POLICY["model_bidirectional_reprojection_pixels"])
                     & (np.linalg.norm(b-xy[1], axis=1) <= POLICY["model_bidirectional_reprojection_pixels"]))
    if int(accepted.sum()) != row["model_supported_matches"]:
        raise ValueError("Frozen model-consistency diagnostic did not reproduce")
    return original, inliers, accepted


def render(request_path, result_path, analysis_path, report_path, output):
    request = json.loads(request_path.read_text())
    result = json.loads(result_path.read_text())
    artifact = matcher.validate_result(result["artifact"], request)
    report = json.loads(report_path.read_text())
    if matcher.digest(result_path.read_bytes()) != report["matches_sha256"]:
        raise ValueError("Frozen report/result binding mismatch")
    if matcher.digest(analysis_path.read_bytes()) != report["analysis_sha256"]:
        raise ValueError("Frozen report/analysis binding mismatch")
    analysis = json.loads(analysis_path.read_text())
    fields = unpack(analysis["prediction_fields"])
    images = [Image.open(io.BytesIO(base64.b64decode(r["data_base64"]))).convert("RGB")
              for r in request["images"]]
    font_path = Path("C:/Windows/Fonts/segoeui.ttf")
    def font(size):
        return ImageFont.truetype(str(font_path), size)
    canvas = Image.new("RGB", (1860, 1830), "#121a21")
    draw = ImageDraw.Draw(canvas)
    draw.text((24, 18), "What LoFTR actually connected", font=font(36), fill="#f1f4f6")
    draw.text((24, 65), "ARKitScenes 42445021 · original seven photos only · real recovered model output", font=font(23), fill="#bdcbd5")
    draw.text((24, 103), "At most 40 actual correspondences shown per panel; counts include every retained match.", font=font(22), fill="#bdcbd5")
    manifest = []
    for row_index, (i, j) in enumerate(SELECTED):
        pair = next(p for p in artifact["pairs"] if (p["image0"], p["image1"]) == (i, j))
        row = next(p for p in report["pairs"] if (p["image0"], p["image1"]) == (i, j))
        points, inliers, accepted = measured_masks(pair, row, artifact, analysis, fields)
        y = 160+row_index*510
        supported = row["status"] == "supported"
        label = "Supported pair" if supported else "Rejected apparent connection"
        draw.text((24, y), f"{label} {i}–{j}  |  F-inlier fraction {row['inlier_fraction']:.1%} (minimum 35%)",
                  font=font(25), fill="#bfe8cf" if supported else "#ffb8a7")
        panels = [
            ("Raw model matches", np.ones(len(inliers), bool), (255, 175, 66, 125),
             f"{len(inliers)} matches · model scores are not probabilities"),
            ("Epipolar (F) inliers", inliers, (88, 185, 255, 145),
             f"{int(inliers.sum())} inliers · hull/cell spread passes both images"),
            ("Accepted by all frozen gates", accepted, (80, 230, 158, 165),
             f"{int(accepted.sum())} matches · includes ML-depth consistency" if supported
             else "0 accepted · fraction gate fails; depth gate not run"),
        ]
        row_manifest = {"pair": [i, j], "status": row["status"], "panels": []}
        for column, (title, mask, color, caption) in enumerate(panels):
            x = 24+column*610
            draw.text((x, y+40), title, font=font(22), fill="#e5edf1")
            image_y, image_w, image_h = y+76, 288, 384
            left, right = x, x+300
            for frame, origin in ((i, left), (j, right)):
                canvas.paste(images[frame].resize((image_w, image_h), Image.Resampling.LANCZOS),
                             (origin, image_y))
            indices = np.flatnonzero(mask)
            # Deterministic spread across actual coordinates, not handpicked successful lines.
            if len(indices):
                ordered = indices[np.lexsort((points[0][indices, 1], points[0][indices, 0]))]
                indices = ordered[np.linspace(0, len(ordered)-1, min(40, len(ordered)), dtype=int)]
            overlay = Image.new("RGBA", canvas.size)
            lines = ImageDraw.Draw(overlay)
            for index in indices:
                endpoints = []
                for p, frame, origin in zip(points, (i, j), (left, right)):
                    px, py = p[index]/images[frame].size*np.array([image_w, image_h])
                    endpoints.append((origin+float(px), image_y+float(py)))
                lines.line(endpoints, fill=color, width=2)
                for px, py in endpoints:
                    lines.ellipse((px-3, py-3, px+3, py+3), fill=(*color[:3], 240))
            canvas = Image.alpha_composite(canvas.convert("RGBA"), overlay).convert("RGB")
            draw = ImageDraw.Draw(canvas)
            draw.text((x, y+467), caption, font=font(18), fill="#bdcbd5")
            row_manifest["panels"].append({"label": title, "count": int(mask.sum()), "drawn_indices": indices.tolist()})
        manifest.append(row_manifest)
    draw.text((24, 1710), "346 tracks, but the room remains disconnected: [0,3] · [1,2] · [4] · [5] · [6]",
              font=font(27), fill="#ffcf9e")
    draw.text((24, 1754), "No bundle adjustment. No geometry changed. ML-depth consistency is not independent ground truth.",
              font=font(23), fill="#f1f4f6")
    if output.exists() or output.with_suffix(".json").exists():
        raise ValueError("Refusing to overwrite visual evidence")
    canvas.save(output, quality=94)
    output.with_suffix(".json").write_text(json.dumps({
        "version": 1, "result_sha256": matcher.digest(result_path.read_bytes()),
        "report_sha256": matcher.digest(report_path.read_bytes()),
        "renderer_sha256": matcher.digest(Path(__file__).read_bytes()),
        "panels": manifest, "new_model_execution": False, "geometry_modified": False,
    }, indent=2)+"\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("request", "result", "analysis", "report", "output"):
        parser.add_argument("--"+name, type=Path, required=True)
    args = parser.parse_args()
    render(args.request, args.result, args.analysis, args.report, args.output)
