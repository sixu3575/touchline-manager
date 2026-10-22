import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  applyAction,
  simulate,
  schedule,
  validateLineup,
  standings,
} from '../packages/shared/game.mjs';
test('round robin has balanced fixtures and no repeated club per round', () => {
  const s = schedule(Array.from({ length: 8 }, (_, i) => String(i)));
  assert.equal(s.length, 14);
  let pairs = new Set();
  for (const round of s) {
    assert.equal(new Set(round.flat()).size, 8);
    for (const [a, b] of round) pairs.add(a + '-' + b);
  }
  assert.equal(pairs.size, 56);
});
test('invalid, foreign and duplicate lineups rejected', () => {
  const g = createGame();
  const c = g.clubs[0];
  assert.throws(() => validateLineup(c, [...c.lineup.slice(0, 10), c.lineup[0]], '4-4-2'));
  assert.throws(() => validateLineup(c, [...c.lineup.slice(0, 10), 'foreign'], '4-4-2'));
  assert.throws(() =>
    applyAction(g, 'tactics', { formation: '4-4-2', style: 'hack', press: 'normal', auto: true }),
  );
});
test('league rows show recent form, rank movement from the previous round and next opponent', () => {
  const g = {
    clubs: [
      { id: 'me', name: 'Aster', color: '#111' },
      { id: 'b', name: 'Beacon', color: '#222' },
    ],
    schedule: [[['me', 'b']], [['b', 'me']], [['me', 'b']]],
    round: 2,
    results: [
      { id: 'r1', homeId: 'me', awayId: 'b', score: [1, 0], round: 1 },
      { id: 'r2', homeId: 'b', awayId: 'me', score: [2, 0], round: 2 },
    ],
  };
  const rows = standings(g);
  assert.deepEqual(rows.find((row) => row.id === 'me').recentResults, ['L', 'W']);
  assert.equal(rows.find((row) => row.id === 'me').rankChange, -1);
  assert.equal(rows.find((row) => row.id === 'me').nextOpponent, 'Beacon');
});
test('training is bounded per round and finance never allows overspending', () => {
  let g = createGame();
  applyAction(g, 'train', { focus: 'attack' });
  applyAction(g, 'train', { focus: 'fitness' });
  assert.throws(() => applyAction(g, 'train', { focus: 'defence' }));
  g.cash = 0;
  assert.throws(() => applyAction(g, 'sign', { playerId: g.market[0].id }));
  assert.throws(() => applyAction(g, 'upgrade'));
});
test('cup cannot be replayed after elimination or completed final', () => {
  const g = createGame();
  assert.throws(() => applyAction(g, 'cup'));
  g.round = 8; // Cup eligibility is the subject; no unrelated league simulation setup.
  while (!g.cup.eliminated && g.cup.stage < 3) applyAction(g, 'cup');
  assert.throws(() => applyAction(g, 'cup'));
});
test('signing removes exactly one market player and bills once', () => {
  const g = createGame();
  let p = g.market[0],
    cash = g.cash;
  applyAction(g, 'sign', { playerId: p.id });
  assert.equal(g.cash, cash - p.price);
  assert.equal(g.clubs[0].players.length, 21);
  assert.throws(() => applyAction(g, 'sign', { playerId: p.id }));
});
