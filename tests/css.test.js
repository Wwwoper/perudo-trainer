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
const jsFiles = ['src', 'src/ui'].flatMap((d) => readdirSync(join(ROOT, d)).filter((f) => f.endsWith('.js')).map((f) => `${d}/${f}`));
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

test('брейкпоинт телефона один: 719px (и 720px для «от»), других граничных значений нет', () => {
  // «Партия» делит экраны по 719/720; учебные вкладки должны делить так же,
  // иначе на ширине ровно 720px действуют сразу два набора правил.
  for (const file of cssFiles) {
    const css = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(css, /max-width:\s*720px/, `${file}: используйте max-width: 719px`);
    assert.doesNotMatch(css, /min-width:\s*719px/, `${file}: используйте min-width: 720px`);
  }
});

// ----- Темы: цвета живут только в themes.css -----

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/;

test('цвета не прописаны в правилах: только переменные из src/css/themes.css', () => {
  for (const file of cssFiles.filter((f) => f !== 'src/css/themes.css')) {
    stripComments(read(file)).split('\n').forEach((line, i) => {
      assert.doesNotMatch(line, COLOR_LITERAL, `${file}, строка ${i + 1}: цвет нужно вынести в переменную в themes.css: ${line.trim()}`);
    });
  }
});

test('цвета не прописаны в inline-стилях разметки и JS-шаблонов', () => {
  for (const [name, text] of [['index.html', html], ...jsFiles.map((f) => [f, read(f)])]) {
    for (const m of text.matchAll(/style="([^"]*)"/g)) {
      assert.doesNotMatch(m[1], COLOR_LITERAL, `${name}: цвет в inline-стиле: ${m[1].slice(0, 80)}`);
    }
  }
});

