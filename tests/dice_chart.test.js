import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { diceChartSvg } from '../src/dice_chart.js';

const data = {
  labels: ['1', '2', '3', 'итог'],
  series: [
    { id: 'human', isMe: true, values: [3, 2, 1, 0] },
    { id: 'bot_0', isMe: false, values: [3, 3, 3, 3] },
    { id: 'bot_1', isMe: false, values: [3, 3, 2, 2] },
  ],
  max: 3,
};

describe('diceChartSvg', () => {
  it('одна линия на игрока, подписи у концов, доступное описание', () => {
    const s = diceChartSvg(data, { names: { bot_0: 'Алексей', bot_1: 'Мария' } });
    assert.match(s, /^<svg class="dice-chart"/);
    assert.equal((s.match(/<polyline/g) || []).length, 3);
    assert.equal((s.match(/<circle/g) || []).length, 12);
    assert.match(s, /role="img"/);
    assert.match(s, /<title id="diceChartT">Кубики по раундам<\/title>/);
    assert.match(s, /Вы: 3, 2, 1, 0; Алексей: 3, 3, 3, 3; Мария: 3, 3, 2, 2/);
    for (const n of ['Вы', 'Алексей', 'Мария']) assert.match(s, new RegExp(`class="chart-name[^"]*"[^>]*>${n}<`));
  });
  it('все координаты внутри холста', () => {
    const w = 340; const h = 160;
    const s = diceChartSvg(data, { width: w, height: h });
    for (const m of s.matchAll(/points="([^"]+)"/g)) {
      for (const p of m[1].split(' ')) {
        const [px, py] = p.split(',').map(Number);
        assert.ok(px >= 0 && px <= w && py >= 0 && py <= h, p);
      }
    }
    for (const m of s.matchAll(/(?:cx|cy|x|y)="(-?[\d.]+)"/g)) assert.ok(Number(m[1]) >= 0, m[0]);
  });
  it('имена экранируются и сокращаются', () => {
    const s = diceChartSvg(data, { names: { bot_0: '<img src=x onerror=alert(1)>', bot_1: 'Очень-очень длинное имя' } });
    assert.ok(!s.includes('<img'));
    assert.match(s, /&lt;img/);
    assert.match(s, />Очень-очень…</);
  });
  it('ваша линия рисуется последней (сверху), у других штрихи по номеру', () => {
    const s = diceChartSvg(data);
    const lines = [...s.matchAll(/<polyline class="chart-line ([^"]+)"/g)].map((m) => m[1]);
    assert.equal(lines.at(-1), 'chart-me');
    assert.ok(lines.slice(0, -1).every((c) => /chart-other chart-s[1-5]/.test(c)));
  });
  it('подписи у концов не накладываются', () => {
    const same = { labels: ['1', '2'], series: ['a', 'b', 'c'].map((id, i) => ({ id, isMe: i === 0, values: [3, 3] })), max: 3 };
    const ys = [...diceChartSvg(same).matchAll(/<text class="chart-name[^>]* y="([\d.]+)"/g)].map((m) => Number(m[1])).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) assert.ok(ys[i] - ys[i - 1] >= 11.9, ys.join());
  });
  it('одна точка и большой максимум не ломают', () => {
    const one = diceChartSvg({ labels: ['1'], series: [{ id: 'h', isMe: true, values: [5] }], max: 5 });
    assert.match(one, /<polyline/);
    const big = diceChartSvg({ labels: ['1', '2'], series: [{ id: 'h', isMe: true, values: [10, 9] }], max: 10 });
    assert.equal((big.match(/class="chart-tick"/g) || []).length >= 3, true);
    assert.ok(!/NaN|undefined/.test(one + big));
  });
  it('нет данных — пустая строка', () => {
    for (const bad of [null, undefined, {}, { labels: [], series: [] }, { labels: ['1'], series: [] }]) assert.equal(diceChartSvg(bad), '');
  });
  it('в разметке нет «сырых» цветов: оформление только классами', () => {
    assert.ok(!/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|fill="|stroke="/i.test(diceChartSvg(data)));
  });
});
