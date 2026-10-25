import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activityState,
  burstReserve,
  recordMovement,
  sprintAvailable,
  triggerAdrenalineSprint,
  restAtHalfTime,
} from '../../packages/shared/modules/matches/activity.mjs';
import { movementMode, movement } from '../../packages/shared/modules/matches/locomotion.mjs';
import {
  createMatchState,
  physicalProfile,
  energyCost,
  updateMatchEnergy,
  effectiveAbility,
} from '../../packages/shared/modules/players/index.mjs';
import {
  continuityState,
  controlBall,
  updateContinuity,
  contestOwner,
  releaseControl,
  deadBall,
} from '../../packages/shared/modules/matches/continuity.mjs';
import {
  defensiveAssignments,
  duelProbability,
  tackleWindow,
  tackleProbability,
  tackleRelease,
} from '../../packages/shared/modules/matches/defending.mjs';
import { targetFor } from '../../packages/shared/modules/matches/positioning.mjs';
import { deadballTarget, restartReady } from '../../packages/shared/modules/matches/deadball.mjs';

test('restart exclusion targets remain reachable at pitch edges and allow the legal goal-line keeper', () => {
  for (const direction of [1, -1]) {
    const dirs = (side) => (side === 0 ? direction : -direction);
    const taker = actor(0),
      keeper = actor(1, 1);
    keeper.isKeeper = true;
    keeper.anchor = { x: 5, z: 34 };
    const state = {
      type: 'indirect',
      side: 0,
      taker: 0,
      ball: { x: direction === 1 ? 99.5 : 5.5, z: 34.4 },
    };
    taker.pos = { ...state.ball };
    keeper.pos = deadballTarget(keeper, [taker, keeper], state, dirs, 10);
    assert.ok(Math.abs(keeper.pos.z - 34) < 3.66);
    assert.ok(restartReady(state, [taker, keeper], dirs));
    keeper.pos.x = direction === 1 ? 104 : 1;
    assert.equal(
      restartReady(state, [taker, keeper], dirs),
      false,
      'only the goal line grants the exception',
    );
    keeper.isKeeper = false;
    for (const x of [0.2, 5.5, 99.5, 104.8])
      for (const z of [0.2, 34.4, 67.8]) {
        const corner = { ...state, type: 'corner', ball: { x, z } };
        const target = deadballTarget(keeper, [taker, keeper], corner, dirs, 10);
        assert.ok(target.x >= 1 && target.x <= 104 && target.z >= 1 && target.z <= 67);
        assert.ok(
          Math.hypot(target.x - x, target.z - z) >= 9.15,
          'pitch clipping cannot defeat restart readiness',
        );
      }
  }
});

test('a retreat target just outside the legal circle includes movement parking tolerance', () => {
  const defender = actor(0);
  defender.anchor = { x: 45, z: 28 };
  const state = {
    type: 'freeKick',
    side: 1,
    taker: 21,
    ball: { x: 40.48279571533203, z: 36.29047393798828 },
  };
  const target = deadballTarget(defender, [defender], state, (side) => (side ? -1 : 1), 500);
  assert.ok(
    Math.hypot(target.x - state.ball.x, target.z - state.ball.z) - 0.2 > 9.15,
    'parking 20cm short cannot make a legal restart wait forever',
  );
});

