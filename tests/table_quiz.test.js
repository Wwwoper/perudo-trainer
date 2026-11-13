import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLastTrue, gradeQuestion, faceGlyph, KIND_LAST_TRUE } from '../src/table_quiz.js';
import { simulateRound } from '../src/read_sim.js';

const round = (over = {}, endOver = {}) => ({
  id: 'x1', ts: 0, round: 1, wild: true, me: 0,
  dice: [2, 2, 2], styles: [null, 'smart', 'smart'],
  hands: [[3, 4], [4, 1], [2, 6]],
  bids: [{ s: 1, q: 2, f: 4 }, { s: 2, q: 3, f: 4 }],
  end: { kind: 'dudo', by: 0, bidder: 2, actual: 3, ok: true, ...endOver },
  ...over,
});

test('faceGlyph: грань превращается в символ кубика', () => {
  assert.equal(faceGlyph(4), '⚃');
  assert.equal(faceGlyph(6), '⚅');
});

test('buildLastTrue: верная ставка → ответ «yes», пояснение с числами', () => {
  const q = buildLastTrue(round());
  assert.equal(q.kind, KIND_LAST_TRUE);
  assert.equal(q.input, 'two');
  assert.equal(q.answer, 'yes');
  assert.deepEqual(q.options.map((o) => o.v), ['yes', 'no']);
  assert.match(q.title, /3 × ⚃/);
  assert.equal(q.explain, 'На столе было 3 × ⚃ из 3.');
  assert.doesNotMatch(q.explain, /джокер/);   // про единицы сказано один раз, в шапке стола
});

test('buildLastTrue: короткий вопрос с формой имени, без слов «Её проверили»', () => {
  const q = buildLastTrue(round());
  assert.match(q.title, /^Верна ли ставка [А-Яа-яё]+ — \d+ × [⚀-⚅]\?$/);   // знак вопроса сразу после кубика, без лишней точки
  assert.ok(!/проверили|Она верна/.test(q.title));
  assert.deepEqual(q.options.map((o) => o.label), ['Верна', 'Не верна']);
});

test('buildLastTrue: неверная ставка → «no»', () => {
  const q = buildLastTrue(round({}, { actual: 2, ok: false }));
  assert.equal(q.answer, 'no');
  assert.equal(q.explain, 'На столе было 2 × ⚃ из 3: ставки не хватило.');
});

test('buildLastTrue: слов про джокеров в пояснении нет и при Палифико', () => {
  const q = buildLastTrue(round({ wild: false }));
  assert.doesNotMatch(q.explain, /джокер/);
});

test('buildLastTrue: не годятся Calza, своя последняя ставка и пустой раунд', () => {
  assert.equal(buildLastTrue(round({}, { kind: 'calza' })), null);
  assert.equal(buildLastTrue(round({ bids: [{ s: 1, q: 2, f: 4 }, { s: 0, q: 3, f: 4 }] })), null);
  assert.equal(buildLastTrue(round({ bids: [] })), null);
  assert.equal(buildLastTrue(null), null);
});

test('gradeQuestion: совпадение с ответом даёт балл', () => {
  const q = buildLastTrue(round());
  assert.deepEqual(gradeQuestion(q, 'yes'), { ok: true, points: 1, max: 1 });
  assert.deepEqual(gradeQuestion(q, 'no'), { ok: false, points: 0, max: 1 });
  assert.deepEqual(gradeQuestion(null, 'yes'), { ok: false, points: 0, max: 1 });
});

test('баланс: на учебных столах самый частый ответ не больше 55 %', () => {
  const count = { yes: 0, no: 0 };
  for (let seed = 1; seed <= 4000; seed++) {
    const r = simulateRound(seed);
    const q = r && buildLastTrue(r);
    if (q) count[q.answer]++;
  }
  const n = count.yes + count.no;
  assert.ok(n >= 1500, `мало вопросов: ${n}`);
  assert.ok(Math.max(count.yes, count.no) / n <= 0.55, JSON.stringify(count));
});

