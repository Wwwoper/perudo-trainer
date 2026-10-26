// sound_plan.test.js — правила звуков: что звучит при каком темпе, приоритеты, без наложений.
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  CUES, EVENTS, AUDIBLE, MODE_VOLUME, MAX_DELAY_MS, SOUND_MODES,
  sanitizeSoundMode, sanitizeSpeed, audibleEvents, createCuePlanner,
} from '../src/sound_plan.js';
import { BOT_SPEEDS } from '../src/game_settings.js';

const ctx = (over = {}) => ({ mode: 'normal', speed: 'normal', now: 1000, ...over });

describe('данные', () => {
  it('у каждого события есть звук, длительность и приоритет 1–3; звуки короткие', () => {
    for (const e of EVENTS) {
      const c = CUES[e];
      assert.ok(c.sound && typeof c.sound === 'string', e);
      assert.ok(c.dur > 0 && c.dur <= 1000, `${e}: длительность ${c.dur}`);
      assert.ok([1, 2, 3].includes(c.priority), e);
    }
    // обычные игровые звуки не длиннее паузы бота на быстром темпе (0,32 с) — иначе они не поместятся
    for (const e of EVENTS.filter((x) => !['win', 'lose'].includes(x))) assert.ok(CUES[e].dur <= 320, e);
  });
  it('таблица темпов покрывает все темпы из настроек и только известные события', () => {
    assert.deepStrictEqual(Object.keys(AUDIBLE).sort(), [...BOT_SPEEDS].sort());
    for (const sp of BOT_SPEEDS) for (const e of AUDIBLE[sp]) assert.ok(EVENTS.includes(e), `${sp}: ${e}`);
  });
  it('важные события слышны при любом темпе', () => {
    for (const sp of BOT_SPEEDS) {
      for (const e of ['turn', 'dudo', 'calza', 'loseDie', 'win', 'lose']) {
        assert.ok(AUDIBLE[sp].includes(e), `${sp}: нет ${e}`);
      }
    }
  });
  it('на быстром темпе ставки ботов и раздача молчат, на остальных звучат', () => {
    assert.ok(!AUDIBLE.fast.includes('bidBot'));
    assert.ok(!AUDIBLE.fast.includes('deal'));
    for (const sp of ['step', 'normal', 'slow']) {
      assert.ok(AUDIBLE[sp].includes('bidBot') && AUDIBLE[sp].includes('deal'), sp);
    }
  });
  it('ваши действия звучат при любом темпе', () => {
    for (const sp of BOT_SPEEDS) assert.ok(AUDIBLE[sp].includes('bidYou') && AUDIBLE[sp].includes('illegal'), sp);
  });
});

describe('sanitize', () => {
  it('режим: мусор = выкл', () => {
    for (const m of SOUND_MODES) assert.strictEqual(sanitizeSoundMode(m), m);
    for (const bad of [null, undefined, 5, 'loud', '', [], {}, true]) assert.strictEqual(sanitizeSoundMode(bad), 'off');
  });
  it('темп: мусор = нормально', () => {
    for (const s of BOT_SPEEDS) assert.strictEqual(sanitizeSpeed(s), s);
    for (const bad of [null, undefined, 'warp', 3, {}]) assert.strictEqual(sanitizeSpeed(bad), 'normal');
  });
  it('audibleEvents: при «выкл» пусто, иначе список темпа (копия)', () => {
    assert.deepStrictEqual(audibleEvents('off', 'slow'), []);
    assert.deepStrictEqual(audibleEvents('garbage', 'slow'), []);
    const list = audibleEvents('normal', 'fast');
    assert.deepStrictEqual(list, [...AUDIBLE.fast]);
    list.push('x');
    assert.ok(!AUDIBLE.fast.includes('x'));
  });
});

describe('планировщик: режим, громкость, темп', () => {
  it('«выкл» молчит всегда', () => {
    const p = createCuePlanner();
    for (const e of EVENTS) for (const sp of BOT_SPEEDS) assert.strictEqual(p.plan(e, ctx({ mode: 'off', speed: sp, now: 1e6 + Math.random() * 1e6 })), null);
  });
  it('громкость по режиму: тихо меньше, чем обычно', () => {
    assert.ok(MODE_VOLUME.quiet < MODE_VOLUME.normal);
    assert.strictEqual(createCuePlanner().plan('turn', ctx({ mode: 'quiet' })).volume, MODE_VOLUME.quiet);
    assert.strictEqual(createCuePlanner().plan('turn', ctx({ mode: 'normal' })).volume, MODE_VOLUME.normal);
  });
  it('на быстром темпе ставка бота молчит, на обычном звучит', () => {
    assert.strictEqual(createCuePlanner().plan('bidBot', ctx({ speed: 'fast' })), null);
    assert.ok(createCuePlanner().plan('bidBot', ctx({ speed: 'normal' })));
    assert.ok(createCuePlanner().plan('bidBot', ctx({ speed: 'slow' })));
  });
  it('на «пошаговом» темпе ставка бота тише, чем на обычном', () => {
    const step = createCuePlanner().plan('bidBot', ctx({ speed: 'step' }));
    const norm = createCuePlanner().plan('bidBot', ctx({ speed: 'normal' }));
    assert.ok(step.volume < norm.volume);
  });
  it('неизвестные события, время и темп не ломают планировщик', () => {
    const p = createCuePlanner();
    assert.strictEqual(p.plan('boom', ctx()), null);
    assert.strictEqual(p.plan('turn', ctx({ now: NaN })), null);
    assert.strictEqual(p.plan('turn', ctx({ now: undefined })), null);
    assert.ok(p.plan('turn', ctx({ speed: 'warp', now: 5000 })), 'неизвестный темп = нормально');
    assert.strictEqual(p.plan(undefined, ctx()), null);
    assert.doesNotThrow(() => p.plan('turn', {}));
  });
});

