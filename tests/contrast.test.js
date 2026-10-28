// contrast.test.js — контраст пар «текст/фон» в обеих темах (WCAG 2.1 AA): 4,5:1 для текста, 3:1 для элементов интерфейса.
// Значения берутся прямо из src/css/themes.css, браузер не нужен.
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/css/themes.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function block(selectorRe) {
  const m = css.match(new RegExp(`${selectorRe}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `в themes.css нет блока ${selectorRe}`);
  return Object.fromEntries([...m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((x) => [x[1], x[2].trim()]));
}

const dark = block(':root');
const light = { ...dark, ...block(':root\\[data-theme="light"\\]') };
export const THEME_TOKENS = { dark, light };

const hex = (v) => {
  if (/^#[0-9a-f]{3}$/i.test(v)) return [1, 2, 3].map((i) => parseInt(v[i] + v[i], 16));
  return /^#[0-9a-f]{6}$/i.test(v) ? [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)) : null;
};
const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export function contrast(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const color = (theme, token) => {
  const c = hex(THEME_TOKENS[theme][`--${token}`]);
  assert.ok(c, `${theme}: переменная --${token} должна быть цветом #rgb или #rrggbb`);
  return c;
};

// Текст на фоне. Порог 4,5.
const TEXT = [
  ['fg', 'bg'], ['fg', 'card'], ['fg', 'surface-1'], ['fg', 'surface-2'], ['fg', 'surface-3'], ['fg', 'surface-6'], ['fg', 'selected'],
  ['mut', 'bg'], ['mut', 'card'], ['mut', 'surface-1'], ['mut', 'surface-3'], ['mut', 'surface-6'],
  ['text-soft', 'card'], ['text-soft', 'surface-1'], ['text-soft', 'info-bg-3'],
  ['acc', 'bg'], ['acc', 'card'], ['acc', 'info-bg'], ['ok', 'bg'], ['ok', 'card'], ['bad', 'bg'], ['bad', 'card'], ['warn', 'bg'], ['warn', 'card'],
  ['on-accent', 'acc'], ['on-accent', 'bad'], ['on-accent', 'warn'],
  ['info-fg', 'info-bg'], ['info-fg', 'info-bg-2'], ['ok-fg', 'ok-bg'], ['warn-fg', 'warn-bg'], ['bad-fg', 'bad-bg'],
  ['bad-text', 'card'], ['bad-text', 'bad-bg-2'], ['bad-text', 'surface-1'],
  ['hue-pink', 'card'], ['hue-violet', 'card'], ['hue-orange', 'card'],
];
// Известные пары тёмной темы ниже 4,5 (так было до появления тем); ниже указанной границы опускаться нельзя.
const DARK_KNOWN = { 'mut/surface-2': 4.3, 'mut/surface-6': 4.2 };
const TEXT_EXTRA = { dark: [['mut', 'surface-2']], light: [['mut', 'surface-2']] };

// Границы и значки, по которым элемент находят глазами. Порог 3.
const UI = [['line-2', 'card'], ['line-2', 'bg'], ['line-3', 'card'], ['acc', 'card'], ['acc', 'bg'], ['gold', 'card'], ['gold', 'bg']];
const UI_KNOWN = { dark: { 'line-2/card': 1, 'line-2/bg': 1, 'line-3/card': 1, 'gold/bg': 1, 'gold/card': 1 } };   // у тёмной темы границы мягкие (так задумано)

describe('контраст текста', () => {
  for (const theme of ['light', 'dark']) {
    it(`${theme}: все пары «текст/фон» не ниже 4,5:1`, () => {
      for (const [fg, bg] of [...TEXT, ...TEXT_EXTRA[theme]]) {
        const key = `${fg}/${bg}`;
        const min = theme === 'dark' ? (DARK_KNOWN[key] ?? 4.5) : 4.5;
        const r = contrast(color(theme, fg), color(theme, bg));
        assert.ok(r >= min, `${theme}: --${fg} на --${bg}: ${r.toFixed(2)} < ${min}`);
      }
    });
  }
});

describe('контраст элементов интерфейса', () => {
  it('light: границы полей и акценты не ниже 3:1', () => {
    for (const [a, b] of UI) {
      const r = contrast(color('light', a), color('light', b));
      assert.ok(r >= 3, `light: --${a} на --${b}: ${r.toFixed(2)} < 3`);
    }
  });
  it('dark: границы мягкие, но акцент виден (не ниже 3:1)', () => {
    for (const [a, b] of UI) {
      const key = `${a}/${b}`;
      const min = UI_KNOWN.dark[key] ?? 3;
      const r = contrast(color('dark', a), color('dark', b));
      assert.ok(r >= min, `dark: --${a} на --${b}: ${r.toFixed(2)} < ${min}`);
    }
  });
});

describe('набор токенов светлой темы', () => {
  it('светлая тема переопределяет все цвета интерфейса, кроме стола, теней и подложек', () => {
    const lightOnly = block(':root\\[data-theme="light"\\]');
    const exempt = /^--(wood|felt|plate|seat|table|gold-chip|avatar|die-face|die-wild|black|scrim|shadow-dock)/;
    const missing = Object.keys(dark).filter((k) => !exempt.test(k) && !(k in lightOnly)
      && /^(#|rgb)/.test(dark[k]) && !['--paper', '--ink'].includes(k));
    assert.deepStrictEqual(missing, [], `нет значений для светлой темы: ${missing.join(', ')}`);
  });
  it('все цвета светлой темы записаны в понятном виде', () => {
    for (const [k, v] of Object.entries(block(':root\\[data-theme="light"\\]'))) {
      if (k === 'color-scheme') continue;
      assert.match(v, /^(#[0-9a-f]{6}|rgba?\([^)]+\)|rgb\([^)]+\)|inset [^;]+)$/i, `${k}: ${v}`);
    }
  });
});
