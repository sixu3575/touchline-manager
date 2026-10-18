import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, simulate } from '../../packages/shared/game.mjs';
import { random } from '../../packages/shared/core/index.mjs';
import { bestLineup } from '../../packages/shared/modules/tactics/index.mjs';
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
} from '../../packages/shared/modules/matches/physics.mjs';

test('a physical segment has fast passes, mostly submaximal running, and meaningful player behaviour statistics', () => {
  const g = createGame('节奏验证', 42),
    r = simulate(g.clubs[0], g.clubs[1], 2026, 'tempo', { durationSeconds: 900 });
  assert.ok(r.motion.passSpeedMean > 6 && r.motion.passSpeedMean > r.motion.playerSpeedMean * 2.5);
  assert.ok(r.motion.playerSpeedMean < 4);
  assert.ok(r.motion.sprintShare < 0.25, 'an entire team must not sprint constantly');
  assert.ok(r.performance.every((p) => p.maxSpeed < 11 && p.carryDistance >= 0));
  assert.ok(r.performance.some((p) => p.dribbleTouches > 0));
  assert.ok(r.performance.some((p) => p.throughBalls + p.longPasses > 0));
  assert.ok(new Set(r.performance.map((p) => p.style)).size >= 4);
  assert.ok(r.events.some((e) => e.decision));
});

test('a real 4-3-3 wide segment executes open-play delivery with archived positions and bounded speeds', () => {
  const g = createGame('边路验证', 42);
  g.clubs[0].tactics = { formation: '4-3-3', style: 'wide', press: 'normal' };
  g.clubs[0].lineup = bestLineup(g.clubs[0], '4-3-3');
  const r = simulate(g.clubs[0], g.clubs[1], 2026, 'wide-roles', { durationSeconds: 2700 });
  const own = r.replay.players.filter((p) => p.side === 0);
  assert.equal(own.filter((p) => p.positionRole === 'winger').length, 2);
  assert.equal(own.filter((p) => p.positionRole === 'holdingMid').length, 1);
  assert.ok(
    r.events.some(
      (e) =>
        e.side === 0 &&
        e.type === 'cross' &&
        !e.setPiece &&
        ['lofted', 'low', 'cutback'].includes(e.delivery),
    ),
  );
  assert.ok(r.events.some((e) => e.side === 0 && e.phase === 'finalThird' && e.decision));
  assert.ok(r.performance.every((p) => p.maxSpeed < 11 && p.positionRole));
  assert.ok(r.motion.passSpeedMean > r.motion.playerSpeedMean * 2.5);
});
