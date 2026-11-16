"""Проверка tools/design_audit.py и страницы-образца docs/dev/design.html.

Запуск: python3 -m unittest tests.test_design_audit
Разбор CSS и отчёт проверяются без браузера; браузер нужен двум тестам (страница-образец и живой сбор).
"""
import functools
import http.server
import importlib.util
import os
import threading
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("design_audit", os.path.join(ROOT, "tools", "design_audit.py"))
da = importlib.util.module_from_spec(spec)
spec.loader.exec_module(da)

CSS = """
/* комментарий { font-size: 99px; } */
.a, .b { font-size: 13px; padding: 4px 8px; border-radius: var(--radius-s); }
@media (max-width: 500px) { .a { font-size: 14px; margin: 0 6px; } }
@keyframes spin { from { font-size: 77px; } to { font-size: 88px; } }
:root { --x: 5px; }
.btn-main { min-height: var(--tap); }
"""


class ParseCssTest(unittest.TestCase):
    def test_declarations_selectors_and_media(self):
        d = da.parse_css(CSS)
        self.assertIn((".a", "font-size", "13px"), d)
        self.assertIn((".b", "font-size", "13px"), d)           # список селекторов разворачивается
        self.assertIn((".a", "font-size", "14px"), d)           # правила из @media учитываются
        self.assertIn((".btn-main", "min-height", "var(--tap)"), d)

    def test_comments_keyframes_and_custom_properties_are_skipped(self):
        props = [v for _s, p, v in da.parse_css(CSS) if p == "font-size"]
        self.assertNotIn("99px", props)
        self.assertNotIn("77px", props)
        self.assertFalse([1 for _s, p, _v in da.parse_css(CSS) if p.startswith("--")])

    def test_garbage_does_not_crash(self):
        for s in ["", "}}}", "{", ".a {", "a{b", "@media{", ".a{;;:;}"]:
            da.parse_css(s)


class ScaleTest(unittest.TestCase):
    def test_font_sizes_are_counted(self):
        u = da.scale_usage(da.parse_css(CSS), "font-size")
        self.assertEqual(u["literals"], {"13": 2, "14": 1})
        self.assertEqual(u["tokens"], 0)

    def test_tokens_and_spacing(self):
        d = da.parse_css(CSS)
        self.assertEqual(da.scale_usage(d, "border-radius")["tokens"], 2)
        sp = da.scale_usage(d, "spacing")["literals"]
        self.assertEqual(sp, {"4": 2, "8": 2, "6": 1})            # «0» без px не считается

    def test_declared_tokens(self):
        self.assertEqual(da.declared_tokens(":root{--a:1; --b-c: 2} /* --z: 3 */"), ["--a", "--b-c"])


class DuplicatesTest(unittest.TestCase):
    def test_selector_in_two_files_is_reported_once_in_one_file_is_not(self):
        files = {"a.css": ".x{color:red} .x{color:blue} .only-a{color:red}", "b.css": ".x{margin:0}"}
        self.assertEqual(da.duplicate_selectors(files), {".x": ["a.css", "b.css"]})

    def test_button_classes(self):
        got = da.button_classes({"a.css": ".link-btn{} .btn-primary{} .card{} .icon-btn:hover{}"})
        self.assertEqual(sorted(got), ["btn-primary", "icon-btn", "link-btn"])


class GroupingTest(unittest.TestCase):
    def test_signatures_are_grouped_and_counted(self):
        snaps = [
            ("game", [{"kind": "button", "sig": "16 · 400", "label": "button.a", "text": "Да"},
                      {"kind": "button", "sig": "16 · 400", "label": "button.b", "text": "Нет"},
                      {"kind": "button", "sig": "14 · 600", "label": "button.c", "text": ""}]),
            ("calc", [{"kind": "button", "sig": "16 · 400", "label": "button.a", "text": "Да"}]),
        ]
        r = da.group_signatures(snaps)["button"]
        self.assertEqual((r["total"], r["variants"]), (4, 2))
        top = r["groups"][0]
        self.assertEqual((top["sig"], top["count"], top["tabs"]), ("16 · 400", 3, ["calc", "game"]))
        self.assertEqual(top["examples"], ["button.a «Да»", "button.b «Нет»"])   # повторов примеров нет

    def test_report_has_sections_and_markdown_table_is_not_broken_by_pipes(self):
        static = {"tokens": 3, "scales": {g: {"literals": {"13": 2}, "tokens": 1} for g in da.SCALE_PROPS},
                  "duplicates": {".x": ["a.css", "b.css"]}, "buttons": {"link-btn": ["a.css"]}}
        live = da.group_signatures([("game", [{"kind": "button", "sig": "16 · 400", "label": "button", "text": "Да"}])])
        md = da.render_markdown(static, live)
        for part in ["## 1. Исходники CSS", "### Размер шрифта", "`.x`", "`.link-btn`", "## 2. Живой интерфейс", "### Кнопки: 1 шт."]:
            self.assertIn(part, md)
        row = [l for l in md.splitlines() if l.startswith("| 1 | 16")][0]
        self.assertEqual(row.count("|"), 5)                       # четыре столбца: подпись не ломает таблицу
        self.assertNotIn("## 2.", da.render_markdown(static, None))

    def test_static_report_on_project_sources(self):
        r = da.static_report()
        self.assertGreater(r["tokens"], 50)
        self.assertTrue(set(r["scales"]) == set(da.SCALE_PROPS))
        self.assertIn("btn-primary", r["buttons"])


class BrowserTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from playwright.sync_api import sync_playwright
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch()

        class Quiet(http.server.SimpleHTTPRequestHandler):
            def log_message(self, *a):
                pass

        cls.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=ROOT))
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.httpd.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.browser.close()
        cls.pw.stop()

    def test_sample_page_renders_every_group_in_both_themes_without_errors(self):
        for w in (360, 1280):
            page = self.browser.new_context(viewport={"width": w, "height": 800}).new_page()
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("requestfailed", lambda r: errors.append(r.url))
            page.goto(self.base + "/docs/dev/design.html")
            self.assertEqual(page.locator("#dxSwatches > div").count(), 25)
            self.assertGreaterEqual(page.locator("#dx-buttons button").count(), 22)
            self.assertEqual(page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), True,
                             f"горизонтальная прокрутка на {w} px")
            page.locator("#dxTheme").click()
            self.assertEqual(page.evaluate("document.documentElement.dataset.theme"), "dark")
            self.assertEqual(errors, [])

    def test_theme_from_url_and_anchor_targets_are_visible(self):
        page = self.browser.new_context(viewport={"width": 1000, "height": 800}).new_page()
        page.goto(self.base + "/docs/dev/design.html?theme=dark")
        self.assertEqual(page.evaluate("document.documentElement.dataset.theme"), "dark")
        self.assertEqual(page.locator("#dxTheme").inner_text(), "Светлая тема")
        page.locator(".dx-nav a").first.click()
        self.assertTrue(page.locator("#dx-actions").is_visible())

    def test_three_tab_groups_share_one_look(self):
        """Вкладки панели партии, упражнений и статистики — один сегментный переключатель."""
        page = self.browser.new_context(viewport={"width": 1000, "height": 800}).new_page()
        page.goto(self.base + "/docs/dev/design.html")
        props = ["fontSize", "fontWeight", "borderTopLeftRadius", "minHeight", "paddingLeft", "paddingTop",
                 "color", "backgroundColor", "fontFamily", "borderTopWidth"]
        js = """([sel, props]) => { const el = document.querySelector(sel); const s = getComputedStyle(el);
                return Object.fromEntries(props.map((p) => [p, s[p]])); }"""
        for theme in ("light", "dark"):
            page.evaluate("t => document.documentElement.setAttribute('data-theme', t)", theme)
            for state, sels in {
                "неактивная": ["#dxSideTabs [aria-selected=false]", "#dxDrillTabs .drill-tab:not(.on)", "#dxStatsTabs [aria-selected=false]"],
                "активная": ["#dxSideTabs [aria-selected=true]", "#dxDrillTabs .drill-tab.on", "#dxStatsTabs [aria-selected=true]"],
            }.items():
                got = [page.evaluate(js, [s, props]) for s in sels]
                self.assertEqual(got[0], got[1], f"{theme}, {state}: панель партии и упражнения")
                self.assertEqual(got[0], got[2], f"{theme}, {state}: панель партии и статистика")
            box = [page.evaluate("""(s) => { const c = getComputedStyle(document.querySelector(s));
                    return [c.display, c.gap, c.padding, c.borderTopLeftRadius, c.backgroundColor]; }""", s)
                   for s in ("#dxSideTabs", "#dxDrillTabs", "#dxStatsTabs")]
            self.assertEqual(box[0], box[1])
            self.assertEqual(box[0], box[2])
        h = page.evaluate("document.querySelector('#dxDrillTabs .drill-tab').getBoundingClientRect().height")
        self.assertGreaterEqual(h, 44)

    def test_button_set_shares_geometry_and_variants_differ_only_by_color(self):
        """Единый набор кнопок: обычная, ссылка-кнопка, главная, «Не верю!», Calza, вторичная."""
        page = self.browser.new_context(viewport={"width": 1000, "height": 800}).new_page()
        page.goto(self.base + "/docs/dev/design.html")
        js = """(sel) => { const s = getComputedStyle(document.querySelector(sel));
                return { r: s.borderTopLeftRadius, b: s.borderTopWidth, bs: s.borderTopStyle, h: document.querySelector(sel).getBoundingClientRect().height,
                         fs: s.fontSize, fw: s.fontWeight, td: s.textDecorationLine, c: s.color, bg: s.backgroundColor, bc: s.borderTopColor }; }"""
        for theme in ("light", "dark"):
            page.evaluate("t => document.documentElement.setAttribute('data-theme', t)", theme)
            base = page.evaluate(js, "#dx-actions + p + .dx-row button:not(.on):not(:disabled)")
            for sel in ("a.btn", ".btn-primary:not(:disabled)", "button.bad:not(:disabled)", "button.calza:not(:disabled)", ".quiz-secondary"):
                g = page.evaluate(js, sel)
                for k in ("r", "b", "bs", "fs"):
                    self.assertEqual(g[k], base[k], f"{theme}: {sel} отличается от обычной кнопки по {k}")
                self.assertGreaterEqual(g["h"], 44, f"{theme}: {sel} ниже 44 px")
            for sel in (".btn-primary:not(:disabled)", "button.bad:not(:disabled)", "button.calza:not(:disabled)"):
                g = page.evaluate(js, sel)
                self.assertEqual(g["fw"], "700", f"{theme}: {sel} должна быть жирной")
                self.assertEqual(g["bc"], g["bg"], f"{theme}: {sel}: цвет рамки совпадает с фоном")
            link = page.evaluate(js, ".quiet-btn:not(.is-danger)")
            self.assertEqual(link["td"], "none")                          # тихое действие: без подчёркивания и рамки
            self.assertEqual(link["b"], "0px")
            self.assertGreaterEqual(link["h"], 44)
            danger = page.evaluate(js, ".quiet-btn.is-danger")
            self.assertNotEqual(danger["c"], link["c"])                   # опасный вариант другого цвета
            self.assertEqual(page.evaluate(js, "a.btn")["td"], "none")

    def test_link_and_button_selectors_are_defined_once(self):
        files = {}
        for rel in da.CSS_FILES:
            with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
                files[rel] = f.read()
        dup = da.duplicate_selectors({k: v for k, v in files.items() if not k.endswith("themes.css")})
        for sel in (".quiet-btn", ".btn", ".btn-primary", "button.bad", "button.calza", ".quiz-secondary"):
            self.assertNotIn(sel, dup, f"{sel} определён в нескольких файлах: {dup.get(sel)}")

    def test_disclosure_blocks_share_form_and_roles(self):
        """Раскрывающиеся блоки: одна форма, три роли; внутри роли вид совпадает."""
        page = self.browser.new_context(viewport={"width": 1000, "height": 800}).new_page()
        page.goto(self.base + "/docs/dev/design.html")
        js = """(sel) => { const e = document.querySelector(sel); const s = getComputedStyle(e);
                const b = getComputedStyle(e, '::before');
                return { fs: s.fontSize, fw: s.fontWeight, c: s.color, h: e.getBoundingClientRect().height >= 44,
                         d: s.display, arrow: b.content, ls: s.listStyleType }; }"""
        roles = {
            "подсказка": ["calc-hint", "drill-hint", "read-how", "quiz-legend", "help-more"],
            "раздел": ["dock-more", "trainer-stats-card", "game-picture"],
            "тихий": ["trainer-all"],
        }
        for theme in ("light", "dark"):
            page.evaluate("t => document.documentElement.setAttribute('data-theme', t)", theme)
            seen = {}
            for role, names in roles.items():
                got = [page.evaluate(js, f"#dxDisc .{n} > summary") for n in names]
                for n, g in zip(names, got):
                    self.assertTrue(g["h"], f"{theme}: .{n} ниже 44 px")
                    self.assertEqual(g["arrow"], '"▸"', f"{theme}: .{n} без стрелки ▸")
                    self.assertEqual(g["ls"], "none", f"{theme}: .{n} показывает маркер")
                    self.assertEqual({k: g[k] for k in ("fs", "fw", "c")}, {k: got[0][k] for k in ("fs", "fw", "c")},
                                     f"{theme}: .{n} отличается от других в роли «{role}»")
                seen[role] = got[0]
            # роли различаются, а не совпадают
            self.assertNotEqual((seen["подсказка"]["fw"], seen["подсказка"]["c"]), (seen["раздел"]["fw"], seen["раздел"]["c"]))
        sit = page.evaluate(js, "#dxDisc .sit-summary")
        self.assertEqual((sit["fs"], sit["fw"]), ("16px", "700"))

    def test_live_collection_covers_every_kind(self):
        snaps = da.collect_live(browser=self.browser)
        kinds = da.group_signatures(snaps)
        for k in da.KIND_TITLES:
            self.assertIn(k, kinds, f"нет элементов вида {k}")
        self.assertGreater(kinds["button"]["total"], 30)
        self.assertEqual([t for t, _ in snaps][:2], ["game (настройки)", "game"])


if __name__ == "__main__":
    unittest.main()
