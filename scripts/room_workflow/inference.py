"""Real, lazy cloud inference. Importing this module never loads/downloads models.

execute(payload, config) is the worker boundary; model configuration is operator
configuration, never supplied or overridden by uploaded content.
"""
import base64
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import tempfile
import time

import numpy as np
from geometry import add_room_shell, align_to_original, make_mesh, unproject, validate_boundary

REVISION = re.compile(r"^[0-9a-f]{40}$")
IDENTIFIER = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
MAX_IMAGE_BYTES = 12*1024**2
SHA256 = re.compile(r"^[0-9a-f]{64}$")


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def model_config_fingerprint(config):
    root = Path(__file__).parent
    return fingerprint({"config": config, "implementation": {
        name: hashlib.sha256((root/name).read_bytes()).hexdigest() for name in ("geometry.py", "inference.py", "prediction_fields.py")}})


def geometry_fingerprint(mesh):
    h = hashlib.sha256()
    for key, dtype in (("positions", "<f4"), ("colors", "<f4"), ("indices", "<u4")):
        h.update(key.encode())
        h.update(np.asarray(mesh[key], dtype=dtype).tobytes())
    return h.hexdigest()


def validate_config(config):
    required = {"vggt_source_revision", "vggt_checkpoint_revision"}
    optional = {"vggt_model", "sam2_source_revision", "sam2_checkpoint_revision"}
    if not isinstance(config, dict) or not required <= set(config) or set(config)-required-optional:
        raise ValueError("Explicit pinned worker configuration is required")
    for key in required | ({"sam2_source_revision", "sam2_checkpoint_revision"} & set(config)):
        if not isinstance(config[key], str) or not REVISION.fullmatch(config[key]):
            raise ValueError("Model source and checkpoint revisions must be full immutable hashes")
    if ("sam2_source_revision" in config) != ("sam2_checkpoint_revision" in config):
        raise ValueError("SAM2 requires both pinned source and checkpoint revisions")
    if config.get("vggt_model", "facebook/VGGT-1B") not in ("facebook/VGGT-1B", "facebook/VGGT-1B-Commercial"):
        raise ValueError("Unsupported VGGT checkpoint family")
    return config


def _blob(record, limit=MAX_IMAGE_BYTES):
    text = record.get("data_base64")
    if not isinstance(text, str) or len(text) > math.ceil(limit/3)*4:
        raise ValueError("Image exceeds encoded byte cap")
    try:
        data = base64.b64decode(text, validate=True)
    except Exception as error:
        raise ValueError("Invalid image base64") from error
    if not 0 < len(data) <= limit or hashlib.sha256(data).hexdigest() != record.get("sha256"):
        raise ValueError("Image hash/size mismatch")
    return data


