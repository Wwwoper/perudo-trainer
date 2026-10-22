#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""
Эмулятор режима «Тренажёр» (порт src/ui/trainer.js + trainer_rules.js + modes.js + compare.js + repeat_pick.js +
core.js + rules.js). Вместо игрока ходят боты; на выходе лог оценки каждого хода (txt / csv / jsonl / summary.json).

Поведение приложения, которое воспроизводится (после патча 44):
  - «Не верю»: p = probBid(q,f); ход верный, если p < порога.
  - «Ставка»: сначала проверка по правилам (checkRaise: Q > n и legal()); недопустимая ставка отклоняется
    с сообщением, не оценивается и не попадает ни в статистику, ни в очередь повторов.
    Допустимая оценивается: p = probBid(Q,F), верный ход при p >= порога.
  - Поле ставки по умолчанию — minLegal(чужая ставка); если повысить нельзя, «Ставка» недоступна (остаётся «Не верю»).
  - Неверный ответ на новую ситуацию -> очередь повторов (шанс 0.4, пауза 3 ситуации; 2 верных подряд убирают).
Режимы взяты из modes.js (classic, nowild, endgame, big, bluffer, solo).
Бот «default_click» жмёт «Ставка» с полями по умолчанию, «random_any» и «safe_max_ignore_rules» пробуют ставки
без учёта правил: по ним видно, сколько недопустимых попыток отклоняет приложение.

  uv run tools/trainer_emulator.py --repro
  uv run tools/trainer_emulator.py --shows 300
