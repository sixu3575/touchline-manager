import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attributionState,
  attributeTouch,
  startAttempt,
  recordIntervention,
  finishAttempt,
  goalCredit,
  receptionSource,
  originalRecipientReachable,
} from '../../packages/shared/modules/matches/attribution.mjs';
import {
  createPhysics,
  projectedGoal,
  stepPhysics,
  goalCrossing,
} from '../../packages/shared/modules/matches/physics.mjs';
import { restorePhysics } from '../../packages/shared/modules/matches/physics.mjs';
import { packActors, unpackActors } from '../../packages/shared/modules/matches/checkpoint.mjs';
import { createGame } from '../../packages/shared/game.mjs';
import { createMatchSimulation } from '../../packages/shared/modules/matches/index.mjs';
const striker = { id: 'striker', side: 0 },
  defender = { id: 'defender', side: 1 },
  keeper = { id: 'keeper', side: 1, isKeeper: true };
const source = {
  passerId: 'creator',
  receiverId: 'striker',
  assistEligible: true,
  keyPassEligible: true,
};

test('an on-target shot remains the striker goal through keeper or defender touches, with no save or own goal', () => {
  for (const intervenor of [keeper, defender]) {
    const s = attributionState();
    startAttempt(s, striker, source);
    recordIntervention(s, intervenor, 0);
    attributeTouch(s, intervenor, 0);
    assert.deepEqual(goalCredit(s, 0), { playerId: 'striker', ownGoalId: null });
    const result = finishAttempt(s, 'striker');
    assert.equal(result.assistId, 'creator');
    assert.equal(result.outcome, 'goal');
    assert.equal(result.keeper, undefined);
    assert.equal(result.keyPassId, undefined, 'a converted pass is an assist, not also a key pass');
  }
});

test('an off-target effort diverted in is an own goal; a subsequent keeper touch preserves the responsible defender', () => {
  const s = attributionState();
  startAttempt(s, striker, source);
  attributeTouch(s, defender, null);
  attributeTouch(s, keeper, 0);
  assert.deepEqual(goalCredit(s, 0), { playerId: null, ownGoalId: 'defender' });
  assert.equal(finishAttempt(s).assistId, undefined);
  attributeTouch(s, keeper, null, true);
  assert.deepEqual(
    goalCredit(s, 0),
    { playerId: null, ownGoalId: 'keeper' },
    'a new deliberate keeper play has its own responsibility',
  );
});

test('a saved or woodwork rebound does not reuse the original pass as an assist on a follow-up attempt', () => {
  const s = attributionState();
  startAttempt(s, striker, source);
  recordIntervention(s, keeper, 0);
  const first = finishAttempt(s);
  assert.equal(first.outcome, 'saved');
  assert.equal(first.keyPassId, 'creator');
  assert.equal(first.keeper.id, 'keeper');
  startAttempt(s, striker);
  assert.equal(finishAttempt(s, 'striker').assistId, undefined);
  startAttempt(s, striker, source);
  s.attempt.woodwork = true;
  assert.equal(finishAttempt(s).onTarget, false);
});

test('deflected assists retain only a reachable original recipient; defensive intervention excludes key-pass credit', () => {
  const pass = {
    actor: { player: { id: 'creator' } },
    receiverId: 'striker',
    target: { x: 90, z: 34 },
  };
  const position = { x: 70, z: 34 },
    velocity = { x: 15, z: 0 };
  assert.equal(originalRecipientReachable(pass, position, velocity), true);
  assert.equal(originalRecipientReachable(pass, position, { x: 0, z: 15 }), false);
  pass.deflected = true;
  pass.originalReachable = true;
  assert.deepEqual(receptionSource(pass, 'striker'), { ...source, keyPassEligible: false });
  assert.equal(receptionSource(pass, 'other').assistEligible, false);
  pass.originalReachable = false;
  assert.equal(receptionSource(pass, 'striker').assistEligible, false);
});

test('last-line blocks and actual keeper saves count on target once; routine handling of a wide ball does not', () => {
  for (const [actor, incoming, lastLine, expected] of [
    [defender, 0, true, true],
    [defender, 0, false, false],
    [keeper, 0, false, true],
    [keeper, null, false, false],
  ]) {
    const s = attributionState();
    startAttempt(s, striker);
    recordIntervention(s, actor, incoming, lastLine);
    assert.equal(finishAttempt(s).onTarget, expected);
    assert.equal(finishAttempt(s), null, 'one shot may only be resolved once');
  }
});

