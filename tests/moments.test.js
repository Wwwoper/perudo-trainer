// moments.test.js — ключевые моменты партии: метки, режим, отбор, безопасное чтение.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  decisionTags, buildMoment, sanitizeMoment, normalizeMoments, appendMoments,
  momentMode, isReplayable, toQueueItem, scoreMoment, pickKeyMoments, weakestTag, isSameSituation, isQueued, addToQueue, TAG_LABELS, MOMENT_TAGS,
  MAX_MOMENTS, KEY_MOMENTS_PER_GAME,
} from '../src/moments.js';

/** Момент-проверка по умолчанию; поля меняются через extra. */
const mk = (id, extra = {}) => ({
  id, ts: 1000, round: 1, kind: 'dudo', n: 14, h: [1, 3, 5, 5, 6], myDice: 5,
  bid: { q: 7, f: 5 }, played: null, wild: true, p: 0.7, code: 'bad', lostDie: false, tags: ['dudo'],
  ...extra,
});

describe('decisionTags', () => {
  it('тип решения', () => {
    assert.deepEqual(decisionTags({ kind: 'dudo', total: 14, myDice: 5, face: 4 }), ['dudo']);
    assert.deepEqual(decisionTags({ kind: 'raise', total: 14, myDice: 5, face: 4 }), ['raise']);
    assert.deepEqual(decisionTags({ kind: 'calza', total: 14, myDice: 5, face: 4 }), ['calza']);
  });
  it('эндшпиль, последний кубик, Палифико, единицы, большой стол', () => {
    assert.deepEqual(decisionTags({ kind: 'dudo', total: 6, myDice: 1, face: 1, palifico: true }),
      ['dudo', 'endgame', 'lastDie', 'palifico', 'ones']);
    assert.deepEqual(decisionTags({ kind: 'raise', total: 25, myDice: 5, face: 2 }), ['raise', 'bigTable']);
  });
  it('границы: 6 — эндшпиль, 7 — нет; 24 — не большой стол, 25 — большой', () => {
    assert.ok(decisionTags({ kind: 'dudo', total: 6, myDice: 3 }).includes('endgame'));
    assert.ok(!decisionTags({ kind: 'dudo', total: 7, myDice: 3 }).includes('endgame'));
    assert.ok(!decisionTags({ kind: 'dudo', total: 24, myDice: 5 }).includes('bigTable'));
    assert.ok(decisionTags({ kind: 'dudo', total: 25, myDice: 5 }).includes('bigTable'));
  });
  it('неизвестный тип не попадает в метки', () => {
    assert.deepEqual(decisionTags({ kind: 'странный', total: 10, myDice: 5 }), []);
  });
});

describe('buildMoment', () => {
  it('собирает проверку ставки соперника', () => {
    const m = buildMoment({ id: 'g1-3', ts: 5, round: 3, kind: 'dudo', total: 12, hand: [2, 2, 6],
      bid: { q: 6, f: 1 }, p: 0.62, code: 'bad', lostDie: true });
    assert.equal(m.n, 12);
    assert.equal(m.myDice, 3);
    assert.equal(m.wild, true);
    assert.equal(m.played, null);
    assert.deepEqual(m.tags, ['dudo', 'ones']);       // «единицы» — по ставке соперника
    assert.equal(m.lostDie, true);
  });
  it('собирает повышение: метка «единицы» — по вашей ставке', () => {
    const m = buildMoment({ id: 'x', ts: 5, round: 1, kind: 'raise', total: 10, hand: [1, 1, 4],
      bid: { q: 4, f: 3 }, played: { q: 3, f: 1 }, p: 0.8, code: 'good' });
    assert.deepEqual(m.tags, ['raise', 'ones']);
    assert.deepEqual(m.played, { q: 3, f: 1 });
  });
  it('первое повышение в раунде: ставки соперника нет', () => {
    const m = buildMoment({ id: 'o', ts: 5, round: 1, kind: 'raise', total: 10, hand: [4, 4],
      played: { q: 3, f: 4 }, p: 0.6, code: 'good' });
    assert.equal(m.bid, null);
  });
  it('Палифико: единицы не джокеры', () => {
    const m = buildMoment({ id: 'p', ts: 5, round: 1, kind: 'dudo', total: 5, hand: [3],
      bid: { q: 2, f: 3 }, palifico: true, p: 0.3, code: 'good' });
    assert.equal(m.wild, false);
    assert.deepEqual(m.tags, ['dudo', 'endgame', 'lastDie', 'palifico']);
  });
  it('непригодные данные дают null', () => {
    assert.equal(buildMoment({ id: 'a', ts: 1, round: 1, kind: 'dudo', total: 10, hand: [1], bid: null, p: 0.5, code: 'good' }), null);
    assert.equal(buildMoment({ id: 'a', ts: 1, round: 1, kind: 'dudo', total: 10, hand: [7], bid: { q: 3, f: 2 }, p: 0.5, code: 'good' }), null);
    assert.equal(buildMoment({ id: 'a', ts: 1, round: 1, kind: 'dudo', total: 10, hand: [1], bid: { q: 3, f: 2 }, p: 1.5, code: 'good' }), null);
  });
});

