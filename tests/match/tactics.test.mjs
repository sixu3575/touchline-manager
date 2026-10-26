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
  midfieldOutletValue,
  tacticalDecisionValue,
} from '../../packages/shared/modules/matches/tactical-plan.mjs';
import {
  blockPosition,
  tackleProbability,
} from '../../packages/shared/modules/matches/defending.mjs';
import { actionQuality } from '../../packages/shared/modules/matches/skills.mjs';
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
      const base = roles.duties[actor.player.id];
      if (base.duty === 'cover') assert.deepEqual(target, { x: base.x, z: base.z });
      else
        assert.ok(
          Math.hypot(target.x - base.x, target.z - base.z) <= 6.1,
          'space search preserves tactical responsibility',
        );
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
    ['low', 0],
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

test('coordinated pressers close the carrier together and leave fewer defenders to cover runners', () => {
  const scenario = (press, awareness = 70) => {
    const defenders = team('4-3-3');
    defenders
      .filter((a) => !a.isKeeper)
      .forEach((a, index) => {
      const angle = (index / 10) * Math.PI * 2;
      a.pos = { x: 50 + Math.cos(angle) * 7, z: 34 + Math.sin(angle) * 7 };
      for (const key of Object.keys(a.player.attributes)) a.player.attributes[key] = awareness;
    });
    const attackers = team('4-3-3').map((a, index) => {
      a.side = 1;
      a.index += 11;
      a.player.id = `opponent-${a.player.id}`;
      a.pos = { x: 42 + index, z: 20 + index * 3 };
      return a;
    });
    const owner = attackers.find((a) => a.positionRole === 'centralMid');
    owner.pos = { x: 50, z: 34 };
    const ball = { x: 50, z: 34, vx: 0, vz: 0 };
    const roles = teamRoles(
      [...defenders, ...attackers],
      ball,
      owner,
      null,
      (side) => (side ? -1 : 1),
      [{ style: 'balanced', press }, { style: 'balanced', press: 'normal' }],
      10,
      context(),
    );
    return { defenders, attackers, owner, ball, roles };
  };

  const normal = scenario('normal'),
    high = scenario('high'),
    lowAwareness = scenario('high', 32);
  assert.equal(normal.roles.chasers.filter((i) => i < 11).length, 2);
  assert.equal(high.roles.chasers.filter((i) => i < 11).length, 3);
  assert.ok(
    lowAwareness.roles.chasers.filter((i) => i < 11).length < high.roles.chasers.filter((i) => i < 11).length,
    'low decision/anticipation/positioning/teamwork defenders coordinate fewer pressers',
  );
  assert.ok(
    Object.keys(high.roles.marking).length < Object.keys(normal.roles.marking).length,
    'committing extra pressers leaves more attacking runners without a dedicated marker',
  );

  const highPressers = high.roles.chasers
      .filter((index) => index < 11)
      .map((index) => high.defenders.find((a) => a.index === index)),
    pressTargets = highPressers.map((defender) =>
      targetFor(
        defender,
        [...high.defenders, ...high.attackers],
        high.ball,
        high.owner,
        1,
        { style: 'balanced', press: 'high' },
        high.roles.chasers,
        high.roles,
      ),
    );
  assert.ok(
    pressTargets.every((target) => Math.hypot(target.x - high.owner.pos.x, target.z - high.owner.pos.z) <= 3),
    'all selected pressers close within real pressure distance',
  );
  assert.ok(
    new Set(pressTargets.map((target) => `${target.x.toFixed(2)}:${target.z.toFixed(2)}`)).size > 1,
    'the second and third pressers take distinct outlet/shoulder angles instead of standing on one point',
  );

  const carrier = high.owner;
  carrier.pos = { x: 50, z: 34 };
  const single = high.defenders.slice(0, 1).map((a) => ({ ...a, pos: { x: 52, z: 34 } }));
  const pair = [
    ...single,
    { ...high.defenders[1], pos: { x: 52.8, z: 34 }, side: 0 },
  ];
  const oneDefenderQuality = actionQuality(carrier, high.ball, 'passing', single).pressure,
    twoDefenderQuality = actionQuality(carrier, high.ball, 'passing', pair).pressure;
  assert.ok(twoDefenderQuality > oneDefenderQuality, 'a second close defender compresses the carrier');
  assert.ok(
    tackleProbability(single[0], carrier, high.ball, single, 70, 70) <
      tackleProbability(single[0], carrier, high.ball, pair, 70, 70),
    'nearby support improves an actual tackle contest through the existing geometric support term',
  );
});

