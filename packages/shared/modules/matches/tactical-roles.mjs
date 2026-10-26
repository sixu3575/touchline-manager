import { FORMATIONS } from '../tactics/index.mjs';

export const tacticalRoleOf = (actor) => actor.tacticalRole ?? actor.player.role;

/** Assign every available player a broad match role for a changed formation. */
export function assignFormationRoles(actors, side, formation) {
  const counts = FORMATIONS[formation];
  if (!counts) throw Error('Unknown formation');
  const available = actors.filter((actor) => actor.side === side && !actor.sentOff);
  const assignments = new Map();
  const used = new Set();
  for (const [role, count] of Object.entries(counts)) {
    const natural = available.filter((actor) => actor.player.role === role).slice(0, count);
    for (const actor of natural) {
      assignments.set(actor, role);
      used.add(actor);
    }
  }
  const preference = {
    GK: { GK: 0, DEF: 20, MID: 30, FWD: 40 },
    DEF: { DEF: 0, MID: 2, FWD: 5, GK: 100 },
    MID: { MID: 0, DEF: 2, FWD: 2, GK: 100 },
    FWD: { FWD: 0, MID: 2, DEF: 5, GK: 100 },
  };
  for (const role of ['GK', 'DEF', 'MID', 'FWD']) {
    let remaining = counts[role] - [...assignments.values()].filter((value) => value === role).length;
    if (remaining <= 0) continue;
    const candidates = available
      .filter((actor) => !used.has(actor))
      .sort(
        (a, b) =>
          preference[role][a.player.role] - preference[role][b.player.role] ||
          a.index - b.index,
      );
    while (remaining-- > 0 && candidates.length) {
      const actor = candidates.shift();
      assignments.set(actor, role);
      used.add(actor);
    }
  }
  return assignments;
}
