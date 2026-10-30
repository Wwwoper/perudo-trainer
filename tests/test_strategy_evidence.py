"""Тесты tools/strategy_evidence.py: подсчёт фактов, точная математика, воспроизводимость и документ."""
import importlib.util
import random
import re
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("strategy_evidence", ROOT / "tools" / "strategy_evidence.py")
SE = importlib.util.module_from_spec(_spec)
sys.modules["strategy_evidence"] = SE
_spec.loader.exec_module(SE)


def action(player, style, q, f, bluff=False, kind="raise"):
    return {"ev": "action", "player": player, "style": style, "action": kind,
            "bid": {"q": q, "f": f}, "bluff": bluff}


def round_rec(hands, palifico=False):
    return {"ev": "round", "palifico": palifico, "hands": hands}


def reveal(success, kind="dudo"):
    return {"ev": "reveal", "kind": kind, "bidSuccessful": success}


class Helpers(unittest.TestCase):
    def test_count_face_wild_and_palifico(self):
        hands = [[1, 2, 2], [3, 1]]
        self.assertEqual(SE.count_face(hands, 2, True), 4)
        self.assertEqual(SE.count_face(hands, 2, False), 2)
        self.assertEqual(SE.count_face(hands, 1, True), 2)  # единицы как грань: джокеры не удваиваются

    def test_step_bucket(self):
        prev = {"q": 3, "f": 4}
        self.assertEqual(SE.step_bucket(prev, {"q": 3, "f": 5}), "смена грани")
        self.assertEqual(SE.step_bucket(prev, {"q": 2, "f": 6}), "смена грани")
        self.assertEqual(SE.step_bucket(prev, {"q": 4, "f": 4}), "+1")
        self.assertEqual(SE.step_bucket(prev, {"q": 5, "f": 4}), "+2 и больше")
        self.assertEqual(SE.step_bucket(prev, {"q": 9, "f": 2}), "+2 и больше")

    def test_dice_bucket(self):
        self.assertEqual([SE.dice_bucket(n) for n in (1, 2, 3, 5, 10)], ["1", "2", "3+", "3+", "3+"])

    def test_share(self):
        self.assertIsNone(SE.share(0, 0))
        self.assertEqual(SE.share(1, 4), 0.25)
        self.assertEqual(SE.pct(None), "—")
        self.assertEqual(SE.pct(0.5), "50 %")


class Math(unittest.TestCase):
    def test_hit_probability_edges_and_known_value(self):
        self.assertEqual(SE.hit_probability(5, 0, 1 / 3), 1.0)
        self.assertEqual(SE.hit_probability(5, 6, 1 / 3), 0.0)
        self.assertAlmostEqual(SE.hit_probability(5, 2, 1 / 3), 1 - (2 / 3) ** 5 - 5 * (1 / 3) * (2 / 3) ** 4, places=9)

    def test_hit_probability_matches_emulator_prob_bid(self):
        for hidden in (3, 7, 12):
            for need in range(0, hidden + 2):
                hand = [4]  # своя рука из одного кубика другой грани, не влияет на скрытые
                got = SE.hit_probability(hidden, need, 1 / 3)
                want = SE.EMU.prob_bid(need, 2, hidden + 1, hand, True)
                self.assertAlmostEqual(got, want, places=9)

    def test_hit_probability_against_monte_carlo(self):
        rng = random.Random(7)
        hidden, need, n = 10, 4, 20000
        hits = 0
        for _ in range(n):
            cnt = sum(1 for _ in range(hidden) if rng.randint(1, 6) in (1, 2))
            hits += cnt >= need
        self.assertAlmostEqual(hits / n, SE.hit_probability(hidden, need, 1 / 3), delta=0.02)

    def test_expectation_table_shape_and_monotonic(self):
        rows = SE.expectation_table()
        self.assertEqual([r["hidden"] for r in rows], [5, 10, 15, 20])
        for r in rows:
            probs = [r[d] for d in (-1, 0, 1, 2, 3)]
            self.assertEqual(probs, sorted(probs, reverse=True))
            self.assertTrue(all(0 <= p <= 1 for p in probs))
            self.assertAlmostEqual(r["expected"], r["hidden"] / 3)


