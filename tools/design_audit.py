#!/usr/bin/env python3
"""Аудит единообразия интерфейса: что в стилях разъезжается и какие элементы выглядят по-разному.

Запуск из корня проекта:
    python3 tools/design_audit.py                              # отчёт в консоль
    python3 tools/design_audit.py --out docs/dev/design-audit.md   # записать отчёт
    python3 tools/design_audit.py --no-browser                 # только разбор CSS, без браузера

Две части:
  1. Исходники CSS (без браузера): какие размеры шрифта, скругления и отступы используются, что из них токены,
     а что «числа руками», какие селекторы определены в нескольких файлах.
  2. Живой интерфейс (Playwright): обходит вкладки приложения, снимает реальные стили у кнопок, заголовков,
     полей и чипов и группирует их по «подписи» (шрифт, отступы, скругление, цвета). Чем больше подписей у
     одного вида элементов, тем сильнее он разъехался.

Чистые функции (parse_css, scale_usage, duplicate_selectors, group_signatures, render_markdown) проверяет
tests/test_design_audit.py без браузера. Сам скрипт ничего не правит: он только показывает.
"""
import argparse
import collections
import functools
import http.server
import importlib.util
import os
import re
import sys
import threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Файлы стилей, которые подключает index.html.
CSS_FILES = ["src/css/themes.css", "src/table.css", "src/css/base.css", "src/css/game.css", "src/css/learn.css",
             "src/css/components.css", "src/css/trainer.css", "src/css/drill.css"]

# Свойства, у которых смотрим числа в пикселях.
SCALE_PROPS = {
    "font-size": ("font-size",),
    "border-radius": ("border-radius",),
    "spacing": ("padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
                "margin", "margin-top", "margin-right", "margin-bottom", "margin-left", "gap", "row-gap", "column-gap"),
    "min-height": ("min-height",),
}

# ---------- Разбор CSS (без браузера) ----------


def strip_comments(css):
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


def parse_css(css):
    """Плоский список (селектор, свойство, значение). Правила внутри @media/@supports разворачиваются,
    @keyframes и @font-face пропускаются. Это не полноценный парсер, а разбор для статистики:
    любой мусор на входе даёт пустой или неполный результат, но не зависание."""
    css = strip_comments(css)
    out = []
    stack = []          # для каждого открытого блока: пропускаем ли его содержимое
    head_start = 0
    i = 0
    n = len(css)
    while i < n:
        ch = css[i]
        if ch == "{":
            head = css[head_start:i].strip()
            if head.startswith("@"):
                skip = (stack[-1] if stack else False) or head.startswith(("@keyframes", "@-webkit-keyframes", "@font-face"))
                stack.append(skip)
                head_start = i + 1
                i += 1
                continue
            end = css.find("}", i)
            if end == -1:
                break
            if not (stack and stack[-1]):
                for decl in css[i + 1:end].split(";"):
                    prop, sep, value = decl.partition(":")
                    prop, value = prop.strip().lower(), value.strip()
                    if sep and prop and value and not prop.startswith("--"):
                        for sel in head.split(","):
                            out.append((" ".join(sel.split()), prop, value))
            i = end + 1
            head_start = i
            continue
        if ch == "}":
            if stack:
                stack.pop()
            i += 1
            head_start = i
            continue
        i += 1
    return out


def declared_tokens(css):
    """Имена пользовательских свойств (--имя), которые определены в файле."""
    return sorted(set(re.findall(r"(--[a-z0-9-]+)\s*:", strip_comments(css))))


PX_RE = re.compile(r"(?<![\w.-])(-?\d+(?:\.\d+)?)px\b")


def scale_usage(decls, group):
    """Сколько раз встречается каждое число в px у свойств группы и сколько значений идёт через токены var(--…)."""
    props = SCALE_PROPS[group]
    literals = collections.Counter()
    tokens = 0
    for _sel, prop, value in decls:
        if prop not in props:
            continue
        if "var(--" in value:
            tokens += 1
        for m in PX_RE.finditer(value):
            literals[m.group(1).rstrip("0").rstrip(".") if "." in m.group(1) else m.group(1)] += 1
    return {"literals": dict(literals), "tokens": tokens}


def duplicate_selectors(files):
    """Селекторы, которые определены в нескольких файлах: {селектор: [файлы]}. Повторы внутри одного файла
    (например, в разных @media) не считаются."""
    seen = collections.defaultdict(set)
    for name, css in files.items():
        for sel, _prop, _value in parse_css(css):
            seen[sel].add(name)
    return {s: sorted(f) for s, f in sorted(seen.items()) if len(f) > 1}


