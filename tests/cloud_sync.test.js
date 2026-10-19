import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudSync, errorText } from '../src/cloud_sync.js';
import { CloudError } from '../src/cloud_yandex.js';

const T0 = 1_800_000_000_000;
const TOKEN = 'abcdefghij0123456789';

function setup({ cloudText = null, cloudError = null, saveError = null, local = false, state = {}, applyOk = true } = {}) {
  let st = { token: TOKEN, expiresAt: T0 + 3_600_000, syncedExportedAt: null, syncedHash: '', ...state };
  const localData = { value: 'данные-1' };
  let clock = T0;
  const calls = { load: 0, save: [], apply: [] };
  const cloud = { text: cloudText };
  const sync = createCloudSync({
    makeClient: (token) => {
      assert.equal(token, st.token);
      return {
        async loadBackup() {
          calls.load++;
          if (cloudError) throw cloudError;
          if (cloud.text === null) throw new CloudError('not_found');
          return cloud.text;
        },
        async saveBackup(text) {
          if (saveError) throw saveError;
          calls.save.push(text);
          cloud.text = text;
        },
      };
    },
    getState: () => ({ ...st }),
    setState: (s) => { st = { ...s }; },
    snapshot: () => ({ text: JSON.stringify({ exportedAt: clock }), exportedAt: clock, hash: `h:${localData.value}`, summary: { games: 3 } }),
    parseText: (t) => {
      try { const j = JSON.parse(t); return { ok: true, exportedAt: j.exportedAt ?? null, summary: { games: 9 } }; } catch { return { ok: false }; }
    },
    applyText: (t) => { calls.apply.push(t); return { ok: applyOk }; },
    isLocalEmpty: () => !local,
    now: () => clock,
  });
  return { sync, calls, cloud, localData, state: () => st, tick: (ms) => { clock += ms; } };
}
const backup = (at) => JSON.stringify({ exportedAt: at });

test('без входа ничего не происходит', async () => {
  const s = setup({ state: { token: '', expiresAt: 0 }, local: true });
  assert.equal((await s.sync.check()).kind, 'no_auth');
  assert.equal((await s.sync.saveNow()).code, 'unauthorized');
  assert.equal((await s.sync.afterGame()).code, 'unauthorized');
  assert.equal(s.calls.load, 0);
  assert.equal(s.sync.status().connected, false);
});

test('устройство пустое, в облаке копия: предлагаем восстановить и ничего не пишем', async () => {
  const s = setup({ cloudText: backup(T0 - 1000), local: false });
  assert.equal((await s.sync.check()).kind, 'offer');
  assert.deepEqual(s.sync.status().pending, { mode: 'offer', cloudAt: T0 - 1000, cloud: { games: 9 }, local: { games: 3 } });
  assert.equal((await s.sync.afterGame()).code, 'pending');
  assert.equal((await s.sync.saveNow({ manual: true })).code, 'pending');
  assert.equal(s.calls.save.length, 0);
});

test('restore: данные применяются, версия запоминается', async () => {
  const s = setup({ cloudText: backup(T0 - 1000) });
  await s.sync.check();
  assert.deepEqual(s.sync.restore(), { ok: true });
  assert.equal(s.calls.apply.length, 1);
  assert.equal(s.state().syncedExportedAt, T0 - 1000);
  assert.equal(s.state().syncedHash, 'h:данные-1');          // отпечаток данных после замены
  assert.equal(s.sync.status().pending, null);
});

test('restore: сбой применения оставляет выбор открытым', async () => {
  const s = setup({ cloudText: backup(T0 - 1000), applyOk: false });
  await s.sync.check();
  assert.equal(s.sync.restore().code, 'apply');
  assert.ok(s.sync.status().pending);
  assert.equal(s.state().syncedExportedAt, null);
});

test('данные есть и там и там, версии не сходятся: спрашиваем', async () => {
  const s = setup({ cloudText: backup(T0 - 5000), local: true, state: { syncedExportedAt: T0 - 9000 } });
  assert.equal((await s.sync.check()).kind, 'ask');
  assert.equal(s.calls.save.length, 0);
});

test('первый вход, данные есть, а в облаке свежая копия: спрашиваем (syncedExportedAt пуст)', async () => {
  const s = setup({ cloudText: backup(T0 - 5000), local: true });
  assert.equal((await s.sync.check()).kind, 'ask');
});

test('keepLocal: облако заменяется данными устройства', async () => {
  const s = setup({ cloudText: backup(T0 - 5000), local: true });
  await s.sync.check();
  const r = await s.sync.keepLocal();
  assert.equal(r.ok, true);
  assert.equal(s.calls.save.length, 1);
  assert.equal(s.state().syncedExportedAt, T0);
  assert.equal(s.sync.status().pending, null);
});

test('keepLocal: при сбое записи выбор не теряется молча, ошибка видна', async () => {
  const s = setup({ cloudText: backup(T0 - 5000), local: true, saveError: new CloudError('network') });
  await s.sync.check();
  const r = await s.sync.keepLocal();
  assert.equal(r.code, 'network');
  assert.equal(s.sync.status().error, 'network');
});

