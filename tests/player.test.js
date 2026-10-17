// player.test.js — профиль игрока: имя и аватар (src/player.js)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  NAME_MAX, DEFAULT_NAME, AVATAR_EMOJIS, MAX_PHOTO_CHARS,
  defaultPlayer, sanitizeName, sanitizeAvatar, sanitizePlayer, playerDisplayName, isDefaultPlayer,
} from '../src/player.js';

const photo = (n = 100) => 'data:image/jpeg;base64,' + 'A'.repeat(n);

describe('sanitizeName', () => {
  it('обычное имя без изменений', () => assert.equal(sanitizeName('Макс'), 'Макс'));
  it('пробелы по краям убираются, внутренние схлопываются', () => {
    assert.equal(sanitizeName('  Иван   Петров \n'), 'Иван Петров');
  });
  it('не строка — пустое имя', () => {
    for (const v of [undefined, null, 5, {}, [], true]) assert.equal(sanitizeName(v), '');
  });
  it('скрытые и управляющие символы убираются, в том числе разворот текста', () => {
    assert.equal(sanitizeName('A\u0000B‮C​D'), 'A B C D');
    assert.equal(sanitizeName('‮⁦'), '');
  });
  it(`длина ограничена ${NAME_MAX} символами`, () => {
    assert.equal(Array.from(sanitizeName('я'.repeat(50))).length, NAME_MAX);
  });
  it('обрезка идёт по символам, эмодзи не разрезается', () => {
    const r = sanitizeName('🦊'.repeat(30));
    assert.equal(Array.from(r).length, NAME_MAX);
    assert.ok(!r.includes('�'));
  });
  it('разметка не вырезается (её экранирует интерфейс), но имя остаётся строкой', () => {
    assert.equal(sanitizeName('<b>x</b>'), '<b>x</b>');
  });
  it('имя из одних пробелов — пустое', () => assert.equal(sanitizeName('   \t '), ''));
});

describe('sanitizeAvatar', () => {
  it('эмодзи из набора', () => {
    for (const e of AVATAR_EMOJIS) assert.deepEqual(sanitizeAvatar({ type: 'emoji', value: e }), { type: 'emoji', value: e });
  });
  it('чужое эмодзи и обычный текст — null', () => {
    assert.equal(sanitizeAvatar({ type: 'emoji', value: '💩' }), null);
    assert.equal(sanitizeAvatar({ type: 'emoji', value: '<script>' }), null);
  });
  it('корректный снимок принимается', () => {
    assert.deepEqual(sanitizeAvatar({ type: 'photo', value: photo() }), { type: 'photo', value: photo() });
  });
  it('другие форматы и адреса отклоняются', () => {
    for (const v of ['data:image/png;base64,AAAA', 'data:image/svg+xml;base64,AAAA', 'https://example.com/a.jpg',
      'javascript:alert(1)', 'data:image/jpeg;base64,', 'data:image/jpeg;base64,AA AA', 'data:image/jpeg;base64,AAAA"onload="x']) {
      assert.equal(sanitizeAvatar({ type: 'photo', value: v }), null, v);
    }
  });
  it('слишком большой снимок отклоняется, граница включена', () => {
    const prefix = 'data:image/jpeg;base64,'.length;
    assert.ok(sanitizeAvatar({ type: 'photo', value: photo(MAX_PHOTO_CHARS - prefix) }));
    assert.equal(sanitizeAvatar({ type: 'photo', value: photo(MAX_PHOTO_CHARS - prefix + 1) }), null);
  });
  it('неверный вид значения', () => {
    for (const v of [null, undefined, 'x', 5, [], {}, { type: 'emoji' }, { type: 'other', value: '🦊' }, { type: 'photo', value: 5 }]) {
      assert.equal(sanitizeAvatar(v), null);
    }
  });
});

describe('sanitizePlayer', () => {
  it('мусор — игрок по умолчанию', () => {
    for (const v of [null, undefined, 'x', 5, [], true]) assert.deepEqual(sanitizePlayer(v), defaultPlayer());
  });
  it('лишние поля отбрасываются, плохой аватар заменяется на null, имя сохраняется', () => {
    const p = sanitizePlayer({ name: 'Анна', avatar: { type: 'emoji', value: '💩' }, admin: true });
    assert.deepEqual(p, { name: 'Анна', avatar: null });
  });
  it('корректный игрок не меняется', () => {
    const src = { name: 'Анна', avatar: { type: 'emoji', value: '🦊' } };
    assert.deepEqual(sanitizePlayer(src), src);
  });
  it('повторная обработка ничего не меняет', () => {
    const once = sanitizePlayer({ name: '  Ян  ', avatar: { type: 'photo', value: photo() } });
    assert.deepEqual(sanitizePlayer(once), once);
  });
  it('результат не связан с исходным объектом', () => {
    const src = { name: 'Анна', avatar: { type: 'emoji', value: '🦊' } };
    const p = sanitizePlayer(src);
    p.avatar.value = '🐼';
    assert.equal(src.avatar.value, '🦊');
  });
});

describe('playerDisplayName / isDefaultPlayer', () => {
  it('без имени — «Вы»', () => {
    assert.equal(playerDisplayName(defaultPlayer()), DEFAULT_NAME);
    assert.equal(playerDisplayName(null), DEFAULT_NAME);
    assert.equal(playerDisplayName({ name: '   ' }), DEFAULT_NAME);
  });
  it('с именем — имя', () => assert.equal(playerDisplayName({ name: ' Анна ' }), 'Анна'));
  it('игрок по умолчанию распознаётся', () => {
    assert.equal(isDefaultPlayer(defaultPlayer()), true);
    assert.equal(isDefaultPlayer({ name: 'А' }), false);
    assert.equal(isDefaultPlayer({ avatar: { type: 'emoji', value: '🦊' } }), false);
    assert.equal(isDefaultPlayer({ avatar: { type: 'emoji', value: '💩' } }), true);
  });
});
