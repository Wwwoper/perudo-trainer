// ci.test.js — проверка проверки: workflow GitHub Actions ссылается на то, что есть в проекте.
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const wf = read('.github/workflows/test.yml');
const pkg = JSON.parse(read('package.json'));

describe('workflow .github/workflows/test.yml', () => {
  it('содержит три задания: логика, сценарии в браузере, вёрстка', () => {
    const jobs = [...wf.matchAll(/^  ([a-z0-9_-]+):\s*$/gm)].map((m) => m[1]);
    for (const j of ['unit', 'e2e', 'layout']) assert.ok(jobs.includes(j), `нет задания ${j}`);
  });
  it('запускается на push в main и на pull request', () => {
    assert.match(wf, /push:\s*\n\s*branches:\s*\[main\]/);
    assert.match(wf, /\n  pull_request:/);
  });
  it('каждый «npm run X» ссылается на существующий скрипт', () => {
    const used = [...wf.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1]);
    assert.ok(used.length > 0);
    for (const name of used) assert.ok(pkg.scripts[name], `в package.json нет скрипта «${name}»`);
    if (/run: npm test\b/.test(wf)) assert.ok(pkg.scripts.test);
  });
  it('модули Python-тестов существуют, зависимости перечислены в requirements-test.txt', () => {
    const mods = [...wf.matchAll(/python -m unittest ([\w. ]+)/g)].flatMap((m) => m[1].trim().split(/\s+/));
    assert.ok(mods.length >= 2);
    for (const mod of mods) assert.ok(existsSync(new URL(`${mod.replaceAll('.', '/')}.py`, root)), `нет файла для ${mod}`);
    const req = read('requirements-test.txt');
    assert.match(req, /^playwright/m);
    assert.match(req, /^Pillow/m);
    assert.match(wf, /pip install -r requirements-test\.txt/);
  });
  it('браузер ставится в обоих заданиях с браузером; у заданий есть таймаут', () => {
    assert.match(wf, /npx playwright install --with-deps chromium/);
    assert.match(wf, /python -m playwright install --with-deps chromium/);
    assert.strictEqual((wf.match(/timeout-minutes:/g) || []).length, 3);
  });
  it('используются только проверенные версии действий (актуальные мажорные)', () => {
    const acts = [...wf.matchAll(/uses: ([\w./-]+)@(v\d+)/g)].map((m) => `${m[1]}@${m[2]}`);
    assert.ok(acts.length >= 6);
    assert.ok(!/uses: [\w./-]+@(main|master|latest)\b/.test(wf));
  });
});
