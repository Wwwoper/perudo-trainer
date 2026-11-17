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

describe('раздел звука в index.html', () => {
  it('одна кнопка-переключатель с aria-pressed и подписью; списка, трёх режимов и «Проверить звук» нет', () => {
    assert.match(html, /<button type="button" id="gSound" class="sound-toggle" aria-pressed="false"><span class="sound-label">Звук выключен<\/span><\/button>/);
    assert.match(html, /<h3 class="set-label" id="gSoundLabel">Звук приложения<\/h3>/);
    assert.match(html, /<small id="gSoundHelp" class="game-settings-help"><\/small>/);
    assert.ok(!/gSoundTest|data-sound=/.test(html));
    assert.ok(!/class="sound-switch"/.test(html));
  });
  it('«Звук приложения» идёт после «Дополнительных правил»', () => {
    assert.ok(html.indexOf('id="gRulesLabel"') < html.indexOf('id="gSoundLabel"'));
    assert.ok(html.indexOf('id="gSoundLabel"') < html.indexOf('class="btn-primary side-start"'));
  });
});
