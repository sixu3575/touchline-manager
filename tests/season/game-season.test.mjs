import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  applyAction,
  simulate,
  schedule,
  validateLineup,
  standings,
} from '../../packages/shared/game.mjs';

test('a complete season balances standings, pays one award, and can continue', () => {
  const g = createGame('完整赛季', 2026);
  applyAction(g, 'staff', { kind: 'coach' });
  const knowledge = structuredClone(g.assessment);
  for (let i = 0; i < 14; i++) applyAction(g, 'advance');
  const rows = standings(g);
  assert.equal(g.results.length, 56);
  assert.equal(
    rows.reduce((s, r) => s + r.played, 0),
    112,
  );
  assert.equal(g.reports.filter((r) => r.homeId === 'me' || r.awayId === 'me').length, 14);
  assert.equal(g.reports.length, 56);
  assert.equal(g.assessment.coach, 3);
  assert.deepEqual(
    g.assessment.players,
    knowledge.players,
    'observation anchors survive each frozen round and settlement',
  );
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
  assert.equal(g.assessment.coach, 3);
  assert.deepEqual(
    g.assessment.players,
    knowledge.players,
    'changing season must not reset observation',
  );
  for (const p of g.market)
    assert.equal(
      g.assessment.players[p.id],
      undefined,
      'new candidates must not inherit old scouting knowledge',
    );
  applyAction(g, 'advance');
  assert.equal(g.round, 1);
});
