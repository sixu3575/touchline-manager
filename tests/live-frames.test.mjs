import { test } from 'node:test';
import assert from 'node:assert/strict';
import { positionAt, speedAt } from '../packages/client/src/modules/matches/frame-data.mjs';
import { playerEventStatistics } from '../packages/client/src/modules/matches/player-statistics.mjs';
const report = { replay: { frameCount: 10000, stride: 49, sampleHz: 5 } };
function frames(count) {
  const data = new Uint16Array(count * 49);
  for (let f = 0; f < count; f++) {
    for (let i = 0; i < 47; i++) data[f * 49 + i] = 500 + 100 * f;
    data[f * 49 + 48] = 2;
  }
  return data;
}
test('rejoin clock and metadata ahead of downloaded frames hold the last valid picture without NaN', () => {
  const data = frames(3),
    position = positionAt(data, report, 616.4);
  assert.equal(position.positions[0], 2);
  assert.equal(position.owner, 1);
  assert.ok([...position.positions].every(Number.isFinite));
  assert.equal(speedAt(data, report, 616.4, 0), Math.hypot(1, 1) * 5);
  assert.ok(Number.isFinite(speedAt(data, report, 616.4)));
});
test('empty, single and partially downloaded frames never read missing coordinates', () => {
  for (const data of [frames(0), frames(1), new Uint16Array(51)]) {
    assert.ok([...positionAt(data, report, 100).positions].every(Number.isFinite));
    assert.equal(speedAt(data, report, 100), 0);
  }
  assert.equal(positionAt(frames(3), report, -10).positions[0], 0);
});
test('interpolation and restart cuts retain their original physical meaning', () => {
  const data = frames(3);
  assert.equal(positionAt(data, report, 0.1).positions[0], 0.5);
  data[49 + 47] = 1;
  assert.equal(positionAt(data, report, 0.1).positions[0], 0);
  assert.equal(speedAt(data, report, 0), 0);
});

test('player statistics follow the viewed instant and confirmed attribution, excluding own goals and shootouts', () => {
  const event = (type, second, rest = {}) => ({
    type,
    second,
    minute: second / 60,
    side: 0,
    playerId: 'a',
    ...rest,
  });
  const report = {
    eventFormatVersion: 3,
    statisticsVersion: 'opta-conventional-1',
    replay: {
      players: [
        { id: 'a', side: 0 },
        { id: 'b', side: 0 },
        { id: 'gk', side: 1 },
      ],
    },
    events: [
      event('shot', 10, { shotId: 1 }),
      event('shot', 10, { shotId: 1 }),
      event('shotOutcome', 11, { shotId: 1, onTarget: true, outcome: 'saved' }),
      event('shotOutcome', 11, { shotId: 1, onTarget: true, outcome: 'saved' }),
      event('save', 11, { side: 1, playerId: 'gk', shotId: 1 }),
      event('shot', 20, { shotId: 2 }),
      event('shotOutcome', 21, { shotId: 2, onTarget: false, outcome: 'blocked' }),
      event('goal', 30, { playerId: 'b', assistId: 'a' }),
      event('goal', 35, { playerId: 'b', ownGoal: true, assistId: 'a' }),
      event('goal', 40),
      event('control', 41),
      event('interception', 42),
      event('foul', 43),
      event('offside', 44),
      event('shotOutcome', 45, { playerId: 'b', shotId: 3, keyPassId: 'a', outcome: 'saved' }),
      event('goal', 50, { side: 1, playerId: 'gk', assistId: 'a' }),
      event('goal', 100, { playerId: 'b', assistId: 'a' }),
      event('penaltyGoal', 5400),
      event('shot', 5500, { shotId: 4 }),
    ],
  };
  assert.equal(
    playerEventStatistics(report, 'a', 10).onTarget,
    0,
    'in-flight shot is not yet confirmed on target',
  );
  const current = playerEventStatistics(report, 'a', 60);
  assert.deepEqual(current, {
    goals: 1,
    assists: 1,
    shots: 2,
    onTarget: 1,
    saves: 0,
    interceptions: 1,
    keyPasses: 1,
    fouls: 1,
    offsides: 1,
  });
  assert.equal(playerEventStatistics(report, 'a', 29).assists, 0);
  assert.equal(playerEventStatistics(report, 'gk', 60).saves, 1, 'ordinary controls are not saves');
  assert.equal(
    playerEventStatistics(report, 'a', 5600).shots,
    2,
    'shootout and extra-period events do not become regulation shots',
  );
  assert.equal(
    playerEventStatistics({ ...report, statisticsVersion: undefined, events: [] }, 'a', 0).onTarget,
    undefined,
    'missing historical confirmation is not a measured zero',
  );
});
