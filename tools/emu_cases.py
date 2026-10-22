#!/usr/bin/env python3
"""
Случайные случаи и эталонные ответы из эмуляторов (JSON в stdout). Их сверяет tests/emulators.test.js:
те же входы пропускаются через src/ приложения, расхождение логики эмулятора и приложения — падение теста.

  python3 tools/emu_cases.py [--seed 7] [--scale 1]
"""
import argparse, importlib.util, json, random, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, HERE / file)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod            # нужно для dataclass
    spec.loader.exec_module(mod)
    return mod


class Seq:
    """Поток «случайных» чисел из списка: тот же поток подаётся приложению через Math.random / rng."""
    def __init__(self, v): self.v, self.i = v, 0
    def random(self): x = self.v[self.i]; self.i += 1; return x


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--scale", type=float, default=1.0, help="множитель числа случаев")
    a = ap.parse_args()
    em, tr, dr = load("emu", "emulator.py"), load("trainer_emu", "trainer_emulator.py"), load("drill_emu", "drill_emulator.py")
    r = random.Random(a.seed)
    sc = lambda n: max(1, int(n * a.scale))
    out = {}

    # 1. правила, вероятности, сравнение вариантов, безопасная ставка
    cases = []
    for _ in range(sc(1500)):
        n = r.randint(2, 40); k = r.randint(1, min(6, n - 1)); h = [r.randint(1, 6) for _ in range(k)]
        wild = r.random() < 0.7
        b = None if r.random() < 0.1 else {"q": r.randint(1, n), "f": r.randint(1, 6)}
        q, f, thr = r.randint(0, n + 2), r.randint(0, 7), r.choice([0.35, 0.5, 0.6])
        c = dict(n=n, h=h, wild=wild, b=b, q=q, f=f, thr=thr, legal=em.legal(q, f, b, wild), minLegal=em.min_legal(b, n, wild))
        if 1 <= f <= 6:
            c["prob"] = em.prob_bid(q, f, n, h, wild)
            c["bestBid"] = dr.best_bid(f, n, h, wild, thr)
        if b:
            c["cmp"] = tr.compare_options(b, n, h, wild, thr)
        cases.append(c)
    out["cases"] = cases

    # 2. правило округления в упражнении A
    out["rule"] = [dict(own=o, unk=u, f=f, safe=dr.safe_by_rule(o, u, f), half=dr.is_halfway(o, u, f))
                   for o in range(0, 7) for u in range(0, 61) for f in range(1, 7)]

    # 3. проверка ставки в тренажёре (trainer_rules.checkRaise / defaultRaise)
    raises = []
    for _ in range(sc(1500)):
        n = r.randint(3, 40); wild = r.random() < 0.6
        q, f = r.randint(1, n), r.randint(1, 6)
        Q, F = r.randint(0, n + 2), r.randint(1, 6)
        t = tr.Trainer(["classic"], 0.5, random.Random(0))
        t.cur = dict(m={"wild": wild}, n=n, q=q, f=f, mode="classic", h=[], item=None)
        d = tr.min_legal({"q": q, "f": f}, n, wild)
        raises.append(dict(n=n, wild=wild, q=q, f=f, Q=Q, F=F, message=t.check_raise(Q, F), default=d))
    out["raises"] = raises

    # 4. решения бота на общем потоке чисел
    bots = []
    for _ in range(sc(1000)):
        n = r.randint(2, 30); k = r.randint(1, min(5, n - 1)); h = [r.randint(1, 6) for _ in range(k)]
        wild = r.random() < 0.7; b = None if r.random() < 0.15 else {"q": r.randint(1, n), "f": r.randint(1, 6)}
        style, lvl, cz = r.choice(list(em.BOT_STYLES)), r.choice([0.0, 1.0, 2.5]), r.random() < 0.5
        seq = [r.random() for _ in range(400)]
        S = Seq(seq)
        d = em.bot_decide(h, n, b, wild, em.BOT_STYLES[style], cz, lvl, S)
        bots.append(dict(h=h, n=n, b=b, wild=wild, style=style, lvl=lvl, cz=cz, seq=seq[:S.i], type=d["type"], q=d.get("q"), f=d.get("f")))
    out["bots"] = bots

    # 5. партии целиком (движок, Палифико, Calza, порядок хода) на общем потоке чисел
    games = []
    for gi in range(sc(20)):
        rr = random.Random(5000 + gi); seq = [rr.random() for _ in range(60000)]
        S = Seq(seq); styles = ["careful", "bluffer", "smart", "careful"]
        calza, pal, dice = gi % 2 == 0, gi % 3 != 0, [5, 3, 2, 5][gi % 4]
        g = em.Game(4, dice, calza, pal, styles, em.DEFAULT_NAMES, S)
        g.start(); log = []; guard = 0
        while g.state == "active" and guard < 5000:
            guard += 1
            bot = g.players[g.current]; wild = not g.palifico; total = g.total_dice()
            bb = dict(g.bid) if g.bid else None
            d = em.bot_decide(bot.hand, total, bb, wild, em.BOT_STYLES[bot.style], g.can_calza(), 1.0, S)
            act = {"type": "raise", "q": d["q"], "f": d["f"]} if d["type"] == "raise" else {"type": d["type"]}
            ok, _res = g.apply(bot.id, act)
            if not ok:
                m = em.min_legal(g.bid, total, wild)
                fb = {"type": "dudo"} if (g.bid and g.bid["playerId"] != bot.id) or not m else {"type": "raise", **m}
                g.apply(bot.id, fb); act = fb
            log.append([g.round, int(bot.id.split("_")[1]), act["type"], act.get("q"), act.get("f")])
        games.append(dict(seq=seq[:S.i], calza=calza, pal=pal, dice=dice, styles=styles, log=log, winner=int(g.winner.split("_")[1]), state=g.state))
    out["games"] = games
    json.dump(out, sys.stdout)


if __name__ == "__main__":
    main()
