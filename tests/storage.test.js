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

import { get, set, getSettings, setSettings, getStats, getTrainingQueue, migrateIfNeeded, getSchemaVersion } from '../src/storage.js';

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
