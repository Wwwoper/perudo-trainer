// quiet_btn.test.js — «тихое действие» заменяет подчёркнутые ссылки.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const css = readdirSync(new URL('src/css/', root)).map((f) => read(`src/css/${f}`)).join('\n');

describe('тихое действие', () => {
  const rule = css.match(/\n\.quiet-btn \{([^}]*)\}/)[1];
  it('акцентный текст, без рамки и подчёркивания, не ниже зоны нажатия', () => {
    assert.match(rule, /border: 0;/);
    assert.match(rule, /color: var\(--acc\);/);
    assert.match(rule, /text-decoration: none;/);
    assert.match(rule, /min-height: var\(--tap\);/);
  });
  it('мягкий фон при наведении только там, где есть мышь', () => {
    assert.match(css, /@media \(hover: hover\) \{\s*\.quiet-btn:hover \{\s*background: color-mix/);
  });
  it('опасный вариант красный', () => {
    assert.match(css, /\.quiet-btn\.is-danger \{\s*color: var\(--bad-text\);/);
  });
  it('подчёркнутых ссылок-кнопок в CSS и разметке больше нет', () => {
    assert.ok(!/text-decoration: underline/.test(css));
    assert.ok(!/link-btn|link-danger/.test(css + read('index.html')));
  });
  it('«Сбросить к стандартным» и «Сбросить статистику тренажёра» используют .quiet-btn', () => {
    const html = read('index.html');
    assert.match(html, /id="gSettingsReset" class="quiet-btn"/);
    assert.match(html, /id="tReset" class="quiet-btn is-danger"/);
  });
});
