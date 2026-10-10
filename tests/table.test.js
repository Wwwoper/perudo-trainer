// node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  seatLayouts, seatLabel, renderBid, renderSeat, renderTable, generateDefaultAvatar,
} from '../src/table.js';
import { generateAvatar } from '../src/bots.js';

const player = (over = {}) => ({
  id: 'p', name: 'Михаил', dice: 5, alive: true, isHuman: false, hand: [], ...over,
});

test('для 2–6 игроков мест ровно столько, сколько игроков; первое — игрок внизу', () => {
  for (let n = 2; n <= 6; n++) {
    const L = seatLayouts(n);
    assert.equal(L.length, n);
    assert.deepEqual(L[0].d, [50, 90]);
    assert.deepEqual(L[0].m, [50, 90]);
  }
});

test('число игроков вне диапазона 2–6 не ломает раскладку', () => {
  assert.equal(seatLayouts(1).length, 2);
  assert.equal(seatLayouts(9).length, 6);
});

test('все координаты внутри 0–100', () => {
  for (let n = 2; n <= 6; n++) {
    for (const { d, m } of seatLayouts(n)) {
      for (const v of [...d, ...m]) assert.ok(v >= 0 && v <= 100, `вне диапазона: ${v}`);
    }
  }
});

test('на одной раскладке нет двух мест в одной точке', () => {
  for (let n = 2; n <= 6; n++) {
    for (const key of ['d', 'm']) {
      const pts = seatLayouts(n).map((s) => s[key].join(','));
      assert.equal(new Set(pts).size, n, `дубли в ${key}, n=${n}`);
    }
  }
});

test('подпись человека всегда «Вы», без дублирования', () => {
  assert.equal(seatLabel(player({ isHuman: true, name: 'Вы' })), 'Вы');
  assert.equal(seatLabel(player({ isHuman: true, name: 'Антон' })), 'Вы');
  assert.equal(seatLabel(player({ name: 'Михаил' })), 'Михаил');
  assert.equal(seatLabel(player({ name: undefined })), '');
});

test('в месте игрока нет строки «(вы)»', () => {
  const layout = seatLayouts(2)[0];
  const html = renderSeat(player({ isHuman: true, name: 'Вы' }), layout, true);
  assert.ok(!html.includes('(вы)'));
});

test('renderBid подбирает размер кубика под размер чипа', () => {
  assert.match(renderBid(3, 4, 'xs'), /class="pd xs/);
  assert.match(renderBid(3, 4, 'lg'), /class="pd s /);
  assert.match(renderBid(3, 4), /class="pd s /);
  assert.match(renderBid(3, 4, 'xl'), /class="pd  /); // полноразмерный: пустой размер
});

test('имя игрока экранируется', () => {
  const html = renderSeat(player({ name: '<img src=x onerror=1>' }), seatLayouts(2)[1], false);
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
});

test('места выставляются CSS-переменными, а не inline left/top', () => {
  const html = renderSeat(player(), seatLayouts(4)[2], false);
  assert.match(html, /--x:50%;--y:10%;--mx:50%;--my:10%/);
  assert.ok(!/style="[^"]*\bleft:/.test(html));
});

test('в центре стола — ставка или «Ставок ещё нет»; Раунд и общее число кубиков туда не попадают', () => {
  const game = {
    round: 3, palifico: false, bid: null,
    players: [player({ isHuman: true, name: 'Вы' }), player()],
  };
  const empty = renderTable(game, 0);
  assert.match(empty, /Ставок ещё нет/);
  assert.ok(!empty.includes('Раунд'));

  const withBid = renderTable({ ...game, bid: { q: 3, f: 4, playerName: 'Михаил' } }, 1);
  assert.match(withBid, /class="chip lg"/);
  assert.match(withBid, /Михаил/);
});

test('ПАЛИФИКО показывается плашкой', () => {
  const game = { round: 1, palifico: true, bid: null, players: [player(), player()] };
  assert.match(renderTable(game, 0), /ПАЛИФИКО/);
});

test('стол состоит из фона, центра и мест — без вложенного .game-table', () => {
  const game = { round: 1, palifico: false, bid: null, players: [player(), player(), player()] };
  const html = renderTable(game, 0);
  assert.match(html, /class="table-felt"/);
  assert.match(html, /class="table-center"/);
  assert.equal((html.match(/class="seat[ "]/g) || []).length, 3);
  assert.ok(!html.includes('game-table'));
});

test('SVG-аватары получают реальный цвет, а не литерал ${color1}', () => {
  for (const g of ['male', 'female']) {
    assert.ok(!generateDefaultAvatar(g).includes('${'), `default ${g}`);
    assert.ok(!generateAvatar(g).includes('${'), `bots ${g}`);
  }
});
