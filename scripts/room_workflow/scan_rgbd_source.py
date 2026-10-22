"""One approved two-archive RGB-D acquisition; no ZIP inspection or extraction."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

if __package__ in (None, ''):
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from scan_source import _acquire_assets, _no_links
from worldmirror_candidate import _json, _read

PLAN_SHA256 = 'ddc5df0ab9dd2b85049fe6d5050da1bd622cf0361cb3b17d36125ce91745f951'


def acquire_rgbd(plan_path, output_dir):
    root = Path(__file__).resolve().parents[2]
    output = _no_links(output_dir)
    if output != root/'.local/reconstruction/arkitscenes/45261631/scan-rgbd-source-v1':
        raise ValueError('Use the fixed scan-rgbd-source-v1 directory; no alternate retry directory')
    data = _read(_no_links(plan_path), 65536)
    if hashlib.sha256(data).hexdigest() != PLAN_SHA256:
        raise ValueError('RGB-D plan bytes differ from the approved packet')
    # The exact byte pin closes every field, including URLs, limits and exclusion scope.
    plan = _json(data)
    for record in [plan['header_receipt'], *plan['retained_inputs_for_later_separate_admission']]:
        retained = _read(_no_links(root/record['path']), 2*1024**2)
        if hashlib.sha256(retained).hexdigest() != record['file_sha256']:
            raise ValueError('RGB-D retained evidence binding changed')
    return _acquire_assets(plan, output, plan_file_sha256=PLAN_SHA256,
                           receipt_kind='eva-rgbd-acquisition-receipt-v1',
                           disk_limit=plan['limits']['output_disk_bytes'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', required=True, type=Path)
    parser.add_argument('--output-dir', required=True, type=Path)
    args = parser.parse_args()
    try:
        path = acquire_rgbd(args.plan, args.output_dir)
    except (ValueError, OSError) as error:
        parser.error(str(error))
    print(json.dumps({'manifest': str(path), 'status': 'acquisition-only'}))


if __name__ == '__main__':
    main()
