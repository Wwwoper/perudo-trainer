// avatar_photo.js — расчёты для сжатия снимка аватара (чистая логика, canvas здесь не нужен).
//
// Снимок обрезается до квадрата по центру и уменьшается до AVATAR_PX, затем сохраняется в JPEG.
// Качество снижается ступенями, пока результат не уложится в лимит MAX_PHOTO_CHARS (см. player.js).

export const AVATAR_PX = 96;
/** Если и на минимальном качестве не помещается — уменьшаем сторону и пробуем снова. */
export const FALLBACK_PX = [72, 56];
export const PHOTO_QUALITIES = [0.8, 0.65, 0.5, 0.4, 0.3];
/** Файл больше этого размера даже не читаем. */
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024;

/** Квадрат по центру изображения w×h: { sx, sy, side }. Для неверных размеров — null. */
export function squareCrop(w, h) {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) return null;
  const side = Math.floor(Math.min(w, h));
  return { sx: Math.floor((w - side) / 2), sy: Math.floor((h - side) / 2), side };
}

/**
 * Сжимает снимок: перебирает стороны и качество, пока результат не уложится в лимит.
 * @param {(px: number, quality: number) => string} render рисует снимок и возвращает data-адрес
 * @param {number} maxChars предельная длина адреса
 * @returns {string|null} data-адрес или null, если уложиться не удалось
 */
export function fitPhoto(render, maxChars) {
  for (const px of [AVATAR_PX, ...FALLBACK_PX]) {
    for (const q of PHOTO_QUALITIES) {
      const url = render(px, q);
      if (typeof url === 'string' && url.length <= maxChars) return url;
    }
  }
  return null;
}
