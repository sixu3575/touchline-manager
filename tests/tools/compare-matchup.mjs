// Read-only paired audit. Inputs are archived compareMatch JSON directories;
// no simulation, target statistics, pass/fail thresholds or save mutation.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [baselinePath, candidatePath, outputPath] = process.argv.slice(2);
if (!outputPath) throw Error('Usage: compare-matchup BASELINE_DIR CANDIDATE_DIR OUTPUT.json');
const read = (path) => {
  const rows = new Map();
  for (const file of readdirSync(path).filter(
    (f) => f.endsWith('.json') && !f.endsWith('-trace.json'),
  )) {
    const value = JSON.parse(readFileSync(resolve(path, file), 'utf8'));
    const report = value.evidence ?? value;
    if (!report.id || !report.teams || !report.engineVersion) continue;
    if (rows.has(report.id)) throw Error('Duplicate report ID: ' + report.id);
    rows.set(report.id, { report, task: value.task });
  }
  return rows;
};
const describe = (values) => {
  const rows = values.filter(Number.isFinite).sort((a, b) => a - b);
  const mean = rows.reduce((sum, x) => sum + x, 0) / rows.length;
  return {
    n: rows.length,
    mean: rows.length ? mean : null,
    sampleVariance:
      rows.length > 1
        ? rows.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (rows.length - 1)
        : null,
    min: rows[0] ?? null,
    max: rows.at(-1) ?? null,
  };
};
const metrics = (r) => ({
  totalGoals: r.teams.reduce((sum, t) => sum + t.goals, 0),
  totalShots: r.teams.reduce((sum, t) => sum + t.shots, 0),
  totalPasses: r.teams.reduce((sum, t) => sum + t.passes, 0),
  completion:
    r.teams.reduce((sum, t) => sum + t.completedPasses, 0) /
    r.teams.reduce((sum, t) => sum + t.passes, 0),
  liveSeconds: r.match.liveSeconds,
  possessionMedianSeconds: r.match.teamPossessions?.medianSeconds,
  completedPassChainMean: r.match.replayFlow?.match?.meanCompletedPassChain,
  distancePerOutfielder:
    r.players
      .filter((p) => p.role !== 'GK' && p.minutes > 0)
      .reduce((sum, p) => sum + p.distanceMetres, 0) / 20,
  sprintPerOutfielder:
    r.players
      .filter((p) => p.role !== 'GK' && p.minutes > 0)
      .reduce((sum, p) => sum + (p.sprintMetresPer90 * p.minutes) / 90, 0) / 20,
  meanEndingEnergy: r.match.replayFlow?.match?.averageEndingEnergy,
  maxIndividualShots: Math.max(...r.players.map((p) => p.shots)),
  maxIndividualTackleAttempts: Math.max(...r.players.map((p) => p.tackleAttempts ?? p.tackles)),
});
const baseline = read(resolve(baselinePath)),
  candidate = read(resolve(candidatePath));
const pairs = [...baseline]
  .filter(([id]) => candidate.has(id))
  .map(([id, left]) => {
    const right = candidate.get(id);
    if (
      JSON.stringify(left.report.tactics) !== JSON.stringify(right.report.tactics) ||
      left.report.seed !== right.report.seed
    )
      throw Error('Unpaired tactics or seed: ' + id);
    return {
      id,
      task: right.task,
      baselineVersion: [left.report.engineVersion, left.report.parameterVersion],
      candidateVersion: [right.report.engineVersion, right.report.parameterVersion],
      baseline: metrics(left.report),
      candidate: metrics(right.report),
      baselineScore: left.report.teams.map((t) => t.goals),
      candidateScore: right.report.teams.map((t) => t.goals),
      baselineStatus: left.report.status,
      candidateStatus: right.report.status,
    };
  });
if (!pairs.length) throw Error('No paired reports');
const summarize = (rows) =>
  Object.fromEntries(
    Object.keys(rows[0].baseline).map((key) => {
      const before = describe(rows.map((r) => r.baseline[key])),
        after = describe(rows.map((r) => r.candidate[key]));
      return [key, { baseline: before, candidate: after, meanDelta: after.mean - before.mean }];
    }),
  );
const groups = {};
for (const pair of pairs) {
  const task = pair.task;
  const key =
    task && task.source !== 'generated'
      ? `${task.weakClubId}-${task.strongClubId}-${task.weakTactics.formation}-${task.weakTactics.style}-${task.weakTactics.press}`
      : 'same-level-standard';
  (groups[key] ??= []).push(pair);
}
const result = {
  baselineDirectory: resolve(baselinePath),
  candidateDirectory: resolve(candidatePath),
  pairedCount: pairs.length,
  unpairedBaseline: [...baseline.keys()].filter((id) => !candidate.has(id)),
  unpairedCandidate: [...candidate.keys()].filter((id) => !baseline.has(id)),
  all: summarize(pairs),
  groups: Object.fromEntries(
    Object.entries(groups).map(([key, rows]) => [
      key,
      { n: rows.length, metrics: summarize(rows) },
    ]),
  ),
  pairs,
};
writeFileSync(resolve(outputPath), JSON.stringify(result, null, 2) + '\n');
console.log(
  JSON.stringify({
    pairs: pairs.length,
    groups: Object.keys(groups).length,
    output: resolve(outputPath),
  }),
);
