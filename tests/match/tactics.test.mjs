import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../../packages/shared/game.mjs';
import { bestLineup, tacticalPreset } from '../../packages/shared/modules/tactics/index.mjs';
import {
  formation,
  teamRoles,
  targetFor,
} from '../../packages/shared/modules/matches/positioning.mjs';
import {
  attackPhase,
  attackAssignments,
  deliveryOptions,
  deliveryReceptionRisk,
} from '../../packages/shared/modules/matches/tactical-plan.mjs';
import { carryOptions } from '../../packages/shared/modules/matches/carrying.mjs';
import { chooseAction } from '../../packages/shared/modules/matches/decisions.mjs';
import {
  continuityState,
  controlBall,
  deadBall,
} from '../../packages/shared/modules/matches/continuity.mjs';
import { random } from '../../packages/shared/core/index.mjs';

function team(name = '4-3-3', direction = 1) {
  const club = structuredClone(createGame('职责', 42).clubs[0]);
  club.tactics.formation = name;
  club.lineup = bestLineup(club, name);
  return formation(club).map(({ player, anchor, positionRole }, index) => {
    for (const key of Object.keys(player.attributes)) player.attributes[key] = 70;
    player.fitness = 100;
    player.preferredFoot = 'both';
    player.weakFoot = 100;
    return {
      player,
      anchor,
      positionRole,
      side: 0,
      index,
      isKeeper: player.role === 'GK',
      pos: { x: direction === 1 ? anchor.x : 105 - anchor.x, z: anchor.z },
      velocity: { x: 0, z: 0 },
      energy: 100,
      bias: 0,
      hold: 1,
      intent: null,
    };
  });
}
const context = () => ({ side: 0, regainedAt: null });

test('three formations assign coherent runtime slots without changing broad player positions', () => {
  for (const name of ['4-3-3', '4-4-2', '3-5-2']) {
    const actors = team(name);
    assert.equal(actors.length, 11);
    assert.equal(actors.filter((a) => a.positionRole === 'holdingMid').length, 1);
    assert.equal(
      actors.filter((a) => a.positionRole === 'centreBack').length,
      name === '3-5-2' ? 3 : 2,
    );
    assert.ok(actors.every((a) => ['GK', 'DEF', 'MID', 'FWD'].includes(a.player.role)));
    if (name === '4-3-3') {
      assert.equal(actors.filter((a) => a.positionRole === 'winger').length, 2);
      assert.equal(actors.filter((a) => a.positionRole === 'striker').length, 1);
      assert.ok(
        actors.find((a) => a.positionRole === 'holdingMid').anchor.x <
          actors.find((a) => a.positionRole === 'centralMid').anchor.x,
      );
    }
  }
  assert.equal(Object.isFrozen(tacticalPreset('wide')), true);
});

test('wide roles coordinate overlap, near/far-post runs, cutback support and cover in either direction', () => {
  for (const direction of [1, -1]) {
    const actors = team('4-3-3', direction),
      mirror = (x) => (direction === 1 ? x : 105 - x);
    const owner = actors.find((a) => a.positionRole === 'winger' && a.anchor.z < 34);
    owner.pos = { x: mirror(81), z: 8 };
    const d = { ...structuredClone(actors[2]), side: 1, pos: { x: mirror(98), z: 34 } };
    const k = { ...structuredClone(actors[0]), side: 1, pos: { x: mirror(102), z: 34 } };
    const ball = { x: mirror(81.5), z: 8, y: 0.11, vx: 0, vz: 0 };
    const tactics = [
      { style: 'wide', press: 'normal' },
      { style: 'balanced', press: 'normal' },
    ];
    const roles = teamRoles(
      [...actors, d, k],
      ball,
      owner,
      null,
      (s) => (s ? -direction : direction),
      tactics,
      10,
      context(),
    );
    for (const duty of ['overlap', 'nearPost', 'farPost', 'cutback'])
      assert.equal(Object.values(roles.duties).filter((a) => a.duty === duty).length, 1, duty);
    const duties = Object.values(roles.duties);
    assert.notEqual(
      duties.find((a) => a.duty === 'nearPost').z,
      duties.find((a) => a.duty === 'farPost').z,
    );
    assert.ok(
      (ball.x - roles.duties[actors.find((a) => a.positionRole === 'holdingMid').player.id].x) *
        direction >
        18,
    );
    for (const actor of actors.filter((a) => roles.duties[a.player.id])) {
      const target = targetFor(
        actor,
        [...actors, d, k],
        ball,
        owner,
        direction,
        tactics[0],
        [],
        roles,
      );
      assert.deepEqual(target, {
        x: roles.duties[actor.player.id].x,
        z: roles.duties[actor.player.id].z,
      });
      assert.ok(target.x >= 3 && target.x <= 102 && target.z >= 3 && target.z <= 65);
    }
    const receiver = actors.find((a) => a.positionRole === 'striker');
    const receiving = teamRoles(
      [...actors, d, k],
      ball,
      null,
      {
        actor: owner,
        receiverId: receiver.player.id,
        target: { x: mirror(85), z: 30 },
        time: 10,
        expiresAt: 13,
      },
      (s) => (s ? -direction : direction),
      tactics,
      11,
      context(),
    );
    assert.equal(
      receiving.duties[receiver.player.id],
      undefined,
      'designated receiver keeps reception priority',
    );
  }
});

