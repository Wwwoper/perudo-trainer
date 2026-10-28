#!/usr/bin/env python3
"""Скриншоты для README одной командой.

Запуск из корня проекта:
    python3 tools/screenshots.py                       # все снимки из списка в docs/img
    python3 tools/screenshots.py --only game-phone     # только выбранные (через запятую)
    python3 tools/screenshots.py --out /tmp/shots      # в другую папку
    python3 tools/screenshots.py --list                # показать, что умеет скрипт

Нужны playwright и Chromium: pip install -r requirements-test.txt && python3 -m playwright install chromium

Снимки воспроизводимы: генератор случайных чисел в странице подменён на детерминированный,
поэтому имена ботов, кубики и числа симуляции при каждом запуске одни и те же, а diff в git
показывает только реальные изменения вида. Все снимки светлые, кроме двух с «dark» в имени (тёмная тема).
Состояния, которые нужно собирать руками (Калькулятор с результатом, Тренажёр с разбором,
итог партии, Дуэль, Статистика), скрипт не трогает: их картинки в docs/img остаются прежними.
"""
import argparse
import functools
import http.server
import os
import sys
import threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DESKTOP = {"width": 1280, "height": 720}
PHONE = {"width": 390, "height": 844}

# Игрок уже выбрал «гость»: иначе при первом запуске поверх страницы открывается окно выбора.
GUEST = "if (!localStorage.getItem('perudo.device')) localStorage.setItem('perudo.device', '{\"account\":\"guest\"}');"

# mulberry32: тот же поток чисел при каждом запуске.
SEED = """(() => {
  let a = 20261026;
  Math.random = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();"""


def theme_script(theme):
    """Выбор темы до загрузки страницы: снимки не зависят от настроек системы."""
    return ("(() => { const s = JSON.parse(localStorage.getItem('perudo.settings') || '{}'); "
            f"s.theme = '{theme}'; localStorage.setItem('perudo.settings', JSON.stringify(s)); }})();")


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def open_tab(page, tab):
    """Перейти на вкладку; на телефоне лента вкладок спрятана за кнопкой ☰."""
    btn = page.locator(f'.tab-btn[data-t="{tab}"]')
    if not btn.is_visible():
        page.locator(".hud-menu:visible").click()
    btn.click()
    page.wait_for_timeout(400)


def start_game(page, bots=3):
    page.evaluate(
        "n => { document.querySelector('#gBots').value = n;"
        " document.querySelector('#gRevealOpt').checked = false; window.__perudo_v2.startNewGame(); }",
        str(bots))
    page.wait_for_selector(".seat")
    page.wait_for_timeout(1500)


# ---- Сцены: каждая получает страницу, возвращает None; снимок делает вызывающий ----

def scene_settings(page, phone):
    open_tab(page, "game")
    page.wait_for_timeout(300)


def scene_settings2_phone(page, phone):
    scene_settings(page, phone)
    page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight);"
                  " document.querySelectorAll('#gSetup, .game-main, #game').forEach(e => e.scrollTop = e.scrollHeight)")
    page.wait_for_timeout(400)


def scene_settings_desktop_tall(page, phone):
    """Весь экран подготовки целиком: окно выше обычного, чтобы кнопка не закрывала карточки."""
    page.set_viewport_size({"width": 1280, "height": 1330})
    scene_settings(page, phone)
    page.wait_for_timeout(300)


def scene_game(page, phone):
    open_tab(page, "game")
    start_game(page, 3)


def scene_sim(page, phone):
    open_tab(page, "sim")
    page.locator("#sGo").click()
    page.wait_for_function("document.querySelector('#sOut').innerText.length > 40", timeout=60000)
    page.wait_for_timeout(500)


def scene_trainer_settings(page, phone):
    open_tab(page, "train")
    page.locator(".trainer-settings-more > summary").click()
    page.wait_for_timeout(500)


# (имя файла без .png, окно, масштаб, сцена[, тема]); тема по умолчанию светлая
SHOTS = [
    ("settings-desktop", None, 1, scene_settings_desktop_tall),
    ("settings-phone", PHONE, 2, scene_settings),
    ("settings2-phone", PHONE, 2, scene_settings2_phone),
    ("game-desktop", DESKTOP, 1, scene_game),
    ("game-phone", PHONE, 2, scene_game),
    ("sim-desktop", DESKTOP, 1, scene_sim),
    ("sim-phone", PHONE, 2, scene_sim),
    ("trainer-settings-desktop", DESKTOP, 1, scene_trainer_settings),
    ("trainer-settings-phone", PHONE, 2, scene_trainer_settings),
    ("settings-dark-desktop", None, 1, scene_settings_desktop_tall, "dark"),
    ("game-dark-phone", PHONE, 2, scene_game, "dark"),
]
NAMES = [s[0] for s in SHOTS]


def take(browser, url, name, out_dir):
    """Снимает один кадр. Возвращает путь к файлу."""
    _, viewport, scale, scene, *rest = next(s for s in SHOTS if s[0] == name)
    theme = rest[0] if rest else "light"
    ctx = browser.new_context(viewport=viewport or DESKTOP, device_scale_factor=scale)
    try:
        ctx.add_init_script(GUEST)
        ctx.add_init_script(theme_script(theme))
        ctx.add_init_script(SEED)
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(url)
        page.wait_for_function("Boolean(window.__perudo_v2)")
        scene(page, viewport is PHONE)
        if errors:
            raise RuntimeError(f"{name}: ошибки JavaScript на странице: {errors}")
        path = os.path.join(out_dir, f"{name}.png")
        page.screenshot(path=path)
        return path
    finally:
        ctx.close()


def main(argv=None):
    ap = argparse.ArgumentParser(description="Скриншоты для README")
    ap.add_argument("--out", default=os.path.join(ROOT, "docs", "img"), help="папка для картинок (по умолчанию docs/img)")
    ap.add_argument("--only", default="", help="имена снимков через запятую")
    ap.add_argument("--list", action="store_true", help="показать список снимков и выйти")
    args = ap.parse_args(argv)

    if args.list:
        print("\n".join(NAMES))
        return 0
    wanted = [n.strip() for n in args.only.split(",") if n.strip()] or NAMES
    unknown = [n for n in wanted if n not in NAMES]
    if unknown:
        print(f"Неизвестные снимки: {', '.join(unknown)}. Доступны: {', '.join(NAMES)}", file=sys.stderr)
        return 2
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("Нужен playwright: pip install -r requirements-test.txt && python3 -m playwright install chromium",
              file=sys.stderr)
        return 1

    os.makedirs(args.out, exist_ok=True)
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(_Quiet, directory=ROOT))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{httpd.server_address[1]}/index.html"
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            try:
                for name in wanted:
                    print(take(browser, url, name, args.out))
            finally:
                browser.close()
    finally:
        httpd.shutdown()
    return 0


if __name__ == "__main__":
    sys.exit(main())
