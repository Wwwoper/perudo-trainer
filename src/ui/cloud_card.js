// src/ui/cloud_card.js — копия в облаке (Яндекс Диск): вход, статус, запись, восстановление.
// Вся логика сценариев в cloud_sync.js; здесь только страница, вход через Яндекс и привязка к хранилищу.

import { get, set, getStats, getGames, getTrainingQueue, getCloudState, setCloudState } from '../storage.js';
import { buildBackup, serializeBackup, parseBackup, applyBackup } from '../backup.js';
import { createClient, buildAuthUrl, parseAuthHash, redirectUriFor, createState } from '../cloud_yandex.js';
import { isLocalDataEmpty, hasValidToken } from '../cloud_policy.js';
import { createCloudSync, errorText } from '../cloud_sync.js';
import { escapeHtml } from '../table.js';
import { $ } from './common.js';

const STATE_KEY = 'perudo.oauthState';    // только на этом устройстве, в копию не входит
let sync = null;
let message = { text: '', cls: 'muted' };

const fmt = (ms) => new Date(ms).toLocaleString('ru', { dateStyle: 'short', timeStyle: 'short' });

function say(text, cls = 'muted') {
  message = { text, cls };
  const el = $('#clMsg');
  if (!el) return;
  el.className = cls;
  el.textContent = text;
}

/** Облако подключено и токен действует: напоминание про файл не нужно. */
export function cloudConnected() {
  return hasValidToken(getCloudState());
}

function realSync() {
  return createCloudSync({
    makeClient: (token) => createClient({ fetch: window.fetch.bind(window), token }),
    getState: getCloudState,
    setState: setCloudState,
    snapshot: () => {
      const b = buildBackup((k) => get(k));
      return { text: serializeBackup(b), exportedAt: b.exportedAt };
    },
    parseText: (text) => {
      const r = parseBackup(text);
      return r.ok ? { ok: true, exportedAt: r.exportedAt } : { ok: false };
    },
    applyText: (text) => {
      const r = parseBackup(text);
      if (!r.ok) return { ok: false };
      applyBackup(r.data, (k, v) => set(k, v), (k) => {
        try { localStorage.removeItem(k); } catch (e) { }
      });
      return { ok: true };
    },
    isLocalEmpty: () => isLocalDataEmpty({
      stats: getStats(), games: getGames(), queue: getTrainingQueue(), reviews: get('perudo.reviews', []),
    }),
  });
}

// ----- Вход -----

function startLogin() {
  let state = '';
  try {
    state = createState(crypto.getRandomValues(new Uint8Array(16)));
    localStorage.setItem(STATE_KEY, state);
  } catch (e) { state = ''; }
  const redirectUri = redirectUriFor({ origin: location.origin, pathname: location.pathname });
  location.href = buildAuthUrl({ redirectUri, state });
}

/** Яндекс вернул игрока на страницу: сохраняем токен и убираем его из адреса. */
function handleAuthReturn() {
  let expected = '';
  try { expected = localStorage.getItem(STATE_KEY) || ''; } catch (e) { }
  const r = parseAuthHash(location.hash, { expectedState: expected || undefined });
  if (!r.ok && r.error === 'none') return null;
  try { localStorage.removeItem(STATE_KEY); } catch (e) { }
  history.replaceState(null, '', location.pathname + location.search);
  if (r.ok) {
    setCloudState({ ...getCloudState(), token: r.token, expiresAt: r.expiresAt });
    return { ok: true };
  }
  const texts = {
    denied: 'Вход через Яндекс отменён.',
    state: 'Не удалось проверить ответ Яндекса. Попробуйте войти ещё раз.',
    no_token: 'Яндекс не передал доступ. Попробуйте войти ещё раз.',
  };
  return { ok: false, text: texts[r.error] || texts.no_token };
}

// ----- Показ -----

function pendingHtml(p) {
  const when = p.cloudAt ? fmt(p.cloudAt) : '';
  if (p.mode === 'offer') {
    return `<p>На вашем Яндекс Диске найдена копия данных от ${when}. На этом устройстве данных пока нет.</p>` +
      '<div class="cloud-actions">' +
      '<button type="button" class="btn-primary" data-cl="restore">Восстановить из облака</button>' +
      '<button type="button" data-cl="later">Не сейчас</button></div>';
  }
  return `<p>Данные есть и на этом устройстве, и в облаке (копия от ${when}). Какие оставить? Другие будут заменены.</p>` +
    '<div class="cloud-actions">' +
    '<button type="button" class="btn-primary" data-cl="restore">Взять из облака</button>' +
    '<button type="button" data-cl="keep">Оставить это устройство</button>' +
    '<button type="button" data-cl="later">Не сейчас</button></div>';
}

