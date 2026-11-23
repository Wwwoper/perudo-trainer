// dock_inset.js — сколько снизу экрана закрывает закреплённая панель действий. Чистый модуль: без DOM.
//
// На телефоне панель ответа прижата к нижнему краю (position: sticky). Когда фокус с клавиатуры (Tab) или
// прокрутка к якорю доходят до поля, браузер прокручивает страницу минимально, и поле остаётся под панелью.
// Высота панели кладётся в --dock-h, а CSS превращает её в scroll-padding-bottom страницы.

/**
 * @param {Array<{position: string, height: number, visible: boolean}>} docks закреплённые панели страницы
 * @returns {number} высота в px: самая высокая из видимых закреплённых панелей; 0, если закрепляющих нет
 */
export function dockInset(docks) {
  let h = 0;
  for (const d of Array.isArray(docks) ? docks : []) {
    if (!d || d.position !== 'sticky' || !d.visible) continue;
    const x = Number(d.height);
    if (Number.isFinite(x) && x > h) h = x;
  }
  return Math.ceil(h);
}