describe('sanitizeMoment', () => {
  it('принимает корректный момент и возвращает копию', () => {
    const src = mk('a');
    const m = sanitizeMoment(src);
    assert.deepEqual(m, { ...src, ctx: null });      // контекст стола необязателен: в старых записях его нет
    assert.notEqual(m.h, src.h);
  });
  it('лишние поля отбрасываются, неизвестные метки тоже', () => {
    const m = sanitizeMoment({ ...mk('a'), hack: '<img onerror=x>', tags: ['dudo', 'нет-такой', 'endgame'] });
    assert.equal('hack' in m, false);
    assert.deepEqual(m.tags, ['dudo', 'endgame']);
  });
  it('числовой id приводится к строке', () => {
    assert.equal(sanitizeMoment({ ...mk('x'), id: 42 }).id, '42');
  });
  it('отклоняет плохие поля', () => {
    const bads = [
      null, 5, 'x', [], {},
      { ...mk('a'), id: '' }, { ...mk('a'), id: 'x'.repeat(65) },
      { ...mk('a'), ts: 'вчера' }, { ...mk('a'), ts: Infinity },
      { ...mk('a'), round: -1 }, { ...mk('a'), round: 1.5 },
      { ...mk('a'), kind: 'fold' },
      { ...mk('a'), n: 0 }, { ...mk('a'), n: 101 },
      { ...mk('a'), h: [7] }, { ...mk('a'), h: 'abc' }, { ...mk('a'), h: Array(11).fill(1) },
      { ...mk('a'), myDice: -1 },
      { ...mk('a'), wild: 'да' },
      { ...mk('a'), p: 2 }, { ...mk('a'), p: NaN }, { ...mk('a'), p: '0.5' },
      { ...mk('a'), code: 'terrible' },
      { ...mk('a'), bid: { q: 0, f: 3 } }, { ...mk('a'), bid: { q: 3, f: 7 } }, { ...mk('a'), bid: 'x' },
      { ...mk('a'), kind: 'raise', played: null },              // повышение без ставки
      { ...mk('a'), played: { q: 3, f: 2 } },                   // проверка с «своей ставкой»
      { ...mk('a'), bid: null },                                // проверять нечего
    ];
    for (const b of bads) assert.equal(sanitizeMoment(b), null, JSON.stringify(b));
  });
  it('lostDie: только true считается потерей кубика', () => {
    assert.equal(sanitizeMoment({ ...mk('a'), lostDie: 'yes' }).lostDie, false);
    assert.equal(sanitizeMoment({ ...mk('a'), lostDie: true }).lostDie, true);
  });
  it('первое повышение в раунде допустимо (bid: null)', () => {
    const m = sanitizeMoment({ ...mk('a'), kind: 'raise', bid: null, played: { q: 3, f: 4 } });
    assert.equal(m.bid, null);
  });
});

