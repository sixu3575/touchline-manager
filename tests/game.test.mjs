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
test('seeded engine reproduces complete event log and keeps score consistent', () => {
  let g = createGame('测试球队', 42);
  let a = simulate(g.clubs[0], g.clubs[1], 999);
  let b = simulate(g.clubs[0], g.clubs[1], 999);
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
});
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
test('training is bounded per round and finance never allows overspending', () => {
  let g = createGame();
  applyAction(g, 'train', { focus: 'attack' });
  applyAction(g, 'train', { focus: 'fitness' });
  assert.throws(() => applyAction(g, 'train', { focus: 'defence' }));
  g.cash = 0;
  assert.throws(() => applyAction(g, 'sign', { playerId: g.market[0].id }));
  assert.throws(() => applyAction(g, 'upgrade'));
});
test('a complete season balances standings, pays one award, and can continue', () => {
  const g = createGame('完整赛季', 2026);
  for (let i = 0; i < 14; i++) applyAction(g, 'advance');
  const rows = standings(g);
  assert.equal(g.results.length, 56);
  assert.equal(
    rows.reduce((s, r) => s + r.played, 0),
    112,
  );
  assert.equal(g.reports.length, 14);
  for (const club of g.clubs) {
    assert.ok(club.players.filter((p) => club.lineup.includes(p.id)).every((p) => p.apps === 14));
    assert.ok(
      club.players.some((p) => p.apps === 14 && p.fitness < 100),
      'both manager and AI squads expend energy',
    );
  }
  assert.equal(g.ledger.filter((l) => l.label === '赛季排名奖金').length, 1);
  assert.throws(() => applyAction(g, 'advance'));
  applyAction(g, 'season');
  assert.equal(g.round, 0);
  assert.equal(g.season, 2);
  applyAction(g, 'advance');
  assert.equal(g.round, 1);
});
test('cup cannot be replayed after elimination or completed final', () => {
  const g = createGame();
  assert.throws(() => applyAction(g, 'cup'));
  for (let i = 0; i < 8; i++) applyAction(g, 'advance');
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
