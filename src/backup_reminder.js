// backup_reminder.js — когда напомнить про резервную копию. Чистая логика.
//
// Состояние устройства хранится отдельно от данных игры (ключ perudo.device) и в копию JSON
// не входит: «когда напоминать» не должно переезжать между устройствами.
//   nextAt        — сколько партий нужно сыграть, чтобы напоминание показалось (счёт идёт по всем партиям);
//   persistTries  — сколько раз просили у браузера постоянное хранилище (не больше MAX_PERSIST_TRIES);
//   account       — как играет игрок: null (ещё не выбирал), 'guest' (данные только здесь) или 'yandex'.

export const REMIND_FIRST = 5;        // первое напоминание — после стольких партий
export const SNOOZE_GAMES = 20;       // «Позже»: ещё столько партий тишины
export const AFTER_EXPORT_GAMES = 30; // после экспорта: ещё столько партий тишины
export const MAX_PERSIST_TRIES = 2;   // Chrome часто отказывает при малой активности, поэтому просим дважды

const isCount = (v) => Number.isInteger(v) && v >= 0 && v <= 1_000_000;

export function defaultDeviceState() {
  return { nextAt: REMIND_FIRST, persistTries: 0, account: null };
}

/** Приводит что угодно к состоянию устройства. */
export function sanitizeDeviceState(raw) {
  const d = defaultDeviceState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d;
  const tries = Number.isInteger(raw.persistTries) && raw.persistTries >= 0 ? Math.min(raw.persistTries, MAX_PERSIST_TRIES) : 0;
  const account = raw.account === 'guest' || raw.account === 'yandex' ? raw.account : null;
  return { nextAt: isCount(raw.nextAt) ? raw.nextAt : d.nextAt, persistTries: tries, account };
}

/**
 * Показывать ли напоминание сейчас.
 * @param {{games: number, nextAt: number, cloudConnected?: boolean}} s
 *   cloudConnected — копия уже пишется в облако, напоминать не нужно
 */
export function shouldRemind({ games, nextAt, cloudConnected = false }) {
  if (cloudConnected) return false;
  if (!isCount(games) || !isCount(nextAt)) return false;
  return games >= nextAt;
}

/** «Позже» или закрыто. */
export function afterDismiss(games) {
  return (isCount(games) ? games : 0) + SNOOZE_GAMES;
}

/** Копия сохранена. */
export function afterExport(games) {
  return (isCount(games) ? games : 0) + AFTER_EXPORT_GAMES;
}

/**
 * Просить ли сейчас у браузера постоянное хранилище: первый раз после первой партии,
 * второй — после пятой (к тому времени у сайта больше «активности»), дальше не просим.
 */
export function shouldAskPersistence({ games, tries }) {
  if (!isCount(games) || !Number.isInteger(tries) || tries < 0) return false;
  if (tries === 0) return games >= 1;
  if (tries === 1) return games >= REMIND_FIRST;
  return false;
}
