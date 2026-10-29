"""Bounded Argus point conversion; real-scene use belongs on Modal, never source admission."""
import numpy as np

from ffs_argus import validate_source_admission


def convert_scene(points, confidence, cameras, admission, *, input_sha256):
    """Consume depth-derived model-world float32 arrays after the producer's metric restoration.

    The trusted caller verifies current source review, actual image hash and producer settings,
    and separately retains raw depth/images/pose. This is not a decoder or an authority gate.
    Only the pinned default [42,238) crop is supported until partial-source admission exists.
    """
    reviewed = validate_source_admission(admission, input_sha256)
    for name, value, shape in (
        ('points', points, (1, 196, 560, 3)),
        ('confidence', confidence, (1, 196, 560)),
        ('cameras', cameras, (1, 3, 4)),
    ):
        if (type(value) is not np.ndarray or value.dtype != np.dtype('float32')
                or value.shape != shape or value.nbytes != int(np.prod(shape)) * 4):
            raise ValueError(f'Invalid bounded float32 {name} shape or dtype')
        if not np.isfinite(value).all():
            raise ValueError(f'Nonfinite {name}')
    if np.any(confidence < 1):
        raise ValueError('Argus depth confidence must be a score of at least one')
    rotation = cameras[0, :, :3].astype(np.float64)
    # Numerical tolerance for quaternion-derived float32 rotations, not geometric accuracy.
    if (not np.allclose(rotation.T @ rotation, np.eye(3), rtol=0, atol=1e-4)
            or not np.isclose(np.linalg.det(rotation), 1, rtol=0, atol=1e-4)):
        raise ValueError('Camera rotation must be proper and orthonormal')
    scores = confidence.reshape(-1)
    threshold = float(np.percentile(scores, 50, method='linear'))
    indices = np.flatnonzero(scores >= threshold).astype(np.uint32)
    return {
        'points': points.reshape(-1, 3)[indices],
        'confidence': scores[indices],
        'pixel_indices': indices,
        'cameras': cameras.copy(),
        'raw': {'points': points.copy(), 'confidence': confidence.copy()},
        'report': {
            'kind': 'eva-ffs-argus-scene-candidate-v1',
            'status': 'needs-review',
            'input_sha256': input_sha256,
            'admission_sha256': reviewed['review']['admission_sha256'],
            'argus_revision': reviewed['argus_revision'],
            'classification': 'inferred',
            'coordinate_frame': 'argus-model-world',
            'camera_convention': 'Pworld = R * Pcamera + t',
            'units': 'model-predicted metric scale; not independently verified',
            'scan_alignment': None,
            'complete_surface': False,
            'confidence_filter': {'percentile': 50, 'threshold': threshold},
            'points': int(len(indices)),
            'rejected_points': int(scores.size - len(indices)),
            'unknown_grid_rows': [[0, 42], [238, 280]],
            'limitations': [
                'Confidence is a model score, not probability or geometric accuracy.',
                'Omitted pixels and hidden surfaces remain unknown; no topology or filling.',
                'Conversion does not grant source admission, execution or candidate approval.',
            ],
        },
    }