// ───── «Какая ставка самая слабая?» ─────
import { buildWeakestBid, KIND_WEAKEST_BID, WEAK_CHOICES } from '../src/table_quiz.js';
import { GENITIVE } from '../src/names_ru.js';

const weakRound = (over = {}) => ({
  id: 'w1', ts: 0, round: 1, wild: true, me: 0,
  dice: [2, 2, 2, 2], styles: [null, 'smart', 'smart', 'smart'],
  hands: [[3, 3], [5, 5], [6, 2], [4, 1]],
  bids: [{ s: 1, q: 2, f: 5 }, { s: 2, q: 2, f: 6 }, { s: 3, q: 3, f: 4 }],
  end: { kind: 'dudo', by: 0, bidder: 3, actual: 1, ok: false },
  ...over,
});
const mid = () => 0.3;

test('buildWeakestBid: слабая ставка — где у игрока меньше всего нужных кубиков', () => {
  // Ирина: 2 из 2 (⚄⚄), Алексей: 1 из 2 (⚅), Юлия: 2 из 2 (⚃ и джокер) → ровно одна слабая
  const q = buildWeakestBid(weakRound(), mid);
  assert.equal(q.kind, KIND_WEAKEST_BID);
  assert.equal(q.input, 'bid');
  assert.equal(q.options.length, WEAK_CHOICES);
  assert.deepEqual(q.options.map((o) => o.n), [1, 2, 3]);
  assert.equal(q.answer, '2');
  assert.match(q.lines[0], /^Минимум был у .+\.$/);
  assert.match(q.lines[1], /^Ставка 1 · .+ — 2 из 2 ⚄$/);
  assert.match(q.lines[2], /^Ставка 2 · .+ — 1 из 2 ⚅$/);
  assert.equal(q.lines.length, 4);
  assert.equal(q.short, 'При какой ставке меньше всего нужных кубиков?');
  assert.match(q.title, /^При какой ставке меньше всего нужных кубиков в руке игрока\?$/);
  assert.ok(!/автор/i.test(q.title + q.explain));
  assert.ok(q.options.every((o) => /× [⚀-⚅]$/.test(o.label)));
});

test('buildWeakestBid: если минимум не один — вопрос не задаётся', () => {
  const r = weakRound({ hands: [[3, 3], [5, 5], [5, 5], [3, 2]], bids: [{ s: 1, q: 2, f: 5 }, { s: 2, q: 2, f: 6 }, { s: 3, q: 2, f: 6 }] });
  // у Ирины 2, у Алексея 0, у Юлии 0 → два минимума (Алексей и Юлия)
  assert.equal(buildWeakestBid(r, mid), null);
});

test('buildWeakestBid: ваши ставки и раунды с малым числом ставок не годятся', () => {
  assert.equal(buildWeakestBid(weakRound({ bids: [{ s: 1, q: 2, f: 5 }, { s: 0, q: 2, f: 6 }, { s: 3, q: 3, f: 4 }] }), mid), null);
  assert.equal(buildWeakestBid(weakRound({ bids: [] }), mid), null);
  assert.equal(buildWeakestBid(null, mid), null);
});

test('buildWeakestBid: ответ проверяется как обычный выбор', () => {
  const q = buildWeakestBid(weakRound(), mid);
  assert.equal(gradeQuestion(q, '2').ok, true);
  assert.equal(gradeQuestion(q, '1').ok, false);
});

test('баланс «самой слабой»: позиция ответа и «самая крупная ставка» не дают больше 55 %', () => {
  const pos = [0, 0, 0];
  let biggest = 0;
  let n = 0;
  let seq = 7;
  const rnd = () => { seq = (seq * 48271) % 2147483647; return seq / 2147483647; };
  for (let seed = 1; seed <= 4000; seed++) {
    const r = simulateRound(seed);
    const q = r && buildWeakestBid(r, rnd);
    if (!q) continue;
    n++;
    pos[q.options.findIndex((o) => o.v === q.answer)]++;
    const big = q.options.reduce((a, o) => (o.q > a.q ? o : a), q.options[0]);
    if (q.options.filter((o) => o.q === big.q).length === 1 && big.v === q.answer) biggest++;
  }
  assert.ok(n >= 400, `мало вопросов: ${n}`);
  assert.ok(Math.max(...pos) / n <= 0.55, JSON.stringify(pos));
  assert.ok(biggest / n <= 0.55, `самая крупная ставка угадывает ${biggest}/${n}`);
});

