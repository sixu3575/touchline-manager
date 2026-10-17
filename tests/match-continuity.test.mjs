import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, simulate, random } from '../packages/shared/game.mjs';
import { createMatchSimulation } from '../packages/shared/modules/matches/index.mjs';
import {
  createCompetitionPlan,
  settleCompetition,
} from '../packages/shared/modules/competitions/index.mjs';
import {
  createPhysics,
  createBody,
  orientFoot,
  touchesBall,
  kick,
  stepPhysics,
} from '../packages/shared/modules/matches/physics.mjs';
import { firstTouchVelocity } from '../packages/shared/modules/matches/receiving.mjs';
import { passSpeed } from '../packages/shared/modules/matches/decisions.mjs';
import {
  continuityState,
  controlBall,
  updateContinuity,
} from '../packages/shared/modules/matches/continuity.mjs';

test('finite first touches control at least 95 of 100 unopposed medium-quality 10m passes', () => {
  let controlled = 0;
  for (let seed = 0; seed < 100; seed++) {
    const physics = createPhysics(),
      rng = random(seed),
      a = { ...createBody(physics, 180, 50, 50.65, 34), velocity: { x: 0, z: 0 }, direction: 1 };
    try {
      physics.ball.setTranslation({ x: 40.65, y: 0.12, z: 34 }, true);
      physics.ball.setLinvel({ x: passSpeed(10, 50), y: 0.04, z: (rng() - 0.5) * 0.35 }, true);
      let contact = false;
      for (let tick = 0; tick < 80; tick++) {
        orientFoot(a, physics.ball.translation());
        if (touchesBall(physics, a.foot)) {
          const b = physics.ball.translation(),
            v = physics.ball.linvel();
          contact = kick(physics, a, firstTouchVelocity(a, b, 1, 50, Math.hypot(v.x, v.z), rng));
          break;
        }
        stepPhysics(physics);
      }
      if (contact) {
        for (let tick = 0; tick < 20; tick++) stepPhysics(physics);
        const b = physics.ball.translation();
        if (
          Math.hypot(b.x - 50.65, b.z - 34) < 2.6 &&
          Math.hypot(physics.ball.linvel().x, physics.ball.linvel().z) < 2
        )
          controlled++;
      }
    } finally {
      physics.world.free();
    }
  }
  assert.ok(controlled >= 95, `controlled ${controlled}/100`);
  assert.ok(
    passSpeed(10, 50) < passSpeed(30, 50),
    'short passes have a different arrival requirement',
  );
});

test('controller survives a brief independent carry but never gives remote contact', () => {
  const s = continuityState(),
    a = { index: 0, side: 0, pos: { x: 50, z: 34 }, direction: 1 };
  controlBall(s, a, 0, null);
  assert.equal(updateContinuity(s, [a], { x: 52, z: 34, y: 0.11 }, 0.5, true, null), a);
  assert.equal(updateContinuity(s, [a], { x: 53, z: 34, y: 0.11 }, 0.6, true, null), null);
  assert.equal(s.controller, null);
});

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

test('fixture order has frozen independent inputs and settlement rejects partial rounds', () => {
  const g = createGame('任务计划', 42),
    before = structuredClone(g),
    plan = createCompetitionPlan(g, 'advance');
  assert.deepEqual(g, before);
  assert.ok(plan.order[0].homeId === 'me' || plan.order[0].awayId === 'me');
  assert.deepEqual(
    new Set(plan.order.map((f) => f.seed)),
    new Set(plan.fixtures.map((f) => f.seed)),
  );
  assert.throws(() => settleCompetition(plan, []), /不完整/);
});
