import unittest
from pathlib import Path
from raw_rgb_selection import connected_seven, temporal_sample, timestamp, validate_selection


class RawRGBSelectionTests(unittest.TestCase):
    def test_temporal_sampling_preserves_ends(self):
        paths = [Path(f"42445021_{i/2:.3f}.png") for i in range(8)]
        self.assertEqual([timestamp(p) for p in temporal_sample(paths)], [0, 1, 2, 3, 3.5])

    def test_reject_unrelated_filename(self):
        with self.assertRaises(ValueError):
            timestamp("42445022_48901.051.png")

    def test_connected_selection_does_not_join_components(self):
        records = [{"timestamp": i} for i in range(9)]
        pairs = [dict(a=i, b=i+1, accepted=True) for i in range(6)]
        pairs.append(dict(a=7, b=8, accepted=True))
        self.assertEqual(connected_seven(records, pairs), list(range(7)))
        self.assertIsNone(connected_seven(records, pairs[:5]))

    def test_frozen_selection_rejects_disconnected_or_duplicate(self):
        records = [{"timestamp": i} for i in range(8)]
        pairs = [dict(a=i, b=i+1, accepted=True) for i in range(6)]
        validate_selection(records, pairs, list(range(7)))
        for indices in [[0,1,2,3,4,5,7], [0,1,2,3,4,5,5]]:
            with self.assertRaises(ValueError):
                validate_selection(records, pairs, indices)


if __name__ == "__main__":
    unittest.main()
