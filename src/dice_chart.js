// dice_chart.js — график «кубики по раундам» (SVG-строка). Цвета и штрихи задаются классами в CSS из токенов темы:
// различать линии можно не только по цвету, у каждой линии есть подпись с именем у конца.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fx = (n) => Math.round(n * 10) / 10;

const PAD = { l: 24, r: 78, t: 10, b: 22 };
const LABEL_GAP = 12;

/**
 * @param {{labels: string[], series: {id: string, isMe: boolean, values: number[]}[], max: number}} data результат diceByRound
 * @param {{names?: Object<string,string>, width?: number, height?: number}} [o]
 * @returns {string} разметка <svg> или пустая строка, если данных нет
 */
export function diceChartSvg(data, { names = {}, width = 340, height = 160 } = {}) {
  if (!data || !Array.isArray(data.series) || !data.series.length || !data.labels.length) return '';
  const n = data.labels.length;
  const innerW = width - PAD.l - PAD.r;
  const innerH = height - PAD.t - PAD.b;
  const max = Math.max(1, data.max | 0);
  const x = (i) => PAD.l + (n === 1 ? innerW / 2 : (innerW * i) / (n - 1));
  const y = (v) => PAD.t + innerH - (innerH * v) / max;

  const parts = [];
  // сетка и подписи оси кубиков: каждое целое, если их немного, иначе 0 и максимум
  const ticks = max <= 6 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, max];
  for (const t of ticks) {
    parts.push(`<line class="chart-grid" x1="${PAD.l}" x2="${fx(width - PAD.r)}" y1="${fx(y(t))}" y2="${fx(y(t))}"/>`);
    parts.push(`<text class="chart-tick" x="${PAD.l - 6}" y="${fx(y(t) + 4)}" text-anchor="end">${t}</text>`);
  }
  // подписи оси раундов: первая, последняя и несколько между ними
  const step = n <= 8 ? 1 : Math.ceil(n / 6);
  data.labels.forEach((l, i) => {
    if (i % step === 0 || i === n - 1) {
      parts.push(`<text class="chart-tick" x="${fx(x(i))}" y="${height - 6}" text-anchor="middle">${esc(l)}</text>`);
    }
  });

  // линии: сначала чужие, ваша сверху
  const order = [...data.series.keys()].sort((a, b) => Number(data.series[a].isMe) - Number(data.series[b].isMe));
  const ends = [];
  for (const k of order) {
    const s = data.series[k];
    const cls = s.isMe ? 'chart-me' : `chart-other chart-s${(k % 5) + 1}`;
    const pts = s.values.map((v, i) => `${fx(x(i))},${fx(y(v))}`);
    parts.push(`<polyline class="chart-line ${cls}" points="${pts.join(' ')}"/>`);
    s.values.forEach((v, i) => parts.push(`<circle class="chart-dot ${cls}" cx="${fx(x(i))}" cy="${fx(y(v))}" r="2.5"/>`));
    ends.push({ y: y(s.values[s.values.length - 1]), text: s.isMe ? 'Вы' : String(names[s.id] ?? s.id), cls });
  }
  // подписи у конца линий не накладываются друг на друга
  ends.sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < LABEL_GAP) ends[i].y = ends[i - 1].y + LABEL_GAP;
  for (const e of ends) {
    parts.push(`<text class="chart-name ${e.cls}" x="${fx(x(n - 1) + 8)}" y="${fx(e.y + 4)}">${esc(e.text.length > 12 ? `${e.text.slice(0, 11)}…` : e.text)}</text>`);
  }

  const desc = data.series.map((s) => `${s.isMe ? 'Вы' : String(names[s.id] ?? s.id)}: ${s.values.join(', ')}`).join('; ');
  return `<svg class="dice-chart" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="diceChartT diceChartD">` +
    `<title id="diceChartT">Кубики по раундам</title>` +
    `<desc id="diceChartD">Число кубиков в начале раундов ${esc(data.labels.join(', '))}. ${esc(desc)}.</desc>` +
    parts.join('') + '</svg>';
}
