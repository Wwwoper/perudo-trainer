// src/ui/options_view.js — список вариантов хода по шансу ставки (для тренажёра и итога партии).

import { renderBid } from '../table.js';
import { pct } from './common.js';

/**
 * @param {object[]} options варианты из compareOptions(), по желанию с отметкой chosen (markChosen)
 * @param {number} threshold порог, с которым сравнивались варианты
 */
export function optionsHtml(options, threshold) {
  const rows = options.map((o) => {
    const bid = o.type === 'dudo' ? '' : ` ${renderBid(o.q, o.f, 'xs')}`;
    const name = o.type === 'dudo' ? 'Не верю'
      : o.type === 'safeRaise' ? 'Самая сильная безопасная'
        : `Минимальное повышение${o.isBestSafe ? ' (она же самая сильная безопасная)' : ''}`;
    const what = o.type === 'dudo' ? 'проверка сработает:' : 'ставка верна:';
    return `<li class="trainer-option${o.chosen ? ' is-chosen' : ''}">` +
      `<span class="trainer-option-name">${o.meetsThreshold ? '✓ ' : ''}${name}${bid}</span> ` +
      `<span class="trainer-option-chance">${what} <b>${pct(o.success)}</b></span>` +
      `${o.chosen ? ' <span class="trainer-option-mark">← ваш выбор</span>' : ''}</li>`;
  }).join('');
  const anySafe = options.some((o) => o.type !== 'dudo' && o.meetsThreshold);
  return `<p class="muted">Варианты по шансу · ✓ = порог ${pct(threshold)}</p>` +
    `<ul class="trainer-options">${rows}</ul>` +
    (anySafe ? '' : '<p class="muted">Безопасных повышений выше порога нет — «Не верю» часто лучший выбор.</p>');
}
