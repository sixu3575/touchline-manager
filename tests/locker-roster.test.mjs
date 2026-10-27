import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lockerRoster, lockerPage } from '../packages/client/src/modules/players/locker-roster.mjs';

test('lockers sort by public overall, keep missing values last, and never mutate the roster', () => {
  const players = Object.freeze([
    Object.freeze({ id: 'a', overall: 52, skills: { shooting: 99 } }),
    Object.freeze({ id: 'b', overall: 78, skills: { shooting: 20 } }),
    Object.freeze({ id: 'c', overall: null, skills: { shooting: 99 } }),
    Object.freeze({ id: 'd', overall: 78 }),
  ]);
  assert.deepEqual(
    lockerRoster(players).map((p) => p.id),
    ['b', 'd', 'a', 'c'],
  );
  assert.deepEqual(
    lockerRoster(players, 'ALL', 'overall', 'ascending').map((p) => p.id),
    ['a', 'b', 'd', 'c'],
  );
  assert.deepEqual(
    players.map((p) => p.id),
    ['a', 'b', 'c', 'd'],
  );
});

test('desktop and phone pages expose every player exactly once, including the last incomplete row', () => {
  const players = Array.from({ length: 28 }, (_, i) => ({
    id: `p${i}`,
    role: i < 3 ? 'GK' : 'MID',
    overall: 80 - i,
  }));
  for (const capacity of [7, 3]) {
    const pages = lockerPage(players, 0, capacity).pages;
    const visible = Array.from(
      { length: pages },
      (_, page) => lockerPage(players, page, capacity).players,
    ).flat();
    assert.deepEqual(
      visible.map((p) => p.id),
      players.map((p) => p.id),
    );
    assert.equal(new Set(visible.map((p) => p.id)).size, 28);
  }
  const keepers = lockerRoster(players, 'GK');
  assert.equal(lockerPage(keepers, 9, 7).page, 0);
  assert.equal(lockerPage(keepers, 9, 7).players.length, 3);
  assert.deepEqual(lockerPage([], 99, 3), { page: 0, pages: 1, offset: 0, players: [] });
});

test('signings and a smaller filtered roster cannot strand players on an empty out-of-range page', () => {
  const roster = [
    { id: 'bench', number: 2, fitness: 80 },
    { id: 'starter', number: 99, fitness: 40 },
  ];
  const ranked = lockerRoster(roster, 'ALL', 'status', 'descending', ['starter']);
  assert.equal(ranked[0].id, 'starter');
  const afterSigning = [...roster, { id: 'newcomer', number: 1, fitness: 100 }];
  assert.equal(lockerRoster(afterSigning, 'ALL', 'number', 'ascending')[0].id, 'newcomer');
  assert.equal(lockerPage(afterSigning.slice(0, 1), 1, 3).players[0].id, 'bench');
});
