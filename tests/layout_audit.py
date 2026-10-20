"""Измеритель вёрстки учебных вкладок: Калькулятор, Тренажёр, Упражнения.

Запуск (из корня проекта):  python3 -m tests.layout_audit [--json]

Печатает таблицу показателей на пяти размерах экрана. Сам ничего не проверяет:
пороги проверяет tests/test_learning_layout.py (он использует measure_all отсюда).
Таблицу удобно смотреть глазами при правках вёрстки.

Показатели на каждое состояние вкладки:
  hscroll   — у страницы есть горизонтальная прокрутка (1/0);
  small     — элементов управления меньше 44×44 px (чекбоксы не считаются);
  font<16   — полей ввода и списков с шрифтом меньше 16 px;
  doc/vh    — высота страницы к высоте экрана, в процентах;
  result    — нижний край результата относительно низа экрана (px, минус значит
              «помещается»; плюс — уходит за экран).
"""
import functools
import http.server
import json
import os
import re
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (ширина, высота, касания). Заказчик: 360×640, 390×844, 844×390, 768×1024, 1366×768.
VIEWPORTS = [(360, 640, True), (390, 844, True), (844, 390, True), (768, 1024, False), (1366, 768, False)]

# Одинаковые «случайные» кубики при каждом запуске, чтобы цифры можно было сравнивать.
SEED = "let s = 7; Math.random = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };"

GAMES_SEED = """(() => { const now = Date.now();
  localStorage.setItem('perudo.games', JSON.stringify(Array.from({ length: 15 }, (_, i) =>
    ({ ts: now - i * 3600000, players: 4, rounds: 12 + i, won: i % 2 === 0, decisions: 30 + i })))); })()"""

MEASURE = """(resultSel) => {
  const vw = innerWidth, vh = innerHeight;
  // Открытое модальное окно измеряется само, иначе — видимый раздел
  const sec = document.querySelector('dialog[open]')
    || [...document.querySelectorAll('main > section')].find((s) => !s.classList.contains('hide'));
  const visible = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && e.offsetParent !== null; };
  const controls = [...sec.querySelectorAll('button, input, select, summary, [role=tab]')].filter(visible);
  const small = controls.filter((e) => { const r = e.getBoundingClientRect();
    return e.type !== 'checkbox' && (r.height < 44 || r.width < 44); }).length;
  const font = controls.filter((e) => ['INPUT', 'SELECT'].includes(e.tagName) && e.type !== 'checkbox'
    && parseFloat(getComputedStyle(e).fontSize) < 16).length;
  const res = sec.querySelector(resultSel);
  const resBottom = res && visible(res) ? Math.round(res.getBoundingClientRect().bottom - vh) : null;
  return { hscroll: document.documentElement.scrollWidth > vw + 1 ? 1 : 0, small, font,
           docPct: Math.round(document.documentElement.scrollHeight / vh * 100), result: resBottom };
}"""


WEAK_SEED = """() => {
  const p = JSON.parse(localStorage.getItem('perudo.userProfile') || '{}');
  p.byTag = { endgame: { n: 12, good: 3 }, palifico: { n: 9, good: 4 }, dudo: { n: 30, good: 18 },
              lastDie: { n: 3, good: 1 } };
  localStorage.setItem('perudo.userProfile', JSON.stringify(p));
  localStorage.setItem('perudo.player', JSON.stringify({ name: 'Максимилиан Игоревич', avatar: { type: 'emoji', value: '🦊' } }));
}"""


# Постоянный игрок уже выбрал режим: окно «Как вы будете играть?» не открывается.
GUEST_SEED = "if (!localStorage.getItem('perudo.device')) localStorage.setItem('perudo.device', '{\"account\":\"guest\"}');"

# Вход в облако выполнен, на устройстве есть партии, а в облаке другая копия: окно выбора и блок «Игрок» с выбором.
CLOUD_SEED = """() => {
  localStorage.setItem('perudo.cloud', JSON.stringify({ token: 'y0_layout_token_0123456789', expiresAt: Date.now() + 86400000, syncedExportedAt: 1 }));
  sessionStorage.setItem('perudo.importNotice', 'Откройте «Статистику».');   // страница откроется на этой вкладке
}"""
CLOUD_FILE = json.dumps({"format": "perudo-backup", "version": 2, "exportedAt": 1700000000000,
                         "data": {"perudo.player": {"name": "Облако", "avatar": None}}})
CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*"}


def _stub_cloud(ctx):
    """Яндекс Диск без сети: ссылки на скачивание и сам файл."""
    def api(route):
        if route.request.method == "OPTIONS":
            return route.fulfill(status=204, headers=CORS)
        return route.fulfill(status=200, headers=CORS, content_type="application/json",
                             body=json.dumps({"href": "https://downloader.stub.test/file"}))

    def file(route):
        if route.request.method == "OPTIONS":
            return route.fulfill(status=204, headers=CORS)
        return route.fulfill(status=200, headers=CORS, content_type="application/json", body=CLOUD_FILE)

    ctx.route("https://cloud-api.yandex.net/**", api)
    ctx.route("https://downloader.stub.test/**", file)


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def _tab(page, name):
    btn = page.locator(f'.tab-btn[data-t="{name}"]')
    if not btn.is_visible():
        page.locator(".hud-menu:visible").click()
    btn.click()


