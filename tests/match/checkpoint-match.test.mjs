import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, simulate, random } from '../../packages/shared/game.mjs';
import { createMatchSimulation } from '../../packages/shared/modules/matches/index.mjs';
import {
  createCompetitionPlan,
  settleCompetition,
} from '../../packages/shared/modules/competitions/index.mjs';
import {
  createPhysics,
  createBody,
  orientFoot,
  touchesBall,
  kick,
  stepPhysics,
} from '../../packages/shared/modules/matches/physics.mjs';
import { firstTouchVelocity } from '../../packages/shared/modules/matches/receiving.mjs';
import { passSpeed } from '../../packages/shared/modules/matches/decisions.mjs';
import {
  continuityState,
  controlBall,
  updateContinuity,
} from '../../packages/shared/modules/matches/continuity.mjs';

test('durable slices, including halftime, restore exactly the same events, stats and binary frames', () => {
  const g = createGame('恢复测试', 42),
    args = [g.clubs[0], g.clubs[1], 2026, 'checkpoint'];
  const expected = simulate(...args, { durationSeconds: 240 });
  let checkpoint = null,
    result;
  for (let i = 0; i < 4; i++) {
    const engine = createMatchSimulation(...args, {
      durationSeconds: 240,
      durable: true,
      checkpoint,
    });
    const part = engine.next();
    if (part.done) result = part.value;
    else {
      checkpoint = structuredClone(part.value.checkpoint);
      assert.ok(part.value.trajectory.length > 0);
    }
    engine.return();
  }
  assert.deepEqual(result, expected);
  assert.equal(expected.replay.clockScale, 1);
});
