// Тесты src/ui/modes.js: режимы тренажёра и bestSafeRaise (ES-модуль, поэтому динамический import).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const sandbox = { self: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/core.js'), 'utf8'), sandbox, { filename: 'core.js' });
globalThis.Perudo = sandbox.self.Perudo;

const load = () => import(pathToFileURL(path.join(__dirname, '../src/ui/modes.js')).href);

test('modeLabel: короткое название без скобок, неизвестный ключ возвращается как есть', async () => {
  const { modeLabel } = await load();
  assert.equal(modeLabel('classic'), 'Классика');
  assert.equal(modeLabel('big'), 'Большой стол');
  assert.equal(modeLabel('nope'), 'nope');
});

test('MODES: у каждого режима есть название, диапазон кубиков и вероятность блефа', async () => {
  const { MODES } = await load();
  for (const [key, m] of Object.entries(MODES)) {
    assert.ok(m.name && m.d, key);
    assert.ok(m.n[0] <= m.n[1], key);
    assert.ok(m.bluff > 0 && m.bluff < 1, key);
    const k = m.k(m.n[0]);
    assert.ok(Number.isInteger(k) && k >= 1 && k <= 5, key);
  }
});

test('bestSafeRaise: возвращает легальную ставку с вероятностью не ниже порога', async () => {
  const { bestSafeRaise } = await load();
  const { legal } = await import(pathToFileURL(path.join(__dirname, '../src/rules.js')).href);
  const bid = { q: 3, f: 3 };
  const r = bestSafeRaise(bid, 12, [3, 3, 4, 5, 1], { wild: true }, 0.5);
  assert.ok(r, 'ставка найдена');
  assert.ok(r.p >= 0.5);
  assert.ok(legal(r.q, r.f, bid, { wild: true }));
});

test('bestSafeRaise: при недостижимом пороге возвращает null', async () => {
  const { bestSafeRaise } = await load();
  assert.equal(bestSafeRaise({ q: 3, f: 3 }, 12, [2, 2, 2, 2, 2], { wild: true }, 1.01), null);
});

test('MODES: у каждого режима есть уникальная короткая подпись для плитки и пояснение для новичка', async () => {
  const { MODES } = await load();
  const shorts = new Set();
  for (const [key, m] of Object.entries(MODES)) {
    assert.ok(m.short && m.short.length <= 14, `${key}: короткая подпись есть и помещается в плитку`);
    assert.ok(!shorts.has(m.short), `${key}: подпись уникальна`);
    shorts.add(m.short);
    assert.ok(m.d && m.d.length >= 40, `${key}: пояснение достаточно подробное`);
  }
});
