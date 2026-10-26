// sound_engine.test.js — рецепты звуков и движок воспроизведения (с поддельным AudioContext).
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CUES } from '../src/sound_plan.js';
import { RECIPES, WAVE_TYPES, FREQ_MIN, FREQ_MAX, GAIN_MAX, validateRecipe, formatRecipe, formatRecipes } from '../src/sound_recipes.js';
import { describeSoundMode } from '../src/sound_plan.js';
import { createSoundEngine } from '../src/sound_engine.js';

describe('рецепты звуков', () => {
  const sounds = Object.values(CUES).map((c) => c.sound);
  it('у каждого звука из правил есть рецепт, и лишних рецептов нет', () => {
    assert.deepStrictEqual(Object.keys(RECIPES).sort(), [...new Set(sounds)].sort());
  });
  it('ноты укладываются в длительность звука из правил', () => {
    for (const cue of Object.values(CUES)) {
      const end = Math.max(...RECIPES[cue.sound].map((n) => n.at + n.dur));
      assert.ok(end <= cue.dur, `${cue.sound}: ноты до ${end} мс, а звук ${cue.dur} мс`);
      assert.ok(end >= cue.dur * 0.5, `${cue.sound}: ноты заканчиваются слишком рано (${end} мс из ${cue.dur})`);
    }
  });
  it('частоты, громкость и формы волны в разумных пределах', () => {
    for (const [name, notes] of Object.entries(RECIPES)) {
      assert.ok(notes.length > 0, name);
      for (const n of notes) {
        assert.ok(n.freq >= FREQ_MIN && n.freq <= FREQ_MAX, `${name}: частота ${n.freq}`);
        if (n.to !== undefined) assert.ok(n.to >= FREQ_MIN && n.to <= FREQ_MAX, `${name}: to ${n.to}`);
        assert.ok(n.gain > 0 && n.gain <= GAIN_MAX, `${name}: громкость ${n.gain}`);
        assert.ok(WAVE_TYPES.includes(n.type), `${name}: волна ${n.type}`);
        assert.ok(Number.isInteger(n.at) && n.at >= 0 && n.dur >= 20, `${name}: время ноты`);
      }
    }
  });
  it('звуки различимы: нет двух одинаковых рецептов', () => {
    const seen = new Set();
    for (const [name, notes] of Object.entries(RECIPES)) {
      const key = JSON.stringify(notes);
      assert.ok(!seen.has(key), `${name} совпадает с другим звуком`);
      seen.add(key);
    }
  });
});

/** Поддельный AudioContext: запоминает всё, что у него просили сыграть. */
function fakeAudio({ state = 'running', throwOnCreate = false } = {}) {
  const log = { contexts: 0, oscillators: [], gains: [], resumed: 0 };
  class FakeContext {
    constructor() {
      if (throwOnCreate) throw new Error('нет звука');
      log.contexts++;
      this.state = state;
      this.currentTime = 10;
      this.destination = {};
    }
    resume() { log.resumed++; this.state = 'running'; return Promise.resolve(); }
    createGain() {
      const calls = [];
      const node = { calls, gain: { setValueAtTime: (...a) => calls.push(['set', ...a]), linearRampToValueAtTime: (...a) => calls.push(['lin', ...a]), exponentialRampToValueAtTime: (...a) => calls.push(['exp', ...a]) }, connect() {} };
      log.gains.push(node);
      return node;
    }
    createOscillator() {
      const o = { type: '', started: null, stopped: null, freqCalls: [], frequency: { setValueAtTime: (...a) => o.freqCalls.push(['set', ...a]), linearRampToValueAtTime: (...a) => o.freqCalls.push(['lin', ...a]) }, connect() {}, start(t) { o.started = t; }, stop(t) { o.stopped = t; } };
      log.oscillators.push(o);
      return o;
    }
  }
  return { Ctor: FakeContext, log };
}

function engineWith(opts = {}, mode = 'normal', speed = 'normal') {
  const audio = fakeAudio(opts);
  let t = 1000;
  const state = { mode, speed };
  const engine = createSoundEngine({
    AudioContextCtor: audio.Ctor, getMode: () => state.mode, getSpeed: () => state.speed, now: () => t,
  });
  return { engine, audio, state, at: (ms) => { t = ms; } };
}