test('a keeper touch that leaves the ball goal-bound is not a save when a defender later stops it', () => {
  const s = attributionState();
  startAttempt(s, striker);
  recordIntervention(s, keeper, 0, false, 0);
  recordIntervention(s, defender, 0, true, null);
  const outcome = finishAttempt(s);
  assert.equal(outcome.keeper, undefined);
  assert.equal(outcome.outcome, 'blocked');
  assert.equal(outcome.onTarget, true);
});

test('independent Rapier projection distinguishes target, wide, high, short and both goal directions without changing the match world', () => {
  const p = createPhysics();
  try {
    const snapshot = p.world.takeSnapshot();
    const cases = [
      [{ x: 95, y: 0.3, z: 34 }, { x: 20, y: 1, z: 0 }, 1],
      [{ x: 10, y: 0.3, z: 34 }, { x: -20, y: 1, z: 0 }, 0],
      [{ x: 95, y: 0.3, z: 40 }, { x: 20, y: 1, z: 0 }, null],
      [{ x: 95, y: 4, z: 34 }, { x: 20, y: 3, z: 0 }, null],
      [{ x: 80, y: 0.11, z: 34 }, { x: 1, y: 0, z: 0 }, null],
    ];
    for (const [position, velocity, expected] of cases) {
      assert.equal(projectedGoal({ position, velocity }), expected);
      assert.equal(
        projectedGoal({ position, velocity }),
        expected,
        'projection resets all shadow solver state',
      );
    }
    assert.deepEqual(p.world.takeSnapshot(), snapshot);
  } finally {
    p.world.free();
  }
});

test('projection agrees with actual player-free motion for post/bar shots and free bounces', () => {
  for (const z of [30.34, 30.5, 34, 37.5, 37.66]) {
    const p = createPhysics();
    const position = { x: 94, y: 0.3, z },
      velocity = { x: 20, y: 1, z: 0 };
    try {
      const expected = projectedGoal({ position, velocity });
      p.ball.setTranslation(position, true);
      p.ball.setLinvel(velocity, true);
      let actual = null;
      for (let i = 0; i < 400; i++) {
        const before = p.ball.translation();
        stepPhysics(p);
        const after = p.ball.translation();
        actual = goalCrossing(before, after);
        if (actual !== null || after.x < -0.5 || after.x > 105.5 || after.z < 0 || after.z > 68)
          break;
      }
      assert.equal(actual, expected, `post trajectory z=${z}`);
    } finally {
      p.world.free();
    }
  }
});

