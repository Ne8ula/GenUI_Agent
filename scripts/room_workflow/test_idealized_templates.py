import copy
from collections import Counter
import unittest
import numpy as np

from idealized_fixture import accepted_inventory, packet
from idealized_templates import make_object
from idealized_room import make_shell


def object_spec(category):
    value = accepted_inventory()[0]
    value['category'] = category
    return value


def part_is_closed(part):
    mesh = part['geometry']
    faces = np.asarray(mesh['indices']).reshape(-1, 3)
    vertices = np.asarray(mesh['positions']).reshape(-1, 3)
    edges = Counter(tuple(sorted((int(a), int(b)))) for face in faces for a, b in zip(face, np.roll(face, -1)))
    triangles = vertices[faces]
    return all(n == 2 for n in edges.values()) and bool((np.linalg.norm(np.cross(
        triangles[:, 1]-triangles[:, 0], triangles[:, 2]-triangles[:, 0]), axis=1) > 0).all())


class TemplateTests(unittest.TestCase):
    def test_five_closed_families_follow_dimensions_and_black_palette(self):
        for category in ('table', 'chair', 'sofa', 'cabinet', 'bed'):
            for dimensions, color in (([1,.8,.7], [0,0,0]), ([2,1.2,1.4], [.2,.4,.8])):
                spec = object_spec(category)
                spec['dimensions'], spec['color_srgb'] = dimensions, color
                before = copy.deepcopy(spec)
                mesh = make_object(spec)
                self.assertEqual(spec, before)
                self.assertEqual(set(mesh['geometry']['provenance']), {'idealized-procedural'})
                self.assertTrue(all(part_is_closed(p) for p in mesh['parts']))
                points = np.asarray(mesh['geometry']['positions']).reshape(-1, 3)
                np.testing.assert_allclose(np.ptp(points, axis=0), dimensions)
                np.testing.assert_allclose(points.min(0), [-dimensions[0]/2,-dimensions[1]/2,0])
                np.testing.assert_allclose(np.asarray(mesh['geometry']['colors']).reshape(-1,3), np.tile(color,(len(points),1)))

    def test_unknown_or_invalid_family_never_falls_back(self):
        for change in ({'category':'unknown'}, {'dimensions':[0,1,1]}, {'dimensions':[True,1,1]},
                       {'color_srgb':[float('nan'),0,0]}, {'origin':'photo-estimated'}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                make_object({**object_spec('table'), **change})

    def test_concave_shell_caps_replace_wall_cells(self):
        source = packet('concave')
        openings = [{'id':'door-1','edge_index':0,'t0':.2,'t1':.4,'bottom':0,'top':2,'kind':'door'}]
        result = make_shell(source['boundary'], openings, [0,0,0])
        self.assertEqual(result['boundary'], source['boundary'])
        self.assertEqual(len(result['components']),2)
        self.assertEqual(result['components'][1]['origin'],'authored-door-cap')
        self.assertEqual(set(result['geometry']['colors']),{0})
        self.assertTrue(all(c['object_id'] is None for c in result['components']))
        mesh = result['geometry']
        triangles = np.asarray(mesh['positions']).reshape(-1,3)[np.asarray(mesh['indices']).reshape(-1,3)]
        for triangle, origin in zip(triangles,mesh['provenance']):
            if origin == 'authored-room-shell' and np.allclose(triangle[:,1],0):
                center = triangle.mean(0)
                self.assertFalse(.8 < center[0] < 1.6 and 0 < center[2] < 2)


if __name__ == '__main__':
    unittest.main()
