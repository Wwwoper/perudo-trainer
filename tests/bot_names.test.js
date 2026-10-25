// bot_names.test.js — имена ботов за столом не повторяются и не совпадают с именем игрока.
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { generateName, generateCharacter, generateCharacters } from '../src/bots.js';

/** Детерминированный генератор (mulberry32): тесты не зависят от удачи. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FEMALE = ['Мария', 'Ольга', 'Анна', 'Елена', 'Татьяна', 'Наталья', 'Екатерина', 'Анастасия', 'Ирина', 'Юлия'];
const MALE = ['Алексей', 'Дмитрий', 'Иван', 'Сергей', 'Николай', 'Андрей', 'Максим', 'Александр', 'Павел', 'Михаил'];

describe('generateName: список запрещённых имён', () => {
  it('не возвращает занятое имя (проверено на многих значениях генератора)', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rng = seeded(seed);
      const name = generateName('female', { avoid: ['Мария', 'Анна', 'Елена'], rng });
      assert.ok(FEMALE.includes(name));
      assert.ok(!['Мария', 'Анна', 'Елена'].includes(name), `выпало занятое имя ${name}`);
    }
  });
  it('сравнение без учёта регистра и пробелов по краям', () => {
    const avoid = FEMALE.filter((n) => n !== 'Юлия').map((n) => `  ${n.toUpperCase()} `);
    for (let seed = 1; seed <= 50; seed++) {
      assert.strictEqual(generateName('female', { avoid, rng: seeded(seed) }), 'Юлия');
    }
  });
  it('если в нужном списке свободных нет, берёт из другого', () => {
    const name = generateName('female', { avoid: FEMALE, rng: seeded(3) });
    assert.ok(MALE.includes(name));
  });
  it('если свободных нет совсем, добавляет номер и не повторяется', () => {
    const all = [...MALE, ...FEMALE];
    const first = generateName('male', { avoid: all, rng: seeded(5) });
    assert.match(first, / 2$/);
    const second = generateName('male', { avoid: [...all, first], rng: seeded(5) });
    assert.notStrictEqual(second, first);
  });
  it('без списка работает как раньше', () => {
    for (const g of ['male', 'female', 'random']) assert.ok(generateName(g).length > 0);
    assert.ok(MALE.includes(generateName('male')));
    assert.ok(FEMALE.includes(generateName('female')));
  });
});

describe('generateCharacters: имена за столом', () => {
  it('у 1–5 ботов имена всегда разные (много случайных раскладов)', () => {
    for (let seed = 1; seed <= 400; seed++) {
      for (let n = 1; n <= 5; n++) {
        const chars = generateCharacters(Array(n).fill('auto').map(() => 'careful'), { rng: seeded(seed * 7 + n) });
        const names = chars.map((c) => c.name);
        assert.strictEqual(new Set(names).size, n, `повтор имён при seed=${seed}, ботов=${n}: ${names}`);
      }
    }
  });
  it('имя игрока не достаётся ни одному боту', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const chars = generateCharacters(['careful', 'bluffer', 'smart', 'careful', 'smart'],
        { avoidNames: ['Сергей'], rng: seeded(seed) });
      assert.ok(chars.every((c) => c.name.toLowerCase() !== 'сергей'), `у бота имя игрока, seed=${seed}`);
    }
  });
  it('порядок и стили сохраняются; пол соответствует имени', () => {
    const styles = ['careful', 'bluffer', 'smart'];
    const chars = generateCharacters(styles, { rng: seeded(9) });
    assert.deepStrictEqual(chars.map((c) => c.style), styles);
    for (const c of chars) {
      const base = c.name.replace(/ \d+$/, '');
      assert.strictEqual(c.gender, FEMALE.includes(base) ? 'female' : 'male');
    }
  });
  it('пустой список — пустой результат; вход не меняется', () => {
    assert.deepStrictEqual(generateCharacters([]), []);
    const avoid = ['Иван'];
    generateCharacters(['smart', 'smart'], { avoidNames: avoid });
    assert.deepStrictEqual(avoid, ['Иван']);
  });
  it('даже при вынужденном выборе из другого пола пол персонажа следует за именем', () => {
    const c = generateCharacter('careful', { avoidNames: FEMALE, rng: () => 0.9 });  // 0.9 → «female» по броску, но имена заняты
    assert.ok(MALE.includes(c.name));
    assert.strictEqual(c.gender, 'male');
  });
});
