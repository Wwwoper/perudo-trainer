// icons.js — общие SVG-значки. Один источник: везде, где показан уровень звука, рисуется один и тот же значок.

const SPEAKER = '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" fill="currentColor" stroke="none"/>';
const WAVES = {
  off: '<path d="M15.5 9.5l5 5M20.5 9.5l-5 5"/>',
  quiet: '<path d="M15.5 9.5a3.5 3.5 0 0 1 0 5"/>',
  normal: '<path d="M15.5 9.5a3.5 3.5 0 0 1 0 5"/><path d="M18.5 6.5a7.5 7.5 0 0 1 0 11"/>',
};

/** Режимы звука в порядке «тише → громче»: число дуг у динамика растёт, у выключенного — крест. */
export const SOUND_ICON_MODES = Object.freeze(Object.keys(WAVES));

/** SVG-значок режима звука (`off`, `quiet`, `normal`); цвет берётся из currentColor. Неизвестный режим — как `off`. */
export function soundIconSvg(mode) {
  const waves = WAVES[mode] || WAVES.off;
  return `<svg class="icon icon-sound" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SPEAKER}${waves}</svg>`;
}
