import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  buildLadder, pickBotNames, ladderNames, ladderChances, ladderLines, ladderOpponents, gradeLadder, sanitizeLadder,
  LADDER_MIN_BIDS, LADDER_MAX_BIDS, addLadderResult,
} from '../src/ladder.js';
import { legal } from '../src/rules.js';
import { seededRng } from '../src/read_sim.js';
import { BOT_NAMES } from '../src/bots.js';
import { BANNED } from '../src/situation_text.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = { self: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'src/core.js'), 'utf8'), sandbox);
const P = sandbox.self.Perudo || sandbox.Perudo;

const fixed = () => ({
  wild: true, n: 14, h: [5, 1, 2, 3], ks: [3, 4, 3],
  bids: [{ s: 0, q: 3, f: 5 }, { s: 1, q: 4, f: 5 }, { s: 2, q: 5, f: 5 }], q: 5, f: 5,
});

describe('buildLadder', () => {
  it('ситуации корректны: ставки допустимы, растут, соседние авторы разные, форма проходит sanitizeLadder', () => {
    let made = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const wild = seed % 7 !== 0;
      const s = buildLadder({ rnd: seededRng(seed), wild });
      if (!s) continue;
      made++;
      assert.deepEqual(sanitizeLadder(s), s, `зерно ${seed}`);
      assert.ok(s.bids.length >= LADDER_MIN_BIDS && s.bids.length <= LADDER_MAX_BIDS);
      s.bids.forEach((b, i) => {
        assert.ok(legal(b.q, b.f, i ? s.bids[i - 1] : null, { wild }), `зерно ${seed}, ставка ${i + 1}`);
        if (i) assert.notEqual(b.s, s.bids[i - 1].s);
      });
      assert.equal(s.n, s.h.length + s.ks.reduce((a, b) => a + b, 0));
    }
    assert.ok(made > 360, `получилось ${made} из 400`);
  });
  it('воспроизводима по зерну', () => {
    assert.deepEqual(buildLadder({ rnd: seededRng(5) }), buildLadder({ rnd: seededRng(5) }));
  });
  it('встречаются подтверждения: две ставки разных соперников на одну цифру', () => {
    let pairs = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const s = buildLadder({ rnd: seededRng(seed) });
      if (!s) continue;
      const faces = ladderOpponents(s).map((o) => o.faces);
      if (faces[s.bids.at(-1).s].includes(s.f) && faces.filter((f) => f.includes(s.f)).length >= 2) pairs++;
    }
    assert.ok(pairs > 40, `подтверждений ${pairs}`);
  });
});

describe('ladderChances', () => {
  it('учёт стола повышает шанс, когда цифру назвали несколько соперников', () => {
    const ch = ladderChances(fixed(), P);
    assert.equal(ch.named, 3);
    assert.equal(ch.opps, 3);
    assert.ok(ch.pRead > ch.pOwn);
    assert.ok(ch.pOwn > 0 && ch.pRead <= 1);
  });
  it('цифру назвал один: подтверждения нет', () => {
    const s = fixed();
    s.bids = [{ s: 0, q: 2, f: 3 }, { s: 1, q: 3, f: 4 }, { s: 2, q: 5, f: 5 }];
    assert.equal(ladderChances(s, P).named, 1);
  });
});

