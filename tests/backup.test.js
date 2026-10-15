// backup.test.js — экспорт и импорт резервной копии (src/backup.js)
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  BACKUP_FORMAT, BACKUP_KEYS, BACKUP_VERSION, MAX_BACKUP_CHARS,
  buildBackup, serializeBackup, parseBackup, applyBackup,
} from '../src/backup.js';

const queueItem = { mode: 'classic', n: 12, h: [1, 3, 5], f: 3, q: 4, streak: 0 };
const sample = () => ({
  'perudo.settings': { assistMode: 'game', botSpeed: 'fast' },
  'perudo.userProfile': { n: 10, good: 7, byMode: { classic: { n: 10, good: 7 } }, drill: { A: { n: 1, good: 1 }, B: { n: 0, good: 0 } } },
  'perudo.botMemory': { version: 1, any: 'thing' },
  'perudo.games': [{ ts: 1, players: 4, rounds: 9, won: true, decisions: 20 }],
  'perudo.trainingQueue': [queueItem],
  'perudo.duelStats': { games: 3, wins: 2, moves: 6, dev: 1 },
});
const reader = (store) => (key) => (key in store ? store[key] : null);

describe('buildBackup', () => {
  it('кладёт известные данные в раздел data и метаданные', () => {
    const b = buildBackup(reader(sample()), 1234);
    assert.strictEqual(b.format, BACKUP_FORMAT);
    assert.strictEqual(b.version, BACKUP_VERSION);
    assert.strictEqual(b.exportedAt, 1234);
    assert.deepStrictEqual(Object.keys(b.data).sort(), Object.keys(sample()).sort());
  });

  it('пропускает отсутствующие значения', () => {
    const b = buildBackup(reader({ 'perudo.settings': { a: 1 } }), 1);
    assert.deepStrictEqual(Object.keys(b.data), ['perudo.settings']);
  });

  it('включает настройки и память ботов (раньше их в копии не было)', () => {
    assert.ok(BACKUP_KEYS.includes('perudo.settings'));
    assert.ok(BACKUP_KEYS.includes('perudo.botMemory'));
  });
});

describe('parseBackup: круг экспорт → импорт', () => {
  it('возвращает те же данные', () => {
    const text = serializeBackup(buildBackup(reader(sample()), 99));
    const r = parseBackup(text);
    assert.ok(r.ok);
    assert.deepStrictEqual(r.data, sample());
    assert.strictEqual(r.exportedAt, 99);
    assert.strictEqual(r.legacy, false);
    assert.deepStrictEqual(r.skipped, []);
  });

  it('неизвестные ключи игнорируются и перечисляются', () => {
    const text = JSON.stringify({ format: BACKUP_FORMAT, version: 2, data: { ...sample(), 'perudo.other': 1, evil: 2 } });
    const r = parseBackup(text);
    assert.ok(r.ok);
    assert.deepStrictEqual(r.skipped.sort(), ['evil', 'perudo.other']);
    assert.ok(!('evil' in r.data));
  });

  it('значения null пропускаются', () => {
    const text = JSON.stringify({ format: BACKUP_FORMAT, version: 2, data: { 'perudo.settings': null, 'perudo.games': [] } });
    const r = parseBackup(text);
    assert.ok(r.ok);
    assert.deepStrictEqual(Object.keys(r.data), ['perudo.games']);
  });
});

describe('parseBackup: старый формат (версия 1)', () => {
  it('приводит stats, queue, games, duel к ключам хранилища', () => {
    const s = sample();
    const text = JSON.stringify({
      schemaVersion: 1, exportedAt: 5,
      stats: s['perudo.userProfile'], queue: s['perudo.trainingQueue'],
      games: s['perudo.games'], duel: s['perudo.duelStats'],
    });
    const r = parseBackup(text);
    assert.ok(r.ok);
    assert.strictEqual(r.legacy, true);
    assert.deepStrictEqual(r.data['perudo.userProfile'], s['perudo.userProfile']);
    assert.deepStrictEqual(r.data['perudo.trainingQueue'], s['perudo.trainingQueue']);
    assert.deepStrictEqual(r.data['perudo.games'], s['perudo.games']);
    assert.deepStrictEqual(r.data['perudo.duelStats'], s['perudo.duelStats']);
    assert.ok(!('perudo.settings' in r.data));
  });
});

