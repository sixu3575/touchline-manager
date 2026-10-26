// Explicit local audit. Never advances a save or runs a season. Four concurrent
// games maximum; all eight style cases and two counter stress cases must finish.
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  compareMatchSampleToLeagueStats,
  compareMatchSampleToEuropeanLeagueStats,
  compareMatchSampleToOpenFootballGoals,
  compareMatchSampleToOpenEuropeStats,
  compareMatch,
} from './match-realism.mjs';

if (!isMainThread) {
  const { createGame, simulate } = await import('../../packages/shared/game.mjs');
  const { bestLineup } = await import('../../packages/shared/modules/tactics/index.mjs');
  parentPort.on('message', (task) => {
    const game = createGame('公开校准球队', 42);
    const home = game.clubs[0],
      away = game.clubs[1];
    home.tactics.formation = '4-3-3';
    home.tactics.style = task.style;
    home.lineup = bestLineup(home, '4-3-3');
    away.tactics.formation = '4-3-3';
    away.tactics.press = task.opponentPress;
    away.lineup = bestLineup(away, '4-3-3');
    const report = simulate(home, away, task.seed, task.auditId);
    parentPort.postMessage(compareMatch(report));
  });
} else {
  if (!process.argv[2]) throw Error('Provide an explicit scratch output directory');
  const dir = resolve(process.argv[2]);
  mkdirSync(dir, { recursive: true });
  const cases = [
    ...['balanced', 'possession', 'counter', 'wide'].flatMap((style) =>
      [999, 1001].map((seed) => ({
        style,
        seed,
        opponentPress: 'normal',
        auditId: `realism-${style}-${seed}`,
      })),
    ),
    ...[999, 1001].map((seed) => ({
      style: 'counter',
      seed,
      opponentPress: 'high',
      auditId: `realism-counter-high-press-${seed}`,
    })),
  ];
  const queue = [...cases],
    results = [];
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const metadata = {
    commit: git('rev-parse', 'HEAD'),
    dirty: Boolean(git('status', '--porcelain')),
    startedAt: new Date().toISOString(),
    setup: { formation: '4-3-3', fourStylesOpponentPress: 'normal', counterStressOpponentPress: 'high' },
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
  const tacticalStyleSummary = Object.fromEntries(
    ['balanced', 'possession', 'counter', 'wide'].map((style) => {
      const teams = results.flatMap((result) =>
        result.tacticalOutcomes.filter(
          (team) =>
            team.side === 0 && team.style === style && team.opponentPress === 'normal',
        ),
      );
      const values = (metric) => teams.map((team) => metric(team));
      return [
        style,
        {
          teams: teams.length,
          possessionPct: describe(values((team) => team.possessionPct).filter(Number.isFinite)),
          passes: describe(values((team) => team.passes).filter(Number.isFinite)),
          meanChainLength: describe(values((team) => team.meanChainLength).filter(Number.isFinite)),
          chainsFivePlus: describe(values((team) => team.chainsFivePlus).filter(Number.isFinite)),
          pressDutyPlayerSeconds: describe(values((team) => team.pressDutyPlayerSeconds)),
          playersWithPressDuty: describe(values((team) => team.playersWithPressDuty)),
          markingDutyPlayerSeconds: describe(values((team) => team.markingDutyPlayerSeconds)),
          opponentOutfieldDistance: describe(values((team) => team.opponentOutfieldDistance)),
          opponentOutfieldEnergy: describe(values((team) => team.opponentOutfieldEnergy)),
          opponentDefenderDistance: describe(values((team) => team.opponentDefenderDistance)),
          opponentDefenderEnergy: describe(values((team) => team.opponentDefenderEnergy)),
          opponentDefenderMarkSwitches: describe(
            values((team) => team.opponentDefenderMarkSwitches),
          ),
          switches: describe(values((team) => team.switches)),
          switchesCompleted: describe(values((team) => team.switchesCompleted)),
          switchCompletionPct: describe(
            values((team) =>
              team.switches ? (100 * team.switchesCompleted) / team.switches : null,
            ).filter(Number.isFinite),
          ),
          throughBalls: describe(values((team) => team.throughBalls)),
          throughBallsCompleted: describe(values((team) => team.throughBallsCompleted)),
          throughFollowedByShotWithin12Seconds: describe(
            values((team) => team.throughFollowedByShotWithin12Seconds),
          ),
          throughTargetsByRole: Object.fromEntries(
            ['centreBack', 'fullback', 'holdingMid', 'centralMid', 'wideMid', 'winger', 'striker'].map(
              (role) => [role, describe(values((team) => team.throughTargetsByRole[role]))],
            ),
          ),
          throughRatePct: describe(
            values((team) =>
              team.passes ? (100 * team.throughBalls) / team.passes : null,
            ).filter(Number.isFinite),
          ),
          counterThroughBalls: describe(values((team) => team.counterThroughBalls)),
          counterThroughBallsCompleted: describe(
            values((team) => team.counterThroughBallsCompleted),
          ),
          counterGroundThrough: {
            attempts: describe(
              values((team) => team.counterGroundThrough.attempts),
            ),
            completed: describe(
              values((team) => team.counterGroundThrough.completed),
            ),
            medianTargetDistance: describe(
              values((team) => team.counterGroundThrough.medianTargetDistance).filter(
                Number.isFinite,
              ),
            ),
          },
          counterLoftedThrough: {
            attempts: describe(
              values((team) => team.counterLoftedThrough.attempts),
            ),
            completed: describe(
              values((team) => team.counterLoftedThrough.completed),
            ),
            medianTargetDistance: describe(
              values((team) => team.counterLoftedThrough.medianTargetDistance).filter(
                Number.isFinite,
              ),
            ),
          },
          crosses: describe(values((team) => team.crosses)),
          crossesCompleted: describe(values((team) => team.crossesCompleted)),
          crossRatePct: describe(
            values((team) => (team.passes ? (100 * team.crosses) / team.passes : null)).filter(
              Number.isFinite,
            ),
          ),
          crossesToStrikers: describe(values((team) => team.crossesToStrikers)),
          crossesToStrikersCompleted: describe(
            values((team) => team.crossesToStrikersCompleted),
          ),
          wideTakeOnAttempts: describe(values((team) => team.wideTakeOnAttempts)),
          wideTakeOnWins: describe(values((team) => team.wideTakeOnWins)),
          passOriginByRole: Object.fromEntries(
            ['centreBack', 'fullback', 'holdingMid', 'centralMid', 'wideMid', 'winger', 'striker'].map(
              (role) => [role, describe(values((team) => team.passOriginByRole[role]))],
            ),
          ),
        },
      ];
    }),
  );
  const benchmarkResults = results.filter((result) =>
    result.tacticalOutcomes.some((team) => team.side === 0 && team.opponentPress === 'normal'),
  );
  const counterHighPressResults = results.filter((result) =>
    result.tacticalOutcomes.some(
      (team) => team.side === 0 && team.style === 'counter' && team.opponentPress === 'high',
    ),
  );
  const values = (fn) => benchmarkResults.flatMap(fn).sort((a, b) => a - b);
  const leagueMatchRows = benchmarkResults.map((r) => ({
    home: Object.fromEntries(
      ['goals', 'shots', 'onTarget', 'fouls', 'corners', 'yellowCards', 'redCards'].map(
        (metric) => [metric === 'onTarget' ? 'shotsOnTarget' : metric, r.teams[0][metric]],
      ),
    ),
    away: Object.fromEntries(
      ['goals', 'shots', 'onTarget', 'fouls', 'corners', 'yellowCards', 'redCards'].map(
        (metric) => [metric === 'onTarget' ? 'shotsOnTarget' : metric, r.teams[1][metric]],
      ),
    ),
  }));
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
    tacticalStyleSummary,
    counterHighPressStress: {
      matches: counterHighPressResults.length,
      cases: counterHighPressResults.map((result) => ({
        id: result.id,
        goals: result.teams.map((team) => team.goals),
        shots: result.teams.map((team) => team.shots),
        counterTeam: result.tacticalOutcomes.find((team) => team.side === 0),
        counterGroundThrough: result.tacticalOutcomes.find((team) => team.side === 0)
          ?.counterGroundThrough,
        counterLoftedThrough: result.tacticalOutcomes.find((team) => team.side === 0)
          ?.counterLoftedThrough,
        status: result.status,
      })),
    },
    leagueMatchStatComparison: compareMatchSampleToLeagueStats(leagueMatchRows),
    europeanLeagueMultiStatComparison: compareMatchSampleToEuropeanLeagueStats(leagueMatchRows),
    openEuropeanMatchStatComparison: compareMatchSampleToOpenEuropeStats(
      benchmarkResults.map((r) => ({
        home: Object.fromEntries(
          [
            ['goals', 'goals'],
            ['shots', 'shots'],
            ['shotsOnTarget', 'onTarget'],
            ['passesAttempted', 'passes'],
            ['passesCompleted', 'completedPasses'],
            ['fouls', 'fouls'],
            ['corners', 'corners'],
            ['yellowCards', 'yellowCards'],
            ['redCards', 'redCards'],
            ['saves', 'saves'],
            ['interceptions', 'interceptions'],
          ].map(([metric, key]) => [metric, r.teams[0][key]]),
        ),
        away: Object.fromEntries(
          [
            ['goals', 'goals'],
            ['shots', 'shots'],
            ['shotsOnTarget', 'onTarget'],
            ['passesAttempted', 'passes'],
            ['passesCompleted', 'completedPasses'],
            ['fouls', 'fouls'],
            ['corners', 'corners'],
            ['yellowCards', 'yellowCards'],
            ['redCards', 'redCards'],
            ['saves', 'saves'],
            ['interceptions', 'interceptions'],
          ].map(([metric, key]) => [metric, r.teams[1][key]]),
        ),
      })),
    ),
    openFootballEuropeanGoalComparison: compareMatchSampleToOpenFootballGoals(
      benchmarkResults.map((r) => ({
        home: { goals: r.teams[0].goals },
        away: { goals: r.teams[1].goals },
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
  console.log(JSON.stringify({
    completed: summary.completed,
    status: summary.status,
    matchGoals: summary.matchGoals,
    matchShots: summary.matchShots,
    teamPasses: summary.teamPasses,
    tacticalStyleSummary: summary.tacticalStyleSummary,
    counterHighPressStress: summary.counterHighPressStress,
    distributionAlerts: summary.distributionAlerts,
  }, null, 2));
  if (summary.status === 'blocked' || summary.status === 'incomplete') process.exitCode = 1;
}
