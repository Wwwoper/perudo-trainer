#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""
Эмулятор раздела «Упражнения» (порт src/ui/drill.js + drill_input.js + drill_note.js + drill_rule.js + core.js + rules.js).
  A — «Оценка в уме»: ожидание (допуск 0.75) и безопасная ставка (допуск ±1, шанс >= 50%).
  B — «Правило единиц»: минимальное количество при переходе обычная цифра <-> единицы.
Вместо игрока отвечают «ученики»-боты с разной точностью; лог показывает задачу, ответ, эталон, вердикт и
пояснения, которые приложение выводит в разборе.

Поведение приложения, которое воспроизводится (после патчей 45 и 46):
  - пустой или нечисловой ответ не считается попыткой (сообщение «Введите …»);
  - одна задача — одна запись: после проверки кнопка недоступна до «Новое», повторные нажатия ничего не пишут;
  - безопасной ставки нет (safe = 0): разбор говорит «Безопасной ставки нет…», без «0.0% ✔» и без формулы;
  - ответ выше безопасного принимается по допуску ±1, но в разборе есть строка про шанс (< 50%).

  uv run tools/drill_emulator.py --tasks 300
"""
from __future__ import annotations
import argparse, csv, json, math, random
from collections import Counter
from datetime import datetime
from pathlib import Path

# ---------- core.js ----------
def comb(n, k):
    if k < 0 or k > n: return 0
    k = min(k, n - k); r = 1
    for i in range(1, k + 1): r = r * (n - k + i) / i
    return r
def p_face(f, wild=True): return 1 / 6 if (f == 1 or not wild) else 1 / 3
def own(h, f, wild=True): return sum(1 for d in h if d == f or (wild and d == 1 and f != 1))
def prob_bid(q, f, n, h, wild=True):
    need, unk, p = q - own(h, f, wild), n - len(h), p_face(f, wild)
    if need <= 0: return 1.0
    if need > unk: return 0.0
    return min(1.0, sum(comb(unk, k) * p**k * (1 - p) ** (unk - k) for k in range(need, unk + 1)))
def best_bid(f, n, h, wild, thr):
    best = 0
    for q in range(1, n + 1):
        if prob_bid(q, f, n, h, wild) >= thr: best = q
    return best

# ---------- drill_rule.js ----------
chance_den = lambda f: 6 if f == 1 else 3
nn = lambda v: v if isinstance(v, int) and v >= 0 else 0
def safe_by_rule(o, unk, f):
    den = chance_den(f); numer = 2 * (nn(o) * den + nn(unk)) - den
    return max(0, math.ceil(numer / (2 * den)))
def is_halfway(o, unk, f):
    den = chance_den(f); return (2 * (nn(o) * den + nn(unk))) % (2 * den) == den

ri = lambda r, a, b: a + int(r.random() * (b - a + 1))

# ---------- генерация задач (drill.js newA / newB) ----------
def new_a(r):
    n = ri(r, 8, 30); k = ri(r, 1, 5)
    return dict(n=n, h=[ri(r, 1, 6) for _ in range(k)], f=ri(r, 1, 6))
def new_b(r):
    return dict(down=r.random() < 0.5, q=ri(r, 3, 16), f=ri(r, 2, 6))

def truth_a(t):
    n, h, f = t["n"], t["h"], t["f"]; unk = n - len(h); oc = own(h, f)
    exp = oc + unk * p_face(f); safe = best_bid(f, n, h, True, 0.5)
    return dict(unk=unk, own=oc, exp=exp, safe=safe, p_safe=prob_bid(safe, f, n, h) if safe > 0 else 0.0,
                p_safe1=prob_bid(safe + 1, f, n, h), by_rule=safe_by_rule(oc, unk, f), half=is_halfway(oc, unk, f))

def check_a(t, a1, a2):
    g = truth_a(t)
    ok1 = a1 is not None and abs(a1 - g["exp"]) <= 0.75
    ok2 = a2 is not None and abs(a2 - g["safe"]) <= 1
    flags = []
    if g["safe"] == 0: flags.append("РАЗБОР: безопасной ставки нет, правильный ответ 0 (без «0.0% ✔» и формулы)")
    if g["by_rule"] != g["safe"]: flags.append(f"ПРАВИЛО≠ТОЧНОМУ: byRule={g['by_rule']}, bestBid={g['safe']}")
    if ok2 and a2 is not None and a2 > g["safe"]:
        flags.append(f"ДОПУСК ±1: ответ {a2:g} принят, в разборе есть строка: шанс такой ставки {prob_bid(math.floor(a2), t['f'], t['n'], t['h'])*100:.1f}% < 50%")
    return ok1, ok2, g, flags

def check_b(t, a):
    exp = math.ceil(t["q"] / 2) if t["down"] else t["q"] * 2 + 1
    return (a is not None and a == exp), exp

# ---------- «ученики» ----------
def rnd_half_down(x): return math.ceil(x - 0.5)
A_BOTS = {
 "rule_exact":  "Точный по правилу (ожидание с десятыми, ставка по правилу)",
 "rule_int":    "По правилу, ожидание целым (округляет к ближайшему)",
 "floor":       "Всегда округляет вниз",
 "ceil":        "Всегда округляет вверх",
 "no_jokers":   "Не считает свои единицы-джокеры",
 "all_third":   "Делит на 3 даже для единиц",
 "noisy":       "Шум ±1 в оценке",
 "random":      "Случайные ответы",
 "empty":       "Жмёт «Проверить» с пустыми полями",
 "double_click":"Правильный ответ, жмёт «Проверить» дважды",
}
B_BOTS = {
 "exact":       "Точный (⌈q/2⌉ и 2q+1)",
 "swapped":     "Перепутал формулы",
 "floor_half":  "Половину округляет вниз",
 "q2":          "Вместо 2q+1 пишет 2q",
 "random":      "Случайные ответы",
 "empty":       "Жмёт «Проверить» с пустым полем",
 "double_click":"Правильный ответ, жмёт «Проверить» дважды",
}
def answer_a(kind, t, r):
    n, h, f = t["n"], t["h"], t["f"]; unk = n - len(h); oc = own(h, f); pv = p_face(f)
    if kind in ("rule_exact", "double_click"): return round(oc + unk * pv, 1), safe_by_rule(oc, unk, f), (2 if kind == "double_click" else 1)
    if kind == "rule_int": e = oc + unk * pv; return rnd_half_down(e), safe_by_rule(oc, unk, f), 1
    if kind == "floor": e = math.floor(oc + unk * pv); return e, e, 1
    if kind == "ceil": e = math.ceil(oc + unk * pv); return e, e, 1
    if kind == "no_jokers":
        o2 = sum(1 for d in h if d == f); e = o2 + unk * pv; return round(e, 1), safe_by_rule(o2, unk, f), 1
    if kind == "all_third": e = oc + unk / 3; return round(e, 1), safe_by_rule(oc, unk, 3 if f == 1 else f), 1
    if kind == "noisy": e = oc + unk * pv + r.uniform(-1, 1); return round(e, 1), max(0, rnd_half_down(e) + r.choice([-1, 0, 1])), 1
    if kind == "random": return round(r.uniform(0, n), 1), ri(r, 0, n), 1
    if kind == "empty": return None, None, 1
def answer_b(kind, t, r):
    q, down = t["q"], t["down"]; ex = math.ceil(q / 2) if down else q * 2 + 1
    if kind in ("exact", "double_click"): return ex, (2 if kind == "double_click" else 1)
    if kind == "swapped": return (q * 2 + 1 if down else math.ceil(q / 2)), 1
    if kind == "floor_half": return (q // 2 if down else ex), 1
    if kind == "q2": return (ex if down else q * 2), 1
    if kind == "random": return ri(r, 1, 40), 1
    if kind == "empty": return None, 1

fmt = lambda v: "—" if v is None else f"{v:g}"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tasks", type=int, default=300); ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--out", default="drill_logs")
    a = ap.parse_args()
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True); stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    txt = open(out / f"drill_{stamp}.log", "w", encoding="utf-8")
    txt.write(f"ЭМУЛЯТОР «УПРАЖНЕНИЯ» seed={a.seed} задач на бота={a.tasks}\n\n")
    rows = []; summ = []; i = 0
    for ex, bots in (("A", A_BOTS), ("B", B_BOTS)):
        for kind, desc in bots.items():
            r = random.Random(f"{a.seed}-{ex}-{kind}"); S = Counter(); tr = random.Random(f"{a.seed}-tasks-{ex}")
            for _ in range(a.tasks):
                t = new_a(tr) if ex == "A" else new_b(tr)
                if ex == "A":
                    a1, a2, presses = answer_a(kind, t, r)
                    ok1, ok2, g, flags = check_a(t, a1, a2); good = ok1 and ok2
                    empty = a1 is None and a2 is None
                    L = [f"#{i+1:05d} [A] ученик: {desc}",
                         f"   всего {t['n']}, рука {t['h']}, цифра {t['f']}; своих с джокерами {g['own']}, чужих {g['unk']}",
                         f"   ответ: ожидание {fmt(a1)} | безопасная ставка {fmt(a2)}",
                         f"   эталон: ожидание {g['exp']:.2f}; безопасная {g['safe']} (шанс {g['p_safe']*100:.1f}%), следующая {g['safe']+1} — {g['p_safe1']*100:.1f}%; по правилу {g['by_rule']}{' (ровно посередине)' if g['half'] else ''}",
                         f"   проверка: ожидание {'✔' if ok1 else '✘'} (допуск 0.75), ставка {'✔' if ok2 else '✘'} (допуск ±1) → {'ЗАСЧИТАНО' if good else 'ошибка'}"]
                    rec = dict(ex="A", bot=kind, n=t["n"], hand="".join(map(str, t["h"])), f=t["f"], a1=fmt(a1), a2=fmt(a2), true_exp=round(g["exp"], 2),
                               true_safe=g["safe"], ok1=ok1, ok2=ok2, good=good, flags=len(flags))
                else:
                    ans, presses = answer_b(kind, t, r); good, exp = check_b(t, ans); flags = []; empty = ans is None
                    L = [f"#{i+1:05d} [B] ученик: {desc}",
                         f"   ставка {t['q']}×{t['f'] if t['down'] else 1}; вопрос: минимум {'единиц' if t['down'] else 'обычной цифры'}",
                         f"   ответ: {fmt(ans)}; эталон: {exp} ({'⌈q/2⌉' if t['down'] else '2q+1'}) → {'ЗАСЧИТАНО' if good else 'ошибка'}"]
                    rec = dict(ex="B", bot=kind, n="", hand="", f=t["f"], a1=fmt(ans), a2="", true_exp=exp, true_safe="", ok1=good, ok2="", good=good, flags=0)
                i += 1; rec["id"] = i
                counted = 0 if empty else 1      # пустой ответ отклоняется; повторные нажатия не пишутся
                S["tasks"] += 1; S["stat_n"] += counted; S["stat_good"] += counted * good
                S["true_good"] += good; S["empty"] += empty; S["extra_presses"] += max(0, presses - 1)
                S["flags"] += len(flags); S["safe0"] += any("безопасной ставки нет" in f for f in flags); S["tol_unsafe"] += any("ДОПУСК" in f for f in flags)
                S["rule_mismatch"] += any("ПРАВИЛО" in f for f in flags)
                if presses > 1: L.append(f"   ℹ кнопка «Проверить» нажата {presses} раза: записана одна попытка")
                if empty: L.append("   ℹ пустой ответ отклонён с сообщением, в статистику не записан")
                for f in flags: L.append("   ℹ " + f)
                txt.write("\n".join(L) + "\n\n"); rows.append(rec)
            summ.append(dict(ex=ex, bot=kind, desc=desc, tasks=S["tasks"], solved_pct=round(100 * S["true_good"] / S["tasks"], 1),
                             stats_n=S["stat_n"], stats_good=S["stat_good"], stats_pct=round(100 * S["stat_good"] / max(1, S["stat_n"]), 1),
                             empty_attempts=S["empty"], extra_presses=S["extra_presses"], safe0_hints=S["safe0"],
                             accepted_unsafe_by_tolerance=S["tol_unsafe"], rule_vs_exact_mismatch=S["rule_mismatch"]))
    txt.close()
    with open(out / f"drill_{stamp}.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
    (out / f"drill_summary_{stamp}.json").write_text(json.dumps(summ, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{'Упр.':<5}{'Ученик':<56}{'решено':>8}{'в статист.':>11}{'(n)':>6}{'пустых':>7}{'повторов':>9}{'safe=0':>7}{'+1 принято':>11}")
    for s in summ:
        print(f"{s['ex']:<5}{s['desc'][:54]:<56}{s['solved_pct']:>7.1f}%{s['stats_pct']:>10.1f}%{s['stats_n']:>6}{s['empty_attempts']:>7}{s['extra_presses']:>9}{s['safe0_hints']:>7}{s['accepted_unsafe_by_tolerance']:>11}")
    print(f"\nЛоги: {out.resolve()}")

if __name__ == "__main__":
    main()
