import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import {
  TASKS_TOTAL, MIN_TASKS, MAX_TASKS, STEPS, defaultOnboarding, sanitizeOnboarding, isOnboardingActive,
  startGame, gameFinished, taskDone, finishOnboarding, skipOnboarding, stepNumber, STEP_COUNT, tasksProgress,
  shouldShowWelcome, WELCOME,
} from '../src/onboarding.js';

const at = (step, tasks = 0, extra = {}) => ({ step, tasks, done: false, skipped: false, ...extra });

describe('константы', () => {
  it('задач от 3 до 5, шаги по порядку', () => {
    assert.ok(TASKS_TOTAL >= MIN_TASKS && TASKS_TOTAL <= MAX_TASKS);
    assert.deepEqual([...STEPS], ['welcome', 'game', 'tasks', 'finish']);
    assert.equal(STEP_COUNT, 3);
  });
});

describe('sanitizeOnboarding', () => {
  it('мусор → умолчание', () => {
    for (const v of [undefined, null, 5, 'x', [], {}]) assert.deepEqual(sanitizeOnboarding(v), defaultOnboarding(), String(v));
  });
  it('неизвестный шаг → welcome, счётчик в пределах', () => {
    assert.equal(sanitizeOnboarding({ step: 'zzz' }).step, 'welcome');
    assert.equal(sanitizeOnboarding(at('tasks', 99)).tasks, TASKS_TOTAL);
    assert.equal(sanitizeOnboarding(at('tasks', -3)).tasks, 0);
    assert.equal(sanitizeOnboarding(at('tasks', 1.5)).tasks, 0);
  });
  it('до партии задач быть не может', () => {
    assert.equal(sanitizeOnboarding(at('welcome', 3)).tasks, 0);
    assert.equal(sanitizeOnboarding(at('game', 2)).tasks, 0);
  });
  it('законченный онбординг — на шаге finish; skipped только вместе с done', () => {
    assert.deepEqual(sanitizeOnboarding({ step: 'tasks', tasks: 1, done: true, skipped: true }), { step: 'finish', tasks: 1, done: true, skipped: true });
    assert.equal(sanitizeOnboarding({ step: 'tasks', skipped: true }).skipped, false);
    assert.equal(sanitizeOnboarding({ done: 'да' }).done, false);
  });
});

describe('isOnboardingActive', () => {
  it('идёт на чистой истории, пока не закончен', () => {
    assert.equal(isOnboardingActive({ state: defaultOnboarding(), games: 0 }), true);
    assert.equal(isOnboardingActive({ state: at('tasks', 2), games: 0 }), true);
  });
  it('есть партии в истории — онбординга нет', () => {
    assert.equal(isOnboardingActive({ state: defaultOnboarding(), games: 1 }), false);
    assert.equal(isOnboardingActive({ state: defaultOnboarding(), games: 40 }), false);
  });
  it('закончен или пропущен — онбординга нет', () => {
    assert.equal(isOnboardingActive({ state: skipOnboarding(defaultOnboarding()), games: 0 }), false);
  });
  it('мусор в аргументах не ломает', () => {
    assert.equal(isOnboardingActive(), true);
    assert.equal(isOnboardingActive({ state: 5, games: 'много' }), true);
    assert.equal(isOnboardingActive({ games: -1 }), true);
  });
});