describe('normalizeMoments / appendMoments', () => {
  it('не массив — пустой список', () => {
    for (const v of [null, undefined, {}, 'x', 5]) assert.deepEqual(normalizeMoments(v), []);
  });
  it('мусор отбрасывается, порядок сохраняется', () => {
    const r = normalizeMoments([mk('a'), 1, null, { id: 'zz' }, mk('b')]);
    assert.deepEqual(r.map((m) => m.id), ['a', 'b']);
  });
  it('повтор по id: остаётся последняя запись и уходит в конец', () => {
    const r = normalizeMoments([mk('a', { p: 0.6 }), mk('b'), mk('a', { p: 0.9 })]);
    assert.deepEqual(r.map((m) => m.id), ['b', 'a']);
    assert.equal(r[1].p, 0.9);
  });
  it('лимит: остаются самые новые', () => {
    const many = Array.from({ length: MAX_MOMENTS + 10 }, (_, i) => mk(`m${i}`));
    const r = normalizeMoments(many);
    assert.equal(r.length, MAX_MOMENTS);
    assert.equal(r[0].id, 'm10');
    assert.equal(r[r.length - 1].id, `m${MAX_MOMENTS + 9}`);
  });
  it('свой лимит', () => {
    assert.equal(normalizeMoments([mk('a'), mk('b'), mk('c')], 2).length, 2);
  });
  it('appendMoments: добавляет к сохранённым и вытесняет старые', () => {
    const existing = Array.from({ length: MAX_MOMENTS }, (_, i) => mk(`o${i}`));
    const r = appendMoments(existing, [mk('n1'), mk('n2')]);
    assert.equal(r.length, MAX_MOMENTS);
    assert.deepEqual(r.slice(-2).map((m) => m.id), ['n1', 'n2']);
    assert.equal(r[0].id, 'o2');
  });
  it('appendMoments: некорректные аргументы не падают', () => {
    assert.deepEqual(appendMoments(null, null), []);
    assert.deepEqual(appendMoments('x', [mk('a')]).map((m) => m.id), ['a']);
  });
});

describe('momentMode', () => {
  it('Палифико важнее всего остального', () => {
    assert.equal(momentMode(mk('a', { wild: false, n: 3, myDice: 1 })), 'nowild');
  });
  it('эндшпиль: на столе не больше 6', () => {
    assert.equal(momentMode(mk('a', { n: 6, myDice: 3 })), 'endgame');
    assert.equal(momentMode(mk('a', { n: 3, myDice: 1 })), 'endgame');
  });
  it('мало кубиков у вас: 1–2 при большем столе', () => {
    assert.equal(momentMode(mk('a', { n: 12, myDice: 2 })), 'solo');
    assert.equal(momentMode(mk('a', { n: 12, myDice: 1 })), 'solo');
  });
  it('большой стол: 25 и больше', () => {
    assert.equal(momentMode(mk('a', { n: 25, myDice: 5 })), 'big');
    assert.equal(momentMode(mk('a', { n: 24, myDice: 5 })), 'classic');
  });
  it('обычная ситуация — классика', () => {
    assert.equal(momentMode(mk('a')), 'classic');
  });
  it('у большого стола с 1–2 кубиками у вас приоритет у «мало кубиков»', () => {
    assert.equal(momentMode(mk('a', { n: 30, myDice: 2 })), 'solo');
  });
});

describe('isReplayable / toQueueItem', () => {
  it('проверка ставки переносится в формат очереди тренажёра', () => {
    const item = toQueueItem(mk('a'));
    assert.deepEqual(item, { mode: 'classic', n: 14, h: [1, 3, 5, 5, 6], f: 5, q: 7, streak: 0 });
  });
  it('копия кубиков, а не ссылка', () => {
    const m = mk('a');
    const item = toQueueItem(m);
    item.h.push(2);
    assert.equal(m.h.length, 5);
  });
  it('повышение тоже переносится: оценивается ставка соперника, перед которой был ход', () => {
    const m = mk('a', { kind: 'raise', played: { q: 8, f: 5 } });
    assert.deepEqual(toQueueItem(m), { mode: 'classic', n: 14, h: [1, 3, 5, 5, 6], f: 5, q: 7, streak: 0 });
  });
  it('без ставки соперника перенести нельзя', () => {
    const m = mk('a', { kind: 'raise', bid: null, played: { q: 3, f: 4 } });
    assert.equal(isReplayable(m), false);
    assert.equal(toQueueItem(m), null);
  });
  it('ставка больше числа кубиков на столе не переносится', () => {
    assert.equal(toQueueItem(mk('a', { n: 5, bid: { q: 9, f: 2 } })), null);
  });
  it('null и пустая рука', () => {
    assert.equal(isReplayable(null), false);
    assert.equal(isReplayable(mk('a', { h: [] })), false);
  });
});

