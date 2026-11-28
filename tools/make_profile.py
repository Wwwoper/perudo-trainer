#!/usr/bin/env python3
"""Генератор тестового профиля игрока: резервная копия «perudo-backup» версии 2.

Нужен, чтобы загрузить большой профиль на Яндекс Диск («Данные» → «Загрузить из файла») и посмотреть вёрстку
раздела «Статистика → Результаты» на предельных данных. Файл детерминированный: один и тот же `--seed` даёт
побайтно тот же результат, поэтому при изменении схемы профиль пересобирается командой

    python3 tools/make_profile.py            # tools/profiles/perudo-backup-max.json
    python3 tools/make_profile.py --check    # файл в репозитории соответствует генератору (для тестов)

Профиль «max» доводит каждый раздел до предела из `src/` (MAX_GAMES, MAX_MOMENTS, MAX_ROUNDS, MAX_QUEUE, MAX_KEYS),
берёт длинные имена и большие числа. Что генератор обязан укладываться в схему, проверяет `tests/make_profile.test.js`:
файл проходит `parseBackup` без отброшенных записей и не меняется от проверки.
"""
import argparse
import json
import os
import random
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_OUT = os.path.join(ROOT, "tools", "profiles", "perudo-backup-max.json")
DEFAULT_SEED = 20261128

# Пределы схемы (src/data_schema.js, moments.js, rounds.js). Сверяются с кодом в tests/make_profile.test.js.
LIMITS = {
    "MAX_GAMES": 200,
    "MAX_MOMENTS": 50,
    "MAX_ROUNDS": 40,
    "MAX_QUEUE": 200,
    "MAX_KEYS": 100,
    "MAX_ROUND_BIDS": 60,
    "MAX_COUNT": 10 ** 9,
}

EXPORTED_AT = 1795910400000        # 2026-11-28 00:00 UTC, мс: фиксировано ради воспроизводимости
DAY_MS = 86_400_000

REAL_MODES = ["classic", "nowild", "endgame", "big", "bluffer", "ladder", "solo"]
REAL_TAGS = ["dudo", "raise", "calza", "endgame", "lastDie", "palifico", "ones", "bigTable"]
QUEUE_MODES = ["classic", "nowild", "endgame", "solo", "big", "ladder"]
STYLES = ["careful", "bluffer", "smart", "aggressor", "skeptic"]
ASSIST = ["novice", "training", "game"]
NAMES = ["Аркадий", "Борис", "Виолетта", "Гермиона", "Добрыня", "Евдокия", "Жанна", "Захар", "Ирина", "Кузьма",
         "Любомир", "Мирослава", "Назар", "Октябрина", "Прохор", "Ростислав", "Святогор", "Тамара"]
LONG_KEY = "очень-длинный-ключ-режима-" + "я" * 38        # ровно 64 символа — предел длины ключа


def pair(rng, n_lo, n_hi, rate_lo=0.35, rate_hi=0.85):
    """Счётчик { n, good } с good ≤ n."""
    n = rng.randint(n_lo, n_hi)
    return {"n": n, "good": int(n * rng.uniform(rate_lo, rate_hi))}


def table(rng, real_keys, extra_prefix, total):
    """Таблица счётчиков ровно из `total` ключей: настоящие, затем выдуманные (с одним ключом предельной длины)."""
    t = {k: pair(rng, 20_000, 900_000) for k in real_keys}
    i = 1
    while len(t) < total:
        key = LONG_KEY if i == 1 else f"{extra_prefix}-{i:02d}"
        t[key] = pair(rng, 0, 1_500) if i % 7 else pair(rng, 900_000_000, LIMITS["MAX_COUNT"])
        i += 1
    return t


