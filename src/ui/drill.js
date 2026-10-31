// src/ui/drill.js — Упражнения: три тренировки (подсчёт, правило единиц, чтение вскрытия).

import { updateStats } from '../storage.js';
import { renderDie, renderHand, renderBid } from '../table.js';
import { P, $, $$, pct, flash } from './common.js';
import { noSafeText, riskNote } from '../drill_note.js';
import { validateAnswerA, validateAnswerB } from '../drill_input.js';
import { safeByRule, isHalfway } from '../drill_rule.js';
import { setupReadDrill } from './read_drill_view.js';

let drillState = { A: null, B: null };

export function setupDrill() {
  if (!P) return;

  // Одна задача — одна запись в статистике: после проверки кнопка недоступна до «Новое».
  const answered = { A: false, B: false };
  const setAnswered = (k, on) => {
    answered[k] = on;
    const btn = $(`#d${k}Check`);
    if (btn) btn.disabled = on;
  };

  function saveDrill(k, good) {
    updateStats((S) => {
      S.drill[k].n++;
      if (good) S.drill[k].good++;
    });
  }

  function newA() {
    const n = P.ri(8, 30);
    const k = P.ri(1, 5);
    const h = P.roll(k);
    const f = P.ri(1, 6);
    drillState.A = { n, h, f };
    if ($('#dAq')) {
      $('#dAq').innerHTML =
        `Всего кубиков: <b>${n}</b>, единицы — джокеры. Ваши: ${renderHand(h, true)} Цифра: ${renderDie(f, 's')}`;
    }
    if ($('#dA1')) $('#dA1').value = '';
    if ($('#dA2')) $('#dA2').value = '';
    if ($('#dAfb')) $('#dAfb').innerHTML = '';
    setAnswered('A', false);
  }

  function newB() {
    const down = Math.random() < 0.5;
    const q = P.ri(3, 16);
    const f = P.ri(2, 6);
    drillState.B = { down, q, f };
    if ($('#dBq')) {
      $('#dBq').innerHTML = down
        ? `Текущая ставка ${renderBid(q, f)}. Какое <b>минимальное</b> количество единиц можно назвать?`
        : `Текущая ставка ${renderBid(q, 1)} (единицы). Какое <b>минимальное</b> количество обычной цифры можно назвать?`;
    }
    if ($('#dB1')) $('#dB1').value = '';
    if ($('#dBfb')) $('#dBfb').innerHTML = '';
    setAnswered('B', false);
  }

  const checkA = $('#dACheck');
  if (checkA) checkA.onclick = () => {
    const d = drillState.A;
    if (!d || answered.A) return;
    const input = validateAnswerA($('#dA1').value, $('#dA2').value);
    if (!input.ok) { flash($('#dAfb'), input.message); return; }
    const { n, h, f } = d;
    const unk = n - h.length;
    const ownCnt = P.own(h, f, true);
    const pv = f === 1 ? 1 / 6 : 1 / 3;
    const exp = ownCnt + unk * pv;
    const safe = P.bestBid(f, n, h, true, 0.5);
    const pSafe = safe > 0 ? P.probBid(safe, f, n, h, true) : 0;
    const pSafe1 = P.probBid(safe + 1, f, n, h, true);
    const noSafe = safe === 0;

    const { a1, a2 } = input;
    const ok1 = Math.abs(a1 - exp) <= 0.75;
    const ok2 = Math.abs(a2 - safe) <= 1;

    saveDrill('A', ok1 && ok2);
    setAnswered('A', true);

    if ($('#dAfb')) {
      const chance = f === 1 ? '1/6' : '1/3';
      const faceNote = f === 1
        ? 'подходит одна грань из шести — единица'
        : `подходят две грани из шести: «${f}» и единица`;
      const byRule = safeByRule(ownCnt, unk, f);
      const half = isHalfway(ownCnt, unk, f);
      const note = riskNote({
        answer: a2, safe, accepted: ok2,
        chanceAnswer: pct(P.probBid(a2, f, n, h, true)), chanceSafe: pct(pSafe),
      });

      $('#dAfb').innerHTML =
        `<p class="${ok1 ? 'text-ok' : 'text-bad'}">Ожидание: ${a1} → точное ${exp.toFixed(1)} = ` +
        `${ownCnt} (ваши, с джокерами) + ${unk} × ${f === 1 ? '1/6' : '1/3'}.</p>` +
        (noSafe
          ? `<p class="${ok2 ? 'text-ok' : 'text-bad'}">${noSafeText(pct(pSafe1))} Ваш ответ ${a2}. Допуск ±1 — это тренировка прикидки в уме.</p>`
          : `<p class="${ok2 ? 'text-ok' : 'text-bad'}">Безопасная ставка (шанс ≥ 50%): ваш ответ ${a2}, точно ${safe} ` +
            `(${pct(pSafe)}). Допуск ±1 — это тренировка прикидки в уме.</p>`) +
        (note ? `<p class="muted">${note}</p>` : '') +

        `<details class="calc-hint">` +
        `<summary>Как это посчитано</summary>` +
        `<div class="calc-hint-body">` +

        `<p><b>1. Ожидание</b> — сколько нужных кубиков примерно на столе.<br>` +
        `• Ваши подходящие кубики: <b>${ownCnt}</b> ` +
        `(${f === 1 ? 'единицы' : `«${f}» и единицы-джокеры`}).<br>` +
        `• Чужих кубиков: ${n} − ${h.length} = <b>${unk}</b>.<br>` +
        `• Шанс одного чужого: <b>${chance}</b> (${faceNote}).<br>` +
        `Ожидание = ${ownCnt} + ${unk} × ${chance} ≈ <b>${exp.toFixed(1)}</b>.</p>` +

        `<p><b>2. Безопасная ставка.</b><br>` +
        `Округляем к ближайшему целому${half ? ' (ровно посередине — вниз)' : ''}: ` +
        `${exp.toFixed(1)} → <b>${byRule}</b>.<br>` +
        (noSafe
          ? `Проверка точным расчётом: даже ставка 1 сбывается только в ${pct(pSafe1)} случаев (меньше 50% ✘), ` +
            `поэтому безопасной ставки нет — ответ 0.</p>`
          : `Проверка точным расчётом: ставка ${safe} сбывается в ${pct(pSafe)} случаев ` +
            `(не меньше 50% ✔), а ставка ${safe + 1} — только в ${pct(pSafe1)} (меньше 50% ✘).</p>`) +

        `<p class="muted">Ожидание — это среднее, а безопасная ставка — «хватит с шансом 50%». ` +
        `Они отличаются меньше чем на полкубика, поэтому достаточно округлить.</p>` +

        (noSafe ? '' :
        `<p class="muted">Для любознательных. Точный шанс считается по биномиальному распределению: ` +
        `из ${unk} чужих кубиков должно подойти не меньше ${Math.max(0, safe - ownCnt)}. ` +
        `P = Σ<sub>k = ${Math.max(0, safe - ownCnt)}</sub><sup>${unk}</sup> ` +
        `C(${unk}, k) · p<sup>k</sup> · (1 − p)<sup>${unk} − k</sup>, где p = ${chance}.</p>`) +

        `</div>` +
        `</details>`;
    }
  };

  /* ============================================================
   Табы A/B — переключение между панелями без скролла.
   Раньше это делали две кнопки #dANew и #dBNew (каждая со своей
   панелью). Теперь одна кнопка #dNew + переключатель.
   ============================================================ */
  let activeDrill = 'A';
  const readDrill = setupReadDrill();

  document.querySelectorAll('.drill-tab').forEach((btn) => {
    btn.onclick = () => {
      activeDrill = btn.dataset.drill;   // 'A', 'B' или 'C'
      document.querySelectorAll('.drill-tab').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      });
      for (const k of ['A', 'B', 'C']) $(`#dPanel${k}`)?.classList.toggle('hide', activeDrill !== k);
      if (activeDrill === 'C') readDrill?.next();   // раунды могли появиться после партии
      $$('[data-drill-for]').forEach((el) => el.classList.toggle('hide', el.dataset.drillFor !== activeDrill));
    };
  });

  const checkB = $('#dBCheck');
  if (checkB) checkB.onclick = () => {
    const d = drillState.B;
    if (!d || answered.B) return;
    const input = validateAnswerB($('#dB1').value);
    if (!input.ok) { flash($('#dBfb'), input.message); return; }
    const exp = d.down ? Math.ceil(d.q / 2) : d.q * 2 + 1;
    const ok = input.a === exp;
    saveDrill('B', ok);
    setAnswered('B', true);

    if ($('#dBfb')) {
      $('#dBfb').innerHTML =
        `<p class="${ok ? 'text-ok' : 'text-bad'}">${ok ? 'Верно' : 'Неверно'}: ` +
        (d.down
          ? `с обычной цифры на единицы — половина ставки с округлением вверх: ⌈${d.q}/2⌉ = ${exp}`
          : `с единиц на обычную цифру — больше удвоенного: ${d.q}×2+1 = ${exp}`) +
        '.</p>' +

        `<details class="calc-hint">` +
        `<summary>Как это посчитано</summary>` +
        `<div class="calc-hint-body">` +
        (d.down
          ? `<p>Ставка на <b>обычную цифру</b> q = ${d.q}.<br>` +
          `Единицы встречаются вдвое реже, поэтому нужное количество примерно вдвое меньше. ` +
          `Округляем вверх: ⌈${d.q} / 2⌉ = <b>${exp}</b>.</p>`
          : `<p>Ставка на <b>единицы</b> q = ${d.q}.<br>` +
          `Обратный переход: на обычной цифре вероятность на кубик вдвое выше, ` +
          `но ставка должна быть строго «безопаснее» исходной.<br>` +
          `Условие: ⌈q<sub>normal</sub> / 2⌉ &gt; ${d.q}.<br>` +
          `Отсюда q<sub>normal</sub> / 2 &gt; ${d.q} ⇒ q<sub>normal</sub> &gt; ${d.q} × 2 ⇒ ` +
          `наименьшее целое = <b>${d.q} × 2 + 1 = ${exp}</b>.</p>`) +
        `</div>` +
        `</details>`;
    }
  };

  // Одна кнопка «Новое» — работает для активного таба
  const newBtn = $('#dNew');
  if (newBtn) {
    newBtn.onclick = () => {
      if (activeDrill === 'A') newA();
      else if (activeDrill === 'B') newB();
      else readDrill?.next();
    };
  }

  newA();
  newB();
}
