import unittest

import numpy as np

from ffs_segment import _ransac, _vertical_structures, display, fit_plane, segment


def plane(a, b, fixed, axis):
    u, v = np.meshgrid(a, b, indexing='ij')
    points = np.column_stack((u.ravel(), v.ravel()))
    return np.insert(points, axis, fixed, axis=1)


def box(origin=(0.0, 0.0, 0.0)):
    xy = np.linspace(0, 0.4, 28)
    z = np.linspace(0, 0.8, 55)
    faces = [plane(xy, xy, h, 2) for h in (0, 0.8)]
    faces += [plane(xy, z, edge, axis) for axis in (0, 1) for edge in (0, 0.4)]
    return np.unique(np.concatenate(faces), axis=0) + origin


def scene(*objects):
    grid = np.arange(-40, 81) * 0.015
    floor = plane(grid, grid, 0, 2)
    wall = plane(grid, np.arange(161) * 0.015, 0.419, 1)
    points = np.concatenate((floor, wall, *objects))
    return points, len(floor), len(wall)


class SegmentTests(unittest.TestCase):
    def test_box_on_floor_by_wall(self):
        obj = box()
        points, floor_count, wall_count = scene(obj)
        original = points.copy()
        result = segment(points, {'box': np.array([0.2, 0.0, 0.4])})['box']
        indices = result['indices']
        self.assertEqual(indices.dtype, np.uint32)
        self.assertEqual(len(np.unique(indices)), len(indices))
        self.assertGreaterEqual(np.sum(indices >= floor_count + wall_count), 0.95 * len(obj))
        self.assertFalse(np.any((indices >= floor_count) & (indices < floor_count + wall_count)))
        contact = points[indices[indices < floor_count]]
        self.assertGreater(len(contact), 0)
        self.assertTrue(np.all((contact[:, :2] >= 0) & (contact[:, :2] <= 0.4)))
        self.assertTrue(np.all((contact[:, 2] >= 0) & (contact[:, 2] <= 0.03)))
        selected = points[indices]
        np.testing.assert_allclose(result['bbox'], [selected.min(axis=0), selected.max(axis=0)])
        self.assertAlmostEqual(result['height'], 0.8)
        self.assertEqual(result['count'], len(indices))
        self.assertEqual(result['flags'], ['no-support'])
        np.testing.assert_array_equal(points, original)

    def test_touching_objects_flag_overlap(self):
        points, _, _ = scene(box(), box((0.4, 0, 0)))
        seeds = {'first': np.array([0.2, 0, 0.4]), 'second': np.array([0.6, 0, 0.4])}
        result = segment(points, seeds)
        self.assertIn('overlap:first', result['second']['flags'])
        self.assertIn('overlap:second', result['first']['flags'])
        self.assertEqual(np.intersect1d(result['first']['indices'], result['second']['indices']).size, 0)

    def test_empty_marker_flagged(self):
        points, _, _ = scene(box())
        result = segment(points, {'missing': np.array([-0.5, -0.5, 0.5])})['missing']
        self.assertEqual(result['flags'], ['empty', 'marker-only', 'no-support', 'widened-seed'])
        self.assertEqual(result['seed_distance'], 0.0)
        self.assertEqual(result['count'], 0)
        self.assertEqual(result['indices'].dtype, np.uint32)
        self.assertEqual(result['bbox'], [[0.0, 0.0, 0.0], [0.0, 0.0, 0.0]])
        self.assertEqual(result['height'], 0.0)

    def test_reach_and_height_limits(self):
        x = np.arange(0.2, 2.0, 0.01)
        z = np.arange(0.8, 2.41, 0.01)
        arm = np.column_stack((x, np.full_like(x, 0.2), np.full_like(x, 1.1)))
        tower = np.column_stack((np.full_like(z, 0.2), np.full_like(z, 0.2), z))
        points, _, _ = scene(box(), arm, tower)
        seed = np.array([0.2, 0.2, 1.1])
        result = segment(points, {'large': seed})['large']
        selected = points[result['indices']]
        self.assertGreater(len(selected), 0)
        self.assertTrue(np.all(np.linalg.norm(selected - seed, axis=1) <= 1.2))
        self.assertTrue(np.all(selected[:, 2] <= 2.2))
        self.assertIn('oversized', result['flags'])
        self.assertTrue(np.all(np.linalg.norm(selected[:, :2] - seed[:2], axis=1) <= 0.5))
        self.assertTrue(np.all(selected[:, 2] <= 1.4))
        self.assertGreater(selected[:, 0].max(), 0.68)
        self.assertGreater(selected[:, 2].max(), 1.38)


    def test_two_adjacent_walls_and_shuffled_source_order(self):
        second_wall = plane(np.arange(-40, 81) * 0.015, np.arange(161) * 0.015, 0.419, 0)
        obj = box()
        points, floor_count, wall_count = scene(second_wall, obj)
        wall_end = floor_count + wall_count + len(second_wall)
        order = np.random.default_rng(7).permutation(len(points))
        seed = {'box': np.array([0.2, 0, 0.4])}
        result = segment(points[order], seed)['box']
        source_indices = order[result['indices']]
        self.assertGreaterEqual(np.sum(source_indices >= wall_end), 0.95 * len(obj))
        self.assertFalse(np.any((source_indices >= floor_count) & (source_indices < wall_end)))
        repeat = segment(points[order], seed)['box']
        np.testing.assert_array_equal(result['indices'], repeat['indices'])
        self.assertEqual(result['flags'], repeat['flags'])

    def test_floor_contact_band_does_not_spread_outside_footprint(self):
        contacts = np.array([[0.2, 0.2, 0.03], [0.2, 0.2, -0.01], [-0.01, 0.2, 0.01]])
        points, _, _ = scene(box(), contacts)
        indices = segment(points, {'box': np.array([0.2, 0, 0.4])})['box']['indices']
        self.assertIn(len(points) - 3, indices)
        self.assertNotIn(len(points) - 2, indices)
        self.assertNotIn(len(points) - 1, indices)

    def test_thin_object_above_plane_band_is_not_discarded(self):
        patch = plane(np.arange(1, 11) * 0.015, np.arange(1, 11) * 0.015, 0.02, 2)
        points, _, _ = scene(patch)
        indices = segment(points, {'thin': np.array([0.06, 0.06, 0.02])})['thin']['indices']
        self.assertEqual(np.sum(indices >= len(points) - len(patch)), len(patch))

    def test_diagonal_voxels_connect_but_disconnected_island_does_not(self):
        keys = np.column_stack((np.arange(10), np.arange(10), np.arange(40, 50)))
        diagonal = (keys + 0.5) * 0.015
        island = np.array([[0.4, 0.3, 0.7]])
        points, floor_count, wall_count = scene(diagonal, island)
        result = segment(points, {'line': diagonal[0]})['line']
        non_floor = result['indices'][result['indices'] >= floor_count]
        np.testing.assert_array_equal(non_floor, np.arange(floor_count + wall_count, len(points) - 1))
        self.assertEqual(result['flags'], ['no-support'])


