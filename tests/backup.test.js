// backup.test.js — экспорт и импорт резервной копии (src/backup.js)
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  BACKUP_FORMAT, BACKUP_KEYS, BACKUP_VERSION, MAX_BACKUP_CHARS,
  buildBackup, serializeBackup, parseBackup, applyBackup,
} from '../src/backup.js';

const queueItem = { mode: 'classic', n: 12, h: [1, 3, 5], f: 3, q: 4, streak: 0 };
const gameRec = (ts = 1) => ({ ts, players: 4, startDice: 5, rounds: 9, won: true, decisions: 20, calza: false, palifico: false });
const stats = (o = {}) => ({
  n: 10, good: 7, totalGames: 0, totalWins: 0, totalDecisions: 0, goodDecisions: 0,
  byMode: { classic: { n: 10, good: 7 } }, drill: { A: { n: 1, good: 1 }, B: { n: 0, good: 0 } }, ...o,
});
const sample = () => ({
  'perudo.settings': { assistMode: 'game', botSpeed: 'fast' },
  'perudo.userProfile': stats(),
  'perudo.botMemory': { v: 1, challenged: 4, bluffs: 1 },
  'perudo.games': [gameRec()],
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
    const b = buildBackup(reader({ 'perudo.settings': { assistMode: 'game' } }), 1);
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

  it('файл, где все разделы повреждены, отклоняется', () => {
    const wrap = (data) => JSON.stringify({ format: BACKUP_FORMAT, version: 2, data });
    for (const [key, value] of [
      ['perudo.userProfile', []], ['perudo.games', {}], ['perudo.games', [1]], ['perudo.trainingQueue', [{ mode: 'x' }]],
      ['perudo.duelStats', 'a'], ['perudo.settings', []], ['perudo.botMemory', 5], ['perudo.reviews', 5],
      ['perudo.reviews', { a: 1 }], ['perudo.reviews', [1]], ['perudo.userProfile', { n: 'много' }],
    ]) {
      const r = parseBackup(wrap({ [key]: value }));
      assert.strictEqual(r.ok, false, `${key}: ${JSON.stringify(value)}`);
      assert.match(r.error, /повреждена/);
    }
  });

  it('повреждённые записи пропускаются и считаются, остальное восстанавливается', () => {
    const text = JSON.stringify({ format: BACKUP_FORMAT, version: 2, data: {
      'perudo.games': [gameRec(1), { ts: 'x' }, null, gameRec(2)],
      'perudo.trainingQueue': [queueItem, { mode: 'zzz' }],
      'perudo.userProfile': { n: 5, good: 9, byMode: { ok: { n: 1, good: 1 }, bad: 7 } },
      'perudo.duelStats': { games: 3, wins: 2, moves: 6, dev: 1 },
    } });
    const r = parseBackup(text);
    assert.ok(r.ok);
    assert.deepStrictEqual(r.data['perudo.games'], [gameRec(1), gameRec(2)]);
    assert.deepStrictEqual(r.data['perudo.trainingQueue'], [queueItem]);
    assert.deepStrictEqual(r.data['perudo.userProfile'].byMode, { ok: { n: 1, good: 1 } });
    assert.strictEqual(r.data['perudo.userProfile'].good, 5);
    assert.strictEqual(r.dropped, 2 + 1 + 1);
  });

  it('чистая копия: dropped = 0', () => {
    assert.strictEqual(parseBackup(serializeBackup(buildBackup(reader(sample()), 1))).dropped, 0);
  });

  it('статистика с byTag принимается', () => {
    const wrap = (data) => JSON.stringify({ format: BACKUP_FORMAT, version: 2, data });
    assert.strictEqual(parseBackup(wrap({ 'perudo.userProfile': { n: 1, good: 1, byTag: { dudo: { n: 2, good: 1 } } } })).ok, true);
    assert.strictEqual(parseBackup(wrap({ 'perudo.userProfile': { n: 1, good: 1, byTag: {} } })).ok, true);
  });

  it('разбор партий: список и пустой объект из первых копий принимаются', () => {
    const wrap = (data) => JSON.stringify({ format: BACKUP_FORMAT, version: 2, data });
    assert.strictEqual(parseBackup(wrap({ 'perudo.reviews': [] })).ok, true);
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
      data: { 'perudo.games': [gameRec(2)], 'perudo.userProfile': { n: 1, good: 1 } },
    }));
    const out = applyBackup(r.data,
      (k, v) => { store[k] = v; },
      (k) => { delete store[k]; });
    assert.deepStrictEqual(store['perudo.games'], [gameRec(2)]);
    assert.deepStrictEqual(store['perudo.userProfile'], stats({ n: 1, good: 1, byMode: {}, drill: { A: { n: 0, good: 0 }, B: { n: 0, good: 0 } } }));
    assert.ok(!('perudo.settings' in store));
    assert.ok(!('perudo.duelStats' in store));
    assert.strictEqual(store.foreign, 'stay');
    assert.deepStrictEqual(out.written.sort(), ['perudo.games', 'perudo.userProfile']);
    assert.strictEqual(out.removed.length, BACKUP_KEYS.length - 2);
  });
});

