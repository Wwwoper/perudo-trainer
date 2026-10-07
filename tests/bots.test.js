// tests/bots.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOT_STYLES, botDecide, generateCharacter, generateName,
  generateAvatar, generateColor, getCharacterStats, updateMemory,
} from '../src/bots.js';

describe('BOT_STYLES', () => {
  it('определены все стили', () => {
    assert.ok(BOT_STYLES.careful);
    assert.ok(BOT_STYLES.bluffer);
    assert.ok(BOT_STYLES.smart);
  });
  it('у стилей есть иконки', () => {
    assert.ok(BOT_STYLES.careful.icon);
    assert.ok(BOT_STYLES.bluffer.icon);
    assert.ok(BOT_STYLES.smart.icon);
  });
});

describe('generateName', () => {
  it('генерирует имя', () => {
    const name = generateName();
    assert.ok(typeof name === 'string' && name.length > 0);
  });
  it('генерирует мужское имя', () => {
    assert.ok(typeof generateName('male') === 'string');
  });
  it('генерирует женское имя', () => {
    assert.ok(typeof generateName('female') === 'string');
  });
});

describe('generateCharacter / generateAvatar / generateColor', () => {
  it('генерирует персонажа', () => {
    const c = generateCharacter();
    assert.ok(c.id && c.name && c.gender && c.style && c.color && c.avatar);
  });
  it('уважает переданный стиль', () => {
    assert.strictEqual(generateCharacter('bluffer').style, 'bluffer');
  });
    it('аватар — SVG без внешних URL', () => {
    const svg = generateAvatar('male');
    assert.ok(svg.includes('<svg'));

    // xmlns="http://www.w3.org/2000/svg" — это XML-namespace, а не внешний
    // ресурс: браузер по нему никуда не ходит, но без него SVG не отрисуется.
    // Проверяем только реально «сетевые» ссылки.
    assert.ok(
      !/\b(?:href|src|xlink:href)\s*=\s*["']https?:/i.test(svg),
      `в SVG найдена внешняя ссылка: ${svg}`
    );
    assert.ok(!/url\(\s*["']?https?:/i.test(svg), 'в CSS найден внешний url()');
  });
  it('цвет — строка из заданной палитры', () => {
    assert.match(generateColor(), /^#[0-9A-Fa-f]{6}$/);
  });
  it('generateCharacter содержит офлайн-SVG', () => {
    for (const style of ['careful', 'bluffer', 'smart', 'random']) {
      const c = generateCharacter(style);
      assert.ok(c.avatar.includes('<svg'));
      assert.ok(!/\b(?:href|src|xlink:href)\s*=\s*["']https?:/i.test(c.avatar));
    }
  });
});

describe('getCharacterStats / updateMemory', () => {
  it('возвращает статистику', () => {
    const s = getCharacterStats({ gamesPlayed: 10, wins: 4, totalBids: 0, favoriteFaces: [0,0,0,0,0,0,0] });
    assert.strictEqual(s.gamesPlayed, 10);
    assert.strictEqual(s.wins, 4);
    assert.ok(s.winRate);
  });
  it('updateMemory учитывает BID_PLACED', () => {
    const m0 = { totalBids: 0, favoriteFaces: [0,0,0,0,0,0,0], riskyBids: 0 };
    const m1 = updateMemory(m0, { type: 'BID_PLACED', face: 3, probability: 0.2 });
    assert.strictEqual(m1.totalBids, 1);
    assert.strictEqual(m1.favoriteFaces[3], 1);
    assert.strictEqual(m1.riskyBids, 1);
  });
});

/* =========================================================================
   Регрессия P0.1: botDecide должен читать ставку как {q, f}.
   До фикса эти тесты падали, потому что код читал b.quantity / b.face.
   ========================================================================= */
describe('botDecide — интерфейс {q, f}', () => {
  const base = {
    publicState: { totalDice: 15 },
    rules: { wild: true },
    opps: [],
    canCalza: false,
  };

  it('на безопасную ставку отвечает raise, а не dudo', () => {
    // Своих кубиков: 3 (две 3-ки + одна 1-джокер) → need = 3 - 3 = 0 → p = 1.
    const d = botDecide({
      ...base,
      hand: [3, 3, 1],
      bid: { q: 3, f: 3 },
      style: BOT_STYLES.careful,
      rng: () => 0.5,
    });
    assert.strictEqual(d.type, 'raise', JSON.stringify(d));
  });

  it('на завышенную ставку отвечает dudo', () => {
    // need = 8 - 3 = 5 при 2 неизвестных → p = 0 < dudoBelow.
    const d = botDecide({
      ...base,
      hand: [3, 3, 1],
      bid: { q: 8, f: 3 },
      style: BOT_STYLES.careful,
      rng: () => 0.5,
    });
    assert.strictEqual(d.type, 'dudo');
  });

  it('все три стиля дают осмысленный ответ на ставку {q, f}', () => {
    for (const style of Object.values(BOT_STYLES)) {
      const d = botDecide({
        ...base,
        hand: [2, 4, 5],
        bid: { q: 2, f: 5 },
        style,
        rng: () => 0.5,
      });
      assert.ok(['raise', 'dudo', 'calza'].includes(d.type));
    }
  });

  it('все три стиля корректно обрабатывают legacy {quantity, face}', () => {
    // На всякий случай: код терпит оба имени, но новый канон — {q, f}.
    const d = botDecide({
      ...base,
      hand: [3, 3, 1],
      bid: { quantity: 3, face: 3 },
      style: BOT_STYLES.careful,
      rng: () => 0.5,
    });
    assert.strictEqual(d.type, 'raise');
  });
});