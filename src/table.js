// table.js — игровой стол на 2-6 игроков
//
// Разметка стола:
//   #gameTable.table-stage
//     .table-felt      — только декор (эллипс), ничего не обрезает
//     .table-center    — центральный круг со ставкой
//     .seat × N        — места игроков, позиционируются CSS-переменными
//
// Позиции мест — это пары [x%, y%] от размеров .table-stage.
// Для каждого места два набора: d — широкий стол, m — портретный телефон.
// CSS сам выбирает набор и зажимает центр места так, чтобы оно целиком
// помещалось в сцену (см. table.css, .seat).

import { BOT_STYLES } from './bots.js';

const SEAT_LAYOUTS = {
  2: {
    d: [[50, 90], [50, 10]],
    m: [[50, 90], [50, 10]],
  },
  3: {
    d: [[50, 90], [18, 28], [82, 28]],
    m: [[50, 90], [20, 24], [80, 24]],
  },
  4: {
    d: [[50, 90], [11, 50], [50, 10], [89, 50]],
    m: [[50, 90], [16, 52], [50, 10], [84, 52]],
  },
  5: {
    d: [[50, 90], [11, 62], [24, 18], [76, 18], [89, 62]],
    m: [[50, 90], [16, 64], [22, 24], [78, 24], [84, 64]],
  },
  6: {
    d: [[50, 90], [10, 64], [14, 22], [50, 10], [86, 22], [90, 64]],
    m: [[50, 90], [15, 66], [15, 32], [50, 10], [85, 32], [85, 66]],
  },
};

/** Раскладка мест для count игроков (2–6). Чистая функция. */
export function seatLayouts(count) {
  const n = Math.max(2, Math.min(Number(count) || 2, 6));
  const L = SEAT_LAYOUTS[n];
  return L.d.map((d, i) => ({ d, m: L.m[i] }));
}

/** Подпись места. Человек всегда «Вы» — имя из движка уже может быть «Вы». */
export function seatLabel(player) {
  return player.isHuman ? 'Вы' : String(player.name ?? '');
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

export function renderDie(value, size = 'md', wild = false) {
  const PIPS = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };
  const v = Number.isInteger(value) && value >= 1 && value <= 6 ? value : 1;
  const pips = PIPS[v];
  let dots = '';
  for (let i = 0; i < 9; i++) dots += `<i class="${pips.includes(i) ? 'on' : ''}"></i>`;
  return `<span class="pd ${size} ${wild && v === 1 ? 'wild' : ''}" title="${v}">${dots}</span>`;
}

export function renderHand(hand, wild = true, size = 'md') {
  if (!hand || hand.length === 0) return '<span class="m">—</span>';
  return hand.slice().sort().map((d) => renderDie(d, size, wild && d === 1)).join('');
}

export function renderHiddenDice(count) {
  return Array.from({ length: count }, () =>
    '<span class="pd xs" style="background:#3a4152; border:1px solid #555"></span>'
  ).join('');
}

// Размер кубика внутри чипа зависит от размера чипа:
//   xs — у места игрока, lg — в центре стола, xl — крупная ставка, по умолчанию — компактный.
const CHIP_DIE_SIZE = { xs: 'xs', lg: 's', xl: '' };

export function renderBid(q, f, cls = '') {
  const dieSize = CHIP_DIE_SIZE[cls] ?? 's';
  return `<span class="chip ${cls}">${q}<em>×</em>${renderDie(f, dieSize)}</span>`;
}

export function renderSeat(player, layout, isActive, style = null) {
  if (!layout) return '';

  const avatarSvg = player.avatar || generateDefaultAvatar(player.gender);
  const styleIcon = style ? BOT_STYLES[style]?.icon || '' : '';
  const bidHtml = player.lastBid
    ? renderBid(player.lastBid.q, player.lastBid.f, 'xs')
    : '';

  const cls = [
    'seat',
    isActive ? 'active' : '',
    !player.alive ? 'eliminated' : '',
    player.isHuman ? 'human' : '',
  ].filter(Boolean).join(' ');

  return `
    <div class="${cls}"
         style="--x:${layout.d[0]}%;--y:${layout.d[1]}%;--mx:${layout.m[0]}%;--my:${layout.m[1]}%"
         data-player-id="${escapeHtml(player.id)}">
      <div class="seat-avatar">
        ${avatarSvg}
        ${styleIcon ? `<span class="seat-style">${styleIcon}</span>` : ''}
      </div>
      <div class="seat-info">
        <div class="seat-name">${escapeHtml(seatLabel(player))}</div>
        <div class="seat-meta">
          <span class="seat-dice">🎲 ${player.dice}</span>${bidHtml}
        </div>
      </div>
    </div>
  `;
}

export function renderTable(game, currentPlayerIndex) {
  const layouts = seatLayouts(game.players.length);

  const seats = game.players.map((p, i) =>
    renderSeat(p, layouts[i] || layouts[layouts.length - 1], i === currentPlayerIndex, p.style));

  const b = game.bid;
  const bq = b ? (b.q ?? b.quantity) : null;
  const bf = b ? (b.f ?? b.face) : null;

  const bidHtml = (b && bq != null && bf != null)
    ? `<div class="table-bid">${renderBid(bq, bf, 'lg')}<span class="bid-by">${escapeHtml(b.playerName)}</span></div>`
    : '<div class="table-bid table-bid-empty">Ставок ещё нет</div>';

  return `
    <div class="table-felt" aria-hidden="true"></div>
    <div class="table-center">
      ${bidHtml}
      ${game.palifico ? '<span class="palifico-badge">ПАЛИФИКО</span>' : ''}
    </div>
    ${seats.join('')}
  `;
}

export function generateDefaultAvatar(gender = 'male') {
  const color1 = gender === 'female' ? '#D94AD9' : '#4A90D9';
  const mouth = gender === 'female'
    ? `<path d="M 30 65 Q 50 80 70 65" stroke="${color1}" stroke-width="3" fill="none"/>`
    : `<path d="M 35 65 L 65 65 L 60 75 L 40 75 Z" fill="${color1}"/>`;
  return `
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="48" fill="#F0F0F0" stroke="${color1}" stroke-width="3"/>
      <circle cx="50" cy="40" r="18" fill="${color1}"/>
      ${mouth}
    </svg>
  `;
}
