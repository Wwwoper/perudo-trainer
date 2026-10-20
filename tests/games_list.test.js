// tests/games_list.test.js — список партий: склонения, дата, отбор последних.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { plural, formatGameWhen, formatGameMeta, visibleGames, GAMES_SHOWN } from '../src/games_list.js';

const P = ['игрок', 'игрока', 'игроков'];

describe('plural', () => {
  test('1, 2–4, 5+ и «-надцать»', () => {
    const cases = { 0: 'игроков', 1: 'игрок', 2: 'игрока', 4: 'игрока', 5: 'игроков', 11: 'игроков', 12: 'игроков', 14: 'игроков',
      21: 'игрок', 22: 'игрока', 25: 'игроков', 101: 'игрок', 111: 'игроков', 112: 'игроков' };
    for (const [n, word] of Object.entries(cases)) assert.equal(plural(+n, P), word, n);
  });
});

describe('formatGameWhen', () => {
  const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi).getTime();
  test('в этом году — без года, с нулями', () => {
    assert.equal(formatGameWhen(at(2026, 10, 19, 9, 7), at(2026, 10, 20, 12, 0)), '19.10, 09:07');
    assert.equal(formatGameWhen(at(2026, 1, 2, 23, 59), at(2026, 10, 20, 12, 0)), '02.01, 23:59');
  });
  test('в другом году — с годом', () => {
    assert.equal(formatGameWhen(at(2025, 12, 31, 8, 0), at(2026, 10, 20, 12, 0)), '31.12.2025, 08:00');
  });
  test('мусор вместо метки времени — «—»', () => {
    for (const bad of [undefined, null, NaN, 'вчера', {}]) assert.equal(formatGameWhen(bad), '—');
  });
});

describe('formatGameMeta', () => {
  test('склоняет игроков, раунды и решения', () => {
    assert.equal(formatGameMeta({ players: 4, rounds: 19, decisions: 15 }), '4 игрока · 19 раундов · 15 решений');
    assert.equal(formatGameMeta({ players: 2, rounds: 1, decisions: 1 }), '2 игрока · 1 раунд · 1 решение');
    assert.equal(formatGameMeta({ players: 5, rounds: 22, decisions: 21 }), '5 игроков · 22 раунда · 21 решение');
  });
  test('пустая или битая запись — нули, а не undefined', () => {
    assert.equal(formatGameMeta(undefined), '0 игроков · 0 раундов · 0 решений');
    assert.equal(formatGameMeta({ players: 'x', rounds: -3, decisions: 1.5 }), '0 игроков · 0 раундов · 0 решений');
  });
});

describe('visibleGames', () => {
  const games = (n) => Array.from({ length: n }, (_, i) => ({ id: i }));
  test('свежие партии сверху, лишние скрыты', () => {
    const r = visibleGames(games(25));
    assert.equal(r.items.length, GAMES_SHOWN);
    assert.equal(r.items[0].id, 24);
    assert.equal(r.hidden, 15);
  });
  test('«Показать все» отдаёт всё, скрытых нет', () => {
    const r = visibleGames(games(25), true);
    assert.equal(r.items.length, 25);
    assert.equal(r.items.at(-1).id, 0);
    assert.equal(r.hidden, 0);
  });
  test('партий не больше порога — кнопка не нужна', () => {
    assert.equal(visibleGames(games(GAMES_SHOWN)).hidden, 0);
    assert.equal(visibleGames(games(3)).items.length, 3);
  });
  test('пустая история, мусор и исходный массив не меняется', () => {
    assert.deepEqual(visibleGames([]), { items: [], hidden: 0 });
    assert.deepEqual(visibleGames(null), { items: [], hidden: 0 });
    assert.equal(visibleGames([null, 1, { id: 1 }]).items.length, 1);
    const src = games(3);
    visibleGames(src);
    assert.equal(src[0].id, 0);
  });
});
