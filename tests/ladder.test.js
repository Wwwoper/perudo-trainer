import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  buildLadder, ladderChances, ladderLines, ladderOpponents, gradeDudo, gradeRaise, sanitizeLadder,
  LADDER_MIN_BIDS, LADDER_MAX_BIDS, addLadderResult,
} from '../src/ladder.js';
import { legal } from '../src/rules.js';
import { seededRng } from '../src/read_sim.js';
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
  it('«Не верю» хорошо при шансе ниже порога, повышение — при шансе не ниже порога', () => {
    const s = fixed();
    const ch = ladderChances(s, P);
    assert.equal(gradeDudo(ch, ch.pRead + 0.01), true);
    assert.equal(gradeDudo(ch, ch.pRead), false);
    assert.equal(gradeRaise(s, s.q, s.f, 0, P), true);
    assert.equal(gradeRaise(s, s.q + 8, s.f, 0.5, P), false);
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
