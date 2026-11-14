import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SERIES_LENGTH, CHANCES, toChance, makeSeries, isRight, likelierAction, scoreSeries,
  seriesPrompt, stepLine, stepParts, progressMarks, summaryFacts, summaryLines, SERIES_NOTE, SERIES_TITLE,
} from '../src/mixed_series.js';
import { BANNED } from '../src/situation_text.js';

const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

describe('toChance / makeSeries', () => {
  it('допустимы только заданные шансы', () => {
    assert.equal(toChance(0.3), 0.3);
    assert.equal(toChance('0.7'), 0.7);
    for (const v of [0, 1, 0.4, NaN, null, undefined, 'x']) assert.equal(toChance(v), null, String(v));
  });
  it('исходы по rng: ниже шанса — верна', () => {
    const s = makeSeries({ chance: 0.5, length: 4, rng: seq(0.1, 0.5, 0.49, 0.9) });
    assert.deepEqual(s.outcomes, [true, false, true, false]);
    assert.equal(s.chance, 0.5);
  });
  it('длина по умолчанию и отказ на мусоре', () => {
    assert.equal(makeSeries({ chance: 0.7 }).outcomes.length, SERIES_LENGTH);
    for (const o of [{ chance: 0.4 }, { chance: 0.3, length: 0 }, { chance: 0.3, length: 2.5 }, { chance: 0.3, length: 101 }, undefined]) {
      assert.equal(makeSeries(o), null);
    }
  });
  it('частота исходов близка к шансу на большой серии', () => {
    let x = 12345;
    const rng = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
    for (const p of CHANCES) {
      const s = makeSeries({ chance: p, length: 100, rng });
      const share = s.outcomes.filter(Boolean).length / 100;
      assert.ok(Math.abs(share - p) < 0.15, `${p}: ${share}`);
    }
  });
});

describe('isRight / likelierAction', () => {
  it('сопоставление решения и исхода', () => {
    assert.equal(isRight('believe', true), true);
    assert.equal(isRight('believe', false), false);
    assert.equal(isRight('dudo', false), true);
    assert.equal(isRight('dudo', true), false);
    assert.equal(isRight('maybe', true), null);
  });
  it('более вероятная сторона', () => {
    assert.equal(likelierAction(0.7), 'believe');
    assert.equal(likelierAction(0.3), 'dudo');
    assert.equal(likelierAction(0.5), null);
  });
});

describe('scoreSeries', () => {
  const s = { chance: 0.3, outcomes: [true, false, false, false] };
  it('считает решения и совпадения', () => {
    const sc = scoreSeries(s, ['dudo', 'dudo', 'believe', 'dudo']);
    assert.equal(sc.n, 4);
    assert.equal(sc.held, 1);
    assert.equal(sc.believe, 1);
    assert.equal(sc.dudo, 3);
    assert.equal(sc.right, 2);              // нет, верно: dudo на false (2 и 4)
    assert.equal(sc.rightShare, 0.5);
    assert.equal(sc.allLikelierRight, 3);   // всегда «Не верю!»: исходы false в 3 из 4
    assert.equal(sc.expectedShare, 0.7);
    assert.equal(sc.complete, true);
  });
  it('неполная серия и лишние решения', () => {
    const part = scoreSeries(s, ['dudo']);
    assert.equal(part.complete, false);
    assert.equal(part.n, 1);
    assert.equal(scoreSeries(s, ['dudo', 'dudo', 'dudo', 'dudo', 'dudo']).n, 4);
  });
  it('мусор не ломает', () => {
    assert.equal(scoreSeries(null, null).n, 0);
    assert.equal(scoreSeries(s, ['x', 5, null]).n, 0);
    assert.equal(scoreSeries({ chance: 0.4, outcomes: [true] }, ['dudo']).expectedShare, null);
  });
  it('при 50 % «более вероятной стороны» нет', () => {
    const sc = scoreSeries({ chance: 0.5, outcomes: [true, false] }, ['believe', 'believe']);
    assert.equal(sc.allLikelierRight, null);
    assert.equal(sc.expectedShare, 0.5);
  });
});

