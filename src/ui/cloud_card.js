// src/ui/cloud_card.js — аккаунт и копия в облаке (Яндекс Диск): выбор «гость / Яндекс», вход,
// статус, запись, восстановление. Вся логика сценариев в cloud_sync.js; здесь только страница,
// вход через Яндекс и привязка к хранилищу.

import { showStatsTab } from './stats_tabs.js';
import { get, set, getStats, getGames, getTrainingQueue, getCloudState, setCloudState, getDeviceState, setDeviceState } from '../storage.js';
import { buildBackup, serializeBackup, parseBackup, applyBackup } from '../backup.js';
import { createClient, buildAuthUrl, parseAuthHash, redirectUriFor, createState, CloudError } from '../cloud_yandex.js';
import { runDiagnostics } from '../cloud_diag.js';
import { isLocalDataEmpty, hasValidToken, hashText, summarizeBackupData } from '../cloud_policy.js';
import { createCloudSync, errorText } from '../cloud_sync.js';
import { escapeHtml } from '../table.js';
import { $ } from './common.js';

const STATE_KEY = 'perudo.oauthState';      // только на этом устройстве, в копию не входит
const NOTICE_KEY = 'perudo.cloudNotice';    // уведомление, которое нужно показать после перезагрузки страницы
const TOAST_MS = 7000;

let sync = null;
let downloadFile = null;
let message = { text: '', cls: 'muted' };
let toastTimer = null;
let checking = false;                       // проверка облака уже идёт
let diagText = '';                          // последний отчёт о связи с Диском (показывается в блоке «Игрок»)
let lastCheckAt = 0;
const RECHECK_MS = 10_000;                  // автоповтор проверки не чаще, чем раз в 10 секунд

const fmt = (ms) => new Date(ms).toLocaleString('ru', { dateStyle: 'short', timeStyle: 'short' });

/** Строка в блоке «Игрок». */
function say(text, cls = 'muted') {
  message = { text, cls };
  const el = $('#clMsg');
  if (!el) return;
  el.className = cls;
  el.textContent = text;
}

/** Заметное уведомление поверх любой вкладки: итог входа, обновление данных, ошибка. */
function toast(text, cls = 'text-ok') {
  const el = $('#clToast');
  if (!el) return;
  el.className = `cloud-toast ${cls}`;
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, TOAST_MS);
}

/** Сообщение для показа после перезагрузки страницы. */
function noticeAfterReload(text) {
  try { sessionStorage.setItem(NOTICE_KEY, text); } catch (e) { }
}

/** Облако подключено и токен действует: напоминание про файл не нужно. */
export function cloudConnected() {
  return hasValidToken(getCloudState());
}

const setAccount = (account) => setDeviceState({ ...getDeviceState(), account });

/** Проба для отчёта: статус и хост, с которого пришёл ответ. */
function xhrProbe(url, ms) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('GET', url);
    x.timeout = ms;
    x.onload = () => {
      let host = '';
      try { host = new URL(x.responseURL).host; } catch (e) { }
      resolve({ status: x.status, host });
    };
    x.onerror = () => reject(new Error('status 0'));
    x.ontimeout = () => reject(new Error('timeout'));
    x.send();
  });
}