describe('scoreMoment', () => {
  it('верное решение — 0, даже если потеряли кубик (это случайность)', () => {
    assert.equal(scoreMoment(mk('a', { code: 'good', lostDie: true })), 0);
  });
  it('ошибка важнее спорного решения', () => {
    assert.ok(scoreMoment(mk('a', { code: 'bad' })) > scoreMoment(mk('b', { code: 'meh' })));
  });
  it('малое число кубиков делает момент важнее', () => {
    const base = scoreMoment(mk('a'));
    assert.ok(scoreMoment(mk('b', { n: 6 })) > base);
    assert.ok(scoreMoment(mk('c', { myDice: 1, h: [3] })) > base);
    assert.ok(scoreMoment(mk('d', { wild: false })) > base);
  });
  it('потеря кубика после ошибки повышает важность', () => {
    assert.ok(scoreMoment(mk('a', { lostDie: true })) > scoreMoment(mk('b', { lostDie: false })));
  });
  it('чем дальше шанс от 50 %, тем выше', () => {
    assert.ok(scoreMoment(mk('a', { p: 0.9 })) > scoreMoment(mk('b', { p: 0.6 })));
  });
});

describe('pickKeyMoments', () => {
  it('верные решения не попадают в отбор', () => {
    assert.deepEqual(pickKeyMoments([mk('a', { code: 'good' }), mk('b', { code: 'good' })]), []);
  });
  it('не больше трёх, от важного к менее важному', () => {
    const list = [
      mk('meh1', { code: 'meh', round: 1 }),
      mk('bad1', { code: 'bad', round: 2 }),
      mk('bad-end', { code: 'bad', round: 3, n: 4 }),
      mk('bad-lost', { code: 'bad', round: 4, lostDie: true }),
      mk('meh2', { code: 'meh', round: 5 }),
    ];
    const r = pickKeyMoments(list);
    assert.equal(r.length, KEY_MOMENTS_PER_GAME);
    assert.equal(r[0].id, 'bad-end');
    const ids = r.map((m) => m.id);
    assert.ok(!ids.includes('meh1') && !ids.includes('meh2'));
  });
  it('равная важность: сначала более ранний раунд, порядок стабилен', () => {
    const r = pickKeyMoments([mk('late', { round: 5 }), mk('early', { round: 2 }), mk('mid', { round: 3 })], 2);
    assert.deepEqual(r.map((m) => m.id), ['early', 'mid']);
  });
  it('свой лимит, ноль и отрицательный лимит', () => {
    const list = [mk('a'), mk('b', { round: 2 })];
    assert.equal(pickKeyMoments(list, 1).length, 1);
    assert.equal(pickKeyMoments(list, 0).length, 0);
    assert.equal(pickKeyMoments(list, -3).length, 0);
  });
  it('пустой и некорректный вход', () => {
    assert.deepEqual(pickKeyMoments([]), []);
    assert.deepEqual(pickKeyMoments(null), []);
    assert.deepEqual(pickKeyMoments([1, null, {}]), []);
  });
  it('повторы по id схлопываются', () => {
    assert.equal(pickKeyMoments([mk('a'), mk('a')]).length, 1);
  });
  it('исходный список не меняется', () => {
    const list = [mk('b', { round: 2 }), mk('a', { round: 1 })];
    const copy = JSON.stringify(list);
    pickKeyMoments(list);
    assert.equal(JSON.stringify(list), copy);
  });
});

