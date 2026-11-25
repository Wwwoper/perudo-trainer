import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chanceText, TASK_QUESTION, TASK_RULE, TASK_TEXT, thresholdPct, thresholdRuleText, THRESHOLD_NOTE, BID_LABEL, BID_LABEL_LADDER, situationParams } from '../src/trainer_text.js';

describe('chanceText', () => {
  it('запятая и без лишнего «.0»', () => {
    assert.equal(chanceText(0.062), '6,2 %');
    assert.equal(chanceText(0.5), '50 %');
    assert.equal(chanceText(1), '100 %');
    assert.equal(chanceText(0), '0 %');
    assert.equal(chanceText(0.8964), '89,6 %');
  });
  it('мусор и выход за границы не ломают текст', () => {
    assert.equal(chanceText(NaN), '—');
    assert.equal(chanceText(undefined), '—');
    assert.equal(chanceText(1.5), '100 %');
    assert.equal(chanceText(-1), '0 %');
  });
});

describe('Условие задачи', () => {
  it('вопрос заканчивается знаком вопроса и содержит оба хода; правило отдельно', () => {
    assert.match(TASK_QUESTION, /повысить.*«Не верю»\?$/);
    assert.match(TASK_RULE, /порог.*наибольшим шансом/);
    assert.equal(TASK_TEXT, `${TASK_QUESTION} ${TASK_RULE}`);
  });
});

describe('текст порога шанса', () => {
  it('порог целыми процентами, мусор и выход за границы — безопасно', () => {
    assert.equal(thresholdPct(0.5), '50%');
    assert.equal(thresholdPct(0.55), '55%');
    assert.equal(thresholdPct(0.05), '5%');
    assert.equal(thresholdPct(0.95), '95%');
    assert.equal(thresholdPct(NaN), '50%');
    assert.equal(thresholdPct(undefined), '50%');
    assert.equal(thresholdPct(7), '100%');
    assert.equal(thresholdPct(-1), '0%');
  });
  it('пояснение: критерий оценки, а не гарантия; без слова «безопасн»', () => {
    assert.match(THRESHOLD_NOTE, /критерий оценки, а не гарантия/);
    assert.ok(!/безопасн/i.test(THRESHOLD_NOTE));
  });
  it('правило называет оба условия для текущего порога', () => {
    const r = thresholdRuleText(0.6);
    assert.match(r, /^Сейчас 60%:/);
    assert.match(r, /ход хороший, если его шанс выше 60%/);
    assert.match(r, /У повышения это шанс, что ваша ставка верна; у «Не верю» — что проверка сработает/);
    assert.ok(!/безопасн/i.test(r));
  });
  it('в разметке и руководстве то же пояснение, проценты и ни слова «безопасная» про порог', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const guide = readFileSync(new URL('../docs/guide/trainer.html', import.meta.url), 'utf8');
    assert.ok(html.includes(`<p class="tset-note">${THRESHOLD_NOTE}</p>`));
    assert.match(html, /<p id="tThrRule" class="tset-note"><\/p>/);
    assert.match(html, /порог 50%\. С них/);
    const thr = html.slice(html.indexOf('id="tThrLabel"'), html.indexOf('class="tset-foot"'));
    assert.ok(!/безопасн/i.test(thr), 'в настройке порога нет слова «безопасная»');
    const item = guide.slice(guide.indexOf('<strong>Порог шанса</strong>'), guide.indexOf('</li>', guide.indexOf('<strong>Порог шанса</strong>')));
    assert.ok(!/безопасн/i.test(item));
    for (const part of ['шанс выше порога', 'проверка сработает', 'наибольшим шансом', 'не гарантия исхода']) assert.ok(item.includes(part), part);
    assert.match(guide, /пилюле «⚙️ Классика · порог 50%»/);
  });
});

describe('подписи Тренажёра', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const trainer = readFileSync(new URL('../src/ui/trainer.js', import.meta.url), 'utf8');
  const guide = readFileSync(new URL('../docs/guide/trainer.html', import.meta.url), 'utf8');
  const modes = readFileSync(new URL('../src/ui/modes.js', import.meta.url), 'utf8');
  it('ставка названа однозначно: «Ставка соперника» и «История ставок»', () => {
    assert.equal(BID_LABEL, 'Ставка соперника');
    assert.equal(BID_LABEL_LADDER, 'История ставок');
    assert.match(html, /id="tBidLabel">Ставка соперника<\/p>/);
    assert.ok(!/'Соперник:'|'Торги:'/.test(trainer), 'старые подписи не остались в коде');
  });
  it('у описания режима своя подпись «Описание режима» и название режима', () => {
    assert.match(html, /<div class="tset-label" id="tDescLabel">Описание режима<\/div>\s*<p id="tDesc" class="tset-desc" aria-labelledby="tDescLabel"><strong id="tDescName"><\/strong> <span id="tDescText"><\/span><\/p>/);
  });
  it('описание «Лестницы» говорит про предыдущие ставки соперников', () => {
    assert.match(modes, /с учётом предыдущих ставок: кто какие цифры называл/);
  });
  it('в таблице режимов руководства есть «Лестница ставок» с тем же объяснением', () => {
    const row = guide.match(/<tr><td>Лестница ставок<\/td><td>([\s\S]*?)<\/td><\/tr>/)?.[1] ?? '';
    assert.match(row, /предыдущих ставок/);
    assert.match(row, /table-reading\.html/);
  });
});

describe('situationParams', () => {
  it('на столе и единицы; джокеры выделены', () => {
    assert.deepEqual(situationParams({ total: 15, wild: true }), [
      { label: 'На столе', value: '15 кубиков', accent: false },
      { label: 'Единицы', value: 'джокеры', accent: true },
    ]);
    assert.deepEqual(situationParams({ total: 8, wild: false }).at(-1), { label: 'Единицы', value: 'обычные', accent: false });
  });
  it('склонение числа кубиков', () => {
    const word = (n) => situationParams({ total: n, wild: true })[0].value;
    assert.equal(word(1), '1 кубик');
    assert.equal(word(2), '2 кубика');
    assert.equal(word(4), '4 кубика');
    assert.equal(word(5), '5 кубиков');
    assert.equal(word(11), '11 кубиков');
    assert.equal(word(12), '12 кубиков');
    assert.equal(word(21), '21 кубик');
    assert.equal(word(22), '22 кубика');
  });
  it('«Лестница» добавляет число соперников; ноль и не число не выводятся', () => {
    assert.deepEqual(situationParams({ total: 17, wild: true, opponents: 3 }).map((p) => p.label), ['На столе', 'Соперников', 'Единицы']);
    assert.equal(situationParams({ total: 17, wild: true, opponents: 0 }).length, 2);
    assert.equal(situationParams({ total: 17, wild: true, opponents: null }).length, 2);
  });
  it('число кубиков не число — ошибка, а не «NaN кубиков»', () => {
    assert.throws(() => situationParams({ total: NaN, wild: true }), TypeError);
    assert.throws(() => situationParams({ total: 0, wild: true }), TypeError);
  });
});
