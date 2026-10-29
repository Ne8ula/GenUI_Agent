import importlib.util
from pathlib import Path
import unittest
import numpy as np


class MarkerTests(unittest.TestCase):
    def test_yellow_connected_clusters_keep_unmatched_and_ignore_other_colours(self):
        path = Path(__file__).with_name('ffs_tags.py')
        self.assertTrue(path.exists(), 'Offline marker detector is not implemented')
        spec = importlib.util.spec_from_file_location('ffs_tags', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        patch = np.array([[x, y, 0] for x in [.0, .01, .02] for y in [.0, .01, .02]])
        xyz = np.concatenate([patch, patch + [1, 2, 3], patch + [4, 0, 0], [[8, 8, 8]]])
        rgb = np.array([[220, 200, 20]] * 18 + [[200, 40, 30]] * 9 + [[250, 220, 10]])
        clusters = module.detect_markers(xyz, rgb)
        self.assertEqual(len(clusters), 2)
        np.testing.assert_allclose(clusters[0]['centroid'], [.01, .01, 0])
        np.testing.assert_allclose(clusters[1]['centroid'], [1.01, 2.01, 3])
        self.assertEqual([c['point_count'] for c in clusters], [9, 9])
        self.assertTrue(all(c['label'] == 'unidentified marker' and c['tag'] is None for c in clusters))
        with self.assertRaises(ValueError):
            module.detect_markers(np.array([[float('nan'), 0, 0]]), np.array([[255, 255, 0]]))


if __name__ == '__main__':
    unittest.main()
