// situation_text.test.js — тексты ситуации: типы строк, запрещённые формулировки, ссылки на измерения, режим «Игра».
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describeSituation } from '../src/situation.js';
import {
  situationLines, beforeMoveLines, canExplain, BANNED, EVIDENCE, LINE_TYPES, OBS_MIN, GAP_NEAR,
} from '../src/situation_text.js';
import { AssistMode } from '../src/assist.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = { self: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'src/core.js'), 'utf8'), sandbox);
const P = sandbox.self.Perudo || sandbox.Perudo;

const pl = (id, dice) => ({ id, dice, alive: dice > 0, style: 'smart' });
function sit({ dice = [5, 5, 5, 5], hand = [1, 2, 2, 4, 6], log = [], palifico = false, settings } = {}) {
  const players = dice.map((d, i) => pl(i === 0 ? 'human' : `b${i}`, d));
  return describeSituation({
    publicState: { players, bid: log.length ? { ...log.at(-1) } : null, palifico },
    myHand: hand.slice(0, dice[0]), bidLog: log, meSeat: 0, rules: { startDice: 5 }, settings,
    probBid: P.probBid, probBidRead: P.probBidRead,
  });
}
const bids = (...xs) => xs.map(([playerId, q, f]) => ({ playerId, q, f }));
/** Ситуация, собранная вручную, для проверки отдельных шаблонов. */
const fake = (over = {}) => ({
  phase: 'mid',
  balance: { total: 9, startTotal: 20, myDice: 3, players: [{ seat: 0, id: 'human', dice: 3, isMe: true, style: null }], leaders: [], lastDice: [], next: 1 },
  facts: [], observations: { count: 0, players: [] }, options: [], turnAfter: 1, ...over,
});

describe('строки: форма', () => {
  it('у каждой строки есть id, тип и текст; id не повторяются', () => {
    for (const depth of ['short', 'detailed']) {
      const lines = situationLines(sit({ log: bids(['b1', 2, 3], ['b2', 5, 3]) }), { depth });
      assert.ok(lines.length > 0);
      const ids = lines.map((l) => l.id);
      assert.equal(new Set(ids).size, ids.length);
      for (const l of lines) {
        assert.ok(LINE_TYPES.includes(l.type), l.id);
        assert.ok(typeof l.text === 'string' && l.text.length > 5, l.id);
      }
    }
  });
  it('краткий вариант — часть подробного', () => {
    const s = sit({ log: bids(['b1', 2, 3], ['b2', 5, 3]) });
    const detailed = new Set(situationLines(s, { depth: 'detailed' }).map((l) => l.id));
    for (const l of situationLines(s, { depth: 'short' })) assert.ok(detailed.has(l.id), l.id);
    assert.ok(detailed.size > situationLines(s, { depth: 'short' }).length);
  });
  it('неизвестная подробность — краткий вариант', () => {
    const s = sit({ log: bids(['b1', 2, 3]) });
    assert.deepEqual(situationLines(s, { depth: 'вау' }), situationLines(s, { depth: 'short' }));
  });
  it('имена подставляются, без имён видны id', () => {
    const s = sit({ log: bids(['b1', 2, 3]) });
    assert.ok(situationLines(s, { depth: 'detailed', names: { b1: 'Мария' } }).some((l) => l.text.includes('Мария')));
    assert.ok(situationLines(s, { depth: 'detailed' }).some((l) => l.text.includes('b1')));
  });
  it('стили ботов в текстах не появляются', () => {
    const s = sit({ log: bids(['b1', 2, 3], ['b2', 4, 3]), settings: { hideStyles: false } });
    const all = situationLines(s, { depth: 'detailed' }).map((l) => l.text).join(' ');
    for (const w of ['careful', 'bluffer', 'smart', 'aggressor', 'Осторожный', 'Блефующий', 'Агрессор', 'Скептик']) assert.ok(!all.includes(w), w);
  });
});

