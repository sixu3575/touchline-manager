import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createGame, simulate } from '../../packages/shared/game.mjs';
import { MatchJobs } from '../../packages/server/src/match-jobs.mjs';
import { createReplayStorage } from '../../packages/server/src/storage/replays.mjs';
import { unpack } from '../../packages/server/src/storage/jobs.mjs';
import { gunzipSync, gzipSync, inflateRawSync } from 'node:zlib';
import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import { ENGINE_VERSION, PARAMETER_VERSION } from '../../packages/shared/modules/matches/index.mjs';

test('worker continuation and a new worker restored from transferred frames equal uninterrupted simulation', async () => {
  const g = createGame('线程恢复', 42),
    fixture = { id: 'thread', seed: 2026, options: { durationSeconds: 240 } };
  const make = () =>
    new Worker(new URL('../../packages/server/src/simulation-worker.mjs', import.meta.url), {
      resourceLimits: { maxOldGenerationSizeMb: 128 },
    });
  let worker = make(),
    checkpoint;
  const next = async (resume) => {
    let timer;
    const response = once(worker, 'message');
    worker.postMessage({
      id: 'job-thread',
      fixture,
      home: g.clubs[0],
      away: g.clubs[1],
      engineVersion: ENGINE_VERSION,
      parameterVersion: PARAMETER_VERSION,
      expectedTick: checkpoint?.tick ?? 0,
      checkpoint: resume ? checkpoint : undefined,
    });
    try {
      const [result] = await Promise.race([
        response,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error('Worker response timeout')), 30000);
        }),
      ]);
      assert.equal(result.error, undefined);
      return result;
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    let result = await next(false);
    checkpoint = result.part.checkpoint;
    assert.ok(checkpoint.frames.byteLength > 0);
    result = await next(false);
    checkpoint = result.part.checkpoint;
    assert.equal(checkpoint.tick, 2400);
    await worker.terminate();
    worker = make();
    result = await next(true);
    checkpoint = result.part.checkpoint;
    result = await next(false);
    assert.equal(result.done, true);
    const expected = simulate(g.clubs[0], g.clubs[1], fixture.seed, fixture.id, fixture.options);
    assert.deepEqual(result.part, expected);
  } finally {
    await worker.terminate();
  }
});