describe('weakestTag', () => {
  const d = (code, tags) => mk('x', { code, tags });

  it('нет решений или нет ошибок — null', () => {
    assert.equal(weakestTag([]), null);
    assert.equal(weakestTag(null), null);
    assert.equal(weakestTag([d('good', ['dudo', 'endgame'])]), null);
  });
  it('особые ситуации важнее типа решения', () => {
    const r = weakestTag([
      d('bad', ['dudo']), d('bad', ['dudo']), d('bad', ['dudo']),      // «проверки» — три ошибки
      d('bad', ['raise', 'endgame']),                                   // эндшпиль — одна
    ]);
    assert.equal(r.tag, 'endgame');
    assert.deepEqual([r.errors, r.total], [1, 1]);
    assert.equal(r.label, TAG_LABELS.endgame);
  });
  it('нет ошибок в особых ситуациях — берётся тип решения', () => {
    const r = weakestTag([d('bad', ['dudo']), d('good', ['raise', 'endgame'])]);
    assert.equal(r.tag, 'dudo');
  });
  it('«спорно» тоже считается ошибкой', () => {
    assert.equal(weakestTag([d('meh', ['raise', 'ones'])]).tag, 'ones');
  });
  it('по числу ошибок, при равенстве — по доле', () => {
    const r = weakestTag([
      d('bad', ['dudo', 'endgame']), d('good', ['dudo', 'endgame']),    // эндшпиль: 1 из 2
      d('bad', ['raise', 'lastDie']),                                    // последний кубик: 1 из 1
    ]);
    assert.equal(r.tag, 'lastDie');
  });
  it('мусор в списке пропускается, неизвестные метки игнорируются', () => {
    const r = weakestTag([null, 5, { code: 'bad' }, { code: 'bad', tags: 'x' }, d('bad', ['чужая', 'palifico'])]);
    assert.equal(r.tag, 'palifico');
  });
  it('у каждой метки есть название', () => {
    for (const t of MOMENT_TAGS) assert.ok(TAG_LABELS[t], t);
  });
});

describe('addToQueue / isQueued: очередь повторов без дублей', () => {
  const a = { mode: 'classic', n: 14, h: [1, 3, 5], f: 5, q: 7, streak: 0 };
  const b = { ...a, q: 8 };
  it('новая ситуация добавляется, исходная очередь не меняется', () => {
    const q0 = [];
    const r = addToQueue(q0, a);
    assert.equal(r.added, true);
    assert.deepEqual(r.queue, [a]);
    assert.equal(q0.length, 0);
  });
  it('та же ситуация второй раз не добавляется, даже если у записи в очереди другой streak', () => {
    const r = addToQueue([{ ...a, streak: 2 }], { ...a });
    assert.equal(r.added, false);
    assert.equal(r.queue.length, 1);
    assert.equal(r.queue[0].streak, 2);              // запись, накопившая успехи, не сбрасывается
  });
  it('несколько разных моментов подряд попадают в очередь все, ни один не теряется', () => {
    let q = [];
    for (const it of [a, b, { ...a, f: 2 }]) q = addToQueue(q, it).queue;
    assert.equal(q.length, 3);
  });
  it('кубики копируются, streak у новой записи ноль', () => {
    const item = { ...a, streak: 5 };
    const { queue } = addToQueue([], item);
    queue[0].h.push(6);
    assert.equal(item.h.length, 3);
    assert.equal(queue[0].streak, 0);
  });
  it('мусор вместо очереди или ситуации не ломает', () => {
    assert.deepEqual(addToQueue(null, a).queue, [a]);
    assert.equal(addToQueue([a], null).added, false);
    assert.equal(isQueued(undefined, a), false);
    assert.equal(isQueued([a], b), false);
    assert.equal(isQueued([a], { ...a }), true);
  });
});

describe('isSameSituation', () => {
  const a = { mode: 'classic', n: 14, h: [1, 3, 5], f: 5, q: 7 };
  it('одинаковые ситуации', () => assert.equal(isSameSituation(a, { ...a, h: [1, 3, 5], streak: 1 }), true));
  it('отличается любое поле', () => {
    for (const diff of [{ mode: 'big' }, { n: 15 }, { q: 8 }, { f: 4 }, { h: [1, 3, 6] }, { h: [1, 3] }]) {
      assert.equal(isSameSituation(a, { ...a, ...diff }), false, JSON.stringify(diff));
    }
  });
  it('null и неполные записи', () => {
    assert.equal(isSameSituation(a, null), false);
    assert.equal(isSameSituation(null, a), false);
    assert.equal(isSameSituation(a, { mode: 'classic' }), false);
  });
});
