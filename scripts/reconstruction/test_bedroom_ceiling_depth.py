"""Synthetic-only tests. Run with -I and explicit reviewed-module bootstrap."""
from contextlib import nullcontext
import copy
import io
import stat
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
import zipfile

import numpy as np
from PIL import Image

import bedroom_ceiling_depth as depth
import bedroom_ceiling_modal as runner


def png(array):
    output = io.BytesIO()
    Image.fromarray(array).save(output, format="PNG")
    return output.getvalue()


def fixture():
    yy, xx = np.indices((512, 512))
    inv = .5 + .04 * ((xx + .5 - 256) / 256) - .025 * ((yy + .5 - 256) / 256)
    plane = 1 / inv
    bump = np.maximum(0, 1 - ((xx-221)/34)**2 - ((yy-236)/43)**2)
    source = (plane - .24 * bump).astype("<f4")
    relative = np.clip(100 + .045*xx - .025*yy + 65*bump, 0, 255).astype("uint8")
    relative816 = np.array(Image.fromarray(relative).resize((816, 816), Image.Resampling.BILINEAR))
    files = {"source.png": png(np.full((512, 512, 3), 80, dtype="uint8")),
             "source-depth.bin": source.tobytes(),
             "repaired.png": png(np.full((816, 816, 3), 120, dtype="uint8")),
             "relative-depth.png": png(relative816)}
    manifest = {"version": 1, "source_mesh_sha256": depth.SOURCE_SHA256,
        "view": {"id": "ceiling", "width": 512, "height": 512, "near": .025, "far": 40,
                 "K": [[256, 0, 256], [0, 256, 256], [0, 0, 1]], "world_from_cv": np.eye(4).tolist()},
        "roi": [165, 175, 115, 130], "relative_depth": dict(depth.RELATIVE_METADATA),
        "files": {name: {"sha256": depth.digest(data), "bytes": len(data)} for name, data in files.items()}}
    files["manifest.json"] = depth.json_bytes(manifest)
    return manifest, files, plane


