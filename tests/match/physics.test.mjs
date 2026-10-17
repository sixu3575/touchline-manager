import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPhysics,
  createBody,
  stepPhysics,
  kick,
  orientFoot,
  goalCrossing,
} from '../../packages/shared/modules/matches/physics.mjs';
import { movement, targetFor } from '../../packages/shared/modules/matches/agents.mjs';
import { createGame, simulate } from '../../packages/shared/game.mjs';

test('gravity, grass bounce, inertia and body/goalpost collisions use rigid-body physics', () => {
  const p = createPhysics();
  try {
    p.ball.setTranslation({ x: 50, y: 3, z: 34 }, true);
    for (let i = 0; i < 10; i++) stepPhysics(p);
    assert.ok(p.ball.translation().y < 2 && p.ball.linvel().y < -4);
    let bounced = false;
    for (let i = 0; i < 40; i++) {
      stepPhysics(p);
      if (p.ball.linvel().y > 1) bounced = true;
    }
    assert.ok(bounced, 'sphere rebounds from grass');
    p.ball.setTranslation({ x: 100, y: 1, z: 30.34 }, true);
    p.ball.setLinvel({ x: 25, y: 0, z: 0 }, true);
    for (let i = 0; i < 8; i++) stepPhysics(p);
    assert.ok(p.ball.linvel().x < 0, 'CCD sphere hits a thin goalpost');
    const defender = createBody(p, 185, 80, 60, 34);
    p.ball.setTranslation({ x: 56, y: 1, z: 34 }, true);
    p.ball.setLinvel({ x: 15, y: 0, z: 0 }, true);
    for (let i = 0; i < 8; i++) stepPhysics(p);
    assert.ok(p.ball.translation().x < 60.5, 'player body obstructs the ball');
    assert.ok(defender.body.translation().x > 60, 'ball transfers momentum to body');
  } finally {
    p.world.free();
  }
});

test('a kick requires an overlapping foot, and the ball stays independent afterwards', () => {
  const p = createPhysics();
  try {
    const a = createBody(p, 180, 65, 50, 34);
    stepPhysics(p);
    assert.equal(kick(p, a, { x: 12, y: 3, z: 0 }), false);
    p.ball.setTranslation({ x: 50.65, y: 0.12, z: 34 }, true);
    orientFoot(a, p.ball.translation());
    stepPhysics(p);
    assert.equal(kick(p, a, { x: 12, y: 3, z: 0 }), true);
    const start = p.ball.translation();
    for (let i = 0; i < 10; i++) stepPhysics(p);
    assert.ok(p.ball.translation().x - start.x > 4);
    assert.ok(p.ball.translation().y > 0.3);
    assert.equal(kick(p, a, { x: -20, y: 0, z: 0 }), false, 'no remote magnetic control');
  } finally {
    p.world.free();
  }
});

test('only a whole-ball swept crossing between posts and under the crossbar scores', () => {
  assert.equal(goalCrossing({ x: 104, y: 1, z: 34 }, { x: 105.1, y: 1, z: 34 }), null);
  assert.equal(goalCrossing({ x: 104, y: 1, z: 34 }, { x: 106, y: 1, z: 34 }), 1);
  assert.equal(goalCrossing({ x: 1, y: 0.2, z: 35 }, { x: -1, y: 0.2, z: 35 }), 0);
  assert.equal(goalCrossing({ x: 104, y: 3, z: 34 }, { x: 106, y: 3, z: 34 }), null);
  assert.equal(goalCrossing({ x: 104, y: 1, z: 40 }, { x: 106, y: 1, z: 40 }), null);
});
