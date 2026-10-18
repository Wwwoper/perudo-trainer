// backup_reminder.test.js — политика напоминания о резервной копии (src/backup_reminder.js)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  REMIND_FIRST, SNOOZE_GAMES, AFTER_EXPORT_GAMES,
  defaultDeviceState, sanitizeDeviceState, shouldRemind, afterDismiss, afterExport, shouldAskPersistence, MAX_PERSIST_TRIES,
} from '../src/backup_reminder.js';

describe('sanitizeDeviceState', () => {
  it('нет записи или мусор — состояние по умолчанию', () => {
    for (const v of [undefined, null, 5, 'x', [], true]) assert.deepEqual(sanitizeDeviceState(v), defaultDeviceState());
  });
  it('первое напоминание — после пяти партий', () => assert.equal(defaultDeviceState().nextAt, 5));
  it('корректное значение сохраняется', () => {
    assert.deepEqual(sanitizeDeviceState({ nextAt: 25, persistTries: 1 }), { nextAt: 25, persistTries: 1 });
  });
  it('неверные поля заменяются, лишние отбрасываются', () => {
    assert.deepEqual(sanitizeDeviceState({ nextAt: -1, persistTries: 'да', extra: 1 }), { nextAt: REMIND_FIRST, persistTries: 0 });
    assert.deepEqual(sanitizeDeviceState({ nextAt: 1.5 }).nextAt, REMIND_FIRST);
    assert.deepEqual(sanitizeDeviceState({ nextAt: 1e9 }).nextAt, REMIND_FIRST);
  });
});

describe('shouldRemind', () => {
  it('до порога не показываем, на пороге и после — показываем', () => {
    assert.equal(shouldRemind({ games: 4, nextAt: 5 }), false);
    assert.equal(shouldRemind({ games: 5, nextAt: 5 }), true);
    assert.equal(shouldRemind({ games: 12, nextAt: 5 }), true);
  });
  it('копия уже в облаке — не напоминаем', () => {
    assert.equal(shouldRemind({ games: 50, nextAt: 5, cloudConnected: true }), false);
  });
  it('неверные числа — не показываем', () => {
    for (const s of [{ games: NaN, nextAt: 5 }, { games: 5, nextAt: undefined }, { games: -1, nextAt: 0 }, { games: '9', nextAt: 5 }]) {
      assert.equal(shouldRemind(s), false, JSON.stringify(s));
    }
  });
  it('нулевой порог: показываем сразу', () => assert.equal(shouldRemind({ games: 0, nextAt: 0 }), true));
});

describe('после «Позже» и после экспорта', () => {
  it('«Позже» откладывает на 20 партий', () => {
    assert.equal(afterDismiss(7), 7 + SNOOZE_GAMES);
    assert.equal(shouldRemind({ games: 26, nextAt: afterDismiss(7) }), false);
    assert.equal(shouldRemind({ games: 27, nextAt: afterDismiss(7) }), true);
  });
  it('экспорт откладывает на 30 партий', () => {
    assert.equal(afterExport(10), 10 + AFTER_EXPORT_GAMES);
    assert.equal(shouldRemind({ games: 39, nextAt: afterExport(10) }), false);
    assert.equal(shouldRemind({ games: 40, nextAt: afterExport(10) }), true);
  });
  it('неверное число партий считается нулём', () => {
    assert.equal(afterDismiss(undefined), SNOOZE_GAMES);
    assert.equal(afterExport(-3), AFTER_EXPORT_GAMES);
  });
});

describe('shouldAskPersistence', () => {
  it('первый раз — после первой партии, но не до неё', () => {
    assert.equal(shouldAskPersistence({ games: 0, tries: 0 }), false);
    assert.equal(shouldAskPersistence({ games: 1, tries: 0 }), true);
  });
  it('второй раз — только после пятой партии', () => {
    assert.equal(shouldAskPersistence({ games: 4, tries: 1 }), false);
    assert.equal(shouldAskPersistence({ games: 5, tries: 1 }), true);
  });
  it('больше двух раз не просим', () => {
    assert.equal(shouldAskPersistence({ games: 100, tries: MAX_PERSIST_TRIES }), false);
    assert.equal(shouldAskPersistence({ games: 100, tries: 9 }), false);
  });
  it('неверные числа — не просим', () => {
    assert.equal(shouldAskPersistence({ games: NaN, tries: 0 }), false);
    assert.equal(shouldAskPersistence({ games: 3, tries: -1 }), false);
  });
  it('счётчик попыток ограничен при чтении', () => {
    assert.equal(sanitizeDeviceState({ persistTries: 50 }).persistTries, MAX_PERSIST_TRIES);
  });
});
