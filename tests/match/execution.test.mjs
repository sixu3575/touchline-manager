import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../../packages/shared/game.mjs';
import { random } from '../../packages/shared/core/index.mjs';
import {
  chooseAction,
  interceptionRisk,
} from '../../packages/shared/modules/matches/decisions.mjs';
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
  createHands,
  orientHands,
  secureCatch,
  releaseCatch,
  restorePhysics,
  moveCatch,
} from '../../packages/shared/modules/matches/physics.mjs';
import { targetFor } from '../../packages/shared/modules/matches/positioning.mjs';
import { movingBallIntercept } from '../../packages/shared/modules/matches/arrival.mjs';
import { defensiveAssignments } from '../../packages/shared/modules/matches/defending.mjs';
import {
  needsOnBallScan,
  rememberOnBallAction,
  controlMovement,
  motorTouch,
  canReactToPass,
  boundaryAwareness,
  boundaryVelocity,
} from '../../packages/shared/modules/matches/onball.mjs';
import {
  firstTouchVelocity,
  receptionPlan,
} from '../../packages/shared/modules/matches/receiving.mjs';
import {
  groundPassPlan,
  groundTravel,
  groundArrivalTime,
} from '../../packages/shared/modules/matches/ball-motion.mjs';
import {
  continuationValue,
  lossValue,
} from '../../packages/shared/modules/matches/opportunity.mjs';
import {
  keeperCrossing,
  keeperDiveVelocity,
  readKeeperPreparation,
  parryVelocity,
} from '../../packages/shared/modules/matches/goalkeeping.mjs';
import {
  movement,
  movementMode,
  driveMovement,
  markingVelocity,
  restartAvoidance,
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

test('a byline approach brakes through real foot contacts and inertia while a late spill can still go out', () => {
  const run = (late, direction) => {
    const physics = createPhysics(),
      start = late ? 103.7 : 98;
    const x = (n) => (direction === 1 ? n : 105 - n);
    const a = {
      ...actor({ anticipation: 90, dribbling: 90, balance: 90, agility: 90 }),
      direction,
      facing: direction === 1 ? 0 : Math.PI,
      ...createBody(physics, 180, 70, x(start), 44),
    };
    a.intent = { kind: 'carry', mode: 'carryFast', destination: { x: x(104), z: 49 } };
    a.body.setLinvel({ x: direction * (late ? 8 : 5), y: 0, z: 0 }, true);
    physics.ball.setTranslation({ x: x(start + 0.6), y: 0.11, z: 44 }, true);
    physics.ball.setLinvel({ x: direction * (late ? 8 : 5), y: 0, z: 0 }, true);
    let next = 0,
      max = 0,
      touches = 0;
    try {
      for (let tick = 0; tick < 120; tick++) {
        a.pos = a.body.translation();
        a.velocity = a.body.linvel();
        const p = physics.ball.translation(),
          v = physics.ball.linvel(),
          ball = { ...p, vx: v.x, vz: v.z };
        a.target = a.intent.destination;
        updateFacing(a, ball, 0.05);
        orientFoot(a, ball);
        driveMovement(a, controlMovement(a, ball), movement(a.player, 100, 'carryFast'), 0.05);
        if (
          tick * 0.05 >= next &&
          touchesBall(physics, a.foot) &&
          kick(
            physics,
            a,
            motorTouch(a, ball, () => 0.5),
          )
        ) {
          next = tick * 0.05 + 0.25;
          touches++;
        }
        stepPhysics(physics, null, [a]);
        const depth =
          direction === 1 ? physics.ball.translation().x : 105 - physics.ball.translation().x;
        max = Math.max(max, depth);
        if (depth > 105.11) break;
      }
      return { max, touches };
    } finally {
      physics.world.free();
    }
  };
  for (const direction of [1, -1]) {
    const prepared = run(false, direction),
      late = run(true, direction);
    assert.ok(prepared.touches > 2, 'real repeated contacts keep the ball under control');
    assert.ok(prepared.max <= 105.11, `early braking keeps ball on pitch: ${prepared.max}`);
    assert.ok(
      late.max > 105.11,
      'a physically unrecoverable ball is not stopped by an invisible boundary',
    );
  }
});

test('receivers recognize an approaching end line, with attribute-dependent braking and no blanket loss of open-field speed', () => {
  const high = actor({ anticipation: 95, balance: 95, agility: 95 }),
    low = actor({ anticipation: 20, balance: 20, agility: 20 });
  const ball = { x: 103, z: 44, vx: 5, vz: 0 };
  high.pos = { x: 102.4, z: 44 };
  high.velocity = { x: 5, z: 0 };
  assert.ok(boundaryAwareness(high, ball).risk > 0);
  assert.equal(receptionPlan(high, ball, 1, 90, 5, [], 0).flow, false);
  assert.ok(
    boundaryVelocity(high, ball, { x: 5, z: 0 }).x > boundaryVelocity(low, ball, { x: 5, z: 0 }).x,
    'a stronger brake allows more usable speed',
  );
  const first = firstTouchVelocity(high, ball, 1, 90, 5, () => 0.5, [], { flow: true });
  const open = firstTouchVelocity(high, { ...ball, x: 50 }, 1, 90, 5, () => 0.5, [], {
    flow: true,
  });
  assert.ok(first.x < open.x);
  assert.deepEqual(boundaryVelocity(high, { x: 50, z: 34 }, { x: 5, z: 2 }), { x: 5, z: 2 });
});

test('a keeper intercepts by remaining flight time rather than braking short of the ball', () => {
  const a = { ...actor(), pos: { x: 2, z: 34 } };
  const early = keeperDiveVelocity(a, { x: 12, z: 35.5, vx: -20, vz: 0 }, 0);
  assert.equal(early, 3);
  a.keeperRead = null;
  const urgent = keeperDiveVelocity(a, { x: 7, z: 35.5, vx: -20, vz: 0 }, 1);
  assert.equal(urgent, 6);
  assert.ok(urgent > early, 'same distance needs faster movement when impact is closer');
  a.keeperRead = null;
  assert.equal(keeperDiveVelocity(a, { x: 7, z: 35.5, vx: 20, vz: 0 }, 2), null);
});

test('a finite diving hand reaches laterally over time, without claiming a remote ball', () => {
  const physics = createPhysics();
  const a = { ...actor({ reflexes: 70 }), ...createBody(physics, 180, 70, 2, 34) };
  a.hands = createHands(physics, a);
  physics.ball.setTranslation({ x: 2, y: 1.2, z: 35.5 }, true);
  try {
    orientHands(a, physics.ball.translation(), 0.63);
    assert.equal(
      touchesBall(physics, a.hands),
      false,
      'standing reach cannot cover the diving save',
    );
    orientHands(a, physics.ball.translation(), 1.35, 0.05);
    assert.equal(touchesBall(physics, a.hands), false, 'arms cannot teleport to full extension');
    for (let i = 0; i < 6; i++) orientHands(a, physics.ball.translation(), 1.35, 0.05);
    assert.ok(touchesBall(physics, a.hands));
    physics.ball.setTranslation({ x: 2, y: 1.2, z: 36.4 }, true);
    for (let i = 0; i < 20; i++) orientHands(a, physics.ball.translation(), 1.35, 0.05);
    assert.equal(
      touchesBall(physics, a.hands),
      false,
      'finite diving reach still cannot touch a distant ball',
    );
  } finally {
    physics.world.free();
  }
});

test('defence assigns the reachable future interceptor instead of a player left behind a fast pass', () => {
  const behind = { ...actor(), index: 0, side: 1, pos: { x: 50, z: 34 } };
  const ahead = { ...actor(), index: 1, side: 1, pos: { x: 60, z: 34.8 } };
  const ball = { x: 50.5, y: 0.11, z: 34, vx: 14, vy: 0, vz: 0 };
  const reachable = movingBallIntercept(ahead, ball);
  assert.ok(reachable.feasible && reachable.time < 1.5 && reachable.point.x > 56);
  assert.ok(!movingBallIntercept(behind, ball).feasible);
  const roles = defensiveAssignments([behind, ahead], 1, ball, null, -1, { press: 'normal' }, 1);
  assert.equal(roles.chasers[0], ahead.index);
});

test('near goal a spare central defender protects the shot corridor instead of following every off-ball runner', () => {
  for (const direction of [1, -1]) {
    const x = (v) => (direction === 1 ? v : 105 - v);
    const defenders = [19, 17, 8].map((v, i) => ({
      ...actor(),
      index: i,
      side: 0,
      player: { ...actor().player, id: `def-${i}`, role: 'DEF' },
      positionRole: 'centreBack',
      pos: { x: x(v), z: i === 2 ? 30 : 34 },
    }));
    const owner = { ...actor(), side: 1, index: 3, pos: { x: x(20), z: 34 } };
    const wing = { ...actor(), side: 1, index: 4, pos: { x: x(18), z: 10 } };
    const actors = [...defenders, owner, wing];
    const ball = { x: x(20), y: 0.11, z: 34 };
    const roles = defensiveAssignments(actors, 0, ball, owner, direction, { press: 'normal' }, 10);
    assert.ok(roles.cover['def-2']);
    assert.ok(!roles.marking['def-2']);
    const target = targetFor(defenders[2], actors, ball, owner, direction, {}, roles.chasers, {
      ...roles,
      defensiveCover: roles.cover,
      teamSide: 1,
    });
    assert.ok(Math.abs(target.z - 34) < 1 && Math.abs(target.x - x(10)) < 1);
  }
});

test('a retreating defender physically walks around an opposing throw-in taker at the touchline', () => {
  const physics = createPhysics();
  const a = { ...actor(), index: 4, ...createBody(physics, 180, 70, 6.917, 68.066) };
  const b = { ...actor(), index: 21, ...createBody(physics, 180, 70, 6.848, 67.51) };
  const target = { x: 5.816, z: 64.066 };
  try {
    for (let i = 0; i < 160; i++) {
      a.pos = a.body.translation();
      b.pos = b.body.translation();
      const dx = target.x - a.pos.x,
        dz = target.z - a.pos.z;
      const desired = restartAvoidance(a, [a, b], { x: dx * 2, z: dz * 2 });
      driveMovement(a, desired, movement(a.player, 100, 'jog'), 0.05);
      driveMovement(b, { x: 0, z: 0 }, movement(b.player, 100, 'stand'), 0.05);
      stepPhysics(physics, null, [a, b]);
    }
    const pos = a.body.translation();
    assert.ok(pos.z < 65, `defender stayed pinned at ${pos.z}`);
    assert.ok(Math.hypot(pos.x - 6.259, pos.z - 67.7) > 2);
  } finally {
    physics.world.free();
  }
});

test('parries dissipate energy and try to clear outside either post instead of always feeding the centre', () => {
  for (const direction of [1, -1])
    for (const flank of [-1, 1]) {
      const a = { ...actor({ handling: 70 }), direction };
      const incoming = { x: -direction * 24, y: -2, z: 1 };
      const ball = { x: direction === 1 ? 2 : 103, z: 34 + flank };
      const out = parryVelocity(a, ball, incoming, () => 0.5);
      assert.ok(out.x * direction > 0 && out.z * flank > Math.abs(out.x));
      assert.ok(Math.hypot(out.x, out.y, out.z) < Math.hypot(incoming.x, incoming.y, incoming.z));
    }
});

test('a finite hand catch constrains the ball through physics and survives a world snapshot', () => {
  const physics = createPhysics();
  const a = { ...actor(), ...createBody(physics, 180, 70, 2, 34) };
  a.hands = createHands(physics, a);
  physics.ball.setTranslation({ x: 2.6, y: 1.4, z: 34 }, true);
  orientHands(a, physics.ball.translation(), 0.8);
  a.keeperHold = { joint: secureCatch(physics, a), startedAt: 0, readyAt: 0.5 };
  assert.notEqual(a.keeperHold.joint, null);
  let restored;
  try {
    for (let i = 0; i < 30; i++) stepPhysics(physics);
    assert.ok(physics.ball.translation().y > 1.2, 'a catch is not a dropped rebound');
    a.facing = Math.PI / 2;
    for (let i = 0; i < 30; i++) {
      moveCatch(physics, a);
      stepPhysics(physics);
    }
    assert.ok(
      physics.ball.translation().z > 34.4,
      'grip follows a body turn through its physical joint',
    );
    restored = restorePhysics({
      world: physics.world.takeSnapshot(),
      ball: physics.ball.handle,
      collider: physics.collider.handle,
    });
    const saved = { keeperHold: { ...a.keeperHold } };
    releaseCatch(restored, saved);
    assert.equal(saved.keeperHold, null);
    for (let i = 0; i < 30; i++) stepPhysics(restored);
    assert.ok(restored.ball.translation().y < 0.5, 'release removes the saved joint');
  } finally {
    restored?.world.free();
    physics.world.free();
  }
});

test('pass risk includes the time opponents can close during actual preparation', () => {
  const opponent = { ...actor(), pos: { x: 2, z: 3 }, velocity: { x: 0, z: -3 } };
  const from = { x: 0, z: 0 },
    to = { x: 15, z: 0 };
  const quick = interceptionRisk(from, to, 15, [opponent], false, 1, 0);
  const slow = interceptionRisk(from, to, 15, [opponent], false, 1, 0.5);
  assert.ok(slow > quick, 'preparing does not freeze the pressing defender');
});

test('keeper pre-release reading uses visible body orientation rather than private aim', () => {
  const keeper = { ...actor({ anticipation: 70 }), pos: { x: 1, z: 34 } };
  const shooter = {
    ...actor(),
    pos: { x: 12, z: 34 },
    facing: Math.PI - 0.15,
    kickPlan: { startedAt: 0, action: { type: 'shot', kickAim: { z: 20 } } },
  };
  assert.equal(readKeeperPreparation(keeper, shooter, 1, 0.05), 0);
  const observed = readKeeperPreparation(keeper, shooter, 1, 0.5);
  assert.ok(observed > 0 && observed < 1);
  shooter.kickPlan.action.kickAim.z = 50;
  assert.equal(readKeeperPreparation(keeper, shooter, 1, 0.5), observed);
  shooter.facing = Math.PI + 0.15;
  assert.equal(
    readKeeperPreparation(keeper, shooter, 1, 0.5),
    observed,
    'a corner change does not cause a pre-release dive',
  );
});

test('shooting error changes ball flight without revealing the sampled miss through body facing', () => {
  const a = { ...actor(), pos: { x: 95, z: 34 }, facing: 0 };
  const action = { type: 'shot', x: 24, y: 3, z: 6, bodyAim: { x: 106, z: 34 } };
  a.kickPlan = prepareKick(a, action, a.pos, 0, 1, false);
  updateFacing(a, a.pos, 0.05, 0.5);
  assert.equal(a.facing, 0, 'body shows intended direction, not the eventual shank');
  assert.equal(kickReady(a, 1), true);
  assert.equal(releasedKick(a.kickPlan, a.pos).z, 6, 'execution still includes the error');
});
const shot = { type: 'shot', x: 28, y: 3, z: 0, quality: { value: 70 } };

test('keeper anticipation delays observation rather than biasing every shot short of its crossing', () => {
  const quick = actor({ anticipation: 95 }),
    slow = actor({ anticipation: 20 });
  const ball = { x: 15, z: 34, vx: -25, vz: 4 };
  assert.equal(keeperCrossing(quick, ball, 1, 0), 36.24);
  assert.equal(keeperCrossing(slow, ball, 1, 0), 36.24);
  const changed = { ...ball, vz: -4 };
  assert.ok(Math.abs(keeperCrossing(quick, changed, 1, 0.15) - 31.76) < 1e-10);
  assert.equal(
    keeperCrossing(slow, changed, 1, 0.15),
    36.24,
    'lower anticipation keeps the older observation briefly',
  );
});

test('a prepared side-on player can pass first-time, while a back-facing shot still needs a turn', () => {
  const a = actor({ firstTouch: 45 });
  a.facing = Math.PI / 2;
  a.lastReceptionPreparation = 1;
  a.kickPlan = prepareKick(
    a,
    { type: 'pass', x: 14, y: 0.08, z: 0, quality: { value: 45 } },
    a.pos,
    10,
    1,
    false,
    true,
  );
  assert.equal(
    kickReady(a, 10),
    true,
    'opening the body does not require facing exactly down the passing line',
  );
  a.facing = Math.PI;
  a.kickPlan = prepareKick(a, shot, a.pos, 10, 2, false, true);
  assert.equal(kickReady(a, 10), false);
});

test('the value of continuing an attack includes room and safe outlets rather than only forward metres', () => {
  const a = actor(),
    mate = actor(),
    marker = actor();
  a.pos = { x: 60, z: 34 };
  mate.player.id = 'outlet';
  mate.pos = { x: 55, z: 44 };
  marker.side = 1;
  marker.pos = { x: 60.5, z: 34 };
  const crowded = continuationValue(a.pos, a, [a, marker], 1);
  const supported = continuationValue(a.pos, a, [a, mate, marker], 1);
  const clear = continuationValue(a.pos, a, [a, mate], 1);
  assert.ok(supported > crowded);
  assert.ok(clear > supported);
  assert.ok(
    lossValue({ x: 15, z: 34 }, 1) > lossValue({ x: 85, z: 34 }, 1),
    'losing the ball near the own goal is more dangerous',
  );
});

test('a presser follows observed carrier speed, and distant man marking preserves the defensive line', () => {
  const a = actor(),
    carrier = actor();
  a.player.role = 'DEF';
  a.anchor = { x: 27, z: 26 };
  a.pos = { x: 39, z: 30 };
  carrier.player.id = 'carrier';
  carrier.side = 1;
  carrier.pos = { x: 70, z: 34 };
  carrier.velocity = { x: -6.5, z: 0 };
  const ball = { x: 69.4, z: 34, vx: -6.5, vz: 0 };
  const roles = { time: 10, chasers: [a.index], teamSide: 1, marking: {} };
  targetFor(a, [a, carrier], ball, carrier, 1, { press: 'normal' }, roles.chasers, roles);
  assert.equal(markingVelocity(a, carrier, roles).x, -6.5);
  assert.equal(
    movementMode(a, ball, carrier, roles, 0.8),
    'sprint',
    'a close moving target must not force walking or jogging behind the runner',
  );
  roles.chasers = [];
  roles.marking[a.player.id] = carrier.player.id;
  const target = targetFor(a, [a, carrier], ball, carrier, 1, { press: 'normal' }, [], roles);
  assert.ok(target.x < 45, 'a defender is not dragged to a midfielder 30 metres ahead of the line');
});

test('motor touches reuse an observed plan and rescan when a defender closes, rather than rerolling each contact', () => {
  const a = actor(),
    ball = { x: 78.4, z: 34 },
    opponent = { ...actor(), pos: { x: 81.4, z: 34 } };
  const action = { type: 'dribble', destination: { x: 85, z: 34 } };
  a.intent = { kind: 'carry', destination: action.destination, expiresAt: 13 };
  rememberOnBallAction(a, action, ball, [opponent], 10);
  assert.equal(needsOnBallScan(a, ball, [opponent], 10.2), false);
  assert.equal(a.onBallPlan.action, action);
  opponent.pos.x = 79.6;
  assert.equal(needsOnBallScan(a, ball, [opponent], 10.2), true);
  assert.equal(needsOnBallScan(a, ball, [], 11), true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(a.onBallPlan)),
    a.onBallPlan,
    'checkpoint memory is plain data',
  );
});

