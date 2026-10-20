"""Fail-closed raw edit check, then exact protected-pixel composite; no model calls."""
import argparse
from pathlib import Path
import numpy as np
from PIL import Image
from genrc_contract import sha256, write_json
from planar_completion import image_gate
from source_completion import locked_composite


def validate(original_path, raw_path, mask_path, output):
    original = np.array(Image.open(original_path).convert("RGB"))
    raw_image = Image.open(raw_path).convert("RGB")
    mask_image = Image.open(mask_path).convert("L")
    mask_values = np.array(mask_image)
    if not np.isin(mask_values, [0, 255]).all():
        raise ValueError("Explicit binary white-edit mask required")
    mask = mask_values == 255
    if raw_image.width*original.shape[0] != raw_image.height*original.shape[1]:
        raise ValueError("Camera aspect ratio changed")
    output.mkdir(parents=True, exist_ok=False)
    raw = np.array(raw_image)
    verdict = image_gate(original, raw, mask)
    verdict["input_sha256"] = {name: sha256(path) for name, path in
                              (("original", original_path), ("raw", raw_path), ("mask", mask_path))}
    verdict["status"] = "requires-visual-and-depth-review" if verdict["accepted"] else "rejected-no-composite"
    if verdict["accepted"]:
        registered = np.array(raw_image.resize((original.shape[1], original.shape[0]), Image.Resampling.BOX))
        composite = locked_composite(original, registered, mask)
        assert np.array_equal(composite[~mask], original[~mask])
        Image.fromarray(composite).save(output / "candidate-rgb.png")
        verdict["composite_sha256"] = sha256(output / "candidate-rgb.png")
    write_json(output / "gate.json", verdict)
    return verdict["accepted"]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ("original", "raw", "mask", "output"):
        parser.add_argument("--"+key, required=True, type=Path)
    args = parser.parse_args()
    raise SystemExit(0 if validate(args.original, args.raw, args.mask, args.output) else 2)
