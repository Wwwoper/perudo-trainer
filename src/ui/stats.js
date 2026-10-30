// src/ui/stats.js — вкладка «Статистика»: результаты, профиль игрока, данные (облако, экспорт/импорт JSON, сброс).

import { getStats, setStats, getTrainingQueue, setTrainingQueue, getGames, setDuelStats, get, set, getDeviceState, setDeviceState } from '../storage.js';
import { buildBackup, serializeBackup, parseBackup, applyBackup } from '../backup.js';
import { escapeHtml } from '../table.js';
import { P, $, pct } from './common.js';
import { modeLabel } from './modes.js';
import { resetDuelStats } from './duel.js';
import { renderWeakSpots, setupWeakSpots } from './weak_spots.js';
import { renderPlayerCard, setupPlayerCard } from './player_card.js';
import { renderCloudCard, cloudConnected } from './cloud_card.js';
import { setupStatsTabs, showStatsTab } from './stats_tabs.js';
import { visibleGames, formatGameWhen, formatGameMeta, GAMES_SHOWN } from '../games_list.js';
import { summarize, rateOf, isEmptyStats, MIN_DECISIONS_FOR_RATE, MIN_GAMES_FOR_RATE } from '../stats_summary.js';
import { markBackupExported } from './backup_reminder.js';
import { readPersisted, describePersistence } from '../persistence.js';
import { REMIND_FIRST } from '../backup_reminder.js';

/** Строка про защиту данных от автоочистки браузера (если браузер умеет об этом сказать). */
export async function renderPersistence() {
  const el = $('#stPersist');
  if (!el) return;
  el.textContent = describePersistence(await readPersisted(globalThis.navigator?.storage), { cloud: cloudConnected() }) || '';
}

