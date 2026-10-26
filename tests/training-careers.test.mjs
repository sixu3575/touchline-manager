import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, basename, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createGame, applyAction } from '../packages/shared/game.mjs';
import { random } from '../packages/shared/core/index.mjs';
import {
  ensureTraining,
  resolveTraining,
  TRAINING_FIELDS,
} from '../packages/shared/modules/training/index.mjs';
import {
  trainAssignedPlayer,
  updateAges,
  ensureAssessment,
  assessmentFor,
  player,
} from '../packages/shared/modules/players/index.mjs';
import {
  developmentState,
  trainingAgeFactor,
  trainingTalentFactor,
} from '../packages/shared/modules/players/development.mjs';
import {
  trainingAttributeDetails,
  trainingFitness,
} from '../packages/client/src/modules/training/player-training-data.mjs';
import {
  createCompetitionPlan,
  settleCompetition,
} from '../packages/shared/modules/competitions/index.mjs';
import { simulate } from '../packages/shared/modules/matches/index.mjs';
import { publicState } from '../packages/server/src/player-view.mjs';
import { startServer } from './helpers/api-suite.mjs';
function setup(seed = 150) {
  const g = createGame('训练试验', seed);
  ensureTraining(g);
  return g;
}
function settle(plan) {
  return settleCompetition(
    plan,
    plan.order.map((f) =>
      simulate(
        plan.state.clubs.find((c) => c.id === f.homeId),
        plan.state.clubs.find((c) => c.id === f.awayId),
        f.seed,
        f.id,
        f.options,
      ),
    ),
  );
}

test('training reservations never change ability immediately; allocation validates ownership, capacity and exclusive coaches', () => {
  const g = setup(),
    p = g.clubs[0].players[4],
    coachId = g.staff.employees[0].id;
  const truth = structuredClone(p.attributes),
    wallet = g.cash;
  applyAction(g, 'trainingAssign', { fieldId: 'passing', playerIds: [p.id], coachId });
  assert.deepEqual(p.attributes, truth);
  assert.equal(g.cash, wallet);
  for (const payload of [
    { fieldId: '__proto__', playerIds: [] },
    { fieldId: 'shooting', playerIds: [p.id] },
    { fieldId: 'passing', playerIds: [p.id, p.id] },
    { fieldId: 'passing', playerIds: ['not-owned'] },
    { fieldId: 'passing', playerIds: g.clubs[0].players.slice(0, 9).map((p) => p.id) },
    { fieldId: 'physical', playerIds: [p.id] },
    { fieldId: 'physical', playerIds: [], coachId },
    { fieldId: 'passing', playerIds: [p.id], coachId: g.staff.employees[1].id },
  ])
    assert.throws(() => applyAction(g, 'trainingAssign', payload));
  assert.equal(g.cash, wallet);
  applyAction(g, 'trainingFacility', { fieldId: 'goalkeeping' });
  assert.throws(
    () => applyAction(g, 'trainingAssign', { fieldId: 'goalkeeping', playerIds: [p.id] }),
    /门将/,
  );
  assert.throws(() => applyAction(g, 'trainingFacility', { fieldId: 'constructor' }), /无效/);
  g.cash = 0;
  assert.throws(() => applyAction(g, 'trainingFacility', { fieldId: 'shooting' }), /不足/);
});

