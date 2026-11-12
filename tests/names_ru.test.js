import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BOT_NAMES } from '../src/bots.js';
import { GENITIVE, genitive, bidOf, namesWithoutForm, YOU } from '../src/names_ru.js';

describe('names_ru', () => {
  test('у каждого имени бота есть форма, лишних имён в словаре нет', () => {
    assert.deepEqual(namesWithoutForm(), []);
    assert.deepEqual(Object.keys(GENITIVE).sort(), [...BOT_NAMES].sort());
  });
  test('формы мужских и женских имён', () => {
    assert.equal(genitive('Андрей'), 'Андрея');
    assert.equal(genitive('Михаил'), 'Михаила');
    assert.equal(genitive('Юлия'), 'Юлии');
    assert.equal(genitive('Анастасия'), 'Анастасии');
    assert.equal(genitive('Наталья'), 'Натальи');
    assert.equal(genitive('Ольга'), 'Ольги');
  });
  test('форма не совпадает с исходным именем', () => {
    for (const [n, g] of Object.entries(GENITIVE)) assert.notEqual(n, g);
  });
  test('незнакомое имя, пустое значение и «Вы» формы не имеют', () => {
    for (const v of ['Лис_77', 'Мэри-Энн', '', null, undefined, YOU]) assert.equal(genitive(v), null);
  });
  test('имя с пробелами по краям находится', () => {
    assert.equal(genitive('  Юлия '), 'Юлии');
  });
  test('bidOf: вы, имя из словаря, никнейм, пусто', () => {
    assert.equal(bidOf('Вы'), 'ваша ставка');
    assert.equal(bidOf('Андрей'), 'ставка Андрея');
    assert.equal(bidOf('Юлия'), 'ставка Юлии');
    assert.equal(bidOf('Лис_77'), 'ставка: Лис_77');
    assert.equal(bidOf(''), 'ставка');
    assert.equal(bidOf(undefined), 'ставка');
  });
});