def button_classes(files):
    """Классы, у которых в названии есть btn/button: примерная карта «видов кнопок»."""
    found = collections.defaultdict(set)
    for name, css in files.items():
        for m in re.finditer(r"\.([a-z0-9_-]*(?:btn|button)[a-z0-9_-]*)", strip_comments(css)):
            found[m.group(1)].add(name)
    return {k: sorted(v) for k, v in sorted(found.items())}


# ---------- Живой интерфейс ----------

# Скрипт для страницы: подписи видимых элементов четырёх видов.
SNAPSHOT_JS = r"""
() => {
  const kinds = {
    button: 'button:not(.die):not(.tab-btn), [role=button], a.quiet-btn',
    heading: 'h1, h2, h3, h4, summary',
    field: 'input:not([type=checkbox]):not([type=radio]):not([type=range]), select, textarea',
    chip: '.chip, .badge',
  };
  const px = (v) => String(Math.round(parseFloat(v) * 10) / 10);
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const label = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
    [...el.classList].slice(0, 2).map((c) => '.' + c).join('');
  const out = [];
  for (const [kind, sel] of Object.entries(kinds)) {
    for (const el of document.querySelectorAll(sel)) {
      if (!vis(el)) continue;
      const s = getComputedStyle(el);
      out.push({
        kind,
        sig: [px(s.fontSize), s.fontWeight, px(s.paddingTop) + '/' + px(s.paddingRight),
              px(s.borderTopLeftRadius), px(s.borderTopWidth), s.backgroundColor, s.color,
              px(el.getBoundingClientRect().height)].join(' · '),
        label: label(el),
        text: (el.textContent || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 24),
      });
    }
  }
  return out;
}
"""

SIG_FIELDS = "шрифт · вес · отступы · скругление · рамка · фон · цвет · высота"


def group_signatures(snapshots):
    """snapshots: [(вкладка, [ {kind, sig, label, text} ])] → {kind: {всего, подписей, группы:[{sig, count, tabs, examples}]}}."""
    kinds = {}
    for tab, items in snapshots:
        for it in items:
            k = kinds.setdefault(it["kind"], {})
            g = k.setdefault(it["sig"], {"count": 0, "tabs": set(), "examples": []})
            g["count"] += 1
            g["tabs"].add(tab)
            ex = it["label"] + (f" «{it['text']}»" if it.get("text") else "")
            if ex not in g["examples"] and len(g["examples"]) < 3:
                g["examples"].append(ex)
    result = {}
    for kind, sigs in kinds.items():
        groups = [{"sig": s, "count": g["count"], "tabs": sorted(g["tabs"]), "examples": g["examples"]}
                  for s, g in sigs.items()]
        groups.sort(key=lambda g: (-g["count"], g["sig"]))
        result[kind] = {"total": sum(g["count"] for g in groups), "variants": len(groups), "groups": groups}
    return result


