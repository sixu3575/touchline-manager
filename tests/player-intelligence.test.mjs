import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, simulate } from '../packages/shared/game.mjs';
import { random } from '../packages/shared/core/index.mjs';
import {
  chooseAction,
  playerProfile,
  movement,
  targetFor,
  teamRoles,
  distance,
} from '../packages/shared/modules/matches/agents.mjs';
import {
  createPhysics,
  createBody,
  orientFoot,
  kick,
  stepPhysics,
  touchesBall,
} from '../packages/shared/modules/matches/physics.mjs';

function actor(id, side, x, z, changes = {}, role = 'MID') {
  const p = structuredClone(createGame().clubs[0].players.find((p) => p.role === role));
  p.id = id;
  Object.assign(p.attributes, changes);
  p.fitness = 100;
  return {
    player: p,
    side,
    index: side ? 11 : 0,
    isKeeper: role === 'GK',
    anchor: { x: 50, z },
    pos: { x, z },
    velocity: { x: 0, z: 0 },
    target: { x, z },
    energy: 100,
    bias: 0,
    hold: 1,
    intent: null,
  };
}

test('ground passes keep useful speed in either direction without colliding with the kicker trunk', () => {
  for (const direction of [-1, 1]) {
    const p = createPhysics(),
      a = createBody(p, 180, 65, 50, 34);
    try {
      p.ball.setTranslation({ x: 50.65, y: 0.12, z: 34 }, true);
      orientFoot(a, p.ball.translation());
      stepPhysics(p);
      assert.equal(kick(p, a, { x: direction * 18, y: 0.08, z: 0 }), true);
      for (let i = 0; i < 10; i++) stepPhysics(p);
      assert.ok((p.ball.translation().x - 50.65) * direction > 6);
      assert.ok(
        p.ball.linvel().x * direction > 12,
        'passes must not be reduced to walking speed by the kicker',
      );
      assert.equal(kick(p, a, { x: 18, y: 0, z: 0 }), false, 'no control at a distance');
    } finally {
      p.world.free();
    }
  }
});

test('a freshly reoriented finite foot uses current geometry, without waiting for stale sensor pairs', () => {
  const p = createPhysics(),
    a = createBody(p, 180, 65, 50, 34);
  try {
    stepPhysics(p);
    p.ball.setTranslation({ x: 49.35, y: 0.12, z: 34 }, true);
    orientFoot(a, p.ball.translation());
    assert.equal(touchesBall(p, a.foot), true);
    p.ball.setTranslation({ x: 48, y: 0.12, z: 34 }, true);
    assert.equal(touchesBall(p, a.foot), false);
  } finally {
    p.world.free();
  }
});

test('jogging, pressing, sprinting and controlled carrying use distinct physical speeds', () => {
  const p = actor('p', 0, 50, 34).player;
  const speeds = ['walk', 'jog', 'run', 'sprint'].map((mode) => movement(p, 100, mode).speed);
  assert.ok(speeds.every((v, i) => i === 0 || v > speeds[i - 1]));
  assert.ok(movement(p, 100, 'carry').speed < movement(p, 100, 'sprint').speed);
  assert.ok(movement(p, 30, 'sprint').speed < movement(p, 100, 'sprint').speed);
});

test('an organiser passes and a dribbler carries in the same open situation across common seeds', () => {
  const organiser = actor('p', 0, 50, 34, {
    passing: 94,
    vision: 94,
    decisions: 92,
    dribbling: 35,
    agility: 45,
    firstTouch: 70,
  });
  const dribbler = actor('p', 0, 50, 34, {
    passing: 35,
    vision: 45,
    decisions: 92,
    dribbling: 94,
    agility: 94,
    firstTouch: 94,
  });
  const mate = actor('m', 0, 61, 42),
    def = actor('d', 1, 78, 25),
    keeper = actor('g', 1, 102, 34, {}, 'GK');
  let passes = 0,
    carries = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const a = structuredClone(organiser),
      b = structuredClone(dribbler);
    const first = chooseAction(
      a,
      [a, mate, def, keeper],
      { x: 50.6, y: 0.11, z: 34 },
      1,
      { style: 'balanced' },
      random(seed),
      { time: 10 },
    );
    const second = chooseAction(
      b,
      [b, mate, def, keeper],
      { x: 50.6, y: 0.11, z: 34 },
      1,
      { style: 'balanced' },
      random(seed),
      { time: 10 },
    );
    passes += first.type === 'pass';
    carries += second.type === 'dribble';
    assert.ok(first.reason && second.reason);
  }
  assert.ok(passes >= 27, `organiser passed only ${passes}/30`);
  assert.ok(carries >= 27, `dribbler carried only ${carries}/30`);
  assert.notEqual(playerProfile(organiser.player).label, playerProfile(dribbler.player).label);
});

