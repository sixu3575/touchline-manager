import { serialize, deserialize } from 'node:v8';
import { gzipSync, gunzipSync } from 'node:zlib';
import { newBroadcast } from '../broadcast.mjs';

export const pack = (value) => gzipSync(serialize(value), { level: 1 });
export const unpack = (bytes) => (bytes ? deserialize(gunzipSync(bytes)) : null);
export function createJobStorage(db) {
  db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE IF NOT EXISTS match_jobs (
      id TEXT PRIMARY KEY, save_id TEXT NOT NULL, identity TEXT NOT NULL,
      request_id TEXT NOT NULL, body_hash TEXT NOT NULL, revision INTEGER NOT NULL,
      status TEXT NOT NULL, progress TEXT NOT NULL, work BLOB, error TEXT,
      created_at TEXT NOT NULL, UNIQUE(save_id,identity), UNIQUE(save_id,request_id));
    CREATE TABLE IF NOT EXISTS match_chunks (
      job_id TEXT NOT NULL, seq INTEGER NOT NULL, payload BLOB NOT NULL,
      PRIMARY KEY(job_id,seq));
    PRAGMA user_version=3; COMMIT;`);
  const get = db.prepare('SELECT * FROM match_jobs WHERE id=?');
  const columns =
    'id,save_id,identity,request_id,body_hash,revision,status,progress,error,created_at';
  return {
    get: (id) => get.get(id),
    presentation: (id) => db.prepare(`SELECT ${columns} FROM match_jobs WHERE id=?`).get(id),
    owned: (id, saveId) =>
      db.prepare(`SELECT ${columns} FROM match_jobs WHERE id=? AND save_id=?`).get(id, saveId),
    latest: (saveId) =>
      db
        .prepare(
          `SELECT ${columns} FROM match_jobs WHERE save_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1`,
        )
        .get(saveId),
    pending: (saveId) =>
      db.prepare("SELECT * FROM match_jobs WHERE save_id=? AND status!='complete'").get(saveId),
    waiting: () =>
      db
        .prepare(
          "SELECT id FROM match_jobs WHERE status IN ('queued','running') ORDER BY CASE WHEN COALESCE(json_extract(progress,'$.ownComplete'),0)=0 THEN 0 ELSE 1 END,COALESCE(json_extract(progress,'$.computedAt'),0),created_at,rowid",
        )
        .all(),
    pendingRows: () =>
      db.prepare("SELECT id,status,progress FROM match_jobs WHERE status!='complete'").all(),
    count: () =>
      db.prepare("SELECT COUNT(*) AS n FROM match_jobs WHERE status!='complete'").get().n,
    insert(row, work, extras = {}) {
      db.prepare('INSERT INTO match_jobs VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
        row.id,
        row.saveId,
        row.identity,
        row.requestId,
        row.bodyHash,
        row.revision,
        'queued',
        JSON.stringify({
          engineVersion: row.engineVersion,
          parameterVersion: row.parameterVersion,
          fixturesDone: 0,
          fixturesTotal: row.total,
          broadcast: newBroadcast(),
          chunkEnds: [],
          ...extras,
        }),
        pack(work),
        null,
        new Date().toISOString(),
      );
    },
    save(id, progress, work, status = 'running', error = null) {
      db.prepare('UPDATE match_jobs SET progress=?,work=?,status=?,error=? WHERE id=?').run(
        JSON.stringify(progress),
        work ? pack(work) : null,
        status,
        error,
        id,
      );
    },
    status(id, status, error = null) {
      db.prepare('UPDATE match_jobs SET status=?,error=? WHERE id=?').run(status, error, id);
    },
    progress(id, progress) {
      db.prepare('UPDATE match_jobs SET progress=? WHERE id=?').run(JSON.stringify(progress), id);
    },
    chunk(id, seq) {
      return db.prepare('SELECT payload FROM match_chunks WHERE job_id=? AND seq=?').get(id, seq)
        ?.payload;
    },
    addChunk(id, seq, trajectory) {
      const raw = Buffer.allocUnsafe(trajectory.length * 2);
      for (let i = 0; i < trajectory.length; i++) raw.writeUInt16LE(trajectory[i], i * 2);
      db.prepare('INSERT INTO match_chunks VALUES (?,?,?)').run(
        id,
        seq,
        gzipSync(raw, { level: 1 }),
      );
    },
    prune(saveId) {
      const old = db
        .prepare(
          "SELECT id FROM match_jobs WHERE save_id=? AND status='complete' ORDER BY created_at DESC,rowid DESC LIMIT -1 OFFSET 3",
        )
        .all(saveId);
      for (const { id } of old) {
        db.prepare('DELETE FROM match_chunks WHERE job_id=?').run(id);
        db.prepare('DELETE FROM match_jobs WHERE id=?').run(id);
      }
    },
  };
}