test('defensive awareness moves the block toward the ball and reads runners into midfield gaps', () => {
  const base = team('4-3-3').find((a) => a.positionRole === 'centreBack');
  const skilled = structuredClone(base),
    raw = structuredClone(base);
  for (const key of Object.keys(skilled.player.attributes)) skilled.player.attributes[key] = 92;
  for (const key of Object.keys(raw.player.attributes)) raw.player.attributes[key] = 28;
  const ball = { x: 64, z: 8, vx: 0, vz: 0 };
  const skilledBlock = blockPosition(skilled, ball, 1, { style: 'balanced', press: 'normal' }),
    rawBlock = blockPosition(raw, ball, 1, { style: 'balanced', press: 'normal' });
  assert.ok(skilledBlock.z < rawBlock.z, 'the more aware defender shifts farther toward the ball side');
  assert.ok(skilledBlock.x > rawBlock.x, 'the more aware defender reads the block depth more actively');

  const threat = structuredClone(base);
  threat.side = 1;
  threat.index = 11;
  threat.player.id = `runner-${threat.player.id}`;
  threat.player.role = 'FWD';
  threat.pos = { x: 30, z: 24 };
  threat.velocity = { x: 2, z: 0 };
  const runnerBall = { x: 45, z: 34, vx: 0, vz: 0 };
  skilled.side = 0;
  raw.side = 0;
  skilled.pos = { ...base.pos };
  raw.pos = { ...base.pos };
  const roleFor = (marker) => ({
    teamSide: 1,
    time: 10,
    marking: { [marker.player.id]: threat.player.id },
    defensiveCover: {},
    duties: {},
    press: {},
    teams: {},
  });
  const awareTarget = targetFor(
      skilled,
      [skilled, threat],
      runnerBall,
      threat,
      1,
      { style: 'balanced', press: 'normal' },
      [],
      roleFor(skilled),
    ),
    shapeTarget = targetFor(
      raw,
      [raw, threat],
      runnerBall,
      threat,
      1,
      { style: 'balanced', press: 'normal' },
      [],
      roleFor(raw),
    );
  assert.ok(
    Math.hypot(awareTarget.x - threat.pos.x, awareTarget.z - threat.pos.z) <
      Math.hypot(shapeTarget.x - threat.pos.x, shapeTarget.z - threat.pos.z),
    'a high-awareness marker steps out farther to follow a dangerous run into the gap',
  );
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

  const opponents = team().map((actor) => ({ ...actor, side: 1 }));
  for (const actor of opponents) {
    actor.pos = {
      x: actor.isKeeper ? 104 : actor.player.role === 'DEF' ? 72 : actor.player.role === 'MID' ? 55 : 30,
      z: actor.pos.z,
    };
  }
  const stretchedPlan = attackAssignments(
      [...actors, ...opponents],
      { x: 55, z: 34 },
      owner,
      null,
      1,
      { style: 'possession' },
      10,
      context(),
    ),
    striker = actors.find((actor) => actor.positionRole === 'striker');
  assert.equal(stretchedPlan.assignments[striker.player.id].duty, 'break');
  assert.ok(stretchedPlan.assignments[striker.player.id].x > 55);

  for (const actor of opponents)
    actor.pos.x = actor.isKeeper ? 104 : actor.player.role === 'DEF' ? 60 : actor.player.role === 'MID' ? 55 : 30;
  const compactPlan = attackAssignments(
    [...actors, ...opponents],
    { x: 55, z: 34 },
    owner,
    null,
    1,
    { style: 'possession' },
    10,
    context(),
  );
  assert.notEqual(compactPlan.assignments[striker.player.id]?.duty, 'break');

  for (const actor of opponents)
    actor.pos.x = actor.isKeeper ? 104 : actor.player.role === 'DEF' ? 82 : 55;
  const finalThirdPlan = attackAssignments(
    [...actors, ...opponents],
    { x: 75, z: 34 },
    owner,
    null,
    1,
    { style: 'possession' },
    10,
    context(),
  );
  assert.equal(finalThirdPlan.assignments[striker.player.id].duty, 'break');
  assert.ok(finalThirdPlan.assignments[striker.player.id].x > 75);
});