test('overlap requires protection and an open route; pressing remains a separate defensive choice', () => {
  const actors = team(),
    owner = actors.find((a) => a.positionRole === 'winger');
  owner.pos = { x: 70, z: 9 };
  const ball = { x: 70.5, z: 9 };
  const unprotected = attackAssignments(
    actors.filter((a) => a.positionRole !== 'holdingMid'),
    ball,
    owner,
    null,
    1,
    { style: 'wide' },
    1,
    context(),
  );
  assert.equal(
    Object.values(unprotected.assignments).some((a) => a.duty === 'overlap'),
    false,
  );
  const d = { ...structuredClone(actors[2]), index: 11, side: 1, pos: { x: 35, z: 9 } };
  const blocked = attackAssignments(
    [...actors, d],
    ball,
    owner,
    null,
    1,
    { style: 'wide' },
    1,
    context(),
  );
  assert.equal(
    Object.values(blocked.assignments).some((a) => a.duty === 'overlap'),
    false,
  );
  const defenceBall = { x: 60, z: 34 },
    opponent = { ...d, pos: defenceBall };
  for (const [press, count] of [
    ['low', 1],
    ['high', 2],
  ]) {
    const roles = teamRoles(
      [...actors, opponent],
      defenceBall,
      opponent,
      null,
      (s) => (s ? -1 : 1),
      [{ style: 'wide', press }, {}],
    );
    assert.equal(roles.chasers.filter((i) => i < 11).length, count);
  }
});

test('counter window starts on regained possession, survives passes, expires and resets at dead balls', () => {
  const actors = team(),
    a = actors[6],
    b = { ...actors[7], side: 1 },
    ball = { x: 50, z: 34 },
    s = continuityState();
  controlBall(s, a, 0, false);
  assert.equal(attackPhase(actors, ball, 0, 1, { style: 'counter' }, 1, s).fastBreak, false);
  controlBall(s, b, 2, false);
  controlBall(s, a, 10, false);
  controlBall(s, actors[8], 12, true);
  assert.equal(s.regainedAt, 10);
  assert.equal(attackPhase(actors, ball, 0, 1, { style: 'counter' }, 17.9, s).fastBreak, true);
  assert.equal(attackPhase(actors, ball, 0, 1, { style: 'counter' }, 18, s).fastBreak, false);
  deadBall(s, 19, 'throwIn');
  controlBall(s, a, 20, false);
  assert.equal(attackPhase(actors, ball, 0, 1, { style: 'counter' }, 20, s).fastBreak, false);
  const settled = Array.from({ length: 7 }, (_, i) => ({ side: 1, pos: { x: 80, z: i * 7 } }));
  assert.equal(
    attackPhase([...actors, ...settled], ball, 0, 1, { style: 'counter' }, 11, {
      side: 0,
      regainedAt: 10,
    }).fastBreak,
    false,
  );
});

