import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../../packages/shared/game.mjs';
import { simulate } from '../../packages/shared/modules/matches/index.mjs';
import { tackleRecoverySeconds } from '../../packages/shared/modules/matches/defending.mjs';
import {
  CARRY_CONTROL_RECOVERY_GRACE_SECONDS,
  continuityState,
  contestOwner,
  controlBall,
  releaseControl,
  updateContinuity,
} from '../../packages/shared/modules/matches/continuity.mjs';

function actor(balance, velocity) {
  return { player: { role: 'MID', attributes: { balance } }, velocity };
}

test('tackle recovery takes time to reset and responds to balance and collision momentum', () => {
  const carrier = actor(50, { x: 0, z: 0 });
  const ordinary = tackleRecoverySeconds(actor(50, { x: 2, z: 0 }), carrier);
  const balanced = tackleRecoverySeconds(actor(90, { x: 2, z: 0 }), carrier);
  const highMomentum = tackleRecoverySeconds(actor(50, { x: 8, z: 0 }), carrier);

  assert.equal(ordinary, 3.4);
  assert.ok(balanced < ordinary, 'balance helps the player reset their footing');
  assert.ok(highMomentum > ordinary, 'a high-speed challenge takes longer to recover from');
  assert.ok(
    [ordinary, balanced, highMomentum].every((seconds) => seconds >= 2.9 && seconds <= 4.8),
  );
});

function controller(id, side, index) {
  return {
    player: { id, role: 'MID', attributes: { balance: 50 } },
    positionRole: 'centralMid',
    side,
    index,
    pos: { x: 0, z: 0 },
    velocity: { x: 0, z: 0 },
    direction: side === 0 ? 1 : -1,
    energy: 100,
    intent: null,
    sentOff: false,
  };
}

test('individual control spells record a continuous controller interval and its actual end cause', () => {
  const state = continuityState();
  const first = controller('home-mid', 0, 0);
  const teammate = controller('home-forward', 0, 1);
  const opponent = controller('away-mid', 1, 2);

  controlBall(state, first, 1, false);
  controlBall(state, first, 2, false);
  releaseControl(state, 4, 'pass');
  controlBall(state, teammate, 5, true);
  controlBall(state, opponent, 6, false, true);

  assert.deepEqual(state.metrics.controlSpells, [
    {
      side: 0,
      playerId: 'home-mid',
      role: 'centralMid',
      start: 1,
      end: 4,
      seconds: 3,
      reason: 'pass',
    },
    {
      side: 0,
      playerId: 'home-forward',
      role: 'centralMid',
      start: 5,
      end: 6,
      seconds: 1,
      reason: 'dispossessed',
    },
  ]);
});

test('individual control loss records ball separation without retaining controller authority', () => {
  const state = continuityState();
  const first = controller('home-mid', 0, 0);
  controlBall(state, first, 1, false);
  const owner = updateContinuity(
    state,
    [first],
    { x: 5, y: 0.1, z: 0, vx: 0, vz: 0 },
    2,
    true,
    null,
  );

  assert.equal(owner, null);
  assert.equal(state.controller, null);
  assert.equal(state.metrics.controlSpells[0].reason, 'looseCarry');
  assert.equal(state.metrics.controlSpells[0].looseCarryCause, 'outsideRadius');
  assert.equal(state.metrics.controlSpells[0].seconds, 1);
});

test('a recently expired carry keeps team continuity briefly without authorizing a remote touch', () => {
  const state = continuityState();
  const first = controller('home-mid', 0, 0);
  const ball = { x: 3, y: 0.1, z: 0, vx: 2, vz: 0 };
  first.intent = { kind: 'carry', mode: 'carryFast', destination: { x: 8, z: 0 }, expiresAt: 1.4 };
  controlBall(state, first, 0.5, false);
  first.intent = { kind: 'carry', mode: 'carryFast', destination: { x: 8, z: 0 }, expiresAt: 1.4 };

  const recovered = updateContinuity(state, [first], ball, 2.1, true, null);
  assert.equal(CARRY_CONTROL_RECOVERY_GRACE_SECONDS, 0.75);
  assert.equal(
    recovered,
    first,
    'the expired carry remains connected inside its short recovery window',
  );
  assert.equal(
    contestOwner(state, [first], ball, 2.1),
    null,
    'outside 2.6m, no contact permission exists',
  );

  const expired = updateContinuity(state, [first], ball, 2.2, true, null);
  assert.equal(expired, null);
  assert.equal(state.metrics.controlSpells[0].looseCarryCause, 'carryRecoveryExpired');
});

test('live stamina starts at zero and full-match control spells stay out of repeated snapshots', () => {
  const game = createGame(42);
  const report = simulate(game.clubs[0], game.clubs[1], 42, 'tempo-timeline', {
    durationSeconds: 31,
  });

  assert.ok(Array.isArray(report.continuity.controlSpells));
  assert.ok(report.timeline.length > 0);
  assert.equal(report.timeline[0].second, 0);
  assert.ok(report.timeline[0].performance.every((row) => row.burstReserve === 100));
  assert.ok(
    report.performance.every(
      (row) =>
        Number.isInteger(row.burstReserve) && row.burstReserve >= 0 && row.burstReserve <= 100,
    ),
  );
  assert.ok(report.timeline.every((row) => !('controlSpells' in row.continuity)));
});
