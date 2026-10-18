// avatar_photo.test.js — расчёты сжатия снимка аватара (src/avatar_photo.js)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { squareCrop, fitPhoto, AVATAR_PX, FALLBACK_PX, PHOTO_QUALITIES } from '../src/avatar_photo.js';

describe('squareCrop', () => {
  it('широкий снимок: квадрат по центру', () => assert.deepEqual(squareCrop(400, 200), { sx: 100, sy: 0, side: 200 }));
  it('высокий снимок', () => assert.deepEqual(squareCrop(200, 500), { sx: 0, sy: 150, side: 200 }));
  it('квадрат остаётся квадратом', () => assert.deepEqual(squareCrop(96, 96), { sx: 0, sy: 0, side: 96 }));
  it('нечётная разница округляется вниз, не выходя за границы', () => {
    const c = squareCrop(101, 50);
    assert.deepEqual(c, { sx: 25, sy: 0, side: 50 });
    assert.ok(c.sx + c.side <= 101);
  });
  it('дробные размеры', () => assert.equal(squareCrop(10.9, 20).side, 10));
  it('неверные размеры — null', () => {
    for (const [w, h] of [[0, 10], [10, 0], [-1, 5], [NaN, 5], [5, Infinity], [undefined, 5]]) {
      assert.equal(squareCrop(w, h), null, `${w}×${h}`);
    }
  });
});

describe('fitPhoto', () => {
  it('сразу подходит — берётся первое (лучшее) качество', () => {
    const calls = [];
    const r = fitPhoto((px, q) => { calls.push([px, q]); return 'x'.repeat(10); }, 100);
    assert.equal(r.length, 10);
    assert.deepEqual(calls, [[AVATAR_PX, PHOTO_QUALITIES[0]]]);
  });
  it('качество снижается, пока не уложится', () => {
    const calls = [];
    const r = fitPhoto((px, q) => { calls.push([px, q]); return 'x'.repeat(Math.round(q * 1000)); }, 500);
    assert.deepEqual(calls.map((c) => c[1]), [0.8, 0.65, 0.5]);
    assert.equal(r.length, 500);
  });
  it('если на минимальном качестве не помещается — уменьшается сторона', () => {
    const sizes = new Set();
    const r = fitPhoto((px) => { sizes.add(px); return 'x'.repeat(px * 10); }, 800);
    assert.deepEqual([...sizes], [AVATAR_PX, FALLBACK_PX[0]]);
    assert.equal(r.length, FALLBACK_PX[0] * 10);
  });
  it('не уложились нигде — null', () => {
    assert.equal(fitPhoto(() => 'x'.repeat(1000), 10), null);
  });
  it('неверный ответ рисовальщика пропускается', () => {
    let n = 0;
    assert.equal(fitPhoto(() => (n++ < 3 ? null : 'ok'), 10), 'ok');
  });
});
