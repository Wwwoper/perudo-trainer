// src/ui/trainer.js — Тренажёр: разбор ситуаций и очередь повторов.

import { getStats, updateStats, getTrainingQueue, setTrainingQueue } from '../storage.js';
import { escapeHtml, renderDie, renderHand, renderBid } from '../table.js';
import { P, $, $$, pct, flash } from './common.js';
import { MODES, modeLabel } from './modes.js';
import { compareOptions, markChosen } from '../compare.js';
import { optionsHtml } from './options_view.js';
import { pickRepeat, situationKey } from '../repeat_pick.js';
import { checkRaise, defaultRaise } from '../trainer_rules.js';
import { TABLE_TRUST } from '../table_read.js';
import { correctMoveText, NO_GOOD_NOTE, TASK_TEXT, TASK_QUESTION, TASK_RULE, chanceText, BID_LABEL, BID_LABEL_LADDER, thresholdPct, thresholdRuleHtml, situationParams } from '../trainer_text.js';
import { gradeMove, applyTrainerRule } from '../trainer_grade.js';
import { plaqueModel, raiseNeighbours } from '../trainer_feedback.js';
import { enableRadioKeys } from './radio_keys.js';
import { thresholdFromInput, thresholdPercentFromInput, stepThresholdPercent } from '../chance_margin.js';
import { plaqueHtml, raiseBlockHtml, feedbackNoteHtml } from './trainer_feedback_view.js';
import { hasGoodMove, pickSolvable } from '../trainer_solvable.js';
import { setupPracticeTimer } from './practice_timer.js';
import { setupTaskBanner } from './onboarding_tasks.js';
import { FINISH_TEXT } from '../onboarding.js';
import { REPEAT_GOAL, repeatChipText, repeatReason, repeatAfterText } from '../repeat_text.js';
import { resetTrainerStats, RESET_CONFIRM } from '../trainer_stats.js';
import { buildLadder, sanitizeLadder, ladderNames, ladderChances, ladderLines, gradeLadder, addLadderResult } from '../ladder.js';