describe('движок звука', () => {
  it('до жеста игрока звука нет: контекст не создан, ничего не играет', () => {
    const { engine, audio } = engineWith();
    assert.strictEqual(engine.cue('turn'), false);
    assert.strictEqual(audio.log.contexts, 0);
    assert.strictEqual(audio.log.oscillators.length, 0);
    assert.strictEqual(engine.unlocked, false);
  });
  it('после жеста звук играет: по осциллятору на ноту, с плавным началом и концом', () => {
    const { engine, audio } = engineWith();
    assert.strictEqual(engine.unlock(), true);
    assert.strictEqual(engine.cue('turn'), true);
    assert.strictEqual(audio.log.oscillators.length, RECIPES.turn.length);
    const o = audio.log.oscillators[0];
    assert.strictEqual(o.type, 'sine');
    assert.ok(Math.abs(o.started - 10) < 1e-9);
    assert.ok(o.stopped > o.started);
  });
  it('громкость нот зависит от режима: «тихо» тише, чем «обычно», в пропорции 0,35 : 0,7', () => {
    const peak = (mode) => {
      const { engine, audio } = engineWith({}, mode);
      engine.unlock(); engine.cue('bidYou');
      return Math.max(...audio.log.gains.flatMap((g) => g.calls.filter((c) => c[0] === 'lin').map((c) => c[1])));
    };
    const loud = peak('normal'); const quiet = peak('quiet');
    assert.ok(quiet < loud);
    assert.ok(Math.abs(quiet / loud - 0.5) < 1e-9, `отношение ${quiet / loud}`);
    assert.ok(loud <= 1, 'громкость не выше 1: звук не должен искажаться');
  });
  it('режим «выкл» молчит даже после жеста', () => {
    const { engine, audio } = engineWith({}, 'off');
    engine.unlock();
    assert.strictEqual(engine.cue('dudo'), false);
    assert.strictEqual(audio.log.oscillators.length, 0);
  });
  it('на быстром темпе ставка бота молчит, а «Не верю!» звучит', () => {
    const { engine, audio } = engineWith({}, 'normal', 'fast');
    engine.unlock();
    assert.strictEqual(engine.cue('bidBot'), false);
    assert.strictEqual(audio.log.oscillators.length, 0);
    assert.strictEqual(engine.cue('dudo'), true);
  });
  it('очередь: «потеря кубика» сразу после «Не верю!» стартует позже, а не поверх', () => {
    const { engine, audio, at } = engineWith();
    engine.unlock();
    at(1000); engine.cue('dudo');
    const first = audio.log.oscillators.length;
    at(1050); engine.cue('loseDie');
    const lose = audio.log.oscillators[first];
    assert.ok(lose.started > 10 + 0.1, `потеря кубика стартует в ${lose.started}, должна ждать конца «Не верю!»`);
  });
  it('новая партия очищает очередь (reset)', () => {
    const { engine, at } = engineWith();
    engine.unlock();
    at(1000); engine.cue('win');
    at(1100);
    assert.strictEqual(engine.cue('bidBot'), false);
    engine.reset();
    assert.strictEqual(engine.cue('bidBot'), true);
  });
  it('приостановленный контекст возобновляется', () => {
    const { engine, audio } = engineWith({ state: 'suspended' });
    engine.unlock();
    assert.ok(audio.log.resumed >= 1);
  });
  it('нет AudioContext или он падает при создании: тишина без исключений', () => {
    const none = createSoundEngine({ AudioContextCtor: null, getMode: () => 'normal', getSpeed: () => 'normal' });
    assert.strictEqual(none.unlock(), false);
    assert.strictEqual(none.cue('turn'), false);
    const bad = engineWith({ throwOnCreate: true });
    assert.doesNotThrow(() => bad.engine.unlock());
    assert.strictEqual(bad.engine.cue('turn'), false);
  });
  it('исключения внутри Web Audio не вылетают в игру', () => {
    const { engine, audio } = engineWith();
    engine.unlock();
    const Ctor = audio.Ctor.prototype;
    const orig = Ctor.createOscillator;
    Ctor.createOscillator = () => { throw new Error('сломалось'); };
    assert.doesNotThrow(() => engine.cue('dudo'));
    Ctor.createOscillator = orig;
  });
  it('мусорные события и режим не ломают движок', () => {
    const { engine, state } = engineWith();
    engine.unlock();
    for (const e of [undefined, null, 'x', 5, {}]) assert.strictEqual(engine.cue(e), false);
    state.mode = 'garbage';
    assert.strictEqual(engine.cue('turn'), false);
  });
  it('плавный сдвиг частоты: у «потери кубика» вызывается linearRamp', () => {
    const { engine, audio } = engineWith();
    engine.unlock(); engine.cue('loseDie');
    assert.ok(audio.log.oscillators[0].freqCalls.some((c) => c[0] === 'lin'));
  });
});

