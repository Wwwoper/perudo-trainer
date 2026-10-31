// saved_game.test.js — снимок незавершённой партии: сохранение, строгая проверка, хранилище.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

const mem = {};
global.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: (k) => { delete mem[k]; },
};

const { createGame, startGame, applyAction, getLegalActions } = await import('../src/engine.js');
const { generateCharacters } = await import('../src/bots.js');
const {
  makeSnapshot, restoreSnapshot, sanitizeGame, safeHtml, describeSnapshot, SAVE_VERSION, MAX_AGE_MS,
} = await import('../src/saved_game.js');
const { getActiveGame, setActiveGame, clearActiveGame } = await import('../src/storage.js');
const { BACKUP_KEYS } = await import('../src/backup.js');

const NOW = 1_800_000_000_000;

/** Партия как в приложении: боты с характерами, имя игрока, пара ставок. */
function liveGame({ bots = 3, dice = 5, calza = true, palifico = true, bids = 2 } = {}) {
  const chars = generateCharacters(Array(bots).fill('careful'));
  const game = createGame({
    playerId: 'human', botCount: bots, startDice: dice, calzaEnabled: calza, palificoEnabled: palifico,
    assistMode: 'training', botSpeed: 'normal', botNames: chars.map((c) => c.name),
  });
  chars.forEach((c, i) => {
    const b = game.players[i + 1];
    b.character = c; b.style = c.style; b.gender = c.gender; b.avatar = c.avatar;
  });
  startGame(game);
  game.players[0].name = 'Игрок';
  for (let i = 0; i < bids; i++) {
    const cur = game.players[game.currentPlayer];
    const q = (game.bid ? game.bid.q : 0) + 1;
    const res = applyAction(game, cur.id, { type: 'raise', quantity: q, face: 2 + (i % 4) });
    assert.ok(res.success, res.error);
  }
  return game;
}

const snapOf = (game, extra = {}) => makeSnapshot({
  game,
  log: [{ type: 'info', html: 'Партия началась', round: 1 },
    { type: '', html: '<span class="player-name c0">Вы</span> <span class="chip ">3<em>×</em><span class="die s " title="2"><i class="on"></i></span></span>', round: 1 }],
  reviews: [{ kind: 'raise', prob: 0.6, text: 'вы поставили ставку', v: { code: 'good', label: 'Надёжная ставка', score: 1 }, round: 1, outcome: '', probRead: 0.7, handSize: 5, ownMatch: 2, trust: 0.2, note: 'Вы поставили 4×3.' }],
  moments: [],
  mind: { level: 'hard', memory: false },
  now: NOW,
  ...extra,
});