function actor(id, side = 0, x = 50, role = 'MID', positionRole = 'centralMid') {
  return {
    index: id,
    side,
    player: {
      id: String(id),
      role,
      attributes: {
        stamina: 70,
        sprintSpeed: 65,
        acceleration: 65,
        agility: 65,
        balance: 65,
        tackling: 65,
        strength: 65,
        dribbling: 65,
        marking: 65,
        positioning: 65,
      },
    },
    pos: { x, z: 34 },
    velocity: { x: 0, z: 0 },
    direction: side ? -1 : 1,
    activity: activityState(),
    distance: 0,
    carryDistance: 0,
    positionRole,
    energy: 100,
  };
}
test('odometer has an independent physical baseline, speed zones partition time and restarts do not invent metres', () => {
  const a = actor(0);
  for (let i = 0; i < 200; i++) {
    const before = { x: i * 0.35, z: 34 },
      after = { x: (i + 1) * 0.35, z: 34 };
    a.pos = { x: 999, z: 999 }; // A contact callback may refresh/cache this anywhere.
    recordMovement(a, before, after, 0.05, true, true);
  }
  assert.ok(Math.abs(a.distance - 70) < 1e-8);
  assert.equal(a.distance, a.carryDistance);
  assert.ok(Math.abs(a.activity.zones[4] - 70) < 1e-8);
  assert.ok(Math.abs(a.activity.seconds.reduce((a, b) => a + b) - 10) < 1e-8);
  const before = a.distance;
  a.pos = { x: 5, z: 5 }; // Placement occurs outside physical sampling intervals.
  recordMovement(a, a.pos, a.pos, 0.05, false, false);
  assert.equal(a.distance, before);
});

test('sprint reserve is only spent for urgent runs and recovery preserves ordinary jogging', () => {
  const a = actor(0, 0, 50, 'FWD', 'striker'),
    ball = { x: 51, z: 34 },
    roles = { chasers: [], runnerId: a.player.id };
  assert.equal(movementMode(a, ball, null, roles, 10), 'jog');
  for (let i = 0; i < 200; i++)
    recordMovement(a, { x: 0, z: 0 }, { x: 0.4, z: 0 }, 0.05, true, false);
  assert.equal(sprintAvailable(a), false);
  assert.equal(burstReserve(a), 0);
  assert.equal(movementMode(a, ball, null, roles, 10), 'jog');
  for (let i = 0; i < 500; i++)
    recordMovement(a, { x: 0, z: 0 }, { x: 0.05, z: 0 }, 0.05, true, false);
  assert.equal(sprintAvailable(a), true);
  assert.equal(movementMode(a, ball, null, { chasers: [] }, 0.4), 'stand');
});

test('a high-momentum successful challenge pokes a loose ball; a balanced slow challenge can trap it', () => {
  const defender = actor(0, 0, 51.1),
    carrier = actor(1, 1, 50);
  defender.direction = 1;
  const ball = { x: 50.6, z: 34, y: 0.11, vx: 0, vz: 0 };
  assert.equal(tackleRelease(defender, carrier, ball, [defender, carrier], 60), null);
  defender.velocity = { x: -6, z: 0 };
  carrier.velocity = { x: 4, z: 0 };
  const poke = tackleRelease(defender, carrier, ball, [defender, carrier], 60);
  assert.ok(poke && Math.abs(poke.z) > Math.abs(poke.x));
  assert.ok(Math.hypot(poke.x, poke.z) > 2 && Math.hypot(poke.x, poke.z) < 12);
  const state = continuityState();
  controlBall(state, carrier, 0, false);
  releaseControl(state, 1, 'tackle');
  assert.equal(state.controller, null, 'winning a poke does not grant remote stable possession');
  assert.equal(state.phase, 'loose');
  assert.equal(state.side, carrier.side, 'team organisation awaits actual new control');
});

test('repeated physically finite starts consume reserve even below the high-speed threshold', () => {
  const steady = actor(0),
    intermittent = actor(1);
  let x = 0;
  for (let cycle = 0; cycle < 5; cycle++) {
    for (let tick = 0; tick < 52; tick++) {
      const t = tick * 0.05;
      const speed = t < 1.6 ? t * 2.5 : Math.max(0, 4 - (t - 1.6) * 4);
      recordMovement(intermittent, { x, z: 0 }, { x: x + speed * 0.05, z: 0 }, 0.05, true, false);
      recordMovement(steady, { x: 0, z: 0 }, { x: 0.15, z: 0 }, 0.05, true, false);
      x += speed * 0.05;
    }
  }
  assert.ok(intermittent.activity.load > steady.activity.load + 0.05);
  assert.ok(burstReserve(intermittent) < burstReserve(steady));
});

