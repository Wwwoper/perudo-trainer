// trainer_feedback.test.js — плашка, соседние повышения и легенда разбора ответа.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { plainChance, plaqueModel, raiseNeighbours, legendItems, optionRow, allOptionRows, FEEDBACK_NOTE } from '../src/trainer_feedback.js';

describe('plainChance', () => {
  it('целые проценты, как их видит игрок', () => {
    assert.equal(plainChance(0.45), '45 %');
    assert.equal(plainChance(0.504), '50 %');
    assert.equal(plainChance(0.505), '51 %');
  });
  it('крайние значения', () => {
    assert.equal(plainChance(0), '<1 %');
    assert.equal(plainChance(0.004), '<1 %');
    assert.equal(plainChance(0.005), '1 %');
    assert.equal(plainChance(0.996), '>99 %');
    assert.equal(plainChance(1), '>99 %');
  });
  it('не число — ошибка, а не «NaN %»', () => assert.throws(() => plainChance(NaN), TypeError));
});

describe('plaqueModel', () => {
  it('хорошее решение: повышение', () => {
    const m = plaqueModel({ kind: 'raise', good: true, chance: 0.62, threshold: 0.5 });
    assert.deepEqual(m, { tone: 'good', title: 'Хорошее решение', line: 'Шанс вашей ставки — 62 % при пороге 50 %.', extra: '' });
  });
  it('сомнительное решение: «Не верю»', () => {
    const m = plaqueModel({ kind: 'dudo', good: false, chance: 0.2, threshold: 0.55 });
    assert.equal(m.tone, 'bad');
    assert.equal(m.title, 'Сомнительное решение');
    assert.equal(m.line, 'Шанс, что «Не верю» сработает, — 20 % при пороге 55 %.');
  });
  it('нет хода, проходящего порог: поясняющая строка берётся из переданного текста', () => {
    assert.equal(plaqueModel({ kind: 'raise', good: true, noGoodMove: true, chance: 0.3, threshold: 0.9, noGoodNote: 'Ни один ход.' }).extra, 'Ни один ход.');
    assert.equal(plaqueModel({ kind: 'raise', good: true, noGoodMove: false, chance: 0.95, threshold: 0.9, noGoodNote: 'Ни один ход.' }).extra, '');
  });
  it('оговорка про шанс, а не исход раунда', () => assert.match(FEEDBACK_NOTE, /не по итогу раунда/));
});

describe('raiseNeighbours', () => {
  const chanceOf = (q) => Math.max(0, 1 - q * 0.1);
  const base = { f: 5, bid: { q: 3, f: 5 }, total: 15, wild: true, threshold: 0.5, chanceOf };

  it('три строки: на кубик меньше, выбранная, на кубик больше; выбранная помечена', () => {
    const rows = raiseNeighbours({ ...base, q: 5 });
    assert.deepEqual(rows.map((r) => r.q), [4, 5, 6]);
    assert.deepEqual(rows.map((r) => r.chosen), [false, true, false]);
    assert.ok(rows.every((r) => r.f === 5));
  });

  it('категория и подпись по порогу', () => {
    const rows = raiseNeighbours({ ...base, q: 5 });          // 60 %, 50 %, 40 %
    assert.deepEqual(rows.map((r) => r.margin), ['small', 'below', 'below']);
    assert.equal(rows[0].label, 'небольшой запас');
    assert.equal(rows[1].label, 'ниже порога');
  });

  it('недопустимое повышение не выводится: минимальная ставка — меньшего соседа нет', () => {
    const rows = raiseNeighbours({ ...base, q: 4 });          // 3×5 уже есть: 3×5 не выше
    assert.deepEqual(rows.map((r) => r.q), [4, 5]);
    assert.equal(rows[0].chosen, true);
  });

  it('число кубиков на столе ограничивает сверху', () => {
    const rows = raiseNeighbours({ ...base, q: 15 });
    assert.deepEqual(rows.map((r) => r.q), [14, 15]);
  });

  it('грань с меньшим номером: сосед с тем же количеством уже недопустим по правилам', () => {
    const rows = raiseNeighbours({ ...base, bid: { q: 3, f: 5 }, q: 3, f: 6 });
    assert.deepEqual(rows.map((r) => r.q), [3, 4]);           // 2×6 не выше 3×5
  });

  it('джокеры меняют допустимость соседей (ставка на единицы)', () => {
    const rows = raiseNeighbours({ ...base, bid: { q: 4, f: 3 }, q: 2, f: 1, total: 10 });
    assert.ok(rows.length >= 1 && rows.every((r) => r.f === 1));
    assert.equal(rows.filter((r) => r.chosen).length, 1);
  });

  it('chanceOf обязателен', () => assert.throws(() => raiseNeighbours({ ...base, q: 5, chanceOf: null }), TypeError));
});

