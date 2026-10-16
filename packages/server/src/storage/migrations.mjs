import { addDays, seasonStart } from '../../../shared/core/index.mjs';
import { migratePlayer } from '../../../shared/modules/players/index.mjs';

export const CURRENT_SCHEMA = 2;
export function migrateState(state) {
  if (state.schemaVersion === CURRENT_SCHEMA) return { state, changed: false };
  if (state.schemaVersion !== 1) throw Error('Unsupported save schema: ' + state.schemaVersion);
  // Clone first: a failed migration must never partially modify the caller's state.
  const next = structuredClone(state);
  next.gameDate = addDays(seasonStart(next.season), next.round * 7);
  for (const p of [...next.clubs.flatMap((c) => c.players), ...next.market])
    migratePlayer(p, next.seed, next.gameDate);
  next.schemaVersion = CURRENT_SCHEMA;
  next.revision++; // Old browser tabs must reload before writing to the migrated save.
  return { state: next, changed: true };
}
export function migrateDatabase(db) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const update = db.prepare('UPDATE saves SET state=?,updated_at=? WHERE id=?');
    let count = 0;
    for (const row of db.prepare('SELECT id,state FROM saves').iterate()) {
      const result = migrateState(JSON.parse(row.state));
      if (result.changed) {
        update.run(JSON.stringify(result.state), new Date().toISOString(), row.id);
        count++;
      }
    }
    db.exec('COMMIT');
    return count;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