test('settled balanced and counter attacks keep central midfield outlets behind the ball', () => {
  for (const direction of [1, -1]) {
    const actors = team('4-4-2', direction),
      mirror = (x) => (direction === 1 ? x : 105 - x),
      owner = actors.find((a) => a.positionRole === 'wideMid');
    owner.pos = { x: mirror(58), z: 13 };
    for (const style of ['balanced', 'counter']) {
      const plan = attackAssignments(
          actors,
          { x: mirror(58.5), z: 13 },
          owner,
          null,
          direction,
          { style },
          20,
          context(),
        ),
        central = actors.find((a) => a.positionRole === 'centralMid'),
        duty = plan.assignments[central.player.id];
      assert.equal(duty.duty, 'support');
      assert.ok((mirror(58.5) - duty.x) * direction >= 4.9, `${style}: ${duty.x}`);
      assert.equal(
        plan.assignments[actors.find((a) => a.positionRole === 'holdingMid').player.id].duty,
        'cover',
      );
    }
    const counter = attackAssignments(
      actors,
      { x: mirror(58.5), z: 13 },
      owner,
      null,
      direction,
      { style: 'counter' },
      20,
      { ...context(), regainedAt: 19, side: 0 },
    );
    assert.notEqual(
      counter.assignments[actors.find((a) => a.positionRole === 'centralMid').player.id]?.duty,
      'support',
    );
  }
});

test('midfield outlet value rewards safe recycling and yields to counters and forward space', () => {
  const state = { phase: 'midfield', fastBreak: false },
    central = { positionRole: 'centralMid' },
    striker = { positionRole: 'striker' };
  const safeOutlet = midfieldOutletValue(state, central, 0, 0.9, 8);
  assert.ok(safeOutlet > 0 && safeOutlet <= 0.012, 'a safe outlet is a small tie-break, not a pass quota');
  assert.equal(midfieldOutletValue(state, striker, 0, 0.9, 8), 0);
  assert.equal(midfieldOutletValue({ ...state, fastBreak: true }, central, 0, 0.9, 8), 0);
  assert.equal(midfieldOutletValue({ ...state, phase: 'finalThird' }, central, 0, 0.9, 8), 0);
  assert.ok(
    midfieldOutletValue(state, central, 2, 0.9, 8) >
      midfieldOutletValue(state, central, 12, 0.9, 8),
  );
  assert.ok(
    midfieldOutletValue(state, central, 0, 0.9, 8) > midfieldOutletValue(state, central, 0, 0.9, 2),
  );
});

