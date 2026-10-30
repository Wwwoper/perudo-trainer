// settings_help.test.js — пояснения к настройкам партии для новичка.
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { ASSIST_HELP, EXPLAIN_HELP, explainHelpText } from '../src/ui/settings_help.js';
import { createAssistConfig } from '../src/assist.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

describe('пояснения к режимам помощи', () => {
  it('есть для каждого режима из списка и в списке нет лишних', () => {
    const values = [...html.matchAll(/<select id="gAssist">([\s\S]*?)<\/select>/g)][0][1]
      .match(/value="(\w+)"/g).map((s) => s.slice(7, -1));
    assert.deepStrictEqual(values.sort(), Object.keys(ASSIST_HELP).sort());
  });
  it('совпадают с настройками: шансы и прямой совет', () => {
    assert.ok(createAssistConfig('novice').showDirectAdvice);
    assert.match(ASSIST_HELP.novice, /советует/);
    assert.ok(!createAssistConfig('training').showDirectAdvice && createAssistConfig('training').showCurrentBidOdds);
    assert.match(ASSIST_HELP.training, /шансы/);
    assert.ok(!createAssistConfig('game').showCurrentBidOdds);
    assert.match(ASSIST_HELP.game, /без шансов/);
  });
});

describe('карточки Calza и Палифико', () => {
  const card = (id) => html.match(new RegExp(`<label class="rule-card">\\s*<input id="${id}"[\\s\\S]*?</label>`))?.[0] ?? '';
  it('у обоих правил есть название и объяснение', () => {
    for (const [id, title, key] of [['gCalzaOpt', 'Calza', /ровно столько/], ['gPalificoOpt', 'Палифико', /один кубик/]]) {
      const c = card(id);
      assert.ok(c, `${id}: карточка найдена`);
      assert.ok(c.includes(`<b>${title}</b>`), `${id}: название`);
      assert.match(c, key, `${id}: объяснение`);
    }
  });
  it('чекбоксы остаются выключенными по умолчанию, а совет для первой партии есть', () => {
    assert.ok(!/id="gCalzaOpt"[^>]*checked/.test(html));
    assert.ok(!/id="gPalificoOpt"[^>]*checked/.test(html));
    assert.match(html, /Для первой партии оба правила можно оставить выключенными/);
  });
});

describe('пояснения к объяснениям', () => {
  const options = (id) => [...html.matchAll(new RegExp(`<select id="${id}">([\\s\\S]*?)</select>`, 'g'))][0][1]
    .match(/value="(\w+)"/g).map((s) => s.slice(7, -1));
  it('в списке «Объяснения» все значения настроек, в «Подробности» — обе глубины', () => {
    assert.deepStrictEqual(options('gExplain'), ['auto', 'off', 'after', 'full']);
    assert.deepStrictEqual(options('gExplainDepth'), ['short', 'detailed']);
  });
  it('у каждого значения есть пояснение', () => {
    assert.deepStrictEqual(Object.keys(EXPLAIN_HELP).sort(), ['after', 'full', 'off']);
  });
  it('«авто» называет, что получится в выбранном режиме помощи', () => {
    assert.match(explainHelpText('novice', 'auto'), /^Сейчас: до и после хода\./);
    assert.match(explainHelpText('training', 'auto'), /^Сейчас: после хода\./);
    assert.match(explainHelpText('game', 'auto'), /^Сейчас: выключены\./);
  });
  it('явный выбор пояснён без слова «Сейчас»', () => {
    assert.ok(!explainHelpText('training', 'full').startsWith('Сейчас'));
    assert.match(explainHelpText('training', 'off'), /выключены/);
  });
  it('в режиме «Игра» с включёнными объяснениями есть оговорка про конец партии', () => {
    assert.match(explainHelpText('game', 'full'), /после окончания партии/);
    assert.match(explainHelpText('game', 'after'), /после окончания партии/);
    assert.ok(!/после окончания партии/.test(explainHelpText('game', 'off')));
    assert.ok(!/после окончания партии/.test(explainHelpText('training', 'full')));
  });
});
