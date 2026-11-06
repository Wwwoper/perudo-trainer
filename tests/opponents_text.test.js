import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { profileLines, meLines, ME_TITLE, ME_NOTE, TABLE_NOTE, TABLE_EMPTY } from '../src/opponents_text.js';
import { opponentProfiles, OBS_MIN } from '../src/opponents.js';
import { BANNED } from '../src/situation_text.js';

const base = { id: 'bot_0', style: 'smart', seen: 3, bids: 0, all: 0, part: 0, none: 0, raises: 0, avgJump: null, dudos: 0, dudoHit: 0, calzas: 0, enough: false };

describe('profileLines', () => {
  it('нет вскрытых ставок: просто «мало данных»', () => {
    const r = profileLines(base);
    assert.equal(r.enough, false);
    assert.match(r.lines[0], /Раундов вместе: 3\. Вскрыто ставок: 0\./);
    assert.match(r.lines[1], /мало данных: нужно хотя бы 5/);
  });
  it('мало данных: только счётчики, без долей', () => {
    const r = profileLines({ ...base, bids: 3, all: 1, part: 1, none: 1 });
    const t = r.lines.join(' ');
    assert.match(t, /вскрыто 3 из 5/);
    assert.match(t, /целиком 1, частично 1, не было 1/);
    assert.ok(!/%/.test(t));
  });
  it('достаточно данных: доли и шаг повышения', () => {
    const r = profileLines({ ...base, bids: 6, all: 3, part: 1, none: 2, raises: 4, avgJump: 1.25, enough: true });
    const t = r.lines.join(' ');
    assert.match(t, /целиком в 50 %, частично в 17 %, ни одного кубика в 33 %/);
    assert.match(t, /Средний шаг повышения: \+1,3 \(повышений: 4\)/);
  });
  it('отрицательный шаг показывается с минусом', () => {
    const t = profileLines({ ...base, bids: 5, all: 5, raises: 2, avgJump: -0.5, enough: true }).lines.join(' ');
    assert.match(t, /Средний шаг повышения: −0,5/);
  });
  it('проверки и Calza: склонение', () => {
    const t = profileLines({ ...base, bids: 5, all: 5, enough: true, dudos: 2, dudoHit: 1, calzas: 3 }).lines.join(' ');
    assert.match(t, /Проверял ставки: 2 раза, ставка оказывалась ложной 1 раз\./);
    assert.match(t, /Calza: 3 раза\./);
    assert.ok(!/Проверял/.test(profileLines(base).lines.join(' ')));
  });
  it('тексты без запрещённых формулировок и оценочных слов', () => {
    const profiles = [base, { ...base, bids: 3, all: 3 }, { ...base, bids: 9, none: 9, enough: true, dudos: 4, dudoHit: 4 }];
    for (const p of profiles) {
      const t = profileLines(p).lines.join(' ') + ' ' + TABLE_NOTE + ' ' + TABLE_EMPTY;
      for (const re of BANNED) assert.ok(!re.test(t), `${re}: ${t}`);
      assert.ok(!/обманщик|врёт|лжец|блефует/i.test(t), t);
    }
  });
  it('проходит на настоящем профиле из opponentProfiles', () => {
    const r = {
      id: 'g1-r1', ts: 1, round: 1, wild: true, me: 0, ids: ['human', 'bot_0'], dice: [2, 2], styles: [null, 'smart'],
      hands: [[2, 2], [3, 4]], bids: [{ s: 1, q: 2, f: 6 }], end: { kind: 'dudo', by: 0, bidder: 1, actual: 0, ok: false },
    };
    const { profiles } = opponentProfiles([r]);
    const t = profileLines(profiles[0]).lines.join(' ');
    assert.match(t, /Вскрыто ставок: 1/);
    assert.match(t, new RegExp(`из ${OBS_MIN}`));
  });
});

describe('meLines', () => {
  const m0 = { rounds: 2, bids: 0, all: 0, part: 0, none: 0, raises: 0, avgJump: null, challenged: 0, challengedFalse: 0, enough: false };
  it('нет ставок и мало данных', () => {
    assert.match(meLines(m0).lines[1], /нужно хотя бы 5/);
    const t = meLines({ ...m0, bids: 3, all: 1, part: 1, none: 1 }).lines.join(' ');
    assert.match(t, /вскрыто 3 из 5/);
    assert.ok(!/%/.test(t));
  });
  it('достаточно данных: доли, шаг, проверки со склонением', () => {
    const t = meLines({ ...m0, bids: 6, all: 3, part: 1, none: 2, raises: 4, avgJump: 1.25, challenged: 2, challengedFalse: 1, enough: true }).lines.join(' ');
    assert.match(t, /целиком в 50 %, частично в 17 %, ни одного кубика в 33 %/);
    assert.match(t, /Ваш средний шаг повышения: \+1,3 \(повышений: 4\)/);
    assert.match(t, /проверяли 2 раза, ставка оказывалась ложной 1 раз/);
  });
  it('без оценочных слов', () => {
    const t = [ME_TITLE, ME_NOTE, ...meLines({ ...m0, bids: 9, none: 9, enough: true, challenged: 4, challengedFalse: 4 }).lines].join(' ');
    assert.doesNotMatch(t, /обманщик|врёт|блефует|блеф\b/i);
    for (const re of BANNED) assert.ok(!re.test(t), `${re}`);
  });
});
