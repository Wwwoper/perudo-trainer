// storage.test.js — тесты для storage.js
import { describe, it } from 'node:test';
import assert from 'node:assert';

// Мокируем localStorage
const mockStorage = {};
global.localStorage = {
  getItem: key => mockStorage[key] || null,
  setItem: (key, value) => { mockStorage[key] = value; },
  removeItem: key => { delete mockStorage[key]; },
};

import { get, set, getSettings, setSettings, getStats, setStats, updateStats, getTrainingQueue, migrateIfNeeded, getSchemaVersion, getMoments, setMoments, getPlayer, setPlayer, getDeviceState, setDeviceState, getCloudState, setCloudState } from '../src/storage.js';

describe('get/set', () => {
  it('сохраняет и загружает', () => {
    set('test.key', { value: 42 });
    assert.deepStrictEqual(get('test.key'), { value: 42 });
  });
  it('возвращает default', () => {
    assert.strictEqual(get('nonexistent', 'default'), 'default');
  });
});

describe('getSettings', () => {
  it('возвращает настройки по умолчанию', () => {
    mockStorage['perudo.settings'] = undefined;
    const s = getSettings();
    assert.strictEqual(s.assistMode, 'training');
    assert.strictEqual(s.botSpeed, 'normal');
  });
  it('обновляет настройки', () => {
    mockStorage['perudo.settings'] = undefined;
    setSettings({ assistMode: 'game' });
    assert.strictEqual(getSettings().assistMode, 'game');
  });
});

describe('getStats', () => {
  it('возвращает статистику по умолчанию', () => {
    mockStorage['perudo.userProfile'] = undefined;
    const s = getStats();
    assert.strictEqual(s.n, 0);
    assert.strictEqual(s.good, 0);
  });
});

describe('getTrainingQueue', () => {
  it('возвращает пустую очередь', () => {
    mockStorage['perudo.trainingQueue'] = undefined;
    assert.deepStrictEqual(getTrainingQueue(), []);
  });
});

describe('migrateIfNeeded', () => {
  it('инициализирует схему', () => {
    mockStorage['perudo.schemaVersion'] = undefined;
    migrateIfNeeded();
    assert.strictEqual(getSchemaVersion(), 1);
  });
});

describe('updateStats', () => {
  const reset = () => { mockStorage['perudo.userProfile'] = undefined; };

  it('меняет статистику и сохраняет результат', () => {
    reset();
    const res = updateStats((s) => { s.n += 1; s.good += 1; });
    assert.strictEqual(res.n, 1);
    assert.strictEqual(getStats().n, 1);
    assert.strictEqual(getStats().good, 1);
  });

  it('читает актуальное значение перед каждым изменением', () => {
    reset();
    updateStats((s) => { s.n += 1; });
    // другой раздел записал свои счётчики в промежутке
    const other = getStats();
    other.drill.A = { n: 3, good: 2 };
    setStats(other);
    updateStats((s) => { s.n += 1; });
    const s = getStats();
    assert.strictEqual(s.n, 2, 'свои счётчики копятся');
    assert.deepStrictEqual(s.drill.A, { n: 3, good: 2 }, 'чужие счётчики не затёрты');
  });

  it('не затирает счётчики партий', () => {
    reset();
    updateStats((s) => { s.totalGames = 4; s.totalWins = 3; });
    updateStats((s) => { s.n += 1; });
    assert.strictEqual(getStats().totalGames, 4);
    assert.strictEqual(getStats().totalWins, 3);
  });

  it('достраивает недостающие поля у старой записи', () => {
    reset();
    setStats({ n: 5, good: 2 });                // старый формат без byMode и drill
    updateStats((s) => { s.drill.B.n += 1; s.byMode.classic = { n: 1, good: 1 }; });
    const s = getStats();
    assert.strictEqual(s.n, 5);
    assert.strictEqual(s.drill.B.n, 1);
    assert.deepStrictEqual(s.drill.A, { n: 0, good: 0 });
    assert.deepStrictEqual(s.byMode.classic, { n: 1, good: 1 });
  });
});

describe('getMoments / setMoments', () => {
  const moment = (id, extra = {}) => ({
    id, ts: 1, round: 2, kind: 'dudo', n: 12, h: [1, 3, 5], myDice: 3,
    bid: { q: 6, f: 4 }, played: null, wild: true, p: 0.7, code: 'bad', lostDie: true, tags: ['dudo'], ...extra,
  });

  it('пустое хранилище даёт пустой список', () => {
    delete mockStorage['perudo.reviews'];
    assert.deepStrictEqual(getMoments(), []);
  });

  it('записанное читается обратно', () => {
    setMoments([moment('a'), moment('b')]);
    assert.deepStrictEqual(getMoments().map((m) => m.id), ['a', 'b']);
  });

  it('мусор и старый формат (объект) читаются как пустой список, падений нет', () => {
    mockStorage['perudo.reviews'] = JSON.stringify({ old: true });
    assert.deepStrictEqual(getMoments(), []);
    mockStorage['perudo.reviews'] = '{не json';
    assert.deepStrictEqual(getMoments(), []);
    mockStorage['perudo.reviews'] = JSON.stringify([1, 'x', null, moment('ok')]);
    assert.deepStrictEqual(getMoments().map((m) => m.id), ['ok']);
  });

  it('при записи лишнее отбрасывается и лимит соблюдается', () => {
    const many = Array.from({ length: 60 }, (_, i) => moment(`m${i}`));
    setMoments(many);
    const saved = JSON.parse(mockStorage['perudo.reviews']);
    assert.strictEqual(saved.length, 50);
    assert.strictEqual(saved[49].id, 'm59');
  });
});

