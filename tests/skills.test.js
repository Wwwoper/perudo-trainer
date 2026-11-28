// skills.test.js — уровни навыков, выводы и динамика для «Результатов».
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  skillLevel, skillVerdict, skillCards, groupCards, quizTrend, quizTrendText, winTrend,
  MIN_DECISIONS, SERIES_TAG, LEVEL_LABELS, LEVELS,
} from '../src/skills.js';
import { QUIZ_BASELINE } from '../src/quiz_stats.js';

describe('skillLevel', () => {
  it('меньше минимума решений — «мало данных», доля известна, но вывода нет', () => {
    const r = skillLevel(6, MIN_DECISIONS - 1);
    assert.equal(r.level, 'few');
    assert.equal(r.prelim, false);
    assert.ok(Math.abs(r.share - 6 / 7) < 1e-9);
  });
  it('мусор вместо счётчиков — «мало данных» без доли', () => {
    for (const [g, n] of [[NaN, 10], [5, -1], [5.5, 10], [11, 10], ['3', '4'], [null, null]]) {
      assert.deepEqual(skillLevel(g, n), { level: 'few', share: null, prelim: false }, `${g}/${n}`);
    }
  });
  it('границы: 50 — нестабильно, 65 — получается, 80 — освоено (при 50+ решений)', () => {
    assert.equal(skillLevel(49, 100).level, 'weak');
    assert.equal(skillLevel(50, 100).level, 'shaky');
    assert.equal(skillLevel(64, 100).level, 'shaky');
    assert.equal(skillLevel(65, 100).level, 'good');
    assert.equal(skillLevel(79, 100).level, 'good');
    assert.equal(skillLevel(80, 100).level, 'mastered');
    assert.equal(skillLevel(100, 100).level, 'mastered');
  });
  it('«освоено» требует 50 решений: при меньшем числе — «получается»', () => {
    assert.equal(skillLevel(49, 49).level, 'good');
    assert.equal(skillLevel(50, 50).level, 'mastered');
  });
  it('«предварительно» при 8–19 решениях и не позже', () => {
    assert.equal(skillLevel(6, 8).prelim, true);
    assert.equal(skillLevel(15, 19).prelim, true);
    assert.equal(skillLevel(16, 20).prelim, false);
  });
  it('тема викторины: ниже догадки — слабо, дальше по доле пути до идеала', () => {
    const b = QUIZ_BASELINE.quizLast;   // 0.55
    assert.equal(skillLevel(Math.floor(b * 100) - 1, 100, { baseline: b }).level, 'weak');
    assert.equal(skillLevel(Math.ceil(b * 100), 100, { baseline: b }).level, 'shaky');
    assert.equal(skillLevel(75, 100, { baseline: b }).level, 'good');       // (0.75-0.55)/0.45 ≈ 0.44
    assert.equal(skillLevel(87, 100, { baseline: b }).level, 'mastered');   // ≈ 0.71
    assert.equal(skillLevel(35, 40, { baseline: b }).level, 'good');        // 87,5 %, но выборка мала для «освоено»
  });
});

describe('skillVerdict', () => {
  it('у каждого уровня есть текст; «мало данных» называет число; предварительный результат помечен', () => {
    for (const level of LEVELS) assert.ok(skillVerdict({ level, n: 3, prelim: false }).length > 10, level);
    assert.match(skillVerdict({ level: 'few', n: 5 }), /хотя бы 8 решений, сейчас 5/);
    assert.match(skillVerdict({ level: 'good', n: 10, prelim: true }), /предварительный/);
    assert.doesNotMatch(skillVerdict({ level: 'good', n: 100, prelim: false }), /предварительный/);
    assert.match(skillVerdict({ level: 'weak', n: 30, quiz: true }), /постоянно|одно и то же/);
  });
});

describe('quizTrend', () => {
  const q = (correct, total) => ({ correct, total, points: 0, max: 0, guess: 0 });
  it('нет последней серии — null', () => {
    for (const s of [undefined, {}, { quizLast: q(3, 0) }, { quizLast: q(5, 4) }, { quizLast: 'x' }]) assert.equal(quizTrend(s), null);
  });
  it('одна серия: тренда нет', () => {
    const t = quizTrend({ quizLast: q(14, 20) });
    assert.equal(t.prev, null);
    assert.equal(t.trend, null);
    assert.equal(quizTrendText(t), '');
  });
  it('лучше, хуже и как раньше сравниваются по доле, а не по числу', () => {
    assert.equal(quizTrend({ quizLast: q(14, 20), quizPrev: q(9, 20) }).trend, 'up');
    assert.equal(quizTrend({ quizLast: q(9, 20), quizPrev: q(14, 20) }).trend, 'down');
    assert.equal(quizTrend({ quizLast: q(7, 10), quizPrev: q(14, 20) }).trend, 'same');
    assert.equal(quizTrendText(quizTrend({ quizLast: q(14, 20), quizPrev: q(9, 20) })), 'Лучше прошлой серии: было 9 из 20');
  });
  it('повреждённая прошлая серия игнорируется', () => {
    assert.equal(quizTrend({ quizLast: q(14, 20), quizPrev: q(30, 20) }).prev, null);
  });
});

