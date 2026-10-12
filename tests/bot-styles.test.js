// Стили ботов: набор, раздача по выбору пользователя и различие в поведении.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOT_STYLES, BOT_STYLE_IDS, DEFAULT_STYLE_CYCLE, STYLE_AUTO, STYLE_RANDOM,
  pickBotStyles, botDecide, generateCharacter,
} from '../src/bots.js';

test('у каждого стиля есть id, имя, иконка, описание и пороги в диапазоне 0–1', () => {
  assert.ok(BOT_STYLE_IDS.length >= 5);
  for (const id of BOT_STYLE_IDS) {
    const s = BOT_STYLES[id];
    assert.equal(s.id, id);
    assert.ok(s.name && s.icon && s.desc, `${id}: name/icon/desc`);
    for (const k of ['raiseMin', 'dudoBelow', 'bluff', 'trust']) {
      assert.ok(s[k] >= 0 && s[k] <= 1, `${id}.${k}=${s[k]}`);
    }
    assert.equal(typeof s.calza, 'boolean');
  }
});

test('имена и иконки стилей не повторяются (иначе их не отличить за столом)', () => {
  const names = BOT_STYLE_IDS.map((id) => BOT_STYLES[id].name);
  const icons = BOT_STYLE_IDS.map((id) => BOT_STYLES[id].icon);
  assert.equal(new Set(names).size, names.length);
  assert.equal(new Set(icons).size, icons.length);
});

test('Calza умеет только «Умный»', () => {
  assert.deepEqual(BOT_STYLE_IDS.filter((id) => BOT_STYLES[id].calza), ['smart']);
});

// ---------- pickBotStyles ----------

test('pickBotStyles: без выбора — три базовых стиля по кругу, как раньше', () => {
  assert.deepEqual(pickBotStyles(5), ['careful', 'bluffer', 'smart', 'careful', 'bluffer']);
  assert.deepEqual(pickBotStyles(2, [STYLE_AUTO, STYLE_AUTO]), ['careful', 'bluffer']);
  assert.deepEqual(DEFAULT_STYLE_CYCLE, ['careful', 'bluffer', 'smart']);
});

test('pickBotStyles: явный выбор уважается, остальные — по умолчанию', () => {
  assert.deepEqual(pickBotStyles(3, ['skeptic', STYLE_AUTO, 'aggressor']), ['skeptic', 'bluffer', 'aggressor']);
  assert.deepEqual(pickBotStyles(5, Array(5).fill('skeptic')), Array(5).fill('skeptic'));
});

test('pickBotStyles: «случайный» берёт стиль из всех, включая новые', () => {
  assert.deepEqual(pickBotStyles(1, [STYLE_RANDOM], () => 0), [BOT_STYLE_IDS[0]]);
  assert.deepEqual(pickBotStyles(1, [STYLE_RANDOM], () => 0.999), [BOT_STYLE_IDS.at(-1)]);
  const seen = new Set();
  for (let i = 0; i < 300; i++) seen.add(pickBotStyles(1, [STYLE_RANDOM])[0]);
  assert.deepEqual([...seen].sort(), [...BOT_STYLE_IDS].sort());
});

test('pickBotStyles: незнакомые и пустые значения не ломают раздачу', () => {
  assert.deepEqual(pickBotStyles(3, ['nope', null, undefined]), ['careful', 'bluffer', 'smart']);
  assert.deepEqual(pickBotStyles(0, ['smart']), []);
  assert.equal(pickBotStyles(4, ['smart']).length, 4, 'длина всегда равна числу ботов');
});

test('generateCharacter: «random» выбирает из всех стилей, явный id сохраняется', () => {
  for (const id of BOT_STYLE_IDS) assert.equal(generateCharacter(id).style, id);
  const seen = new Set();
  for (let i = 0; i < 300; i++) seen.add(generateCharacter('random').style);
  assert.deepEqual([...seen].sort(), [...BOT_STYLE_IDS].sort());
});

// ---------- Поведение ----------

// Ваши кубики 2-3-4-5-6, всего 10; ставка 3×5 верна примерно в 54% случаев.
const situation = (style) => ({
  hand: [2, 3, 4, 5, 6],
  publicState: { totalDice: 10 },
  bid: { q: 3, f: 5 },
  rules: { wild: true },
  style: BOT_STYLES[style],
  opps: [],
  canCalza: false,
  rng: () => 0.99,          // без блефа: решение зависит только от порогов
});

test('Скептик проверяет ставку, которую Агрессор повышает', () => {
  assert.equal(botDecide(situation('skeptic')).type, 'dudo');
  assert.equal(botDecide(situation('aggressor')).type, 'raise');
});

test('Осторожный на этой ставке не сомневается, а Скептик сомневается', () => {
  assert.notEqual(botDecide(situation('careful')).type, 'dudo');
  assert.equal(botDecide(situation('skeptic')).type, 'dudo');
});

test('любой стиль выдаёт допустимое решение на первой ставке и на ответе', () => {
  for (const id of BOT_STYLE_IDS) {
    const first = botDecide({ ...situation(id), bid: null });
    assert.equal(first.type, 'raise', `${id}: первая ставка`);
    assert.ok(first.q >= 1 && first.f >= 2, `${id}: первая ставка не на единицы`);
    const reply = botDecide(situation(id));
    assert.ok(['raise', 'dudo'].includes(reply.type), `${id}: ${reply.type}`);
  }
});