describe('снимок и восстановление', () => {
  it('партия возвращается такой же: игроки, руки, ставка, чей ход', () => {
    const game = liveGame();
    const back = restoreSnapshot(JSON.parse(JSON.stringify(snapOf(game))), { now: NOW + 1000 });
    assert.ok(back, 'снимок должен восстановиться');
    const g = back.game;
    assert.strictEqual(g.state, 'active');
    assert.strictEqual(g.round, game.round);
    assert.strictEqual(g.currentPlayer, game.currentPlayer);
    assert.deepStrictEqual(g.bid && { q: g.bid.q, f: g.bid.f, playerId: g.bid.playerId },
      { q: game.bid.q, f: game.bid.f, playerId: game.bid.playerId });
    assert.strictEqual(g.bidHistory.length, game.bidHistory.length);
    assert.deepStrictEqual(g.players.map((p) => p.hand), game.players.map((p) => p.hand));
    assert.deepStrictEqual(g.players.map((p) => p.name), game.players.map((p) => p.name));
    assert.deepStrictEqual(g.players.map((p) => p.dice), game.players.map((p) => p.dice));
    assert.strictEqual(g.config.startDice, 5);
    assert.strictEqual(g.calzaEnabled, true);
    assert.strictEqual(g.palificoEnabled, true);
    assert.strictEqual(back.mind.level, 'hard');
    assert.strictEqual(back.mind.memory, false);
  });
  it('у ботов сохраняются стиль, пол и тот же аватар', () => {
    const game = liveGame();
    const back = restoreSnapshot(JSON.parse(JSON.stringify(snapOf(game))), { now: NOW }).game;
    for (let i = 1; i < game.players.length; i++) {
      assert.strictEqual(back.players[i].style, game.players[i].style);
      assert.strictEqual(back.players[i].gender, game.players[i].gender);
      assert.strictEqual(back.players[i].avatar, game.players[i].avatar);
      assert.strictEqual(back.players[i].character.name, game.players[i].name);
    }
    assert.strictEqual(back.players[0].avatar, undefined, 'аватар игрока берётся из профиля, а не из снимка');
  });
  it('журнал, разбор и решения возвращаются', () => {
    const back = restoreSnapshot(JSON.parse(JSON.stringify(snapOf(liveGame()))), { now: NOW });
    assert.strictEqual(back.log.length, 2);
    assert.strictEqual(back.reviews.length, 1);
    assert.strictEqual(back.reviews[0].probRead, 0.7);
    assert.strictEqual(back.reviews[0].note, 'Вы поставили 4×3.');
    assert.strictEqual(back.reviews[0].v.code, 'good');
  });
  it('снимок не зависит от дальнейших ходов (копия)', () => {
    const game = liveGame({ bids: 1 });
    const snap = snapOf(game);
    const roundBefore = snap.game.bidHistory.length;
    applyAction(game, game.players[game.currentPlayer].id, { type: 'raise', quantity: 9, face: 3 });
    assert.strictEqual(snap.game.bidHistory.length, roundBefore);
  });
  it('события и журнал движка в снимок не попадают', () => {
    const snap = snapOf(liveGame());
    assert.deepStrictEqual(snap.game.events, []);
    assert.deepStrictEqual(snap.game.log, []);
  });
  it('сохраняется только идущая партия', () => {
    assert.strictEqual(makeSnapshot({ game: null }), null);
    assert.strictEqual(makeSnapshot({}), null);
    const g = liveGame(); g.state = 'finished';
    assert.strictEqual(makeSnapshot({ game: g }), null);
    g.state = 'waiting';
    assert.strictEqual(makeSnapshot({ game: g }), null);
  });
  it('после восстановления партия играется дальше (движок принимает ходы)', () => {
    const back = restoreSnapshot(JSON.parse(JSON.stringify(snapOf(liveGame()))), { now: NOW }).game;
    const cur = back.players[back.currentPlayer];
    const res = applyAction(back, cur.id, { type: 'raise', quantity: back.bid.q + 1, face: back.bid.f });
    assert.ok(res.success, res.error);
  });
  it('партия после «Не верю» (со снятым кубиком и палифико) тоже восстанавливается', () => {
    const game = liveGame({ bids: 0, dice: 2 });
    for (let i = 0; i < 40 && game.state === 'active'; i++) {
      const cur = game.players[game.currentPlayer];
      const res = game.bid && game.bid.playerId !== cur.id
        ? applyAction(game, cur.id, { type: 'dudo' })
        : applyAction(game, cur.id, { type: 'raise', quantity: 1, face: 2 });
      assert.ok(res.success, res.error);
      if (game.state === 'active') {
        const back = restoreSnapshot(JSON.parse(JSON.stringify(snapOf(game))), { now: NOW });
        assert.ok(back, `не восстановилась на шаге ${i}`);
        assert.deepStrictEqual(back.game.players.map((p) => p.dice), game.players.map((p) => p.dice));
      }
    }
  });
});

