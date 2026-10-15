// src/ui/common.js — общие помощники интерфейса: выборка элементов, проценты, подсветка.

export const P = globalThis.Perudo;
if (!P) {
  console.error('[perudo] window.Perudo не найден. Убедитесь, что src/core.js подключён раньше app_v2.js');
}

export const $ = (s) => document.querySelector(s);
export const $$ = (s) => document.querySelectorAll(s);

export const pct = (x) => P ? P.pct(x) : (x * 100).toFixed(1) + '%';

export function flash(el, text, cls = 'r') {
  if (!el) return;
  el.innerHTML = `<span class="${cls}">${text}</span>`;
}
