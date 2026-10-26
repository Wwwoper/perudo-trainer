"""Проверка tools/screenshots.py: список снимков, размеры, воспроизводимость.

Запуск: python3 -m unittest tests.test_screenshots
"""
import hashlib
import importlib.util
import os
import re
import struct
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("screenshots", os.path.join(ROOT, "tools", "screenshots.py"))
shots = importlib.util.module_from_spec(spec)
spec.loader.exec_module(shots)


def png_size(path):
    with open(path, "rb") as f:
        head = f.read(24)
    assert head[:8] == b"\x89PNG\r\n\x1a\n", "не PNG"
    return struct.unpack(">II", head[16:24])


class ScreenshotsTest(unittest.TestCase):
    def test_names_are_unique_and_used_by_readme(self):
        self.assertEqual(len(shots.NAMES), len(set(shots.NAMES)))
        readme = open(os.path.join(ROOT, "README.md"), encoding="utf-8").read()
        for name in shots.NAMES:
            self.assertTrue(os.path.exists(os.path.join(ROOT, "docs", "img", f"{name}.png")), f"нет docs/img/{name}.png")
            self.assertIn(f"docs/img/{name}.png", readme, f"README не использует {name}.png")

    def test_unknown_name_is_rejected(self):
        self.assertEqual(shots.main(["--only", "нет-такого", "--out", tempfile.gettempdir()]), 2)

    def test_list(self):
        self.assertEqual(shots.main(["--list"]), 0)

    def test_screenshot_sizes_and_reproducibility(self):
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            for out in (a, b):
                self.assertEqual(shots.main(["--only", "settings-phone,game-desktop", "--out", out]), 0)
            self.assertEqual(png_size(os.path.join(a, "settings-phone.png")), (780, 1688))
            self.assertEqual(png_size(os.path.join(a, "game-desktop.png")), (1280, 720))
            for name in ("settings-phone.png", "game-desktop.png"):
                h = [hashlib.sha256(open(os.path.join(d, name), "rb").read()).hexdigest() for d in (a, b)]
                self.assertEqual(h[0], h[1], f"{name}: два запуска дали разные картинки")


if __name__ == "__main__":
    unittest.main()
