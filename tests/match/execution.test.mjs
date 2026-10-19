import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../../packages/shared/game.mjs';
import { random } from '../../packages/shared/core/index.mjs';
import { chooseAction } from '../../packages/shared/modules/matches/decisions.mjs';
import {
  updateFacing,
  turnRate,
  prepareKick,
  kickReady,
  releasedKick,
  kickRecovery,
} from '../../packages/shared/modules/matches/execution.mjs';
import {
  createPhysics,
  createBody,
  orientFoot,
  kick,
  touchesBall,
  stepPhysics,
} from '../../packages/shared/modules/matches/physics.mjs';
import { targetFor } from '../../packages/shared/modules/matches/positioning.mjs';
import {
  movement,
  movementMode,
  driveMovement,
  markingVelocity,
} from '../../packages/shared/modules/matches/locomotion.mjs';

function actor(changes = {}) {
  const player = structuredClone(
    createGame('动作测试', 42).clubs[0].players.find((p) => p.role === 'FWD'),
  );
  Object.keys(player.attributes).forEach((k) => (player.attributes[k] = 70));
  Object.assign(player.attributes, changes);
  player.preferredFoot = 'both';
  player.weakFoot = 100;
  return {
    player,
    side: 0,
    index: 0,
    direction: 1,
    facing: 0,
    energy: 100,
    pos: { x: 77.8, z: 34 },
    velocity: { x: 0, z: 0 },
    target: { x: 90, z: 34 },
    anchor: { x: 78, z: 34 },
    hold: 1,
  };
}
const shot = { type: 'shot', x: 28, y: 3, z: 0, quality: { value: 70 } };

test('expired reception observations do not keep turning a player away from current play', () => {
  const a = actor();
  a.receivePreparation = { startedAt: 0 };
  const ball = { x: 60, z: 34, vx: 8, vz: 0 };
  updateFacing(a, ball, 0.05, 1);
  assert.ok(Math.abs(a.facing) > 0.1);
  a.facing = 0;
  updateFacing(a, ball, 0.05, 10);
  assert.equal(a.facing, 0);
});

test('a marker matches observed running without the stationary-target parking dead zone or omniscient turns', () => {
  const physics = createPhysics(),
    a = { ...actor(), ...createBody(physics, 180, 70, 50, 34) };
  a.body.setLinvel({ x: 4, y: 0, z: 0 }, true);
  const roles = { chasers: [], marking: { [a.player.id]: 'runner' }, time: 0 };
  a.markMemory = { id: 'runner', seenAt: 0, velocity: { x: 4, z: 0 } };
  try {
    for (let i = 0; i < 80; i++) {
      roles.time = i * 0.05;
      a.markMemory.seenAt = roles.time;
      a.pos = a.body.translation();
      a.velocity = a.body.linvel();
      const dx = 50 + roles.time * 4 - a.pos.x,
        gap = Math.abs(dx);
      const mode = movementMode(a, { x: 0, z: 0 }, null, roles, gap),
        m = movement(a.player, 100, mode);
      assert.equal(mode, 'run', 'a moving mark does not trigger stationary stand/walk rules');
      const feed = markingVelocity(a, null, roles);
      driveMovement(a, { x: dx * 2 + feed.x, z: feed.z }, m, 0.05);
      stepPhysics(physics, null, [a]);
    }
    assert.ok(Math.abs(a.body.translation().x - 66) < 0.3);
    // The real opponent might have turned; only the remembered motion is available.
    assert.deepEqual(markingVelocity(a, null, roles), { x: 4, z: 0 });
    roles.time += 2;
    assert.deepEqual(markingVelocity(a, null, roles), { x: 0, z: 0 }, 'stale observations decay');
  } finally {
    physics.world.free();
  }
});

test('body turning has a continuous attribute and speed dependent bound', () => {
  const slow = actor({ agility: 25 }),
    quick = actor({ agility: 90 }),
    running = actor({ agility: 90 });
  running.velocity = { x: 6, z: 0 };
  assert.ok(turnRate(quick) > turnRate(slow));
  assert.ok(turnRate(running) < turnRate(quick));
  for (const a of [slow, quick, running]) {
    a.kickPlan = { heading: { x: -1, z: 0 } };
    const rate = turnRate(a);
    updateFacing(a, a.pos, 0.05);
    assert.ok(Math.abs(a.facing) <= rate * 0.05 + 1e-9);
    assert.ok(Math.abs(a.facing) < Math.PI / 2, 'no instantaneous half turn');
  }
});

