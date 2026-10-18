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

test('scored ball continues into the net before a delayed kickoff resets positions', () => {
  const g = createGame('入网轨迹', 42);
  const r = simulate(g.clubs[0], g.clubs[1], 42, 'net');
  const goal = r.events.find((e) => e.type === 'goal' && e.second < 5390);
  assert.ok(goal, 'seeded goal fixture');
  const nextKickoff = r.events.find((e) => e.type === 'kickoff' && e.second > goal.second);
  assert.ok(nextKickoff.second - goal.second >= 15);
  const index = Math.ceil((goal.second + 0.2) * r.replay.sampleHz) * r.replay.stride;
  const ballX = r.trajectory[index + 44] / 100 - 5;
  assert.ok(Math.abs(ballX - 52.5) > 45, 'ball remains at the scored goal, not the centre spot');
  assert.equal(r.trajectory[index + 47], 0, 'no premature replay cut after goal');
  if (!goal.ownGoal) assert.equal(goal.scorer.id, goal.playerId);
  else assert.equal(goal.scorer.side, 1 - goal.side);
  assert.ok(goal.scorer.number > 0 && goal.scorer.name);
  assert.ok(goal.text.includes(`${goal.scorer.number}号 ${goal.scorer.name}`));
  const end = ballX > 52.5 ? 1 : 0;
  for (let t = goal.second + 0.2; t < nextKickoff.second - 0.2; t += 0.2) {
    const offset = Math.ceil(t * r.replay.sampleHz) * r.replay.stride;
    const x = r.trajectory[offset + 44] / 100 - 5;
    assert.ok(end ? x > 105 : x < 0, 'saved goal trajectory stays in net until kickoff');
  }
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
