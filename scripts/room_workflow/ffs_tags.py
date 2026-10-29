"""Offline yellow-marker candidates. Colour detects a marker, never its printed number."""
import argparse
import hashlib
import itertools
import json
from pathlib import Path

import numpy as np

SCAN_SHA256 = 'f72bf4ff75ee242e4327d442e02ae9bb11ee779ba2b0c8684efe0ab571e984c0'


def read_scan(path):
    path = Path(path)
    if path.stat().st_size > 12 * 1024**2:
        raise ValueError('Only the bounded reduced scan is supported')
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != SCAN_SHA256:
        raise ValueError('Scan hash mismatch')
    header, payload = data.split(b'end_header\n', 1)
    if b'format binary_little_endian 1.0' not in header or len(payload) != 712312 * 15:
        raise ValueError('Unexpected PLY format')
    vertices = np.frombuffer(payload, dtype=[('xyz', '<f4', 3), ('rgb', 'u1', 3)])
    return vertices['xyz'].astype(np.float64), vertices['rgb']


def detect_markers(xyz, rgb, cell_m=.025, min_points=6):
    xyz, rgb = np.asarray(xyz), np.asarray(rgb)
    if xyz.ndim != 2 or xyz.shape[1] != 3 or rgb.shape != xyz.shape or not np.isfinite(xyz).all() or not np.isfinite(rgb).all():
        raise ValueError('Expected finite matching Nx3 positions and colours')
    if cell_m <= 0 or min_points < 1 or (rgb < 0).any() or (rgb > 255).any():
        raise ValueError('Invalid clustering settings or RGB range')
    colour = rgb.astype(float) / 255
    high, low = colour.max(axis=1), colour.min(axis=1)
    delta = high - low
    # Yellow has R or G as the maximum; the other hue sectors cannot pass this gate.
    hue = np.full(len(xyz), -1.)
    red = (delta > 0) & (colour[:, 0] == high)
    green = (delta > 0) & ~red & (colour[:, 1] == high)
    hue[red] = ((colour[red, 1] - colour[red, 2]) / delta[red]) % 6 / 6
    hue[green] = ((colour[green, 2] - colour[green, 0]) / delta[green] + 2) / 6
    saturation = np.divide(delta, high, out=np.zeros_like(high), where=high > 0)
    points = xyz[(hue >= .10) & (hue <= .20) & (saturation >= .45) & (high >= .25)]
    cells = {}
    for i, cell in enumerate(np.floor(points / cell_m).astype(np.int64)):
        cells.setdefault(tuple(cell), []).append(i)
    offsets = list(itertools.product((-1, 0, 1), repeat=3))
    clusters = []
    while cells:
        seed = next(iter(cells))
        stack, indices = [seed], cells.pop(seed)
        while stack:
            cell = stack.pop()
            for offset in offsets:
                neighbour = tuple(cell[k] + offset[k] for k in range(3))
                if neighbour in cells:
                    indices.extend(cells.pop(neighbour))
                    stack.append(neighbour)
        if len(indices) >= min_points:
            group = points[indices]
            clusters.append({'centroid': group.mean(axis=0).tolist(), 'point_count': len(group),
                             'bounds_min': group.min(axis=0).tolist(), 'bounds_max': group.max(axis=0).tolist(),
                             'tag': None, 'label': 'unidentified marker', 'photos': [], 'numbering': None})
    clusters.sort(key=lambda c: c['centroid'])
    for i, cluster in enumerate(clusters):
        cluster['id'] = f'marker-{i + 1:02d}'
    return clusters


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scan', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    xyz, rgb = read_scan(args.scan)
    result = {'version': 1, 'scene': 'th_0028', 'scan_sha256': SCAN_SHA256,
              'coordinates': 'local scanner metres, z up',
              'detection': {'hue': [.10, .20], 'saturation_min': .45, 'value_min': .25, 'cell_m': .025, 'min_points': 6},
              'markers': detect_markers(xyz, rgb), 'crop': None}
    with Path(args.output).open('x', encoding='utf-8') as f:
        json.dump(result, f, indent=2, allow_nan=False)
        f.write('\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
