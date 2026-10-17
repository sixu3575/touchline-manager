import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  applyAction,
  simulate,
  schedule,
  validateLineup,
  standings,
} from '../../packages/shared/game.mjs';

test('seeded engine reproduces complete event log and keeps score consistent', () => {
  let g = createGame('测试球队', 42);
  let a = simulate(g.clubs[0], g.clubs[1], 999);
  let b = simulate(g.clubs[0], g.clubs[1], 999);
  assert.deepEqual(a, b);
  for (let side = 0; side < 2; side++)
    assert.equal(
      a.score[side],
      a.events.filter((e) => e.type === 'goal' && e.side === side).length,
    );
  assert.equal(a.stats[0].possession + a.stats[1].possession, 100);
  assert.equal(a.replay.frameCount, 27001);
  assert.equal(a.replay.duration * a.replay.clockScale, 5400);
  assert.equal(a.events.find((e) => e.type === 'half').minute, 45);
  assert.equal(a.events.at(-1).minute, 90);
  assert.ok(a.performance.every((p) => p.energy >= 20 && p.energy <= 100));
});
