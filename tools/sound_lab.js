// tools/sound_lab.js — лаборатория звуков: слушать, править ноты, проверять и копировать рецепты.
// Использует те же модули, что и игра (правила, рецепты, движок звука), поэтому звучит так же.

import { CUES, EVENTS, MODE_VOLUME, audibleEvents } from '../src/sound_plan.js';
import {
  RECIPES, WAVE_TYPES, FREQ_MIN, FREQ_MAX, GAIN_MAX, validateRecipe, formatRecipe, formatRecipes,
} from '../src/sound_recipes.js';
import { createSoundEngine } from '../src/sound_engine.js';

const LABELS = {
  turn: 'Ваш ход', dudo: '«Не верю!»', calza: 'Calza', loseDie: 'Потеря кубика', win: 'Вы выиграли партию',
  lose: 'Вы проиграли партию', deal: 'Раздача кубиков', illegal: 'Недопустимая ставка', bidYou: 'Ваша ставка', bidBot: 'Ставка бота',
};
const DELAYS = { fast: 320, step: 700, normal: 1100, slow: 2600 };

const $ = (sel) => document.querySelector(sel);
const clone = (v) => JSON.parse(JSON.stringify(v));

// Рабочие рецепты: копия игровых, правится на странице.
let recipes = clone(RECIPES);

const engine = createSoundEngine({
  AudioContextCtor: window.AudioContext || window.webkitAudioContext || null,
  getMode: () => $('#vol').value,
  getSpeed: () => $('#speed').value,
  recipes,
});
const volume = () => MODE_VOLUME[$('#vol').value] ?? MODE_VOLUME.normal;
/** Движок хранит ссылку на recipes: правим тот же объект, а не подменяем его. */
function setRecipe(sound, notes) { recipes[sound] = notes; }

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) e.append(c);
  return e;
}

async function copyText(text, statusEl, okText) {
  try {
    await navigator.clipboard.writeText(text);
    statusEl.textContent = okText;
  } catch (e) {
    statusEl.textContent = 'Не удалось скопировать автоматически: выделите текст ниже и скопируйте вручную.';
  }
}

const cards = new Map();   // событие -> { refresh }

function field(label, input) {
  return el('label', {}, label, input);
}

function noteRow(event, sound, i, onChange, onRemove) {
  const n = recipes[sound][i];
  const num = (key, min, max, step, value) => {
    const inp = el('input', { type: 'number', min, max, step, inputmode: 'decimal' });
    inp.value = value === undefined ? '' : value;
    inp.addEventListener('input', () => {
      const raw = inp.value.trim();
      if (key === 'to' && raw === '') delete n.to;
      else n[key] = raw === '' ? NaN : Number(raw);
      onChange();
    });
    return inp;
  };
  const type = el('select', {});
  for (const t of WAVE_TYPES) type.append(el('option', { value: t, text: t }));
  type.value = n.type;
  type.addEventListener('change', () => { n.type = type.value; onChange(); });
  const rm = el('button', { type: 'button', 'aria-label': `Удалить ноту ${i + 1}`, text: 'Удалить' });
  rm.addEventListener('click', onRemove);
  return el('div', { class: 'note', 'data-note': String(i) },
    field('Начало, мс', num('at', 0, 5000, 5, n.at)),
    field('Длит., мс', num('dur', 20, 5000, 5, n.dur)),
    field(`Частота, Гц`, num('freq', FREQ_MIN, FREQ_MAX, 1, n.freq)),
    field('До частоты (необяз.)', num('to', FREQ_MIN, FREQ_MAX, 1, n.to)),
    field('Тембр', type),
    field(`Громкость ≤ ${GAIN_MAX}`, num('gain', 0.01, GAIN_MAX, 0.01, n.gain)),
    rm);
}

