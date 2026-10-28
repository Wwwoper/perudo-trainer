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
Скрипт делает все картинки README и руководства: размеры только 1280×720 (компьютер) и 390×844 ×2
(телефон), плюс длинный экран настроек партии. Статистика снимается на демонстрационных данных
с фиксированными датами. PNG пережимаются без потери качества.
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


def optimize_png(path):
    """Пережать PNG без потери качества (пиксели те же, файл заметно меньше). Без Pillow файл остаётся как есть."""
    try:
        from PIL import Image
    except ImportError:
        return
    with Image.open(path) as im:
        im.load()
        im.save(path, format="PNG", optimize=True, compress_level=9)


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


def set_value(page, selector, value):
    """Записать значение в поле (на телефоне поля количества только для чтения: меняем напрямую)."""
    page.evaluate(
        "([sel, v]) => { const e = document.querySelector(sel); e.value = v;"
        " e.dispatchEvent(new Event('input', {bubbles: true})); e.dispatchEvent(new Event('change', {bubbles: true})); }",
        [selector, str(value)])


def set_quantity(page, plus, minus, field, n):
    """Выставить количество кнопками «+» и «−», как это делает игрок."""
    for _ in range(60):
        cur = int(page.locator(field).input_value())
        if cur == n:
            return
        page.locator(plus if cur < n else minus).click()
    raise RuntimeError(f"не удалось выставить количество {n}")


def wait_my_turn(page):
    page.wait_for_function(
        "document.querySelector('#gStatus')?.textContent?.includes('Ваш ход')", timeout=15000)


def rig_bots(page, hand):
    """Боты получают заданные кубики: так итог раунда не зависит от случая."""
    page.evaluate(
        "h => { const g = window.__perudo_v2.game; for (let i = 1; i < g.players.length; i++) g.players[i].hand = [...h]; }",
        hand)


def new_game(page, bots, dice, reveal=False):
    open_tab(page, "game")
    page.evaluate(
        "([b, d, r]) => { document.querySelector('#gBots').value = b; document.querySelector('#gDice').value = d;"
        " document.querySelector('#gRevealOpt').checked = r; window.__perudo_v2.startNewGame(); }",
        [str(bots), str(dice), reveal])
    page.wait_for_selector(".seat")
    wait_my_turn(page)


def raise_bid(page, qty, face):
    set_quantity(page, "#gPlus", "#gMinus", "#gQ", qty)
    page.locator("#gPick button").nth(face - 1).click()
    page.locator("#gRaise").click()


def wait_bot_bid(page):
    page.wait_for_function(
        "(() => { const g = window.__perudo_v2.game; const s = document.querySelector('#gStatus')?.textContent || '';"
        " return s.includes('Ваш ход') && g?.bid && g.bid.playerId !== 'human'; })()", timeout=15000)


# Демонстрационные данные для Статистики: фиксированные даты, чтобы снимки не менялись со временем.
DEMO_TS = 1760961600000  # 2025-10-20 12:00 UTC


def demo_data():
    games = [
        {"ts": DEMO_TS + i * 3600000 * 5, "players": 4 - (i % 2), "startDice": 5, "rounds": 9 + i % 7,
         "won": i in (1, 4, 7, 10), "decisions": 18 + i * 2}
        for i in range(12)
    ]
    profile = {
        "n": 64, "good": 47, "totalGames": 12, "totalWins": 4, "totalDecisions": 262, "goodDecisions": 171,
        "byMode": {
            "classic": {"n": 30, "good": 24}, "nowild": {"n": 12, "good": 7}, "endgame": {"n": 10, "good": 7},
            "big": {"n": 7, "good": 6}, "solo": {"n": 5, "good": 3},
        },
        "byTag": {
            "endgame": {"n": 14, "good": 6}, "palifico": {"n": 11, "good": 5}, "ones": {"n": 12, "good": 8},
            "bigTable": {"n": 5, "good": 4}, "dudo": {"n": 40, "good": 29},
        },
        "drill": {"A": {"n": 8, "good": 6}, "B": {"n": 4, "good": 3}},
    }
    return games, profile


def seed_demo(page):
    import json
    games, profile = demo_data()
    page.evaluate(
        "([g, p]) => { localStorage.setItem('perudo.games', g); localStorage.setItem('perudo.userProfile', p); }",
        [json.dumps(games), json.dumps(profile)])
    page.reload()
    page.wait_for_function("Boolean(window.__perudo_v2)")


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


def scene_calculator(page, phone):
    open_tab(page, "calc")
    page.locator("#cRnd").click()
    set_quantity(page, "#cPlus", "#cMinus", "#cQ", 7)
    page.locator("#cPick button").nth(4).click()
    page.wait_for_timeout(400)


def scene_trainer(page, phone):
    open_tab(page, "train")
    page.wait_for_timeout(500)


def scene_trainer_feedback(page, phone):
    scene_trainer(page, phone)
    page.locator("#tDudo").click()
    page.wait_for_selector("#tFb .fb-title, #tFb b, #tFb strong")
    page.wait_for_timeout(400)


def scene_drill(page, phone):
    open_tab(page, "drill")
    set_value(page, "#dA1", 5)
    set_value(page, "#dA2", 5)
    page.locator("#dACheck").click()
    page.wait_for_function("document.querySelector('#dAfb').innerText.includes('Ожидание')")
    page.wait_for_timeout(400)


