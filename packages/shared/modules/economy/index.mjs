export function money(g, label, amount, id) {
  g.cash += amount;
  g.ledger.unshift({ id, season: g.season, round: g.round, label, amount });
  g.ledger = g.ledger.slice(0, 150);
}
export function enough(g, cost) {
  if (g.cash < cost) throw Error('俱乐部资金不足。');
}
