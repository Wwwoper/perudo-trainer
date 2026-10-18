// persistence.test.js — запрос постоянного хранилища (src/persistence.js)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { requestPersistence, readPersisted, describePersistence } from '../src/persistence.js';

const fake = ({ persisted = false, grant = true, throws = false } = {}) => {
  const calls = [];
  return {
    calls,
    persisted: async () => { if (throws) throw new Error('x'); return persisted; },
    persist: async () => { calls.push('persist'); if (throws) throw new Error('x'); return grant; },
  };
};

describe('requestPersistence', () => {
  it('браузер не умеет — unsupported', async () => {
    for (const s of [undefined, null, {}, { persist: 5 }]) assert.equal(await requestPersistence(s), 'unsupported');
  });
  it('уже защищено — запрос не повторяется', async () => {
    const s = fake({ persisted: true });
    assert.equal(await requestPersistence(s), 'granted');
    assert.deepEqual(s.calls, []);
  });
  it('браузер разрешил / отказал', async () => {
    assert.equal(await requestPersistence(fake({ grant: true })), 'granted');
    assert.equal(await requestPersistence(fake({ grant: false })), 'denied');
  });
  it('без persisted() тоже работает', async () => {
    assert.equal(await requestPersistence({ persist: async () => true }), 'granted');
  });
  it('исключение — error, а не падение', async () => {
    assert.equal(await requestPersistence(fake({ throws: true })), 'error');
  });
});

describe('readPersisted / describePersistence', () => {
  it('значения и сбои', async () => {
    assert.equal(await readPersisted(fake({ persisted: true })), true);
    assert.equal(await readPersisted(fake({ persisted: false })), false);
    assert.equal(await readPersisted(fake({ throws: true })), null);
    assert.equal(await readPersisted(null), null);
    assert.equal(await readPersisted({ persisted: async () => 'да' }), null);
  });
  it('тексты для показа', () => {
    assert.match(describePersistence(true), /защищено/);
    assert.match(describePersistence(false), /Экспорт JSON/);
    assert.equal(describePersistence(null), null);
    assert.equal(describePersistence(undefined), null);
  });
});
