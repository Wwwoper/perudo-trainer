// strategy_evidence.test.js — запускает Python-тесты доказательной базы тренера (tools/strategy_evidence.py).
// Без python3 тест пропускается, как и tests/emulators.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const probe = spawnSync('python3', ['--version'], { encoding: 'utf8' });
const skip = probe.error || probe.status !== 0 ? 'python3 недоступен' : false;

test('доказательная база тренера: Python-тесты tools/strategy_evidence.py проходят', { skip }, () => {
  const r = spawnSync('python3', ['-m', 'unittest', 'tests.test_strategy_evidence'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});