/** @param {{account?: () => ({chooseGuest: () => void, login: () => void}|null)}} [opts] account — получатель облачного API для итогового экрана онбординга */
export function setupTrainer({ account } = {}) {
  if (!P) return null;

  // Статистику не держим в переменной: её пишут и другие разделы (см. updateStats).
  const timer = setupPracticeTimer({ toggle: '#tTimerOn', out: '#tTimerOut' });
  const tasks = setupTaskBanner({ account });
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
    enableRadioKeys(modePick);
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
      b.tabIndex = i + 1 === (cur || 1) ? 0 : -1;   // в группу заходят одним Tab, внутри — стрелки
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
    enableRadioKeys(facePick);
    syncPick();
  }
  const stepQ = (d) => {
    const q = $('#tQ');
    if (q) q.value = Math.max(1, (+q.value || 1) + d);
  };
  if ($('#tMinus')) $('#tMinus').onclick = () => stepQ(-1);
  if ($('#tPlus')) $('#tPlus').onclick = () => stepQ(1);
  const setAnswered = (on) => $('#tLayout')?.classList.toggle('is-answered', on);

  /** Порог оценки долей (0,05–0,95) из поля в процентах. */
  const threshold = () => thresholdFromInput($('#tT')?.value);

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
    const pool = tasks.active() ? [] : queue.filter((x) => x.mode === mk);   // в режиме задач повторов из очереди нет

    shownCount++;
    const repeat = forced ? null : pickRepeat(pool, seenAt, shownCount);
    const picked = forced || repeat;
    if (m.ladder) {
      // лестница ставок: ситуация с историей торгов (из очереди или новая)
      const stored = picked ? sanitizeLadder(picked) : null;
      let sit = stored;
      for (let i = 0; !sit && i < 30; i++) sit = buildLadder({ wild: m.wild });
      if (!sit) throw new Error('Не удалось составить ситуацию «Лестницы ставок»');
      cur = { m: { ...m, wild: sit.wild }, n: sit.n, h: sit.h.slice(), f: sit.f, q: sit.q, item: stored ? picked : null, ladder: sit };
    } else if (picked) {
      cur = { m, n: picked.n, h: picked.h.slice(), f: picked.f, q: picked.q, item: picked };
    } else {
      const make = () => {
        const n = P.ri(m.n[0], m.n[1]);
        const k = Math.min(m.k(n), n - 1) || 1;
        const h = P.roll(k);
        const f = P.ri(1, 6);
        let q = Math.round(n * P.pFace(f, m.wild) + (Math.random() < m.bluff ? P.ri(1, 3) : P.ri(-2, 1)));
        q = Math.max(1, Math.min(n, q));
        return { n, h, f, q };
      };
      const thr = threshold();
      // расклады, где ни один ход не проходит порог, не показываем: на них нечему учиться
      const sit = pickSolvable(make, (s) => hasGoodMove({
        bid: { q: s.q, f: s.f }, total: s.n, hand: s.h, wild: m.wild, threshold: thr, probBid: (...a) => P.probBid(...a),
      }));
      cur = { m, ...sit, item: null };
    }

    if (cur.item) seenAt.set(situationKey(cur.item), shownCount);
    answered = false;
    timer.start();
    if ($('#tDescText')) { $('#tDescName').textContent = m.name; $('#tDescText').textContent = m.d; }
    else if ($('#tDesc')) $('#tDesc').textContent = m.d;   // старая разметка из кэша
    if ($('#tTask')) {
      // Вопрос крупно, правило — подсказкой; со старой разметкой из кэша весь текст остаётся в одном абзаце
      if ($('#tTaskRule')) { $('#tTask').textContent = TASK_QUESTION; $('#tTaskRule').textContent = TASK_RULE; }
      else $('#tTask').textContent = TASK_TEXT;
    }
    if ($('#tInfo')) {
      $('#tInfo').innerHTML =
        (cur.item ? `<li class="chip is-param trainer-repeat">${repeatChipText(cur.item)}</li>` : '') +
        situationParams({ total: cur.n, wild: m.wild, opponents: cur.ladder ? cur.ladder.ks.length : null })
          .map((p) => `<li class="chip is-param${p.accent ? ' is-accent' : ''}"><span>${p.label}</span> <b>${p.value}</b></li>`).join('');
    }
    const note = $('#tRepeatNote');
    if (note) {
      note.hidden = !cur.item;
      note.textContent = cur.item ? repeatReason() : '';
    }
    if ($('#tHand')) $('#tHand').innerHTML = renderHand(cur.h, m.wild);
    $('#tSit')?.classList.toggle('is-ladder', !!cur.ladder);
    if ($('#tBidLabel')) $('#tBidLabel').textContent = cur.ladder ? BID_LABEL_LADDER : BID_LABEL;
    if ($('#tBid')) $('#tBid').innerHTML = cur.ladder ? ladderBidsHtml(cur.ladder) : `<span class="tm-bid-value"><b>${cur.q}×</b>${renderDie(cur.f, 'md')}</span>`;
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
  /** История торгов: номер, кто назвал, ставка; последняя отмечена. */
  function ladderBidsHtml(sit) {
    const names = ladderNames(sit);
    return '<ol class="read-bids" aria-label="Ставки по порядку">' + sit.bids.map((b, i) =>
      `<li class="read-bid${i === sit.bids.length - 1 ? ' is-me' : ''}"><span class="read-bid-n">${i + 1}</span>` +
      `<span class="read-bid-who">${escapeHtml(names[b.s])}${i === sit.bids.length - 1 ? ' (последняя)' : ''}</span>${renderBid(b.q, b.f)}</li>`).join('') + '</ol>';
  }
  function updateSettingsHint() {
    const el = $('#tSettingsHint');
    if (!el) return;
    const thr = threshold();
    el.textContent = `${modeLabel($('#tMode').value)} · порог ${thresholdPct(thr)}`;
    const rule = $('#tThrRule');
    if (rule) rule.innerHTML = thresholdRuleHtml(thr, modeLabel($('#tMode').value));
    syncModePick();
  }

  /** Варианты хода по шансу ставки; choice — что выбрал игрок: { type: 'dudo' } или { type: 'raise', q, f }. */
  function hint(choice) {
    if (!cur) return '';
    const thr = threshold();
    const { options } = compareOptions({
      bid: { q: cur.q, f: cur.f }, total: cur.n, hand: cur.h, wild: cur.m.wild,
      threshold: thr, probBid: (...args) => P.probBid(...args),
    });
    return optionsHtml(markChosen(applyTrainerRule(options, thr), choice), thr, chanceText);
  }

  /** Плашка итога по ответу: шанс выбранного хода и порог. */
  function plaque(kind, good, chance, t, grade) {
    return plaqueHtml(plaqueModel({ kind, good, noGoodMove: !!grade?.noGoodMove, chance, threshold: t, noGoodNote: NO_GOOD_NOTE }));
  }

  /** Блок «Шанс при повышении» вокруг выбранной ставки; chanceOf — шанс ставки в текущем режиме. */
  function raiseBlock(mine, t, chanceOf) {
    return raiseBlockHtml(raiseNeighbours({
      q: mine.q, f: mine.f, bid: { q: cur.q, f: cur.f }, total: cur.n, wild: cur.m.wild, threshold: t, chanceOf,
    }), t);
  }

  /** Разбор хода: для повышения блок шансов, затем оговорка, лучший ход (если ответ неверен) и полный список вариантов. */
  function breakdownHtml({ kind, mine, t, g }) {
    const chanceOf = (q, f) => P.probBid(q, f, cur.n, cur.h, cur.m.wild);
    return (kind === 'raise' ? raiseBlock(mine, t, chanceOf) : '') + feedbackNoteHtml() +
      (g.good ? '' : `<section class="fb-block is-best"><h4 class="fb-title">Лучший ход</h4><p>${correctMoveText(g.best, chanceText, (a, c) => renderBid(a, c))}</p></section>`) +
      `<details class="trainer-all"><summary>Все варианты по шансу</summary>${hint(kind === 'dudo' ? { type: 'dudo' } : { type: 'raise', q: mine.q, f: mine.f })}</details>`;
  }

  /** @param {string} top плашка итога; html — остальной разбор */
  function answer(good, top, html, grade = null) {
    if (answered || !cur) return;
    answered = true;
    timer.stop();

    const mk = $('#tMode').value;
    const taskMode = tasks.active();   // задачи онбординга: ни статистики, ни очереди повторов
    if (!taskMode) {
      updateStats((S) => {
        S.n++;
        S.byMode[mk] = S.byMode[mk] || { n: 0, good: 0 };
        S.byMode[mk].n++;
        if (good) { S.good++; S.byMode[mk].good++; }
        if (cur.ladder) S.byTag = addLadderResult(S.byTag, good);   // тема «торги с несколькими соперниками»
      });

      if (cur.item) {
        if (good) {
          cur.item.streak = (cur.item.streak || 0) + 1;
          if (cur.item.streak >= REPEAT_GOAL) queue = queue.filter((x) => x !== cur.item);
        } else {
          cur.item.streak = 0;
        }
      } else if (!good) {
        const entry = { mode: mk, n: cur.n, h: cur.h.slice(), f: cur.f, q: cur.q, streak: 0 };
        if (cur.ladder) Object.assign(entry, { wild: cur.ladder.wild, ks: cur.ladder.ks.slice(), names: ladderNames(cur.ladder), bids: cur.ladder.bids.map((b) => ({ ...b })) });
        queue.push(entry);
        seenAt.set(situationKey(entry), shownCount);   // только что показана: повтор не раньше чем через паузу
      }
      persist();
    } else {
      tasks.answered();
    }
    if ($('#tFb')) {
      $('#tFb').innerHTML = top + (cur.item ? `<p class="trainer-repeat-note">${repeatAfterText(cur.item, good)}</p>` : '') + html;
    }
    setAnswered(true);
    syncNext();
    $('#tNext')?.focus();
  }

  /** Разбор лестницы: шансы последней ставки по вашим кубикам и с учётом стола. */
  /** Верный ход, если выбран другой (как в «Лучшем ходе» обычных режимов). */
  function ladderBestHtml(g) {
    return g.good ? '' : `<p>${correctMoveText(g.best, chanceText, (a, c) => renderBid(a, c))}</p>`;
  }

  function ladderHtml(sit, ch) {
    return '<ul class="read-lines">' + ladderLines(sit, ch).map((l) => `<li>${l}</li>`).join('') + '</ul>';
  }

  /** Оценка хода по единому правилу (см. trainer_grade.js). */
  function grade(choice) {
    return gradeMove({
      bid: { q: cur.q, f: cur.f }, total: cur.n, hand: cur.h, wild: cur.m.wild,
      threshold: threshold(), probBid: (...a) => P.probBid(...a), choice,
    });
  }

  const dudoBtn = $('#tDudo');
  if (dudoBtn) dudoBtn.onclick = () => {
    if (answered || !cur) return;
    const { m, h, f, q, n } = cur;
    const t = threshold();
    if (cur.ladder) {
      const ch = ladderChances(cur.ladder, P);
      const g = gradeLadder(cur.ladder, t, P, { type: 'dudo' });
      answer(g.good, plaque('dudo', g.good, 1 - ch.pRead, t, g),
        `<p>С учётом стола ставка верна с шансом <b>${chanceText(ch.pRead)}</b> (порог ${pct(t)}): ` +
        `«Не верю» сработает с шансом ${chanceText(1 - ch.pRead)}.</p>${feedbackNoteHtml()}${ladderBestHtml(g)}${ladderHtml(cur.ladder, ch)}`, g);
      return;
    }
    const p = P.probBid(q, f, n, h, m.wild);
    const g = grade({ type: 'dudo' });
    answer(g.good, plaque('dudo', g.good, 1 - p, t, g), breakdownHtml({ kind: 'dudo', mine: null, t, g }), g);
  };

  const raiseBtn = $('#tRaise');
  if (raiseBtn) raiseBtn.onclick = () => {
    if (answered || !cur) return;
    const { m, n, h } = cur;
    const t = threshold();
    const Q = +$('#tQ').value;
    const F = +$('#tF').value;

    const check = checkRaise(Q, F, cur);
    if (!check.ok) { flash($('#tFb'), check.message); return; }

    if (cur.ladder) {
      const ch = ladderChances(cur.ladder, P);
      const opps = cur.ladder.ks.map((k, i) => ({ k, faces: [...new Set(cur.ladder.bids.filter((b) => b.s === i).map((b) => b.f))] }));
      const chanceOf = (a, b) => P.probBidRead(a, b, h, opps, m.wild, TABLE_TRUST);
      const pr = chanceOf(Q, F);
      const g = gradeLadder(cur.ladder, t, P, { type: 'raise', q: Q, f: F });
      answer(g.good, plaque('raise', g.good, pr, t, g), raiseBlock({ q: Q, f: F }, t, chanceOf) +
        `<p>Ваша ставка ${renderBid(Q, F)} с учётом стола верна с шансом <b>${chanceText(pr)}</b> (порог ${pct(t)}).</p>` +
        `${feedbackNoteHtml()}${ladderBestHtml(g)}${ladderHtml(cur.ladder, ch)}`, g);
      return;
    }

    const p = P.probBid(Q, F, n, h, m.wild);
    const g = grade({ type: 'raise', q: Q, f: F });
    answer(g.good, plaque('raise', g.good, p, t, g), breakdownHtml({ kind: 'raise', mine: { q: Q, f: F }, t, g }), g);
  };

  if ($('#tNew')) $('#tNew').onclick = () => newSituation();
  /** После последней задачи знакомства «Новая ситуация» превращается в «Завершить знакомство». */
  function syncNext() {
    const b = $('#tNext');
    if (b) b.textContent = tasks.finishPending() ? FINISH_TEXT.finishButton : '🔄 Новая ситуация';
  }
  if ($('#tNext')) {
    $('#tNext').onclick = () => {
      if (tasks.finishPending()) { tasks.openFinish(); return; }
      newSituation();
      $('#tDudo')?.focus();
    };
  }

  if ($('#tMode')) {
    $('#tMode').onchange = () => {
      updateSettingsHint();   // ← сначала обновляем подпись
      newSituation();          // ← потом генерируем новую ситуацию
    };
  }

  if ($('#tT')) {
    $('#tT').addEventListener('input', updateSettingsHint);
    // по уходу из поля показываем то значение, которое реально применяется (5–95, целые проценты)
    $('#tT').addEventListener('change', () => { $('#tT').value = String(thresholdPercentFromInput($('#tT').value)); updateSettingsHint(); });
    // «−» и «+» двигают порог на 5 процентов в пределах 5–95
    const stepThr = (dir) => {
      $('#tT').value = String(stepThresholdPercent($('#tT').value, dir));
      updateSettingsHint();
    };
    if ($('#tTMinus')) $('#tTMinus').onclick = () => stepThr(-1);
    if ($('#tTPlus')) $('#tTPlus').onclick = () => stepThr(1);
  }
  if ($('#tReset')) $('#tReset').onclick = () => {
    if (!window.confirm(RESET_CONFIRM)) return;
    updateStats(resetTrainerStats);   // упражнения и чужие темы остаются: стирается только то, что копит сам Тренажёр
    queue = [];
    persist();
    newSituation();
  };

  tasks.refresh();
  newSituation();

  return {
    /** Очередь дополняют из итога партии («Добавить в очередь повторов»): при заходе в тренажёр читаем её заново. */
    reloadQueue() {
      queue = getTrainingQueue();
      if (tasks.refresh()) {   // начались задачи онбординга: базовые настройки и новая ситуация
        $('#tMode').value = Object.keys(MODES)[0];
        $('#tT').value = '50';
        newSituation();
      }
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