describe('снимок на каждом шаге случайных партий', () => {
  it('120 партий с Calza и Палифико: снимок любого момента восстанавливается и играется дальше', () => {
    let steps = 0;
    for (let g = 0; g < 120; g++) {
      const bots = 1 + (g % 5);
      const game = liveGame({ bots, dice: 1 + (g % 5), bids: 0 });
      for (let i = 0; i < 400 && game.state === 'active'; i++) {
        const cur = game.players[game.currentPlayer];
        const acts = getLegalActions(game, cur.id);
        // чаще повышаем, но иногда проверяем: партии доходят до выбывания игроков
        const dudo = acts.find((a) => a.type === 'dudo' || a.type === 'calza');
        const raises = acts.filter((a) => a.type === 'raise').slice(0, 4);
        const pick = dudo && (Math.random() < 0.35 || !raises.length) ? dudo : raises[Math.floor(Math.random() * raises.length)];
        assert.ok(applyAction(game, cur.id, pick).success);
        if (game.state !== 'active') break;
        const back = restoreSnapshot(JSON.parse(JSON.stringify(snapOf(game))), { now: NOW });
        assert.ok(back, `не восстановилась: партия ${g}, шаг ${i}`);
        assert.strictEqual(back.game.currentPlayer, game.currentPlayer);
        assert.strictEqual(back.game.palifico, game.palifico);
        assert.deepStrictEqual(back.game.players.map((p) => [p.dice, p.alive]), game.players.map((p) => [p.dice, p.alive]));
        steps++;
      }
    }
    assert.ok(steps > 500, `слишком мало проверенных шагов: ${steps}`);
  });
});

