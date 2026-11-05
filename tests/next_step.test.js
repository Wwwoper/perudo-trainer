import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextStep, NEXT_TITLE } from '../src/next_step.js';
import { TRAIN_MODE } from '../src/weak_spots.js';

const root = new URL('../', import.meta.url);
const BANNED = /обманщик|врёт|блефует/i;
const games = (n) => ({ totalGames: n, totalWins: 0, n: 0, good: 0, byTag: {} });
const item = { mode: 'classic', n: 12, h: [1], f: 3, q: 4, streak: 0 };

describe('«Что дальше»: одна рекомендация', () => {
  it('очередь повторов важнее всего', () => {
    const r = nextStep({ stats: { ...games(9), byTag: { endgame: { n: 10, good: 2 } } }, games: [], queue: [item, item] });
    assert.equal(r.id, 'queue');
    assert.match(r.text, /ситуаций: 2/);
    assert.deepEqual(r.action, { label: 'Открыть Тренажёр', tab: 'train' });
  });
  it('слабая тема с режимом: кнопка «Тренировать» ведёт в этот режим', () => {
    const r = nextStep({ stats: { ...games(9), byTag: { endgame: { n: 10, good: 2 } } }, games: [], queue: [] });
    assert.equal(r.id, 'weak');
    assert.match(r.text, /«.+»/);
    assert.deepEqual(r.action, { label: 'Тренировать', train: TRAIN_MODE.endgame });
  });
  it('из нескольких слабых тем берётся самая слабая', () => {
    const r = nextStep({ stats: { ...games(9), byTag: { endgame: { n: 10, good: 6 }, lastDie: { n: 10, good: 1 } } }, queue: [] });
    assert.equal(r.action.train, TRAIN_MODE.lastDie);
  });
  it('мало партий: сколько ещё нужно до процента побед', () => {
    const r = nextStep({ stats: games(2), games: [], queue: [] });
    assert.equal(r.id, 'games');
    assert.match(r.text, /Сыграйте ещё партий: 3/);
    assert.deepEqual(r.action, { label: 'Играть', tab: 'game' });
    assert.match(nextStep({ stats: games(0), queue: [] }).text, /Сыграйте партию/);
  });
  it('партий достаточно, «Читай вскрытие» не пробовали — предлагаем упражнения', () => {
    const r = nextStep({ stats: games(6), queue: [] });
    assert.equal(r.id, 'read');
    assert.deepEqual(r.action, { label: 'Открыть Упражнения', tab: 'drill' });
  });
  it('всё пробовано, слабых мест нет — сыграть партию', () => {
    const r = nextStep({ stats: { ...games(6), byTag: { read: { n: 10, good: 10 } } }, queue: [] });
    assert.equal(r.id, 'play');
    assert.equal(r.action.tab, 'game');
  });
  it('мусор вместо данных не ломает: как у новичка', () => {
    for (const v of [undefined, {}, { stats: null }, { stats: 5, games: 'x', queue: 7 }]) {
      const r = nextStep(v);
      assert.equal(r.id, 'games');
      assert.ok(r.text && r.action.label);
    }
  });
  it('тексты без запрещённых слов, у действия либо вкладка, либо режим', () => {
    const cases = [
      { stats: games(0) }, { stats: games(2) }, { stats: games(6) },
      { stats: { ...games(6), byTag: { read: { n: 9, good: 9 } } } },
      { stats: { ...games(9), byTag: { ladder: { n: 10, good: 3 } } } }, { queue: [item] },
    ];
    for (const c of cases) {
      const r = nextStep(c);
      assert.doesNotMatch(r.text, BANNED);
      assert.ok(Boolean(r.action.tab) !== Boolean(r.action.train), r.id);
    }
    assert.equal(NEXT_TITLE, 'Что дальше');
  });
  it('в index.html есть карточка перед «Над чем поработать», руководство описывает блок', () => {
    const html = readFileSync(new URL('index.html', root), 'utf8');
    assert.ok(html.indexOf('id="stNext"') > 0 && html.indexOf('id="stNext"') < html.indexOf('id="stWeak"'));
    const g = readFileSync(new URL('docs/guide/stats.html', root), 'utf8').replace(/<[^>]+>/g, ' ');
    assert.ok(g.includes('«Что дальше»'));
  });
});