test('possession switches away from a loaded flank and waits for a stretched-line runner', () => {
  const attackers = team('4-3-3'),
    defenders = team('4-3-3').map((a) => ({ ...a, side: 1 })),
    owner = attackers.find((a) => a.positionRole === 'centralMid'),
    runner = attackers.find((a) => a.positionRole === 'striker'),
    ball = { x: 42, z: 10 };
  defenders.forEach((a, i) => {
    a.pos = a.isKeeper
      ? { x: 101, z: 34 }
      : a.player.role === 'DEF'
        ? { x: 50, z: 10 + i }
        : { x: 25, z: 30 + (i % 3) * 3 };
  });
  const switchValue = tacticalDecisionValue(
    { style: 'possession' },
    { phase: 'midfield', fastBreak: false },
    { intent: 'switch' },
    owner,
    attackers.find((a) => a.positionRole === 'winger' && a.anchor.z > 34),
    ball,
    { x: 45, z: 55 },
    1,
    0.82,
    10,
    defenders,
    50,
  );
  assert.ok(switchValue > 0.005, `open far-side switch value was ${switchValue}`);
  assert.ok(switchValue <= 0.018, `switch preference should remain selective: ${switchValue}`);
  const passValue = tacticalDecisionValue(
    { style: 'possession' },
    { phase: 'midfield', fastBreak: false },
    { intent: 'through' },
    owner,
    runner,
    ball,
    { x: 57, z: 34 },
    1,
    0.8,
    9,
    defenders,
    50,
  );
  assert.ok(passValue > 0.015, `space behind a stretched line should reward the through ball: ${passValue}`);
  const finalThirdThroughValue = tacticalDecisionValue(
    { style: 'possession' },
    { phase: 'finalThird', fastBreak: false },
    { intent: 'through' },
    owner,
    runner,
    ball,
    { x: 57, z: 34 },
    1,
    0.8,
    9,
    defenders,
    50,
  );
  assert.ok(
    finalThirdThroughValue > 0.05,
    `a legal final-third channel behind a stretched line should reward the killer pass: ${finalThirdThroughValue}`,
  );
  const recyclingValue = tacticalDecisionValue(
    { style: 'possession' },
    { phase: 'midfield', fastBreak: false },
    { intent: 'feet' },
    owner,
    owner,
    ball,
    { x: 44, z: 18 },
    1,
    0.8,
    9,
    defenders,
    50,
  );
  assert.ok(recyclingValue > 0.001, `a safe central outlet should reward circulation: ${recyclingValue}`);
  assert.equal(
    tacticalDecisionValue(
      { style: 'possession' },
      { phase: 'midfield', fastBreak: true },
      { intent: 'feet' },
      owner,
      owner,
      ball,
      { x: 44, z: 18 },
      1,
      0.8,
      9,
      defenders,
      50,
    ),
    0,
    'circulation bonus should yield during a real counter window',
  );
  const closedLaneValue = tacticalDecisionValue(
      { style: 'possession' },
      { phase: 'midfield', fastBreak: false },
      { intent: 'through' },
      owner,
      runner,
      ball,
      { x: 57, z: 34 },
      1,
      0.8,
      9,
      defenders.map((a) => ({ ...a, pos: { x: 50, z: a.pos.z } })),
      50,
    );
  assert.ok(
    closedLaneValue < 0,
    `a settled possession side should prefer circulation over a closed through lane: ${closedLaneValue}`,
  );
  const onsideButNotBehindValue = tacticalDecisionValue(
    { style: 'possession' },
    { phase: 'midfield', fastBreak: false },
    { intent: 'through' },
    owner,
    runner,
    ball,
    { x: 50.3, z: 34 },
    1,
    0.8,
    9,
    defenders.map((a) => ({ ...a, pos: { x: 50, z: a.pos.z } })),
    50,
  );
  assert.ok(
    onsideButNotBehindValue < 0,
    'a forward pass that does not put the runner behind the line should favor circulation',
  );
});

