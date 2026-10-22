"""Pinned LoFTR correspondence-only proposal and lazy worker; no deployment.

The parent/operator must review acquisition and the bounded Modal run. Imports,
proposal(), and tests never download or execute a model. execute() requires an
already acquired, hash-verified checkpoint and the reviewed Torch image.
"""
import base64
import copy
import hashlib
import io
import itertools
import json
from pathlib import Path
import time

import numpy as np
from PIL import Image

PINS = {
    "model": "LoFTR indoor",
    "original_source_revision": "df7ca80f917334b94cfbe32cc2901e09a80e70a8",
    "implementation": "kornia==0.7.3",
    "implementation_source_revision": "e0114f7439891a2348e31e27ce7bbae560796e4f",
    "implementation_wheel_sha256": "f2175f7244a220443111917f8ccaf0242ac9c20401b9824b5c0dacddb37f3258",
    "kornia_rs_version": "0.1.9",
    "kornia_rs_cp311_linux_wheel_sha256": "6cdda9133297c4cff2c2c54be44d5c39bce715306d0bccb8ab1fae7c0dc7cf63",
    "weights_repository": "kornia/loftr",
    "weights_revision": "0fb3b456cf176746709c38fa9cf80695a1c82dac",
    "weights_filename": "loftr_indoor.ckpt",
    "weights_size": 46336731,
    "weights_sha256": "d73c54720370ba0690cd477e38404a626e881292cc0be09a6801da0cc6f53198",
    "torch_version": "2.5.1",
}
POLICY = {
    "minimum_images": 5, "maximum_images": 7, "maximum_pairs": 21,
    "original_rgb_only": True, "image_long_edge": 640, "resize_multiple": 8,
    "maximum_image_pixels": 24_000_000, "maximum_input_json_bytes": 64*1024**2,
    "minimum_match_score": .2, "maximum_matches_per_pair": 3000,
    "maximum_raw_matches_per_pair": 10000, "maximum_output_bytes": 16*1024**2,
    "score_meaning": "model matching score, not a calibrated correctness probability",
    "wallclock_seconds": 180, "gpu": "A100-40GB", "cpu": 4, "memory_mib": 16384,
    "calls": 1, "retries": 0, "batch_size": 1, "amp": False, "seed": 0,
    "coordinate_frame": "original-image pixels, integer pixel centers",
    "preprocessing": "PIL grayscale and bilinear resize; separate exact x/y scales; no EXIF reorientation",
}
SOURCES = {
    "original": "https://github.com/zju3dv/LoFTR/tree/"+PINS["original_source_revision"],
    "implementation": "https://github.com/kornia/kornia/tree/"+PINS["implementation_source_revision"],
    "weights_metadata": "https://huggingface.co/api/models/kornia/loftr/revision/"+PINS["weights_revision"]+"?blobs=true",
    "weights": "https://huggingface.co/kornia/loftr/resolve/"+PINS["weights_revision"]+"/"+PINS["weights_filename"],
    "weight_card": "https://huggingface.co/kornia/loftr/blob/"+PINS["weights_revision"]+"/README.md",
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def license_notice_urls():
    return {
        "original-LoFTR-LICENSE": "https://raw.githubusercontent.com/zju3dv/LoFTR/"+PINS["original_source_revision"]+"/LICENSE",
        "Kornia-LICENSE": "https://raw.githubusercontent.com/kornia/kornia/"+PINS["implementation_source_revision"]+"/LICENSE",
        "Kornia-LoFTR-weight-card": "https://huggingface.co/kornia/loftr/resolve/"+PINS["weights_revision"]+"/README.md",
    }


def proposal():
    return {
        "status": "prepared-not-submitted", "pins": PINS, "policy": POLICY, "sources": SOURCES,
        "license": {"original_code": "Apache-2.0", "kornia_code": "Apache-2.0",
                    "kornia_weight_card": "MIT metadata; not independently reconciled with original code license",
                    "weight_card_sha256": "14228da662f384520f29aae06e5a4b45a3f80d0702c5162b5aa00d593dd42328"},
        "integrity": "Pinned Kornia-hosted LFS SHA256; not proof of byte equivalence to original Google Drive distribution",
        "acquisition": "Public ungated download; verify exact size and SHA256 before weights_only=True loading",
        "additional_packages": ["kornia==0.7.3", "kornia-rs==0.1.9"],
        "image_requirements": "Reuse reviewed Torch 2.5.1 image; hash-pin the two added wheels with --no-deps; verify packaging exists",
        "downstream": "CPU original-only geometric verification, conservative track linking, unchanged support gate and anchored BA",
        "limitations": [
            "Image content may not overlap; learned matching cannot create overlap",
            "Detector-free pair coordinates need explicit cross-pair association before multiview BA",
            "Weights trained on ScanNet; this is ARKitScenes correspondence testing, not held-out geometry validation",
            "No geometry, depth, camera, VGGT, Shado, reference or held-out processing in this worker",
            "Compatibility and actual runtime remain unverified until the single approved run",
        ],
    }


def validate_request(request):
    from inference import validate_payload
    if not isinstance(request, dict) or set(request) != {"version", "operation", "job_id", "images"}:
        raise ValueError("Matching accepts only the original analyze request")
    if request["operation"] != "analyze" or len(canonical(request)) > POLICY["maximum_input_json_bytes"]:
        raise ValueError("Invalid matching request operation or size")
    originals, _ = validate_payload(request)
    return originals


def prepare_image(record):
    data = base64.b64decode(record["data_base64"], validate=True)
    if digest(data) != record["sha256"]:
        raise ValueError("Original image hash mismatch")
    with Image.open(io.BytesIO(data)) as image:
        width, height = image.size
        if min(width, height) < 16 or width*height > POLICY["maximum_image_pixels"]:
            raise ValueError("Image dimensions exceed matching budget")
        scale = min(1., POLICY["image_long_edge"]/max(width, height))
        resized = [max(8, int(v*scale)//8*8) for v in (width, height)]
        gray = np.asarray(image.convert("L").resize(resized, Image.Resampling.BILINEAR),
                          dtype=np.float32)/255.
    return gray, {"original_size": [width, height], "resized_size": resized,
                  "scale_xy": [resized[0]/width, resized[1]/height]}


def pack_pair(i, j, points0, points1, scores, transforms):
    """Reject malformed model output and return bounded original-pixel matches."""
    a, b, score = (np.asarray(v, dtype=np.float64) for v in (points0, points1, scores))
    if a.shape != b.shape or a.ndim != 2 or a.shape[1] != 2 or score.shape != (len(a),):
        raise ValueError("Malformed correspondence arrays")
    if len(a) > POLICY["maximum_raw_matches_per_pair"] or not all(np.isfinite(v).all() for v in (a, b, score)):
        raise ValueError("Correspondence budget or finite-value violation")
    if np.any((score < 0) | (score > 1)):
        raise ValueError("Invalid model score")
    for points, transform in ((a, transforms[i]), (b, transforms[j])):
        if np.any(points < 0) or np.any(points >= np.asarray(transform["resized_size"])):
            raise ValueError("Correspondence outside resized source")
    keep = np.flatnonzero(score >= POLICY["minimum_match_score"])
    keep = keep[np.argsort(-score[keep], kind="stable")[:POLICY["maximum_matches_per_pair"]]]
    def original(points, transform):
        result = (points[keep]+.5)/transform["scale_xy"]-.5
        return result.tolist()
    return {"image0": i, "image1": j, "raw_match_count": len(score),
            "retained_match_count": len(keep), "status": "matched" if len(keep) else "no-matches",
            "points0": original(a, transforms[i]), "points1": original(b, transforms[j]),
            "scores": score[keep].tolist()}


def verify_checkpoint(path):
    path = Path(path)
    if path.stat().st_size != PINS["weights_size"] or digest(path.read_bytes()) != PINS["weights_sha256"]:
        raise ValueError("Checkpoint size/SHA256 mismatch")


def validate_result(result, request):
    """Local numerical/provenance check before any track construction."""
    originals = validate_request(request)
    expected = {"version", "artifact_type", "status", "job_id", "request_sha256", "original_input_hashes",
                "pins", "policy", "sources", "preprocessing", "pairs", "pair_count",
                "implementation_sha256", "diagnostics"}
    if not isinstance(result, dict) or set(result) != expected:
        raise ValueError("Unsupported correspondence artifact")
    if (result["version"] != 1 or result["artifact_type"] != "eva-room-learned-correspondences-v1"
            or result["status"] != "executed" or result["job_id"] != request["job_id"]
            or result["request_sha256"] != digest(canonical(request))
            or result["original_input_hashes"] != [{"id": x["id"], "sha256": x["sha256"]} for x in originals]
            or result["pins"] != PINS or result["policy"] != POLICY or result["sources"] != SOURCES
            or result["implementation_sha256"] != digest(Path(__file__).read_bytes())):
        raise ValueError("Correspondence source/configuration binding mismatch")
    transforms = [prepare_image(record)[1] for record in originals]
    expected_pairs = list(itertools.combinations(range(len(originals)), 2))
    if result["preprocessing"] != transforms or result["pair_count"] != len(expected_pairs):
        raise ValueError("Correspondence preprocessing/pair count mismatch")
    if not isinstance(result["pairs"], list) or len(result["pairs"]) != len(expected_pairs):
        raise ValueError("Incomplete pair denominator")
    for pair, (i, j) in zip(result["pairs"], expected_pairs):
        if (not isinstance(pair, dict) or set(pair) != {"image0", "image1", "raw_match_count",
                "retained_match_count", "status", "points0", "points1", "scores"}
                or pair["image0"] != i or pair["image1"] != j):
            raise ValueError("Invalid pair identity/fields")
        n, raw = pair["retained_match_count"], pair["raw_match_count"]
        if (type(n) is not int or type(raw) is not int or not 0 <= n <= POLICY["maximum_matches_per_pair"]
                or not n <= raw <= POLICY["maximum_raw_matches_per_pair"]
                or pair["status"] != ("matched" if n else "no-matches")):
            raise ValueError("Invalid pair count/status")
        for key, frame in (("points0", i), ("points1", j)):
            value = np.asarray(pair[key], dtype=float)
            if n == 0 and value.shape == (0,):
                value = value.reshape(0, 2)
            if (value.shape != (n, 2) or not np.isfinite(value).all()
                    or np.any(value < 0) or np.any(value >= transforms[frame]["original_size"])):
                raise ValueError("Invalid source-pixel coordinates")
        scores = np.asarray(pair["scores"], dtype=float)
        if (scores.shape != (n,) or not np.isfinite(scores).all()
                or np.any(scores < POLICY["minimum_match_score"]) or np.any(scores > 1)):
            raise ValueError("Invalid retained scores")
    if len(canonical(result)) > POLICY["maximum_output_bytes"]:
        raise ValueError("Oversized correspondence artifact")
    diagnostics = result["diagnostics"]
    required = {"model_executed", "geometry_modified", "vggt_rerun", "uses_reference_or_heldout",
                "elapsed_seconds", "peak_cuda_memory_bytes", "gpu", "torch", "kornia"}
    if (not isinstance(diagnostics, dict) or set(diagnostics) != required
            or diagnostics["model_executed"] is not True
            or any(diagnostics[key] is not False for key in ("geometry_modified", "vggt_rerun", "uses_reference_or_heldout"))
            or type(diagnostics["elapsed_seconds"]) not in (int, float)
            or not 0 <= diagnostics["elapsed_seconds"] <= POLICY["wallclock_seconds"]
            or type(diagnostics["peak_cuda_memory_bytes"]) is not int
            or not 0 <= diagnostics["peak_cuda_memory_bytes"] <= 40*1024**3
            or not isinstance(diagnostics["torch"], str)
            or diagnostics["torch"].split("+")[0] != PINS["torch_version"]
            or diagnostics["kornia"] != "0.7.3"
            or not isinstance(diagnostics["gpu"], str)):
        raise ValueError("Invalid model-execution diagnostics")
    return result


def execute(request, checkpoint_path):
    """One real GPU matching pass; no downloads, geometry updates or retries."""
    started = time.monotonic()
    originals = validate_request(request)
    verify_checkpoint(checkpoint_path)
    import importlib.metadata
    import torch
    import kornia
    from kornia.feature.loftr.loftr import LoFTR, default_cfg
    if torch.__version__.split("+")[0] != PINS["torch_version"] or kornia.__version__ != "0.7.3":
        raise ValueError("Reviewed model runtime version mismatch")
    if importlib.metadata.version("kornia-rs") != PINS["kornia_rs_version"] or not torch.cuda.is_available():
        raise ValueError("Reviewed GPU/runtime unavailable")
    torch.manual_seed(POLICY["seed"])
    torch.set_num_threads(4)
    torch.cuda.reset_peak_memory_stats()
    # pretrained=None is essential: upstream defaults download from a mutable HTTP URL.
    model = LoFTR(pretrained=None, config=copy.deepcopy(default_cfg))
    state = torch.load(checkpoint_path, map_location="cpu", weights_only=True)
    if not isinstance(state, dict) or not isinstance(state.get("state_dict"), dict):
        raise ValueError("Unsupported checkpoint container; unsafe loading is forbidden")
    model.load_state_dict(state["state_dict"], strict=True)
    model = model.eval().cuda()
    images, transforms = [], []
    for record in originals:
        gray, transform = prepare_image(record)
        images.append(torch.from_numpy(gray)[None, None].cuda())
        transforms.append(transform)
    pairs = []
    with torch.inference_mode():
        for i, j in itertools.combinations(range(len(images)), 2):
            if time.monotonic()-started >= POLICY["wallclock_seconds"]-5:
                raise TimeoutError("Matching deadline reached; no automatic retry")
            raw = model({"image0": images[i], "image1": images[j]})
            pairs.append(pack_pair(i, j, raw["keypoints0"].cpu().numpy(), raw["keypoints1"].cpu().numpy(),
                                   raw["confidence"].cpu().numpy(), transforms))
    torch.cuda.synchronize()
    result = {
        "version": 1, "artifact_type": "eva-room-learned-correspondences-v1",
        "status": "executed", "job_id": request["job_id"],
        "request_sha256": digest(canonical(request)),
        "original_input_hashes": [{"id": x["id"], "sha256": x["sha256"]} for x in originals],
        "pins": PINS, "policy": POLICY, "sources": SOURCES, "preprocessing": transforms,
        "pairs": pairs, "pair_count": len(pairs),
        "implementation_sha256": digest(Path(__file__).read_bytes()),
        "diagnostics": {"model_executed": True, "geometry_modified": False, "vggt_rerun": False,
                        "uses_reference_or_heldout": False, "elapsed_seconds": time.monotonic()-started,
                        "peak_cuda_memory_bytes": torch.cuda.max_memory_allocated(),
                        "gpu": torch.cuda.get_device_name(), "torch": torch.__version__,
                        "kornia": kornia.__version__},
    }
    if len(canonical(result)) > POLICY["maximum_output_bytes"]:
        raise ValueError("Correspondence artifact exceeds output budget")
    return result


if __name__ == "__main__":
    print(json.dumps(proposal(), indent=2))
