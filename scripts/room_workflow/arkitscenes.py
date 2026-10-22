"""Prepare a private sparse-view ARKitScenes benchmark, without cloud/network calls.

Inputs are already extracted color frames. Dataset acquisition, frame selection,
single-room confirmation, geometry references, and inference are separate steps.
"""
import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import re
import stat

from PIL import Image, ImageDraw, ImageOps

from inference import MAX_IMAGE_BYTES, validate_payload

SOURCE_URL = "https://github.com/apple-aiml-research/ARKitScenes"
MAX_BUNDLE_BYTES = 100 * 1024**2


def _sha(data):
    return hashlib.sha256(data).hexdigest()


def _reject_links(path):
    """Reject symlinks and Windows junction/reparse ancestors before reading."""
    for entry in (path, *path.parents):
        info = entry.lstat()
        if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & 0x400:
            raise ValueError("Symlink/reparse paths are not allowed")


def _frame(root, filename, image_id, split, rotate_clockwise):
    if not isinstance(filename, str) or not filename or filename in (".", "..") or any(
        c in filename for c in '/\\:\x00'
    ) or Path(filename).name != filename:
        raise ValueError("Frames must be plain filenames inside images-dir")
    path = root / filename
    _reject_links(path)
    if not path.is_file() or path.resolve().parent != root:
        raise ValueError("Frame is not a regular file inside images-dir")
    if not 0 < path.stat().st_size <= MAX_IMAGE_BYTES:
        raise ValueError("Frame exceeds image byte limit")
    with path.open("rb") as handle:
        data = handle.read(MAX_IMAGE_BYTES + 1)
    if not 0 < len(data) <= MAX_IMAGE_BYTES:
        raise ValueError("Frame exceeds image byte limit")
    with Image.open(io.BytesIO(data)) as raw:
        if raw.format not in ("JPEG", "PNG", "WEBP") or getattr(raw, "n_frames", 1) != 1:
            raise ValueError("Only static JPEG/PNG/WebP frames are allowed")
        if min(raw.size) < 32 or max(raw.size) > 8192 or raw.width * raw.height > 24_000_000:
            raise ValueError("Frame dimensions exceed bounded decode policy")
        source_width, source_height = raw.size
        normalized = ImageOps.exif_transpose(raw).convert("RGB")
        if rotate_clockwise:
            normalized = normalized.rotate(-rotate_clockwise, expand=True)
        width, height = normalized.size
        buffer = io.BytesIO()
        normalized.save(buffer, format="PNG")
        normalized_data = buffer.getvalue()
        if len(normalized_data) > MAX_IMAGE_BYTES:
            raise ValueError("Normalized frame exceeds image byte limit")
        preview = normalized.copy()
        preview.thumbnail((320, 240))
    record = {
        "id": image_id, "source_filename": filename,
        "source_path": f"source-{split}/{filename}",
        "source_sha256": _sha(data), "source_bytes": len(data),
        "source_width": source_width, "source_height": source_height,
        "path": f"{split}/{image_id}.png", "sha256": _sha(normalized_data),
        "bytes": len(normalized_data), "width": width, "height": height,
        "normalization": {"exif_transpose": True, "color_mode": "RGB",
                          "rotate_clockwise_degrees": rotate_clockwise, "format": "PNG"},
        "source_kind": "extracted_dataset_video_frame",
    }
    return record, normalized_data, preview, data


