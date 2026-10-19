import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, random } from '../../packages/shared/game.mjs';
import { createMatchSimulation } from '../../packages/shared/modules/matches/index.mjs';
import { restorePhysics } from '../../packages/shared/modules/matches/physics.mjs';
import { packActors, unpackActors } from '../../packages/shared/modules/matches/checkpoint.mjs';
import { movement, movementMode } from '../../packages/shared/modules/matches/locomotion.mjs';
import { targetFor, teamRoles } from '../../packages/shared/modules/matches/positioning.mjs';
import {
  receptionPlan,
  firstTouchVelocity,
} from '../../packages/shared/modules/matches/receiving.mjs';
import { carryOptions } from '../../packages/shared/modules/matches/carrying.mjs';
import { playerProfile } from '../../packages/shared/modules/matches/decisions.mjs';
import { actionQuality } from '../../packages/shared/modules/matches/skills.mjs';
import { arrivalTime } from '../../packages/shared/modules/matches/arrival.mjs';
import { markingTarget, supportTarget } from '../../packages/shared/modules/matches/offball.mjs';
import { deadballTarget, restartReady } from '../../packages/shared/modules/matches/deadball.mjs';

const game = createGame('移动专项', 42),
  dirs = (s) => (s === 0 ? 1 : -1);
function actor(id, side, x, z, attributes = {}) {
  const player = structuredClone(game.clubs[side].players.find((p) => p.role === 'MID'));
  player.id = id;
  player.role = side ? 'DEF' : 'MID';
  player.fitness = 100;
  player.preferredFoot = 'both';
  player.weakFoot = 100;
  for (const k in player.attributes) player.attributes[k] = 65;
  Object.assign(player.attributes, attributes);
  return {
    player,
    index: side ? 11 : 0,
    side,
    pos: { x, z },
    velocity: { x: 0, z: 0 },
    anchor: { x: 50, z },
    bias: 0,
    energy: 100,
  };
}

test('continuous carry has no 0.82m navigation discontinuity and stays below personal sprint speed', () => {
  for (const direction of [-1, 1]) {
    const a = actor('carrier', 0, 50, 34);
    a.intent = {
      kind: 'carry',
      mode: 'carryFast',
      destination: { x: 50 + direction * 10, z: 34 },
      expiresAt: 10,
    };
    for (const gap of [0.7, 0.9, 1.3, 1.8, 2.4, 3.5]) {
      const b = { x: 50 + direction * gap, z: 34, y: 0.11, vx: direction * 7, vz: 0 };
      const goal = targetFor(a, [a], b, a, direction, {}, [], { time: 1 });
      assert.ok((goal.x - a.pos.x) * direction > 8);
      assert.equal(movementMode(a, b, a, { chasers: [] }, 0.6), 'carryFast');
    }
    assert.ok(movement(a.player, 100, 'carryFast').speed < movement(a.player, 100, 'sprint').speed);
  }
});

test('open forward first touch retains momentum; pressure, wrong-way momentum and difficult service need preparation', () => {
  const a = actor('receiver', 0, 50, 34),
    b = { x: 50.65, z: 34 };
  a.velocity.x = 6;
  const easy = receptionPlan(a, b, 1, 65, 8, []);
  assert.ok(easy.flow && easy.delay < 0.3);
  const v = firstTouchVelocity(a, b, 1, 65, 8, random(42), [], easy);
  assert.ok(v.x > 6 && v.x < movement(a.player, 100, 'sprint').speed + 1);
  const tight = receptionPlan(a, b, 1, 65, 8, [actor('marker', 1, 52, 34)]);
  a.velocity.x = -3;
  const back = receptionPlan(a, b, 1, 65, 8, []),
    hard = receptionPlan(a, b, 1, 35, 30, []);
  assert.ok(!tight.flow && tight.delay > easy.delay);
  assert.ok(!back.flow && back.delay > easy.delay && !hard.flow);
});

