// radio_keys.js — клавиши радиогруппы: стрелки, Home и End, как у обычных радиокнопок.
// Группа из кнопок role="radio"; выбор делает клик по кнопке, поэтому источник правды остаётся у владельца группы.

/**
 * Индекс кнопки после нажатия клавиши, либо null, если клавиша не относится к группе.
 * Стрелки идут по кругу (как у радиокнопок), Home и End — к первой и последней.
 * @param {number} index текущая кнопка (может быть -1, если фокус не на кнопке)
 * @param {number} count число кнопок
 * @param {string} key значение KeyboardEvent.key
 */
export function nextRadioIndex(index, count, key) {
  if (!Number.isInteger(count) || count < 1) return null;
  const cur = Number.isInteger(index) && index >= 0 && index < count ? index : 0;
  switch (key) {
    case 'ArrowRight': case 'ArrowDown': return (cur + 1) % count;
    case 'ArrowLeft': case 'ArrowUp': return (cur - 1 + count) % count;
    case 'Home': return 0;
    case 'End': return count - 1;
    default: return null;
  }
}

/** Подключить клавиши к группе: выбранной кнопкой считается та, на которой фокус (или отмеченная). */
export function enableRadioKeys(group) {
  if (!group) return;
  group.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const radios = [...group.querySelectorAll('[role="radio"]:not(:disabled)')];
    const from = radios.indexOf(document.activeElement);
    const to = nextRadioIndex(from >= 0 ? from : radios.findIndex((r) => r.getAttribute('aria-checked') === 'true'), radios.length, e.key);
    if (to === null) return;
    e.preventDefault();
    radios[to].click();
    radios[to].focus();
  });
}