def _contact_sheet(frames):
    columns, cell_width, cell_height = 3, 340, 284
    sheet = Image.new("RGB", (columns * cell_width,
                             ((len(frames) + columns - 1) // columns) * cell_height), "#202422")
    draw = ImageDraw.Draw(sheet)
    for index, (record, _, preview, _) in enumerate(frames):
        x, y = (index % columns) * cell_width, (index // columns) * cell_height
        sheet.paste(preview, (x + (cell_width - preview.width) // 2, y + 4))
        # IDs remain ASCII and link unambiguously to exact filenames in manifest.
        draw.text((x + 10, y + 248), record["id"], fill="white")
        draw.text((x + 10, y + 263), record["path"].split("/")[0], fill="#b9d5c4")
    stream = io.BytesIO()
    sheet.save(stream, "JPEG", quality=90)
    return stream.getvalue()


def prepare(images_dir, originals, heldout, video_id, output_dir, source_revision=None,
            rotate_clockwise=0):
    """Create a new bundle; reject existing output and invalid inputs before writing.

    Immutable here means this command never replaces an existing bundle. It does
    not apply filesystem ACLs. Hashes allow later edits to be detected.
    """
    if not isinstance(video_id, str) or not re.fullmatch(r"[0-9]{1,24}", video_id):
        raise ValueError("video-id must be an ARKitScenes numeric capture ID")
    if type(rotate_clockwise) is not int or rotate_clockwise not in (0, 90, 180, 270):
        raise ValueError("rotate-clockwise must be 0, 90, 180 or 270 degrees")
    if source_revision is not None and (not isinstance(source_revision, str)
                                        or not re.fullmatch(r"[0-9a-f]{40}", source_revision)):
        raise ValueError("source-revision must be a full lowercase Git commit hash")
    if not isinstance(originals, (list, tuple)) or not 5 <= len(originals) <= 7:
        raise ValueError("Select 5-7 original frames")
    if not isinstance(heldout, (list, tuple)) or not 1 <= len(heldout) <= 32:
        raise ValueError("Select 1-32 heldout frames")
    filenames = list(originals) + list(heldout)
    if any(not isinstance(name, str) for name in filenames):
        raise ValueError("Frame names must be strings")
    if len({name.casefold() for name in filenames}) != len(filenames):
        raise ValueError("Duplicate filename or overlap between splits")
    root = Path(images_dir).absolute()
    _reject_links(root)
    root = root.resolve(strict=True)
    if not root.is_dir():
        raise ValueError("images-dir must be a directory")
    output = Path(output_dir).absolute()
    if output.exists() or output.is_symlink():
        raise FileExistsError("Output exists; select a new bundle directory")
    # Resolve only existing ancestors; do not follow an output-parent link.
    for ancestor in output.parents:
        if ancestor.exists():
            _reject_links(ancestor)
            break
    frames = []
    for split, names in (("originals", originals), ("heldout", heldout)):
        for index, name in enumerate(names):
            frames.append(_frame(root, name, f"arkit_{video_id}_{split}_{index:02d}", split,
                                 rotate_clockwise))
    records = [frame[0] for frame in frames]
    if any(len({record[key] for record in records}) != len(records)
           for key in ("sha256", "source_sha256")):
        raise ValueError("Duplicate frame content within or between splits")
    if sum(record["bytes"] + record["source_bytes"] for record in records) > MAX_BUNDLE_BYTES:
        raise ValueError("Bundle exceeds 100 MiB image budget")
    original_frames = frames[:len(originals)]
    payload = {
        "version": 1, "operation": "analyze", "job_id": f"arkit_{video_id}",
        "images": [{
            "id": record["id"], "sha256": record["sha256"],
            "data_base64": base64.b64encode(data).decode("ascii"),
        } for record, data, _, _ in original_frames],
    }
    validate_payload(payload)
    request_bytes = (json.dumps(payload, indent=2) + "\n").encode()
    contact_bytes = _contact_sheet(frames)
    manifest = {
        "version": 1, "dataset": "ARKitScenes", "video_id": video_id,
        "source_repository": SOURCE_URL, "source_revision": source_revision,
        "source_revision_verification": "caller-declared; not independently verified",
        "selection": "explicit sparse-view benchmark selection from extracted video frames",
        "capture_caveat": "Guided iPad scanning data; not independent casual phone photographs.",
        "normalization": {
            "source_bytes": "preserved unchanged in source-originals and source-heldout",
            "cloud_and_contact_sheet": "EXIF-transposed RGB lossless PNG, then operator-specified rotation",
            "rotate_clockwise_degrees": rotate_clockwise,
            "orientation_basis": "operator-selected; no depth, pose or mesh used",
        },
        "room_boundary": {"status": "unconfirmed", "single_room_verified": False},
        "reference_policy": {
            "cloud_input": "original RGB frames only",
            "heldout": "evaluation only; excluded from cloud request",
            "supplied_depth_poses_meshes": "not included; acquire/store separately for evaluation",
            "completion": "not performed; requires confirmed single-room boundary",
        },
        "originals": records[:len(originals)], "heldout": records[len(originals):],
        "artifacts": {
            "analyze-request.json": {"sha256": _sha(request_bytes), "bytes": len(request_bytes)},
            "contact-sheet.jpg": {"sha256": _sha(contact_bytes), "bytes": len(contact_bytes)},
        },
    }
    manifest_bytes = (json.dumps(manifest, indent=2) + "\n").encode()
    # All input/decode/contract validation completes before any output is created.
    output.mkdir(parents=True, exist_ok=False)
    for split in ("originals", "heldout", "source-originals", "source-heldout"):
        (output / split).mkdir()
    artifacts = {
        **{record["path"]: data for record, data, _, _ in frames},
        **{record["source_path"]: source for record, _, _, source in frames},
        "analyze-request.json": request_bytes,
        "contact-sheet.jpg": contact_bytes,
        "manifest.json": manifest_bytes,
        "manifest.sha256": (_sha(manifest_bytes) + "  manifest.json\n").encode(),
    }
    for name, data in artifacts.items():
        with (output / name).open("xb") as handle:
            handle.write(data)
    return manifest


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    command = commands.add_parser("prepare", help="Prepare local RGB-only benchmark bundle")
    command.add_argument("--images-dir", required=True)
    command.add_argument("--originals", nargs="+", required=True)
    command.add_argument("--heldout", nargs="+", required=True)
    command.add_argument("--video-id", required=True)
    command.add_argument("--output-dir", required=True)
    command.add_argument("--source-revision")
    command.add_argument("--rotate-clockwise", type=int, choices=(0, 90, 180, 270), default=0)
    args = vars(parser.parse_args(argv))
    args.pop("command")
    manifest = prepare(**args)
    print(json.dumps({"video_id": manifest["video_id"], "originals": len(manifest["originals"]),
                      "heldout": len(manifest["heldout"]), "room_boundary": "unconfirmed"}))


if __name__ == "__main__":
    main()
