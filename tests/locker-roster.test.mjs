import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lockerRoster } from '../packages/client/src/modules/players/locker-roster.mjs';

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

test('the full roster keeps all 28 players and filtering does not strand the last row', () => {
  const players = Array.from({ length: 28 }, (_, i) => ({
    id: `p${i}`,
    role: i < 3 ? 'GK' : 'MID',
    overall: 80 - i,
  }));
  const visible = lockerRoster(players);
  assert.deepEqual(
    visible.map((p) => p.id),
    players.map((p) => p.id),
  );
  assert.equal(new Set(visible.map((p) => p.id)).size, 28);
  const keepers = lockerRoster(players, 'GK');
  assert.equal(keepers.length, 3);
  assert.deepEqual(lockerRoster([], 'GK'), []);
});

test('signings appear immediately and wage ordering supports either direction', () => {
  const roster = [
    { id: 'bench', number: 2, fitness: 80, wage: 100 },
    { id: 'starter', number: 99, fitness: 40, wage: 500 },
  ];
  const ranked = lockerRoster(roster, 'ALL', 'status', 'descending', ['starter']);
  assert.equal(ranked[0].id, 'starter');
  const afterSigning = [...roster, { id: 'newcomer', number: 1, fitness: 100 }];
  assert.equal(lockerRoster(afterSigning, 'ALL', 'number', 'ascending')[0].id, 'newcomer');
  assert.equal(lockerRoster(afterSigning).length, 3);
  assert.deepEqual(
    lockerRoster(afterSigning, 'ALL', 'wage', 'descending').map((p) => p.id),
    ['starter', 'bench', 'newcomer'],
  );
  assert.deepEqual(
    lockerRoster(afterSigning, 'ALL', 'wage', 'ascending').map((p) => p.id),
    ['bench', 'starter', 'newcomer'],
  );
});

test('search matches names or an exact jersey number, combines with position, and clears to the full team', () => {
  const roster = [
    { id: 'a', name: '林曜', number: 99, role: 'MID' },
    { id: 'b', name: '林瑞', number: 9, role: 'FWD' },
    { id: 'c', name: 'Alex Chen', number: 19, role: 'GK' },
  ];
  const search = (query, filter = 'ALL') =>
    lockerRoster(roster, filter, 'number', 'ascending', [], query).map((p) => p.id);
  assert.deepEqual(search(' 林 '), ['b', 'a']);
  assert.deepEqual(search('林', 'MID'), ['a']);
  assert.deepEqual(search('#9'), ['b']);
  assert.deepEqual(search(' 99 '), ['a']);
  assert.deepEqual(search('ALEX'), ['c']);
  assert.deepEqual(search('没有'), []);
  assert.deepEqual(search('   '), ['b', 'c', 'a']);
});
