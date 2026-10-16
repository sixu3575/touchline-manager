import { joinClub } from '../players/index.mjs';
import { enough, money } from '../economy/index.mjs';
export function sign(g, payload, rng) {
  const me = g.clubs[0];

  if (me.players.length >= 28) throw Error('一线队最多 28 人。');
  const p = g.market.find((p) => p.id === payload.playerId);
  if (!p) throw Error('该球员已离开球探名单。');
  enough(g, p.price);
  money(g, '签约 · ' + p.name, -p.price, 'sign-' + p.id);
  joinClub(p);
  me.players.push(p);
  g.market = g.market.filter((x) => x.id !== p.id);
}