describe('планировщик: очередь и пропуски', () => {
  it('свободный звук играет сразу', () => {
    const c = createCuePlanner().plan('dudo', ctx());
    assert.strictEqual(c.delayMs, 0);
    assert.strictEqual(c.sound, 'dudo');
  });
  it('важное после важного ждёт окончания предыдущего: «Не верю!» → потеря кубика', () => {
    const p = createCuePlanner();
    const a = p.plan('dudo', ctx({ now: 1000 }));
    const b = p.plan('loseDie', ctx({ now: 1050 }));
    assert.strictEqual(a.delayMs, 0);
    assert.strictEqual(b.delayMs, a.dur - 50);
  });
  it('фоновое при занятом звуке пропускается', () => {
    const p = createCuePlanner();
    p.plan('dudo', ctx({ now: 1000 }));
    assert.strictEqual(p.plan('bidBot', ctx({ now: 1100 })), null);
    assert.strictEqual(p.plan('deal', ctx({ now: 1100 })), null);
    assert.strictEqual(p.plan('illegal', ctx({ now: 1100 })), null);
  });
  it('после окончания звука фоновое снова проходит', () => {
    const p = createCuePlanner();
    const a = p.plan('dudo', ctx({ now: 1000 }));
    assert.ok(p.plan('bidBot', ctx({ now: 1000 + a.dur })));
  });
  it('слишком длинная очередь важных обрезается: звук не отстаёт от игры', () => {
    const p = createCuePlanner();
    let dropped = 0;
    for (let i = 0; i < 10; i++) if (!p.plan('loseDie', ctx({ now: 1000 }))) dropped++;
    assert.ok(dropped > 0, 'очередь должна обрезаться');
    // каждый принятый звук стартует не позже MAX_DELAY_MS
    const q = createCuePlanner();
    for (let i = 0; i < 10; i++) {
      const c = q.plan('loseDie', ctx({ now: 1000 }));
      if (c) assert.ok(c.delayMs <= MAX_DELAY_MS);
    }
  });
  it('reset очищает очередь', () => {
    const p = createCuePlanner();
    p.plan('win', ctx({ now: 1000 }));
    assert.strictEqual(p.plan('bidBot', ctx({ now: 1100 })), null);
    p.reset();
    assert.ok(p.plan('bidBot', ctx({ now: 1100 })));
  });
  it('планировщики независимы', () => {
    const a = createCuePlanner(); const b = createCuePlanner();
    a.plan('win', ctx({ now: 1000 }));
    assert.ok(b.plan('bidBot', ctx({ now: 1100 })));
  });
  it('быстрый темп: пять ставок ботов подряд молчат, а «ваш ход» в конце звучит', () => {
    const p = createCuePlanner();
    let now = 1000;
    for (let i = 0; i < 5; i++) { assert.strictEqual(p.plan('bidBot', ctx({ speed: 'fast', now })), null); now += 320; }
    const c = p.plan('turn', ctx({ speed: 'fast', now }));
    assert.ok(c && c.delayMs === 0);
  });
  it('обычный темп: ставки ботов раз в 1,1 с не накладываются и не теряются', () => {
    const p = createCuePlanner();
    for (let i = 0; i < 5; i++) {
      const c = p.plan('bidBot', ctx({ speed: 'normal', now: 1000 + i * 1100 }));
      assert.ok(c, `ставка ${i} потеряна`);
      assert.strictEqual(c.delayMs, 0);
    }
  });
});

describe('свойство: звуки никогда не накладываются', () => {
  it('на 2000 случайных последовательностей событий принятые звуки не пересекаются во времени', () => {
    let seed = 12345;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let run = 0; run < 2000; run++) {
      const p = createCuePlanner();
      const speed = BOT_SPEEDS[Math.floor(rnd() * BOT_SPEEDS.length)];
      const mode = rnd() < 0.5 ? 'quiet' : 'normal';
      let now = 0;
      const played = [];
      for (let i = 0; i < 40; i++) {
        now += Math.floor(rnd() * 700);
        const e = EVENTS[Math.floor(rnd() * EVENTS.length)];
        const c = p.plan(e, { mode, speed, now });
        if (c) played.push([now + c.delayMs, now + c.delayMs + c.dur, e]);
      }
      played.sort((x, y) => x[0] - y[0]);
      for (let i = 1; i < played.length; i++) {
        assert.ok(played[i][0] >= played[i - 1][1], `наложение: ${JSON.stringify(played[i - 1])} и ${JSON.stringify(played[i])} (темп ${speed})`);
      }
    }
  });
});
