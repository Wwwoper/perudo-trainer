#!/usr/bin/env python3
"""
Доказательная база для текстов тренера («Картина партии»).

Любая цифра или утверждение о том, «как обычно бывает за столом», должны опираться на измерение.
Скрипт прогоняет партии ботов из `tools/emulator.py`, собирает факты и печатает Markdown-документ
(`docs/dev/strategy-evidence.md`). Цифры относятся к нашим ботам, а не к людям.

  python3 tools/strategy_evidence.py --games 1500 --seed 1 --out docs/dev/strategy-evidence.md
  python3 tools/strategy_evidence.py --games 40 --seed 1          # быстрый прогон, печать в консоль

Внешних пакетов нет. Результат полностью определяется параметрами (`--games`, `--seed`, `--level`).
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from types import SimpleNamespace

HERE = Path(__file__).resolve().parent


def _load_emulator():
    spec = importlib.util.spec_from_file_location("emulator_for_evidence", HERE / "emulator.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["emulator_for_evidence"] = mod  # нужно для dataclass
    spec.loader.exec_module(mod)
    return mod


EMU = _load_emulator()

# Корзины для «шага» ставки относительно предыдущей в раунде.
STEP_BUCKETS = ("смена грани", "+1", "+2 и больше")
# Корзины по числу кубиков у автора ставки.
DICE_BUCKETS = ("1", "2", "3+")


class _Sink:
    """Принимает строки JSONL, как открытый файл; хранит разобранные записи."""

    def __init__(self):
        self.records = []

    def write(self, line):
        line = line.strip()
        if line:
            self.records.append(json.loads(line))


def count_face(hands, face, wild):
    """Сколько кубиков грани `face` на столе (единицы-джокеры считаются, если `wild` и грань не 1)."""
    return sum(1 for h in hands for d in h if d == face or (wild and d == 1 and face != 1))


def step_bucket(prev, cur):
    """Корзина шага: смена грани при не большем числе кубиков, +1 или +2 и больше по количеству."""
    delta = cur["q"] - prev["q"]
    if delta <= 0:
        return STEP_BUCKETS[0]
    return STEP_BUCKETS[1] if delta == 1 else STEP_BUCKETS[2]


def dice_bucket(n):
    return DICE_BUCKETS[0] if n <= 1 else DICE_BUCKETS[1] if n == 2 else DICE_BUCKETS[2]


def share(num, den):
    """Доля или None, если измерений нет (чтобы не рисовать 0 % там, где данных нет)."""
    return None if den == 0 else num / den


def analyze_game(records):
    """Факты одной партии из JSONL-записей эмулятора.

    Возвращает словарь счётчиков; все ключи — простые числа, чтобы их можно было складывать между партиями.
    """
    c: Counter = Counter()
    hands_by_name: dict = {}
    wild = True
    bids: list = []  # [{player, style, bid, bluff, dice}] текущего раунда
    for rec in records:
        ev = rec["ev"]
        if ev == "round":
            hands_by_name = rec["hands"]
            wild = not rec["palifico"]
            bids = []
        elif ev == "action":
            if rec["action"] == "raise":
                bid = rec["bid"]
                player = rec["player"]
                bids.append({
                    "player": player, "style": rec["style"], "bid": bid, "bluff": bool(rec["bluff"]),
                    "dice": len(hands_by_name[player]), "wild": wild,
                })
        elif ev == "reveal":
            hands = list(hands_by_name.values())
            for i, b in enumerate(bids):
                face, q = b["bid"]["f"], b["bid"]["q"]
                true_ = count_face(hands, face, b["wild"]) >= q
                st = b["style"]
                c[f"style.{st}.bids"] += 1
                c[f"style.{st}.false"] += 0 if true_ else 1
                c[f"style.{st}.flagged"] += 1 if b["bluff"] else 0
                c[f"style.{st}.flagged_false"] += 1 if (b["bluff"] and not true_) else 0
                if i == 0:
                    own_face = face in hands_by_name[b["player"]]
                    key = "own" if own_face else "other"
                    c[f"open.{key}.bids"] += 1
                    c[f"open.{key}.true"] += 1 if true_ else 0
                    db = dice_bucket(b["dice"])
                    c[f"open.dice.{db}.bids"] += 1
                    c[f"open.dice.{db}.true"] += 1 if true_ else 0
                else:
                    sb = step_bucket(bids[i - 1]["bid"], b["bid"])
                    c[f"step.{sb}.bids"] += 1
                    c[f"step.{sb}.true"] += 1 if true_ else 0
            if rec.get("kind") == "dudo" and bids:
                last = bids[-1]
                db = dice_bucket(last["dice"])
                c[f"dudo.{db}.calls"] += 1
                c[f"dudo.{db}.bid_false"] += 0 if rec["bidSuccessful"] else 1
                c["dudo.calls"] += 1
                c["dudo.bid_false"] += 0 if rec["bidSuccessful"] else 1
            c["rounds"] += 1
    return c


def rotated_styles(i, bots):
    """Стили для партии номер `i`: все пять стилей по кругу, чтобы каждый стиль попал в выборку."""
    keys = list(EMU.BOT_STYLES)
    return ",".join(keys[(i + j) % len(keys)] for j in range(bots))


def run(games, seed, level="normal", bots=4, dice=5, palifico=True):
    """Прогоняет `games` партий (seed, seed+1, ...) и суммирует факты. Стили ботов вращаются по партиям."""
    if games < 1:
        raise ValueError("games должно быть не меньше 1")
    if not 1 <= bots <= len(EMU.BOT_STYLES):
        raise ValueError("bots: от 1 до числа стилей")
    total: Counter = Counter()
    for i in range(games):
        args = SimpleNamespace(bots=bots, dice=dice, level=level, palifico=palifico, calza=False,
                               styles=rotated_styles(i, bots))
        sink = _Sink()
        EMU.play_game(args, seed + i, lambda *_a, **_k: None, sink)
        total.update(analyze_game(sink.records))
    total["games"] = games
    return dict(total)


def hit_probability(hidden, need, p):
    """P(среди `hidden` скрытых кубиков не меньше `need` нужной грани), p — шанс одного кубика."""
    if need <= 0:
        return 1.0
    if need > hidden:
        return 0.0
    return min(1.0, sum(EMU.comb(hidden, k) * p ** k * (1 - p) ** (hidden - k) for k in range(need, hidden + 1)))


def expectation_table(hiddens=(5, 10, 15, 20)):
    """Точная таблица: ожидание и шанс «набрать» ожидание и ожидание ± 1/2/3 (обычная грань, единицы — джокеры)."""
    rows = []
    for h in hiddens:
        exp = h / 3
        base = round(exp)
        row = {"hidden": h, "expected": exp, "base": base}
        for d in (-1, 0, 1, 2, 3):
            row[d] = hit_probability(h, base + d, 1 / 3)
        rows.append(row)
    return rows


def pct(x):
    return "—" if x is None else f"{x * 100:.0f} %"


def render(total, meta):
    """Markdown-документ по результатам `run`."""
    L = []
    a = L.append
    a("# Доказательная база тренера")
    a("")
    a("Сгенерировано скриптом `tools/strategy_evidence.py`. Не правьте файл вручную: перезапустите скрипт.")
    a("")
    a("Все цифры получены на **наших ботах**, а не на людях: они показывают, как ведёт себя игра приложения, и не доказывают, что так же ходят люди. Любая строка пояснения тренера, где есть число, должна ссылаться на таблицу отсюда.")
    a("")
    a("## Как воспроизвести")
    a("")
    a("```")
    a(f"python3 tools/strategy_evidence.py --games {meta['games']} --seed {meta['seed']} --level {meta['level']} --out docs/dev/strategy-evidence.md")
    a("```")
    a("")
    a(f"- версия приложения: {meta['version']};")
    a(f"- партий: {meta['games']}, раундов: {total.get('rounds', 0)}, начальное число seed: {meta['seed']};")
    a("- стили ботов вращаются по партиям: за столом всегда четыре из пяти стилей, места меняются;")
    a(f"- уровень ботов: {meta['level']}, ботов за столом: {meta['bots']}, кубиков в руке: {meta['dice']}, Палифико: {'да' if meta['palifico'] else 'нет'}, Calza выключена.")
    a("")

    a("## 1. Ожидание и шанс ставки (точный расчёт)")
    a("")
    a("Скрытых кубиков `h`, обычная грань с единицами-джокерами: шанс одного кубика 1/3, ожидание `h/3`. В колонках: шанс, что у соперников **не меньше** `база + сдвиг` нужной грани (база — ожидание, округлённое до целого).")
    a("")
    a("| Скрытых кубиков | Ожидание | База | база −1 | база | база +1 | база +2 | база +3 |")
    a("|---:|---:|---:|---:|---:|---:|---:|---:|")
    for r in expectation_table():
        a(f"| {r['hidden']} | {r['expected']:.1f} | {r['base']} | " + " | ".join(pct(r[d]) for d in (-1, 0, 1, 2, 3)) + " |")
    a("")
    a("Как читать: ставка «на ожидание» верна чуть чаще, чем в половине случаев; каждый кубик сверх ожидания заметно снижает шанс. Для единиц и для Палифико шанс одного кубика 1/6, ожидание `h/6`.")
    a("")

    a("## 2. Как часто ставки ботов оказываются ложными")
    a("")
    a("Ставка «ложная», если при вскрытии на столе меньше кубиков, чем заявлено (смотрим все ставки раунда, не только последнюю). «Бот сам назвал блефом» — флаг блефа в решении бота.")
    a("")
    a("| Стиль | Ставок | Ложных | Помечено блефом | Из помеченных ложных |")
    a("|---|---:|---:|---:|---:|")
    for st in EMU.BOT_STYLES:
        bids = total.get(f"style.{st}.bids", 0)
        a(f"| {EMU.BOT_STYLES[st]['name']} | {bids} | {pct(share(total.get(f'style.{st}.false', 0), bids))} | "
          f"{pct(share(total.get(f'style.{st}.flagged', 0), bids))} | "
          f"{pct(share(total.get(f'style.{st}.flagged_false', 0), total.get(f'style.{st}.flagged', 0)))} |")
    a("")

    a("## 3. Верна ли ставка после «прыжка»")
    a("")
    a("Сравниваем ставку с предыдущей ставкой раунда. Шаг: «смена грани» (число кубиков не выросло), «+1» или «+2 и больше» по количеству.")
    a("")
    a("| Шаг | Ставок | Из них верных |")
    a("|---|---:|---:|")
    for b in STEP_BUCKETS:
        n = total.get(f"step.{b}.bids", 0)
        a(f"| {b} | {n} | {pct(share(total.get(f'step.{b}.true', 0), n))} |")
    a("")

    a("## 4. Когда «не верю» срабатывает")
    a("")
    a("Берём проверку последней ставки раунда и смотрим, сколько кубиков осталось у её автора.")
    a("")
    a("| Кубиков у автора ставки | Проверок | Ставка оказалась ложной |")
    a("|---|---:|---:|")
    for b in DICE_BUCKETS:
        n = total.get(f"dudo.{b}.calls", 0)
        a(f"| {b} | {n} | {pct(share(total.get(f'dudo.{b}.bid_false', 0), n))} |")
    a(f"| все | {total.get('dudo.calls', 0)} | {pct(share(total.get('dudo.bid_false', 0), total.get('dudo.calls', 0)))} |")
    a("")

    a("## 5. Первая ставка раунда")
    a("")
    a("«На свою грань» — игрок называет грань, которая есть у него в руке (для единиц — если есть единица).")
    a("")
    a("| Первая ставка | Ставок | Верных |")
    a("|---|---:|---:|")
    for key, label in (("own", "на свою грань"), ("other", "на чужую грань")):
        n = total.get(f"open.{key}.bids", 0)
        a(f"| {label} | {n} | {pct(share(total.get(f'open.{key}.true', 0), n))} |")
    a("")
    a("По числу кубиков у открывающего:")
    a("")
    a("| Кубиков | Первых ставок | Верных |")
    a("|---|---:|---:|")
    for b in DICE_BUCKETS:
        n = total.get(f"open.dice.{b}.bids", 0)
        a(f"| {b} | {n} | {pct(share(total.get(f'open.dice.{b}.true', 0), n))} |")
    a("")
    a("## Ограничения")
    a("")
    a("- Боты ходят по правилам своих стилей и не подстраиваются под игрока, поэтому выводы о людях делать нельзя.")
    a("- Выборка внутри одной корзины может быть мала: смотрите на столбец «Ставок» прежде чем ссылаться на процент. Строки с «—» значат, что измерений нет.")
    a("- Ложность ставки считается по всем рукам при вскрытии; игрок в момент хода этого не знал.")
    a("")
    return "\n".join(L)


def app_version(root=None):
    root = Path(root) if root else HERE.parent
    try:
        return json.loads((root / "package.json").read_text(encoding="utf-8")).get("version", "?")
    except (OSError, ValueError):
        return "?"


def main(argv=None):
    ap = argparse.ArgumentParser(description="Доказательная база для текстов тренера")
    ap.add_argument("--games", type=int, default=40)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--level", choices=list(EMU.BOT_LEVELS), default="normal")
    ap.add_argument("--out", default="", help="файл Markdown; без него — печать в консоль")
    ns = ap.parse_args(argv)
    if ns.games < 1:
        ap.error("--games: не меньше 1")
    total = run(ns.games, ns.seed, ns.level)
    meta = {"games": ns.games, "seed": ns.seed, "level": ns.level, "bots": 4, "dice": 5,
            "palifico": True, "version": app_version()}
    text = render(total, meta)
    if ns.out:
        Path(ns.out).parent.mkdir(parents=True, exist_ok=True)
        Path(ns.out).write_text(text, encoding="utf-8")
        print(f"Записано: {ns.out}")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
