import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, simulate } from '../../packages/shared/game.mjs';
import { random } from '../../packages/shared/core/index.mjs';
import {
  chooseAction,
  playerProfile,
  movement,
  movementMode,
  targetFor,
  teamRoles,
  distance,
} from '../../packages/shared/modules/matches/agents.mjs';
import {
  createPhysics,
  createBody,
  orientFoot,
  kick,
  stepPhysics,
  touchesBall,
  goalCrossing,
} from '../../packages/shared/modules/matches/physics.mjs';
import { carryOptions } from '../../packages/shared/modules/matches/carrying.mjs';
import { actionQuality } from '../../packages/shared/modules/matches/skills.mjs';
import {
  onTargetEstimate,
  projectedShotContext,
} from '../../packages/shared/modules/matches/shot-window.mjs';
import {
  carryTouchSpeed,
  shotCandidate,
} from '../../packages/shared/modules/matches/decisions.mjs';

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

function controlled(id, side, x, z, changes = {}, role = 'MID') {
  const a = actor(id, side, x, z, {}, role);
  for (const key of Object.keys(a.player.attributes)) a.player.attributes[key] = 65;
  Object.assign(a.player.attributes, changes);
  a.player.preferredFoot = 'both';
  a.player.weakFoot = 100;
  return a;
}
function decisions(p, others, direction = 1, time = 10) {
  const counts = { pass: 0, dribble: 0, shot: 0, takeOn: 0, hold: 0 };
  for (let seed = 1; seed <= 100; seed++) {
    const a = structuredClone(p),
      action = chooseAction(
        a,
        [a, ...others],
        { x: a.pos.x + direction * 0.6, y: 0.11, z: a.pos.z },
        direction,
        { style: 'balanced' },
        random(seed),
        { time },
      );
    counts[action.type]++;
    if (action.intent === 'takeOn') counts.takeOn++;
  }
  return counts;
}

test('an ordinary midfielder uses unmarked forward space instead of circulating automatically, in either direction', () => {
  for (const direction of [-1, 1]) {
    const mirror = (x) => (direction === 1 ? x : 105 - x);
    const p = controlled('p', 0, mirror(50), 34),
      others = [
        controlled('m', 0, mirror(58), 42),
        controlled('b', 0, mirror(43), 34),
        controlled('w', 0, mirror(50), 49),
        controlled('d', 1, mirror(78), 23),
        controlled('k', 1, mirror(102), 34, {}, 'GK'),
      ];
    const result = decisions(p, others, direction);
    assert.ok(result.dribble >= 85, JSON.stringify(result));
    assert.equal(
      result.takeOn,
      0,
      'open-field advancement is distinct from challenging a defender',
    );
  }
});

test('dribbling ability and the opposing marker affect whether to attempt a real one-on-one', () => {
  const others = [
    controlled('m', 0, 43, 44),
    controlled('d', 1, 54, 34, { tackling: 45, positioning: 45, balance: 50 }),
    controlled('k', 1, 102, 34, {}, 'GK'),
  ];
  const strong = controlled('p', 0, 50, 34, {
      dribbling: 95,
      agility: 85,
      balance: 80,
      decisions: 85,
    }),
    weak = structuredClone(strong);
  weak.player.attributes.dribbling = 20;
  const skilled = decisions(strong, others),
    unskilled = decisions(weak, others);
  assert.ok(skilled.takeOn >= 60, JSON.stringify(skilled));
  assert.ok(
    unskilled.takeOn <= skilled.takeOn - 50,
    'weak dribblers prefer an outlet or shielding in at least fifty more cases',
  );
  const better = structuredClone(others);
  Object.assign(better[1].player.attributes, { tackling: 95, positioning: 95, balance: 95 });
  assert.ok(
    decisions(strong, better).takeOn < skilled.takeOn,
    'stronger defending makes beating that marker less attractive',
  );
});

test('covering defenders discourage solo runs while a clearly better attacking pass remains available', () => {
  const p = controlled('p', 0, 50, 34, {
    dribbling: 92,
    agility: 90,
    balance: 85,
    sprintSpeed: 84,
    acceleration: 90,
    decisions: 85,
  });
  const common = [
    controlled('m', 0, 43, 44),
    controlled('d', 1, 54, 34),
    controlled('k', 1, 102, 34, {}, 'GK'),
  ];
  const ball = { x: 50.6, z: 34 };
  const forwardSafety = (others) =>
    Math.max(
      ...carryOptions(
        p,
        ball,
        1,
        others.filter((o) => o.side !== p.side),
        actionQuality(
          p,
          ball,
          'dribbling',
          others.filter((o) => o.side !== p.side),
        ),
        playerProfile(p.player),
        10,
      )
        .filter((o) => o.destination.x > ball.x + 5)
        .map((o) => o.success),
    );
  assert.ok(
    forwardSafety([...common, controlled('c1', 1, 57, 29), controlled('c2', 1, 57, 39)]) <
      forwardSafety(common),
    'cover makes advancing past the defender less safe; lateral shielding stays available',
  );
  const passer = controlled('p', 0, 72, 34, { passing: 85, vision: 85, decisions: 90 });
  assert.ok(
    decisions(passer, [
      controlled('m', 0, 93, 34),
      controlled('d', 1, 96, 10),
      controlled('k', 1, 103, 34, {}, 'GK'),
    ]).pass >= 90,
  );
});

