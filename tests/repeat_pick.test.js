// repeat_pick.test.js — пауза между показами одной и той же ситуации.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { situationKey, eligibleRepeats, pickRepeat, REPEAT_GAP } from '../src/repeat_pick.js';

const A = { mode: 'classic', n: 14, h: [1, 3, 5], f: 5, q: 7, streak: 0 };
const B = { mode: 'classic', n: 12, h: [2, 2], f: 4, q: 6, streak: 1 };

describe('situationKey', () => {
  it('одинаков у копий и разный у разных ситуаций', () => {
    assert.equal(situationKey(A), situationKey({ ...A, h: [1, 3, 5], streak: 9 }));
    for (const d of [{ mode: 'big' }, { n: 15 }, { q: 8 }, { f: 4 }, { h: [1, 3, 6] }, { h: [1, 3] }]) {
      assert.notEqual(situationKey(A), situationKey({ ...A, ...d }), JSON.stringify(d));
    }
  });
});

describe('eligibleRepeats', () => {
  it('ещё не показанные доступны', () => {
    assert.deepEqual(eligibleRepeats([A, B], new Map(), 1), [A, B]);
  });
  it('показанная только что недоступна, пока не пройдут gap других ситуаций', () => {
    const seen = new Map([[situationKey(A), 5]]);
    for (let c = 6; c <= 5 + REPEAT_GAP; c++) assert.deepEqual(eligibleRepeats([A], seen, c), [], `показ ${c}`);
    assert.deepEqual(eligibleRepeats([A], seen, 5 + REPEAT_GAP + 1), [A]);
  });
  it('другая ситуация очереди не блокируется', () => {
    const seen = new Map([[situationKey(A), 5]]);
    assert.deepEqual(eligibleRepeats([A, B], seen, 6), [B]);
  });
  it('записи, перечитанные из хранилища, распознаются по ключу', () => {
    const seen = new Map([[situationKey(A), 5]]);
    assert.deepEqual(eligibleRepeats([{ ...A, h: [...A.h] }], seen, 6), []);
  });
  it('gap 0 — без паузы', () => {
    const seen = new Map([[situationKey(A), 5]]);
    assert.deepEqual(eligibleRepeats([A], seen, 6, 0), [A]);
  });
});

describe('pickRepeat', () => {
  it('пустой пул и нет подходящих — null', () => {
    assert.equal(pickRepeat([], new Map(), 1, { rnd: () => 0 }), null);
    assert.equal(pickRepeat([A], new Map([[situationKey(A), 1]]), 2, { rnd: () => 0 }), null);
  });
  it('шанс: при большом случайном числе повтор не берётся', () => {
    assert.equal(pickRepeat([A], new Map(), 1, { rnd: () => 0.99 }), null);
    assert.equal(pickRepeat([A], new Map(), 1, { rnd: () => 0 }), A);
  });
  it('выбирает только из доступных', () => {
    const seen = new Map([[situationKey(A), 3]]);
    assert.equal(pickRepeat([A, B], seen, 4, { rnd: () => 0 }), B);
  });
  it('одна ошибка: после показа три новые ситуации, потом повтор', () => {
    const seen = new Map();
    const shown = [];
    let counter = 0;
    for (let i = 0; i < 9; i++) {
      counter++;
      const it = pickRepeat([A], seen, counter, { rnd: () => 0 });
      if (it) seen.set(situationKey(it), counter);
      shown.push(it ? 'R' : '-');
    }
    assert.equal(shown.join(''), 'R---R---R');
  });
});