class CeilingTests(unittest.TestCase):
    def setUp(self):
        self.manifest, self.files, self.plane = fixture()

    def test_admission_roundtrip_hashes_and_strict_metadata(self):
        payload = depth.pack(self.files)
        m, arrays = depth.admit(payload)
        self.assertEqual(m, self.manifest)
        self.assertEqual(arrays["relative"].shape, (512, 512))
        for mutation in (lambda m: m.update(authority="yes"),
                         lambda m: m.update(source_mesh_sha256="0"*64),
                         lambda m: m.update(roi=[0, 0, 512, 512]),
                         lambda m: m["relative_depth"].update(polarity="brighter-farther"),
                         lambda m: m["view"].update(width=True),
                         lambda m: m["view"].update(world_from_cv=(np.eye(4)*2).tolist()),
                         lambda m: m["files"]["source.png"].update(sha256="0"*64)):
            m = copy.deepcopy(self.manifest)
            mutation(m)
            with self.assertRaises(ValueError):
                depth.admit(depth.pack({**self.files, "manifest.json": depth.json_bytes(m)}))

    def test_unsafe_archive_nonfinite_and_wrong_raster_rejected(self):
        for name in ("../payload.py", "payload.py", "source/extra.png"):
            with self.assertRaises(ValueError):
                depth.admit(depth.pack({**self.files, name: b"not executed"}))
        files = dict(self.files)
        files["source-depth.bin"] = np.full((512, 512), np.nan, dtype="<f4").tobytes()
        m = copy.deepcopy(self.manifest)
        m["files"]["source-depth.bin"]["sha256"] = depth.digest(files["source-depth.bin"])
        files["manifest.json"] = depth.json_bytes(m)
        with self.assertRaises(ValueError):
            depth.admit(depth.pack(files))
        with patch.object(depth, "MAX_INPUT", 10), self.assertRaises(ValueError):
            depth.admit(b"0"*11)
        with self.assertRaises(ValueError):
            depth.parse_json(b'{"a":1,"a":2}')

    def test_wrong_png_mode_size_symlink_and_expansion_limits(self):
        for image in (np.zeros((816, 816, 3), dtype="uint8"), np.zeros((512, 512), dtype="uint8")):
            files = dict(self.files)
            files["relative-depth.png"] = png(image)
            m = copy.deepcopy(self.manifest)
            m["files"]["relative-depth.png"] = {"sha256": depth.digest(files["relative-depth.png"]), "bytes": len(files["relative-depth.png"])}
            files["manifest.json"] = depth.json_bytes(m)
            with self.assertRaises(ValueError):
                depth.admit(depth.pack(files))
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w") as archive:
            for name, data in self.files.items():
                entry = zipfile.ZipInfo(name)
                if name == "source.png":
                    entry.external_attr = (stat.S_IFLNK | 0o777) << 16
                archive.writestr(entry, data)
        with self.assertRaises(ValueError):
            depth.admit(output.getvalue())
        with patch.object(depth, "MAX_EXTRACTED", 1024), self.assertRaises(ValueError):
            depth.admit(depth.pack(self.files))

    def test_corner_touching_holes_produce_a_closed_unpinched_fixture(self):
        active = np.zeros((512, 512), dtype=bool)
        active[190:240, 190:240] = True
        active[213, 213] = active[215, 215] = False
        rgb = np.full((512, 512, 3), 120, dtype='uint8')
        vertices, faces, _, report = depth.closed_mesh(self.plane-.2, self.plane, active, self.manifest['view'], rgb)
        self.assertGreater(depth.validate_closed_mesh(vertices, faces), 0)
        self.assertGreater(report['discarded_footprint_cells'], 0)

    def test_invalid_closed_mesh_is_rejected(self):
        points = np.array([[0., 0, 0], [1, 0, 0], [0, 1, 0]])
        with self.assertRaises(ValueError):
            depth.validate_closed_mesh(points, np.array([[0, 1, 2]]))
        with self.assertRaises(ValueError):
            depth.validate_closed_mesh(points, np.array([[0, 0, 2]]))

    def test_oblique_plane_fit_with_gross_outliers_and_three_sides(self):
        _, arrays = depth.admit(depth.pack(self.files))
        source = arrays["source_depth"].copy()
        source[305:337, 165:280] = 0  # No lower-ring support.
        rng = np.random.default_rng(4)
        ring = depth.ring_mask()
        selected = rng.choice(np.flatnonzero(ring), 1800, replace=False)
        source.ravel()[selected] = 4.5
        plane, mask, report = depth.fit_source_plane(source, self.manifest["view"])
        np.testing.assert_allclose(plane[175:305, 165:280], self.plane[175:305, 165:280], atol=2e-5)
        self.assertGreaterEqual(report["supported_sides"], 3)
        self.assertGreater(report["rejected_ring_samples"], 1000)

    def test_insufficient_or_two_sided_support_fails_closed(self):
        _, arrays = depth.admit(depth.pack(self.files))
        source = arrays["source_depth"].copy()
        source[:175] = 0
        source[305:] = 0
        with self.assertRaises(ValueError):
            depth.fit_source_plane(source, self.manifest["view"])
        with self.assertRaises(ValueError):
            depth.fit_source_plane(np.zeros((512, 512)), self.manifest["view"])

    def test_missing_relief_calibration_and_flat_external_map_rejected(self):
        _, arrays = depth.admit(depth.pack(self.files))
        arrays["source_depth"] = self.plane.astype("<f4")
        with self.assertRaisesRegex(ValueError, "fragment"):
            depth.reconstruct(self.manifest, arrays)
        _, arrays = depth.admit(depth.pack(self.files))
        arrays["relative"][:] = .5
        with self.assertRaises(ValueError):
            depth.reconstruct(self.manifest, arrays)

    def test_patch_is_closed_inferred_roi_only_and_inputs_unchanged(self):
        _, arrays = depth.admit(depth.pack(self.files))
        source = arrays["source_depth"].copy()
        vertices, faces, colors, report, maps = depth.reconstruct(self.manifest, arrays)
        np.testing.assert_array_equal(source, arrays["source_depth"])
        self.assertGreater(len(faces), 200)
        self.assertEqual(report["face_provenance"], "all-inferred-artistic-completion")
        self.assertFalse(report["authored_fallback_used"])
        self.assertEqual(report["presentation_hide"]["roi"], [165, 175, 115, 130])
        camera = vertices  # Fixture pose is identity.
        uv = camera @ np.asarray(self.manifest["view"]["K"]).T
        uv = uv[:, :2] / uv[:, 2:]
        self.assertTrue(((uv >= [165, 175]) & (uv < [280, 305])).all())
        edges = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]])
        _, counts = np.unique(np.sort(edges, axis=1), axis=0, return_counts=True)
        self.assertTrue((counts == 2).all())
        self.assertGreater(report["closed_volume_scan_units_cubed"], 0)
        self.assertGreater(report["calibration"]["relief_q95_scan_units"], .15)
        self.assertLess(report["calibration"]["relief_q95_scan_units"], .3)
        self.assertEqual(colors.shape, vertices.shape)
        self.assertTrue((maps["relief"][:175] == 0).all())

    def test_rotated_translated_pose_preserves_camera_projection(self):
        m = copy.deepcopy(self.manifest)
        pose = np.array([[0, 0, 1, 1], [0, 1, 0, 2], [-1, 0, 0, 3], [0, 0, 0, 1]], dtype=float)
        m["view"]["world_from_cv"] = pose.tolist()
        _, arrays = depth.admit(depth.pack(self.files))
        v, f, _, report, _ = depth.reconstruct(m, arrays)
        local = (v - pose[:3, 3]) @ pose[:3, :3]
        self.assertTrue((local[:, 2] > .025).all())
        self.assertGreater(report["closed_volume_scan_units_cubed"], 0)
        np.testing.assert_array_equal(report["patch_bbox"], [v.min(0), v.max(0)])
        self.assertEqual(report["camera"], m["view"])
        self.assertEqual(report["roi"], depth.ROI)
        self.assertTrue(report["presentation_hide"]["requires_roi_projection_check"])
        back = v[len(v)//2:]
        equation = np.asarray(report["fitted_plane_world"])
        np.testing.assert_allclose(back @ equation[:3] + equation[3], 0, atol=1e-6)

    def test_end_to_end_synthetic_evidence_and_exclusive_output(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "candidate"
            payload = depth.pack(self.files)
            result = depth.complete(payload, root)
            for name in ("ceiling-patch.ply", "report.json", "source-512.png", "source-depth-512.bin", "relative-depth-512.png", "repaired-512.png"):
                self.assertTrue((root/name).is_file(), name)
            self.assertEqual(result["status"], "inferred-ceiling-patch-awaiting-review")
            with self.assertRaises(FileExistsError):
                depth.complete(payload, root)


class RouteTests(unittest.TestCase):
    def test_total_resource_deadline_and_cached_image_reuse(self):
        self.assertLessEqual(runner.RESOURCES["timeout"] + runner.RESOURCES["startup_timeout"], 900)
        self.assertNotIn("gpu", runner.RESOURCES)
        self.assertEqual(runner.RESOURCES["retries"], 0)
        app, image = Mock(), Mock()
        image.add_local_file.return_value = image
        modal = SimpleNamespace(App=Mock(return_value=app), Volume=SimpleNamespace(from_name=Mock(return_value="results")))
        with patch("genrc_modal.image_spec", return_value=image) as existing:
            runner.create_job(modal)
        existing.assert_called_once_with(modal)
        self.assertNotIn("gpu", app.function.call_args.kwargs)
        self.assertEqual(app.function.call_args.kwargs["volumes"], {"/results": "results"})

    def test_plan_path_changes_cannot_reset_fixed_attempt_receipt(self):
        _, files, _ = fixture()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root/"input.zip"
            source.write_bytes(depth.pack(files))
            with patch.object(runner, "ATTEMPT_RECEIPT", root/"fixed-attempt.json"):
                common = ["--input", str(source)]
                with patch.dict("sys.modules", {"modal": None}):
                    runner.main(common + ["--dry-run", "--output", str(root/"plan-a")])
                    runner.main(common + ["--dry-run", "--output", str(root/"plan-b")])
                with patch.dict("sys.modules", {"modal": SimpleNamespace()}), patch.object(runner, "run", side_effect=RuntimeError("synthetic")) as run:
                    with self.assertRaises(RuntimeError):
                        runner.main(common + ["--confirm-billable", "--plan", str(root/"plan-a/plan.json"), "--output", str(root/"attempt-a")])
                    with self.assertRaises(FileExistsError):
                        runner.main(common + ["--confirm-billable", "--plan", str(root/"plan-b/plan.json"), "--output", str(root/"attempt-b")])
                    self.assertEqual(run.call_count, 1)
                self.assertEqual(depth.parse_json((root/"fixed-attempt.json").read_bytes())["status"], "failed-or-uncertain")

    def test_cancel_and_owned_stop_even_for_uncertain_spawn(self):
        for error, spawn_error in ((KeyboardInterrupt(), False), (TimeoutError(), False), (RuntimeError(), True)):
            app = SimpleNamespace(app_id="ap-"+"a"*22, run=lambda: nullcontext())
            call = Mock(object_id="synthetic-call")
            call.get.side_effect = error
            fn = Mock()
            fn.spawn.side_effect = error if spawn_error else None
            fn.spawn.return_value = call
            modal = SimpleNamespace(enable_output=lambda: nullcontext())
            stop = Mock(return_value={"state": "stopped", "tasks": 0})
            with tempfile.TemporaryDirectory() as temp, patch.object(runner, "create_job", return_value=(app, fn, Mock())):
                receipt = {"run_id": "a"*32}
                with self.assertRaises(type(error)):
                    runner.run(modal, b"input", {"input_sha256": depth.digest(b"input")}, Path(temp), receipt, lambda: None, stop)
                stop.assert_called_once_with(app.app_id)
                self.assertEqual(receipt["cleanup"]["tasks"], 0)
                if not spawn_error:
                    call.cancel.assert_called_once_with(terminate_containers=True)

    def test_receipt_write_failure_before_spawn_still_stops_owned_app(self):
        app = SimpleNamespace(app_id="ap-"+"a"*22, run=lambda: nullcontext())
        modal = SimpleNamespace(enable_output=lambda: nullcontext())
        fn, stop = Mock(), Mock(return_value={"state": "stopped", "tasks": 0})
        with tempfile.TemporaryDirectory() as temp, patch.object(runner, "create_job", return_value=(app, fn, Mock())):
            with self.assertRaises(OSError):
                runner.run(modal, b"input", {}, Path(temp), {"run_id": "a"*32}, Mock(side_effect=OSError("disk full")), stop)
            fn.spawn.assert_not_called()
            stop.assert_called_once_with(app.app_id)

    def test_success_needs_hash_bound_summary_and_confirmed_cleanup(self):
        payload, artifact = b"input", b"output"
        app = SimpleNamespace(app_id="ap-"+"a"*22, run=lambda: nullcontext())
        modal = SimpleNamespace(enable_output=lambda: nullcontext())
        summary = {"run_id": "a"*32, "input_sha256": depth.digest(payload), "status": "inferred-ceiling-patch-awaiting-review",
            "artifact_bytes": len(artifact), "artifact_sha256": depth.digest(artifact)}
        for stop_error in (None, RuntimeError("stop unconfirmed")):
            call, fn, volume = Mock(object_id="synthetic-call"), Mock(), Mock()
            call.get.return_value = summary
            fn.spawn.return_value = call
            volume.read_file.return_value = iter([artifact])
            stop = Mock(return_value={"state": "stopped", "tasks": 0}, side_effect=stop_error)
            with tempfile.TemporaryDirectory() as temp, patch.object(runner, "create_job", return_value=(app, fn, volume)):
                receipt = {"run_id": "a"*32}
                if stop_error:
                    with self.assertRaises(RuntimeError):
                        runner.run(modal, payload, {"input_sha256": depth.digest(payload)}, Path(temp), receipt, lambda: None, stop)
                    self.assertEqual(receipt["status"], "failed-or-uncertain")
                else:
                    runner.run(modal, payload, {"input_sha256": depth.digest(payload)}, Path(temp), receipt, lambda: None, stop)
                    self.assertEqual(receipt["status"], "inferred-ceiling-patch-awaiting-review")
                self.assertEqual((Path(temp)/"artifacts.zip").read_bytes(), artifact)
                stop.assert_called_once_with(app.app_id)

    def test_output_transport_rejects_hash_size_and_retains_partial(self):
        data = b"artifact"
        receipt = {"artifact_bytes": len(data), "artifact_sha256": depth.digest(data)}
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp)/"partial.zip"
            with self.assertRaises(ValueError):
                runner.receive(iter([data[:2]]), target, receipt)
            self.assertEqual(target.read_bytes(), data[:2])
            with self.assertRaises(ValueError):
                runner.receive(iter([data, b"extra"]), Path(temp)/"over.zip", receipt)


if __name__ == "__main__":
    unittest.main()
