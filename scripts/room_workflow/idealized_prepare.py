"""Host-only retained-source preparation; paths come from the broker catalog, not HTTP."""
import argparse
import hashlib
import json
import os
from pathlib import Path

from idealized_contract import MAX_METADATA, digest
from idealized_room import assemble
from idealized_sources import draft_inventory, fit_inventory
from worldmirror_candidate import _json, _read, load_idealization_inputs


def prepare(result_path, request_path, raw_directory, candidate_directory,
            suggestions_path, source_snapshot, review_path, output, *, draft_only=False):
    output = Path(output)
    if output.exists() or output.is_symlink():
        raise ValueError('Prepared output exists; preserve prior evidence')
    source_bytes, review_bytes = _read(source_snapshot, 128*1024**2), _read(review_path, 65536)
    source, review = _json(source_bytes), _json(review_bytes)
    keys = {'boundary','openings'} if draft_only else {'boundary','openings','inventory'}
    if not isinstance(review, dict) or set(review) != keys:
        raise ValueError('Preparation requires exact room fields'+(' only for draft preview' if draft_only else ' and inventory'))
    result_bytes, request_bytes = _read(result_path, 64*1024**2), _read(request_path, 58*1024**2)
    report_bytes = _read(Path(candidate_directory)/'report.json', 1024**2)
    suggestions_bytes = _read(suggestions_path, MAX_METADATA)
    if hashlib.sha256(suggestions_bytes).hexdigest() != source.get('suggestions_sha256'):
        raise ValueError('Imported suggestions differ from the admitted contract')
    for actual, key in ((result_bytes,'analysis'), (request_bytes,'request'), (report_bytes,'worldmirror_report')):
        # The broker serializes JSON numbers through JS; preserve value, not 1 vs 1.0 spelling.
        if digest(_json(actual)) != digest(source[key]):
            raise ValueError('Imported '+key+' differs from the admitted contract')
    bound_review = {'version':1, 'coordinate_frame':'worldmirror-candidate',
                   'analysis_binding':source['analysis']['analysis_binding'],
                   'candidate_report_sha256':hashlib.sha256(report_bytes).hexdigest(),
                   'suggestions_sha256':source['suggestions_sha256'],
                   'boundary':review['boundary'], 'openings':review['openings']}
    bound_path = output.with_name(output.name+'-binding.json')
    with bound_path.open('x', encoding='utf-8') as file:
        json.dump(bound_review, file, allow_nan=False)
    packet = load_idealization_inputs(result_path, request_path, raw_directory, candidate_directory,
                                     suggestions_path, bound_path, with_fitting_views=not draft_only)
    # Bind again after loading so a changed source cannot be selected between reads.
    for path, before in ((result_path,result_bytes), (request_path,request_bytes),
                         (Path(candidate_directory)/'report.json',report_bytes), (suggestions_path,suggestions_bytes)):
        if _read(path, 64*1024**2) != before:
            raise ValueError('Retained source changed during preparation')
    if draft_only:
        if source.get('observations') != packet['bindings']['observations']:
            raise ValueError('Imported observations differ from the admitted contract')
        prepared = draft_inventory(packet, source.get('source_sha256'))
        inventory = prepared['inventory']
    else:
        inventory, diagnostics = fit_inventory(packet, review['inventory'])
        prepared = {key:packet[key] for key in ('job_id','candidate_id','bindings','frame','boundary','openings','shell_color_srgb')}
        prepared.update(inventory=inventory, parent_revision=None, fit_diagnostics=diagnostics)
        assemble(prepared, inventory, None)
    if (_read(source_snapshot, 128*1024**2) != source_bytes or _read(review_path, 65536) != review_bytes):
        raise ValueError('Source snapshot or room review changed during preparation')
    data = json.dumps(prepared, ensure_ascii=False, allow_nan=False, separators=(',',':')).encode('utf-8')
    if len(data) > MAX_METADATA:
        raise ValueError('Prepared inputs exceed metadata budget')
    with output.open('xb') as file:
        file.write(data)
        file.flush(); os.fsync(file.fileno())
    return {'status':'needs-review', 'revision':prepared['revision'] if draft_only else digest(prepared),
            'objects':sum(not obj['omitted'] for obj in inventory)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('result','request','raw-directory','candidate-directory','suggestions','source-snapshot','review','output'):
        parser.add_argument('--'+name,type=Path,required=True)
    parser.add_argument('--draft-only', action='store_true', help='Preview automatic inventory; never fit or assemble')
    args = parser.parse_args()
    try:
        report = prepare(args.result,args.request,args.raw_directory,args.candidate_directory,
                         args.suggestions,args.source_snapshot,args.review,args.output,draft_only=args.draft_only)
    except (ValueError, OSError) as error:
        parser.error(str(error))
    print(json.dumps(report))