test('ball following brakes a body running ahead, and a direction change preserves physical momentum', () => {
  const a = actor();
  a.pos = { x: 50, z: 34 };
  a.velocity = { x: 6, z: 0 };
  a.intent = { kind: 'carry', mode: 'carryFast', destination: { x: 40, z: 34 } };
  const touch = motorTouch(a, { x: 49.6, z: 34 });
  assert.ok(
    touch.x > 0 && touch.x < 6,
    'the ball is slowed before a running player can reverse it',
  );
  a.intent.destination.x = 60;
  assert.ok(controlMovement(a, { x: 49.4, z: 34, vx: 4, vz: 0 }).x < a.velocity.x);
  assert.ok(controlMovement(a, { x: 51.5, z: 34, vx: 7, vz: 0 }).x > a.velocity.x);
});

test('a fast unexpected pass needs attribute-dependent reaction; a slow loose ball is playable immediately', () => {
  const quick = actor({ anticipation: 95 }),
    slow = actor({ anticipation: 20 });
  assert.equal(canReactToPass(quick, 10, 10.05, 14), false);
  assert.equal(canReactToPass(quick, 10, 10.12, 14), true);
  assert.equal(canReactToPass(slow, 10, 10.12, 14), false);
  assert.equal(canReactToPass(slow, 10, 10.01, 2), true);
});

