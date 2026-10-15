// src/ui/reveal_dialog.js — окно вскрытия кубиков после «Не верю» и Calza.

import { buildReveal, dieMatches } from '../reveal.js';
import { renderDie, renderBid, escapeHtml } from '../table.js';
import { $ } from './common.js';

let revealTimer = null;
const REVEAL_MS = { slow: 9000, normal: 6000, fast: 3500 };   // «Пошагово» — только по кнопке

export const revealIsOpen = () => !!$('#gReveal')?.open;

function revealTone(m) {
  const me = m.rows.find((r) => r.isHuman);
  if (!me) return '';
  if (m.kind === 'dudo') {
    if (me.isLoser) return 'is-bad';
    return me.isBidder || me.isChallenger ? 'is-good' : '';
  }
  if (!me.isChallenger) return '';
  return m.verdict === 'calza_exact' ? 'is-good' : 'is-bad';
}

/** Показывает окно вскрытия кубиков; false, если окно показывать не нужно (выключено, вкладка скрыта и т. п.). */
export function presentReveal(game, events) {
  const dlg = $('#gReveal');
  if (!game || !dlg || dlg.open || typeof dlg.showModal !== 'function') return false;
  if ($('#gRevealOpt')?.checked === false) return false;
  if ($('#game')?.classList.contains('hide')) return false;
  const m = buildReveal(events, game.players);
  if (!m) return false;

  $('#gRevealTitle').textContent = m.headline;
  $('#gRevealBid').innerHTML =
    `Ставка · ${escapeHtml(m.bid.playerName)}: ${renderBid(m.bid.q, m.bid.f)}` +
    (m.wild ? '' : ' · палифико, единицы не джокеры');
  $('#gRevealRows').innerHTML = m.rows.map((r) => {
    const role = [r.isBidder ? 'ставил' : '', r.isChallenger ? 'проверял' : ''].filter(Boolean).join(', ');
    const dice = r.hand.map((d) => {
      const html = renderDie(d, 'xs', m.wild && d === 1);
      return dieMatches(d, m.bid.f, m.wild) ? html.replace('class="die', 'class="die hit') : html;
    }).join('');
    return `<li class="reveal-row ${r.isLoser ? 'is-loser' : ''}">` +
      `<span class="reveal-name">${escapeHtml(r.name)}${role ? `<small>${role}</small>` : ''}</span>` +
      `<span class="reveal-hand" aria-label="Кубики: ${r.hand.join(', ')}">${dice}</span>` +
      `<span class="reveal-hit ${r.matches ? '' : 'zero'}" aria-label="Совпало: ${r.matches}">${r.matches ? '+' + r.matches : '0'}</span></li>`;
  }).join('');
  const verdict = $('#gRevealVerdict');
  verdict.textContent = m.verdictText;
  verdict.className = `reveal-verdict ${revealTone(m)}`;
  $('#gRevealOutcome').textContent = m.outcomeText;

  const speed = $('#gSpeed')?.value || 'normal';
  const ms = REVEAL_MS[speed];
  const bar = $('#gRevealBar');
  const timerBox = bar?.parentElement;
  if (bar) {
    bar.classList.remove('run');
    void bar.offsetWidth;                         // перезапуск анимации
    if (ms) { bar.style.setProperty('--reveal-ms', `${ms}ms`); bar.classList.add('run'); }
    if (timerBox) timerBox.style.visibility = ms ? 'visible' : 'hidden';
  }

  clearTimeout(revealTimer);
  revealTimer = ms ? setTimeout(() => { if (dlg.open) dlg.close(); }, ms) : null;
  dlg.showModal();
  dlg.scrollTop = 0;                    // автофокус на кнопке не должен прятать заголовок
  return true;
}

/** onClosed() — окно закрыто (кнопкой, подложкой или по таймеру): партия идёт дальше. */
export function setupReveal(onClosed) {
  const dlg = $('#gReveal');
  if (!dlg) return;
  $('#gRevealNext')?.addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  // В окне одна кнопка: Tab не должен выпускать фокус в интерфейс браузера.
  dlg.addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); $('#gRevealNext')?.focus(); } });
  dlg.addEventListener('close', () => {
    clearTimeout(revealTimer);
    revealTimer = null;
    onClosed?.();
  });
}

export function hideRevealUi() {
  clearTimeout(revealTimer);
  revealTimer = null;
  const dlg = $('#gReveal');
  if (dlg?.open) dlg.close();
}
