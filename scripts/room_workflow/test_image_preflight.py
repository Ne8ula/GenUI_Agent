import base64
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest

from PIL import Image, PngImagePlugin

import image_preflight as preflight


def photo(index, *, size=(48, 64), exif=None, metadata=None, fmt="PNG"):
    image = Image.new("RGB", size, (index * 23, 40, 80))
    output = io.BytesIO()
    options = {}
    if exif is not None:
        options["exif"] = exif
    if metadata is not None:
        options["pnginfo"] = metadata
    image.save(output, format=fmt, **options)
    data = output.getvalue()
    return {"id": f"photo-{index}", "sha256": hashlib.sha256(data).hexdigest(),
            "data_base64": base64.b64encode(data).decode()}


class ImageAdmissionTests(unittest.TestCase):
    def payload(self):
        return {"job_id": "room-preflight", "images": [photo(i) for i in range(5)]}

    def test_valid_report_binds_originals_without_pixels_or_metadata(self):
        payload = self.payload()
        report = preflight.inspect_originals(payload, "a" * 64)
        self.assertEqual(report["status"], "valid-original-photos")
        self.assertEqual(report["request_sha256"], "a" * 64)
        self.assertEqual([r["sha256"] for r in report["images"]],
                         [r["sha256"] for r in payload["images"]])
        self.assertEqual(set(report["images"][0]),
                         {"id", "sha256", "width", "height", "normalized_pixels_sha256"})
        self.assertNotIn("data_base64", json.dumps(report))

    def test_exif_orientation_matches_worker_dimensions(self):
        payload = self.payload()
        exif = Image.Exif()
        exif[274] = 6
        payload["images"][0] = photo(0, exif=exif, fmt="JPEG")
        report = preflight.inspect_originals(payload, "a" * 64)
        self.assertEqual((report["images"][0]["width"], report["images"][0]["height"]), (64, 48))

    def test_nonstring_job_and_ambiguous_json_rejected(self):
        payload = self.payload()
        payload["job_id"] = 123
        with self.assertRaisesRegex(ValueError, "job identity"):
            preflight.inspect_originals(payload, "a" * 64)
        with tempfile.TemporaryDirectory() as folder:
            request, output = Path(folder) / "request.json", Path(folder) / "preflight.json"
            request.write_text('{"job_id":"one","job_id":"two","images":[]}')
            with self.assertRaisesRegex(ValueError, "Duplicate JSON"):
                preflight.main(["--request", str(request), "--output", str(output)])
            self.assertFalse(output.exists())

    def test_metadata_different_identical_pixels_are_rejected(self):
        payload = self.payload()
        metadata = PngImagePlugin.PngInfo()
        metadata.add_text("Comment", "different bytes")
        duplicate = photo(0, metadata=metadata)
        duplicate["id"] = "another-photo"
        payload["images"][1] = duplicate
        with self.assertRaisesRegex(ValueError, "identical normalized"):
            preflight.inspect_originals(payload, "a" * 64)

    def test_hash_rebound_and_repeated_identity_are_rejected(self):
        for field, value in [("sha256", "b" * 64), ("id", "photo-1")]:
            with self.subTest(field=field):
                payload = self.payload()
                payload["images"][0][field] = value
                with self.assertRaises(ValueError):
                    preflight.inspect_originals(payload, "a" * 64)

    def test_truncated_real_image_rejected_before_model(self):
        payload = self.payload()
        data = base64.b64decode(payload["images"][0]["data_base64"])[:50]
        payload["images"][0].update(sha256=hashlib.sha256(data).hexdigest(),
                                    data_base64=base64.b64encode(data).decode())
        with self.assertRaises(ValueError):
            preflight.inspect_originals(payload, "a" * 64)

    def test_dimensions_aspect_and_unsupported_format_rejected(self):
        for kwargs in [{"size": (31, 64)}, {"size": (8193, 32)},
                       {"size": (32, 8192)}, {"fmt": "GIF"}]:
            with self.subTest(kwargs=kwargs):
                payload = self.payload()
                payload["images"][0] = photo(0, **kwargs)
                with self.assertRaises(ValueError):
                    preflight.inspect_originals(payload, "a" * 64)

    def test_animated_png_rejected(self):
        payload = self.payload()
        output = io.BytesIO()
        Image.new("RGB", (48, 64), "red").save(
            output, format="PNG", save_all=True,
            append_images=[Image.new("RGB", (48, 64), "blue")], duration=100, loop=0)
        data = output.getvalue()
        payload["images"][0].update(sha256=hashlib.sha256(data).hexdigest(),
                                    data_base64=base64.b64encode(data).decode())
        with self.assertRaisesRegex(ValueError, "static"):
            preflight.inspect_originals(payload, "a" * 64)

    def test_cli_preserves_source_and_refuses_existing_report(self):
        with tempfile.TemporaryDirectory() as folder:
            request, output = Path(folder) / "request.json", Path(folder) / "preflight.json"
            encoded = json.dumps(self.payload()).encode()
            request.write_bytes(encoded)
            self.assertEqual(preflight.main(["--request", str(request), "--output", str(output)]), 0)
            self.assertEqual(request.read_bytes(), encoded)
            before = output.read_bytes()
            with self.assertRaises(SystemExit):
                preflight.main(["--request", str(request), "--output", str(output)])
            self.assertEqual(output.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
