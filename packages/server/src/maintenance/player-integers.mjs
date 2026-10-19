import { createHash } from 'node:crypto';
import { integerizePlayer } from '../../../shared/modules/players/index.mjs';
const digest = (text) => createHash('sha256').update(text).digest('hex');

// Explicit offline conversion; no startup migration, reset, reshaping or grants.
export function integerizeState(source) {
  if (source.schemaVersion !== 3) throw Error('Integer conversion requires schema 3');
  const state = structuredClone(source);
  let changed = 0,
    maxDelta = 0;
  for (const p of [...state.clubs.flatMap((c) => c.players), ...state.market]) {
    const before = { ...p.attributes };
    changed += Number(integerizePlayer(p));
    for (const key of Object.keys(before))
      maxDelta = Math.max(maxDelta, Math.abs(before[key] - p.attributes[key]));
  }
  if (changed) state.revision++;
  return { state, changed, maxDelta };
}
export function integerPlan(db) {
  if (db.prepare("SELECT count(*) AS n FROM match_jobs WHERE status!='complete'").get().n)
    throw Error('Wait for all match jobs to complete');
  return {
    version: 1,
    operation: 'integer-player-attributes',
    rows: db
      .prepare('SELECT id,state FROM saves ORDER BY id')
      .all()
      .map((row) => {
        const source = JSON.parse(row.state),
          result = integerizeState(source);
        return {
          id: row.id,
          revision: source.revision,
          before: digest(row.state),
          after: digest(JSON.stringify(result.state)),
          changed: result.changed,
          maxDelta: result.maxDelta,
        };
      }),
  };
}
export function applyIntegerPlan(db, plan, now = new Date().toISOString()) {
  if (plan.version !== 1 || plan.operation !== 'integer-player-attributes')
    throw Error('Unknown integer conversion plan');
  db.exec('BEGIN IMMEDIATE');
  try {
    if (JSON.stringify(integerPlan(db)) !== JSON.stringify(plan))
      throw Error('Stale integer conversion plan');
    const update = db.prepare('UPDATE saves SET state=?,updated_at=? WHERE id=? AND state=?');
    for (const row of plan.rows) {
      if (!row.changed) continue;
      const old = db.prepare('SELECT state FROM saves WHERE id=?').get(row.id).state;
      const text = JSON.stringify(integerizeState(JSON.parse(old)).state);
      if (digest(text) !== row.after) throw Error('Unexpected integer conversion output');
      if (update.run(text, now, row.id, old).changes !== 1) throw Error('Concurrent save update');
    }
    db.exec('COMMIT');
    return {
      saves: plan.rows.filter((r) => r.changed).length,
      players: plan.rows.reduce((sum, r) => sum + r.changed, 0),
      maxAbilityDelta: Math.max(0, ...plan.rows.map((r) => r.maxDelta)),
    };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