class ReviewFixTests(unittest.TestCase):
    def test_ceiling_with_more_points_than_floor_is_not_the_floor(self):
        obj = box()
        ceiling = plane(np.arange(-100, 101) * 0.015, np.arange(-100, 101) * 0.015, 3.1, 2)
        points, floor_count, wall_count = scene(obj, ceiling)
        self.assertGreater(len(ceiling), floor_count)
        result = segment(points, {'box': np.array([0.2, 0, 0.4])})['box']
        indices = result['indices']
        start = floor_count + wall_count
        self.assertGreaterEqual(np.sum((indices >= start) & (indices < start + len(obj))), 0.95 * len(obj))
        self.assertFalse(np.any(indices >= start + len(obj)))

    def test_lowest_supported_plane_wins_within_floor_crop(self):
        floor = plane(np.arange(-20, 21) * 0.015, np.arange(-20, 21) * 0.015, 0, 2)
        platform = plane(np.arange(30, 81) * 0.015, np.arange(30, 81) * 0.015, 0.25, 2)
        obj = box()[::2] * [0.125, 0.125, 0.125] + [0, 0, 0.18]
        points = np.concatenate((floor, platform, obj))
        result = segment(points, {'clue': np.array([0.025, 0, 0.2])})['clue']
        self.assertGreaterEqual(np.sum(result['indices'] >= len(floor) + len(platform)), 0.95 * len(obj))

    def test_four_adjacent_walls_are_removed(self):
        grid = np.arange(-2, 43) * 0.01
        walls = np.concatenate([plane(grid, np.arange(161) * 0.015, edge, axis)
                                for axis in (0, 1) for edge in (-0.019, 0.419)])
        floor = plane(np.arange(-40, 81) * 0.015, np.arange(-40, 81) * 0.015, 0, 2)
        obj = box()
        points = np.concatenate((floor, walls, obj))
        indices = segment(points, {'box': np.array([0.2, 0, 0.1])})['box']['indices']
        self.assertFalse(np.any((indices >= len(floor)) & (indices < len(floor) + len(walls))))
        self.assertGreaterEqual(np.sum(indices >= len(floor) + len(walls)), 0.95 * len(obj))

    def test_raised_bottle_is_separated_from_stool_top(self):
        stool = box() * [1, 1, 0.625]
        bottle = box() * [0.2, 0.2, 0.3] + [0.16, 0.16, 0.5]
        points, floor_count, wall_count = scene(stool, bottle)
        seed = np.array([0.2, 0.16, 0.56])
        result = segment(points, {'bottle': seed})['bottle']
        indices = result['indices']
        bottle_start = floor_count + wall_count + len(stool)
        self.assertGreater(len(indices), 0.7 * len(bottle))
        self.assertTrue(np.all(indices >= bottle_start))
        self.assertGreater(points[indices, 2].min(), 0.515)
        self.assertAlmostEqual(result['seed_distance'], np.linalg.norm(points[indices] - seed, axis=1).min())

    def test_tent_excluded_and_adjacent_object_found_by_one_widening(self):
        tent = box() * [0.1, 0.1, 0.075]
        obj = box() * [0.1, 0.1, 0.15] + [0.13, 0, 0]
        halo = np.array([[0.05, 0.02, 0.05]])
        points, floor_count, wall_count = scene(tent, halo, obj)
        seed = np.array([0.02, 0.02, 0.04])
        bounds = {'clue': (np.array([0, 0, 0]), np.array([0.04, 0.04, 0.06]))}
        result = segment(points, {'clue': seed}, marker_bounds=bounds)['clue']
        indices = result['indices']
        tent_start = floor_count + wall_count
        obj_start = tent_start + len(tent) + len(halo)
        self.assertIn('widened-seed', result['flags'])
        self.assertNotIn('marker-only', result['flags'])
        self.assertFalse(np.any((indices >= tent_start) & (indices < obj_start)))
        non_contact = indices[(indices >= obj_start) & (points[indices, 2] > 0.015)]
        self.assertGreaterEqual(len(non_contact), 0.95 * np.sum(obj[:, 2] > 0.015))
        self.assertAlmostEqual(result['seed_distance'], np.linalg.norm(points[non_contact] - seed, axis=1).min())
        self.assertGreater(result['seed_distance'], 0.1)
        self.assertEqual(set(result), {'indices', 'bbox', 'height', 'count', 'flags', 'seed_distance'})
        np.testing.assert_array_equal(bounds['clue'][0], [0, 0, 0])

    def test_flat_object_in_floor_band_is_marker_only_and_empty(self):
        tent = box() * [0.1, 0.1, 0.075]
        flat = plane(np.arange(13, 18) * 0.01, np.arange(5) * 0.01, 0.005, 2)
        points, _, _ = scene(tent, flat)
        result = segment(points, {'clue': np.array([0.02, 0.02, 0.04])},
                         marker_bounds={'clue': ([0, 0, 0], [0.04, 0.04, 0.06])})['clue']
        self.assertEqual(result['count'], 0)
        self.assertEqual(result['seed_distance'], 0)
        self.assertEqual(set(result['flags']), {'empty', 'marker-only', 'widened-seed'})

    def test_seed_distance_excludes_restored_floor_contacts(self):
        patch = plane(np.array([0.045, 0.06, 0.075]), np.array([0.045, 0.06, 0.075]), 0.025, 2)
        points, floor_count, _ = scene(patch)
        seed = np.array([0.06, 0.06, 0.005])
        result = segment(points, {'clue': seed})['clue']
        self.assertTrue(np.any(result['indices'] < floor_count))
        self.assertAlmostEqual(result['seed_distance'], 0.02)
        self.assertLess(np.linalg.norm(points[result['indices']] - seed, axis=1).min(), result['seed_distance'])

    def test_initial_seed_success_and_widening_limit(self):
        tent = box() * [0.1, 0.1, 0.075]
        for x, expected_flags in ((0.09, []), (0.30, ['empty', 'marker-only', 'widened-seed'])):
            with self.subTest(object_x=x):
                obj = box() * [0.1, 0.1, 0.15] + [x, 0, 0]
                points, _, _ = scene(tent, obj)
                result = segment(points, {'clue': np.array([0.04, 0.02, 0.04])},
                                 marker_bounds={'clue': ([0, 0, 0], [0.04, 0.04, 0.06])})['clue']
                self.assertEqual(result['flags'], expected_flags)
                self.assertEqual(result['count'] == 0, bool(expected_flags))

    def test_invalid_marker_bounds_are_rejected(self):
        for bounds in (([0, 0], [1, 1]), ([1, 0, 0], [0, 1, 1]), ([0, 0, 0], [1, 1, np.inf])):
            with self.subTest(bounds=bounds), self.assertRaises(ValueError):
                segment(np.empty((0, 3)), {'clue': np.zeros(3)}, marker_bounds={'clue': bounds})