def validate_payload(payload):
    required = {"version", "operation", "job_id", "images"}
    optional = {"generated_images", "generated_video", "boundary", "openings", "masks", "sam2_prompts", "analysis_binding"}
    if not isinstance(payload, dict) or not required <= set(payload) or set(payload)-required-optional:
        raise ValueError("Unknown/missing job fields")
    if type(payload["version"]) is not int or payload["version"] != 1 or payload["operation"] not in ("analyze", "reconstruct"):
        raise ValueError("Unsupported operation/version")
    if not isinstance(payload["job_id"], str) or not IDENTIFIER.fullmatch(payload["job_id"]):
        raise ValueError("Invalid job ID")
    originals, generated = payload["images"], payload.get("generated_images", [])
    video = payload.get("generated_video")
    if not isinstance(originals, list) or not 5 <= len(originals) <= 7 or not isinstance(generated, list) or len(generated) > 12:
        raise ValueError("Require 5-7 original photos and at most 12 generated frames")
    if payload["operation"] == "analyze" and (generated or video):
        raise ValueError("Analyze uses original photos only")
    if payload["operation"] == "reconstruct":
        validate_boundary(payload.get("boundary"))
        if not generated and not video:
            raise ValueError("Required Shado comparison has no generated frames")
        binding = payload.get("analysis_binding")
        fields = {"model_config_sha256", "original_inputs_sha256", "analysis_geometry_sha256"}
        if not isinstance(binding, dict) or set(binding) != fields or not all(
            isinstance(v, str) and SHA256.fullmatch(v) for v in binding.values()
        ):
            raise ValueError("Reconstruction requires the reviewed analysis fingerprints")
    seen, hashes, total = set(), set(), 0
    for record in originals+generated:
        if not isinstance(record, dict) or set(record) != {"id", "sha256", "data_base64"}:
            raise ValueError("Invalid image record")
        if not isinstance(record["id"], str) or not IDENTIFIER.fullmatch(record["id"]) or record["id"] in seen:
            raise ValueError("Invalid or repeated image ID")
        data = _blob(record)
        if record["sha256"] in hashes:
            raise ValueError("Duplicate image content")
        total += len(data)
        seen.add(record["id"]); hashes.add(record["sha256"])
    if video is not None:
        if generated or not isinstance(video, dict) or set(video) != {"id", "sha256", "data_base64"}:
            raise ValueError("Generated video and generated image inputs are exclusive")
        if not isinstance(video["id"], str) or not IDENTIFIER.fullmatch(video["id"]) or video["id"] in seen:
            raise ValueError("Invalid generated video ID")
        total += len(_blob(video, 50*1024**2))
    if total > 100*1024**2:
        raise ValueError("Job image byte budget exceeded")
    for field in ("masks", "sam2_prompts"):
        if not isinstance(payload.get(field, {}), dict) or set(payload.get(field, {}))-seen:
            raise ValueError("Unknown mask/prompt image IDs")
    for entry in payload.get("masks", {}).values():
        if not isinstance(entry, dict) or set(entry) != {"sha256", "data_base64"}:
            raise ValueError("Invalid exclusion mask record")
        total += len(_blob(entry))
    for prompt in payload.get("sam2_prompts", {}).values():
        if not isinstance(prompt, dict) or set(prompt) != {"points", "labels"}:
            raise ValueError("Invalid SAM2 prompt fields")
        points, labels = prompt["points"], prompt["labels"]
        if not isinstance(points, list) or not 1 <= len(points) <= 32 or not isinstance(labels, list) or len(labels) != len(points):
            raise ValueError("SAM2 prompt budget/shape invalid")
        if any(not isinstance(p, list) or len(p) != 2 or any(
            type(v) not in (int, float) or not math.isfinite(v) for v in p) for p in points) or any(
                type(v) is not int or v not in (0, 1) for v in labels):
            raise ValueError("SAM2 prompt values invalid")
    if total > 100*1024**2:
        raise ValueError("Combined image/mask budget exceeded")
    if "openings" in payload and (not isinstance(payload["openings"], list) or len(payload["openings"]) > 32):
        raise ValueError("Opening budget exceeded")
    return originals, generated


def video_sample_indices(frame_count, fps):
    if type(frame_count) is not int or not 1 <= frame_count <= 1800 or not (
        isinstance(fps, (int, float)) and math.isfinite(fps) and 0 < fps <= 120
    ) or frame_count/fps > 30.01:
        raise ValueError("Generated video exceeds 30 seconds / 1800 frames, or has invalid timing")
    return np.linspace(0, frame_count-1, min(12, frame_count), dtype=int).tolist()