test('arrival estimates include acceleration, braking and behind-the-carrier pursuit risk', () => {
  const a = actor('carrier', 0, 50, 34),
    d = actor('defender', 1, 46, 34, { sprintSpeed: 95, acceleration: 95 });
  a.velocity.x = 6;
  d.velocity.x = 8;
  assert.ok(
    arrivalTime(a, { x: 60, z: 34 }) <
      arrivalTime({ ...a, velocity: { x: -6, z: 0 } }, { x: 60, z: 34 }),
  );
  a.player.attributes.sprintSpeed = 20;
  a.player.attributes.acceleration = 20;
  a.velocity.x = 3;
  const options = (opponents) =>
    carryOptions(
      a,
      { x: 50.6, z: 34 },
      1,
      opponents,
      actionQuality(a, { x: 50.6, z: 34 }, 'dribbling', opponents),
      playerProfile(a.player),
      1,
    );
  const route = (opponents) => options(opponents).find((o) => o.destination.z === 34);
  assert.ok(route([d]).danger > route([]).danger);
  const near = actor('front', 1, 53, 34),
    far = actor('front', 1, 60, 34);
  assert.ok(route([near]).danger > route([far]).danger);
  assert.equal(route([]).mode, 'carryFast');
  assert.equal(route([near]).mode, 'carry');
});

test('support searches unblocked passing angles while preserving role and stable plans', () => {
  const a = actor('support', 0, 54, 34, { offTheBall: 95, decisions: 95 }),
    owner = actor('owner', 0, 45, 34),
    d = actor('d', 1, 53, 34);
  const base = { x: 56, z: 34 },
    b = { x: 45.6, z: 34 };
  const p = supportTarget(a, base, [a, owner, d], b, 1, 1);
  assert.ok(Math.abs(p.z - 34) >= 4, 'leave the blocked lane');
  assert.deepEqual(supportTarget(a, base, [a, owner, d], b, 1, 1.2), p, 'no per-frame jitter');
  assert.deepEqual(supportTarget(a, base, [a, owner, d], b, 1, 3, 'cover'), base);
});

test('marking memory can lose a changing runner, higher quality reduces lapses, and assignments resist needless swaps', () => {
  let poor = 0,
    good = 0;
  for (let seed = 0; seed < 400; seed++) {
    const runner = actor('r', 0, 40, 30, { offTheBall: 95, agility: 95 });
    runner.velocity = { x: 6, z: 0 };
    for (const level of [20, 95]) {
      const marker = actor('m' + seed, 1, 41, 30, {
        marking: level,
        anticipation: level,
        concentration: level,
      });
      marker.bias = seed / 400;
      markingTarget(marker, runner, { x: 35, z: 30 }, -1, 0);
      runner.velocity = { x: 0, z: 6 };
      markingTarget(marker, runner, { x: 25, z: 45 }, -1, 3);
      if (level === 20) poor += marker.markLapses ?? 0;
      else good += marker.markLapses ?? 0;
    }
  }
  assert.ok(poor > good + 5 && poor < 70, JSON.stringify({ poor, good }));
  const owner = actor('owner', 0, 68, 34),
    r = actor('runner', 0, 75, 30),
    m = actor('marker', 1, 76, 30),
    p = actor('presser', 1, 69, 34);
  r.player.role = 'FWD';
  m.index = 12;
  p.index = 13;
  const roles = teamRoles([owner, r, m, p], { x: 68.6, z: 34 }, owner, null, dirs, [{}, {}], 1);
  assert.equal(roles.marking[m.player.id], r.player.id);
});

