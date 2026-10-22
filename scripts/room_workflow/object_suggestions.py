"""Automatic original-photo object regions. No import-time model/network work.

This proposes visible masks, not complete objects. Models never supply authority.
"""
import base64
import hashlib
import io
import json
from pathlib import Path
import tempfile
import time

import numpy as np
from PIL import Image

from inference import fingerprint, validate_payload, _decode_images

ROOT = Path(__file__).parent
MODELS = json.loads((ROOT/"object-models.json").read_text(encoding="utf-8-sig"))
LABELS = ("chair", "sofa", "table", "desk", "cabinet", "shelf", "bed", "dresser",
          "nightstand", "stool", "bench", "armchair", "ottoman", "television",
          "monitor", "printer", "lamp", "plant", "wardrobe", "refrigerator",
          "oven", "sink", "bathtub", "toilet", "door", "window")
POLICY = {"long_edge": 1024, "max_per_view": 12, "box_threshold": .35,
          "text_threshold": .25, "nms_iou": .6, "minimum_mask_pixels": 32,
          "mask_score_review_below": .7, "maximum_output_bytes": 16*1024**2,
          "labels": list(LABELS), "seed": 0,
          "coordinates": "EXIF-oriented RGB, resized mask pixels; xyxy boxes",
          "score_meaning": "uncalibrated model scores, not correctness probabilities"}
SOURCE_NAMES = ("object_suggestions.py", "object-models.json", "inference.py",
                "geometry.py", "prediction_fields.py", "requirements-cloud.txt",
                "requirements-objects.txt", "object_cloud.py", "object_worker.py", "pilot.py")


def configuration_sha():
    return fingerprint({"models": MODELS, "policy": POLICY, "source": {
        name: hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in SOURCE_NAMES}})


def validate_request(request):
    if not isinstance(request, dict) or set(request) != {"version", "operation", "job_id", "images"}:
        raise ValueError("Object stage accepts only original analyze requests")
    validate_payload(request)
    if request["operation"] != "analyze":
        raise ValueError("No generated views or reconstruction in object suggestions")
    return [{"id": r["id"], "sha256": r["sha256"]} for r in request["images"]]


def mask_record(mask):
    output = io.BytesIO()
    Image.fromarray(np.asarray(mask, np.uint8)*255).save(output, format="PNG")
    data = output.getvalue()
    return {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data),
            "data_base64": base64.b64encode(data).decode()}


def decode_mask(record, size):
    if not isinstance(record, dict) or set(record) != {"sha256", "bytes", "data_base64"}:
        raise ValueError("Unexpected mask fields")
    text = record["data_base64"]
    if not isinstance(text, str) or len(text) > 2*1024**2:
        raise ValueError("Oversized mask")
    data = base64.b64decode(text, validate=True)
    if len(data) != record["bytes"] or hashlib.sha256(data).hexdigest() != record["sha256"]:
        raise ValueError("Mask integrity mismatch")
    with Image.open(io.BytesIO(data)) as image:
        if image.format != "PNG" or image.mode != "L" or list(image.size) != size:
            raise ValueError("Invalid mask dimensions/format")
        mask = np.asarray(image)
    if not np.isin(mask, [0, 255]).all() or np.count_nonzero(mask) < POLICY["minimum_mask_pixels"]:
        raise ValueError("Mask must be binary and nonempty")
    return mask != 0


def iou(a, b):
    a, b = np.asarray(a), np.asarray(b)
    intersection = np.maximum(0, np.minimum(a[2:], b[2:])-np.maximum(a[:2], b[:2])).prod()
    union = (a[2:]-a[:2]).prod()+(b[2:]-b[:2]).prod()-intersection
    return float(intersection/max(float(union), 1e-9))


def select_boxes(raw, size):
    """Deterministic same-label suppression; never invent a missing category."""
    if not isinstance(raw, list) or len(raw) > 900:
        raise ValueError("Detector result exceeds query budget")
    kept, candidates = [], []
    for item in raw:
        label = str(item["label"]).lower().strip(" .")
        score, box = float(item["score"]), np.asarray(item["box"], float)
        if box.shape != (4,) or not np.isfinite(box).all() or not np.isfinite(score):
            raise ValueError("Nonfinite detector result")
        if label not in LABELS or score < POLICY["box_threshold"]:
            continue
        if not 0 <= score <= 1:
            raise ValueError("Invalid detector score")
        box = np.clip(box, [0, 0, 0, 0], [*size, *size])
        if (box[2:]-box[:2] < 2).any():
            continue
        candidates.append({"label": label, "box_xyxy": box.tolist(), "detection_score": score})
    for item in sorted(candidates, key=lambda v: (-v["detection_score"], v["label"], v["box_xyxy"])):
        if not any(old["label"] == item["label"] and
                   iou(old["box_xyxy"], item["box_xyxy"]) > POLICY["nms_iou"] for old in kept):
            kept.append(item)
    return kept[:POLICY["max_per_view"]], max(0, len(kept)-POLICY["max_per_view"])


