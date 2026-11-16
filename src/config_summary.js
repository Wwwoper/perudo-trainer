// config_summary.js — строка под «Начать партию»: «5 кубиков · 3 бота · Тренировка · Нормально · без Calza и Палифико».
// Чистый модуль: без DOM.

const ASSIST_NAMES = { novice: 'Новичок', training: 'Тренировка', game: 'Игра' };
const SPEED_NAMES = { step: 'Пошагово', slow: 'Медленно', normal: 'Нормально', fast: 'Быстро' };

/** Склонение по числу: plural(5, ['кубик', 'кубика', 'кубиков']) → «кубиков». */
export function plural(n, forms) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b === 1) return forms[0];
  if (b >= 2 && b <= 4) return forms[1];
  return forms[2];
}

/** Правила одной фразой: «Calza и Палифико», «только Calza», «только Палифико», «без Calza и Палифико». */
export function rulesText(calza, palifico) {
  if (calza && palifico) return 'Calza и Палифико';
  if (calza) return 'только Calza';
  if (palifico) return 'только Палифико';
  return 'без Calza и Палифико';
}

/**
 * @param {{dice: number|string, bots: number|string, assist: string, speed: string, calza: boolean, palifico: boolean}} c
 */
export function configSummary(c) {
  const dice = Number(c.dice) || 5;
  const bots = Number(c.bots) || 3;
  return [
    `${dice} ${plural(dice, ['кубик', 'кубика', 'кубиков'])}`,
    `${bots} ${plural(bots, ['бот', 'бота', 'ботов'])}`,
    ASSIST_NAMES[c.assist] || ASSIST_NAMES.training,
    SPEED_NAMES[c.speed] || SPEED_NAMES.normal,
    rulesText(Boolean(c.calza), Boolean(c.palifico)),
  ].join(' · ');
}

/** Подключает строку к полям настроек и обновляет её при любом изменении. */
export function setupConfigSummary(doc = document) {
  const out = doc.getElementById('gConfigSummary');
  if (!out) return;
  const el = (id) => doc.getElementById(id);
  const ids = ['gDice', 'gBots', 'gAssist', 'gSpeed', 'gCalzaOpt', 'gPalificoOpt'];
  const update = () => {
    out.textContent = configSummary({
      dice: el('gDice')?.value, bots: el('gBots')?.value, assist: el('gAssist')?.value,
      speed: el('gSpeed')?.value, calza: el('gCalzaOpt')?.checked, palifico: el('gPalificoOpt')?.checked,
    });
  };
  for (const id of ids) {
    el(id)?.addEventListener('change', update);
    el(id)?.addEventListener('input', update);
  }
  update();
}