test('one frozen league round trains and pays staff once; cup does neither; all four reports remain available', () => {
  const g = setup(),
    id = g.clubs[0].players[5].id;
  applyAction(g, 'trainingAssign', {
    fieldId: 'passing',
    playerIds: [id],
    coachId: g.staff.employees[0].id,
  });
  const original = structuredClone(g),
    plan = createCompetitionPlan(g, 'advance');
  assert.deepEqual(g, original, 'pending training/results must not enter visible source state');
  assert.equal(plan.state.training.history.length, 1);
  assert.equal(plan.state.assessment.players[id].sessions, 1);
  const trained = structuredClone(plan.state);
  resolveTraining(plan.state);
  assert.deepEqual(plan.state, trained);
  const next = settle(plan);
  assert.equal(next.training.history[0].cost, 300);
  assert.equal(next.reports.length, 4);
  assert.equal(next.reports.filter((r) => r.canReplay).length, 1);
  assert.ok(next.reports.every((r) => r.stats.length === 2 && r.snapshots.length === 2));
  assert.ok(next.reports.filter((r) => !r.canReplay).every((r) => !r.trajectory && !r.replay));
  assert.equal(next.ledger.filter((l) => l.label === '教练与球探工资').length, 1);
  assert.equal(
    next.ledger.find((l) => l.label === '教练与球探工资').amount,
    -next.staff.employees.reduce((s, p) => s + p.wage, 0),
  );
  next.round = 2;
  const cup = settle(createCompetitionPlan(next, 'cup'));
  assert.deepEqual(cup.training.history, next.training.history);
  assert.equal(cup.assessment.players[id].sessions, 1);
  assert.equal(cup.ledger.filter((l) => l.label === '教练与球探工资').length, 1);
});

test('staff are concrete server-priced people; hiring and firing preserve minimum coverage and clear assignments', () => {
  const g = setup(),
    candidate = g.staff.market.find((p) => p.kind === 'coach'),
    before = g.cash;
  applyAction(g, 'staffManage', { operation: 'hire', staffId: candidate.id, wage: -999999 });
  assert.equal(g.cash, before - candidate.wage * 4);
  assert.ok(g.staff.employees.some((p) => p.id === candidate.id));
  assert.throws(() => applyAction(g, 'staffManage', { operation: 'hire', staffId: candidate.id }));
  applyAction(g, 'trainingAssign', {
    fieldId: 'passing',
    playerIds: [g.clubs[0].players[3].id],
    coachId: candidate.id,
  });
  applyAction(g, 'staffManage', { operation: 'fire', staffId: candidate.id });
  assert.equal(g.training.assignments.passing.coachId, null);
  assert.throws(
    () => applyAction(g, 'staffManage', { operation: 'fire', staffId: g.staff.employees[0].id }),
    /至少/,
  );
  assert.ok(
    g.staff.employees.every(
      (p) =>
        Number.isInteger(p.wage) &&
        Object.values(p.attributes).every((v) => Number.isInteger(v) && v >= 1 && v <= 100),
    ),
  );
});

test('coach quality, attitude, personal talent and available potential drive integer training growth', () => {
  const base = setup().clubs[0].players[5];
  function gains({ quality = 90, potential = 95, professionalism = 90, age = 20, talent } = {}) {
    let sum = 0;
    for (let i = 1; i <= 500; i++) {
      const p = structuredClone(base);
      p.age = age;
      p.potential = potential;
      p.attributes.passing = 50;
      p.personality.professionalism = professionalism;
      if (talent != null) p.development.trainingTalent = talent;
      const result = trainAssignedPlayer(p, ['passing'], quality, 1, random(i), '2026-07-01');
      sum += result.length;
      assert.ok(Number.isInteger(p.attributes.passing) && [50, 51].includes(p.attributes.passing));
    }
    return sum;
  }
  const strong = gains();
  assert.ok(strong > gains({ quality: 20 }) * 1.3);
  assert.ok(strong > gains({ professionalism: 10 }) * 1.4);
  assert.ok(strong > gains({ potential: 52 }) * 2);
  assert.ok(strong > gains({ age: 38 }) * 1.2);
  assert.ok(
    gains({ age: 37, potential: 95, talent: 1.2 }) >
      gains({ age: 18, potential: 65, talent: 0.8 }) * 1.2,
    'an exceptional older player can outgrow a low-talent youth prospect',
  );
  assert.ok(trainingAgeFactor(21) > trainingAgeFactor(38));
  assert.ok(trainingTalentFactor(95, 1) > trainingTalentFactor(60, 1));
  assert.ok(trainingTalentFactor(95, 1.2) > trainingTalentFactor(60, 0.8));
});

