// Offline, read-only reference extraction. No engine import, network access,
// production dependency or runtime calibration. Raw data must stay outside Git.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const time = (event) =>
  event.timestamp
    .split(':')
    .map(Number)
    .reduce((n, x) => n * 60 + x, 0);
const quantile = (values, p) => {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) * p)] : null;
};
const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const administrative = new Set([
  'Starting XI',
  'Half Start',
  'Half End',
  'Substitution',
  'Tactical Shift',
  'Bad Behaviour',
  'Player Off',
  'Player On',
  'Injury Stoppage',
]);

export function referenceMatch(events) {
  const regulation = events.filter((e) => e.period === 1 || e.period === 2);
  const duration = [1, 2].reduce(
    (sum, period) => sum + Math.max(0, ...regulation.filter((e) => e.period === period).map(time)),
    0,
  );
  const groups = new Map();
  for (const event of regulation) {
    if (administrative.has(event.type.name)) continue;
    const key = `${event.period}:${event.possession}`;
    const group = groups.get(key) ?? { start: Infinity, end: -Infinity, completed: 0 };
    group.start = Math.min(group.start, time(event));
    group.end = Math.max(group.end, time(event) + (event.duration ?? 0));
    if (
      event.type.name === 'Pass' &&
      event.team.id === event.possession_team.id &&
      !event.pass.outcome
    )
      group.completed++;
    groups.set(key, group);
  }
  const phases = [...groups.values()]
    .filter((g) => g.end > g.start)
    .map((g) => ({ seconds: g.end - g.start, completed: g.completed }));
  const passes = regulation.filter((e) => e.type.name === 'Pass');
  const shots = regulation.filter((e) => e.type.name === 'Shot');
  const factor = duration ? 5400 / duration : null;
  return {
    durationSeconds: duration,
    passes: passes.length,
    passesPerTeamPer90: (factor * passes.length) / 2,
    shots: shots.length,
    shotsPer90: factor * shots.length,
    goals:
      shots.filter((e) => e.shot.outcome.name === 'Goal').length +
      regulation.filter((e) => e.type.name === 'Own Goal Against').length,
    completion: passes.length ? passes.filter((e) => !e.pass.outcome).length / passes.length : null,
    possessionCount: phases.length,
    possessionsPer90: phases.length * factor,
    possessionMedianSeconds: quantile(
      phases.map((p) => p.seconds),
      0.5,
    ),
    possessionP90Seconds: quantile(
      phases.map((p) => p.seconds),
      0.9,
    ),
    underFiveCount: phases.filter((p) => p.seconds < 5).length,
    phaseSeconds: phases.reduce((sum, p) => sum + p.seconds, 0),
    positiveChains: phases.filter((p) => p.completed > 0).map((p) => p.completed),
    carryEventMedianSeconds: quantile(
      regulation.filter((e) => e.type.name === 'Carry').map((e) => e.duration ?? 0),
      0.5,
    ),
  };
}

export function summarizeReference(rows) {
  const count = rows.reduce((n, r) => n + r.possessionCount, 0);
  return {
    matches: rows.length,
    goals: mean(rows.map((r) => r.goals)),
    shots: mean(rows.map((r) => r.shots)),
    shotsPer90: mean(rows.map((r) => r.shotsPer90)),
    passesPerTeam: mean(rows.map((r) => r.passes / 2)),
    passesPerTeamPer90: mean(rows.map((r) => r.passesPerTeamPer90)),
    completion: mean(rows.map((r) => r.completion)),
    possessions: mean(rows.map((r) => r.possessionCount)),
    possessionsPer90: mean(rows.map((r) => r.possessionsPer90)),
    phaseSeconds: mean(rows.map((r) => r.phaseSeconds)),
    meanMatchPossessionMedianSeconds: mean(rows.map((r) => r.possessionMedianSeconds)),
    meanMatchPossessionP90Seconds: mean(rows.map((r) => r.possessionP90Seconds)),
    shareUnderFiveSeconds: rows.reduce((n, r) => n + r.underFiveCount, 0) / count,
    positiveChainMean: mean(rows.flatMap((r) => r.positiveChains)),
    carryEventMedianSeconds: mean(rows.map((r) => r.carryEventMedianSeconds)),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2] || !process.argv[3])
    throw Error('Provide raw-data directory and explicit output JSON');
  const dir = resolve(process.argv[2]);
  const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf8'));
  const matches = manifest.ids.map((row) => ({
    ...row,
    ...referenceMatch(JSON.parse(readFileSync(resolve(dir, `events-${row.id}.json`), 'utf8'))),
  }));
  const result = {
    source: manifest.source,
    sourceUrl: 'https://github.com/hudl/open-data',
    commit: manifest.commit,
    definition:
      'Periods 1/2 only; period+provider possession groups; administrative events excluded; end includes duration; positive-duration phases and positive completed-pass chains. Counts per90 use period timestamp duration including added time. Durations are not rescaled.',
    selection:
      'Chronologically sorted regular/group-stage matches, evenly spaced midpoint indices: 16 Indian Super League 2021/22 and 8 World Cup 2022 group matches. Not a random sample or a lower-league population estimate.',
    competitions: Object.fromEntries(
      [...new Set(matches.map((r) => r.comp))].map((comp) => [
        comp,
        summarizeReference(matches.filter((r) => r.comp === comp)),
      ]),
    ),
    all: summarizeReference(matches),
    matches,
  };
  writeFileSync(resolve(process.argv[3]), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ competitions: result.competitions, all: result.all }, null, 2));
}
