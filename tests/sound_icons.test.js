// sound_icons.test.js — значки режимов звука и переключатель в настройках.
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
  it('громче — больше дуг: тихо одна, обычно две, у выключенного крест', () => {
    const arcs = (m) => (soundIconSvg(m).match(/a[\d. ]+ 0 0 1/g) || []).length;
    assert.strictEqual(arcs('off'), 0);
    assert.strictEqual(arcs('quiet'), 1);
    assert.strictEqual(arcs('normal'), 2);
    assert.strictEqual(strokes(soundIconSvg('off')), 2);
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
  it('три кнопки-радио со словами «Выкл.», «Тихо», «Обычно»; значок добавляет скрипт', () => {
    const group = html.match(/<div id="gSound"[^>]*role="radiogroup"[\s\S]*?<\/div>/)[0];
    const buttons = [...group.matchAll(/<button[^>]*data-sound="(\w+)"[^>]*>\s*<span class="sound-label">([^<]+)<\/span>\s*<\/button>/g)];
    assert.deepStrictEqual(buttons.map((b) => b[1]), [...SOUND_ICON_MODES]);
    assert.deepStrictEqual(buttons.map((b) => b[2]), ['Выкл.', 'Тихо', 'Обычно']);
    assert.match(html, /<h3 class="set-label" id="gSoundLabel">Звук приложения<\/h3>/);
    assert.match(html, /<small id="gSoundHelp" class="game-settings-help"><\/small>/);
    assert.ok(!/<select id="gSound"/.test(html));
  });
  it('«Звук приложения» идёт после «Дополнительных правил»', () => {
    assert.ok(html.indexOf('id="gRulesLabel"') < html.indexOf('id="gSoundLabel"'));
    assert.ok(html.indexOf('id="gSoundLabel"') < html.indexOf('class="btn-primary side-start"'));
  });
});
