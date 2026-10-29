"""Bounded FFS panorama admission for the Argus pilot; no model or cloud work on import."""
import copy
import hashlib
import io
import json
from pathlib import Path
import re
import struct
import tempfile
import zlib

MAX_PIXELS = 20288 * 10144
SOURCE = {
    'url': 'https://zenodo.org/api/records/17164106/files/th_0021-0040.zip/content',
    'archive_bytes': 42264875521,
    'name': 'th_0021-0040/scan/th_0028/pano_th_0028_coul_full.png',
    'start': 14421625759, 'end': 14630433661, 'bytes': 208807902, 'crc32': 2548873164,
}


ARGUS_REVISION = 'a7333c0a6d1e370260ebf47ac0f8adce272f3083'
SOURCE_SHA256 = '7729a11c25a7f72c56c1b88ad4071c848078474611f2778fa9acc8c3bc654708'


def validate_source_admission(admission, input_sha256):
    """Validate a trusted owner's source record, not review authenticity or job authority.

    The caller must obtain the current review and calibration evidence from its trusted
    store, verify the evidence bytes/hash, and supply the actual image hash. A model's
    self-authored record is not approval. Dimensions and mapping require that review;
    this function neither decodes pixels nor establishes calibration from a 2:1 raster.
    """
    fields = {'kind', 'input_sha256', 'argus_revision', 'width', 'height', 'projection',
              'calibration', 'valid_region', 'review'}
    if type(admission) is not dict or set(admission) != fields:
        raise ValueError('Unknown or missing source admission fields')
    if (type(input_sha256) is not str or not re.fullmatch('[a-f0-9]{64}', input_sha256)
            or admission['input_sha256'] != input_sha256):
        raise ValueError('Source admission hash mismatch')
    if (admission['kind'] != 'eva-ffs-argus-source-admission-v1'
            or admission['argus_revision'] != ARGUS_REVISION
            or admission['projection'] != 'equirectangular'):
        raise ValueError('Unsupported source projection or Argus revision')
    width, height = admission['width'], admission['height']
    if (type(width) is not int or type(height) is not int or width <= 0 or height <= 0
            or width != height * 2 or width * height > MAX_PIXELS):
        raise ValueError('Unbounded or cropped source dimensions')
    calibration = admission['calibration']
    mapping = {'longitude_origin_degrees': -180, 'latitude_origin_degrees': -90,
               'horizontal_fov_degrees': 360, 'vertical_fov_degrees': 180}
    if (type(calibration) is not dict
            or set(calibration) != set(mapping) | {'input_sha256', 'evidence_sha256', 'pixel_origin'}):
        raise ValueError('Unknown or missing calibration fields')
    if (calibration['input_sha256'] != input_sha256
            or type(calibration['evidence_sha256']) is not str
            or not re.fullmatch('[a-f0-9]{64}', calibration['evidence_sha256'])
            or calibration['pixel_origin'] != 'upper-left-edge'
            or any(type(calibration[key]) not in (int, float) or calibration[key] != value
                   for key, value in mapping.items())):
        raise ValueError('Missing source-bound calibration or unsupported spherical mapping')
    region = admission['valid_region']
    if (type(region) is not dict or set(region) != {'kind', 'x', 'y', 'width', 'height'}
            or region['kind'] != 'rectangle'
            or any(type(region[key]) is not int for key in ('x', 'y', 'width', 'height'))):
        raise ValueError('Unknown or invalid valid-region mask')
    x, y, w, h = (region[key] for key in ('x', 'y', 'width', 'height'))
    if x < 0 or y < 0 or w <= 0 or h <= 0 or x + w > width or y + h > height:
        raise ValueError('Valid-region mask exceeds source bounds')
    # Pinned Argus.forward(images) has no input mask; confidence filtering is output-only.
    # https://github.com/realsee-developer/Argus/blob/a7333c0a6d1e370260ebf47ac0f8adce272f3083/argus/models/argus.py
    if (x, y, w, h) != (0, 0, width, height):
        raise ValueError('Argus cannot respect a partial valid region; source remains unadmitted')
    review = admission['review']
    if (type(review) is not dict or set(review) != {'reviewer', 'decision', 'admission_sha256'}
            or review['reviewer'] != 'owner' or review['decision'] != 'approved'):
        raise ValueError('Current owner source review required')
    body = {key: value for key, value in admission.items() if key != 'review'}
    digest = hashlib.sha256(json.dumps(body, sort_keys=True, separators=(',', ':'),
                                      allow_nan=False).encode()).hexdigest()
    if review['admission_sha256'] != digest:
        raise ValueError('Owner review does not bind this source admission')
    return copy.deepcopy(admission)


def panorama_header(raw):
    """Inspect only PNG's first 33 bytes; a 2:1 raster does not prove spherical calibration."""
    if (len(raw) != 33 or raw[:16] != b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR'
            or zlib.crc32(raw[12:29]) != struct.unpack('>I', raw[29:33])[0]):
        raise ValueError('Invalid PNG IHDR or checksum')
    width, height, depth, colour, compression, filtering, interlace = struct.unpack('>IIBBBBB', raw[16:29])
    if not width or not height or width * height > MAX_PIXELS:
        raise ValueError('Panorama raster exceeds the pixel bound')
    if width != 2 * height:
        raise ValueError('Expected a 2:1 panorama; never stretch a cropped raster')
    if (depth, colour, compression, filtering, interlace) != (8, 2, 0, 0, 0):
        raise ValueError('Unreviewed panorama encoding; expected non-interlaced 8-bit RGB PNG')
    return {'width': width, 'height': height, 'projection_verified': False,
            'meaning': '2:1 raster only; spherical coverage and missing regions require review'}


