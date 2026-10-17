import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../packages/shared/game.mjs';
import { createCompetitionPlan, settleCompetition } from '../packages/shared/modules/competitions/index.mjs';

test('fixture order has frozen independent inputs and settlement rejects partial rounds', () => {
  const g = createGame('任务计划', 42),
    before = structuredClone(g),
    plan = createCompetitionPlan(g, 'advance');
  assert.deepEqual(g, before);
  assert.ok(plan.order[0].homeId === 'me' || plan.order[0].awayId === 'me');
  assert.deepEqual(
    new Set(plan.order.map((f) => f.seed)),
    new Set(plan.fixtures.map((f) => f.seed)),
  );
  assert.throws(() => settleCompetition(plan, []), /不完整/);
});