def validate_result(artifact, request):
    sources = validate_request(request)
    keys = {"version", "kind", "job_id", "original_inputs_sha256", "model_config_sha256",
            "views", "status", "elapsed_seconds"}
    if not isinstance(artifact, dict) or set(artifact) != keys or artifact["version"] != 1:
        raise ValueError("Unknown object result fields")
    if (artifact["kind"] != "eva-room-object-suggestions-v1" or artifact["job_id"] != request["job_id"]
            or artifact["original_inputs_sha256"] != fingerprint(sources)
            or artifact["model_config_sha256"] != configuration_sha()):
        raise ValueError("Object result source/model binding differs")
    if (artifact["status"] not in ("executed", "no-suggestions") or
            type(artifact["elapsed_seconds"]) not in (int, float) or
            not np.isfinite(artifact["elapsed_seconds"]) or artifact["elapsed_seconds"] < 0):
        raise ValueError("Invalid result status/timing")
    views = artifact["views"]
    if not isinstance(views, list) or len(views) != len(sources):
        raise ValueError("Missing original view results")
    with tempfile.TemporaryDirectory(prefix="eva-object-validation-") as directory:
        _, _, normalized = _decode_images(request["images"], Path(directory))
    count = 0
    for view, source, original in zip(views, sources, normalized):
        if not isinstance(view, dict) or set(view) != {
                "image_id", "source_sha256", "source_size", "mask_size", "detections", "truncated_count"}:
            raise ValueError("Unknown view fields")
        if view["image_id"] != source["id"] or view["source_sha256"] != source["sha256"]:
            raise ValueError("View source binding differs")
        if view["source_size"] != [original["width"], original["height"]]:
            raise ValueError("View dimensions differ from original photo")
        for key, maximum in (("source_size", 8192), ("mask_size", POLICY["long_edge"])):
            size = view[key]
            if not isinstance(size, list) or len(size) != 2 or any(type(n) is not int or not 1 <= n <= maximum for n in size):
                raise ValueError("Invalid view size")
        factor = min(1., POLICY["long_edge"]/max(view["source_size"]))
        if view["mask_size"] != [max(1, round(n*factor)) for n in view["source_size"]]:
            raise ValueError("Incorrect normalized image transform")
        if type(view["truncated_count"]) is not int or not 0 <= view["truncated_count"] <= 900:
            raise ValueError("Invalid truncation count")
        detections = view["detections"]
        if not isinstance(detections, list) or len(detections) > POLICY["max_per_view"]:
            raise ValueError("Too many object proposals")
        for ordinal, item in enumerate(detections):
            if not isinstance(item, dict) or set(item) != {
                    "id", "label", "box_xyxy", "detection_score", "mask_score", "mask", "review_reasons"}:
                raise ValueError("Unknown detection fields")
            if item["id"] != f'{source["id"]}-o{ordinal}' or item["label"] not in LABELS:
                raise ValueError("Invalid object identity/category")
            for score in ("detection_score", "mask_score"):
                if type(item[score]) not in (int, float) or not np.isfinite(item[score]) or not 0 <= item[score] <= 1:
                    raise ValueError("Invalid object score")
            selected, _ = select_boxes([{"label": item["label"], "score": item["detection_score"],
                                        "box": item["box_xyxy"]}], view["mask_size"])
            if len(selected) != 1 or selected[0]["box_xyxy"] != item["box_xyxy"]:
                raise ValueError("Box outside image")
            mask = decode_mask(item["mask"], view["mask_size"])
            if item["review_reasons"] != review_reasons(mask, item["mask_score"]):
                raise ValueError("Incorrect review flags")
            count += 1
    if artifact["status"] != ("executed" if count else "no-suggestions"):
        raise ValueError("False success status")
    if len(json.dumps(artifact, allow_nan=False).encode()) > POLICY["maximum_output_bytes"]:
        raise ValueError("Object result exceeds byte cap")
    return artifact


def review_reasons(mask, score):
    reasons = []
    if score < POLICY["mask_score_review_below"]:
        reasons.append("weak-mask-score")
    if mask[0].any() or mask[-1].any() or mask[:, 0].any() or mask[:, -1].any():
        reasons.append("cut-off-at-image-edge")
    return reasons


