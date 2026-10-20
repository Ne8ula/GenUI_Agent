"""Export verified r03 data for the bounded browser room viewer; no geometry invention."""
import argparse
import json
from pathlib import Path
import shutil
import hypersim as h


def export(run, data, output, fixture):
    from PIL import Image
    c = h.config(fixture)
    inputs = h.verify_manifest(data, c, fixture)
    report = json.loads((run/'report.json').read_text())
    if report['status'] != 'complete' or report['fixture'] != c:
        raise ValueError('Completed matching reconstruction required')
    if report['input_manifest_sha256'] != h.digest((data/'manifest.json').read_bytes()):
        raise ValueError('Run inputs differ from current cache')
    for name in ('room-mesh.ply', 'cameras.json'):
        if h.digest((run/name).read_bytes()) != report['output_sha256'][name]:
            raise ValueError('Run asset changed: ' + name)
    if output.exists():
        raise ValueError('Use a fresh export directory')
    output.mkdir(parents=True)
    shutil.copyfile(run/'room-mesh.ply', output/'room.ply')
    cameras = json.loads((run/'cameras.json').read_text())['cameras']
    frames = [(12, 'The cabinet'), (62, 'Shelves and light'), (87, 'A second angle'), (37, 'The doorway')]
    views = []
    for frame, label in frames:
        color = h.read_h5(data/c['scene']/'images'/f"scene_{c['camera']}_final_hdf5"/f'frame.{frame:04d}.color.hdf5')
        name = f'source-{frame:04d}.jpg'
        Image.fromarray(h.tone_map(color)).save(output/name, quality=92)
        views.append({**next(v for v in cameras if v['frame'] == frame),
                      'label': label, 'source': name,
                      'evaluation': next(v for v in report['evaluation'] if v['frame'] == frame)})
    credits = {'attribution': c['attribution'], 'license': c['license'],
               'license_url': 'https://creativecommons.org/licenses/by-sa/3.0/',
               'source_url': 'https://github.com/apple-aiml-research/ml-hypersim',
               'upstream_commit': inputs['upstream_commit'],
               'changes': 'Supplied RGB-D and camera poses fused with Open3D TSDF; HDR Reinhard and gamma tone mapping; source JPEG encoding. No generated completion.',
               'condition': c['condition'], 'evaluation_status': c['evaluation_status']}
    h.save_json(output/'credits.json', credits)
    files = {p.name: {'bytes': p.stat().st_size, 'sha256': h.digest(p.read_bytes())}
             for p in output.iterdir() if p.is_file()}
    if files['room.ply']['bytes'] > 32*1024**2:
        raise ValueError('Browser mesh exceeds cap')
    h.save_json(output/'scene.json', {'version': 1, 'scene': c['scene'], 'revision': 'r03',
        'coordinate_system': 'Hypersim world, meters, Z up', 'bounds_m': report['bounds_m'],
        'vertical_fov_degrees': 46.82644967, 'source_aspect': 4/3,
        'vertices': report['vertices'], 'triangles': report['triangles'],
        'integration_frames': c['train_frames'], 'evaluation_frames': c['evaluation_frames'],
        'input_manifest_sha256': report['input_manifest_sha256'],
        'report_sha256': h.digest((run/'report.json').read_bytes()),
        'files': files, 'views': views, 'credits': credits})


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', type=Path, required=True)
    parser.add_argument('--data', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--fixture', type=Path, required=True)
    args = parser.parse_args()
    export(args.run, args.data, args.output, args.fixture)