describe('Игрок (имя и аватар)', () => {
  it('нет записи — игрок по умолчанию', () => {
    delete mockStorage['perudo.player'];
    assert.deepStrictEqual(getPlayer(), { name: '', avatar: null });
  });

  it('записанное читается обратно', () => {
    setPlayer({ name: 'Анна', avatar: { type: 'emoji', value: '🦊' } });
    assert.deepStrictEqual(getPlayer(), { name: 'Анна', avatar: { type: 'emoji', value: '🦊' } });
  });

  it('при записи лишнее отбрасывается', () => {
    setPlayer({ name: 'Анна', avatar: { type: 'emoji', value: '💩' }, extra: 1 });
    assert.deepStrictEqual(JSON.parse(mockStorage['perudo.player']), { name: 'Анна', avatar: null });
  });

  it('мусор в хранилище читается как игрок по умолчанию, падений нет', () => {
    for (const bad of ['{не json', '5', '"x"', '[1]', 'null']) {
      mockStorage['perudo.player'] = bad;
      assert.deepStrictEqual(getPlayer(), { name: '', avatar: null }, bad);
    }
  });
});

describe('Состояние устройства', () => {
  it('нет записи — значения по умолчанию', () => {
    delete mockStorage['perudo.device'];
    assert.deepStrictEqual(getDeviceState(), { nextAt: 5, persistTries: 0, account: null });
  });
  it('записанное читается, лишнее отбрасывается', () => {
    setDeviceState({ nextAt: 25, persistTries: 1, extra: true });
    assert.deepStrictEqual(JSON.parse(mockStorage['perudo.device']), { nextAt: 25, persistTries: 1, account: null });
    assert.deepStrictEqual(getDeviceState(), { nextAt: 25, persistTries: 1, account: null });
  });
  it('мусор в хранилище не ломает чтение', () => {
    for (const bad of ['{не json', '7', '"x"', '[1]']) {
      mockStorage['perudo.device'] = bad;
      assert.deepStrictEqual(getDeviceState(), { nextAt: 5, persistTries: 0, account: null }, bad);
    }
  });
});

describe('Состояние облака', () => {
  const TOKEN = 'y0__abcDEF123-_.xyz';
  it('нет записи — не вошли', () => {
    delete mockStorage['perudo.cloud'];
    assert.deepStrictEqual(getCloudState(), { token: '', expiresAt: 0, syncedExportedAt: null, syncedHash: '' });
  });
  it('записанное читается, мусорный токен отбрасывается', () => {
    setCloudState({ token: TOKEN, expiresAt: 99, syncedExportedAt: 5, x: 1 });
    assert.deepStrictEqual(getCloudState(), { token: TOKEN, expiresAt: 99, syncedExportedAt: 5, syncedHash: '' });
    setCloudState({ token: '<b>', expiresAt: 99, syncedExportedAt: 5 });
    assert.deepStrictEqual(getCloudState(), { token: '', expiresAt: 0, syncedExportedAt: 5, syncedHash: '' });
  });
  it('мусор в хранилище не ломает чтение', () => {
    for (const bad of ['{не json', '7', '"x"', '[1]']) {
      mockStorage['perudo.cloud'] = bad;
      assert.deepStrictEqual(getCloudState(), { token: '', expiresAt: 0, syncedExportedAt: null, syncedHash: '' }, bad);
    }
  });
});

describe('режим звука', () => {
  it('по умолчанию выключен и не ломается на мусоре', async () => {
    const { getSoundMode, setSoundMode } = await import('../src/storage.js');
    mockStorage['perudo.settings'] = undefined;
    delete mockStorage['perudo.settings'];
    assert.strictEqual(getSoundMode(), 'off');
    mockStorage['perudo.settings'] = JSON.stringify({ soundMode: 'loud' });
    assert.strictEqual(getSoundMode(), 'off');
    mockStorage['perudo.settings'] = '{не json';
    assert.strictEqual(getSoundMode(), 'off');
    setSoundMode('quiet');
    assert.strictEqual(getSoundMode(), 'quiet');
    setSoundMode('что-то');
    assert.strictEqual(getSoundMode(), 'off');
  });
  it('сохраняется вместе с остальными настройками', async () => {
    const { getSoundMode, setSoundMode } = await import('../src/storage.js');
    delete mockStorage['perudo.settings'];
    setSettings({ animations: 'off' });
    setSoundMode('normal');
    assert.strictEqual(getSettings().animations, 'off');
    assert.strictEqual(getSoundMode(), 'normal');
  });
});
