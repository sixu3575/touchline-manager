import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import {
  classifyChanges,
  selectTiers,
  matchUnits,
  matchScenarios,
  seasonTests,
} from '../scripts/validation-plan.mjs';
const change = (path, before, after) => ({ path, before, after });
const engine = 'packages/shared/modules/matches/decisions.mjs';
const flow = 'packages/shared/modules/competitions/index.mjs';

test('ordinary repairs and documentation select smoke/targeted checks without real matches or seasons', () => {
  const p = classifyChanges([
    change('README.md', 'a', 'b'),
    change('packages/client/src/modules/players/Players.tsx', 'a', 'b'),
  ]);
  assert.equal(p.match, false);
  assert.equal(p.season, false);
  assert.ok(p.businessTests.includes('tests/players.test.mjs'));
  assert.ok(selectTiers(p).every((stage) => stage.fixtures));
});
test('only match algorithm changes enable real simulation, including rules and numeric parameters', () => {
  for (const p of [
    classifyChanges([change(engine, 'export const weight=0.065;', 'export const weight=0.07;')]),
    classifyChanges([
      change(
        'packages/shared/modules/matches/rules.mjs',
        'export const rule=1;',
        'export const rule=2;',
      ),
    ]),
    classifyChanges([
      change(
        'packages/shared/modules/players/match-state.mjs',
        'export function effectiveAbility(){return 1;}',
        'export function effectiveAbility(){return 2;}',
      ),
    ]),
    classifyChanges([
      change('packages/shared/modules/matches/parameters.json', '{"drag":1}', '{"drag":2}'),
    ]),
    classifyChanges([
      change(
        'packages/shared/modules/players/match-state.mjs',
        'const physical = new Set(["strength"]);',
        'const physical = new Set(["strength","stamina"]);',
      ),
    ]),
  ]) {
    assert.equal(p.match, true);
    assert.equal(p.season, false);
    assert.ok(selectTiers(p).some((s) => s.name === 'real match integration'));
  }
});
test('comments, formatting, error copy and decision explanations do not start simulations', () => {
  for (const [before, after] of [
    ['export const x=1;', '// explanation\nexport const x = 1;'],
    ["export const x={reason:'旧解释',value:1};", "export const x={reason:'新解释',value:1};"],
    ["export function a(){throw Error('old');}", "export function a(){throw Error('new');}"],
  ])
    assert.equal(classifyChanges([change(engine, before, after)]).match, false);
});
test('a major lifecycle change runs a real business season with controlled reports, not physics', () => {
  const p = classifyChanges([
    change(
      flow,
      'export function newSeason(){return 1;}',
      'export function newSeason(){return 2;}',
    ),
  ]);
  assert.equal(p.match, false);
  assert.equal(p.season, true);
  assert.equal(p.physicalSeason, false);
  assert.ok(selectTiers(p).find((s) => s.name.startsWith('complete business season')).fixtures);
  assert.ok(selectTiers(p).every((s) => s.fixtures));
});
test('when both change, a single physical season replaces the duplicate controlled game season', () => {
  const p = classifyChanges([
    change(engine, 'export const x=1;', 'export const x=2;'),
    change(flow, 'export const x=1;', 'export const x=2;'),
  ]);
  assert.equal(p.physicalSeason, true);
  assert.deepEqual(p.physicalSeasonTests, ['tests/season/game-season.test.mjs']);
  assert.ok(!p.businessSeasonTests.includes('tests/season/game-season.test.mjs'));
});
test('iteration mode never runs full match or season integrations and cannot masquerade as final validation', () => {
  const p = classifyChanges([
    change(engine, 'export const x=1;', 'export const x=2;'),
    change(flow, 'export const x=1;', 'export const x=2;'),
  ]);
  const stages = selectTiers(p, { quick: true });
  assert.ok(stages.some((s) => s.name === 'targeted match units'));
  assert.ok(stages.every((s) => !s.name.includes('season') && !s.name.includes('integration')));
});
test('editing simulation tests alone does not enable physics; an unsupported explicit tier is rejected', () => {
  const p = classifyChanges([change('tests/match/engine.test.mjs', '', 'test code')]);
  assert.equal(p.match, false);
  assert.throws(() => selectTiers(p, { only: 'match' }), /not enabled/);
});
test('Rapier upgrades trigger match checks; unrelated dependency changes do not', () => {
  const pkg = (v, react = '19') =>
    JSON.stringify({ dependencies: { '@dimforge/rapier3d-compat': v, react } });
  assert.equal(classifyChanges([change('package.json', pkg('0.21'), pkg('0.22'))]).match, true);
  assert.equal(
    classifyChanges([change('package.json', pkg('0.21'), pkg('0.21', '20'))]).match,
    false,
  );
});
test('major-flow declarations can raise scope but must name an actual changed runtime file', () => {
  const c = [
    change(
      'packages/shared/modules/training/index.mjs',
      'export const cost=1;',
      'export const cost=2;',
    ),
  ];
  assert.equal(
    classifyChanges(c, { annotations: [{ reason: '训练改为跨周日程', files: [c[0].path] }] })
      .season,
    true,
  );
  assert.throws(
    () => classifyChanges(c, { annotations: [{ reason: '', files: [] }] }),
    /annotation/,
  );
  assert.throws(() => classifyChanges(c, { majorFlow: true }), /reason/);
});
test('health metadata is ordinary; action routing or atomic settlement is major', () => {
  const path = 'packages/server/src/index.mjs';
  assert.equal(
    classifyChanges([change(path, "const version='1';", "const version='2';")]).season,
    false,
  );
  const before = "if(url.pathname === '/api/action'){applyAction(a,'train');}";
  const after = "if(url.pathname === '/api/action'){applyAction(a,'advance');}";
  assert.equal(classifyChanges([change(path, before, after)]).season, true);
  assert.equal(classifyChanges([change(path, before, before.replaceAll("'", '"'))]).season, false);
  const jobs = 'packages/server/src/match-jobs.mjs';
  assert.equal(
    classifyChanges([
      change(
        jobs,
        'class MatchJobs{received(){return 1;}}',
        'class MatchJobs{received(){return 2;}}',
      ),
    ]).season,
    true,
  );
});
test('every match and season test belongs to an explicit tier, so new files cannot disappear silently', () => {
  const files = (dir) =>
    readdirSync(new URL('./' + dir + '/', import.meta.url))
      .filter((p) => p.endsWith('.test.mjs'))
      .map((p) => `tests/${dir}/${p}`)
      .sort();
  assert.deepEqual([...matchUnits, ...matchScenarios].sort(), files('match'));
  assert.deepEqual([...seasonTests].sort(), files('season'));
});

test('world schema/calendar changes and checkpoint contracts enable a business season; balance/copy repairs do not', () => {
  const path = 'packages/shared/modules/world/index.mjs';
  const before =
    'export function createGame(){return {schemaVersion:3,round:0,season:1,cash:100};}';
  assert.equal(
    classifyChanges([change(path, before, before.replace('cash:100', 'cash:200'))]).season,
    false,
  );
  for (const after of [
    before.replace('schemaVersion:3', 'schemaVersion:4'),
    before.replace('round:0', 'round:1'),
    before.replace('cash:100', 'cash:100,newCalendar:[]'),
  ]) {
    const p = classifyChanges([change(path, before, after)]);
    assert.equal(p.season, true);
    assert.equal(p.match, false);
  }
  const p = classifyChanges([
    change(
      'packages/shared/modules/matches/checkpoint.mjs',
      'export const handles=[];',
      'export const handles=["body"];',
    ),
  ]);
  assert.equal(p.season, true);
  assert.equal(p.match, false);
});