test('older development records lazily receive one stable private training talent value', () => {
  const p = structuredClone(setup().clubs[0].players[5]);
  p.attributes.passing = 70;
  p.development = { version: 1, lastDate: '2026-07-01', peaks: { passing: 88 } };
  const first = developmentState(p, '2026-07-01'),
    talent = first.trainingTalent,
    q = structuredClone(p);
  delete q.development.trainingTalent;
  const second = developmentState(q, '2026-07-01');
  assert.equal(first.version, 2);
  assert.equal(first.peaks.passing, 88);
  assert.ok(first.decay && typeof first.decay === 'object');
  assert.equal(first.potentialDecay, 0);
  assert.ok(talent >= 0.8 && talent <= 1.2);
  assert.equal(second.trainingTalent, talent);
  assert.equal(developmentState(p, '2026-07-01').trainingTalent, talent);
});

test('youth-market prospects have a higher but varied potential distribution', () => {
  const youth = Array.from({ length: 200 }, (_, i) =>
      player(`youth-${i}`, 'MID', 65, random(i + 1), true),
    ),
    senior = Array.from({ length: 200 }, (_, i) =>
      player(`senior-${i}`, 'MID', 65, random(i + 1), false),
    ),
    average = (players) => players.reduce((sum, p) => sum + p.potential, 0) / players.length,
    youthPotentials = new Set(youth.map((p) => p.potential));
  assert.ok(average(youth) > average(senior) + 3);
  assert.ok(youthPotentials.size > 10, 'youth prospects must retain individual talent variation');
  assert.ok(youth.every((p) => p.age >= 16 && p.age <= 18));
});

test('training list formats current fitness and only the selected area’s assessed subattributes', () => {
  const p = {
      fitness: 68.6,
      attributes: { tackling: 99, marking: 98 },
      assessment: { bands: { tackling: { min: 61, max: 73 }, marking: null } },
    },
    rows = trainingAttributeDetails(p, TRAINING_FIELDS.defending.keys.slice(0, 2), {
      tackling: '抢断',
      marking: '盯人',
    });
  assert.equal(trainingFitness(p.fitness), 69);
  assert.deepEqual(
    rows.map(({ label, value, observed }) => ({ label, value, observed })),
    [
      { label: '抢断', value: '61–73', observed: true },
      { label: '盯人', value: '待观察', observed: false },
    ],
  );
  assert.equal(rows.some((row) => row.value === '99' || row.value === '98'), false);
});

test('aging is date-based, gradual, individual and attribute-specific; prior peaks allow rare older-player improvement', () => {
  const g = setup(),
    p = g.clubs[0].players[5];
  p.birthDate = '1988-01-01';
  p.age = 38;
  p.potential = 95;
  for (const k of Object.keys(p.attributes)) p.attributes[k] = 75;
  delete p.development;
  ensureTraining(g);
  const original = structuredClone(p.attributes);
  updateAges(g);
  assert.deepEqual(p.attributes, original, 'initialization must not invent past decline');
  g.gameDate = '2027-07-01';
  const changes = updateAges(g);
  assert.ok(changes[p.id].length > 0);
  assert.ok(p.potential < 95);
  assert.ok(
    75 - p.attributes.sprintSpeed > 75 - p.attributes.vision,
    'physical declines earlier than decision/vision',
  );
  assert.equal(p.development.peaks.sprintSpeed, 75);
  const once = structuredClone(p);
  updateAges(g);
  assert.deepEqual(p, once);
  p.potential = 40;
  const oldValue = p.attributes.sprintSpeed;
  trainAssignedPlayer(p, ['sprintSpeed'], 95, 3, () => 0, g.gameDate);
  assert.equal(
    p.attributes.sprintSpeed,
    oldValue + 1,
    'lower current potential must not prohibit limited recovery toward an attained peak',
  );
  assert.ok(Object.values(p.attributes).every((v) => Number.isInteger(v) && v >= 1 && v <= 100));
  const q = structuredClone(p);
  q.id = 'another-person';
  delete q.development;
  q.attributes = { ...original };
  g.clubs[0].players.push(q);
  ensureTraining(g);
  g.gameDate = '2028-07-01';
  updateAges(g);
  assert.notDeepEqual(p.development.decay, q.development.decay);
});

