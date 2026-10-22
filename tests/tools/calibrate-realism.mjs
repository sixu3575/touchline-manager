// Explicit local audit. Never advances a save or runs a season. Four concurrent
// games maximum; all eight cases must finish before the result can pass.
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { compareMatchSampleToLeagueStats, compareMatch } from './match-realism.mjs';

if (!isMainThread) {
  const { createGame, simulate } = await import('../../packages/shared/game.mjs');
  parentPort.on('message', (task) => {
    const game = createGame('公开校准球队', 42);
    const home = game.clubs[0],
      away = game.clubs[1];
    home.tactics.style = task.style;
    const report = simulate(home, away, task.seed, `realism-${task.style}-${task.seed}`);
    parentPort.postMessage(compareMatch(report));
  });
} else {
  if (!process.argv[2]) throw Error('Provide an explicit scratch output directory');
  const dir = resolve(process.argv[2]);
  mkdirSync(dir, { recursive: true });
  const cases = ['balanced', 'possession', 'counter', 'wide'].flatMap((style) =>
    [999, 1001].map((seed) => ({ style, seed })),
  );
  const queue = [...cases],
    results = [];
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const metadata = {
    commit: git('rev-parse', 'HEAD'),
    dirty: Boolean(git('status', '--porcelain')),
    startedAt: new Date().toISOString(),
    cases,
  };
  let failed = false;
  await Promise.all(
    Array.from(
      { length: Math.min(4, cases.length) },
      () =>
        new Promise((done) => {
          const worker = new Worker(new URL(import.meta.url));
          worker.on('message', (result) => {
            results.push(result);
            writeFileSync(resolve(dir, result.id + '.json'), JSON.stringify(result, null, 2));
            console.log(
              JSON.stringify({
                completed: results.length,
                id: result.id,
                score: result.teams.map((t) => t.goals),
                shots: result.teams.map((t) => t.shots),
                status: result.status,
              }),
            );
            if (queue.length) worker.postMessage(queue.shift());
            else worker.terminate();
          });
          worker.on('error', (error) => {
            failed = true;
            console.error(error);
          });
          worker.on('exit', (code) => {
            if (results.length < cases.length && code !== 1) failed = true;
            done();
          });
          worker.postMessage(queue.shift());
        }),
    ),
  );
  const values = (fn) => results.flatMap(fn).sort((a, b) => a - b);
  const describe = (a) => ({
    min: a[0] ?? null,
    p10: a[Math.floor((a.length - 1) * 0.1)] ?? null,
    median: a.length
      ? (a[Math.floor((a.length - 1) / 2)] + a[Math.ceil((a.length - 1) / 2)]) / 2
      : null,
    mean: a.length ? a.reduce((s, x) => s + x, 0) / a.length : null,
    p90: a[Math.floor((a.length - 1) * 0.9)] ?? null,
    max: a.at(-1) ?? null,
  });
  const summary = {
    ...metadata,
    finishedAt: new Date().toISOString(),
    completed: results.length,
    status:
      failed || results.length !== cases.length
        ? 'incomplete'
        : results.some((r) => r.status === 'blocked')
          ? 'blocked'
          : results.some((r) => r.status === 'review')
            ? 'review'
            : 'pass',
    engineVersions: [...new Set(results.map((r) => r.engineVersion))],
    matchGoals: describe(values((r) => r.teams.reduce((s, t) => s + t.goals, 0))),
    leagueMatchStatComparison: compareMatchSampleToLeagueStats(
      results.map((r) => ({
        home: Object.fromEntries(
          ['goals', 'shots', 'onTarget', 'fouls', 'corners', 'yellowCards', 'redCards'].map(
            (metric) => [
              metric === 'onTarget' ? 'shotsOnTarget' : metric,
              r.teams[0][metric],
            ],
          ),
        ),
        away: Object.fromEntries(
          ['goals', 'shots', 'onTarget', 'fouls', 'corners', 'yellowCards', 'redCards'].map(
            (metric) => [
              metric === 'onTarget' ? 'shotsOnTarget' : metric,
              r.teams[1][metric],
            ],
          ),
        ),
      })),
    ),
    matchShots: describe(values((r) => r.teams.reduce((s, t) => s + t.shots, 0))),
    teamPasses: describe(values((r) => r.teams.map((t) => t.passes))),
    outfieldDistancePer90: describe(
      values((r) =>
        r.players.filter((p) => p.role !== 'keeper' && p.minutes >= 60).map((p) => p.distancePer90),
      ),
    ),
    endBurstReserve: describe(values((r) => r.teams.map((t) => t.meanEndBurstReserve))),
    adrenalineEffortsPerMatch: describe(
      values((r) => [r.teams.reduce((sum, team) => sum + team.adrenalineEfforts, 0)]),
    ),
    cases: results.map((r) => ({ id: r.id, status: r.status, alerts: r.alerts })),
  };
  summary.distributionAlerts = [];
  if (summary.matchGoals.mean > 7)
    summary.distributionAlerts.push({
      severity: 'block',
      metric: 'meanMatchGoals',
      actual: summary.matchGoals.mean,
      engineeringMaximum: 7,
    });
  if (summary.matchShots.mean > 45)
    summary.distributionAlerts.push({
      severity: 'block',
      metric: 'meanMatchShots',
      actual: summary.matchShots.mean,
      engineeringMaximum: 45,
    });
  if (summary.status !== 'incomplete' && summary.distributionAlerts.length)
    summary.status = 'blocked';
  writeFileSync(resolve(dir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ...summary, cases: undefined }, null, 2));
  if (summary.status === 'blocked' || summary.status === 'incomplete') process.exitCode = 1;
}
