// changelog.test.js — CHANGELOG.md не отстаёт от версии проекта и записан в правильном формате.
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const text = readFileSync(new URL('CHANGELOG.md', root), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const readme = readFileSync(new URL('README.md', root), 'utf8');

const versions = [...text.matchAll(/^## \[(\d+\.\d+\.\d+)\] — (\d{4}-\d{2}-\d{2})$/gm)]
  .map((m) => ({ v: m[1], date: m[2] }));

describe('CHANGELOG.md', () => {
  it('верхняя запись — текущая версия из package.json', () => {
    assert.ok(versions.length > 0, 'нет ни одной записи вида «## [x.y.z] — ГГГГ-ММ-ДД»');
    assert.strictEqual(versions[0].v, pkg.version);
  });
  it('версии не повторяются и идут от новых к старым', () => {
    const cmp = (a, b) => {
      const pa = a.split('.').map(Number); const pb = b.split('.').map(Number);
      for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
      return 0;
    };
    for (let i = 1; i < versions.length; i++) {
      assert.ok(cmp(versions[i - 1].v, versions[i].v) > 0, `${versions[i - 1].v} должна быть новее ${versions[i].v}`);
    }
  });
  it('даты настоящие и не возрастают вниз по списку', () => {
    for (const { v, date } of versions) {
      const d = new Date(`${date}T00:00:00Z`);
      assert.ok(!Number.isNaN(d.getTime()) && d.toISOString().startsWith(date), `версия ${v}: дата ${date} неверна`);
    }
    for (let i = 1; i < versions.length; i++) assert.ok(versions[i - 1].date >= versions[i].date);
  });
  it('в каждой версии есть хотя бы один раздел с пунктами', () => {
    const blocks = text.split(/^## \[/m).slice(1);
    assert.strictEqual(blocks.length, versions.length);
    for (const b of blocks) {
      assert.match(b, /^### (Добавлено|Изменено|Исправлено|Внутри)/m, `у версии ${b.slice(0, 6)} нет разделов`);
      assert.match(b, /^- .+/m, `у версии ${b.slice(0, 6)} нет пунктов`);
    }
  });
  it('на файл ссылается README', () => {
    assert.match(readme, /CHANGELOG\.md/);
  });
});
