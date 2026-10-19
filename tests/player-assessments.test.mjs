import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, basename, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import { createGame, applyAction } from '../packages/shared/game.mjs';
import {
  assessmentFor,
  cardOverview,
  ensureAssessment,
  ATTRIBUTE_GROUPS,
  rating,
  cardDetailGroups,
} from '../packages/shared/modules/players/index.mjs';
import { publicState, publicReport, publicJob } from '../packages/server/src/player-view.mjs';
import {
  createCompetitionPlan,
  settleCompetition,
} from '../packages/shared/modules/competitions/index.mjs';
import { simulate } from '../packages/shared/modules/matches/index.mjs';
import { startServer } from './helpers/api-suite.mjs';
import { ensureTraining } from '../packages/shared/modules/training/index.mjs';
const root = new URL('../', import.meta.url);
const abilityKeys = Object.values(ATTRIBUTE_GROUPS).flatMap((g) => Object.keys(g.attributes));
const noSecrets = (value) => {
  if (!value || typeof value !== 'object') return;
  for (const [k, v] of Object.entries(value)) {
    if (k === 'attributes' && ['coach', 'scout'].includes(value.kind)) {
      assert.deepEqual(
        Object.keys(v).sort(),
        [
          'technical',
          'physical',
          'tactical',
          'goalkeeping',
          'motivation',
          'assessment',
          'potential',
        ].sort(),
      );
      continue;
    }
    assert.ok(
      ![
        'seed',
        'attributes',
        'attributeProfile',
        'matchState',
        'trainingProgress',
        'development',
        'quality',
        'opponentQuality',
        'estimatedSuccess',
        'probability',
        'preparation',
        'mind',
        'motion',
        'defenceTelemetry',
      ].includes(k),
      k,
    );
    noSecrets(v);
  }
};
test('six public summaries are derived, bounded and position-specific; public reads preserve real truth', () => {
  const g = createGame('观察', 313),
    original = structuredClone(g);
  for (const p of g.clubs.flatMap((c) => c.players)) {
    const overview = cardOverview(p);
    assert.equal(overview.length, 6);
    assert.ok(overview.every((s) => s.value >= 1 && s.value <= 100));
    assert.equal(overview[0].key, p.role === 'GK' ? 'diving' : 'pace');
  }
  const view = publicState(g);
  noSecrets(view);
  assert.ok(view.market.every((p) => Object.values(p.assessment.bands).every((b) => b === null)));
  assert.deepEqual(g, original);
  for (const [i, c] of g.clubs.entries())
    for (const [j, p] of c.players.entries())
      assert.equal(view.clubs[i].players[j].overall, rating(p));
  for (const [i, p] of g.market.entries()) assert.equal(view.market[i].overall, rating(p));
  ensureAssessment(g);
  g.assessment.scout = 5;
  g.assessment.players[g.market[0].id] = { visits: 8 };
  assert.equal(
    publicState(g).market[0].overall,
    view.market[0].overall,
    'public overall must not change with staff knowledge',
  );
  const legacy = { id: 'legacy', role: 'FWD', skills: { pace: 80 } };
  assert.ok(
    cardOverview(legacy).every((s) => s.value === null),
    'missing historical truth must not become invented 50-point card data',
  );
});

