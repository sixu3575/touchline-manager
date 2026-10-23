import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPhysics,
  createBody,
  physicalPlayerContact,
  orientFoot,
  kick,
  stepPhysics,
  STEP,
} from '../../packages/shared/modules/matches/physics.mjs';
import { movement, driveMovement } from '../../packages/shared/modules/matches/locomotion.mjs';
import {
  groundPassPlan,
  airborneVelocity,
} from '../../packages/shared/modules/matches/ball-motion.mjs';

function runner(physics, pace = 50, acceleration = pace, balance = pace, energy = 100) {
  return {
    ...createBody(physics, 180, 50, 10, 15),
    energy,
    player: {
      attributes: { sprintSpeed: pace, acceleration, agility: 50, balance, dribbling: 50 },
      matchState: { energy },
    },
  };
}
function run(pace, acceleration, energy = 100) {
  const p = createPhysics(),
    a = runner(p, pace, acceleration, 50, energy);
  try {
    const m = movement(a.player, energy);
    let atOneSecond;
    for (let i = 0; i < 160; i++) {
      driveMovement(a, { x: 100, z: 0 }, m, STEP);
      stepPhysics(p, null, [a]);
      const speed = Math.hypot(a.body.linvel().x, a.body.linvel().z);
      assert.ok(speed <= m.topSpeed + 0.001, `intentional run exceeded ${m.topSpeed}: ${speed}`);
      if (i === 19) atOneSecond = speed;
    }
    return { peak: a.body.linvel().x, atOneSecond, distance: a.body.translation().x - 10 };
  } finally {
    p.world.free();
  }
}

test('foul contact gate requires a Rapier body or leg collision, not proximity alone', () => {
  const physics = createPhysics();
  const a = createBody(physics, 180, 50, 10, 15),
    b = createBody(physics, 180, 50, 10.25, 15);
  try {
    physics.world.step();
    assert.equal(physicalPlayerContact(physics, a, b), true);
    b.body.setTranslation({ x: 20, y: b.height / 2, z: 15 }, true);
    b.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    physics.world.step();
    assert.equal(physicalPlayerContact(physics, a, b), false);
  } finally {
    physics.world.free();
  }
});

test('finite tackling-foot overlap registers contact with an opponent without moving bodies', () => {
  const physics = createPhysics();
  const a = { ...createBody(physics, 180, 50, 10, 15), direction: 1 },
    b = createBody(physics, 180, 50, 10.65, 15);
  try {
    orientFoot(a, { x: 10.65, y: 0.2, z: 15 });
    physics.world.step();
    assert.equal(physicalPlayerContact(physics, a, b), true);
    assert.ok(Math.abs(a.body.translation().x - 10) < 0.01);
    assert.ok(Math.abs(b.body.translation().x - 10.65) < 0.01);
  } finally {
    physics.world.free();
  }
});

test('actual rigid-body sprint, acceleration and fatigue respond to player attributes within human bounds', () => {
  const low = run(20, 50),
    medium = run(50, 50),
    high = run(100, 50);
  assert.ok(low.peak > 6 && low.peak < medium.peak && medium.peak < high.peak && high.peak < 9.31);
  assert.ok(low.distance < medium.distance && medium.distance < high.distance);
  assert.ok(run(60, 90).atOneSecond > run(60, 20).atOneSecond + 1);
  assert.ok(run(100, 90, 20).peak < run(100, 90, 100).peak);
  assert.ok(movement({ attributes: { sprintSpeed: 999 } }, 100).speed <= 9.3);
});

test('turning brakes over time and capsule impacts cannot launch a superhuman runner', () => {
  const p = createPhysics(),
    a = runner(p, 50, 50, 80),
    m = movement(a.player, 100);
  try {
    a.body.setLinvel({ x: 7, y: 0, z: 0 }, true);
    driveMovement(a, { x: -m.speed, z: 0 }, m, STEP);
    assert.ok(a.body.linvel().x > 6, 'reversal must not instantly change the sign of momentum');
    for (let i = 0; i < 60; i++) {
      driveMovement(a, { x: -m.speed, z: 0 }, m, STEP);
      stepPhysics(p, null, [a]);
    }
    assert.ok(a.body.linvel().x < -5);
    a.body.applyImpulse({ x: a.body.mass() * 35, y: 0, z: 0 }, true);
    stepPhysics(p, null, [a]);
    assert.ok(Math.hypot(a.body.linvel().x, a.body.linvel().z) <= m.topSpeed + 0.601);
  } finally {
    p.world.free();
  }
});

