import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../../packages/shared/game.mjs';
import { createMatchSimulation } from '../../packages/shared/modules/matches/index.mjs';
import { buildPlayerRatings } from '../../packages/shared/modules/matches/ratings/index.mjs';

test('live 5-4-1 reassigns all eleven roles and survives a durable restart', () => {
  const game = createGame('五后卫临场', 42),
    originalRoles = game.clubs[0].players.map((p) => p.role);
  const options = { durationSeconds: 3, sliceSeconds: 1, durable: true };
  const engine = createMatchSimulation(game.clubs[0], game.clubs[1], 771, 'live-541', options);
  engine.next();
  const changed = engine.next([
    {
      id: 'live-five-four-one',
      version: 1,
      side: 0,
      type: 'tactics',
      formation: '5-4-1',
      style: 'counter',
      press: 'low',
    },
  ]);
  const event = changed.value.report.events.find((e) => e.type === 'tacticalChange');
  assert.deepEqual(
    ['GK', 'DEF', 'MID', 'FWD'].map(
      (role) => event.assignments.filter((a) => a.role === role).length,
    ),
    [1, 5, 4, 1],
  );
  assert.deepEqual(
    game.clubs[0].players.map((p) => p.role),
    originalRoles,
    'tactical duties do not rewrite a player identity',
  );
  const checkpoint = structuredClone(changed.value.checkpoint);
  const expected = engine.next();
  engine.return();
  const source = createGame('五后卫临场', 42);
  const restored = createMatchSimulation(source.clubs[0], source.clubs[1], 771, 'live-541', {
    ...options,
    checkpoint,
  });
  const actual = restored.next();
  restored.return();
  assert.equal(actual.done, true);
  assert.deepEqual(actual.value, expected.value);
});

test('live formation and substitution commands alter simulation, roles, replay and ratings across checkpoint restore', () => {
  const source = createGame('临场指挥模拟', 42),
    home = structuredClone(source.clubs[0]),
    away = structuredClone(source.clubs[1]),
    outgoingId = home.lineup.find(
      (id) => home.players.find((player) => player.id === id).role === 'FWD',
    ),
    outgoing = home.players.find((player) => player.id === outgoingId),
    incoming = home.players.find(
      (player) => player.role === outgoing.role && !home.lineup.includes(player.id),
    );
  assert.ok(incoming, 'the lineup has a same-position substitute');
  const tactics = {
      id: 'live-tactics-0001',
      version: 1,
      side: 0,
      type: 'tactics',
      formation: '3-5-2',
      style: 'counter',
      press: 'high',
    },
    substitution = {
      id: 'live-substitution-01',
      version: 1,
      side: 0,
      type: 'substitution',
      playerOutId: outgoing.id,
      playerInId: incoming.id,
    };
  const create = (h, a) =>
    createMatchSimulation(h, a, 991, 'live-command-match', {
      durationSeconds: 4,
      sliceSeconds: 1,
      durable: true,
    });

  let engine = create(home, away);
  const first = engine.next(),
    second = engine.next([tactics]),
    third = engine.next([substitution]);
  assert.equal(first.value.second, 1);
  const change = second.value.report.events.find((event) => event.type === 'tacticalChange');
  assert.equal(change.formation, '3-5-2');
  assert.equal(second.value.managerState[0].tactics.style, 'counter');
  assert.deepEqual(
    Object.fromEntries(
      ['GK', 'DEF', 'MID', 'FWD'].map((role) => [
        role,
        change.assignments.filter((assignment) => assignment.role === role).length,
      ]),
    ),
    { GK: 1, DEF: 3, MID: 5, FWD: 2 },
    'changing formation reassigns all eleven tactical roles rather than only changing its label',
  );
  const substitutionEvent = third.value.report.events.find(
    (event) => event.type === 'substitution',
  );
  assert.equal(substitutionEvent.outgoing.id, outgoing.id);
  assert.equal(substitutionEvent.incoming.id, incoming.id);
  assert.equal(third.value.managerState[0].lineup.includes(incoming.id), true);
  assert.equal(third.value.managerState[0].lineup.includes(outgoing.id), false);

  const checkpoint = third.value.checkpoint;
  engine.return();
  const resumed = create(structuredClone(source.clubs[0]), structuredClone(source.clubs[1]));
  resumed.next();
  resumed.next([tactics]);
  resumed.next([substitution]);
  const expected = resumed.next();
  const recoveredEngine = createMatchSimulation(
    structuredClone(source.clubs[0]),
    structuredClone(source.clubs[1]),
    991,
    'live-command-match',
    { durationSeconds: 4, sliceSeconds: 1, durable: true, checkpoint },
  );
  const recovered = recoveredEngine.next();
  assert.equal(expected.done, true);
  assert.equal(recovered.done, true);
  assert.deepEqual(
    recovered.value,
    expected.value,
    'a committed live command survives worker restart',
  );
  assert.equal(recovered.value.snapshots[0].tactics.formation, '4-4-2');
  assert.equal(recovered.value.replay.players[substitutionEvent.slotIndex].id, outgoing.id);
  const playerRatings = buildPlayerRatings(recovered.value);
  assert.ok(playerRatings.rows.some((row) => row.id === incoming.id));
  assert.ok(recovered.value.performance.find((row) => row.id === outgoing.id).minutes > 0);
  assert.ok(recovered.value.performance.find((row) => row.id === incoming.id).minutes > 0);
  resumed.return();
  recoveredEngine.return();
});
