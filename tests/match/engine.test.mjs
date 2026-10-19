import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeComparison } from '../tools/match-realism.mjs';
import {
  createGame,
  applyAction,
  simulate,
  schedule,
  validateLineup,
  standings,
} from '../../packages/shared/game.mjs';

test('seeded engine reproduces complete event log and keeps score consistent', () => {
  let g = createGame('测试球队', 42);
  let a = simulate(g.clubs[0], g.clubs[1], 999);
  let b = simulate(g.clubs[0], g.clubs[1], 999);
  // Reuse the complete game already required for determinism. No extra match.
  // Failed jobs retain the measurements; this is not a production match switch.
  const realism = writeComparison(
    a,
    process.env.MATCH_REALISM_OUTPUT || 'work/validation/realism/seed-999.json',
  );
  assert.deepEqual(a, b);
  for (let side = 0; side < 2; side++)
    assert.equal(
      a.score[side],
      a.events.filter((e) => e.type === 'goal' && e.side === side).length,
    );
  assert.equal(a.stats[0].possession + a.stats[1].possession, 100);
  assert.equal(a.replay.frameCount, 27001);
  assert.equal(a.replay.duration * a.replay.clockScale, 5400);
  assert.equal(a.events.find((e) => e.type === 'half').minute, 45);
  assert.equal(a.events.at(-1).minute, 90);
  assert.ok(a.performance.every((p) => p.energy >= 20 && p.energy <= 100));
  const attempts = a.events.filter((e) => e.type === 'shot');
  const outcomes = a.events.filter((e) => e.type === 'shotOutcome');
  assert.equal(new Set(attempts.map((e) => e.shotId)).size, attempts.length);
  assert.equal(outcomes.length, attempts.length, 'every actual attempt has exactly one outcome');
  assert.equal(new Set(outcomes.map((e) => e.shotId)).size, outcomes.length);
  for (const side of [0, 1]) {
    assert.equal(a.stats[side].shots, attempts.filter((e) => e.side === side).length);
    assert.equal(
      a.stats[side].onTarget,
      outcomes.filter((e) => e.side === side && e.onTarget).length,
    );
    assert.equal(
      a.stats[side].saves,
      a.events.filter((e) => e.type === 'save' && e.side === side).length,
    );
    assert.ok(a.stats[side].completedPasses <= a.stats[side].passes);
  }
  for (const goal of a.events.filter((e) => e.type === 'goal' && !e.ownGoal)) {
    const outcome = outcomes.find((e) => e.shotId === goal.shotId);
    assert.equal(outcome.outcome, 'goal');
    assert.equal(outcome.playerId, goal.playerId);
    assert.equal(outcome.keyPassId, undefined, 'a converted chance cannot also be a key pass');
    assert.equal(outcome.assistId, goal.assistId);
  }
  assert.notEqual(
    realism.status,
    'blocked',
    JSON.stringify(realism.alerts.filter((a) => a.severity === 'block')),
  );
});
