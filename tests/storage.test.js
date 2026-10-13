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

import { get, set, getSettings, setSettings, getStats, setStats, updateStats, getTrainingQueue, migrateIfNeeded, getSchemaVersion } from '../src/storage.js';

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
