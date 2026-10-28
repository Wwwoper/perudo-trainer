// Руководство для новичков (docs/guide): структура страниц, ссылки, картинки, навигация, цвета только из тем.
// Вёрстку и контраст в браузере проверяет tests/test_guide_layout.py.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GUIDE = join(root, 'docs', 'guide');
const read = (p) => readFileSync(p, 'utf8');
const pages = readdirSync(GUIDE).filter((f) => f.endsWith('.html')).sort();
const html = Object.fromEntries(pages.map((f) => [f, read(join(GUIDE, f))]));
const themes = read(join(root, 'src', 'css', 'themes.css'));
const css = read(join(GUIDE, 'guide.css'));

const attrs = (text, tag, attr) => [...text.matchAll(new RegExp(`<${tag}\\b[^>]*\\s${attr}="([^"]*)"`, 'g'))].map((m) => m[1]);
const stripTags = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

test('руководство: есть оглавление и страницы «Быстрый старт» и «Правила»', () => {
  for (const f of ['index.html', 'quick-start.html', 'rules.html', 'guide.css']) assert.ok(existsSync(join(GUIDE, f)), `нет docs/guide/${f}`);
});

test('каждая страница: doctype, язык, viewport, заголовок, описание, один h1', () => {
  for (const [f, t] of Object.entries(html)) {
    assert.match(t, /^<!doctype html>/i, f);
    assert.match(t, /<html lang="ru">/, f);
    assert.match(t, /<meta name="viewport" content="width=device-width, initial-scale=1">/, f);
    assert.match(t, /<title>[^<]{5,}<\/title>/, f);
    assert.match(t, /<meta name="description" content="[^"]{20,}">/, f);
    assert.equal((t.match(/<h1[ >]/g) || []).length, 1, `${f}: ровно один h1`);
    assert.equal((t.match(/<main>/g) || []).length, 1, `${f}: один main`);
  }
});

test('порядок заголовков: после h1 идут h2, h3 не появляется раньше h2', () => {
  for (const [f, t] of Object.entries(html)) {
    let last = 0;
    for (const m of t.matchAll(/<h([1-6])[ >]/g)) {
      const level = Number(m[1]);
      assert.ok(level <= last + 1, `${f}: заголовок h${level} после h${last}`);
      last = level;
    }
  }
});

test('тема: theme_boot.js стоит до стилей, themes.css подключён первым, дальше guide.css; адреса существуют', () => {
  for (const [f, t] of Object.entries(html)) {
    const iBoot = t.indexOf('src="../../src/theme_boot.js"');
    const iThemes = t.indexOf('href="../../src/css/themes.css"');
    const iGuide = t.indexOf('href="guide.css"');
    assert.ok(iBoot > 0 && iThemes > iBoot && iGuide > iThemes, `${f}: порядок theme_boot.js → themes.css → guide.css`);
    for (const rel of ['src/theme_boot.js', 'src/css/themes.css']) assert.ok(existsSync(join(root, rel)), rel);
  }
});

test('цвета не прописаны: ни в guide.css, ни в разметке страниц', () => {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(noComments, /#[0-9a-fA-F]{3,8}\b/, 'в guide.css цвет #hex');
  assert.doesNotMatch(noComments, /\b(rgba?|hsla?)\(/, 'в guide.css rgb/hsl');
  for (const [f, t] of Object.entries(html)) {
    assert.doesNotMatch(t, /\sstyle="/, `${f}: встроенный style`);
    assert.doesNotMatch(t, /<style[\s>]/, `${f}: встроенный <style>`);
  }
});

test('guide.css: все переменные var(--…) определены в themes.css', () => {
  const defined = new Set([...themes.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]));
  const used = new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]));
  assert.ok(used.size > 5);
  for (const v of used) assert.ok(defined.has(v), `переменная ${v} не определена в themes.css`);
});

