// src/first_run.js — карточка «Впервые здесь?»: маршрут для новичка ← чистая логика (без DOM)

export const FIRST_RUN_TITLE = 'Впервые здесь?';
export const FIRST_RUN_LEAD = 'Три коротких шага, чтобы освоиться. Карточка исчезнет после первой партии или решения в тренажёре.';
export const FIRST_RUN_HIDE = 'Скрыть';

/**
 * Шаги по порядку. kind: link — страница руководства (href), tab — открыть раздел (tab),
 * preset — открыть «Партию» с настройками первой партии.
 */
export const FIRST_RUN_STEPS = Object.freeze([
  Object.freeze({
    id: 'rules', title: 'Правила (1 минута)', text: 'Что такое ставка и «Не верю!», как работают единицы-джокеры.',
    kind: 'link', action: 'Читать правила', href: 'docs/guide/rules.html',
  }),
  Object.freeze({
    id: 'game', title: 'Первая учебная партия', text: 'Один спокойный бот и подсказки: настройки выставятся сами.',
    kind: 'preset', action: 'Выбрать первую партию', tab: 'game',
  }),
  Object.freeze({
    id: 'train', title: 'Тренажёр', text: 'Короткие задачи «верить или нет» с разбором.',
    kind: 'tab', action: 'Открыть Тренажёр', tab: 'train',
  }),
]);

/** Карточка видна, пока профиль чистый (нет ни партий, ни решений) и её не скрыли. */
export function shouldShowFirstRun({ empty, hidden } = {}) {
  return empty === true && hidden !== true;
}