describe('переходы', () => {
  it('полный путь: welcome → game → tasks → finish → done', () => {
    let s = defaultOnboarding();
    s = startGame(s);
    assert.equal(s.step, 'game');
    s = gameFinished(s);
    assert.deepEqual(s, at('tasks', 0));
    for (let i = 1; i < TASKS_TOTAL; i++) {
      s = taskDone(s);
      assert.deepEqual(s, at('tasks', i));
    }
    s = taskDone(s);
    assert.deepEqual(s, at('finish', TASKS_TOTAL));
    s = finishOnboarding(s);
    assert.deepEqual(s, { step: 'finish', tasks: TASKS_TOTAL, done: true, skipped: false });
  });
  it('переходы не из своего шага ничего не меняют', () => {
    const w = defaultOnboarding();
    assert.deepEqual(gameFinished(w), w);
    assert.deepEqual(taskDone(w), w);
    assert.deepEqual(finishOnboarding(w), w);
    const t = at('tasks', 1);
    assert.deepEqual(startGame(t), t);
    assert.deepEqual(gameFinished(t), t);
  });
  it('после завершения переходы неактивны', () => {
    const d = finishOnboarding(at('finish', TASKS_TOTAL));
    for (const f of [startGame, gameFinished, taskDone, finishOnboarding]) assert.deepEqual(f(d), d);
  });
  it('переходы не меняют исходный объект', () => {
    const s = Object.freeze(at('tasks', 1));
    assert.equal(taskDone(s).tasks, 2);
    assert.equal(s.tasks, 1);
  });
  it('пропуск возможен с любого шага и один раз', () => {
    for (const st of STEPS) {
      const r = skipOnboarding(at(st, st === 'tasks' ? 2 : 0));
      assert.equal(r.done, true);
      assert.equal(r.skipped, true);
      assert.equal(r.step, 'finish');
    }
    const once = skipOnboarding(defaultOnboarding());
    assert.deepEqual(skipOnboarding(once), once);
    const finished = finishOnboarding(at('finish', TASKS_TOTAL));
    assert.equal(skipOnboarding(finished).skipped, false);   // уже закончен честно — пропуском не становится
  });
});

describe('stepNumber / tasksProgress', () => {
  it('номер большого шага', () => {
    assert.deepEqual(STEPS.map((s) => stepNumber(at(s))), [0, 1, 2, 3]);
    assert.equal(stepNumber(null), 0);
  });
  it('прогресс задач', () => {
    assert.deepEqual(tasksProgress(at('tasks', 1)), { done: 1, total: TASKS_TOTAL, fraction: 1 / TASKS_TOTAL, text: `Задач выполнено: 1 из ${TASKS_TOTAL}` });
    assert.equal(tasksProgress(at('finish', TASKS_TOTAL)).fraction, 1);
    assert.equal(tasksProgress(defaultOnboarding()).done, 0);
  });
  it('после пропуска задачи не засчитываются', () => {
    assert.equal(tasksProgress(skipOnboarding(defaultOnboarding())).done, 0);
  });
  it('текст без запрещённых слов', () => {
    assert.doesNotMatch(tasksProgress(at('tasks', 2)).text, /обманщик|врёт|блефует/i);
  });
});

describe('shouldShowWelcome', () => {
  const base = { state: defaultOnboarding(), games: 0, empty: true, legacyHidden: false };
  it('чистый профиль на шаге приветствия — показываем', () => {
    assert.equal(shouldShowWelcome(base), true);
    assert.equal(shouldShowWelcome({ ...base, legacyHidden: undefined }), true);
  });
  it('любая из причин не показывать', () => {
    assert.equal(shouldShowWelcome({ ...base, games: 1 }), false);                 // есть партии в истории
    assert.equal(shouldShowWelcome({ ...base, empty: false }), false);             // есть решения или статистика
    assert.equal(shouldShowWelcome({ ...base, empty: undefined }), false);
    assert.equal(shouldShowWelcome({ ...base, legacyHidden: true }), false);       // карточку прежде скрывали
    assert.equal(shouldShowWelcome({ ...base, state: startGame(base.state) }), false);
    assert.equal(shouldShowWelcome({ ...base, state: skipOnboarding(base.state) }), false);
    assert.equal(shouldShowWelcome(), false);
  });
});

describe('WELCOME', () => {
  it('три шага, кнопки и ссылка на существующую страницу правил', () => {
    assert.equal(WELCOME.steps.length, 3);
    assert.equal(WELCOME.start, 'Начать первую партию');
    assert.equal(WELCOME.skip, 'Я уже знаю правила');
    assert.ok(existsSync(new URL(`../${WELCOME.rulesHref}`, import.meta.url)));
  });
  it('без запрещённых слов', () => {
    const t = [WELCOME.title, WELCOME.lead, WELCOME.note, ...WELCOME.steps.flatMap((x) => [x.title, x.text])].join(' ');
    assert.doesNotMatch(t, /обманщик|врёт|блефует/i);
  });
});