def _decode_video(record, directory):
    import cv2
    from PIL import Image
    path = directory/"generated-input.mp4"
    path.write_bytes(_blob(record, 50*1024**2))
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise ValueError("Generated video cannot be decoded")
    try:
        count_value, fps = capture.get(cv2.CAP_PROP_FRAME_COUNT), capture.get(cv2.CAP_PROP_FPS)
        if not math.isfinite(count_value) or count_value != int(count_value):
            raise ValueError("Unknown generated-video frame count")
        count = int(count_value)
        selected = set(video_sample_indices(count, fps))
        width, height = capture.get(cv2.CAP_PROP_FRAME_WIDTH), capture.get(cv2.CAP_PROP_FRAME_HEIGHT)
        if not (math.isfinite(width) and math.isfinite(height) and 32 <= width <= 4096 and
                32 <= height <= 4096 and width*height <= 4_194_304):
            raise ValueError("Generated video dimensions exceed bounded decode")
        records, frames = [], []
        decoded = 0
        for index in range(count+1):
            ok, frame = capture.read()
            if not ok:
                break
            if index >= count:
                raise ValueError("Generated video frame count differs from metadata")
            decoded += 1
            if frame.shape[:2] != (int(height), int(width)):
                raise ValueError("Variable generated-video frame dimensions")
            if index in selected:
                output = io.BytesIO()
                Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)).save(output, format="PNG")
                data = output.getvalue()
                if len(data) > MAX_IMAGE_BYTES:
                    raise ValueError("Decoded generated frame exceeds byte cap")
                image_id = "video_"+str(index).zfill(5)
                sha = hashlib.sha256(data).hexdigest()
                records.append({"id": image_id, "sha256": sha, "data_base64": base64.b64encode(data).decode()})
                frames.append({"id": image_id, "frame_index": index, "timestamp_seconds": index/fps, "sha256": sha})
        if decoded != count or len(records) != len(selected):
            raise ValueError("Truncated generated video; comparison rejected")
        return records, {"id": record["id"], "sha256": record["sha256"], "duration_seconds": count/fps,
                         "decoded_frame_count": decoded, "sampling": "evenly-spaced frame indices",
                         "timestamp_basis": "frame index / declared FPS; variable frame rate not calibrated",
                         "frames": frames}
    finally:
        capture.release()


def _decode_images(records, directory):
    from PIL import Image, ImageOps
    images, paths, provenance = [], [], []
    for record in records:
        with Image.open(io.BytesIO(_blob(record))) as raw:
            if raw.format not in ("PNG", "JPEG", "WEBP") or getattr(raw, "n_frames", 1) != 1:
                raise ValueError("Only static PNG/JPEG/WebP images are supported")
            if max(raw.size) > 8192 or raw.width*raw.height > 24_000_000 or min(raw.size) < 32:
                raise ValueError("Image dimensions exceed bounded decode policy")
            normalized = ImageOps.exif_transpose(raw).convert("RGB")
        image = np.asarray(normalized)
        path = directory/(record["id"]+".png")
        normalized.save(path)
        paths.append(str(path)); images.append(image)
        provenance.append({"id": record["id"], "sha256": record["sha256"],
                           "normalized_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                           "width": normalized.width, "height": normalized.height,
                           "normalization": "EXIF transpose, RGB conversion, lossless PNG; metadata omitted"})
    return images, paths, provenance


def detect_markers(images, records):
    """Decoded tags only. No known physical size, no metric scale/pose claim."""
    try:
        import cv2
    except ImportError:
        return {"status": "not-run", "reason": "OpenCV unavailable", "detections": []}
    if not hasattr(cv2, "aruco"):
        return {"status": "not-run", "reason": "OpenCV ArUco module unavailable", "detections": []}
    detections = []
    families = ("DICT_4X4_50", "DICT_5X5_100", "DICT_6X6_250", "DICT_7X7_100", "DICT_APRILTAG_36h11")
    for rgb, record in zip(images, records):
        factor = min(1., 1536/max(rgb.shape[:2]))
        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        if factor < 1:
            gray = cv2.resize(gray, None, fx=factor, fy=factor)
        for family in families:
            detector = cv2.aruco.ArucoDetector(cv2.aruco.getPredefinedDictionary(getattr(cv2.aruco, family)))
            corners, ids, _ = detector.detectMarkers(gray)
            if ids is not None:
                for corner, marker_id in zip(corners, ids.ravel()):
                    detections.append({"image_id": record["id"], "dictionary": family,
                                       "marker_id": int(marker_id), "corners_px": (corner[0]/factor).tolist(),
                                       "origin": "decoded-image-marker", "physical_size": None})
                    if len(detections) > 1000:
                        raise ValueError("Marker detection budget exceeded")
    return {"status": "executed", "detections": detections, "metric_scale_established": False,
            "limit": "Decoded tags alone do not verify physical geometry or generated-video rigidity"}


