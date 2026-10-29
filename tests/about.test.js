// Ссылки «О приложении» на вкладке «Статистика» → «Игрок»: руководство и проект на GitHub.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const card = html.match(/<div class="card about-card">[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? '';

const link = (id) => card.match(new RegExp(`<a\\b[^>]*id="${id}"[^>]*>`))?.[0] ?? '';

test('карточка «О приложении» есть и лежит на вкладке «Игрок»', () => {
  assert.ok(card, 'нет карточки about-card');
  const player = html.slice(html.indexOf('id="stPanelPlayer"'), html.indexOf('id="stPanelData"'));
  assert.ok(player.includes('about-card'), 'карточка должна быть в панели «Игрок»');
});

test('ссылка на руководство: относительный адрес существующей папки, новая вкладка, noopener', () => {
  const a = link('stGuideLink');
  assert.ok(a, 'нет ссылки stGuideLink');
  const href = a.match(/href="([^"]+)"/)[1];
  assert.equal(href, 'docs/guide/');
  assert.ok(existsSync(join(root, href, 'index.html')), 'в папке руководства нет index.html');
  assert.match(a, /target="_blank"/);
  assert.match(a, /rel="noopener"/);
});

test('ссылка на GitHub: адрес репозитория совпадает с README, новая вкладка, noopener', () => {
  const a = link('stGithubLink');
  assert.ok(a, 'нет ссылки stGithubLink');
  const href = a.match(/href="([^"]+)"/)[1];
  assert.equal(href, 'https://github.com/Wwwoper/perudo-trainer');
  assert.ok(readFileSync(join(root, 'README.md'), 'utf8').includes('github.com/Wwwoper/perudo-trainer/'), 'адрес не совпадает с README');
  assert.match(a, /target="_blank"/);
  assert.match(a, /rel="noopener"/);
});

test('у карточки есть заголовок и пояснение; подписи ссылок понятны', () => {
  assert.match(card, /<b class="data-title">О приложении<\/b>/);
  assert.match(card, /Руководство<\/a>/);
  assert.match(card, /Проект на GitHub<\/a>/);
});