test('a persistent carry still considers new routes and renews an already reached destination', () => {
  const p = controlled('p', 0, 50, 34),
    ball = { x: 50.6, y: 0.11, z: 34 },
    others = [controlled('d', 1, 57, 34)];
  p.intent = { kind: 'carry', destination: { x: 58, z: 34 }, expiresAt: 20 };
  const opts = carryOptions(
    p,
    ball,
    1,
    others,
    actionQuality(p, ball, 'dribbling', others),
    playerProfile(p.player),
    10,
  );
  assert.ok(opts.length >= 5);
  assert.ok(opts.some((o) => o.destination.z > 37) && opts.some((o) => o.destination.z < 31));
  p.intent.destination = { x: 51, z: 34 };
  const renewed = carryOptions(
    p,
    ball,
    1,
    others,
    actionQuality(p, ball, 'dribbling', others),
    playerProfile(p.player),
    10,
  );
  assert.ok(
    renewed.some((o) => o.destination.x > ball.x + 5),
    'reaching the old target does not trap the carrier in place',
  );
});

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

test('higher dribbling ability sends a tighter running touch without changing player speed', () => {
  const ordinary = controlled('ordinary', 0, 50, 34, { dribbling: 45 }),
    skilled = controlled('skilled', 0, 50, 34, { dribbling: 95 });
  ordinary.velocity = { x: 4.2, z: 0 };
  skilled.velocity = { x: 4.2, z: 0 };
  const heading = { x: 1, z: 0 },
    ordinaryTouch = carryTouchSpeed(ordinary, 'carryFast', heading),
    skilledTouch = carryTouchSpeed(skilled, 'carryFast', heading);
  assert.ok(skilledTouch < ordinaryTouch);
  assert.ok(skilledTouch >= 2.2);
  assert.ok(ordinaryTouch <= movement(ordinary.player, 100, 'carryFast').speed + 1.6);
});

