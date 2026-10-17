import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, simulate, applyAction } from '../packages/shared/game.mjs';
import {
  createMatchState,
  effectiveAbility,
  mentalModifier,
  matchShock,
  energyCost,
  joinClub,
  advanceAdaptation,
} from '../packages/shared/modules/players/index.mjs';
import {
  offsideSnapshot,
  offsideInvolvement,
  inPenaltyArea,
  foulAssessment,
  applyCard,
} from '../packages/shared/modules/matches/rules.mjs';
import { migrateState } from '../packages/server/src/storage/migrations.mjs';

test('mental caps, leader and resilience limits, fatigue monotonicity and trait zero effects', () => {
  const p = structuredClone(createGame().clubs[0].players[4]);
  p.matchState = createMatchState(p);
  Object.assign(p.matchState, { morale: 0, confidence: 0, adaptation: 0 });
  assert.equal(mentalModifier(p.matchState), -4);
  Object.assign(p.matchState, { morale: 100, confidence: 100, adaptation: 100 });
  assert.equal(mentalModifier(p.matchState), 3);
  const finishing = effectiveAbility(p, 'finishing');
  p.personality.loyalty = 0;
  p.personality.sociability = 0;
  p.wellbeing.clubAttachment = 0;
  p.publicProfile.popularity = 100;
  p.price = 999999;
  p.nationality = 'BR';
  assert.equal(effectiveAbility(p, 'finishing'), finishing);
  const strong = structuredClone(p),
    weak = structuredClone(p);
  strong.personality.resilience = 100;
  weak.personality.resilience = 0;
  Object.assign(strong.matchState, {
    confidence: 50,
    confidenceChange: 0,
    morale: 50,
    moraleChange: 0,
  });
  weak.matchState = structuredClone(strong.matchState);
  matchShock(strong, -2, -2, 100);
  matchShock(weak, -2, -2, 0);
  assert.equal(strong.matchState.morale, 48.3);
  assert.equal(strong.matchState.confidence, 49);
  assert.equal(weak.matchState.confidence, 47.5);
  for (let i = 0; i < 50; i++) matchShock(strong, -2, -2, 100);
  assert.equal(strong.matchState.moraleChange, -10);
  assert.equal(strong.matchState.confidenceChange, -10);
  for (const initial of [0, 100]) {
    const edge = structuredClone(p);
    Object.assign(edge.matchState, {
      morale: initial,
      confidence: initial,
      moraleChange: 0,
      confidenceChange: 0,
    });
    matchShock(edge, initial === 100 ? 20 : -20, initial === 100 ? 20 : -20);
    matchShock(edge, initial === 100 ? -40 : 40, initial === 100 ? -40 : 40);
    assert.ok(Math.abs(edge.matchState.morale - initial) <= 10);
    assert.ok(Math.abs(edge.matchState.confidence - initial) <= 10);
  }
  const fatigued = structuredClone(p);
  fatigued.matchState.energy = 20;
  assert.ok(effectiveAbility(fatigued, 'sprintSpeed') < effectiveAbility(p, 'sprintSpeed'));
  const low = structuredClone(p),
    high = structuredClone(p);
  low.attributes.stamina = 20;
  high.attributes.stamina = 90;
  assert.ok(energyCost(high, 8, 'high', true, 1) < energyCost(low, 8, 'high', true, 1));
  assert.equal(energyCost(high, 8, 'high', false, 1), energyCost(high, 8, 'high', true, 1) * 0.2);
});