// ───── «У кого больше кубиков со своей цифрой?» ─────
import { buildWhoHoldsMore, KIND_WHO_HOLDS_MORE } from '../src/table_quiz.js';

const holdRound = (over = {}) => ({
  id: 'h1', ts: 0, round: 1, wild: true, me: 0,
  dice: [2, 3, 3, 3], styles: [null, 'smart', 'smart', 'smart'],
  hands: [[3, 3], [5, 5, 2], [6, 2, 3], [4, 1, 2]],
  bids: [{ s: 1, q: 2, f: 5 }, { s: 2, q: 3, f: 6 }, { s: 3, q: 3, f: 4 }],
  end: { kind: 'dudo', by: 0, bidder: 3, actual: 1, ok: false },
  ...over,
});

test('buildWhoHoldsMore: побеждает игрок с большим числом кубиков своей цифры', () => {
  // у Ирины ⚄⚄ = 2, у Алексея ⚅ = 1, у Юлии ⚃ и джокер = 2
  const q = buildWhoHoldsMore(holdRound(), () => 0);
  assert.equal(q.kind, KIND_WHO_HOLDS_MORE);
  assert.equal(q.input, 'player');
  assert.equal(q.options.length, 2);
  assert.equal(q.answer, '1');
  assert.deepEqual(q.options.map((o) => o.v), ['1', '2']);
  assert.match(q.explain, /2 × ⚄.*1 × ⚅/);
  assert.equal(gradeQuestion(q, '1').ok, true);
  assert.equal(gradeQuestion(q, '2').ok, false);
});

test('buildWhoHoldsMore: берётся последняя ставка игрока, ничьи и разные размеры рук отбрасываются', () => {
  const r = holdRound({ bids: [{ s: 1, q: 1, f: 3 }, { s: 2, q: 3, f: 6 }, { s: 1, q: 2, f: 5 }] });
  const q = buildWhoHoldsMore(r, () => 0);
  assert.equal(q.options[0].f, 5);                       // не ⚂, а последняя ставка Ирины
  const tie = holdRound({ hands: [[3, 3], [5, 5, 2], [6, 6, 3], [4, 1, 2]], bids: [{ s: 1, q: 2, f: 5 }, { s: 2, q: 2, f: 6 }] });
  assert.equal(buildWhoHoldsMore(tie, () => 0), null);   // 2 против 2
  const sizes = holdRound({ dice: [2, 3, 2, 3], hands: [[3, 3], [5, 5, 2], [6, 6], [4, 1, 2]], bids: [{ s: 1, q: 2, f: 5 }, { s: 2, q: 2, f: 6 }] });
  assert.equal(buildWhoHoldsMore(sizes, () => 0), null); // 3 и 2 кубика в руке
});

test('buildWhoHoldsMore: нужны двое чужих игроков; ваши ставки не берутся', () => {
  assert.equal(buildWhoHoldsMore(holdRound({ bids: [{ s: 1, q: 2, f: 5 }, { s: 0, q: 3, f: 3 }] }), () => 0), null);
  assert.equal(buildWhoHoldsMore(holdRound({ bids: [] }), () => 0), null);
  assert.equal(buildWhoHoldsMore(null), null);
});

test('баланс «у кого больше»: позиция ответа ≤ 55 %, размер руки ничего не подсказывает', () => {
  const pos = [0, 0];
  let n = 0;
  let seq = 11;
  const rnd = () => { seq = (seq * 48271) % 2147483647; return seq / 2147483647; };
  for (let seed = 1; seed <= 6000; seed++) {
    const r = simulateRound(seed);
    const q = r && buildWhoHoldsMore(r, rnd);
    if (!q) continue;
    n++;
    pos[q.options.findIndex((o) => o.v === q.answer)]++;
    assert.equal(r.hands[q.options[0].s].length, r.hands[q.options[1].s].length);
  }
  assert.ok(n >= 600, `мало вопросов: ${n}`);
  assert.ok(Math.max(...pos) / n <= 0.55, JSON.stringify(pos));
});

