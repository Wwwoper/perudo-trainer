// Шум (ошибки в расчётах) и память (поправка к доверию) в решении бота.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOT_STYLES, BOT_STYLE_IDS, BOT_LEVELS, noiseForLevel, MAX_MEMORY_SHIFT, botDecide } from '../src/bots.js';

// Свои кубики 2-3-4-5-6, всего 10; ставка 3×5 верна с вероятностью ≈ 0,54.
const base = (style, extra = {}) => ({
  hand: [2, 3, 4, 5, 6],
  publicState: { totalDice: 10 },
  bid: { q: 3, f: 5 },
  rules: { wild: true },
  style: BOT_STYLES[style],
  opps: [],
  canCalza: false,
  rng: () => 0.99,                 // без блефа
  ...extra,
});

// ---------- Параметры ----------

test('у каждого стиля есть noise и adapt в диапазоне 0–1', () => {
  for (const id of BOT_STYLE_IDS) {
    const s = BOT_STYLES[id];
    assert.ok(s.noise >= 0 && s.noise <= 0.3, `${id}.noise=${s.noise}`);
    assert.ok(s.adapt >= 0 && s.adapt <= 1, `${id}.adapt=${s.adapt}`);
  }
});

test('«Умный» учитывает память сильнее всех', () => {
  const max = Math.max(...BOT_STYLE_IDS.map((id) => BOT_STYLES[id].adapt));
  assert.equal(BOT_STYLES.smart.adapt, max);
});

test('уровни: лёгкий ошибается чаще обычного, сильный не ошибается', () => {
  assert.ok(noiseForLevel('easy') > noiseForLevel('normal'));
  assert.equal(noiseForLevel('normal'), 1);
  assert.equal(noiseForLevel('hard'), 0);
  assert.equal(noiseForLevel('nope'), 1, 'неизвестный уровень = обычный');
  assert.equal(noiseForLevel(undefined), 1);
  assert.deepEqual(Object.keys(BOT_LEVELS), ['easy', 'normal', 'hard']);
});

// ---------- Шум ----------

test('без noise решение детерминировано и не тратит rng на оценку', () => {
  let calls = 0;
  const rng = () => { calls++; return 0.99; };
  const d = botDecide(base('skeptic', { rng }));
  assert.equal(d.type, 'dudo');
  assert.equal(calls, 0, 'rng не нужен: блефа нет, шума нет');
});

test('шум не выходит за размах стиля: оценка ставки сдвигается не больше чем на noise', () => {
  // ставка ≈ 0,54; у «Скептика» dudoBelow = 0,62, noise = 0,06 → ответ может быть и dudo, и raise,
  // но только если сдвиг достаёт до порога: 0,54 + 0,06 = 0,60 < 0,62 — порог не пересечь никогда.
  for (const r of [0, 0.25, 0.5, 0.75, 0.99]) {
    assert.equal(botDecide(base('skeptic', { noise: 1, rng: () => r })).type, 'dudo', `rng=${r}`);
  }
});

test('большой множитель шума способен перевернуть решение, обычный — нет', () => {
  // «Осторожный»: dudoBelow = 0,45. Вероятность 0,54 → верит. Шум −0,05·mul может опустить ниже порога.
  const down = () => 0;                         // сдвиг = −amp
  assert.notEqual(botDecide(base('careful', { noise: 1, rng: down })).type, 'dudo', 'обычный: 0,54 − 0,05 = 0,49 > 0,45');
  assert.equal(botDecide(base('careful', { noise: 2.5, rng: down })).type, 'dudo', 'лёгкий: 0,54 − 0,125 = 0,415 < 0,45');
});

test('шум случаен: на границе решения у бота бывают оба ответа', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    seen.add(botDecide(base('careful', { noise: 2.5, rng: Math.random })).type);
  }
  assert.ok(seen.has('dudo') && seen.has('raise'), [...seen].join());
});

test('бот не противоречит сам себе: при любом шуме ответ допустим', () => {
  for (let i = 0; i < 300; i++) {
    for (const id of BOT_STYLE_IDS) {
      const d = botDecide(base(id, { noise: 2.5, rng: Math.random }));
      assert.ok(['raise', 'dudo', 'calza'].includes(d.type), `${id}: ${d.type}`);
      if (d.type === 'raise') assert.ok(d.q >= 1 && d.f >= 1 && d.f <= 6);
    }
  }
});

// ---------- Память ----------

test('соперник, который много блефовал, вызывает больше «Не верю»', () => {
  // «Умный»: dudoBelow = 0,50, ставка ≈ 0,54. Без памяти верит, при частом блефе — проверяет.
  assert.notEqual(botDecide(base('smart')).type, 'dudo');
  assert.equal(botDecide(base('smart', { opponent: { bluffRate: 0.7, samples: 20 } })).type, 'dudo');
});

test('честному сопернику верят там, где незнакомому не поверили бы', () => {
  // «Скептик»: dudoBelow = 0,62 → незнакомому не верит; честный (блеф 5%) снижает порог недоверия.
  assert.equal(botDecide(base('skeptic')).type, 'dudo');
  assert.notEqual(botDecide(base('skeptic', { opponent: { bluffRate: 0.0, samples: 40 } })).type, 'dudo');
});

test('память не влияет, если доля блефа равна ожидаемой, или её нет', () => {
  const plain = botDecide(base('smart'));
  assert.deepEqual(botDecide(base('smart', { opponent: { bluffRate: 0.3, samples: 10 } })), plain);
  assert.deepEqual(botDecide(base('smart', { opponent: null })), plain);
  assert.deepEqual(botDecide(base('smart', { opponent: { bluffRate: NaN, samples: 10 } })), plain);
});

test('поправка по памяти ограничена и не зависит от стиля с adapt = 0', () => {
  assert.equal(MAX_MEMORY_SHIFT, 0.25);
  const noAdapt = { ...BOT_STYLES.smart, adapt: 0 };
  const d = botDecide({ ...base('smart'), style: noAdapt, opponent: { bluffRate: 1, samples: 99 } });
  assert.deepEqual(d, botDecide({ ...base('smart'), style: noAdapt }));
});

test('«Агрессор» почти не реагирует на память, «Умный» реагирует', () => {
  const liar = { bluffRate: 0.6, samples: 30 };
  // 0,54 против dudoBelow 0,20: у «Агрессора» сдвиг 0,1·0,3 = 0,03 ничего не меняет
  assert.equal(botDecide(base('aggressor', { opponent: liar })).type, 'raise');
  assert.equal(botDecide(base('smart', { opponent: liar })).type, 'dudo');
});