def measure_all(base_url, browser):
    rows = []
    for w, h, touch in VIEWPORTS:
        ctx = browser.new_context(viewport={"width": w, "height": h}, has_touch=touch, is_mobile=touch)
        ctx.add_init_script(SEED)
        # Новичок: окно выбора «гость / Яндекс» поверх страницы
        fresh = ctx.new_page()
        fresh.goto(base_url)
        fresh.wait_for_selector("#clWelcome[open]")
        m = fresh.evaluate(MEASURE, "#clGuest")
        rows.append({"size": f"{w}x{h}", "state": "stats: welcome dialog", **m})
        fresh.close()
        ctx.add_init_script(GUEST_SEED)
        page = ctx.new_page()
        page.goto(base_url)
        page.wait_for_selector("#cRes")

        def snap(label, result_sel):
            m = page.evaluate(MEASURE, result_sel)
            rows.append({"size": f"{w}x{h}", "state": label, **m})

        _tab(page, "calc")
        snap("calc", "#cRes")

        _tab(page, "train")
        snap("train", "#tDudo")
        page.click("#tDudo")
        snap("train: after answer", "#tFb")

        _tab(page, "drill")
        snap("drill A", "#dACheck")
        page.fill("#dA1", "5")
        page.fill("#dA2", "5")
        page.click("#dACheck")
        snap("drill A: after check", "#dAfb")
        page.click("#dAfb .calc-hint summary")
        snap("drill A: hint open", "#dAfb")

        _tab(page, "duel")
        snap("duel", "#dStart")
        page.click("#dStart")
        page.wait_for_selector("#dPlay [data-i]", timeout=60000)
        snap("duel: playing", "#dStart")
        page.click("#dSolve")
        page.wait_for_selector("#dOpen table", timeout=60000)
        snap("duel: solved table", "#dInfo")

        page.evaluate(GAMES_SEED)
        _tab(page, "stats")
        # Страница «Статистики» длинная и прокручивается: на экране без прокрутки должны быть переключатель вкладок и начало содержимого
        snap("stats: results", "#stTabs")
        page.click("#stTabPlayer")
        snap("stats: player", "#stTabs")
        page.click("#plToggle")
        snap("stats: player avatar picker", "#stTabs")
        page.click("#plToggle")
        page.click("#stTabData")
        snap("stats: data", "#stTabs")
        page.click("#stTabResults")
        # «Над чем поработать» с данными и заполненный блок «Игрок»: три слабые темы (две с кнопкой) и тема с малой выборкой
        page.evaluate(WEAK_SEED)
        _tab(page, "sim")
        _tab(page, "stats")
        page.click("#stTabResults")
        page.wait_for_selector("#stWeak .weak-item")
        snap("stats: weak spots", "#stTabs")

        # Облако: окно выбора версии поверх «Статистики», затем тот же выбор в блоке «Игрок»
        _stub_cloud(ctx)
        page.evaluate(CLOUD_SEED)
        page.reload()
        page.wait_for_selector("#clDialog[open]")
        snap("stats: cloud dialog", "#clDialog [data-cl='later']")
        page.click("#clDialog [data-cl='later']")
        page.wait_for_selector("#clPending")
        snap("stats: cloud pending", "#stTabs")

        # Сбой скачивания копии: блок с подробностями и отчёт диагностики
        ctx.route("https://downloader.stub.test/**", lambda r: r.abort())
        ctx.route(re.compile(r"^https://(yandex\.ru|www\.gstatic\.com|uploader\.disk\.yandex\.net|downloader\.disk\.yandex\.ru)/"),
                  lambda r: r.fulfill(status=204, headers=CORS))
        page.evaluate("sessionStorage.setItem('perudo.importNotice', 'x')")
        page.reload()
        page.wait_for_selector(".cloud-detail")
        snap("stats: cloud error", "#stTabs")
        page.click("#clDiag")
        page.wait_for_function("document.querySelector('#clDiagOut') && document.querySelector('#clDiagOut').textContent.includes('Достижимость')")
        snap("stats: cloud diagnostics", "#stTabs")

        _tab(page, "sim")
        snap("sim", "#sGo")
        page.fill("#sR", "2000")
        page.click("#sGo")
        page.wait_for_selector("#sOut table")
        snap("sim: after run", "#sOut p")
        ctx.close()
    return rows


def main(argv):
    handler = functools.partial(_Quiet, directory=ROOT)
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{httpd.server_address[1]}/index.html"
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        rows = measure_all(base, browser)
        browser.close()
    httpd.shutdown()
    if "--json" in argv:
        print(json.dumps(rows, ensure_ascii=False, indent=1))
        return
    print(f"{'size':9} {'state':24} {'hscroll':>7} {'small':>5} {'font<16':>7} {'doc/vh%':>7} {'result':>7}")
    for r in rows:
        res = "—" if r["result"] is None else f"{r['result']:+d}"
        print(f"{r['size']:9} {r['state']:24} {r['hscroll']:>7} {r['small']:>5} {r['font']:>7} {r['docPct']:>7} {res:>7}")


if __name__ == "__main__":
    main(sys.argv[1:])