/** Скачивает полную копию данных в файл и откладывает напоминание. Возвращает имя файла. */
export function downloadBackup() {
  const text = serializeBackup(buildBackup((k) => get(k)));
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `perudo-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  markBackupExported();
  return a.download;
}

/** Три крупных числа наверху «Результатов»; процент показывается только когда данных достаточно. */
function renderTiles(s) {
  const el = $('#stTiles');
  if (!el) return;
  const tile = (label, value, note) =>
    `<div class="stat-tile"><span class="stat-value">${escapeHtml(String(value))}</span>` +
    `<span class="stat-label">${escapeHtml(label)}</span><span class="stat-note">${escapeHtml(note)}</span></div>`;
  const g = s.games;
  const gameNote = g.total === 0 ? 'пока нет' : `побед: ${g.wins}${g.enough ? ` · ${pct(g.rate)}` : ` · мало (от ${MIN_GAMES_FOR_RATE})`}`;
  const t = s.trainer;
  const trainerNote = t.n === 0 ? 'решений нет'
    : t.enough ? `${t.good} из ${t.n}` : `мало: ${t.n} из ${MIN_DECISIONS_FOR_RATE}`;
  el.innerHTML = tile('Партий', g.total, gameNote) +
    tile('Верно в тренажёре', t.enough ? pct(t.rate) : '—', trainerNote) +
    tile('Повторов в очереди', s.queue, s.queue ? 'ждут в тренажёре' : 'очередь пуста');
}

let gamesExpanded = false;          // «Показать все» — до закрытия страницы

/** Список партий: свежие сверху, по умолчанию последние 10, остальные по кнопке. */
function renderGames(history) {
  const el = $('#stGames');
  if (!el) return;
  if (!history.length) {
    el.innerHTML = '<p class="muted">Сыгранных партий пока нет.</p>';
    return;
  }
  const { items, hidden } = visibleGames(history, gamesExpanded);
  let h = '<b class="games-title">Партии</b><ul class="game-list">' + items.map((g) =>
    `<li class="game-row"><span class="game-when">${escapeHtml(formatGameWhen(g.ts))}</span>` +
    `<span class="game-result ${g.won ? 'text-ok' : 'text-bad'}">${g.won ? 'победа' : 'поражение'}</span>` +
    `<span class="game-meta">${escapeHtml(formatGameMeta(g))}</span></li>`).join('') + '</ul>';
  if (hidden) h += `<button type="button" id="stGamesMore" class="games-more">Показать все (${history.length})</button>`;
  else if (gamesExpanded && history.length > GAMES_SHOWN) h += '<button type="button" id="stGamesMore" class="games-more">Показать меньше</button>';
  el.innerHTML = h;
}

export function renderStats() {
  if (!P) return;

  const stats = getStats();
  const history = getGames();          // P2.11: через storage-хелпер
  const queue = getTrainingQueue();

  const empty = isEmptyStats({ stats, games: history, queue });
  if ($('#stEmpty')) $('#stEmpty').hidden = !empty;
  if ($('#stFilled')) $('#stFilled').hidden = empty;
  renderTiles(summarize({ stats, games: history, queue }));

  renderWeakSpots(stats.byTag);
  renderPlayerCard();
  renderCloudCard();
  renderPersistence();

  const byModeEl = $('#stByMode');
  if (byModeEl) {
    const byMode = stats.byMode || {};
    const keys = Object.keys(byMode);
    if (!keys.length) {
      byModeEl.innerHTML = '<p class="muted">Тренажёр ещё не использовался.</p>';
    } else {
      let h = '<table><tr><th>Режим</th><th>Всего</th><th>Верно</th><th>Процент</th></tr>';
      let hidden = false;
      for (const k of keys) {
        const d = byMode[k];
        const r = rateOf(d.good, d.n, MIN_DECISIONS_FOR_RATE);
        if (!r.enough) hidden = true;
        h += `<tr><td>${escapeHtml(modeLabel(k))}</td><td>${d.n}</td><td>${d.good}</td><td>${r.enough ? pct(r.rate) : '—'}</td></tr>`;
      }
      h += '</table>';
      if (hidden) h += `<p class="muted stat-foot">Процент считается от ${MIN_DECISIONS_FOR_RATE} решений: до этого данных мало.</p>`;
      byModeEl.innerHTML = h;
    }
  }

  renderGames(history);
}

/** onReset() — вызывается при «Сбросить всё», чтобы партия забыла память ботов. */
export function setupStats({ onReset, onTrain, onPlayerChange } = {}) {
  setupStatsTabs();
  $('#stGames')?.addEventListener('click', (e) => {
    if (!e.target.closest('#stGamesMore')) return;
    gamesExpanded = !gamesExpanded;
    renderGames(getGames());
  });
  $('#stEmpty')?.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]')?.dataset.go;
    if (go) $(`.tab-btn[data-t="${go}"]`)?.click();
  });
  document.addEventListener('perudo:cloud-render', renderPersistence);   // вход и выход меняют совет про сохранность
  setupWeakSpots(onTrain);
  setupPlayerCard({ onChange: onPlayerChange });
  const msg = (text, cls = 'muted') => {
    const el = $('#stBackupMsg');
    if (!el) return;
    el.className = cls;
    el.textContent = text;
  };

  // Сообщение об импорте, после которого страница была перезагружена
  try {
    const note = sessionStorage.getItem('perudo.importNotice');
    if (note) {
      sessionStorage.removeItem('perudo.importNotice');
      msg(note, 'text-ok');
      $('.tab-btn[data-t="stats"]')?.click();
      showStatsTab('data');                // сообщение об импорте лежит во вкладке «Данные»
    }
  } catch (e) { }

  const exp = $('#stExport');
  if (exp) exp.onclick = () => msg(`Копия сохранена в файл ${downloadBackup()}.`);

  const imp = $('#stImport');
  const file = $('#stImportFile');
  if (imp && file) {
    imp.onclick = () => file.click();
    file.onchange = async () => {
      const f = file.files && file.files[0];
      file.value = '';                 // чтобы тот же файл можно было выбрать снова
      if (!f) return;
      let text;
      try {
        text = await f.text();
      } catch (e) {
        msg('Не удалось прочитать файл.', 'text-bad');
        return;
      }
      const r = parseBackup(text);
      if (!r.ok) {
        msg(r.error, 'text-bad');
        return;
      }
      const when = r.exportedAt ? ` от ${new Date(r.exportedAt).toLocaleString('ru')}` : '';
      const damaged = r.dropped ? ` В файле есть повреждённые записи (${r.dropped}): они будут пропущены.` : '';
      if (!confirm(`Заменить данные приложения копией${when}? Текущие статистика, настройки и память ботов будут потеряны.${damaged}`)) {
        msg('Импорт отменён.');
        return;
      }
      applyBackup(r.data, (k, v) => set(k, v), (k) => {
        try { localStorage.removeItem(k); } catch (e) { }
      });
      try { sessionStorage.setItem('perudo.importNotice', r.dropped ? `Данные восстановлены из копии. Пропущено повреждённых записей: ${r.dropped}.` : 'Данные восстановлены из копии.'); } catch (e) { }
      location.reload();
    };
  }

  const clr = $('#stClear');
  if (clr) clr.onclick = () => {
    if (!confirm('Сбросить статистику, очередь повторов, историю партий и профиль игрока (имя и аватар)?')) return;
    try {
      ['perudo.settings', 'perudo.userProfile', 'perudo.games',
        'perudo.trainingQueue', 'perudo.duelStats', 'perudo.botMemory', 'perudo.reviews', 'perudo.rounds', 'perudo.player'].forEach((k) => localStorage.removeItem(k));
    } catch (e) { }
    onReset?.();
    setDeviceState({ ...getDeviceState(), nextAt: REMIND_FIRST });   // счёт партий начался заново
    setStats({ n: 0, good: 0, totalGames: 0, totalWins: 0, byMode: {}, byTag: {}, drill: { A: { n: 0, good: 0 }, B: { n: 0, good: 0 } } });
    setTrainingQueue([]);
    set('perudo.games', []);
    setDuelStats(null);
    resetDuelStats();
    renderStats();
  };
}