describe('тексты', () => {
  const sc = scoreSeries({ chance: 0.7, outcomes: [true, true, false] }, ['believe', 'dudo', 'dudo']);
  it('условие, шаг и итог', () => {
    assert.match(seriesPrompt(0.3), /шансом 30 %/);
    assert.match(seriesPrompt(0.3), /«Верю».*не оспариваете.*«Не верю!».*дудо/);   // что значат кнопки в терминах игры
    assert.doesNotMatch(SERIES_NOTE, /Время и очки/);   // это сказано во вступлении, до начала серии
    assert.match(stepLine('believe', true, 0.7), /оказалась верной.*70 %.*совпало с исходом/);
    assert.match(stepLine('dudo', true, 0.7), /не совпало/);
    assert.equal(stepLine('x', true, 0.7), '');
    const t = summaryLines(sc, 3).join(' ');
    assert.match(t, /Совпало с исходом: 2 из 3 \(67 %\)/);
    assert.match(t, /Если бы каждый раз выбирали более вероятную сторону, совпало бы 2 из 3.*около 70 %/);
    assert.equal(summaryLines(sc, 3).length, 2);   // главное число и одна строка сравнения
    assert.match(summaryFacts(sc), /верной в 2 из 3 ситуаций.*«Верю» 1, «Не верю!» 2/);
    assert.equal(summaryFacts(scoreSeries({ chance: 0.7, outcomes: [true, true] }, ['believe'])), '');   // серия не закончена
    assert.equal(summaryFacts(null), '');
  });
  it('неполная серия: итога нет, пустая — без строк', () => {
    assert.match(summaryLines(scoreSeries({ chance: 0.7, outcomes: [true, true] }, ['believe']), 2)[0], /1 из 2/);
    assert.deepEqual(summaryLines(scoreSeries(null, [])), []);
  });
  it('на 50 % — равноценность', () => {
    const t = summaryLines(scoreSeries({ chance: 0.5, outcomes: [true] }, ['believe']), 1).join(' ');
    assert.match(t, /равноценны/);
  });
  it('без запрещённых слов', () => {
    const t = [SERIES_TITLE, SERIES_NOTE, seriesPrompt(0.5), stepLine('dudo', false, 0.3), ...summaryLines(sc, 3)].join(' ');
    for (const re of BANNED) assert.ok(!re.test(t), `${re}`);
    assert.doesNotMatch(t, /обманщик|врёт|блефует/i);
  });
});

describe('Разбор ситуации и точки прогресса', () => {
  it('stepParts: верность, исход и пояснение отдельно; stepLine собирается из них', () => {
    const t = stepParts('believe', false, 0.3);
    assert.equal(t.ok, false);
    assert.match(t.verdict, /не совпало с исходом/);
    assert.match(t.fact, /оказалась неверной.*30 %/);
    assert.match(t.note, /Один исход не оценивает решение/);
    assert.equal(stepLine('believe', false, 0.3), `${t.fact} ${t.verdict}. ${t.note}`);
    assert.equal(stepParts('x', true, 0.5), null);
  });

  it('progressMarks: совпало, не совпало, текущая и впереди', () => {
    const series = { chance: 0.7, outcomes: [true, false, true, true] };
    assert.deepEqual(progressMarks(series, []), ['cur', 'todo', 'todo', 'todo']);
    assert.deepEqual(progressMarks(series, ['believe', 'believe']), ['ok', 'miss', 'cur', 'todo']);
    assert.deepEqual(progressMarks(series, ['believe', 'dudo', 'dudo', 'believe']), ['ok', 'ok', 'miss', 'ok']);
  });

  it('progressMarks: пустая или испорченная серия не роняет', () => {
    assert.deepEqual(progressMarks(null, []), []);
    assert.deepEqual(progressMarks({ outcomes: [true] }, null), ['cur']);
    assert.deepEqual(progressMarks({}, ['believe']), []);
  });
});
