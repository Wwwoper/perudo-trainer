"""Вёрстка учебных вкладок (Калькулятор, Тренажёр, Упражнения) по измерителю layout_audit.

Нулевые пороги на пяти размерах экрана: 360×640, 390×844, 844×390, 768×1024, 1366×768.
Запуск:  python3 -m unittest tests.test_learning_layout
"""
import functools
import http.server
import os
import threading
import unittest

from playwright.sync_api import sync_playwright

from tests.layout_audit import ROOT, _Quiet, measure_all


# Вкладки, для которых пороги уже обязательны. Остальные добавляются по мере переделки вёрстки.
STRICT_TABS = ("calc", "train", "drill", "duel")


def strict(rows):
    return [r for r in rows if r["state"].split(":")[0].split(" ")[0] in STRICT_TABS]


class LearningLayoutTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        handler = functools.partial(_Quiet, directory=ROOT)
        cls.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()
        base = f"http://127.0.0.1:{cls.httpd.server_address[1]}/index.html"
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            cls.rows = measure_all(base, browser)
            browser.close()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def label(self, r):
        return f"{r['size']} · {r['state']}"

    def test_all_states_were_measured(self):
        self.assertEqual(len(self.rows), 5 * 12)

    def test_no_horizontal_scroll(self):
        bad = [self.label(r) for r in strict(self.rows) if r["hscroll"]]
        self.assertEqual(bad, [])

    def test_no_controls_smaller_than_44px(self):
        bad = [f"{self.label(r)}: {r['small']}" for r in strict(self.rows) if r["small"]]
        self.assertEqual(bad, [])

    def test_no_inputs_with_font_below_16px(self):
        bad = [f"{self.label(r)}: {r['font']}" for r in strict(self.rows) if r["font"]]
        self.assertEqual(bad, [])

    def test_result_is_inside_the_screen(self):
        # «hint open»: разбор прокручивается внутри панели, нижний край блока там не показатель
        bad = [f"{self.label(r)}: {r['result']:+d}" for r in strict(self.rows)
               if r["result"] is not None and r["result"] > 0 and "hint open" not in r["state"]]
        self.assertEqual(bad, [])


if __name__ == "__main__":
    unittest.main()