def _load_screenshots():
    spec = importlib.util.spec_from_file_location("screenshots", os.path.join(ROOT, "tools", "screenshots.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


TABS = ["game", "train", "drill", "calc", "duel", "sim", "stats"]


def _walk(browser, url, shots, theme):
    ctx = browser.new_context(viewport=shots.DESKTOP, timezone_id="Europe/Moscow", locale="ru-RU")
    try:
        ctx.add_init_script(shots.GUEST)
        ctx.add_init_script(shots.theme_script(theme))
        ctx.add_init_script(shots.SEED)
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(url)
        page.wait_for_function("Boolean(window.__perudo_v2)")
        snaps = []
        for tab in TABS:
            shots.open_tab(page, tab)
            if tab == "game":
                snaps.append(("game (настройки)", page.evaluate(SNAPSHOT_JS)))
                shots.start_game(page, 3)
            snaps.append((tab, page.evaluate(SNAPSHOT_JS)))
        if errors:
            raise RuntimeError(f"ошибки JavaScript на странице: {errors}")
        return snaps
    finally:
        ctx.close()


def collect_live(theme="light", browser=None):
    """Обходит вкладки приложения и возвращает [(вкладка, снимок)]. Нужен playwright.
    browser — уже запущенный браузер (иначе запускается свой)."""
    shots = _load_screenshots()
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(shots._Quiet, directory=ROOT))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{httpd.server_address[1]}/index.html"
    try:
        if browser is not None:
            return _walk(browser, url, shots, theme)
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            own = pw.chromium.launch()
            try:
                return _walk(own, url, shots, theme)
            finally:
                own.close()
    finally:
        httpd.shutdown()


# ---------- Отчёт ----------

KIND_TITLES = {"button": "Кнопки", "heading": "Заголовки и «summary»", "field": "Поля и списки", "chip": "Чипы и значки"}


def render_markdown(static, live=None):
    """static: {'scales': {группа: {literals, tokens}}, 'duplicates': {...}, 'buttons': {...}, 'tokens': N}.
    live: результат group_signatures или None."""
    L = ["# Аудит единообразия интерфейса", "",
         "Файл создаёт `python3 tools/design_audit.py --out docs/dev/design-audit.md`. Не правьте его вручную: "
         "пересоздайте после изменения стилей. Что делать с цифрами — см. [design.md](design.md).", ""]
    L += ["## 1. Исходники CSS", "", f"Токенов (`--имя`), определённых в стилях: **{static['tokens']}**.", ""]
    titles = {"font-size": "Размер шрифта", "border-radius": "Скругление", "spacing": "Отступы (padding, margin, gap)",
              "min-height": "Минимальная высота"}
    for group, title in titles.items():
        u = static["scales"][group]
        lits = sorted(u["literals"].items(), key=lambda kv: (-kv[1], float(kv[0])))
        total = sum(c for _, c in lits)
        L += [f"### {title}", "",
              f"Значений через токены: **{u['tokens']}**; чисел в px: **{total}**, разных чисел: **{len(lits)}**.", ""]
        if lits:
            L += ["| px | раз |", "|---:|---:|"] + [f"| {v} | {c} |" for v, c in lits] + [""]
    dup = static["duplicates"]
    L += ["### Селекторы, определённые в нескольких файлах", ""]
    L += [f"- `{s}` — {', '.join(f'`{f}`' for f in fs)}" for s, fs in dup.items()] if dup else ["Нет."]
    L += ["", "### Классы кнопок", ""]
    btn = static["buttons"]
    L += [f"- `.{c}` — {', '.join(f'`{f}`' for f in fs)}" for c, fs in btn.items()] if btn else ["Нет."]
    L += [""]
    if live is not None:
        L += ["## 2. Живой интерфейс", "",
              f"Подпись элемента: {SIG_FIELDS}. Чем больше разных подписей у одного вида, тем сильнее он разъехался.", ""]
        for kind, title in KIND_TITLES.items():
            data = live.get(kind)
            if not data:
                continue
            L += [f"### {title}: {data['total']} шт., разных подписей — {data['variants']}", "",
                  "| раз | подпись | вкладки | примеры |", "|---:|---|---|---|"]
            for g in data["groups"][:12]:
                L.append(f"| {g['count']} | {g['sig']} | {', '.join(g['tabs'])} | {'; '.join(g['examples'])} |")
            if len(data["groups"]) > 12:
                L.append(f"| … | ещё подписей: {len(data['groups']) - 12} | | |")
            L.append("")
    return "\n".join(L).rstrip() + "\n"


def static_report(root=ROOT):
    files = {}
    for rel in CSS_FILES:
        with open(os.path.join(root, rel), encoding="utf-8") as f:
            files[rel] = f.read()
    # themes.css — только определения токенов: сравнивать его правила с остальными нет смысла
    code = {k: v for k, v in files.items() if not k.endswith("themes.css")}
    decls = [d for css in code.values() for d in parse_css(css)]
    all_tokens = set()
    for css in files.values():
        all_tokens.update(declared_tokens(css))
    return {
        "tokens": len(all_tokens),
        "scales": {g: scale_usage(decls, g) for g in SCALE_PROPS},
        "duplicates": duplicate_selectors(code),
        "buttons": button_classes(code),
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description="Аудит единообразия интерфейса")
    ap.add_argument("--out", help="записать отчёт в файл (например, docs/dev/design-audit.md)")
    ap.add_argument("--no-browser", action="store_true", help="только разбор CSS")
    args = ap.parse_args(argv)
    live = None
    if not args.no_browser:
        try:
            live = group_signatures(collect_live())
        except ImportError:
            print("Нужен playwright: pip install -r requirements-test.txt && python3 -m playwright install chromium",
                  file=sys.stderr)
            return 1
    text = render_markdown(static_report(), live)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(text)
        print(args.out)
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
