// src/ui/player_card.js — блок «Игрок» во вкладке «Статистика»: имя, аватар, снимок.

import { getPlayer, setPlayer } from '../storage.js';
import { AVATAR_EMOJIS, NAME_MAX, MAX_PHOTO_CHARS, sanitizeName } from '../player.js';
import { MAX_SOURCE_BYTES, squareCrop, fitPhoto } from '../avatar_photo.js';
import { renderPlayerAvatar, generateDefaultAvatar, escapeHtml } from '../table.js';
import { $ } from './common.js';

let onPlayerChange = null;

function say(text, cls = 'muted') {
  const el = $('#plMsg');
  if (!el) return;
  el.className = cls;
  el.textContent = text;
}

/** Обновляет поля блока по сохранённому игроку (имя в поле при вводе не трогаем). */
export function renderPlayerCard() {
  if (!$('#stPlayer')) return;
  const p = getPlayer();
  const input = $('#plName');
  if (input && document.activeElement !== input) input.value = p.name;
  const prev = $('#plAvatar');
  if (prev) prev.innerHTML = renderPlayerAvatar(p.avatar) || generateDefaultAvatar();
  document.querySelectorAll('#plEmojis [data-emoji]').forEach((b) => {
    const on = p.avatar?.type === 'emoji' && p.avatar.value === b.dataset.emoji;
    b.classList.toggle('is-selected', on);
    b.setAttribute('aria-checked', String(on));
  });
  const clear = $('#plClear');
  if (clear) clear.disabled = !p.avatar;
}

function save(patch) {
  setPlayer({ ...getPlayer(), ...patch });
  renderPlayerCard();
  onPlayerChange?.(getPlayer());
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode'));
    img.src = url;
  });
}

/** Файл → data-адрес JPEG нужного размера. Бросает Error с кодом: format | big | decode | fit. */
async function photoFromFile(file) {
  if (!file.type.startsWith('image/')) throw new Error('format');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('big');
  const url = URL.createObjectURL(file);
  let img;
  try {
    img = await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  const crop = squareCrop(img.naturalWidth, img.naturalHeight);
  if (!crop) throw new Error('decode');
  const canvas = document.createElement('canvas');
  const photo = fitPhoto((px, q) => {
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';                       // у прозрачных PNG в JPEG фон был бы чёрным
    ctx.fillRect(0, 0, px, px);
    ctx.drawImage(img, crop.sx, crop.sy, crop.side, crop.side, 0, 0, px, px);
    return canvas.toDataURL('image/jpeg', q);
  }, MAX_PHOTO_CHARS);
  if (!photo) throw new Error('fit');
  return photo;
}

const PHOTO_ERRORS = {
  format: 'Это не картинка.',
  big: 'Файл слишком большой: нужна картинка до 10 МБ.',
  decode: 'Не удалось прочитать картинку.',
  fit: 'Не удалось сжать фото до нужного размера.',
};

/**
 * Рисует блок «Игрок» и подключает обработчики.
 * @param {{onChange?: (player: object) => void}} opts onChange вызывается после каждого изменения
 */
export function setupPlayerCard({ onChange } = {}) {
  const host = $('#stPlayer');
  if (!host) return;
  onPlayerChange = onChange || null;

  host.innerHTML =
    '<b>Игрок</b>' +
    '<p class="muted">Имя и аватар видны за столом и в итогах партии. Хранятся на этом устройстве и входят в «Экспорт JSON».</p>' +
    '<div class="player-head">' +
    '<span id="plAvatar" class="player-avatar" aria-hidden="true"></span>' +
    '<label class="player-name-field" for="plName">Имя' +
    `<input id="plName" type="text" maxlength="${NAME_MAX}" autocomplete="off" placeholder="Вы" enterkeyhint="done">` +
    '</label></div>' +
    '<div id="plEmojis" class="player-emojis" role="radiogroup" aria-label="Аватар">' +
    AVATAR_EMOJIS.map((e) =>
      `<button type="button" class="player-emoji" role="radio" aria-checked="false" data-emoji="${escapeHtml(e)}" aria-label="Аватар ${escapeHtml(e)}">${escapeHtml(e)}</button>`).join('') +
    '</div>' +
    '<div class="player-actions">' +
    '<button type="button" id="plPhoto">Выбрать фото</button>' +
    '<button type="button" id="plClear">Убрать аватар</button>' +
    '<input id="plFile" type="file" accept="image/*" hidden aria-label="Файл с фото">' +
    '</div>' +
    '<div id="plMsg" class="muted" role="status" aria-live="polite"></div>';

  const input = $('#plName');
  // Имя сохраняется при вводе; само поле переписываем только когда ввод закончен (иначе прыгает курсор).
  input.addEventListener('input', () => save({ name: sanitizeName(input.value) }));
  input.addEventListener('change', () => { input.value = getPlayer().name; });

  host.addEventListener('click', (e) => {
    const emoji = e.target.closest('[data-emoji]');
    if (emoji) {
      save({ avatar: { type: 'emoji', value: emoji.dataset.emoji } });
      say('');
    }
  });
  $('#plClear').onclick = () => { save({ avatar: null }); say('Аватар убран.'); };
  $('#plPhoto').onclick = () => $('#plFile').click();
  $('#plFile').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';                           // тот же файл можно выбрать повторно
    if (!file) return;
    try {
      save({ avatar: { type: 'photo', value: await photoFromFile(file) } });
      say('Фото сохранено.');
    } catch (err) {
      say(PHOTO_ERRORS[err.message] || PHOTO_ERRORS.decode, 'text-bad');
    }
  });

  renderPlayerCard();
}
