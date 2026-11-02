// Explicit full-match strength/tactical audit. Isolated inputs only; never a
// season or production save. Usage: node ... OUTPUT_DIR [CASE_CONFIG.json]
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

if (!isMainThread) {
  const { strengthTeam, lineupAbility } = await import('./strength-fixtures.mjs');
  const { createGame, simulate } = await import('../../packages/shared/game.mjs');
  const { bestLineup } = await import('../../packages/shared/modules/tactics/index.mjs');
  const { compareMatch } = await import('./match-realism.mjs');
  const { fcClub, fcLineupStrength } = await import('./fc-fixtures.mjs');
  const snapshots = new Map();
  parentPort.on('message', async (task) => {
    if (task.source === 'fc' && !snapshots.has(task.fcRowsPath))
      snapshots.set(task.fcRowsPath, JSON.parse(readFileSync(task.fcRowsPath, 'utf8')));
    let weak =
      task.source === 'generated'
        ? null
        : task.source === 'fc'
          ? fcClub(snapshots.get(task.fcRowsPath), task.weakClubId, task.weakTactics)
          : strengthTeam(task.worldSeed, 0, task.weakLevel, task.weakTactics);
    let strong =
      task.source === 'generated'
        ? null
        : task.source === 'fc'
          ? fcClub(snapshots.get(task.fcRowsPath), task.strongClubId, task.strongTactics)
          : strengthTeam(task.worldSeed, 1, task.strongLevel, task.strongTactics);
    if (task.source === 'generated') {
      const game = createGame('公开校准球队', 42);
      weak = game.clubs[0];
      strong = game.clubs[1];
      weak.tactics.formation = '4-3-3';
      weak.tactics.style = task.style;
      weak.lineup = bestLineup(weak, '4-3-3');
      strong.tactics.formation = '4-3-3';
      strong.tactics.press = task.opponentPress;
      strong.lineup = bestLineup(strong, '4-3-3');
    }
    const started = performance.now();
    const engine = task.engineModulePath
      ? (await import(pathToFileURL(resolve(task.engineModulePath)).href)).simulate
      : simulate;
    const report = task.weakHome
      ? engine(weak, strong, task.seed, task.pairId ?? task.id)
      : engine(strong, weak, task.seed, task.pairId ?? task.id);
    const weakSide = task.weakHome ? 0 : 1;
    parentPort.postMessage({
      task,
      weakSide,
      actualAbilityWeakStrong: [lineupAbility(weak), lineupAbility(strong)],
      ...(task.source === 'fc'
        ? { fcStrengthWeakStrong: [fcLineupStrength(weak), fcLineupStrength(strong)] }
        : {}),
      ms: performance.now() - started,
      evidence: compareMatch(report),
      stats: report.stats,
      defenseCounts: report.performance.map((p) => ({
        id: p.id,
        side: p.side,
        tackles: p.tackles,
        tackleAttempts: p.tackleAttempts,
        wonTackles: p.wonTackles,
      })),
      score: report.score,
      trace: task.trace ? report : undefined,
    });
  });
} else {
  if (!process.argv[2]) throw Error('An explicit scratch output directory is required');
  const dir = resolve(process.argv[2]);
  mkdirSync(dir, { recursive: true });
  const tactics = { formation: '4-4-2', style: 'counter', press: 'low' };
  const defaults = [60, 70, 85].flatMap((strongLevel) =>
    [
      { ...tactics },
      { ...tactics, formation: '5-4-1' },
      { ...tactics, style: 'balanced', press: 'normal' },
    ].flatMap((weakTactics) =>
      [42, 12345].flatMap((worldSeed) =>
        [999, 1001].map((seed, index) => ({
          id: `strength-${strongLevel}-${weakTactics.formation}-${weakTactics.style}-${worldSeed}-${seed}`,
          worldSeed,
          weakLevel: 60,
          strongLevel,
          seed,
          weakHome: index === 0,
          weakTactics,
          strongTactics: { formation: '4-3-3', style: 'balanced', press: 'normal' },
        })),
      ),
    ),
  );
  const cases = process.argv[3] ? JSON.parse(readFileSync(process.argv[3], 'utf8')) : defaults;
  if (new Set(cases.map((c) => c.id)).size !== cases.length) throw Error('Duplicate case IDs');
  const queue = [...cases],
    results = [];
  let failed = false;
  const git = (...args) =>
    execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
  const metadata = {
    commit: git('rev-parse', 'HEAD'),
    diffSha256: createHash('sha256').update(git('diff', 'HEAD')).digest('hex'),
    startedAt: new Date().toISOString(),
    fixtureSha256: Object.fromEntries(
      ['strength-fixtures.mjs', 'fc-fixtures.mjs'].map((name) => [
        name,
        createHash('sha256')
          .update(readFileSync(new URL(name, import.meta.url)))
          .digest('hex'),
      ]),
    ),
    externalRatingSha256: Object.fromEntries(
      [...new Set(cases.filter((c) => c.source === 'fc').map((c) => c.fcRowsPath))].map((path) => [
        path,
        createHash('sha256').update(readFileSync(path)).digest('hex'),
      ]),
    ),
    externalEngineEntrySha256: Object.fromEntries(
      [...new Set(cases.map((c) => c.engineModulePath).filter(Boolean))].map((path) => [
        path,
        createHash('sha256').update(readFileSync(path)).digest('hex'),
      ]),
    ),
    cases,
  };
  writeFileSync(resolve(dir, 'inputs.json'), JSON.stringify(metadata, null, 2));
  await Promise.all(
    Array.from(
      { length: Math.min(4, cases.length) },
      () =>
        new Promise((done) => {
          const worker = new Worker(new URL(import.meta.url));
          worker.on('message', (row) => {
            const { trace, ...result } = row;
            results.push(result);
            writeFileSync(resolve(dir, row.task.id + '.json'), JSON.stringify(result, null, 2));
            if (trace)
              writeFileSync(resolve(dir, row.task.id + '-trace.json'), JSON.stringify(trace));
            console.log(
              JSON.stringify({
                done: results.length,
                id: row.task.id,
                scoreWeakStrong: [row.score[row.weakSide], row.score[1 - row.weakSide]],
                shotsWeakStrong: [row.stats[row.weakSide].shots, row.stats[1 - row.weakSide].shots],
                status: row.evidence.status,
              }),
            );
            if (queue.length) worker.postMessage(queue.shift());
            else worker.terminate();
          });
          worker.on('error', (error) => {
            failed = true;
            console.error(error);
          });
          worker.on('exit', () => done());
          worker.postMessage(queue.shift());
        }),
    ),
  );
  const describe = (values) => {
    const mean = values.reduce((s, n) => s + n, 0) / values.length;
    return {
      n: values.length,
      mean,
      sampleVariance:
        values.length > 1
          ? values.reduce((s, n) => s + (n - mean) ** 2, 0) / (values.length - 1)
          : null,
      min: Math.min(...values),
      max: Math.max(...values),
    };
  };
  const groups = {};
  for (const row of results) {
    const t = row.task,
      levels =
        t.source === 'generated'
          ? 'generated-control'
          : t.source === 'fc'
            ? `fc-${t.weakClubId}-${t.strongClubId}`
            : `${t.weakLevel}-${t.strongLevel}`,
      key = `${levels}-${t.weakTactics.formation}-${t.weakTactics.style}-${t.weakTactics.press}`;
    (groups[key] ??= []).push(row);
  }
  const summary = Object.fromEntries(
    Object.entries(groups).map(([key, rows]) => [
      key,
      {
        n: rows.length,
        weakWinDrawStrongWin: [-1, 0, 1].map(
          (sign) =>
            rows.filter((r) => Math.sign(r.score[1 - r.weakSide] - r.score[r.weakSide]) === sign)
              .length,
        ),
        weak: Object.fromEntries(
          ['shots', 'onTarget', 'xg', 'passes', 'possession', 'fouls'].map((metric) => [
            metric,
            describe(rows.map((r) => r.stats[r.weakSide][metric])),
          ]),
        ),
        strong: Object.fromEntries(
          ['shots', 'onTarget', 'xg', 'passes', 'possession', 'fouls'].map((metric) => [
            metric,
            describe(rows.map((r) => r.stats[1 - r.weakSide][metric])),
          ]),
        ),
        weakGoals: describe(rows.map((r) => r.score[r.weakSide])),
        strongGoals: describe(rows.map((r) => r.score[1 - r.weakSide])),
        scores: rows.map((r) => [r.score[r.weakSide], r.score[1 - r.weakSide]]),
      },
    ]),
  );
  const reference = JSON.parse(
    readFileSync(
      new URL(
        '../../packages/shared/modules/matches/design/INTERNATIONAL_CUP_REFERENCE_20261028.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const ratedReference = JSON.parse(
    readFileSync(
      new URL(
        '../../packages/shared/modules/matches/design/FC_FM_STRENGTH_REFERENCE_20261028.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  writeFileSync(
    resolve(dir, 'results.json'),
    JSON.stringify({ ...metadata, finishedAt: new Date().toISOString(), results }, null, 2),
  );
  writeFileSync(
    resolve(dir, 'summary.json'),
    JSON.stringify(
      {
        ...metadata,
        summary,
        ratedContext: {
          file: 'FC_FM_STRENGTH_REFERENCE_20261028.json',
          coverage: ratedReference.coverage,
          groups: Object.fromEntries(
            Object.entries(ratedReference.groups).filter(([k]) => k.includes('/noRed/')),
          ),
          limits:
            'Context only; selected benchmark XI != real match XI; FC proxy attributes != FM CA. No runtime targets or new validation thresholds.',
        },
        internationalContext: {
          sourceCommit: reference.sourceCommit,
          definition: reference.definitions.strength,
          causalLimit: reference.definitions.causality,
          data: reference.groups.worldCupPotGap2PlusNoRed,
        },
        status:
          results.length !== cases.length
            ? 'incomplete'
            : results.some((r) => r.evidence.status === 'blocked')
              ? 'blocked'
              : 'review',
      },
      null,
      2,
    ),
  );
  if (
    failed ||
    results.length !== cases.length ||
    results.some((r) => r.evidence.status === 'blocked')
  )
    process.exitCode = 1;
}
