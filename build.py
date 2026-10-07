#!/usr/bin/env python3
"""
build.py — сборка Perudo Trainer v2 (Variant B) в один HTML-файл.

Что делает:
  1. Читает index.html.
  2. Встраивает <link rel="stylesheet" href="src/table.css"> как <style>.
  3. Читает ES-модули из src/, снимает import/export, склеивает
     в один <script type="module"> в порядке зависимостей.
  4. Пишет perudo-standalone.html.

Использование:
    python3 build.py
"""

import re
from pathlib import Path

SRC = Path("src")
OUT = Path("perudo-standalone.html")

# Порядок важен: зависимости идут раньше тех, кто их использует.
JS_FILES = [
    "core.js",  # UMD → window.Perudo
    "rules.js",  # правила ставок
    "engine.js",  # игровой движок (импортирует rules)
    "assist.js",  # режимы помощи
    "storage.js",  # localStorage
    "bots.js",  # стили ботов, generateCharacter, botDecide
    "table.js",  # рендер стола (renderTable)
    "app_v2.js",  # точка входа
]

CSS_FILES = ["table.css"]


def strip_module_syntax(code: str) -> str:
    """Убирает import/export, чтобы склеить модули в один <script>."""
    # import ... from '...';   (однострочные)
    code = re.sub(r"^[ \t]*import\s+[^;\n]+;\s*$", "", code, flags=re.MULTILINE)
    # export function / class / const / let / var
    code = re.sub(
        r"^export\s+(function|class|const|let|var)\s+", r"\1 ", code, flags=re.MULTILINE
    )
    # export { a, b, c };
    code = re.sub(r"^[ \t]*export\s*\{[^}]*\}\s*;?\s*$", "", code, flags=re.MULTILINE)
    # export default X;   (на всякий случай)
    code = re.sub(
        r"^[ \t]*export\s+default\s+",
        "const __default_export = ",
        code,
        flags=re.MULTILINE,
    )
    return code


def inline_css(html: str, filename: str) -> str:
    p = SRC / filename
    if not p.exists():
        print(f"  ⚠ нет файла: {p}")
        return html
    css = p.read_text(encoding="utf-8")
    pattern = rf'<link[^>]*href="src/{re.escape(filename)}"[^>]*>'
    if not re.search(pattern, html):
        print(f"  ⚠ в index.html нет <link> на src/{filename}")
        return html
    html = re.sub(
        pattern, f"<style>\n/* === {filename} === */\n{css}\n</style>", html, count=1
    )
    print(f"  ✓ src/{filename}")
    return html


def build_js_bundle() -> str:
    parts = []
    for js_file in JS_FILES:
        p = SRC / js_file
        if not p.exists():
            print(f"  ⚠ пропущен: {p}")
            continue
        code = strip_module_syntax(p.read_text(encoding="utf-8"))
        parts.append(f"/* === {js_file} === */\n{code}")
        print(f"  ✓ src/{js_file}")
    bundle = '<script type="module">\n' + "\n\n".join(parts) + "\n</script>"
    return bundle


def build():
    print("Сборка Perudo Trainer v2 (Variant B)...")

    if not Path("index.html").exists():
        raise SystemExit("index.html не найден")

    html = Path("index.html").read_text(encoding="utf-8")

    print("CSS:")
    for css in CSS_FILES:
        html = inline_css(html, css)

    print("JS:")
    bundle = build_js_bundle()

    # Заменяем точку входа на встроенный бандл
    entry = re.compile(
        r'<script\s+type="module"\s+src="src/app_v2\.js"\s*>\s*</script>'
    )
    if entry.search(html):
        html = entry.sub(bundle, html, count=1)
    else:
        # если вдруг разметка другая — вставим перед </body>
        html = html.replace("</body>", bundle + "\n</body>")

    # Убираем отдельный тег core.js — он уже внутри модульного бандла
    html = re.sub(r'<script\s+src="src/core\.js"\s*>\s*</script>', "", html)
    OUT.write_text(html, encoding="utf-8")
    print(f"\n✓ Готово: {OUT} ({len(html):,} байт)")


if __name__ == "__main__":
    build()
