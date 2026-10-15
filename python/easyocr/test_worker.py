import math
import unittest
from worker import deduplicate, normalize_detections, tile_starts


class WorkerTests(unittest.TestCase):
    def test_tiles_cover_the_bottom_with_overlap(self):
        self.assertEqual(tile_starts(1600), [0])
        self.assertEqual(tile_starts(1601), [0, 1472])
        starts = tile_starts(10000)
        self.assertGreaterEqual(starts[-1] + 1600, 10000)
        self.assertTrue(all(b - a == 1472 for a, b in zip(starts, starts[1:])))

    def test_boxes_use_original_image_coordinates(self):
        result = normalize_detections([([[0, 0], [20, 0], [20, 10], [0, 10]], "Program", 0.9)], 1472, 20, 2000)
        self.assertEqual(result[0]["bbox"][0], [0, 1472])
        self.assertEqual(result[0]["bbox"][2], [20, 1482])
        for confidence in [math.nan, math.inf, -0.1, 1.1]:
            with self.assertRaises(ValueError):
                normalize_detections([([[0, 0]] * 4, "x", confidence)], 0, 20, 20)

    def test_overlap_dedup_keeps_better_reading_without_removing_repeated_lines(self):
        def detection(y, confidence):
            return {"text": "Beethoven", "confidence": confidence, "bbox": [[0, y], [100, y], [100, y + 10], [0, y + 10]]}
        items = deduplicate([detection(100, 0.7), detection(101, 0.9), detection(200, 0.8)])
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["confidence"], 0.9)


if __name__ == "__main__":
    unittest.main()
