// Проверки документации: README, CONTRIBUTING.md и docs/dev/*.md.
// Ссылки на файлы и якоря внутри проекта должны вести в существующие места, картинки — существовать,
// а материал, вынесенный из README, не должен потеряться.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

/** Все Markdown-страницы проекта, которые мы проверяем. */
export const DOC_FILES = [
  'README.md',
  'CONTRIBUTING.md',
  ...readdirSync(join(root, 'docs', 'dev')).filter((f) => f.endsWith('.md')).map((f) => `docs/dev/${f}`),
];

/** Якорь заголовка так, как его строит GitHub: строчные буквы, без знаков, пробелы → «-». */
export function slugify(heading) {
  return heading
    .replace(/`/g, '')
    .replace(/\*\*|\*|_/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-');
}

/** Якоря страницы; одинаковые заголовки получают -1, -2 (как на GitHub). Блоки кода пропускаются. */
export function anchorsOf(text) {
  const seen = new Map();
  const out = new Set();
  let inCode = false;
  for (const line of text.split('\n')) {
    if (/^```/.test(line)) { inCode = !inCode; continue; }
    if (inCode) continue;
    const m = line.match(/^#{1,6}\s+(.*?)\s*#*\s*$/);
    if (!m) continue;
    const base = slugify(m[1]);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.add(n === 0 ? base : `${base}-${n}`);
  }
  return out;
}

/** Ссылки и картинки Markdown вне блоков кода: [{ target, image }]. */
export function linksOf(text) {
  const out = [];
  let inCode = false;
  for (const line of text.split('\n')) {
    if (/^```/.test(line)) { inCode = !inCode; continue; }
    if (inCode) continue;
    const noInline = line.replace(/`[^`]*`/g, '');
    for (const m of noInline.matchAll(/(!?)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) out.push({ target: m[2], image: m[1] === '!' });
  }
  return out;
}

test('slugify и anchorsOf: заголовки с кириллицей, скобками и повторами', () => {
  assert.equal(slugify('Дуэль (CFR)'), 'дуэль-cfr');
  assert.equal(slugify('Статистика и ваши данные'), 'статистика-и-ваши-данные');
  assert.equal(slugify('Как устроен `код`'), 'как-устроен-код');
  const a = anchorsOf('# Один\n## Два\n## Два\n```\n# не заголовок\n```\n');
  assert.deepEqual([...a], ['один', 'два', 'два-1']);
});

test('linksOf: пропускает код и находит картинки', () => {
  const l = linksOf('Текст [a](x.md) и ![b](img/b.png)\n```\n[c](нет.md)\n```\n`[d](нет2.md)`');
  assert.deepEqual(l, [{ target: 'x.md', image: false }, { target: 'img/b.png', image: true }]);
});

test('документация: все относительные ссылки и картинки ведут в существующие файлы, якоря — в существующие заголовки', () => {
  assert.ok(DOC_FILES.length >= 6, 'ожидались README, CONTRIBUTING и страницы docs/dev');
  const cache = new Map();
  const anchors = (file) => {
    if (!cache.has(file)) cache.set(file, anchorsOf(readFileSync(file, 'utf8')));
    return cache.get(file);
  };
  for (const doc of DOC_FILES) {
    const dir = dirname(join(root, doc));
    for (const { target } of linksOf(read(doc))) {
      if (/^(https?:|mailto:)/.test(target)) continue;
      const [pathPart, hash] = target.split('#');
      const file = pathPart ? resolve(dir, pathPart) : join(root, doc);
      assert.ok(existsSync(file), `${doc}: нет файла ${target}`);
      assert.ok(relative(root, file) && !relative(root, file).startsWith('..'), `${doc}: ссылка ${target} выходит за пределы проекта`);
      if (hash && file.endsWith('.md')) {
        assert.ok(anchors(file).has(decodeURIComponent(hash)), `${doc}: нет заголовка для якоря #${hash} в ${relative(root, file)}`);
      }
    }
  }
});

test('документация: у каждой страницы есть заголовок первого уровня и нет «хвостов» шаблонов', () => {
  for (const doc of DOC_FILES) {
    const t = read(doc);
    assert.match(t, /^# .+/m, `${doc}: нет заголовка первого уровня`);
    assert.doesNotMatch(t, /ВАШ-ЛОГИН|НАЗВАНИЕ-РЕПОЗИТОРИЯ|TODO|FIXME/, `${doc}: остался шаблон`);
  }
});

test('README не содержит блока для разработчиков, но ссылается на него', () => {
  const readme = read('README.md');
  assert.doesNotMatch(readme, /Часть 2/);
  for (const h of ['## Запуск локально', '## Тесты', '## Структура проекта', '## Как устроен код', '## Как внести вклад', '### API движка']) {
    assert.ok(!readme.includes(h), `в README остался раздел ${h}`);
  }
  for (const link of ['CONTRIBUTING.md', 'docs/dev/README.md', 'CHANGELOG.md']) assert.ok(readme.includes(link), `README не ссылается на ${link}`);
});

test('материал для разработчиков перенесён целиком', () => {
  const c = read('CONTRIBUTING.md');
  for (const s of ['## Запуск локально', '## Тесты', 'tools/screenshots.py', '## Как внести вклад', 'npm test', 'python3 -m http.server 8000']) {
    assert.ok(c.includes(s), `в CONTRIBUTING.md нет «${s}»`);
  }
  const arch = read('docs/dev/architecture.md');
  for (const s of ['## Структура проекта', '## Как устроен код', '### API движка', '### События движка', 'applyAction', 'DICE_REVEALED', 'theme_boot.js']) {
    assert.ok(arch.includes(s), `в docs/dev/architecture.md нет «${s}»`);
  }
  assert.match(read('docs/dev/layout.md'), /Брейкпоинты/);
  assert.match(read('docs/dev/publishing.md'), /Settings → Pages/);
});

test('docs/dev/README.md ссылается на все страницы папки', () => {
  const idx = read('docs/dev/README.md');
  for (const f of readdirSync(join(root, 'docs', 'dev')).filter((x) => x.endsWith('.md') && x !== 'README.md')) {
    assert.ok(idx.includes(`(${f})`), `оглавление docs/dev не ссылается на ${f}`);
  }
});
