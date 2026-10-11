// result.js — итог партии (чистая функция, без DOM).
//
// Вход — состояние игры из engine.js. Выход — всё, что нужно интерфейсу, чтобы
// показать победителя: окно, баннер, подсветку места. Ничего не мутирует.

const isHumanPlayer = (p) => p.isHuman === true || p.isBot === false;

/**
 * @param {object|null} game  состояние игры (engine.js)
 * @returns {null | {
 *   winnerId: string|null, winnerName: string, isHumanWinner: boolean,
 *   rounds: number, humanDice: number, humanAlive: boolean,
 *   standings: {id:string, name:string, dice:number, alive:boolean, isHuman:boolean}[]
 * }}  null, если партия не завершена
 */
export function buildGameResult(game) {
  if (!game || game.state !== 'finished' || !Array.isArray(game.players)) return null;

  const players = game.players;
  const alive = players.filter((p) => p.alive);

  // Победитель: явный game.winner, иначе единственный выживший.
  let winner = game.winner != null ? players.find((p) => p.id === game.winner) : null;
  if (!winner && alive.length === 1) winner = alive[0];

  const human = players.find(isHumanPlayer) || null;

  // Таблица: выжившие первыми, затем по убыванию кубиков; порядок мест при равенстве сохраняется.
  const standings = players
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (Number(b.p.alive) - Number(a.p.alive)) || (b.p.dice - a.p.dice) || (a.i - b.i))
    .map(({ p }) => ({
      id: p.id,
      name: String(p.name ?? ''),
      dice: Number(p.dice) || 0,
      alive: !!p.alive,
      isHuman: isHumanPlayer(p),
    }));

  return {
    winnerId: winner ? winner.id : null,
    winnerName: winner ? String(winner.name ?? '') : '',
    isHumanWinner: !!(winner && human && winner.id === human.id),
    rounds: Number(game.round) || 0,
    humanDice: human ? Number(human.dice) || 0 : 0,
    humanAlive: !!(human && human.alive),
    standings,
  };
}

/** «1 кубик», «3 кубика», «5 кубиков», «0 кубиков», «11 кубиков», «21 кубик». */
export function pluralDice(n) {
  const k = Math.abs(Math.trunc(Number(n) || 0));
  const m10 = k % 10;
  const m100 = k % 100;
  const word = m10 === 1 && m100 !== 11 ? 'кубик'
    : (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) ? 'кубика'
      : 'кубиков';
  return `${k} ${word}`;
}

/** Тексты для окна, баннера и строки статуса. result — из buildGameResult. */
export function resultHeadline(result) {
  if (!result) return { icon: '', title: '', lead: '' };
  const title = result.winnerId == null ? 'Партия завершена'
    : result.isHumanWinner ? 'Вы победили!'
      : `Победил ${result.winnerName}`;
  const icon = result.isHumanWinner ? '🏆' : (result.winnerId == null ? '🏁' : '👑');
  const lead = `Раунд ${result.rounds} · ` +
    (result.humanAlive ? `у вас осталось ${pluralDice(result.humanDice)}` : 'вы выбыли');
  return { icon, title, lead };
}