test('каждая используемая переменная цвета определена в themes.css, а лишних определений нет', () => {
  const themes = stripComments(read('src/css/themes.css'));
  const defined = new Set([...themes.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const usedEverywhere = new Set();
  for (const file of cssFiles) {
    for (const m of stripComments(read(file)).matchAll(/var\((--[\w-]+)/g)) usedEverywhere.add(m[1]);
  }
  for (const m of sources.matchAll(/var\((--[\w-]+)/g)) usedEverywhere.add(m[1]);
  // переменные, заданные в других файлах (размеры, состояния), не проверяем: берём только имена из themes.css и «голые» использования
  const definedAnywhere = new Set(defined);
  for (const file of cssFiles) for (const m of stripComments(read(file)).matchAll(/(--[\w-]+)\s*:/g)) definedAnywhere.add(m[1]);
  for (const m of sources.matchAll(/setProperty\('(--[\w-]+)'/g)) definedAnywhere.add(m[1]);   // задаются из JS
  for (const m of sources.matchAll(/(--[\w-]+)\s*:\s*[^;"]/g)) definedAnywhere.add(m[1]);   // и inline-стилями в разметке
  for (const name of usedEverywhere) assert.ok(definedAnywhere.has(name), `переменная ${name} используется, но нигде не определена`);
  const selfRefs = (t) => [...stripComments(t).matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]);
  const usedOutside = new Set([...usedEverywhere]);
  for (const name of defined) {
    const inThemesOnly = selfRefs(read('src/css/themes.css')).includes(name);
    assert.ok(usedOutside.has(name) || inThemesOnly, `переменная ${name} определена в themes.css, но нигде не используется`);
  }
});

test('themes.css подключён первым среди стилей', () => {
  const hrefs = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(hrefs[0], 'src/css/themes.css');
});

// ---------- Шкала размеров текста (волна 15) ----------

const FS_TOKENS = [...stripComments(read('src/css/base.css')).matchAll(/--(fs-[a-z]+)\s*:\s*(\d+)px/g)].map((m) => ({ name: m[1], px: +m[2] }));

test('шкала размеров текста определена в base.css: девять ступеней по возрастанию', () => {
  assert.equal(FS_TOKENS.length, 9);
  const px = FS_TOKENS.map((t) => t.px);
  assert.deepEqual(px, [...px].sort((a, b) => a - b));
  assert.equal(new Set(px).size, px.length);
});

test('font-size пишется только токеном --fs-* или относительным значением, не числом в px', () => {
  for (const f of cssFiles) {
    for (const m of stripComments(read(f)).matchAll(/font-size\s*:\s*([^;}]+)/g)) {
      const v = m[1].trim();
      const ok = /^var\(--fs-[a-z]+\)$/.test(v) || /^\d+(\.\d+)?(%|em|rem)$/.test(v) || /^calc\(var\(--[a-z-]+\)\s*[*/]\s*[\d.]+\)$/.test(v) || v === 'inherit';
      assert.ok(ok, `${f}: font-size: ${v} — используйте токен --fs-*`);
    }
  }
});

test('в font-шорткате размер тоже через токен, и каждый токен --fs-* определён', () => {
  const defined = new Set(FS_TOKENS.map((t) => `--${t.name}`));
  for (const f of cssFiles) {
    const css = stripComments(read(f));
    for (const m of css.matchAll(/font\s*:\s*(?!inherit)([^;}]+)/g)) {
      assert.ok(!/\b\d+px\b/.test(m[1]), `${f}: font: ${m[1].trim()} — размер через токен`);
    }
    for (const m of css.matchAll(/var\((--fs-[a-z]+)\)/g)) assert.ok(defined.has(m[1]), `${f}: нет токена ${m[1]}`);
  }
});

test('каждый токен шкалы текста где-то используется', () => {
  const css = cssFiles.map((f) => stripComments(read(f))).join('\n');
  for (const t of FS_TOKENS) assert.ok(css.includes(`var(--${t.name})`), `токен --${t.name} не используется`);
});

// ---------- Шкалы отступов и скруглений (волна 15) ----------

const BASE_TOKENS = stripComments(read('src/css/base.css'));
const spaceTokens = [...BASE_TOKENS.matchAll(/--(space-\d+)\s*:\s*(\d+)px/g)].map((m) => +m[2]);
const radiusTokens = [...BASE_TOKENS.matchAll(/--(radius-[a-z]+)\s*:\s*(\d+)px/g)].map((m) => ({ name: m[1], px: +m[2] }));

test('шкала отступов и скруглений определена в base.css', () => {
  assert.deepEqual(spaceTokens, [4, 8, 12, 16]);
  assert.deepEqual(radiusTokens.map((t) => t.name), ['radius-xs', 'radius-s', 'radius-m', 'radius-l', 'radius-pill']);
  assert.deepEqual(radiusTokens.map((t) => t.px), [4, 8, 12, 16, 999]);
});

/** Значения свойств по всем стилям: [{файл, свойство, значение}]. */
function declarations(propRe) {
  const out = [];
  for (const f of cssFiles) {
    if (f.endsWith('themes.css')) continue;
    for (const m of stripComments(read(f)).matchAll(new RegExp(`(?<![\\w-])(${propRe})\\s*:\\s*([^;}{]+)`, 'g'))) out.push({ f, prop: m[1], v: m[2].trim() });
  }
  return out;
}

test('border-radius — только токен --radius-*, 0, 50% или calc от токена', () => {
  for (const { f, prop, v } of declarations('border(?:-(?:top|bottom)-(?:left|right))?-radius')) {
    const bare = v.replace(/var\(--radius-[a-z]+\)/g, '').replace(/calc\([^)]*\)/g, '');
    assert.ok(!/\d+px/.test(bare), `${f}: ${prop}: ${v} — используйте токен --radius-*`);
  }
});

test('padding, margin и gap — токены --space-*; числом только 0, 1px и 2px', () => {
  for (const { f, prop, v } of declarations('(?:padding|margin)(?:-(?:top|right|bottom|left))?|gap|row-gap|column-gap')) {
    const bare = v.replace(/var\([^)]*\)/g, '').replace(/calc\((?:[^()]|\([^)]*\))*\)/g, '');
    for (const m of bare.matchAll(/(?<![\w.-])(-?\d+)px\b/g)) {
      assert.ok([0, 1, 2, -1, -2].includes(+m[1]), `${f}: ${prop}: ${v} — используйте токен --space-*`);
    }
  }
});

test('каждый токен скруглений и отступов где-то используется', () => {
  const css = cssFiles.map((f) => stripComments(read(f))).join('\n');
  for (const n of ['space-1', 'space-2', 'space-3', 'space-4', 'radius-xs', 'radius-s', 'radius-m', 'radius-l', 'radius-pill']) {
    assert.ok(css.includes(`var(--${n})`), `токен --${n} не используется`);
  }
});

// ---------- Панели и полосы (волна 15) ----------

test('цветная полоса слева (border-left от 3px) везде ровно 3px', () => {
  for (const { f, v } of declarations('border-left')) {
    const m = /^(\d+)px\s+solid/.exec(v);
    if (m && +m[1] >= 3) assert.equal(+m[1], 3, `${f}: border-left: ${v} — полоса 3px`);
  }
});
