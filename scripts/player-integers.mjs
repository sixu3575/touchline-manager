import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  integerPlan,
  applyIntegerPlan,
} from '../packages/server/src/maintenance/player-integers.mjs';
const [mode, database, planPath] = process.argv.slice(2);
if (!['plan', 'apply'].includes(mode) || !database || !planPath)
  throw Error('Usage: player-integers.mjs plan|apply DB PLAN.json');
if (!existsSync(resolve(database))) throw Error('Existing database required');
const db = new DatabaseSync(resolve(database), { readOnly: mode === 'plan' });
db.exec('PRAGMA busy_timeout=5000');
try {
  if (mode === 'plan') {
    const plan = integerPlan(db);
    writeFileSync(resolve(planPath), JSON.stringify(plan, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(
      JSON.stringify({
        plannedSaves: plan.rows.length,
        changedPlayers: plan.rows.reduce((sum, r) => sum + r.changed, 0),
        maxAbilityDelta: Math.max(0, ...plan.rows.map((r) => r.maxDelta)),
      }),
    );
  } else
    console.log(
      JSON.stringify(applyIntegerPlan(db, JSON.parse(readFileSync(resolve(planPath), 'utf8')))),
    );
} finally {
  db.close();
}
