"""Stage supplied image data only; never execute the downloaded prototype.
Run with python -I from the repository, passing source assets and a NEW destination.
"""
import argparse
import hashlib
import json
import shutil
from pathlib import Path
from PIL import Image, ImageDraw

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
parser.add_argument('destination', type=Path)
parser.add_argument('evidence', type=Path)
a = parser.parse_args()
if a.destination.exists():
    raise SystemExit('Refusing to overwrite an existing asset pack')
rows = [('backdrop', 'Residual background', -53), ('cafe', 'Café', -24),
        ('bookshop', 'Bookshop', -21), ('pavement', 'Pavement', -13),
        ('waiter_left', 'Rear figure — left', -6), ('waiter_right', 'Rear figure — right', -5),
        ('street_sign', 'Street sign', 1), ('patio', 'Café furniture', 5),
        ('figure_woman', 'Foreground figure — left', 12), ('figure_man', 'Foreground figure — right', 13)]
files = ['paris-clean.png'] + [f'layers/{row[0]}.png' for row in rows]
images = {}
for name in files:
    with Image.open(a.source / name) as image:
        if image.size != (848, 430):
            raise SystemExit(f'Unexpected dimensions: {name}: {image.size}')
        if name.startswith('layers/') and image.mode != 'RGBA':
            raise SystemExit(f'Missing alpha channel: {name}')
        image.load()
        images[name] = image.convert('RGBA')
a.destination.mkdir(parents=True)
(a.destination / 'layers').mkdir()
a.evidence.mkdir(parents=True, exist_ok=True)
assets = []
for name in files:
    shutil.copyfile(a.source / name, a.destination / name)
    data = (a.destination / name).read_bytes()
    assets.append({'file': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
                   'alphaBounds': images[name].getchannel('A').getbbox()})
manifest = {'version': 1, 'id': 'scene:paris-hybrid-r11', 'title': 'Paris / Fragment',
            'width': 848, 'height': 430, 'reference': 'paris-clean.png',
            'layers': [{'id': id, 'label': label, 'image': f'layers/{id}.png', 'relativeDepth': z}
                       for id, label, z in rows]}
(a.destination / 'scene.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
# Show the ACTUAL alpha output over black, not the RGB hidden in transparent pixels.
sheet = Image.new('RGB', (1060, 280), '#080a0b')
draw = ImageDraw.Draw(sheet)
composite = Image.new('RGBA', (848, 430), (0, 0, 0, 255))
for i, (id, label, _) in enumerate(rows):
    image = images[f'layers/{id}.png']
    composite = Image.alpha_composite(composite, image)
    view = Image.new('RGBA', image.size, (0, 0, 0, 255))
    view = Image.alpha_composite(view, image).convert('RGB').resize((204, 104))
    x, y = (i % 5) * 212, (i // 5) * 140
    sheet.paste(view, (x, y))
    draw.text((x+4, y+111), id, fill='#dddccd')
sheet.save(a.evidence / 'contact-sheet.png')
composite.convert('RGB').save(a.evidence / 'supplied-alpha-composite.png')
images['paris-clean.png'].convert('RGB').save(a.evidence / 'selected-clean-plate.png')
(a.evidence / 'asset-provenance.json').write_text(json.dumps({
    'origin': 'Owner-supplied Paris_Fragment_ThreeJS_Prototype/public/assets',
    'sourceType': 'Source-derived generated artwork; not verified historical photography',
    'rights': 'Owner-supplied for local implementation; distribution rights not independently verified',
    'transformation': 'Byte-identical runtime PNG copies; contact sheet and comparison images composited for review only',
    'assets': assets}, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'staged': len(files), 'manifest': str(a.destination / 'scene.json'), 'contactSheet': str(a.evidence / 'contact-sheet.png')}))
