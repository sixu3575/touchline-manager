import { createHash } from 'node:crypto';
import {
  reprofilePlayer,
  observationPlayer,
  rating,
} from '../../../shared/modules/players/index.mjs';
export const stateDigest = (text) => createHash('sha256').update(text).digest('hex');
const playerWage = (p) => Math.round((rating(p) * 18 + 100) / 50) * 50;

// Explicit offline maintenance only. No HTTP endpoint or normal-startup rewriting.
export function reshapeState(source, grantStar = false) {
  if (source.schemaVersion !== 3) throw Error('Maintenance requires current schema 3');
  const next = structuredClone(source);
  let changed = 0;
  for (const p of [...next.clubs.flatMap((c) => c.players), ...next.market])
    changed += Number(reprofilePlayer(p, next.seed));
  let wagesChanged = 0;
  for (const p of [...next.clubs.flatMap((c) => c.players), ...next.market])
    if (p.id === 'observation-star-v1' && (!Number.isFinite(p.wage) || p.wage <= 0)) {
      p.wage = playerWage(p);
      wagesChanged++;
    }
  const club = next.clubs[0];
  let granted = false;
  if (
    grantStar &&
    !next.playerProfileGrant &&
    ![...next.clubs.flatMap((c) => c.players), ...next.market].some(
      (p) => p.id === 'observation-star-v1',
    )
  ) {
    if (club.id !== 'me') throw Error('Expected player club');
    if (club.players.some((p) => p.number === 99)) throw Error('Shirt 99 already occupied');
    const p = observationPlayer(next.seed, next.gameDate);
    const forwards = club.lineup.filter(
      (id) => club.players.find((p) => p.id === id)?.role === 'FWD',
    );
    if (!forwards.length) throw Error('No striker slot available');
    const replace = forwards[Math.floor((forwards.length - 1) / 2)];
    p.wage = playerWage(p);
    club.lineup = club.lineup.map((id) => (id === replace ? p.id : id));
    club.players.push(p);
    next.playerProfileGrant = { version: 1, playerId: p.id };
    granted = true;
  }
  if (changed || granted || wagesChanged) next.revision++;
  return {
    state: next,
    changed,
    granted,
    star: grantStar
      ? club.players
          .filter((p) => p.id === 'observation-star-v1')
          .map((p) => ({
            id: p.id,
            name: p.name,
            number: p.number,
            rating: rating(p),
            wage: p.wage,
          }))[0]
      : undefined,
    wagesChanged,
  };
}
export function maintenancePlan(db, targetSeed) {
  if (db.prepare("SELECT count(*) AS n FROM match_jobs WHERE status!='complete'").get().n)
    throw Error('Wait for all match jobs to complete');
  const rows = db.prepare('SELECT id,state FROM saves ORDER BY id').all();
  const targets = rows.filter((r) => JSON.parse(r.state).seed === targetSeed);
  if (targets.length !== 1) throw Error('Target seed must identify exactly one save');
  return {
    version: 1,
    targetSeed,
    rows: rows.map((r) => {
      const source = JSON.parse(r.state),
        target = r.id === targets[0].id;
      const result = reshapeState(source, target);
      return {
        id: r.id,
        before: stateDigest(r.state),
        after: stateDigest(JSON.stringify(result.state)),
        revision: source.revision,
        changed: result.changed,
        wagesChanged: result.wagesChanged,
        granted: result.granted,
        target,
        club: source.clubs[0].name,
        star: result.star,
      };
    }),
  };
}
export function applyMaintenance(db, plan, now = new Date().toISOString()) {
  if (plan.version !== 1) throw Error('Unknown maintenance plan');
  db.exec('BEGIN IMMEDIATE');
  try {
    const current = maintenancePlan(db, plan.targetSeed);
    if (JSON.stringify(current) !== JSON.stringify(plan))
      throw Error('Stale plan: current saves changed');
    const write = db.prepare('UPDATE saves SET state=?,updated_at=? WHERE id=? AND state=?');
    for (const item of plan.rows) {
      if (!item.changed && !item.wagesChanged && !item.granted) continue;
      const row = db.prepare('SELECT state FROM saves WHERE id=?').get(item.id);
      const result = reshapeState(JSON.parse(row.state), item.target),
        text = JSON.stringify(result.state);
      if (stateDigest(text) !== item.after) throw Error('Unexpected maintenance output');
      if (write.run(text, now, item.id, row.state).changes !== 1)
        throw Error('Concurrent save update');
    }
    db.exec('COMMIT');
    return {
      saves: plan.rows.filter((r) => r.changed || r.wagesChanged || r.granted).length,
      players: plan.rows.reduce((s, r) => s + r.changed, 0),
      wageRepairs: plan.rows.reduce((s, r) => s + r.wagesChanged, 0),
      grants: plan.rows.filter((r) => r.granted).length,
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
