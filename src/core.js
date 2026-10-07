(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Perudo = factory();
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';

/* ================= Вероятности (порт perudo.py) ================= */
function comb(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 1; i <= k; i++) r = r * (n - k + i) / i;
  return r;
}
const pFace = (face, wild) => (face === 1 || !wild) ? 1 / 6 : 1 / 3;
const own = (hand, face, wild) => hand.filter(d => d === face || (wild && d === 1 && face !== 1)).length;
function atLeast(need, unknown, p) {
  if (need <= 0) return 1;
  if (need > unknown) return 0;
  let s = 0;
  for (let k = need; k <= unknown; k++) s += comb(unknown, k) * Math.pow(p, k) * Math.pow(1 - p, unknown - k);
  return Math.min(1, s);
}
function probBid(q, face, n, hand, wild) {
  return atLeast(q - own(hand, face, wild), n - hand.length, pFace(face, wild));
}
function bestBid(face, n, hand, wild, threshold) {
  let best = 0;
  for (let q = 1; q <= n; q++) if (probBid(q, face, n, hand, wild) >= threshold) best = q;
  return best;
}
function exactProb(q, face, n, hand, wild) {
  const need = q - own(hand, face, wild), unk = n - hand.length;
  if (need < 0 || need > unk) return 0;
  const p = pFace(face, wild);
  return comb(unk, need) * Math.pow(p, need) * Math.pow(1 - p, unk - need);
}

/* Эвристика «чтение ставок» */
function probBidRead(q, face, hand, opps, wild, trust) {
  trust = trust || 0;
  const need = q - own(hand, face, wild);
  if (need <= 0) return 1;
  const p0 = pFace(face, wild);
  const probs = [];
  for (const o of opps) {
    const p = o.faces && o.faces.includes(face) ? p0 + trust * (1 - p0) : p0;
    for (let i = 0; i < o.k; i++) probs.push(p);
  }
  if (need > probs.length) return 0;
  let dist = [1];
  for (const p of probs) {
    const nd = new Array(dist.length + 1).fill(0);
    for (let i = 0; i < dist.length; i++) { nd[i] += dist[i] * (1 - p); nd[i + 1] += dist[i] * p; }
    dist = nd;
  }
  let s = 0;
  for (let k = need; k < dist.length; k++) s += dist[k];
  return Math.min(1, s);
}

/* =============================================================
   CFR для дуэли «1 кубик на 1 кубик».
   Здесь нужен внутренний legal — он специфичен для wild=true и
   используется только при построении дерева.
   Публичный legal/minLegal живут в rules.js.
   ============================================================= */
function legal(Q, F, b) {
  const wild = true;
  if (!Number.isInteger(Q) || Q < 1 || !Number.isInteger(F) || F < 1 || F > 6) return false;
  if (!b) return F !== 1;
  if (F === 1 && b.f !== 1) return Q >= Math.ceil(b.q / 2);
  if (b.f === 1 && F !== 1) return Q >= b.q * 2 + 1;
  return Q > b.q || (Q === b.q && F > b.f);
}

