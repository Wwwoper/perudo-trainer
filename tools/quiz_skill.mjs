// tools/quiz_skill.mjs — замер: насколько «читающий» обгоняет лучшую постоянную догадку по каждому виду вопросов.
// Запуск: node tools/quiz_skill.mjs [число учебных раундов, по умолчанию 6000]
import { BUILDERS, gradeQuestion } from '../src/table_quiz.js';
import { readerAnswer } from '../src/quiz_reader.js';
import { simulateRound } from '../src/read_sim.js';
import { QUIZ_TAGS } from '../src/quiz_stats.js';

const N = Number(process.argv[2]) || 6000;
let s = 20261109;
const rnd = () => { s = (s * 48271) % 2147483647; return s / 2147483647; };
const by = {};
for (let seed = 1; seed <= N; seed++) {
  const r = simulateRound(seed);
  if (!r) continue;
  for (const [kind, build] of Object.entries(BUILDERS)) {
    const q = build(r, rnd);
    if (q) (by[kind] ||= []).push({ q, r });
  }
}
console.log('вид                 вопросов  догадка  читающий  запас');
for (const [kind, items] of Object.entries(by)) {
  const max = items.reduce((a, { q }) => a + gradeQuestion(q, null).max, 0);
  const guesses = new Map();
  for (const { q } of items) {
    const gs = q.input === 'number' ? Array.from({ length: 15 }, (_, c) => c) : q.options.map((o) => o.v);
    for (const g of gs) {
      const key = q.input === 'number' || q.input === 'two' ? g : q.options.findIndex((o) => o.v === g);
      guesses.set(key, (guesses.get(key) ?? 0) + gradeQuestion(q, g).points);
    }
  }
  const guess = Math.max(...guesses.values()) / max;
  const read = items.reduce((a, { q, r }) => a + gradeQuestion(q, readerAnswer(q, r)).points, 0) / max;
  console.log(`${(QUIZ_TAGS[kind] ?? kind).padEnd(18)} ${String(items.length).padStart(8)}  ${(guess * 100).toFixed(1).padStart(6)}%  ${(read * 100).toFixed(1).padStart(7)}%  ${((read - guess) * 100).toFixed(1).padStart(+5)} п. п.`);
}