function physicalScenario(direction, offset = null) {
  const g = createGame('归属回归', 42),
    args = [g.clubs[0], g.clubs[1], 42, 'attribution-probe'];
  let engine = createMatchSimulation(...args, {
    durationSeconds: 30,
    sliceSeconds: 1,
    durable: true,
  });
  const c = structuredClone(engine.next().value.checkpoint);
  engine.return();
  const p = restorePhysics(c.physics),
    actors = unpackActors(c.actors, p);
  const attacker = actors.find((a) => a.side === 0 && a.player.role === 'FWD');
  const creator = actors.find((a) => a.side === 0 && a.player.role === 'MID');
  const goalkeeper = actors.find((a) => a.side === 1 && a.isKeeper);
  const mirror = (x) => (direction === 1 ? x : 105 - x);
  c.state.half = direction === 1 ? 0 : 1;
  for (const a of actors) {
    a.pos = { x: 20 + (a.index % 11) * 3, z: a.side ? 4 : 64 };
    a.velocity = { x: 0, z: 0 };
    a.target = { ...a.pos };
    a.intent = null;
    a.setPiece = null;
    a.cooldown = 100;
    a.nextDecision = 100;
    a.body.setTranslation({ ...a.pos, y: a.height / 2 }, true);
    a.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    a.body.setEnabled(true);
  }
  c.state.time = 21;
  c.tick = 420;
  c.state.restartUntil = 0;
  c.state.restartTaker = null;
  c.state.deadState = null;
  c.state.goalRestart = null;
  c.state.owner = null;
  c.state.offside = null;
  c.state.restartPlay = null;
  c.state.deliberate = null;
  c.state.pendingPass = null;
  c.state.statisticalContacts = [];
  c.continuity.controller = null;
  c.continuity.side = 0;
  c.continuity.phase = 'flight';
  c.score = [0, 0];
  c.events = [];
  c.timeline = [];
  c.state.lastPass = {
    actor: creator.index,
    receiver: attacker.index,
    time: 1,
    source: { ...source, passerId: creator.player.id, receiverId: attacker.player.id },
  };
  c.state.lastTouch = creator.index;
  c.state.attribution = attributionState();
  if (offset === null) {
    attacker.body.setEnabled(true);
    attacker.cooldown = 0;
    attacker.pos = { x: mirror(94), z: 34 };
    attacker.target = { ...attacker.pos };
    attacker.body.setTranslation({ ...attacker.pos, y: attacker.height / 2 }, true);
    for (const k in attacker.player.attributes) attacker.player.attributes[k] = 95;
    p.ball.setTranslation({ x: mirror(94), y: attacker.height - 0.1, z: 34 }, true);
    p.ball.setLinvel({ x: direction * 4, y: 0, z: 0 }, true);
  } else {
    goalkeeper.body.setEnabled(true);
    goalkeeper.pos = { x: mirror(104), z: 34 + offset };
    goalkeeper.target = { ...goalkeeper.pos };
    goalkeeper.body.setTranslation({ ...goalkeeper.pos, y: goalkeeper.height / 2 }, true);
    // Isolate statistical credit from the goalkeeper's changing navigation AI.
    // The ball and capsule still undergo a real Rapier contact/deflection.
    goalkeeper.body.setEnabledTranslations(false, false, false, true);
    p.ball.setTranslation({ x: mirror(102), y: 0.12, z: 34 }, true);
    p.ball.setLinvel({ x: direction * 10, y: 0, z: 0 }, true);
    const details = startAttempt(
      c.state.attribution,
      { id: attacker.player.id, side: 0 },
      c.state.lastPass.source,
    );
    c.events.push({
      type: 'shot',
      second: 21,
      minute: 0,
      side: 0,
      playerId: attacker.player.id,
      ...details,
    });
    c.stats[0].shots++;
    c.state.lastPass = null;
  }
  p.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
  c.actors = packActors(actors);
  c.physics.world = p.world.takeSnapshot();
  p.world.free();
  engine = createMatchSimulation(...args, {
    durationSeconds: 30,
    sliceSeconds: 1,
    durable: true,
    checkpoint: c,
  });
  let part;
  do {
    part = engine.next();
  } while (!part.done);
  engine.return();
  return { report: part.value, attacker, creator, goalkeeper };
}

test('real simulation retains an assist after twenty seconds of uninterrupted possession and on a headed goal', () => {
  for (const direction of [-1, 1]) {
    const { report, attacker, creator } = physicalScenario(direction);
    const goal = report.events.find((e) => e.type === 'goal' && !e.ownGoal);
    assert.ok(goal, JSON.stringify(report.events));
    assert.equal(goal.playerId, attacker.player.id);
    assert.equal(goal.assistId, creator.player.id);
    assert.ok(report.events.some((e) => e.type === 'shot' && e.bodyPart === 'head'));
    assert.equal(
      report.events.filter((e) => e.type === 'shotOutcome' && e.outcome === 'goal').length,
      1,
    );
  }
});

test('actual keeper body deflections into the net do not turn on-target shots into own goals', () => {
  for (const direction of [-1, 1]) {
    let touchedGoal = false;
    const diagnostics = [];
    for (const offset of [0.18, 0.22, 0.26, 0.3, 0.36, 0.38, 0.4, 0.42, 0.43]) {
      const { report, attacker, goalkeeper } = physicalScenario(direction, offset);
      const goal = report.events.find((e) => e.type === 'goal');
      const outcome = report.events.find(
        (e) => e.type === 'shotOutcome' && e.deflectedBy.includes(goalkeeper.player.id),
      );
      diagnostics.push({
        offset,
        score: report.score,
        outcomes: report.events.filter((e) => e.type === 'shotOutcome'),
        frames: [6, 7, 8].map((n) => ({
          keeper: [
            ...report.trajectory.slice(
              n * 49 + goalkeeper.index * 2,
              n * 49 + goalkeeper.index * 2 + 2,
            ),
          ],
          ball: [...report.trajectory.slice(n * 49 + 44, n * 49 + 47)],
        })),
      });
      if (!goal || !outcome) continue;
      touchedGoal = true;
      assert.equal(goal.ownGoal, undefined);
      assert.equal(goal.playerId, attacker.player.id);
      assert.equal(report.stats[1].saves, 0);
      break;
    }
    assert.ok(
      touchedGoal,
      `a real body deflection and goal must occur for direction ${direction}: ${JSON.stringify(diagnostics)}`,
    );
  }
});
