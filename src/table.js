// table.js — игровой стол на 2-6 игроков

import { BOT_STYLES } from './bots.js';

const SEAT_POSITIONS = {
  2: [
    { left: '50%', top: '88%' },
    { left: '50%', top: '12%' },
  ],
  3: [
    { left: '50%', top: '88%' },
    { left: '18%', top: '26%' },
    { left: '82%', top: '26%' },
  ],
  4: [
    { left: '50%', top: '88%' },
    { left: '12%', top: '50%' },
    { left: '50%', top: '12%' },
    { left: '88%', top: '50%' },
  ],
  5: [
    { left: '50%', top: '88%' },
    { left: '12%', top: '34%' },
    { left: '30%', top: '12%' },
    { left: '70%', top: '12%' },
    { left: '88%', top: '34%' },
  ],
  6: [
    { left: '50%', top: '88%' },
    { left: '10%', top: '50%' },
    { left: '25%', top: '15%' },
    { left: '50%', top: '10%' },
    { left: '75%', top: '15%' },
    { left: '90%', top: '50%' },
  ],
};

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

export function renderBid(q, f, cls = '') {
  return `<span class="chip ${cls}">${q}<em>×</em>${renderDie(f, cls ? '' : 's')}</span>`;
}

export function renderSeat(player, position, isActive, showHand = false, style = null) {
  const pos = position;
  if (!pos) return '';

  const avatarSvg = player.avatar || generateDefaultAvatar(player.gender);
  const handHtml = showHand ? renderHand(player.hand, true, 'sm') : renderHiddenDice(player.dice);
  const styleIcon = style ? BOT_STYLES[style]?.icon || '' : '';

  return `
    <div class="seat ${isActive ? 'active' : ''} ${!player.alive ? 'eliminated' : ''}"
         style="left: ${pos.left}; top: ${pos.top};"
         data-player-id="${player.id}">
      <div class="seat-avatar">
        ${avatarSvg}
        ${styleIcon ? `<span class="seat-style">${styleIcon}</span>` : ''}
      </div>
      <div class="seat-info">
        <div class="seat-name">${player.name}${player.isHuman ? ' (вы)' : ''}</div>
        <div class="seat-dice">🎲 ${player.dice}</div>
        ${player.lastBid ? `<div class="seat-bid">${renderBid(player.lastBid.q, player.lastBid.f, 'xs')}</div>` : ''}
      </div>
      <div class="seat-hand">${handHtml}</div>
      ${isActive ? '<div class="seat-turn-indicator">➤</div>' : ''}
    </div>
  `;
}

export function renderTable(game, currentPlayerIndex, assistConfig) {
  const count = Math.max(2, Math.min(game.players.length, 6));
  const layout = SEAT_POSITIONS[count];

  const seats = game.players.map((p, i) => {
    const isActive = i === currentPlayerIndex;
    const showHand = Boolean(p.isHuman);
    const seatPosition = layout[i] || layout[layout.length - 1];
    return renderSeat(p, seatPosition, isActive, showHand, p.style);
  });

  const totalDice = game.players.reduce((s, p) => s + p.dice, 0);
  const b = game.bid;
  const bq = b ? (b.q ?? b.quantity) : null;
  const bf = b ? (b.f ?? b.face) : null;

  const bidHtml = (b && bq != null && bf != null)
    ? `<div class="table-bid">${renderBid(bq, bf, 'lg')} <span class="bid-by">— ${b.playerName}</span></div>`
    : '<div class="table-bid table-bid-empty">Ставок ещё нет</div>';

  return `
    <div class="game-table" data-players="${game.players.length}">
      <div class="table-center">
        ${bidHtml}
        <div class="table-meta">
          <span>Раунд ${game.round}</span>
          <span>🎲 ${totalDice}</span>
          ${game.palifico ? '<span class="palifico-badge">ПАЛИФИКО</span>' : ''}
        </div>
      </div>
      ${seats.join('')}
    </div>
  `;
}

function generateDefaultAvatar(gender = 'male') {
  const color1 = gender === 'female' ? '#D94AD9' : '#4A90D9';
  return `
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="48" fill="#F0F0F0" stroke="${color1}" stroke-width="3"/>
      <circle cx="50" cy="40" r="18" fill="${color1}"/>
      ${gender === 'female'
        ? '<path d="M 30 65 Q 50 80 70 65" stroke="${color1}" stroke-width="3" fill="none"/>'
        : '<path d="M 35 65 L 65 65 L 60 75 L 40 75 Z" fill="${color1}"/>'}
    </svg>
  `;
}