test('adrenaline grants a brief critical sprint and cannot immediately bypass its recovery debt', () => {
  const a = actor(0, 0, 79);
  a.activity.load = 1;
  a.activity.recovery = 30;
  assert.equal(burstReserve(a), 0);
  const ball = { x: 80, z: 34 };
  const urgentRoles = { chasers: [a.index] };
  assert.equal(movementMode(a, ball, null, urgentRoles, 5), 'sprint');
  assert.equal(a.activity.adrenalineEfforts, 1);
  assert.ok(a.activity.adrenalineRemaining > 1.3);
  assert.equal(
    burstReserve(a),
    0,
    'the emergency effort does not refill the normal sprint reserve',
  );

  const duration = a.activity.adrenalineRemaining;
  for (let i = 0; i < Math.ceil(duration / 0.05) + 1; i++)
    recordMovement(a, { x: 79, z: 34 }, { x: 79, z: 34 }, 0.05, true, false);
  assert.equal(sprintAvailable(a), false);
  assert.equal(a.activity.adrenalineRemaining, 0);
  assert.equal(movementMode(a, ball, null, urgentRoles, 5), 'run');
  assert.equal(
    a.activity.adrenalineEfforts,
    1,
    'excess exertion must recover before another emergency burst',
  );
});

test('strength and stamina buy capacity and recovery, never a higher personal fresh speed or free energy', () => {
  const low = actor(0),
    high = actor(1);
  for (const a of [low, high]) {
    a.player.fitness = 100;
    a.player.attributes.stamina = 20;
    a.player.attributes.strength = 20;
  }
  high.player.attributes.stamina = 90;
  high.player.attributes.strength = 90;
  for (const a of [low, high]) a.player.matchState = createMatchState(a.player);
  assert.ok(physicalProfile(high.player).capacity > physicalProfile(low.player).capacity * 1.5);
  assert.ok(energyCost(low.player, 7, 'normal', true, 1) > energyCost(high.player, 7, 'normal', true, 1) * 2);
  assert.equal(
    movement(low.player, 100, 'sprint').speed,
    movement(high.player, 100, 'sprint').speed,
  );
  for (let i = 0; i < 80; i++)
    for (const a of [low, high]) {
      a.energy = updateMatchEnergy(a.player, a.energy, 7, 'normal', true, 0.05);
      a.player.matchState.energy = a.energy;
      recordMovement(a, { x: 0, z: 0 }, { x: 0.35, z: 0 }, 0.05, true, false);
    }
  assert.ok(high.energy > low.energy);
  assert.ok(high.activity.load < low.activity.load);
  for (const a of [low, high]) {
    a.energy = 60;
    a.player.matchState.energy = 60;
    a.activity.load = 1;
    a.activity.recovery = 20;
  }
  const oldEnergy = high.energy;
  assert.ok(triggerAdrenalineSprint(low, true));
  assert.ok(triggerAdrenalineSprint(high, true));
  assert.ok(high.activity.adrenalineRemaining > low.activity.adrenalineRemaining);
  assert.equal(high.energy, oldEnergy, 'adrenaline does not refill the tank');
  const before = { distance: high.distance, efforts: high.activity.sprintEfforts };
  restAtHalfTime(high);
  assert.ok(high.energy > oldEnergy && high.energy < 70, 'half time gives a small recovery');
  assert.equal(high.activity.load, 0);
  assert.equal(high.activity.emergencyDebt, 0);
  assert.equal(high.activity.sprintEfforts, before.efforts);
  assert.equal(high.distance, before.distance, 'resting does not invent running');
  high.energy = 0;
  high.player.matchState.energy = 0;
  assert.equal(sprintAvailable(high), false);
  assert.equal(triggerAdrenalineSprint(high, true), false);
  assert.ok(movement(high.player, 0, 'run').speed <= 2);
});

