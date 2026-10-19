import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activityState,
  recordMovement,
  sprintAvailable,
} from '../../packages/shared/modules/matches/activity.mjs';
import { movementMode } from '../../packages/shared/modules/matches/locomotion.mjs';
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
  tackleWindow,
  tackleProbability,
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

test('sprint load requires recovery without erasing acceleration or penalising fresh open carries', () => {
  const a = actor(0),
    ball = { x: 51, z: 34 },
    roles = { chasers: [], runnerId: a.player.id };
  assert.equal(movementMode(a, ball, null, roles, 10), 'sprint');
  for (let i = 0; i < 200; i++)
    recordMovement(a, { x: 0, z: 0 }, { x: 0.4, z: 0 }, 0.05, true, false);
  assert.equal(sprintAvailable(a), false);
  assert.equal(movementMode(a, ball, null, roles, 10), 'jog');
  for (let i = 0; i < 500; i++)
    recordMovement(a, { x: 0, z: 0 }, { x: 0.05, z: 0 }, 0.05, true, false);
  assert.equal(sprintAvailable(a), true);
  assert.equal(movementMode(a, ball, null, { chasers: [] }, 0.4), 'stand');
});

test('brief loss preserves team organisation and contest responsibility but not remote possession or a released pass', () => {
  const s = continuityState(),
    a = actor(0),
    d = actor(1, 1, 53);
  controlBall(s, a, 0, null);
  const ball = { x: 52.5, z: 34, y: 0.11, vx: 8, vz: 0 };
  a.intent = { kind: 'carry', mode: 'carryFast', expiresAt: 2 };
  updateContinuity(s, [a, d], { ...ball, x: 55 }, 0.1, true, null);
  assert.equal(s.controller, null);
  assert.equal(s.side, 0);
  assert.equal(contestOwner(s, [a, d], ball, 0.2), a);
  releaseControl(s, 0.2, 'pass');
  assert.equal(contestOwner(s, [a, d], ball, 0.3), null);
  controlBall(s, d, 1, null, true);
  assert.equal(s.metrics.possessions[0].side, 0);
  assert.equal(s.metrics.possessions[0].seconds, 1);
  deadBall(s, 2, 'throwIn');
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
  assert.equal(emergency.chasers[0], close.index);
  assert.equal(
    emergency.chasers[1],
    cover.index,
    'second defender protects the forward lane instead of joining a chase from behind',
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
  const roles = { chasers: [2, defender.index], time: 10 };
  defender.direction = 1;
  defender.side = 0;
  defender.pos = { x: 18, z: 34 };
  carrier.side = 1;
  carrier.pos = { x: 20, z: 34 };
  const target = targetFor(
    defender,
    [defender, carrier],
    { x: 19.5, z: 34 },
    carrier,
    1,
    {},
    roles.chasers,
    roles,
  );
  assert.ok(
    Math.hypot(target.x - carrier.pos.x, target.z - carrier.pos.z) < 1,
    'cover steps in at shot range instead of retreating forever',
  );
});
