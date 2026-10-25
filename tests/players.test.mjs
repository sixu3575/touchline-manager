import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createGame, applyAction, simulate } from '../packages/shared/game.mjs';
import { random } from '../packages/shared/core/index.mjs';
import {
  ATTRIBUTE_GROUPS,
  COUNTRIES,
  player,
  rating,
  skillSummary,
  ageOn,
  trainPlayer,
  migratePlayer,
  physicalProfile,
  recoveredCondition,
  recoverPlayer,
} from '../packages/shared/modules/players/index.mjs';
import { migrateState, migrateDatabase } from '../packages/server/src/storage/migrations.mjs';

const allAttributes = Object.values(ATTRIBUTE_GROUPS)
  .flatMap((g) => Object.keys(g.attributes))
  .sort();

test('weekly recovery preserves substantial stamina and strength differences after a full match', () => {
  const p = player('recovery', 'MID', 60, random(41));
  const low = structuredClone(p),
    endurance = structuredClone(p),
    strong = structuredClone(p),
    high = structuredClone(p);
  p.attributes.stamina = 50;
  p.attributes.strength = 50;
  for (const a of [low, endurance, strong]) {
    a.attributes.stamina = 20;
    a.attributes.strength = 20;
  }
  endurance.attributes.stamina = 90;
  strong.attributes.strength = 90;
  high.attributes.stamina = 90;
  high.attributes.strength = 90;
  assert.ok(physicalProfile(endurance).capacity > physicalProfile(low).capacity);
  assert.ok(physicalProfile(strong).capacity > physicalProfile(low).capacity);
  assert.ok(recoveredCondition(endurance, 28, 3) > recoveredCondition(low, 28, 3));
  assert.ok(recoveredCondition(strong, 28, 3) > recoveredCondition(low, 28, 3));
  assert.ok(recoveredCondition(low, 28, 7) < 60, 'low physical attributes recover more slowly');
  assert.ok(
    Math.abs(recoveredCondition(low, 45, 7) - 65.1) < 0.2,
    'low physical attributes recover from realistic full-time fatigue more slowly',
  );
  assert.ok(
    Math.abs(recoveredCondition(p, 45, 7) - 78.2) < 0.2,
    'average attributes recover close to 80 over seven days after full-match fatigue',
  );
  assert.ok(
    Math.abs(recoveredCondition(high, 45, 7) - 88.4) < 0.2,
    'high stamina and strength materially accelerate weekly recovery',
  );
  assert.ok(recoveredCondition(high, 45, 7) - recoveredCondition(low, 45, 7) > 22);
  assert.ok(recoveredCondition(endurance, 45, 7) > recoveredCondition(low, 45, 7));
  assert.ok(recoveredCondition(strong, 45, 7) > recoveredCondition(low, 45, 7));
  assert.equal(recoveredCondition(p, 28, 0), 28);
  assert.equal(recoveredCondition(p, 100, 7), 100);
  assert.throws(() => recoveredCondition(p, 28, -1));
  assert.throws(() => recoveredCondition(p, 28, Infinity));
  const split = recoveredCondition(p, recoveredCondition(p, 28, 2), 5);
  assert.ok(Math.abs(split - recoveredCondition(p, 28, 7)) < 1e-10);
  const before = structuredClone(p);
  p.fitness = 28;
  recoverPlayer(p, 7);
  const { fitness, ...rest } = p,
    { fitness: oldFitness, ...old } = before;
  assert.deepEqual(rest, old, 'rest never regenerates a roster, attributes, peaks or observations');
});
function legacySave() {
  const state = createGame('保留俱乐部', 71);
  applyAction(state, 'advance');
  state.schemaVersion = 1;
  delete state.gameDate;
  const strip = (p) => {
    for (const k of [
      'attributes',
      'birthDate',
      'nationality',
      'preferredFoot',
      'weakFoot',
      'heightCm',
      'personality',
      'wellbeing',
      'publicProfile',
    ])
      delete p[k];
  };
  for (const p of [
    ...state.clubs.flatMap((c) => c.players),
    ...state.market,
    ...state.reports.flatMap((r) => r.snapshots.flatMap((c) => c.players)),
  ])
    strip(p);
  return state;
}
test('player identities and thirty bounded abilities are seeded and individually varied', () => {
  const a = player('a', 'MID', 60, random(22), true);
  assert.deepEqual(a, player('a', 'MID', 60, random(22), true));
  assert.equal(allAttributes.length, 30);
  const nations = new Set(),
    personalities = new Set();
  for (let seed = 0; seed < 100; seed++) {
    const p = player(
      'p' + seed,
      ['GK', 'DEF', 'MID', 'FWD'][seed % 4],
      60,
      random(seed),
      seed % 2 === 0,
    );
    assert.deepEqual(Object.keys(p.attributes).sort(), allAttributes);
    assert.ok(
      Object.values(p.attributes).every(
        (v) => v >= 1 && v <= 100 && Math.abs(v * 10 - Math.round(v * 10)) < 1e-8,
      ),
    );
    assert.ok(Object.hasOwn(COUNTRIES, p.nationality));
    assert.equal(ageOn(p.birthDate, '2026-07-01'), p.age);
    assert.equal(new Set(p.publicProfile.interests).size, 2);
    assert.deepEqual(p.skills, skillSummary(p.attributes));
    nations.add(p.nationality);
    personalities.add(JSON.stringify(p.personality));
  }
  assert.ok(nations.size >= 10);
  assert.ok(personalities.size >= 90);
  const sameAbility = { ...a, nationality: 'BR', preferredFoot: 'left' };
  assert.equal(rating(a), rating(sameAbility));
});
test('birthdays follow the game calendar, including season transitions and market players', () => {
  assert.equal(ageOn('2004-10-16', '2026-10-15'), 21);
  assert.equal(ageOn('2004-10-16', '2026-10-16'), 22);
  const g = createGame();
  g.clubs[0].players[0].birthDate = '2000-07-04';
  g.clubs[0].players[0].age = 25;
  g.market[0].birthDate = '2001-07-04';
  g.market[0].age = 24;
  applyAction(g, 'advance');
  assert.equal(g.gameDate, '2026-07-08');
  assert.equal(g.clubs[0].players[0].age, 26);
  assert.equal(g.market[0].age, 25);
  g.round = 14; // Test the season boundary directly, without replaying 13 unrelated rounds.
  applyAction(g, 'season');
  assert.equal(g.gameDate, '2027-07-01');
  assert.equal(g.clubs[0].players[0].age, 26);
  for (const p of g.market) assert.equal(p.age, ageOn(p.birthDate, g.gameDate));
});
test('training uses age and professionalism, trains keepers separately, and never lowers capped skills', () => {
  const original = player('p', 'MID', 60, random(6));
  original.age = 20;
  original.personality.professionalism = 90;
  const young = structuredClone(original),
    old = structuredClone(original),
    casual = structuredClone(original);
  old.age = 34;
  casual.personality.professionalism = 20;
  trainPlayer(young, 'attack', random(12));
  trainPlayer(old, 'attack', random(12));
  trainPlayer(casual, 'attack', random(12));
  const growth = (p, key) =>
    (p.attributes[key] - original.attributes[key]) * 100 + (p.trainingProgress?.[key] ?? 0);
  assert.ok(growth(young, 'finishing') > growth(old, 'finishing'));
  assert.ok(growth(young, 'finishing') > growth(casual, 'finishing'));
  assert.equal(young.attributes.tackling, original.attributes.tackling);
  assert.deepEqual(young.skills, skillSummary(young.attributes));
  const keeper = player('gk', 'GK', 60, random(9));
  const before = structuredClone(keeper);
  trainPlayer(keeper, 'defence', random(3));
  assert.ok(
    keeper.attributes.reflexes > before.attributes.reflexes || keeper.trainingProgress.reflexes > 0,
  );
  assert.equal(keeper.attributes.tackling, before.attributes.tackling);
  keeper.attributes.reflexes = 99;
  keeper.potential = 70;
  trainPlayer(keeper, 'defence', random(3));
  assert.equal(keeper.attributes.reflexes, 99);
});
test('personality persists while training and match settlement update appropriate fields', () => {
  const g = createGame('人物测试', 2),
    p = g.clubs[0].players.find((p) => g.clubs[0].lineup.includes(p.id));
  const personality = structuredClone(p.personality),
    before = p.wellbeing.clubAttachment;
  const report = simulate(g.clubs[0], g.clubs[1], 9);
  applyAction(g, 'train', { focus: 'attack' });
  applyAction(g, 'advance');
  assert.deepEqual(p.personality, personality);
  assert.equal(p.wellbeing.clubAttachment, before + 1);
  assert.deepEqual(report.snapshots[0].players.find((q) => q.id === p.id).personality, personality);
  assert.equal(report.snapshots[0].players.find((q) => q.id === p.id).apps, 0);
});
test('schema 1 upgrade preserves gameplay, money, ages, identity and immutable historical replays', () => {
  const old = legacySave(),
    pristine = structuredClone(old);
  const result = migrateState(old),
    next = result.state;
  assert.deepEqual(old, pristine);
  assert.deepEqual(migrateState(old).state, next);
  assert.equal(next.revision, old.revision + 1);
  assert.equal(next.schemaVersion, 3);
  assert.deepEqual(next.reports, old.reports);
  assert.deepEqual(next.ledger, old.ledger);
  assert.deepEqual(next.results, old.results);
  assert.equal(next.cash, old.cash);
  for (let i = 0; i < next.clubs.length; i++)
    for (let j = 0; j < next.clubs[i].players.length; j++) {
      const a = old.clubs[i].players[j],
        b = next.clubs[i].players[j];
      for (const key of Object.keys(a)) assert.deepEqual(b[key], a[key]);
      assert.equal(rating(a), rating(b));
      assert.equal(b.age, ageOn(b.birthDate, next.gameDate));
      assert.deepEqual(Object.keys(b.attributes).sort(), allAttributes);
    }
  assert.equal(migrateState(next).changed, false);
  applyAction(next, 'train', { focus: 'fitness' });
  applyAction(next, 'advance');
  assert.equal(next.round, 2);
});
test('database migration is atomic and unsupported schemas stop startup without partial changes', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE saves (id TEXT PRIMARY KEY,state TEXT,updated_at TEXT)');
  const original = JSON.stringify(legacySave());
  db.prepare('INSERT INTO saves VALUES (?,?,?)').run('old', original, 'before');
  db.prepare('INSERT INTO saves VALUES (?,?,?)').run(
    'future',
    JSON.stringify({ schemaVersion: 99 }),
    'before',
  );
  assert.throws(() => migrateDatabase(db), /Unsupported/);
  assert.equal(db.prepare('SELECT state FROM saves WHERE id=?').get('old').state, original);
  db.prepare('DELETE FROM saves WHERE id=?').run('future');
  assert.equal(migrateDatabase(db), 1);
  assert.equal(migrateDatabase(db), 0);
  assert.equal(
    JSON.parse(db.prepare('SELECT state FROM saves WHERE id=?').get('old').state).schemaVersion,
    3,
  );
  db.close();
});