describe('ladderLines и оценка решения', () => {
  it('тексты содержат оба шанса и не содержат запретных формулировок', () => {
    for (const s of [fixed(), { ...fixed(), bids: [{ s: 0, q: 2, f: 3 }, { s: 1, q: 3, f: 4 }, { s: 2, q: 5, f: 5 }] }]) {
      const ch = ladderChances(s, P);
      const text = ladderLines(s, ch).join(' ');
      assert.match(text, /По вашим кубикам/);
      assert.match(text, /с учётом стола шанс/);
      assert.match(text, /приблизительная/);
      for (const re of BANNED) assert.ok(!re.test(text), `${re}: ${text}`);
      assert.ok(!/обманщик|врёт/i.test(text));
    }
  });
  it('склонение «соперника / соперников»', () => {
    const s = fixed();
    assert.match(ladderLines(s, { ...ladderChances(s, P), named: 2, opps: 3 }).join(' '), /2 из 3 соперников/);
    assert.match(ladderLines(s, { ...ladderChances(s, P), named: 2, opps: 2 }).join(' '), /2 из 2 соперников|2 из 2 соперника/);
  });
  it('«Не верю» хорошо, когда шанс проверки выше порога; повышение — когда шанс ставки выше порога', () => {
    const s = fixed();
    const ch = ladderChances(s, P);
    const dudo = { type: 'dudo' };
    assert.equal(gradeLadder(s, (1 - ch.pRead) - 0.03, P, dudo).good, true);
    assert.equal(gradeLadder(s, (1 - ch.pRead) + 0.03, P, dudo).good, false);
    assert.equal(gradeLadder(s, 0.05, P, { type: 'raise', q: s.q, f: s.f + 1 > 6 ? 6 : s.f + 1 }).good, true);
  });
  it('если ни один ход не проходит порог, верен ход с наибольшим шансом (как в других режимах)', () => {
    // порог 0.7: таких ситуаций около 5 %, ищем на фиксированном генераторе
    const rnd = seededRng(11);
    let found = 0;
    for (let i = 0; i < 400 && found < 3; i++) {
      const s = buildLadder({ rnd, wild: true });
      const g = gradeLadder(s, 0.7, P, { type: 'dudo' });
      if (!g.noGoodMove) continue;
      found++;
      const ch = ladderChances(s, P);
      assert.ok(Math.abs(g.chosenSuccess - (1 - ch.pRead)) < 1e-9);
      const dudoIsBest = g.best.type === 'dudo';
      assert.equal(g.good, dudoIsBest || g.best.success <= g.chosenSuccess + 1e-9);
      // выбор самого сильного хода всегда верен
      const bestChoice = g.best.type === 'dudo' ? { type: 'dudo' } : { type: 'raise', q: g.best.q, f: g.best.f };
      assert.equal(gradeLadder(s, 0.7, P, bestChoice).good, true);
      // а более слабый ход неверен, если он действительно слабее
      const weak = { type: 'raise', q: s.n, f: s.f === 6 ? 5 : 6 };
      if (legal(weak.q, weak.f, { q: s.q, f: s.f }, { wild: s.wild })) {
        const w = gradeLadder(s, 0.7, P, weak);
        assert.equal(w.good, w.chosenSuccess >= g.best.success - 1e-9);
      }
    }
    assert.ok(found >= 1, 'нашлась ситуация без проходящего хода');
  });
  it('безвыходных ситуаций нет: для любой найдётся верный ход при любом пороге', () => {
    const rnd = seededRng(5);
    for (const thr of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      for (let i = 0; i < 150; i++) {
        const s = buildLadder({ rnd, wild: true });
        const g = gradeLadder(s, thr, P, { type: 'dudo' });
        const bestChoice = g.best.type === 'dudo' ? { type: 'dudo' } : { type: 'raise', q: g.best.q, f: g.best.f };
        assert.equal(gradeLadder(s, thr, P, bestChoice).good, true, `порог ${thr}, ситуация ${i}`);
      }
    }
  });
});

describe('sanitizeLadder', () => {
  it('мусор отбрасывается', () => {
    assert.equal(sanitizeLadder(null), null);
    assert.equal(sanitizeLadder([]), null);
    assert.equal(sanitizeLadder({ ...fixed(), n: 99 }), null);
    assert.equal(sanitizeLadder({ ...fixed(), ks: [3] }), null);
    assert.equal(sanitizeLadder({ ...fixed(), wild: 1 }), null);
    assert.equal(sanitizeLadder({ ...fixed(), bids: fixed().bids.slice(0, 2) }), null);
    assert.equal(sanitizeLadder({ ...fixed(), q: 9 }), null);
    assert.equal(sanitizeLadder({ ...fixed(), bids: [...fixed().bids.slice(0, 2), { s: 7, q: 5, f: 5 }] }), null);
  });
  it('лишние поля не переносятся, исходный объект не меняется', () => {
    const src = { ...fixed(), junk: 1 };
    const out = sanitizeLadder(src);
    assert.ok(!('junk' in out));
    out.bids[0].q = 99;
    assert.equal(src.bids[0].q, 3);
  });
});

