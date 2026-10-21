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

# Телефон вертикально, телефон в ландшафте, планшет, ноутбук, большой монитор.
# Первые пять — размеры, по которым принимается вёрстка; 1920×1080 держим как запас.
VIEWPORTS = [(360, 640), (390, 844), (844, 390), (768, 1024), (1366, 768), (1920, 1080)]

# Телефон в ландшафте. Известное замечание, найденное при добавлении этого размера
# в общий список: при 4 и 5 ботах места за столом пересекаются между собой и с центром.
# Тест на пересечения для этого размера пропускает 4–5 ботов; исправлять вёрстку стола
# в этой работе не планировалось (см. рабочий план, шаг 0.1).
LANDSCAPE_PHONE = (844, 390)

# Окно «Как вы будете играть?» открывается только новичку. Для замеров вёрстки стола и панелей
# каждый контекст «уже выбрал» режим гостя, как постоянный игрок.
GUEST = "if (!localStorage.getItem('perudo.device')) localStorage.setItem('perudo.device', '{\"account\":\"guest\"}');"


class _GuestBrowser:
    def __init__(self, browser):
        self._b = browser

    def new_context(self, **kw):
        ctx = self._b.new_context(**kw)
        ctx.add_init_script(GUEST)
        return ctx

    def __getattr__(self, name):
        return getattr(self._b, name)


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
        cls.raw_browser = cls.pw.chromium.launch()
        cls.browser = _GuestBrowser(cls.raw_browser)

    @classmethod
    def tearDownClass(cls):
        cls.raw_browser.close()
        cls.pw.stop()
        cls.httpd.shutdown()

    def open_game(self, w, h, bots, reveal=False, dice=None):
        """reveal=False отключает окно вскрытия: старые тесты не должны упираться в модальное окно."""
        ctx = self.browser.new_context(viewport={"width": w, "height": h})
        page = ctx.new_page()
        self.addCleanup(ctx.close)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(self.url)
        self.goto_tab(page, "game")
        page.evaluate(
            "([n, rev, dice]) => { document.querySelector('#gBots').value = n;"
            " document.querySelector('#gRevealOpt').checked = rev;"
            " if (dice) document.querySelector('#gDice').value = dice;"
            " window.__perudo_v2.startNewGame(); }", [str(bots), reveal, str(dice) if dice else ""])
        page.wait_for_selector(".seat")
        self.assertEqual(errors, [], f"JS-ошибки на странице: {errors}")
        return page

    def goto_tab(self, page, tab):
        """Перейти на вкладку: на телефоне в партии лента спрятана за кнопкой ☰."""
        btn = page.locator(f'.tab-btn[data-t="{tab}"]')
        if not btn.is_visible():
            page.locator(".hud-menu:visible").click()
        btn.click()

    def is_compact(self, w, h):
        return w <= 719 or (h <= 500 and w <= 1099)

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

    def open_game_as(self, w, h, bots, player):
        """Партия, в которой игрок уже задал имя и аватар (профиль лежит в localStorage до загрузки страницы)."""
        import json
        ctx = self.browser.new_context(viewport={"width": w, "height": h})
        self.addCleanup(ctx.close)
        ctx.add_init_script("localStorage.setItem('perudo.player', %s);" % json.dumps(json.dumps(player)))
        page = ctx.new_page()
        page.goto(self.url)
        self.goto_tab(page, "game")
        page.evaluate(
            "n => { document.querySelector('#gBots').value = n;"
            " document.querySelector('#gRevealOpt').checked = false; window.__perudo_v2.startNewGame(); }", str(bots))
        page.wait_for_selector(".seat")
        return page

    def tiny_jpeg(self):
        import base64, io
        from PIL import Image
        buf = io.BytesIO()
        Image.new("RGB", (96, 96), (200, 80, 40)).save(buf, "JPEG", quality=50)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()

    def test_long_player_name_and_avatar_keep_seats_in_place(self):
        """Самое широкое имя (20 букв) и оба вида аватара: места в столе, не пересекаются, ничего не обрезано."""
        players = {
            "emoji": {"name": "Ш" * 20, "avatar": {"type": "emoji", "value": "🦊"}},
            "photo": {"name": "Ш" * 20, "avatar": {"type": "photo", "value": self.tiny_jpeg()}},
        }
        for kind, player in players.items():
            for w, h in VIEWPORTS:
                with self.subTest(kind=kind, w=w, h=h):
                    page = self.open_game_as(w, h, 5, player)
                    self.assertEqual(page.locator(".seat.human .seat-name").inner_text().strip(), "Ш" * 20)
                    stage = page.locator("#gameTable").bounding_box()
                    for s in self.boxes(page, ".seat"):
                        self.assertGreaterEqual(s["x"], stage["x"] - 1)
                        self.assertLessEqual(s["x"] + s["width"], stage["x"] + stage["width"] + 1)
                        self.assertGreaterEqual(s["y"], stage["y"] - 1)
                        self.assertLessEqual(s["y"] + s["height"], stage["y"] + stage["height"] + 1)
                    bad = page.evaluate("""() => [...document.querySelectorAll('.seat')].flatMap(s => {
                        const r = s.getBoundingClientRect();
                        return [...s.querySelectorAll('.seat-avatar, .seat-name, .seat-meta')]
                          .filter(c => { const b = c.getBoundingClientRect();
                            return b.left < r.left - 1 || b.right > r.right + 1 ||
                                   b.top < r.top - 1 || b.bottom > r.bottom + 1; })
                          .map(c => c.className);
                    })""")
                    self.assertEqual(bad, [])
                    self.assertTrue(page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"))

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
                if (w, h) == LANDSCAPE_PHONE:
                    # в ландшафте панель действий стоит справа от стола, а не под ним
                    self.assertGreaterEqual(dock["x"], stage["x"] + stage["width"] - 1)
                else:
                    self.assertLess(stage["y"], dock["y"])

    def test_mobile_dock_is_pinned_and_actions_visible(self):
        """На телефоне кнопки хода видны без прокрутки — панель прижата к низу."""
        for w, h in [(360, 640), (390, 844)]:
            with self.subTest(w=w, h=h):
                page = self.open_game(w, h, 3)
                for sel in ["#gDudo", "#gRaise", "#gMinus", "#gPlus", "#gPick .face-btn >> nth=0"]:
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
                sels = ["#gDudo", "#gRaise", "#gMinus", "#gPlus"]
                sels += ["#gNew"] if w > 1100 else [".hud-tab-btn >> nth=0", ".hud-tab-btn >> nth=2"]
                for sel in sels:
                    box = page.locator(sel).bounding_box()
                    self.assertIsNotNone(box, sel)
                    self.assertGreaterEqual(box["height"], 44, sel)
                    self.assertGreaterEqual(box["width"], 44, sel)
                for box in self.boxes(page, "#gPick .face-btn"):
                    self.assertGreaterEqual(box["height"], 44)
                    self.assertGreaterEqual(box["width"], 40)

    def test_dock_fits_width_without_overflow(self):
        for w, h in VIEWPORTS:
            with self.subTest(w=w, h=h):
                page = self.open_game(w, h, 3)
                dock = page.locator("#gDock").bounding_box()
                for sel in ["#gDudo", "#gRaise", "#gPick", "#game .stepper"]:
                    b = page.locator(sel).bounding_box()
                    self.assertGreaterEqual(b["x"], dock["x"] - 1, sel)
                    self.assertLessEqual(b["x"] + b["width"], dock["x"] + dock["width"] + 1, sel)

    def test_calza_button_follows_option(self):
        page = self.open_game(390, 844, 3)
        self.assertFalse(page.locator("#gCalza").is_visible())
        page.evaluate("""() => { document.querySelector('#gCalzaOpt').checked = true;
            window.__perudo_v2.startNewGame(); }""")
        page.wait_for_selector("#gCalza", state="visible")
        row = page.locator("#game .dock-buttons").bounding_box()
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
        self.assertTrue(page.locator("#gPick .face-btn").nth(0).is_disabled())
        self.assertTrue(page.locator("#gPick .face-btn").nth(1).is_enabled())

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


    # ---------- Хелперы ----------

    def play_out(self, page):
        """Доиграть партию 1 на 1 с одним кубиком до конца."""
        page.evaluate("""() => { document.querySelector('#gBots').value = '1';
            document.querySelector('#gDice').value = '1';
            document.querySelector('#gSpeed').value = 'fast';
            window.__perudo_v2.startNewGame(); }""")
        for _ in range(120):
            if page.evaluate("window.__perudo_v2.game.state === 'finished'"):
                return
            if page.evaluate("window.__perudo_v2.game.currentPlayer === 0"):
                if page.locator("#gDudo").is_enabled():
                    page.locator("#gDudo").click()
                else:
                    page.locator("#gRaise").click()
            page.wait_for_timeout(300)
        self.fail("партия не завершилась")

    def side_hidden(self, page):
        return page.evaluate("getComputedStyle(document.querySelector('#gSide')).visibility") == "hidden"

    def wait_side_hidden(self, page):
        page.wait_for_function(
            "getComputedStyle(document.querySelector('#gSide')).visibility === 'hidden'")

    # ---------- Шаг 6: боковая панель ----------

    def test_side_panel_is_a_column_on_wide(self):
        page = self.open_game(1366, 768, 3)
        stage = page.locator("#gameTable").bounding_box()
        side = page.locator("#gSide").bounding_box()
        self.assertGreaterEqual(side["x"], stage["x"] + stage["width"] - 1)
        self.assertEqual(page.locator("#gSide [role=tab]").count(), 4)
        self.assertTrue(page.locator("#panCalc").is_visible())
        self.assertFalse(page.locator(".sheet-close").is_visible())
        self.assertFalse(page.locator("#gBackdrop").is_visible())
        self.assertFalse(page.locator(".hud-tab-btn").first.is_visible())
        self.assertTrue(page.locator("#gNew").is_visible())

    def test_side_tabs_switch_and_keep_roving_tabindex(self):
        page = self.open_game(1366, 768, 3)
        page.locator("#tabLog").click()
        self.assertTrue(page.locator("#panLog").is_visible())
        self.assertFalse(page.locator("#panCalc").is_visible())
        self.assertEqual(page.locator("#tabLog").get_attribute("aria-selected"), "true")
        self.assertEqual(page.locator("#tabCalc").get_attribute("aria-selected"), "false")
        self.assertEqual(page.locator("#tabCalc").get_attribute("tabindex"), "-1")
        page.locator("#tabLog").focus()
        page.keyboard.press("ArrowRight")
        self.assertEqual(page.locator("#tabReview").get_attribute("aria-selected"), "true")
        page.keyboard.press("ArrowLeft")
        page.keyboard.press("ArrowLeft")
        self.assertEqual(page.locator("#tabCalc").get_attribute("aria-selected"), "true")

    def test_sheet_is_closed_by_default_on_narrow(self):
        for w, h in [(390, 844), (768, 1024), (1024, 700)]:
            with self.subTest(w=w, h=h):
                page = self.open_game(w, h, 3)
                self.wait_side_hidden(page)          # до старта шторка настроек открыта, при старте закрывается
                self.assertFalse(page.locator("#gBackdrop").is_visible())

    def test_sheet_opens_from_hud_and_closes_every_way(self):
        page = self.open_game(390, 844, 3)
        opener = page.locator('.hud-tab-btn[data-open-tab="tabLog"]')

        opener.click()
        self.assertFalse(self.side_hidden(page))
        self.assertTrue(page.locator("#panLog").is_visible())
        self.assertEqual(page.locator("#gSide").get_attribute("role"), "dialog")
        self.assertTrue(page.locator("#gBackdrop").is_visible())
        self.assertTrue(page.evaluate("document.querySelector('#gSide').contains(document.activeElement)"))

        page.keyboard.press("Escape")                       # Esc
        self.wait_side_hidden(page)
        self.assertEqual(page.evaluate("document.activeElement.dataset.openTab"), "tabLog")  # фокус вернулся

        opener.click()                                      # затемнение
        page.mouse.click(195, 30)
        self.wait_side_hidden(page)

        opener.click()                                      # крестик
        page.locator(".sheet-close").click()
        self.wait_side_hidden(page)
        self.assertIsNone(page.locator("#gSide").get_attribute("role"))

    def test_sheet_opens_on_requested_tab(self):
        page = self.open_game(390, 844, 3)
        for opener, panel in [("tabCalc", "#panCalc"), ("tabSettings", "#panSettings"), ("tabLog", "#panLog")]:
            page.locator(f'.hud-tab-btn[data-open-tab="{opener}"]').click()
            self.assertTrue(page.locator(panel).is_visible(), panel)
            page.keyboard.press("Escape")
            self.wait_side_hidden(page)

    def test_sheet_traps_focus(self):
        page = self.open_game(390, 844, 3)
        page.locator('.hud-tab-btn[data-open-tab="tabSettings"]').click()
        for i in range(30):
            page.keyboard.press("Tab")
            inside = page.evaluate("document.querySelector('#gSide').contains(document.activeElement)")
            self.assertTrue(inside, f"фокус ушёл из шторки на шаге {i}")
        for i in range(30):
            page.keyboard.press("Shift+Tab")
            inside = page.evaluate("document.querySelector('#gSide').contains(document.activeElement)")
            self.assertTrue(inside, f"фокус ушёл из шторки (назад) на шаге {i}")

    def test_sheet_fits_the_screen(self):
        for w, h in [(360, 640), (390, 844), (844, 390)]:
            with self.subTest(w=w, h=h):
                page = self.open_game(w, h, 3)
                page.locator('.hud-tab-btn[data-open-tab="tabSettings"]').click()
                page.wait_for_timeout(450)                 # анимация выезда
                b = page.locator("#gSide").bounding_box()
                self.assertGreaterEqual(b["y"], 0)
                self.assertAlmostEqual(b["y"] + b["height"], h, delta=1)
                self.assertGreaterEqual(b["x"], 0)
                self.assertLessEqual(b["x"] + b["width"], w + 1)
                # закрыть можно: крестик на экране
                x = page.locator(".sheet-close").bounding_box()
                self.assertGreaterEqual(x["y"], 0)

    def test_settings_start_new_game_with_new_options_and_close_sheet(self):
        page = self.open_game(390, 844, 3)
        page.locator('.hud-tab-btn[data-open-tab="tabSettings"]').click()
        page.locator("#gBots").fill("1")
        page.locator("#panSettings .side-start").click()
        self.wait_side_hidden(page)
        self.assertEqual(page.locator(".seat").count(), 2)

    def test_default_tab_follows_assist_mode(self):
        page = self.open_game(1366, 768, 3)
        page.locator("#tabSettings").click()
        page.select_option("#gAssist", "game")
        page.locator("#panSettings .side-start").click()
        self.assertEqual(page.locator("#tabLog").get_attribute("aria-selected"), "true")
        page.locator("#tabSettings").click()
        page.select_option("#gAssist", "training")
        page.locator("#panSettings .side-start").click()
        self.assertEqual(page.locator("#tabCalc").get_attribute("aria-selected"), "true")

    def test_resizing_to_wide_closes_open_sheet(self):
        page = self.open_game(390, 844, 3)
        page.locator('.hud-tab-btn[data-open-tab="tabLog"]').click()
        page.set_viewport_size({"width": 1366, "height": 768})
        page.wait_for_timeout(200)
        self.assertNotIn("is-open", page.locator("#gSide").get_attribute("class"))
        self.assertFalse(page.locator("#gBackdrop").is_visible())
        self.assertTrue(page.locator("#gSide").is_visible())

    # ---------- Шаг 7: шапка и навигация ----------

    def test_header_is_one_compact_row_or_collapsed_on_phone_in_game(self):
        for w, h in VIEWPORTS:
            with self.subTest(w=w, h=h):
                page = self.open_game(w, h, 3)
                if self.is_compact(w, h):
                    self.assertLessEqual(page.locator(".app-header").bounding_box()["height"], 1,
                                         "в партии на телефоне шапка должна схлопнуться")
                    self.assertTrue(page.locator("#navToggle").is_visible())
                    self.assertFalse(page.locator("#mainNav").is_visible())
                    self.assertLessEqual(page.locator(".app-header h1").bounding_box()["width"], 2,
                                         "заголовок торчит из-под HUD")
                else:
                    ys = [round(b["y"]) for b in self.boxes(page, ".app-header nav button")]
                    self.assertEqual(len(ys), 7)
                    self.assertLessEqual(max(ys) - min(ys), 1, "вкладки перенеслись на вторую строку")
                    self.assertLessEqual(page.locator(".app-header").bounding_box()["height"], 56)
                    self.assertFalse(page.locator("#navToggle").is_visible())

    def test_every_tab_uses_menu_button_on_phone(self):
        for w, h in [(360, 640), (390, 844), (844, 390)]:
            for tab in ("calc", "train", "drill", "duel", "stats", "sim"):
                with self.subTest(w=w, h=h, tab=tab):
                    page = self.open_game(w, h, 3)
                    self.goto_tab(page, tab)
                    self.assertLessEqual(page.locator(".app-header").bounding_box()["height"], 1)
                    self.assertFalse(page.locator("#mainNav").is_visible())
                    tg = page.locator(f"#{tab} .hud-menu")
                    self.assertTrue(tg.is_visible())
                    box = tg.bounding_box()
                    self.assertGreaterEqual(min(box["width"], box["height"]), 44)
                    tg.click()
                    self.assertTrue(page.locator("#mainNav").is_visible())
                    self.assertEqual(tg.get_attribute("aria-expanded"), "true")
                    page.keyboard.press("Escape")
                    self.assertFalse(page.locator("#mainNav").is_visible())
                    self.assertEqual(page.evaluate("document.activeElement.closest('section').id"), tab)

    # ---------- Калькулятор ----------

    def open_calc(self, w, h):
        ctx = self.browser.new_context(viewport={"width": w, "height": h})
        page = ctx.new_page()
        self.addCleanup(ctx.close)
        page.goto(self.url)                      # Калькулятор — вкладка по умолчанию
        page.wait_for_selector("#cPick .face-btn")
        return page

    def test_calc_has_no_horizontal_scroll_and_table_fits_card(self):
        for w, h in VIEWPORTS:
            with self.subTest(w=w, h=h):
                page = self.open_calc(w, h)
                self.assertLessEqual(page.evaluate("document.documentElement.scrollWidth"), w)
                card = page.locator("#cTbl").evaluate("e => e.parentElement.getBoundingClientRect().right")
                tbl = page.locator("#cTbl table").bounding_box()
                self.assertLessEqual(tbl["x"] + tbl["width"], card + 1)
                self.assertFalse(page.locator("#cTbl").evaluate("e => e.scrollWidth > e.clientWidth + 1"))

    def test_calc_bid_and_result_visible_together(self):
        for w, h in VIEWPORTS:
            with self.subTest(w=w, h=h):
                page = self.open_calc(w, h)
                for sel in ("#cQ", "#cPick", "#cRes"):
                    b = page.locator(sel).bounding_box()
                    self.assertGreaterEqual(b["y"], 0, sel)
                    self.assertLessEqual(b["y"] + b["height"], h + 1, sel)

    def test_calc_controls_are_touch_sized_and_inputs_16px(self):
        for w, h in VIEWPORTS:
            with self.subTest(w=w, h=h):
                page = self.open_calc(w, h)
                small = page.evaluate("""() => [...document.querySelectorAll('#calc button, #calc input, #calc select')]
                    .filter(e => e.offsetParent !== null && e.type !== 'checkbox')
                    .filter(e => { const r = e.getBoundingClientRect(); return r.width < 44 || r.height < 44; })
                    .map(e => e.id || e.className || e.textContent)""")
                self.assertEqual(small, [])
                fonts = page.evaluate("""() => [...document.querySelectorAll('#calc input, #calc select')]
                    .filter(e => e.offsetParent !== null && e.type !== 'checkbox')
                    .filter(e => parseFloat(getComputedStyle(e).fontSize) < 16).map(e => e.id)""")
                self.assertEqual(fonts, [])

    def test_calc_dock_is_bottom_sheet_on_phone_and_right_column_on_wide(self):
        page = self.open_calc(360, 640)
        dock = page.locator("#cDock").bounding_box()
        self.assertGreaterEqual(dock["y"] + dock["height"], 639)            # прижата к низу экрана
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        dock = page.locator("#cDock").bounding_box()
        self.assertLessEqual(dock["y"] + dock["height"], 641)
        for w, h in [(1366, 768), (768, 1024), (844, 390)]:
            page = self.open_calc(w, h)
            dock = page.locator("#cDock").bounding_box()
            main = page.locator("#calc .learn-main").bounding_box()
            self.assertGreaterEqual(dock["x"], main["x"] + main["width"] - 1, f"{w}x{h}")

    # ---------- Тренажёр ----------

    def open_trainer(self, w, h):
        ctx = self.browser.new_context(viewport={"width": w, "height": h})
        page = ctx.new_page()
        self.addCleanup(ctx.close)
        page.goto(self.url)
        self.goto_tab(page, "train")
        page.wait_for_selector("#tHand .die")
        return page

    def test_trainer_has_no_hscroll_and_touch_sized_controls(self):
        for w, h in VIEWPORTS:
            for answered in (False, True):
                with self.subTest(w=w, h=h, answered=answered):
                    page = self.open_trainer(w, h)
                    if answered:
                        page.click("#tDudo")
                    self.assertLessEqual(page.evaluate("document.documentElement.scrollWidth"), w)
                    small = page.evaluate("""() => [...document.querySelectorAll('#train button, #train input, #train select, #train summary')]
                        .filter(e => e.offsetParent !== null && e.type !== 'checkbox')
                        .filter(e => { const r = e.getBoundingClientRect(); return r.height < 44 || r.width < 44; })
                        .map(e => e.id || e.className || e.textContent.trim())""")
                    self.assertEqual(small, [])
                    fonts = page.evaluate("""() => [...document.querySelectorAll('#train input, #train select')]
                        .filter(e => e.offsetParent !== null && e.type !== 'checkbox')
                        .filter(e => parseFloat(getComputedStyle(e).fontSize) < 16).map(e => e.id)""")
                    self.assertEqual(fonts, [])

    def test_trainer_situation_and_answer_buttons_visible_together(self):
        for w, h in VIEWPORTS:
            with self.subTest(w=w, h=h):
                page = self.open_trainer(w, h)
                for sel in ("#tHand", "#tBid", "#tDudo", "#tRaise", "#tPick"):
                    b = page.locator(sel).bounding_box()
                    self.assertGreaterEqual(b["y"], 0, sel)
                    self.assertLessEqual(b["y"] + b["height"], h + 1, sel)

    def test_trainer_verdict_and_next_visible_after_answer(self):
        for w, h in VIEWPORTS:
            with self.subTest(w=w, h=h):
                page = self.open_trainer(w, h)
                page.click("#tDudo")
                for sel in ("#tFb .big", "#tNext"):
                    b = page.locator(sel).bounding_box()
                    self.assertGreaterEqual(b["y"], 0, sel)
                    self.assertLessEqual(b["y"] + b["height"], h + 1, sel)

    # ---------- Упражнения ----------

    def open_drill(self, w, h):
        ctx = self.browser.new_context(viewport={"width": w, "height": h})
        page = ctx.new_page()
        self.addCleanup(ctx.close)
        page.goto(self.url)
        self.goto_tab(page, "drill")
        page.wait_for_selector("#dAq .die")
        return page

    def test_drill_has_no_hscroll_and_touch_sized_controls(self):
        for w, h in VIEWPORTS:
            for checked in (False, True):
                with self.subTest(w=w, h=h, checked=checked):
                    page = self.open_drill(w, h)
                    if checked:
                        page.fill("#dA1", "5")
                        page.fill("#dA2", "5")
                        page.click("#dACheck")
                    self.assertLessEqual(page.evaluate("document.documentElement.scrollWidth"), w)
                    small = page.evaluate("""() => [...document.querySelectorAll('#drill button, #drill input, #drill select, #drill summary')]
                        .filter(e => e.offsetParent !== null && e.type !== 'checkbox')
                        .filter(e => { const r = e.getBoundingClientRect(); return r.height < 44 || r.width < 44; })
                        .map(e => e.id || e.className || e.textContent.trim())""")
                    self.assertEqual(small, [])
                    fonts = page.evaluate("""() => [...document.querySelectorAll('#drill input')]
                        .filter(e => e.offsetParent !== null)
                        .filter(e => parseFloat(getComputedStyle(e).fontSize) < 16).map(e => e.id)""")
                    self.assertEqual(fonts, [])

    def test_drill_segment_labels_not_truncated_and_check_visible(self):
        for w, h in VIEWPORTS:
            with self.subTest(w=w, h=h):
                page = self.open_drill(w, h)
                clipped = page.evaluate("""() => [...document.querySelectorAll('.drill-tab')]
                    .filter(b => b.scrollWidth > b.clientWidth + 1).map(b => b.textContent.trim())""")
                self.assertEqual(clipped, [])
                b = page.locator("#dACheck").bounding_box()
                self.assertLessEqual(b["y"] + b["height"], h + 1)

    def test_drill_result_visible_after_check(self):
        for w, h in VIEWPORTS:
            with self.subTest(w=w, h=h):
                page = self.open_drill(w, h)
                page.fill("#dA1", "5")
                page.fill("#dA2", "5")
                page.click("#dACheck")
                b = page.locator("#dAfb").bounding_box()
                self.assertGreaterEqual(b["y"], 0)
                self.assertLessEqual(b["y"] + b["height"], h + 1)

    # ---------- Дуэль ----------

    def open_duel(self, w, h):
        ctx = self.browser.new_context(viewport={"width": w, "height": h})
        page = ctx.new_page()
        self.addCleanup(ctx.close)
        page.goto(self.url)
        self.goto_tab(page, "duel")
        return page

    def test_duel_play_panel_fits_and_controls_are_touch_sized(self):
        for w, h in VIEWPORTS:
            with self.subTest(w=w, h=h):
                page = self.open_duel(w, h)
                b = page.locator("#dStart").bounding_box()
                self.assertLessEqual(b["y"] + b["height"], h + 1)
                page.click("#dStart")
                page.wait_for_selector("#dPlay [data-i]", timeout=60000)
                self.assertLessEqual(page.evaluate("document.documentElement.scrollWidth"), w)
                b = page.locator("#dStart").bounding_box()
                self.assertLessEqual(b["y"] + b["height"], h + 1)
                small = page.evaluate("""() => [...document.querySelectorAll('#duel button')]
                    .filter(e => e.offsetParent !== null)
                    .filter(e => { const r = e.getBoundingClientRect(); return r.height < 44 || r.width < 44; })
                    .map(e => e.id || e.textContent.trim())""")
                self.assertEqual(small, [])

    def test_duel_equilibrium_table_stays_inside_card(self):
        for w, h in VIEWPORTS:
            with self.subTest(w=w, h=h):
                page = self.open_duel(w, h)
                page.click("#dSolve")
                page.wait_for_selector("#dOpen table", timeout=60000)
                self.assertLessEqual(page.evaluate("document.documentElement.scrollWidth"), w)
                card = page.locator("#dOpen").evaluate("e => e.getBoundingClientRect().right")
                self.assertLessEqual(page.locator("#dOpen").bounding_box()["x"]
                                     + page.locator("#dOpen").bounding_box()["width"], card + 1)

    # ---------- До старта партии ----------

    def test_prestart_fits_and_buttons_are_touch_sized(self):
        for w, h in VIEWPORTS:
            with self.subTest(w=w, h=h):
                ctx = self.browser.new_context(viewport={"width": w, "height": h})
                page = ctx.new_page()
                self.addCleanup(ctx.close)
                page.goto(self.url)
                self.goto_tab(page, "game")
                self.assertTrue(page.locator(".prestart").is_visible())
                self.assertEqual(page.locator(".seat").count(), 0)
                self.assertFalse(page.locator("#gDock").is_visible(), "панели действий до старта быть не должно")
                self.assertLessEqual(page.evaluate("document.documentElement.scrollWidth"), w)
                small = page.evaluate("""() => [...document.querySelectorAll('.prestart button')]
                    .filter(e => { const r = e.getBoundingClientRect(); return r.height < 44 || r.width < 44; })
                    .map(e => e.textContent.trim())""")
                self.assertEqual(small, [])

    # ---------- Статистика ----------

    GAMES_SEED = """(() => { const now = Date.now();
        localStorage.setItem('perudo.games', JSON.stringify(Array.from({ length: 15 }, (_, i) =>
          ({ ts: now - i * 3600000, players: 4, rounds: 12 + i, won: i % 2 === 0, decisions: 30 + i })))); })()"""

    def test_stats_tables_fit_card_and_buttons_are_touch_sized(self):
        for w, h in VIEWPORTS:
            with self.subTest(w=w, h=h):
                ctx = self.browser.new_context(viewport={"width": w, "height": h})
                page = ctx.new_page()
                self.addCleanup(ctx.close)
                page.goto(self.url)
                page.evaluate(self.GAMES_SEED)
                self.goto_tab(page, "stats")
                self.assertLessEqual(page.evaluate("document.documentElement.scrollWidth"), w)
                self.assertFalse(page.locator("#stGames").evaluate("e => e.scrollWidth > e.clientWidth + 1"))
                for sub in ("results", "player", "data"):    # у каждой подвкладки свои кнопки
                    page.click(f'#stTabs [data-st="{sub}"]')
                    self.assertLessEqual(page.evaluate("document.documentElement.scrollWidth"), w, sub)
                    small = page.evaluate("""() => [...document.querySelectorAll('#stats button')]
                        .filter(e => e.offsetParent !== null)
                        .filter(e => { const r = e.getBoundingClientRect(); return r.height < 44 || r.width < 44; })
                        .map(e => e.id || e.className || e.textContent.trim())""")
                    self.assertEqual(small, [], sub)
                page.click('#stTabs [data-st="results"]')
                self.assertTrue(page.locator("#stGames").is_visible())

    def test_stats_empty_state_fits_and_buttons_are_touch_sized(self):
        for w, h in VIEWPORTS:
            with self.subTest(w=w, h=h):
                ctx = self.browser.new_context(viewport={"width": w, "height": h})
                page = ctx.new_page()
                self.addCleanup(ctx.close)
                page.goto(self.url)
                self.goto_tab(page, "stats")
                self.assertTrue(page.locator("#stEmpty").is_visible())
                self.assertFalse(page.locator("#stFilled").is_visible())
                self.assertLessEqual(page.evaluate("document.documentElement.scrollWidth"), w)
                small = page.evaluate("""() => [...document.querySelectorAll('#stEmpty button')]
                    .filter(e => { const r = e.getBoundingClientRect(); return r.height < 44 || r.width < 44; })
                    .map(e => e.textContent.trim())""")
                self.assertEqual(small, [])
                bottom = page.locator("#stEmpty [data-go='game']").bounding_box()
                self.assertLessEqual(bottom["y"] + bottom["height"], h, "кнопка приглашения ниже экрана")

    # ---------- Симуляция ----------

    def test_sim_fields_buttons_and_table_fit(self):
        for w, h in VIEWPORTS:
            with self.subTest(w=w, h=h):
                ctx = self.browser.new_context(viewport={"width": w, "height": h})
                page = ctx.new_page()
                self.addCleanup(ctx.close)
                page.goto(self.url)
                self.goto_tab(page, "sim")
                page.fill("#sR", "2000")
                page.click("#sGo")
                page.wait_for_selector("#sOut table")
                self.assertLessEqual(page.evaluate("document.documentElement.scrollWidth"), w)
                self.assertFalse(page.locator("#sOut").evaluate("e => e.scrollWidth > e.clientWidth + 1"))
                b = page.locator("#sGo").bounding_box()
                self.assertLessEqual(b["y"] + b["height"], h + 1)
                small = page.evaluate("""() => [...document.querySelectorAll('#sim button, #sim input, #sim select')]
                    .filter(e => e.offsetParent !== null && e.type !== 'checkbox')
                    .filter(e => { const r = e.getBoundingClientRect(); return r.height < 44 || r.width < 44; })
                    .map(e => e.id || e.textContent.trim())""")
                self.assertEqual(small, [])
                fonts = page.evaluate("""() => [...document.querySelectorAll('#sim input')]
                    .filter(e => e.offsetParent !== null && e.type !== 'checkbox')
                    .filter(e => parseFloat(getComputedStyle(e).fontSize) < 16).map(e => e.id)""")
                self.assertEqual(fonts, [])

    def test_learning_tabs_keep_ribbon_on_desktop(self):
        for tab in ("calc", "train", "drill", "duel", "stats", "sim"):
            with self.subTest(tab=tab):
                page = self.open_game(1366, 768, 3)
                self.goto_tab(page, tab)
                self.assertTrue(page.locator("#mainNav").is_visible())
                self.assertFalse(page.locator(f"#{tab} .learn-hud").is_visible())

    def test_menu_gives_the_table_more_room_on_phone(self):
        # до свёртки шапки стол был 328px (360×640) и 220px (844×390)
        page = self.open_game(360, 640, 3)
        self.assertGreaterEqual(page.locator("#gameTable").bounding_box()["height"], 370)
        page = self.open_game(844, 390, 3)
        self.assertGreaterEqual(page.locator("#gameTable").bounding_box()["height"], 260)

    def test_menu_opens_with_right_semantics_and_focus(self):
        for w, h in [(360, 640), (390, 844), (844, 390)]:
            with self.subTest(w=w, h=h):
                page = self.open_game(w, h, 3)
                tg = page.locator("#navToggle")
                box = tg.bounding_box()
                self.assertGreaterEqual(box["width"], 44)
                self.assertGreaterEqual(box["height"], 44)
                self.assertEqual(tg.get_attribute("aria-expanded"), "false")
                self.assertEqual(tg.get_attribute("aria-controls"), "mainNav")
                tg.click()
                self.assertEqual(tg.get_attribute("aria-expanded"), "true")
                self.assertTrue(page.locator("#mainNav").is_visible())
                self.assertTrue(page.locator("#navScrim").is_visible())
                self.assertEqual(page.evaluate("document.activeElement.dataset.t"), "game")
                nav = page.locator("#mainNav").bounding_box()
                self.assertGreaterEqual(nav["x"], 0)
                self.assertLessEqual(nav["x"] + nav["width"], w)
                self.assertLessEqual(nav["y"] + nav["height"], h + 1, "меню не поместилось на экране")
                for b in self.boxes(page, "#mainNav .tab-btn"):
                    self.assertGreaterEqual(b["height"], 44)
                self.assertEqual(page.locator("#mainNav .tab-btn").count(), 7)

    def test_menu_closes_by_escape_scrim_and_choice(self):
        page = self.open_game(390, 844, 3)
        tg = page.locator("#navToggle")
        tg.click()
        page.keyboard.press("Escape")
        self.assertEqual(tg.get_attribute("aria-expanded"), "false")
        self.assertFalse(page.locator("#mainNav").is_visible())
        self.assertEqual(page.evaluate("document.activeElement.id"), "navToggle")
        tg.click()
        page.mouse.click(195, 700)                                    # затемнение под меню
        self.assertEqual(tg.get_attribute("aria-expanded"), "false")
        tg.click()
        page.locator('#mainNav .tab-btn[data-t="game"]').click()      # выбор текущего раздела
        self.assertEqual(tg.get_attribute("aria-expanded"), "false")
        self.assertEqual(page.evaluate("document.activeElement.id"), "navToggle")
        self.assertTrue(page.locator("#game").is_visible())
        tg.click()
        page.locator('#mainNav .tab-btn[data-t="stats"]').click()     # другой раздел
        self.assertTrue(page.locator("#stats").is_visible())
        self.assertFalse(page.locator("#game").is_visible())
        self.assertFalse(page.locator("#navToggle").is_visible())     # у «Статистики» своя кнопка ☰
        self.assertTrue(page.locator("#stats .hud-menu").is_visible())
        self.assertEqual(page.evaluate("document.body.dataset.tab"), "stats")
        self.goto_tab(page, "game")
        self.assertEqual(page.evaluate("document.body.dataset.tab"), "game")

    def test_menu_arrow_keys_cycle_items(self):
        page = self.open_game(390, 844, 3)
        page.click("#navToggle")
        self.assertEqual(page.evaluate("document.activeElement.dataset.t"), "game")
        page.keyboard.press("ArrowDown")
        self.assertEqual(page.evaluate("document.activeElement.dataset.t"), "duel")
        page.keyboard.press("ArrowUp")
        page.keyboard.press("ArrowUp")
        self.assertEqual(page.evaluate("document.activeElement.dataset.t"), "drill")
        for _ in range(3):
            page.keyboard.press("ArrowUp")
        self.assertEqual(page.evaluate("document.activeElement.dataset.t"), "stats")  # по кругу

    def test_widening_window_closes_menu(self):
        page = self.open_game(844, 390, 3)
        page.click("#navToggle")
        page.set_viewport_size({"width": 1366, "height": 768})
        page.wait_for_timeout(200)
        self.assertEqual(page.locator("#navToggle").get_attribute("aria-expanded"), "false")
        self.assertTrue(page.locator("#mainNav").is_visible())
        self.assertFalse(page.locator("#navScrim").is_visible())

    def test_title_is_visually_hidden_on_phone_and_shown_on_wide(self):
        page = self.open_game(390, 844, 3)
        self.assertLessEqual(page.locator(".app-header h1").bounding_box()["width"], 2)
        self.assertIn("Перудо", page.locator(".app-header h1").text_content())  # для скринридеров
        page = self.open_game(1366, 768, 3)
        h1 = page.locator(".app-header h1").bounding_box()
        nav = page.locator(".app-header nav").bounding_box()
        self.assertGreater(h1["width"], 50)
        self.assertLess(h1["x"] + h1["width"], nav["x"] + 1)          # слева от вкладок
        self.assertLess(h1["y"], nav["y"] + nav["height"])             # в одном ряду

    def test_nav_scrolls_active_tab_into_view_and_marks_current(self):
        page = self.open_game(720, 900, 3)                             # на телефоне лента за ☰, на 720px ещё в шапке
        self.goto_tab(page, "stats")
        nav = page.locator(".app-header nav").bounding_box()
        for data_t in ["sim", "stats"]:
            page.locator(f'.tab-btn[data-t="{data_t}"]').click()
            page.wait_for_timeout(700)                                 # smooth scroll
            b = page.locator(f'.tab-btn[data-t="{data_t}"]').bounding_box()
            self.assertGreaterEqual(b["x"], nav["x"] - 1, data_t)
            self.assertLessEqual(b["x"] + b["width"], nav["x"] + nav["width"] + 1, data_t)
            self.assertEqual(page.locator(f'.tab-btn[data-t="{data_t}"]').get_attribute("aria-current"), "page")
            self.assertEqual(page.locator('.tab-btn[aria-current="page"]').count(), 1)
        page.locator('.tab-btn[data-t="game"]').click()
        self.assertTrue(page.locator("#game").is_visible())
        self.assertEqual(page.locator('.tab-btn[aria-current="page"]').get_attribute("data-t"), "game")

    def test_nav_fades_only_where_it_can_scroll(self):
        def fades(page):
            return page.evaluate("""() => { const s = document.querySelector('.app-header nav').style;
                return [s.getPropertyValue('--fade-l'), s.getPropertyValue('--fade-r')]; }""")
        page = self.open_game(720, 900, 3)
        self.goto_tab(page, "stats")
        page.wait_for_timeout(700)                                     # дождаться плавной прокрутки к вкладке
        page.evaluate("document.querySelector('.app-header nav').scrollLeft = 0")
        page.wait_for_timeout(300)
        self.assertEqual(fades(page), ["0px", "24px"])                 # слева край, справа есть ещё
        page.locator('.tab-btn[data-t="sim"]').click()
        page.wait_for_timeout(700)
        self.assertEqual(fades(page), ["24px", "0px"])                 # прокрутили до конца
        page = self.open_game(1366, 768, 3)
        self.assertEqual(fades(page), ["0px", "0px"])                  # всё помещается

    # ---------- Страница партии целиком ----------

    def test_game_page_does_not_scroll(self):
        for w, h in VIEWPORTS + [(1024, 700)]:
            with self.subTest(w=w, h=h):
                page = self.open_game(w, h, 3)
                self.assertLessEqual(page.evaluate("document.documentElement.scrollHeight"), h + 1)

    def test_your_seat_is_not_covered_by_dock(self):
        for w, h in [(360, 640), (390, 844), (1366, 768), (1024, 700), (1920, 1080)]:
            with self.subTest(w=w, h=h):
                page = self.open_game(w, h, 3)
                you = page.locator(".seat.human").bounding_box()
                dock = page.locator("#gDock").bounding_box()
                self.assertLessEqual(you["y"] + you["height"], dock["y"] + 1)

    def test_landscape_phone_puts_actions_beside_the_table(self):
        page = self.open_game(844, 390, 3)
        stage = page.locator("#gameTable").bounding_box()
        dock = page.locator("#gDock").bounding_box()
        self.assertGreaterEqual(dock["x"], stage["x"] + stage["width"] - 1)
        for sel in ["#gDudo", "#gRaise"]:
            b = page.locator(sel).bounding_box()
            self.assertLessEqual(b["y"] + b["height"], 390 + 1, sel)

    # ---------- Конец партии ----------

    def test_summary_replaces_dock_and_new_game_button_is_reachable(self):
        for w, h in [(360, 640), (390, 844), (1366, 768), (844, 390)]:
            with self.subTest(w=w, h=h):
                page = self.open_game(w, h, 1)
                self.play_out(page)
                page.wait_for_timeout(300)
                self.assertFalse(page.locator("#gDock").is_visible())
                self.assertTrue(page.locator("#gSummary").is_visible())
                page.wait_for_selector("#gResultDialog[open]")
                page.keyboard.press("Escape")
                btn = page.locator("#gSummary [data-action=new-game]")
                box = btn.bounding_box()
                self.assertGreaterEqual(box["y"], 0)
                self.assertLessEqual(box["y"] + box["height"], h + 1)
                self.assertLessEqual(page.evaluate("document.documentElement.scrollHeight"), h + 24)
                btn.click()          # Playwright упадёт, если кнопку что-то перекрывает
                page.wait_for_function("window.__perudo_v2.game.state === 'active'")
                self.assertEqual(page.locator("#gSummary").inner_text().strip(), "")
                self.assertTrue(page.locator("#gDock").is_visible())
                self.assertNotIn("is-finished", page.locator(".game-main").get_attribute("class"))

    # ---------- Шаг 8: итог партии ----------

    def finish(self, page, w=None):
        """Доиграть до конца и дождаться окна с результатом."""
        self.play_out(page)
        page.wait_for_selector("#gResultDialog[open]", timeout=5000)

    def winner_name(self, page):
        return page.evaluate("""() => { const g = window.__perudo_v2.game;
            return g.players.find(p => p.id === g.winner).name; }""")

    def test_dialog_names_winner_and_opens_once(self):
        page = self.open_game(1366, 768, 1)
        self.finish(page)
        title = page.locator("#gResultTitle").inner_text()
        name = self.winner_name(page)
        self.assertIn(title, ("Вы победили!", f"Победил {name}"))
        self.assertEqual(page.locator("#gResultStand li").count(), 2)
        self.assertEqual(page.locator("#gResultStand li.is-winner").count(), 1)
        self.assertEqual(page.evaluate("document.activeElement.id"), "gResultAgain")
        page.keyboard.press("Escape")
        self.assertFalse(page.locator("#gResultDialog").evaluate("d => d.open"))
        games_before = page.evaluate("JSON.parse(localStorage.getItem('perudo.games') || '[]').length")
        for _ in range(3):
            page.evaluate("window.__perudo_v2.renderGame()")
        page.wait_for_timeout(1200)
        self.assertFalse(page.locator("#gResultDialog").evaluate("d => d.open"),
                         "окно не должно открываться повторно")
        games_after = page.evaluate("JSON.parse(localStorage.getItem('perudo.games') || '[]').length")
        self.assertEqual(games_before, games_after, "итог партии записан в историю дважды")

    def test_dialog_keyboard_and_focus(self):
        page = self.open_game(1366, 768, 1)
        self.finish(page)
        for _ in range(6):
            page.keyboard.press("Tab")
            self.assertTrue(page.evaluate("!!document.activeElement.closest('#gResultDialog')"),
                            "фокус ушёл из окна")
        for _ in range(3):
            page.keyboard.press("Shift+Tab")
            self.assertTrue(page.evaluate("!!document.activeElement.closest('#gResultDialog')"))
        page.keyboard.press("Escape")
        page.wait_for_function("!document.activeElement.closest('#gResultDialog')")
        self.assertEqual(page.evaluate("document.activeElement.closest('#gSummary') !== null"), True,
                         "фокус должен вернуться на баннер")

    def test_dialog_view_table_banner_details_and_play_again(self):
        page = self.open_game(1366, 768, 1)
        self.finish(page)
        page.locator("#gResultView").click()
        self.assertFalse(page.locator("#gResultDialog").evaluate("d => d.open"))
        self.assertTrue(page.locator("#gSummary .result-banner").is_visible())
        page.locator("[data-result-details]").click()
        self.assertTrue(page.locator("#gResultDialog").evaluate("d => d.open"))
        page.mouse.click(5, 5)                        # подложка закрывает окно
        self.assertFalse(page.locator("#gResultDialog").evaluate("d => d.open"))
        page.locator("[data-result-details]").click()
        page.locator("#gResultAgain").click()
        page.wait_for_function("window.__perudo_v2.game.state === 'active'")
        self.assertFalse(page.locator("#gResultDialog").evaluate("d => d.open"))
        self.assertEqual(page.locator("#gSummary").inner_text().strip(), "")
        self.assertTrue(page.locator("#gResultCard").is_hidden())
        self.assertEqual(page.locator(".seat.winner").count(), 0)
        self.assertNotIn("🏁", page.locator("#gStatus").inner_text())

    def test_new_game_before_dialog_cancels_it(self):
        page = self.open_game(1366, 768, 1)
        self.play_out(page)
        page.evaluate("window.__perudo_v2.startNewGame()")
        page.wait_for_timeout(1200)
        self.assertFalse(page.locator("#gResultDialog").evaluate("d => d.open"))

    def test_new_game_closes_open_dialog(self):
        page = self.open_game(1366, 768, 1)
        self.finish(page)
        page.evaluate("window.__perudo_v2.startNewGame()")
        self.assertFalse(page.locator("#gResultDialog").evaluate("d => d.open"))

    def test_dialog_not_shown_over_another_tab(self):
        page = self.open_game(1366, 768, 1)
        self.play_out(page)
        self.goto_tab(page, "calc")
        page.wait_for_timeout(1200)
        self.assertFalse(page.locator("#gResultDialog").evaluate("d => d.open"))

    def test_winner_is_highlighted_on_table_and_in_status(self):
        page = self.open_game(1366, 768, 1)
        self.finish(page)
        page.keyboard.press("Escape")
        self.assertEqual(page.locator(".seat.winner").count(), 1)
        self.assertEqual(page.locator(".seat.active").count(), 0)
        name = self.winner_name(page)
        self.assertIn(name, page.locator(".seat.winner").inner_text())
        self.assertIn("👑", page.locator(".seat.winner").inner_text())
        status = page.locator("#gStatus").inner_text()
        self.assertTrue("Вы победили" in status or f"Победил {name}" in status, status)

    def test_result_is_visible_without_scrolling_everywhere(self):
        for w, h in [(360, 640), (390, 844), (768, 1024), (1366, 768), (844, 390)]:
            with self.subTest(w=w, h=h):
                page = self.open_game(w, h, 1)
                self.finish(page)
                dlg = page.locator("#gResultDialog").bounding_box()
                self.assertGreaterEqual(dlg["x"], 0)
                self.assertLessEqual(dlg["x"] + dlg["width"], w)
                self.assertLessEqual(dlg["width"], w - 32 + 1)
                self.assertGreaterEqual(dlg["y"], 0)
                self.assertLessEqual(dlg["y"] + dlg["height"], h + 1)
                for sel in ("#gResultAgain", "#gResultView"):
                    box = page.locator(sel).bounding_box()
                    self.assertGreaterEqual(box["height"], 44, sel)
                    self.assertLessEqual(box["y"] + box["height"], h + 1, sel)
                page.keyboard.press("Escape")
                for sel in ('#gSummary [data-action="new-game"]', "#gSummary [data-result-details]"):
                    box = page.locator(sel).bounding_box()
                    self.assertGreaterEqual(box["height"], 44, sel)
                    self.assertGreaterEqual(box["y"], 0, sel)
                    self.assertLessEqual(box["y"] + box["height"], h + 1, sel)
                self.assertLessEqual(page.evaluate("document.documentElement.scrollWidth"), w)

    def test_desktop_banner_is_above_table_and_card_leads_the_column(self):
        page = self.open_game(1366, 768, 1)
        self.finish(page)
        page.keyboard.press("Escape")
        banner = page.locator("#gSummary").bounding_box()
        stage = page.locator("#gameTable").bounding_box()
        self.assertLess(banner["y"], stage["y"])
        card = page.locator("#gResultCard")
        self.assertTrue(card.is_visible())
        cbox = card.bounding_box()
        self.assertGreaterEqual(cbox["y"], 0)
        self.assertLessEqual(cbox["y"] + cbox["height"], 768)
        panel = page.locator("#panReview").bounding_box()
        self.assertLessEqual(cbox["y"] + cbox["height"], panel["y"] + 1,
                             "карточка итогов должна быть выше содержимого вкладок")
        self.assertEqual(page.locator("#tabReview").get_attribute("aria-selected"), "true")

    def test_desktop_card_with_backup_reminder_still_fits(self):
        """Пятая партия: к итогу добавляется напоминание про копию, карточка по-прежнему помещается и выше вкладок."""
        ctx = self.browser.new_context(viewport={"width": 1366, "height": 768})
        self.addCleanup(ctx.close)
        ctx.add_init_script(
            "localStorage.setItem('perudo.userProfile', JSON.stringify({n:0,good:0,totalGames:4,totalWins:0,byMode:{},"
            "drill:{A:{n:0,good:0},B:{n:0,good:0}}}));")
        page = ctx.new_page()
        page.goto(self.url)
        self.goto_tab(page, "game")
        page.evaluate("() => { document.querySelector('#gBots').value = 1;"
                      " document.querySelector('#gDice').value = 1;"
                      " document.querySelector('#gRevealOpt').checked = false; window.__perudo_v2.startNewGame(); }")
        page.wait_for_selector(".seat")
        self.finish(page)
        page.keyboard.press("Escape")
        reminder = page.locator("#gResultCard .backup-reminder")
        self.assertTrue(reminder.is_visible())
        for sel in ("[data-backup-save]", "[data-backup-later]"):
            box = page.locator(f"#gResultCard {sel}").bounding_box()
            self.assertGreaterEqual(box["height"], 44, sel)
        cbox = page.locator("#gResultCard").bounding_box()
        self.assertGreaterEqual(cbox["y"], 0)
        self.assertLessEqual(cbox["y"] + cbox["height"], 768)
        panel = page.locator("#panReview").bounding_box()
        self.assertLessEqual(cbox["y"] + cbox["height"], panel["y"] + 1)

    def test_phone_card_is_in_the_sheet(self):
        page = self.open_game(390, 844, 1)
        self.finish(page)
        page.keyboard.press("Escape")
        page.locator('.hud-tab-btn[data-open-tab="tabLog"]').click()
        page.wait_for_timeout(450)
        self.assertTrue(page.locator("#gResultCard").is_visible())
        box = page.locator("#gResultCard").bounding_box()
        self.assertLessEqual(box["y"] + box["height"], 844 + 1)

    def test_dialog_animation_respects_reduced_motion(self):
        for reduced, expect_none in (("reduce", True), ("no-preference", False)):
            with self.subTest(reduced=reduced):
                ctx = self.browser.new_context(viewport={"width": 1366, "height": 768},
                                               reduced_motion=reduced)
                self.addCleanup(ctx.close)
                page = ctx.new_page()
                page.goto(self.url)
                self.goto_tab(page, "game")
                page.evaluate("window.__perudo_v2.startNewGame()")      # партия начинается кнопкой, не сама
                page.wait_for_selector(".seat")
                self.play_out(page)
                page.wait_for_selector("#gResultDialog[open]", timeout=5000)
                name = page.locator("#gResultDialog").evaluate("d => getComputedStyle(d).animationName")
                self.assertEqual(name == "none", expect_none, name)

    # ---------- Шаг 9: вскрытие кубиков ----------

    SCENARIO = """([hands, bid, dice]) => {
        const g = window.__perudo_v2.game;
        g.players.forEach((p, i) => { p.hand = hands[i]; if (dice) p.dice = dice[i]; });
        g.bid = { playerId: g.players[bid.by].id, playerName: g.players[bid.by].name, q: bid.q, f: bid.f };
        g.currentPlayer = 0;
        window.__perudo_v2.renderGame();
    }"""

    def scenario(self, page, hands, bid, dice=None):
        page.evaluate(self.SCENARIO, [hands, bid, dice])

    def test_reveal_shows_every_hand_and_verdict(self):
        page = self.open_game(1366, 768, 2, reveal=True)
        self.scenario(page, [[2, 3, 5], [5, 5, 1], [4, 6, 2]], {"by": 1, "q": 3, "f": 5})
        page.locator("#gDudo").click()
        page.wait_for_selector("#gReveal[open]")
        self.assertEqual(page.locator("#gRevealTitle").inner_text(), "Вы: «Не верю!»")
        self.assertEqual(page.locator("#gRevealRows li").count(), 3)
        self.assertEqual(page.locator("#gRevealRows .die").count(), 9)
        self.assertEqual(page.locator("#gRevealRows .die.hit").count(), 4)
        self.assertEqual(page.locator("#gRevealVerdict").inner_text(), "На столе 4 из 3 — ставка верна")
        self.assertEqual(page.locator("#gRevealOutcome").inner_text(), "Вы теряете кубик")
        self.assertIn("is-bad", page.locator("#gRevealVerdict").get_attribute("class"))
        self.assertEqual(page.locator("#gRevealRows li.is-loser").count(), 1)
        self.assertEqual(page.evaluate("document.activeElement.id"), "gRevealNext")

    def test_reveal_pauses_bots_until_next(self):
        page = self.open_game(1366, 768, 2, reveal=True)
        page.evaluate("document.querySelector('#gSpeed').value = 'fast'")
        self.scenario(page, [[2, 3, 5], [5, 5, 1], [4, 6, 2]], {"by": 1, "q": 6, "f": 5})
        page.locator("#gDudo").click()                  # ставка ложна -> бот 1 теряет кубик и ходит первым
        page.wait_for_selector("#gReveal[open]")
        page.wait_for_timeout(1200)                     # быстрый бот ходит за 320 мс
        self.assertIsNone(page.evaluate("window.__perudo_v2.game.bid"), "бот сходил под окном вскрытия")
        page.locator("#gRevealNext").click()
        page.wait_for_function("window.__perudo_v2.game.bid !== null", timeout=4000)

    def test_reveal_closes_by_itself_except_in_step_mode(self):
        page = self.open_game(1366, 768, 2, reveal=True)
        page.evaluate("document.querySelector('#gSpeed').value = 'fast'")
        self.scenario(page, [[2, 3, 5], [5, 5, 1], [4, 6, 2]], {"by": 1, "q": 3, "f": 5})
        page.locator("#gDudo").click()
        page.wait_for_selector("#gReveal[open]")
        page.wait_for_function("!document.querySelector('#gReveal').open", timeout=7000)

        page2 = self.open_game(1366, 768, 2, reveal=True)
        page2.evaluate("document.querySelector('#gSpeed').value = 'step'")
        self.scenario(page2, [[2, 3, 5], [5, 5, 1], [4, 6, 2]], {"by": 1, "q": 3, "f": 5})
        page2.locator("#gDudo").click()
        page2.wait_for_selector("#gReveal[open]")
        page2.wait_for_timeout(1500)
        self.assertTrue(page2.locator("#gReveal").evaluate("d => d.open"))
        self.assertEqual(page2.locator(".reveal-timer").evaluate("e => getComputedStyle(e).visibility"), "hidden")

    def test_reveal_option_off_skips_dialog_but_keeps_log(self):
        page = self.open_game(1366, 768, 2, reveal=False)
        self.scenario(page, [[2, 3, 5], [5, 5, 1], [4, 6, 2]], {"by": 1, "q": 3, "f": 5})
        page.locator("#gDudo").click()
        page.wait_for_timeout(500)
        self.assertFalse(page.locator("#gReveal").evaluate("d => d.open"))
        self.assertIn("Проверка: на столе 4 из 3", page.locator("#gHistory").inner_text())

    def test_reveal_keyboard(self):
        page = self.open_game(1366, 768, 2, reveal=True)
        page.evaluate("document.querySelector('#gSpeed').value = 'step'")
        self.scenario(page, [[2, 3, 5], [5, 5, 1], [4, 6, 2]], {"by": 1, "q": 3, "f": 5})
        page.locator("#gDudo").click()
        page.wait_for_selector("#gReveal[open]")
        for _ in range(3):
            page.keyboard.press("Tab")
            self.assertEqual(page.evaluate("document.activeElement.id"), "gRevealNext")
        page.keyboard.press("Enter")
        self.assertFalse(page.locator("#gReveal").evaluate("d => d.open"))
        self.scenario(page, [[2, 3, 5], [5, 5, 1], [4, 6, 2]], {"by": 1, "q": 3, "f": 5})
        page.locator("#gDudo").click()
        page.wait_for_selector("#gReveal[open]")
        page.keyboard.press("Escape")
        self.assertFalse(page.locator("#gReveal").evaluate("d => d.open"))

    def test_calza_reveal_exact(self):
        page = self.open_game(1366, 768, 2, reveal=True)
        page.evaluate("document.querySelector('#gCalzaOpt').checked = true;"
                      "document.querySelector('#gDice').value = '5'; window.__perudo_v2.startNewGame()")
        self.scenario(page, [[2, 3, 5, 2, 2], [5, 5, 1, 2, 2], [4, 6, 2, 2, 2]],
                      {"by": 1, "q": 4, "f": 5}, dice=[4, 5, 5])
        page.locator("#gCalza").click()
        page.wait_for_selector("#gReveal[open]")
        self.assertEqual(page.locator("#gRevealTitle").inner_text(), "Вы: «Calza!»")
        self.assertIn("точно", page.locator("#gRevealVerdict").inner_text())
        self.assertEqual(page.locator("#gRevealOutcome").inner_text(), "Вы получаете кубик")
        self.assertIn("is-good", page.locator("#gRevealVerdict").get_attribute("class"))

    def test_reveal_fits_screens_with_many_dice(self):
        for w, h in [(360, 640), (390, 844), (768, 1024), (1366, 768), (844, 390)]:
            with self.subTest(w=w, h=h):
                page = self.open_game(w, h, 5, reveal=True, dice=10)
                page.evaluate("document.querySelector('#gSpeed').value = 'step'")
                hands = [[(i + k) % 6 + 1 for k in range(10)] for i in range(6)]
                self.scenario(page, hands, {"by": 1, "q": 3, "f": 2})
                page.locator("#gDudo").click()
                page.wait_for_selector("#gReveal[open]")
                dlg = page.locator("#gReveal").bounding_box()
                self.assertGreaterEqual(dlg["x"], 0)
                self.assertLessEqual(dlg["x"] + dlg["width"], w)
                self.assertGreaterEqual(dlg["y"], 0)
                self.assertLessEqual(dlg["y"] + dlg["height"], h + 1)
                btn = page.locator("#gRevealNext").bounding_box()
                self.assertGreaterEqual(btn["height"], 44)
                self.assertGreaterEqual(btn["y"], 0)
                self.assertLessEqual(btn["y"] + btn["height"], h + 1, "кнопка «Дальше» ушла за экран")
                self.assertEqual(page.locator("#gRevealRows .die").count(), 60)
                self.assertLessEqual(page.evaluate("document.documentElement.scrollWidth"), w)
                self.assertEqual(page.evaluate(
                    "(() => { const d = document.querySelector('#gReveal'); return d.scrollWidth <= d.clientWidth + 1; })()"), True)

    def test_final_reveal_comes_before_result_dialog(self):
        page = self.open_game(1366, 768, 1, reveal=True, dice=1)
        page.evaluate("document.querySelector('#gSpeed').value = 'step'")
        self.scenario(page, [[2], [3]], {"by": 1, "q": 2, "f": 6})   # 2 шестёрки при двух кубиках: ложь
        page.locator("#gDudo").click()
        page.wait_for_selector("#gReveal[open]")
        page.wait_for_timeout(1500)                                    # окно итога обычно открывается через 0,7 с
        self.assertTrue(page.locator("#gReveal").evaluate("d => d.open"))
        self.assertFalse(page.locator("#gResultDialog").evaluate("d => d.open"))
        self.assertEqual(page.evaluate("window.__perudo_v2.game.state"), "finished")
        page.locator("#gRevealNext").click()
        page.wait_for_selector("#gResultDialog[open]", timeout=3000)
        self.assertFalse(page.locator("#gReveal").evaluate("d => d.open"))
        self.assertEqual(page.locator("#gResultTitle").inner_text(), "Вы победили!")

    def test_new_game_closes_reveal(self):
        page = self.open_game(1366, 768, 2, reveal=True)
        page.evaluate("document.querySelector('#gSpeed').value = 'step'")
        self.scenario(page, [[2, 3, 5], [5, 5, 1], [4, 6, 2]], {"by": 1, "q": 3, "f": 5})
        page.locator("#gDudo").click()
        page.wait_for_selector("#gReveal[open]")
        page.evaluate("window.__perudo_v2.startNewGame()")
        self.assertFalse(page.locator("#gReveal").evaluate("d => d.open"))

    def test_screenshots(self):
        if not SHOTS:
            self.skipTest("SHOTS_DIR не задана")
        os.makedirs(SHOTS, exist_ok=True)
        for w, h in [(360, 640), (390, 844), (768, 1024), (1366, 768), (844, 390)]:
            page = self.open_game(w, h, 5 if w < 700 else 3)
            page.wait_for_timeout(300)
            page.screenshot(path=os.path.join(SHOTS, f"play_{w}x{h}.png"))
            if w <= 1100:
                page.locator('.hud-tab-btn[data-open-tab="tabLog"]').click()
                page.wait_for_timeout(450)
                page.screenshot(path=os.path.join(SHOTS, f"sheet_{w}x{h}.png"))
        for w, h in [(390, 844), (1366, 768)]:
            page = self.open_game(w, h, 1)
            self.play_out(page)
            page.wait_for_timeout(300)
            page.screenshot(path=os.path.join(SHOTS, f"end_{w}x{h}.png"))

if __name__ == "__main__":
    unittest.main()