def make_stats(rng):
    n = 3_482_917
    decisions = 1_204_338
    return {
        "n": n, "good": int(n * 0.71),
        "totalGames": 4_816, "totalWins": 1_922,
        "totalDecisions": decisions, "goodDecisions": int(decisions * 0.64),
        "byMode": table(rng, REAL_MODES, "режим", LIMITS["MAX_KEYS"]),
        "byTag": table(rng, REAL_TAGS + ["ladder"], "метка", LIMITS["MAX_KEYS"]),
        "drill": {"A": pair(rng, 40_000, 90_000), "B": pair(rng, 40_000, 90_000)},
        "quizLast": {"correct": 14, "total": 20, "points": 38, "max": 60, "guess": 6},
        "quizPrev": {"correct": 9, "total": 20, "points": 21, "max": 60, "guess": 6},
    }


def make_games(rng):
    out = []
    ts = EXPORTED_AT - 120 * DAY_MS
    for i in range(LIMITS["MAX_GAMES"]):
        ts += rng.randint(3, 20) * 3_600_000
        rec = {
            "ts": ts, "players": rng.randint(2, 6), "startDice": rng.choice([5, 5, 5, 3, 6, 10]),
            "rounds": rng.randint(4, 48), "won": rng.random() < 0.4, "decisions": rng.randint(8, 160),
            "calza": rng.random() < 0.3, "palifico": rng.random() < 0.3,
        }
        if i % 5:
            rec["assistMode"] = rng.choice(ASSIST)
        out.append(rec)
    return out


def hand(rng, k):
    return [rng.randint(1, 6) for _ in range(k)]


def split_dice(rng, players, my_dice):
    """Кубики по игрокам: у каждого 1–10, у человека (место me) — my_dice."""
    return [my_dice if i == 0 else rng.randint(1, 10) for i in range(players)]


