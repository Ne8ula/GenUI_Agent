"""Prepare bounded, image-derived scan samples; no learned or measured depth."""
from pathlib import Path
import argparse
import hashlib
import json
import math
import struct
from PIL import Image, ImageFilter

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
if args.output.exists():
    raise SystemExit('Use a new output directory; existing evidence/assets are immutable.')
im = Image.open(args.source).convert('RGB')
w, h = im.size
if (w, h) != (3392, 1720):
    raise SystemExit('Expected approved 3392x1720 master')
pixels = im.load()
gray = im.convert('L').filter(ImageFilter.GaussianBlur(1.2))
g = gray.load()
# The inferred depth is only a shallow illustrative relief. Foreground silhouettes
# stay in source alignment; it is not a depth estimate from an ML model.
def depth(x, y):
    u, v = x / w, y / h
    if v > .80:
        return .08 + (v - .8) * .9
    if .43 < u < .63 and v > .59:
        return .22
    return -.10 + .12 * v + .025 * math.sin(u * 5)

def random01(x, y, salt):
    n = ((x * 73856093) ^ (y * 19349663) ^ (salt * 83492791)) & 0xffffffff
    n = ((n ^ (n >> 13)) * 1274126177) & 0xffffffff
    return (n ^ (n >> 16)) / 4294967295

def linear(v):
    v = v / 255
    return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4

records = []
counts = [0, 0, 0, 0]
def add(x, y, kind, size, angle=0):
    r, green, b = pixels[x, y]
    lum = .2126 * r + .7152 * green + .0722 * b
    if max(r, green, b) < 24 or lum < 12:
        return
    seed = random01(x, y, kind + 17)
    # Mostly pale cyan with occasional material colour, not a painted scene.
    bright = .40 + .60 * (lum / 255) ** .55
    accent = (b > r * 1.15 or (r > green * 1.4 and b > green * 1.2)) and seed < .28
    colour = [linear(c) for c in (r, green, b)] if accent else [bright * .40, bright * .76, bright]
    records.extend([(x / w - .5) * 2, (.5 - y / h) * 2 * h / w, depth(x, y), *colour, float(kind), size, seed, angle])
    counts[kind] += 1

bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
for y in range(3, h - 3, 3):
    for x in range(3, w - 3, 3):
        lum = g[x, y]
        if lum < 15:
            continue
        dx = float(g[x + 2, y]) - g[x - 2, y]
        dy = float(g[x, y + 2]) - g[x, y - 2]
        edge = math.hypot(dx, dy)
        rand = random01(x, y, 3)
        if edge > 25 and rand < .72:
            add(x, y, 3, 2.3 + min(edge / 90, 1.3), math.atan2(dy, dx) + math.pi / 2)
        elif rand < .19:
            add(x, y, 0, .8 + random01(x, y, 4) * .9)
        if x % 9 == 3 and y % 9 == 3 and edge < 40 and rand < .24:
            add(x, y, 1, 3.0 + rand * 9)
        if x % 6 == 3 and y % 6 == 3 and lum / 255 > (bayer[(y // 6) % 4][(x // 6) % 4] + .5) / 16 and rand < .23:
            add(x, y, 2, 1.7)

count = sum(counts)
if count > 240000:
    raise SystemExit(f'Sample budget exceeded: {count}')
args.output.mkdir(parents=True)
binary = struct.pack('<' + 'f' * len(records), *records)
(args.output / 'points.bin').write_bytes(binary)
manifest = {
    'version': 1, 'id': 'paris-scan-r12', 'width': w, 'height': h,
    'stride': 10, 'count': count, 'counts': dict(zip(['points', 'splats', 'dither', 'edges'], counts)),
    'data': '/assets/paris-scan-r12/points.bin', 'sha256': hashlib.sha256(binary).hexdigest(),
    'sourceSha256': hashlib.sha256(args.source.read_bytes()).hexdigest(),
    'provenance': 'Owner-approved Topaz upscale c074e96b-1962-4372-9899-6b0547eef72e; image-derived samples, authored shallow depth, not SLAM/LiDAR or trained 3D Gaussian splatting.',
}
(args.output / 'scene.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print(json.dumps(manifest, indent=2))
