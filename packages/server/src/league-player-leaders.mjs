import { gunzipSync } from 'node:zlib';
import { leaguePlayerLeaders } from '../../shared/modules/competitions/selectors/index.mjs';

const reportSeason = (report) => report.season ?? Number(report.id?.match(/^s(\d+)/)?.[1]);

/** Read same-save finalized report details and cache the public aggregate by revision. */
export function createLeaguePlayerLeaderReader(replays, cacheLimit = 64) {
  const cache = new Map();
  return function readLeaguePlayerLeaders(saveId, state) {
    const key = `${saveId}:${state.revision}:${state.season}`;
    if (cache.has(key)) return structuredClone(cache.get(key));

    const results = new Set((state.results ?? []).map((result) => result.id));
    const summaries = (state.reports ?? []).filter(
      (report) =>
        report.competition === '先锋联赛' &&
        reportSeason(report) === state.season &&
        results.has(report.id),
    );
    const reports = [];
    for (const summary of summaries) {
      let report = summary;
      if (summary.detailsStored) {
        const payload = replays.report(saveId, summary.id);
        if (!payload) continue;
        try {
          report = JSON.parse(gunzipSync(payload));
        } catch {
          continue;
        }
      }
      reports.push(report);
    }

    const result = leaguePlayerLeaders(reports, {
      season: state.season,
      expectedMatches: results.size,
    });
    cache.set(key, result);
    if (cache.size > cacheLimit) cache.delete(cache.keys().next().value);
    return structuredClone(result);
  };
}