// ───── «Сколько всего кубиков цифры на столе?» ─────
import { buildCountFace, KIND_COUNT_FACE } from '../src/table_quiz.js';

const cntRound = (over = {}) => ({
  id: 'c1', ts: 0, round: 1, wild: true, me: 0,
  dice: [4, 3, 5], styles: [null, 'smart', 'smart'],
  hands: [[3, 3, 4, 5], [6, 4, 1], [4, 4, 1, 6, 2]],
  bids: [{ s: 1, q: 3, f: 4 }, { s: 2, q: 5, f: 4 }],
  end: { kind: 'dudo', by: 0, bidder: 2, actual: 6, ok: true },
  ...over,
});

test('buildCountFace: считает кубики цифры на всём столе вместе с джокерами (в тексте их не повторяем)', () => {
  const q = buildCountFace(cntRound(), () => 0);
  assert.equal(q.kind, KIND_COUNT_FACE);
  assert.equal(q.input, 'number');
  assert.equal(q.face, 4);
  assert.equal(q.answer, 6);                       // ⚃: 1 + 1 + 2 и две единицы
  assert.deepEqual(q.range, { min: 0, max: 12 });
  assert.equal('start' in q, false);               // счётчик начинается с нуля, стартового числа нет
  assert.equal(q.title, 'Сколько всего ⚃ на столе?');
  assert.match(q.explain, /6 × ⚃/);
});

test('buildCountFace: единицы и Палифико — без джокеров', () => {
  const pal = buildCountFace(cntRound({ wild: false }), () => 0);
  assert.equal(pal.answer, 4);
  assert.doesNotMatch(pal.title, /джокер/);
  const ones = buildCountFace(cntRound({ bids: [{ s: 1, q: 2, f: 1 }] }), () => 0);
  assert.equal(ones.face, 1);
  assert.equal(ones.answer, 2);                    // единицы сами джокеров не имеют
});

test('buildCountFace: без ставок или рук вопрос не задаётся', () => {
  assert.equal(buildCountFace(cntRound({ bids: [] })), null);
  assert.equal(buildCountFace(null), null);
});

test('gradeQuestion для числа: 2 балла точно, 1 балл с ошибкой на кубик, иначе 0', () => {
  const q = buildCountFace(cntRound(), () => 0);
  assert.deepEqual(gradeQuestion(q, 6), { ok: true, points: 2, max: 2 });
  assert.deepEqual(gradeQuestion(q, '5'), { ok: false, points: 1, max: 2 });
  assert.deepEqual(gradeQuestion(q, 7), { ok: false, points: 1, max: 2 });
  assert.deepEqual(gradeQuestion(q, 3), { ok: false, points: 0, max: 2 });
  assert.deepEqual(gradeQuestion(q, ''), { ok: false, points: 0, max: 2 });
  assert.deepEqual(gradeQuestion(q, null), { ok: false, points: 0, max: 2 });
});

test('баланс «сколько на столе»: лучшая постоянная догадка берёт не больше 55 % баллов', () => {
  const qs = [];
  let seq = 7;
  const rnd = () => { seq = (seq * 48271) % 2147483647; return seq / 2147483647; };
  for (let seed = 1; seed <= 4000; seed++) {
    const r = simulateRound(seed);
    const q = r && buildCountFace(r, rnd);
    if (q) qs.push(q);
  }
  assert.ok(qs.length >= 1500);
  let best = 0;
  for (let c = 0; c <= 14; c++) {
    best = Math.max(best, qs.reduce((a, q) => a + gradeQuestion(q, c).points, 0) / (qs.length * 2));
  }
  assert.ok(best <= 0.55, `постоянная догадка берёт ${(best * 100).toFixed(1)} %`);
});

