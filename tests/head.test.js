// Проверки <head> страницы: иконки, описание, превью ссылки.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const SITE = 'https://wwwoper.github.io/perudo-trainer/';

const meta = (attr, name) => {
  const re = new RegExp(`<meta\\s+${attr}="${name}"\\s+content="([^"]*)"`);
  return html.match(re)?.[1];
};

test('head: есть осмысленное описание страницы', () => {
  const d = meta('name', 'description');
  assert.ok(d && d.length >= 40 && d.length <= 200, `длина описания: ${d?.length}`);
});

test('head: все иконки подключены и файлы существуют', () => {
  const hrefs = [...html.matchAll(/<link rel="(?:icon|apple-touch-icon)" href="([^"?]+)/g)].map((m) => m[1]);
  assert.ok(hrefs.length >= 2, 'ожидались иконки вкладки и для iOS');
  for (const href of hrefs) {
    assert.ok(existsSync(join(root, href)), `нет файла ${href}`);
  }
});

test('head: превью ссылки (Open Graph) заполнено', () => {
  for (const key of ['og:title', 'og:description', 'og:url', 'og:image']) {
    assert.ok(meta('property', key), `нет ${key}`);
  }
  assert.equal(meta('property', 'og:url'), SITE);
});

test('head: og:image — абсолютный адрес существующего файла', () => {
  const img = meta('property', 'og:image');
  assert.ok(img.startsWith(SITE), 'адрес должен быть абсолютным и вести на сайт проекта');
  assert.ok(existsSync(join(root, img.slice(SITE.length))), `нет файла ${img}`);
});

test('head: есть запасной текст на случай отключённого JavaScript', () => {
  assert.match(html, /<noscript>[^<]+<\/noscript>/);
});
