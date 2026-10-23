import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { referenceMatch } from './tools/real-football-reference.mjs';
import {
  aggregateReference,
  leagues as footballLeagues,
  seasons as footballSeasons,
} from './tools/aggregate-england-scotland-reference.mjs';
import { summarizeWyscoutCompetition } from './tools/aggregate-wyscout-reference.mjs';
import { aggregateEuropeanLeagueStats } from './tools/aggregate-european-league-stats.mjs';

test('Football-Data aggregator covers England and Scotland, preserving per-stat missingness', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'touchline-football-data-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const header =
    'FTHG,FTAG,HS,AS,HST,AST,HF,AF,HC,AC,HY,AY,HR,AR';
  for (const season of footballSeasons) {
    for (const league of footballLeagues) {
      const lines = [header];
      for (let row = 0; row < league.expectedMatches; row++) {
        const fields = [
          row % 2,
          1,
          4 + (row % 2),
          6,
          2,
          3,
          8,
          9,
          3,
          4,
          1,
          0,
          0,
          0,
        ];
        if (season.code === '2425' && league.code === 'SC2' && row === 0)
          for (const index of [2, 3, 4, 5, 6, 7, 8, 9]) fields[index] = '';
        lines.push(fields.join(','));
      }
      writeFileSync(join(dir, `${season.code}-${league.code}.csv`), lines.join('\n'));
    }
  }
  const reference = aggregateReference(dir);
  assert.equal(reference.leagues.length, 8);
  assert.equal(reference.manifest.length, 24);
  assert.equal(reference.manifest.reduce((total, file) => total + file.matches, 0), 8412);
  const scottishLeagueOne = reference.leagues.find(
    (league) => league.country === 'Scotland' && league.code === 'SC2',
  );
  assert.equal(scottishLeagueOne.recentStatistics.matches, 540);
  assert.equal(scottishLeagueOne.recentStatistics.metrics.goals.matches, 540);
  assert.equal(scottishLeagueOne.recentStatistics.metrics.shots.matches, 539);
  assert.equal(scottishLeagueOne.recentStatistics.metrics.corners.matches, 539);
  assert.equal(scottishLeagueOne.recentStatistics.metrics.yellowCards.matches, 540);
});

test('European league aggregate keeps variance, country rows, and metric-level missingness separate', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'touchline-europe-football-data-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(
    join(dir, '2425-D1.csv'),
    [
      'FTHG,FTAG,HS,AS,HST,AST,HF,AF,HC,AC,HY,AY,HR,AR',
      '1,0,10,7,4,2,11,9,5,3,2,1,0,0',
      '2,2,,8,5,4,13,10,4,4,1,2,0,0',
      '0,1,8,6,2,3,12,12,2,4,0,1,0,0',
    ].join('\n'),
  );
  const reference = aggregateEuropeanLeagueStats(dir);
  assert.equal(reference.competitions.length, 1);
  assert.equal(reference.manifest.length, 1);
  assert.equal(reference.method.representedCountries[0], 'Germany');
  const bundesliga = reference.competitions[0];
  assert.equal(bundesliga.pooled.metrics.goals.matches, 3);
  assert.equal(bundesliga.pooled.metrics.goals.teamPerMatch.mean, 1);
  assert.equal(bundesliga.pooled.metrics.goals.matchTotal.sampleVariance, 3);
  assert.equal(bundesliga.pooled.metrics.shots.matches, 2);
  assert.equal(bundesliga.pooled.metrics.shots.coverage, 0.6667);
  assert.equal(reference.manifest[0].metricMatchCounts.shots, 2);
  assert.equal(reference.scope.includes('no odds fields are read'), true);
});

