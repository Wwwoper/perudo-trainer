// trainer_stats.test.js — что стирает «Сбросить статистику тренажёра».
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resetTrainerStats, RESET_CONFIRM, LADDER_TAG } from '../src/trainer_stats.js';
import { addLadderResult } from '../src/ladder.js';

const profile = () => ({
  n: 12, good: 9, byMode: { classic: { n: 7, good: 5 }, ladder: { n: 5, good: 4 } },
  drill: { A: { n: 6, good: 4 }, B: { n: 3, good: 1 } },
  byTag: { endgame: { n: 8, good: 3 }, quiz: { n: 4, good: 2 }, [LADDER_TAG]: { n: 5, good: 4 } },
});

describe('resetTrainerStats', () => {
  it('обнуляет счётчики Тренажёра и тему «Лестницы»', () => {
    const S = resetTrainerStats(profile());
    assert.deepStrictEqual([S.n, S.good, S.byMode], [0, 0, {}]);
    assert.ok(!(LADDER_TAG in S.byTag));
  });
  it('не трогает упражнения и чужие темы «Над чем поработать»', () => {
    const S = resetTrainerStats(profile());
    assert.deepStrictEqual(S.drill, { A: { n: 6, good: 4 }, B: { n: 3, good: 1 } });
    assert.deepStrictEqual(S.byTag, { endgame: { n: 8, good: 3 }, quiz: { n: 4, good: 2 } });
  });
  it('метка темы та же, что пишет Тренажёр', () => {
    assert.ok(LADDER_TAG in addLadderResult({}, true));
  });
  it('работает на пустом и повреждённом профиле', () => {
    for (const bad of [undefined, null, [], 'x', 5]) {
      const S = resetTrainerStats({ n: 1, good: 1, byMode: { a: 1 }, byTag: bad });
      assert.deepStrictEqual([S.n, S.good, S.byMode], [0, 0, {}]);
    }
    assert.deepStrictEqual(resetTrainerStats({}).byMode, {});
  });
  it('второй сброс ничего не ломает', () => {
    const S = resetTrainerStats(resetTrainerStats(profile()));
    assert.strictEqual(S.n, 0);
    assert.deepStrictEqual(S.byTag, { endgame: { n: 8, good: 3 }, quiz: { n: 4, good: 2 } });
  });
});

describe('окно подтверждения и подписи', () => {
  it('перечисляет, что стирается, и что остаётся', () => {
    assert.match(RESET_CONFIRM, /статистику тренажёра/);
    assert.match(RESET_CONFIRM, /очередь повторов/);
    assert.match(RESET_CONFIRM, /«торги с несколькими соперниками»/);
    assert.match(RESET_CONFIRM, /Упражнения, партии и остальные темы не меняются/);
  });
  it('кнопка и руководство называют сброс одинаково', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const guide = readFileSync(new URL('../docs/guide/trainer.html', import.meta.url), 'utf8');
    assert.match(html, /id="tReset"[^>]*>Сбросить статистику тренажёра<\/button>/);
    assert.match(guide, /<strong>Сбросить статистику тренажёра<\/strong>/);
  });
  it('обработчик сброса не трогает упражнения', () => {
    const src = readFileSync(new URL('../src/ui/trainer.js', import.meta.url), 'utf8');
    const block = src.slice(src.indexOf("$('#tReset').onclick"), src.indexOf('tasks.refresh()'));
    assert.match(block, /updateStats\(resetTrainerStats\)/);
    assert.ok(!/drill/.test(block), 'в сбросе тренажёра не должно быть упражнений');
  });
});
