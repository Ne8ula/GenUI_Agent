"""Bounded complete furniture; authored proportions, not recovered hidden shape."""
import copy
import math

import numpy as np

from idealized_contract import VALIDATOR


OBJECT_VALIDATOR = VALIDATOR.evolve(schema={'$ref': '#/$defs/object'})
FACES = np.array([[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],
                  [1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]])


def make_object(spec):
    if next(OBJECT_VALIDATOR.iter_errors(spec), None) is not None:
        raise ValueError('Invalid furniture specification')
    if not all(type(v) in (int, float) and math.isfinite(v) for key in
               ('dimensions', 'translation', 'color_srgb') for v in spec[key]) or not math.isfinite(spec['yaw']):
        raise ValueError('Nonfinite furniture values')
    if spec['omitted']:
        raise ValueError('Omitted furniture must not be generated')
    w, d, h = spec['dimensions']
    parts = []
    geometry = {key: [] for key in ('positions', 'colors', 'indices', 'provenance')}

    def box(role, lo, hi):
        lo, hi = np.asarray(lo, float), np.asarray(hi, float)
        if (hi <= lo).any():
            raise ValueError('Invalid furniture proportions')
        points = np.array([[lo[0],lo[1],lo[2]], [hi[0],lo[1],lo[2]],
                           [hi[0],hi[1],lo[2]], [lo[0],hi[1],lo[2]],
                           [lo[0],lo[1],hi[2]], [hi[0],lo[1],hi[2]],
                           [hi[0],hi[1],hi[2]], [lo[0],hi[1],hi[2]]])
        mesh = {'positions': points.ravel().tolist(), 'colors': spec['color_srgb']*8,
                'indices': FACES.ravel().tolist(), 'provenance': [spec['origin']]*12}
        parts.append({'role': role, 'translation': ((lo+hi)/2).tolist(),
                      'dimensions': (hi-lo).tolist(), 'yaw': 0, 'geometry': mesh})
        base = len(geometry['positions'])//3
        geometry['positions'].extend(mesh['positions'])
        geometry['colors'].extend(mesh['colors'])
        geometry['indices'].extend((FACES+base).ravel().tolist())
        geometry['provenance'].extend(mesh['provenance'])

    def legs(width, top):
        for i, x in enumerate((-w/2, w/2-width)):
            for j, y in enumerate((-d/2, d/2-width)):
                box(f'leg-{i}-{j}', [x,y,0], [x+width,y+width,top])

    category = spec['category']
    if category == 'table':
        box('top', [-w/2,-d/2,.92*h], [w/2,d/2,h])
        legs(.06*min(w,d), .92*h)
    elif category == 'chair':
        box('seat', [-w/2,-d/2,.37*h], [w/2,d/2,.45*h])
        legs(.08*min(w,d), .37*h)
        box('back', [-w/2,.42*d,.45*h], [w/2,d/2,h])
    elif category == 'sofa':
        box('base', [-w/2,-d/2,0], [w/2,d/2,.2*h])
        box('seat', [-.38*w,-d/2,.2*h], [.38*w,.38*d,.4*h])
        box('left-arm', [-w/2,-d/2,.2*h], [-.38*w,.38*d,.7*h])
        box('right-arm', [.38*w,-d/2,.2*h], [w/2,.38*d,.7*h])
        box('back', [-w/2,.38*d,.2*h], [w/2,d/2,h])
    elif category == 'cabinet':
        box('body', [-w/2,-.46*d,0], [w/2,d/2,h])
        box('left-front', [-w/2,-d/2,0], [0,-.46*d,h])
        box('right-front', [0,-d/2,0], [w/2,-.46*d,h])
    elif category == 'bed':
        box('plinth', [-w/2,-d/2,0], [w/2,.42*d,.25*h])
        box('mattress', [-w/2,-d/2,.25*h], [w/2,.42*d,.55*h])
        box('headboard', [-w/2,.42*d,0], [w/2,d/2,h])
    return {'object': copy.deepcopy(spec), 'geometry': geometry, 'parts': parts}