test('real reference uses provider possessions and regulation periods, not opposing pressure as a turnover', () => {
  const e = (type, second, changes = {}) => ({
    type: { name: type },
    timestamp: `00:00:${String(second).padStart(2, '0')}.000`,
    period: 1,
    possession: 1,
    team: { id: 1 },
    possession_team: { id: 1 },
    ...changes,
  });
  const result = referenceMatch([
    e('Half Start', 0),
    e('Pass', 2, { duration: 1, pass: {} }),
    e('Pressure', 3, { team: { id: 2 } }),
    e('Carry', 4, { duration: 2 }),
    e('Pass', 7, { duration: 1, pass: {} }),
    e('Pass', 9, {
      possession: 2,
      team: { id: 2 },
      possession_team: { id: 2 },
      duration: 1,
      pass: { outcome: { name: 'Incomplete' } },
    }),
    e('Half End', 12),
    e('Shot', 3, { period: 3, shot: { outcome: { name: 'Goal' } } }),
  ]);
  assert.equal(result.possessionCount, 2);
  assert.equal(result.passes, 3);
  assert.deepEqual(result.positiveChains, [2]);
  assert.equal(result.phaseSeconds, 7);
  assert.equal(result.durationSeconds, 12);
  assert.equal(result.shots, 0, 'extra time is excluded');
});

test('Wyscout event aggregation separates teams, uses provider tags, and excludes extra time', () => {
  const match = (wyId, homeGoals, awayGoals) => ({
    wyId,
    status: 'Played',
    teamsData: {
      10: { teamId: 10, side: 'home', score: homeGoals },
      20: { teamId: 20, side: 'away', score: awayGoals },
    },
  });
  const event = (matchId, teamId, eventName, subEventName, tags = [], matchPeriod = '1H') => ({
    matchId,
    teamId,
    eventName,
    subEventName,
    tags: tags.map((id) => ({ id })),
    matchPeriod,
  });
  const result = summarizeWyscoutCompetition(
    [match(1, 1, 0), match(2, 2, 1)],
    [
      event(1, 10, 'Pass', 'Simple pass', [1801]),
      event(1, 10, 'Pass', 'Cross', [1802]),
      event(1, 10, 'Shot', 'Shot', [101, 1801]),
      event(1, 20, 'Shot', 'Shot', [2101]),
      event(1, 20, 'Foul', 'Foul', [1702]),
      event(1, 10, 'Free Kick', 'Corner'),
      event(1, 20, 'Save attempt', 'Save attempt'),
      event(1, 10, 'Duel', 'Ground attacking duel', [703]),
      event(1, 20, 'Duel', 'Ground defending duel', [703]),
      event(1, 20, 'Interruption', 'Interception', [1401, 1701]),
      event(1, 20, 'Others on the ball', 'Clearance'),
      event(1, 10, 'Pass', 'Simple pass', [1801], 'E1'),
    ],
    { country: 'Test', competition: 'Test Cup', season: 'test' },
  );
  assert.equal(result.matches, 2);
  assert.equal(result.teamMatch.goals.n, 4);
  assert.equal(result.teamMatch.goals.mean, 1);
  assert.equal(result.matchTotal.goals.mean, 2);
  assert.equal(result.matchTotal.goals.sampleVariance, 2);
  assert.equal(result.teamMatch.passesAttempted.mean, 0.5);
  assert.equal(result.teamMatch.passesCompleted.mean, 0.25);
  assert.equal(result.matchTotal.shots.mean, 1);
  assert.equal(result.matchTotal.shotsOnTarget.mean, 0.5);
  assert.equal(result.matchTotal.fouls.mean, 0.5);
  assert.equal(result.matchTotal.corners.mean, 0.5);
  assert.equal(result.matchTotal.yellowCards.mean, 0.5);
  assert.equal(result.matchTotal.redCards.mean, 0.5);
  assert.equal(result.matchTotal.saves.mean, 0.5);
  assert.equal(result.matchTotal.attackingDuels.mean, 0.5);
  assert.equal(result.matchTotal.wonDefendingDuels.mean, 0.5);
  assert.equal(result.matchTotal.interceptions.mean, 0.5);
  assert.equal(result.matchTotal.clearances.mean, 0.5);
  assert.equal(result.scope.includes('extra time and penalties excluded'), true);
});
