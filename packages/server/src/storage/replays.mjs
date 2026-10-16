import { gzipSync } from 'node:zlib';

export function createReplayStorage(db) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  if (current > 2) throw Error('Unknown database table version');
  db.exec(`CREATE TABLE IF NOT EXISTS replays (
    save_id TEXT NOT NULL, report_id TEXT NOT NULL, payload BLOB NOT NULL,
    PRIMARY KEY (save_id, report_id)); PRAGMA user_version=2;`);
  const insert = db.prepare('INSERT OR REPLACE INTO replays VALUES (?,?,?)');
  const find = db.prepare('SELECT payload FROM replays WHERE save_id=? AND report_id=?');
  const list = db.prepare('SELECT report_id FROM replays WHERE save_id=?');
  const remove = db.prepare('DELETE FROM replays WHERE save_id=? AND report_id=?');
  return {
    find(saveId, reportId) {
      return find.get(saveId, reportId)?.payload;
    },
    // Called only inside the same transaction as the save and request-id commit.
    persist(saveId, state) {
      for (const report of state.reports) {
        if (report.trajectory instanceof Uint16Array) {
          const raw = Buffer.allocUnsafe(report.trajectory.length * 2);
          for (let i = 0; i < report.trajectory.length; i++)
            raw.writeUInt16LE(report.trajectory[i], i * 2);
          insert.run(saveId, report.id, gzipSync(raw, { level: 3 }));
          delete report.trajectory;
        }
      }
      const retained = new Set(state.reports.map((r) => r.id));
      for (const row of list.all(saveId))
        if (!retained.has(row.report_id)) remove.run(saveId, row.report_id);
    },
  };
}
