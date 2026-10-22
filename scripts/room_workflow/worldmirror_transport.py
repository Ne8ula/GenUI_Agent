"""Bounded CBOR-compatible artifact records; partial results never imply admission."""
import hashlib
from pathlib import Path
import re

CHUNK = 1024**2
ARTIFACTS = {'manifest': ('manifest.json', 128*1024), 'fields': ('raw-fields.npz', 64*1024**2)}
METADATA = ('device_name', 'peak_cuda_bytes', 'dependencies')


def validate_header(header):
    if (type(header) is not dict or set(header) != {'kind', *ARTIFACTS, *METADATA}
            or header['kind'] != 'start'
            or type(header['device_name']) is not str or len(header['device_name']) > 200
            or type(header['peak_cuda_bytes']) is not int or not 0 <= header['peak_cuda_bytes'] <= 80*1024**3
            or type(header['dependencies']) is not str or len(header['dependencies']) > 65536):
        raise ValueError('Cloud response exceeds its exact artifact/resource contract')
    for key, (_, limit) in ARTIFACTS.items():
        spec = header[key]
        if (type(spec) is not dict or set(spec) != {'bytes', 'sha256'}
                or type(spec['bytes']) is not int or not 0 < spec['bytes'] <= limit
                or type(spec['sha256']) is not str or re.fullmatch('[a-f0-9]{64}', spec['sha256']) is None):
            raise ValueError('Cloud response exceeds its exact artifact/resource contract')


def stream_bundle(bundle):
    if type(bundle) is not dict or set(bundle) != {*ARTIFACTS, *METADATA}:
        raise ValueError('Unexpected bundle fields')
    header = {'kind': 'start', **{key: bundle[key] for key in METADATA}}
    for key, (_, limit) in ARTIFACTS.items():
        data = bundle[key]
        if type(data) is not bytes or not 0 < len(data) <= limit:
            raise ValueError('Cloud response exceeds its exact artifact/resource contract')
        header[key] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    validate_header(header)
    yield header
    for key in ARTIFACTS:
        for index, offset in enumerate(range(0, len(bundle[key]), CHUNK)):
            yield {'kind': 'chunk', 'name': key, 'index': index, 'data': bundle[key][offset:offset+CHUNK]}
    yield {'kind': 'complete'}


async def receive_bundle(stream, output, receipt, save):
    header = await anext(stream, None)
    validate_header(header)
    output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    receipt.update(artifact_status='partial-unadmitted', output_path=str(output),
                   received_bytes={key: 0 for key in ARTIFACTS},
                   **{key: header[key] for key in METADATA})
    save()
    for key, (filename, _) in ARTIFACTS.items():
        digest = hashlib.sha256()
        with (output/(filename+'.partial')).open('xb') as file:
            for index, offset in enumerate(range(0, header[key]['bytes'], CHUNK)):
                record = await anext(stream, None)
                size = min(CHUNK, header[key]['bytes']-offset)
                if (type(record) is not dict or set(record) != {'kind', 'name', 'index', 'data'}
                        or record['kind'] != 'chunk' or record['name'] != key
                        or type(record['index']) is not int or record['index'] != index
                        or type(record['data']) is not bytes or len(record['data']) != size):
                    raise ValueError('Missing, reordered, oversized or unexpected chunk')
                file.write(record['data']); file.flush()
                digest.update(record['data'])
                receipt['received_bytes'][key] += size
                save()
        if digest.hexdigest() != header[key]['sha256']:
            raise ValueError('Artifact digest mismatch')
    terminal = await anext(stream, None)
    if type(terminal) is not dict or terminal != {'kind': 'complete'}:
        raise ValueError('Stream ended without completion')
    sentinel = object()
    if await anext(stream, sentinel) is not sentinel:
        raise ValueError('Unexpected record after completion')
    # Only fully received, hashed streams acquire the canonical artifact names.
    for key, (filename, _) in ARTIFACTS.items():
        (output/(filename+'.partial')).rename(output/filename)
    receipt.update(status='returned-unadmitted', artifact_status='returned-unadmitted',
                   **{key+'_sha256': header[key]['sha256'] for key in ARTIFACTS})
    save()
