// dock_inset.test.js — высота закреплённой панели для scroll-padding-bottom.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dockInset } from '../src/dock_inset.js';

describe('dockInset', () => {
  it('берёт самую высокую видимую закреплённую панель, округляя вверх', () => {
    assert.equal(dockInset([
      { position: 'sticky', height: 191.2, visible: true },
      { position: 'sticky', height: 160, visible: true },
    ]), 192);
  });
  it('скрытые панели (другие вкладки) и обычные (не sticky) не считаются', () => {
    assert.equal(dockInset([
      { position: 'sticky', height: 300, visible: false },
      { position: 'static', height: 250, visible: true },
      { position: 'sticky', height: 120, visible: true },
    ]), 120);
  });
  it('пусто, мусор и нечисловая высота дают 0', () => {
    for (const x of [[], undefined, null, 'x', [null], [{ position: 'sticky', height: NaN, visible: true }],
      [{ position: 'sticky', height: -5, visible: true }], [{ position: 'sticky', height: '12px', visible: true }]]) {
      assert.equal(dockInset(x), 0, JSON.stringify(x));
    }
  });
});

describe('подключение', () => {
  const css = readFileSync(new URL('../src/css/game.css', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/app_v2.js', import.meta.url), 'utf8');
  it('на телефоне страница оставляет внизу место под панель', () => {
    assert.match(css, /html\s*\{\s*scroll-padding-bottom: calc\(var\(--dock-h, 0px\) \+ var\(--space-3\)\);\s*\}/);
  });
  it('высоту панели в --dock-h записывает setupDockInset при запуске', () => {
    assert.match(app, /import \{ setupDockInset \} from '\.\/ui\/dock_inset\.js';/);
    assert.match(app, /setupDockInset\(\);/);
  });
});
