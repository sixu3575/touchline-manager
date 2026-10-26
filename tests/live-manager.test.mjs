import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replayPlayersAt } from '../packages/client/src/modules/matches/player-slots.mjs';

test('live roster summary applies tactical-role and substitute identities only after their match events', () => {
  const players = [
    { id: 'starter', side: 0, number: 9, name: '首发前锋', role: 'FWD', positionRole: 'striker' },
    { id: 'rival', side: 1, number: 4, name: '对方后卫', role: 'DEF', positionRole: 'centreBack' },
  ];
  const events = [
    {
      type: 'tacticalChange',
      side: 0,
      second: 12,
      minute: 0,
      assignments: [{ slotIndex: 0, role: 'MID', positionRole: 'centralMid' }],
    },
    {
      type: 'substitution',
      side: 0,
      second: 20,
      minute: 0,
      slotIndex: 0,
      incoming: {
        id: 'sub',
        number: 18,
        name: '替补中场',
        role: 'MID',
        tacticalRole: 'MID',
        positionRole: 'centralMid',
        overview: [{ key: 'passing', label: '传球', value: 81 }],
      },
    },
  ];
  assert.equal(replayPlayersAt(players, events, 10)[0].id, 'starter');
  assert.equal(replayPlayersAt(players, events, 15)[0].positionRole, 'centralMid');
  const afterSubstitution = replayPlayersAt(players, events, 21)[0];
  assert.equal(afterSubstitution.id, 'sub');
  assert.equal(afterSubstitution.overview[0].value, 81);
});