def plan_bottom_crop(native_height, valid_rows):
    """Propose a bottom-only crop, not source approval; caller must verify the full-width rectangle.

    Applies only to a full 2:1 panorama downsampled with cv2.INTER_AREA to 560x280.
    Keeping row 42 preserves pinned Argus's unprojection; no crop resize or recentering.
    """
    if (type(native_height) is not int or not 280 <= native_height <= 10144
            or type(valid_rows) is not list or len(valid_rows) != 2
            or any(type(row) is not int for row in valid_rows)
            or not 0 <= valid_rows[0] < valid_rows[1] <= native_height):
        raise ValueError('Invalid native dimensions or valid-row bounds')
    top = 42
    # Area downsampling uses the whole source footprint, not just a target pixel centre.
    safe_stop = min(238, valid_rows[1] * 280 // native_height)
    stop = top + (safe_stop - top) // 14 * 14
    footprint = [top * native_height // 280, (stop * native_height + 279) // 280]
    if stop <= top or footprint[0] < valid_rows[0]:
        raise ValueError('No safe full patch at the pinned top offset')
    return {
        'full_grid': [560, 280], 'crop_rows': [top, stop],
        'native_row_footprint': footprint,
        'unknown_grid_rows': [[0, top], [stop, 280]],
        'source_admitted': False,
    }


def inspect_padding(image):
    """Cloud-only on native real media; exact white is a candidate, never a validity mask."""
    width, height = image.size
    if not 0 < width * height <= MAX_PIXELS or width != height * 2:
        raise ValueError('Panorama dimensions exceed the bound or are not 2:1')
    if image.mode != 'RGB':
        raise ValueError('Expected RGB panorama pixels')
    first = height
    while first:
        with image.crop((0, first - 1, width, first)) as row:
            if row.getextrema() != ((255, 255), (255, 255), (255, 255)):
                break
        first -= 1
    return {
        'width': width, 'height': height, 'row_convention': 'half-open native rows',
        'candidate_padding_rows': [first, height] if first < height else None,
        'unclassified_rows': [0, first] if first else None,
        'projection_verified': False, 'source_admitted': False,
        'unsupported_geometry': 'unknown; no geometry emitted',
    }


def inspect_panorama(path, *, regions=False):
    """Cloud-only on real media; preserve the original and return a bounded review preview."""
    from PIL import Image
    if type(regions) is not bool:
        raise ValueError('Invalid inspection mode')
    if path.is_symlink() or not 33 < path.stat().st_size <= 208807902:
        raise ValueError('Invalid panorama file or byte bound')
    digest = hashlib.sha256()
    with path.open('rb') as source:
        report = panorama_header(source.read(33))
        source.seek(0)
        for block in iter(lambda: source.read(1024**2), b''):
            digest.update(block)
    limit = Image.MAX_IMAGE_PIXELS
    try:
        # The known source exceeds Pillow's default; validate its bounded IHDR before raising the limit.
        Image.MAX_IMAGE_PIXELS = MAX_PIXELS
        with Image.open(path) as image:
            image.verify()
        with Image.open(path) as image:
            image.load()
            if image.size != (report['width'], report['height']) or image.mode != 'RGB':
                raise ValueError('Decoded panorama disagrees with its header')
            if regions:
                report['padding'] = inspect_padding(image)
            image.thumbnail((2048, 1024), Image.Resampling.LANCZOS)
            preview = io.BytesIO()
            image.save(preview, 'JPEG', quality=85)
    finally:
        Image.MAX_IMAGE_PIXELS = limit
    data = preview.getvalue()
    if not 0 < len(data) <= 1024**2:
        raise ValueError('Preview exceeds return bound')
    report.update(sha256=digest.hexdigest(), bytes=path.stat().st_size)
    return report, data


def worker(source, *, regions=False):
    if type(regions) is not bool:
        raise ValueError('Invalid inspection mode')
    if source != SOURCE:
        raise ValueError('Unreviewed source')
    from ffs_fetch import stream_member
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / 'source.png'
        with path.open('xb') as output:
            count = stream_member(source['url'], source['archive_bytes'], source['start'], source['end'],
                                  source['crc32'], output)
        if count != source['bytes']:
            raise ValueError('Source byte count changed')
        info, preview = inspect_panorama(path, regions=regions)
        if regions and info['sha256'] != SOURCE_SHA256:
            raise ValueError('Source hash differs from the preserved preflight')
        if (info['width'], info['height']) != (20288, 10144):
            raise ValueError('Source dimensions changed')
        kind = 'eva-ffs-argus-regions-result-v1' if regions else 'eva-ffs-argus-preflight-result-v1'
        report = {'kind': kind, 'source': source, 'input': info,
                  'preview': {'bytes': len(preview), 'sha256': hashlib.sha256(preview).hexdigest()},
                  'source_admitted': False, 'inference_run': False}
        yield 'preview.jpg', preview
        yield 'report.json', json.dumps(report, allow_nan=False).encode()
