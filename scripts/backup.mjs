import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, unlinkSync, statSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
const data = resolve(process.env.DATA_DIR || 'data');
const out = resolve(process.env.BACKUP_DIR || 'backups');
mkdirSync(out, { recursive: true, mode: 0o700 });
const name = 'touchline-' + new Date().toISOString().replace(/[:.]/g, '-') + '.sqlite';
const target = resolve(out, name);
const db = new DatabaseSync(resolve(data, 'game.sqlite'));
db.exec("PRAGMA busy_timeout=10000; VACUUM INTO '" + target.replaceAll("'", "''") + "';");
db.close();
chmodSync(target, 0o600);
const verified = new DatabaseSync(target, { readOnly: true });
if (verified.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok')
  throw Error('Backup integrity check failed.');
verified.close();
const old = readdirSync(out)
  .filter((f) => /^touchline-[\dTZ.-]+\.sqlite$/.test(f))
  .map((f) => ({ f, t: statSync(resolve(out, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t);
for (const { f } of old.slice(14)) unlinkSync(resolve(out, f));
console.log(JSON.stringify({ ok: true, path: target }));