test('possession provides distinct outlets and protection without wide-play box runs', () => {
  const actors = team(),
    owner = actors.find((a) => a.positionRole === 'centralMid');
  owner.pos = { x: 65, z: 28 };
  const plan = attackAssignments(
    actors,
    { x: 65.5, z: 28 },
    owner,
    null,
    1,
    { style: 'possession' },
    10,
    context(),
  );
  const assignments = Object.values(plan.assignments),
    support = assignments.filter((a) => a.duty === 'support');
  assert.ok(support.length > 0);
  assert.ok(assignments.some((a) => a.duty === 'cover'));
  assert.equal(
    assignments.some((a) => ['overlap', 'nearPost', 'farPost'].includes(a.duty)),
    false,
  );
  assert.equal(new Set(support.map((p) => p.x + ':' + p.z)).size, support.length);
});

test('deliveries require flank/box geometry; cutbacks go backwards; aerial ability affects receiver contest estimates', () => {
  const actors = team(),
    a = actors.find((a) => a.positionRole === 'winger'),
    mate = actors.find((a) => a.positionRole === 'striker');
  a.pos = { x: 93, z: 8 };
  mate.pos = { x: 84, z: 32 };
  const ball = { x: 93.5, z: 8 };
  assert.deepEqual(
    deliveryOptions(a, mate, ball, 1).map((v) => v.delivery),
    ['lofted', 'low', 'cutback'],
  );
  assert.equal(deliveryOptions(a, actors[0], ball, 1).length, 0);
  assert.equal(deliveryOptions(a, { ...mate, pos: { x: 60, z: 34 } }, ball, 1).length, 0);
  assert.equal(
    deliveryOptions(a, mate, { x: 83, z: 8 }, 1).some((v) => v.delivery === 'cutback'),
    false,
  );
  const marker = { ...structuredClone(mate), side: 1, pos: { x: 84.5, z: 32 } };
  mate.player.attributes.heading = 20;
  const weak = deliveryReceptionRisk(mate, mate.pos, [marker], { lob: true });
  mate.player.attributes.heading = 95;
  assert.ok(deliveryReceptionRisk(mate, mate.pos, [marker], { lob: true }) < weak);
});

test('wide policy changes actual crossing choices and supplies along-line carries, while a clear shot retains priority', () => {
  const actors = team(),
    a = actors.find((a) => a.positionRole === 'winger'),
    mate = actors.find((a) => a.positionRole === 'striker');
  a.pos = { x: 80, z: 10 };
  mate.pos = { x: 90, z: 32 };
  const keeper = { ...structuredClone(actors[0]), side: 1, pos: { x: 102, z: 34 } },
    ball = { x: 80.5, y: 0.11, z: 10 },
    counts = { balanced: 0, wide: 0 };
  // Clear crosses remain valid for any style; compare a range of marginal opportunities too.
  for (const x of [70, 80, 89])
    for (const tx of [78, 86, 94])
      for (const z of [22, 32, 42])
        for (const style of Object.keys(counts))
          for (let seed = 1; seed <= 20; seed++) {
            a.pos = { x, z: 10 };
            mate.pos = { x: tx, z };
            const carrier = structuredClone(a),
              action = chooseAction(
                carrier,
                [carrier, mate, keeper],
                { x: x + 0.5, y: 0.11, z: 10 },
                1,
                { style },
                random(seed),
                {
                  time: 10,
                  continuity: context(),
                },
              );
            if (action.type === 'cross') counts[style]++;
          }
  assert.ok(counts.wide > counts.balanced, JSON.stringify(counts));
  const routes = carryOptions(a, ball, 1, [], { value: 70 }, { inclination: 0 }, 10, {
    style: 'wide',
  });
  assert.ok(routes.some((r) => r.destination.z === ball.z));
  const striker = structuredClone(mate);
  striker.pos = { x: 94, z: 34 };
  const shot = chooseAction(
    striker,
    [striker, keeper],
    { x: 94.5, y: 0.11, z: 34 },
    1,
    { style: 'wide' },
    random(8),
  );
  assert.equal(shot.type, 'shot');
  assert.ok(Math.hypot(shot.x, shot.y, shot.z) <= 38);
});
