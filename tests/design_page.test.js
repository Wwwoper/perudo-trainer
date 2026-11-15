// Страница-образец docs/dev/design.html: подключает настоящие стили и не использует классов, которых в них нет.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(join(ROOT, 'docs/dev/design.html'), 'utf8');
const cssFiles = [...readdirSync(join(ROOT, 'src/css')).filter((f) => f.endsWith('.css')).map((f) => `src/css/${f}`), 'src/table.css'];
const css = cssFiles.map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');

test('образец подключает все файлы стилей приложения, и они существуют', () => {
  const links = [...page.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => resolve(ROOT, 'docs/dev', m[1]));
  for (const f of cssFiles) assert.ok(links.includes(join(ROOT, f)), `образец не подключает ${f}`);
  for (const l of links) assert.ok(existsSync(l), `нет файла ${l}`);
});

test('все классы образца определены в стилях приложения (кроме собственных dx-*)', () => {
  const own = new Set([...page.matchAll(/\.(dx-[a-z-]+)/g)].map((m) => m[1]));
  const used = new Set();
  for (const m of page.matchAll(/\sclass="([^"]+)"/g)) for (const c of m[1].split(/\s+/)) if (c) used.add(c);
  assert.ok(used.size > 30, 'образец показывает достаточно разных элементов');
  const missing = [...used].filter((c) => !own.has(c) && !new RegExp(`\\.${c.replace(/[-]/g, '\\-')}(?![\\w-])`).test(css));
  assert.deepEqual(missing, [], `классы без стилей: ${missing.join(', ')}`);
});

test('в образце есть все разделы: текст, кнопки, поля, чипы, карточки, строки, цвета', () => {
  for (const id of ['dx-type', 'dx-buttons', 'dx-fields', 'dx-chips', 'dx-cards', 'dx-rows', 'dx-colors']) {
    assert.ok(page.includes(`id="${id}"`), `нет раздела ${id}`);
  }
});

test('цвета образца — только токены, определённые в themes.css', () => {
  const themes = readFileSync(join(ROOT, 'src/css/themes.css'), 'utf8');
  const tokens = /const TOKENS = \[([^\]]+)\]/.exec(page)[1].match(/'([a-z0-9-]+)'/g).map((s) => s.slice(1, -1));
  assert.ok(tokens.length >= 20);
  for (const t of tokens) assert.ok(new RegExp(`--${t}\\s*:`).test(themes), `токена --${t} нет в themes.css`);
});

test('ссылки блока «Пары для сравнения» ведут на существующие якоря, id не повторяются', () => {
  const ids = [...page.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'повторяющиеся id');
  const hrefs = [...page.matchAll(/<a href="#([^"]+)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length >= 7);
  for (const h of hrefs) assert.ok(ids.includes(h), `нет якоря #${h}`);
});

test('кнопки сгруппированы по типу взаимодействия, у каждого примера подпись «роль · класс»', () => {
  for (const id of ['dx-actions', 'dx-links', 'dx-switch', 'dx-game']) assert.ok(page.includes(`id="${id}"`), `нет группы ${id}`);
  const caps = [...page.matchAll(/<span class="dx-cap">([^<]+)<\/span>/g)].map((m) => m[1]);
  const buttons = caps.filter((c) => /\.(btn-primary|bad|calza|link-btn|btn|icon-btn|drill-tab|stats-tab|face-btn|mode-btn|quiz-secondary)/.test(c));
  assert.ok(buttons.length >= 10);
  for (const c of buttons) assert.match(c, /^[^·]+ · /, `нет роли в подписи: ${c}`);
});

test('у состояний «выбран / недоступен» пары показаны рядом', () => {
  for (const frag of ['class="drill-tab on"', 'aria-selected="true"', 'class="face-btn sel"', 'class="mode-btn is-on"', 'class="btn-primary" disabled', 'class="bad" disabled']) {
    assert.ok(page.includes(frag), `нет состояния ${frag}`);
  }
});
