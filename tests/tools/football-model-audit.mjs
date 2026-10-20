// Explicit offline audit. Never invoked by the game or advances a player's save.
// Four workers maximum; regular teams, a star, unequal squads and fatigue remain
// separate cohorts. Existing realism thresholds are used without exemptions.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { serialize } from 'node:v8';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const cases = ['balanced', 'possession', 'counter', 'wide'].flatMap((style) =>
  [2027, 3181].map((seed) => ({
    id: `holdout-${style}-${seed}`,
    cohort: 'ordinary',
    style,
    seed,
    world: 84,
  })),
);
for (const seed of [2027, 3181])
  cases.push({
    id: `star-${seed}`,
    cohort: 'star',
    world: 42,
    style: 'balanced',
    seed,
    star: true,
  });
cases.push(
  {
    id: 'strong-70-45',
    cohort: 'unequal',
    world: 84,
    style: 'balanced',
    seed: 6287,
    levels: [70, 45],
  },
  {
    id: 'weak-45-70',
    cohort: 'unequal',
    world: 84,
    style: 'balanced',
    seed: 6287,
    levels: [45, 70],
  },
  { id: 'tired-50', cohort: 'fatigue', world: 84, style: 'balanced', seed: 6287, tired: true },
);
if (!isMainThread) {
  const { createGame, simulate } = await import('../../packages/shared/game.mjs');
  const { observationPlayer } = await import('../../packages/shared/modules/players/index.mjs');
  const { compareMatch } = await import('./match-realism.mjs');
  parentPort.on('message', (task) => {
    const game = createGame('独立模型复核', task.world);
    const [home, away] = game.clubs;
    home.tactics.style = task.style;
    if (task.star) {
      const player = home.players.find((p) => p.role === 'FWD' && home.lineup.includes(p.id));
      Object.assign(player.attributes, observationPlayer(task.world, game.gameDate).attributes);
    }
    if (task.levels)
      for (const [side, level] of task.levels.entries())
        for (const player of game.clubs[side].players)
          for (const key of Object.keys(player.attributes)) player.attributes[key] = level;
    if (task.tired) for (const player of home.players) player.fitness = 50;
    const inputSha256 = createHash('sha256')
      .update(JSON.stringify([home, away, task.seed]))
      .digest('hex');
    const report = simulate(home, away, task.seed, task.id);
    if (workerData.raw) writeFileSync(resolve(workerData.dir, task.id + '.v8'), serialize(report));
    const comparison = { ...task, inputSha256, ...compareMatch(report) };
    writeFileSync(
      resolve(workerData.dir, task.id + '.json'),
      JSON.stringify(comparison, null, 2) + '\n',
    );
    parentPort.postMessage({
      id: task.id,
      cohort: task.cohort,
      status: comparison.status,
      score: report.score,
      shots: comparison.teams.map((t) => t.shots),
      median: comparison.match.teamPossessions.medianSeconds,
      alerts: comparison.alerts,
    });
  });
} else {
  if (!process.argv[2]) throw Error('Provide an explicit scratch output directory');
  const dir = resolve(process.argv[2]);
  mkdirSync(dir, { recursive: true });
  const selectedCases = process.argv.includes('--fresh')
    ? ['balanced', 'possession', 'counter', 'wide'].map((style, i) => ({
        id: `fresh-${style}`,
        cohort: 'fresh',
        world: 168,
        style,
        seed: i < 2 ? 7703 : 9011,
      }))
    : cases;
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const summary = {
    commit: git('rev-parse', 'HEAD'),
    dirty: Boolean(git('status', '--porcelain')),
    startedAt: new Date().toISOString(),
    cases: selectedCases,
    results: [],
    status: 'running',
  };
  const queue = [...selectedCases];
  await Promise.all(
    Array.from(
      { length: 4 },
      () =>
        new Promise((done, reject) => {
          const worker = new Worker(new URL(import.meta.url), {
            workerData: { dir, raw: process.argv.includes('--raw') },
          });
          worker.on('message', (result) => {
            summary.results.push(result);
            console.log(
              JSON.stringify({
                id: result.id,
                status: result.status,
                score: result.score,
                shots: result.shots,
              }),
            );
            if (queue.length) worker.postMessage(queue.shift());
            else worker.terminate();
          });
          worker.on('error', reject);
          worker.on('exit', done);
          worker.postMessage(queue.shift());
        }),
    ),
  );
  summary.finishedAt = new Date().toISOString();
  summary.status =
    summary.results.length !== selectedCases.length
      ? 'incomplete'
      : summary.results.some((r) => r.status === 'blocked')
        ? 'blocked'
        : summary.results.some((r) => r.status === 'review')
          ? 'review'
          : 'pass';
  writeFileSync(resolve(dir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  if (['blocked', 'incomplete'].includes(summary.status)) process.exitCode = 1;
}
