import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createGame } from '../packages/shared/game.mjs';
import { random } from '../packages/shared/core/index.mjs';
import {
  player,
  trainPlayer,
  integerizePlayer,
  skillSummary,
} from '../packages/shared/modules/players/index.mjs';
import { publicState, publicPlayer } from '../packages/server/src/player-view.mjs';
import {
  integerizeState,
  integerPlan,
  applyIntegerPlan,
} from '../packages/server/src/maintenance/player-integers.mjs';

test('every generated permanent ability and legacy summary is a bounded integer, including extreme budgets', () => {
  for (const role of ['GK', 'DEF', 'MID', 'FWD'])
    for (const level of [1, 25, 60, 95, 100])
      for (let seed = 0; seed < 30; seed++) {
        const p = player('integer-' + seed, role, level, random(seed));
        for (const v of [...Object.values(p.attributes), ...Object.values(p.skills)])
          assert.ok(Number.isInteger(v) && v >= 1 && v <= 100);
        assert.equal(integerizePlayer(p), false);
      }
});
test('small training gains accumulate as integer experience, produce whole points and never leak into effective attributes', () => {
  const p = player('slow', 'MID', 55, random(9));
  for (const key of Object.keys(p.attributes)) p.attributes[key] = 50;
  p.age = 34;
  p.personality.professionalism = 0;
  p.potential = 80;
  const rng = () => 0;
  trainPlayer(p, 'attack', rng);
  assert.equal(p.attributes.finishing, 50);
  assert.equal(p.trainingProgress.finishing, 29);
  for (let i = 0; i < 3; i++) trainPlayer(p, 'attack', rng);
  assert.equal(p.attributes.finishing, 51);
  assert.equal(p.trainingProgress.finishing, 16);
  assert.equal(p.attributes.tackling, 50);
  assert.ok(Object.values(p.attributes).every(Number.isInteger));
  p.attributes.finishing = 79;
  p.trainingProgress.finishing = 90;
  trainPlayer(p, 'attack', rng);
  assert.equal(p.attributes.finishing, 80);
  assert.equal(p.trainingProgress.finishing, undefined);
  trainPlayer(p, 'attack', rng);
  assert.equal(p.attributes.finishing, 80);
  p.attributes.finishing = 99;
  trainPlayer(p, 'attack', rng);
  assert.equal(p.attributes.finishing, 99, 'potential cap must not lower existing ability');
});
test('public knowledge, exact archived assessments and condition meters use integers without exposing training progress', () => {
  const g = createGame(),
    p = g.clubs[0].players[0];
  p.attributes.reflexes = 69.7;
  p.fitness = 72.123;
  p.trainingProgress = { reflexes: 65 };
  g.assessment = {
    version: 1,
    coach: 5,
    scout: 1,
    players: { [p.id]: { joinedOn: g.gameDate, sessions: 8, visits: 0 } },
  };
  const view = publicState(g).clubs[0].players[0];
  assert.equal(view.trainingProgress, undefined);
  assert.equal(view.fitness, 72);
  assert.equal(view.assessment.bands.reflexes.min, 70);
  assert.ok(Object.values(view.skills).every(Number.isInteger));
  assert.ok(Number.isInteger(view.potential) && Number.isInteger(view.weakFoot));
  const archive = structuredClone(p),
    before = JSON.stringify(archive);
  publicPlayer(g, archive, true);
  assert.equal(JSON.stringify(archive), before);
  assert.equal(archive.attributes.reflexes, 69.7, 'old archive truth is never rewritten');
});
test('offline integer conversion only rounds current abilities and caches; all other state and history survive unchanged', () => {
  const g = createGame();
  const original = structuredClone(g.clubs[0].players[0]);
  g.clubs[0].players[0].attributes.passing = 54.4;
  g.clubs[0].players[0].attributes.vision = 74.7;
  g.clubs[0].players[0].skills = skillSummary(g.clubs[0].players[0].attributes);
  g.reports = [{ snapshots: [{ players: [original] }], score: [0, 3] }];
  const before = structuredClone(g),
    result = integerizeState(g);
  assert.equal(result.changed, 1);
  assert.ok(result.maxDelta <= 0.5);
  assert.equal(result.state.revision, g.revision + 1);
  assert.equal(result.state.clubs[0].players[0].attributes.passing, 54);
  assert.equal(result.state.clubs[0].players[0].attributes.vision, 75);
  for (const key of Object.keys(before))
    if (!['clubs', 'market', 'revision'].includes(key))
      assert.deepEqual(result.state[key], before[key], key);
  const rounded = result.state.clubs[0].players[0];
  for (const key of Object.keys(rounded))
    if (!['attributes', 'skills'].includes(key))
      assert.deepEqual(rounded[key], before.clubs[0].players[0][key], key);
  assert.deepEqual(g, before);
  assert.equal(integerizeState(result.state).changed, 0);
  assert.deepEqual(integerizeState(result.state).state, result.state);
});
function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec(
    'CREATE TABLE saves(id TEXT PRIMARY KEY,state TEXT,updated_at TEXT);CREATE TABLE match_jobs(status TEXT);',
  );
  for (const id of ['a', 'b']) {
    const g = createGame(id);
    g.clubs[0].players[0].attributes.finishing = 60.5;
    db.prepare('INSERT INTO saves VALUES(?,?,?)').run(id, JSON.stringify(g), 'old');
  }
  return db;
}
test('offline plans reject active matches and stale state, are idempotent, and roll back every save on failure', () => {
  const db = setup();
  try {
    db.exec("INSERT INTO match_jobs VALUES('airing')");
    assert.throws(() => integerPlan(db), /complete/);
    db.exec('DELETE FROM match_jobs');
    const plan = integerPlan(db);
    const changed = createGame('changed');
    changed.clubs[0].players[0].attributes.finishing = 50.3;
    db.prepare('UPDATE saves SET state=? WHERE id=?').run(JSON.stringify(changed), 'a');
    assert.throws(() => applyIntegerPlan(db, plan), /Stale/);
    const next = integerPlan(db),
      before = db.prepare('SELECT * FROM saves ORDER BY id').all();
    db.exec(
      "CREATE TRIGGER fail_second BEFORE UPDATE ON saves WHEN new.id='b' BEGIN SELECT RAISE(ABORT,'blocked');END;",
    );
    assert.throws(() => applyIntegerPlan(db, next), /blocked/);
    assert.deepEqual(db.prepare('SELECT * FROM saves ORDER BY id').all(), before);
    db.exec('DROP TRIGGER fail_second');
    assert.equal(applyIntegerPlan(db, next).saves, 2);
    assert.equal(applyIntegerPlan(db, integerPlan(db)).saves, 0);
  } finally {
    db.close();
  }
});
