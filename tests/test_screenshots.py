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
    def test_names_are_unique_and_used_by_readme_or_guide(self):
        """Каждый снимок скрипта существует и нужен: его показывает README или страница руководства."""
        self.assertEqual(len(shots.NAMES), len(set(shots.NAMES)))
        text = open(os.path.join(ROOT, "README.md"), encoding="utf-8").read()
        guide = os.path.join(ROOT, "docs", "guide")
        for page in sorted(os.listdir(guide)):
            if page.endswith(".html"):
                text += open(os.path.join(guide, page), encoding="utf-8").read()
        for name in shots.NAMES:
            self.assertTrue(os.path.exists(os.path.join(ROOT, "docs", "img", f"{name}.png")), f"нет docs/img/{name}.png")
            self.assertTrue(f"docs/img/{name}.png" in text or f"../img/{name}.png" in text, f"{name}.png нигде не используется")

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

    def test_new_scenes_are_reproducible(self):
        """Сцены с игрой, Дуэлью и данными Статистики: два запуска дают одинаковые картинки."""
        names = "stats-desktop,duel-phone,key-moments-desktop,reveal-phone,trainer-feedback"
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            for out in (a, b):
                self.assertEqual(shots.main(["--only", names, "--out", out]), 0)
            for name in names.split(","):
                h = [hashlib.sha256(open(os.path.join(d, name + ".png"), "rb").read()).hexdigest() for d in (a, b)]
                self.assertEqual(h[0], h[1], f"{name}: два запуска дали разные картинки")

    def test_every_image_in_docs_is_made_by_the_script_and_has_a_standard_size(self):
        """В docs/img нет ручных и лишних картинок; размеры — только стандартные."""
        allowed = {(1280, 720), (780, 1688), (1280, 1330)}
        files = sorted(f for f in os.listdir(os.path.join(ROOT, "docs", "img")) if f.endswith(".png"))
        self.assertEqual(sorted(f[:-4] for f in files), sorted(shots.NAMES), "картинки docs/img и список скрипта расходятся")
        for f in files:
            self.assertIn(png_size(os.path.join(ROOT, "docs", "img", f)), allowed, f"{f}: нестандартный размер")

    def test_images_are_optimized(self):
        """Вес всех картинок вместе не растёт неограниченно (сейчас около 4,6 МБ: в основном дерево стола)."""
        total = sum(os.path.getsize(os.path.join(ROOT, "docs", "img", f + ".png")) for f in shots.NAMES)
        self.assertLess(total, 5_500_000, f"картинки весят {total} байт")

    def test_png_is_optimized_without_changing_pixels(self):
        from PIL import Image, ImageChops
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "x.png")
            Image.effect_noise((200, 100), 40).convert("RGB").save(path)
            before = Image.open(path).convert("RGB")
            shots.optimize_png(path)
            self.assertIsNone(ImageChops.difference(before, Image.open(path).convert("RGB")).getbbox())


if __name__ == "__main__":
    unittest.main()