class NoiseAndSupportTests(unittest.TestCase):
    def test_noisy_tilted_floor_with_ceiling_has_stable_consensus(self):
        ceiling = plane(np.arange(-100, 101) * 0.015, np.arange(-100, 101) * 0.015, 3.1, 2)
        points, floor_count, _ = scene(box(), ceiling)
        angle = np.deg2rad(1)
        rotation = np.array([[np.cos(angle), 0, -np.sin(angle)], [0, 1, 0],
                             [np.sin(angle), 0, np.cos(angle)]])
        points = points @ rotation.T
        points[:floor_count, 2] += np.random.default_rng(29).normal(0, 0.005, floor_count)
        seed = np.array([0.2, 0, 0.4]) @ rotation.T
        normal, offset, _ = _ransac(points[points[:, 2] < seed[2] + 0.10], 0.015, 400, 0, 'floor')
        heights = points @ normal + offset
        self.assertGreaterEqual(np.mean(np.abs(heights[:floor_count]) <= 0.015), 0.95)
        indices = segment(points, {'box': seed})['box']['indices']
        self.assertGreater(len(indices), 0)
        contact_heights = heights[indices[indices < floor_count]]
        self.assertTrue(np.all((contact_heights >= 0) & (contact_heights <= 0.03)))

    def test_tent_height_selects_seat_not_eight_centimetre_cushion(self):
        seat = box() * [1.5, 1.5, 0.625] + [-0.25, -0.15, 0]
        cushion = box() * [0.75, 0.75, 0.10] + [0.04, 0.05, 0.5]
        tent = box() * [0.1, 0.1, 0.15] + [-0.04, 0.12, 0.5]
        points, floor_count, wall_count = scene(seat, cushion, tent)
        bounds = {'clue': ([-0.04, 0.12, 0.5], [0, 0.16, 0.62])}
        result = segment(points, {'clue': np.array([-0.01, 0.14, 0.58])}, marker_bounds=bounds)['clue']
        indices = result['indices']
        cushion_start = floor_count + wall_count + len(seat)
        cushion_end = cushion_start + len(cushion)
        self.assertGreater(len(indices), 0)
        self.assertTrue(np.all((indices >= cushion_start) & (indices < cushion_end)))
        self.assertGreaterEqual(len(indices), 0.95 * np.sum(cushion[:, 2] > 0.515))
        self.assertAlmostEqual(points[indices, 2].max(), 0.58)
        self.assertGreater(result['height'], 0.06)
        self.assertNotIn('no-support', result['flags'])

    def test_marker_support_height_bounds_are_closed_and_reject_outside_planes(self):
        grid = np.arange(10) * 0.015
        for level in (0.449, 0.45, 0.515, 0.516):
            with self.subTest(level=level):
                points = plane(grid, grid, level, 2)
                if 0.45 <= level <= 0.515:
                    normal, offset, inliers = _ransac(points, 0.015, 400, 0, 'support', (0.45, 0.515))
                    self.assertTrue(inliers.all())
                    self.assertAlmostEqual(-offset / normal[2], level)
                else:
                    with self.assertRaises(ValueError):
                        _ransac(points, 0.015, 400, 0, 'support', (0.45, 0.515))

    def test_raised_seed_without_acceptable_support_reports_possible_merge(self):
        points, _, _ = scene(box())
        for z, expected in ((0.4, True), (0.1, False)):
            with self.subTest(seed_z=z):
                result = segment(points, {'box': np.array([0.2, 0, z])})['box']
                self.assertGreater(result['count'], 0)
                self.assertEqual('no-support' in result['flags'], expected)


