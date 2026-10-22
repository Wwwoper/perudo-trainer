#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""
Эмулятор партий Perudo (Перудо / Лжецы) между ботами.

Логика портирована 1:1 из приложения: rules.js (legal/minLegal), engine.js
(раздача, Dudo/Calza, Палифико, порядок хода), bots.js (стили, botDecide,
уровни шума). Игроков-людей нет — играют только боты.

Параметры по умолчанию (из ТЗ):
  ботов 4, уровень «Обычный», 5 кубиков, режим Палифико, Calza выключена.

Запуск:
  uv run emulator.py                      # одна партия, подробный лог
  uv run emulator.py --games 500 --quiet  # статистика по многим партиям
  uv run emulator.py --seed 42            # воспроизводимая партия
  uv run emulator.py --calza              # включить Calza
  uv run emulator.py --level hard --styles smart,skeptic,aggressor,careful
"""
from __future__ import annotations

import argparse
import json
import math
import random
import sys
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

# ====================== rules.js ======================

def legal(q, f, b, wild=True):
    if not isinstance(q, int) or q < 1 or not isinstance(f, int) or f < 1 or f > 6:
        return False
    if b is None:
        return f != 1 if wild else True
    if not wild:
        return f == b["f"] and q > b["q"]
    if f == 1 and b["f"] != 1:
        return q >= math.ceil(b["q"] / 2)
    if b["f"] == 1 and f != 1:
        return q >= b["q"] * 2 + 1
    return q > b["q"] or (q == b["q"] and f > b["f"])


def min_legal(b, n, wild=True):
    for q in range(1, n + 1):
        for f in range(1, 7):
            if legal(q, f, b, wild):
                return {"q": q, "f": f}
    return None

# ====================== bots.js ======================

BOT_STYLES = {
    "careful":   dict(name="Осторожный", raiseMin=0.60, dudoBelow=0.45, bluff=0.03, calza=False, noise=0.05, adapt=0.4),
    "bluffer":   dict(name="Блефующий",  raiseMin=0.40, dudoBelow=0.30, bluff=0.35, calza=False, noise=0.10, adapt=0.15),
    "smart":     dict(name="Умный",      raiseMin=0.50, dudoBelow=0.50, bluff=0.12, calza=True,  noise=0.03, adapt=1.0),
    "aggressor": dict(name="Агрессор",   raiseMin=0.35, dudoBelow=0.20, bluff=0.30, calza=False, noise=0.10, adapt=0.10),
    "skeptic":   dict(name="Скептик",    raiseMin=0.55, dudoBelow=0.62, bluff=0.05, calza=False, noise=0.06, adapt=0.50),
}
DEFAULT_STYLE_CYCLE = ["careful", "bluffer", "smart"]
BOT_LEVELS = {
    "easy":   dict(name="Лёгкий",  noise=2.5),
    "normal": dict(name="Обычный", noise=1.0),
    "hard":   dict(name="Сильный", noise=0.0),
}
DEFAULT_NAMES = ["Алексей", "Мария", "Дмитрий", "Ольга", "Иван", "Анна"]


def comb(n, k):
    if k < 0 or k > n:
        return 0
    k = min(k, n - k)
    r = 1
    for i in range(1, k + 1):
        r = r * (n - k + i) / i
    return r


def prob_bid(q, face, n, hand, wild):
    """P(на столе >= q кубиков грани face) с учётом своей руки."""
    own = sum(1 for d in hand if d == face or (wild and d == 1 and face != 1))
    need = q - own
    unknown = n - len(hand)
    p = 1 / 6 if (face == 1 or not wild) else 1 / 3
    if need <= 0:
        return 1.0
    if need > unknown:
        return 0.0
    s = sum(comb(unknown, k) * p**k * (1 - p) ** (unknown - k) for k in range(need, unknown + 1))
    return min(1.0, s)


def bot_decide(hand, total_dice, bid, wild, style, can_calza, noise_mul, rng):
    """Порт botDecide. Возвращает решение + отладочную информацию."""
    amp = style["noise"] * noise_mul
    seen: dict[int, float] = {}
    clamp01 = lambda x: min(1.0, max(0.0, x))
    exact = lambda q, f: prob_bid(q, f, total_dice, hand, wild)

    def pr(q, f):
        p = exact(q, f)
        if not amp:
            return p
        key = q * 10 + f
        if key not in seen:
            seen[key] = (rng.random() * 2 - 1) * amp
        return clamp01(p + seen[key])

    memory_shift = 0.0  # в эмуляции нет человека -> модель соперника не используется
    b = {"q": bid["q"], "f": bid["f"]} if bid else None
    dbg = {}

    if b:
        p_ex = exact(b["q"], b["f"])
        p_seen = clamp01(pr(b["q"], b["f"]) - memory_shift)
        dbg = {"p_exact": p_ex, "p_seen": p_seen, "noise_err": p_seen - p_ex}

    # Calza
    if can_calza and style["calza"] and b:
        own = sum(1 for d in hand if d == b["f"] or (wild and d == 1 and b["f"] != 1))
        need = b["q"] - own
        unknown = total_dice - len(hand)
        pp = 1 / 6 if (b["f"] == 1 or not wild) else 1 / 3
        pe = 0 if (need < 0 or need > unknown) else comb(unknown, need) * pp**need * (1 - pp) ** (unknown - need)
        p_cur = dbg["p_seen"]
        dbg["p_exact_match"] = pe
        if pe >= 0.30 and 0.25 <= p_cur <= 0.9:
            return {"type": "calza", "reason": f"шанс точного совпадения {pe*100:.0f}%", **dbg}

    # Dudo
    if b:
        if dbg["p_seen"] < style["dudoBelow"]:
            return {"type": "dudo", "reason": f"оценил ставку в {dbg['p_seen']*100:.0f}% (порог {style['dudoBelow']*100:.0f}%)", **dbg}

    cands = []
    for q in range(1, total_dice + 1):
        for f in range(1, 7):
            if legal(q, f, b, wild):
                cands.append({"q": q, "f": f, "p": pr(q, f)})

    if not cands:
        if b:
            return {"type": "dudo", "reason": "повышать некуда", **dbg}
        m = min_legal(None, total_dice, wild)
        return {"type": "raise", **m, "reason": "первая ставка", **dbg}

    good = [c for c in cands if c["p"] >= style["raiseMin"]]

    if rng.random() < style["bluff"] or not good:
        pool = [c for c in cands if 0.18 <= c["p"] < style["raiseMin"]]
        if pool and (good or b):
            c = pool[int(rng.random() * len(pool))]
            return {"type": "raise", "q": c["q"], "f": c["f"], "p": c["p"], "bluff": True,
                    "reason": f"блеф (оценка {c['p']*100:.0f}% < порога {style['raiseMin']*100:.0f}%)", **dbg}

    if not good:
        if b:
            return {"type": "dudo", "reason": "безопасных ставок нет", **dbg}
        m = sorted(cands, key=lambda c: -c["p"])[0]
        return {"type": "raise", "q": m["q"], "f": m["f"], "p": m["p"], "reason": "единственный вариант", **dbg}

    mx = max(c["p"] for c in good)
    near = [c for c in good if c["p"] >= mx - 0.08]
    c = near[int(rng.random() * len(near))]
    return {"type": "raise", "q": c["q"], "f": c["f"], "p": c["p"],
            "reason": f"надёжная ставка (оценка {c['p']*100:.0f}%)", **dbg}

# ====================== engine.js ======================

@dataclass
class Player:
    id: str
    name: str
    style: str
    dice: int
    hand: list = field(default_factory=list)
    alive: bool = True
    palifico_used: bool = False


class Game:
    def __init__(self, bot_count, start_dice, calza, palifico, styles, names, rng):
        if not 1 <= start_dice <= 10:
            raise ValueError("start_dice: 1..10")
        self.rng = rng
        self.start_dice = start_dice
        self.calza_enabled = calza
        self.palifico_enabled = palifico
        self.players = [Player(f"bot_{i}", names[i] if i < len(names) else f"Бот {i+1}", styles[i], start_dice)
                        for i in range(bot_count)]
        self.current = 0
        self.round = 0
        self.bid = None
        self.bid_history = []
        self.palifico = False
        self.state = "waiting"
        self.winner = None
        self.events = []

    # --- helpers
    def total_dice(self):
        return sum(p.dice for p in self.players)

    def next_alive(self, frm):
        i = frm
        while True:
            i = (i + 1) % len(self.players)
            if self.players[i].alive:
                return i

    def alive_players(self):
        return [p for p in self.players if p.alive]

    def emit(self, type_, **kw):
        self.events.append({"type": type_, "round": self.round, **kw})

    def can_calza(self):
        if not self.calza_enabled or not self.bid:
            return False
        if self.bid["playerId"] == self.players[self.current].id:
            return False
        return self.total_dice() >= math.ceil(self.start_dice * len(self.players) / 2)

    # --- API
    def start(self):
        self.state = "active"
        self.emit("GAME_STARTED")
        self.start_round(0)

    def start_round(self, starter):
        total = self.total_dice()
        alive = self.alive_players()
        if len(alive) == 1:
            self.state = "finished"
            self.winner = alive[0].id
            self.emit("GAME_ENDED", winner=alive[0].id)
            return
        idx = starter
        if idx < 0 or not self.players[idx].alive:
            idx = self.next_alive(self.current - 1)
        for p in self.players:
            if p.alive:
                p.hand = [1 + int(self.rng.random() * 6) for _ in range(p.dice)]
        self.bid = None
        self.bid_history = []
        self.palifico = False
        if self.palifico_enabled:
            one = next((p for p in self.players if p.alive and p.dice == 1 and not p.palifico_used), None)
            if one and len(alive) > 2:
                self.palifico = True
                one.palifico_used = True
                idx = self.players.index(one)
                self.emit("PALIFICO_STARTED", playerId=one.id)
        self.current = idx
        self.round += 1
        self.emit("ROUND_STARTED", starter=self.players[idx].id, totalDice=total, palifico=self.palifico)
        self.state = "active"

    def apply(self, pid, action):
        if self.state != "active":
            return False, "Game not active"
        idx = next((i for i, p in enumerate(self.players) if p.id == pid), -1)
        if idx < 0 or not self.players[idx].alive:
            return False, "Player not found or eliminated"
        if self.current != idx:
            return False, "Not your turn"
        wild = not self.palifico
        t = action["type"]
        if t == "raise":
            if not legal(action["q"], action["f"], self.bid, wild):
                return False, "Invalid bid"
        else:
            if not self.bid or self.bid["playerId"] == pid:
                return False, "Cannot challenge your own bid"
            if t == "calza" and not self.can_calza():
                return False, "Calza not available"
        before = len(self.events)
        pl = self.players[idx]
        if t == "raise":
            self.bid = {"playerId": pl.id, "playerName": pl.name, "q": action["q"], "f": action["f"]}
            self.bid_history.append(self.bid)
            self.emit("BID_PLACED", playerId=pl.id, q=action["q"], f=action["f"])
            self.current = self.next_alive(idx)
        elif t == "dudo":
            self.emit("DUDO_CALLED", challenger=pl.id, bid=dict(self.bid))
            self._resolve_dudo()
        else:
            self.emit("CALZA_CALLED", challenger=pl.id, bid=dict(self.bid))
            self._resolve_calza(idx)
        return True, self.events[before:]

    def _count(self, bid, wild):
        return sum(1 for p in self.players if p.alive for d in p.hand
                   if d == bid["f"] or (wild and d == 1 and bid["f"] != 1))

    def _hands(self):
        return {p.name: list(p.hand) for p in self.players if p.alive}

    def _resolve_dudo(self):
        bid = self.bid
        bidder = next(i for i, p in enumerate(self.players) if p.id == bid["playerId"])
        chal = self.current
        wild = not self.palifico
        count = self._count(bid, wild)
        ok = count >= bid["q"]
        loser = chal if ok else bidder
        self.emit("DICE_REVEALED", kind="dudo", bid=dict(bid), actual=count, bidSuccessful=ok, wild=wild,
                  challenger=self.players[chal].id, bidder=bid["playerId"], loser=self.players[loser].id,
                  hands=self._hands())
        lp = self.players[loser]
        lp.dice -= 1
        self.emit("PLAYER_LOST_DIE", playerId=lp.id, newDiceCount=lp.dice)
        if lp.dice <= 0:
            lp.alive = False
            lp.dice = 0
            self.emit("PLAYER_ELIMINATED", playerId=lp.id)
        self.state = "round_resolving"
        self.start_round(loser)

    def _resolve_calza(self, chal_idx):
        bid = self.bid
        wild = not self.palifico
        count = self._count(bid, wild)
        exact = count == bid["q"]
        self.emit("DICE_REVEALED", kind="calza", bid=dict(bid), actual=count, calzaExact=exact, wild=wild,
                  challenger=self.players[chal_idx].id, bidder=bid["playerId"], hands=self._hands())
        ch = self.players[chal_idx]
        if exact:
            if ch.dice < self.start_dice:
                ch.dice += 1
                if ch.dice > 1:
                    ch.palifico_used = False
                self.emit("PLAYER_GAINED_DIE", playerId=ch.id, newDiceCount=ch.dice)
        else:
            ch.dice -= 1
            self.emit("PLAYER_LOST_DIE", playerId=ch.id, newDiceCount=ch.dice)
            if ch.dice <= 0:
                ch.alive = False
                ch.dice = 0
                self.emit("PLAYER_ELIMINATED", playerId=ch.id)
        nxt = next(i for i, p in enumerate(self.players) if p.id == bid["playerId"]) if exact else chal_idx
        self.state = "round_resolving"
        self.start_round(nxt)

# ====================== эмуляция и логирование ======================

def fb(b):
    return f"{b['q']}×{b['f']}"


class Log:
    def __init__(self, path: Path | None, echo: bool):
        self.fh = path.open("w", encoding="utf-8") if path else None
        self.echo = echo

    def __call__(self, s=""):
        if self.fh:
            self.fh.write(s + "\n")
        if self.echo:
            print(s)

    def close(self):
        if self.fh:
            self.fh.close()


def pick_styles(count, choices):
    out = []
    for i in range(count):
        c = choices[i] if i < len(choices) else "auto"
        if c == "random":
            out.append(random.choice(list(BOT_STYLES)))
        elif c in BOT_STYLES:
            out.append(c)
        else:
            out.append(DEFAULT_STYLE_CYCLE[i % len(DEFAULT_STYLE_CYCLE)])
    return out


def play_game(args, seed, log: Log, jsonl=None):
    rng = random.Random(seed)
    styles = pick_styles(args.bots, args.styles.split(",") if args.styles else [])
    g = Game(args.bots, args.dice, args.calza, args.palifico, styles, DEFAULT_NAMES, rng)
    noise_mul = BOT_LEVELS[args.level]["noise"]
    name = {p.id: p.name for p in g.players}
    st = {p.id: Counter() for p in g.players}
    stats = {"bids": 0, "dudos": 0, "calzas": 0, "palifico_rounds": 0, "turns": 0}

    def jl(rec):
        if jsonl:
            jsonl.write(json.dumps(rec, ensure_ascii=False) + "\n")

    log("=" * 78)
    log(f"ПАРТИЯ  seed={seed}  ботов={args.bots}  кубиков={args.dice}  уровень={BOT_LEVELS[args.level]['name']} "
        f"(шум x{noise_mul})  Палифико={'да' if args.palifico else 'нет'}  Calza={'да' if args.calza else 'нет'}")
    for p in g.players:
        s = BOT_STYLES[p.style]
        log(f"  {p.name:<8} стиль={s['name']:<10} raiseMin={s['raiseMin']:.2f} dudoBelow={s['dudoBelow']:.2f} "
            f"bluff={s['bluff']:.2f} noise=±{s['noise']*noise_mul:.3f} calza={'да' if s['calza'] else 'нет'}")
    log("=" * 78)

    g.start()
    last_round = 0
    turn_in_round = 0
    guard = 0
    while g.state == "active" and guard < 20000:
        guard += 1
        if g.round != last_round:
            last_round = g.round
            turn_in_round = 0
            if g.palifico:
                stats["palifico_rounds"] += 1
            log()
            log(f"─── Раунд {g.round} ─── всего кубиков: {g.total_dice()} "
                f"{'| ★ ПАЛИФИКО: единицы не джокеры, грань фиксируется' if g.palifico else ''}")
            log("  Кубики: " + "; ".join(f"{p.name}({p.dice})={sorted(p.hand)}" for p in g.players if p.alive))
            log(f"  Ходит первым: {g.players[g.current].name}")
            jl({"ev": "round", "round": g.round, "palifico": g.palifico, "total": g.total_dice(),
                "hands": {p.name: p.hand for p in g.players if p.alive}, "starter": g.players[g.current].name})

        bot = g.players[g.current]
        wild = not g.palifico
        total = g.total_dice()
        bid_before = dict(g.bid) if g.bid else None
        d = bot_decide(bot.hand, total, bid_before, wild, BOT_STYLES[bot.style],
                       g.can_calza(), noise_mul, rng)
        if d["type"] == "raise":
            action = {"type": "raise", "q": d["q"], "f": d["f"]}
        else:
            action = {"type": d["type"]}
        ok, res = g.apply(bot.id, action)
        if not ok:  # запасной вариант, как в app_v2.runBotTurn
            fallback = {"type": "dudo"} if (g.bid and g.bid["playerId"] != bot.id) else \
                {"type": "raise", **(min_legal(g.bid, total, wild) or {})}
            log(f"  !! {bot.name}: {action} отклонено ({res}); fallback {fallback}")
            ok, res = g.apply(bot.id, fallback)
            action = fallback
            d["type"] = fallback["type"]
            if not ok:
                log(f"  !! fallback тоже не удался: {res}")
                break
        turn_in_round += 1
        stats["turns"] += 1

        own = ""
        if bid_before:
            own = (f"  [оценка {d['p_seen']*100:.0f}% | точно {d['p_exact']*100:.0f}% | "
                   f"ошибка восприятия {d['noise_err']*100:+.0f}пп]")
        who = f"  {turn_in_round:>2}. {bot.name} ({BOT_STYLES[bot.style]['name']})"
        if d["type"] == "raise":
            stats["bids"] += 1
            st[bot.id]["bids"] += 1
            if d.get("bluff"):
                st[bot.id]["bluff_bids"] += 1
            true_p = prob_bid(action["q"], action["f"], total, bot.hand, wild)
            log(f"{who}: СТАВКА {action['q']}×{action['f']}  — {d['reason']}{own}  (реальный шанс {true_p*100:.0f}%)")
        else:
            label = "НЕ ВЕРЮ!" if d["type"] == "dudo" else "CALZA!"
            log(f"{who}: {label} на {fb(bid_before)} — {d['reason']}{own}")
            if d["type"] == "dudo":
                stats["dudos"] += 1
                st[bot.id]["dudos"] += 1
                p_ex = d["p_exact"]
                if p_ex >= BOT_STYLES[bot.style]["dudoBelow"]:
                    st[bot.id]["false_dudo_perception"] += 1
                    log(f"      ⚠ ошибка восприятия: при точном расчёте ставка проходила порог доверия — бот зря усомнился")
            else:
                stats["calzas"] += 1
                st[bot.id]["calzas"] += 1
        if bid_before and d["type"] == "raise":
            if d["p_exact"] < BOT_STYLES[bot.style]["dudoBelow"]:
                st[bot.id]["missed_dudo_perception"] += 1
                log(f"      ⚠ ошибка восприятия: при точном расчёте нужно было говорить «не верю» "
                    f"(точно {d['p_exact']*100:.0f}% < {BOT_STYLES[bot.style]['dudoBelow']*100:.0f}%)")

        jl({"ev": "action", "round": g.round if d["type"] == "raise" else last_round, "player": bot.name,
            "style": bot.style, "action": d["type"], "bid": (action if d["type"] == "raise" else bid_before),
            "reason": d["reason"], "p_seen": d.get("p_seen"), "p_exact": d.get("p_exact"),
            "bluff": bool(d.get("bluff"))})

        for e in res:
            t = e["type"]
            if t == "DICE_REVEALED":
                kind = e["kind"]
                log("  ┌ ВСКРЫТИЕ: " + "; ".join(f"{n}={sorted(h)}" for n, h in e["hands"].items()))
                wn = "единицы — джокеры" if e["wild"] else "ПАЛИФИКО — единицы не считаются"
                if kind == "dudo":
                    verdict = "ставка ВЕРНА" if e["bidSuccessful"] else "ставка НЕВЕРНА (блеф разоблачён)"
                    log(f"  │ Ставка {fb(e['bid'])}, на столе {e['actual']} ({wn}) → {verdict}")
                    log(f"  │ Теряет кубик: {name[e['loser']]}")
                    st[e["bidder"]]["bids_challenged"] += 1
                    if not e["bidSuccessful"]:
                        st[e["bidder"]]["caught_lying"] += 1
                    else:
                        st[e["challenger"]]["lost_challenge"] += 1
                    if e["bidSuccessful"]:
                        st[e["challenger"]]["dudo_wrong"] += 1
                    else:
                        st[e["challenger"]]["dudo_right"] += 1
                else:
                    log(f"  │ CALZA на {fb(e['bid'])}, на столе {e['actual']} ({wn}) → "
                        f"{'ТОЧНО' if e['calzaExact'] else 'мимо'}")
                    st[e["challenger"]]["calza_right" if e["calzaExact"] else "calza_wrong"] += 1
                jl({"ev": "reveal", **{k: v for k, v in e.items() if k != "round"}})
            elif t == "PLAYER_LOST_DIE":
                log(f"  │ {name[e['playerId']]}: осталось кубиков {e['newDiceCount']}")
            elif t == "PLAYER_GAINED_DIE":
                log(f"  │ {name[e['playerId']]} получает кубик → {e['newDiceCount']}")
            elif t == "PLAYER_ELIMINATED":
                log(f"  └ ✖ {name[e['playerId']]} ВЫБЫВАЕТ")
            elif t == "PALIFICO_STARTED":
                log(f"  ★ {name[e['playerId']]} остался с одним кубиком — следующий раунд Палифико")

    winner = name.get(g.winner, "—")
    log()
    log("=" * 78)
    log(f"ИТОГ: победитель — {winner} ({BOT_STYLES[next(p.style for p in g.players if p.id == g.winner)]['name']}), "
        f"раундов: {g.round}, ходов: {stats['turns']}")
    log("-" * 78)
    for p in g.players:
        c = st[p.id]
        log(f"  {p.name:<8} {BOT_STYLES[p.style]['name']:<10} ставок={c['bids']:>3} блефов={c['bluff_bids']:>2} "
            f"поймали на лжи={c['caught_lying']:>2} «не верю» верно/неверно={c['dudo_right']}/{c['dudo_wrong']} "
            f"ошибок восприятия={c['false_dudo_perception'] + c['missed_dudo_perception']}")
    log("=" * 78)
    return {"seed": seed, "winner": g.winner, "winner_name": winner,
            "winner_style": next(p.style for p in g.players if p.id == g.winner),
            "rounds": g.round, "styles": {p.id: p.style for p in g.players},
            "stats": stats, "per_bot": {k: dict(v) for k, v in st.items()}}


def main():
    ap = argparse.ArgumentParser(description="Эмулятор партий Perudo между ботами")
    ap.add_argument("--bots", type=int, default=4)
    ap.add_argument("--dice", type=int, default=5, help="кубиков в руке")
    ap.add_argument("--level", choices=list(BOT_LEVELS), default="normal")
    ap.add_argument("--no-palifico", dest="palifico", action="store_false", help="выключить Палифико")
    ap.add_argument("--calza", action="store_true", help="включить Calza")
    ap.add_argument("--styles", default="", help="стили ботов через запятую (careful,bluffer,smart,aggressor,skeptic,random)")
    ap.add_argument("--games", type=int, default=1)
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--out", default="logs", help="папка для логов")
    ap.add_argument("--quiet", action="store_true", help="не печатать лог в консоль")
    ap.set_defaults(palifico=True)
    args = ap.parse_args()
    if not 1 <= args.bots <= 5:
        sys.exit("--bots: 1..5 (как LIMITS в engine.js)")

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    base_seed = args.seed if args.seed is not None else random.randrange(10**9)
    results = []
    for i in range(args.games):
        seed = base_seed + i
        tag = f"{stamp}_seed{seed}"
        log = Log(out / f"game_{tag}.log", echo=not args.quiet and args.games == 1)
        with (out / f"game_{tag}.jsonl").open("w", encoding="utf-8") as jf:
            results.append(play_game(args, seed, log, jf))
        log.close()

    if args.games > 1:
        wins = Counter(r["winner_style"] for r in results)
        seats = Counter(int(r["winner"].split("_")[1]) for r in results)
        n = len(results)
        print(f"Партий: {n}, среднее раундов: {sum(r['rounds'] for r in results)/n:.1f}")
        print("Победы по стилям:", {BOT_STYLES[s]["name"]: f"{c} ({c/n*100:.0f}%)" for s, c in wins.most_common()})
        print("Победы по местам за столом:", dict(sorted(seats.items())))
        (out / f"summary_{stamp}.json").write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nЛоги: {out.resolve()}")


if __name__ == "__main__":
    main()