describe('проверка: всё сомнительное отбрасывается', () => {
  const good = () => JSON.parse(JSON.stringify(snapOf(liveGame())));
  const bad = (mutate, label) => it(label, () => {
    const s = good(); mutate(s);
    assert.strictEqual(restoreSnapshot(s, { now: NOW }), null);
  });
  it('не объект и чужая версия', () => {
    for (const x of [null, undefined, 5, 'x', [], true]) assert.strictEqual(restoreSnapshot(x, { now: NOW }), null);
    const s = good(); s.v = SAVE_VERSION + 1;
    assert.strictEqual(restoreSnapshot(s, { now: NOW }), null);
  });
  it('слишком старый и «из будущего»', () => {
    assert.strictEqual(restoreSnapshot(good(), { now: NOW + MAX_AGE_MS + 1 }), null);
    assert.ok(restoreSnapshot(good(), { now: NOW + MAX_AGE_MS - 1 }));
    assert.strictEqual(restoreSnapshot(good(), { now: NOW - 3 * 24 * 3600 * 1000 }), null);
  });
  bad((s) => { s.savedAt = 'вчера'; }, 'время не число');
  bad((s) => { s.game.state = 'finished'; }, 'партия закончена');
  bad((s) => { s.game.state = 'waiting'; }, 'партия не начата');
  bad((s) => { s.game.players = s.game.players.slice(0, 1); }, 'меньше двух игроков');
  bad((s) => { s.game.players.length = 0; }, 'пустой список игроков');
  bad((s) => { s.game.players.push(...s.game.players); }, 'больше шести игроков / повтор id');
  bad((s) => { s.game.players[0].id = 'cheater'; }, 'у игрока не тот id');
  bad((s) => { s.game.players[1].isBot = false; }, 'бот не помечен ботом');
  bad((s) => { s.game.players[1].dice = 99; }, 'кубиков больше, чем в начале');
  bad((s) => { s.game.players[0].dice = -1; }, 'отрицательное число кубиков');
  bad((s) => { s.game.players[0].hand = [1, 2]; }, 'рука не по размеру');
  bad((s) => { s.game.players[0].hand[0] = 7; }, 'грань вне 1–6');
  bad((s) => { s.game.players[0].alive = false; }, 'живой с кубиками помечен выбывшим');
  bad((s) => { s.game.players[1].style = 'hacker'; }, 'неизвестный стиль бота');
  bad((s) => { s.game.players[1].name = '   '; }, 'пустое имя');
  bad((s) => { s.game.round = 0; }, 'раунд 0');
  bad((s) => { s.game.round = 'второй'; }, 'раунд не число');
  bad((s) => { s.game.currentPlayer = 9; }, 'ходит несуществующий игрок');
  bad((s) => { s.game.currentPlayer = -1; }, 'отрицательный индекс хода');
  bad((s) => { s.game.bid.f = 9; }, 'ставка на несуществующую грань');
  bad((s) => { s.game.bid.q = 0; }, 'ставка на ноль кубиков');
  bad((s) => { s.game.bid.playerId = 'ghost'; }, 'ставка от несуществующего игрока');
  bad((s) => { s.game.bid.playerId = s.game.players[s.game.currentPlayer].id; }, 'проверять нужно своё же слово');
  bad((s) => { s.game.bidHistory = []; }, 'есть ставка, но истории нет');
  bad((s) => { s.game.bidHistory = 'много'; }, 'история не список');
  bad((s) => { s.game.id = '<script>'; }, 'странный id партии');
  bad((s) => { s.game.assistMode = 'cheat'; }, 'неизвестный режим помощи');
  bad((s) => { s.game.botSpeed = 'warp'; }, 'неизвестный темп');
  bad((s) => { s.game.palificoEnabled = false; s.game.palifico = true; }, 'палифико идёт, хотя выключено');
  bad((s) => { delete s.game.config; }, 'нет config');
  bad((s) => { s.game.config.startDice = 50; }, 'startDice вне пределов');
  bad((s) => { s.game = 'партия'; }, 'game не объект');
  it('если живой остался один — это уже не партия', () => {
    const s = good();
    for (let i = 1; i < s.game.players.length; i++) { s.game.players[i].dice = 0; s.game.players[i].alive = false; s.game.players[i].hand = []; }
    s.game.currentPlayer = 0;
    s.game.bid = null; s.game.bidHistory = [];
    assert.strictEqual(restoreSnapshot(s, { now: NOW }), null);
  });
  it('мусор в журнале, разборе и решениях отбрасывается по записям, партия остаётся', () => {
    const s = good();
    s.log.push({ type: '', html: '<img src=x onerror=alert(1)>', round: 1 }, 7, null, { html: 5 });
    s.reviews.push({ kind: 'hack' }, null, { kind: 'raise', prob: 5, text: 'x', v: { code: 'good' }, round: 1 });
    s.moments = [{ id: 1 }, 'x', null];
    const back = restoreSnapshot(s, { now: NOW });
    assert.ok(back);
    assert.strictEqual(back.log.length, 2);
    assert.strictEqual(back.reviews.length, 1);
    assert.deepStrictEqual(back.moments, []);
  });
  it('чужой SVG вместо аватара бота заменяется на свой, партия остаётся', () => {
    const s = good();
    s.game.players[1].avatar = '<svg onload=alert(1)></svg>';
    const back = restoreSnapshot(s, { now: NOW });
    assert.ok(back);
    assert.match(back.game.players[1].avatar, /^<svg viewBox="0 0 100 100"/);
    assert.ok(!/onload/.test(back.game.players[1].avatar));
  });
  it('неизвестные уровень и память приводятся к стандартным', () => {
    const s = good(); s.mind = { level: 'god', memory: 'да' };
    const back = restoreSnapshot(s, { now: NOW });
    assert.deepStrictEqual(back.mind, { level: 'normal', memory: true });
  });
  it('sanitizeGame на мусоре не бросает исключений', () => {
    for (const x of [null, 1, 'a', [], {}, { state: 'active' }, { state: 'active', players: [null, null], config: {} }]) {
      assert.doesNotThrow(() => sanitizeGame(x));
      assert.strictEqual(sanitizeGame(x), null);
    }
  });
});

