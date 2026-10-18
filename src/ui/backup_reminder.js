// src/ui/backup_reminder.js — напоминание про резервную копию в итоге партии.

import { getStats, getDeviceState, setDeviceState } from '../storage.js';
import { shouldRemind, afterDismiss, afterExport } from '../backup_reminder.js';
import { $ } from './common.js';

const gamesPlayed = () => getStats().totalGames || 0;

/** HTML напоминания или пустая строка, если показывать рано (или уже не нужно). */
export function backupReminderHtml(cloudConnected = false) {
  const games = gamesPlayed();
  if (!shouldRemind({ games, nextAt: getDeviceState().nextAt, cloudConnected })) return '';
  return '<div class="backup-reminder">' +
    `<p>Вы сыграли партий: ${games}. Сохраните копию данных в файл: браузер может удалить данные сайта.</p>` +
    '<div class="backup-reminder-actions">' +
    '<button type="button" data-backup-save>Сохранить копию</button>' +
    '<button type="button" data-backup-later>Позже</button>' +
    '</div></div>';
}

/** Копия сохранена (из итога партии или из «Статистики»): напоминать пока не нужно. */
export function markBackupExported() {
  setDeviceState({ ...getDeviceState(), nextAt: afterExport(gamesPlayed()) });
}

/**
 * Кнопки напоминания внутри итога партии.
 * @param {() => void} save скачивает копию (та же, что «Экспорт JSON»)
 */
export function setupBackupReminder(save) {
  $('#gResultCard')?.addEventListener('click', (e) => {
    const box = e.target.closest('.backup-reminder');
    if (!box) return;
    if (e.target.closest('[data-backup-save]')) {
      save();                                   // save() сам откладывает следующее напоминание
      box.innerHTML = '<p class="text-ok">Копия сохранена в файл.</p>';
    } else if (e.target.closest('[data-backup-later]')) {
      setDeviceState({ ...getDeviceState(), nextAt: afterDismiss(gamesPlayed()) });
      box.remove();
    }
  });
}