def make_moments(rng):
    out = []
    ts = EXPORTED_AT - 30 * DAY_MS
    for i in range(LIMITS["MAX_MOMENTS"]):
        ts += rng.randint(1, 18) * 3_600_000
        players = rng.randint(2, 6)
        my = rng.randint(1, 10)
        dice = split_dice(rng, players, my)
        me = rng.randrange(players)
        dice[0], dice[me] = dice[me], dice[0]
        total = sum(dice)
        kind = ["raise", "dudo", "calza"][i % 3]
        face = rng.randint(1, 6)
        bid = {"q": rng.randint(1, max(1, total // 2)), "f": rng.randint(1, 6)}
        seat_others = [s for s in range(players) if s != me]
        bids = [{"s": rng.choice(seat_others), "q": max(1, bid["q"] - 1), "f": bid["f"]},
                {"s": rng.choice(seat_others), "q": bid["q"], "f": bid["f"]}]
        p = round(rng.random(), 3)
        tags = [t for t in ["dudo", "raise", "calza", "endgame", "lastDie", "palifico", "ones", "bigTable"]
                if t == kind or rng.random() < 0.2]
        out.append({
            "id": f"g{i // 3 + 1}-{i % 3 + 1}", "ts": ts, "round": rng.randint(0, 40), "kind": kind,
            "n": total, "h": hand(rng, my), "myDice": my,
            "bid": None if kind == "raise" and i % 2 else bid,
            "played": {"q": bid["q"] + 1, "f": face} if kind == "raise" else None,
            "wild": rng.random() < 0.8, "p": p, "code": "good" if p >= 0.6 else ("meh" if p >= 0.3 else "bad"),
            "lostDie": rng.random() < 0.4, "tags": tags,
            "ctx": {"me": me, "dice": dice, "styles": [None if s == me else rng.choice(STYLES) for s in range(players)],
                    "bids": bids},
        })
    return out


def make_rounds(rng):
    out = []
    ts = EXPORTED_AT - 20 * DAY_MS
    for i in range(LIMITS["MAX_ROUNDS"]):
        ts += rng.randint(1, 12) * 3_600_000
        n = rng.randint(2, 6)
        wild = rng.random() < 0.8
        dice = [rng.randint(1, 5) for _ in range(n)]
        hands = [hand(rng, k) for k in dice]
        me = rng.randrange(n)
        total = sum(dice)
        n_bids = LIMITS["MAX_ROUND_BIDS"] if i == 0 else rng.randint(1, 12)   # один раунд с предельным числом ставок
        bids = []
        for j in range(n_bids):
            bids.append({"s": j % n, "q": min(100, 1 + j // 3 + rng.randint(0, 1)), "f": rng.randint(1, 6)})
        last = bids[-1]
        by = (last["s"] + 1) % n
        actual = sum(1 for h in hands for d in h if d == last["f"] or (wild and d == 1 and last["f"] != 1))
        kind = "calza" if i % 5 == 4 else "dudo"
        ok = actual == last["q"] if kind == "calza" else actual >= last["q"]
        out.append({
            "id": f"r{i + 1}", "ts": ts, "round": rng.randint(0, 40), "wild": wild, "me": me,
            "ids": [("human" if s == me else f"bot{s}") for s in range(n)],
            "names": [None if s == me else NAMES[(i + s) % len(NAMES)] for s in range(n)],
            "dice": dice, "styles": [None if s == me else rng.choice(STYLES) for s in range(n)],
            "hands": hands, "bids": bids,
            "end": {"kind": kind, "by": by, "bidder": last["s"], "actual": actual, "ok": ok},
        })
        assert total >= 2
    return out


def make_queue(rng):
    out = []
    for i in range(LIMITS["MAX_QUEUE"]):
        mode = QUEUE_MODES[i % len(QUEUE_MODES)]
        k = rng.randint(1, 5)
        h = hand(rng, k)
        if mode == "ladder":
            opp = rng.randint(2, 4)
            ks = [rng.randint(1, 5) for _ in range(opp)]
            n = k + sum(ks)
            bids = [{"s": j % opp, "q": min(n, 1 + j), "f": rng.randint(1, 6)} for j in range(rng.randint(3, 12))]
            last = bids[-1]
            names = rng.sample(NAMES, opp)
            out.append({"mode": mode, "n": n, "h": h, "f": last["f"], "q": last["q"], "streak": rng.randint(0, 10),
                        "wild": rng.random() < 0.8, "ks": ks, "names": names, "bids": bids})
        else:
            n = rng.randint(3, 40)
            out.append({"mode": mode, "n": n, "h": h, "f": rng.randint(1, 6), "q": rng.randint(1, max(1, n // 2)),
                        "streak": rng.randint(0, 10)})
    return out


def make_data(seed=DEFAULT_SEED):
    rng = random.Random(seed)
    return {
        "perudo.settings": {
            "assistMode": "training", "botSpeed": "normal", "theme": "system", "animations": "normal",
            "calzaEnabled": True, "palificoEnabled": True, "practiceTimer": False, "beginnerMode": False,
            "soundMode": "on",
        },
        "perudo.userProfile": make_stats(rng),
        "perudo.player": {"name": "Тестировщик-вёрстки1", "avatar": {"type": "emoji", "value": "🦊"}},
        "perudo.botMemory": {"v": 1, "challenged": 1_250_000, "bluffs": 610_000},
        "perudo.games": make_games(rng),
        "perudo.reviews": make_moments(rng),
        "perudo.rounds": make_rounds(rng),
        "perudo.trainingQueue": make_queue(rng),
        "perudo.duelStats": {"games": 48_210, "wins": 21_007, "moves": 912_345, "dev": 120_450},
    }


def build(seed=DEFAULT_SEED):
    return {"format": "perudo-backup", "version": 2, "exportedAt": EXPORTED_AT, "data": make_data(seed)}


def render(seed=DEFAULT_SEED):
    return json.dumps(build(seed), ensure_ascii=False, indent=2) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--seed", type=int, default=DEFAULT_SEED)
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--check", action="store_true", help="не писать, а проверить, что файл совпадает с генератором")
    a = ap.parse_args(argv)
    text = render(a.seed)
    if a.check:
        ok = os.path.exists(a.out) and open(a.out, encoding="utf-8").read() == text
        print("профиль актуален" if ok else f"профиль устарел: пересоберите {os.path.relpath(a.out, ROOT)}")
        return 0 if ok else 1
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"{os.path.relpath(a.out, ROOT)}: {len(text) // 1024} КБ")
    return 0


if __name__ == "__main__":
    sys.exit(main())
