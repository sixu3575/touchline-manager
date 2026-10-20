import test from 'node:test';
import assert from 'node:assert/strict';
import { referenceMatch } from './tools/real-football-reference.mjs';

test('real reference uses provider possessions and regulation periods, not opposing pressure as a turnover', () => {
  const e = (type, second, changes = {}) => ({
    type: { name: type },
    timestamp: `00:00:${String(second).padStart(2, '0')}.000`,
    period: 1,
    possession: 1,
    team: { id: 1 },
    possession_team: { id: 1 },
    ...changes,
  });
  const result = referenceMatch([
    e('Half Start', 0),
    e('Pass', 2, { duration: 1, pass: {} }),
    e('Pressure', 3, { team: { id: 2 } }),
    e('Carry', 4, { duration: 2 }),
    e('Pass', 7, { duration: 1, pass: {} }),
    e('Pass', 9, {
      possession: 2,
      team: { id: 2 },
      possession_team: { id: 2 },
      duration: 1,
      pass: { outcome: { name: 'Incomplete' } },
    }),
    e('Half End', 12),
    e('Shot', 3, { period: 3, shot: { outcome: { name: 'Goal' } } }),
  ]);
  assert.equal(result.possessionCount, 2);
  assert.equal(result.passes, 3);
  assert.deepEqual(result.positiveChains, [2]);
  assert.equal(result.phaseSeconds, 7);
  assert.equal(result.durationSeconds, 12);
  assert.equal(result.shots, 0, 'extra time is excluded');
});
