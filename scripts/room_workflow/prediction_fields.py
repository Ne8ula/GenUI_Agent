"""Bounded numerical ML sidecar for offline refinement without another model run."""
import base64
import hashlib
import io
import zipfile

import numpy as np

MAX_BYTES = 24 * 1024**2
NAMES = {"depth", "confidence", "rgb", "image_valid", "selected_valid"}


def pack(prediction, image_ids):
    output = io.BytesIO()
    np.savez_compressed(output,
                        depth=np.asarray(prediction["depth"], dtype="<f4"),
                        confidence=np.asarray(prediction["confidence"], dtype="<f4"),
                        rgb=np.asarray(prediction["rgb"], dtype="<f4"),
                        image_valid=np.asarray(prediction["image_valid"], dtype=np.uint8),
                        selected_valid=np.asarray(prediction["valid"], dtype=np.uint8))
    data = output.getvalue()
    if len(data) > MAX_BYTES:
        raise ValueError("Numerical sidecar exceeds bounded export")
    return {"format": "eva-vggt-fields-npz-v1", "image_ids": list(image_ids),
            "shape": list(prediction["depth"].shape), "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
            "data_base64": base64.b64encode(data).decode(),
            "meaning": "estimated OpenCV z-depth in relative units; confidence is not probability"}


def unpack(record):
    if record.get("format") != "eva-vggt-fields-npz-v1":
        raise ValueError("Unknown predicted field format")
    shape = record.get("shape")
    if (not isinstance(shape, list) or len(shape) != 3 or not 5 <= shape[0] <= 7
            or shape[1:] != [518, 518] or len(record.get("image_ids", [])) != shape[0]):
        raise ValueError("Invalid predicted field shape")
    text = record.get("data_base64", "")
    if not isinstance(text, str) or len(text) > (MAX_BYTES + 2)//3*4:
        raise ValueError("Oversized predicted field encoding")
    data = base64.b64decode(text, validate=True)
    if (len(data) != record.get("bytes") or len(data) > MAX_BYTES
            or hashlib.sha256(data).hexdigest() != record.get("sha256")):
        raise ValueError("Predicted field integrity mismatch")
    with zipfile.ZipFile(io.BytesIO(data)) as handle:
        entries = handle.infolist()
        if (len(entries) != len(NAMES) or {e.filename for e in entries} != {n+".npy" for n in NAMES}
                or sum(e.file_size for e in entries) > 48 * 1024**2):
            raise ValueError("Unexpected/oversized numerical archive")
        for entry in entries:
            key = entry.filename[:-4]
            with handle.open(entry) as stream:
                version = np.lib.format.read_magic(stream)
                if version not in ((1, 0), (2, 0)):
                    raise ValueError("Unsupported numerical header")
                reader = (np.lib.format.read_array_header_1_0 if version == (1, 0)
                          else np.lib.format.read_array_header_2_0)
                header_shape, fortran, dtype = reader(stream, max_header_size=1024)
                expected_shape = tuple(shape + ([3] if key == "rgb" else []))
                expected_dtype = np.dtype("uint8" if key.endswith("valid") else "<f4")
                if (header_shape != expected_shape or fortran or dtype != expected_dtype
                        or entry.file_size != stream.tell() + np.prod(expected_shape)*dtype.itemsize):
                    raise ValueError("Invalid numerical header/byte length")
    with np.load(io.BytesIO(data), allow_pickle=False) as handle:
        arrays = {key: handle[key] for key in NAMES}
    for key, array in arrays.items():
        expected = tuple(shape + ([3] if key == "rgb" else []))
        if array.shape != expected:
            raise ValueError("Numerical field shape mismatch")
        if key in ("image_valid", "selected_valid"):
            if array.dtype != np.uint8 or not np.isin(array, [0, 1]).all():
                raise ValueError("Invalid validity array")
        elif array.dtype != np.float32 or not np.isfinite(array).all():
            raise ValueError("Nonfinite or invalid numerical array")
    if (arrays["rgb"].min() < 0 or arrays["rgb"].max() > 1
            or np.any((arrays["selected_valid"] != 0) & (arrays["image_valid"] == 0))):
        raise ValueError("Invalid color/validity semantics")
    return arrays