test('версии совпали: расхождения нет, запись при запуске не нужна', async () => {
  const s = setup({ cloudText: backup(T0 - 5000), local: true, state: { syncedExportedAt: T0 - 5000 } });
  assert.equal((await s.sync.check()).kind, 'none');
  assert.equal(s.calls.save.length, 0);
});

test('в облаке файла нет, на устройстве данные: при запуске копия записывается', async () => {
  const s = setup({ cloudText: null, local: true });
  assert.equal((await s.sync.check()).kind, 'none');
  assert.equal(s.calls.save.length, 1);
  assert.equal(s.state().syncedExportedAt, T0);
});

test('в облаке файла нет и устройство пустое: ничего не пишем', async () => {
  const s = setup({ cloudText: null, local: false });
  assert.equal((await s.sync.check()).kind, 'none');
  assert.equal(s.calls.save.length, 0);
  assert.equal((await s.sync.saveNow({ manual: true })).code, 'empty');
});

test('afterGame: ограничение частоты записи 30 секунд, кнопка его не касается', async () => {
  const s = setup({ cloudText: null, local: true });
  await s.sync.check();                                  // первая запись
  s.tick(10_000);
  assert.equal((await s.sync.afterGame()).code, 'throttled');
  assert.equal(s.calls.save.length, 1);
  assert.equal((await s.sync.saveNow({ manual: true })).ok, true);
  s.tick(31_000);
  assert.equal((await s.sync.afterGame()).ok, true);
  assert.equal(s.calls.save.length, 3);
});

test('afterGame без проверки облака сначала сверяется с ним и не затирает чужую копию', async () => {
  const s = setup({ cloudText: backup(T0 + 1), local: true, state: { syncedExportedAt: T0 - 7 } });
  const r = await s.sync.afterGame();
  assert.equal(r.code, 'pending');
  assert.equal(s.calls.save.length, 0);
  assert.equal(s.sync.status().pending.mode, 'ask');
});

test('afterGame при недоступном облаке не пишет и сообщает причину', async () => {
  const s = setup({ cloudError: new CloudError('network'), local: true });
  const r = await s.sync.afterGame();
  assert.equal(r.code, 'network');
  assert.equal(s.calls.save.length, 0);
  assert.equal(s.sync.status().error, 'network');
  assert.equal(s.sync.status().connected, true);         // сеть — не повод разлогинивать
});

test('401 и 403 переводят вход в «устарел», токен остаётся, данные целы', async () => {
  for (const code of ['unauthorized', 'forbidden']) {
    const s = setup({ saveError: new CloudError(code), local: true, state: { syncedExportedAt: T0 } });
    const r = await s.sync.saveNow({ manual: true });
    assert.equal(r.code, code);
    const st = s.sync.status();
    assert.equal(st.connected, false);
    assert.equal(st.expired, true);
    assert.equal(s.state().token, TOKEN);
  }
});

test('истёкший по сроку токен: вход «устарел», запросов нет', async () => {
  const s = setup({ local: true, state: { expiresAt: T0 + 10_000 } });
  assert.equal(s.sync.status().expired, true);
  assert.equal((await s.sync.check()).kind, 'no_auth');
  assert.equal(s.calls.load, 0);
});

test('повреждённый файл в облаке: ошибка, автозапись его не затирает, кнопка — затирает', async () => {
  const s = setup({ cloudText: 'не json', local: true });
  const c = await s.sync.check();
  assert.deepEqual([c.kind, c.code], ['error', 'bad_file']);
  assert.equal((await s.sync.afterGame()).code, 'bad_file');
  assert.equal(s.calls.save.length, 0);
  assert.equal((await s.sync.saveNow({ manual: true })).ok, true);
  assert.equal(s.calls.save.length, 1);
});

test('файл без даты exportedAt считается нераспознанным', async () => {
  const s = setup({ cloudText: '{}', local: true });
  assert.equal((await s.sync.check()).code, 'bad_file');
});

test('параллельные записи: вторая отклоняется', async () => {
  const s = setup({ local: true });
  const [a, b] = await Promise.all([s.sync.saveNow({ manual: true }), s.sync.saveNow({ manual: true })]);
  assert.deepEqual([a.ok, b.code], [true, 'busy']);
});

test('logout удаляет токен и привязку к версии, данные устройства не затрагиваются', async () => {
  const s = setup({ cloudText: backup(T0 - 5000), local: true, state: { syncedExportedAt: T0 - 5000 } });
  s.sync.logout();
  assert.deepEqual(s.state(), { token: '', expiresAt: 0, syncedExportedAt: null, syncedHash: '' });
  assert.equal(s.sync.status().connected, false);
  assert.equal(s.sync.status().expired, false);
});

