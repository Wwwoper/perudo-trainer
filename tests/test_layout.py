"""Проверка вёрстки вкладки «Партия» в настоящем браузере.

Запуск (из корня проекта):  python3 -m unittest tests.test_layout -v
Нужен только playwright для Python.
"""
import functools
import http.server
import os
import threading
import unittest

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.environ.get("SHOTS_DIR")  # если задана, сохраняем скриншоты

VIEWPORTS = [(360, 640), (390, 844), (768, 1024), (1366, 768), (1920, 1080)]

class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def circle_hits_rect(circle, rect):
    """Центр стола — круг (вписан в свой bounding box); сравниваем с реальным кругом."""
    r = circle["width"] / 2
    cx, cy = circle["x"] + r, circle["y"] + circle["height"] / 2
    nx = min(max(cx, rect["x"]), rect["x"] + rect["width"])
    ny = min(max(cy, rect["y"]), rect["y"] + rect["height"])
    return (cx - nx) ** 2 + (cy - ny) ** 2 < r ** 2


def overlap(a, b):
    return (a["x"] < b["x"] + b["width"] and b["x"] < a["x"] + a["width"]
            and a["y"] < b["y"] + b["height"] and b["y"] < a["y"] + a["height"])


class LayoutTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        handler = functools.partial(_Quiet, directory=ROOT)
        cls.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.url = f"http://127.0.0.1:{cls.httpd.server_address[1]}/index.html"
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.httpd.shutdown()

    def open_game(self, w, h, bots):
        ctx = self.browser.new_context(viewport={"width": w, "height": h})
        page = ctx.new_page()
        self.addCleanup(ctx.close)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(self.url)
        page.click('button[data-t="game"]')
        page.evaluate(
            "n => { document.querySelector('#gBots').value = n;"
            " window.__perudo_v2.startNewGame(); }", str(bots))
        page.wait_for_selector(".seat")
        self.assertEqual(errors, [], f"JS-ошибки на странице: {errors}")
        return page

    def boxes(self, page, selector):
        return [e.bounding_box() for e in page.locator(selector).all()]

    def test_seats_inside_stage(self):
        for w, h in VIEWPORTS:
            for bots in range(1, 6):
                with self.subTest(w=w, h=h, bots=bots):
                    page = self.open_game(w, h, bots)
                    stage = page.locator("#gameTable").bounding_box()
                    seats = self.boxes(page, ".seat")
                    self.assertEqual(len(seats), bots + 1)
                    for s in seats:
                        self.assertGreaterEqual(s["x"], stage["x"] - 1)
                        self.assertGreaterEqual(s["y"], stage["y"] - 1)
                        self.assertLessEqual(s["x"] + s["width"], stage["x"] + stage["width"] + 1)
                        self.assertLessEqual(s["y"] + s["height"], stage["y"] + stage["height"] + 1)

    def test_seats_do_not_overlap_each_other_or_center(self):
        for w, h in VIEWPORTS:
            for bots in range(1, 6):
                with self.subTest(w=w, h=h, bots=bots):
                    page = self.open_game(w, h, bots)
                    seats = self.boxes(page, ".seat")
                    center = page.locator(".table-center").bounding_box()
                    for i, a in enumerate(seats):
                        self.assertFalse(circle_hits_rect(center, a), f"место {i} пересекает центр")
                        for j, b in enumerate(seats[i + 1:], i + 1):
                            self.assertFalse(overlap(a, b), f"места {i} и {j} пересекаются")

    def test_table_center_is_a_readable_circle(self):
        """Регрессия: центр не должен схлопываться в узкий овал."""
        for w, h in VIEWPORTS + [(1024, 600)]:
            with self.subTest(w=w, h=h):
                page = self.open_game(w, h, 3)
                c = page.locator(".table-center").bounding_box()
                self.assertAlmostEqual(c["width"], c["height"], delta=1)
                self.assertGreaterEqual(c["width"], 100)

    def test_seat_content_is_not_clipped(self):
        """Имя и число кубиков не вылезают за рамку места."""
        for w, h in VIEWPORTS:
            with self.subTest(w=w, h=h):
                page = self.open_game(w, h, 5)
                bad = page.evaluate("""() => [...document.querySelectorAll('.seat')].flatMap(s => {
                    const r = s.getBoundingClientRect();
                    return [...s.querySelectorAll('.seat-avatar, .seat-name, .seat-meta')]
                      .filter(c => { const b = c.getBoundingClientRect();
                        return b.left < r.left - 1 || b.right > r.right + 1 ||
                               b.top < r.top - 1 || b.bottom > r.bottom + 1; })
                      .map(c => c.className);
                })""")
                self.assertEqual(bad, [])

    def test_no_horizontal_scroll(self):
        for w, h in VIEWPORTS:
            with self.subTest(w=w, h=h):
                page = self.open_game(w, h, 3)
                self.assertTrue(page.evaluate(
                    "document.documentElement.scrollWidth <= window.innerWidth"))

    def test_human_seat_label_is_just_you(self):
        page = self.open_game(1366, 768, 3)
        self.assertEqual(page.locator(".seat.human .seat-name").inner_text().strip(), "Вы")

    def test_avatar_mouth_is_colored(self):
        """Регрессия: в SVG не должно оставаться литерала ${color1}."""
        page = self.open_game(1366, 768, 3)
        self.assertEqual(page.locator(".seat-avatar svg").evaluate_all(
            "els => els.filter(e => e.outerHTML.includes('${')).length"), 0)

    def test_safe_bid_labels_are_left_and_values_right(self):
        page = self.open_game(1366, 768, 3)
        rows = page.locator("#gPractical .ph-row")
        self.assertGreaterEqual(rows.count(), 5)
        for i in range(rows.count()):
            row = rows.nth(i).bounding_box()
            label = rows.nth(i).locator("span").first.bounding_box()
            value = rows.nth(i).locator("span").last.bounding_box()
            self.assertAlmostEqual(label["x"], row["x"], delta=2)
            self.assertAlmostEqual(value["x"] + value["width"], row["x"] + row["width"], delta=2)


    # ---------- Шаг 5: HUD и панель действий ----------

    def test_ids_are_unique(self):
        page = self.open_game(1366, 768, 3)
        dup = page.evaluate("""() => {
            const seen = {}, dup = [];
            document.querySelectorAll('[id]').forEach(e => {
                if (seen[e.id]) dup.push(e.id); seen[e.id] = 1; });
            return dup;
        }""")
        self.assertEqual(dup, [])

    def test_stage_is_above_dock(self):
        for w, h in VIEWPORTS:
            with self.subTest(w=w, h=h):
                page = self.open_game(w, h, 3)
                stage = page.locator("#gameTable").bounding_box()
                dock = page.locator("#gDock").bounding_box()
                self.assertLess(stage["y"], dock["y"])

    def test_mobile_dock_is_pinned_and_actions_visible(self):
        """На телефоне кнопки хода видны без прокрутки — панель прижата к низу."""
        for w, h in [(360, 640), (390, 844)]:
            with self.subTest(w=w, h=h):
                page = self.open_game(w, h, 3)
                for sel in ["#gDudo", "#gRaise", "#gMinus", "#gPlus", "#gPick .pf >> nth=0"]:
                    box = page.locator(sel).bounding_box()
                    self.assertIsNotNone(box, sel)
                    self.assertGreaterEqual(box["y"], 0, sel)
                    self.assertLessEqual(box["y"] + box["height"], h + 1, sel)
                dock = page.locator("#gDock").bounding_box()
                self.assertAlmostEqual(dock["y"] + dock["height"], h, delta=2)

    def test_tap_targets_are_at_least_44px(self):
        for w, h in VIEWPORTS:
            with self.subTest(w=w, h=h):
                page = self.open_game(w, h, 3)
                for sel in ["#gDudo", "#gRaise", "#gMinus", "#gPlus", "#gNew"]:
                    box = page.locator(sel).bounding_box()
                    self.assertGreaterEqual(box["height"], 44, sel)
                    self.assertGreaterEqual(box["width"], 44, sel)
                for box in self.boxes(page, "#gPick .pf"):
                    self.assertGreaterEqual(box["height"], 44)
                    self.assertGreaterEqual(box["width"], 40)

    def test_dock_fits_width_without_overflow(self):
        for w, h in VIEWPORTS:
            with self.subTest(w=w, h=h):
                page = self.open_game(w, h, 3)
                dock = page.locator("#gDock").bounding_box()
                for sel in ["#gDudo", "#gRaise", "#gPick", ".stepper"]:
                    b = page.locator(sel).bounding_box()
                    self.assertGreaterEqual(b["x"], dock["x"] - 1, sel)
                    self.assertLessEqual(b["x"] + b["width"], dock["x"] + dock["width"] + 1, sel)

    def test_calza_button_follows_option(self):
        page = self.open_game(390, 844, 3)
        self.assertFalse(page.locator("#gCalza").is_visible())
        page.evaluate("""() => { document.querySelector('#gCalzaOpt').checked = true;
            window.__perudo_v2.startNewGame(); }""")
        page.wait_for_selector("#gCalza", state="visible")
        row = page.locator(".dock-buttons").bounding_box()
        for sel in ["#gDudo", "#gCalza", "#gRaise"]:
            b = page.locator(sel).bounding_box()
            self.assertLessEqual(b["x"] + b["width"], row["x"] + row["width"] + 1, sel)

    def test_raise_button_shows_bid_and_odds(self):
        page = self.open_game(1366, 768, 3)
        text = page.locator("#gRaise").inner_text()
        self.assertRegex(text, r"Ставлю \d+×\d")
        self.assertIn("шанс", text)
        self.assertTrue(page.locator("#gRaise").is_enabled())

    def test_raise_button_disabled_for_illegal_bid(self):
        page = self.open_game(1366, 768, 3)
        page.evaluate("""() => { const q = document.querySelector('#gQ');
            q.value = '0'; q.dispatchEvent(new Event('input')); }""")
        self.assertTrue(page.locator("#gRaise").is_disabled())
        self.assertIn("слишком мало", page.locator("#gRaise").inner_text())

    def test_face_one_disabled_on_opening_bid(self):
        """Первая ставка не может быть на единицы (кроме Палифико)."""
        page = self.open_game(1366, 768, 3)
        self.assertTrue(page.locator("#gPick .pf").nth(0).is_disabled())
        self.assertTrue(page.locator("#gPick .pf").nth(1).is_enabled())

    def test_dock_is_dimmed_while_bots_move(self):
        page = self.open_game(390, 844, 3)
        self.assertNotIn("is-waiting", page.locator("#gDock").get_attribute("class"))
        page.locator("#gRaise").click()
        self.assertIn("is-waiting", page.locator("#gDock").get_attribute("class"))
        self.assertTrue(page.locator("#gDudo").is_disabled())
        self.assertTrue(page.locator("#gRaise").is_disabled())
        # тикер показывает последнее событие с именем автора
        self.assertIn("Вы", page.locator("#gFeed").inner_text())

    def test_dock_returns_to_player_after_bots(self):
        page = self.open_game(1366, 768, 1)
        page.evaluate("document.querySelector('#gSpeed').value = 'fast'")
        page.locator("#gRaise").click()
        page.wait_for_function(
            "!document.querySelector('#gDock').classList.contains('is-waiting')", timeout=15000)
        self.assertIn("Ваш ход", page.locator("#gStatus").inner_text())
        # после чужой ставки поле количества подготовлено под допустимую ставку
        self.assertTrue(page.locator("#gRaise").is_enabled())

    def test_hud_status_is_short(self):
        page = self.open_game(390, 844, 3)
        self.assertRegex(page.locator("#gMeta").inner_text(), r"^Раунд 1 · .+ \d+$")

    def test_current_bid_is_in_table_center_only(self):
        page = self.open_game(1366, 768, 1)
        page.evaluate("document.querySelector('#gSpeed').value = 'fast'")
        page.locator("#gRaise").click()
        self.assertEqual(page.locator(".table-center .table-bid .chip").count(), 1)

    def test_screenshots(self):
        if not SHOTS:
            self.skipTest("SHOTS_DIR не задана")
        os.makedirs(SHOTS, exist_ok=True)
        for w, h in [(360, 640), (390, 844), (768, 1024), (1366, 768)]:
            page = self.open_game(w, h, 5 if w < 700 else 3)
            page.wait_for_timeout(200)
            page.screenshot(path=os.path.join(SHOTS, f"s5_{w}x{h}.png"))
        page = self.open_game(390, 844, 3)
        page.locator("#gRaise").click()
        page.wait_for_timeout(200)
        page.screenshot(path=os.path.join(SHOTS, "s5_390x844_waiting.png"))

if __name__ == "__main__":
    unittest.main()
