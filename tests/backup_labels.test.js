import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BACKUP_SAVE_LABEL, BACKUP_RESTORE_LABEL } from '../src/backup_labels.js';
import { describePersistence } from '../src/persistence.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('названия кнопок резервной копии', () => {
  it('кнопки в index.html называются по цели, а не по формату', () => {
    const html = read('index.html');
    assert.match(html, new RegExp(`<button id="stExport">${BACKUP_SAVE_LABEL}</button>`));
    assert.match(html, new RegExp(`<button id="stImport">${BACKUP_RESTORE_LABEL}</button>`));
    assert.doesNotMatch(html, /Экспорт JSON|Импорт JSON/);
  });
  it('JSON упомянут вторым уровнем: поясняющим текстом, а не названием кнопки', () => {
    const html = read('index.html');
    const sec = html.slice(html.indexOf('<b>Копия в файле</b>'), html.indexOf('id="stBackupMsg"'));
    assert.match(sec, /JSON/);
    assert.doesNotMatch(sec.match(/<button[^>]*>[^<]*<\/button>/g).join(''), /JSON/);
  });
  it('подсказка о сохранности ссылается на название кнопки', () => {
    assert.ok(describePersistence(false).includes(`«${BACKUP_SAVE_LABEL}»`));
  });
  it('руководство называет обе кнопки теми же словами и не использует старые названия', () => {
    const data = text(read('docs/guide/data.html'));
    assert.ok(data.includes(`«${BACKUP_SAVE_LABEL}»`));
    assert.ok(data.includes(`«${BACKUP_RESTORE_LABEL}»`));
    for (const f of ['data.html', 'stats.html', 'game-settings.html']) {
      assert.doesNotMatch(text(read(`docs/guide/${f}`)), /Экспорт JSON|Импорт JSON/, f);
    }
    assert.doesNotMatch(read('README.md'), /Экспорт JSON|Импорт JSON/);
  });
});