export function renderCloudCard() {
  const host = $('#plCloud');
  if (!host || !sync) return;
  const st = sync.status();
  let h = '<b>Копия на Яндекс Диске</b>';
  if (st.connected) {
    h += `<p id="clStatus">${st.syncedAt ? `Копия в облаке: ${escapeHtml(fmt(st.syncedAt))}.` : 'Копия в облаке ещё не записана.'}</p>`;
    if (st.pending) h += `<div id="clPending">${pendingHtml(st.pending)}</div>`;
    h += '<div class="cloud-actions">' +
      `<button type="button" id="clSave"${st.pending ? ' disabled' : ''}>Сохранить сейчас</button>` +
      '<button type="button" id="clLogout">Выйти</button></div>';
  } else if (st.expired) {
    h += '<p id="clStatus">Вход через Яндекс устарел. Данные на этом устройстве целы.</p>' +
      '<div class="cloud-actions"><button type="button" id="clLogin" class="btn-primary">Войти снова</button>' +
      '<button type="button" id="clLogout">Выйти</button></div>';
  } else {
    h += '<p class="muted">Копия в личной папке приложения на вашем Диске переживёт очистку браузера и поможет перенести данные на другое устройство. ' +
      'Приложение видит только эту папку.</p>' +
      '<div class="cloud-actions"><button type="button" id="clLogin">Войти через Яндекс</button></div>';
  }
  h += `<div id="clMsg" class="${message.cls}" role="status" aria-live="polite">${escapeHtml(message.text)}</div>`;
  host.innerHTML = h;
}

function showDialog() {
  const dlg = $('#clDialog');
  const st = sync.status();
  if (!dlg || !st.pending || typeof dlg.showModal !== 'function' || dlg.open) return;
  $('#clDialogTitle').textContent = st.pending.mode === 'offer' ? 'Найдена копия данных' : 'Какие данные оставить?';
  $('#clDialogBody').innerHTML = pendingHtml(st.pending);
  dlg.showModal();
}

function closeDialog() {
  const dlg = $('#clDialog');
  if (dlg?.open) dlg.close();
}

/** Результат проверки облака → сообщение и, если нужен выбор, окно. */
function afterCheck(r) {
  if (r.kind === 'offer' || r.kind === 'ask') { say(''); renderCloudCard(); showDialog(); return; }
  if (r.kind === 'error') say(errorText(r.code), 'text-bad');
  else say('');
  renderCloudCard();
}

async function onAction(act) {
  if (act === 'later') { closeDialog(); say('Выбор можно сделать позже в «Статистике», блок «Игрок».'); renderCloudCard(); return; }
  if (act === 'restore') {
    const r = sync.restore();
    if (!r.ok) { say(errorText(r.code), 'text-bad'); renderCloudCard(); return; }
    try { sessionStorage.setItem('perudo.importNotice', 'Данные восстановлены из облака.'); } catch (e) { }
    location.reload();
    return;
  }
  if (act === 'keep') {
    closeDialog();
    say('Записываю копию…');
    const r = await sync.keepLocal();
    say(r.ok ? 'Облако обновлено данными этого устройства.' : errorText(r.code), r.ok ? 'text-ok' : 'text-bad');
    renderCloudCard();
  }
}

/**
 * Подключает блок облака (после setupStats: нужен контейнер #plCloud).
 * @returns {{afterGame: () => Promise<void>}}
 */
export function setupCloudCard() {
  sync = realSync();
  const back = handleAuthReturn();
  if (back && !back.ok) say(back.text, 'text-bad');
  if (back?.ok) {
    say('Вход выполнен.', 'text-ok');
    $('.tab-btn[data-t="stats"]')?.click();
  }

  document.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-cl]')?.dataset.cl;
    if (act) { onAction(act); return; }
    if (e.target.closest('#clLogin')) startLogin();
    else if (e.target.closest('#clLogout')) {
      if (!confirm('Выйти из облака? Данные на этом устройстве и файл на Диске останутся.')) return;
      sync.logout();
      say('Вы вышли. Копия на Диске осталась.');
      renderCloudCard();
    } else if (e.target.closest('#clSave')) {
      say('Записываю копию…');
      const r = await sync.saveNow({ manual: true });
      say(r.ok ? 'Копия записана на Диск.' : errorText(r.code), r.ok ? 'text-ok' : 'text-bad');
      renderCloudCard();
    }
  });
  $('#clDialog')?.addEventListener('click', (e) => { if (e.target === $('#clDialog')) closeDialog(); });

  renderCloudCard();
  if (sync.status().connected) sync.check().then(afterCheck);

  return {
    /** Партия закончилась: тихо обновляем копию, ошибка видна в блоке «Игрок». */
    async afterGame() {
      if (!sync.status().connected) return;
      const r = await sync.afterGame();
      if (r.ok) say('Копия записана на Диск.', 'text-ok');
      else if (r.code === 'pending') { renderCloudCard(); showDialog(); return; }
      else if (r.code !== 'throttled' && r.code !== 'empty') say(errorText(r.code), 'text-bad');
      renderCloudCard();
    },
  };
}