describe('Игрок в копии', () => {
  const player = { name: 'Анна', avatar: { type: 'emoji', value: '🦊' } };

  it('входит в копию и восстанавливается', () => {
    assert.ok(BACKUP_KEYS.includes('perudo.player'));
    const b = buildBackup(reader({ ...sample(), 'perudo.player': player }), 1);
    assert.deepStrictEqual(b.data['perudo.player'], player);
    const r = parseBackup(serializeBackup(b));
    assert.ok(r.ok);
    assert.deepStrictEqual(r.data['perudo.player'], player);
  });

  it('версия копии прежняя: старые копии без игрока читаются', () => {
    assert.strictEqual(BACKUP_VERSION, 2);
    const r = parseBackup(serializeBackup(buildBackup(reader(sample()), 1)));
    assert.ok(r.ok);
    assert.ok(!('perudo.player' in r.data));
  });

  it('импорт копии без игрока удаляет текущего (данные заменяются целиком)', () => {
    const r = parseBackup(serializeBackup(buildBackup(reader(sample()), 1)));
    const removed = [];
    applyBackup(r.data, () => {}, (k) => removed.push(k));
    assert.ok(removed.includes('perudo.player'));
  });

  it('не объект и слишком большая запись заменяются профилем по умолчанию и считаются', () => {
    const wrap = (v) => JSON.stringify({ format: BACKUP_FORMAT, version: 2, data: { 'perudo.player': v, 'perudo.games': [] } });
    for (const v of ['Анна', [1], { name: 'x'.repeat(30000) }]) {
      const r = parseBackup(wrap(v));
      assert.ok(r.ok);
      assert.strictEqual(r.dropped, 1);
      assert.deepStrictEqual(r.data['perudo.player'], { name: '', avatar: null });
    }
  });
});

describe('Состояние устройства не входит в копию', () => {
  it('ключ perudo.device не в списке и при импорте игнорируется', () => {
    assert.ok(!BACKUP_KEYS.includes('perudo.device'));
    assert.ok(!BACKUP_KEYS.includes('perudo.cloud'), 'токен облака не должен попадать в файл копии');
    const text = JSON.stringify({ format: BACKUP_FORMAT, version: 2, data: { 'perudo.settings': { a: 1 }, 'perudo.device': { nextAt: 1 } } });
    const r = parseBackup(text);
    assert.ok(r.ok);
    assert.deepStrictEqual(r.skipped, ['perudo.device']);
    assert.ok(!('perudo.device' in r.data));
  });

  it('чужой файл не может подсунуть токен облака', () => {
    const text = JSON.stringify({ format: BACKUP_FORMAT, version: 2, data: { 'perudo.settings': { a: 1 }, 'perudo.cloud': { token: 'y0__evil-token-123' } } });
    const r = parseBackup(text);
    assert.ok(r.ok);
    assert.deepStrictEqual(r.skipped, ['perudo.cloud']);
    assert.ok(!('perudo.cloud' in r.data));
  });
});

describe('buildBackup: проверка перед экспортом и отправкой в облако', () => {
  it('мусор из хранилища очищается, в копию попадает допустимое', () => {
    const b = buildBackup(reader({
      'perudo.games': [gameRec(1), { ts: 'x' }],
      'perudo.userProfile': { n: -4, evil: 1 },
      'perudo.settings': { assistMode: 'hack', soundMode: 'quiet', other: 1 },
    }), 1);
    assert.deepStrictEqual(b.data['perudo.games'], [gameRec(1)]);
    assert.strictEqual(b.data['perudo.userProfile'].n, 0);
    assert.ok(!('evil' in b.data['perudo.userProfile']));
    assert.deepStrictEqual(b.data['perudo.settings'], { soundMode: 'quiet' });
  });
  it('результат разбирается без потерь: сборка → разбор → те же данные, dropped = 0', () => {
    const b = buildBackup(reader({ 'perudo.games': [gameRec(1), null], 'perudo.duelStats': { games: 2, wins: 5 } }), 1);
    const r = parseBackup(serializeBackup(b));
    assert.deepStrictEqual(r.data, b.data);
    assert.strictEqual(r.dropped, 0);
  });
});