test('practice improves only observed specialties; confirmed detailed peaks survive decline without exposing true peaks', () => {
  const g = setup(),
    p = g.clubs[0].players[5],
    r = g.assessment.players[p.id];
  const coach = g.staff.employees.find((p) => p.kind === 'coach');
  coach.attributes.assessment = 50;
  r.trainingObservations = { passing: 9 };
  ensureAssessment(g);
  assert.notEqual(
    assessmentFor(g, p, true).bands.passing.min,
    assessmentFor(g, p, true).bands.passing.max,
  );
  r.trainingObservations.passing = 12;
  ensureAssessment(g);
  assert.deepEqual(assessmentFor(g, p, true).bands.passing, {
    min: p.attributes.passing,
    max: p.attributes.passing,
  });
  const peak = p.attributes.passing;
  p.attributes.passing = Math.max(1, peak - 3);
  ensureAssessment(g);
  const dto = publicState(g).clubs[0].players[5];
  assert.equal(dto.assessment.peaks.passing, peak);
  assert.deepEqual(Object.keys(dto.assessment.peaks), ['passing']);
  assert.equal(dto.development, undefined);
  assert.equal(dto.attributes, undefined);
  assert.equal(dto.assessment.peaks.physical, undefined);
  const peer = g.clubs[0].players[6];
  applyAction(g, 'trainingAssign', { fieldId: 'physical', playerIds: [p.id], coachId: coach.id });
  g.round = 1;
  resolveTraining(g);
  assert.ok(r.trainingObservations.stamina > 0);
  assert.equal(g.assessment.players[peer.id].trainingObservations, undefined);
  for (const row of publicState(g).training.history[0].rows)
    for (const c of row.changes) {
      assert.equal(c.from, undefined);
      assert.equal(c.to, undefined);
    }
});

test('training assignment retries charge once, survive restart, and AI report endpoints reject all replay access', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'touchline-training-test-'));
  let app = await startServer(dir, false);
  try {
    const fresh = await fetch(app.url + '/api/state'),
      cookie = fresh.headers.get('set-cookie').split(';')[0];
    const headers = { cookie, 'content-type': 'application/json' };
    let state = (await fresh.json()).state;
    const body = JSON.stringify({
      type: 'trainingFacility',
      payload: { fieldId: 'shooting' },
      revision: state.revision,
      requestId: randomUUID(),
    });
    const replies = await Promise.all(
      [1, 2].map(() =>
        fetch(app.url + '/api/action', { method: 'POST', headers, body }).then((r) => r.json()),
      ),
    );
    assert.equal(replies[0].state.cash, state.cash - TRAINING_FIELDS.shooting.cost);
    assert.deepEqual(replies[0].state, replies[1].state);
    state = replies[0].state;
    await app.stop();
    app = await startServer(dir, false);
    assert.deepEqual(
      (await (await fetch(app.url + '/api/state', { headers })).json()).state,
      state,
    );
    const result = await (
      await fetch(app.url + '/api/action', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'advance',
          payload: {},
          revision: state.revision,
          requestId: randomUUID(),
        }),
      })
    ).json();
    let job;
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 100));
      job = (await (await fetch(app.url + '/api/match-jobs/' + result.job.id, { headers })).json())
        .job;
      if (job.status === 'complete') break;
    }
    assert.equal(job.status, 'complete');
    state = (await (await fetch(app.url + '/api/state', { headers })).json()).state;
    const ai = state.reports.find((r) => r.canReplay === false);
    const archived = await fetch(app.url + '/api/reports/' + ai.id, { headers });
    assert.equal(archived.status, 200);
    assert.equal((await archived.json()).stats.length, 2);
    assert.equal((await fetch(app.url + '/api/replays/' + ai.id, { headers })).status, 404);
    const other = await fetch(app.url + '/api/state'),
      otherCookie = other.headers.get('set-cookie').split(';')[0];
    assert.equal(
      (await fetch(app.url + '/api/reports/' + ai.id, { headers: { cookie: otherCookie } })).status,
      404,
    );
  } finally {
    await app.stop();
    const target = resolve(dir);
    if (
      !basename(target).startsWith('touchline-training-test-') ||
      !target.startsWith(resolve(tmpdir()) + sep)
    )
      throw Error('Unsafe cleanup');
    rmSync(target, { recursive: true, force: true });
  }
});
