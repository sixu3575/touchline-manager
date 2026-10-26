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
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ENGINE_VERSION, PARAMETER_VERSION } from '../../packages/shared/modules/matches/index.mjs';

test('published VM memory options preserve real worker checkpoint, halftime, events and every frame', async () => {
  const unit = readFileSync(
    new URL('../../deploy/touchline-manager.service', import.meta.url),
    'utf8',
  );
  const command = unit
    .split(/\r?\n/)
    .find((line) => line.startsWith('ExecStart='))
    .slice(10)
    .split(/\s+/);
  const flags = command.slice(1, -1);
  const gameUrl = new URL('../../packages/shared/game.mjs', import.meta.url).href;
  const matchUrl = new URL('../../packages/shared/modules/matches/index.mjs', import.meta.url).href;
  const workerUrl = new URL('../../packages/server/src/simulation-worker.mjs', import.meta.url)
    .href;
  const source = `
    import {Worker} from 'node:worker_threads';
    import {once} from 'node:events';
    const {createGame}=await import(${JSON.stringify(gameUrl)});
    const {ENGINE_VERSION,PARAMETER_VERSION}=await import(${JSON.stringify(matchUrl)});
    const g=createGame('运行参数',42), fixture={id:'runtime',seed:2026,options:{durationSeconds:60}};
    const make=()=>new Worker(new URL(${JSON.stringify(workerUrl)}),{resourceLimits:{maxOldGenerationSizeMb:128}});
    let worker=make();
    const request=async(checkpoint)=>{const ready=once(worker,'message');worker.postMessage({id:'runtime-job',fixture,home:g.clubs[0],away:g.clubs[1],engineVersion:ENGINE_VERSION,parameterVersion:PARAMETER_VERSION,checkpoint,expectedTick:checkpoint?.tick??0,sliceSeconds:30});return (await ready)[0]};
    const first=await request();if(first.error||first.done)throw Error(first.error??'Expected checkpoint');
    await worker.terminate();worker=make();
    const last=await request(first.part.checkpoint);await worker.terminate();
    if(last.error||!last.done)throw Error(last.error??'Expected completion');
    console.log(JSON.stringify(last,(key,value)=>ArrayBuffer.isView(value)?Array.from(value):value));
  `;
  const directory = mkdtempSync(join(tmpdir(), 'touchline-runtime-'));
  let stdout;
  try {
    const entry = join(directory, 'worker-runtime.mjs');
    writeFileSync(entry, source);
    ({ stdout } = await promisify(execFile)(process.execPath, [...flags, entry], {
      timeout: 30000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    }));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  const g = createGame('运行参数', 42);
  const expected = simulate(g.clubs[0], g.clubs[1], 2026, 'runtime', { durationSeconds: 60 });
  const canonical = JSON.parse(
    JSON.stringify(expected, (key, value) =>
      ArrayBuffer.isView(value) ? Array.from(value) : value,
    ),
  );
  const result = JSON.parse(stdout);
  assert.equal(result.part.managerState, undefined, 'worker metadata is transported separately');
  assert.deepEqual(
    {
      ...result.part,
      managerState: result.managerState,
      appliedManagerCommands: result.appliedCommands,
    },
    canonical,
  );
});

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
    assert.equal(result.part.managerState, undefined, 'durable report excludes transport metadata');
    assert.deepEqual(
      {
        ...result.part,
        managerState: result.managerState,
        appliedManagerCommands: result.appliedCommands,
      },
      expected,
    );
  } finally {
    await worker.terminate();
  }
});