test('counter block protects central width and counter runners receive a forward over-the-top option', () => {
  const actors = team('4-3-3'),
    defender = actors.find((a) => a.positionRole === 'fullback' && a.anchor.z < 34),
    ball = { x: 60, z: 8 };
  const normal = blockPosition(defender, ball, 1, { style: 'balanced', press: 'normal' }),
    counter = blockPosition(defender, ball, 1, { style: 'counter', press: 'normal' }),
    possessionResponse = blockPosition(
      defender,
      ball,
      1,
      { style: 'balanced', press: 'normal' },
      'possession',
    );
  assert.ok(Math.abs(counter.z - 34) < Math.abs(normal.z - 34));
  assert.ok(Math.abs(possessionResponse.z - 34) > Math.abs(normal.z - 34));
  const expectedPossessionZ = Math.max(
    5,
    Math.min(63, 34 + (defender.anchor.z - 34) * 0.78 + (ball.z - 34) * 0.65),
  );
  assert.ok(Math.abs(possessionResponse.z - expectedPossessionZ) < 1e-12);

  const side = team('4-3-3'),
    owner = side.find((a) => a.positionRole === 'centralMid'),
    runner = side.find((a) => a.positionRole === 'striker'),
    opposition = team('4-3-3').map((a) => ({ ...a, side: 1 }));
  for (const teammate of side) if (teammate !== owner && teammate !== runner) teammate.sentOff = true;
  owner.pos = { x: 30, z: 34 };
  owner.velocity = { x: 0, z: 0 };
  owner.player.attributes.passing = 98;
  owner.player.attributes.vision = 98;
  owner.player.attributes.decisions = 98;
  owner.player.attributes.dribbling = 35;
  runner.pos = { x: 52, z: 34 };
  runner.velocity = { x: 5, z: 0 };
  runner.player.attributes.offTheBall = 98;
  runner.player.attributes.sprintSpeed = 98;
  opposition.forEach((a) => {
    a.pos = a.isKeeper
      ? { x: 101, z: 34 }
      : a.player.role === 'DEF'
        ? {
            x: 65,
            z:
              a.positionRole === 'centreBack'
                ? a.anchor.z < 34
                  ? 12
                  : 56
                : a.anchor.z < 34
                  ? 5
                  : 63,
          }
        : { x: 25, z: 12 + a.index * 4 };
  });
  const action = chooseAction(
    owner,
    [...side, ...opposition],
    { x: 30, y: 0.11, z: 34, vx: 0, vz: 0 },
    1,
    { style: 'counter', press: 'normal' },
    random(991),
    { time: 10, continuity: { side: 0, regainedAt: 9 } },
  );
  assert.equal(action.type, 'pass');
  assert.equal(action.intent, 'through');
  assert.ok(action.destination.x > 65, `counter pass should lead behind the high line: ${action.destination.x}`);
  assert.ok(action.y > 0.5, 'the pacey runner should be offered the deeper lofted option');
  runner.player.attributes.acceleration = 35;
  runner.player.attributes.sprintSpeed = 35;
  const selectedProfiles = { ground: 0, lofted: 0 };
  for (let seed = 991; seed < 1031; seed++) {
    const choice = chooseAction(
      owner,
      [...side, ...opposition],
      { x: 30, y: 0.11, z: 34, vx: 0, vz: 0 },
      1,
      { style: 'counter', press: 'normal' },
      random(seed),
      { time: 10, continuity: { side: 0, regainedAt: 9 } },
    );
    if (choice.type === 'pass' && choice.intent === 'through')
      selectedProfiles[choice.y > 0.5 ? 'lofted' : 'ground']++;
  }
  assert.ok(
    selectedProfiles.ground > 0,
    `a slower runner should favor the shorter grounded option: ${JSON.stringify(selectedProfiles)}`,
  );
});

