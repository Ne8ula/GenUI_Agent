"""Offline contracts for the bounded GenRC perspective pilot (no Modal imports)."""
from __future__ import annotations

import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import zipfile

GENRC_COMMIT = "86d19cf15904522e01d9a09436f079c6d3fb6c2f"
PYTORCH3D_COMMIT = "3145dd4d16edaceb394838364b8e87a440f83c10"
ENCODER_COMMIT = "771ce082b2ce6d033f55b3d47c1f77389ad3c180"
MAX_BUNDLE_BYTES = 128 * 1024**2
BUNDLE_FILES = {"manifest.json", "room.ply", "observations.npz"}


def sha256(path):
    value = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024**2), b""):
            value.update(chunk)
    return value.hexdigest()


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def validate_manifest(m):
    import numpy as np
    expected = {"version", "scene", "condition", "source", "files", "camera", "bounds_m",
                "seed", "steps", "roi", "seam_m", "prompt", "evaluation_status"}
    if set(m) != expected or m["version"] != 1 or m["scene"] != "ai_001_004":
        raise ValueError("Unsupported manifest shape/scene")
    if m["condition"] != "genrc-perspective-pilot" or m["evaluation_status"] != "development-candidate":
        raise ValueError("Invalid provenance condition")
    for key, low, high in (("seed", 0, 2**31-1), ("steps", 1, 50)):
        if type(m[key]) is not int or not low <= m[key] <= high:
            raise ValueError("Invalid " + key)
    if type(m["seam_m"]) not in (float, int) or not 0 <= m["seam_m"] <= .02:
        raise ValueError("Seam adjustment exceeds 2 cm")
    roi = m["roi"]
    if len(roi) != 4 or any(type(v) is not int for v in roi) or not (0 <= roi[0] < roi[2] <= 512 and 0 <= roi[1] < roi[3] <= 512):
        raise ValueError("Invalid 512px ROI")
    if not isinstance(m["prompt"], str) or not 1 <= len(m["prompt"]) <= 500:
        raise ValueError("Invalid prompt")
    camera = m["camera"]
    if set(camera) != {"frame", "K", "world_from_cv_m", "crop"} or camera["frame"] != 37 or camera["crop"] != [128, 0, 768, 768, 512]:
        raise ValueError("Pilot requires the recorded central crop of frame 37")
    K, pose = np.asarray(camera["K"]), np.asarray(camera["world_from_cv_m"])
    if K.shape != (3, 3) or not np.isfinite(K).all() or not np.allclose(K, [[K[0,0],0,256],[0,K[1,1],256],[0,0,1]]) or min(K[0,0],K[1,1]) <= 0:
        raise ValueError("Invalid intrinsics")
    if pose.shape != (4, 4) or not np.isfinite(pose).all() or not np.allclose(pose[3], [0,0,0,1]) or not np.allclose(pose[:3,:3].T @ pose[:3,:3], np.eye(3), atol=1e-5) or not np.isclose(np.linalg.det(pose[:3,:3]), 1, atol=1e-5):
        raise ValueError("Invalid metric pose")
    bounds = np.asarray(m["bounds_m"])
    if bounds.shape != (2, 3) or not np.isfinite(bounds).all() or not (bounds[1] > bounds[0]).all() or (bounds[1]-bounds[0] > 15).any():
        raise ValueError("Invalid room bounds")
    if set(m["files"]) != BUNDLE_FILES - {"manifest.json"}:
        raise ValueError("Unexpected bundle files")
    for record in m["files"].values():
        if set(record) != {"sha256", "bytes"} or not re.fullmatch(r"[0-9a-f]{64}", record["sha256"]) or type(record["bytes"]) is not int or not 0 < record["bytes"] < MAX_BUNDLE_BYTES:
            raise ValueError("Invalid file record")
    if set(m["source"]) != {"mesh_sha256", "report_sha256", "input_manifest_sha256", "license", "attribution"}:
        raise ValueError("Invalid source provenance")
    if m["source"]["mesh_sha256"] != m["files"]["room.ply"]["sha256"]:
        raise ValueError("Source mesh identity mismatch")
    for key in ("report_sha256", "input_manifest_sha256"):
        if not re.fullmatch(r"[0-9a-f]{64}",m["source"][key]):
            raise ValueError("Invalid source digest")
    return m


