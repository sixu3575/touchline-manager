import { rating } from '../players/index.mjs';
export const FORMATIONS = {
  '4-4-2': { GK: 1, DEF: 4, MID: 4, FWD: 2 },
  '4-3-3': { GK: 1, DEF: 4, MID: 3, FWD: 3 },
  '3-5-2': { GK: 1, DEF: 3, MID: 5, FWD: 2 },
};
export function bestLineup(club, formation = club.tactics.formation) {
  return Object.entries(FORMATIONS[formation]).flatMap(([role, count]) =>
    club.players
      .filter((p) => p.role === role)
      .sort((a, b) => rating(b) * b.fitness - rating(a) * a.fitness)
      .slice(0, count)
      .map((p) => p.id),
  );
}
export function validateLineup(club, ids, formation) {
  if (
    !Object.hasOwn(FORMATIONS, formation) ||
    !Array.isArray(ids) ||
    ids.length !== 11 ||
    new Set(ids).size !== 11
  )
    throw Error('需要选择 11 名不同球员。');
  const selected = ids.map((id) => club.players.find((p) => p.id === id));
  if (selected.some((p) => !p)) throw Error('阵容包含不属于本队的球员。');
  for (const [role, count] of Object.entries(FORMATIONS[formation]))
    if (selected.filter((p) => p.role === role).length !== count)
      throw Error('阵容位置与 ' + formation + ' 不符，请自动排阵或调整球员。');
}
export function saveTactics(g, payload, rng) {
  const me = g.clubs[0];

  const formation = payload.formation;
  const style = payload.style;
  const press = payload.press;
  if (
    !Object.hasOwn(FORMATIONS, formation) ||
    !['balanced', 'possession', 'counter', 'wide'].includes(style) ||
    !['low', 'normal', 'high'].includes(press)
  )
    throw Error('战术选项无效。');
  const ids = payload.auto ? bestLineup(me, formation) : payload.lineup;
  validateLineup(me, ids, formation);
  me.tactics = { formation, style, press };
  me.lineup = [...ids];
}
