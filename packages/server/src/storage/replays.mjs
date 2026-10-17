import { gzipSync, gunzipSync } from 'node:zlib';

export function createReplayStorage(db) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  if (current > 3) throw Error('Unknown database table version');
  db.exec(`CREATE TABLE IF NOT EXISTS replays (
    save_id TEXT NOT NULL, report_id TEXT NOT NULL, payload BLOB NOT NULL,
    PRIMARY KEY (save_id, report_id));`);
  db.exec(`CREATE TABLE IF NOT EXISTS match_reports (
    save_id TEXT NOT NULL, report_id TEXT NOT NULL, payload BLOB NOT NULL,
    PRIMARY KEY(save_id,report_id));`);
  if (current < 2) db.exec('PRAGMA user_version=2');
  const insert = db.prepare('INSERT OR REPLACE INTO replays VALUES (?,?,?)');
  const find = db.prepare('SELECT payload FROM replays WHERE save_id=? AND report_id=?');
  const list = db.prepare('SELECT report_id FROM replays WHERE save_id=?');
  const remove = db.prepare('DELETE FROM replays WHERE save_id=? AND report_id=?');
  const insertReport = db.prepare('INSERT OR REPLACE INTO match_reports VALUES (?,?,?)');
  const findReport = db.prepare(
    'SELECT payload FROM match_reports WHERE save_id=? AND report_id=?',
  );
  return {
    find(saveId, reportId) {
      return find.get(saveId, reportId)?.payload;
    },
    report(saveId, reportId) {
      return findReport.get(saveId, reportId)?.payload;
    },
    persistChunks(saveId, reportId, chunks) {
      // Browsers may stop decoding at the first gzip member. A completed replay
      // must be one stream; live chunks remain independent compressed responses.
      const raw = Buffer.concat(chunks.map((payload) => gunzipSync(payload)));
      insert.run(saveId, reportId, gzipSync(raw, { level: 3 }));
    },
    // Called only inside the same transaction as the save and request-id commit.
    persist(saveId, state) {
      for (let index = 0; index < state.reports.length; index++) {
        const report = state.reports[index];
        if (report.trajectory instanceof Uint16Array) {
          const raw = Buffer.allocUnsafe(report.trajectory.length * 2);
          for (let i = 0; i < report.trajectory.length; i++)
            raw.writeUInt16LE(report.trajectory[i], i * 2);
          insert.run(saveId, report.id, gzipSync(raw, { level: 3 }));
          delete report.trajectory;
        }
        if ((report.eventFormatVersion ?? 0) >= 3 && !report.detailsStored) {
          insertReport.run(saveId, report.id, gzipSync(JSON.stringify(report), { level: 3 }));
          const { events, snapshots, performance, continuity, motion, timeline, ...summary } =
            report;
          state.reports[index] = { ...summary, events: [], snapshots: [], detailsStored: true };
        }
      }
      const retained = new Set(state.reports.map((r) => r.id));
      for (const row of list.all(saveId))
        if (!retained.has(row.report_id)) remove.run(saveId, row.report_id);
      for (const row of db
        .prepare('SELECT report_id FROM match_reports WHERE save_id=?')
        .all(saveId))
        if (!retained.has(row.report_id))
          db.prepare('DELETE FROM match_reports WHERE save_id=? AND report_id=?').run(
            saveId,
            row.report_id,
          );
    },
  };
}
