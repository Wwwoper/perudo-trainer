// make_profile.test.js — тестовый профиль из tools/make_profile.py укладывается в схему приложения и не устаревает.
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseBackup, BACKUP_KEYS } from '../src/backup.js';
import { MAX_GAMES, MAX_QUEUE, MAX_KEYS, MAX_COUNT } from '../src/data_schema.js';
import { MAX_MOMENTS } from '../src/moments.js';
import { MAX_ROUNDS, MAX_ROUND_BIDS } from '../src/rounds.js';

const ROOT = new URL('..', import.meta.url);
const text = readFileSync(new URL('../tools/profiles/perudo-backup-max.json', import.meta.url), 'utf8');
const raw = JSON.parse(text);
const parsed = parseBackup(text);

describe('тестовый профиль «max»', () => {
  it('пределы в генераторе совпадают с кодом приложения', () => {
    const py = execFileSync('python3', ['-I', '-c',
      'import sys,json;sys.path.insert(0,"tools");import make_profile as m;print(json.dumps(m.LIMITS))'],
    { cwd: ROOT, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(py), {
      MAX_GAMES, MAX_MOMENTS, MAX_ROUNDS, MAX_QUEUE, MAX_KEYS, MAX_ROUND_BIDS, MAX_COUNT,
    });
  });

  it('проходит parseBackup без отброшенных записей и пропущенных разделов', () => {
    assert.equal(parsed.ok, true);
    assert.equal(parsed.dropped, 0);
    assert.deepEqual(parsed.skipped, []);
  });

  it('проверка ничего не меняет: файл уже в том виде, который хранит приложение', () => {
    assert.deepEqual(parsed.data, raw.data);
  });

  it('есть все разделы копии, кроме служебных, которые приложение не читает', () => {
    const opaque = ['perudo.tutorialProgress', 'perudo.characters', 'perudo.characterMemories'];
    assert.deepEqual(BACKUP_KEYS.filter((k) => !(k in raw.data)).sort(), opaque.sort());
  });

  it('списки и таблицы доведены до предела', () => {
    const d = raw.data;
    assert.equal(d['perudo.games'].length, MAX_GAMES);
    assert.equal(d['perudo.reviews'].length, MAX_MOMENTS);
    assert.equal(d['perudo.rounds'].length, MAX_ROUNDS);
    assert.equal(d['perudo.trainingQueue'].length, MAX_QUEUE);
    assert.equal(Object.keys(d['perudo.userProfile'].byMode).length, MAX_KEYS);
    assert.equal(Object.keys(d['perudo.userProfile'].byTag).length, MAX_KEYS);
    assert.equal(Math.max(...d['perudo.rounds'].map((r) => r.bids.length)), MAX_ROUND_BIDS);
    assert.ok(Object.keys(d['perudo.userProfile'].byMode).some((k) => k.length === 64), 'есть ключ предельной длины');
  });

  it('разные виды записей представлены', () => {
    const d = raw.data;
    assert.deepEqual([...new Set(d['perudo.reviews'].map((m) => m.kind))].sort(), ['calza', 'dudo', 'raise']);
    assert.deepEqual([...new Set(d['perudo.rounds'].map((r) => r.end.kind))].sort(), ['calza', 'dudo']);
    assert.deepEqual([...new Set(d['perudo.trainingQueue'].map((q) => q.mode))].sort(),
      ['big', 'classic', 'endgame', 'ladder', 'nowild', 'solo']);
  });

  it('файл в репозитории совпадает с генератором (после правок схемы: python3 tools/make_profile.py)', () => {
    const out = execFileSync('python3', ['-I', 'tools/make_profile.py', '--check'], { cwd: ROOT, encoding: 'utf8' });
    assert.match(out, /актуален/);
  });

  it('размер в пределах, которые принимает импорт', () => {
    assert.ok(text.length < 1024 * 1024, `размер ${text.length}`);
  });
});
