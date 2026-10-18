// cloud_policy.test.js — правила облачной копии (src/cloud_policy.js)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_SAVE_INTERVAL_MS, defaultCloudState, sanitizeCloudState, hasValidToken, isLocalDataEmpty, planSync, canSaveNow,
} from '../src/cloud_policy.js';

const TOKEN = 'y0__abcDEF123-_.xyz';

describe('sanitizeCloudState', () => {
  it('нет записи или мусор — состояние по умолчанию', () => {
    for (const v of [undefined, null, 5, 'x', [], true]) assert.deepEqual(sanitizeCloudState(v), defaultCloudState());
  });
  it('корректное состояние сохраняется', () => {
    const s = { token: TOKEN, expiresAt: 1000, syncedExportedAt: 500 };
    assert.deepEqual(sanitizeCloudState(s), s);
  });
  it('токен неверного вида отбрасывается вместе со сроком', () => {
    for (const token of ['', 'коротко', 'a b c d e f g h i j', '<script>alert(1)</script>', 'x'.repeat(400), 5, null]) {
      assert.deepEqual(sanitizeCloudState({ token, expiresAt: 1000, syncedExportedAt: 7 }), { token: '', expiresAt: 0, syncedExportedAt: 7 }, String(token));
    }
  });
  it('неверные времена заменяются', () => {
    const s = sanitizeCloudState({ token: TOKEN, expiresAt: 'завтра', syncedExportedAt: -1 });
    assert.deepEqual(s, { token: TOKEN, expiresAt: 0, syncedExportedAt: null });
  });
  it('лишние поля отбрасываются, повторная обработка ничего не меняет', () => {
    const once = sanitizeCloudState({ token: TOKEN, expiresAt: 9, syncedExportedAt: 3, admin: true });
    assert.ok(!('admin' in once));
    assert.deepEqual(sanitizeCloudState(once), once);
  });
});

describe('hasValidToken', () => {
  it('токен действует', () => assert.equal(hasValidToken({ token: TOKEN, expiresAt: 1_000_000 }, 0), true));
  it('нет токена', () => assert.equal(hasValidToken(defaultCloudState(), 0), false));
  it('срок вышел, и за минуту до срока тоже считается вышедшим', () => {
    assert.equal(hasValidToken({ token: TOKEN, expiresAt: 100_000 }, 100_001), false);
    assert.equal(hasValidToken({ token: TOKEN, expiresAt: 100_000 }, 100_000 - 59_000), false);
    assert.equal(hasValidToken({ token: TOKEN, expiresAt: 100_000 }, 100_000 - 61_000), true);
  });
  it('мусор — нет', () => assert.equal(hasValidToken(null), false));
});

describe('isLocalDataEmpty', () => {
  it('ничего нет — пусто', () => {
    assert.equal(isLocalDataEmpty({}), true);
    assert.equal(isLocalDataEmpty(), true);
    assert.equal(isLocalDataEmpty({ stats: { n: 0, totalGames: 0 }, games: [], queue: [], reviews: [] }), true);
  });
  it('любая из данных игры — не пусто', () => {
    for (const d of [{ stats: { n: 3 } }, { stats: { totalGames: 1 } }, { stats: { totalDecisions: 2 } },
      { games: [{}] }, { queue: [{}] }, { reviews: [{}] }]) {
      assert.equal(isLocalDataEmpty(d), false, JSON.stringify(d));
    }
  });
  it('неверные типы считаются нулём', () => {
    assert.equal(isLocalDataEmpty({ stats: { n: 'много' }, games: 'x', queue: null }), true);
  });
});

describe('planSync', () => {
  const T = 1000;
  it('в облаке файла нет: пустое устройство не пишем, с данными — пишем', () => {
    assert.deepEqual(planSync({ localEmpty: true, cloudExportedAt: null, syncedExportedAt: null }), { restore: 'none', upload: false });
    assert.deepEqual(planSync({ localEmpty: false, cloudExportedAt: null, syncedExportedAt: null }), { restore: 'none', upload: true });
  });
  it('устройство пустое, копия есть — предложить восстановить, ничего не писать', () => {
    assert.deepEqual(planSync({ localEmpty: true, cloudExportedAt: T, syncedExportedAt: null }), { restore: 'offer', upload: false });
    assert.deepEqual(planSync({ localEmpty: true, cloudExportedAt: T, syncedExportedAt: T }), { restore: 'offer', upload: false });
  });
  it('данные есть, версия облака та, с которой синхронизировались — пишем без вопросов', () => {
    assert.deepEqual(planSync({ localEmpty: false, cloudExportedAt: T, syncedExportedAt: T }), { restore: 'none', upload: true });
  });
  it('в облаке другая версия (писали с другого устройства) — спросить, не писать', () => {
    assert.deepEqual(planSync({ localEmpty: false, cloudExportedAt: T + 5, syncedExportedAt: T }), { restore: 'ask', upload: false });
  });
  it('первый вход на устройстве с данными, копия уже есть — спросить', () => {
    assert.deepEqual(planSync({ localEmpty: false, cloudExportedAt: T, syncedExportedAt: null }), { restore: 'ask', upload: false });
  });
  it('никогда не пишет в облако при вопросе или предложении', () => {
    for (const localEmpty of [true, false]) for (const cloud of [null, 1, 2]) for (const synced of [null, 1, 2]) {
      const r = planSync({ localEmpty, cloudExportedAt: cloud, syncedExportedAt: synced });
      if (r.restore !== 'none') assert.equal(r.upload, false, JSON.stringify({ localEmpty, cloud, synced }));
      if (localEmpty) assert.equal(r.upload, false);
    }
  });
});

describe('canSaveNow', () => {
  it('ещё не писали — можно', () => assert.equal(canSaveNow({ now: 5, lastSaveAt: null }), true));
  it('слишком рано — нельзя, ровно через интервал — можно', () => {
    assert.equal(canSaveNow({ now: 1000 + MIN_SAVE_INTERVAL_MS - 1, lastSaveAt: 1000 }), false);
    assert.equal(canSaveNow({ now: 1000 + MIN_SAVE_INTERVAL_MS, lastSaveAt: 1000 }), true);
  });
  it('неверное время — нельзя', () => assert.equal(canSaveNow({ now: NaN, lastSaveAt: null }), false));
});
