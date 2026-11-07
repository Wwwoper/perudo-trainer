import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SERIES_LENGTH, CHANCES, toChance, makeSeries, isRight, likelierAction, scoreSeries,
  seriesPrompt, stepLine, summaryLines, SERIES_NOTE, SERIES_TITLE,
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
    assert.match(stepLine('believe', true, 0.7), /оказалась верной.*70 %.*совпало с исходом/);
    assert.match(stepLine('dudo', true, 0.7), /не совпало/);
    assert.equal(stepLine('x', true, 0.7), '');
    const t = summaryLines(sc, 3).join(' ');
    assert.match(t, /держалась в 2 из 3/);
    assert.match(t, /Совпало с исходом: 2 из 3 \(67 %\).*около 70 %/);
    assert.match(t, /каждый раз выбирали более вероятную сторону, совпало бы 2 из 3/);
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