test('counter runners vary their legal line-breaking depth with movement and reading ability', () => {
  const actors = team('4-3-3'),
    owner = actors.find((a) => a.positionRole === 'centralMid'),
    runner = actors.find((a) => a.positionRole === 'striker'),
    opposition = team('4-3-3').map((a) => ({ ...a, side: 1 })),
    ball = { x: 30, z: 34 };
  owner.pos = { ...ball };
  runner.player.attributes.offTheBall = 98;
  runner.player.attributes.decisions = 98;
  runner.player.attributes.acceleration = 98;
  runner.player.attributes.sprintSpeed = 98;
  opposition.forEach((a) => {
    a.pos = a.isKeeper
      ? { x: 101, z: 34 }
      : a.player.role === 'DEF'
        ? { x: 65, z: a.anchor.z }
        : { x: 25, z: a.anchor.z };
  });
  const highReadiness = attackAssignments(
    [...actors, ...opposition],
    ball,
    owner,
    null,
    1,
    { style: 'counter' },
    10,
    { side: 0, regainedAt: 9 },
  );
  assert.equal(highReadiness.fastBreak, true);
  assert.equal(highReadiness.assignments[runner.player.id].duty, 'break');
  assert.ok(highReadiness.assignments[runner.player.id].x <= 65);
  const highTarget = highReadiness.assignments[runner.player.id].x;
  for (const key of ['offTheBall', 'decisions', 'acceleration', 'sprintSpeed'])
    runner.player.attributes[key] = 35;
  const lowReadiness = attackAssignments(
    [...actors, ...opposition],
    ball,
    owner,
    null,
    1,
    { style: 'counter' },
    10,
    { side: 0, regainedAt: 9 },
  );
  assert.ok(lowReadiness.assignments[runner.player.id].x < highTarget);
  assert.ok(lowReadiness.assignments[runner.player.id].x <= 65);
});

test('counter through-ball value rewards both a capable runner and a passer who reads space', () => {
  const actors = team('4-3-3'),
    passer = actors.find((a) => a.positionRole === 'centralMid'),
    runner = actors.find((a) => a.positionRole === 'striker'),
    opponents = team('4-3-3').map((a) => ({
      ...a,
      side: 1,
      pos: a.isKeeper ? { x: 101, z: 34 } : { x: 68, z: a.anchor.z },
    })),
    ball = { x: 50, z: 34 },
    target = { x: 82, z: 34 },
    value = (counterRun) =>
      tacticalDecisionValue(
        { style: 'counter' },
        { phase: 'counter', fastBreak: true },
        { intent: 'through', counterRun },
        passer,
        runner,
        ball,
        target,
        1,
        0.8,
        8,
        opponents,
        68,
      );
  const ordinaryGroundValue = value('ground'),
    ordinaryLoftedValue = value('lofted');
  for (const key of ['offTheBall', 'decisions', 'acceleration', 'sprintSpeed'])
    runner.player.attributes[key] = 98;
  const strongRunnerGroundValue = value('ground'),
    strongRunnerLoftedValue = value('lofted');
  for (const key of ['vision', 'passing', 'decisions']) passer.player.attributes[key] = 98;
  assert.ok(strongRunnerGroundValue > ordinaryGroundValue);
  assert.ok(strongRunnerLoftedValue > ordinaryLoftedValue);
  assert.ok(value('ground') > strongRunnerGroundValue);
  assert.ok(value('lofted') > strongRunnerLoftedValue);
});

test('counter breaks keep ground and lofted through runs available alongside flank deliveries', () => {
  const side = team('4-3-3'),
    owner = side.find((a) => a.positionRole === 'centralMid'),
    runner = side.find((a) => a.positionRole === 'winger' && a.anchor.z < 34),
    opposition = team('4-3-3').map((a) => ({ ...a, side: 1 })),
    ball = { x: 68, y: 0.11, z: 15, vx: 0, vz: 0 };
  for (const teammate of side) if (teammate !== owner && teammate !== runner) teammate.sentOff = true;
  owner.pos = { x: ball.x, z: ball.z };
  owner.velocity = { x: 0, z: 0 };
  for (const key of ['passing', 'vision', 'decisions']) owner.player.attributes[key] = 98;
  runner.pos = { x: 78, z: 16 };
  runner.velocity = { x: 2, z: 0 };
  for (const key of ['offTheBall', 'decisions', 'acceleration', 'sprintSpeed'])
    runner.player.attributes[key] = 98;
  opposition.forEach((a) => {
    a.pos = a.isKeeper
      ? { x: 101, z: 34 }
      : ['centreBack', 'fullback'].includes(a.positionRole)
        ? { x: 85, z: a.anchor.z }
        : { x: 50, z: a.anchor.z };
  });
  assert.ok(deliveryOptions(owner, runner, ball, 1).length > 0);
  let throughAttempts = 0;
  for (let seed = 60; seed < 100; seed++) {
    const action = chooseAction(
      owner,
      [...side, ...opposition],
      ball,
      1,
      { style: 'counter', press: 'normal' },
      random(seed),
      { time: 10, continuity: { side: 0, regainedAt: 9 } },
    );
    if (action.type === 'pass' && action.intent === 'through') throughAttempts++;
  }
  assert.ok(throughAttempts > 0, 'a flank delivery must not suppress the available legal break run');
});

