// src/onboarding.js — онбординг новичка: шаги, счётчик задач, правило показа ← чистая логика (без DOM и хранилища).
//
// Сценарий: приветствие → первая партия → несколько задач в Тренажёре → итог с выбором дальше.
// Состояние хранится в данных устройства (backup_reminder.js, поле onboarding) и в резервную копию не входит.
// Все переходы чистые: возвращают новое состояние, а переход из «чужого» шага ничего не меняет.

/** Сколько задач в Тренажёре предлагается новичку (в пределах 3–5). */
export const TASKS_TOTAL = 4;
export const MIN_TASKS = 3;
export const MAX_TASKS = 5;

/** Шаги по порядку: welcome — приветствие, game — первая партия, tasks — задачи, finish — итог. */
export const STEPS = Object.freeze(['welcome', 'game', 'tasks', 'finish']);

export function defaultOnboarding() {
  return { step: 'welcome', tasks: 0, done: false, skipped: false };
}

/** Приводит что угодно к состоянию онбординга. Законченный онбординг всегда на шаге finish. */
export function sanitizeOnboarding(raw) {
  const d = defaultOnboarding();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d;
  const done = raw.done === true;
  const skipped = done && raw.skipped === true;
  const step = done ? 'finish' : (STEPS.includes(raw.step) ? raw.step : d.step);
  let tasks = Number.isInteger(raw.tasks) ? Math.min(Math.max(raw.tasks, 0), TASKS_TOTAL) : 0;
  if (!done && (step === 'welcome' || step === 'game')) tasks = 0;   // задачи начинаются только после партии
  return { step, tasks, done, skipped };
}

/**
 * Идёт ли онбординг: он не закончен, а начинаться он может, только пока в истории нет ни одной партии.
 * Когда игрок уже ушёл с приветствия, первая же его партия попадает в историю, но онбординг продолжается.
 * @param {{state: object, games: number}} s games — число сыгранных партий в истории
 */
export function isOnboardingActive({ state, games } = {}) {
  const st = sanitizeOnboarding(state);
  const g = Number.isInteger(games) && games >= 0 ? games : 0;
  return !st.done && (st.step !== 'welcome' || g === 0);
}

/** Режим задач онбординга: Тренажёр работает на базовых настройках, ответы не идут в статистику и очередь повторов. */
export function isTaskMode(state) {
  const st = sanitizeOnboarding(state);
  return st.step === 'tasks' && !st.done;
}

/** Приветствие → первая партия (игрок нажал «Начать»). */
export function startGame(state) {
  const st = sanitizeOnboarding(state);
  return st.step === 'welcome' && !st.done ? { ...st, step: 'game' } : st;
}

/** Первая партия закончена → переход к задачам. */
export function gameFinished(state) {
  const st = sanitizeOnboarding(state);
  return st.step === 'game' && !st.done ? { ...st, step: 'tasks', tasks: 0 } : st;
}

/** Решена ещё одна задача; когда набрано TASKS_TOTAL, шаг становится finish. */
export function taskDone(state) {
  const st = sanitizeOnboarding(state);
  if (st.step !== 'tasks' || st.done) return st;
  const tasks = st.tasks + 1;
  return tasks >= TASKS_TOTAL ? { ...st, tasks: TASKS_TOTAL, step: 'finish' } : { ...st, tasks };
}

/** Игрок закончил онбординг на итоговом экране. */
export function finishOnboarding(state) {
  const st = sanitizeOnboarding(state);
  return st.step === 'finish' ? { ...st, done: true } : st;
}

/** Пропуск «Я уже знаю правила»: возможен с любого шага. */
export function skipOnboarding(state) {
  const st = sanitizeOnboarding(state);
  return st.done ? st : { ...st, step: 'finish', done: true, skipped: true };
}

/** Номер большого шага для подписи «Шаг N из 3»: партия — 1, задачи — 2, итог — 3; у приветствия номера нет (0). */
export function stepNumber(state) {
  const i = STEPS.indexOf(sanitizeOnboarding(state).step);
  return i < 0 ? 0 : i;
}
export const STEP_COUNT = 3;

/**
 * Прогресс задач для полосы и подписи.
 * @returns {{done: number, total: number, fraction: number, text: string}}
 */
export function tasksProgress(state) {
  const st = sanitizeOnboarding(state);
  const done = st.step === 'finish' && !st.skipped ? TASKS_TOTAL : st.tasks;
  return { done, total: TASKS_TOTAL, fraction: done / TASKS_TOTAL, text: `Задач выполнено: ${done} из ${TASKS_TOTAL}` };
}

/**
 * Показывать ли экран приветствия: онбординг идёт и стоит на приветствии, профиль совсем чистый
 * (нет ни партий, ни решений) и игрок не скрывал прежнюю карточку «Впервые здесь?» (legacyHidden).
 * @param {{state: object, games: number, empty: boolean, legacyHidden?: boolean}} s
 */
export function shouldShowWelcome({ state, games, empty, legacyHidden } = {}) {
  return empty === true && legacyHidden !== true
    && sanitizeOnboarding(state).step === 'welcome'
    && isOnboardingActive({ state, games });
}

/** Тексты экрана приветствия. */
export const WELCOME = Object.freeze({
  title: 'Добро пожаловать в Перудо',
  lead: 'Перудо — игра с кубиками и ставками. Здесь учатся принимать решения по шансам: сначала сыграть, потом разобрать на коротких задачах.',
  steps: Object.freeze([
    Object.freeze({ title: 'Первая партия', text: 'Один спокойный бот и подсказки: ничего настраивать не нужно.' }),
    Object.freeze({ title: 'Несколько задач', text: `Короткие задачи «верить или нет» с разбором и полосой прогресса: ${TASKS_TOTAL} штуки.` }),
    Object.freeze({ title: 'Дальше — как вам удобно', text: 'В приложение, к правилам или с сохранением данных.' }),
  ]),
  start: 'Начать первую партию',
  rules: 'Прочитать правила (1 минута)',
  rulesHref: 'docs/guide/rules.html',
  skip: 'Я уже знаю правила',
  note: 'Данные хранятся на этом устройстве. Пропустить приветствие можно в любой момент.',
});

/** Тексты блока задач онбординга в Тренажёре и кнопки после партии. */
export const TASKS_TEXT = Object.freeze({
  title: 'Первые задачи',
  lead: `${TASKS_TOTAL} коротких задачи «верить или нет» на базовых настройках. Ответы здесь не попадают в статистику и очередь повторов.`,
  done: 'Все задачи выполнены.',
  finish: 'Готово',
  cta: 'Перейти к задачам',
});