describe('parseBackup: отказы', () => {
  const bad = (text) => { const r = parseBackup(text); assert.strictEqual(r.ok, false); return r.error; };

  it('пустой и не-строка', () => {
    assert.match(bad(''), /пустой/);
    assert.match(bad('   '), /пустой/);
    assert.strictEqual(parseBackup(undefined).ok, false);
    assert.strictEqual(parseBackup(42).ok, false);
  });

  it('не JSON', () => assert.match(bad('{oops'), /не JSON/));

  it('JSON, но не копия', () => {
    assert.match(bad('[]'), /не копия/);
    assert.match(bad('"строка"'), /не копия/);
    assert.match(bad('{"hello":1}'), /не копия/);
  });

  it('копия более новой версии', () => {
    assert.match(bad(JSON.stringify({ format: BACKUP_FORMAT, version: 99, data: {} })), /новой версией/);
  });

  it('нет версии или раздела данных', () => {
    assert.match(bad(JSON.stringify({ format: BACKUP_FORMAT, data: {} })), /версия/);
    assert.match(bad(JSON.stringify({ format: BACKUP_FORMAT, version: 2 })), /раздела данных/);
  });

  it('пустая копия', () => {
    assert.match(bad(JSON.stringify({ format: BACKUP_FORMAT, version: 2, data: {} })), /нет данных/);
    assert.match(bad(JSON.stringify({ format: BACKUP_FORMAT, version: 2, data: { evil: 1 } })), /нет данных/);
  });

  it('повреждённые значения: каждый ключ проверяется', () => {
    const wrap = (data) => JSON.stringify({ format: BACKUP_FORMAT, version: 2, data });
    assert.match(bad(wrap({ 'perudo.userProfile': [] })), /статистика/);
    assert.match(bad(wrap({ 'perudo.userProfile': { n: 'много' } })), /поле n/);
    assert.match(bad(wrap({ 'perudo.games': {} })), /история партий/);
    assert.match(bad(wrap({ 'perudo.games': [1] })), /записи не того вида/);
    assert.match(bad(wrap({ 'perudo.trainingQueue': [{ mode: 'x' }] })), /очереди повторов/);
    assert.match(bad(wrap({ 'perudo.duelStats': { games: 'a' } })), /дуэли/);
    assert.match(bad(wrap({ 'perudo.settings': [] })), /настройки/);
    assert.match(bad(wrap({ 'perudo.botMemory': 5 })), /память ботов/);
    assert.match(bad(wrap({ 'perudo.reviews': 5 })), /разбор партий/);
    assert.match(bad(wrap({ 'perudo.reviews': { a: 1 } })), /разбор партий/);
    assert.match(bad(wrap({ 'perudo.reviews': [1] })), /записи не того вида/);
  });

  it('разбор партий: список и пустой объект из первых копий принимаются', () => {
    const wrap = (data) => JSON.stringify({ format: BACKUP_FORMAT, version: 2, data });
    assert.strictEqual(parseBackup(wrap({ 'perudo.reviews': [] })).ok, true);
    assert.strictEqual(parseBackup(wrap({ 'perudo.reviews': [{ id: 'a' }] })).ok, true);
    assert.strictEqual(parseBackup(wrap({ 'perudo.reviews': {} })).ok, true);
  });

  it('слишком большой файл', () => {
    assert.match(bad('x'.repeat(MAX_BACKUP_CHARS + 1)), /слишком большой/);
  });

  it('__proto__ в данных не отравляет прототип', () => {
    const text = '{"format":"perudo-backup","version":2,"data":{"perudo.settings":{"__proto__":{"polluted":true}},"__proto__":{"x":1}}}';
    const r = parseBackup(text);
    assert.strictEqual({}.polluted, undefined);
    assert.strictEqual({}.x, undefined);
    assert.ok(r.ok);
    assert.strictEqual(Object.getPrototypeOf(r.data), Object.prototype);
    assert.deepStrictEqual(r.skipped, ['__proto__']);
  });
});

describe('applyBackup', () => {
  it('записывает ключи из копии и удаляет остальные известные', () => {
    const store = { 'perudo.settings': { old: 1 }, 'perudo.games': [{ ts: 1 }], 'perudo.duelStats': { games: 9 }, foreign: 'stay' };
    const r = parseBackup(JSON.stringify({
      format: BACKUP_FORMAT, version: 2,
      data: { 'perudo.games': [{ ts: 2 }], 'perudo.userProfile': { n: 1, good: 1 } },
    }));
    const out = applyBackup(r.data,
      (k, v) => { store[k] = v; },
      (k) => { delete store[k]; });
    assert.deepStrictEqual(store['perudo.games'], [{ ts: 2 }]);
    assert.deepStrictEqual(store['perudo.userProfile'], { n: 1, good: 1 });
    assert.ok(!('perudo.settings' in store));
    assert.ok(!('perudo.duelStats' in store));
    assert.strictEqual(store.foreign, 'stay');
    assert.deepStrictEqual(out.written.sort(), ['perudo.games', 'perudo.userProfile']);
    assert.strictEqual(out.removed.length, BACKUP_KEYS.length - 2);
  });
});
