import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, simulate, random } from '../../packages/shared/game.mjs';
import { createMatchSimulation } from '../../packages/shared/modules/matches/index.mjs';
import {
  createCompetitionPlan,
  settleCompetition,
} from '../../packages/shared/modules/competitions/index.mjs';
import {
  createPhysics,
  createBody,
  orientFoot,
  touchesBall,
  kick,
  stepPhysics,
} from '../../packages/shared/modules/matches/physics.mjs';
import { firstTouchVelocity } from '../../packages/shared/modules/matches/receiving.mjs';
import { passSpeed } from '../../packages/shared/modules/matches/decisions.mjs';
import {
  contestOwner,
  continuityState,
  controlBall,
  releaseControl,
  updateContinuity,
} from '../../packages/shared/modules/matches/continuity.mjs';

test('finite first touches control at least 95 of 100 unopposed medium-quality 10m passes', () => {
  let controlled = 0;
  for (let seed = 0; seed < 100; seed++) {
    const physics = createPhysics(),
      rng = random(seed),
      a = { ...createBody(physics, 180, 50, 50.65, 34), velocity: { x: 0, z: 0 }, direction: 1 };
    try {
      physics.ball.setTranslation({ x: 40.65, y: 0.12, z: 34 }, true);
      physics.ball.setLinvel({ x: passSpeed(10, 50), y: 0.04, z: (rng() - 0.5) * 0.35 }, true);
      let contact = false;
      for (let tick = 0; tick < 80; tick++) {
        orientFoot(a, physics.ball.translation());
        if (touchesBall(physics, a.foot)) {
          const b = physics.ball.translation(),
            v = physics.ball.linvel();
          contact = kick(physics, a, firstTouchVelocity(a, b, 1, 50, Math.hypot(v.x, v.z), rng));
          break;
        }
        stepPhysics(physics);
      }
      if (contact) {
        for (let tick = 0; tick < 20; tick++) stepPhysics(physics);
        const b = physics.ball.translation();
        if (
          Math.hypot(b.x - 50.65, b.z - 34) < 2.6 &&
          Math.hypot(physics.ball.linvel().x, physics.ball.linvel().z) < 2
        )
          controlled++;
      }
    } finally {
      physics.world.free();
    }
  }
  assert.ok(controlled >= 95, `controlled ${controlled}/100`);
  assert.ok(
    passSpeed(10, 50) < passSpeed(30, 50),
    'short passes have a different arrival requirement',
  );
});

test('controller survives a brief independent carry but never gives remote contact', () => {
  const s = continuityState(),
    a = {
      index: 0,
      side: 0,
      player: { id: 'controller', role: 'MID' },
      pos: { x: 50, z: 34 },
      direction: 1,
    };
  controlBall(s, a, 0, null);
  assert.equal(updateContinuity(s, [a], { x: 52, z: 34, y: 0.11 }, 0.5, true, null), a);
  assert.equal(updateContinuity(s, [a], { x: 53, z: 34, y: 0.11 }, 0.6, true, null), null);
  assert.equal(s.controller, null);
});

test('a dropped grounded carry remains challengeable only while the last carrier can reach it', () => {
  const s = continuityState(),
    carrier = {
      index: 0,
      side: 0,
      player: { id: 'carrier', role: 'MID' },
      pos: { x: 50, z: 34 },
      velocity: { x: 1.8, z: 0 },
      intent: { kind: 'carry', mode: 'carry', expiresAt: 0.5 },
      direction: 1,
    },
    ball = { x: 52.13, z: 34, y: 0.11, vx: 1.8, vz: 0 };
  controlBall(s, carrier, 0, null);
  assert.equal(updateContinuity(s, [carrier], ball, 1.6, true, null), null);
  assert.equal(s.controller, null, 'contest memory does not preserve controller authority');
  assert.equal(contestOwner(s, [carrier], ball, 1.7), carrier);
  assert.equal(contestOwner(s, [carrier], ball, 2.71), null, 'challenge memory expires');
  carrier.pos = { x: 48, z: 34 };
  assert.equal(contestOwner(s, [carrier], ball, 2), null, 'a distant carrier cannot contest remotely');
});

test('loose-ball recovery preserves a live phase briefly but stale team memory cannot create a turnover', () => {
  const s = continuityState(),
    carrier = {
      index: 0,
      side: 0,
      player: { id: 'carrier', role: 'MID' },
      pos: { x: 40, z: 34 },
      direction: 1,
    },
    defender = {
      index: 1,
      side: 1,
      player: { id: 'defender', role: 'MID' },
      pos: { x: 60, z: 34 },
      direction: -1,
    },
    teammate = {
      index: 2,
      side: 0,
      player: { id: 'teammate', role: 'MID' },
      pos: { x: 59, z: 34 },
      direction: 1,
    };
  controlBall(s, carrier, 0, null);
  releaseControl(s, 0, 'shot');
  controlBall(s, teammate, 1.5, null);
  assert.equal(s.possessionAt, 0, 'a same-team rebound remains part of the same possession');
  assert.equal(s.metrics.possessions.length, 0);
  releaseControl(s, 1.6, 'shot');
  updateContinuity(s, [carrier, defender, teammate], { x: 60, z: 34, y: 0.11 }, 4.55, true, null);
  assert.equal(s.possessionAt, 0, 'loose recovery stays open until its bounded window expires');
  updateContinuity(s, [carrier, defender, teammate], { x: 60, z: 34, y: 0.11 }, 4.7, true, null);
  assert.equal(s.possessionAt, null);
  assert.equal(s.lastTeam, null);
  controlBall(s, defender, 4.8, null);
  assert.equal(s.metrics.turnovers.dispossessed, 0, 'new control after neutral play is not a turnover');
  assert.equal(s.possessionAt, 4.8);
});

test('an opponent gaining actual control inside the live recovery window ends the possession', () => {
  const s = continuityState(),
    carrier = {
      index: 0,
      side: 0,
      player: { id: 'carrier', role: 'MID' },
      pos: { x: 40, z: 34 },
      direction: 1,
    },
    defender = {
      index: 1,
      side: 1,
      player: { id: 'defender', role: 'MID' },
      pos: { x: 41, z: 34 },
      direction: -1,
    };
  controlBall(s, carrier, 0, null);
  releaseControl(s, 0, 'pass');
  controlBall(s, defender, 1, null, true);
  assert.equal(s.metrics.turnovers.interception, 1);
  assert.equal(s.metrics.possessions[0].reason, 'interception');
  assert.equal(s.side, defender.side);
});
