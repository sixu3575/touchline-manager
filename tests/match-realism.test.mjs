import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareMatchSampleToLeagueStats,
  compareMatch,
  trackedMovement,
  references,
} from './tools/match-realism.mjs';

function fixture() {
  const players = Array.from({ length: 22 }, (_, i) => ({
    id: 'p' + i,
    side: i < 11 ? 0 : 1,
    positionRole: i % 11 === 0 ? 'keeper' : 'centralMid',
  }));
  return {
    id: 'synthetic-measurement-only',
    engineVersion: 'measurement-fixture',
    seed: 42,
    score: [1, 1],
    events: [],
    snapshots: [0, 1].map((side) => ({
      tactics: { style: 'balanced' },
      players: players.filter((p) => p.side === side),
    })),
    stats: [0, 1].map(() => ({ passes: 400, completedPasses: 320, shots: 10, onTarget: 4, xg: 1 })),
    continuity: {
      controlledSeconds: [1400, 1400],
      flightSeconds: [400, 400],
      deadSeconds: 1600,
      looseSeconds: 100,
      contestedSeconds: 100,
      chains: [
        [1, 3, 5],
        [1, 3, 5],
      ],
      turnovers: { looseCarry: 500 },
    },
    performance: players.map((p) => ({
      ...p,
      distance: 10000,
      maxSpeed: 8,
      energy: 60,
      carryDistance: 100,
      passes: 40,
      completed: 32,
      tackles: 4,
      wonTackles: 2,
      dismissedAt: null,
    })),
    replay: {
      format: 'positions-u16-v1',
      stride: 49,
      sampleHz: 5,
      frameCount: 27001,
      duration: 5400,
      regulationDuration: 5400,
      players,
    },
  };
}
function trajectory(report) {
  const frames = new Uint16Array(49 * 27001);
  for (let n = 0; n < 27001; n++)
    for (let p = 0; p < 22; p++) {
      // A triangular 1m/s route, exact cm samples and turns at 50m: known distance.
      const t = n / 5,
        phase = t % 100;
      frames[n * 49 + p * 2] = Math.round((5 + (phase <= 50 ? phase : 100 - phase)) * 100);
      frames[n * 49 + p * 2 + 1] = 1500;
    }
  return frames;
}

test('England and Scotland league benchmark compares team statistics without a pass/fail gate', () => {
  const sample = [0, 1, 2].map((goals, index) => ({
    home: {
      goals,
      shots: 4 + index * 2,
      shotsOnTarget: 1 + index,
      fouls: 8 + index,
      corners: 2 + index,
      yellowCards: index,
      redCards: 0,
    },
    away: {
      goals: 1,
      shots: 6 + index * 2,
      shotsOnTarget: 2 + index,
      fouls: 9 + index,
      corners: 3 + index,
      yellowCards: 1,
      redCards: 0,
    },
  }));
  const result = compareMatchSampleToLeagueStats(sample);
  assert.equal(result.referenceVersion, 'realism-reference-2');
  assert.equal(result.status, 'descriptive-only');
  assert.equal(result.sample.matches, 3);
  assert.equal(result.sample.metrics.goals.matchTotal.mean, 2);
  assert.equal(result.sample.metrics.goals.matchTotal.sampleVariance, 1);
  assert.equal(result.sample.metrics.shots.matchTotal.mean, 14);
  assert.equal(result.sample.metrics.shots.matchTotal.sampleVariance, 16);
  assert.equal(result.comparisons.length, 8);
  assert.deepEqual(
    result.comparisons.map((row) => `${row.country}-${row.level}`),
    [
      'England-1',
      'England-2',
      'England-3',
      'England-4',
      'Scotland-1',
      'Scotland-2',
      'Scotland-3',
      'Scotland-4',
    ],
  );
  assert.equal(result.comparisons[0].name, 'Premier League');
  assert.equal(result.comparisons[0].referenceWindow, '2022-23 through 2024-25');
  assert.ok('corners' in result.comparisons[0].metrics);
  assert.ok('yellowCards' in result.comparisons[0].metrics);
  assert.throws(() => compareMatchSampleToLeagueStats(sample.slice(0, 1)), /At least two/);
  const invalid = structuredClone(sample);
  invalid[1].home.shots = 1.5;
  assert.throws(() => compareMatchSampleToLeagueStats(invalid), /integer/);
  assert.equal(references.englishLeagueStats.source, 'https://football-data.co.uk/');
});

test('tracking separates speed zones, excludes cut intervals and respects dismissal time', () => {
  const r = fixture(),
    frames = trajectory(r);
  r.performance[1].dismissedAt = 2700;
  frames[500 * 49 + 47] = 1;
  const t = trackedMovement(r, frames);
  assert.ok(Math.abs(t.players[0].metres - 5399.6) < 0.001);
  assert.ok(Math.abs(t.players[1].metres - 2699.6) < 0.001);
  assert.ok(Math.abs(t.players[0].zones[0] - t.players[0].metres) < 0.001);
  assert.equal(t.players[0].zones[4], 0);
  assert.throws(() => trackedMovement(r, frames.slice(49)), /geometry/);
});

test('comparisons preserve source reports and flag both team and individual extreme loads', () => {
  const r = fixture();
  r.stats[0].shots = 48;
  r.score[0] = 14;
  r.events = Array.from({ length: 37 }, (_, i) => ({
    second: i * 30,
    type: 'shot',
    playerId: 'p9',
    side: 0,
    quality: { pressure: 0 },
  }));
  r.performance[9].tackles = 37;
  const before = structuredClone(r),
    result = compareMatch(r);
  assert.deepEqual(r, before);
  assert.equal(result.status, 'blocked');
  for (const metric of [
    'shots-extreme',
    'goals-extreme',
    'shotsPer90-extreme',
    'tacklesPer90-extreme',
  ])
    assert.ok(
      result.alerts.some((a) => a.metric === metric && a.severity === 'block'),
      metric,
    );
  assert.ok(result.alerts.some((a) => a.metric === 'tracking:missing'));
  assert.equal(result.players[9].shots, 37);
  assert.equal(
    result.match.eventSpells.openTurnovers,
    0,
    'looseCarry is not an opposing possession',
  );
  assert.equal(references.physical.positions.striker[4], 141);
});

test('unknown tracking, incomplete games and missing numerical measurements cannot silently pass', () => {
  const r = fixture(),
    frames = trajectory(r);
  assert.throws(() => compareMatch({ ...r, testFixture: true }), /not physical evidence/);
  r.replay.format = 'unknown';
  assert.throws(() => compareMatch(r, { trajectory: frames }), /geometry/);
  r.continuity.deadSeconds = 10;
  assert.throws(() => compareMatch(r), /90 minutes/);
  r.continuity.deadSeconds = 1600;
  delete r.performance[1].maxSpeed;
  assert.ok(
    compareMatch(r).alerts.some((a) => a.metric === 'maxKmh:missing' && a.severity === 'block'),
  );
});