// ───── Подбор вопросов на стол ─────
import { pickTableQuestions, canQuiz, PER_TABLE, MAX_PER_KIND } from '../src/table_quiz.js';

const lcg = (seed) => { let s = seed; return () => { s = (s * 48271) % 2147483647; return s / 2147483647; }; };

test('pickTableQuestions: нужные виды, не больше двух одного вида, без повторов', () => {
  let full = 0;
  let total = 0;
  for (let seed = 1; seed <= 600; seed++) {
    const r = simulateRound(seed);
    if (!r) continue;
    total++;
    const qs = pickTableQuestions(r, { rnd: lcg(seed) });
    assert.ok(qs.length <= PER_TABLE);
    const byKind = {};
    for (const q of qs) byKind[q.kind] = (byKind[q.kind] || 0) + 1;
    assert.ok(Object.values(byKind).every((c) => c <= MAX_PER_KIND), JSON.stringify(byKind));
    assert.equal(new Set(qs.map((q) => q.title)).size, qs.length);
    if (qs.length === PER_TABLE) full++;
  }
  assert.ok(full / total >= 0.25, `полных столов ${full} из ${total}`);
});

test('pickTableQuestions: одно зерно — тот же набор; другое зерно — чаще всего другой', () => {
  const r = simulateRound(5);
  const a = pickTableQuestions(r, { rnd: lcg(1) }).map((q) => q.title);
  const b = pickTableQuestions(r, { rnd: lcg(1) }).map((q) => q.title);
  assert.deepEqual(a, b);
  const others = new Set();
  for (let k = 2; k < 30; k++) others.add(pickTableQuestions(r, { rnd: lcg(k) }).map((q) => q.title).join('|'));
  assert.ok(others.size > 1);
});

test('pickTableQuestions: ограничения count и maxPerKind; пустой раунд даёт пустой набор', () => {
  const r = simulateRound(5);
  assert.ok(pickTableQuestions(r, { rnd: lcg(3), count: 2 }).length <= 2);
  assert.equal(pickTableQuestions({ bids: [], hands: [] }, { rnd: lcg(3) }).length, 0);
  assert.equal(pickTableQuestions(null, { rnd: lcg(3) }).length, 0);
  const one = pickTableQuestions(r, { rnd: lcg(4), maxPerKind: 1 });
  assert.equal(new Set(one.map((q) => q.kind)).size, one.length);
});

test('canQuiz: целый стол есть не у каждого раунда', () => {
  let yes = 0;
  let no = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const r = simulateRound(seed);
    if (!r) continue;
    canQuiz(r, { rnd: lcg(seed) }) ? yes++ : no++;
  }
  assert.ok(yes > 0 && no > 0);
});

test('у каждого вопроса есть короткая подпись для разбора стола', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    const r = simulateRound(seed);
    for (const q of r ? pickTableQuestions(r, { rnd: lcg(seed) }) : []) {
      assert.ok(typeof q.short === 'string' && q.short.length > 0 && q.short.length < 50, `${q.kind}: ${q.short}`);
      seen.add(q.kind);
    }
  }
  assert.equal(seen.size, 4);
});

