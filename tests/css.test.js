// Защита стилей от разложения: проверяем исходники, браузер не нужен.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const html = read('index.html');
const cssFiles = [...readdirSync(join(ROOT, 'src/css')).filter((f) => f.endsWith('.css')).map((f) => `src/css/${f}`), 'src/table.css'];
const jsFiles = readdirSync(join(ROOT, 'src')).filter((f) => f.endsWith('.js')).map((f) => `src/${f}`);
const sources = [html, ...jsFiles.map(read)].join('\n');

// Классы, которые JS собирает динамически: c0…c5 (цвета игроков, `c${i}`).
const DYNAMIC = [/^c\d$/];

/** Селекторы всех правил, включая вложенные в @media/@supports. */
function selectorsOf(css) {
  const s = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  (function walk(str) {
    let i = 0;
    while (i < str.length) {
      const j = str.indexOf('{', i);
      if (j < 0) break;
      const head = str.slice(i, j).trim();
      let depth = 1;
      let k = j + 1;
      while (k < str.length && depth) {
        if (str[k] === '{') depth++;
        else if (str[k] === '}') depth--;
        k++;
      }
      const body = str.slice(j + 1, k - 1);
      if (/^@(media|supports)/.test(head)) walk(body);
      else if (!head.startsWith('@')) out.push(head);
      i = k;
    }
  })(s);
  return out;
}

const tokensOf = (sel) =>
  [...sel.replace(/\[[^\]]*\]/g, '').matchAll(/(?<![\w-])[.#]([A-Za-z_][\w-]*)/g)].map((m) => m[1]);

test('в index.html нет inline-<style>, все подключённые стили существуют', () => {
  assert.equal(/<style[\s>]/i.test(html), false, 'стили должны жить в src/css/*.css');
  const hrefs = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length >= 6);
  for (const h of hrefs) assert.ok(existsSync(join(ROOT, h)), `нет файла ${h}`);
  for (const f of cssFiles) assert.ok(hrefs.includes(f), `${f} не подключён в index.html`);
});

test('каждый класс и id из CSS реально используется (в class=, строке-литерале или как #id)', () => {
  // Слова, которые встречаются в атрибутах class и в строковых литералах скриптов.
  // Имена переменных и свойств («mx», «m.q») сюда не попадают — только то, что взято в кавычки.
  const used = new Set();
  const addWords = (s) => { for (const w of s.match(/(?<![\w-])[A-Za-z_][\w-]*/g) || []) used.add(w); };
  for (const m of html.matchAll(/class\s*=\s*"([^"]*)"/g)) addWords(m[1]);
  for (const m of html.matchAll(/\bid\s*=\s*"([^"]*)"/g)) addWords(m[1]);
  for (const f of jsFiles) {
    for (const m of read(f).matchAll(/(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) addWords(m[2]);
  }
  const dead = [];
  for (const f of cssFiles) {
    for (const head of selectorsOf(read(f))) {
      for (const part of head.split(',')) {
        for (const t of tokensOf(part)) {
          if (DYNAMIC.some((re) => re.test(t))) continue;
          if (!used.has(t)) dead.push(`${f}: ${part.trim()}  (${t})`);
        }
      }
    }
  }
  assert.deepEqual(dead, [], `мёртвые селекторы:\n${dead.join('\n')}`);
});

test('все @keyframes используются', () => {
  const css = cssFiles.map(read).join('\n');
  const names = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
  for (const n of names) {
    assert.ok(new RegExp(`animation[^;]*\\b${n}\\b`).test(css), `@keyframes ${n} нигде не подключён`);
  }
});

test('нет дублей одного селектора с одним и тем же набором свойств на верхнем уровне', () => {
  for (const f of cssFiles) {
    const s = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
    const seen = new Map();
    let depth = 0;
    let start = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '{') depth++;
      if (s[i] === '}') {
        depth--;
        if (depth === 0) {
          const rule = s.slice(start, i + 1).replace(/\s+/g, ' ').trim();
          start = i + 1;
          if (rule.startsWith('@')) continue;
          assert.ok(!seen.has(rule), `${f}: правило повторено дословно: ${rule.slice(0, 80)}`);
          seen.set(rule, true);
        }
      }
    }
  }
});
