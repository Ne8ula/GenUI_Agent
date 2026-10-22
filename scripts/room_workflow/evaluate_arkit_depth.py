"""Post-freeze reference-depth diagnostics; never imports reference depth into ML.

ARKitScenes paper section 3.2 states camera-frame-aligned orthographic depth
(camera z, not ray range). Official pinned dataset.py pairs RGB/highres filenames,
rotates both equally, and converts millimeters to meters. Global alignment here
is an evaluation fit, not recovered metric scale or held-out-view accuracy.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

REVISION = "474aaa83d7b1c9080619d8485de2d7c885c01fc5"
BASE = f"https://github.com/apple-aiml-research/ARKitScenes/blob/{REVISION}"
SOURCES = {
    "orthographic_frame_aligned_depth": "https://datasets-benchmarks-proceedings.neurips.cc/paper_files/paper/2021/file/66f041e16a60928b05a7e228a89c3799-Paper-round1.pdf#page=6",
    "units": f"{BASE}/DATA.md",
    "paired_rgb_depth_rotation_and_resampling": f"{BASE}/depth_upsampling/dataset.py",
    "faro_reference_origin": f"{BASE}/depth_upsampling/README.md",
}


def prepare_reference(depth_mm, clockwise_degrees, preprocessing):
    """Use exact recorded image resize/pad; nearest-neighbor preserves missingness."""
    depth = np.asarray(depth_mm)
    if depth.ndim != 2 or depth.dtype != np.uint16:
        raise ValueError("Reference must be a uint16 single-channel millimeter image")
    if clockwise_degrees not in (0, 90, 180, 270):
        raise ValueError("Rotation must be a clockwise multiple of 90 degrees")
    rotated = np.rot90(depth, -clockwise_degrees // 90)
    width, height = preprocessing["source_size"]
    if rotated.shape != (height, width):
        raise ValueError("Reference and original image sizes disagree after rotation")
    new_width, new_height = preprocessing["resized_size"]
    left, top = preprocessing["padding_left_top"]
    model_width, model_height = preprocessing["model_size"]
    values = (new_width, new_height, left, top, model_width, model_height)
    if (any(type(value) is not int for value in values) or min(new_width, new_height) <= 0
            or min(left, top) < 0 or new_width+left > model_width
            or new_height+top > model_height or max(model_width, model_height) > 4096):
        raise ValueError("Invalid recorded preprocessing")
    resized = np.asarray(Image.fromarray(rotated).resize(
        (new_width, new_height), Image.Resampling.NEAREST), dtype=np.float64) / 1000
    output = np.zeros((model_height, model_width), dtype=np.float64)
    domain = np.zeros(output.shape, dtype=bool)
    output[top:top+new_height, left:left+new_width] = resized
    domain[top:top+new_height, left:left+new_width] = True
    return output, domain


def _distribution(values):
    if not values.size:
        return None
    return {"p10": float(np.quantile(values, .1)), "median": float(np.median(values)),
            "p90": float(np.quantile(values, .9))}


def _errors(prediction, reference, scale):
    if not prediction.size or scale is None:
        return None
    difference = scale*prediction-reference
    relative = np.abs(difference)/reference
    return {"pixels": int(prediction.size), "mae_m_after_global_fit": float(np.mean(np.abs(difference))),
            "rmse_m_after_global_fit": float(np.sqrt(np.mean(difference**2))),
            "mean_abs_relative_error": float(np.mean(relative)),
            "median_abs_relative_error": float(np.median(relative)),
            "p90_abs_relative_error": float(np.quantile(relative, .9))}


def compare_depths(predictions, references, image_valid, selected_valid, image_ids):
    """One median ratio fit across all valid pixels; never fit each view separately."""
    predictions = np.asarray(predictions, dtype=np.float64)
    references = np.asarray(references, dtype=np.float64)
    domain = np.asarray(image_valid, dtype=bool)
    selected = np.asarray(selected_valid, dtype=bool)
    if (predictions.ndim != 3 or references.shape != predictions.shape or domain.shape != predictions.shape
            or selected.shape != predictions.shape or len(image_ids) != len(predictions)
            or len(set(image_ids)) != len(image_ids) or np.any(selected & ~domain)):
        raise ValueError("Mismatched depth fields or image identities")
    ref_valid = domain & np.isfinite(references) & (references > 0)
    pred_valid = domain & np.isfinite(predictions) & (predictions > 0)
    overlap = ref_valid & pred_valid
    ratios = references[overlap]/predictions[overlap]
    scale = float(np.median(ratios)) if ratios.size else None
    views = []
    for index, image_id in enumerate(image_ids):
        mask = overlap[index]
        view_ratios = references[index][mask]/predictions[index][mask]
        ratio_stats = _distribution(view_ratios)
        views.append({
            "id": image_id, "status": "ok" if mask.any() else "no-valid-reference" if not ref_valid[index].any() else "no-valid-prediction",
            "image_domain_pixels": int(domain[index].sum()),
            "valid_reference_pixels": int(ref_valid[index].sum()),
            "missing_reference_pixels": int((domain[index] & ~ref_valid[index]).sum()),
            "invalid_prediction_at_valid_reference_pixels": int((ref_valid[index] & ~pred_valid[index]).sum()),
            "overlap_pixels": int(mask.sum()),
            "selected_overlap_pixels": int((mask & selected[index]).sum()),
            "raw_prediction_relative_units": _distribution(predictions[index][pred_valid[index]]),
            "reference_meters": _distribution(references[index][ref_valid[index]]),
            "reference_over_raw_prediction": ratio_stats,
            "median_ratio_over_global_scale": ratio_stats["median"]/scale if ratio_stats and scale else None,
            "all_valid_prediction_errors": _errors(predictions[index][mask], references[index][mask], scale),
            "selected_prediction_errors": _errors(predictions[index][mask & selected[index]], references[index][mask & selected[index]], scale),
        })
    selected_overlap = overlap & selected
    return {
        "views_attempted": len(views), "views_with_overlap": sum(v["overlap_pixels"] > 0 for v in views),
        "global_posthoc_scale_m_per_relative_unit": scale,
        "scale_fit": "median(reference/prediction) across all positive finite paired pixels, equally weighted per pixel",
        "scale_fit_pixels": int(overlap.sum()), "separate_per_view_scale_applied": False,
        "image_domain_pixels": int(domain.sum()), "valid_reference_pixels": int(ref_valid.sum()),
        "missing_reference_pixels": int((domain & ~ref_valid).sum()),
        "invalid_prediction_at_valid_reference_pixels": int((ref_valid & ~pred_valid).sum()),
        "selected_overlap_pixels": int(selected_overlap.sum()),
        "all_valid_prediction_errors": _errors(predictions[overlap], references[overlap], scale),
        "selected_prediction_errors": _errors(predictions[selected_overlap], references[selected_overlap], scale),
        "views": views,
    }


def evaluate(result_path, manifest_path, depth_directory):
    from prediction_fields import unpack
    result_path, manifest_path, depth_directory = map(Path, (result_path, manifest_path, depth_directory))
    frozen_bytes, manifest_bytes = result_path.read_bytes(), manifest_path.read_bytes()
    result, manifest = json.loads(frozen_bytes), json.loads(manifest_bytes)
    if manifest.get("dataset") != "ARKitScenes" or manifest.get("source_revision") != REVISION:
        raise ValueError("Expected the inspected pinned ARKitScenes manifest")
    originals = manifest["originals"]
    ids = [source["id"] for source in originals]
    if (result["prediction_fields"]["image_ids"] != ids
            or result["original_input_hashes"] != [{"id": source["id"], "sha256": source["sha256"]} for source in originals]
            or len(result["preprocessing"]) != len(ids)):
        raise ValueError("Frozen model image identities do not match the original-only manifest")
    arrays = unpack(result["prediction_fields"])
    references, descriptors = [], []
    for source, preprocessing in zip(originals, result["preprocessing"]):
        filename = source["source_filename"]
        if Path(filename).name != filename:
            raise ValueError("Invalid reference filename")
        path = depth_directory / filename
        rotation = source["normalization"]["rotate_clockwise_degrees"]
        if path.exists():
            data = path.read_bytes()
            with Image.open(path) as image:
                depth = np.asarray(image)
            if depth.shape != (source["source_height"], source["source_width"]):
                raise ValueError("Raw RGB and reference depth dimensions disagree")
            reference, domain = prepare_reference(depth, rotation, preprocessing)
            descriptor = {"id": source["id"], "filename": filename, "sha256": hashlib.sha256(data).hexdigest(),
                          "source_nonzero_pixels": int(np.count_nonzero(depth)), "source_pixels": int(depth.size),
                          "status": "loaded"}
        else:
            width, height = preprocessing["source_size"]
            if rotation in (90, 270):
                width, height = height, width
            reference, domain = prepare_reference(np.zeros((height, width), np.uint16), rotation, preprocessing)
            descriptor = {"id": source["id"], "filename": filename, "status": "missing-reference-file"}
        if np.any(arrays["image_valid"][len(references)].astype(bool) & ~domain):
            raise ValueError("Prediction validity extends beyond the recorded image rectangle")
        references.append(reference)
        descriptors.append(descriptor)
    report = compare_depths(arrays["depth"], references, arrays["image_valid"], arrays["selected_valid"], ids)
    return {"version": 1, "dataset": "ARKitScenes", "capture": manifest["video_id"],
            "measurement": "independent reference depth at the RGB conditioning views",
            "not_claimed": ["held-out-view accuracy", "recovered metric scale", "complete room quality", "camera pose accuracy"],
            "reference_convention": "camera-frame-aligned orthographic z-depth in meters, zero invalid",
            "sources": SOURCES, "resampling": "recorded clockwise rotation, nearest resize, recorded zero padding",
            "frozen_result_sha256": hashlib.sha256(frozen_bytes).hexdigest(),
            "frozen_manifest_sha256": hashlib.sha256(manifest_bytes).hexdigest(),
            "prediction_fields_sha256": result["prediction_fields"]["sha256"],
            "analysis_binding": result["analysis_binding"],
            "reference_input_to_model": False, "reference_used_to_modify_geometry": False,
            "limitations": [
                "Posthoc scale is fitted on these same conditioning-view reference depths.",
                "No camera-pose or global mesh registration is evaluated.",
                "Reference pixels may be absent from scan occlusions and registration limitations.",
                "Possible overlap with estimator pretraining data is not assessed.",
            ],
            "reference_files": descriptors, **report}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--result", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--depth-directory", required=True)
    parser.add_argument("--output", help="New JSON evidence file; existing output is not overwritten")
    args = parser.parse_args()
    report = evaluate(args.result, args.manifest, args.depth_directory)
    text = json.dumps(report, indent=2, allow_nan=False) + "\n"
    if args.output:
        with Path(args.output).open("x", encoding="utf-8") as handle:
            handle.write(text)
    else:
        print(text, end="")


if __name__ == "__main__":
    main()
