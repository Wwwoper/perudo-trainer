// persistence.js — просьба к браузеру не удалять данные сайта сам (navigator.storage.persist).
//
// Модуль чистый: получает объект storage (navigator.storage) аргументом.
// Это не защита от ручной очистки данных пользователем; она лишь снижает риск, что браузер
// удалит данные при нехватке места. Поэтому «Экспорт JSON» остаётся главным способом сохранить данные.

/**
 * @param {{persist?: () => Promise<boolean>, persisted?: () => Promise<boolean>} | null | undefined} storage
 * @returns {Promise<'unsupported'|'granted'|'denied'|'error'>}
 */
export async function requestPersistence(storage) {
  if (!storage || typeof storage.persist !== 'function') return 'unsupported';
  try {
    if (typeof storage.persisted === 'function' && await storage.persisted()) return 'granted';
    return (await storage.persist()) ? 'granted' : 'denied';
  } catch (e) {
    return 'error';
  }
}

/**
 * Состояние для показа: true, false или null, если браузер этого не умеет или не отвечает.
 * @returns {Promise<boolean|null>}
 */
export async function readPersisted(storage) {
  if (!storage || typeof storage.persisted !== 'function') return null;
  try {
    const v = await storage.persisted();
    return typeof v === 'boolean' ? v : null;
  } catch (e) {
    return null;
  }
}

/**
 * Строка для вкладки «Данные»; null — ничего не показывать.
 * @param {boolean|null} persisted
 * @param {{cloud?: boolean}} [opts] cloud: выполнен вход в Яндекс — тогда совет не про файл, а про облако
 */
export function describePersistence(persisted, { cloud = false } = {}) {
  if (persisted === true) return 'Хранилище защищено: браузер не удалит данные сам при нехватке места.';
  if (persisted === false) {
    return cloud
      ? 'Браузер может удалить данные сайта при нехватке места или при очистке, но их можно вернуть из копии на Яндекс Диске.'
      : 'Браузер может удалить данные сайта при нехватке места или при очистке. Сохраняйте копию («Экспорт JSON») или войдите через Яндекс.';
  }
  return null;
}
