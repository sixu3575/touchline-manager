import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { random } from '../packages/shared/core/index.mjs';
import { createGame } from '../packages/shared/game.mjs';
import {
  player,
  rating,
  skillSummary,
  reprofilePlayer,
  observationPlayer,
  SPECIALISMS,
} from '../packages/shared/modules/players/index.mjs';
import {
  reshapeState,
  maintenancePlan,
  applyMaintenance,
} from '../packages/server/src/maintenance/player-profiles.mjs';

test('seeded specialisms have distinct strengths across positions, coherent archetypes and bounded summaries', () => {
  const samples = [];
  for (const role of ['GK', 'DEF', 'MID', 'FWD'])
    for (let seed = 1; seed <= 240; seed++) {
      const p = player('p-' + seed, role, 60, random(seed));
      samples.push(p);
      assert.deepEqual(p, player('p-' + seed, role, 60, random(seed)));
      assert.equal(Object.keys(p.attributes).length, 30);
      assert.ok(
        Object.values(p.attributes).every((v) => v >= 1 && v <= 100 && Number.isInteger(v)),
      );
      assert.ok(SPECIALISMS[p.attributeProfile.archetype]);
      assert.deepEqual(p.skills, skillSummary(p.attributes));
    }
  const mean = (rows, key) => rows.reduce((s, p) => s + p.attributes[key], 0) / rows.length;
  const forwards = samples.filter((p) => p.role === 'FWD'),
    wings = forwards.filter((p) => p.attributeProfile.archetype === 'winger'),
    targets = forwards.filter((p) => p.attributeProfile.archetype === 'target');
  assert.ok(mean(wings, 'dribbling') > mean(targets, 'dribbling') + 15);
  assert.ok(mean(targets, 'heading') > mean(wings, 'heading') + 20);
  const mids = samples.filter((p) => p.role === 'MID'),
    makers = mids.filter((p) => p.attributeProfile.archetype === 'playmaker'),
    winners = mids.filter((p) => p.attributeProfile.archetype === 'ballWinner');
  assert.ok(mean(makers, 'vision') > mean(winners, 'vision') + 10);
  assert.ok(mean(winners, 'tackling') > mean(makers, 'tackling') + 10);
  const fields = samples.filter((p) => p.role !== 'GK');
  assert.ok(
    fields.filter((p) => Math.abs(p.attributes.firstTouch - p.attributes.passing) > 5).length >
      fields.length * 0.5,
  );
  assert.ok(samples.filter((p) => p.role === 'GK').every((p) => p.skills.keeping > 50));
  assert.ok(fields.every((p) => p.skills.keeping < 13));
});

test('one-time reshaping preserves identity, history, economics, fitness and original six ability budgets', () => {
  const p = player('legacy', 'MID', 61, random(32));
  delete p.attributeProfile;
  p.attributes.passing =
    p.attributes.vision =
    p.attributes.decisions =
    p.attributes.firstTouch =
    p.attributes.crossing =
      61;
  p.skills = skillSummary(p.attributes);
  const before = structuredClone(p),
    budget = skillSummary(p.attributes),
    ovr = rating(p);
  assert.equal(reprofilePlayer(p, 731), true);
  for (const key of Object.keys(p))
    if (!['attributes', 'skills', 'attributeProfile'].includes(key))
      assert.deepEqual(p[key], before[key], key);
  for (const key of Object.keys(budget))
    assert.ok(Math.abs(p.skills[key] - budget[key]) <= 0.100001, key);
  assert.ok(Math.abs(rating(p) - ovr) <= 1);
  assert.notEqual(p.attributes.passing, p.attributes.firstTouch);
  const once = structuredClone(p);
  assert.equal(reprofilePlayer(p, 731), false);
  assert.deepEqual(p, once);
  const same = structuredClone(before);
  reprofilePlayer(same, 731);
  assert.deepEqual(p, same);
});

test('explicit observation striker has elite individual strengths without changing the match or rating rules', () => {
  const p = observationPlayer(731, '2026-09-02');
  assert.deepEqual(p, observationPlayer(731, '2026-09-02'));
  assert.equal(p.name, '林曜');
  assert.equal(p.age, 24);
  assert.equal(p.role, 'FWD');
  assert.equal(p.number, 99);
  assert.ok(rating(p) >= 94);
  assert.equal(p.attributes.finishing, 98);
  assert.equal(p.attributes.offTheBall, 98);
  assert.ok(p.attributes.marking < 40 && p.attributes.handling < 20);
  assert.equal(p.fitness, 100);
});

