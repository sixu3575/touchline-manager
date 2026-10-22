import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createGame, simulate } from '../packages/shared/game.mjs';
import { MatchJobs } from '../packages/server/src/match-jobs.mjs';
import { createReplayStorage } from '../packages/server/src/storage/replays.mjs';
import { unpack } from '../packages/server/src/storage/jobs.mjs';
import { gunzipSync, gzipSync, inflateRawSync } from 'node:zlib';
import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import { ENGINE_VERSION, PARAMETER_VERSION } from '../packages/shared/modules/matches/index.mjs';
import { RATING_VERSION } from '../packages/shared/modules/matches/ratings/index.mjs';

function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE saves(id TEXT PRIMARY KEY,token_hash TEXT,state TEXT,updated_at TEXT);
    CREATE TABLE operations(save_id TEXT,request_id TEXT,body_hash TEXT,PRIMARY KEY(save_id,request_id));`);
  const state = createGame('事务验证', 42),
    raw = JSON.stringify(state);
  db.prepare('INSERT INTO saves VALUES (?,?,?,?)').run('one', 'test-only', raw, 'test');
  const jobs = new MatchJobs(db, createReplayStorage(db));
  jobs.closing = true;
  return { db, jobs, state, raw };
}
test('a new task waits until the previous worker has fully retired', async () => {
  const { db, jobs, state } = setup();
  let release;
  const stopped = new Promise((resolve) => {
    release = resolve;
  });
  try {
    jobs.worker = { terminate: () => stopped };
    jobs.closing = false;
    jobs.pump();
    const job = jobs.start(
      'one',
      state,
      { type: 'advance', payload: {}, revision: state.revision, requestId: 'request-retiring' },
      'hash-one',
    );
    assert.equal(jobs.worker, null);
    assert.equal(jobs.active, null);
    assert.equal(job.status, 'queued');
    jobs.closing = true;
    release(0);
    await jobs.close();
    assert.equal(jobs.retiring, null);
  } finally {
    jobs.closing = true;
    release(0);
    await jobs.close();
    db.close();
  }
});
test('completed replay is one gzip member with every live chunk in order', () => {
  const { db } = setup(),
    storage = createReplayStorage(db);
  try {
    const chunks = [Buffer.alloc(98, 11), Buffer.alloc(196, 22), Buffer.alloc(98, 33)];
    db.exec('BEGIN');
    storage.persistChunks(
      'one',
      'joined',
      chunks.map((c) => gzipSync(c)),
    );
    db.exec('COMMIT');
    const stored = Buffer.from(storage.find('one', 'joined'));
    const first = inflateRawSync(stored.subarray(10), { info: true });
    assert.equal(
      first.engine.bytesWritten + 18,
      stored.length,
      'no trailing gzip member may be ignored by a browser',
    );
    assert.ok(first.buffer.equals(Buffer.concat(chunks)));
    assert.ok(gunzipSync(stored).equals(first.buffer));
  } finally {
    db.close();
  }
});
test('a transaction that cannot begin does not roll back a nonexistent transaction or lose its checkpoint', () => {
  const { db, jobs, state, raw } = setup();
  const execute = db.exec.bind(db);
  try {
    const job = jobs.start(
      'one',
      state,
      {
        type: 'advance',
        payload: {},
        revision: state.revision,
        requestId: 'request-begin-failure',
      },
      'hash-one',
    );
    const row = jobs.store.get(job.id),
      before = Buffer.from(row.work),
      work = unpack(row.work);
    db.exec = (sql) => {
      if (sql === 'BEGIN IMMEDIATE') throw Error('injected begin failure');
      return execute(sql);
    };
    jobs.active = { id: job.id, work, timer: setTimeout(() => {}, 10000) };
    assert.doesNotThrow(() => jobs.received({ id: job.id, done: false, part: {} }));
    const failed = jobs.store.get(job.id);
    assert.equal(failed.status, 'failed');
    assert.ok(Buffer.from(failed.work).equals(before));
    assert.equal(db.prepare('SELECT state FROM saves WHERE id=?').get('one').state, raw);
    assert.equal(jobs.workerKey, null);
  } finally {
    db.exec = execute;
    db.close();
  }
});
test('an unreadable checkpoint isolates the failed task and preserves its original bytes', () => {
  const { db, jobs, state, raw } = setup();
  try {
    const job = jobs.start(
      'one',
      state,
      {
        type: 'advance',
        payload: {},
        revision: state.revision,
        requestId: 'request-bad-checkpoint',
      },
      'hash-one',
    );
    const bytes = Buffer.from([1, 2, 3, 4]);
    db.prepare('UPDATE match_jobs SET work=? WHERE id=?').run(bytes, job.id);
    jobs.closing = false;
    assert.doesNotThrow(() => jobs.pump());
    jobs.closing = true;
    const row = jobs.store.get(job.id);
    assert.equal(row.status, 'failed');
    assert.ok(Buffer.from(row.work).equals(bytes));
    assert.equal(db.prepare('SELECT state FROM saves WHERE id=?').get('one').state, raw);
    assert.equal(jobs.worker, null);
  } finally {
    jobs.closing = true;
    db.close();
  }
});
test('task admission freezes input, joins two modes, bounds queue and resumes the same failed request', () => {
  const { db, jobs, state, raw } = setup();
  try {
    const intent = {
      type: 'advance',
      payload: {},
      revision: state.revision,
      requestId: 'request-0001',
    };
    const a = jobs.start('one', state, intent, 'hash-one');
    const b = jobs.start('one', state, { ...intent, requestId: 'request-0002' }, 'hash-one');
    assert.equal(a.id, b.id);
    assert.equal(jobs.store.count(), 1);
    assert.throws(() => jobs.start('one', state, { ...intent, type: 'cup' }, 'other'), /操作标识/);
    const before = unpack(jobs.store.get(a.id).work);
    state.clubs[0].players[0].attributes.firstTouch = 1;
    assert.notDeepEqual(unpack(jobs.store.get(a.id).work).plan.state.clubs, state.clubs);
    jobs.store.save(a.id, {}, before, 'failed', 'interrupted');
    assert.equal(jobs.start('one', state, intent, 'hash-one').status, 'queued');
    assert.deepEqual(unpack(jobs.store.get(a.id).work), before);
    jobs.start('two', state, { ...intent, requestId: 'request-0003' }, 'hash-one');
    jobs.start('three', state, { ...intent, requestId: 'request-0004' }, 'hash-one');
    assert.throws(
      () => jobs.start('four', state, { ...intent, requestId: 'request-0005' }, 'hash-one'),
      /繁忙/,
    );
    assert.equal(db.prepare('SELECT state FROM saves WHERE id=?').get('one').state, raw);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 3);
  } finally {
    db.close();
  }
});
test('a failed final transaction preserves the previous checkpoint, money, operation and replay tables', () => {
  const { db, jobs, state, raw } = setup();
  try {
    const job = jobs.start(
      'one',
      state,
      { type: 'advance', payload: {}, revision: state.revision, requestId: 'request-atomic' },
      'hash-one',
    );
    const row = jobs.store.get(job.id),
      work = unpack(row.work);
    const reports = work.plan.order.map((f) =>
      simulate(
        work.plan.state.clubs.find((c) => c.id === f.homeId),
        work.plan.state.clubs.find((c) => c.id === f.awayId),
        f.seed,
        f.id,
        { ...f.options, durationSeconds: 2 },
      ),
    );
    const own = reports[0],
      trajectory = own.trajectory;
    delete own.trajectory;
    jobs.store.addChunk(job.id, 0, trajectory);
    work.seq = 1;
    work.index = 3;
    work.reports = reports.slice(0, 3);
    const progress = {
      seq: 1,
      report: own,
      ownComplete: true,
      frameCount: own.replay.frameCount,
      fixturesDone: 3,
    };
    jobs.store.save(job.id, progress, work);
    db.exec(
      "CREATE TRIGGER fail_save BEFORE UPDATE ON saves BEGIN SELECT RAISE(ABORT,'injected commit failure');END;",
    );
    jobs.active = { id: job.id, work, timer: setTimeout(() => {}, 10000) };
    jobs.received({ id: job.id, done: true, part: reports[3] });
    assert.equal(db.prepare('SELECT state FROM saves WHERE id=?').get('one').state, raw);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM operations').get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM replays').get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM match_reports').get().n, 0);
    const failed = jobs.store.get(job.id),
      restored = unpack(failed.work);
    assert.equal(failed.status, 'failed');
    assert.equal(restored.index, 3);
    assert.equal(restored.reports.length, 3);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM match_chunks').get().n, 1);
  } finally {
    db.close();
  }
});

test('long historical reports are losslessly stored outside state, while legacy reports stay unchanged', () => {
  const { db, state } = setup(),
    storage = createReplayStorage(db);
  try {
    const report = simulate(state.clubs[0], state.clubs[1], 42, 'detail', { durationSeconds: 2 });
    report.events = Array.from({ length: 1000 }, (_, i) => ({
      second: i,
      type: 'pass',
      side: i % 2,
      text: '历史动作',
      playerId: 'p' + i,
    }));
    const legacy = {
      id: 'legacy',
      engineVersion: '0.5.0',
      events: [{ type: 'goal', text: '旧报告' }],
      snapshots: [],
    };
    const beforeLegacy = JSON.stringify(legacy),
      expected = structuredClone(report);
    delete expected.trajectory;
    state.reports = [report, legacy];
    db.exec('BEGIN');
    storage.persist('one', state);
    db.exec('COMMIT');
    assert.equal(state.reports[0].detailsStored, true);
    assert.equal(state.reports[0].events.length, 0);
    assert.ok(JSON.stringify(state.reports[0]).length < JSON.stringify(expected).length / 10);
    const { playerRatings, teamRatings, ...archived } = JSON.parse(
      gunzipSync(storage.report('one', 'detail')).toString(),
    );
    assert.deepEqual(archived, expected);
    assert.equal(playerRatings.version, RATING_VERSION);
    assert.equal(playerRatings.rows.length, 22);
    assert.equal(teamRatings.length, 2);
    assert.ok(teamRatings.every((team) => team.starterCount === 11));
    assert.deepEqual(state.reports[0].teamRatings, teamRatings);
    assert.equal(JSON.stringify(state.reports[1]), beforeLegacy);
    const saved = Buffer.from(storage.report('one', 'detail'));
    db.exec('BEGIN');
    storage.persist('one', state);
    db.exec('COMMIT');
    assert.ok(
      saved.equals(Buffer.from(storage.report('one', 'detail'))),
      'idempotent persistence preserves archived bytes',
    );
    assert.equal(storage.report('other', 'detail'), undefined);
    state.reports = [legacy];
    db.exec('BEGIN');
    storage.persist('one', state);
    db.exec('COMMIT');
    assert.equal(storage.report('one', 'detail'), undefined);
    assert.equal(storage.find('one', 'detail'), undefined);
  } finally {
    db.close();
  }
});