test('an open first-time pass stays quick; a back-facing shot must turn and plant', () => {
  const a = actor({ firstTouch: 95, balance: 90 });
  a.lastReceptionPreparation = 0.5;
  const pass = { ...shot, type: 'pass', x: 9, y: 0.08 };
  a.kickPlan = prepareKick(a, pass, a.pos, 0, 1, false, true);
  assert.ok(a.kickPlan.readyAt <= 0.1);
  assert.equal(kickReady(a, 0), true, 'backswing can have been prepared before the ball arrived');
  assert.equal(kickReady(a, 0.1), true);
  a.facing = Math.PI;
  a.kickPlan = prepareKick(a, shot, a.pos, 0, 2, false, true);
  assert.ok(a.kickPlan.readyAt > 0.3, 'back-facing reception cannot spend preparation credit');
  assert.equal(kickReady(a, 0.5), false, 'elapsed wind-up alone does not align a body');
  for (let t = 0.05; t <= 0.8; t += 0.05) updateFacing(a, a.pos, 0.05);
  assert.equal(kickReady(a, 0.8), true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(a.kickPlan)),
    a.kickPlan,
    'durable plain checkpoint state',
  );
  assert.ok(kickRecovery(a, shot) > kickRecovery(a, pass));
});

test('a finite foot cannot reach behind the body before a real turn, and wind-up grants no remote kick', () => {
  const physics = createPhysics(),
    a = { ...actor(), ...createBody(physics, 180, 70, 50, 34) };
  try {
    a.pos = a.body.translation();
    const ball = { x: 49.35, y: 0.12, z: 34 };
    physics.ball.setTranslation(ball, true);
    orientFoot(a, ball);
    assert.equal(kick(physics, a, shot), false);
    a.kickPlan = prepareKick(a, { ...shot, x: -28 }, ball, 0, 1, false);
    for (let t = 0.05; t <= 0.8; t += 0.05) updateFacing(a, ball, 0.05);
    orientFoot(a, ball);
    assert.equal(kick(physics, a, { ...shot, x: -28 }), true);
    physics.ball.setTranslation({ ...ball, x: 47 }, true);
    assert.equal(kick(physics, a, shot), false, 'readiness never awards contact');
  } finally {
    physics.world.free();
  }
});

test('clear long shots remain natural decisions and delayed release rebases aim only before contact', () => {
  let shots = 0;
  for (let seed = 1; seed <= 50; seed++) {
    const a = actor({ longShots: 95, finishing: 90 });
    const action = chooseAction(
      a,
      [a],
      { x: 78.4, y: 0.11, z: 34 },
      1,
      { style: 'balanced' },
      random(seed),
      { time: 10 },
    );
    if (action.type === 'shot') {
      shots++;
      assert.ok(action.kickAim && action.kickFlight);
      const plan = prepareKick(a, action, a.pos, 10, seed, false);
      const launch = releasedKick(plan, { x: 78, y: 0.11, z: 34 });
      assert.ok(Number.isFinite(launch.x) && launch.x > 15);
      assert.deepEqual(launch.kickAim, action.kickAim);
    }
  }
  assert.ok(shots >= 40, `clear 26.6 m long shot was selected ${shots}/50`);
});

test('a moving receiver reaches a diagonal incoming ball instead of stopping outside foot range', () => {
  const physics = createPhysics();
  const player = createGame('接球复现', 42).clubs[0].players.find((p) => p.id === 'c0-p8');
  const a = {
    ...actor(),
    player,
    energy: 30,
    direction: -1,
    facing: Math.PI,
    ...createBody(physics, player.heightCm, 70, 90.41, 57.81),
  };
  a.body.setLinvel({ x: 1, y: 0, z: -0.8 }, true);
  physics.ball.setTranslation({ x: 99.5, y: 0.12, z: 34 }, true);
  physics.ball.setLinvel({ x: -7.45885, y: 0.08, z: 14.21684 }, true);
  physics.ball.setAngvel({ x: 14.21684 / 0.11, y: 0, z: 7.45885 / 0.11 }, true);
  let contact = false,
    nearest = Infinity;
  const roles = {
    chasers: [],
    receiverId: player.id,
    passTime: 0,
    receiveTarget: { x: 86, z: 60 },
  };
  try {
    for (let i = 0; i < 65 && !contact; i++) {
      a.pos = a.body.translation();
      a.velocity = a.body.linvel();
      const bp = physics.ball.translation(),
        bv = physics.ball.linvel(),
        ball = { ...bp, vx: bv.x, vz: bv.z };
      roles.time = i * 0.05;
      a.target = targetFor(a, [a], ball, null, -1, { style: 'possession' }, [], roles);
      const dx = a.target.x - a.pos.x,
        dz = a.target.z - a.pos.z,
        gap = Math.hypot(dx, dz);
      a.movementMode = movementMode(a, ball, null, roles, gap);
      const m = movement(player, a.energy, a.movementMode),
        speed = Math.min(m.speed, gap * 2);
      driveMovement(
        a,
        { x: (dx / Math.max(0.001, gap)) * speed, z: (dz / Math.max(0.001, gap)) * speed },
        m,
        0.05,
      );
      updateFacing(a, ball, 0.05);
      stepPhysics(physics, () => {
        orientFoot(a, physics.ball.translation());
        nearest = Math.min(
          nearest,
          Math.hypot(
            a.body.translation().x - physics.ball.translation().x,
            a.body.translation().z - physics.ball.translation().z,
          ),
        );
        contact ||= touchesBall(physics, a.foot);
      }, [a]);
    }
    assert.ok(contact, `receiver missed by ${nearest.toFixed(3)} m`);
  } finally {
    physics.world.free();
  }
});
