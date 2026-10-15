// src/ui/tabs.js — переключение разделов, ☰-меню и лента вкладок.

import { $, $$ } from './common.js';

export const TABS = ['calc', 'train', 'drill', 'game', 'duel', 'sim', 'stats'];

/** onShow(tab) вызывается после переключения на раздел (например, чтобы обновить статистику). */
export function setupTabs(onShow) {
  // Края ленты гаснут только там, где есть куда прокручивать
  const nav = $('.app-header nav');
  const updateFade = () => {
    if (!nav) return;
    const max = nav.scrollWidth - nav.clientWidth;
    nav.style.setProperty('--fade-l', nav.scrollLeft > 2 ? '24px' : '0px');
    nav.style.setProperty('--fade-r', nav.scrollLeft < max - 2 ? '24px' : '0px');
  };
  nav?.addEventListener('scroll', updateFade, { passive: true });
  window.addEventListener('resize', updateFade);
  document.fonts?.ready.then(updateFade);
  updateFade();

  // Компактное меню разделов: в партии на телефоне шапка прячется, лента открывается кнопкой ☰ в HUD.
  const header = $('.app-header');
  // Кнопка ☰ есть в шапке каждого раздела: на телефоне лента разделов прячется за ней
  const toggles = $$('.hud-menu');
  const toggleOf = (tab) => document.querySelector(`#${tab} .hud-menu`);
  const COMPACT_TABS = ['game', 'calc', 'train', 'drill', 'duel', 'stats', 'sim'];
  const scrim = $('#navScrim');
  const isOpen = () => !!header?.classList.contains('nav-open');
  const setMenu = (open, { focus = false } = {}) => {
    if (!header) return;
    header.classList.toggle('nav-open', open);
    toggles.forEach((t) => t.setAttribute('aria-expanded', String(open)));
    if (scrim) scrim.hidden = !open;
    if (open) (nav?.querySelector('.tab-btn.on') || nav?.querySelector('.tab-btn'))?.focus();
    else if (focus) toggleOf(document.body.dataset.tab)?.focus();
  };
  toggles.forEach((t) => t.addEventListener('click', () => setMenu(!isOpen())));
  scrim?.addEventListener('click', () => setMenu(false, { focus: true }));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) setMenu(false, { focus: true });
  });
  nav?.addEventListener('keydown', (e) => {
    if (!isOpen() || !['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const items = [...nav.querySelectorAll('.tab-btn')];
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
  });
  // Телефон повернули или окно растянули — меню в прежнем виде не нужно.
  window.matchMedia?.('(min-width: 1100px)').addEventListener?.('change', () => setMenu(false));
  const setTab = (tab) => {
    document.body.dataset.tab = tab;
    document.body.toggleAttribute('data-compact-nav', COMPACT_TABS.includes(tab));
  };
  setTab($('.tab-btn.on')?.dataset.t || 'calc');

  $$('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.tab-btn').forEach((b) => {
        b.classList.toggle('on', b === btn);
        if (b === btn) b.setAttribute('aria-current', 'page');
        else b.removeAttribute('aria-current');
      });
      const target = btn.dataset.t;
      setTab(target);
      const wasOpen = isOpen();
      setMenu(false);
      // Лента могла быть скрыта (меню ☰): прокручиваем к вкладке и пересчитываем края, когда она уже на экране
      requestAnimationFrame(() => {
        btn.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: 'smooth' });
        updateFade();
      });
      TABS.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hide', id !== target);
      });
      // Фокус — после смены раздела, иначе кнопка ☰ нового раздела ещё скрыта
      if (wasOpen) (toggleOf(target) && COMPACT_TABS.includes(target) ? toggleOf(target) : btn)?.focus();
      onShow?.(target);
    });
  });
}
