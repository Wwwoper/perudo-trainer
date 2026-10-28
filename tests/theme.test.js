// theme.test.js — режимы темы, выбор фактической темы и скрипт ранней установки (theme_boot.js).
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { THEME_MODES, THEMES, DEFAULT_THEME_MODE, THEME_LABELS, sanitizeThemeMode, resolveTheme } from '../src/theme.js';

describe('режимы темы', () => {
  it('три режима, у каждого есть название, режим по умолчанию допустим', () => {
    assert.deepStrictEqual([...THEME_MODES], ['system', 'light', 'dark']);
    assert.deepStrictEqual(Object.keys(THEME_LABELS).sort(), [...THEME_MODES].sort());
    assert.ok(THEME_MODES.includes(DEFAULT_THEME_MODE));
  });
  it('мусор заменяется режимом по умолчанию', () => {
    for (const bad of [null, undefined, '', 'Light', 'auto', 5, {}, [], true]) assert.strictEqual(sanitizeThemeMode(bad), DEFAULT_THEME_MODE, String(bad));
    for (const ok of THEME_MODES) assert.strictEqual(sanitizeThemeMode(ok), ok);
  });
});

describe('resolveTheme', () => {
  it('явный выбор не зависит от системы', () => {
    for (const sys of [true, false, null, undefined]) {
      assert.strictEqual(resolveTheme('light', sys), 'light');
      assert.strictEqual(resolveTheme('dark', sys), 'dark');
    }
  });
  it('«Системная» следует системе, а без сведений о ней — светлая (как по умолчанию)', () => {
    assert.strictEqual(resolveTheme('system', true), 'dark');
    assert.strictEqual(resolveTheme('system', false), 'light');
    assert.strictEqual(resolveTheme('system', null), 'light');
    assert.strictEqual(resolveTheme('system', undefined), 'light');
  });
  it('всегда возвращает одну из двух тем, даже при мусоре', () => {
    for (const mode of [null, 'x', 7, 'system', 'light', 'dark']) {
      for (const sys of [true, false, null, 'да']) assert.ok(THEMES.includes(resolveTheme(mode, sys)));
    }
  });
});

describe('theme_boot.js: правила совпадают с theme.js', () => {
  const code = readFileSync(new URL('../src/theme_boot.js', import.meta.url), 'utf8');

  /** Запускает скрипт в «странице» с заданным хранилищем и системной темой; возвращает data-theme. */
  function boot({ settings, systemDark = null, storageBroken = false, noMatchMedia = false }) {
    const attrs = {};
    const root = { setAttribute: (k, v) => { attrs[k] = v; } };
    const storage = {
      getItem: (k) => {
        if (storageBroken) throw new Error('нет доступа');
        return k === 'perudo.settings' && settings !== undefined ? settings : null;
      },
    };
    const mm = (q) => ({ matches: systemDark === true && q.includes('dark') });
    const window = { localStorage: storage, matchMedia: noMatchMedia || systemDark === null ? undefined : mm };
    vm.runInNewContext(code, { window, document: { documentElement: root } });
    return attrs['data-theme'];
  }
  const withTheme = (t) => JSON.stringify({ theme: t });

  it('без сохранённого выбора — режим по умолчанию', () => {
    assert.strictEqual(boot({}), resolveTheme(DEFAULT_THEME_MODE, null));
  });
  it('для всех режимов и состояний системы результат тот же, что у resolveTheme', () => {
    for (const mode of THEME_MODES) {
      for (const sys of [true, false, null]) {
        assert.strictEqual(boot({ settings: withTheme(mode), systemDark: sys }), resolveTheme(mode, sys), `${mode}/${sys}`);
      }
    }
  });
  it('мусор в хранилище и недоступное хранилище не ломают загрузку', () => {
    for (const settings of ['{oops', 'null', '[]', '5', withTheme('purple'), withTheme(7), JSON.stringify({ theme: null })]) {
      assert.strictEqual(boot({ settings }), resolveTheme(DEFAULT_THEME_MODE, null), settings);
    }
    assert.strictEqual(boot({ storageBroken: true }), resolveTheme(DEFAULT_THEME_MODE, null));
  });
  it('режим «Системная» без matchMedia — светлая', () => {
    assert.strictEqual(boot({ settings: withTheme('system'), noMatchMedia: true }), 'light');
  });
  it('режим по умолчанию в скрипте тот же, что в theme.js', () => {
    assert.match(code, new RegExp(`DEFAULT_MODE = '${DEFAULT_THEME_MODE}'`));
  });
});

import { describeThemeMode } from '../src/theme.js';

describe('describeThemeMode', () => {
  it('явные режимы и «Системная» с разными сведениями о системе', () => {
    assert.match(describeThemeMode('light', true), /Светлая.*всегда/);
    assert.match(describeThemeMode('dark', false), /Тёмная.*всегда/);
    assert.match(describeThemeMode('system', true), /тёмная/);
    assert.match(describeThemeMode('system', false), /светлая/);
    assert.match(describeThemeMode('system', null), /не сообщает.*светлая/);
    assert.strictEqual(DEFAULT_THEME_MODE, 'light');
  });
  it('мусор не ломает: берётся режим по умолчанию', () => {
    assert.strictEqual(typeof describeThemeMode(undefined, undefined), 'string');
    assert.strictEqual(describeThemeMode('x', true), describeThemeMode(DEFAULT_THEME_MODE, true));
  });
});