def _masks(images, records, payload, config):
    from PIL import Image
    exclusions, details, suggestions = [], [], {}
    predictor = None
    record_ids = {r["id"] for r in records}
    prompts = {k: v for k, v in payload.get("sam2_prompts", {}).items() if k in record_ids}
    sam_status = "not-run-no-prompts"
    if prompts and "sam2_checkpoint_revision" not in config:
        raise ValueError("SAM2 prompts require a pinned SAM2 worker configuration")
    if prompts:
        import torch
        from huggingface_hub import hf_hub_download
        from sam2.build_sam import build_sam2
        from sam2.sam2_image_predictor import SAM2ImagePredictor
        checkpoint = hf_hub_download("facebook/sam2.1-hiera-small", "sam2.1_hiera_small.pt",
                                    revision=config["sam2_checkpoint_revision"])
        predictor = SAM2ImagePredictor(build_sam2("configs/sam2.1/sam2.1_hiera_s.yaml", checkpoint, device="cuda"))
        sam_status = "executed-suggestions-require-review"
    for rgb, record in zip(images, records):
        image_id = record["id"]
        excluded = np.zeros(rgb.shape[:2], bool)
        if image_id in payload.get("masks", {}):
            entry = payload["masks"][image_id]
            if not isinstance(entry, dict) or set(entry) != {"sha256", "data_base64"}:
                raise ValueError("Invalid corrected exclusion mask")
            with Image.open(io.BytesIO(_blob(entry))) as image:
                if image.size != (rgb.shape[1], rgb.shape[0]):
                    raise ValueError("Exclusion mask must match normalized image dimensions")
                excluded = np.asarray(image.convert("L")) > 0
            details.append({"image_id": image_id, "origin": "user-corrected-exclusion",
                            "sha256": entry["sha256"], "excluded_pixels": int(excluded.sum())})
        if image_id in prompts:
            prompt = prompts[image_id]
            if not isinstance(prompt, dict) or set(prompt) != {"points", "labels"}:
                raise ValueError("SAM2 accepts explicit point/label prompts only")
            points, labels = np.asarray(prompt["points"], float), np.asarray(prompt["labels"])
            if points.ndim != 2 or points.shape[1] != 2 or not 1 <= len(points) <= 32 or labels.shape != (len(points),):
                raise ValueError("Invalid SAM2 prompts")
            if not np.isfinite(points).all() or not np.isin(labels, [0, 1]).all() or not (
                (points >= 0).all() and (points[:, 0] < rgb.shape[1]).all() and (points[:, 1] < rgb.shape[0]).all()
            ):
                raise ValueError("SAM2 prompt outside normalized image")
            with torch.inference_mode(), torch.autocast("cuda", dtype=torch.bfloat16):
                predictor.set_image(rgb)
                masks, scores, _ = predictor.predict(point_coords=points, point_labels=labels, multimask_output=False)
            suggestion = masks[0].astype(np.uint8)*255
            output = io.BytesIO()
            Image.fromarray(suggestion).save(output, format="PNG")
            data = output.getvalue()
            suggestions[image_id] = {"data_base64": base64.b64encode(data).decode(),
                                     "sha256": hashlib.sha256(data).hexdigest(),
                                     "score": float(scores[0]), "meaning": "uncalibrated mask score",
                                     "applied": False, "requires_user_review": True}
        exclusions.append(excluded)
    del predictor
    return exclusions, {"status": sam_status, "corrected_masks": details, "suggestions": suggestions}