describe('safeHtml', () => {
  it('пропускает разметку, которую пишет приложение', () => {
    for (const ok of [
      'просто текст',
      '<b class="text-bad">НЕ ВЕРЮ</b> (<span class="chip ">3<em>×</em></span>)',
      '<span class="die s " title="4"><i class="on"></i><i class=""></i></span>',
      '<div class="muted">По вашим кубикам 60%</div>',
      '&lt;ложный тег&gt; в тексте',
    ]) assert.strictEqual(safeHtml(ok), ok);
  });
  it('отклоняет опасное и неизвестное', () => {
    for (const evil of [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '<span onclick="x()">a</span>',
      '<a href="javascript:alert(1)">a</a>',
      '<span class="a" style="x">a</span>',
      '<iframe src="//evil"></iframe>',
      '<svg onload=alert(1)>',
      '<span class="a"',
      'текст <',
      '<b class="a>b">x</b>',
    ]) assert.strictEqual(safeHtml(evil), null, evil);
  });
  it('не строка и слишком длинное — null', () => {
    for (const x of [null, undefined, 5, {}, []]) assert.strictEqual(safeHtml(x), null);
    assert.strictEqual(safeHtml('a'.repeat(5000)), null);
  });
});

describe('описание и хранилище', () => {
  beforeEach(() => { for (const k of Object.keys(mem)) delete mem[k]; });

  it('описание с правильными склонениями', () => {
    const snap = restoreSnapshot(JSON.parse(JSON.stringify(snapOf(liveGame()))), { now: NOW });
    assert.strictEqual(describeSnapshot(snap), `Раунд ${snap.game.round} · у вас 5 кубиков · ботов в игре: 3 из 3`);
    snap.game.players[0].dice = 1;
    assert.match(describeSnapshot(snap), /у вас 1 кубик ·/);
    snap.game.players[0].dice = 3;
    assert.match(describeSnapshot(snap), /у вас 3 кубика ·/);
    assert.strictEqual(describeSnapshot(null), '');
    assert.strictEqual(describeSnapshot({}), '');
  });
  it('записывается и читается обратно', () => {
    assert.strictEqual(getActiveGame(), null);
    const game = liveGame();
    assert.strictEqual(setActiveGame({ game, log: [], reviews: [], moments: [], mind: null }), true);
    const back = getActiveGame();
    assert.ok(back);
    assert.strictEqual(back.game.round, game.round);
  });
  it('закончившаяся партия не пишется и прежний снимок не трогает', () => {
    setActiveGame({ game: liveGame(), mind: null });
    const before = mem['perudo.activeGame'];
    const done = liveGame(); done.state = 'finished';
    assert.strictEqual(setActiveGame({ game: done }), false);
    assert.strictEqual(mem['perudo.activeGame'], before);
  });
  it('clearActiveGame удаляет снимок; повторный вызов безопасен', () => {
    setActiveGame({ game: liveGame(), mind: null });
    clearActiveGame();
    assert.strictEqual(getActiveGame(), null);
    assert.doesNotThrow(clearActiveGame);
  });
  it('повреждённые данные в хранилище дают null без исключений', () => {
    mem['perudo.activeGame'] = '{не json';
    assert.strictEqual(getActiveGame(), null);
    mem['perudo.activeGame'] = JSON.stringify({ v: 1 });
    assert.strictEqual(getActiveGame(), null);
    mem['perudo.activeGame'] = JSON.stringify([1, 2, 3]);
    assert.strictEqual(getActiveGame(), null);
  });
  it('ошибка записи localStorage не бросает исключение', () => {
    const orig = global.localStorage.setItem;
    global.localStorage.setItem = () => { throw new Error('quota'); };
    assert.doesNotThrow(() => setActiveGame({ game: liveGame(), mind: null }));
    global.localStorage.setItem = orig;
  });
  it('снимок партии не входит в резервную копию и облако', () => {
    assert.ok(!BACKUP_KEYS.includes('perudo.activeGame'));
  });
});