test('rest cannot heal pre-match condition and fatigue has bounded distinct physical, technical and gait effects', () => {
  const a = actor(0);
  a.player.fitness = 60;
  a.player.attributes.sprintSpeed = 80;
  a.player.attributes.passing = 80;
  a.player.matchState = createMatchState(a.player);
  for (let i = 0; i < 1000; i++)
    a.energy = updateMatchEnergy(a.player, a.energy, 0, 'normal', false, 1);
  assert.equal(a.energy, 60);
  const speeds = [];
  for (const energy of [0, 25, 50, 100]) {
    a.player.matchState.energy = energy;
    speeds.push(movement(a.player, energy, 'run').speed);
    const physical = effectiveAbility(a.player, 'sprintSpeed'),
      technical = effectiveAbility(a.player, 'passing');
    assert.ok(Math.abs(physical - 80 * (0.7 + 0.3 * Math.sqrt(energy / 100))) < 1e-10);
    assert.ok(Math.abs(technical - 80 * (0.88 + (0.12 * energy) / 100)) < 1e-10);
  }
  assert.ok(speeds.every((n, i) => i === 0 || n > speeds[i - 1]));
  const profile = physicalProfile(a.player);
  a.player.matchState.energy = 0;
  assert.deepEqual(
    physicalProfile(a.player),
    profile,
    'fatigue does not recursively shrink capacity',
  );
});

test('emergency exertion can recur after physical recovery without a per-match quota', () => {
  const a = actor(0, 0, 79);
  a.activity.load = 1;
  a.activity.recovery = 30;
  a.activity.adrenalineEfforts = 1;
  a.activity.emergencyDebt = 1;
  assert.equal(movementMode(a, { x: 80, z: 34 }, null, { chasers: [a.index] }, 5), 'run');
  assert.equal(a.activity.adrenalineEfforts, 1);
  for (let i = 0; i < 8000; i++)
    recordMovement(a, { x: 79, z: 34 }, { x: 79, z: 34 }, 0.05, true, false);
  a.activity.load = 1;
  a.activity.recovery = 30;
  assert.equal(movementMode(a, { x: 80, z: 34 }, null, { chasers: [a.index] }, 5), 'sprint');
  assert.equal(a.activity.adrenalineEfforts, 2);
});

test('adrenaline is reserved for final-third runs and last-ditch defensive cover', () => {
  const runner = actor(0, 0, 80),
    deepBall = { x: 82, z: 34 };
  runner.activity.load = 1;
  runner.activity.recovery = 20;
  assert.equal(
    movementMode(runner, deepBall, null, { chasers: [], runnerId: runner.player.id }, 10),
    'sprint',
  );
  assert.equal(runner.activity.adrenalineEfforts, 1);

  const ordinaryRunner = actor(1, 0, 50);
  ordinaryRunner.activity.load = 1;
  ordinaryRunner.activity.recovery = 20;
  assert.equal(
    movementMode(
      ordinaryRunner,
      { x: 52, z: 34 },
      null,
      { chasers: [], runnerId: ordinaryRunner.player.id },
      10,
    ),
    'jog',
  );
  assert.equal(ordinaryRunner.activity.adrenalineEfforts, 0);
  const ordinaryChaser = actor(3, 0, 50);
  ordinaryChaser.activity.load = 1;
  ordinaryChaser.activity.recovery = 20;
  assert.equal(
    movementMode(ordinaryChaser, { x: 51, z: 34 }, null, { chasers: [ordinaryChaser.index] }, 5),
    'run',
  );
  assert.equal(ordinaryChaser.activity.adrenalineEfforts, 0);

  const cover = actor(2, 0, 8);
  cover.activity.load = 1;
  cover.activity.recovery = 20;
  cover.markMemory = { velocity: { x: 6, z: 0 } };
  assert.equal(
    movementMode(
      cover,
      { x: 8, z: 34 },
      null,
      { chasers: [], marking: { [cover.player.id]: 'opponent' } },
      5,
    ),
    'sprint',
  );
  assert.equal(cover.activity.adrenalineEfforts, 1);

  const awayCover = actor(4, 1, 100);
  awayCover.activity.load = 1;
  awayCover.activity.recovery = 20;
  awayCover.markMemory = { velocity: { x: -6, z: 0 } };
  assert.equal(
    movementMode(
      awayCover,
      { x: 100, z: 34 },
      null,
      { chasers: [], marking: { [awayCover.player.id]: 'opponent' } },
      5,
    ),
    'sprint',
  );
  assert.equal(awayCover.activity.adrenalineEfforts, 1);
});