test('ground interception timing inverts the same resistance trajectory used by passes', () => {
  for (const length of [5, 15, 35]) {
    const plan = groundPassPlan(length, 65);
    assert.ok(Math.abs(groundArrivalTime(plan.speed, length) - plan.flight) < 1e-8);
    const time = plan.flight * 0.6;
    assert.ok(
      Math.abs(groundArrivalTime(plan.speed, groundTravel(plan.speed, time)) - time) < 1e-8,
    );
  }
  assert.equal(
    groundArrivalTime(1, 50),
    Infinity,
    'an exhausted rolling ball does not reach an imaginary interception point',
  );
});

test('preparing to kick a rolling ball keeps a running support stride and real foot contact', () => {
  const physics = createPhysics();
  const a = { ...actor(), ...createBody(physics, 180, 70, 50, 34) };
  try {
    a.pos = a.body.translation();
    a.velocity = { x: 6, z: 0 };
    a.body.setLinvel({ x: 6, y: 0, z: 0 }, true);
    physics.ball.setTranslation({ x: 50.65, y: 0.12, z: 34 }, true);
    physics.ball.setLinvel({ x: 6, y: 0, z: 0 }, true);
    a.kickPlan = prepareKick(
      a,
      { type: 'pass', x: 14, y: 0.08, z: 0, quality: { value: 70 } },
      { x: 50.65, z: 34 },
      0,
      1,
      false,
    );
    for (let tick = 0; tick < 10; tick++) {
      a.pos = a.body.translation();
      a.velocity = a.body.linvel();
      const p = physics.ball.translation(),
        v = physics.ball.linvel();
      const ball = { ...p, vx: v.x, vz: v.z };
      updateFacing(a, ball, 0.05, tick * 0.05);
      orientFoot(a, ball);
      const mode = movementMode(a, ball, a, { chasers: [] }, 0.6);
      driveMovement(a, controlMovement(a, ball), movement(a.player, a.energy, mode), 0.05);
      stepPhysics(physics);
    }
    orientFoot(a, physics.ball.translation());
    assert.ok(a.body.translation().x > 52.5, 'the body follows the rolling ball during wind-up');
    assert.equal(kickReady(a, 0.5), true);
    assert.equal(
      kick(physics, a, a.kickPlan.action),
      true,
      'readiness still requires actual foot contact',
    );
  } finally {
    physics.world.free();
  }
});