test('a blocked passing corridor is rejected and a forward with a clear chance chooses a shot', () => {
  const p = actor('p', 0, 50, 34, { passing: 90, vision: 90, decisions: 95 }),
    mate = actor('m', 0, 70, 34),
    blocker = actor('d', 1, 60, 34);
  for (let seed = 1; seed <= 20; seed++) {
    const a = structuredClone(p);
    const action = chooseAction(
      a,
      [a, mate, blocker],
      { x: 50.6, y: 0.11, z: 34 },
      1,
      { style: 'possession' },
      random(seed),
      { time: 1 },
    );
    assert.notEqual(action.receiverId, 'm');
  }
  const striker = actor('s', 0, 93, 34, { finishing: 95, decisions: 95, composure: 90 }, 'FWD');
  const keeper = actor('g', 1, 104, 34, {}, 'GK'),
    support = actor('m', 0, 82, 44);
  const shot = chooseAction(
    striker,
    [striker, keeper, support],
    { x: 93.6, y: 0.11, z: 34 },
    1,
    { style: 'balanced' },
    random(7),
    { time: 2 },
  );
  assert.equal(shot.type, 'shot');
  assert.ok(shot.x > 20);
});

test('supporters form triangles, a loose ball is recovered, and a keeper approaches a slow ball', () => {
  const owner = actor('p', 0, 50, 34),
    support = actor('m', 0, 52, 35),
    opponent = actor('d', 1, 60, 36);
  const ball = { x: 50.6, y: 0.11, z: 34, vx: 0, vz: 0 },
    actors = [owner, support, opponent];
  const roles = teamRoles(actors, ball, owner, null, (side) => (side ? -1 : 1), [
    { press: 'normal' },
    { press: 'normal' },
  ]);
  assert.equal(roles.chasers.includes(support.index), false);
  const target = targetFor(support, actors, ball, owner, 1, { style: 'possession' }, [], {});
  assert.ok(
    distance(target, owner.pos) > 7,
    'support should leave a passing angle instead of clustering',
  );
  owner.pos = { x: 47, z: 32 };
  owner.intent = { kind: 'carry', destination: { x: 47, z: 32 }, expiresAt: 0 };
  const loose = { x: 47, y: 0.11, z: 34, vx: 0, vz: 0 };
  assert.ok(
    distance(targetFor(owner, actors, loose, owner, 1, {}, [], {}), loose) < 0.7,
    'recover the ball rather than waiting at stale intent',
  );
  const keeper = actor('g', 0, 2, 34, {}, 'GK');
  const claim = targetFor(keeper, [keeper], { x: 8, y: 0.11, z: 34, vx: 0, vz: 0 }, null, 1, {}, [
    keeper.index,
  ]);
  assert.ok(claim.x > 7, 'keeper must approach reachable loose balls');
});

test('a physical segment has fast passes, mostly submaximal running, and meaningful player behaviour statistics', () => {
  const g = createGame('节奏验证', 42),
    r = simulate(g.clubs[0], g.clubs[1], 2026, 'tempo', { durationSeconds: 180 });
  assert.ok(r.motion.passSpeedMean > 13 && r.motion.passSpeedMean > r.motion.playerSpeedMean * 4);
  assert.ok(r.motion.playerSpeedMean < 4);
  assert.ok(r.motion.sprintShare < 0.25, 'an entire team must not sprint constantly');
  assert.ok(r.performance.every((p) => p.maxSpeed < 11 && p.carryDistance >= 0));
  assert.ok(r.performance.some((p) => p.dribbleTouches > 0));
  assert.ok(r.performance.some((p) => p.throughBalls + p.longPasses > 0));
  assert.ok(new Set(r.performance.map((p) => p.style)).size >= 4);
  assert.ok(r.events.some((e) => e.decision));
});
