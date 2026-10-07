const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/core.js');

// Эталонные значения посчитаны исходным perudo.py
const REF = [
  [7, 5, 15, [1, 3, 5, 5, 6], true, 0.44073566021439836],
  [6, 4, 12, [1, 3, 5], true, 0.14484580602550426],
  [8, 2, 20, [2, 2, 4, 6, 6], false, 0.02739410550852682],
  [4, 1, 10, [1, 1, 3, 4, 6], true, 0.19624485596707822],
  [12, 6, 25, [6, 6, 1], true, 0.2929963185297618],
  [3, 3, 6, [3], true, 0.5390946502057614],
];

test('probBid совпадает с perudo.py', () => {
  for (const [q, f, n, h, w, exp] of REF) {
    assert.ok(Math.abs(P.probBid(q, f, n, h, w) - exp) < 1e-12, `${q}x${f}`);
  }
});

test('bestBid монотонен по порогу', () => {
  const h = [1, 3, 5, 5, 6];
  assert.ok(P.bestBid(5, 15, h, true, 0.3) >= P.bestBid(5, 15, h, true, 0.7));
});

test('probBidRead при trust=0 равна probBid', () => {
  const h = [2, 3, 5], opps = [{ k: 5, faces: [5] }, { k: 7, faces: [] }];
  for (let q = 1; q <= 15; q++) {
    for (let f = 1; f <= 6; f++) {
      assert.ok(
        Math.abs(P.probBidRead(q, f, h, opps, true, 0) - P.probBid(q, f, 15, h, true)) < 1e-9
      );
    }
  }
});

test('probBidRead растёт с доверием к ставке', () => {
  const h = [2, 3, 5], opps = [{ k: 5, faces: [5] }, { k: 7, faces: [] }];
  assert.ok(P.probBidRead(6, 5, h, opps, true, 0.4) > P.probBidRead(6, 5, h, opps, true, 0));
});

test('exactProb в сумме даёт 1', () => {
  const h = [1, 4], n = 9;
  let t = 0;
  for (let q = 0; q <= n; q++) t += P.exactProb(q, 3, n, h, true);
  assert.ok(Math.abs(t - 1) < 1e-9);
});

test('CFR: дуэль 1×1 сходится, значение близко к известному', () => {
  const t = P.solveDuel({ iters: 150 });
  assert.ok(t.exploitability < 0.05, 'expl ' + t.exploitability);
  assert.ok(Math.abs(t.value) < 0.15, 'value ' + t.value);
  for (const node of t.nodes.slice(0, 200)) {
    for (const row of node.avg) {
      const s = row.reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(s - 1) < 1e-9);
    }
  }
});