test('a committed pass tracks its receiver during wind-up without replacing the sampled accuracy error', () => {
  const a = actor(),
    receiver = actor();
  receiver.player.id = 'moving-receiver';
  receiver.pos = { x: 70, z: 45 };
  receiver.velocity = { x: 0, z: 2 };
  const action = {
    type: 'pass',
    receiverId: receiver.player.id,
    receiverAtDecision: { x: 69, z: 43 },
    receiverVelocity: { x: 0, z: 2 },
    leadTime: 0.5,
    kickAim: { x: 69.2, z: 44 },
    x: 0,
    z: 12,
    y: 0.08,
    quality: { value: 70 },
  };
  const launch = releasedKick(prepareKick(a, action, a.pos, 0, 1, false), a.pos, [receiver]);
  assert.ok(Math.abs(launch.destination.x - 70.2) < 1e-10);
  assert.equal(launch.destination.z, 46);
  assert.deepEqual(action.kickAim, { x: 69.2, z: 44 }, 'the recorded plan remains unchanged');
});

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
    for (let t = 0.05; t <= 0.8; t += 0.05) {
      updateFacing(a, ball, 0.05);
      orientFoot(a, ball);
    }
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

test('finite foot can retract to a close ball without teleporting its angle or reaching a distant ball', () => {
  const physics = createPhysics();
  const a = { ...actor(), facing: 0, ...createBody(physics, 180, 70, 50, 34) };
  try {
    physics.ball.setTranslation({ x: 50.3, y: 0.12, z: 34 }, true);
    for (let i = 0; i < 4; i++) orientFoot(a, physics.ball.translation());
    assert.ok(touchesBall(physics, a.foot), 'leg retracts to handle a ball near the body');
    const angle = a.footAngle;
    orientFoot(a, { x: 50, y: 0.12, z: 35 });
    assert.ok(a.footAngle > angle && a.footAngle < Math.PI / 2, 'one step cannot swing 90 degrees');
    physics.ball.setTranslation({ x: 51.5, y: 0.12, z: 34 }, true);
    for (let i = 0; i < 20; i++) orientFoot(a, physics.ball.translation());
    assert.ok(!touchesBall(physics, a.foot), 'finite extension cannot claim a distant ball');
  } finally {
    physics.world.free();
  }
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
