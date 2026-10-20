import assert from 'node:assert/strict';
import test from 'node:test';
import { staminaAtTime } from '../../packages/client/src/modules/matches/stamina-view.mjs';

const report = {
  snapshots: [{ players: [{ id: 'p1', fitness: 96 }] }, { players: [{ id: 'p2', fitness: 90 }] }],
  timeline: [
    {
      second: 30,
      performance: [
        { id: 'p1', energy: 80, burstReserve: 50 },
        { id: 'p2', energy: 70, burstReserve: 25 },
      ],
    },
  ],
  replay: { duration: 60 },
  performance: [
    { id: 'p1', energy: 60, burstReserve: 100 },
    { id: 'p2', energy: 55, burstReserve: 80 },
  ],
};

test('replay stamina interpolates within saved match snapshots', () => {
  assert.deepEqual(staminaAtTime(report, 'p1', 15), { energy: 88, burstReserve: 75 });
  assert.deepEqual(staminaAtTime(report, 'p1', 45), { energy: 70, burstReserve: 75 });
});

test('live stamina never reads a snapshot newer than the watched match clock', () => {
  assert.deepEqual(staminaAtTime(report, 'p1', 15, true), {
    second: 0,
    energy: 96,
    burstReserve: 100,
  });
  assert.deepEqual(staminaAtTime(report, 'p1', 35, true), {
    second: 30,
    id: 'p1',
    energy: 80,
    burstReserve: 50,
  });
});

test('legacy reports without burst reserve stay honest about the missing measure', () => {
  const old = {
    snapshots: [{ players: [{ id: 'p1', fitness: 82 }] }],
    replay: { duration: 60 },
    performance: [{ id: 'p1', energy: 70 }],
  };
  assert.deepEqual(staminaAtTime(old, 'p1', 30), { energy: 76 });
  assert.equal(staminaAtTime(old, 'missing', 30), undefined);
});