// Inject a physical scenario by editing a test-owned Rapier checkpoint. There is
// no runtime scenario/seed override or production fake-report switch.
function scenario(direction, marker = null) {
  const args = [game.clubs[0], game.clubs[1], 42, 'movement-probe'];
  let engine = createMatchSimulation(...args, {
    durationSeconds: 240,
    sliceSeconds: 1,
    durable: true,
  });
  let c = structuredClone(engine.next().value.checkpoint);
  engine.return();
  const physics = restorePhysics(c.physics),
    actors = unpackActors(c.actors, physics);
  const a = actors.find((o) => o.side === 0 && o.player.role === 'MID'),
    passer = actors.find((o) => o.side === 0 && o !== a && !o.isKeeper);
  const mirror = (x) => (direction === 1 ? x : 105 - x);
  c.state.half = direction === 1 ? 0 : 1;
  for (const o of actors) {
    for (const key in o.player.attributes) o.player.attributes[key] = 65;
    o.player.preferredFoot = 'both';
    o.player.weakFoot = 100;
    o.sentOff = o !== a && o !== passer;
    o.body.setEnabled(!o.sentOff);
    o.pos = { x: mirror(o === a ? 50 : 15), z: o === a ? 34 : 7 };
    o.velocity = { x: o === a ? direction * 6 : 0, z: 0 };
    o.intent = null;
    o.setPiece = null;
    o.cooldown = 0;
    o.nextDecision = 0;
    o.body.setTranslation({ x: o.pos.x, y: o.height / 2, z: o.pos.z }, true);
    o.body.setLinvel({ x: o.velocity.x, y: 0, z: 0 }, true);
  }
  if (marker) {
    const d = actors.find((o) => o.side === 1 && !o.isKeeper);
    d.sentOff = false;
    d.body.setEnabled(true);
    Object.assign(d.player.attributes, {
      sprintSpeed: marker.defence,
      acceleration: marker.defence,
    });
    Object.assign(a.player.attributes, { sprintSpeed: marker.attack, acceleration: marker.attack });
    d.pos = { x: mirror(marker.x ?? 46), z: 34 };
    d.velocity = { x: direction * (marker.speed ?? 6), z: 0 };
    d.body.setTranslation({ x: d.pos.x, y: d.height / 2, z: 34 }, true);
    d.body.setLinvel({ x: d.velocity.x, y: 0, z: 0 }, true);
  }
  physics.ball.setTranslation({ x: mirror(50.65), y: 0.12, z: 34 }, true);
  physics.ball.setLinvel({ x: direction * 10, y: 0, z: 0 }, true);
  c.actors = packActors(actors);
  c.physics.world = physics.world.takeSnapshot();
  physics.world.free();
  c.state.owner = null;
  c.state.lastTouch = passer.index;
  c.state.restartUntil = 0;
  c.state.restartTaker = null;
  c.state.deadState = null;
  c.state.goalRestart = null;
  c.state.pendingPass = {
    actor: passer.index,
    receiverId: a.player.id,
    target: { x: mirror(55), z: 34 },
    time: 1,
    expiresAt: 5,
  };
  c.continuity.controller = null;
  c.continuity.side = 0;
  c.continuity.phase = 'flight';
  engine = createMatchSimulation(...args, {
    durationSeconds: 240,
    sliceSeconds: 1,
    durable: true,
    checkpoint: c,
  });
  const snapshots = [];
  for (let n = 0; n < 3; n++) snapshots.push(structuredClone(engine.next().value.checkpoint));
  engine.return();
  return { a, index: a.index, snapshots, direction };
}

test('actual Rapier reception advances continuously for three seconds in both directions', () => {
  for (const direction of [-1, 1]) {
    const { a, index, snapshots } = scenario(direction);
    const finish = snapshots.at(-1).actors[index];
    const progress = (finish.pos.x - a.pos.x) * direction;
    assert.ok(
      progress > 12,
      JSON.stringify({ direction, progress, positions: snapshots.map((c) => c.actors[index].pos) }),
    );
    assert.ok(
      snapshots.every(
        (c) => Math.hypot(c.actors[index].velocity.x, c.actors[index].velocity.z) > 3,
      ),
      JSON.stringify(
        snapshots.map((c) => ({
          pos: c.actors[index].pos,
          v: c.actors[index].velocity,
          intent: c.actors[index].intent,
          owner: c.state.owner,
          events: c.events.slice(-5),
        })),
      ),
    );
    assert.ok(snapshots[0].events.some((e) => e.type === 'control' && e.flow === true));
  }
});

