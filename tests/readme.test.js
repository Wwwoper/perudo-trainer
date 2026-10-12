// Проверки README: ссылки, картинки, отсутствие шаблонов.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const APP_URL = 'https://wwwoper.github.io/perudo-trainer/';

test('README: ссылка на приложение — настоящая Markdown-ссылка', () => {
  assert.ok(
    readme.includes(`](${APP_URL})`),
    'нужна ссылка вида [текст](адрес), а не адрес в обратных кавычках',
  );
});

test('README: нет незаполненных шаблонов', () => {
  assert.doesNotMatch(readme, /ВАШ-ЛОГИН/);
  assert.doesNotMatch(readme, /НАЗВАНИЕ-РЕПОЗИТОРИЯ/);
});

test('README: все локальные картинки существуют', () => {
  const images = [...readme.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)]
    .map((m) => m[1])
    .filter((src) => !/^https?:/.test(src));
  assert.ok(images.length > 0, 'в README нет локальных картинок');
  for (const src of images) {
    assert.ok(existsSync(join(root, src)), `нет файла ${src}`);
  }
});

test('README: описание проекта не ссылается на несуществующий .github/README.md', () => {
  assert.doesNotMatch(readme, /\.github\/README\.md/);
});
