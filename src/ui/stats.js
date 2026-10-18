// src/ui/stats.js — вкладка «Статистика»: сводка, экспорт/импорт JSON, сброс.

import { getStats, setStats, getTrainingQueue, setTrainingQueue, getGames, get, set } from '../storage.js';
import { buildBackup, serializeBackup, parseBackup, applyBackup } from '../backup.js';
import { escapeHtml } from '../table.js';
import { P, $, pct } from './common.js';
import { modeLabel } from './modes.js';
import { resetDuelStats } from './duel.js';
import { renderWeakSpots, setupWeakSpots } from './weak_spots.js';
import { renderPlayerCard, setupPlayerCard } from './player_card.js';

export function renderStats() {
  if (!P) return;

  const stats = getStats();
  const history = getGames();          // P2.11: через storage-хелпер
  const queue = getTrainingQueue();

  if ($('#stTotal')) $('#stTotal').textContent = stats.n || 0;
  if ($('#stGood')) $('#stGood').textContent = stats.good || 0;
  if ($('#stQueue')) $('#stQueue').textContent = queue.length;

  renderWeakSpots(stats.byTag);
  renderPlayerCard();

  const byModeEl = $('#stByMode');
  if (byModeEl) {
    const byMode = stats.byMode || {};
    const keys = Object.keys(byMode);
    if (!keys.length) {
      byModeEl.innerHTML = '<p class="muted">Тренажёр ещё не использовался.</p>';
    } else {
      let h = '<table><tr><th>Режим</th><th>Всего</th><th>Верно</th><th>Процент</th></tr>';
      for (const k of keys) {
        const d = byMode[k];
        h += `<tr><td>${escapeHtml(modeLabel(k))}</td><td>${d.n}</td><td>${d.good}</td><td>${d.n ? pct(d.good / d.n) : '—'}</td></tr>`;
      }
      byModeEl.innerHTML = h + '</table>';
    }
  }

  const gamesEl = $('#stGames');
  if (gamesEl) {
    if (!history.length) {
      gamesEl.innerHTML = '<p class="muted">Сыгранных партий пока нет.</p>';
    } else {
      const wins = history.filter((g) => g.won).length;
      let h = `<p>Сыграно: ${history.length}, побед: ${wins} (${pct(wins / history.length)}).</p>`;
      h += '<table><tr><th>Дата</th><th>Игроков</th><th>Раундов</th><th>Результат</th><th>Решений</th></tr>';
      h += history.slice(-15).reverse().map((g) =>
        `<tr><td>${new Date(g.ts).toLocaleString('ru')}</td><td>${g.players}</td><td>${g.rounds}</td>` +
        `<td>${g.won ? 'победа' : 'поражение'}</td><td>${g.decisions}</td></tr>`
      ).join('');
      h += '</table>';
      gamesEl.innerHTML = h;
    }
  }
}

/** onReset() — вызывается при «Сбросить всё», чтобы партия забыла память ботов. */
export function setupStats({ onReset, onTrain, onPlayerChange } = {}) {
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
    }
  } catch (e) { }

  const exp = $('#stExport');
  if (exp) exp.onclick = () => {
    const text = serializeBackup(buildBackup((k) => get(k)));
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `perudo-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    msg(`Копия сохранена в файл ${a.download}.`);
  };

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
      if (!confirm(`Заменить данные приложения копией${when}? Текущие статистика, настройки и память ботов будут потеряны.`)) {
        msg('Импорт отменён.');
        return;
      }
      applyBackup(r.data, (k, v) => set(k, v), (k) => {
        try { localStorage.removeItem(k); } catch (e) { }
      });
      try { sessionStorage.setItem('perudo.importNotice', 'Данные восстановлены из копии.'); } catch (e) { }
      location.reload();
    };
  }

  const clr = $('#stClear');
  if (clr) clr.onclick = () => {
    if (!confirm('Сбросить статистику, очередь повторов, историю партий и профиль игрока (имя и аватар)?')) return;
    try {
      ['perudo.settings', 'perudo.userProfile', 'perudo.games',
        'perudo.trainingQueue', 'perudo.duelStats', 'perudo.botMemory', 'perudo.reviews', 'perudo.player'].forEach((k) => localStorage.removeItem(k));
    } catch (e) { }
    onReset?.();
    setStats({ n: 0, good: 0, totalGames: 0, totalWins: 0, byMode: {}, byTag: {}, drill: { A: { n: 0, good: 0 }, B: { n: 0, good: 0 } } });
    setTrainingQueue([]);
    set('perudo.games', []);
    set('perudo.duelStats', { games: 0, wins: 0, moves: 0, dev: 0 });
    resetDuelStats();
    renderStats();
  };
}
