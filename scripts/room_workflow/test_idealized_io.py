import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from idealized_contract import seal_artifact
from idealized_fixture import accepted_inventory, expected, packet
from idealized_room import assemble, write_candidate, read_candidate


class CandidateIOTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.value = assemble(packet(), accepted_inventory(), None)

    def test_exclusive_roundtrip_and_tampered_geometry_reject(self):
        directory = self.root/'candidate'
        path = write_candidate(directory,self.value)
        self.assertEqual(read_candidate(directory,expected(self.value)),self.value)
        with self.assertRaises(FileExistsError):
            write_candidate(directory,self.value)
        changed = json.loads(path.read_text())
        changed['geometry']['provenance'][0] = 'idealized-procedural'
        path.write_text(json.dumps(changed), encoding='utf-8')
        with self.assertRaises(ValueError):
            read_candidate(directory,expected(self.value))

    def test_resealed_geometry_forgeries_reject_on_save_and_reopen(self):
        def relabel(value):
            shell, obj = value['components']
            start = obj['first_face']
            shell['face_count'] += 6
            obj['first_face'] += 6
            obj['face_count'] -= 6
            value['geometry']['provenance'][start:start+6] = ['authored-room-shell']*6

        def move_object(value):
            start = value['components'][1]['first_face']*3
            vertices = set(value['geometry']['indices'][start:])
            for vertex in vertices:
                value['geometry']['positions'][vertex*3] += 10

        for i, change in enumerate((relabel, move_object,
                lambda v: v['geometry']['positions'].__setitem__(0, -.1),
                lambda v: v['inventory'][0]['dimensions'].__setitem__(0, 1.2))):
            value = copy.deepcopy(self.value)
            change(value)
            seal_artifact(value)
            with self.subTest(change=i, operation='save'), self.assertRaises(ValueError):
                write_candidate(self.root/f'save-{i}', value)
            directory = self.root/f'reopen-{i}'
            directory.mkdir()
            data = json.dumps(value).encode('utf-8')
            (directory/'candidate.json').write_bytes(data)
            (directory/'manifest.json').write_text(json.dumps({'version':1,
                'revision':value['revision'], 'candidate_sha256':hashlib.sha256(data).hexdigest()}))
            with self.subTest(change=i, operation='reopen'), self.assertRaises(ValueError):
                read_candidate(directory, expected(value))

    def test_resealed_missing_layout_diagnostics_reject_on_save_and_reopen(self):
        source = packet()
        source['openings'] = [{'id':'door-1', 'kind':'door', 'edge_index':0,
                               't0':.1, 't1':.5, 'bottom':0, 'top':2}]
        inventory = accepted_inventory()
        inventory[0]['translation'][1] = .41
        value = assemble(source, inventory, None)
        self.assertIn('door-approach', [d['code'] for d in value['diagnostics']])
        value['diagnostics'] = []
        seal_artifact(value)
        with self.assertRaisesRegex(ValueError, 'diagnostics'):
            write_candidate(self.root/'save-missing', value)
        directory = self.root/'reopen-missing'
        directory.mkdir()
        data = json.dumps(value).encode('utf-8')
        (directory/'candidate.json').write_bytes(data)
        (directory/'manifest.json').write_text(json.dumps({'version':1,
            'revision':value['revision'], 'candidate_sha256':hashlib.sha256(data).hexdigest()}))
        with self.assertRaisesRegex(ValueError, 'diagnostics'):
            read_candidate(directory, expected(value))

    def test_appended_layout_diagnostics_reject_on_save_and_reopen(self):
        value = copy.deepcopy(self.value)
        value['diagnostics'].append(copy.deepcopy(value['diagnostics'][0]))
        seal_artifact(value)
        with self.assertRaisesRegex(ValueError, 'diagnostics'):
            write_candidate(self.root/'save-extra', value)
        directory = self.root/'reopen-extra'
        directory.mkdir()
        data = json.dumps(value).encode('utf-8')
        (directory/'candidate.json').write_bytes(data)
        (directory/'manifest.json').write_text(json.dumps({'version':1,
            'revision':value['revision'], 'candidate_sha256':hashlib.sha256(data).hexdigest()}))
        with self.assertRaisesRegex(ValueError, 'diagnostics'):
            read_candidate(directory, expected(value))

    def test_interrupt_before_manifest_publication_retains_partial_output(self):
        directory = self.root/'interrupted'
        with patch('idealized_room.os.replace',side_effect=OSError('simulated interruption')):
            with self.assertRaises(OSError):
                write_candidate(directory,self.value)
        self.assertFalse((directory/'manifest.json').exists())
        self.assertTrue((directory/'candidate.json').exists())
        self.assertTrue((directory/'manifest.json.part').exists())
        with self.assertRaises((ValueError,FileNotFoundError)):
            read_candidate(directory,expected(self.value))

    def test_readonly_cli_reopens_geometry_with_host_expected_binding(self):
        directory = self.root/'candidate'
        write_candidate(directory, self.value)
        trusted = self.root/'expected.json'
        trusted.write_text(json.dumps(expected(self.value)), encoding='utf-8')
        before = {p.name:p.read_bytes() for p in directory.iterdir()}
        command = [sys.executable, str(Path(__file__).with_name('idealized_room.py')),
                   '--input', str(trusted), '--verify', str(directory)]
        result = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), {'status':'needs-review',
                         'revision':self.value['revision'], 'objects':1})
        self.assertEqual({p.name:p.read_bytes() for p in directory.iterdir()}, before)
        stale = expected(self.value)
        stale['parent_revision'] = 'a'*64
        trusted.write_text(json.dumps(stale), encoding='utf-8')
        rejected = subprocess.run(command, capture_output=True, text=True)
        self.assertNotEqual(rejected.returncode, 0)
        self.assertEqual(rejected.stdout, '')
        self.assertNotIn('Traceback', rejected.stderr)
        self.assertEqual({p.name:p.read_bytes() for p in directory.iterdir()}, before)

    def test_readonly_cli_rejects_resealed_geometry_not_just_bad_hashes(self):
        directory = self.root/'candidate'
        write_candidate(directory, self.value)
        changed = copy.deepcopy(self.value)
        changed['geometry']['positions'][0] -= .1
        seal_artifact(changed)
        data = json.dumps(changed).encode('utf-8')
        (directory/'candidate.json').write_bytes(data)
        (directory/'manifest.json').write_text(json.dumps({'version':1,
            'revision':changed['revision'], 'candidate_sha256':hashlib.sha256(data).hexdigest()}))
        trusted = self.root/'expected.json'
        trusted.write_text(json.dumps(expected(changed)), encoding='utf-8')
        result = subprocess.run([sys.executable, str(Path(__file__).with_name('idealized_room.py')),
            '--input', str(trusted), '--verify', str(directory)], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, '')
        self.assertIn('Geometry/components disagree', result.stderr)
        self.assertNotIn('Traceback', result.stderr)

    def test_real_cli_and_node_admission_use_synthetic_input_only(self):
        source = self.root/'input.json'
        source.write_text(json.dumps(packet()), encoding='utf-8')
        directory = self.root/'cli'
        cli = subprocess.run([sys.executable, str(Path(__file__).with_name('idealized_room.py')),
                              '--input', str(source), '--output', str(directory)], capture_output=True, text=True)
        self.assertEqual(cli.returncode,0,cli.stderr)
        self.assertEqual(json.loads(cli.stdout)['status'],'needs-review')
        value = read_candidate(directory,expected(self.value))
        self.assertEqual(value['revision'],self.value['revision'])
        trusted = self.root/'expected.json'
        trusted.write_text(json.dumps(expected(self.value)), encoding='utf-8')
        script = """import fs from 'node:fs'; import {pathToFileURL} from 'node:url';
const {validateIdealizedResult} = await import(pathToFileURL(process.argv[1]));
validateIdealizedResult(JSON.parse(fs.readFileSync(process.argv[2])),JSON.parse(fs.readFileSync(process.argv[3])));"""
        node = subprocess.run(['node','--input-type=module','-e',script,
                               str(Path(__file__).with_name('idealized-result.mjs')),
                               str(directory/'candidate.json'),str(trusted)],capture_output=True,text=True)
        self.assertEqual(node.returncode,0,node.stderr)


if __name__ == '__main__':
    unittest.main()