test('an organiser passes and a dribbler carries in the same open situation across common seeds', () => {
  // Isolate the compared abilities from newly generated archetype strengths/weak feet.
  const organiser = controlled('p', 0, 50, 34, {
    passing: 94,
    vision: 94,
    decisions: 92,
    dribbling: 35,
    agility: 45,
    firstTouch: 70,
  });
  const dribbler = controlled('p', 0, 50, 34, {
    passing: 35,
    vision: 45,
    decisions: 92,
    dribbling: 94,
    agility: 94,
    firstTouch: 94,
  });
  const mate = controlled('m', 0, 64, 42),
    def = controlled('d', 1, 78, 25),
    keeper = controlled('g', 1, 102, 34, {}, 'GK');
  let passes = 0,
    carries = 0,
    organiserCarries = 0,
    dribblerPasses = 0;
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
    organiserCarries += first.type === 'dribble';
    dribblerPasses += second.type === 'pass';
    assert.ok(first.reason && second.reason);
  }
  assert.ok(passes > dribblerPasses + 10, JSON.stringify({ passes, dribblerPasses }));
  assert.ok(carries > organiserCarries + 10, JSON.stringify({ carries, organiserCarries }));
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

test('long-shot ability keeps remote shots available and raises their candidate value without a quota', () => {
  const ball = { x: 79, y: 0.11, z: 34 };
  const quality = (p) => (key) => ({ value: p.player.attributes[key], pressure: 0 });
  const high = actor('high-longshot', 0, 78.4, 34, { longShots: 100, finishing: 90 }, 'FWD');
  const ordinary = actor('ordinary-longshot', 0, 78.4, 34, { longShots: 50, finishing: 50 }, 'FWD');
  const highCandidate = shotCandidate(high, ball, [], 1, quality(high), () => 0.5, false);
  const ordinaryCandidate = shotCandidate(
    ordinary,
    ball,
    [],
    1,
    quality(ordinary),
    () => 0.5,
    false,
  );

  assert.ok(highCandidate, 'high long-shot ability extends the candidate range');
  assert.equal(ordinaryCandidate, null, 'the range remains ability-based');
  const sharedRangeBall = { x: 83.5, y: 0.11, z: 34 };
  const highInRange = shotCandidate(high, sharedRangeBall, [], 1, quality(high), () => 0.5, false);
  const ordinaryInRange = shotCandidate(
    ordinary,
    sharedRangeBall,
    [],
    1,
    quality(ordinary),
    () => 0.5,
    false,
  );
  assert.ok(highInRange && ordinaryInRange);
  assert.ok(highInRange.utility > ordinaryInRange.utility);
});

function shootingWindowChoices(longShots, layout, direction = 1) {
  const mirror = (x) => (direction === 1 ? x : 105 - x);
  const striker = controlled(
    'window-striker',
    0,
    mirror(80.6),
    34,
    { longShots, finishing: 90, strength: 85, balance: 90, decisions: 95, composure: 90 },
    'FWD',
  );
  striker.facing = direction === 1 ? 0 : Math.PI;
  const keeper = controlled('window-keeper', 1, mirror(104), 34, {}, 'GK');
  const opponents = [keeper];
  if (layout === 'closing') {
    for (const [z, vz] of [
      [29, 3],
      [39, -3],
    ]) {
      const defender = controlled('window-defender-' + z, 1, mirror(89), z, {}, 'DEF');
      defender.velocity.z = vz;
      opponents.push(defender);
    }
  } else if (layout === 'blocked') {
    for (const z of [32, 34, 36])
      opponents.push(controlled('screen-' + z, 1, mirror(86), z, {}, 'DEF'));
  }
  const counts = { shot: 0, dribble: 0, pass: 0, hold: 0 };
  for (let seed = 1; seed <= 100; seed++) {
    const a = structuredClone(striker);
    const action = chooseAction(
      a,
      [a, ...structuredClone(opponents)],
      { x: mirror(81), z: 34, y: 0.11 },
      direction,
      { style: 'balanced' },
      random(seed),
      { time: 10 },
    );
    counts[action.type]++;
  }
  return counts;
}

test('a long-shot specialist exploits a closing unpressured window, while safe open advancement remains useful in either direction', () => {
  for (const direction of [1, -1]) {
    const strong = shootingWindowChoices(95, 'closing', direction);
    const ordinary = shootingWindowChoices(50, 'closing', direction);
    const open = shootingWindowChoices(95, 'open', direction);
    assert.ok(strong.shot > ordinary.shot + 10, 'changing only long shots changes actual choices');
    assert.ok(
      strong.shot > open.shot + 30,
      'the approaching defensive line closes the future window',
    );
    assert.ok(open.dribble > 90, 'a truly open route to a better finish is still worth carrying');
    assert.ok(strong.shot < 95, 'a specialist is not forced to shoot every time');
  }
});

test('screening the shot corridor reduces specialist shooting instead of granting a universal long-shot bonus', () => {
  const closing = shootingWindowChoices(95, 'closing');
  const blocked = shootingWindowChoices(95, 'blocked');
  assert.ok(blocked.shot + 15 < closing.shot);
  assert.ok(blocked.dribble + blocked.pass + blocked.hold > blocked.shot);
});

test('a backwards-facing shooter needs more preparation before an opponent can close the shot', () => {
  const a = controlled('body-ready', 0, 81, 34, { longShots: 95, balance: 90 }, 'FWD');
  const defender = controlled('closer', 1, 84.5, 35, {}, 'DEF');
  const ball = { x: 81.4, y: 0.11, z: 34 };
  const assess = (facing) => {
    a.facing = facing;
    return shotCandidate(
      a,
      ball,
      [defender],
      1,
      (key) => actionQuality(a, ball, key, [defender]),
      random(1),
      false,
    ).window;
  };
  const ready = assess(0),
    turned = assess(Math.PI);
  assert.ok(turned.preparation > ready.preparation);
  assert.ok(turned.ready < ready.ready);
  assert.ok(turned.value < ready.value);
});

test('short shot forecasts respect observed speed, do not read hidden targets, and never mutate live actors', () => {
  const a = controlled('carrier', 0, 80, 34, { decisions: 100 }, 'FWD');
  const defender = controlled('moving', 1, 89, 29, {}, 'DEF');
  defender.velocity = { x: 0, z: 3 };
  const actors = [a, defender],
    before = structuredClone(actors);
  const future = projectedShotContext(actors, a, { x: 85, z: 34 }, 2, 'carry');
  assert.deepEqual(actors, before);
  assert.equal(future.actors[1].pos.z, 35);
  defender.target = { x: 1, z: 1 };
  assert.deepEqual(
    projectedShotContext(actors, a, { x: 85, z: 34 }, 2, 'carry').actors[1].pos,
    future.actors[1].pos,
    'another AI target is not information available to the carrier',
  );
});

test('on-target estimates track the actual kick-aim sampler across distant shots and skill levels', () => {
  const a = controlled('dispersion', 0, 78, 34, { longShots: 100, strength: 85 }, 'FWD');
  for (const dist of [24, 28])
    for (const value of [50, 95]) {
      const ball = { x: 105 - dist, z: 34, y: 0.11 },
        quality = { value, pressure: 0 };
      let onTarget = 0;
      for (let seed = 1; seed <= 1500; seed++) {
        const kick = shotCandidate(
          a,
          ball,
          [],
          1,
          () => ({ ...quality }),
          random(seed),
          false,
        ).make();
        if (Math.abs(kick.kickAim.z - 34) <= 3.55 && kick.kickAim.y <= 2.33) onTarget++;
      }
      assert.ok(
        Math.abs(onTarget / 1500 - onTargetEstimate(a, dist, quality)) < 0.04,
        'selection accuracy should agree with the unchanged physical aim distribution',
      );
    }
});

test('shot value accounts for pressure and blocked lanes, while ordinary finishing aims inside the goal mouth', () => {
  const shooter = actor('shot-value', 0, 90, 34, { finishing: 60, longShots: 60 }, 'FWD');
  const ball = { x: 90, y: 0.11, z: 34 };
  const quality = (pressure) => () => ({ value: 60, pressure });
  const clear = shotCandidate(shooter, ball, [], 1, quality(0.1), random(1), false);
  const screened = shotCandidate(
    shooter,
    ball,
    [actor('screen', 1, 94, 34)],
    1,
    quality(0.9),
    random(2),
    false,
  );
  assert.ok(clear && screened, 'pressure changes shot quality, not legal shot availability');
  assert.ok(screened.xg < clear.xg, 'a closed, crowded lane is worth less than a clear finish');

  const heights = Array.from(
    { length: 200 },
    (_, seed) =>
      shotCandidate(shooter, ball, [], 1, quality(0.1), random(seed + 3), false).make().kickAim.y,
  );
  const average = heights.reduce((sum, height) => sum + height, 0) / heights.length;
  assert.ok(average > 0.7 && average < 1.7, 'aims should use the playable goal mouth');
  assert.ok(Math.max(...heights) < 2.6, 'ordinary shots should not mostly be aimed over the bar');
});

test('shot aim reaches the goal mouth from close angles on either flank and attack direction', () => {
  for (const { side, direction, x } of [
    { side: 0, direction: 1, x: 100 },
    { side: 1, direction: -1, x: 5 },
  ]) {
    for (const z of [15, 53]) {
      const shooter = actor(
        `wide-shot-${side}-${z}`,
        side,
        x,
        z,
        { finishing: 98, longShots: 94, composure: 97, balance: 90, strength: 92 },
        'FWD',
      );
      shooter.player.preferredFoot = 'both';
      shooter.player.weakFoot = 95;
      const ball = { x, y: 0.11, z };
      const candidate = shotCandidate(
        shooter,
        ball,
        [],
        direction,
        (key) => actionQuality(shooter, ball, key, []),
        () => 0.5,
        false,
      );
      assert.ok(candidate);
      const launch = candidate.make();
      const physics = createPhysics();
      try {
        physics.ball.setTranslation(ball, true);
        physics.ball.setLinvel({ x: launch.x, y: launch.y, z: launch.z }, true);
        let crossing = null;
        for (let i = 0; i < 100 && crossing === null; i++) {
          const before = physics.ball.translation();
          stepPhysics(physics);
          crossing = goalCrossing(before, physics.ball.translation());
        }
        assert.equal(crossing, side === 0 ? 1 : 0, `shot from z=${z}, direction=${direction}`);
      } finally {
        physics.world.free();
      }
    }
  }
});

test('supporters form triangles, loose balls are recovered, and runners reserve sprints for the final third', () => {
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
  const receiver = actor('r', 0, 85, 34);
  receiver.index = 1;
  support.index = 2;
  support.pos = { x: 65, z: 34 };
  const flight = { actor: owner, receiverId: receiver.player.id, time: 0 };
  const teammates = [owner, support, receiver];
  const rolesAt = (time) =>
    teamRoles(teammates, { ...ball, x: 65 }, null, flight, () => 1, [{}, {}], time);
  assert.equal(rolesAt(1).receiverId, 'r', 'give the intended receiver time to meet the pass');
  const looseRoles = rolesAt(5);
  assert.equal(looseRoles.receiverId, null);
  assert.ok(
    looseRoles.chasers.includes(support.index),
    'a nearby teammate recovers an overdue pass',
  );
  assert.equal(
    movementMode(owner, ball, null, { chasers: [], runnerId: owner.player.id }, 10),
    'jog',
    'a midfield runner advances without immediately using a full sprint',
  );
  owner.pos = { x: 80, z: 34 };
  owner.direction = 1;
  assert.equal(
    movementMode(owner, { ...ball, x: 80.6 }, null, { chasers: [], runnerId: owner.player.id }, 10),
    'sprint',
    'a runner bursts to exploit a final-third opportunity',
  );
});
