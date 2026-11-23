// src/ui/dock_inset.js — держит в --dock-h высоту закреплённой панели действий (см. dock_inset.js).

import { dockInset } from '../dock_inset.js';

/** Подписывается на размер панелей и окна; безопасно без ResizeObserver. */
export function setupDockInset() {
  const docs = document.documentElement;
  const docks = [...document.querySelectorAll('.action-dock')];
  const update = () => {
    const h = dockInset(docks.map((el) => ({
      position: getComputedStyle(el).position,
      height: el.getBoundingClientRect().height,
      visible: el.offsetParent !== null,
    })));
    docs.style.setProperty('--dock-h', `${h}px`);
  };
  update();
  window.addEventListener('resize', update);
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(update);
    docks.forEach((el) => ro.observe(el));
  }
  return update;
}
