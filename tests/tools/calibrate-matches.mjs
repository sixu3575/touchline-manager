import { resolve } from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createGame, simulate } from '../../packages/shared/game.mjs';

if (!isMainThread) {
  parentPort.on('message', (task) => {
    const g = createGame('校准', 42),
      skills = ['passing', 'firstTouch', 'vision', 'decisions', 'teamwork', 'offTheBall'];
    for (const club of g.clubs.slice(0, 2)) for (const p of club.players) p.fitness = task.fitness;
    if (task.level !== 'generated')
      for (const p of g.clubs[0].players)
        for (const skill of skills) p.attributes[skill] = task.level;
    g.clubs[0].tactics.style = task.style;
    const started = performance.now(),
      r = simulate(g.clubs[0], g.clubs[1], task.seed, 'calibration', { recordReplay: false });
    const c = r.continuity,
      med = (a) => {
        a = [...a].sort((a, b) => a - b);
        return a[Math.floor(a.length / 2)] ?? 0;
      };
    const deadTypes = new Set([
      'kickoff',
      'half',
      'throwIn',
      'goalKick',
      'corner',
      'freeKick',
      'indirect',
      'penalty',
      'fulltime',
    ]);
    let passes = 0;
    const between = [];
    for (const e of r.events) {
      if (['pass', 'cross'].includes(e.type)) passes++;
      else if (deadTypes.has(e.type)) {
        if (passes) between.push(passes);
        passes = 0;
      }
    }
    parentPort.postMessage({
      ...task,
      ms: performance.now() - started,
      score: r.score,
      stats: r.stats,
      duels: r.performance.reduce((s, p) => s + p.tackles, 0),
      wonDuels: r.performance.reduce((s, p) => s + p.wonTackles, 0),
      dribbleTouches: r.performance.reduce((s, p) => s + p.dribbleTouches, 0),
      errors: c.errors,
      longestChains: c.chains.map((a) => Math.max(0, ...a)),
      medianChains: c.chains.map(med),
      chains5: c.chains.map((a) => a.filter((n) => n >= 5).length),
      betweenRestartMedian: med(between),
      deadSeconds: c.deadSeconds,
      looseSeconds: c.looseSeconds,
      contestedSeconds: c.contestedSeconds,
      controlledSeconds: c.controlledSeconds,
      flightSeconds: c.flightSeconds,
      deadCauses: c.deadCauses,
      turnovers: c.turnovers,
      boxEntries: c.boxEntries,
    });
  });
} else {
  if (!process.argv[2]) throw Error('Provide a scratch output JSONL path');
  const path = resolve(process.argv[2]);
  const completed = existsSync(path)
    ? readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
    : [];
  const tasks = [];
  for (const level of ['generated', 40, 55, 70, 85])
    for (const style of ['balanced', 'possession', 'counter', 'wide'])
      for (let i = 0; i < 5; i++)
        tasks.push({
          key: `${level}-${style}-${i}`,
          level,
          style,
          seed: 4200 + i,
          fitness: [65, 80, 100, 80, 100][i],
        });
  const queue = tasks.filter((t) => !completed.some((c) => c.key === t.key));
  let remaining = queue.length;
  if (!remaining) {
    console.log('All 100 already recorded');
    process.exit(0);
  }
  for (let i = 0; i < Math.min(4, remaining); i++) {
    const w = new Worker(new URL(import.meta.url), {
      workerData: {},
      resourceLimits: { maxOldGenerationSizeMb: 128 },
    });
    w.on('message', (row) => {
      appendFileSync(path, JSON.stringify(row) + '\n');
      remaining--;
      console.log(
        JSON.stringify({
          remaining,
          key: row.key,
          score: row.score,
          passes: row.stats.map((s) => s.passes),
          shots: row.stats.map((s) => s.shots),
          chains5: row.chains5,
        }),
      );
      if (queue.length) w.postMessage(queue.shift());
      else w.terminate();
    });
    w.on('error', (error) => {
      console.error(error);
      process.exitCode = 1;
    });
    w.postMessage(queue.shift());
  }
}