test('dead-ball and goal return targets enforce restart distances and staged celebration', () => {
  const a = actor('scorer', 0, 94, 34),
    d = actor('marker', 1, 95, 34);
  a.player.role = 'FWD';
  const s = {
    type: 'goal',
    side: 1,
    scoringSide: 0,
    scorerId: 'scorer',
    startedAt: 10,
    celebration: { x: 98, z: 12 },
  };
  assert.deepEqual(deadballTarget(a, [a, d], s, dirs, 12), s.celebration);
  assert.ok(deadballTarget(a, [a, d], s, dirs, 16).x < 50, 'return to own half');
  const state = { type: 'freeKick', side: 0, taker: 0, ball: { x: 50.65, z: 34 } };
  const target = deadballTarget(d, [a, d], state, dirs, 1);
  assert.ok(Math.hypot(target.x - 50.65, target.z - 34) >= 9.15);
  a.pos = { x: 50, z: 34 };
  d.pos = { x: 52, z: 34 };
  assert.equal(restartReady(state, [a, d], dirs), false);
  d.pos = target;
  assert.equal(restartReady(state, [a, d], dirs), true);
});

test('a slow pursuer does not erase a fast carrier lead while a fast pursuer remains a threat', () => {
  for (const direction of [-1, 1]) {
    const fast = scenario(direction, { attack: 95, defence: 25, speed: 5 });
    const slow = scenario(direction, { attack: 25, defence: 95, speed: 8 });
    const progress = (s) => (s.snapshots.at(-1).actors[s.index].pos.x - s.a.pos.x) * direction;
    assert.ok(progress(fast) > 12);
    assert.ok(
      progress(fast) > progress(slow),
      JSON.stringify({ fast: progress(fast), slow: progress(slow) }),
    );
    assert.ok(fast.snapshots.every((c) => c.actors[fast.index].maxSpeed < 11));
  }
});

test('dead-ball movement and celebration are physical, keep a stopped ball still and return toward the halfway line', () => {
  const args = [game.clubs[0], game.clubs[1], 42, 'dead-probe'];
  for (const type of ['corner', 'goal']) {
    let engine = createMatchSimulation(...args, {
      durationSeconds: 240,
      sliceSeconds: 1,
      durable: true,
    });
    const c = structuredClone(engine.next().value.checkpoint);
    engine.return();
    const p = restorePhysics(c.physics),
      actors = unpackActors(c.actors, p);
    const scorer = actors.find((o) => o.side === 0 && o.player.role === 'FWD');
    const started = { x: 94, z: 30 };
    scorer.pos = started;
    scorer.body.setTranslation({ x: 94, y: scorer.height / 2, z: 30 }, true);
    const b = { x: 104.4, z: 0.6 };
    p.ball.setTranslation({ x: b.x, y: 0.12, z: b.z }, true);
    p.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
    c.actors = packActors(actors);
    c.physics.world = p.world.takeSnapshot();
    p.world.free();
    c.state.owner = null;
    c.state.pendingPass = null;
    c.state.restartUntil = 30;
    c.state.restartTaker = scorer.index;
    c.state.deadState = {
      type,
      side: 0,
      taker: scorer.index,
      ball: b,
      startedAt: 1,
      scoringSide: 0,
      scorerId: scorer.player.id,
      celebration: { x: 98, z: 12 },
    };
    c.state.goalRestart = type === 'goal' ? { side: 1, at: 30 } : null;
    engine = createMatchSimulation(...args, {
      durationSeconds: 240,
      sliceSeconds: 1,
      durable: true,
      checkpoint: c,
    });
    let first, last;
    for (let n = 0; n < 9; n++) {
      const step = engine.next().value.checkpoint;
      if (!first) first = step;
      last = step;
    }
    engine.return();
    const moved = first.actors[scorer.index].pos;
    assert.ok(Math.hypot(moved.x - started.x, moved.z - started.z) > 0.5);
    assert.ok(
      Math.hypot(moved.x - started.x, moved.z - started.z) < 7,
      'finite travel, no teleport',
    );
    assert.equal(
      last.actors[scorer.index].touches,
      c.actors[scorer.index].touches,
      'no dead-ball kicking',
    );
    if (type === 'corner') {
      const world = restorePhysics(last.physics),
        ball = world.ball.translation();
      world.world.free();
      assert.ok(Math.hypot(ball.x - b.x, ball.z - b.z) < 0.001);
    } else
      assert.ok(
        last.actors[scorer.index].pos.x < first.actors[scorer.index].pos.x,
        'celebrate then jog back',
      );
  }
});
