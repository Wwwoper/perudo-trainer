// game_settings.test.js — настройки последней сыгранной партии: проверка данных и хранилище.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

const mem = {};
global.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: (k) => { delete mem[k]; },
};

const {
  defaultGameSettings, sanitizeGameSettings, isDefaultGameSettings, describeGameSettings,
  GAME_SETTINGS_VERSION, EXPLAIN_MODES, EXPLAIN_DEPTHS,
  firstGamePreset, isFirstGamePreset, FIRST_GAME_LABEL, FIRST_GAME_HINT, firstPresetView, FIRST_GAME_APPLIED_HINT,
} = await import('../src/game_settings.js');
const {
  getLastGameSettings, setLastGameSettings, clearLastGameSettings, getSettings, setSettings,
} = await import('../src/storage.js');

beforeEach(() => { for (const k of Object.keys(mem)) delete mem[k]; });

describe('sanitizeGameSettings', () => {
  it('мусор вместо объекта даёт стандартные настройки', () => {
    for (const bad of [null, undefined, 5, 'x', [], true]) {
      assert.deepStrictEqual(sanitizeGameSettings(bad), defaultGameSettings());
    }
  });
  it('корректные значения сохраняются как есть', () => {
    const s = {
      dice: 6, bots: 4, botStyles: ['careful', 'random', 'auto', 'bluffer'], botLevel: 'hard',
      memory: false, assist: 'game', speed: 'fast', calza: true, palifico: true, reveal: false,
      explain: 'full', explainDepth: 'detailed', hideStyles: false,
    };
    assert.deepStrictEqual(sanitizeGameSettings(s), s);
  });
  it('числа зажимаются в пределы и округляются; строки-числа принимаются', () => {
    assert.strictEqual(sanitizeGameSettings({ dice: 99 }).dice, 10);
    assert.strictEqual(sanitizeGameSettings({ dice: -3 }).dice, 1);
    assert.strictEqual(sanitizeGameSettings({ bots: 0 }).bots, 1);
    assert.strictEqual(sanitizeGameSettings({ bots: 9 }).bots, 5);
    assert.strictEqual(sanitizeGameSettings({ dice: 4.6 }).dice, 5);
    assert.strictEqual(sanitizeGameSettings({ dice: '7' }).dice, 7);
  });
  it('не числа заменяются стандартными', () => {
    for (const bad of [NaN, Infinity, 'abc', '', null, {}, []]) {
      assert.strictEqual(sanitizeGameSettings({ dice: bad }).dice, 5);
      assert.strictEqual(sanitizeGameSettings({ bots: bad }).bots, 3);
    }
  });
  it('неизвестные режимы, темп и уровень заменяются стандартными', () => {
    const s = sanitizeGameSettings({ assist: 'cheat', speed: 'warp', botLevel: 'god' });
    assert.strictEqual(s.assist, 'training');
    assert.strictEqual(s.speed, 'normal');
    assert.strictEqual(s.botLevel, 'normal');
  });
  it('флажки принимают только true/false', () => {
    const s = sanitizeGameSettings({ memory: 'no', calza: 1, palifico: 'true', reveal: null });
    assert.deepStrictEqual([s.memory, s.calza, s.palifico, s.reveal], [true, false, false, true]);
  });
  it('стили ботов: лишние обрезаются, незнакомые становятся «по умолчанию»', () => {
    const s = sanitizeGameSettings({ botStyles: ['careful', 'ghost', 7, null, 'smart', 'bluffer', 'random'] });
    assert.strictEqual(s.botStyles.length, 5);
    assert.deepStrictEqual(s.botStyles.slice(0, 5), ['careful', 'auto', 'auto', 'auto', 'smart']);
    assert.deepStrictEqual(sanitizeGameSettings({ botStyles: 'careful' }).botStyles, []);
  });
  it('идемпотентна и не меняет исходный объект', () => {
    const raw = { dice: 99, botStyles: ['x'] };
    const copy = JSON.parse(JSON.stringify(raw));
    const once = sanitizeGameSettings(raw);
    assert.deepStrictEqual(raw, copy);
    assert.deepStrictEqual(sanitizeGameSettings(once), once);
  });
  it('defaultGameSettings каждый раз отдаёт новый объект', () => {
    const a = defaultGameSettings(); a.botStyles.push('x');
    assert.deepStrictEqual(defaultGameSettings().botStyles, []);
  });
});

