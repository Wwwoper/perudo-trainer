// src/ui/side_panel.js — боковая панель партии (Расчёт / Журнал / Разбор / Настройки).
// На ноутбуке — колонка справа, на телефоне и планшете — нижняя шторка, которую открывают кнопки в HUD.

import { $, $$ } from './common.js';

// Заполняется в setupSidePanel(): закрыть шторку, выбрать вкладку по режиму помощи,
// удержать журнал внизу. До инициализации — безопасные заглушки.
export const sideApi = { close() {}, pick() {}, select() {}, keepAtEnd() {} };

/** showOdds() — есть ли в текущем режиме помощи вкладка «Расчёт» (иначе по умолчанию журнал). */
export function setupSidePanel(showOdds) {
  const side = $('#gSide');
  if (!side) return;

  const backdrop = $('#gBackdrop');
  const body = side.querySelector('.side-body');
  const tabs = [...side.querySelectorAll('[role="tab"]')];
  const wide = window.matchMedia('(min-width: 1101px)');
  const panelOf = (tab) => document.getElementById(tab.getAttribute('aria-controls'));
  let opener = null;

  function select(tab) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      panelOf(t).hidden = !on;
    });
    if (tab.id === 'tabLog' || tab.id === 'tabReview') body.scrollTop = body.scrollHeight;
  }

  const selected = () => tabs.find((t) => t.getAttribute('aria-selected') === 'true');

  function open(tabId, from) {
    if (tabId) select(document.getElementById(tabId));
    opener = from || null;
    side.classList.add('is-open');
    side.setAttribute('role', 'dialog');
    side.setAttribute('aria-modal', 'true');
    if (backdrop) backdrop.hidden = false;
    selected()?.focus();
  }

  function close() {
    if (!side.classList.contains('is-open')) return;
    side.classList.remove('is-open');
    side.removeAttribute('role');
    side.removeAttribute('aria-modal');
    if (backdrop) backdrop.hidden = true;
    opener?.focus?.();
    opener = null;
  }

  tabs.forEach((t) => t.addEventListener('click', () => select(t)));

  // Стрелки ←/→ между вкладками
  side.querySelector('[role="tablist"]').addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0 || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    next.focus();
    select(next);
  });

  // Пока шторка открыта, Tab ходит только внутри неё
  side.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !side.classList.contains('is-open')) return;
    const items = [...side.querySelectorAll('button, input, select, a[href]')]
      .filter((el) => !el.disabled && el.tabIndex >= 0 && el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  $$('[data-open-tab]').forEach((b) => b.addEventListener('click', () => {
    const tab = document.getElementById(b.dataset.openTab);
    if (wide.matches) select(tab);        // панель уже на экране
    else open(b.dataset.openTab, b);
  }));

  backdrop?.addEventListener('click', close);
  side.querySelector('.sheet-close')?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  wide.addEventListener?.('change', (e) => { if (e.matches) close(); });

  sideApi.close = close;
  // Режим «Игра» — без подсказок, поэтому по умолчанию журнал; иначе расчёт.
  sideApi.pick = () => select(document.getElementById(
    showOdds() ? 'tabCalc' : 'tabLog'));
  sideApi.select = (tabId) => {
    const tab = document.getElementById(tabId);
    if (tab) select(tab);
  };
  sideApi.keepAtEnd = (panelId) => {
    const panel = document.getElementById(panelId);
    if (panel && !panel.hidden) body.scrollTop = body.scrollHeight;
  };
}
