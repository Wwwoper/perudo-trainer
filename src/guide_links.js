// src/guide_links.js — какая страница руководства относится к какому разделу приложения ← чистая логика (без DOM)

/** Папка руководства относительно index.html. */
export const GUIDE_ROOT = 'docs/guide/';

/** Раздел приложения → страница руководства. */
export const TAB_GUIDE = Object.freeze({
  calc: 'calculator.html',
  train: 'trainer.html',
  drill: 'drill.html',
  game: 'game.html',
  duel: 'duel-sim.html',
  sim: 'duel-sim.html',
  stats: 'stats.html',
});

/** Названия разделов для подписи «Справка по разделу …». */
export const TAB_TITLES = Object.freeze({
  calc: 'Калькулятор',
  train: 'Тренажёр',
  drill: 'Упражнения',
  game: 'Партия',
  duel: 'Дуэль',
  sim: 'Симуляция',
  stats: 'Статистика',
});

/** Ссылка на страницу руководства для раздела; неизвестный раздел ведёт в оглавление. */
export function guideHref(tab) {
  return GUIDE_ROOT + (Object.hasOwn(TAB_GUIDE, tab) ? TAB_GUIDE[tab] : '');
}

/** Подпись для скринридеров. */
export function guideLabel(tab) {
  return Object.hasOwn(TAB_TITLES, tab) ? `Справка по разделу «${TAB_TITLES[tab]}»` : 'Руководство';
}