def _pad_masks(images, exclusions):
    """Mirror official VGGT mode='pad' exact divisible-by-14 resize and offsets."""
    from PIL import Image
    valid, transforms = [], []
    for image, excluded in zip(images, exclusions):
        height, width = image.shape[:2]
        if width >= height:
            new_width, new_height = 518, round(height*518/width/14)*14
        else:
            new_height, new_width = 518, round(width*518/height/14)*14
        if min(new_width, new_height) < 14:
            raise ValueError("Unsupported extreme image aspect ratio")
        left, top = (518-new_width)//2, (518-new_height)//2
        resized = np.asarray(Image.fromarray((~excluded).astype(np.uint8)*255).resize(
            (new_width, new_height), Image.Resampling.NEAREST)) > 0
        mask = np.zeros((518, 518), bool)
        mask[top:top+new_height, left:left+new_width] = resized
        valid.append(mask)
        transforms.append({"source_size": [width, height], "resized_size": [new_width, new_height],
                           "padding_left_top": [left, top], "model_size": [518, 518],
                           "pixel_center_convention": "integer"})
    return np.asarray(valid), transforms


def _predict(model, paths, image_valid):
    import torch
    from vggt.utils.load_fn import load_and_preprocess_images
    from vggt.utils.pose_enc import pose_encoding_to_extri_intri
    inputs = load_and_preprocess_images(paths, mode="pad").to("cuda")
    dtype = torch.bfloat16 if torch.cuda.get_device_capability()[0] >= 8 else torch.float16
    with torch.inference_mode(), torch.autocast("cuda", dtype=dtype):
        predictions = model(inputs)
        extrinsic, intrinsic = pose_encoding_to_extri_intri(predictions["pose_enc"], inputs.shape[-2:])
    depth = predictions["depth"][0, ..., 0].float().cpu().numpy()
    confidence = predictions["depth_conf"][0].float().cpu().numpy()
    poses, K = extrinsic[0].float().cpu().numpy(), intrinsic[0].float().cpu().numpy()
    rgb = inputs.float().cpu().numpy().transpose(0, 2, 3, 1)
    valid = image_valid & np.isfinite(depth) & (depth > 1e-6) & np.isfinite(confidence)
    # Same frozen percentile policy in each view/arm; scores are not probabilities.
    for i in range(len(paths)):
        if valid[i].sum() < 100:
            raise ValueError("Insufficient finite depth")
        valid[i] &= confidence[i] >= np.quantile(confidence[i][valid[i]], .25)
    points = np.asarray([unproject(d, k, p) for d, k, p in zip(depth, K, poses)])
    # Camera-up heuristic only; user confirms/corrects the room volume.
    axis = np.array([[1., 0, 0], [0, 0, 1.], [0, -1., 0]])
    Q, t = axis @ poses[0, :, :3], axis @ poses[0, :, 3]
    points = points @ Q.T+t
    centers = np.asarray([-p[:, :3].T @ p[:, 3] for p in poses]) @ Q.T+t
    rotations = poses[:, :, :3] @ Q.T
    camera_translations = -np.einsum("nij,nj->ni", rotations, centers)
    cameras = [{"world_to_camera": np.column_stack((r, tr)).tolist(), "intrinsics": k.tolist(),
                "center": c.tolist(), "depth_kind": "OpenCV-z", "units": "relative"}
               for r, tr, k, c in zip(rotations, camera_translations, K, centers)]
    del inputs, predictions, extrinsic, intrinsic
    return {"points": points, "rgb": rgb, "valid": valid, "image_valid": image_valid, "cameras": cameras,
            "depth": depth, "confidence": confidence,
            "orientation": "first-camera-up heuristic; floor not automatically verified"}


def _alignment(a, b, original_count):
    x_parts, y_parts = [], []
    for i in range(original_count):
        mask = a["valid"][i, ::8, ::8] & b["valid"][i, ::8, ::8]
        x_parts.append(b["points"][i, ::8, ::8][mask])
        y_parts.append(a["points"][i, ::8, ::8][mask])
    x, y = np.concatenate(x_parts), np.concatenate(y_parts)
    scale, R, t, report = align_to_original(x, y)
    b["points"] = scale*b["points"] @ R.T+t
    b["depth"] *= scale
    for camera in b["cameras"]:
        pose = np.asarray(camera["world_to_camera"])
        center = scale*R @ np.asarray(camera["center"])+t
        rotation = pose[:, :3] @ R.T
        camera["center"] = center.tolist()
        camera["world_to_camera"] = np.column_stack((rotation, -rotation @ center)).tolist()
    return report


