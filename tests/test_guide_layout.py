"""Руководство (docs/guide) в браузере: вёрстка на трёх размерах экрана и контраст текста в обеих темах.

Проверяется: нет горизонтальной прокрутки, ссылки-кнопки не меньше 44 px, картинки загрузились,
тема страницы совпадает с выбранной в приложении, контраст текста не ниже WCAG AA, ошибок в консоли нет.
Запуск: python3 -m unittest tests.test_guide_layout
"""
import functools
import http.server
import os
import threading
import unittest

from playwright.sync_api import sync_playwright

from tests.test_theme_contrast import MEASURE

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GUIDE = os.path.join(ROOT, "docs", "guide")
PAGES = sorted(f for f in os.listdir(GUIDE) if f.endswith(".html"))
VIEWPORTS = {"narrow": {"width": 320, "height": 640}, "phone": {"width": 390, "height": 844}, "desktop": {"width": 1280, "height": 720}}

TAP_TARGETS = ".guide-open, .toc a, .pager a, .guide-brand"


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class GuideLayoutTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(_Quiet, directory=ROOT))
        cls.base = f"http://127.0.0.1:{cls.httpd.server_address[1]}/docs/guide/"
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.httpd.shutdown()

    def open(self, page_name, theme, viewport):
        ctx = self.browser.new_context(viewport=viewport, reduced_motion="reduce")
        ctx.add_init_script("localStorage.setItem('perudo.settings', JSON.stringify({theme:'%s'}));" % theme)
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("requestfailed", lambda r: errors.append("не загрузилось: " + r.url))
        page.goto(self.base + page_name)
        page.wait_for_load_state("networkidle")
        # ленивые картинки подгружаются при прокрутке
        page.evaluate("document.querySelectorAll('img').forEach(i => { i.loading = 'eager'; })")
        page.wait_for_function("[...document.images].every(i => i.complete)")
        return ctx, page, errors

    def test_pages_exist(self):
        self.assertIn("index.html", PAGES)
        self.assertGreaterEqual(len(PAGES), 3)

    def test_layout_in_every_page_theme_and_size(self):
        for name in PAGES:
            for theme in ("light", "dark"):
                for vname, vp in VIEWPORTS.items():
                    where = f"{name} · {theme} · {vname}"
                    ctx, page, errors = self.open(name, theme, vp)
                    try:
                        self.assertEqual(page.evaluate("document.documentElement.dataset.theme"), theme, where)
                        self.assertEqual(errors, [], where)
                        over = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
                        self.assertLessEqual(over, 0, f"{where}: горизонтальная прокрутка на {over} px")
                        small = page.evaluate(
                            "sel => [...document.querySelectorAll(sel)].map(e => [e.textContent.trim().slice(0, 30), e.getBoundingClientRect().height])"
                            ".filter(([, h]) => h < 43.5)", TAP_TARGETS)
                        self.assertEqual(small, [], f"{where}: цели нажатия меньше 44 px")
                        broken = page.evaluate("[...document.images].filter(i => !i.naturalWidth).map(i => i.src)")
                        self.assertEqual(broken, [], f"{where}: не загрузились картинки")
                        too_wide = page.evaluate("[...document.images].filter(i => i.getBoundingClientRect().right > window.innerWidth + 0.5).map(i => i.src)")
                        self.assertEqual(too_wide, [], f"{where}: картинки шире экрана")
                    finally:
                        ctx.close()

    def test_text_contrast_in_both_themes(self):
        for name in PAGES:
            for theme in ("light", "dark"):
                for vname in ("phone", "desktop"):
                    ctx, page, _ = self.open(name, theme, VIEWPORTS[vname])
                    try:
                        bad = page.evaluate(MEASURE)
                        self.assertEqual(bad, [], f"{name} · {theme} · {vname}: низкий контраст {bad}")
                    finally:
                        ctx.close()

    def test_theme_follows_the_saved_choice_and_defaults_to_light(self):
        ctx = self.browser.new_context(viewport=VIEWPORTS["phone"])
        page = ctx.new_page()
        page.goto(self.base + "index.html")
        self.assertEqual(page.evaluate("document.documentElement.dataset.theme"), "light")
        ctx.close()


if __name__ == "__main__":
    unittest.main()
