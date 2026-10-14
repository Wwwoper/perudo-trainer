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
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (ширина, высота, касания). Заказчик: 360×640, 390×844, 844×390, 768×1024, 1366×768.
VIEWPORTS = [(360, 640, True), (390, 844, True), (844, 390, True), (768, 1024, False), (1366, 768, False)]

# Одинаковые «случайные» кубики при каждом запуске, чтобы цифры можно было сравнивать.
SEED = "let s = 7; Math.random = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };"

MEASURE = """(resultSel) => {
  const vw = innerWidth, vh = innerHeight;
  const sec = [...document.querySelectorAll('main > section')].find((s) => !s.classList.contains('hide'));
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