describe('winTrend', () => {
  const games = (flags) => flags.map((won, i) => ({ ts: i, won }));
  const rep = (v, n) => Array(n).fill(v);
  it('меньше двух окон по 10 партий — нет тренда', () => {
    assert.equal(winTrend(games(rep(true, 19))), null);
    assert.equal(winTrend(undefined), null);
    assert.equal(winTrend([]), null);
  });
  it('20 партий: сравниваются две десятки', () => {
    const t = winTrend(games([...rep(false, 10), ...rep(true, 10)]));
    assert.deepEqual([t.window, t.last, t.prev, t.trend], [10, 1, 0, 'up']);
  });
  it('окно не больше 20: сравниваются последние 20 и предыдущие 20', () => {
    const t = winTrend(games([...rep(true, 50), ...rep(false, 20), ...rep(true, 20)]));
    assert.equal(t.window, 20);
    assert.equal(t.last, 1);
    assert.equal(t.prev, 0);
  });
  it('изменение меньше 5 пунктов — «как раньше», больше — вверх или вниз', () => {
    const same = winTrend(games([...rep(true, 4), ...rep(false, 6), ...rep(true, 4), ...rep(false, 6)]));
    assert.equal(same.trend, 'same');
    const down = winTrend(games([...rep(true, 10), ...rep(false, 10)]));
    assert.equal(down.trend, 'down');
  });
  it('записи без поля won пропускаются', () => {
    assert.equal(winTrend([...games(rep(true, 10)), { ts: 1 }, null, 5]), null);
  });
});

describe('skillCards', () => {
  const stats = {
    byTag: {
      dudo: { n: 412, good: 338 },      // 82 % освоено
      raise: { n: 371, good: 263 },     // 71 % получается
      endgame: { n: 74, good: 42 },     // 57 % нестабильно
      palifico: { n: 63, good: 30 },    // 48 % нужно поработать
      lastDie: { n: 52, good: 21 },     // 40 %
      calza: { n: 5, good: 3 },         // мало данных
      ladder: { n: 3, good: 1 },
      unknown: { n: 99, good: 99 },     // неизвестные метки пропускаются
      bigTable: { n: 10, good: 20 },    // повреждено
    },
    quizLast: { correct: 14, total: 20, points: 38, max: 60, guess: 6 },
    quizPrev: { correct: 9, total: 20, points: 21, max: 60, guess: 6 },
  };
  const cards = skillCards(stats);
  const by = (tag) => cards.find((c) => c.tag === tag);

  it('только известные и целые темы; серия викторины добавлена', () => {
    assert.deepEqual(cards.map((c) => c.tag).sort(), ['calza', 'dudo', 'endgame', 'ladder', 'lastDie', 'palifico', 'quizSeries', 'raise'].sort());
  });
  it('уровни и названия с заглавной буквы', () => {
    assert.equal(by('dudo').level, 'mastered');
    assert.equal(by('raise').level, 'good');
    assert.equal(by('endgame').level, 'shaky');
    assert.equal(by('palifico').level, 'weak');
    assert.equal(by('calza').level, 'few');
    assert.equal(by('dudo').label, 'Проверки ставок');
    assert.equal(by('lastDie').label, 'Игра на последнем кубике');
  });
  it('режим тренировки есть у тем, где он определён', () => {
    assert.equal(by('lastDie').mode, 'solo');
    assert.equal(by('palifico').mode, 'nowild');
    assert.equal(by('dudo').mode, null);
  });
  it('серия викторины: уровень, вывод и динамика', () => {
    const s = by(SERIES_TAG);
    assert.equal(s.n, 20);
    assert.equal(s.good, 14);
    assert.equal(s.trend, 'Лучше прошлой серии: было 9 из 20');
    assert.equal(s.mode, 'quiz');
    assert.equal(s.prelim, false);
  });
  it('порядок: освоено, получается, нестабильно, слабо, мало данных; внутри — по доле', () => {
    const tags = cards.map((c) => c.tag);
    assert.ok(tags.indexOf('dudo') < tags.indexOf('raise'));
    assert.ok(tags.indexOf('raise') < tags.indexOf('endgame'));
    assert.ok(tags.indexOf('endgame') < tags.indexOf('palifico'));
    assert.ok(tags.indexOf('lastDie') < tags.indexOf('palifico'), 'слабые — от худших');
    assert.ok(tags.indexOf('palifico') < tags.indexOf('calza'));
    assert.ok(tags.indexOf('calza') < tags.indexOf('ladder'), '«мало данных» — от самых изученных');
  });
  it('пустой и мусорный профиль — пусто', () => {
    for (const v of [undefined, null, {}, [], 5, { byTag: [] }, { byTag: 5 }]) assert.deepEqual(skillCards(v), []);
  });
  it('исходный профиль не меняется', () => {
    const copy = JSON.stringify(stats);
    skillCards(stats);
    assert.equal(JSON.stringify(stats), copy);
  });
});

describe('groupCards', () => {
  it('освоено входит в «Получается», пустые группы скрыты, порядок групп фиксирован', () => {
    const mk = (tag, level) => ({ tag, level });
    const g = groupCards([mk('a', 'mastered'), mk('b', 'good'), mk('c', 'weak'), mk('d', 'few')]);
    assert.deepEqual(g.map((x) => x.group), ['good', 'weak', 'few']);
    assert.deepEqual(g[0].cards.map((c) => c.tag), ['a', 'b']);
    assert.equal(g[0].label, LEVEL_LABELS.good);
  });
  it('нет карточек — нет групп', () => {
    assert.deepEqual(groupCards([]), []);
  });
});