class Analyze(unittest.TestCase):
    def test_hand_made_round(self):
        recs = [
            round_rec({"А": [2, 2, 1], "Б": [3, 4]}),
            action("А", "careful", 2, 2),
            action("Б", "bluffer", 3, 2, bluff=True),
            action("А", "careful", 5, 2),
            reveal(False),
        ]
        c = SE.analyze_game(recs)
        self.assertEqual(c["rounds"], 1)
        self.assertEqual(c["style.careful.bids"], 2)
        self.assertEqual(c["style.careful.false"], 1)
        self.assertEqual(c["style.bluffer.bids"], 1)
        self.assertEqual(c["style.bluffer.false"], 0)  # двоек с джокером три — ставка верна
        self.assertEqual(c["style.bluffer.flagged"], 1)
        self.assertEqual(c["style.bluffer.flagged_false"], 0)
        self.assertEqual(c["open.own.bids"], 1)
        self.assertEqual(c["open.own.true"], 1)
        self.assertEqual(c["open.dice.3+.bids"], 1)
        self.assertEqual(c["step.+1.bids"], 1)
        self.assertEqual(c["step.+1.true"], 1)
        self.assertEqual(c["step.+2 и больше.bids"], 1)
        self.assertEqual(c["step.+2 и больше.true"], 0)
        self.assertEqual(c["dudo.calls"], 1)
        self.assertEqual(c["dudo.bid_false"], 1)
        self.assertEqual(c["dudo.3+.calls"], 1)

    def test_palifico_does_not_count_wild_ones(self):
        recs = [
            round_rec({"А": [2, 1], "Б": [3, 4]}, palifico=True),
            action("А", "smart", 2, 2),
            reveal(True),
        ]
        c = SE.analyze_game(recs)
        self.assertEqual(c["style.smart.false"], 1)

    def test_opening_on_foreign_face_and_one_die(self):
        recs = [
            round_rec({"А": [5], "Б": [3, 4]}),
            action("А", "smart", 1, 6),
            reveal(True),
        ]
        c = SE.analyze_game(recs)
        self.assertEqual(c["open.other.bids"], 1)
        self.assertEqual(c["open.other.true"], 0)
        self.assertEqual(c["open.dice.1.bids"], 1)
        self.assertEqual(c["dudo.1.calls"], 1)
        self.assertEqual(c["dudo.1.bid_false"], 0)

    def test_calza_not_counted_as_dudo(self):
        recs = [round_rec({"А": [2], "Б": [2]}), action("А", "smart", 2, 2), reveal(True, kind="calza")]
        c = SE.analyze_game(recs)
        self.assertEqual(c["dudo.calls"], 0)
        self.assertEqual(c["rounds"], 1)

    def test_empty_records(self):
        self.assertEqual(dict(SE.analyze_game([])), {})


class Run(unittest.TestCase):
    def test_rotated_styles_cover_all(self):
        seen = set()
        for i in range(len(SE.EMU.BOT_STYLES)):
            seen.update(SE.rotated_styles(i, 4).split(","))
        self.assertEqual(seen, set(SE.EMU.BOT_STYLES))
        self.assertEqual(len(SE.rotated_styles(0, 4).split(",")), 4)

    def test_deterministic_and_seed_sensitive(self):
        a = SE.run(4, 11)
        self.assertEqual(a, SE.run(4, 11))
        self.assertNotEqual(a, SE.run(4, 12))
        self.assertEqual(a["games"], 4)

    def test_invariants(self):
        t = SE.run(8, 3)
        style_bids = sum(v for k, v in t.items() if re.fullmatch(r"style\.\w+\.bids", k))
        pos_bids = sum(v for k, v in t.items() if re.fullmatch(r"(step\.[^.]+|open\.(own|other))\.bids", k))
        self.assertEqual(style_bids, pos_bids)
        self.assertEqual(t["dudo.calls"], t["rounds"])  # Calza выключена: каждый раунд заканчивается проверкой
        self.assertLessEqual(t["dudo.bid_false"], t["dudo.calls"])
        for st in SE.EMU.BOT_STYLES:
            self.assertLessEqual(t.get(f"style.{st}.false", 0), t.get(f"style.{st}.bids", 0))
            self.assertLessEqual(t.get(f"style.{st}.flagged_false", 0), t.get(f"style.{st}.flagged", 0))
        buckets = sum(t.get(f"dudo.{b}.calls", 0) for b in SE.DICE_BUCKETS)
        self.assertEqual(buckets, t["dudo.calls"])

    def test_bad_arguments(self):
        with self.assertRaises(ValueError):
            SE.run(0, 1)
        with self.assertRaises(ValueError):
            SE.run(1, 1, bots=0)


class Render(unittest.TestCase):
    META = {"games": 6, "seed": 5, "level": "normal", "bots": 4, "dice": 5, "palifico": True, "version": "9.9.9"}

    def test_render_has_sections_and_no_python_noise(self):
        text = SE.render(SE.run(6, 5), self.META)
        for h in ("# Доказательная база тренера", "## Как воспроизвести", "## 1.", "## 2.", "## 3.", "## 4.", "## 5.", "## Ограничения"):
            self.assertIn(h, text)
        self.assertIn("версия приложения: 9.9.9", text)
        self.assertIn("--games 6 --seed 5", text)
        self.assertIn("наших ботах", text)
        for bad in ("None", "nan", "inf"):
            self.assertNotIn(bad, text)

    def test_render_empty_data_shows_dashes(self):
        text = SE.render({}, self.META)
        self.assertIn("—", text)
        self.assertNotIn("None", text)

    def test_main_writes_file(self):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "sub" / "e.md"
            self.assertEqual(SE.main(["--games", "2", "--seed", "1", "--out", str(out)]), 0)
            self.assertIn("партий: 2", out.read_text(encoding="utf-8"))

    def test_main_rejects_zero_games(self):
        with self.assertRaises(SystemExit):
            SE.main(["--games", "0"])


class CommittedDoc(unittest.TestCase):
    DOC = ROOT / "docs" / "dev" / "strategy-evidence.md"

    def test_doc_exists_and_command_matches_meta(self):
        self.assertTrue(self.DOC.exists(), "docs/dev/strategy-evidence.md не создан")
        text = self.DOC.read_text(encoding="utf-8")
        m = re.search(r"--games (\d+) --seed (\d+) --level (\w+)", text)
        self.assertIsNotNone(m)
        self.assertIn(f"партий: {m.group(1)},", text)
        self.assertIn(f"начальное число seed: {m.group(2)}", text)
        self.assertIn("наших ботах", text)

    def test_doc_small_replay_is_stable(self):
        # Первые партии из документа воспроизводятся: тот же seed даёт те же факты при повторе.
        self.assertEqual(SE.run(3, 1), SE.run(3, 1))


if __name__ == "__main__":
    unittest.main()
