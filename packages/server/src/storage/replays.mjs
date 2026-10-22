import { gzipSync, gunzipSync } from 'node:zlib';
import {
  withPlayerRatings,
  buildTeamRatings,
  buildTeamAbility,
} from '../../../shared/modules/matches/ratings/index.mjs';

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
  // Only two small aggregates per immutable archive; never retain full reports.
  const abilityCache = new Map();
  const ratingCache = new Map();
  const cacheKey = (saveId, reportId) => JSON.stringify([saveId, reportId]);
  function teamRatings(saveId, summary) {
    if (summary.teamRatings) return summary.teamRatings;
    if (!summary.detailsStored) return buildTeamRatings(summary);
    const key = cacheKey(saveId, summary.id);
    if (ratingCache.has(key)) return structuredClone(ratingCache.get(key));
    const payload = findReport.get(saveId, summary.id)?.payload;
    if (!payload) return buildTeamRatings(summary);
    const result = buildTeamRatings(JSON.parse(gunzipSync(payload)));
    ratingCache.set(key, result);
    if (ratingCache.size > 128) ratingCache.delete(ratingCache.keys().next().value);
    return structuredClone(result);
  }
  function teamAbility(saveId, summary) {
    if (summary.teamAbility) return summary.teamAbility;
    if (!summary.detailsStored) return buildTeamAbility(summary);
    const key = cacheKey(saveId, summary.id);
    if (abilityCache.has(key)) return structuredClone(abilityCache.get(key));
    const payload = findReport.get(saveId, summary.id)?.payload;
    if (!payload) return buildTeamAbility(summary);
    const result = buildTeamAbility(JSON.parse(gunzipSync(payload)));
    abilityCache.set(key, result);
    if (abilityCache.size > 128) abilityCache.delete(abilityCache.keys().next().value);
    return structuredClone(result);
  }
  return {
    teamRatings,
    teamAbility,
    find(saveId, reportId) {
      return find.get(saveId, reportId)?.payload;
    },
    report(saveId, reportId) {
      const payload = findReport.get(saveId, reportId)?.payload;
      if (!payload) return undefined;
      const report = JSON.parse(gunzipSync(payload));
      const rated = withPlayerRatings(report);
      // Old archives are enriched in the response, without rewriting their BLOBs.
      return rated === report ? payload : gzipSync(JSON.stringify(rated), { level: 3 });
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
        if (report.detailsStored && !report.teamAbility)
          report.teamAbility = teamAbility(saveId, report);
        const own = report.homeId === 'me' || report.awayId === 'me';
        if (!own && report.homeId && report.awayId) {
          delete report.trajectory;
          delete report.replay;
          report.canReplay = false;
          remove.run(saveId, report.id);
        }
        if (report.trajectory instanceof Uint16Array) {
          const raw = Buffer.allocUnsafe(report.trajectory.length * 2);
          for (let i = 0; i < report.trajectory.length; i++)
            raw.writeUInt16LE(report.trajectory[i], i * 2);
          insert.run(saveId, report.id, gzipSync(raw, { level: 3 }));
          delete report.trajectory;
        }
        if ((report.eventFormatVersion ?? 0) >= 3 && !report.detailsStored) {
          const rated = withPlayerRatings(report);
          const teamAbilityValue = teamAbility(saveId, report);
          abilityCache.delete(cacheKey(saveId, report.id));
          insertReport.run(saveId, report.id, gzipSync(JSON.stringify(rated), { level: 3 }));
          const {
            events,
            snapshots,
            performance,
            continuity,
            motion,
            timeline,
            playerRatings,
            ...summary
          } = rated;
          state.reports[index] = {
            ...summary,
            events: [],
            snapshots: [],
            detailsStored: true,
            teamAbility: teamAbilityValue,
          };
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