test('grass rolling slows progressively to rest without skidding to walking speed or reversing', () => {
  const distances = [];
  for (const launch of [3, 8, 16]) {
    const p = createPhysics();
    try {
      p.ball.setTranslation({ x: 10, y: 0.11, z: 15 }, true);
      p.ball.setLinvel({ x: launch, y: 0, z: 0 }, true);
      let previous = launch,
        stopped = false;
      for (let i = 0; i < 800; i++) {
        stepPhysics(p);
        const v = p.ball.linvel();
        assert.ok(v.x >= -0.00001 && v.x <= previous + 0.00001);
        previous = v.x;
        if (launch === 8 && i === 19) assert.ok(v.x > 6 && v.x < 7.3, `8m/s after 1s: ${v.x}`);
        if (v.x < 0.001) {
          stopped = true;
          break;
        }
      }
      assert.ok(stopped, 'grass must eventually stop even a fast ground ball');
      const x = p.ball.translation().x;
      for (let i = 0; i < 40; i++) stepPhysics(p);
      assert.ok(Math.abs(p.ball.translation().x - x) < 0.01, 'no residual-spin creep');
      assert.ok(Math.hypot(...Object.values(p.ball.angvel())) < 0.001);
      distances.push(x - 10);
    } finally {
      p.world.free();
    }
  }
  assert.ok(distances[0] > 4 && distances[0] < 9);
  assert.ok(distances[1] > 23 && distances[1] < 36);
  assert.ok(distances[2] > 55 && distances[2] < 82);
});

test('flying balls lose substantial aerodynamic speed and turf bounce dissipates energy', () => {
  const p = createPhysics();
  try {
    p.ball.setTranslation({ x: 10, y: 8, z: 15 }, true);
    p.ball.setLinvel({ x: 30, y: 0, z: 0 }, true);
    for (let i = 0; i < 20; i++) stepPhysics(p);
    assert.ok(p.ball.linvel().x > 20 && p.ball.linvel().x < 23);
    assert.ok(p.ball.translation().y > 3 && p.ball.translation().y < 5);
    p.ball.setTranslation({ x: 50, y: 2.11, z: 15 }, true);
    p.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
    let upward = false,
      peak = 0;
    for (let i = 0; i < 60; i++) {
      stepPhysics(p);
      if (p.ball.linvel().y > 0.5) upward = true;
      if (upward) peak = Math.max(peak, p.ball.translation().y - 0.11);
    }
    assert.ok(peak > 0.35 && peak < 0.85, `rebound: ${peak}`);
  } finally {
    p.world.free();
  }
});

test('planned 5, 10 and 30 metre ground passes arrive at a useful speed and predicted time', () => {
  for (const length of [5, 10, 30]) {
    const p = createPhysics(),
      a = { ...createBody(p, 180, 50, 9.35, 15), direction: 1 };
    try {
      p.ball.setTranslation({ x: 10, y: 0.11, z: 15 }, true);
      orientFoot(a, p.ball.translation());
      const plan = groundPassPlan(length, 50);
      assert.equal(kick(p, a, { x: plan.speed, y: 0.08, z: 0 }), true);
      let arrived = false;
      for (let i = 1; i < 120; i++) {
        stepPhysics(p);
        if (p.ball.translation().x >= 10 + length) {
          assert.ok(Math.abs(p.ball.linvel().x - plan.arrival) < 0.8);
          assert.ok(Math.abs(i * STEP - plan.flight) < 0.12);
          arrived = true;
          break;
        }
      }
      assert.ok(arrived, `pass must cover ${length} metres`);
    } finally {
      p.world.free();
    }
  }
});

test('kicks remain contact-limited and bounded; lofted planning accounts for flight drag', () => {
  const p = createPhysics(),
    a = { ...createBody(p, 180, 50, 10, 15), direction: 1 };
  try {
    p.ball.setTranslation({ x: 10.65, y: 0.12, z: 15 }, true);
    orientFoot(a, p.ball.translation());
    assert.equal(kick(p, a, { x: 1000, y: 1000, z: 0 }), true);
    assert.ok(Math.hypot(...Object.values(p.ball.linvel())) < 38.001);
    assert.equal(kick(p, a, { x: NaN, y: 0, z: 0 }), false);
    const from = { x: 10, y: 0.12, z: 15 },
      to = { x: 40, y: 0.15, z: 15 };
    const launch = airborneVelocity(from, to, 1.8);
    p.ball.setTranslation(from, true);
    p.ball.setLinvel(launch, true);
    for (let i = 0; i < 36; i++) stepPhysics(p);
    assert.ok(Math.abs(p.ball.translation().x - to.x) < 1.5);
    assert.ok(p.ball.translation().y < 0.8);
  } finally {
    p.world.free();
  }
});