function buildDuelTree(maxQ) {
  maxQ = maxQ || 2;
  const rules = { wild: true };
  const nodes = [];
  function mk(hist, last, p) {
    const node = { hist, last, p, acts: [], kids: [], key: hist.map(b => b.q + 'x' + b.f).join(',') };
    nodes.push(node);
    if (last) node.acts.push('D');
    for (let q = 1; q <= maxQ; q++) for (let f = 1; f <= 6; f++) if (legal(q, f, last, rules)) {
      node.acts.push({ q, f });
      node.kids.push(mk(hist.concat([{ q, f }]), { q, f }, 1 - p));
    }
    const A = node.acts.length;
    node.regret = Array.from({ length: 6 }, () => new Float64Array(A));
    node.ssum = Array.from({ length: 6 }, () => new Float64Array(A));
    node.avg = null;
    return node;
  }
  const root = mk([], null, 0);
  return { root, nodes, maxQ };
}
function duelCount(h0, h1, f) {
  const m = d => (d + 1 === f || (f !== 1 && d + 1 === 1)) ? 1 : 0;
  return m(h0) + m(h1);
}
function sigmaOf(node, h, out) {
  const A = node.acts.length, r = node.regret[h];
  let s = 0;
  for (let a = 0; a < A; a++) { out[a] = r[a] > 0 ? r[a] : 0; s += out[a]; }
  if (s > 0) for (let a = 0; a < A; a++) out[a] /= s; else for (let a = 0; a < A; a++) out[a] = 1 / A;
}
function solveDuel(opts) {
  opts = opts || {};
  const iters = opts.iters || 400, tree = buildDuelTree(opts.maxQ || 2);
  function walk(node, r0, r1, t) {
    const p = node.p, A = node.acts.length;
    const rp = p === 0 ? r0 : r1, ro = p === 0 ? r1 : r0;
    const sg = Array.from({ length: 6 }, () => new Float64Array(A));
    for (let h = 0; h < 6; h++) sigmaOf(node, h, sg[h]);
    const uPa = [], uOa = [];
    let kid = 0;
    for (let a = 0; a < A; a++) {
      const act = node.acts[a], up = new Float64Array(6), uo = new Float64Array(6);
      if (act === 'D') {
        const q = node.last.q, f = node.last.f;
        for (let h = 0; h < 6; h++) for (let o = 0; o < 6; o++) {
          const caller = (duelCount(p === 0 ? h : o, p === 0 ? o : h, f) < q) ? 1 : -1;
          up[h] += ro[o] * caller;
          uo[o] += rp[h] * sg[h][a] * (-caller);
        }
      } else {
        const nrp = new Float64Array(6);
        for (let h = 0; h < 6; h++) nrp[h] = rp[h] * sg[h][a];
        const res = p === 0 ? walk(node.kids[kid], nrp, ro, t) : walk(node.kids[kid], ro, nrp, t);
        kid++;
        const cp = p === 0 ? res[0] : res[1], co = p === 0 ? res[1] : res[0];
        for (let i = 0; i < 6; i++) { up[i] = cp[i]; uo[i] = co[i]; }
      }
      uPa.push(up); uOa.push(uo);
    }
    const uP = new Float64Array(6), uO = new Float64Array(6);
    for (let h = 0; h < 6; h++) for (let a = 0; a < A; a++) uP[h] += sg[h][a] * uPa[a][h];
    for (let o = 0; o < 6; o++) for (let a = 0; a < A; a++) uO[o] += uOa[a][o];
    for (let h = 0; h < 6; h++) for (let a = 0; a < A; a++) {
      const r = node.regret[h][a] + uPa[a][h] - uP[h];
      node.regret[h][a] = r > 0 ? r : 0;
      node.ssum[h][a] += t * rp[h] * sg[h][a];
    }
    return p === 0 ? [uP, uO] : [uO, uP];
  }
  const ones = () => new Float64Array(6).fill(1 / 6);
  let val = 0;
  for (let t = 1; t <= iters; t++) {
    const res = walk(tree.root, ones(), ones(), t);
    val = 0; for (let h = 0; h < 6; h++) val += res[0][h] / 6;
  }
  for (const node of tree.nodes) {
    const A = node.acts.length;
    node.avg = Array.from({ length: 6 }, (_, h) => {
      const s = node.ssum[h].reduce((x, y) => x + y, 0), o = new Float64Array(A);
      for (let a = 0; a < A; a++) o[a] = s > 0 ? node.ssum[h][a] / s : 1 / A;
      return o;
    });
  }
  tree.value = val; tree.iters = iters;
  tree.exploitability = duelExploitability(tree);
  return tree;
}
function duelExploitability(tree) {
  function br(node, i, r0, r1) {
    const p = node.p, A = node.acts.length;
    const rp = p === 0 ? r0 : r1;
    const ro = p === 0 ? r1 : r0;
    const outs = []; let kid = 0;
    for (let a = 0; a < A; a++) {
      const act = node.acts[a], u = new Float64Array(6);
      if (act === 'D') {
        const q = node.last.q, f = node.last.f;
        for (let h = 0; h < 6; h++) for (let o = 0; o < 6; o++) {
          const callerWin = duelCount(p === 0 ? h : o, p === 0 ? o : h, f) < q ? 1 : -1;
          if (p === i) u[h] += ro[o] * callerWin;
          else u[o] += rp[h] * node.avg[h][a] * (-callerWin);
        }
      } else {
        let child;
        if (p === i) child = br(node.kids[kid], i, r0, r1);
        else {
          const n0 = new Float64Array(6), n1 = new Float64Array(6);
          for (let h = 0; h < 6; h++) { n0[h] = p === 0 ? r0[h] * node.avg[h][a] : r0[h]; n1[h] = p === 1 ? r1[h] * node.avg[h][a] : r1[h]; }
          child = br(node.kids[kid], i, n0, n1);
        }
        kid++;
        for (let h = 0; h < 6; h++) u[h] = child[h];
      }
      outs.push(u);
    }
    const res = new Float64Array(6);
    if (p === i) { for (let h = 0; h < 6; h++) { let m = -Infinity; for (let a = 0; a < A; a++) m = Math.max(m, outs[a][h]); res[h] = m; } }
    else { for (let h = 0; h < 6; h++) for (let a = 0; a < A; a++) res[h] += outs[a][h]; }
    return res;
  }
  const ones = () => new Float64Array(6).fill(1 / 6);
  let total = 0;
  for (const i of [0, 1]) {
    const r = br(tree.root, i, ones(), ones());
    let v = 0; for (let h = 0; h < 6; h++) v += r[h] / 6;
    total += v;
  }
  return total;
}
function duelNode(tree, hist) {
  let n = tree.root;
  for (const b of hist) {
    let kid = 0, found = null;
    for (const a of n.acts) { if (a === 'D') continue; if (a.q === b.q && a.f === b.f) { found = n.kids[kid]; break; } kid++; }
    if (!found) return null; n = found;
  }
  return n;
}
function actLabel(a) { return a === 'D' ? 'Не верю' : `${a.q}×${a.f}`; }

const roll = (k, rng) => Array.from({ length: k }, () => 1 + Math.floor((rng || Math.random)() * 6));
const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pct = x => (x * 100).toFixed(1) + '%';

return {
  comb, pFace, own, atLeast, probBid, bestBid, exactProb, probBidRead,
  buildDuelTree, solveDuel, duelExploitability, duelNode, actLabel, duelCount,
  roll, ri, pct,
};
}));