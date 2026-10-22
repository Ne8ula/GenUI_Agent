"""Saved estimates and masks, not new model execution or dataset depth."""
import copy
import json
from pathlib import Path
import tempfile
import subprocess
import sys
import unittest
from unittest.mock import patch

import numpy as np

from geometry import make_mesh
from complete_candidate import geometry_hash
from idealized_contract import digest
from object_proposals import lift_points
import object_suggestions
from test_object_suggestions import detect, segment
from test_worldmirror_candidate import fixture, sha
import worldmirror_candidate as converter


class LiftPointsTests(unittest.TestCase):
    def test_complex_pointmaps_and_colors_reject_before_quantiles(self):
        mask = np.ones((4, 4), bool)
        real = np.ones((4, 4, 3))
        for points, colors in ((real.astype(complex), real), (real, real.astype(complex))):
            with self.subTest(dtype=(points.dtype, colors.dtype)), self.assertRaises(ValueError):
                lift_points(mask, points, mask, colors)

    def test_native_and_padded_rasters_keep_black_and_reject_bad_shapes(self):
        for shape in ((392, 518), (518, 518)):
            y, x = np.indices(shape)
            points = np.stack((x/100, y/100, np.ones(shape)), -1)
            mask = np.ones(shape, bool)
            valid = mask.copy()
            if shape[0] == 518:
                valid[:63] = False; valid[455:] = False
            rgb = np.zeros((*shape, 3))
            support = lift_points(mask, points, valid, rgb)
            self.assertEqual(support['color'], [0., 0., 0.])
            self.assertEqual(support['support_pixels'], int(valid.sum()))
            self.assertIsNone(lift_points(mask, points, valid & False, rgb))
            with self.assertRaises(ValueError):
                lift_points(mask[:, :-1], points, valid, rgb)


class SavedSourceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        req, manifest, fields, baseline, frozen, paths = fixture(root)
        baseline['boundary_proposal'] = {'requires_user_confirmation': True, 'origin': 'Synthetic only',
                                         'value': frozen['boundary']}
        paths[0].write_text(json.dumps(baseline), encoding='utf-8')
        prediction = converter._prediction(fields, manifest, baseline)
        angle = .21
        rotation = np.array([[np.cos(angle), -np.sin(angle), 0], [np.sin(angle), np.cos(angle), 0], [0, 0, 1]])
        translation = np.array([.12, -.06, .08])
        prediction['points'] = 1.7*prediction['points'] @ rotation.T + translation
        for camera in prediction['cameras']:
            center = 1.7*rotation @ camera['center'] + translation
            r = np.asarray(camera['world_to_camera'])[:, :3] @ rotation.T
            camera['center'] = center.tolist()
            camera['world_to_camera'] = np.column_stack((r, -r @ center)).tolist()
        raw = make_mesh(prediction['points'], prediction['rgb'], prediction['valid'])
        candidate = root/'candidate'; candidate.mkdir()
        report = {'input_result_sha256': sha(paths[0].read_bytes()), 'input_request_sha256': sha(paths[1].read_bytes()),
                  'source_analysis_binding': baseline['analysis_binding'],
                  'worldmirror': {'manifest_sha256': sha((paths[2]/'manifest.json').read_bytes()),
                                  'fields_sha256': manifest['fields_sha256']},
                  'registration': {'scale': 1.7, 'rotation': rotation.tolist(), 'translation': translation.tolist()},
                  'original_to_candidate_rotation': frozen['original_to_candidate_rotation'],
                  'raw_geometry_sha256': geometry_hash(raw), 'cameras': prediction['cameras']}
        (candidate/'report.json').write_text(json.dumps(report), encoding='utf-8')
        (candidate/'raw.json').write_text(json.dumps(raw), encoding='utf-8')
        suggestions = object_suggestions.execute(req, detect, segment)
        suggestion_path = root/'suggestions.json'
        suggestion_path.write_text(json.dumps(suggestions), encoding='utf-8')
        self.review = {'version': 1, 'coordinate_frame': 'worldmirror-candidate',
                       'analysis_binding': baseline['analysis_binding'],
                       'candidate_report_sha256': sha((candidate/'report.json').read_bytes()),
                       'suggestions_sha256': sha(suggestion_path.read_bytes()),
                       'boundary': frozen['boundary'], 'openings': []}
        self.review_path = root/'review.json'
        self.review_path.write_text(json.dumps(self.review), encoding='utf-8')
        self.paths = (*paths[:3], candidate, suggestion_path, self.review_path)
        self.files = [paths[0], paths[1], paths[2]/'manifest.json', paths[2]/'raw-fields.npz',
                      candidate/'raw.json', candidate/'report.json', suggestion_path, self.review_path]

    def test_saved_similarity_is_used_without_refitting_and_sources_stay_unchanged(self):
        before = {p: sha(p.read_bytes()) for p in self.files}
        with patch.object(converter, '_register', side_effect=AssertionError('Must not refit')):
            packet = converter.load_idealization_inputs(*self.paths)
        self.assertEqual(before, {p: sha(p.read_bytes()) for p in self.files})
        f = np.asarray(packet['frame']['source_to_candidate'])
        inverse = np.asarray(packet['frame']['candidate_to_source'])
        samples = np.array([[.1, -.2, .8, 1], [1, 2, 3, 1]])
        self.assertLess(np.max(np.abs(samples @ f.T @ inverse.T - samples)), 1e-6)
        self.assertEqual(packet['bindings']['frame_sha256'], digest(packet['frame']))
        self.assertEqual(len(packet['observations']), 5)
        self.assertTrue(all(o['label'] == 'desk' for o in packet['observations']))
        self.assertTrue(all(o['complete_shape'] is False for o in packet['inventory_proposals']))

    def test_fitting_views_share_saved_camera_scale_mask_and_valid_crop(self):
        packet = converter.load_idealization_inputs(*self.paths, with_fitting_views=True)
        observation = packet['observations'][0]
        view = observation['view']
        self.assertEqual(view['camera'], packet['cameras'][0])
        self.assertEqual(view['mask'].shape, (518, 518))
        self.assertEqual(view['mask'].dtype, bool)
        self.assertTrue(np.isinf(view['occluder_depth'][view['mask']]).all())
        self.assertTrue(np.isinf(view['occluder_depth'][~view['valid_mask']]).all())
        self.assertFalse(view['valid_mask'][:63].any())
        self.assertFalse(view['valid_mask'][455:].any())
        manifest, fields, _, _ = converter._admit_raw(self.paths[2], json.loads(self.paths[1].read_text()))
        baseline = json.loads(self.paths[0].read_text())
        prediction = converter._prediction(fields, manifest, baseline)
        outside = view['valid_mask'] & ~view['mask']
        self.assertTrue(outside.any())
        np.testing.assert_allclose(view['occluder_depth'][outside], 1.7*prediction['depth'][0][outside])
        # Candidate-camera Z must equal scaled source Z despite rotation/translation.
        points = np.asarray(observation['support']['points'])
        pose = np.asarray(view['camera']['world_to_camera'])
        z = points @ pose[2,:3] + pose[2,3]
        np.testing.assert_allclose(z, 1.7*.4, atol=1e-6)
        plain = converter.load_idealization_inputs(*self.paths)
        self.assertNotIn('view', plain['observations'][0])
        json.dumps(plain, allow_nan=False)

    def selection(self):
        from idealized_fixture import accepted_inventory
        packet = converter.load_idealization_inputs(*self.paths)
        obj = accepted_inventory()[0]
        obj.update(observation_ids=[o['id'] for o in packet['observations']],
                   dimensions=[.4,.3,.5], translation=[0,0,-1], yaw=.23)
        obj['design_priors'].update(dimension_origin='owner', pose_origin='owner', color_origin='owner')
        selection = {key: copy.deepcopy(packet[key]) for key in ('job_id','bindings','boundary','openings')}
        selection.update(parent_revision=None, inventory=[obj])
        return selection

    def test_private_prepare_cli_derives_bound_inputs_and_fits_without_accepting_paths_or_authority(self):
        from idealized_room import assemble
        root = Path(self.temp.name)
        selection = self.selection()
        source = {'source':'retained-seven-photo-room', 'source_sha256':'a'*64,
                  'request':json.loads(self.paths[1].read_text()), 'analysis':json.loads(self.paths[0].read_text()),
                  'worldmirror_report':json.loads((self.paths[3]/'report.json').read_text()),
                  'suggestions_sha256':sha(self.paths[4].read_bytes()),'observations':selection['bindings']['observations']}
        snapshot = root/'snapshot.json'
        snapshot.write_text(json.dumps(source), encoding='utf-8')
        review = {key:selection[key] for key in ('boundary','openings','inventory')}
        review_file = root/'prepare-review.json'
        review_file.write_text(json.dumps(review), encoding='utf-8')
        output = root/'prepared.json'
        command = [sys.executable, str(Path(__file__).with_name('idealized_prepare.py')),
                   '--source-snapshot',str(snapshot), '--review',str(review_file), '--output',str(output)]
        for flag, path in zip(('result','request','raw-directory','candidate-directory','suggestions'), self.paths[:5]):
            command += ['--'+flag,str(path)]
        before = {p:sha(p.read_bytes()) for p in self.files}
        result = subprocess.run(command, capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode,0,result.stderr)
        packet = json.loads(output.read_text())
        self.assertEqual(packet['bindings'],selection['bindings'])
        self.assertIn('first-room-fit-review',packet['inventory'][0]['review_reasons'])
        value = assemble(packet,packet['inventory'],None)
        self.assertEqual(len([d for d in value['diagnostics'] if d['code']=='silhouette-disagreement']),5)
        self.assertEqual(before,{p:sha(p.read_bytes()) for p in self.files})
        node_script = """import fs from 'node:fs'; import {pathToFileURL} from 'node:url';
const {prepareIdealizationInputs,runIdealization}=await import(pathToFileURL(process.argv[1]));
const {createBroker,terminateProcessTree}=await import(pathToFileURL(process.argv[2]));
const {createHash}=await import('node:crypto');
const [python,sourcePath,reviewPath,outputDirectory,...paths]=process.argv.slice(3);
const source=JSON.parse(fs.readFileSync(sourcePath)),review=JSON.parse(fs.readFileSync(reviewPath));
const options={python,terminate:terminateProcessTree,sourcePath,outputDirectory,
 paths:Object.fromEntries(['result','request','raw-directory','candidate-directory','suggestions'].map((key,i)=>[key,paths[i]]))};
const packet=await prepareIdealizationInputs(source,review,options);
const value=await runIdealization(packet,{...options,inputSha256:createHash('sha256').update(JSON.stringify(packet)).digest('hex')});
const hosts=new Set(),broker=await createBroker({directory:outputDirectory+'-broker',allowedHosts:hosts,
 idealizationPython:python,idealizationSourceLoader:async()=>source,
 idealizationInputLoader:(source,review,opts)=>prepareIdealizationInputs(source,review,{...opts,paths:options.paths})});
try{
 await new Promise(r=>broker.server.listen(0,'127.0.0.1',r));
 const host='127.0.0.1:'+broker.server.address().port;hosts.add(host);
 const base='http://'+host+'/api/room-workflow',response=await fetch(base+'/session');
 const cookie=response.headers.get('set-cookie').split(';')[0],session=await response.json();
 const api=(path,body)=>fetch(base+path,{method:body?'POST':'GET',headers:{Cookie:cookie,
 Origin:'http://127.0.0.1:1440','X-EVA-CSRF':session.csrf,'Content-Type':'application/json'},
 ...(body?{body:JSON.stringify(body)}:{})});
 const imported=await api('/jobs/import-idealization',{source:source.source,expected_source_sha256:source.source_sha256});
 if(imported.status!==201)throw Error(await imported.text());
 const {job_id:id}=await imported.json();
 const prepared=await api('/jobs/'+id+'/idealization',{action:'prepare',expected_revision:null,...review});
 if(prepared.status!==202)throw Error(await prepared.text());
 await broker.wait();
 const state=await(await api('/jobs/'+id+'/idealization')).json();
 if(state.status!=='needs-review'||state.candidate.job_id!==id||state.candidate.inventory.length!==1||
 !state.review_reasons.some(r=>r.includes('silhouette-disagreement')))throw Error('Broker preparation was not admitted: '+JSON.stringify(state));
 console.log(JSON.stringify({objects:value.inventory.length,mode:value.mode,broker:state.status}));
}finally{await broker.wait();broker.server.closeAllConnections();await new Promise(r=>broker.server.close(r));}"""
        node = subprocess.run(['node','--input-type=module','-e',node_script,
            str(Path(__file__).with_name('idealized-adapter.mjs')),str(Path(__file__).with_name('broker.mjs')),
            sys.executable,str(snapshot),str(review_file),str(root/'node-candidate'),*[str(p) for p in self.paths[:5]]],
            capture_output=True,text=True,timeout=60)
        self.assertEqual(node.returncode,0,node.stderr)
        self.assertEqual(json.loads(node.stdout),{'objects':1,'mode':'idealized','broker':'needs-review'})
        self.assertEqual(before,{p:sha(p.read_bytes()) for p in self.files})
        saved = output.read_bytes()
        self.assertNotEqual(subprocess.run(command,capture_output=True).returncode,0)
        self.assertEqual(output.read_bytes(),saved)
        for key in ('ready','dataset_depth','path'):
            review_file.write_text(json.dumps({**review,key:True}),encoding='utf-8')
            new_command = [str(root/f'rejected-{key}.json') if arg==str(output) else arg for arg in command]
            rejected = subprocess.run(new_command,capture_output=True,text=True,timeout=60)
            self.assertNotEqual(rejected.returncode,0)
            self.assertFalse((root/f'rejected-{key}.json').exists())
        review_file.write_text(json.dumps(review),encoding='utf-8')
        source['worldmirror_report']['registration']['scale'] = 5
        snapshot.write_text(json.dumps(source),encoding='utf-8')
        rejected = subprocess.run([str(root/'stale.json') if arg==str(output) else arg for arg in command],capture_output=True)
        self.assertNotEqual(rejected.returncode,0)
        self.assertFalse((root/'stale.json').exists())

    def draft_request(self):
        root = Path(self.temp.name)
        packet = converter.load_idealization_inputs(*self.paths)
        source = {'source':'retained-seven-photo-room', 'source_sha256':'a'*64,
                  'request':json.loads(self.paths[1].read_text()), 'analysis':json.loads(self.paths[0].read_text()),
                  'worldmirror_report':json.loads((self.paths[3]/'report.json').read_text()),
                  'suggestions_sha256':sha(self.paths[4].read_bytes()), 'observations':packet['bindings']['observations']}
        snapshot, review = root/'draft-source.json', root/'draft-review.json'
        snapshot.write_text(json.dumps(source), encoding='utf-8')
        review.write_text(json.dumps({k:packet[k] for k in ('boundary','openings')}), encoding='utf-8')
        return snapshot, review

    def test_automatic_draft_cli_keeps_every_detection_without_assembly_or_ready_manifest(self):
        from idealized_contract import validate_artifact
        root = Path(self.temp.name)
        snapshot, review = self.draft_request()
        output = root/'draft-ledger.json'
        command = [sys.executable, str(Path(__file__).with_name('idealized_prepare.py')), '--draft-only',
                   '--source-snapshot', str(snapshot), '--review', str(review), '--output', str(output)]
        for flag, path in zip(('result','request','raw-directory','candidate-directory','suggestions'), self.paths[:5]):
            command += ['--'+flag, str(path)]
        before = {p:sha(p.read_bytes()) for p in [*self.files, snapshot, review]}
        result = subprocess.run(command, capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 0, result.stderr)
        report, draft = json.loads(result.stdout), json.loads(output.read_text())
        self.assertEqual(report['status'], 'needs-review')
        self.assertEqual(draft['kind'], 'eva-idealized-inventory-draft-v1')
        self.assertEqual(draft['source_sha256'], 'a'*64)
        self.assertEqual(sorted(ref for d in draft['drafts'] for ref in d['observation_ids']),
                         sorted(o['id'] for o in json.loads(snapshot.read_text())['observations']))
        self.assertNotIn('fit_diagnostics', draft)
        self.assertNotIn('geometry', draft)
        self.assertFalse((root/'candidate.json').exists())
        with self.assertRaises(ValueError):
            validate_artifact(draft, {})
        self.assertEqual(before, {p:sha(p.read_bytes()) for p in before})
        saved = output.read_bytes()
        again = subprocess.run(command, capture_output=True, text=True, timeout=60)
        self.assertNotEqual(again.returncode, 0)
        self.assertEqual(output.read_bytes(), saved)

    def test_draft_preview_never_calls_fit_and_rejects_stale_or_authority_inputs(self):
        import idealized_prepare
        root = Path(self.temp.name)
        snapshot, review = self.draft_request()
        with (patch.object(idealized_prepare, 'fit_inventory', side_effect=AssertionError('No fitting')),
              patch.object(idealized_prepare, 'assemble', side_effect=AssertionError('No assembly'))):
            idealized_prepare.prepare(*self.paths[:5], snapshot, review, root/'plain-draft.json', draft_only=True)
        original_review, original_source = json.loads(review.read_text()), json.loads(snapshot.read_text())
        for key in ('inventory', 'ready', 'dataset_depth', 'path'):
            review.write_text(json.dumps({**original_review, key: []}), encoding='utf-8')
            output = root/f'draft-rejected-{key}.json'
            with self.subTest(key=key), self.assertRaises(ValueError):
                idealized_prepare.prepare(*self.paths[:5], snapshot, review, output, draft_only=True)
            self.assertFalse(output.exists())
        review.write_text(json.dumps(original_review), encoding='utf-8')
        original_source['observations'][0]['mask_sha256'] = 'f'*64
        snapshot.write_text(json.dumps(original_source), encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'observations'):
            idealized_prepare.prepare(*self.paths[:5], snapshot, review, root/'stale-draft.json', draft_only=True)
        self.assertFalse((root/'stale-draft.json').exists())

    def test_preparation_rejects_snapshot_or_review_changes_before_output(self):
        import idealized_prepare
        root = Path(self.temp.name)
        for draft_only in (True, False):
            for changed in ('snapshot', 'review'):
                with self.subTest(draft_only=draft_only, changed=changed):
                    snapshot, review = self.draft_request()
                    if not draft_only:
                        value = json.loads(review.read_text())
                        review.write_text(json.dumps({**value, 'inventory': []}), encoding='utf-8')
                    target = snapshot if changed == 'snapshot' else review
                    output = root/f'race-{draft_only}-{changed}.json'
                    name = 'draft_inventory' if draft_only else 'fit_inventory'
                    original = getattr(idealized_prepare, name)

                    def rewrite_after_derivation(*args):
                        result = original(*args)
                        value = json.loads(target.read_text())
                        if changed == 'snapshot':
                            value['source_sha256'] = 'c'*64
                        else:
                            value['boundary']['ceiling'] += 1
                        target.write_text(json.dumps(value), encoding='utf-8')
                        return result

                    with patch.object(idealized_prepare, name, side_effect=rewrite_after_derivation):
                        with self.assertRaisesRegex(ValueError, 'changed during preparation'):
                            idealized_prepare.prepare(*self.paths[:5], snapshot, review, output,
                                                      draft_only=draft_only)
                    self.assertFalse(output.exists())

    def test_private_preparation_rejects_suggestions_changed_since_import(self):
        from idealized_prepare import prepare
        root = Path(self.temp.name)
        selection = self.selection()
        source = {'request':json.loads(self.paths[1].read_text()), 'analysis':json.loads(self.paths[0].read_text()),
                  'worldmirror_report':json.loads((self.paths[3]/'report.json').read_text()),
                  'suggestions_sha256':sha(self.paths[4].read_bytes()), 'observations':selection['bindings']['observations']}
        snapshot, review, output = root/'snapshot.json', root/'private-review.json', root/'prepared.json'
        snapshot.write_text(json.dumps(source), encoding='utf-8')
        review.write_text(json.dumps({k:selection[k] for k in ('boundary','openings','inventory')}), encoding='utf-8')
        self.paths[4].write_bytes(self.paths[4].read_bytes()+b'\n')
        with self.assertRaisesRegex(ValueError, 'suggestions'):
            prepare(*self.paths[:5], snapshot, review, output)
        self.assertFalse(output.exists())

    def test_source_fit_cli_preserves_owner_edits_sources_and_reopens_diagnostics(self):
        from idealized_fixture import expected
        from idealized_room import read_candidate
        selection = self.selection()
        root = Path(self.temp.name)
        selected = root/'inventory.json'
        selected.write_text(json.dumps(selection), encoding='utf-8')
        before = {p: sha(p.read_bytes()) for p in [*self.files, selected]}
        output = root/'fitted'
        command = [sys.executable, str(Path(__file__).with_name('idealized_sources.py'))]
        for flag, path in zip(('result','request','raw-directory','candidate-directory','suggestions','review'), self.paths):
            command += ['--'+flag, str(path)]
        command += ['--inventory', str(selected), '--output', str(output)]
        result = subprocess.run(command, capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['status'], 'needs-review')
        value = json.loads((output/'candidate.json').read_text())
        self.assertEqual(read_candidate(output, expected(value)), value)
        self.assertEqual(value['bindings'], selection['bindings'])
        for key in ('dimensions','translation','yaw','color_srgb','observation_ids'):
            self.assertEqual(value['inventory'][0][key], selection['inventory'][0][key])
        self.assertIn('first-room-fit-review', value['inventory'][0]['review_reasons'])
        views = [d for d in value['diagnostics'] if d['code']=='silhouette-disagreement']
        self.assertEqual(len(views), 5)
        self.assertEqual({d['view_ids'][0] for d in views}, {r['id'] for r in selection['bindings']['originals']})
        self.assertEqual(before, {p: sha(p.read_bytes()) for p in before})
        output_hash = sha((output/'candidate.json').read_bytes())
        again = subprocess.run(command, capture_output=True, text=True, timeout=60)
        self.assertNotEqual(again.returncode, 0)
        self.assertEqual(sha((output/'candidate.json').read_bytes()), output_hash)

    def test_masked_palette_comes_from_selected_evidence_not_typed_color(self):
        import idealized_sources
        packet = converter.load_idealization_inputs(*self.paths)
        observation = packet['observations'][0]
        selection = self.selection()
        obj = selection['inventory'][0]
        obj['observation_ids'] = [observation['id']]
        obj['design_priors']['color_origin'] = 'masked-source'
        obj['color_srgb'] = [1,0,1]
        selected = Path(self.temp.name)/'inventory.json'
        selected.write_text(json.dumps(selection), encoding='utf-8')
        value = idealized_sources.fit_sources(*self.paths, selected)
        self.assertEqual(value['inventory'][0]['color_srgb'], observation['support']['color'])
        self.assertNotEqual(value['inventory'][0]['color_srgb'], obj['color_srgb'])
        obj['observation_ids'] = []
        selected.write_text(json.dumps(selection), encoding='utf-8')
        with self.assertRaises(ValueError):
            idealized_sources.fit_sources(*self.paths, selected)

    def test_source_fit_rejects_stale_selection_unknown_refs_and_extra_authority(self):
        import idealized_sources
        selected = Path(self.temp.name)/'inventory.json'
        selection = self.selection()
        for key, value in (('job_id','other'), ('bindings',{}), ('boundary',{}), ('openings',[{}]),
                           ('ready',True), ('parent_revision','bad')):
            selected.write_text(json.dumps({**selection, key:value}), encoding='utf-8')
            with self.subTest(key=key), self.assertRaises(ValueError):
                idealized_sources.fit_sources(*self.paths, selected)
        selection['inventory'][0]['observation_ids'] = ['unknown']
        selected.write_text(json.dumps(selection), encoding='utf-8')
        with self.assertRaises(ValueError):
            idealized_sources.fit_sources(*self.paths, selected)

    def test_source_fit_preserves_omissions_and_owner_additions_without_refitting(self):
        import idealized_sources
        from idealized_room import apply_correction
        selected = Path(self.temp.name)/'inventory.json'
        selection = self.selection()
        selection['inventory'][0]['omitted'] = True
        selection['inventory'] = apply_correction(selection['inventory'], {
            'action':'add', 'category':'chair', 'dimensions':[.2,.2,.3],
            'translation':[0,0,-1], 'yaw':.4, 'color_srgb':[0,0,0],
            'source_note':'Synthetic owner recollection; not source evidence'})
        selected.write_text(json.dumps(selection), encoding='utf-8')
        value = idealized_sources.fit_sources(*self.paths, selected)
        self.assertEqual(value['inventory'], selection['inventory'])
        self.assertEqual(len(value['omissions']), 1)
        self.assertEqual([c['origin'] for c in value['components']],
                         ['authored-room-shell','owner-authored-addition'])
        self.assertFalse(any(d['code']=='support-distance' for d in value['diagnostics']))

    def test_source_fit_empty_inventory_does_not_invent_furniture(self):
        import idealized_sources
        selected = Path(self.temp.name)/'inventory.json'
        selection = self.selection()
        selection['inventory'] = []
        selected.write_text(json.dumps(selection), encoding='utf-8')
        value = idealized_sources.fit_sources(*self.paths, selected)
        self.assertEqual(value['inventory'], [])
        self.assertEqual([c['id'] for c in value['components']], ['shell'])

    def test_wrong_review_frame_binding_and_reference_fields_reject(self):
        for key, bad in [('coordinate_frame', 'analysis'), ('candidate_report_sha256', '0'*64),
                         ('suggestions_sha256', '0'*64), ('analysis_binding', {}), ('dataset_depth', [])]:
            review = {**self.review, key: bad}
            self.review_path.write_text(json.dumps(review), encoding='utf-8')
            with self.subTest(key=key), self.assertRaises(ValueError):
                converter.load_idealization_inputs(*self.paths)

    def test_stale_mask_hash_rejects_even_with_fresh_review_digest(self):
        path = self.paths[4]
        value = json.loads(path.read_text())
        value['views'][0]['detections'][0]['mask']['sha256'] = '0'*64
        path.write_text(json.dumps(value), encoding='utf-8')
        self.review['suggestions_sha256'] = sha(path.read_bytes())
        self.review_path.write_text(json.dumps(self.review), encoding='utf-8')
        with self.assertRaises(ValueError):
            converter.load_idealization_inputs(*self.paths)


if __name__ == '__main__':
    unittest.main()