def acquire(directory):
    """Pinned files only; verifies published hashes before any weight loading."""
    from huggingface_hub import hf_hub_download
    paths = []
    for model in MODELS["models"]:
        local = Path(directory)/model["repository"].split("/")[-1]
        for entry in model["files"]:
            path = Path(hf_hub_download(model["repository"], entry["name"],
                                       revision=model["revision"], local_dir=local))
            if path.stat().st_size != entry["bytes"]:
                raise ValueError("Model size mismatch")
            h = hashlib.sha256() if entry["algorithm"] == "sha256" else hashlib.sha1()
            if entry["algorithm"] == "git-blob-sha1":
                h.update(f'blob {entry["bytes"]}\0'.encode())
            with path.open("rb") as file:
                for chunk in iter(lambda: file.read(1024**2), b""):
                    h.update(chunk)
            if h.hexdigest() != entry["hash"]:
                raise ValueError("Model hash mismatch")
        paths.append(local)
    return paths


def load_models(paths):
    import torch
    from transformers import AutoProcessor, AutoModelForZeroShotObjectDetection
    from sam2.build_sam import build_sam2
    from sam2.sam2_image_predictor import SAM2ImagePredictor
    torch.manual_seed(POLICY["seed"])
    processor = AutoProcessor.from_pretrained(str(paths[0]), local_files_only=True, trust_remote_code=False)
    detector = AutoModelForZeroShotObjectDetection.from_pretrained(
        str(paths[0]), local_files_only=True, trust_remote_code=False, use_safetensors=True,
        disable_custom_kernels=True).eval().to("cuda")
    predictor = SAM2ImagePredictor(build_sam2(
        "configs/sam2.1/sam2.1_hiera_s.yaml", str(paths[1]/"sam2.1_hiera_small.pt"), device="cuda"))

    def detect(image):
        inputs = processor(images=image, text=". ".join(LABELS)+".", return_tensors="pt").to("cuda")
        with torch.inference_mode():
            output = detector(**inputs)
        result = processor.post_process_grounded_object_detection(
            output, inputs.input_ids, box_threshold=POLICY["box_threshold"],
            text_threshold=POLICY["text_threshold"], target_sizes=[image.size[::-1]])[0]
        return [{"box": b.tolist(), "score": s.item(), "label": label}
                for b, s, label in zip(result["boxes"], result["scores"], result["text_labels"])]

    def segment(image, boxes):
        with torch.inference_mode(), torch.autocast("cuda", dtype=torch.bfloat16):
            predictor.set_image(np.asarray(image))
            # Bounded one-box calls avoid model-version-dependent batched shapes.
            output = []
            for box in boxes:
                masks, scores, _ = predictor.predict(box=np.asarray(box), multimask_output=False)
                output.append((masks[0].astype(bool), float(scores[0])))
            return output
    return detect, segment


def execute(request, detect, segment):
    """Models are injected only by the operator entry point, never by job data."""
    started = time.monotonic()
    sources = validate_request(request)
    views = []
    with tempfile.TemporaryDirectory(prefix="eva-object-images-") as directory:
        images, _, _ = _decode_images(request["images"], Path(directory))
        for rgb, source in zip(images, sources):
            original = Image.fromarray(rgb)
            factor = min(1., POLICY["long_edge"]/max(original.size))
            size = [max(1, round(n*factor)) for n in original.size]
            image = original.resize(size, Image.Resampling.BILINEAR)
            boxes, truncated = select_boxes(detect(image), size)
            masks = segment(image, [b["box_xyxy"] for b in boxes]) if boxes else []
            if len(masks) != len(boxes):
                raise ValueError("Mask count differs from detections")
            detections = []
            for box, (mask, score) in zip(boxes, masks):
                if np.asarray(mask).shape != (size[1], size[0]) or not np.isfinite(score) or not 0 <= score <= 1:
                    raise ValueError("Invalid predicted mask/score")
                if np.count_nonzero(mask) < POLICY["minimum_mask_pixels"]:
                    continue
                detections.append({**box, "id": f'{source["id"]}-o{len(detections)}',
                                   "mask_score": score, "mask": mask_record(mask),
                                   "review_reasons": review_reasons(mask, score)})
            views.append({"image_id": source["id"], "source_sha256": source["sha256"],
                          "source_size": list(original.size), "mask_size": size,
                          "detections": detections, "truncated_count": truncated})
    result = {"version": 1, "kind": "eva-room-object-suggestions-v1", "job_id": request["job_id"],
              "original_inputs_sha256": fingerprint(sources), "model_config_sha256": configuration_sha(),
              "status": "executed" if any(v["detections"] for v in views) else "no-suggestions",
              "views": views, "elapsed_seconds": time.monotonic()-started}
    return validate_result(result, request)