test('pickTableQuestions: виды чередуются, один вид не занимает полстола без нужды', () => {
  const counts = { lastTrue: 0, weakestBid: 0, whoHoldsMore: 0, countFace: 0 };
  for (let seed = 1; seed <= 1500; seed++) {
    const r = simulateRound(seed);
    if (!r) continue;
    const qs = pickTableQuestions(r, { rnd: lcg(seed) });
    if (qs.length < PER_TABLE) continue;
    for (const q of qs) counts[q.kind]++;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  assert.ok(counts.countFace / total <= 0.45, JSON.stringify(counts));   // раньше было около 50 %
  assert.ok(Object.values(counts).every((c) => c > 0), JSON.stringify(counts));
});

import { youSaid } from '../src/table_quiz.js';

test('youSaid: ответ игрока для каждого вида вопроса', () => {
  const two = buildLastTrue(round());
  assert.equal(youSaid(two, 'no'), 'Вы ответили: не верна');
  assert.equal(youSaid(two, 'yes'), 'Вы ответили: верна');
  const weak = buildWeakestBid(weakRound(), mid);
  assert.equal(youSaid(weak, '1'), `Вы выбрали: ${weak.options[0].label}`);
  const hold = buildWhoHoldsMore(weakRound({ hands: [[3, 3], [5, 5], [6, 2], [4, 1]] }), () => 0);
  if (hold) assert.match(youSaid(hold, hold.options[0].v), /^Вы выбрали: .+ \([⚀-⚅]\)$/);
  const cnt = buildCountFace(round(), () => 0);
  assert.equal(youSaid(cnt, 4), `Вы сказали: 4 × ${faceGlyph(cnt.face)}`);
  assert.equal(youSaid(cnt, '3'), `Вы сказали: 3 × ${faceGlyph(cnt.face)}`);
});

test('youSaid: без ответа и с чужим значением — null', () => {
  const two = buildLastTrue(round());
  for (const v of [undefined, null, '', 'maybe']) assert.equal(youSaid(two, v), null);
  assert.equal(youSaid(null, 'yes'), null);
  assert.equal(youSaid(buildCountFace(round(), () => 0), 'abc'), null);
});

test('у каждого вопроса есть строки разбора, а explain — их склейка; слов «автор» нет', () => {
  const qs = [buildLastTrue(round()), buildWeakestBid(weakRound(), mid), buildCountFace(round(), () => 0)];
  for (const q of qs) {
    assert.ok(Array.isArray(q.lines) && q.lines.length > 0, q.kind);
    assert.equal(q.explain, q.lines.join(' '));
    assert.ok(!/автор/i.test(q.explain), q.explain);
  }
  assert.match(buildCountFace(round(), () => 0).explain, /^На столе было \d+ × [⚀-⚅]: Вы — \d+/);
  assert.match(buildCountFace(round(), () => 0).short, /\?$/);
});

test('«Минимум был у…» и «Больше у…» — имя в родительном падеже', () => {
  const weak = buildWeakestBid(weakRound(), mid);
  assert.ok(Object.values(GENITIVE).some((g) => weak.lines[0] === `Минимум был у ${g}.`), weak.lines[0]);
  const hold = buildWhoHoldsMore(weakRound({ hands: [[3, 3], [5, 5], [6, 2], [4, 1]] }), () => 0);
  if (hold) assert.ok(Object.values(GENITIVE).some((g) => hold.lines[0] === `Больше у ${g}.`), hold.lines[0]);
});

test('buildLastTrue: запас над ставкой — «при ставке N»', () => {
  const q = buildLastTrue(round({}, { actual: 5 }));
  assert.equal(q.answer, 'yes');
  assert.equal(q.explain, 'На столе было 5 × ⚃ при ставке 3.');
});

test('linesOk: при верном ответе пояснение не повторяет ответ', () => {
  const weak = buildWeakestBid(weakRound(), mid);
  assert.ok(weak.linesOk.length === weak.lines.length - 1);
  assert.ok(weak.linesOk.every((l) => !/^Минимум был/.test(l)));
  const cnt = buildCountFace(round(), () => 0);
  assert.match(cnt.linesOk[0], /^По рукам: Вы — \d+/);
  assert.ok(!cnt.linesOk[0].includes(`${cnt.answer} × `));
  const hold = buildWhoHoldsMore(weakRound({ hands: [[3, 3], [5, 5], [6, 2], [4, 1]] }), () => 0);
  if (hold) { assert.equal(hold.linesOk.length, 1); assert.match(hold.linesOk[0], /^В руках: /); }
});

test('buildWhoHoldsMore: вопрос и подсказка про «свою цифру» — отдельные поля', () => {
  const q = buildWhoHoldsMore(weakRound({ hands: [[3, 3], [5, 5], [6, 2], [4, 1]] }), () => 0);
  if (!q) return;
  assert.match(q.title, /^Кто держит больше своей цифры: .+ или .+\?$/);
  assert.ok(!q.title.includes('Своя цифра'));
  assert.equal(q.hint, 'Своя цифра — из последней ставки игрока.');
});