"""
from __future__ import annotations
import argparse, csv, json, math, random
from collections import Counter
from datetime import datetime
from pathlib import Path

# ====================== порт rules.js / core.js / bots.js ======================
def legal(q, f, b, wild=True):
    if not isinstance(q, int) or q < 1 or not isinstance(f, int) or f < 1 or f > 6: return False
    if b is None: return f != 1 if wild else True
    if not wild: return f == b["f"] and q > b["q"]
    if f == 1 and b["f"] != 1: return q >= math.ceil(b["q"] / 2)
    if b["f"] == 1 and f != 1: return q >= b["q"] * 2 + 1
    return q > b["q"] or (q == b["q"] and f > b["f"])

def min_legal(b, n, wild=True):
    for q in range(1, n + 1):
        for f in range(1, 7):
            if legal(q, f, b, wild): return {"q": q, "f": f}
    return None

BOT_STYLES = {
    "careful":   dict(name="Осторожный", raiseMin=0.60, dudoBelow=0.45, bluff=0.03, noise=0.05),
    "bluffer":   dict(name="Блефующий",  raiseMin=0.40, dudoBelow=0.30, bluff=0.35, noise=0.10),
    "smart":     dict(name="Умный",      raiseMin=0.50, dudoBelow=0.50, bluff=0.12, noise=0.03),
    "aggressor": dict(name="Агрессор",   raiseMin=0.35, dudoBelow=0.20, bluff=0.30, noise=0.10),
    "skeptic":   dict(name="Скептик",    raiseMin=0.55, dudoBelow=0.62, bluff=0.05, noise=0.06),
}
LEVELS = {"easy": 2.5, "normal": 1.0, "hard": 0.0}
LEVEL_RU = {"easy": "Лёгкий", "normal": "Обычный", "hard": "Сильный"}

def comb(n, k):
    if k < 0 or k > n: return 0
    k = min(k, n - k); r = 1
    for i in range(1, k + 1): r = r * (n - k + i) / i
    return r

def p_face(face, wild): return 1 / 6 if (face == 1 or not wild) else 1 / 3

def prob_bid(q, face, n, hand, wild):
    own = sum(1 for d in hand if d == face or (wild and d == 1 and face != 1))
    need, unknown = q - own, n - len(hand)
    p = p_face(face, wild)
    if need <= 0: return 1.0
    if need > unknown: return 0.0
    return min(1.0, sum(comb(unknown, k) * p**k * (1 - p) ** (unknown - k) for k in range(need, unknown + 1)))

def bot_decide(hand, total, bid, wild, st, noise_mul, rng):
    amp = st["noise"] * noise_mul; seen = {}
    c01 = lambda x: min(1.0, max(0.0, x))
    def pr(q, f):
        p = prob_bid(q, f, total, hand, wild)
        if not amp: return p
        k = q * 10 + f
        if k not in seen: seen[k] = (rng.random() * 2 - 1) * amp
        return c01(p + seen[k])
    b = {"q": bid["q"], "f": bid["f"]}
    if pr(b["q"], b["f"]) < st["dudoBelow"]:
        return {"type": "dudo", "reason": f"оценил ставку в {pr(b['q'], b['f'])*100:.0f}% (порог {st['dudoBelow']*100:.0f}%)"}
    cands = [{"q": q, "f": f, "p": pr(q, f)} for q in range(1, total + 1) for f in range(1, 7) if legal(q, f, b, wild)]
    if not cands: return {"type": "dudo", "reason": "повышать некуда"}
    good = [c for c in cands if c["p"] >= st["raiseMin"]]
    if rng.random() < st["bluff"] or not good:
        pool = [c for c in cands if 0.18 <= c["p"] < st["raiseMin"]]
        if pool:
            c = pool[int(rng.random() * len(pool))]
            return {"type": "raise", "q": c["q"], "f": c["f"], "reason": f"блеф (оценка {c['p']*100:.0f}%)"}
    if not good: return {"type": "dudo", "reason": "безопасных ставок нет"}
    mx = max(c["p"] for c in good)
    near = [c for c in good if c["p"] >= mx - 0.08]
    c = near[int(rng.random() * len(near))]
    return {"type": "raise", "q": c["q"], "f": c["f"], "reason": f"надёжная ставка (оценка {c['p']*100:.0f}%)"}

# ====================== compare.js ======================
def best_safe_raise(bid, n, hand, wild, thr):
    best = None
    for q in range(1, n + 1):
        for f in range(1, 7):
            if not legal(q, f, bid, wild): continue
            p = prob_bid(q, f, n, hand, wild)
            if p >= thr and (best is None or q > best["q"] or (q == best["q"] and p > best["p"])):
                best = {"q": q, "f": f, "p": p}
    return best

def compare_options(bid, n, hand, wild, thr):
    pb = prob_bid(bid["q"], bid["f"], n, hand, wild)
    opts = [{"type": "dudo", "p": pb, "success": 1 - pb}]
    mn = min_legal(bid, n, wild); safe = best_safe_raise(bid, n, hand, wild, thr)
    if mn:
        p = prob_bid(mn["q"], mn["f"], n, hand, wild)
        o = {"type": "minRaise", **mn, "p": p, "success": p}
        if safe and (safe["q"], safe["f"]) == (mn["q"], mn["f"]): o["isBestSafe"] = True
        opts.append(o)
    if safe and not (mn and (safe["q"], safe["f"]) == (mn["q"], mn["f"])):
        opts.append({"type": "safeRaise", **safe, "success": safe["p"]})
    return opts

def fmt_opts(opts):
    out = []
    for o in opts:
        if o["type"] == "dudo": out.append(f"Не верю {o['success']*100:.1f}%")
        elif o["type"] == "minRaise": out.append(f"мин.повышение {o['q']}×{o['f']} {o['p']*100:.1f}%")
        else: out.append(f"безопасное {o['q']}×{o['f']} {o['p']*100:.1f}%")
    if not any(o["type"] == "safeRaise" or o.get("isBestSafe") for o in opts): out.append("безопасных повышений нет")
    return " | ".join(out)

# ====================== repeat_pick.js ======================
REPEAT_GAP, REPEAT_CHANCE = 3, 0.4
def sit_key(it): return f"{it['mode']}|{it['n']}|{it['q']}|{it['f']}|{''.join(map(str, it['h']))}"
def pick_repeat(pool, seen_at, counter, rng):
    ok = [it for it in pool if seen_at.get(sit_key(it)) is None or counter - seen_at[sit_key(it)] > REPEAT_GAP]
    if not ok or not (rng.random() < REPEAT_CHANCE): return None
    return ok[int(rng.random() * len(ok))]

# ====================== modes.js (из загруженного файла) ======================
ri = lambda rng, a, b: a + int(rng.random() * (b - a + 1))
MODES = {
    "classic": dict(name="Классика", wild=True,  n=(10, 20), k=lambda n, r: 5, bluff=0.25),
    "nowild":  dict(name="Без джокеров / Палифико", wild=False, n=(10, 20), k=lambda n, r: 5, bluff=0.25),
    "endgame": dict(name="Эндшпиль", wild=True,  n=(3, 6),   k=lambda n, r: ri(r, 1, math.ceil(n / 2)), bluff=0.3),
    "big":     dict(name="Большой стол", wild=True, n=(25, 40), k=lambda n, r: 5, bluff=0.2),
    "bluffer": dict(name="Блефующий соперник", wild=True, n=(10, 20), k=lambda n, r: 5, bluff=0.7),
    "solo":    dict(name="Мало кубиков у вас", wild=True, n=(8, 16), k=lambda n, r: ri(r, 1, 2), bluff=0.3),
}

def fb(q, f): return f"{q}×{f}"
jsround = lambda x: math.floor(x + 0.5)

# ====================== сессия Тренажёра ======================
class Trainer:
    def __init__(self, mode_keys, thr, rng):
        self.modes, self.thr, self.rng = mode_keys, thr, rng
        self.queue = []; self.seen_at = {}; self.shown = 0; self.cur = None; self.mode_i = 0

    def new_situation(self):
        mk = self.modes[self.mode_i % len(self.modes)]; self.mode_i += 1
        m = MODES[mk]; rng = self.rng
        pool = [x for x in self.queue if x["mode"] == mk]
        self.shown += 1
        rep = pick_repeat(pool, self.seen_at, self.shown, rng)
        if rep:
            cur = dict(mode=mk, m=m, n=rep["n"], h=list(rep["h"]), f=rep["f"], q=rep["q"], item=rep)
        else:
            n = ri(rng, *m["n"]); k = min(m["k"](n, rng), n - 1) or 1
            h = [1 + int(rng.random() * 6) for _ in range(k)]; f = ri(rng, 1, 6)
            bump = ri(rng, 1, 3) if rng.random() < m["bluff"] else ri(rng, -2, 1)
            q = jsround(n * p_face(f, m["wild"]) + bump)
            cur = dict(mode=mk, m=m, n=n, h=h, f=f, q=max(1, min(n, q)), item=None)
        if cur["item"]: self.seen_at[sit_key(cur["item"])] = self.shown
        d = min_legal({"q": cur["q"], "f": cur["f"]}, cur["n"], m["wild"])   # поля ставки по умолчанию (trainer_rules.defaultRaise)
        cur["default_q"], cur["default_f"] = (d["q"], d["f"]) if d else (None, None)
        self.cur = cur; return cur

    def answer(self, good):
        c = self.cur
        if c["item"]:
            if good:
                c["item"]["streak"] = c["item"].get("streak", 0) + 1
                if c["item"]["streak"] >= 2: self.queue = [x for x in self.queue if x is not c["item"]]
            else: c["item"]["streak"] = 0
        elif not good:
            e = dict(mode=c["mode"], n=c["n"], h=list(c["h"]), f=c["f"], q=c["q"], streak=0)
            self.queue.append(e); self.seen_at[sit_key(e)] = self.shown

    def do_dudo(self):
        c = self.cur; p = prob_bid(c["q"], c["f"], c["n"], c["h"], c["m"]["wild"]); good = p < self.thr
        return dict(ok=True, legal=True, p=p, success=1 - p, good=good, verdict="good" if good else "bad")

    def check_raise(self, Q, F):
        """trainer_rules.checkRaise: None, если ставка допустима, иначе сообщение."""
        c = self.cur; wild = c["m"]["wild"]; bid = {"q": c["q"], "f": c["f"]}
        if not isinstance(Q, int) or Q < 1 or not isinstance(F, int) or not 1 <= F <= 6: return "Укажите количество и цифру ставки."
        if Q > c["n"]: return "Ставка больше общего числа кубиков."
        if legal(Q, F, bid, wild): return None
        need = next((q for q in range(1, c["n"] + 1) if legal(q, F, bid, wild)), None)
        if need: return f"После {fb(c['q'], c['f'])} ставка на цифру {F} должна быть не меньше {need}×{F}."
        return f"После {fb(c['q'], c['f'])} на цифру {F} ставить нельзя." + ("" if wild else " В этом режиме можно повышать только количество на ту же цифру.")

    def do_raise(self, Q, F):
        c = self.cur
        msg = self.check_raise(Q, F)
        if msg: return dict(ok=False, ui=msg)
        wild = c["m"]["wild"]
        p = prob_bid(Q, F, c["n"], c["h"], wild); good = p >= self.thr
        return dict(ok=True, legal=True, p=p, success=p, good=good, verdict="good" if good else "bad",
                    po=prob_bid(c["q"], c["f"], c["n"], c["h"], wild))

# ====================== боты-«игроки» ======================
BOT_KINDS = list(BOT_STYLES) + ["default_click", "random_legal", "random_any", "safe_max_ignore_rules"]
BOT_RU = {**{k: v["name"] for k, v in BOT_STYLES.items()},
          "default_click": "Кликер (жмёт «Ставка» с полями по умолчанию)",
          "random_legal": "Случайный (легальные ходы)",
          "random_any": "Случайный (любые ходы)",
          "safe_max_ignore_rules": "Макс. безопасная (без учёта правил)"}
VERDICT_RU = {"good": "Хорошее решение", "bad": "Сомнительное решение"}

def bot_move(kind, cur, level, rng, thr):
    n, h, wild = cur["n"], cur["h"], cur["m"]["wild"]; bid = {"q": cur["q"], "f": cur["f"]}
    if kind in BOT_STYLES:
        d = bot_decide(h, n, bid, wild, BOT_STYLES[kind], LEVELS[level], rng)
        return ({"type": "dudo"} if d["type"] == "dudo" else {"type": "raise", "q": d["q"], "f": d["f"]}), d["reason"]
    if kind == "default_click":
        if cur["default_q"] is None: return {"type": "dudo"}, "повысить нельзя: «Ставка» недоступна"
        return {"type": "raise", "q": cur["default_q"], "f": cur["default_f"]}, "жмёт «Ставка» без изменения полей"
    if kind == "random_legal":
        acts = [{"type": "dudo"}] + [{"type": "raise", "q": q, "f": f} for q in range(1, n + 1) for f in range(1, 7) if legal(q, f, bid, wild)]
        return rng.choice(acts), "случайный легальный ход"
    if kind == "random_any":
        if rng.random() < 0.3: return {"type": "dudo"}, "случайный «Не верю»"
        return {"type": "raise", "q": ri(rng, 1, n), "f": ri(rng, 1, 6)}, "случайная ставка без проверки правил"
    if kind == "safe_max_ignore_rules":
        best = None
        for q in range(1, n + 1):
            for f in range(1, 7):
                p = prob_bid(q, f, n, h, wild)
                if p >= thr and (best is None or q > best[0] or (q == best[0] and p > best[2])) and (q, f) != (bid["q"], bid["f"]): best = (q, f, p)
        if best: return {"type": "raise", "q": best[0], "f": best[1]}, "максимальная ставка с шансом >= порога, правила не учитываются"
        return {"type": "dudo"}, "безопасных ставок нет"
    raise ValueError(kind)

def entry_text(i, kind, level, cur, act, why, ev, queue_len):
    n, h = cur["n"], cur["h"]; wild = cur["m"]["wild"]
    L = [f"#{i:05d} [{cur['mode']}]{' 🔁повтор' if cur['item'] else ''} бот: {BOT_RU[kind]} ({LEVEL_RU[level]}); в очереди повторов: {queue_len}",
         f"   всего {n}, у вас {len(h)}, чужих {n-len(h)}; {'единицы — джокеры' if wild else 'единицы обычные'}; кубики {h}",
         f"   соперник: {fb(cur['q'], cur['f'])}"]
    L.append("   ход бота: " + ("НЕ ВЕРЮ" if act["type"] == "dudo" else f"СТАВКА {fb(act['q'], act['f'])}") + f" — {why}")
    if not ev["ok"]:
        L.append(f"   ✖ ОТКЛОНЕНО: «{ev['ui']}» (оценки нет, статистика и очередь не меняются)"); return "\n".join(L)
    L.append(f"   оценка: {'проверка сработает' if act['type']=='dudo' else 'ставка верна'} {ev['success']*100:.1f}% → {VERDICT_RU[ev['verdict']]} (порог {ev['thr']:.2f})")
    L.append("   варианты: " + fmt_opts(ev["opts"]))
    L.append(f"   потеря относительно лучшего варианта: {ev['regret']*100:.1f} п.п.")
    return "\n".join(L)

def repro():
    thr = 0.5
    cur = dict(mode="classic", m=MODES["classic"], n=14, h=[1, 3, 4, 4, 5], q=4, f=1, item=None)
    t = Trainer(["classic"], thr, random.Random(0)); t.cur = cur
    print("ВОСПРОИЗВЕДЕНИЕ ОШИБКИ ИЗ ОТЧЁТА (чужая 4×1, у вас 1,3,4,4,5, всего 14)")
    for Q, F in ((6, 4), (9, 4), (5, 1)):
        ev = t.do_raise(Q, F)
        print(f"  ставка {Q}×{F}: " + (f"ОТКЛОНЕНА — {ev['ui']}" if not ev["ok"] else f"принята, шанс {ev['success']*100:.1f}% → {VERDICT_RU[ev['verdict']]}"))
    d = min_legal({"q": 4, "f": 1}, 14, True)
    print(f"  поля по умолчанию: {d['q']}×{d['f']}, legal={legal(d['q'], d['f'], {'q': 4, 'f': 1}, True)}")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shows", type=int, default=300, help="показов ситуаций на каждого бота")
    ap.add_argument("--bots", default=",".join(BOT_KINDS)); ap.add_argument("--modes", default=",".join(MODES))
    ap.add_argument("--level", choices=list(LEVELS), default="normal"); ap.add_argument("--threshold", type=float, default=0.5)
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--repro", action="store_true"); ap.add_argument("--out", default="trainer_logs")
    a = ap.parse_args()
    if a.repro: return repro()
    kinds = [k for k in a.bots.split(",") if k in BOT_KINDS]; modes = [m for m in a.modes.split(",") if m in MODES]
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True); stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    rows = []; txt = open(out / f"trainer_{stamp}.log", "w", encoding="utf-8")
    txt.write(f"ТРЕНАЖЁР-ЭМУЛЯТОР seed={a.seed} уровень={LEVEL_RU[a.level]} порог={a.threshold}\n\n")
    i = 0; stat = {}
    for kind in kinds:
        rng = random.Random(f"{a.seed}-{kind}"); tr = Trainer(modes, a.threshold, random.Random(f"{a.seed}-sit-{kind}"))
        s = Counter(); regs = []
        for _ in range(a.shows):
            cur = tr.new_situation(); act, why = bot_move(kind, cur, a.level, rng, a.threshold)
            ev = tr.do_dudo() if act["type"] == "dudo" else tr.do_raise(act["q"], act["f"])
            i += 1; s["shows"] += 1; s["repeats"] += bool(cur["item"])
            base = dict(id=i, bot=kind, mode=cur["mode"], repeat=bool(cur["item"]), n=cur["n"], h="".join(map(str, cur["h"])), opp_bid=fb(cur["q"], cur["f"]),
                        move=fb(act["q"], act["f"]) if act["type"] == "raise" else "dudo", reason=why)
            if not ev["ok"]:
                s["ui_rejected"] += 1
                txt.write(entry_text(i, kind, a.level, cur, act, why, ev, len(tr.queue)) + "\n\n")
                rows.append({**base, "verdict": "rejected", "success_pct": "", "best_pct": "", "regret_pp": "", "message": ev["ui"]}); continue
            opts = compare_options({"q": cur["q"], "f": cur["f"]}, cur["n"], cur["h"], cur["m"]["wild"], a.threshold)
            best = max(o["success"] for o in opts)
            ev.update(opts=opts, thr=a.threshold, regret=max(0.0, best - ev["success"]))
            tr.answer(ev["good"])
            s[ev["verdict"]] += 1; regs.append(ev["regret"] * 100)
            txt.write(entry_text(i, kind, a.level, cur, act, why, ev, len(tr.queue)) + "\n\n")
            rows.append({**base, "verdict": ev["verdict"], "success_pct": round(ev["success"] * 100, 1),
                         "best_pct": round(best * 100, 1), "regret_pp": round(ev["regret"] * 100, 1), "message": ""})
        s["queue_end"] = len(tr.queue); s["regret"] = sum(regs) / max(1, len(regs)); stat[kind] = s
    txt.close()
    with open(out / f"trainer_{stamp}.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
    with open(out / f"trainer_{stamp}.jsonl", "w", encoding="utf-8") as f:
        for r in rows: f.write(json.dumps(r, ensure_ascii=False) + "\n")
    summ = []
    print(f"{'Бот':<46}{'показов':>8}{'good':>6}{'bad':>6}{'отклонено':>10}{'потеря':>8}")
    for k in kinds:
        s = stat[k]; en = max(1, s["shows"] - s["ui_rejected"])
        print(f"{BOT_RU[k]:<46}{s['shows']:>8}{s['good']/en*100:>5.0f}%{s['bad']/en*100:>5.0f}%{s['ui_rejected']:>10}{s['regret']:>8.1f}")
        summ.append(dict(bot=k, name=BOT_RU[k], shows=s["shows"], good=s["good"], bad=s["bad"],
                         rejected=s["ui_rejected"], repeats_shown=s["repeats"], queue_end=s["queue_end"], mean_regret_pp=round(s["regret"], 2)))
    (out / f"trainer_summary_{stamp}.json").write_text(json.dumps(summ, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nЛоги: {out.resolve()}")

if __name__ == "__main__":
    main()
