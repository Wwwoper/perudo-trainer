// src/ui/result_dialog.js — окно итогов партии.

import { buildGameResult, resultHeadline, pluralDice } from '../result.js';
import { escapeHtml } from '../table.js';
import { $ } from './common.js';
import { revealIsOpen } from './reveal_dialog.js';

let resultTimer = null;
let resultOpener = null;
let skipFocusRestore = false;     // «Перейти к расчёту» сам ставит фокус на карточку итога

export function hideResultUi() {
  clearTimeout(resultTimer);
  resultTimer = null;
  const dlg = $('#gResultDialog');
  if (dlg?.open) dlg.close();
  const banner = $('#gSummary');
  if (banner) banner.innerHTML = '';
  const card = $('#gResultCard');
  if (card) { card.innerHTML = ''; card.hidden = true; }
}

function fillResultDialog(result) {
  const h = resultHeadline(result);
  $('#gResultIcon').textContent = h.icon;
  $('#gResultTitle').textContent = h.title;
  $('#gResultLead').textContent = h.lead;
  $('#gResultStand').innerHTML = result.standings.map((r) =>
    `<li class="${r.id === result.winnerId ? 'is-winner' : ''}">` +
    `<span>${r.id === result.winnerId ? '👑 ' : ''}${escapeHtml(r.name)}</span>` +
    `<span>${r.alive ? pluralDice(r.dice) : 'выбыл'}</span></li>`).join('');
}

function showResultDialog(game) {
  const dlg = $('#gResultDialog');
  const result = buildGameResult(game);
  if (!dlg || !result || dlg.open || typeof dlg.showModal !== 'function') return false;
  if ($('#game')?.classList.contains('hide')) return false;   // вкладка «Партия» не на экране
  fillResultDialog(result);
  resultOpener = document.activeElement;
  dlg.showModal();
  return true;
}

/**
 * @param {() => object} getGame
 * @param {{onOpenCalc?: () => void}} [hooks] onOpenCalc — «Перейти к расчёту»: окно закрыто, показать панель с итогом и ключевыми моментами
 */
export function setupResultDialog(getGame, { onOpenCalc } = {}) {
  const dlg = $('#gResultDialog');
  if (!dlg) return;
  $('#gResultView')?.addEventListener('click', () => dlg.close());
  $('#gResultCalc')?.addEventListener('click', () => {
    skipFocusRestore = true;
    dlg.close();
    onOpenCalc?.();
  });
  // После закрытия фокус возвращается туда, откуда окно открыли; если там уже ничего нет —
  // на «Сыграть ещё» в баннере (нативный диалог в Chromium оставляет фокус на скрытой кнопке).
  dlg.addEventListener('close', () => {
    if (skipFocusRestore) { skipFocusRestore = false; resultOpener = null; return; }
    const usable = (el) => el && el.isConnected && !el.disabled && !el.closest('dialog') && el.offsetParent !== null;
    const target = usable(resultOpener) ? resultOpener : $('#gSummary [data-action="new-game"]');
    resultOpener = null;
    target?.focus?.();
  });
  // Клик по подложке: у диалога нет собственных отступов, поэтому target === dialog — это именно подложка.
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  // Tab ходит по кругу внутри окна (нативный диалог иначе выпускает фокус в интерфейс браузера).
  dlg.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const items = [...dlg.querySelectorAll('button:not([disabled])')];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  // Баннер: «Итоги» заново открывает окно.
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-result-details]')) showResultDialog(getGame());
  });
}

export function scheduleResultDialog(getGame, delay) {
  if (!getGame()) return;
  const gameId = getGame().id;
  clearTimeout(resultTimer);
  resultTimer = setTimeout(() => {
    const game = getGame();
    if (!game || game.id !== gameId || game.state !== 'finished') return;
    if (revealIsOpen()) return;          // его закрытие само вызовет scheduleResultDialog
    showResultDialog(game);
  }, delay);
}