class TighteningTests(unittest.TestCase):
    def test_door_jamb_touching_shoes_is_excluded(self):
        shoes = box() * [0.75, 0.25, 0.125]
        jamb = plane(np.array([0.135, 0.15]), np.arange(2, 97) * 0.015, 0.119, 1)
        points, floor_count, wall_count = scene(shoes, jamb)
        result = segment(points, {'shoes': np.array([0.15, 0, 0.04])})['shoes']
        shoe_start = floor_count + wall_count
        jamb_start = shoe_start + len(shoes)
        self.assertFalse(np.any(result['indices'] >= jamb_start))
        self.assertGreaterEqual(np.sum(result['indices'] >= shoe_start), 0.95 * len(shoes))

    def test_structure_removal_is_cropped_not_an_infinite_slab(self):
        jamb = plane(np.array([0, 0.015]), np.arange(2, 97) * 0.015, 0, 1)
        nearby = np.array([0.04, 0, 0.6])
        distant = np.array([1.0, 0, 0.6])
        points = np.concatenate((jamb, [nearby, distant]))
        removed = _vertical_structures(points, points[:, 2], np.ones(len(points), dtype=bool),
                                       {'near': nearby, 'far': distant})
        self.assertTrue(removed[:len(jamb)].all())
        self.assertTrue(removed[-2])
        self.assertFalse(removed[-1])

    def test_tall_floating_panel_is_not_floor_connected_structure(self):
        panel = plane(np.array([0, 0.015]), np.arange(20, 171) * 0.01, 0, 1)
        removed = _vertical_structures(panel, panel[:, 2], np.ones(len(panel), dtype=bool),
                                       {'clue': np.array([1, 1, 0.04])})
        self.assertFalse(removed.any())

    def test_adjacent_floor_objects_with_tents_are_disjoint_and_nearest_owned(self):
        first = box() * [0.5, 0.25, 0.125]
        second = first + [0.2, 0, 0]
        tent = box() * [0.1, 0.1, 0.075]
        points, _, _ = scene(first, second, tent + [-0.06, 0.03, 0], tent + [0.42, 0.03, 0])
        seeds = {'first': np.array([-0.04, 0.05, 0.04]), 'second': np.array([0.44, 0.05, 0.04])}
        bounds = {'first': ([-0.06, 0.03, 0], [-0.02, 0.07, 0.06]),
                  'second': ([0.42, 0.03, 0], [0.46, 0.07, 0.06])}
        single = {name: segment(points, {name: seed}, {name: bounds[name]})[name]
                  for name, seed in seeds.items()}
        shared = np.intersect1d(single['first']['indices'], single['second']['indices'])
        self.assertGreater(len(shared), 0)
        result = segment(points, seeds, bounds)
        self.assertEqual(np.intersect1d(result['first']['indices'], result['second']['indices']).size, 0)
        first_nearer = np.linalg.norm(points[shared] - seeds['first'], axis=1) <= np.linalg.norm(points[shared] - seeds['second'], axis=1)
        self.assertTrue(np.isin(shared[first_nearer], result['first']['indices']).all())
        self.assertTrue(np.isin(shared[~first_nearer], result['second']['indices']).all())
        for name, other in (('first', 'second'), ('second', 'first')):
            selected = points[result[name]['indices']]
            self.assertIn('overlap:' + other, result[name]['flags'])
            self.assertEqual(result[name]['count'], len(selected))
            np.testing.assert_allclose(result[name]['bbox'], [selected.min(axis=0), selected.max(axis=0)])
            self.assertAlmostEqual(result[name]['height'], np.ptp(selected[:, 2]))
            non_contact = selected[selected[:, 2] > 0.015]
            self.assertAlmostEqual(result[name]['seed_distance'], np.linalg.norm(non_contact - seeds[name], axis=1).min())
            self.assertEqual(result[name]['indices'].dtype, np.uint32)

    def test_floor_horizontal_and_height_caps_preserve_global_reach(self):
        x = np.arange(0.1, 1.01, 0.01)
        z = np.arange(0.03, 1.151, 0.01)
        arm = np.column_stack((x, np.full_like(x, 0.1), np.full_like(x, 0.03)))
        tower = np.column_stack((np.full_like(z, 0.1), np.full_like(z, 0.1), z))
        upper_arm = arm[arm[:, 0] <= 0.81] + [0, 0, 0.97]
        points, _, _ = scene(arm, tower, upper_arm)
        seed = np.array([0.1, 0.1, 0])
        result = segment(points, {'floor': seed})['floor']
        selected = points[result['indices']]
        self.assertGreater(len(selected), 0)
        self.assertTrue(np.all(np.linalg.norm(selected[:, :2] - seed[:2], axis=1) <= 0.7))
        self.assertTrue(np.all(selected[:, 2] <= 1.0))
        self.assertTrue(np.all(np.linalg.norm(selected - seed, axis=1) <= 1.2))
        self.assertGreater(selected[:, 0].max(), 0.78)
        self.assertGreater(selected[:, 2].max(), 0.98)
        self.assertIn('oversized', result['flags'])

    def test_raised_caps_use_support_and_global_height_ceiling(self):
        for support_z, expected_top in ((0.5, 1.1), (1.9, 2.2)):
            with self.subTest(support_z=support_z):
                support = plane(np.arange(28) * 0.015, np.arange(28) * 0.015, support_z, 2)
                z = np.arange(support_z + 0.02, support_z + 0.91, 0.01)
                x = np.arange(0.2, 1.01, 0.01)
                tower = np.column_stack((np.full_like(z, 0.2), np.full_like(z, 0.2), z))
                arm = np.column_stack((x, np.full_like(x, 0.2), np.full_like(x, support_z + 0.2)))
                points, _, _ = scene(support, tower, arm)
                seed = np.array([0.2, 0.2, support_z + 0.1])
                result = segment(points, {'raised': seed})['raised']
                selected = points[result['indices']]
                self.assertGreater(len(selected), 0)
                self.assertNotIn('no-support', result['flags'])
                self.assertTrue(np.all(np.linalg.norm(selected[:, :2] - seed[:2], axis=1) <= 0.5))
                self.assertTrue(np.all(selected[:, 2] <= expected_top + 1e-12))
                self.assertGreater(selected[:, 0].max(), 0.68)
                self.assertGreater(selected[:, 2].max(), expected_top - 0.02)
                self.assertIn('oversized', result['flags'])

    def test_no_support_height_anchor_with_and_without_marker_bounds(self):
        z = np.arange(0.25, 1.21, 0.01)
        tower = np.column_stack((np.full_like(z, 0.1), np.full_like(z, 0.1), z))
        points, _, _ = scene(tower)
        seed = np.array([0.1, 0.1, 0.4])
        for bounds, expected_top in ((None, 0.95), ({'clue': ([0.08, 0.08, 0.2], [0.12, 0.12, 0.45])}, 0.8)):
            with self.subTest(bounds=bounds):
                result = segment(points, {'clue': seed}, bounds)['clue']
                selected = points[result['indices']]
                self.assertGreater(len(selected), 0)
                self.assertIn('no-support', result['flags'])
                self.assertIn('oversized', result['flags'])
                self.assertTrue(np.all(selected[:, 2] <= expected_top))
                self.assertGreater(selected[:, 2].max(), expected_top - 0.02)

    def test_contact_only_ownership_is_flagged_without_inventing_seed_distance(self):
        patch = plane(np.array([0.045, 0.06, 0.075]), np.array([0.045, 0.06, 0.075]), 0.025, 2)
        points, floor_count, _ = scene(patch)
        seeds = {'floor': np.array([0.06, 0.06, 0]), 'object': np.array([0.06, 0.06, 0.025])}
        result = segment(points, seeds)
        floor = result['floor']
        self.assertGreater(floor['count'], 0)
        self.assertTrue(np.all(floor['indices'] < floor_count))
        self.assertIn('marker-only', floor['flags'])
        self.assertIn('overlap:object', floor['flags'])
        self.assertNotIn('empty', floor['flags'])
        self.assertEqual(floor['seed_distance'], 0)
        self.assertEqual(result['object']['count'], len(patch))

    def test_equal_distance_contention_has_deterministic_owner_and_empty_loser(self):
        points, _, _ = scene(box())
        seed = np.array([0.2, 0, 0.1])
        result = segment(points, {'first': seed, 'second': seed})
        self.assertGreater(result['first']['count'], 0)
        self.assertIn('overlap:second', result['first']['flags'])
        self.assertEqual(result['second']['count'], 0)
        self.assertEqual(result['second']['height'], 0)
        self.assertEqual(result['second']['seed_distance'], 0)
        self.assertEqual(result['second']['bbox'], [[0, 0, 0], [0, 0, 0]])
        self.assertIn('overlap:first', result['second']['flags'])
        self.assertIn('empty', result['second']['flags'])


