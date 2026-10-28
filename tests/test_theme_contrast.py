"""Контраст текста на реальных экранах в светлой и тёмной теме (WCAG AA: 4,5:1, для крупного текста 3:1).

Обходит все разделы на десктопе и телефоне, для каждого видимого текста считает отношение контраста
к фону (с учётом прозрачности цвета и всех предков). Элементы с фоновой картинкой или градиентом пропускаются.
Запуск: python3 -m unittest tests.test_theme_contrast
"""
import functools
import http.server
import os
import threading
import unittest

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESKTOP = {"width": 1280, "height": 720}
PHONE = {"width": 390, "height": 844}
GUEST = "if (!localStorage.getItem('perudo.device')) localStorage.setItem('perudo.device', '{\"account\":\"guest\"}');"
SEED = "let s = 7; Math.random = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };"

# Известные места тёмной темы ниже порога (так было до появления тем). Светлая тема исключений не имеет.
# Ключ: тег и первый класс элемента.
KNOWN_DARK = {"span.trainer-chip", "em.", "span.seat-style"}

MEASURE = r"""() => {
  const parse = (s) => {
    let m = s.match(/rgba?\(([^)]+)\)/);
    if (m) { const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
    m = s.match(/color\(srgb ([^)]+)\)/);
    if (m) { const p = m[1].split(/[ \/]+/).map(Number); return [p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1]; }
    return null;
  };
  const over = (f, b) => { const a = f[3]; return [f[0] * a + b[0] * (1 - a), f[1] * a + b[1] * (1 - a), f[2] * a + b[2] * (1 - a), 1]; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { let x = lum(a), y = lum(b); if (x < y) [x, y] = [y, x]; return (x + 0.05) / (y + 0.05); };
  const bgOf = (el) => {
    const chain = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const c = parse(cs.backgroundColor);
      if (c && c[3] > 0) { chain.push(c); if (c[3] >= 1) break; }
    }
    let base = [255, 255, 255, 1];
    for (let i = chain.length - 1; i >= 0; i--) base = over(chain[i], base);
    return base;
  };
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    for (let x = e; x; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.display === 'none' || cs.visibility === 'hidden') return false; }
    return true;
  };
  const out = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    if (!visible(el) || el.closest('[disabled],[aria-disabled=true],.is-disabled')) continue;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    const bg = bgOf(el);
    if (!fg || !bg) continue;
    let op = 1;
    for (let x = el; x; x = x.parentElement) op *= parseFloat(getComputedStyle(x).opacity);
    const f = over([fg[0], fg[1], fg[2], fg[3] * op], bg);
    const r = ratio(f, bg);
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight) >= 700);
    if (r < (large ? 3 : 4.5)) {
      out.push({ key: el.tagName.toLowerCase() + '.' + (String(el.className).split(' ')[0] || ''), ratio: +r.toFixed(2), text: n.textContent.trim().slice(0, 30) });
    }
  }
  return out;
}"""


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def open_tab(page, tab):
    btn = page.locator(f'.tab-btn[data-t="{tab}"]')
    if not btn.is_visible():
        page.locator(".hud-menu:visible").click()
    btn.click()
    page.wait_for_timeout(250)


def audit(browser, url, theme):
    """Возвращает {экран: [нарушения]} для темы."""
    found = {}
    for vname, vp in (("desktop", DESKTOP), ("phone", PHONE)):
        ctx = browser.new_context(viewport=vp, reduced_motion="reduce")
        ctx.add_init_script(GUEST + SEED + "localStorage.setItem('perudo.settings', JSON.stringify({theme:'%s'}));" % theme)
        page = ctx.new_page()
        page.goto(url)
        page.wait_for_selector(".tab-btn", state="attached")
        for tab in ("calc", "train", "drill", "duel", "sim"):
            open_tab(page, tab)
            found[f"{vname}:{tab}"] = page.evaluate(MEASURE)
        open_tab(page, "stats")
        for sub in ("Results", "Player", "Data"):
            page.locator(f"#stTab{sub}").click()
            page.wait_for_timeout(200)
            found[f"{vname}:stats-{sub.lower()}"] = page.evaluate(MEASURE)
        open_tab(page, "game")
        found[f"{vname}:setup"] = page.evaluate(MEASURE)
        page.evaluate("n => { document.querySelector('#gBots').value = n; document.querySelector('#gRevealOpt').checked = false; window.__perudo_v2.startNewGame(); }", "3")
        page.wait_for_selector(".seat")
        page.wait_for_timeout(800)
        found[f"{vname}:game"] = page.evaluate(MEASURE)
        ctx.close()
    return found


class ThemeContrastTest(unittest.TestCase):
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

    def check(self, theme, known):
        found = audit(self.browser, self.url, theme)
        self.assertGreaterEqual(len(found), 18)       # все разделы обойдены
        bad = [f"{screen}: {v['key']} «{v['text']}» {v['ratio']}"
               for screen, items in found.items() for v in items if v["key"] not in known]
        self.assertEqual(bad, [], f"тема {theme}: текст ниже порога контраста")

    def test_light_theme_has_no_low_contrast_text(self):
        self.check("light", set())

    def test_dark_theme_has_only_known_low_contrast_text(self):
        self.check("dark", KNOWN_DARK)


if __name__ == "__main__":
    unittest.main()