test('brief loss preserves team organisation and contest responsibility but not remote possession or a released pass', () => {
  const s = continuityState(),
    a = actor(0),
    d = actor(1, 1, 53);
  a.velocity.x = 1.8;
  controlBall(s, a, 0, null);
  const ball = { x: 52.13, z: 34, y: 0.11, vx: 1.8, vz: 0 };
  a.intent = { kind: 'carry', mode: 'carry', expiresAt: 0.5 };
  updateContinuity(s, [a, d], ball, 1.6, true, null);
  assert.equal(s.controller, null);
  assert.equal(s.side, 0);
  assert.equal(contestOwner(s, [a, d], ball, 1.7), a);
  d.pos = { x: 52.8, z: 34 };
  releaseControl(s, 1.8, 'pass');
  assert.equal(contestOwner(s, [a, d], ball, 1.9), null);
  controlBall(s, d, 2.5, null, true);
  assert.equal(s.metrics.possessions[0].side, 0);
  assert.equal(s.metrics.possessions[0].seconds, 2.5);
  deadBall(s, 3.5, 'throwIn');
  assert.equal(s.metrics.possessions.length, 2);
  assert.equal(s.side, null);
});

test('defensive job cost protects the last line and avoids sending a fast forward to every deep recovery', () => {
  const mid = actor(0, 0, 30),
    forward = actor(1, 0, 29, 'FWD', 'striker'),
    back = actor(2, 0, 20, 'DEF', 'centreBack');
  const owner = actor(3, 1, 33),
    ball = { x: 33, z: 34 };
  Object.assign(forward.player.attributes, { sprintSpeed: 99, acceleration: 99 });
  const roles = defensiveAssignments(
    [mid, forward, back, owner],
    0,
    ball,
    owner,
    1,
    { press: 'normal' },
    1,
  );
  assert.equal(roles.chasers[0], mid.index);
  assert.equal(roles.chasers.includes(back.index), false);
  const behind = actor(4, 0, 23),
    close = actor(5, 0, 22),
    cover = actor(6, 0, 15, 'DEF', 'centreBack');
  owner.pos.x = 20;
  const emergency = defensiveAssignments(
    [behind, close, cover, owner],
    0,
    { x: 20, z: 34 },
    owner,
    1,
    { press: 'normal' },
    2,
  );
  assert.equal(
    emergency.chasers[0],
    cover.index,
    'goal-side protection matters more than chasing from behind',
  );
  assert.equal(
    emergency.chasers.length,
    1,
    'a controlled dribble draws one challenger while the others protect and mark',
  );
});

test('a chaser can approach a ball inside the touchline instead of stopping outside finite foot range', () => {
  const a = actor(0, 0, 79),
    ball = { x: 79, z: 0.32, y: 0.11, vx: 0, vz: 0 };
  a.pos.z = 1.32;
  const roles = { chasers: [0], time: 10 };
  const target = targetFor(a, [a], ball, null, 1, {}, [0], roles);
  assert.ok(Math.abs(target.z - ball.z) < 0.1);
  assert.notEqual(movementMode(a, ball, null, roles, 0.6), 'stand');
});

