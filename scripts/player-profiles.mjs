import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  maintenancePlan,
  applyMaintenance,
} from '../packages/server/src/maintenance/player-profiles.mjs';
const [mode, database, argument, output] = process.argv.slice(2);
if (!['plan', 'apply'].includes(mode) || !database || !argument)
  throw Error('Usage: player-profiles.mjs plan DB TARGET_SEED PLAN.json | apply DB PLAN.json');
const path = resolve(database);
if (!existsSync(path)) throw Error('Existing database required');
const db = new DatabaseSync(path, { readOnly: mode === 'plan' });
db.exec('PRAGMA busy_timeout=5000');
try {
  if (mode === 'plan') {
    if (!output || !Number.isSafeInteger(Number(argument)))
      throw Error('Explicit integer target seed and plan path required');
    const plan = maintenancePlan(db, Number(argument));
    writeFileSync(resolve(output), JSON.stringify(plan, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(
      JSON.stringify({
        plannedSaves: plan.rows.length,
        players: plan.rows.reduce((s, r) => s + r.changed, 0),
        target: plan.rows
          .filter((r) => r.target)
          .map((r) => ({ club: r.club, star: r.star, granted: r.granted })),
      }),
    );
  } else
    console.log(
      JSON.stringify(applyMaintenance(db, JSON.parse(readFileSync(resolve(argument), 'utf8')))),
    );
} finally {
  db.close();
}