test('errorText: для каждого кода есть текст, для неизвестного — общий', () => {
  for (const c of ['unauthorized', 'forbidden', 'quota', 'rate', 'server', 'network', 'timeout', 'bad_response', 'too_large', 'bad_file', 'empty', 'pending', 'throttled', 'busy', 'apply']) {
    assert.ok(errorText(c).length > 5, c);
  }
  assert.match(errorText('???'), /Яндекс Диск/);
});

test('кнопка «Сохранить сейчас» не затирает версию, записанную с другого устройства', async () => {
  // Именно так пропали данные: телефон записал копию, ноутбук нажал «Сохранить сейчас» и заменил её
  const s = setup({ cloudText: backup(T0 - 500), local: true, state: { syncedExportedAt: T0 - 9000, syncedHash: 'h:данные-1' } });
  s.localData.value = 'данные-2';                              // на этом устройстве тоже играли
  const r = await s.sync.saveNow({ manual: true });
  assert.equal(r.code, 'pending');
  assert.equal(s.calls.save.length, 0);
  assert.equal(s.sync.status().pending.mode, 'ask');
});

test('автозапись после партии тоже сверяется с облаком перед записью', async () => {
  const s = setup({ cloudText: backup(T0 - 500), local: true, state: { syncedExportedAt: T0 - 9000, syncedHash: 'h:данные-1' } });
  s.localData.value = 'данные-2';
  assert.equal((await s.sync.afterGame()).code, 'pending');
  assert.equal(s.calls.save.length, 0);
});

test('версия облака та же, что видело устройство: запись идёт, облако читается один раз', async () => {
  const s = setup({ cloudText: backup(T0 - 500), local: true, state: { syncedExportedAt: T0 - 500, syncedHash: 'h:данные-1' } });
  s.localData.value = 'данные-2';
  assert.equal((await s.sync.afterGame()).ok, true);
  assert.equal(s.calls.load, 1);
  assert.equal(s.calls.save.length, 1);
  assert.equal(s.state().syncedHash, 'h:данные-2');
});

test('устройство не менялось, в облаке новее: данные подтягиваются без вопросов (kind auto)', async () => {
  const s = setup({ cloudText: backup(T0 - 500), local: true, state: { syncedExportedAt: T0 - 9000, syncedHash: 'h:данные-1' } });
  assert.equal((await s.sync.check()).kind, 'auto');
  assert.equal(s.calls.apply.length, 1);
  assert.equal(s.calls.save.length, 0);
  assert.equal(s.state().syncedExportedAt, T0 - 500);
  assert.equal(s.sync.status().pending, null);
});

test('устройство менялось и в облаке новее: спрашиваем, ничего не применяем и не пишем', async () => {
  const s = setup({ cloudText: backup(T0 - 500), local: true, state: { syncedExportedAt: T0 - 9000, syncedHash: 'h:данные-1' } });
  s.localData.value = 'данные-2';
  assert.equal((await s.sync.check()).kind, 'ask');
  assert.equal(s.calls.apply.length, 0);
  assert.equal(s.calls.save.length, 0);
});

test('«Сохранить сейчас» без изменений на устройстве при более новом облаке: данные обновляются (restored)', async () => {
  const s = setup({ cloudText: backup(T0 - 500), local: true, state: { syncedExportedAt: T0 - 9000, syncedHash: 'h:данные-1' } });
  assert.equal((await s.sync.saveNow({ manual: true })).code, 'restored');
  assert.equal(s.calls.save.length, 0);
});

test('сбой применения при подтяжке: данные не тронуты, ошибка показана, запись не идёт', async () => {
  const s = setup({ cloudText: backup(T0 - 500), local: true, applyOk: false, state: { syncedExportedAt: T0 - 9000, syncedHash: 'h:данные-1' } });
  const r = await s.sync.check();
  assert.deepEqual([r.kind, r.code], ['error', 'apply']);
  assert.equal(s.calls.save.length, 0);
  assert.equal(s.state().syncedExportedAt, T0 - 9000);
});

test('без отпечатка (прошлая версия приложения) считаем, что устройство менялось: спрашиваем', async () => {
  const s = setup({ cloudText: backup(T0 - 500), local: true, state: { syncedExportedAt: T0 - 9000, syncedHash: '' } });
  assert.equal((await s.sync.check()).kind, 'ask');
});

test('в облаке нет файла, а запись сверяется: облако читается и не мешает первой записи', async () => {
  const s = setup({ cloudText: null, local: true, state: { syncedExportedAt: T0 - 9000, syncedHash: 'h:x' } });
  assert.equal((await s.sync.saveNow({ manual: true })).ok, true);
  assert.equal(s.calls.save.length, 1);
});

test('сеть пропала при сверке: запись не выполняется (лучше не записать, чем затереть)', async () => {
  const s = setup({ cloudError: new CloudError('network'), local: true, state: { syncedExportedAt: T0, syncedHash: 'h:данные-1' } });
  assert.equal((await s.sync.saveNow({ manual: true })).code, 'network');
  assert.equal(s.calls.save.length, 0);
});
