import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPhysics,
  createBody,
  stepPhysics,
  kick,
  orientFoot,
  goalCrossing,
} from '../packages/shared/modules/matches/physics.mjs';
import { movement, targetFor } from '../packages/shared/modules/matches/agents.mjs';
import { createGame, simulate } from '../packages/shared/game.mjs';

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

test('scored ball continues into the net before a delayed kickoff resets positions', () => {
  const g = createGame('入网轨迹', 42);
  const r = simulate(g.clubs[0], g.clubs[1], 42, 'net');
  const goal = r.events.find((e) => e.type === 'goal' && e.second < 5390);
  assert.ok(goal, 'seeded goal fixture');
  const nextKickoff = r.events.find((e) => e.type === 'kickoff' && e.second > goal.second);
  assert.ok(nextKickoff.second - goal.second >= 2.5);
  const index = Math.ceil((goal.second + 0.2) * r.replay.sampleHz) * r.replay.stride;
  const ballX = r.trajectory[index + 44] / 100 - 5;
  assert.ok(Math.abs(ballX - 52.5) > 45, 'ball remains at the scored goal, not the centre spot');
  assert.equal(r.trajectory[index + 47], 0, 'no premature replay cut after goal');
});

test('player attributes and fatigue determine locomotion; tactics change saved team movement', () => {
  const low = { attributes: { sprintSpeed: 20, acceleration: 20, agility: 20 } };
  const high = { attributes: { sprintSpeed: 90, acceleration: 90, agility: 90 } };
  assert.ok(movement(high, 100).speed > movement(low, 100).speed);
  assert.ok(movement(high, 100).acceleration > movement(low, 100).acceleration);
  assert.ok(movement(high, 100).speed > movement(high, 25).speed);
  const runner = { index: 0, player: { role: 'MID', attributes: { anticipation: 20 } } };
  const ball = { x: 50, z: 34, vx: 10, vz: 0 };
  const late = targetFor(runner, [], ball, null, 1, {}, [0]);
  runner.player.attributes.anticipation = 90;
  const early = targetFor(runner, [], ball, null, 1, {}, [0]);
  assert.ok(early.x > late.x, 'higher anticipation leads the moving ball further in advance');
  const g = createGame('物理测试', 42);
  const original = structuredClone(g.clubs);
  const a = simulate(g.clubs[0], g.clubs[1], 2026, 'short', { durationSeconds: 180 });
  assert.deepEqual(g.clubs, original, 'simulation does not mutate its inputs');
  assert.equal(a.replay.frameCount, 901);
  assert.equal(a.trajectory.length, a.replay.frameCount * 49);
  assert.ok(a.performance.every((p) => Number.isFinite(p.distance) && p.distance > 5));
  assert.ok(a.performance.reduce((s, p) => s + p.touches, 0) > 10);
  assert.ok(a.events.some((e) => e.type === 'pass'));
  g.clubs[0].tactics.style = 'wide';
  g.clubs[0].tactics.press = 'high';
  const b = simulate(g.clubs[0], g.clubs[1], 2026, 'short', { durationSeconds: 180 });
  assert.notDeepEqual(a.trajectory, b.trajectory);
});
