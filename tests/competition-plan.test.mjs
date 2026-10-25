import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../packages/shared/game.mjs';
import {
  createCompetitionPlan,
  settleCompetition,
} from '../packages/shared/modules/competitions/index.mjs';
import { fixtureReport } from './helpers/fixture-report.mjs';

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

test('elapsed recovery belongs to frozen pre-match inputs and is not repeated by settlement or same-date cups', () => {
  const g = createGame('恢复时点', 42);
  g.round = 2;
  for (const c of g.clubs) for (const p of c.players) p.fitness = 28;
  const plan = createCompetitionPlan(g, 'advance');
  assert.equal(g.clubs[0].players[0].fitness, 28, 'queuing does not publish future recovery');
  assert.ok(
    plan.state.clubs.every((c) => c.players.every((p) => p.fitness > 50 && p.fitness < 90)),
    'seven days restore exhausted players at attribute-dependent rates without filling everyone',
  );
  assert.deepEqual(
    createCompetitionPlan(g, 'advance'),
    plan,
    'retry does not accumulate another week',
  );
  const exhausted = plan.state.clubs[0].lineup[0];
  const reports = plan.fixtures.map((f) => {
    const h = plan.state.clubs.find((c) => c.id === f.homeId),
      a = plan.state.clubs.find((c) => c.id === f.awayId);
    const r = fixtureReport(h, a, f.seed, f.id);
    for (const p of r.performance) p.energy = p.id === exhausted ? 0 : 43;
    return r;
  });
  const settled = settleCompetition(plan, reports);
  for (const c of settled.clubs)
    for (const p of c.players)
      if (c.lineup.includes(p.id))
        assert.equal(
          p.fitness,
          p.id === exhausted ? 0 : 43,
          'finished energy stays spent, including zero',
        );
  const cup = createCompetitionPlan(settled, 'cup');
  assert.equal(cup.state.gameDate, settled.gameDate);
  assert.equal(
    cup.state.clubs[0].players.find((p) => p.id === settled.clubs[0].lineup[0]).fitness,
    0,
  );
});