describe('шаблоны', () => {
  it('склонение: кубик, кубика, кубиков', () => {
    const t = (n) => situationLines(fake({ balance: { ...fake().balance, total: n } }))[0].text;
    assert.match(t(21), /21 кубик\./);
    assert.match(t(2), /2 кубика\./);
    assert.match(t(5), /5 кубиков\./);
    assert.match(t(11), /11 кубиков\./);
    assert.match(t(22), /22 кубика\./);
  });
  it('фазы', () => {
    const t = (phase) => situationLines(fake({ phase }))[0].text;
    assert.match(t('start'), /^Начало партии/);
    assert.match(t('mid'), /^Середина партии/);
    assert.match(t('endgame'), /^Эндшпиль/);
    assert.match(t('palifico'), /^Палифико/);
  });
  it('разрыв с ожиданием: ниже, около, выше среднего', () => {
    const make = (gap) => fake({ facts: [{ kind: 'expectation', face: 3, q: 5, own: 1, hidden: 12, p: 1 / 3, expected: 4, need: 4, gap }] });
    const g = (gap) => situationLines(make(gap)).find((l) => l.id === 'gap');
    assert.match(g(-3).text, /ниже среднего/);
    assert.match(g(GAP_NEAR).text, /около среднего/);
    assert.match(g(-GAP_NEAR).text, /около среднего/);
    assert.match(g(2).text, /выше среднего/);
    assert.equal(g(2).type, 'estimate');
    const e = situationLines(make(2)).find((l) => l.id === 'expectation');
    assert.equal(e.type, 'fact');
    assert.match(e.text, /1\/3/);
    assert.match(e.text, /4,0/);
  });
  it('Палифико и единицы: шанс 1/6', () => {
    const f = situationLines(fake({ facts: [{ kind: 'expectation', face: 1, q: 3, own: 1, hidden: 12, p: 1 / 6, expected: 2, need: 2, gap: 0 }] })).find((l) => l.id === 'expectation');
    assert.match(f.text, /1\/6/);
  });
  it('последний кубик у соперника называется, у вас — нет', () => {
    const b = { ...fake().balance, players: [{ seat: 0, id: 'human', dice: 1, isMe: true, style: null }, { seat: 1, id: 'b1', dice: 1, isMe: false, style: null }], lastDice: [0, 1] };
    const l = situationLines(fake({ balance: b }), { names: { b1: 'Олег' } }).find((x) => x.id === 'last_dice');
    assert.match(l.text, /Олег/);
    assert.ok(!/human|Вы\b/.test(l.text));
  });
  it('последствия вариантов', () => {
    const s = sit({ log: bids(['b3', 6, 4]) });
    const lines = situationLines(s, { names: { b1: 'Мария' } });
    assert.match(lines.find((l) => l.id === 'after_dudo').text, /завершит раунд/);
    assert.match(lines.find((l) => l.id === 'after_raise').text, /передаст решение игроку Мария/);
  });
});

describe('гипотезы: число наблюдений и «мало данных»', () => {
  it('каждая гипотеза несёт n; при выборке меньше порога есть «мало данных», иначе нет', () => {
    for (const n of [1, 2, OBS_MIN, OBS_MIN + 2]) {
      const log = Array.from({ length: n }, (_, i) => ({ playerId: 'b1', q: i + 1, f: 4 }));
      const lines = situationLines(sit({ log }));
      const h = lines.find((l) => l.id === 'obs:b1');
      assert.equal(h.type, 'hypothesis');
      assert.equal(h.n, n);
      assert.equal(h.fewData, n < OBS_MIN);
      assert.ok(h.text.includes(`наблюдений: ${n}`));
      assert.equal(h.text.includes('мало данных'), n < OBS_MIN);
      assert.match(h.text, /предположение/);
    }
  });
  it('молчащий соперник — факт, только в подробном виде', () => {
    const s = sit({ log: bids(['b1', 2, 3]) });
    assert.ok(!situationLines(s, { depth: 'short' }).some((l) => l.id.startsWith('silent:')));
    const l = situationLines(s, { depth: 'detailed' }).find((x) => x.id === 'silent:b2');
    assert.equal(l.type, 'fact');
  });
});

describe('измерения: числа есть в документе', () => {
  const doc = fs.readFileSync(path.join(root, 'docs/dev/strategy-evidence.md'), 'utf8');
  /** Строки таблицы раздела N: «| название | число | процент |» → { название: процент }. */
  function sectionRows(n) {
    const start = doc.indexOf(`## ${n}. `);
    assert.ok(start >= 0, `нет раздела ${n}`);
    const next = doc.indexOf('\n## ', start + 3);
    const body = doc.slice(start, next < 0 ? undefined : next);
    const rows = {};
    for (const line of body.split('\n')) {
      const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
      const m = cells.length >= 3 && /^(\d+) %$/.exec(cells[cells.length - 1]);
      if (m) rows[cells[0]] = Number(m[1]);
    }
    return rows;
  }
  it('реестр EVIDENCE совпадает с таблицами docs/dev/strategy-evidence.md', () => {
    for (const [id, ev] of Object.entries(EVIDENCE)) {
      const rows = sectionRows(ev.section);
      for (const [name, value] of Object.entries(ev.rows)) {
        assert.equal(rows[name], value, `${id}: «${name}» в документе ${rows[name]} %, в реестре ${value} %`);
      }
    }
  });
  it('строка с измерением ссылается на запись реестра и называет число из него', () => {
    const lines = situationLines(sit({ log: bids(['b1', 2, 3], ['b2', 5, 3]) }), { depth: 'detailed' });
    const ev = lines.find((l) => l.id === 'jump_evidence');
    assert.ok(ev, 'после прыжка нужна строка с измерением');
    assert.equal(ev.type, 'estimate');
    assert.ok(EVIDENCE[ev.evidence]);
    assert.ok(ev.text.includes(`${EVIDENCE.jump.rows['+2 и больше']} %`));
    assert.ok(ev.text.includes(`${EVIDENCE.jump.rows['+1']} %`));
    assert.match(ev.text, /наших ботов/);
    assert.match(ev.text, /Люди могут ходить иначе/);
  });
  it('без прыжка строки с измерением нет; в кратком виде её нет никогда', () => {
    const calm = situationLines(sit({ log: bids(['b1', 2, 3], ['b2', 3, 3]) }), { depth: 'detailed' });
    assert.ok(!calm.some((l) => l.id === 'jump_evidence'));
    const jump = situationLines(sit({ log: bids(['b1', 2, 3], ['b2', 5, 3]) }), { depth: 'short' });
    assert.ok(!jump.some((l) => l.id === 'jump_evidence'));
  });
  it('любой процент в тексте — либо расчёт (table_read), либо измерение со ссылкой на реестр', () => {
    let seed = 5;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 200; i++) {
      const q = Math.floor(rnd() * 3) + 1;
      const log = bids(['b1', q, 3], ['b2', q + Math.floor(rnd() * 4) + 1, 3 + Math.floor(rnd() * 3)]);
      for (const l of situationLines(sit({ log }), { depth: 'detailed' })) {
        if (!l.text.includes('%')) continue;
        assert.ok(l.id === 'table_read' || (l.evidence && EVIDENCE[l.evidence]), `${l.id}: процент без источника`);
      }
    }
  });
});

