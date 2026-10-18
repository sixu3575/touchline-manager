import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveSecond, mergeLiveJob } from '../packages/client/src/modules/matches/live-clock.mjs';
const message = (seconds, serverNow, extra = {}) => ({
  id: 'same-match',
  status: 'running',
  type: 'advance',
  broadcast: { speed: 5, seconds, serverNow, started: true, finished: false, buffering: false },
  ...extra,
});

test('a delayed report/frame response cannot rewind a newer SSE clock or its receipt time', () => {
  const initial = mergeLiveJob(null, message(10, 100000), 1000);
  const summary = mergeLiveJob(initial, message(12.5, 100500), 1500);
  const delayed = message(10.1, 100020, {
    report: { id: 'downloaded-report', replay: { frameCount: 100 } },
  });
  const after = mergeLiveJob(summary, delayed, 1100);
  assert.equal(
    after.report.id,
    'downloaded-report',
    'frame metadata can be accepted without resetting playback',
  );
  assert.equal(after.receivedAt, 1500);
  assert.equal(after.broadcast.serverNow, 100500);
  assert.equal(liveSecond(after, 2000), 15);
});

test('variable delivery latency preserves continuous five-times playback instead of periodic catch-up freezes', () => {
  let current = mergeLiveJob(null, message(10, 100000), 1000);
  for (const [receivedAt, seconds, serverNow] of [
    [1650, 11, 100200],
    [2300, 13, 100600],
    [2950, 17, 101400],
  ]) {
    const before = liveSecond(current, receivedAt);
    current = mergeLiveJob(current, message(seconds, serverNow), receivedAt);
    assert.equal(liveSecond(current, receivedAt), before);
    assert.equal(liveSecond(current, receivedAt + 100), before + 0.5);
  }
  const anchored = mergeLiveJob(current, message(20, 102000), 3100);
  const frameFinishedLater = mergeLiveJob(anchored, message(20, 102000), 3100);
  assert.equal(liveSecond(frameFinishedLater, 3750), liveSecond(anchored, 3750));
});

test('real buffer pauses and final whistles remain authoritative; later running data resumes at five-times', () => {
  const running = mergeLiveJob(null, message(10, 100000), 1000);
  const stopped = message(11, 101000);
  stopped.broadcast.buffering = true;
  const buffered = mergeLiveJob(running, stopped, 2000);
  assert.equal(liveSecond(buffered, 5000), 11);
  const resumed = mergeLiveJob(buffered, message(11, 104000), 5000);
  assert.equal(liveSecond(resumed, 5200), 12);
  const final = message(60, 105000, { status: 'complete', ownComplete: true });
  final.broadcast.finished = true;
  const ended = mergeLiveJob(resumed, final, 6000);
  assert.equal(liveSecond(ended, 9000), 60);
  const stale = mergeLiveJob(ended, message(20, 104500), 6500);
  assert.equal(stale.status, 'complete');
  assert.equal(stale.ownComplete, true);
  assert.equal(liveSecond(stale, 10000), 60);
});

test('joining a different match resets the presentation clock and never carries an old report into kickoff', () => {
  const previous = mergeLiveJob(
    null,
    message(5400, 100000, { report: { id: 'old-report' } }),
    1000,
  );
  const next = message(0, 200000, { id: 'next-match', status: 'queued' });
  next.broadcast.started = false;
  const joined = mergeLiveJob(previous, next, 5000);
  assert.equal(joined.report, undefined);
  assert.equal(liveSecond(joined, 6000), 0);
  assert.equal(liveSecond({ id: 'legacy' }, 6000), 0);
  assert.equal(liveSecond(mergeLiveJob(null, message(5, 200000), 5000), 4900), 5);
});