describe('isDefaultGameSettings и describeGameSettings', () => {
  it('стандартные настройки распознаются, изменённые нет', () => {
    assert.ok(isDefaultGameSettings(defaultGameSettings()));
    assert.ok(isDefaultGameSettings(null));
    assert.ok(!isDefaultGameSettings({ ...defaultGameSettings(), calza: true }));
    assert.ok(isDefaultGameSettings({ ...defaultGameSettings(), botStyles: ['auto', 'auto', 'auto'] }));
    assert.ok(!isDefaultGameSettings({ ...defaultGameSettings(), botStyles: ['auto', 'smart', 'auto'] }));
  });
  it('сводка с правильными склонениями', () => {
    assert.strictEqual(describeGameSettings(defaultGameSettings()), '5 кубиков · 3 бота · Тренировка · Нормально');
    assert.strictEqual(describeGameSettings({ dice: 1, bots: 1, assist: 'novice', speed: 'step' }),
      '1 кубик · 1 бот · Новичок · Пошагово');
    assert.strictEqual(describeGameSettings({ dice: 2, bots: 5, assist: 'game', speed: 'fast' }),
      '2 кубика · 5 ботов · Игра без подсказок · Быстро');
  });
});

describe('хранилище настроек последней партии', () => {
  it('пока ничего не сохранено — null', () => {
    assert.strictEqual(getLastGameSettings(), null);
  });
  it('сохраняется и читается обратно', () => {
    const s = { ...defaultGameSettings(), dice: 4, bots: 2, calza: true, botStyles: ['smart', 'auto'] };
    setLastGameSettings(s);
    assert.deepStrictEqual(getLastGameSettings(), s);
  });
  it('при записи данные проверяются', () => {
    setLastGameSettings({ dice: 500, assist: '??' });
    const got = getLastGameSettings();
    assert.strictEqual(got.dice, 10);
    assert.strictEqual(got.assist, 'training');
  });
  it('не затирает остальные поля perudo.settings', () => {
    setSettings({ animations: 'off' });
    setLastGameSettings(defaultGameSettings());
    assert.strictEqual(getSettings().animations, 'off');
    setSettings({ assistMode: 'game' });
    assert.ok(getLastGameSettings());
  });
  it('повреждённые данные в хранилище не ломают чтение', () => {
    mem['perudo.settings'] = '{не json';
    assert.strictEqual(getLastGameSettings(), null);
    mem['perudo.settings'] = JSON.stringify({ lastGame: 'строка' });
    assert.deepStrictEqual(getLastGameSettings(), defaultGameSettings());
    mem['perudo.settings'] = JSON.stringify([1, 2]);
    assert.strictEqual(getLastGameSettings(), null);
  });
  it('clearLastGameSettings удаляет только lastGame', () => {
    setSettings({ animations: 'off' });
    setLastGameSettings(defaultGameSettings());
    clearLastGameSettings();
    assert.strictEqual(getLastGameSettings(), null);
    assert.strictEqual(getSettings().animations, 'off');
    clearLastGameSettings(); // повторный вызов безопасен
  });
  it('ошибка записи localStorage не бросает исключение', () => {
    const orig = global.localStorage.setItem;
    global.localStorage.setItem = () => { throw new Error('quota'); };
    assert.doesNotThrow(() => setLastGameSettings(defaultGameSettings()));
    global.localStorage.setItem = orig;
  });
});

describe('настройки версии 2: объяснения и стили', () => {
  it('версия 2; стандартные значения: авто, коротко, стили скрыты', () => {
    assert.strictEqual(GAME_SETTINGS_VERSION, 2);
    const d = defaultGameSettings();
    assert.deepStrictEqual([d.explain, d.explainDepth, d.hideStyles], ['auto', 'short', true]);
  });
  it('миграция: настройки версии 1 без новых полей читаются со стандартными значениями', () => {
    const old = { dice: 6, bots: 2, botStyles: ['careful'], botLevel: 'hard', memory: false, assist: 'novice', speed: 'fast', calza: true, palifico: false, reveal: true };
    const s = sanitizeGameSettings(old);
    assert.deepStrictEqual([s.explain, s.explainDepth, s.hideStyles], ['auto', 'short', true]);
    assert.strictEqual(s.dice, 6);
    assert.strictEqual(s.assist, 'novice');
  });
  it('неизвестные значения заменяются стандартными', () => {
    const s = sanitizeGameSettings({ explain: 'всё', explainDepth: 'очень', hideStyles: 'нет' });
    assert.deepStrictEqual([s.explain, s.explainDepth, s.hideStyles], ['auto', 'short', true]);
  });
  it('допустимые значения сохраняются', () => {
    for (const e of EXPLAIN_MODES) assert.strictEqual(sanitizeGameSettings({ explain: e }).explain, e);
    for (const e of EXPLAIN_DEPTHS) assert.strictEqual(sanitizeGameSettings({ explainDepth: e }).explainDepth, e);
    assert.strictEqual(sanitizeGameSettings({ hideStyles: false }).hideStyles, false);
    assert.deepStrictEqual([...EXPLAIN_MODES], ['auto', 'off', 'after', 'full']);
  });
  it('сброс «стандартные настройки» учитывает новые поля', () => {
    assert.ok(isDefaultGameSettings(defaultGameSettings()));
    assert.ok(!isDefaultGameSettings({ explain: 'full' }));
    assert.ok(!isDefaultGameSettings({ explainDepth: 'detailed' }));
    assert.ok(!isDefaultGameSettings({ hideStyles: false }));
  });
  it('сводка: объяснения называются, только если они не «авто»', () => {
    assert.strictEqual(describeGameSettings({ explain: 'auto' }), '5 кубиков · 3 бота · Тренировка · Нормально');
    assert.match(describeGameSettings({ explain: 'off' }), /без объяснений/);
    assert.match(describeGameSettings({ explain: 'full' }), /до и после/);
    assert.match(describeGameSettings({ explain: 'after' }), /после хода/);
  });
  it('идемпотентность и круг через хранилище', () => {
    const s = sanitizeGameSettings({ explain: 'after', explainDepth: 'detailed', hideStyles: false });
    assert.deepStrictEqual(sanitizeGameSettings(s), s);
    setLastGameSettings(s);
    assert.deepStrictEqual(getLastGameSettings(), s);
  });
});

