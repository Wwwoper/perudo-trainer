// rules.js — правила ставок Perudo
// Используется игровым движком и UI для проверки допустимости ходов
// Не зависит от модуля вероятностей

export function legal(Q, F, b, rules) {
  const wild = !rules || rules.wild !== false;
  if (!Number.isInteger(Q) || Q < 1 || !Number.isInteger(F) || F < 1 || F > 6) return false;
  if (!b) return wild ? F !== 1 : true;
  if (!wild) return F === b.f && Q > b.q;
  if (F === 1 && b.f !== 1) return Q >= Math.ceil(b.q / 2);
  if (b.f === 1 && F !== 1) return Q >= b.q * 2 + 1;
  return Q > b.q || (Q === b.q && F > b.f);
}

export function minLegal(b, n, rules) {
  for (let q = 1; q <= n; q++)
    for (let f = 1; f <= 6; f++)
      if (legal(q, f, b, rules)) return { q, f };
  return null;
}

export function onesDown(q) {
  return Math.ceil(q / 2);
}

export function onesUp(q) {
  return q * 2 + 1;
}