describe('legendItems', () => {
  it('порог 50 %', () => {
    assert.deepEqual(legendItems(0.5), [
      { margin: 'small', text: '51–64 % · небольшой запас' },
      { margin: 'big', text: '65–100 % · уверенный запас' },
      { margin: 'below', text: '≤ 50 % · ниже порога' },
    ]);
  });
  it('высокий порог: пустые диапазоны не выводятся, один процент без тире', () => {
    assert.deepEqual(legendItems(0.85).map((i) => i.text), ['86–99 % · небольшой запас', '100 % · уверенный запас', '≤ 85 % · ниже порога']);
    assert.deepEqual(legendItems(0.9).map((i) => i.margin), ['small', 'below']);
  });
});

describe('optionRow: единая строка варианта', () => {
  it('ставка: число, грань, шанс, категория, метка', () => {
    assert.deepEqual(optionRow({ kind: 'raise', q: 4, f: 5, chance: 0.74, threshold: 0.5, chosen: true, tag: 'лучший' }),
      { kind: 'raise', q: 4, f: 5, chance: 0.74, margin: 'big', label: 'уверенный запас', chosen: true, tag: 'лучший' });
  });
  it('«Не верю»: та же структура, без количества и грани; категория по тому же порогу', () => {
    const r = optionRow({ kind: 'dudo', chance: 0.55, threshold: 0.5 });
    assert.deepEqual(r, { kind: 'dudo', q: null, f: null, chance: 0.55, margin: 'small', label: 'небольшой запас', chosen: false, tag: '' });
    assert.equal(optionRow({ kind: 'dudo', chance: 0.5, threshold: 0.5 }).margin, 'below');
  });
  it('у «Не верю» лишние количество и грань отбрасываются', () => {
    const r = optionRow({ kind: 'dudo', q: 3, f: 2, chance: 0.2, threshold: 0.5 });
    assert.equal(r.q, null);
    assert.equal(r.f, null);
  });
  it('ошибки: неизвестный вид, ставка без количества, нечисловой шанс', () => {
    assert.throws(() => optionRow({ kind: 'call', chance: 0.5, threshold: 0.5 }), TypeError);
    assert.throws(() => optionRow({ kind: 'raise', chance: 0.5, threshold: 0.5 }), TypeError);
    assert.throws(() => optionRow({ kind: 'dudo', chance: NaN, threshold: 0.5 }), TypeError);
  });
  it('соседние повышения строятся тем же компонентом: одинаковые поля и метка по умолчанию пустая', () => {
    const rows = raiseNeighbours({ q: 5, f: 5, bid: { q: 3, f: 5 }, total: 15, threshold: 0.5, chanceOf: () => 0.6 });
    for (const r of rows) assert.deepEqual(Object.keys(r), Object.keys(optionRow({ kind: 'raise', q: 1, f: 1, chance: 0.6, threshold: 0.5 })));
    assert.ok(rows.every((r) => r.tag === ''));
  });
});

describe('allOptionRows: список «Все варианты»', () => {
  const dudo = { type: 'dudo', success: 0.3 };
  const min = { type: 'minRaise', q: 2, f: 1, success: 0.8 };
  const safe = { type: 'safeRaise', q: 5, f: 3, success: 0.6 };
  it('строка на каждый вариант, вид и шанс из варианта, метки нет без showBest', () => {
    const rows = allOptionRows({ options: [dudo, min, safe], threshold: 0.5, best: { type: 'dudo', success: 0.3 } });
    assert.deepEqual(rows.map((r) => [r.kind, r.q, r.f, r.chance, r.tag]),
      [['dudo', null, null, 0.3, ''], ['raise', 2, 1, 0.8, ''], ['raise', 5, 3, 0.6, '']]);
  });
  it('метка «лучший» на верном ходе, выбранный отмечен', () => {
    const rows = allOptionRows({ options: [{ ...dudo, chosen: true }, min], threshold: 0.5, best: { type: 'raise', q: 2, f: 1, success: 0.8 }, showBest: true });
    assert.deepEqual(rows.map((r) => [r.tag, r.chosen]), [['', true], ['лучший', false]]);
  });
  it('«Не верю» — лучший ход', () => {
    const rows = allOptionRows({ options: [dudo, min], threshold: 0.5, best: { type: 'dudo', success: 0.3 }, showBest: true });
    assert.equal(rows[0].tag, 'лучший');
    assert.equal(rows.filter((r) => r.tag).length, 1);
  });
  it('лучшего повышения нет в списке — добавляется последней строкой', () => {
    const rows = allOptionRows({ options: [dudo, min], threshold: 0.5, best: { type: 'raise', q: 4, f: 2, success: 0.9 }, showBest: true });
    assert.equal(rows.length, 3);
    assert.deepEqual([rows[2].q, rows[2].f, rows[2].tag], [4, 2, 'лучший']);
  });
  it('пустой список и не список', () => {
    assert.deepEqual(allOptionRows({ options: [], threshold: 0.5 }), []);
    assert.throws(() => allOptionRows({ options: null, threshold: 0.5 }), TypeError);
  });
});
