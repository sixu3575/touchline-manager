import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, simulate, applyAction } from '../../packages/shared/game.mjs';
import {
  createMatchState,
  effectiveAbility,
  mentalModifier,
  matchShock,
  energyCost,
  joinClub,
  advanceAdaptation,
} from '../../packages/shared/modules/players/index.mjs';
import {
  offsideSnapshot,
  offsideInvolvement,
  inPenaltyArea,
  foulAssessment,
  applyCard,
} from '../../packages/shared/modules/matches/rules.mjs';
import { migrateState } from '../../packages/server/src/storage/migrations.mjs';

test('physical shootouts preserve ordinary score/stats, deterministic replay and cosmetic invariance', () => {
  const g = createGame('测试', 42),
    before = structuredClone(g);
  const opts = { durationSeconds: 8, knockout: true };
  const r = simulate(g.clubs[0], g.clubs[1], 42, 'shootout', opts);
  assert.deepEqual(g, before);
  assert.ok(r.penalties);
  assert.notEqual(...r.penalties);
  for (const side of [0, 1])
    assert.equal(
      r.score[side],
      r.events.filter((e) => e.type === 'goal' && e.side === side).length,
    );
  assert.equal(
    r.penalties[0],
    r.events.filter((e) => e.type === 'penaltyGoal' && e.side === 0).length,
  );
  assert.equal(r.replay.frameCount, Math.round(r.replay.duration * 5) + 1);
  const clone = structuredClone(g);
  for (const c of clone.clubs)
    for (const p of c.players) {
      p.name = '新名字';
      p.number = 99;
      p.nationality = 'XX';
      p.wage = 1;
      p.price = 1;
      p.publicProfile.popularity = 99;
    }
  const again = simulate(clone.clubs[0], clone.clubs[1], 42, 'shootout', opts);
  assert.deepEqual(again.score, r.score);
  assert.deepEqual(again.penalties, r.penalties);
  assert.deepEqual(again.trajectory, r.trajectory);
  assert.deepEqual(again.stats, r.stats);
  assert.deepEqual(again.performance, r.performance);
  for (const e of r.events) assert.ok(Number.isFinite(e.second));
});
