// game_settings.test.js — настройки последней сыгранной партии: проверка данных и хранилище.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

const mem = {};
global.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: (k) => { delete mem[k]; },
};

const {
  defaultGameSettings, sanitizeGameSettings, isDefaultGameSettings, describeGameSettings,
} = await import('../src/game_settings.js');
const {
  getLastGameSettings, setLastGameSettings, clearLastGameSettings, getSettings, setSettings,
} = await import('../src/storage.js');

beforeEach(() => { for (const k of Object.keys(mem)) delete mem[k]; });

describe('sanitizeGameSettings', () => {
  it('мусор вместо объекта даёт стандартные настройки', () => {
    for (const bad of [null, undefined, 5, 'x', [], true]) {
      assert.deepStrictEqual(sanitizeGameSettings(bad), defaultGameSettings());
    }
  });
  it('корректные значения сохраняются как есть', () => {
    const s = {
      dice: 6, bots: 4, botStyles: ['careful', 'random', 'auto', 'bluffer'], botLevel: 'hard',
      memory: false, assist: 'game', speed: 'fast', calza: true, palifico: true, reveal: false,
    };
    assert.deepStrictEqual(sanitizeGameSettings(s), s);
  });
  it('числа зажимаются в пределы и округляются; строки-числа принимаются', () => {
    assert.strictEqual(sanitizeGameSettings({ dice: 99 }).dice, 10);
    assert.strictEqual(sanitizeGameSettings({ dice: -3 }).dice, 1);
    assert.strictEqual(sanitizeGameSettings({ bots: 0 }).bots, 1);
    assert.strictEqual(sanitizeGameSettings({ bots: 9 }).bots, 5);
    assert.strictEqual(sanitizeGameSettings({ dice: 4.6 }).dice, 5);
    assert.strictEqual(sanitizeGameSettings({ dice: '7' }).dice, 7);
  });
  it('не числа заменяются стандартными', () => {
    for (const bad of [NaN, Infinity, 'abc', '', null, {}, []]) {
      assert.strictEqual(sanitizeGameSettings({ dice: bad }).dice, 5);
      assert.strictEqual(sanitizeGameSettings({ bots: bad }).bots, 3);
    }
  });
  it('неизвестные режимы, темп и уровень заменяются стандартными', () => {
    const s = sanitizeGameSettings({ assist: 'cheat', speed: 'warp', botLevel: 'god' });
    assert.strictEqual(s.assist, 'training');
    assert.strictEqual(s.speed, 'normal');
    assert.strictEqual(s.botLevel, 'normal');
  });
  it('флажки принимают только true/false', () => {
    const s = sanitizeGameSettings({ memory: 'no', calza: 1, palifico: 'true', reveal: null });
    assert.deepStrictEqual([s.memory, s.calza, s.palifico, s.reveal], [true, false, false, true]);
  });
  it('стили ботов: лишние обрезаются, незнакомые становятся «по умолчанию»', () => {
    const s = sanitizeGameSettings({ botStyles: ['careful', 'ghost', 7, null, 'smart', 'bluffer', 'random'] });
    assert.strictEqual(s.botStyles.length, 5);
    assert.deepStrictEqual(s.botStyles.slice(0, 5), ['careful', 'auto', 'auto', 'auto', 'smart']);
    assert.deepStrictEqual(sanitizeGameSettings({ botStyles: 'careful' }).botStyles, []);
  });
  it('идемпотентна и не меняет исходный объект', () => {
    const raw = { dice: 99, botStyles: ['x'] };
    const copy = JSON.parse(JSON.stringify(raw));
    const once = sanitizeGameSettings(raw);
    assert.deepStrictEqual(raw, copy);
    assert.deepStrictEqual(sanitizeGameSettings(once), once);
  });
  it('defaultGameSettings каждый раз отдаёт новый объект', () => {
    const a = defaultGameSettings(); a.botStyles.push('x');
    assert.deepStrictEqual(defaultGameSettings().botStyles, []);
  });
});

describe('isDefaultGameSettings и describeGameSettings', () => {
  it('стандартные настройки распознаются, изменённые нет', () => {
    assert.ok(isDefaultGameSettings(defaultGameSettings()));
    assert.ok(isDefaultGameSettings(null));
    assert.ok(!isDefaultGameSettings({ ...defaultGameSettings(), calza: true }));
  });
  it('сводка с правильными склонениями', () => {
    assert.strictEqual(describeGameSettings(defaultGameSettings()), '5 кубиков · 3 бота · Тренировка · Нормально');
    assert.strictEqual(describeGameSettings({ dice: 1, bots: 1, assist: 'novice', speed: 'step' }),
      '1 кубик · 1 бот · Новичок · Пошагово');
    assert.strictEqual(describeGameSettings({ dice: 2, bots: 5, assist: 'game', speed: 'fast' }),
      '2 кубика · 5 ботов · Игра без подсказок · Быстро');
  });
});

describe('хранилище настроек последней партии', () => {
  it('пока ничего не сохранено — null', () => {
    assert.strictEqual(getLastGameSettings(), null);
  });
  it('сохраняется и читается обратно', () => {
    const s = { ...defaultGameSettings(), dice: 4, bots: 2, calza: true, botStyles: ['smart', 'auto'] };
    setLastGameSettings(s);
    assert.deepStrictEqual(getLastGameSettings(), s);
  });
  it('при записи данные проверяются', () => {
    setLastGameSettings({ dice: 500, assist: '??' });
    const got = getLastGameSettings();
    assert.strictEqual(got.dice, 10);
    assert.strictEqual(got.assist, 'training');
  });
  it('не затирает остальные поля perudo.settings', () => {
    setSettings({ animations: 'off' });
    setLastGameSettings(defaultGameSettings());
    assert.strictEqual(getSettings().animations, 'off');
    setSettings({ assistMode: 'game' });
    assert.ok(getLastGameSettings());
  });
  it('повреждённые данные в хранилище не ломают чтение', () => {
    mem['perudo.settings'] = '{не json';
    assert.strictEqual(getLastGameSettings(), null);
    mem['perudo.settings'] = JSON.stringify({ lastGame: 'строка' });
    assert.deepStrictEqual(getLastGameSettings(), defaultGameSettings());
    mem['perudo.settings'] = JSON.stringify([1, 2]);
    assert.strictEqual(getLastGameSettings(), null);
  });
  it('clearLastGameSettings удаляет только lastGame', () => {
    setSettings({ animations: 'off' });
    setLastGameSettings(defaultGameSettings());
    clearLastGameSettings();
    assert.strictEqual(getLastGameSettings(), null);
    assert.strictEqual(getSettings().animations, 'off');
    clearLastGameSettings(); // повторный вызов безопасен
  });
  it('ошибка записи localStorage не бросает исключение', () => {
    const orig = global.localStorage.setItem;
    global.localStorage.setItem = () => { throw new Error('quota'); };
    assert.doesNotThrow(() => setLastGameSettings(defaultGameSettings()));
    global.localStorage.setItem = orig;
  });
});
