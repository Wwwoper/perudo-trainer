// settings_help.test.js — пояснения к настройкам партии для новичка.
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { ASSIST_HELP, autoExplainLabel, DEPTH_OFF_NOTE, EXPLAIN_HELP, PACE_NAMES, paceButtonText, paceCaption, secondsText, DEPTH_HELP, explainHelpText, memoryHelpText, memoryDetailsText, stylesHelpText } from '../src/ui/settings_help.js';
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
    assert.match(ASSIST_HELP.novice, /совет/);
    assert.ok(!createAssistConfig('training').showDirectAdvice && createAssistConfig('training').showCurrentBidOdds);
    assert.match(ASSIST_HELP.training, /шансы/);
    assert.match(ASSIST_HELP.training, /сами/);
    assert.ok(!createAssistConfig('game').showCurrentBidOdds);
    assert.match(ASSIST_HELP.game, /без шансов и подсказок/);
  });
});

describe('подписи режимов помощи и «По режиму»', () => {
  const labels = (id) => [...html.matchAll(new RegExp(`<select id="${id}">([\\s\\S]*?)</select>`, 'g'))][0][1]
    .match(/<option[^>]*>([^<]*)<\/option>/g).map((o) => o.replace(/<[^>]*>/g, ''));
  it('режимы названы вместе с тем, что они дают', () => {
    assert.deepStrictEqual(labels('gAssist'), ['Новичок — советы и шансы', 'Тренировка — шансы без советов', 'Игра — без подсказок']);
  });
  it('вместо «Как у режима помощи» в разметке стоит «По режиму — …», и такого оборота больше нет', () => {
    assert.ok(labels('gExplain').includes('По режиму — после хода'));
    assert.ok(!html.includes('Как у режима помощи'));
  });
  it('«По режиму» называет то, что получится на самом деле', () => {
    assert.strictEqual(autoExplainLabel('novice'), 'По режиму — до и после хода');
    assert.strictEqual(autoExplainLabel('training'), 'По режиму — после хода');
    assert.strictEqual(autoExplainLabel('game'), 'По режиму — выключены');
    assert.strictEqual(autoExplainLabel('что-то'), 'По режиму — после хода');
  });
  it('у недоступной «Подробности» короткая причина', () => {
    assert.match(DEPTH_OFF_NOTE, /^Недоступно: объяснения выключены\.$/);
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
  it('«авто» показывает, что получится в выбранном режиме помощи, без повтора «Сейчас»', () => {
    assert.strictEqual(explainHelpText('novice', 'auto'), EXPLAIN_HELP.full);
    assert.strictEqual(explainHelpText('training', 'auto'), EXPLAIN_HELP.after);
    assert.match(explainHelpText('game', 'auto'), /^Разбора ходов не будет/);
    assert.ok(!explainHelpText('novice', 'auto').startsWith('Сейчас'));
  });
  it('явный выбор пояснён тем же текстом', () => {
    assert.strictEqual(explainHelpText('training', 'full'), EXPLAIN_HELP.full);
    assert.match(explainHelpText('training', 'off'), /Разбора ходов не будет/);
  });
  it('подсказки режимов не называют сам режим и не обрываются', () => {
    for (const t of [...Object.values(ASSIST_HELP), ...Object.values(EXPLAIN_HELP)]) {
      assert.ok(!/^(Новичок|Тренировка|Игра):/.test(t), t);
      assert.match(t, /[.]$/);
    }
  });
  it('в режиме «Игра» с включёнными объяснениями есть оговорка про конец партии', () => {
    assert.match(explainHelpText('game', 'full'), /после окончания партии/);
    assert.match(explainHelpText('game', 'after'), /после окончания партии/);
    assert.ok(!/после окончания партии/.test(explainHelpText('game', 'off')));
    assert.ok(!/после окончания партии/.test(explainHelpText('training', 'full')));
  });
});

describe('переключатель «Показывать стили ботов»', () => {
  it('есть в форме, по умолчанию выключен, с пояснением', () => {
    assert.match(html, /<input id="gShowStylesOpt" type="checkbox">/);
    assert.ok(!/id="gShowStylesOpt"[^>]*checked/.test(html));
    assert.match(html, /<small id="gShowStylesInfo" class="game-settings-help"><\/small>/);
  });
});

describe('подсказка к «Показывать вскрытие кубиков»', () => {
  it('стоит сразу под переключателем', () => {
    assert.match(html, /id="gRevealOpt"[^>]*>[^<]*<\/label>\s*<small id="gRevealInfo" class="game-settings-help">[^<]*Calza[^<]*<\/small>/);
  });
});

describe('подсказки к темпу и подробности', () => {
  const values = (id) => [...html.matchAll(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`, 'g'))][0][1]
    .match(/value="(\w+)"/g).map((v) => v.slice(7, -1));
  it('есть для каждого значения списка', () => {
    assert.deepStrictEqual(Object.keys(PACE_NAMES).sort(), values('gSpeed').sort());
    assert.deepStrictEqual(Object.keys(DEPTH_HELP).sort(), values('gExplainDepth').sort());
  });
  it('каждая подсказка стоит сразу под своим полем в одной колонке', () => {
    for (const [sel, help] of [['gAssist', 'gAssistHelp'], ['gExplain', 'gExplainHelp'], ['gExplainDepth', 'gDepthHelp']]) {
      assert.match(html, new RegExp(`<select id="${sel}">[\\s\\S]*?</select>\\s*</label>\\s*<small id="${help}" class="game-settings-help"></small>\\s*</div>`), sel);
    }
  });
});

describe('подсказки к чекбоксам соперников меняются с состоянием', () => {
  it('«Показывать стили»: включено и выключено говорят разное', () => {
    assert.match(stylesHelpText(true), /^Включено: .*значок стиля/);
    assert.match(stylesHelpText(false), /^Выключено: .*раскроются в конце партии/);
  });
  it('«Боты запоминают»: короткая подпись для включено, выключено и сразу после сброса', () => {
    assert.strictEqual(memoryHelpText(true), 'Боты подстраиваются под то, как вы блефуете.');
    assert.match(memoryHelpText(false), /^Выключено: .*не запоминают, накопленное сохраняется/);
    assert.strictEqual(memoryHelpText(true, true), 'Готово: боты забыли ваши ставки.');
    assert.strictEqual(memoryHelpText(false, true), 'Готово: боты забыли ваши ставки.');
  });
  it('«Подробнее о памяти»: пусто, мало данных, достаточно данных', () => {
    assert.match(memoryDetailsText({ challenged: 0, bluffPct: 30 }), /ни одна ваша ставка не проверена/);
    assert.match(memoryDetailsText({ challenged: 2, bluffPct: 40 }), /Проверено ставок: 2, данных пока мало\. Старые наблюдения теряют вес\./);
    assert.match(memoryDetailsText({ challenged: 10, bluffPct: 40 }), /Проверено ставок: 10, ложных ≈ 40%\. Старые наблюдения теряют вес\./);
  });
  it('в разметке колонка памяти: подпись, «Подробнее о памяти», сброс и пояснение к нему; рядом «Показывать стили»', () => {
    assert.match(html, /<div class="field-row is-pair">\s*<div class="field-col">\s*<label class="check"><input id="gMemoryOpt"[^>]*>[^<]*<\/label>\s*<small id="gMemoryInfo"[^>]*><\/small>\s*<details class="help-more" id="gMemoryMore">\s*<summary>Подробнее о памяти<\/summary>\s*<p id="gMemoryStats"[^>]*><\/p>\s*<\/details>\s*<button type="button" id="gMemoryReset" class="quiet-btn is-danger">Сбросить память ботов о моих ставках<\/button>\s*<small id="gMemoryResetNote"[^>]*>Остальные настройки и статистика не меняются\.<\/small>\s*<\/div>\s*<div class="field-col">\s*<label class="check"><input id="gShowStylesOpt"/);
  });
});

describe('темп: кнопки и подпись считаются из реальных задержек ботов', () => {
  it('секунды: округление до десятых, запятая', () => {
    assert.equal(secondsText(1100), '1,1 с');
    assert.equal(secondsText(2600), '2,6 с');
    assert.equal(secondsText(320), '0,3 с');
    assert.equal(secondsText(1000), '1 с');
  });
  it('тексты кнопок: «Шаг» и время хода бота', () => {
    assert.deepEqual(Object.keys(PACE_NAMES).map(paceButtonText), ['Шаг', '2,6 с', '1,1 с', '0,3 с']);
  });
  it('подпись выбранного темпа называет режим и время; неизвестное значение — как «Нормально»', () => {
    assert.equal(paceCaption('step'), 'Пошагово — ход бота по кнопке');
    assert.equal(paceCaption('slow'), 'Медленно — около 2,6 с на ход');
    assert.equal(paceCaption('normal'), 'Нормально — около 1,1 с на ход');
    assert.equal(paceCaption('fast'), 'Быстро — около 0,3 с на ход');
    assert.equal(paceCaption('zzz'), paceCaption('normal'));
  });
});
