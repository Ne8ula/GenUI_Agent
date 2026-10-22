"""Timestamp-only diagnostics; never selects a pose, decodes pixels or admits a source."""
from bisect import bisect_left, bisect_right
from decimal import Decimal
import hashlib
import json
import math
import re


def capture(data, binding, targets):
    if (type(data) is not bytes or not 0 < len(data) <= 2*1024**2
            or set(binding) != {'bytes', 'sha256'} or type(binding['bytes']) is not int
            or len(data) != binding['bytes'] or hashlib.sha256(data).hexdigest() != binding['sha256']):
        raise ValueError('Trajectory differs from approved binding')
    report = json.dumps(inspect_timestamps(data, targets), allow_nan=False).encode()
    if len(report) > 65536:
        raise ValueError('Diagnostic report bound')
    yield report


def inspect_timestamps(data, targets):
    if type(data) is not bytes or not 0 < len(data) <= 2*1024**2:
        raise ValueError('Trajectory byte limit')
    if (type(targets) is not list or not 1 <= len(targets) <= 6
            or any(type(t) is not str or re.fullmatch(r'\d{1,9}\.\d{3}', t) is None for t in targets)
            or len(set(targets)) != len(targets)):
        raise ValueError('Expected one to six distinct millisecond timestamps')
    try:
        rows = data.decode('ascii').splitlines()
    except UnicodeError as error:
        raise ValueError('Invalid trajectory encoding') from error
    if not 1 <= len(rows) <= 100000:
        raise ValueError('Trajectory row limit')
    times = {}
    for row in rows:
        fields = row.split()
        if (len(row) > 1024 or len(fields) != 7
                or re.fullmatch(r'\d{1,9}(?:\.\d{1,15})?', fields[0]) is None):
            raise ValueError('Invalid trajectory timestamp/row')
        values = [float(field) for field in fields[1:]]
        if any(not math.isfinite(value) or abs(value) > 10000 for value in values):
            raise ValueError('Invalid trajectory rotation/translation')
        timestamp = Decimal(fields[0])
        if timestamp in times:
            raise ValueError('Duplicate trajectory timestamp')
        times[timestamp] = fields[0]
    ordered = sorted(times)
    views = []
    for target in targets:
        time = Decimal(target)
        left, right = bisect_left(ordered, time), bisect_right(ordered, time)
        before = ordered[right-1] if right else None
        after = ordered[left] if left < len(ordered) else None
        neighbors = sorted({t for t in (before, after) if t is not None})
        residual = min(abs(t-time) for t in neighbors)
        nearest = [times[t] for t in neighbors if abs(t-time) == residual]
        views.append({'timestamp': target, 'before': times[before] if before is not None else None,
            'after': times[after] if after is not None else None,
            'bracket_span_seconds': str(after-before) if before is not None and after is not None else None,
            'nearest_timestamps': nearest, 'nearest_residual_seconds': str(residual),
            'within_existing_5ms_gate': residual <= Decimal('.005') and len(nearest) == 1})
    return {'kind': 'eva-scan-correspondence-v1', 'status': 'diagnostic-only', 'source_admitted': False,
        'trajectory_sha256': hashlib.sha256(data).hexdigest(), 'rows': len(rows),
        'first_timestamp': times[ordered[0]], 'last_timestamp': times[ordered[-1]], 'views': views,
        'limitations': ['Bracketing samples do not establish clock mapping or physical registration.',
                        'No pose interpolation, changed tolerance, image decoding or source admission.']}