function realSync() {
  const snapshot = () => {
    const b = buildBackup((k) => get(k));
    return {
      text: serializeBackup(b),
      exportedAt: b.exportedAt,
      hash: hashText(JSON.stringify(b.data)),       // без exportedAt: он меняется при каждом чтении
      summary: summarizeBackupData(b.data),
    };
  };
  return createCloudSync({
    makeClient: (token) => createClient({ fetch: window.fetch.bind(window), token }),
    getState: getCloudState,
    setState: setCloudState,
    snapshot,
    parseText: (text) => {
      const r = parseBackup(text);
      return r.ok ? { ok: true, exportedAt: r.exportedAt, summary: summarizeBackupData(r.data) } : { ok: false };
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
    setAccount('yandex');
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

function summaryLine(label, sm, cloudAt) {
  if (!sm) return '';
  const parts = [
    sm.name ? escapeHtml(sm.name) : 'без имени',
    `партий: ${sm.games}`,
    sm.lastGameAt ? `последняя ${escapeHtml(fmt(sm.lastGameAt))}` : 'партий ещё не было',
  ];
  if (cloudAt) parts.push(`копия от ${escapeHtml(fmt(cloudAt))}`);
  return `<li><b>${label}:</b> ${parts.join(' · ')}</li>`;
}

function pendingHtml(p) {
  const list = `<ul class="cloud-compare">${summaryLine('Это устройство', p.local)}${summaryLine('Облако', p.cloud, p.cloudAt)}</ul>`;
  if (p.mode === 'offer') {
    return '<p>На вашем Яндекс Диске есть копия данных, а на этом устройстве данных пока нет.</p>' + list +
      '<div class="cloud-actions">' +
      '<button type="button" class="btn-primary" data-cl="restore">Восстановить из облака</button>' +
      '<button type="button" data-cl="later">Не сейчас</button></div>';
  }
  return '<p>Данные есть и на этом устройстве, и в облаке, и они разные. Выбранная версия заменит другую.</p>' + list +
    '<div class="cloud-actions">' +
    '<button type="button" class="btn-primary" data-cl="restore">Взять из облака</button>' +
    '<button type="button" data-cl="keep">Оставить это устройство</button>' +
    '<button type="button" data-cl="download">Скачать файл этого устройства</button>' +
    '<button type="button" data-cl="later">Решить позже</button></div>';
}

/** Окно выбора на старте: открыто, пока игрок не выбрал «гость» или «Яндекс» (Esc откладывает выбор до следующего запуска). */
function renderWelcome() {
  const dlg = $('#clWelcome');
  if (!dlg) return;
  const need = getDeviceState().account === null && !getCloudState().token;
  if (need && !dlg.open && typeof dlg.showModal === 'function') dlg.showModal();
  else if (!need && dlg.open) dlg.close();
}

export function renderCloudCard() {
  const host = $('#plCloud');
  if (!host || !sync) return;
  const st = sync.status();
  let h = '<b>Копия на Яндекс Диске</b>';
  if (st.connected) {
    if (!st.checked && !st.pending) {
      // Облако ещё не прочитано: не делаем вид, что копии нет
      h += `<p id="clStatus">${st.error ? 'Не удалось проверить копию на Диске.' : 'Проверяю копию на Диске…'}</p>`;
      if (st.error && st.errorDetail) h += `<p class="muted cloud-detail">Подробности: ${escapeHtml(st.errorDetail)}</p>`;
    } else {
      h += `<p id="clStatus">${st.syncedAt ? `Копия в облаке: ${escapeHtml(fmt(st.syncedAt))}.` : 'Копия в облаке ещё не записана.'}</p>`;
    }
    if (st.pending) h += `<div id="clPending">${pendingHtml(st.pending)}</div>`;
    h += '<div class="cloud-actions">' +
      `<button type="button" id="clSave"${st.pending ? ' disabled' : ''}>Сохранить сейчас</button>` +
      (!st.checked && !st.pending ? '<button type="button" id="clCheck">Проверить снова</button>' : '') +
      (st.error ? '<button type="button" id="clDiag">Диагностика связи</button>' : '') +
      '<button type="button" id="clLogout">Выйти</button></div>';
    if (diagText) {
      h += `<pre id="clDiagOut" class="cloud-diag">${escapeHtml(diagText)}</pre>` +
        '<div class="cloud-actions"><button type="button" id="clDiagCopy">Скопировать отчёт</button></div>';
    }
  } else if (st.expired) {
    h += '<p id="clStatus">Вход через Яндекс устарел. Данные на этом устройстве целы.</p>' +
      '<div class="cloud-actions"><button type="button" id="clLogin" class="btn-primary">Войти снова</button>' +
      '<button type="button" id="clLogout">Выйти</button></div>';
  } else {
    const guest = getDeviceState().account === 'guest';
    h += `<p id="clStatus" class="muted">${guest ? 'Вы играете как гость: данные хранятся только на этом устройстве и могут пропасть. ' : ''}` +
      'Войдите через Яндекс: копия в личной папке приложения на вашем Диске переживёт очистку браузера и поможет перенести данные на другое устройство. ' +
      'Приложение видит только эту папку.</p>' +
      '<div class="cloud-actions"><button type="button" id="clLogin" class="btn-primary">Войти через Яндекс</button></div>';
  }
  h += `<div id="clMsg" class="${message.cls}" role="status" aria-live="polite">${escapeHtml(message.text)}</div>`;
  host.innerHTML = h;
  document.dispatchEvent(new Event('perudo:cloud-render'));   // «Данные» подстраивают совет про сохранность
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

/** Данные заменены облачными: страницу нужно перезагрузить, чтобы все вкладки показали новое. */
function reloadWith(text) {
  noticeAfterReload(text);
  location.reload();
}

/** Результат проверки облака → уведомление и, если нужен выбор, окно. */
function afterCheck(r, { justLoggedIn = false } = {}) {
  if (r.kind === 'auto') { reloadWith('Данные обновлены из облака: на другом устройстве была более новая копия.'); return; }
  if (r.kind === 'offer' || r.kind === 'ask') {
    say('');
    renderCloudCard();
    showDialog();
    return;
  }
  if (r.kind === 'error') toast(errorText(r.code), 'text-bad');
  else if (justLoggedIn) toast(sync.status().syncedAt ? 'Вход выполнен. Копия на Диске синхронизирована.' : 'Вход выполнен. Копия появится на Диске после первой партии.');
  renderCloudCard();
}

/** Прочитать облако и сверить с устройством; повторные вызовы во время проверки игнорируются. */
async function runCheck({ justLoggedIn = false } = {}) {
  if (checking || !sync.status().connected) return;
  checking = true;
  lastCheckAt = Date.now();
  renderCloudCard();
  try {
    afterCheck(await sync.check(), { justLoggedIn });
  } finally {
    checking = false;
    renderCloudCard();
  }
}

/**
 * Связь вернулась или игрок вернулся на вкладку: если облако не удалось проверить, пробуем снова.
 * @param {{force?: boolean}} opts force — не ждать паузу между попытками (событие «связь появилась» редкое и значимое)
 */
function retryIfNeeded({ force = false } = {}) {
  const st = sync?.status();
  if (!st || !st.connected || st.checked || st.pending || checking) return;
  if (!force && Date.now() - lastCheckAt < RECHECK_MS) return;
  runCheck();
}

/** Диагностика связи: собирает отчёт по шагам и способам, чтобы по нему можно было понять причину сбоя. */
async function runDiag() {
  diagText = 'Собираю отчёт…';
  renderCloudCard();
  try {
    const lines = await runDiagnostics({
      fetch: window.fetch.bind(window),
      token: getCloudState().token,
      xhrProbe,
      env: { userAgent: navigator.userAgent, online: navigator.onLine, origin: location.origin, now: new Date().toISOString() },
    });
    diagText = lines.join('\n');
  } catch (e) {
    diagText = `Отчёт не собрался: ${e?.message || e}`;
  }
  renderCloudCard();
}

async function copyDiag() {
  try {
    await navigator.clipboard.writeText(diagText);
    say('Отчёт скопирован. Вставьте его в сообщение.', 'text-ok');
  } catch (e) {
    say('Не удалось скопировать: выделите текст отчёта и скопируйте вручную.', 'text-bad');
  }
  renderCloudCard();
}

async function onAction(act) {
  if (act === 'later') {
    closeDialog();
    say('Выбор можно сделать позже: «Статистика» → «Данные».');
    renderCloudCard();
    return;
  }
  if (act === 'download') {
    const name = downloadFile?.();
    say(name ? `Файл этого устройства сохранён: ${name}.` : 'Не удалось сохранить файл.', name ? 'text-ok' : 'text-bad');
    renderCloudCard();
    return;
  }
  if (act === 'restore') {
    const r = sync.restore();
    if (!r.ok) { say(errorText(r.code), 'text-bad'); renderCloudCard(); return; }
    reloadWith('Данные восстановлены из облака.');
    return;
  }
  if (act === 'keep') {
    closeDialog();
    say('Записываю копию…');
    const r = await sync.keepLocal();
    if (r.ok) toast('Облако обновлено данными этого устройства.');
    else toast(errorText(r.code), 'text-bad');
    say('');
    renderCloudCard();
  }
}

/**
 * Подключает аккаунт и облако (после setupStats: нужен контейнер #plCloud).
 * @param {{downloadBackup?: () => string}} opts downloadBackup скачивает файл данных устройства, возвращает имя файла
 * @returns {{afterGame: () => Promise<void>}}
 */
export function setupCloudCard({ downloadBackup } = {}) {
  sync = realSync();
  downloadFile = downloadBackup || null;
  const back = handleAuthReturn();
  if (!back && getCloudState().token && getDeviceState().account === null) setAccount('yandex');   // вход был до выбора «гость/Яндекс»

  try {
    const note = sessionStorage.getItem(NOTICE_KEY);
    if (note) { sessionStorage.removeItem(NOTICE_KEY); toast(note); }
  } catch (e) { }
  if (back && !back.ok) toast(back.text, 'text-bad');

  document.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-cl]')?.dataset.cl;
    if (act) { onAction(act); return; }
    if (e.target.closest('#clDiagCopy')) copyDiag();
    else if (e.target.closest('#clDiag')) runDiag();
    else if (e.target.closest('#clCheck')) { say(''); runCheck(); }
    else if (e.target.closest('#clLogin, #clWelcomeLogin')) startLogin();
    else if (e.target.closest('#clGuest')) {
      setAccount('guest');
      renderWelcome();
      renderCloudCard();
      toast('Вы играете как гость. Войти через Яндекс можно в «Статистике», вкладка «Данные».', 'muted');
    } else if (e.target.closest('#clLogout')) {
      if (!confirm('Выйти из облака? Данные на этом устройстве и файл на Диске останутся.')) return;
      sync.logout();
      setAccount('guest');
      say('Вы вышли. Копия на Диске осталась.');
      renderCloudCard();
    } else if (e.target.closest('#clSave')) {
      say('Записываю копию…');
      const r = await sync.saveNow({ manual: true });
      if (r.code === 'restored') { reloadWith('В облаке была более новая копия, данные обновлены.'); return; }
      if (r.code === 'pending') { say(''); renderCloudCard(); showDialog(); return; }
      say(r.ok ? 'Копия записана на Диск.' : errorText(r.code), r.ok ? 'text-ok' : 'text-bad');
      renderCloudCard();
    }
  });
  $('#clDialog')?.addEventListener('click', (e) => { if (e.target === $('#clDialog')) closeDialog(); });

  if (back?.ok) {
    $('.tab-btn[data-t="stats"]')?.click();
    showStatsTab('data');
    toast('Вход выполнен. Проверяю копию на Диске…');
  }
  renderWelcome();
  renderCloudCard();
  window.addEventListener('online', () => retryIfNeeded({ force: true }));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') retryIfNeeded(); });
  if (sync.status().connected) runCheck({ justLoggedIn: !!back?.ok });

  return {
    /** Партия закончилась: сверяемся с облаком и обновляем копию. Ошибка видна в блоке «Игрок» и уведомлением. */
    async afterGame() {
      if (!sync.status().connected) return;
      const r = await sync.afterGame();
      if (r.ok) say('Копия записана на Диск.', 'text-ok');
      else if (r.code === 'pending') { renderCloudCard(); showDialog(); toast('В облаке другая версия данных: выберите, какую оставить.', 'text-bad'); return; }
      else if (r.code !== 'throttled' && r.code !== 'empty') { say(errorText(r.code), 'text-bad'); toast(errorText(r.code), 'text-bad'); }
      renderCloudCard();
    },
  };
}