def _arm(prediction, records, boundary=None, openings=None, category="photo-estimated"):
    raw = make_mesh(prediction["points"], prediction["rgb"], prediction["valid"], None, category)
    mesh = raw
    if boundary is not None:
        mesh = make_mesh(prediction["points"], prediction["rgb"], prediction["valid"], boundary, category)
        mesh = add_room_shell(mesh, boundary, openings or [])
    cameras = [{**camera, "image_id": record["id"]} for camera, record in zip(prediction["cameras"], records)]
    result = {"status": "complete", "geometry": mesh, "cameras": cameras,
            "diagnostics": {"valid_depth_pixels": [int(v.sum()) for v in prediction["valid"]],
                            "depth_score_policy": "per-view lower quartile removed; not calibrated probability",
                            "geometry": "per-view depth triangles; no bundle adjustment or multiview fusion",
                            "orientation": prediction["orientation"]}}
    if boundary is not None:
        result["raw_geometry"] = raw
    return result


def execute(payload, config):
    """Run only after the caller's consent, bounded-cost and source checks.

    This function never fabricates a successful comparison. Exceptions become
    visible failed jobs; partial means a real A result exists but B failed.
    """
    start = time.monotonic()
    ran = False
    result = {"version": 1, "job_id": payload.get("job_id") if isinstance(payload, dict) else None,
              "status": "failed", "model_execution": "not-run", "arms": {}}
    try:
        validate_config(config)
        originals, generated = validate_payload(payload)
        result["model_config_sha256"] = model_config_fingerprint(config)
        result["original_input_hashes"] = [{"id": r["id"], "sha256": r["sha256"]} for r in originals]
        original_ids = {r["id"] for r in originals}
        result["original_inputs_sha256"] = fingerprint({"images": result["original_input_hashes"],
            "masks": {k: v["sha256"] for k, v in payload.get("masks", {}).items() if k in original_ids}})
        binding = payload.get("analysis_binding")
        if binding and any(binding[key] != result[key] for key in ("model_config_sha256", "original_inputs_sha256")):
            raise ValueError("Reviewed analysis does not match current inputs/model configuration")
        os.environ.setdefault("CUBLAS_WORKSPACE_CONFIG", ":4096:8")
        import torch
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA worker unavailable; no synthetic fallback")
        torch.manual_seed(0)
        torch.cuda.manual_seed_all(0)
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False
        torch.backends.cuda.matmul.allow_tf32 = False
        torch.backends.cudnn.allow_tf32 = False
        torch.use_deterministic_algorithms(True)
        from vggt.models.vggt import VGGT
        with tempfile.TemporaryDirectory(prefix="eva-room-") as temp:
            images, paths, sources = _decode_images(originals, Path(temp))
            result["sources"] = [{**s, "origin": "original-photo"} for s in sources]
            result["markers"] = detect_markers(images, originals)
            exclusions, result["masks"] = _masks(images, originals, payload, config)
            image_valid, result["preprocessing"] = _pad_masks(images, exclusions)
            model = VGGT.from_pretrained(config.get("vggt_model", "facebook/VGGT-1B"),
                                         revision=config["vggt_checkpoint_revision"]).eval().to("cuda")
            # Keep the exact same estimator branches in both arms.
            model.point_head = None
            model.track_head = None
            result["estimator"] = {**config, "branches": ["camera", "depth"],
                                   "geometry_refinement": "not-implemented",
                                   "device": torch.cuda.get_device_name(),
                                   "torch": str(torch.__version__)}
            count = len(originals)
            ran = True
            result["model_execution"] = "executed"
            a = _predict(model, paths[:count], image_valid[:count])
            preview = _arm(a, originals)
            result["analysis_geometry_sha256"] = geometry_fingerprint(preview["geometry"])
            result["analysis_binding"] = {key: result[key] for key in
                                          ("model_config_sha256", "original_inputs_sha256", "analysis_geometry_sha256")}
            if binding and binding["analysis_geometry_sha256"] != result["analysis_geometry_sha256"]:
                raise ValueError("Re-estimated photo baseline changed; review a new analysis before applying its boundary")
            if payload["operation"] == "analyze":
                from prediction_fields import pack
                result["prediction_fields"] = pack(a, [r["id"] for r in originals])
                result["arms"]["A"] = preview
                sample = a["points"][a["valid"]]
                low, high = np.quantile(sample, [.02, .98], axis=0)
                proposal = {"polygon": [[float(low[0]), float(low[1])], [float(high[0]), float(low[1])],
                                        [float(high[0]), float(high[1])], [float(low[0]), float(high[1])]],
                            "floor": float(low[2]), "ceiling": float(high[2])}
                validate_boundary(proposal)
                result["boundary_proposal"] = {"value": proposal, "requires_user_confirmation": True,
                                               "origin": "robust estimated-point extents, not detected room boundaries"}
                result["status"] = "complete"
            else:
                boundary, openings = payload["boundary"], payload.get("openings", [])
                result["arms"]["A"] = _arm(a, originals, boundary, openings)
                result["status"] = "partial"
                if payload.get("generated_video"):
                    generated, result["generated_video"] = _decode_video(payload["generated_video"], Path(temp))
                    if any(r["id"] in original_ids for r in generated):
                        raise ValueError("Sampled video frame ID collides with an original photo")
                generated_hashes = [r["sha256"] for r in generated]
                if len(set(generated_hashes)) != len(generated_hashes) or set(generated_hashes) & {r["sha256"] for r in originals}:
                    raise ValueError("Duplicate generated frames cannot count as extra views")
                b_images, b_paths, b_sources = _decode_images(generated, Path(temp))
                result["sources"].extend({**s, "origin": "shado-generated-frame"} for s in b_sources)
                result["markers"]["generated"] = detect_markers(b_images, generated)
                b_exclusions, result["masks"]["generated"] = _masks(b_images, generated, payload, config)
                b_valid, b_preprocessing = _pad_masks(b_images, b_exclusions)
                result["preprocessing"].extend(b_preprocessing)
                paths = paths+b_paths
                image_valid = np.concatenate((image_valid, b_valid))
                b = _predict(model, paths, image_valid)
                result["alignment"] = _alignment(a, b, count)
                # ALL B geometry is influenced by generated images through joint attention.
                result["arms"]["B"] = _arm(b, originals+generated, boundary, openings, "generated-influenced")
                result["status"] = "complete"
            result["units"] = "relative"
            result["determinism"] = {"seed": 0, "deterministic_algorithms": True,
                                     "tf32": False, "baseline_verified_by_float32_geometry_hash": bool(binding)}
            result["limitations"] = ["Model estimates are not physical ground truth",
                                    "Confirmed boundary and portal caps are user-authored constraints",
                                    "No metric scale without an independent measured reference",
                                    "No reconstruction quality or Shado improvement acceptance is implied",
                                    "SAM2 suggestions require review and are not silently applied"]
            result["peak_cuda_bytes"] = int(torch.cuda.max_memory_allocated())
    except Exception as error:
        result["model_execution"] = "executed" if ran else "not-run"
        result["error"] = {"type": type(error).__name__, "message": str(error)[:1000]}
        if result["arms"].get("A") and payload.get("operation") == "reconstruct":
            result["status"] = "partial"
            result["arms"]["B"] = {"status": "failed", "reason": result["error"]}
    result["elapsed_seconds"] = time.monotonic()-start
    if len(json.dumps(result, separators=(",", ":"), allow_nan=False).encode()) > 64*1024**2:
        return {"version": 1, "job_id": result["job_id"], "status": "failed",
                "model_execution": result["model_execution"], "arms": {},
                "error": {"type": "ArtifactBudgetExceeded", "message": "Actual result exceeded 64 MiB; do not automatically repeat inference"},
                "elapsed_seconds": result["elapsed_seconds"]}
    return result