describe('запрещённые формулировки', () => {
  it('проверка самого списка: ловит то, что должен', () => {
    for (const bad of ['Он точно блефует', 'всегда ставит', 'это гарантированно так', 'Обязательно проверяйте', 'Вам надо поставить 5×3',
      'Лучше сказать «Не верю»', 'никогда не блефует', 'Верьте ему', 'это наверняка блеф']) {
      assert.ok(BANNED.some((re) => re.test(bad)), bad);
    }
    for (const ok of ['Возможно, эта цифра есть у него', 'не хватает ещё 2', 'Проверка завершит раунд сейчас']) {
      assert.ok(!BANNED.some((re) => re.test(ok)), ok);
    }
  });
  it('в 400 случайных ситуациях ни одна строка не содержит запрещённого', () => {
    let seed = 11;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    for (let i = 0; i < 400; i++) {
      const n = int(2, 5);
      const dice = Array.from({ length: n }, () => int(1, 5));
      const hand = Array.from({ length: dice[0] }, () => int(1, 6));
      const log = [];
      let q = 0;
      for (let k = int(0, 5); k > 0; k--) { q += int(0, 3) + (log.length ? 0 : 1); log.push({ playerId: `b${int(1, n - 1)}`, q: Math.max(q, 1), f: int(1, 6) }); }
      const total = dice.reduce((a, b) => a + b, 0);
      if (log.some((b, k) => k && (b.q < log[k - 1].q)) || q > total) continue;
      const s = describeSituation({
        publicState: { players: dice.map((d, k) => pl(k === 0 ? 'human' : `b${k}`, d)), bid: log.at(-1) ?? null, palifico: rnd() < 0.2 },
        myHand: hand, bidLog: log, meSeat: 0, rules: { startDice: 5 }, probBid: P.probBid, probBidRead: P.probBidRead,
      });
      for (const depth of ['short', 'detailed']) {
        for (const l of situationLines(s, { depth })) {
          for (const re of BANNED) assert.ok(!re.test(l.text), `${l.id}: «${l.text}» совпало с ${re}`);
        }
      }
    }
  });
});

describe('режим «Игра»', () => {
  const s = sit({ log: bids(['b1', 2, 3]) });
  it('до конца партии строк нет', () => {
    assert.equal(beforeMoveLines(s, { mode: AssistMode.GAME }), null);
    assert.equal(beforeMoveLines(s, { mode: AssistMode.GAME, finished: false }), null);
    assert.equal(canExplain({ mode: AssistMode.GAME }), false);
  });
  it('после партии строки есть; «Новичок» и «Тренировка» — всегда', () => {
    assert.ok(Array.isArray(beforeMoveLines(s, { mode: AssistMode.GAME, finished: true })));
    for (const mode of [AssistMode.NOVICE, AssistMode.TRAINING]) assert.ok(Array.isArray(beforeMoveLines(s, { mode })));
    assert.equal(canExplain({ mode: AssistMode.GAME, finished: 'да' }), false);
  });
  it('глубина передаётся', () => {
    const short = beforeMoveLines(s, { mode: AssistMode.TRAINING, depth: 'short' });
    const det = beforeMoveLines(s, { mode: AssistMode.TRAINING, depth: 'detailed' });
    assert.ok(det.length > short.length);
  });
});
