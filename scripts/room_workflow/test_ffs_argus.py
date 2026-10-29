import copy
import hashlib
import json
import importlib.util
import io
import tempfile
from pathlib import Path
import struct
import sys
import unittest
import zlib

MODULE = Path(__file__).with_name('ffs_argus.py')


def load():
    spec = importlib.util.spec_from_file_location('ffs_argus', MODULE)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def header(width, height, depth=8, colour=2):
    chunk = b'IHDR' + struct.pack('>IIBBBBB', width, height, depth, colour, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + struct.pack('>I', 13) + chunk + struct.pack('>I', zlib.crc32(chunk))


class ArgusInputTests(unittest.TestCase):
    def test_real_source_header_preserves_dimensions_without_claiming_calibration(self):
        raw = bytes.fromhex('89504e470d0a1a0a0000000d4948445200004f40000027a008020000007ce51730')
        self.assertEqual(load().panorama_header(raw), {'width': 20288, 'height': 10144,
            'projection_verified': False, 'meaning': '2:1 raster only; spherical coverage and missing regions require review'})

    def test_cropped_panorama_is_not_silently_stretched(self):
        with self.assertRaisesRegex(ValueError, '2:1'):
            load().panorama_header(header(10307, 4267))

    def test_zero_and_oversized_rasters_are_rejected_before_decode(self):
        m = load()
        for width, height in [(0, 0), (20290, 10145), (2**31, 2**30)]:
            with self.subTest(width=width), self.assertRaises(ValueError):
                m.panorama_header(header(width, height))

    def test_corruption_and_non_png_data_are_rejected(self):
        m = load()
        good = header(16, 8)
        for bad in [b'not PNG', good[:-1], good[:-1] + bytes([good[-1] ^ 1]), good + b'extra']:
            with self.subTest(data=bad), self.assertRaises(ValueError):
                m.panorama_header(bad)

    def test_unreviewed_image_encodings_are_rejected(self):
        m = load()
        for depth, colour in [(16, 2), (8, 6), (8, 0)]:
            with self.subTest(depth=depth, colour=colour), self.assertRaises(ValueError):
                m.panorama_header(header(16, 8, depth, colour))

    def test_preview_preserves_source_and_never_claims_projection_is_verified(self):
        from PIL import Image
        m = load()
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / 'source.png'
            Image.new('RGB', (64, 32), (23, 45, 67)).save(source)
            original = source.read_bytes()
            limit = Image.MAX_IMAGE_PIXELS
            report, preview = m.inspect_panorama(source)
            self.assertEqual(Image.MAX_IMAGE_PIXELS, limit)
            self.assertEqual(source.read_bytes(), original)
            self.assertEqual(report['sha256'], hashlib.sha256(original).hexdigest())
            self.assertEqual(report['bytes'], len(original))
            self.assertFalse(report['projection_verified'])
            with Image.open(io.BytesIO(preview)) as image:
                self.assertEqual((image.format, image.size), ('JPEG', (64, 32)))
            self.assertLessEqual(len(preview), 1024**2)

    def test_valid_header_without_image_pixels_is_rejected(self):
        from PIL import Image
        m = load()
        limit = Image.MAX_IMAGE_PIXELS
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / 'source.png'
            source.write_bytes(header(16, 8))
            with self.assertRaises((ValueError, OSError, SyntaxError)):
                m.inspect_panorama(source)
            self.assertEqual(Image.MAX_IMAGE_PIXELS, limit)


def reviewed_source():
    # Synthetic calibration/review only; not evidence about the FFS panorama.
    admission = {'kind': 'eva-ffs-argus-source-admission-v1', 'input_sha256': 'a' * 64,
        'argus_revision': 'a7333c0a6d1e370260ebf47ac0f8adce272f3083',
        'width': 64, 'height': 32, 'projection': 'equirectangular',
        'calibration': {'input_sha256': 'a' * 64, 'evidence_sha256': 'b' * 64,
            'pixel_origin': 'upper-left-edge', 'longitude_origin_degrees': -180,
            'latitude_origin_degrees': -90, 'horizontal_fov_degrees': 360,
            'vertical_fov_degrees': 180},
        'valid_region': {'kind': 'rectangle', 'x': 0, 'y': 0, 'width': 64, 'height': 32}}
    bind_review(admission)
    return admission


def bind_review(admission):
    body = {key: value for key, value in admission.items() if key != 'review'}
    digest = hashlib.sha256(json.dumps(body, sort_keys=True, separators=(',', ':'),
                                      allow_nan=False).encode()).hexdigest()
    admission['review'] = {'reviewer': 'owner', 'decision': 'approved', 'admission_sha256': digest}


class ArgusAdmissionTests(unittest.TestCase):
    def setUp(self):
        self.m = load()
        self.admission = reviewed_source()

    def validate(self, admission=None, digest='a' * 64):
        return self.m.validate_source_admission(self.admission if admission is None else admission, digest)

    def test_valid_synthetic_record_is_detached_and_grants_no_execution(self):
        original = copy.deepcopy(self.admission)
        from unittest.mock import patch
        with patch('urllib.request.urlopen', side_effect=AssertionError('No network')):
            result = self.validate()
        self.assertEqual(result, original)
        result['calibration']['evidence_sha256'] = 'c' * 64
        self.assertEqual(self.admission, original)
        self.assertNotIn('execution_authorized', result)

    def test_source_and_calibration_hash_changes_fail_closed(self):
        for path, value in [('input_sha256', 'c' * 64), ('calibration', 'c' * 64)]:
            candidate = copy.deepcopy(self.admission)
            if path == 'calibration':
                candidate[path]['input_sha256'] = value
            else:
                candidate[path] = value
            bind_review(candidate)
            with self.subTest(path=path), self.assertRaises(ValueError):
                self.validate(candidate)
        with self.assertRaises(ValueError):
            self.validate(digest='c' * 64)

    def test_review_binds_every_source_field_not_only_image_hash(self):
        changes = [('width', 128), ('height', 64), ('projection', 'perspective'),
                   ('argus_revision', 'c' * 40), ('calibration', {'evidence_sha256': 'c' * 64}),
                   ('valid_region', {'height': 31})]
        for key, value in changes:
            candidate = copy.deepcopy(self.admission)
            if isinstance(value, dict):
                candidate[key].update(value)
            else:
                candidate[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.validate(candidate)

    def test_rebound_unknown_projection_or_upstream_revision_is_rejected(self):
        for key, value in [('projection', 'unknown'), ('argus_revision', 'c' * 40)]:
            candidate = copy.deepcopy(self.admission)
            candidate[key] = value
            bind_review(candidate)
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.validate(candidate)

    def test_blank_band_without_calibration_or_projection_is_not_admitted(self):
        for key in ('calibration', 'projection'):
            candidate = copy.deepcopy(self.admission)
            candidate['valid_region']['height'] = 27  # 15.625% bottom band is invalid.
            del candidate[key]
            bind_review(candidate)
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.validate(candidate)

    def test_partial_valid_region_is_unsupported_even_with_review_and_calibration(self):
        for region in ({'height': 27}, {'height': 30, 'y': 1}, {'width': 63}, {'x': 1, 'width': 63}):
            candidate = copy.deepcopy(self.admission)
            candidate['valid_region'].update(region)
            bind_review(candidate)
            with self.subTest(region=region), self.assertRaisesRegex(ValueError, 'partial valid region'):
                self.validate(candidate)

    def test_mask_bounds_types_and_unknown_encodings_are_rejected(self):
        for key, values in {'x': [-1, 64, True, 0.5], 'y': [-1, 32],
                            'width': [0, 65, True], 'height': [0, 33],
                            'kind': ['polygon', 'confidence']}.items():
            for value in values:
                candidate = copy.deepcopy(self.admission)
                candidate['valid_region'][key] = value
                bind_review(candidate)
                with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                    self.validate(candidate)

    def test_dimensions_are_bounded_integral_and_uncropped(self):
        for width, height in [(0, 0), (65, 32), (20290, 10145), (64.0, 32), (True, 32)]:
            candidate = copy.deepcopy(self.admission)
            candidate.update(width=width, height=height)
            candidate['valid_region'].update(width=width, height=height)
            bind_review(candidate)
            with self.subTest(width=width, height=height), self.assertRaises(ValueError):
                self.validate(candidate)

    def test_calibration_requires_exact_spherical_mapping_and_evidence(self):
        for key, values in {'pixel_origin': ['center', None], 'longitude_origin_degrees': [0, True],
                            'latitude_origin_degrees': [0, -89], 'horizontal_fov_degrees': [180, '360'],
                            'vertical_fov_degrees': [150], 'evidence_sha256': ['', 'unknown']}.items():
            for value in values:
                candidate = copy.deepcopy(self.admission)
                candidate['calibration'][key] = value
                bind_review(candidate)
                with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                    self.validate(candidate)
        for value in (float('inf'), float('-inf'), float('nan')):
            candidate = copy.deepcopy(self.admission)
            candidate['calibration']['vertical_fov_degrees'] = value
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.validate(candidate)

    def test_owner_review_must_be_approved_and_hash_bound(self):
        for key, value in [('reviewer', 'model'), ('decision', 'pending'), ('decision', 'revoked'),
                           ('admission_sha256', 'c' * 64)]:
            candidate = copy.deepcopy(self.admission)
            candidate['review'][key] = value
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                self.validate(candidate)

    def test_unknown_fields_and_missing_nested_fields_are_rejected(self):
        for container in (None, 'calibration', 'valid_region', 'review'):
            candidate = copy.deepcopy(self.admission)
            target = candidate if container is None else candidate[container]
            target['execution_authorized'] = True
            if container != 'review':
                bind_review(candidate)
            with self.subTest(container=container), self.assertRaises(ValueError):
                self.validate(candidate)
        for container in ('calibration', 'valid_region', 'review'):
            for key in self.admission[container]:
                candidate = copy.deepcopy(self.admission)
                del candidate[container][key]
                with self.subTest(container=container, key=key), self.assertRaises(ValueError):
                    self.validate(candidate)

    def test_malformed_records_and_hashes_raise_value_error(self):
        for bad in (None, [], 'admitted', True):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                self.m.validate_source_admission(bad, 'a' * 64)
        for key in ('calibration', 'valid_region', 'review'):
            for bad in (None, [], True):
                candidate = copy.deepcopy(self.admission)
                candidate[key] = bad
                with self.subTest(key=key, bad=bad), self.assertRaises(ValueError):
                    self.validate(candidate)
        for bad in ('A' * 64, 'a' * 63, 'a' * 64 + '\n', None, True):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                self.validate(digest=bad)


class ArgusPaddingTests(unittest.TestCase):
    def test_native_region_report_precedes_preview_resizing_and_preserves_source(self):
        from PIL import Image
        m = load()
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / 'source.png'
            image = Image.new('RGB', (4096, 2048), (23, 45, 67))
            image.paste((255, 255, 255), (0, 2028, 4096, 2048))
            image.save(source)
            original = source.read_bytes()
            report, preview = m.inspect_panorama(source, regions=True)
            self.assertEqual(report['padding']['candidate_padding_rows'], [2028, 2048])
            self.assertEqual(report['padding']['width'], 4096)
            self.assertEqual(report['sha256'], hashlib.sha256(original).hexdigest())
            self.assertEqual(source.read_bytes(), original)
            with Image.open(io.BytesIO(preview)) as small:
                self.assertEqual(small.size, (2048, 1024))

    def test_native_padding_is_a_candidate_not_calibration_or_a_floor(self):
        from PIL import Image
        image = Image.new('RGB', (64, 32), (23, 45, 67))
        image.paste((255, 255, 255), (0, 27, 64, 32))
        original = image.tobytes()
        report = load().inspect_padding(image)
        self.assertEqual(report['candidate_padding_rows'], [27, 32])
        self.assertEqual(report['unclassified_rows'], [0, 27])
        self.assertFalse(report['projection_verified'])
        self.assertFalse(report['source_admitted'])
        self.assertEqual(report['unsupported_geometry'], 'unknown; no geometry emitted')
        self.assertEqual(image.tobytes(), original)

    def test_white_interior_and_near_white_rows_are_not_silently_masked(self):
        from PIL import Image
        image = Image.new('RGB', (64, 32), (250, 250, 250))
        image.paste((255, 255, 255), (0, 10, 64, 12))
        image.paste((255, 255, 255), (0, 28, 64, 32))
        image.putpixel((31, 28), (255, 255, 254))
        report = load().inspect_padding(image)
        self.assertEqual(report['candidate_padding_rows'], [29, 32])
        self.assertEqual(report['unclassified_rows'], [0, 29])
        self.assertFalse(report['source_admitted'])

    def test_no_padding_and_all_white_never_imply_a_valid_source(self):
        from PIL import Image
        for colour, padding, unclassified in [((1, 2, 3), None, [0, 32]),
                                               ((255, 255, 255), [0, 32], None)]:
            with self.subTest(colour=colour):
                report = load().inspect_padding(Image.new('RGB', (64, 32), colour))
                self.assertEqual(report['candidate_padding_rows'], padding)
                self.assertEqual(report['unclassified_rows'], unclassified)
                self.assertFalse(report['source_admitted'])
                self.assertFalse(report['projection_verified'])

    def test_padding_inspection_rejects_wrong_mode_shape_and_oversized_header(self):
        from PIL import Image
        m = load()
        for image in (Image.new('RGBA', (64, 32)), Image.new('RGB', (63, 32))):
            with self.subTest(mode=image.mode, size=image.size), self.assertRaises(ValueError):
                m.inspect_padding(image)
        # Valid PNG container with an oversized IHDR; never allocate its declared pixels.
        from unittest.mock import patch
        png = io.BytesIO()
        Image.new('RGB', (64, 32)).save(png, 'PNG')
        data = header(20290, 10145) + png.getvalue()[33:]
        with patch.object(Image, 'MAX_IMAGE_PIXELS', None), Image.open(io.BytesIO(data)) as image:
            with self.assertRaisesRegex(ValueError, 'bound'):
                m.inspect_padding(image)


class ArgusCropTests(unittest.TestCase):
    def test_bottom_crop_preserves_full_grid_and_original_top_offset(self):
        proposal = load().plan_bottom_crop(560, [0, 467])
        self.assertEqual(proposal['full_grid'], [560, 280])
        self.assertEqual(proposal['crop_rows'], [42, 224])
        self.assertEqual(proposal['native_row_footprint'], [84, 448])
        self.assertEqual(proposal['unknown_grid_rows'], [[0, 42], [224, 280]])
        self.assertFalse(proposal['source_admitted'])

    def test_full_valid_rectangle_retains_upstream_default_crop(self):
        proposal = load().plan_bottom_crop(560, [0, 560])
        self.assertEqual(proposal['crop_rows'], [42, 238])
        self.assertEqual(proposal['native_row_footprint'], [84, 476])

    def test_area_resize_footprint_must_be_wholly_inside_declared_rows(self):
        m = load()
        # Row 224's boundary is 448.8 at height 561; native stop 448 is unsafe.
        self.assertEqual(m.plan_bottom_crop(561, [84, 448])['crop_rows'], [42, 210])
        proposal = m.plan_bottom_crop(561, [84, 449])
        self.assertEqual(proposal['crop_rows'], [42, 224])
        self.assertEqual(proposal['native_row_footprint'], [84, 449])
        with self.assertRaises(ValueError):
            m.plan_bottom_crop(561, [85, 449])

    @unittest.skipUnless(importlib.util.find_spec('cv2'), 'OpenCV is needed for the resampling check')
    def test_actual_area_resize_keeps_invalid_pixels_out_of_proposed_crop(self):
        import cv2
        import numpy as np
        m = load()
        for bottom in (448, 449):
            image = np.zeros((561, 1122, 3), dtype=np.uint8)
            image[:84] = 255
            image[bottom:] = 255
            resized = cv2.resize(image, (560, 280), interpolation=cv2.INTER_AREA)
            start, stop = m.plan_bottom_crop(561, [84, bottom])['crop_rows']
            self.assertFalse(resized[start:stop].any())
            self.assertTrue(resized[224:].any())

    def test_no_complete_patch_and_malformed_bounds_fail_closed(self):
        m = load()
        for height, rows in [(560, [0, 111]), (560, [85, 560]), (560, [0, 561]),
                             (560, [-1, 560]), (560, [0, True]), (560, [0, 448.0]),
                             (560, None), (560, [0, 448, 560]), (279, [0, 279]),
                             (10145, [0, 10145]), (560.0, [0, 560])]:
            with self.subTest(height=height, rows=rows), self.assertRaises(ValueError):
                m.plan_bottom_crop(height, rows)


if __name__ == '__main__':
    unittest.main()
