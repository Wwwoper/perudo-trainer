import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { styleMatchups, matchupLines, compareLine, MATCHUP_MIN, MATCHUP_NOTE, MATCHUP_TITLE } from '../src/style_matchup.js';
import { BANNED } from '../src/situation_text.js';

// вы (место 0) [2,3,5], bot_0 'smart' [5,5,1], bot_1 'bluffer' [4,6,2]; джокеры
const R1 = {
  id: 'g1-r1', ts: 1, round: 1, wild: true, me: 0, ids: ['human', 'bot_0', 'bot_1'],
  dice: [3, 3, 3], styles: [null, 'smart', 'bluffer'],
  hands: [[2, 3, 5], [5, 5, 1], [4, 6, 2]],
  // bot_1 1×4 → вы 2×4 (повышение на 1 против bluffer) → bot_0 3×5 → вы проверяете (против smart): пятёрок 1+2+1=4 ≥ 3 — ставка верна
  bids: [{ s: 2, q: 1, f: 4 }, { s: 0, q: 2, f: 4 }, { s: 1, q: 3, f: 5 }],
  end: { kind: 'dudo', by: 0, bidder: 1, actual: 4, ok: true },
};
const OLD = { ...R1, id: 'g0-r1', ids: undefined };
const get = (res, st) => res.styles.find((m) => m.style === st);

describe('styleMatchups', () => {
  it('ответы считаются по стилю автора предыдущей ставки', () => {
    const res = styleMatchups([R1]);
    assert.equal(res.rounds, 1);
    assert.equal(get(res, 'bluffer').raises, 1);
    assert.equal(get(res, 'bluffer').avgJump, 1);
    assert.equal(get(res, 'smart').dudos, 1);
    assert.equal(get(res, 'smart').dudoRight, 0);   // ставка была верна → проверка неверна
    assert.equal(get(res, 'smart').replies, 1);
    assert.equal(get(res, 'smart').enough, false);
  });
  it('верная проверка и Calza', () => {
    const R2 = { ...R1, id: 'g1-r2', bids: [{ s: 1, q: 6, f: 5 }], end: { kind: 'dudo', by: 0, bidder: 1, actual: 4, ok: false } };
    const R3 = { ...R1, id: 'g1-r3', bids: [{ s: 1, q: 4, f: 5 }], end: { kind: 'calza', by: 0, bidder: 1, actual: 4, ok: true } };
    const res = styleMatchups([R2, R3]);
    assert.equal(get(res, 'smart').dudos, 1);
    assert.equal(get(res, 'smart').dudoRight, 1);
    assert.equal(get(res, 'smart').calzas, 1);
  });
  it('ставки без стиля, свои подряд, старые раунды и мусор не считаются', () => {
    const noStyle = { ...R1, id: 'g1-r9', styles: [null, null, null] };
    assert.deepEqual(styleMatchups([noStyle, OLD, null, 7]).styles, []);
    assert.equal(styleMatchups(undefined).rounds, 0);
  });
  it('enough от MATCHUP_MIN ответов', () => {
    const many = Array.from({ length: MATCHUP_MIN }, (_, i) => ({ ...R1, id: `g1-r${10 + i}` }));
    assert.equal(get(styleMatchups(many), 'smart').enough, true);
  });
});

describe('тексты', () => {
  const m = { style: 'smart', replies: 6, raises: 4, dudos: 2, calzas: 0, dudoRight: 1, avgJump: 1.25, enough: true };
  it('строки: счётчики, шаг, проверки со склонением', () => {
    const t = matchupLines(m).join(' ');
    assert.match(t, /Ответов на ставки этого стиля: 6\. Повышений: 4, проверок: 2, Calza: 0\./);
    assert.match(t, /Средний шаг вашего повышения: \+1,3\./);
    assert.match(t, /верной 1 раз из 2/);
    assert.doesNotMatch(t, /мало данных/);
  });
  it('мало данных', () => {
    assert.match(matchupLines({ ...m, replies: 2, enough: false }).join(' '), /ответов 2 из 5/);
  });
  it('сравнение стилей: только при достаточных данных и заметной разнице', () => {
    const a = { ...m, style: 'smart', avgJump: 2 };
    const b = { ...m, style: 'bluffer', avgJump: 0.5 };
    assert.match(compareLine([a, b], (s) => s.toUpperCase()), /больше против стиля «SMART» \(\+2,0\), чем против «BLUFFER» \(\+0,5\)/);
    assert.equal(compareLine([a, { ...b, avgJump: 1.8 }]), '');
    assert.equal(compareLine([a, { ...b, enough: false }]), '');
    assert.equal(compareLine([a]), '');
    assert.equal(compareLine(undefined), '');
  });
  it('без запрещённых формулировок', () => {
    const t = [MATCHUP_TITLE, MATCHUP_NOTE, ...matchupLines(m), compareLine([m, { ...m, style: 'x', avgJump: -1 }])].join(' ');
    for (const re of BANNED) assert.ok(!re.test(t), `${re}`);
    assert.doesNotMatch(t, /обманщик|врёт|блефует/i);
  });
});
