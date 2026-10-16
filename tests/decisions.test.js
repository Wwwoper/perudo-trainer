// decisions.test.js — запись решений игрока: счётчики по меткам и ключевые моменты партии.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const mockStorage = {};
global.localStorage = {
  getItem: (k) => (k in mockStorage ? mockStorage[k] : null),
  setItem: (k, v) => { mockStorage[k] = String(v); },
  removeItem: (k) => { delete mockStorage[k]; },
};

const { getStats, getMoments } = await import('../src/storage.js');
const {
  startDecisionLog, recordDecision, markRoundOutcome, saveKeyMoments, currentDecisions,
} = await import('../src/ui/decisions.js');

/** Проверка ставки по умолчанию. */
const dudo = (extra = {}) => ({
  round: 1, kind: 'dudo', total: 14, hand: [1, 3, 5, 5, 6], bid: { q: 7, f: 5 },
  palifico: false, p: 0.7, code: 'bad', ...extra,
});

beforeEach(() => {
  for (const k of Object.keys(mockStorage)) delete mockStorage[k];
  startDecisionLog('game_1');
});

describe('recordDecision', () => {
  it('возвращает момент и считает метки в профиле', () => {
    const m = recordDecision(dudo());
    assert.equal(m.id, 'game_1-1');
    assert.deepEqual(m.tags, ['dudo']);
    assert.deepEqual(getStats().byTag, { dudo: { n: 1, good: 0 } });
  });

  it('верное решение увеличивает и n, и good; счётчики копятся', () => {
    recordDecision(dudo({ code: 'good', p: 0.2 }));
    recordDecision(dudo({ code: 'bad' }));
    recordDecision(dudo({ code: 'meh', p: 0.55 }));
    assert.deepEqual(getStats().byTag.dudo, { n: 3, good: 1 });
  });

  it('несколько меток у одного решения', () => {
    recordDecision(dudo({ total: 5, hand: [3], bid: { q: 2, f: 1 }, palifico: true }));
    const tags = getStats().byTag;
    for (const t of ['dudo', 'endgame', 'lastDie', 'palifico', 'ones']) assert.deepEqual(tags[t], { n: 1, good: 0 }, t);
  });

  it('повышение: «единицы» — по вашей ставке; первое повышение в раунде допустимо', () => {
    const m = recordDecision({ round: 1, kind: 'raise', total: 10, hand: [1, 4], bid: null, played: { q: 3, f: 1 }, p: 0.6, code: 'good' });
    assert.deepEqual(m.tags, ['raise', 'ones']);
    assert.equal(m.bid, null);
  });

  it('непригодные данные: null, профиль не меняется', () => {
    assert.equal(recordDecision(dudo({ bid: null })), null);       // проверять нечего
    assert.equal(recordDecision(dudo({ hand: [9] })), null);
    assert.equal(recordDecision(dudo({ p: 3 })), null);
    assert.equal(mockStorage['perudo.userProfile'], undefined);
    assert.equal(currentDecisions().length, 0);
  });

  it('идентификаторы не повторяются, неудачная запись номер не занимает', () => {
    recordDecision(dudo());
    recordDecision(dudo({ hand: [9] }));
    const m = recordDecision(dudo());
    assert.equal(m.id, 'game_1-2');
  });

  it('рука копируется: изменение исходного массива момент не портит', () => {
    const hand = [2, 3];
    recordDecision(dudo({ total: 8, hand }));
    hand.push(6);
    assert.deepEqual(currentDecisions()[0].h, [2, 3]);
  });

  it('старый профиль без byTag читается', () => {
    mockStorage['perudo.userProfile'] = JSON.stringify({ n: 5, good: 3, byMode: {} });
    recordDecision(dudo());
    const S = getStats();
    assert.equal(S.n, 5);
    assert.deepEqual(S.byTag.dudo, { n: 1, good: 0 });
  });

  it('счётчики тренажёра не затираются', () => {
    mockStorage['perudo.userProfile'] = JSON.stringify({ n: 5, good: 3, byMode: { classic: { n: 5, good: 3 } } });
    recordDecision(dudo());
    assert.deepEqual(getStats().byMode, { classic: { n: 5, good: 3 } });
  });
});

describe('markRoundOutcome', () => {
  const lost = (id) => [{ type: 'DICE_REVEALED' }, { type: 'PLAYER_LOST_DIE', playerId: id }];

  it('вы потеряли кубик — решения этого раунда помечены, других раундов нет', () => {
    recordDecision(dudo({ round: 1 }));
    recordDecision({ round: 2, kind: 'raise', total: 12, hand: [1, 2], bid: null, played: { q: 3, f: 4 }, p: 0.5, code: 'good' });
    recordDecision(dudo({ round: 2 }));
    markRoundOutcome(lost('human'), 2);
    assert.deepEqual(currentDecisions().map((m) => m.lostDie), [false, true, true]);
  });

  it('потерял кто-то другой или кубика не потеряли — ничего не меняется', () => {
    recordDecision(dudo());
    markRoundOutcome(lost('bot_0'), 1);
    markRoundOutcome([{ type: 'PLAYER_GAINED_DIE', playerId: 'human' }], 1);
    markRoundOutcome(undefined, 1);
    markRoundOutcome([], 1);
    assert.equal(currentDecisions()[0].lostDie, false);
  });

  it('другой идентификатор игрока', () => {
    recordDecision(dudo());
    markRoundOutcome(lost('me'), 1, 'me');
    assert.equal(currentDecisions()[0].lostDie, true);
  });
});

describe('saveKeyMoments', () => {
  it('одни верные решения — ничего не сохраняется', () => {
    recordDecision(dudo({ code: 'good', p: 0.2 }));
    assert.deepEqual(saveKeyMoments(), []);
    assert.equal(mockStorage['perudo.reviews'], undefined);
  });

  it('сохраняет до трёх самых важных, верные не берёт', () => {
    for (let r = 1; r <= 5; r++) recordDecision(dudo({ round: r }));
    recordDecision(dudo({ round: 6, code: 'good', p: 0.2 }));
    const saved = saveKeyMoments();
    assert.equal(saved.length, 3);
    assert.equal(getMoments().length, 3);
    assert.ok(getMoments().every((m) => m.code !== 'good'));
  });

  it('добавляет к уже сохранённым, лимит 50', () => {
    for (let g = 0; g < 20; g++) {
      startDecisionLog(`g${g}`);
      for (let r = 1; r <= 3; r++) recordDecision(dudo({ round: r }));
      saveKeyMoments();
    }
    const all = getMoments();
    assert.equal(all.length, 50);
    assert.equal(all[all.length - 1].id, 'g19-3');
  });

  it('повторный вызов не дублирует записи', () => {
    recordDecision(dudo());
    saveKeyMoments();
    saveKeyMoments();
    assert.equal(getMoments().length, 1);
  });

  it('новая партия забывает решения прошлой', () => {
    recordDecision(dudo());
    startDecisionLog('game_2');
    assert.deepEqual(currentDecisions(), []);
    assert.deepEqual(saveKeyMoments(), []);
  });

  it('потеря кубика повышает важность: помеченное решение выбирается раньше', () => {
    for (let r = 1; r <= 4; r++) recordDecision(dudo({ round: r, p: 0.7 }));
    markRoundOutcome([{ type: 'PLAYER_LOST_DIE', playerId: 'human' }], 4);
    const first = saveKeyMoments()[0];
    assert.equal(first.round, 4);
  });
});
