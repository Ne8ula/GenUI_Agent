"""Offline benchmark split/security checks; no dataset or reconstruction claims."""
import base64
import hashlib
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from PIL import Image

from arkitscenes import main, prepare
from inference import validate_payload


class ARKitScenesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.images = self.root / "images"
        self.images.mkdir()
        for index in range(9):
            Image.new("RGB", (64, 48), (index * 25, 30, 60)).save(self.images / f"frame_{index}.png")
        self.kwargs = {
            "images_dir": self.images, "originals": [f"frame_{i}.png" for i in range(5)],
            "heldout": ["frame_5.png", "frame_6.png"], "video_id": "42446478",
            "output_dir": self.root / "bundle",
        }

    def test_private_bundle_and_payload_separate_reference_evidence(self):
        manifest = prepare(**self.kwargs)
        output = self.kwargs["output_dir"]
        request = json.loads((output / "analyze-request.json").read_text())
        validate_payload(request)
        self.assertEqual(set(request), {"version", "operation", "job_id", "images"})
        self.assertEqual(len(request["images"]), 5)
        self.assertFalse(manifest["room_boundary"]["single_room_verified"])
        self.assertIn("not independent casual", manifest["capture_caveat"])
        self.assertEqual(len(manifest["heldout"]), 2)
        for split in ("originals", "heldout"):
            for entry in manifest[split]:
                copied = (output / entry["path"]).read_bytes()
                source = (output / entry["source_path"]).read_bytes()
                self.assertEqual(source, (self.images / entry["source_filename"]).read_bytes())
                self.assertEqual(entry["source_sha256"], hashlib.sha256(source).hexdigest())
                self.assertEqual(entry["sha256"], hashlib.sha256(copied).hexdigest())
        input_hashes = {record["sha256"] for record in request["images"]}
        self.assertTrue(input_hashes.isdisjoint({r["sha256"] for r in manifest["heldout"]}))
        self.assertEqual(base64.b64decode(request["images"][0]["data_base64"]),
                         (output / manifest["originals"][0]["path"]).read_bytes())
        for name, metadata in manifest["artifacts"].items():
            self.assertEqual(hashlib.sha256((output / name).read_bytes()).hexdigest(), metadata["sha256"])
        with Image.open(output / "contact-sheet.jpg") as sheet:
            self.assertEqual(sheet.size, (1020, 852))
        manifest_hash = hashlib.sha256((output / "manifest.json").read_bytes()).hexdigest()
        self.assertEqual((output / "manifest.sha256").read_text(), manifest_hash + "  manifest.json\n")

    def test_existing_output_never_overwritten(self):
        prepare(**self.kwargs)
        request = self.kwargs["output_dir"] / "analyze-request.json"
        before = request.read_bytes()
        with self.assertRaises(FileExistsError):
            prepare(**self.kwargs)
        self.assertEqual(request.read_bytes(), before)

    def test_cross_split_same_content_rejected_even_with_different_name(self):
        (self.images / "copy.png").write_bytes((self.images / "frame_0.png").read_bytes())
        with self.assertRaisesRegex(ValueError, "Duplicate frame content"):
            prepare(**{**self.kwargs, "heldout": ["copy.png"]})
        self.assertFalse(self.kwargs["output_dir"].exists())

    def test_path_escape_and_filename_overlap_rejected(self):
        for name in ("../frame_5.png", r"..\frame_5.png", str(self.images / "frame_5.png"),
                     "frame_5.png:stream", "frame_0.png", "FRAME_0.PNG"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                prepare(**{**self.kwargs, "heldout": [name]})
        self.assertFalse(self.kwargs["output_dir"].exists())

    def test_symlink_frame_rejected(self):
        link = self.images / "link.png"
        try:
            link.symlink_to(self.images / "frame_5.png")
        except OSError:
            self.skipTest("Host does not grant symlink creation")
        with self.assertRaisesRegex(ValueError, "Symlink/reparse"):
            prepare(**{**self.kwargs, "heldout": ["link.png"]})

    def test_windows_reparse_directory_rejected_without_link_creation_privilege(self):
        original_lstat = Path.lstat

        def with_reparse(path, *args, **kwargs):
            info = original_lstat(path, *args, **kwargs)
            if path == self.images:
                return SimpleNamespace(st_mode=info.st_mode, st_file_attributes=0x400)
            return info

        with patch.object(Path, "lstat", with_reparse), self.assertRaisesRegex(ValueError, "Symlink/reparse"):
            prepare(**self.kwargs)
        self.assertFalse(self.kwargs["output_dir"].exists())

    def test_invalid_counts_capture_id_revision_and_decode_rejected(self):
        for change in ({"originals": self.kwargs["originals"][:4]}, {"heldout": []},
                       {"video_id": "../capture"}, {"source_revision": "main"},
                       {"rotate_clockwise": 45}, {"rotate_clockwise": True}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                prepare(**{**self.kwargs, **change})
        (self.images / "bad.png").write_bytes(b"not a decoded image")
        with self.assertRaises(OSError):
            prepare(**{**self.kwargs, "heldout": ["bad.png"]})
        Image.new("RGB", (8, 8)).save(self.images / "small.png")
        with self.assertRaisesRegex(ValueError, "dimensions"):
            prepare(**{**self.kwargs, "heldout": ["small.png"]})
        self.assertFalse(self.kwargs["output_dir"].exists())

    def test_rotation_preserves_source_and_binds_upright_lossless_cloud_pixels(self):
        source = self.images / "frame_0.png"
        with Image.open(source) as raw:
            marked = raw.copy()
        marked.putpixel((0, 0), (255, 0, 0))
        marked.save(source)
        source_bytes = source.read_bytes()
        manifest = prepare(**self.kwargs, rotate_clockwise=90)
        output = self.kwargs["output_dir"]
        record = manifest["originals"][0]
        self.assertEqual((record["width"], record["height"]), (48, 64))
        self.assertEqual((record["source_width"], record["source_height"]), (64, 48))
        self.assertEqual((output / record["source_path"]).read_bytes(), source_bytes)
        self.assertNotEqual(record["sha256"], record["source_sha256"])
        self.assertEqual(record["normalization"]["rotate_clockwise_degrees"], 90)
        with Image.open(output / record["path"]) as upright:
            self.assertEqual(upright.format, "PNG")
            self.assertEqual(upright.getpixel((47, 0)), (255, 0, 0))
        request = json.loads((output / "analyze-request.json").read_text())
        validate_payload(request)
        self.assertEqual(base64.b64decode(request["images"][0]["data_base64"]),
                         (output / record["path"]).read_bytes())
        with Image.open(output / "contact-sheet.jpg") as sheet:
            # 48px-wide upright preview is centered within the first 340px cell.
            self.assertTrue(all(abs(a - b) < 10 for a, b in
                                zip(sheet.getpixel((140, 40)), (32, 36, 34))))

    def test_input_byte_budget_rejected_before_output(self):
        with patch("arkitscenes.MAX_IMAGE_BYTES", 1), self.assertRaisesRegex(ValueError, "byte limit"):
            prepare(**self.kwargs)
        with patch("arkitscenes.MAX_BUNDLE_BYTES", 1), self.assertRaisesRegex(ValueError, "100 MiB"):
            prepare(**self.kwargs)
        self.assertFalse(self.kwargs["output_dir"].exists())

    def test_cli_prepares_valid_request(self):
        main(["prepare", "--images-dir", str(self.images), "--originals", *self.kwargs["originals"],
              "--heldout", *self.kwargs["heldout"], "--video-id", "42446478",
              "--output-dir", str(self.kwargs["output_dir"]), "--source-revision", "a" * 40])
        manifest = json.loads((self.kwargs["output_dir"] / "manifest.json").read_text())
        self.assertEqual(manifest["source_revision"], "a" * 40)
        self.assertIn("not independently verified", manifest["source_revision_verification"])


if __name__ == "__main__":
    unittest.main()
