import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPhysics,
  createBody,
  stepPhysics,
  kick,
  orientFoot,
  goalCrossing,
  restorePhysics,
  releaseCatch,
} from '../../packages/shared/modules/matches/physics.mjs';
import { packActors, unpackActors } from '../../packages/shared/modules/matches/checkpoint.mjs';
import { createMatchSimulation } from '../../packages/shared/modules/matches/index.mjs';
import { attributionState } from '../../packages/shared/modules/matches/attribution.mjs';
import { movement } from '../../packages/shared/modules/matches/agents.mjs';
import { canReactToPass } from '../../packages/shared/modules/matches/onball.mjs';
import { createGame, simulate } from '../../packages/shared/game.mjs';

test('scored ball continues into the net before a delayed kickoff resets positions', () => {
  const g = createGame('入网轨迹', 42);
  // Test the post-goal mechanism from an explicit physical header opportunity.
  // An ordinary seeded match may legitimately be 0:0; full 90-minute seeded
  // determinism remains covered by engine.test.mjs. No goal event is injected.
  const args = [g.clubs[0], g.clubs[1], 999, 'net'];
  let engine = createMatchSimulation(...args, {
    durationSeconds: 180,
    sliceSeconds: 21,
    durable: true,
  });
  const checkpoint = structuredClone(engine.next().value.checkpoint);
  engine.return();
  const physics = restorePhysics(checkpoint.physics),
    actors = unpackActors(checkpoint.actors, physics);
  const attacker = actors.find((a) => a.side === 0 && a.player.role === 'FWD');
  for (const a of actors) {
    releaseCatch(physics, a);
    a.pos = { x: 20 + (a.index % 11) * 3, z: a.side ? 4 : 64 };
    a.velocity = { x: 0, z: 0 };
    a.target = { ...a.pos };
    a.intent = null;
    a.setPiece = null;
    a.kickPlan = null;
    a.onBallPlan = null;
    a.cooldown = 0;
    a.nextDecision = 0;
    a.body.setTranslation({ ...a.pos, y: a.height / 2 }, true);
    a.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }
  attacker.pos = { x: 94, z: 34 };
  attacker.target = { ...attacker.pos };
  attacker.body.setTranslation({ ...attacker.pos, y: attacker.height / 2 }, true);
  for (const key of Object.keys(attacker.player.attributes)) attacker.player.attributes[key] = 95;
  Object.assign(checkpoint.state, {
    restartUntil: 0,
    restartTaker: null,
    deadState: null,
    goalRestart: null,
    owner: null,
    offside: null,
    restartPlay: null,
    deliberate: null,
    pendingPass: null,
    lastPass: null,
    lastTouch: attacker.index,
    shot: null,
    statisticalContacts: [],
    attribution: attributionState(),
  });
  Object.assign(checkpoint.continuity, { controller: null, side: 0, phase: 'flight' });
  physics.ball.setTranslation({ x: 94, y: attacker.height - 0.1, z: 34 }, true);
  physics.ball.setLinvel({ x: 4, y: 0, z: 0 }, true);
  physics.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
  checkpoint.actors = packActors(actors);
  checkpoint.physics.world = physics.world.takeSnapshot();
  physics.world.free();
  engine = createMatchSimulation(...args, {
    durationSeconds: 180,
    sliceSeconds: 21,
    durable: true,
    checkpoint,
  });
  let part;
  try {
    do {
      part = engine.next();
    } while (!part.done);
  } finally {
    engine.return();
  }
  const r = part.value;
  const goal = r.events.find((e) => e.type === 'goal' && e.second < 5390);
  assert.ok(goal, 'the physically headed ball must produce a real goal');
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
  const runner = {
    index: 0,
    player: { role: 'MID', attributes: { anticipation: 20, firstTouch: 65 } },
  };
  assert.equal(canReactToPass(runner, 0, 0.2, 10), false);
  runner.player.attributes.anticipation = 90;
  assert.equal(
    canReactToPass(runner, 0, 0.2, 10),
    true,
    'higher anticipation reacts earlier rather than giving the body an arbitrary extra lead',
  );
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