class PlaneAndDisplayTests(unittest.TestCase):
    def test_display_matches_typescript_and_preserves_input(self):
        points = np.array([[1.0, 2.0, 349.2], [-3.0, 4.0, 350.0]])
        original = points.copy()
        np.testing.assert_allclose(display(points, np.pi / 2), [[-2, 1, 0], [-4, -3, 0.8]], atol=1e-12)
        np.testing.assert_allclose(display(points, 0), [[1, 2, 0], [-3, 4, 0.8]], atol=1e-12)
        np.testing.assert_array_equal(points, original)
        self.assertEqual(display(np.empty((0, 3)), 0).shape, (0, 3))

    def test_fit_plane_is_deterministic_with_outliers(self):
        rng = np.random.default_rng(42)
        xy = rng.uniform(-1, 1, (200, 2))
        surface = np.column_stack((xy, 0.1 * xy[:, 0] - 0.2 * xy[:, 1] + 0.4))
        points = np.concatenate((surface, surface[:30] + [0, 0, 1]))
        normal, offset, inliers = fit_plane(points, seed=5)
        expected = np.array([-0.1, 0.2, 1.0])
        expected /= np.linalg.norm(expected)
        np.testing.assert_allclose(normal, expected, atol=1e-12)
        self.assertAlmostEqual(offset, -0.4 / np.sqrt(1.05))
        np.testing.assert_array_equal(inliers, np.arange(len(points)) < len(surface))
        self.assertEqual(inliers.dtype, np.bool_)
        for actual, repeated in zip((normal, offset, inliers), fit_plane(points, seed=5)):
            np.testing.assert_array_equal(actual, repeated)

    def test_invalid_and_degenerate_inputs_rejected(self):
        for points in (np.zeros((3, 2)), np.array([[0, 0, np.nan]]), np.array([[0, 0, np.inf]])):
            for operation in (lambda p: display(p, 0), fit_plane, lambda p: segment(p, {'x': np.zeros(3)})):
                with self.subTest(points=points, operation=operation), self.assertRaises(ValueError):
                    operation(points)
        for points in (np.empty((0, 3)), np.zeros((2, 3)), np.arange(12).reshape(4, 3)):
            with self.subTest(points=points), self.assertRaises(ValueError):
                fit_plane(points)
        for options in ({'band': 0}, {'band': np.inf}, {'iterations': 0}, {'iterations': 1.5}):
            with self.subTest(options=options), self.assertRaises(ValueError):
                fit_plane(np.eye(3), **options)
        with self.assertRaises(ValueError):
            display(np.eye(3), np.nan)
        for seed in (np.zeros(2), np.array([0, 0, np.inf])):
            with self.subTest(seed=seed), self.assertRaises(ValueError):
                segment(np.empty((0, 3)), {'x': seed})
        with self.assertRaises(ValueError):
            segment(np.arange(12).reshape(4, 3), {'x': np.zeros(3)})

    def test_empty_inputs(self):
        self.assertEqual(segment(np.empty((0, 3)), {}), {})
        result = segment(np.empty((0, 3)), {'x': np.zeros(3)})['x']
        self.assertEqual(result['count'], 0)
        self.assertEqual(result['flags'], ['empty', 'marker-only'])
        self.assertEqual(result['seed_distance'], 0.0)
        self.assertEqual(result['indices'].dtype, np.uint32)


if __name__ == '__main__':
    unittest.main()