test('a shielded close touch invites jockeying, while an exposed touch remains physically contestable', () => {
  const defender = actor(0, 1, 50),
    carrier = actor(1, 0, 51);
  assert.equal(tackleWindow(defender, carrier, { x: 50.8, z: 34 }), false);
  assert.equal(tackleWindow(defender, carrier, { x: 50.1, z: 34 }), true);
  const ball = { x: 50.5, z: 34 };
  assert.equal(tackleProbability(defender, carrier, ball, [defender, carrier], 65, 65), 0.5);
  const alone = tackleProbability(defender, carrier, ball, [defender, carrier], 55, 95);
  assert.ok(
    alone < 0.5 && alone > 0.15,
    'skill advantage matters without near-immunity after actual contact',
  );
  const support = actor(2, 1, 50);
  assert.ok(
    tackleProbability(defender, carrier, ball, [defender, carrier, support], 55, 95) > alone,
  );
  assert.ok(
    tackleProbability(defender, carrier, { x: 50.1, z: 34 }, [defender, carrier], 55, 95) > alone,
    'getting to the exposed ball first improves the chance',
  );
  const firstPresser = actor(2, 0, 18.5),
    roles = { chasers: [firstPresser.index, defender.index], time: 10 };
  defender.direction = 1;
  defender.side = 0;
  defender.pos = { x: 18, z: 34 };
  carrier.side = 1;
  carrier.pos = { x: 20, z: 34 };
  const target = targetFor(
    defender,
    [firstPresser, defender, carrier],
    { x: 19.5, z: 34 },
    carrier,
    1,
    {},
    roles.chasers,
    roles,
  );
  assert.ok(
    Math.hypot(target.x - carrier.pos.x, target.z - carrier.pos.z) > 2,
    'cover stays staggered while the first presser still protects the goal side',
  );
  firstPresser.pos.x = 22;
  const emergency = targetFor(
    defender,
    [firstPresser, defender, carrier],
    { x: 19.5, z: 34 },
    carrier,
    1,
    {},
    roles.chasers,
    roles,
  );
  assert.ok(
    Math.hypot(emergency.x - carrier.pos.x, emergency.z - carrier.pos.z) < 1,
    'cover steps in once the first defender has actually been beaten',
  );
});

test('an outmatched defender contains a close dribble but still challenges a genuinely exposed ball', () => {
  const defender = actor(0, 0, 51.8),
    carrier = actor(1, 1, 50);
  Object.keys(defender.player.attributes).forEach((k) => (defender.player.attributes[k] = 30));
  Object.keys(carrier.player.attributes).forEach((k) => (carrier.player.attributes[k] = 90));
  assert.equal(tackleWindow(defender, carrier, { x: 50.95, z: 34 }), false);
  assert.equal(tackleWindow(defender, carrier, { x: 51.4, z: 34 }), true);
  const roles = { chasers: [0], time: 10 };
  const target = targetFor(
    defender,
    [defender, carrier],
    { x: 50.95, z: 34 },
    carrier,
    1,
    { press: 'normal' },
    roles.chasers,
    roles,
  );
  assert.ok(Math.hypot(target.x - carrier.pos.x, target.z - carrier.pos.z) > 1.5);
});

test('a central presser closes to jockeying distance without driving into the carrier', () => {
  const defender = actor(0, 0, 48.5),
    carrier = actor(1, 1, 50);
  defender.direction = 1;
  const roles = { chasers: [defender.index], time: 10 };
  const target = targetFor(
    defender,
    [defender, carrier],
    { x: 50.2, z: 34 },
    carrier,
    1,
    { press: 'normal' },
    roles.chasers,
    roles,
  );
  assert.ok(
    Math.abs(Math.hypot(target.x - carrier.pos.x, target.z - carrier.pos.z) - 1.05) < 1e-9,
    'the first presser screens from close range instead of targeting body overlap',
  );
});

test('carry prediction and actual tackles share the same reach, skill and cover duel model', () => {
  assert.equal(duelProbability(65, 65), 0.5);
  assert.ok(duelProbability(80, 65) > duelProbability(65, 65));
  assert.ok(duelProbability(65, 65, 1) > duelProbability(65, 65));
  assert.ok(duelProbability(65, 65, 0, 2) > duelProbability(65, 65));
  assert.ok(duelProbability(50, 80, -1) < duelProbability(50, 80));
});
