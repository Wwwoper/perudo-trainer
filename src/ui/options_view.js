// src/ui/options_view.js — список вариантов хода по шансу ставки (для тренажёра и итога партии).

import { renderBid } from '../table.js';
import { pct } from './common.js';
import { optionsNote } from '../trainer_text.js';

/**
 * @param {object[]} options варианты из compareOptions(), по желанию с отметкой chosen (markChosen)
 * @param {number} threshold порог, с которым сравнивались варианты
 */
export function optionsHtml(options, threshold, fmt = pct) {
  const rows = options.map((o) => {
    const chip = o.type === 'dudo' ? '' : renderBid(o.q, o.f, 'xs');
    const name = o.type === 'dudo' ? 'Не верю'
      : o.type === 'safeRaise' ? 'Самая сильная из проходящих порог'
        : `Минимальное повышение${o.isBestSafe ? ' (она же самая сильная из проходящих порог)' : ''}`;
    const what = o.type === 'dudo' ? 'проверка сработает' : 'ставка верна';
    // три колонки: вариант | чип | вероятность; пояснения — второй строкой под названием
    return `<li class="trainer-option${o.chosen ? ' is-chosen' : ''}">` +
      `<span class="trainer-option-name">${o.meetsThreshold ? '✓ ' : ''}${name}` +
      `<small class="trainer-option-what">${what}${o.chosen ? ' <span class="trainer-option-mark">← ваш выбор</span>' : ''}</small></span>` +
      `<span class="trainer-option-chip">${chip}</span>` +
      `<span class="trainer-option-chance"><b>${fmt(o.success)}</b></span></li>`;
  }).join('');
  const note = optionsNote(options);
  return `<p class="muted">Варианты по шансу · ✓ = порог ${fmt(threshold)}</p>` +
    `<ul class="trainer-options">${rows}</ul>` +
    (note ? `<p class="muted">${note}</p>` : '');
}