def unpack_bundle(payload, destination):
    if len(payload) > MAX_BUNDLE_BYTES:
        raise ValueError("Oversized input")
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        entries = archive.infolist()
        if len(entries) != 3 or {i.filename for i in entries} != BUNDLE_FILES or sum(i.file_size for i in entries) > MAX_BUNDLE_BYTES:
            raise ValueError("Unexpected/oversized archive contents")
        # Only flat allowlisted files are ever written; never extractall.
        m = validate_manifest(json.loads(archive.read("manifest.json")))
        destination = Path(destination)
        destination.mkdir(parents=True, exist_ok=False)
        for entry in entries:
            data = archive.read(entry)
            if entry.filename != "manifest.json":
                record = m["files"][entry.filename]
                if len(data) != record["bytes"] or hashlib.sha256(data).hexdigest() != record["sha256"]:
                    raise ValueError("Input integrity failure")
            (destination / entry.filename).write_bytes(data)
    return m


def verify_models(root):
    """Validate a manually acquired, provenance-labelled model cache before torch.load."""
    root = Path(root).resolve()
    m = json.loads((root / "models.json").read_text(encoding="utf-8"))
    if set(m) != {"version", "sources", "files"} or m["version"] != 1:
        raise ValueError("Invalid models manifest")
    if set(m["sources"]) != {"irondepth", "stable-diffusion-2-inpainting"}:
        raise ValueError("Both model sources must be recorded")
    for record in m["sources"].values():
        if set(record) != {"url", "revision", "license"} or not all(isinstance(v, str) and v.strip() for v in record.values()) or not record["url"].startswith("https://"):
            raise ValueError("Missing model source/revision/license")
    required = {"normal_scannet.pt", "irondepth_scannet.pt", "stable-diffusion-2-inpainting/model_index.json"}
    if not required <= set(m["files"]) or len(m["files"]) > 2000:
        raise ValueError("Incomplete model cache")
    total = 0
    for name, record in m["files"].items():
        path = PurePosixPath(name)
        if path.is_absolute() or ".." in path.parts or "\\" in name or ":" in name:
            raise ValueError("Unsafe model path")
        target = root / name
        if not target.resolve().is_relative_to(root) or target.is_symlink():
            raise ValueError("Model path escapes cache")
        if set(record) != {"sha256", "bytes"} or type(record["bytes"]) is not int or record["bytes"] <= 0:
            raise ValueError("Invalid model record")
        total += record["bytes"]
        if total > 20 * 1024**3 or target.stat().st_size != record["bytes"] or sha256(target) != record["sha256"]:
            raise ValueError("Model hash/size mismatch or cache exceeds 20 GiB")
    actual = {p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()} - {"models.json"}
    if actual != set(m["files"]):
        raise ValueError("Unmanifested model files")
    sd = root/"stable-diffusion-2-inpainting"
    index = json.loads((sd/"model_index.json").read_text())
    if index.get("_class_name") != "StableDiffusionInpaintPipeline":
        raise ValueError("Expected SD inpainting pipeline configuration")
    for component in ("unet","vae","text_encoder","tokenizer","scheduler"):
        if not isinstance(index.get(component),list) or len(index[component]) != 2:
            raise ValueError("Missing SD component: " + component)
        directory = sd/component
        config_name = "tokenizer_config.json" if component == "tokenizer" else "scheduler_config.json" if component == "scheduler" else "config.json"
        json.loads((directory/config_name).read_text())
        if component in ("unet","vae","text_encoder") and not any(p.is_file() and p.suffix in (".bin",".safetensors") for p in directory.iterdir()):
            raise ValueError("Missing SD weights: " + component)
    if not (sd/"tokenizer/vocab.json").is_file() or not (sd/"tokenizer/merges.txt").is_file():
        raise ValueError("Missing tokenizer assets")
    for name, component in index.items():
        if not isinstance(component,list) or name in ("unet","vae","text_encoder","tokenizer","scheduler"):
            continue
        if component == [None,None]:
            continue
        if name not in ("safety_checker","feature_extractor") or len(component) != 2:
            raise ValueError("Unsupported SD component: " + name)
        directory = sd/name
        json.loads((directory/("config.json" if name == "safety_checker" else "preprocessor_config.json")).read_text())
        if name == "safety_checker" and not any(p.suffix in (".bin",".safetensors") for p in directory.iterdir()):
            raise ValueError("Missing safety checker weights")
    return m