function buildCard(event) {
  const cue = CUES[event];
  const sound = cue.sound;
  const card = el('section', { class: 'card', 'data-event': event });
  const status = el('div', { class: 'status', role: 'status' });
  const text = el('textarea', { readonly: 'readonly', 'aria-label': `Рецепт: ${LABELS[event]}`, spellcheck: 'false' });
  const notesBox = el('div', { class: 'notes' });

  const play = el('button', { type: 'button', class: 'primary', text: '▶ Играть' });
  const reset = el('button', { type: 'button', text: 'Сбросить' });
  const copy = el('button', { type: 'button', text: 'Копировать' });
  const add = el('button', { type: 'button', text: '+ нота' });

  const head = el('div', { class: 'card-head' },
    el('div', {},
      el('h2', { text: LABELS[event] }),
      el('div', { class: 'meta', text: `событие ${event} · звук ${sound} · до ${cue.dur} мс · приоритет ${cue.priority}` })),
    el('div', { class: 'actions' }, play, reset, copy));
  card.append(head, notesBox, el('div', { class: 'actions' }, add), status, text);

  function refresh(rebuildRows = false) {
    if (rebuildRows) {
      notesBox.replaceChildren(...recipes[sound].map((_, i) => noteRow(event, sound, i, () => refresh(false), () => {
        recipes[sound].splice(i, 1);
        refresh(true);
      })));
    }
    const problems = validateRecipe(recipes[sound], cue.dur);
    status.className = `status ${problems.length ? 'bad' : 'ok'}`;
    status.textContent = problems.length ? `Не годится: ${problems.join('; ')}.` : 'Рецепт подходит игре.';
    play.disabled = problems.some((p) => /частота|громкость|тембр|начало|длительность|не нота/.test(p));
    text.value = formatRecipe(sound, recipes[sound]);
    updateAll();
  }

  play.addEventListener('click', () => { engine.unlock(); engine.playSound(sound, volume()); });
  reset.addEventListener('click', () => { setRecipe(sound, clone(RECIPES[sound])); refresh(true); });
  copy.addEventListener('click', () => copyText(text.value, status, 'Скопировано: вставьте в src/sound_recipes.js вместо прежней записи.'));
  add.addEventListener('click', () => {
    const last = recipes[sound].at(-1);
    recipes[sound].push({ at: last ? last.at + last.dur : 0, dur: 60, freq: 660, type: 'sine', gain: 0.3 });
    refresh(true);
  });
  cards.set(event, { refresh });
  refresh(true);
  return card;
}

function updateAll() {
  const bad = EVENTS.filter((e) => validateRecipe(recipes[CUES[e].sound], CUES[e].dur).length);
  const st = $('#allStatus');
  st.className = `status ${bad.length ? 'bad' : 'ok'}`;
  st.textContent = bad.length
    ? `Не годятся: ${bad.map((e) => LABELS[e]).join(', ')}.`
    : 'Все десять рецептов подходят игре.';
}

// ----- Раунд целиком -----

const log = $('#log');
let timers = [];

function scenarioTimeline(speed) {
  const d = DELAYS[speed] ?? DELAYS.normal;
  const t = [];
  let at = 0;
  t.push([at, 'deal'], [at + 1, 'turn']);                 // раунд начался, ваш ход
  at += 1500; t.push([at, 'bidYou']);                     // вы ставите
  for (let i = 0; i < 3; i++) { at += d; t.push([at, 'bidBot']); }
  t.push([at + 1, 'turn']);                               // ход вернулся к вам
  at += 1800; t.push([at, 'dudo'], [at + 1, 'loseDie'], [at + 2, 'deal'], [at + 3, 'turn']);   // «Не верю!»: все звуки подряд
  return t;
}

function runScenario() {
  engine.unlock();
  engine.reset();
  timers.forEach(clearTimeout);
  timers = [];
  log.replaceChildren();
  const speed = $('#speed').value;
  const audible = new Set(audibleEvents($('#vol').value, speed));
  for (const [ms, event] of scenarioTimeline(speed)) {
    timers.push(setTimeout(() => {
      const played = engine.cue(event);
      const why = played ? '▶ звучит' : (audible.has(event) ? 'пропущено: занято другим звуком' : `молчит на этом темпе`);
      const row = el('div', { class: played ? '' : 'skip', text: `${(ms / 1000).toFixed(1)} с  ${LABELS[event].padEnd(20, ' ')} ${why}` });
      log.append(row);
    }, ms));
  }
}

// ----- Запуск -----

const root = $('#cards');
for (const e of EVENTS) root.append(buildCard(e));

$('#scenario').addEventListener('click', runScenario);
$('#copyAll').addEventListener('click', () => copyText(formatRecipes(recipes), $('#allStatus'), 'Скопированы все рецепты: вставьте их между «Object.freeze({» и «});» в src/sound_recipes.js.'));
$('#resetAll').addEventListener('click', () => {
  for (const [sound, notes] of Object.entries(RECIPES)) setRecipe(sound, clone(notes));
  for (const { refresh } of cards.values()) refresh(true);
});
