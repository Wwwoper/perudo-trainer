// src/ui/trainer.js — Тренажёр: разбор ситуаций и очередь повторов.

import { getStats, updateStats, getTrainingQueue, setTrainingQueue } from '../storage.js';
import { renderDie, renderHand, renderBid } from '../table.js';
import { P, $, $$, pct, flash } from './common.js';
import { MODES, modeLabel } from './modes.js';
import { compareOptions, markChosen } from '../compare.js';
import { optionsHtml } from './options_view.js';
import { pickRepeat, situationKey } from '../repeat_pick.js';
import { checkRaise, defaultRaise } from '../trainer_rules.js';

export function setupTrainer() {
  if (!P) return null;

  // Статистику не держим в переменной: её пишут и другие разделы (см. updateStats).
  let queue = getTrainingQueue();
  let cur = null;
  let answered = false;
  let shownCount = 0;              // сколько ситуаций показано на этой странице
  const seenAt = new Map();        // ключ ситуации → номер её последнего показа (для паузы между повторами)

  const modeSel = $('#tMode');
  if (modeSel) {
    modeSel.innerHTML = '';
    for (const key in MODES) modeSel.add(new Option(MODES[key].name, key));
  }

  // Выбор режима плитками; источник правды остаётся в #tMode (скрытый select)
  const modePick = $('#tModePick');
  const syncModePick = () => {
    if (!modePick || !modeSel) return;
    modePick.querySelectorAll('[data-mode]').forEach((b) => {
      const on = b.dataset.mode === modeSel.value;
      b.setAttribute('aria-checked', String(on));
      b.classList.toggle('is-on', on);
      b.tabIndex = on ? 0 : -1;
    });
  };
  if (modePick) {
    modePick.innerHTML = '';
    for (const key in MODES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mode-btn';
      b.dataset.mode = key;
      b.setAttribute('role', 'radio');
      b.textContent = MODES[key].short || modeLabel(key);
      b.title = MODES[key].name;
      b.onclick = () => { modeSel.value = key; modeSel.onchange?.(); };
      modePick.appendChild(b);
    }
    syncModePick();
  }
  const faceSel = $('#tF');
  if (faceSel) {
    faceSel.innerHTML = '';
    for (let f = 1; f <= 6; f++) faceSel.add(new Option(String(f), f));
  }

  // Выбор цифры кнопками; источник правды остаётся в #tF (скрытый select)
  const facePick = $('#tPick');
  const syncPick = () => {
    const cur = +($('#tF')?.value) || 0;
    $$('#tPick .face-btn').forEach((b, i) => {
      b.classList.toggle('sel', i + 1 === cur);
      b.setAttribute('aria-checked', String(i + 1 === cur));
    });
  };
  if (facePick && faceSel) {
    facePick.innerHTML = '';
    for (let f = 1; f <= 6; f++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'face-btn';
      b.innerHTML = renderDie(f, 's');
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', `Цифра ${f}`);
      b.onclick = () => { faceSel.value = f; syncPick(); };
      facePick.append(b);
    }
  }
  const stepQ = (d) => {
    const q = $('#tQ');
    if (q) q.value = Math.max(1, (+q.value || 1) + d);
  };
  if ($('#tMinus')) $('#tMinus').onclick = () => stepQ(-1);
  if ($('#tPlus')) $('#tPlus').onclick = () => stepQ(1);
  const setAnswered = (on) => $('#tLayout')?.classList.toggle('is-answered', on);

  function persist() { setTrainingQueue(queue); updateStat(); }

  function updateStat() {
    const el = $('#tStat');
    if (!el) return;
    const mk = $('#tMode').value;
    const S = getStats();
    const b = (S.byMode || {})[mk] || { n: 0, good: 0 };
    el.innerHTML = `Всего: ${S.n}, верных решений: ${S.good} (${S.n ? pct(S.good / S.n) : '—'}). ` +
      `В выбранном режиме: ${b.n ? `${b.good}/${b.n} (${pct(b.good / b.n)})` : '—'}. ` +
      `В очереди повторов: ${queue.length}.`;
  }

  /** forced — ситуация из очереди, которую нужно показать именно сейчас (иначе выбирается случайная). */
  function newSituation(forced) {
    const mk = $('#tMode').value;
    const m = MODES[mk];
    const pool = queue.filter((x) => x.mode === mk);

    shownCount++;
    const repeat = forced ? null : pickRepeat(pool, seenAt, shownCount);
    if (forced) {
      cur = { m, n: forced.n, h: forced.h.slice(), f: forced.f, q: forced.q, item: forced };
    } else if (repeat) {
      cur = { m, n: repeat.n, h: repeat.h.slice(), f: repeat.f, q: repeat.q, item: repeat };
    } else {
      const n = P.ri(m.n[0], m.n[1]);
      const k = Math.min(m.k(n), n - 1) || 1;
      const h = P.roll(k);
      const f = P.ri(1, 6);
      let q = Math.round(n * P.pFace(f, m.wild) + (Math.random() < m.bluff ? P.ri(1, 3) : P.ri(-2, 1)));
      q = Math.max(1, Math.min(n, q));
      cur = { m, n, h, f, q, item: null };
    }

    if (cur.item) seenAt.set(situationKey(cur.item), shownCount);
    answered = false;
    if ($('#tDesc')) $('#tDesc').textContent = m.d;
    if ($('#tInfo')) {
      $('#tInfo').innerHTML =
        (cur.item ? `<span class="trainer-chip trainer-repeat">🔁 повтор</span>` : '') +
        `<span class="trainer-chip">🎲 всего <b>${cur.n}</b></span>` +
        `<span class="trainer-chip">👤 у вас <b>${cur.h.length}</b></span>` +
        `<span class="trainer-chip">❓ чужих <b>${cur.n - cur.h.length}</b></span>` +
        `<span class="trainer-chip ${m.wild ? 'trainer-wild' : ''}">` +
        (m.wild ? '✨ единицы — джокеры' : '⚪ единицы обычные') +
        `</span>`;
    }
    if ($('#tHand')) $('#tHand').innerHTML = renderHand(cur.h, m.wild);
    if ($('#tBid')) $('#tBid').innerHTML = renderBid(cur.q, cur.f);
    const start = defaultRaise(cur);
    if ($('#tQ')) $('#tQ').value = start ? start.q : cur.q;
    if ($('#tF')) $('#tF').value = start ? start.f : cur.f;
    if ($('#tRaise')) $('#tRaise').disabled = !start;   // повысить нельзя — остаётся «Не верю»
    syncPick();
    setAnswered(false);
    if ($('#tFb')) $('#tFb').innerHTML = '';
    updateSettingsHint();
    updateStat();
  }
  function updateSettingsHint() {
    const el = $('#tSettingsHint');
    if (!el) return;
    const thr = (+$('#tT').value || 0.5).toFixed(2);
    el.textContent = `${modeLabel($('#tMode').value)} · порог ${thr}`;
    syncModePick();
  }

  /** Варианты хода по шансу ставки; choice — что выбрал игрок: { type: 'dudo' } или { type: 'raise', q, f }. */
  function hint(choice) {
    if (!cur) return '';
    const thr = +$('#tT').value;
    const { options } = compareOptions({
      bid: { q: cur.q, f: cur.f }, total: cur.n, hand: cur.h, wild: cur.m.wild,
      threshold: thr, probBid: (...args) => P.probBid(...args),
    });
    return optionsHtml(markChosen(options, choice), thr);
  }

  function answer(good, html) {
    if (answered || !cur) return;
    answered = true;

    const mk = $('#tMode').value;
    updateStats((S) => {
      S.n++;
      S.byMode[mk] = S.byMode[mk] || { n: 0, good: 0 };
      S.byMode[mk].n++;
      if (good) { S.good++; S.byMode[mk].good++; }
    });

    if (cur.item) {
      if (good) {
        cur.item.streak = (cur.item.streak || 0) + 1;
        if (cur.item.streak >= 2) queue = queue.filter((x) => x !== cur.item);
      } else {
        cur.item.streak = 0;
      }
    } else if (!good) {
      const entry = { mode: mk, n: cur.n, h: cur.h.slice(), f: cur.f, q: cur.q, streak: 0 };
      queue.push(entry);
      seenAt.set(situationKey(entry), shownCount);   // только что показана: повтор не раньше чем через паузу
    }

    persist();
    if ($('#tFb')) {
      $('#tFb').innerHTML =
        `<div class="big ${good ? 'text-ok' : 'text-bad'}">${good ? '✓ Хорошее решение' : '✗ Сомнительное решение'}</div>${html}`;
    }
    setAnswered(true);
    $('#tNext')?.focus();
  }

  const dudoBtn = $('#tDudo');
  if (dudoBtn) dudoBtn.onclick = () => {
    if (answered || !cur) return;
    const { m, n, h, f, q } = cur;
    const t = +$('#tT').value;
    const p = P.probBid(q, f, n, h, m.wild);
    const msg = p < t ? 'Ставка слишком смелая — «Не верю» оправдано.'
      : 'Ставка вероятна — лучше было верить и повышать.';
    answer(p < t, `<p>Шанс, что ставка ${renderBid(q, f)} верна: <b>${pct(p)}</b> (порог ${pct(t)}). ${msg}</p>${hint({ type: 'dudo' })}`);
  };

  const raiseBtn = $('#tRaise');
  if (raiseBtn) raiseBtn.onclick = () => {
    if (answered || !cur) return;
    const { m, n, h, f, q } = cur;
    const t = +$('#tT').value;
    const Q = +$('#tQ').value;
    const F = +$('#tF').value;

    const check = checkRaise(Q, F, cur);
    if (!check.ok) { flash($('#tFb'), check.message); return; }

    const p = P.probBid(Q, F, n, h, m.wild);
    const po = P.probBid(q, f, n, h, m.wild);
    answer(p >= t,
      `<p>Ваша ставка ${renderBid(Q, F)} верна с шансом <b>${pct(p)}</b> (порог ${pct(t)}). ` +
      `Ставка соперника была верна с шансом ${pct(po)}.</p>${hint({ type: 'raise', q: Q, f: F })}`
    );
  };

  if ($('#tNew')) $('#tNew').onclick = () => newSituation();
  if ($('#tNext')) $('#tNext').onclick = () => { newSituation(); $('#tDudo')?.focus(); };

  if ($('#tMode')) {
    $('#tMode').onchange = () => {
      updateSettingsHint();   // ← сначала обновляем подпись
      newSituation();          // ← потом генерируем новую ситуацию
    };
  }

  if ($('#tT')) {
    $('#tT').addEventListener('input', updateSettingsHint);
    // «−» и «+» двигают порог на 0.05 в пределах 0.05–0.95
    const stepThr = (d) => {
      const cur = +$('#tT').value || 0.5;
      $('#tT').value = String(Math.min(0.95, Math.max(0.05, Math.round((cur + d) * 100) / 100)));
      updateSettingsHint();
    };
    if ($('#tTMinus')) $('#tTMinus').onclick = () => stepThr(-0.05);
    if ($('#tTPlus')) $('#tTPlus').onclick = () => stepThr(0.05);
  }
  if ($('#tReset')) $('#tReset').onclick = () => {
    if (!window.confirm('Сбросить статистику тренажёра и очередь повторов?')) return;
    updateStats((S) => {
      S.n = 0; S.good = 0; S.byMode = {};
      S.drill = { A: { n: 0, good: 0 }, B: { n: 0, good: 0 } };
    });
    queue = [];
    persist();
    newSituation();
  };

  newSituation();

  return {
    /** Очередь дополняют из итога партии («Добавить в очередь повторов»): при заходе в тренажёр читаем её заново. */
    reloadQueue() {
      queue = getTrainingQueue();
      updateStat();
    },
    /** Открывает тренажёр в выбранном режиме с новой ситуацией (кнопка «Тренировать» в статистике). */
    setMode(mode) {
      if (!MODES[mode]) return false;
      $('#tMode').value = mode;
      updateSettingsHint();
      newSituation();
      return true;
    },
  };
}