function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec(
    'CREATE TABLE saves(id TEXT PRIMARY KEY,state TEXT,updated_at TEXT); CREATE TABLE match_jobs(status TEXT)',
  );
  const a = createGame('用户球队', 731),
    b = createGame('其他球队', 42);
  for (const g of [a, b])
    for (const p of [...g.clubs.flatMap((c) => c.players), ...g.market]) delete p.attributeProfile;
  a.reports = [
    {
      id: 'historical',
      snapshots: [{ players: [structuredClone(a.clubs[0].players[0])] }],
      score: [0, 3],
    },
  ];
  db.prepare('INSERT INTO saves VALUES(?,?,?)').run('a', JSON.stringify(a), 'before');
  db.prepare('INSERT INTO saves VALUES(?,?,?)').run('b', JSON.stringify(b), 'before');
  return { db, a, b };
}
test('offline maintenance is scoped, preserves history and revises saves once, with an idempotent grant', () => {
  const { db, a, b } = setup(),
    plan = maintenancePlan(db, 731);
  assert.equal(plan.rows.filter((r) => r.granted).length, 1);
  assert.equal(applyMaintenance(db, JSON.parse(JSON.stringify(plan))).grants, 1);
  for (const [id, before] of [
    ['a', a],
    ['b', b],
  ]) {
    const after = JSON.parse(db.prepare('SELECT state FROM saves WHERE id=?').get(id).state);
    assert.equal(after.revision, before.revision + 1);
    for (const key of [
      'reports',
      'results',
      'ledger',
      'cash',
      'schedule',
      'round',
      'season',
      'gameDate',
      'trophies',
    ])
      assert.deepEqual(after[key], before[key], key);
    assert.equal(
      after.clubs[0].players.filter((p) => p.id === 'observation-star-v1').length,
      id === 'a' ? 1 : 0,
    );
    if (id === 'a') {
      assert.equal(after.clubs[0].lineup.length, 11);
      assert.ok(after.clubs[0].lineup.includes('observation-star-v1'));
    }
  }
  const second = maintenancePlan(db, 731);
  assert.deepEqual(applyMaintenance(db, second), { saves: 0, players: 0, grants: 0 });
  assert.throws(() => applyMaintenance(db, plan), /Stale/);
  const after = JSON.parse(db.prepare('SELECT state FROM saves WHERE id=?').get('a').state);
  const star = after.clubs[0].players.find((p) => p.id === 'observation-star-v1');
  after.clubs[0].players = after.clubs[0].players.filter((p) => p !== star);
  after.market.push(star);
  assert.equal(
    reshapeState(after, true).granted,
    false,
    'selling the player must not issue another',
  );
  db.close();
});
test('maintenance refuses active matches, ambiguous targets, stale plans and rolls back all writes on failure', () => {
  const { db } = setup();
  db.prepare('INSERT INTO match_jobs VALUES(?)').run('running');
  assert.throws(() => maintenancePlan(db, 731), /complete/);
  db.exec('DELETE FROM match_jobs');
  assert.throws(() => maintenancePlan(db, 999), /exactly one/);
  const plan = maintenancePlan(db, 731),
    before = db.prepare('SELECT state FROM saves ORDER BY id').all();
  db.exec(
    "CREATE TRIGGER reject_b BEFORE UPDATE ON saves WHEN OLD.id='b' BEGIN SELECT RAISE(ABORT,'injected write failure'); END",
  );
  assert.throws(() => applyMaintenance(db, plan), /injected/);
  assert.deepEqual(db.prepare('SELECT state FROM saves ORDER BY id').all(), before);
  db.exec('DROP TRIGGER reject_b');
  db.prepare('UPDATE saves SET state=? WHERE id=?').run(
    JSON.stringify({ ...JSON.parse(before[0].state), revision: 99 }),
    'a',
  );
  assert.throws(() => applyMaintenance(db, plan), /Stale/);
  db.close();
});