test('adaptation migrates additively, advances only with calendar and is nationality independent', () => {
  const old = createGame(),
    history = structuredClone(old.reports);
  old.schemaVersion = 2;
  for (const p of [...old.clubs.flatMap((c) => c.players), ...old.market])
    delete p.wellbeing.adaptation;
  const before = structuredClone(old),
    { state, changed } = migrateState(old);
  assert.ok(changed);
  assert.deepEqual(old, before);
  assert.deepEqual(state.reports, history);
  assert.equal(state.cash, old.cash);
  assert.equal(state.revision, old.revision + 1);
  assert.ok(state.clubs.every((c) => c.players.every((p) => p.wellbeing.adaptation === 100)));
  assert.equal(migrateState(state).changed, false);
  const p = state.clubs[0].players[0];
  joinClub(p);
  assert.equal(p.wellbeing.adaptation, 70);
  const a = p.wellbeing.adaptation;
  applyAction(state, 'train', { focus: 'fitness' });
  assert.equal(p.wellbeing.adaptation, a);
  const comparison = structuredClone(state);
  comparison.clubs[0].players[0].nationality = 'ZZ';
  advanceAdaptation(state, 7);
  advanceAdaptation(comparison, 7);
  assert.equal(p.wellbeing.adaptation, comparison.clubs[0].players[0].wellbeing.adaptation);
  assert.equal(p.wellbeing.adaptation, 70 + 2 + 0.06 * p.personality.adaptability);
});

test('offside is frozen at touch, mirrors correctly, includes keeper and waits for involvement', () => {
  const a = { side: 0, player: { id: 'passer' }, pos: { x: 70, z: 34 } },
    receiver = { side: 0, player: { id: 'runner' }, pos: { x: 91, z: 34 } };
  const defenders = [
    { side: 1, player: { id: 'gk' }, pos: { x: 100, z: 34 } },
    { side: 1, player: { id: 'def' }, pos: { x: 90, z: 34 } },
  ];
  const all = [a, receiver, ...defenders],
    snapshot = offsideSnapshot(a, all, { x: 70, z: 34 }, 1);
  assert.ok(offsideInvolvement(snapshot, receiver));
  assert.equal(offsideInvolvement(snapshot, a), false);
  receiver.pos.x = 80;
  assert.ok(offsideInvolvement(snapshot, receiver), 'later run does not change frozen position');
  assert.equal(offsideInvolvement(offsideSnapshot(a, all, { x: 70, z: 34 }, 1), receiver), false);
  receiver.pos.x = 90;
  assert.equal(
    offsideInvolvement(offsideSnapshot(a, all, { x: 70, z: 34 }, 1), receiver),
    false,
    'level is onside',
  );
  receiver.pos.x = 91;
  for (const type of ['goalKick', 'throwIn', 'corner'])
    assert.equal(offsideSnapshot(a, all, { x: 70, z: 34 }, 1, type), null);
  const mirrored = structuredClone(all);
  for (const x of mirrored) x.pos.x = 105 - x.pos.x;
  assert.ok(
    offsideInvolvement(offsideSnapshot(mirrored[0], mirrored, { x: 35, z: 34 }, -1), mirrored[1]),
  );
  assert.ok(inPenaltyArea({ x: 16.5, z: 13.84 }, 1));
  assert.ok(inPenaltyArea({ x: 88.5, z: 54.16 }, -1));
  assert.equal(inPenaltyArea({ x: 17, z: 34 }, 1), false);
});

test('foul severity, penalty DOGSO, two yellows and direct red are distinct', () => {
  const base = { tackling: 50, late: 0.2, danger: 0.2, penalty: false };
  assert.equal(foulAssessment(base, 0.99).foul, false);
  assert.equal(foulAssessment(base, 0).card, null);
  assert.equal(foulAssessment({ ...base, danger: 0.6 }, 0).card, 'yellow');
  assert.equal(foulAssessment({ ...base, danger: 0.95, penalty: true }, 0).card, 'red');
  assert.equal(foulAssessment({ ...base, dogso: true }, 0).card, 'red');
  assert.equal(foulAssessment({ ...base, dogso: true, penalty: true }, 0).card, 'yellow');
  const a = { yellowCards: 0, sentOff: false };
  assert.equal(applyCard(a, 'yellow'), 'yellow');
  assert.equal(a.sentOff, false);
  assert.equal(applyCard(a, 'yellow'), 'secondYellow');
  assert.equal(a.sentOff, true);
  assert.equal(applyCard(a, 'red'), null);
});
