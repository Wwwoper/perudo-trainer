import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verdictText, VERDICT_GOOD, VERDICT_BAD, MODEL_NOTE, chanceText, moveBreakdown, TASK_QUESTION, TASK_RULE, TASK_TEXT, thresholdPct, thresholdRuleText, THRESHOLD_NOTE } from '../src/trainer_text.js';

describe('trainer_text', () => {
  it('вердикт: верное и сомнительное решение, оба «по шансу»', () => {
    assert.equal(verdictText(true), VERDICT_GOOD);
    assert.equal(verdictText(false), VERDICT_BAD);
    for (const v of [VERDICT_GOOD, VERDICT_BAD]) assert.match(v, /по шансу$/);
    assert.match(VERDICT_GOOD, /Хорошее решение/);
    assert.match(VERDICT_BAD, /Сомнительное решение/);
  });
  it('оговорка называет, что именно оценено, и что это не выигрыш партии', () => {
    assert.match(MODEL_NOTE, /по шансу ставки/);
    assert.match(MODEL_NOTE, /не по выигрышу партии/);
  });
  it('в текстах нет запрещённых слов и абсолютных обещаний', () => {
    for (const t of [VERDICT_GOOD, VERDICT_BAD, MODEL_NOTE]) assert.doesNotMatch(t, /обманщик|врёт|блеф|гарантир|всегда|лучший ход/i);
  });
});

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

describe('moveBreakdown', () => {
  it('повышение: шанс ставки, порог и пояснение', () => {
    const ok = moveBreakdown({ kind: 'raise', p: 0.896, po: 1, t: 0.5, good: true, noGoodMove: false });
    assert.deepEqual(ok.mine, { chance: 0.896, passes: true });
    assert.equal(ok.opp.chance, 1);
    assert.equal(ok.why, 'Шанс вашей ставки 89,6 % не ниже порога 50 %.');
    const bad = moveBreakdown({ kind: 'raise', p: 0.062, po: 0.1, t: 0.5, good: false, noGoodMove: false });
    assert.equal(bad.mine.passes, false);
    assert.equal(bad.why, 'Шанс вашей ставки 6,2 % ниже порога 50 %.');
  });
  it('«Не верю»: шанс хода — что проверка сработает', () => {
    const b = moveBreakdown({ kind: 'dudo', po: 0.1, t: 0.5, good: true, noGoodMove: false });
    assert.equal(b.mine.chance, 0.9);
    assert.equal(b.mine.passes, true);
    assert.equal(b.opp.chance, 0.1);
    assert.equal(b.why, '«Не верю» сработает с шансом 90 %: это не ниже порога 50 %.');
    const w = moveBreakdown({ kind: 'dudo', po: 0.8, t: 0.5, good: false, noGoodMove: false });
    assert.equal(w.mine.passes, false);
    assert.match(w.why, /ниже порога 50 %/);
  });
  it('ни один ход не проходит порог: пояснение про наибольший шанс', () => {
    assert.match(moveBreakdown({ kind: 'raise', p: 0.3, po: 0.4, t: 0.5, good: true, noGoodMove: true }).why, /наибольший шанс успеха/);
    assert.match(moveBreakdown({ kind: 'raise', p: 0.2, po: 0.4, t: 0.5, good: false, noGoodMove: true }).why, /был ход с большим шансом/);
  });
  it('в тексте нет запрещённых слов', () => {
    for (const k of ['raise', 'dudo']) for (const good of [true, false]) for (const ng of [true, false]) {
      assert.doesNotMatch(moveBreakdown({ kind: k, p: 0.3, po: 0.4, t: 0.5, good, noGoodMove: ng }).why, /обманщик|врёт|блеф|гарантир|всегда|undefined|NaN/i);
    }
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
    assert.match(r, /повышение хорошее, если ваша ставка верна не реже 60%/);
    assert.match(r, /«Не верю» хорошее, если ставка соперника верна реже 60%/);
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
    for (const part of ['не реже порога', 'реже порога', 'наибольшим шансом', 'не гарантия исхода']) assert.ok(item.includes(part), part);
    assert.match(guide, /пилюле «⚙️ Классика · порог 50%»/);
  });
});
