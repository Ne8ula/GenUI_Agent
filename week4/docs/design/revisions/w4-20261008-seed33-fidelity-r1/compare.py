"""Compose actual seed33 browser captures beside their selected references.

python compare.py --capture <capture after directory> --motion <idle key directory> --output <new output directory>
No image synthesis or appearance correction is performed. References are only
resized/letterboxed for comparison. Image similarity is not motion acceptance.
"""
import argparse
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

HERE = Path(__file__).resolve().parent
ORIGINAL = HERE.parent / 'w4-20261008-paris-c-hybrid'
FONT = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 22)


def panel(path, label, size=(960, 540)):
    source = Image.open(path).convert('RGB')
    image = Image.new('RGB', (size[0], size[1] + 36), '#fff5ed')
    ImageDraw.Draw(image).text((10, 6), label, font=FONT, fill='#211712')
    fit = ImageOps.contain(source, size, Image.Resampling.LANCZOS)
    image.paste(fit, ((size[0] - fit.width) // 2, 36 + (size[1] - fit.height) // 2))
    return image


def join(cells, columns, path):
    w, h = cells[0].size
    result = Image.new('RGB', (columns * w, ((len(cells) + columns - 1) // columns) * h), '#fff5ed')
    for i, cell in enumerate(cells):
        result.paste(cell, ((i % columns) * w, (i // columns) * h))
    result.save(path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--capture', required=True, type=Path)
    parser.add_argument('--motion', type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    if args.output.exists() and any(args.output.iterdir()):
        raise SystemExit('Use an empty comparison directory; historical evidence is immutable.')
    args.output.mkdir(parents=True, exist_ok=True)
    still = ORIGINAL / 'references/images/img-13-bwa3c-seed33.png'
    before = HERE / 'implementation/before/after/webgl2-seed33-build-100pct.png'
    after = args.capture / 'webgl2-seed33-build-100pct.png'
    join([panel(still, 'Selected seed 33'), panel(before, 'Before: build complete'), panel(after, 'After: build complete')], 3, args.output / 'complete-before-after.png')

    crops = [('Figure', (.32, .34, .41, .77)), ('Cup', (.63, .72, .81, .97)),
             ('Chair', (0, .48, .23, .98)), ('Left architecture', (.20, .01, .45, .34)),
             ('Right tiles', (.71, .06, .98, .45)), ('Table and ashtray', (.22, .74, .53, .99))]
    rows = []
    for name, box in crops:
        for source, label in [(still, 'Reference'), (before, 'Before'), (after, 'After')]:
            img = Image.open(source).convert('RGB')
            crop = img.crop(tuple(round(c * (img.width if i % 2 == 0 else img.height)) for i, c in enumerate(box)))
            cell = Image.new('RGB', (480, 436), '#fff5ed')
            ImageDraw.Draw(cell).text((10, 6), f'{name} — {label}', font=FONT, fill='#211712')
            fit = ImageOps.contain(crop, (480, 400), Image.Resampling.LANCZOS)
            cell.paste(fit, ((480 - fit.width) // 2, 36 + (400 - fit.height) // 2))
            rows.append(cell)
    join(rows, 3, args.output / 'detail-before-after.png')
    if args.motion:
        times = [0, 1250, 2500, 3750, 4960]
        cells = []
        for i, ms in enumerate(times):
            cells.append(panel(ORIGINAL / f'references/videos/vid-02-key-{i+1:02d}.png', f'VB2 {ms / 1000:.2f}s', (480, 270)))
        for ms in times:
            cells.append(panel(args.motion / f'idle-{ms:04d}.png', f'Live scene idle +{ms / 1000:.2f}s', (480, 270)))
        join(cells, 5, args.output / 'motion-aligned.png')
    print(f'Comparison sheets written to {args.output}')


if __name__ == '__main__':
    main()
