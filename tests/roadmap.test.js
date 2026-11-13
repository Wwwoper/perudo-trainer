// roadmap.test.js — docs/dev/roadmap.md: чек-лист плана не расходится сам с собой.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const text = readFileSync(new URL('docs/dev/roadmap.md', root), 'utf8');
const lines = text.split('\n');

const ITEM = /^- \[( |x)\] \*\*([A-Z]+\d*-\d{2})\*\* · (S|M|L) · (.+?) — (.+?) Патч: (—|\d{1,4})$/;
const itemLines = lines.filter((l) => /^- \[[ x]\] /.test(l));
const items = itemLines.map((l) => ({ line: l, m: l.match(ITEM) }));

describe('roadmap.md', () => {
  it('в плане есть пункты, и каждая строка пункта в одном формате', () => {
    assert.ok(items.length > 0);
    for (const { line, m } of items) assert.ok(m, `строка не в формате плана: ${line}`);
  });

  it('ID не повторяются, префикс соответствует разделу', () => {
    const ids = items.map((x) => x.m[2]);
    assert.equal(new Set(ids).size, ids.length, 'есть повторяющиеся ID');
    let section = '';
    const want = { 'Волна 0': 'W0', 'Волна 1': 'W1', 'Волна 2': 'W2', 'Волна 3': 'W3', 'Волна 4': 'W4', 'Волна 5': 'W5', 'Волна 6': 'W6', 'Волна 7': 'W7', 'Волна 8': 'W8', 'Волна 9': 'W9', 'Волна 10': 'W10', 'Волна 11': 'W11', 'Волна 12': 'W12', 'Релизы': 'R' };
    for (const l of lines) {
      const h = l.match(/^## (Волна \d+|Релизы)/);
      if (h) { section = h[1]; continue; }
      const it = l.match(/^- \[[ x]\] \*\*([A-Z]+\d*)-/);
      if (it && section) assert.equal(it[1], want[section], `${l}: пункт не в своём разделе`);
    }
  });

  it('выполненный пункт имеет номер патча, невыполненный — прочерк', () => {
    for (const { line, m } of items) {
      const done = m[1] === 'x';
      assert.equal(m[6] !== '—', done, `отметка и поле «Патч» не согласованы: ${line}`);
      if (done) assert.ok(Number(m[6]) >= 100, `странный номер патча: ${line}`);
    }
  });

  it('номера патчей у выполненных пунктов не возрастают назад по ID внутри волны', () => {
    const byWave = {};
    for (const { m } of items) {
      if (m[1] !== 'x') continue;
      const wave = m[2].split('-')[0];
      (byWave[wave] ||= []).push(Number(m[6]));
    }
    for (const [wave, nums] of Object.entries(byWave)) {
      for (let i = 1; i < nums.length; i++) assert.ok(nums[i] >= nums[i - 1], `${wave}: патчи идут не по порядку пунктов`);
    }
  });

  it('счётчик «Выполнено: X из Y» совпадает со списком', () => {
    const m = text.match(/^Выполнено: (\d+) из (\d+)$/m);
    assert.ok(m, 'нет строки «Выполнено: X из Y»');
    const done = items.filter((x) => x.m[1] === 'x').length;
    assert.equal(Number(m[1]), done);
    assert.equal(Number(m[2]), items.length);
  });

  it('ссылки на замечания отчёта UX-01…UX-17 корректны', () => {
    const refs = [...text.matchAll(/UX-(\d{2})/g)].map((x) => Number(x[1]));
    assert.ok(refs.length > 0);
    for (const n of refs) assert.ok(n >= 1 && n <= 17, `нет замечания UX-${String(n).padStart(2, '0')}`);
  });

  it('есть разделы «Отложено и почему» и инструкция, как вести файл', () => {
    assert.match(text, /^## Отложено и почему$/m);
    assert.match(text, /Как вести файл/);
  });

  it('оглавление docs/dev ссылается на план', () => {
    assert.match(readFileSync(new URL('docs/dev/README.md', root), 'utf8'), /\(roadmap\.md\)/);
  });
});
