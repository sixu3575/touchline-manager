import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createGame, simulate } from '../packages/shared/game.mjs';
import { MatchJobs } from '../packages/server/src/match-jobs.mjs';
import { createReplayStorage } from '../packages/server/src/storage/replays.mjs';
import { unpack } from '../packages/server/src/storage/jobs.mjs';
import { broadcastAt, newBroadcast, liveReport } from '../packages/server/src/broadcast.mjs';

function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec(
    'CREATE TABLE saves(id TEXT PRIMARY KEY,token_hash TEXT,state TEXT,updated_at TEXT); CREATE TABLE operations(save_id TEXT,request_id TEXT,body_hash TEXT,PRIMARY KEY(save_id,request_id));',
  );
  const state = createGame('持续直播', 42),
    original = JSON.stringify(state);
  db.prepare('INSERT INTO saves VALUES (?,?,?,?)').run('one', 'test-only', original, 'before');
  let now = 100000;
  const jobs = new MatchJobs(db, createReplayStorage(db), { now: () => now });
  jobs.closing = true;
  const intent = {
    type: 'advance',
    payload: {},
    requestId: 'live-clock-0001',
    revision: state.revision,
  };
  const job = jobs.start('one', state, intent, 'same-body');
  const receive = (part, done) => {
    const work = unpack(jobs.store.get(job.id).work);
    jobs.active = { id: job.id, work, timer: setTimeout(() => {}, 10000) };
    jobs.received({ id: job.id, part, done });
  };
  const fixture = (index) => {
    const work = unpack(jobs.store.get(job.id).work),
      f = work.plan.order[index];
    return simulate(
      work.plan.state.clubs.find((c) => c.id === f.homeId),
      work.plan.state.clubs.find((c) => c.id === f.awayId),
      f.seed,
      f.id,
      { ...f.options, durationSeconds: 5400 },
    );
  };
  const pulse = () => {
    jobs.closing = false;
    jobs.pulse();
    jobs.closing = true;
  };
  return {
    db,
    state,
    original,
    jobs,
    job,
    intent,
    receive,
    fixture,
    pulse,
    setNow: (value) => {
      now = value;
    },
    now: () => now,
  };
}

test('a five-times server clock continues without viewers and pauses only for a genuine buffer underrun', () => {
  const p = { broadcast: newBroadcast(), generatedSeconds: 15, ownComplete: false };
  p.broadcast = broadcastAt(p, 1000).clock;
  assert.equal(broadcastAt(p, 2000).public.seconds, 5);
  const stalled = broadcastAt(p, 11000);
  assert.equal(stalled.public.seconds, 15);
  assert.equal(stalled.public.buffering, true);
  p.broadcast = stalled.clock;
  p.generatedSeconds = 90;
  assert.equal(
    broadcastAt(p, 12000).public.seconds,
    20,
    'new frames do not skip a previously buffered interval',
  );
  p.ownComplete = true;
  assert.equal(broadcastAt(p, 25000).public.finished, false);
  assert.equal(broadcastAt(p, 26000).public.finished, true);
});