test('possession finds an onside striker run beyond a stretched defensive line', () => {
  const side = team('4-3-3'),
    owner = side.find((a) => a.positionRole === 'centralMid'),
    runner = side.find((a) => a.positionRole === 'striker'),
    opposition = team('4-3-3').map((a) => ({ ...a, side: 1 }));
  for (const teammate of side) if (teammate !== owner && teammate !== runner) teammate.sentOff = true;
  owner.pos = { x: 40, z: 34 };
  owner.velocity = { x: 0, z: 0 };
  owner.player.attributes.passing = 98;
  owner.player.attributes.vision = 98;
  owner.player.attributes.decisions = 98;
  owner.player.attributes.dribbling = 35;
  runner.pos = { x: 49.4, z: 34 };
  runner.velocity = { x: 0, z: 0 };
  runner.player.attributes.offTheBall = 98;
  runner.player.attributes.sprintSpeed = 90;
  opposition.forEach((a) => {
    a.pos = a.isKeeper
      ? { x: 101, z: 34 }
      : ['centreBack', 'fullback'].includes(a.positionRole)
        ? { x: 50, z: a.anchor.z }
        : { x: 35, z: a.anchor.z };
  });
  const action = chooseAction(
    owner,
    [...side, ...opposition],
    { x: 40, y: 0.11, z: 34, vx: 0, vz: 0 },
    1,
    { style: 'possession', press: 'normal' },
    random(3121),
    { time: 40, continuity: {} },
  );
  assert.equal(action.type, 'pass');
  assert.equal(action.intent, 'through');
  assert.ok(action.destination.x > 50, `possession pass should split the line: ${action.destination.x}`);
});

test('wide wingers get a skill-sensitive inside-carry route and striker-focused delivery value', () => {
  const actors = team('4-3-3'),
    winger = actors.find((a) => a.positionRole === 'winger' && a.anchor.z < 34),
    striker = actors.find((a) => a.positionRole === 'striker');
  winger.pos = { x: 76, z: 10 };
  const routes = carryOptions(
    winger,
    { x: 76, y: 0.11, z: 10 },
    1,
    [],
    { value: 70 },
    { inclination: 0 },
    10,
    { style: 'wide' },
  );
  assert.ok(routes.some((route) => route.destination.z >= 20 && route.destination.z <= 29));
  const opponents = team('4-3-3').map((a) => ({ ...a, side: 1, pos: { x: 91, z: 45 } }));
  const wideCross = tacticalDecisionValue(
    { style: 'wide' },
    { phase: 'finalThird', fastBreak: false },
    { intent: 'cross', delivery: 'lofted', lob: true },
    winger,
    striker,
    { x: 83, z: 8 },
    { x: 92, z: 32 },
    1,
    0.75,
    8,
    opponents,
    90,
  );
  const balancedCross = tacticalDecisionValue(
    { style: 'balanced' },
    { phase: 'finalThird', fastBreak: false },
    { intent: 'cross', delivery: 'lofted', lob: true },
    winger,
    striker,
    { x: 83, z: 8 },
    { x: 92, z: 32 },
    1,
    0.75,
    8,
    opponents,
    90,
  );
  assert.ok(wideCross > balancedCross);
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
