// data_roundtrip.test.js — круг «хранилище → копия (файл, облако) → хранилище» на испорченных данных.
// Главное свойство: что бы ни лежало в хранилище или в файле, приложение не падает, а то, что попало в копию
// и вернулось из неё, уже чистое: повторная проверка ничего не находит.
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { BACKUP_KEYS, buildBackup, serializeBackup, parseBackup, applyBackup } from '../src/backup.js';
import { SANITIZERS } from '../src/data_schema.js';

let seed = 2027;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (list) => list[Math.floor(rnd() * list.length)];

const GOOD = {
  'perudo.settings': { assistMode: 'game', botSpeed: 'fast', soundMode: 'quiet', lastGame: { bots: 4 } },
  'perudo.userProfile': { n: 10, good: 7, totalGames: 3, totalWins: 1, byMode: { classic: { n: 10, good: 7 } }, byTag: { dudo: { n: 2, good: 1 } }, drill: { A: { n: 1, good: 1 }, B: { n: 0, good: 0 } } },
  'perudo.player': { name: 'Анна', avatar: { type: 'emoji', value: '🦊' } },
  'perudo.botMemory': { v: 1, challenged: 6, bluffs: 2 },
  'perudo.games': [{ ts: 1, players: 4, startDice: 5, rounds: 9, won: true, decisions: 20, calza: false, palifico: false }],
  'perudo.reviews': [],
  'perudo.trainingQueue': [{ mode: 'classic', n: 12, h: [1, 3, 5], f: 3, q: 4, streak: 0 }],
  'perudo.tutorialProgress': { done: [1, 2] },
  'perudo.duelStats': { games: 3, wins: 2, moves: 6, dev: 1 },
  'perudo.characters': [],
  'perudo.characterMemories': {},
};

const JUNK = [null, undefined, NaN, -1, 1e40, 'x', '', true, false, [], {}, [1, 'a', null], { n: 'a' }, { __proto__: null, a: 1 }, 3.5, 0];

/** Портит значение: заменяет целиком или портит случайные вложенные поля. */
function corrupt(value, depth = 0) {
  if (rnd() < 0.25 || depth > 3) return pick(JUNK);
  if (Array.isArray(value)) {
    const out = value.map((v) => (rnd() < 0.4 ? corrupt(v, depth + 1) : v));
    if (rnd() < 0.3) out.push(pick(JUNK));
    return out;
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) if (rnd() > 0.15) out[k] = rnd() < 0.4 ? corrupt(v, depth + 1) : v;
    if (rnd() < 0.3) out[pick(['evil', 'zzz', 'n', 'good'])] = pick(JUNK);
    return out;
  }
  return rnd() < 0.5 ? pick(JUNK) : value;
}

const clone = (v) => JSON.parse(JSON.stringify(v));

describe('круг хранилище → копия → хранилище', () => {
  it('каждый ключ копии имеет проверку и годные данные проходят без потерь', () => {
    assert.deepStrictEqual(BACKUP_KEYS.slice().sort(), Object.keys(SANITIZERS).sort());
    assert.deepStrictEqual(BACKUP_KEYS.slice().sort(), Object.keys(GOOD).sort());
    const b = buildBackup((k) => GOOD[k] ?? null, 1);
    const r = parseBackup(serializeBackup(b));
    assert.ok(r.ok);
    assert.strictEqual(r.dropped, 0);
    for (const k of BACKUP_KEYS) assert.deepStrictEqual(SANITIZERS[k](GOOD[k]).dropped, 0, k);
  });

  it('испорченное хранилище: экспорт не падает, импорт результата чистый (400 случайных состояний)', () => {
    for (let i = 0; i < 400; i++) {
      const store = {};
      for (const k of BACKUP_KEYS) if (rnd() < 0.8) store[k] = corrupt(clone(GOOD[k]));
      const backup = buildBackup((k) => (k in store ? store[k] : null), 1);
      const text = serializeBackup(backup);
      const r = parseBackup(text);
      if (!r.ok) {                                 // допустимо только если пусто или всё потеряно
        assert.match(r.error, /нет данных|ни один раздел/);
        continue;
      }
      assert.strictEqual(r.dropped, 0, `после сборки копии повреждений быть не должно (случай ${i})`);
      assert.deepStrictEqual(r.data, backup.data);

      const written = {};
      applyBackup(r.data, (k, v) => { written[k] = clone(v); }, (k) => { delete written[k]; });
      for (const k of Object.keys(written)) assert.deepStrictEqual(SANITIZERS[k](written[k]), { value: written[k], dropped: 0 }, k);
    }
  });

  it('испорченный файл: разбор не падает, а принятые данные чистые (400 случайных файлов)', () => {
    let accepted = 0;
    for (let i = 0; i < 400; i++) {
      const data = {};
      for (const k of BACKUP_KEYS) if (rnd() < 0.8) data[k] = corrupt(clone(GOOD[k]));
      const text = JSON.stringify({ format: 'perudo-backup', version: 2, exportedAt: 1, data });
      const r = parseBackup(text);
      if (!r.ok) {
        assert.strictEqual(typeof r.error, 'string');
        continue;
      }
      accepted++;
      assert.ok(Number.isInteger(r.dropped) && r.dropped >= 0);
      for (const k of Object.keys(r.data)) assert.deepStrictEqual(SANITIZERS[k](r.data[k]), { value: r.data[k], dropped: 0 }, k);
    }
    assert.ok(accepted > 100, 'большинство частично испорченных файлов должно приниматься');
  });

  it('служебные ключи в файле не попадают в данные', () => {
    const text = '{"format":"perudo-backup","version":2,"data":{"perudo.userProfile":{"n":1,"good":1,"byMode":{"__proto__":{"n":1,"good":1},"a":{"n":1,"good":1}}},"perudo.characters":{"__proto__":{"x":1},"a":1}}}';
    const r = parseBackup(text);
    assert.ok(r.ok);
    assert.strictEqual({}.x, undefined);
    assert.deepStrictEqual(Object.keys(r.data['perudo.userProfile'].byMode), ['a']);
    assert.deepStrictEqual(r.data['perudo.characters'], { a: 1 });
  });
});