test('ссылки и картинки: локальные адреса существуют, якоря ведут к id, у картинок есть alt', () => {
  for (const [f, t] of Object.entries(html)) {
    const dir = GUIDE;
    const targets = [...attrs(t, 'a', 'href'), ...attrs(t, 'link', 'href'), ...attrs(t, 'script', 'src'), ...attrs(t, 'img', 'src')];
    for (const target of targets) {
      if (/^(https?:|mailto:)/.test(target)) continue;
      const [p, hash] = target.split('#');
      const file = p ? resolve(dir, p) : join(GUIDE, f);
      assert.ok(existsSync(file), `${f}: нет файла ${target}`);
      if (hash) {
        const text = file.endsWith('.html') ? read(file) : '';
        assert.match(text, new RegExp(`id="${hash}"`), `${f}: нет якоря #${hash} в ${target}`);
      }
    }
    for (const m of t.matchAll(/<img\b[^>]*>/g)) {
      assert.match(m[0], /\salt="[^"]{5,}"/, `${f}: у картинки нет осмысленного alt: ${m[0].slice(0, 60)}`);
      assert.match(m[0], /\ssrc="\.\.\/img\/[a-z0-9-]+\.png"/, `${f}: картинки берём из docs/img`);
    }
  }
});

test('каждая страница ведёт в приложение и к оглавлению', () => {
  for (const [f, t] of Object.entries(html)) {
    assert.ok(attrs(t, 'a', 'href').includes('../../index.html'), `${f}: нет ссылки на приложение`);
    assert.ok(attrs(t, 'a', 'href').includes('index.html'), `${f}: нет ссылки на оглавление`);
  }
});

test('оглавление перечисляет все страницы руководства', () => {
  const toc = attrs(html['index.html'].match(/<ol class="toc">[\s\S]*?<\/ol>/)[0], 'a', 'href');
  const expected = pages.filter((f) => f !== 'index.html');
  assert.deepEqual([...toc].sort(), expected, 'оглавление и список страниц расходятся');
});

test('навигация «назад / далее» согласована: цепочка проходит все страницы без разрывов', () => {
  const nav = {};
  for (const [f, t] of Object.entries(html)) {
    if (f === 'index.html') continue;
    nav[f] = { prev: (t.match(/rel="prev" href="([^"]+)"/) || [])[1], next: (t.match(/rel="next" href="([^"]+)"/) || [])[1] };
  }
  const names = Object.keys(nav);
  const first = names.filter((f) => nav[f].prev === 'index.html');
  assert.equal(first.length, 1, 'ровно одна страница начинает цепочку с оглавления');
  const chain = [];
  for (let cur = first[0]; cur; cur = nav[cur].next) {
    assert.ok(!chain.includes(cur), `цикл на ${cur}`);
    chain.push(cur);
    if (nav[cur].next) assert.equal(nav[nav[cur].next].prev, cur, `${nav[cur].next}: «назад» не ведёт на ${cur}`);
  }
  assert.deepEqual([...chain].sort(), [...names].sort(), 'в цепочке не все страницы');
});

test('содержание: правила и быстрый старт упоминают главное', () => {
  const rules = stripTags(html['rules.html']);
  for (const s of ['Не верю', 'джокеры', 'Calza', 'Палифико', 'половины', 'удвоить и прибавить один']) assert.ok(rules.includes(s), `в правилах нет «${s}»`);
  const quick = stripTags(html['quick-start.html']);
  for (const s of ['Начать партию', 'Ставлю', 'Не верю', 'Дальше', 'Сыграть ещё']) assert.ok(quick.includes(s), `в быстром старте нет «${s}»`);
});

test('кнопки из руководства совпадают с подписями в приложении', () => {
  const app = read(join(root, 'index.html')) + read(join(root, 'src', 'app_v2.js'));   // часть подписей ставит app_v2.js
  for (const label of ['Не верю!', 'Ставлю', 'Начать партию', 'Дальше', 'Сыграть ещё']) assert.ok(app.includes(label), `в приложении нет подписи «${label}»`);
});