describe('движок звука: свои рецепты и playSound (лаборатория)', () => {
  const custom = { turn: [{ at: 0, dur: 100, freq: 440, type: 'square', gain: 0.2 }], mine: [{ at: 0, dur: 50, freq: 500, type: 'sine', gain: 0.1 }] };
  const make = (recipes) => {
    const audio = fakeAudio();
    const engine = createSoundEngine({ AudioContextCtor: audio.Ctor, getMode: () => 'normal', getSpeed: () => 'normal', now: () => 1000, recipes });
    return { engine, audio };
  };
  it('cue играет подставленный рецепт, а не стандартный', () => {
    const { engine, audio } = make(custom);
    engine.unlock();
    assert.strictEqual(engine.cue('turn'), true);
    assert.strictEqual(audio.log.oscillators.length, 1);
    assert.strictEqual(audio.log.oscillators[0].type, 'square');
  });
  it('playSound играет звук по имени сразу, мимо режима', () => {
    const audio = fakeAudio();
    const engine = createSoundEngine({ AudioContextCtor: audio.Ctor, getMode: () => 'off', getSpeed: () => 'fast', recipes: custom });
    engine.unlock();
    assert.strictEqual(engine.playSound('mine', 0.5), true);
    assert.strictEqual(audio.log.oscillators.length, 1);
  });
  it('playSound: до жеста, неизвестное имя и мусор — тишина без исключений', () => {
    const { engine } = make(custom);
    assert.strictEqual(engine.playSound('mine'), false);
    engine.unlock();
    assert.strictEqual(engine.playSound('нет-такого'), false);
    assert.strictEqual(engine.playSound(undefined), false);
  });
});

describe('проверка и запись рецептов', () => {
  const ok = [{ at: 0, dur: 100, freq: 440, type: 'sine', gain: 0.3 }];
  it('все стандартные рецепты проходят проверку', () => {
    for (const [name, notes] of Object.entries(RECIPES)) {
      assert.deepStrictEqual(validateRecipe(notes, CUES[Object.keys(CUES).find((k) => (CUES[k].sound || k) === name)]?.dur), [], name);
    }
  });
  it('находит ошибки в нотах', () => {
    assert.ok(validateRecipe([]).length);
    assert.ok(validateRecipe('x').length);
    assert.ok(validateRecipe([null]).length);
    assert.ok(validateRecipe([{ ...ok[0], freq: 10 }]).length);
    assert.ok(validateRecipe([{ ...ok[0], to: 99999 }]).length);
    assert.ok(validateRecipe([{ ...ok[0], gain: 5 }]).length);
    assert.ok(validateRecipe([{ ...ok[0], type: 'noise' }]).length);
    assert.ok(validateRecipe([{ ...ok[0], dur: 5 }]).length);
    assert.ok(validateRecipe([{ ...ok[0], at: -1 }]).length);
  });
  it('длительность: не длиннее отведённого и не слишком короткий', () => {
    assert.deepStrictEqual(validateRecipe(ok, 150), []);
    assert.ok(validateRecipe(ok, 90)[0].includes('отведено'));
    assert.ok(validateRecipe(ok, 400)[0].includes('короткий'));
  });
  it('formatRecipe даёт текст, который читается обратно в тот же рецепт', () => {
    const notes = [{ at: 0, dur: 100, freq: 440, to: 220, type: 'sine', gain: 0.3 }];
    const text = formatRecipe('lose-die', notes);
    assert.ok(text.startsWith("  'lose-die': ["));
    const back = new Function(`return {${formatRecipes({ 'lose-die': notes })}}`)();
    assert.deepStrictEqual(back['lose-die'], notes);
    assert.ok(formatRecipe('turn', ok).startsWith('  turn: ['));
  });
  it('describeSoundMode: выключено и включено', () => {
    assert.strictEqual(describeSoundMode('off'), 'Звуки выключены.');
    assert.ok(describeSoundMode('quiet').includes('быстром темпе'));
    assert.strictEqual(describeSoundMode('мусор'), 'Звуки выключены.');
  });
});
