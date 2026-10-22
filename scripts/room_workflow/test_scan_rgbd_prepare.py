"""Bounded archive metadata and calibration checks against synthetic fixtures."""
import hashlib
import importlib.util
import json
import io

import numpy as np
from PIL import Image
from pathlib import Path
import stat
import struct
import tempfile
import unittest
from unittest.mock import patch
import zipfile

prepare = None
if importlib.util.find_spec('scan_rgbd_prepare'):
    import scan_rgbd_prepare as prepare


class ArchiveMetadataTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(prepare, 'Bounded RGB-D preparation is not implemented')
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)

    def archive(self, entries):
        path = self.root/'source.zip'
        with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED) as output:
            for name, data in entries:
                output.writestr(name, data)
        data = path.read_bytes()
        return path, {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

    def test_directory_inspection_returns_metadata_without_extracting_files(self):
        path, binding = self.archive([('lowres_depth/45261631_1.000.png', b'fixture')])
        members = prepare.archive_members(path, binding)
        self.assertEqual(len(members), 1)
        self.assertEqual(members[0]['name'], 'lowres_depth/45261631_1.000.png')
        self.assertEqual(members[0]['bytes'], 7)
        self.assertEqual(list(self.root.iterdir()), [path])

    def test_changed_archive_bytes_reject_before_directory_parse(self):
        path, binding = self.archive([('lowres_depth/45261631_1.000.png', b'fixture')])
        path.write_bytes(path.read_bytes()+b'changed')
        with self.assertRaises(ValueError):
            prepare.archive_members(path, binding)

    def test_unsafe_paths_duplicate_names_and_links_reject(self):
        link = zipfile.ZipInfo('lowres_depth/link')
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        for entries in [[('../escape', b'x')], [('/absolute', b'x')], [('C:/drive', b'x')],
                        [('lowres_depth/file:stream', b'x')], [('lowres_depth/é.png', b'x')],
                        [('lowres_depth/CON.png', b'x')], [('lowres_depth/trailing. ', b'x')],
                        [('lowres_depth//', b'')], [('lowres_depth/a', b'x'), ('lowres_depth/a/b', b'y')],
                        [('lowres_depth/A.png', b'x'), ('lowres_depth/a.png', b'y')], [(link, b'target')]]:
            with self.subTest(entries=str(entries)):
                path, binding = self.archive(entries)
                with self.assertRaises(ValueError):
                    prepare.archive_members(path, binding)

    def test_member_size_limit_rejects_without_inflation(self):
        path, binding = self.archive([('lowres_depth/huge.png', b'x'*(4*1024**2+1))])
        with self.assertRaises(ValueError):
            prepare.archive_members(path, binding)

    def test_unsupported_flags_methods_offsets_and_trailing_directory_data_reject(self):
        for kind in ('encrypted', 'descriptor', 'method', 'offset', 'overlap', 'trailing', 'backslash'):
            with self.subTest(kind=kind):
                path, _ = self.archive([('lowres_depth/a.png', b'x'), ('lowres_depth/b.png', b'y')])
                data = bytearray(path.read_bytes())
                central = data.find(b'PK\x01\x02')
                eocd = data.rfind(b'PK\x05\x06')
                if kind in ('encrypted', 'descriptor'):
                    struct.pack_into('<H', data, central+8, 1 if kind == 'encrypted' else 8)
                elif kind == 'method':
                    struct.pack_into('<H', data, central+10, 12)
                elif kind == 'offset':
                    struct.pack_into('<I', data, central+42, central)
                elif kind == 'overlap':
                    second = data.find(b'PK\x01\x02', central+46)
                    struct.pack_into('<I', data, second+42, 0)
                elif kind == 'backslash':
                    # ZipFile normalizes backslashes on Windows; mutate the encoded directory instead.
                    data[central+46+len('lowres_depth')] = 92
                else:
                    size = struct.unpack_from('<I', data, eocd+12)[0]
                    data[eocd:eocd] = b'?'
                    struct.pack_into('<I', data, eocd+1+12, size+1)
                path.write_bytes(data)
                binding = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
                with self.assertRaises(ValueError):
                    prepare.archive_members(path, binding)

    def test_zip64_extra_field_rejects(self):
        member = zipfile.ZipInfo('lowres_depth/frame.png')
        member.extra = struct.pack('<HH', 1, 0)
        path, binding = self.archive([(member, b'x')])
        with self.assertRaisesRegex(ValueError, 'ZIP64'):
            prepare.archive_members(path, binding)

    def test_directory_bounds_are_checked_before_member_parsing(self):
        for field, value in [('count', 20001), ('directory_bytes', 8*1024**2+1), ('disk', 1), ('zip64', 65535)]:
            path, _ = self.archive([('lowres_depth/frame.png', b'x')])
            data = bytearray(path.read_bytes())
            eocd = data.rfind(b'PK\x05\x06')
            if field in ('count', 'zip64'):
                struct.pack_into('<HH', data, eocd+8, value, value)
            elif field == 'directory_bytes':
                struct.pack_into('<I', data, eocd+12, value)
            else:
                struct.pack_into('<H', data, eocd+4, value)
            path.write_bytes(data)
            binding = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
            with patch.object(prepare, '_safe_name', side_effect=AssertionError('parsed before directory admission')), \
                    self.assertRaises(ValueError):
                prepare.archive_members(path, binding)


class SelectionTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(hasattr(prepare, 'inspect_directories'), 'Missing metadata selector')
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)

    def inputs(self, times=('1.000', '2.000', '3.000', '4.000', '5.000', '6.000')):
        assets = {}
        for role, folder, suffix in [('depth', 'lowres_depth', 'png'), ('confidence', 'confidence', 'png'),
                ('depth-intrinsics', 'lowres_wide_intrinsics', 'pincam'),
                ('rgb-intrinsics', 'vga_wide_intrinsics', 'pincam')]:
            path = self.root/(role+'.zip')
            with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
                for time in times:
                    archive.writestr(f'{folder}/45261631_{time}.{suffix}', b'fixture')
            data = path.read_bytes()
            assets[role] = {'file': path, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
        return {'assets': assets, 'manifests': {}, 'rgb': {'originals': [
            {'id': f'view{i}', 'source_filename': f'45261631_{i+1}.000.png'} for i in range(6)]}}

    def test_six_view_selection_is_metadata_only_and_binds_each_member(self):
        inputs = self.inputs()
        report = prepare.inspect_directories(inputs)
        self.assertEqual(report['status'], 'selected-not-decoded')
        self.assertEqual(len(report['views']), 6)
        self.assertEqual(len(report['views'][0]['members']), 4)
        self.assertEqual(report['views'][0]['members']['depth']['name'], 'lowres_depth/45261631_1.000.png')
        self.assertEqual(report['selected_bytes'], 24*9)
        self.assertFalse(report['source_admitted'])

    def test_missing_and_equidistant_members_are_reported_not_guessed(self):
        for times in [('1.010', '2.000'), ('0.999', '1.001', '2.000')]:
            with self.subTest(times=times):
                report = prepare.inspect_directories(self.inputs(times))
                self.assertEqual(report['status'], 'blocked')
                self.assertTrue(report['views'][0]['rejections'])
                self.assertIsNone(report['views'][0]['members']['depth'])

    def test_real_timestamp_ties_and_five_millisecond_boundary(self):
        for target, times, selected in [('56036.800', ('56036.799', '56036.801'), False),
                                        ('56036.804', ('56036.809',), True),
                                        ('56036.835', ('56036.830',), True)]:
            with self.subTest(target=target, times=times):
                inputs = self.inputs(times)
                inputs['rgb']['originals'][0]['source_filename'] = f'45261631_{target}.png'
                member = prepare.inspect_directories(inputs)['views'][0]['members']['depth']
                self.assertEqual(member is not None, selected)
                if selected:
                    self.assertIn(member['delta_seconds'], (-.005, .005))

    def test_selected_budget_bounds_compressed_and_expanded_payload(self):
        inputs = self.inputs()
        entries = {asset['file']: prepare.archive_members(asset['file'], asset)
                   for asset in inputs['assets'].values()}
        for members in entries.values():
            for member in members:
                member.update(bytes=1300000, expanded_bytes=1300000, compressed_bytes=1400000)
        with patch.object(prepare, 'archive_members', side_effect=lambda path, _: entries[path]), \
                self.assertRaisesRegex(ValueError, '32 MiB'):
            prepare.inspect_directories(inputs)

    def test_loaded_asset_paths_match_both_acquisition_writer_layouts(self):
        inputs = self.inputs()
        manifests = {'pilot-rgb-six-v1': inputs['rgb'], 'scan-source-v1': {'assets': []},
                     'scan-rgbd-source-v1': {'assets': []}}
        for role, asset in inputs['assets'].items():
            folder = 'scan-rgbd-source-v1' if role in ('depth', 'confidence') else 'scan-source-v1'
            target = self.root/folder/role/asset['file'].name
            target.parent.mkdir(parents=True)
            target.write_bytes(asset['file'].read_bytes())
            manifests[folder]['assets'].append({'role': role, 'bytes': asset['bytes'], 'sha256': asset['sha256'],
                'path': role+'/'+target.name if folder == 'scan-rgbd-source-v1' else target.name})
        pins = {}
        for folder, manifest in manifests.items():
            path = self.root/folder/'manifest.json'
            path.parent.mkdir(exist_ok=True)
            raw = json.dumps(manifest).encode()
            path.write_bytes(raw)
            pins[folder] = hashlib.sha256(raw).hexdigest()
        with patch.object(prepare, 'DATA_ROOT', self.root), patch.object(prepare, 'MANIFESTS', pins):
            loaded = prepare.load_inputs()
            for asset in loaded['assets'].values():
                self.assertTrue(asset['file'].is_file(), str(asset['file']))
            report = prepare.run_stage('directory', self.root/'scan-rgbd-source-v1/manifest.json',
                                       self.root/'scan-rgbd-directory-v1')
            self.assertEqual(report['status'], 'selected-not-decoded')

    def test_fixed_operator_rejects_alternate_output_without_reading_sources(self):
        self.assertTrue(hasattr(prepare, 'run_stage'), 'Missing fixed local operator')
        with patch.object(prepare, 'load_inputs', side_effect=AssertionError('read before admission')), \
                self.assertRaises(ValueError):
            prepare.run_stage('directory', self.root/'manifest.json', self.root/'out')
        self.assertFalse((self.root/'out').exists())

    def test_fixed_stage_writes_exact_selection_and_rejects_replay(self):
        inputs = self.inputs()
        with patch.object(prepare, 'DATA_ROOT', self.root), patch.object(prepare, 'load_inputs', return_value=inputs):
            source = self.root/'scan-rgbd-source-v1/manifest.json'
            output = self.root/'scan-rgbd-directory-v1'
            report = prepare.run_stage('directory', source, output)
            self.assertEqual(json.loads((output/'manifest.json').read_bytes()), report)
            self.assertEqual(report['status'], 'selected-not-decoded')
            with self.assertRaises(FileExistsError):
                prepare.run_stage('directory', source, output)

    def test_changed_first_archive_at_final_binding_check_leaves_no_manifest(self):
        inputs = self.inputs()
        calls = 0
        def load():
            nonlocal calls
            calls += 1
            if calls == 2:
                inputs['assets']['depth']['file'].write_bytes(b'changed')
            return inputs
        with patch.object(prepare, 'DATA_ROOT', self.root), patch.object(prepare, 'load_inputs', side_effect=load):
            output = self.root/'scan-rgbd-directory-v1'
            with self.assertRaises(ValueError):
                prepare.run_stage('directory', self.root/'scan-rgbd-source-v1/manifest.json', output)
            self.assertFalse((output/'manifest.json').exists())

    def test_manifest_byte_pin_rejects_before_archive_access(self):
        folder = self.root/'pilot-rgb-six-v1'
        folder.mkdir()
        (folder/'manifest.json').write_bytes(b'{}')
        with patch.object(prepare, 'DATA_ROOT', self.root), self.assertRaisesRegex(ValueError, 'manifest changed'):
            prepare.load_inputs()

    def test_attempt_journal_survives_failure_and_replay_is_rejected(self):
        self.assertTrue(hasattr(prepare, 'run_stage'), 'Missing fixed local operator')
        with patch.object(prepare, 'DATA_ROOT', self.root), \
                patch.object(prepare, 'load_inputs', side_effect=ValueError('changed binding')):
            source = self.root/'scan-rgbd-source-v1/manifest.json'
            output = self.root/'scan-rgbd-directory-v1'
            with self.assertRaisesRegex(ValueError, 'changed binding'):
                prepare.run_stage('directory', source, output)
            journal = (output/'preparation.jsonl').read_bytes()
            self.assertEqual([json.loads(row)['event'] for row in journal.splitlines()], ['started', 'failed'])
            self.assertFalse((output/'manifest.json').exists())
            with self.assertRaises(FileExistsError):
                prepare.run_stage('directory', source, output)
            self.assertEqual((output/'preparation.jsonl').read_bytes(), journal)


def png(array):
    buffer = io.BytesIO()
    Image.fromarray(array).save(buffer, format='PNG')
    return buffer.getvalue()


class PreparationTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)

    def fixture(self):
        manifests = {'pilot-rgb-six-v1': {'originals': [], 'heldout': [{'path': 'never-read.png'}]},
                     'scan-source-v1': {'assets': []}, 'scan-rgbd-source-v1': {'assets': []}}
        rgb_root = self.root/'pilot-rgb-six-v1'
        rgb_root.mkdir()
        for folder in ('source-originals', 'originals'):
            (rgb_root/folder).mkdir()
        rgb = np.zeros((480, 640, 3), dtype=np.uint8)
        rgb[:40, :70] = [17, 120, 240]
        source, normalized = png(rgb), png(np.rot90(rgb, -1))
        for i in range(6):
            name, identity = f'45261631_{i+1}.000.png', f'view{i}'
            (rgb_root/'source-originals'/name).write_bytes(source)
            (rgb_root/'originals'/(identity+'.png')).write_bytes(normalized)
            manifests['pilot-rgb-six-v1']['originals'].append({
                'id': identity, 'source_filename': name, 'source_path': 'source-originals/'+name,
                'source_sha256': hashlib.sha256(source).hexdigest(), 'source_bytes': len(source),
                'source_width': 640, 'source_height': 480, 'path': 'originals/'+identity+'.png',
                'sha256': hashlib.sha256(normalized).hexdigest(), 'bytes': len(normalized),
                'width': 480, 'height': 640, 'normalization': {'exif_transpose': True,
                'color_mode': 'RGB', 'rotate_clockwise_degrees': 90, 'format': 'PNG'}})
        depth = np.full((192, 256), 2000, dtype=np.uint16)
        depth[0, 0] = 0
        payloads = {'depth': png(depth), 'confidence': png(np.full((192, 256), 2, dtype=np.uint8)),
                    'depth-intrinsics': b'256 192 200 201 127 95\n',
                    'rgb-intrinsics': b'640 480 500 501 319 239\n'}
        for role, (folder, suffix) in prepare.ARCHIVES.items():
            parent = 'scan-rgbd-source-v1' if role in ('depth', 'confidence') else 'scan-source-v1'
            path = self.root/parent/role/(role+'.zip')
            path.parent.mkdir(parents=True)
            with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
                for i in range(6):
                    archive.writestr(f'{folder}/45261631_{i+1}.000.{suffix}', payloads[role])
            data = path.read_bytes()
            manifests[parent]['assets'].append({'role': role, 'path': role+'/'+path.name,
                'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
        path = self.root/'scan-source-v1/trajectory/lowres_wide.traj'
        path.parent.mkdir()
        data = ''.join(f'{i+1}.000 0 0 0.3 1 2 3\n' for i in range(6)).encode()
        path.write_bytes(data)
        manifests['scan-source-v1']['assets'].append({'role': 'trajectory', 'path': path.name,
            'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
        pins = {}
        for folder, manifest in manifests.items():
            data = json.dumps(manifest).encode()
            (self.root/folder/'manifest.json').write_bytes(data)
            pins[folder] = hashlib.sha256(data).hexdigest()
        self.enterContext(patch.object(prepare, 'DATA_ROOT', self.root))
        self.enterContext(patch.object(prepare, 'MANIFESTS', pins))
        prepare.run_stage('directory', self.root/'scan-rgbd-source-v1/manifest.json',
                          self.root/'scan-rgbd-directory-v1')
        directory = (self.root/'scan-rgbd-directory-v1/manifest.json').read_bytes()
        self.enterContext(patch.object(prepare, 'DIRECTORY_SHA256', hashlib.sha256(directory).hexdigest()))
        return self.root/'scan-rgbd-directory-v1/manifest.json', self.root/'scan-rgbd-prepare-v1'

    def test_selected_member_reads_validate_local_header_and_crc(self):
        self.assertTrue(hasattr(prepare, 'read_member'), 'Missing bounded local member reader')
        path = self.root/'a.zip'
        with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr('depth.png', b'content')
        raw = path.read_bytes()
        binding = {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
        entry = prepare.archive_members(path, binding)[0]
        self.assertEqual(prepare.read_member(path, entry), b'content')
        for offset in (4, 6, 8, 14, 18, 22, 30, 30+len('depth.png')):
            data = bytearray(raw)
            data[offset] ^= 1
            path.write_bytes(data)
            with self.subTest(offset=offset), self.assertRaises(ValueError):
                prepare.read_member(path, entry)

    def test_png_contract_rejects_wrong_type_dimensions_confidence_and_truncation(self):
        self.assertTrue(hasattr(prepare, 'decode_raster'), 'Missing semantic PNG decoder')
        depth = np.full((192, 256), 2000, dtype=np.uint16)
        np.testing.assert_array_equal(prepare.decode_raster(png(depth), 'depth'), depth)
        cases = [(png(depth.astype(np.uint8)), 'depth'), (png(depth), 'confidence'),
                 (png(np.full((192, 256), 3, dtype=np.uint8)), 'confidence'),
                 (png(np.ones((10, 10), dtype=np.uint16)), 'depth'), (png(depth)[:-20], 'depth')]
        for data, role in cases:
            with self.subTest(role=role, size=len(data)), self.assertRaises(ValueError):
                prepare.decode_raster(data, role)

    def test_intrinsics_reject_nonfinite_wrong_grid_and_nonpositive_focal_length(self):
        self.assertTrue(hasattr(prepare, 'parse_intrinsics'), 'Missing pincam parser')
        np.testing.assert_array_equal(prepare.parse_intrinsics(b'256 192 200 201 127 95', (256, 192)),
                                      [[200, 0, 127], [0, 201, 95], [0, 0, 1]])
        for data in (b'256 192 nan 200 127 95', b'640 480 200 200 127 95',
                     b'256 192 -1 200 127 95', b'256 192 200 200 999 95', b'1 2'):
            with self.subTest(data=data), self.assertRaises(ValueError):
                prepare.parse_intrinsics(data, (256, 192))

    def test_six_view_preparation_retains_raw_members_and_calibration_without_admission(self):
        self.assertTrue(hasattr(prepare, 'DIRECTORY_SHA256'), 'Missing pinned preparation stage')
        source, output = self.fixture()
        report = prepare.run_stage('prepare', source, output)
        self.assertEqual(report['status'], 'prepared-not-registered')
        self.assertFalse(report['source_admitted'])
        self.assertIn('calibration_evidence', report)
        self.assertEqual(report['calibration_evidence']['status'], 'numerical-assumptions-not-physical-validation')
        self.assertEqual(report['calibration_evidence']['rgb_pose_correspondence'], 'unverified; pose applies only to depth checks')
        self.assertEqual(len(report['views']), 6)
        view = report['views'][0]
        self.assertEqual(view['valid_depth_pixels'], 49151)
        self.assertEqual(view['depth_range_m'], [2., 2.])
        self.assertEqual(view['confidence_counts'], [0, 0, 49152])
        self.assertEqual(view['depth_intrinsics_rotated'], [[0., -201., 96.], [200., 0., 127.], [0., 0., 1.]])
        self.assertLess(view['max_roundtrip_pixel_error'], 1e-8)
        self.assertLess(view['max_roundtrip_depth_error_m'], 1e-8)
        self.assertEqual(len(list(output.glob('*.png'))), 12)
        self.assertEqual(len(list(output.glob('*.pincam'))), 12)
        self.assertEqual(json.loads((output/'manifest.json').read_bytes()), report)
        with self.assertRaises(FileExistsError):
            prepare.run_stage('prepare', source, output)

    def test_all_missing_poses_are_reported_before_member_extraction(self):
        source, output = self.fixture()
        path = self.root/'scan-source-v1/trajectory/lowres_wide.traj'
        data = b'10.000 0 0 0 0 0 0\n'
        path.write_bytes(data)
        loaded = prepare.load_inputs()
        loaded['assets']['trajectory'].update(bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
        with patch.object(prepare, 'load_inputs', return_value=loaded), self.assertRaises(ValueError) as caught:
            prepare.run_stage('prepare', source, output)
        for i in range(6):
            self.assertIn(f'view{i}', str(caught.exception))
        self.assertFalse(list(output.glob('*.png')))
        self.assertFalse((output/'manifest.json').exists())
        events = [json.loads(r) for r in (output/'preparation.jsonl').read_bytes().splitlines()]
        self.assertEqual([event['event'] for event in events], ['started']+['pose-rejected']*6+['failed'])
        for event in events[1:-1]:
            self.assertIn('nearest residual', event['reason'])

    def test_wrong_depth_rotation_rejects_even_when_roundtrip_is_self_consistent(self):
        source, output = self.fixture()
        rotate = np.rot90
        def wrong_depth(array, k=1):
            return rotate(array, 1 if array.ndim == 2 else k)
        with patch.object(prepare.np, 'rot90', side_effect=wrong_depth), \
                self.assertRaisesRegex(ValueError, 'rotation correspondence'):
            prepare.run_stage('prepare', source, output)
        self.assertFalse((output/'manifest.json').exists())
        self.assertEqual(len(list(output.glob('*.png'))), 2)
        self.assertEqual(json.loads((output/'preparation.jsonl').read_bytes().splitlines()[-1])['event'], 'failed')

    def test_changed_directory_rejects_without_committing_manifest(self):
        self.assertTrue(hasattr(prepare, 'DIRECTORY_SHA256'), 'Missing pinned preparation stage')
        source, output = self.fixture()
        source.write_bytes(source.read_bytes()+b' ')
        with self.assertRaisesRegex(ValueError, 'directory'):
            prepare.run_stage('prepare', source, output)
        self.assertFalse((output/'manifest.json').exists())
        self.assertEqual([json.loads(r)['event'] for r in (output/'preparation.jsonl').read_bytes().splitlines()],
                         ['started', 'failed'])

    def test_rgb_normalization_is_semantic_not_just_matching_shapes(self):
        self.assertTrue(hasattr(prepare, 'verify_rgb'), 'Missing RGB normalization verification')
        self.fixture()
        record = prepare.load_inputs()['rgb']['originals'][0]
        prepare.verify_rgb(record)
        data = png(np.zeros((640, 480, 3), dtype=np.uint8))
        (self.root/'pilot-rgb-six-v1'/record['path']).write_bytes(data)
        record.update(bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
        with self.assertRaisesRegex(ValueError, 'normalization'):
            prepare.verify_rgb(record)

    def test_decimal_pose_ties_and_exact_five_ms_boundary(self):
        self.assertTrue(hasattr(prepare, 'select_pose'), 'Missing exact pose selection')
        data = b'56036.799 0 0 0 0 0 0\n56036.801 0 0 0 1 2 3\n'
        with self.assertRaises(ValueError):
            prepare.select_pose('56036.800', data)
        time, pose = prepare.select_pose('56036.804', b'56036.809 0 0 0 1 2 3\n')
        self.assertEqual(time, '56036.809')
        np.testing.assert_array_equal(pose[:3, 3], [-1, -2, -3])


if __name__ == '__main__':
    unittest.main()