def scene_duel(page, phone):
    open_tab(page, "duel")
    # Время расчёта на экране зависит от машины: подменяем часы, чтобы текст не менялся.
    page.evaluate("(() => { let t = 0; performance.now = () => (t += 1400); })()")
    page.locator("#dSolve").click()
    page.wait_for_function("document.querySelector('#dInfo').innerText.startsWith('Готово')", timeout=60000)
    page.locator("#dStart").click()
    page.wait_for_function("document.querySelector('#dPlay').querySelectorAll('button').length > 3", timeout=60000)
    page.wait_for_timeout(500)


def scene_stats(page, phone):
    seed_demo(page)
    open_tab(page, "stats")
    page.wait_for_timeout(500)


def scene_stats_data(page, phone):
    scene_stats(page, phone)
    page.locator('#stTabs [data-st="data"]').click()
    page.wait_for_timeout(400)


def scene_key_moments(page, phone):
    """Партия 1 на 1 по одному кубику: игрок не верит верной ставке, теряет кубик и проигрывает."""
    new_game(page, 1, 1)
    rig_bots(page, [6])
    page.evaluate("window.__perudo_v2.game.players[0].hand = [3]")   # у игрока нет двоек и единиц: его ставка ложна
    if page.evaluate("window.__perudo_v2.game.bid === null"):
        raise_bid(page, 1, 2)
        page.wait_for_function(
            "(() => { const g = window.__perudo_v2.game; const s = document.querySelector('#gStatus')?.textContent || '';"
            " return (s.includes('Ваш ход') && g?.bid && g.bid.playerId !== 'human')"
            " || document.querySelector('#gResultDialog[open]') !== null; })()", timeout=15000)
    if page.evaluate("document.querySelector('#gResultDialog[open]') === null"):
        # бот повысил ставку: делаем её верной и проверяем — игрок теряет последний кубик
        page.evaluate("() => { const g = window.__perudo_v2.game; g.players[1].hand = [g.bid.f]; }")
        page.locator("#gDudo").click()
    page.wait_for_function("document.querySelector('#gResultDialog[open]') !== null", timeout=15000)
    page.wait_for_timeout(800)
    if page.locator("#gResultDialog[open]").count():
        page.keyboard.press("Escape")
        page.wait_for_timeout(400)
    tab = page.locator("#tabReview")
    if page.locator('.hud-tab-btn[data-open-tab="tabLog"]').is_visible():
        page.locator('.hud-tab-btn[data-open-tab="tabLog"]').click()
        page.wait_for_timeout(300)
    tab.click()
    page.wait_for_timeout(500)


def scene_reveal(page, phone):
    new_game(page, 3, 5, reveal=True)
    rig_bots(page, [2, 2, 2, 2, 2])
    raise_bid(page, 1, 2)
    wait_bot_bid(page)
    page.locator("#gDudo").click()
    page.wait_for_selector("#gReveal[open]", timeout=15000)
    # Полоска таймера в окне идёт сама: рисуем её на фиксированной длине, иначе снимки отличаются на пару пикселей.
    page.add_style_tag(content="#gReveal .reveal-timer i{animation:none !important;transform:scaleX(.7) !important}")
    page.wait_for_timeout(600)


def scene_phone_calc(page, phone):
    new_game(page, 3, 5)
    page.locator('.hud-tab-btn[data-open-tab="tabCalc"]').click()
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
    ("calculator-desktop", DESKTOP, 1, scene_calculator),
    ("calculator-phone", PHONE, 2, scene_calculator),
    ("trainer-situation", DESKTOP, 1, scene_trainer),
    ("trainer-phone", PHONE, 2, scene_trainer),
    ("trainer-feedback", DESKTOP, 1, scene_trainer_feedback),
    ("trainer-feedback-phone", PHONE, 2, scene_trainer_feedback),
    ("drill-desktop", DESKTOP, 1, scene_drill),
    ("drill-phone", PHONE, 2, scene_drill),
    ("duel-desktop", DESKTOP, 1, scene_duel),
    ("duel-phone", PHONE, 2, scene_duel),
    ("stats-desktop", DESKTOP, 1, scene_stats),
    ("stats-phone", PHONE, 2, scene_stats),
    ("stats-data-desktop", DESKTOP, 1, scene_stats_data),
    ("key-moments-desktop", DESKTOP, 1, scene_key_moments),
    ("key-moments-phone", PHONE, 2, scene_key_moments),
    ("reveal-phone", PHONE, 2, scene_reveal),
    ("phone-calc", PHONE, 2, scene_phone_calc),
    ("settings-dark-desktop", None, 1, scene_settings_desktop_tall, "dark"),
    ("game-dark-phone", PHONE, 2, scene_game, "dark"),
]
NAMES = [s[0] for s in SHOTS]


def take(browser, url, name, out_dir):
    """Снимает один кадр. Возвращает путь к файлу."""
    _, viewport, scale, scene, *rest = next(s for s in SHOTS if s[0] == name)
    theme = rest[0] if rest else "light"
    ctx = browser.new_context(viewport=viewport or DESKTOP, device_scale_factor=scale,
                              timezone_id="Europe/Moscow", locale="ru-RU")
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
        optimize_png(path)
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
