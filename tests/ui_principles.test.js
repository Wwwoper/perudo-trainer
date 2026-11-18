// Документ «Принципы построения интерфейса»: сквозная нумерация обязательных правил,
// рабочие ссылки «п. N» и подключение документа к остальной документации.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const doc = read('docs/dev/ui-principles.md');

/** Номера обязательных правил: строки «N. **…» внутри блоков «### Обязательно». */
export function mandatoryNumbers(text) {
  const out = [];
  let inBlock = false;
  for (const line of text.split('\n')) {
    if (/^###\s/.test(line)) inBlock = /^###\s+Обязательно\s*$/.test(line);
    else if (/^##\s/.test(line)) inBlock = false;
    const m = inBlock && line.match(/^(\d+)\.\s+\*\*/);
    if (m) out.push(Number(m[1]));
  }
  return out;
}

test('принципы интерфейса: обязательные правила нумеруются подряд с единицы', () => {
  const nums = mandatoryNumbers(doc);
  assert.ok(nums.length >= 20, `правил слишком мало: ${nums.length}`);
  nums.forEach((n, i) => assert.equal(n, i + 1, `после п. ${nums[i - 1]} ожидался п. ${i}, а не п. ${n}`));
});

test('принципы интерфейса: ссылки «п. N» ведут на существующие правила', () => {
  const max = mandatoryNumbers(doc).length;
  const refs = [...doc.matchAll(/(?<!\p{L})п\.\s*(\d+)/gu)].map((m) => Number(m[1]));
  assert.ok(refs.length > 0);
  for (const n of refs) assert.ok(n >= 1 && n <= max, `ссылка на несуществующий п. ${n}`);
});

test('принципы интерфейса: есть чек-лист, исключения и глоссарий', () => {
  for (const h of ['## 9. Проверка интерфейса', '## 10. Исключения', '## Приложение. Термины']) {
    assert.ok(doc.includes(h), `нет раздела «${h}»`);
  }
  for (const term of ['Ставка', 'Не верю!', 'Calza', 'Палифико', 'Стиль', 'Уровень', 'Режим помощи']) {
    assert.ok(doc.includes(`| **${term}** |`), `нет термина «${term}» в глоссарии`);
  }
});

test('принципы интерфейса: документ подключён из README, CONTRIBUTING и design.md', () => {
  assert.match(read('docs/dev/README.md'), /\]\(ui-principles\.md\)/);
  assert.match(read('CONTRIBUTING.md'), /\]\(docs\/dev\/ui-principles\.md\)/);
  assert.match(read('docs/dev/design.md'), /\]\(ui-principles\.md\)/);
});