describe('addLadderResult', () => {
  it('прибавляет ответ, не трогая остальные темы и исходный объект', () => {
    const src = { endgame: { n: 2, good: 1 } };
    const a = addLadderResult(src, true);
    assert.deepEqual(a.ladder, { n: 1, good: 1 });
    assert.deepEqual(a.endgame, { n: 2, good: 1 });
    assert.ok(!('ladder' in src));
    assert.deepEqual(addLadderResult(a, false).ladder, { n: 2, good: 1 });
  });
  it('мусор вместо byTag и счётчиков считается нулями', () => {
    for (const bad of [null, undefined, 5, 'x', [], { ladder: null }, { ladder: { n: 'a', good: 1 } },
      { ladder: { n: 1, good: 5 } }, { ladder: { n: -1, good: -2 } }]) {
      assert.deepEqual(addLadderResult(bad, true).ladder, { n: 1, good: 1 }, JSON.stringify(bad));
    }
  });
});

describe('имена соперников', () => {
  it('pickBotNames: нужное число разных имён из списка ботов; воспроизводимо по зерну', () => {
    for (let seed = 1; seed <= 50; seed++) {
      for (const count of [1, 2, 3, 4]) {
        const names = pickBotNames(count, seededRng(seed));
        assert.equal(names.length, count);
        assert.equal(new Set(names).size, count, `повтор имён при зерне ${seed}`);
        assert.ok(names.every((n) => BOT_NAMES.includes(n)));
      }
    }
    assert.deepEqual(pickBotNames(3, seededRng(7)), pickBotNames(3, seededRng(7)));
  });

  it('pickBotNames: неверное число — ошибка', () => {
    assert.throws(() => pickBotNames(0), RangeError);
    assert.throws(() => pickBotNames(2.5), RangeError);
    assert.throws(() => pickBotNames(BOT_NAMES.length + 1), RangeError);
  });

  it('у каждой построенной ситуации имена: по одному на соперника, без повторов, не «Соперник N»', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const sit = buildLadder({ rnd: seededRng(seed) });
      if (!sit) continue;
      assert.equal(sit.names.length, sit.ks.length);
      assert.equal(new Set(sit.names).size, sit.names.length);
      assert.ok(sit.names.every((n) => !/^Соперник/.test(n)));
    }
  });

  it('sanitizeLadder сохраняет корректные имена', () => {
    const raw = { ...fixed(), names: ['Анна', 'Иван', 'Ольга'] };
    assert.deepEqual(sanitizeLadder(raw).names, ['Анна', 'Иван', 'Ольга']);
  });

  it('запись без имён (из старой очереди) получает одни и те же имена каждый раз', () => {
    const a = sanitizeLadder(fixed()).names;
    const b = sanitizeLadder(fixed()).names;
    assert.deepEqual(a, b);
    assert.equal(a.length, 3);
    assert.equal(new Set(a).size, 3);
  });

  it('некорректные имена (повтор, не тот размер, не строки, пустые) заменяются', () => {
    for (const names of [['Анна', 'Анна', 'Ольга'], ['Анна', 'Иван'], [1, 2, 3], ['', 'Иван', 'Ольга'], 'Анна', ['Анна', 'Иван', 'x'.repeat(30)]]) {
      const got = sanitizeLadder({ ...fixed(), names }).names;
      assert.equal(got.length, 3);
      assert.equal(new Set(got).size, 3);
      assert.ok(got.every((n) => typeof n === 'string' && n && n.length <= 24));
    }
  });

  it('ladderNames не меняет ситуацию', () => {
    const sit = fixed();
    const copy = JSON.stringify(sit);
    ladderNames(sit);
    assert.equal(JSON.stringify(sit), copy);
  });
});
