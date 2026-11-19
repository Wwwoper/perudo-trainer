// sound_icons.test.js — значки режимов звука и кнопка-переключатель в настройках.
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { soundIconSvg, SOUND_ICON_MODES } from '../src/ui/icons.js';
import { SOUND_MODES } from '../src/sound_plan.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const strokes = (svg) => (svg.match(/<path/g) || []).length;

describe('значки звука', () => {
  it('есть для каждого режима и отличаются друг от друга', () => {
    assert.deepStrictEqual([...SOUND_ICON_MODES].sort(), [...SOUND_MODES].sort());
    const all = SOUND_ICON_MODES.map(soundIconSvg);
    assert.strictEqual(new Set(all).size, all.length);
  });
  it('включено — две дуги у динамика, выключено — перечёркнутый динамик', () => {
    const arcs = (m) => (soundIconSvg(m).match(/a[\d. ]+ 0 0 1/g) || []).length;
    assert.strictEqual(arcs('off'), 0);
    assert.strictEqual(arcs('on'), 2);
    assert.strictEqual(strokes(soundIconSvg('off')), 2);          // динамик и крест
  });
  it('значок скрыт от читалок и берёт цвет из текста', () => {
    for (const m of SOUND_ICON_MODES) {
      const svg = soundIconSvg(m);
      assert.match(svg, /aria-hidden="true"/);
      assert.match(svg, /currentColor/);
    }
    assert.strictEqual(soundIconSvg('мусор'), soundIconSvg('off'));
  });
});

describe('переключатель звука в index.html', () => {
  it('значок в шапке: кнопка с aria-pressed и подписью для читалок, стоит перед «?»', () => {
    const m = html.match(/<button type="button" id="gSound" class="icon-btn sound-btn" data-sound-toggle aria-pressed="false" aria-label="Звук приложения: выключен"><\/button>/);
    assert.ok(m, 'нет кнопки #gSound в шапке');
    assert.ok(html.indexOf('id="gSound"') < html.indexOf('id="helpLink"'));
    assert.ok(html.indexOf('id="gSound"') > html.indexOf('</nav>'));
  });
  it('пункт меню ☰ для телефона: внутри nav, перед «Справкой по разделу»', () => {
    const m = html.match(/<button type="button" id="gSoundMenu" class="sound-menu-item" data-sound-toggle aria-pressed="false"><span class="sound-label">Звук выключен<\/span><\/button>/);
    assert.ok(m, 'нет пункта #gSoundMenu');
    assert.ok(html.indexOf('id="gSoundMenu"') < html.indexOf('id="helpLinkMenu"'));
    assert.ok(html.indexOf('id="gSoundMenu"') > html.indexOf('id="mainNav"'));
  });
  it('из меню партии раздел «Звук приложения», подсказка и «Проверить звук» убраны', () => {
    assert.ok(!/gSoundLabel|gSoundHelp|gSoundTest|data-sound=|class="sound-toggle"|sound-switch/.test(html));
    assert.ok(!html.includes('Звук приложения</h3>'));
  });
});
