// chance_margin.test.js — запас шанса над порогом: границы категорий и диапазоны легенды.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { marginClass, passesThreshold, marginRanges, percentOf, MARGIN_LABELS, MARGIN_PP } from '../src/chance_margin.js';

describe('marginClass: границы при пороге 50%', () => {
  const cases = [
    [0, 'below'], [0.49, 'below'], [0.5, 'below'],
    [0.51, 'small'], [0.57, 'small'], [0.64, 'small'],
    [0.65, 'big'], [0.9, 'big'], [1, 'big'],
  ];
  for (const [p, want] of cases) {
    it(`шанс ${Math.round(p * 100)}% → ${want}`, () => assert.equal(marginClass(p, 0.5), want));
  }

  it('«+14» и «+15» пунктов лежат по разные стороны границы', () => {
    assert.equal(marginClass(0.64, 0.5), 'small');
    assert.equal(marginClass(0.65, 0.5), 'big');
    assert.equal(MARGIN_PP, 15);
  });

  it('категория считается по округлённому проценту, как его видит игрок', () => {
    assert.equal(marginClass(0.504, 0.5), 'below'); // на экране «50 %»
    assert.equal(marginClass(0.505, 0.5), 'small'); // на экране «51 %»
    assert.equal(marginClass(0.644, 0.5), 'small'); // «64 %»
    assert.equal(marginClass(0.645, 0.5), 'big');   // «65 %»
  });
});

describe('marginClass: другие пороги', () => {
  it('диапазоны сдвигаются вместе с порогом (60%)', () => {
    assert.equal(marginClass(0.6, 0.6), 'below');
    assert.equal(marginClass(0.61, 0.6), 'small');
    assert.equal(marginClass(0.74, 0.6), 'small');
    assert.equal(marginClass(0.75, 0.6), 'big');
  });

  it('порог 5% и 95% из границ настройки', () => {
    assert.equal(marginClass(0.05, 0.05), 'below');
    assert.equal(marginClass(0.06, 0.05), 'small');
    assert.equal(marginClass(0.2, 0.05), 'big');
    assert.equal(marginClass(0.95, 0.95), 'below');
    assert.equal(marginClass(0.96, 0.95), 'small');
    assert.equal(marginClass(1, 0.95), 'small'); // «большого запаса» выше 100% не бывает
  });

  it('вещественная погрешность порога не сдвигает границу (0,35·100)', () => {
    assert.equal(marginClass(0.35, 0.35), 'below');
    assert.equal(marginClass(0.36, 0.35), 'small');
  });

  it('порог не число → 50%', () => {
    assert.equal(marginClass(0.51, NaN), 'small');
    assert.equal(marginClass(0.51, undefined), 'small');
  });

  it('шанс не число — ошибка, а не молчаливое «ниже порога»', () => {
    assert.throws(() => marginClass(NaN, 0.5), TypeError);
    assert.throws(() => percentOf(undefined), TypeError);
  });
});

describe('passesThreshold', () => {
  it('ровно на пороге не проходит, на пункт выше — проходит', () => {
    assert.equal(passesThreshold(0.5, 0.5), false);
    assert.equal(passesThreshold(0.51, 0.5), true);
  });
});

describe('marginRanges: легенда', () => {
  it('порог 50%: ≤50, 51–64, 65–100', () => {
    assert.deepEqual(marginRanges(0.5), { below: 50, small: [51, 64], big: [65, 100] });
  });

  it('порог 60%: ≤60, 61–74, 75–100', () => {
    assert.deepEqual(marginRanges(0.6), { below: 60, small: [61, 74], big: [75, 100] });
  });

  it('высокий порог: диапазон обрезается по 100, пустой — null', () => {
    assert.deepEqual(marginRanges(0.9), { below: 90, small: [91, 100], big: null });
    assert.deepEqual(marginRanges(0.85), { below: 85, small: [86, 99], big: [100, 100] });
    assert.deepEqual(marginRanges(1), { below: 100, small: null, big: null });
  });

  it('легенда и классификация согласованы на каждом проценте', () => {
    for (const thr of [0.05, 0.25, 0.5, 0.65, 0.85, 0.95]) {
      const r = marginRanges(thr);
      for (let pct = 0; pct <= 100; pct++) {
        const c = marginClass(pct / 100, thr);
        const inSmall = r.small && pct >= r.small[0] && pct <= r.small[1];
        const inBig = r.big && pct >= r.big[0] && pct <= r.big[1];
        const want = pct <= r.below ? 'below' : inSmall ? 'small' : inBig ? 'big' : null;
        assert.equal(c, want, `порог ${thr}, шанс ${pct}%`);
      }
    }
  });

  it('названия категорий для интерфейса', () => {
    assert.deepEqual(Object.values(MARGIN_LABELS), ['ниже порога', 'небольшой запас', 'уверенный запас']);
  });
});

describe('поле порога в процентах', () => {
  it('разбор: целые проценты, пусто и мусор — 50 %, границы 5–95', async () => {
    const { thresholdPercentFromInput, thresholdFromInput } = await import('../src/chance_margin.js');
    assert.equal(thresholdPercentFromInput('50'), 50);
    assert.equal(thresholdPercentFromInput(' 65 '), 65);
    assert.equal(thresholdPercentFromInput('72,6'), 73);
    assert.equal(thresholdPercentFromInput('72.4'), 72);
    assert.equal(thresholdPercentFromInput(''), 50);
    assert.equal(thresholdPercentFromInput('abc'), 50);
    assert.equal(thresholdPercentFromInput(undefined), 50);
    assert.equal(thresholdPercentFromInput(null), 50);
    assert.equal(thresholdPercentFromInput('0'), 5);
    assert.equal(thresholdPercentFromInput('-10'), 5);
    assert.equal(thresholdPercentFromInput('100'), 95);
    assert.equal(thresholdFromInput('35'), 0.35);
    assert.equal(thresholdFromInput('x'), 0.5);
  });

  it('шаг «+» и «−» идёт по кратным 5, на границах не выходит за 5–95', async () => {
    const { stepThresholdPercent } = await import('../src/chance_margin.js');
    assert.equal(stepThresholdPercent('50', 1), 55);
    assert.equal(stepThresholdPercent('50', -1), 45);
    assert.equal(stepThresholdPercent('52', 1), 55);
    assert.equal(stepThresholdPercent('52', -1), 50);
    assert.equal(stepThresholdPercent('95', 1), 95);
    assert.equal(stepThresholdPercent('5', -1), 5);
    assert.equal(stepThresholdPercent('', 1), 55);
    assert.equal(stepThresholdPercent('200', -1), 90);   // сначала 95, затем шаг вниз
  });
});