test('six reading groups contain all 30 details exactly once for outfield and keepers, without changing summary weights', () => {
  const g = createGame();
  for (const role of ['FWD', 'MID', 'DEF', 'GK']) {
    const p = g.clubs[0].players.find((p) => p.role === role);
    const groups = cardDetailGroups(role),
      before = cardOverview(p);
    assert.deepEqual(
      groups.map((s) => s.key),
      before.map((s) => s.key),
    );
    const keys = groups.flatMap((s) => [...s.attributes, ...(s.supplement?.attributes ?? [])]);
    assert.equal(keys.length, 30);
    assert.deepEqual([...keys].sort(), [...abilityKeys].sort());
    assert.equal(new Set(keys).size, 30);
    assert.match(groups.find((s) => s.supplement).supplement.label, /不计入/);
    assert.deepEqual(cardOverview(p), before);
  }
});
test('reports narrow deterministically, unknown stays unknown, and exact knowledge requires both staff and observation', () => {
  const g = createGame(),
    p = g.market[0];
  ensureAssessment(g);
  applyAction(g, 'scout', { playerId: p.id });
  const initial = assessmentFor(g, p);
  assert.deepEqual(assessmentFor(g, p), initial);
  assert.throws(() => applyAction(g, 'scout', { playerId: p.id }), /已观察/);
  g.cash = 2000000;
  for (let i = 0; i < 4; i++) applyAction(g, 'staff', { kind: 'scout' });
  const narrow = assessmentFor(g, p);
  assert.equal(narrow.stage, 3);
  for (const [key, b] of Object.entries(narrow.bands)) {
    const raw = p.attributes[key] ?? p[key];
    assert.ok(b.min <= raw && b.max >= raw);
    if (initial.bands[key]) {
      assert.ok(b.min >= initial.bands[key].min && b.max <= initial.bands[key].max, key);
    }
  }
  g.assessment.players[p.id].visits = 8;
  const exact = assessmentFor(g, p);
  assert.equal(exact.stage, 4);
  for (const key of abilityKeys) assert.equal(exact.bands[key].min, p.attributes[key]);
  assert.throws(() => applyAction(g, 'staff', { kind: 'scout' }), /最高/);
});
test('staff cannot grant competitive ability; insufficient funds and invalid observations cannot charge', () => {
  const g = createGame();
  ensureTraining(g);
  const original = structuredClone(g.clubs),
    wallet = g.cash;
  applyAction(g, 'staff', { kind: 'coach' });
  assert.equal(g.cash, wallet - 75000);
  assert.deepEqual(g.clubs, original);
  const before = g.cash;
  assert.throws(() => applyAction(g, 'staff', { kind: 'anything' }), /无效/);
  assert.equal(g.cash, before);
  g.cash = 1;
  assert.throws(() => applyAction(g, 'staff', { kind: 'coach' }), /不足/);
  assert.equal(g.cash, 1);
  assert.throws(() => applyAction(g, 'scout', { playerId: 'bad' }), /只能/);
});
test('joining keeps scouting evidence, coaching grows with calendar and training, and season progression keeps knowledge', () => {
  const g = createGame(),
    id = g.market[1].id;
  applyAction(g, 'scout', { playerId: id });
  applyAction(g, 'sign', { playerId: id });
  const p = g.clubs[0].players.find((p) => p.id === id);
  assert.equal(assessmentFor(g, p, true).observations, 2);
  applyAction(g, 'train', { focus: 'fitness' });
  assert.equal(
    assessmentFor(g, p, true).observations,
    2,
    'reservation cannot grant observation or ability before a round',
  );
  applyAction(g, 'trainingAssign', { fieldId: 'physical', playerIds: [id] });
  const plan = createCompetitionPlan(g, 'advance');
  const reports = plan.fixtures.map((f) =>
    simulate(
      plan.state.clubs.find((c) => c.id === f.homeId),
      plan.state.clubs.find((c) => c.id === f.awayId),
      f.seed,
      f.id,
      f.options,
    ),
  );
  const next = settleCompetition(plan, reports);
  assert.equal(
    assessmentFor(
      next,
      next.clubs[0].players.find((p) => p.id === id),
      true,
    ).observations,
    4,
  );
  assert.equal(next.assessment.players[id].lastScouted, g.gameDate);
});
test('archive/live diagnostics are projected without changing replay, stats, scores, or private snapshots', () => {
  const g = createGame(),
    p = g.clubs[0].players[0];
  const raw = {
    id: 'r',
    score: [1, 0],
    events: [
      { type: 'goal', quality: { base: 95 }, probability: 0.8, estimatedSuccess: 0.9 },
      { type: 'control', preparation: 0.18, flow: true },
    ],
    stats: [{ shots: 1 }],
    performance: [
      { id: p.id, mind: { confidence: 95 }, defenceTelemetry: { observationLapses: 3 }, saves: 2 },
    ],
    timeline: [{ performance: [{ quality: 91 }] }],
    snapshots: [{ id: 'me', players: [p] }],
  };
  const original = structuredClone(raw),
    view = publicReport(g, raw);
  noSecrets(view);
  noSecrets(publicJob(g, { id: 'job', report: raw }));
  assert.deepEqual(view.score, raw.score);
  assert.deepEqual(view.stats, raw.stats);
  assert.equal(view.events[1].flow, true, 'observable first-touch kind remains public');
  assert.equal(view.snapshots[0].players[0].overall, rating(p));
  assert.deepEqual(raw, original);
});
test('all 30 live attributes have actual executable consumers; inspection does not mistake generation/training for match use', () => {
  const dir = new URL('packages/shared/modules/matches/', root),
    consumers = new Set();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.mjs'))) {
    const ast = ts.createSourceFile(
      file,
      readFileSync(new URL(file, dir), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node) => {
      if (ts.isCallExpression(node) && ['a', 'ability'].includes(node.expression.getText(ast)))
        for (const arg of node.arguments) {
          const scan = (n) => {
            if (ts.isStringLiteral(n)) consumers.add(n.text);
            ts.forEachChild(n, scan);
          };
          scan(arg);
        }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  // Stamina is intentionally consumed by energyCost, not by generic actionQuality.
  const energy = readFileSync(
    new URL('packages/shared/modules/players/match-state.mjs', root),
    'utf8',
  );
  assert.match(energy, /p\.attributes\?\.stamina/);
  consumers.add('stamina');
  assert.deepEqual(
    abilityKeys.filter((k) => !consumers.has(k)),
    [],
  );
});
test('HTTP responses, retries and restart never expose raw abilities; duplicate staff requests charge once', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'touchline-assessment-test-'));
  let app = await startServer(dir, false);
  try {
    const fresh = await fetch(app.url + '/api/state');
    const cookie = fresh.headers.get('set-cookie').split(';')[0],
      headers = { cookie, 'content-type': 'application/json' };
    let state = (await fresh.json()).state;
    noSecrets(state);
    const requestId = randomUUID(),
      body = JSON.stringify({
        type: 'staff',
        payload: { kind: 'coach' },
        revision: state.revision,
        requestId,
      });
    const replies = await Promise.all(
      [1, 2].map(() =>
        fetch(app.url + '/api/action', { method: 'POST', headers, body }).then((r) => r.json()),
      ),
    );
    for (const r of replies) {
      noSecrets(r);
      assert.equal(r.state.cash, state.cash - 75000);
    }
    state = replies[0].state;
    await app.stop();
    app = await startServer(dir, false);
    const restored = await (await fetch(app.url + '/api/state', { headers })).json();
    noSecrets(restored);
    assert.deepEqual(restored.state, state);
    const begin = await fetch(app.url + '/api/action', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: 'advance',
        payload: {},
        revision: state.revision,
        requestId: randomUUID(),
      }),
    });
    const queued = await begin.json();
    noSecrets(queued);
    let job;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 100));
      job = (await (await fetch(app.url + '/api/match-jobs/' + queued.job.id, { headers })).json())
        .job;
      noSecrets(job);
      if (job.status === 'complete') break;
    }
    assert.equal(job.status, 'complete');
    const final = await (await fetch(app.url + '/api/state', { headers })).json();
    noSecrets(final);
    const reportId = final.state.reports[0].id;
    const archived = await (await fetch(app.url + '/api/reports/' + reportId, { headers })).json();
    noSecrets(archived);
    assert.ok(archived.snapshots[0].players.length === 11);
    const db = new DatabaseSync(join(dir, 'game.sqlite'), { readOnly: true });
    const truth = JSON.parse(db.prepare('SELECT state FROM saves').get().state);
    assert.equal(Object.keys(truth.clubs[0].players[0].attributes).length, 30);
    assert.equal(truth.assessment.coach, 3);
    db.close();
  } finally {
    await app.stop();
    const target = resolve(dir);
    if (
      !basename(target).startsWith('touchline-assessment-test-') ||
      !target.startsWith(resolve(tmpdir()) + sep)
    )
      throw Error('Unsafe cleanup');
    rmSync(target, { recursive: true, force: true });
  }
});
