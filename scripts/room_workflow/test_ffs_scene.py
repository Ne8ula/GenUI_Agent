import asyncio
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np

from ffs_scene import ply_bytes, voxel_reduce
import ffs_scene_cloud


class ReductionTests(unittest.TestCase):
    def test_voxel_average_fits_cap_and_keeps_colour(self):
        rng = np.random.default_rng(4)
        xyz = rng.uniform(0, 1, (5000, 3))
        rgb = np.tile([200.0, 20.0, 10.0], (5000, 1))
        points, colours, voxel = voxel_reduce(xyz, rgb, 100)
        self.assertLessEqual(len(points), 100)
        self.assertGreater(voxel, 0.01)
        self.assertTrue((colours == [200, 20, 10]).all())
        self.assertTrue(((points >= 0) & (points <= 1)).all())


async def stream(records):
    for record in records:
        yield record


class ReceiveTests(unittest.TestCase):
    def receive(self, ply, report):
        plan = {'member': {'name': 'm.las', 'bytes': 10}}
        with tempfile.TemporaryDirectory() as folder:
            return asyncio.run(ffs_scene_cloud.receive(stream([('chunk', ply), ('report', json.dumps(report))]),
                                                       plan, Path(folder)))

    def test_accepts_matching_report_and_rejects_tampering(self):
        ply = ply_bytes(np.zeros((3, 3), np.float32), np.zeros((3, 3), np.uint8))
        report = {'kind': 'eva-ffs-scene-reduction-v1', 'member': 'm.las', 'streamed_bytes': 10,
                  'ply_bytes': len(ply), 'ply_sha256': hashlib.sha256(ply).hexdigest(), 'points': 3}
        self.assertEqual(self.receive(ply, report)['points'], 3)
        for change in ({'points': 4}, {'ply_sha256': '0' * 64}, {'member': 'other.las'}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.receive(ply, {**report, **change})
        with self.assertRaises(ValueError):
            self.receive(ply + b'extra', {**report, 'ply_bytes': len(ply) + 5})


if __name__ == '__main__':
    unittest.main()