describe('пресет «Первая учебная партия»', () => {
  it('один бот «Осторожный», «Новичок», «Медленно», стили показаны, без Calza и Палифико', () => {
    const p = firstGamePreset();
    assert.strictEqual(p.bots, 1);
    assert.deepStrictEqual(p.botStyles, ['careful']);
    assert.strictEqual(p.assist, 'novice');
    assert.strictEqual(p.speed, 'slow');
    assert.strictEqual(p.hideStyles, false);
    assert.strictEqual(p.calza, false);
    assert.strictEqual(p.palifico, false);
  });
  it('проходит проверку данных без изменений и каждый раз возвращает новый объект', () => {
    const p = firstGamePreset();
    assert.deepStrictEqual(sanitizeGameSettings(p), p);
    p.bots = 5;
    assert.strictEqual(firstGamePreset().bots, 1);
  });
  it('isFirstGamePreset узнаёт пресет и не путает его со стандартными настройками', () => {
    assert.ok(isFirstGamePreset(firstGamePreset()));
    assert.ok(!isFirstGamePreset(defaultGameSettings()));
    assert.ok(!isFirstGamePreset({ ...firstGamePreset(), speed: 'fast' }));
    assert.ok(!isDefaultGameSettings(firstGamePreset()));
  });
  it('подпись и подсказка называют все условия пресета', () => {
    assert.strictEqual(FIRST_GAME_LABEL, 'Первая учебная партия');
    for (const w of ['Осторожный', 'Новичок', 'Медленно', 'стили', 'Calza', 'Палифико']) {
      assert.ok(FIRST_GAME_HINT.includes(w), w);
    }
  });
  it('кнопка и подсказка в index.html совпадают с модулем', async () => {
    const { readFileSync } = await import('node:fs');
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    assert.ok(html.includes(`<button type="button" id="gFirstPreset">${FIRST_GAME_LABEL}</button>`));
    assert.ok(html.includes(FIRST_GAME_HINT));
  });
  it('быстрый старт и страница настроек называют кнопку теми же словами', async () => {
    const { readFileSync } = await import('node:fs');
    for (const f of ['quick-start', 'game-settings']) {
      const t = readFileSync(new URL(`../docs/guide/${f}.html`, import.meta.url), 'utf8').replace(/<[^>]+>/g, ' ');
      assert.ok(t.includes(`«${FIRST_GAME_LABEL}»`), f);
    }
  });
});

describe('строка «Первая учебная партия»', () => {
  it('до первой сыгранной партии видна, после — нет', () => {
    assert.strictEqual(firstPresetView({ games: 0, matches: false }).visible, true);
    assert.strictEqual(firstPresetView({ games: 1, matches: false }).visible, false);
    assert.strictEqual(firstPresetView({ games: 12, matches: true }).visible, false);
  });
  it('мусор вместо числа партий считается нулём партий', () => {
    for (const games of [undefined, null, NaN, -3, 'x']) {
      assert.strictEqual(firstPresetView({ games, matches: false }).visible, true, String(games));
    }
  });
  it('когда настройки уже выставлены, подсказка говорит, что осталось начать партию', () => {
    const v = firstPresetView({ games: 0, matches: true });
    assert.strictEqual(v.pressed, true);
    assert.strictEqual(v.hint, FIRST_GAME_APPLIED_HINT);
    assert.match(v.hint, /Начать партию/);
    const w = firstPresetView({ games: 0, matches: false });
    assert.strictEqual(w.pressed, false);
    assert.strictEqual(w.hint, FIRST_GAME_HINT);
  });
});
