"""Decode original photographs on CPU before consuming a cloud-run grant.

This checks admission and normalization, not overlap, room identity or accuracy.
Original bytes remain unchanged. No model, network or generated-video processing.
"""
import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import re
import warnings

from PIL import Image, ImageOps

MAX_REQUEST_BYTES = 150 * 1024**2
MAX_PHOTO_BYTES = 10 * 1024**2
MAX_TOTAL_BYTES = 40 * 1024**2
MAX_PIXELS = 24_000_000
IDENTIFIER = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")


def inspect_originals(payload, request_sha256):
    if (not isinstance(payload, dict) or not isinstance(payload.get("job_id"), str)
            or not IDENTIFIER.fullmatch(payload["job_id"])):
        raise ValueError("Invalid job identity")
    if not isinstance(request_sha256, str) or not SHA256.fullmatch(request_sha256):
        raise ValueError("Invalid request fingerprint")
    records = payload.get("images")
    if not isinstance(records, list) or not 5 <= len(records) <= 7:
        raise ValueError("Require 5-7 original photographs")
    total, identifiers, hashes, normalized_hashes, inspected = 0, set(), set(), set(), []
    for record in records:
        if not isinstance(record, dict) or set(record) != {"id", "sha256", "data_base64"}:
            raise ValueError("Invalid original photograph record")
        image_id, digest, encoded = record["id"], record["sha256"], record["data_base64"]
        if not isinstance(image_id, str) or not IDENTIFIER.fullmatch(image_id) or image_id in identifiers:
            raise ValueError("Invalid or repeated photograph identity")
        if not isinstance(digest, str) or not SHA256.fullmatch(digest) or digest in hashes:
            raise ValueError("Invalid or repeated photograph fingerprint")
        if not isinstance(encoded, str) or len(encoded) > ((MAX_PHOTO_BYTES + 2) // 3) * 4:
            raise ValueError("Original photograph exceeds byte limit")
        try:
            data = base64.b64decode(encoded, validate=True)
        except Exception as error:
            raise ValueError("Invalid photograph encoding") from error
        if not 16 <= len(data) <= MAX_PHOTO_BYTES or hashlib.sha256(data).hexdigest() != digest:
            raise ValueError("Original photograph hash or byte limit mismatch")
        total += len(data)
        if total > MAX_TOTAL_BYTES:
            raise ValueError("Original photo set exceeds 40 MiB")
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            try:
                with Image.open(io.BytesIO(data)) as raw:
                    if raw.format not in {"PNG", "JPEG"} or getattr(raw, "n_frames", 1) != 1:
                        raise ValueError("Use static JPEG or PNG originals")
                    if min(raw.size) < 32 or max(raw.size) > 8192 or raw.width * raw.height > MAX_PIXELS:
                        raise ValueError("Photo dimensions exceed 32-8192 sides or 24 megapixels")
                    raw.verify()
                with Image.open(io.BytesIO(data)) as raw:
                    # Same EXIF/RGB normalization as the frozen worker.
                    normalized = ImageOps.exif_transpose(raw).convert("RGB")
                    normalized.load()
            except (OSError, SyntaxError, Image.DecompressionBombError, Image.DecompressionBombWarning) as error:
                raise ValueError("A photograph cannot be fully decoded within the image policy") from error
        width, height = normalized.size
        if round(min(width, height) * 518 / max(width, height) / 14) * 14 < 14:
            raise ValueError("Photograph aspect ratio is unsupported by the estimator")
        pixel_hash = hashlib.sha256(
            f"RGB:{width}:{height}:".encode("ascii") + normalized.tobytes()
        ).hexdigest()
        normalized.close()
        if pixel_hash in normalized_hashes:
            raise ValueError("Remove photographs with identical normalized pixels")
        identifiers.add(image_id)
        hashes.add(digest)
        normalized_hashes.add(pixel_hash)
        inspected.append({"id": image_id, "sha256": digest, "width": width, "height": height,
                          "normalized_pixels_sha256": pixel_hash})
    return {"version": 1, "job_id": payload["job_id"], "request_sha256": request_sha256,
            "status": "valid-original-photos", "images": inspected}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args(argv)
    if args.output.exists():
        parser.error("Preflight output already exists; preserve the previous report")
    if not args.request.is_file() or args.request.stat().st_size > MAX_REQUEST_BYTES:
        parser.error("Request is absent or exceeds the bounded admission policy")
    data = args.request.read_bytes()
    if len(data) > MAX_REQUEST_BYTES:
        parser.error("Request grew beyond the bounded admission policy")
    def reject_constant(value):
        raise ValueError("Nonfinite JSON value")
    def unique_fields(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("Duplicate JSON field")
            result[key] = value
        return result
    payload = json.loads(data, parse_constant=reject_constant, object_pairs_hook=unique_fields)
    report = inspect_originals(payload, hashlib.sha256(data).hexdigest())
    with args.output.open("x", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
    print(json.dumps({"status": report["status"], "photo_count": len(report["images"])}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