test('all computed reports stay private until the broadcast ends; restarting and leaving never reset the clock', async () => {
  const x = setup();
  try {
    const own = x.fixture(0);
    own.score = [1, 0];
    own.events = [
      { type: 'kickoff', second: 0, minute: 0, side: 0 },
      { type: 'goal', second: 4000, minute: 66, side: 0 },
      { type: 'end', second: 5400, minute: 90, side: 0 },
    ];
    own.penalties = [5, 4];
    own.abandoned = true;
    const finalStats = structuredClone(own.stats);
    finalStats[0].xg = 999;
    own.stats = finalStats;
    own.timeline = [{ second: 0, stats: own.stats.map((s) => ({ ...s, xg: 0 })), performance: [] }];
    x.receive(own, true);
    assert.equal(x.jobs.view(x.jobs.store.get(x.job.id)).ownComplete, false);
    x.setNow(x.now() + 1000);
    const live = x.jobs.view(x.jobs.store.get(x.job.id));
    assert.equal(live.broadcast.seconds, 5);
    assert.deepEqual(live.report.score, [0, 0]);
    assert.equal(live.report.penalties, undefined);
    assert.equal(live.report.abandoned, undefined);
    assert.equal(live.report.stats[0].xg, 0);
    assert.ok(live.report.events.every((e) => e.second <= 5));
    const first = x.jobs.frames(x.jobs.store.get(x.job.id), 0);
    assert.equal(first.end, 76, 'only current frames plus a ten-second interpolation buffer');
    assert.equal(first.payload.length, 76 * 98);
    assert.throws(() => x.jobs.frames(x.jobs.store.get(x.job.id), 1000), /范围/);
    // Player frames are already available even though all three AI matches remain unfinished.
    assert.equal(unpack(x.jobs.store.get(x.job.id).work).index, 1);
    for (let i = 1; i < 4; i++) x.receive(x.fixture(i), true);
    assert.equal(x.jobs.store.get(x.job.id).status, 'airing');
    assert.equal(x.db.prepare('SELECT state FROM saves').get().state, x.original);
    for (const table of ['operations', 'replays', 'match_reports'])
      assert.equal(x.db.prepare('SELECT COUNT(*) n FROM ' + table).get().n, 0);
    const frozen = Buffer.from(x.jobs.store.get(x.job.id).work);
    await x.jobs.close();
    // A new coordinator uses persisted server timestamps, not browser storage or attendance.
    const resumed = new MatchJobs(x.db, createReplayStorage(x.db), { now: x.now });
    resumed.closing = true;
    x.setNow(100000 + 1079 * 1000);
    assert.equal(resumed.view(resumed.store.get(x.job.id)).broadcast.seconds, 5395);
    assert.ok(frozen.equals(Buffer.from(resumed.store.get(x.job.id).work)));
    x.setNow(100000 + 1080 * 1000);
    resumed.closing = false;
    resumed.pulse();
    resumed.closing = true;
    assert.equal(resumed.store.get(x.job.id).status, 'complete');
    const saved = JSON.parse(x.db.prepare('SELECT state FROM saves').get().state);
    assert.equal(saved.round, 1);
    assert.equal(saved.revision, x.state.revision + 1);
    assert.equal(saved.results.length, 4);
    assert.equal(x.db.prepare('SELECT COUNT(*) n FROM operations').get().n, 1);
    resumed.closing = false;
    resumed.pulse();
    resumed.closing = true;
    assert.equal(x.db.prepare('SELECT COUNT(*) n FROM operations').get().n, 1);
    await resumed.close();
  } finally {
    await x.jobs.close();
    x.db.close();
  }
});

test('a failed publication preserves staged results and resumes publication without simulating again', async () => {
  const x = setup();
  try {
    for (let i = 0; i < 4; i++) x.receive(x.fixture(i), true);
    const bytes = Buffer.from(x.jobs.store.get(x.job.id).work);
    x.db.exec(
      "CREATE TRIGGER refuse_publication BEFORE UPDATE ON saves BEGIN SELECT RAISE(ABORT,'publish failed');END;",
    );
    x.setNow(100000 + 1080 * 1000);
    x.pulse();
    assert.equal(x.jobs.store.get(x.job.id).status, 'failed');
    assert.ok(bytes.equals(Buffer.from(x.jobs.store.get(x.job.id).work)));
    assert.equal(x.db.prepare('SELECT COUNT(*) n FROM operations').get().n, 0);
    x.db.exec('DROP TRIGGER refuse_publication');
    assert.equal(x.jobs.start('one', x.state, x.intent, 'same-body').status, 'airing');
    assert.equal(unpack(x.jobs.store.get(x.job.id).work).reports.length, 4);
    x.pulse();
    assert.equal(x.jobs.store.get(x.job.id).status, 'complete');
  } finally {
    await x.jobs.close();
    x.db.close();
  }
});

test('new player fixtures take priority over another save’s remaining background fixtures', async () => {
  const x = setup();
  try {
    x.receive(x.fixture(0), true);
    x.db.prepare('INSERT INTO saves VALUES (?,?,?,?)').run('two', 'other', x.original, 'before');
    const other = x.jobs.start(
      'two',
      x.state,
      { ...x.intent, requestId: 'other-clock-0001' },
      'same-body',
    );
    assert.equal(x.jobs.store.waiting()[0].id, other.id);
    assert.equal(x.jobs.store.waiting()[1].id, x.job.id);
    assert.equal(x.jobs.view(x.jobs.store.get(x.job.id)).status, 'running');
    // Two unfinished player matches alternate at checkpoint boundaries rather than starve.
    const p = JSON.parse(x.jobs.store.get(x.job.id).progress);
    p.ownComplete = false;
    p.computedAt = 100;
    x.jobs.store.progress(x.job.id, p);
    const otherProgress = JSON.parse(x.jobs.store.get(other.id).progress);
    otherProgress.computedAt = 200;
    x.jobs.store.progress(other.id, otherProgress);
    assert.equal(x.jobs.store.waiting()[0].id, x.job.id);
    p.computedAt = 300;
    x.jobs.store.progress(x.job.id, p);
    assert.equal(x.jobs.store.waiting()[0].id, other.id);
  } finally {
    await x.jobs.close();
    x.db.close();
  }
});
