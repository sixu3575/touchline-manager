import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
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
import {
  fcAttributes,
  fcPositionLineup,
  FC_DIRECT_ATTRIBUTES,
  FC_PROXY_ATTRIBUTES,
} from './tools/fc-fixtures.mjs';

test('FC benchmark respects declared positional roles instead of making a high-rated winger the sole striker', () => {
  const positions = ['GK', 'LB', 'CB', 'CB', 'RB', 'CDM', 'CM', 'CM', 'LW', 'RW', 'ST', 'RW'];
  const rows = positions.map((player_positions, index) => ({
    player_positions,
    overall: String(index === 11 ? 95 : index === 10 ? 70 : 80),
  }));
  const before = structuredClone(rows),
    result = fcPositionLineup(rows, '4-3-3');
  assert.equal(result.length, 11);
  assert.equal(new Set(result.map((r) => r.playerIndex)).size, 11);
  assert.equal(
    rows[result.find((r) => r.positionRole === 'striker').playerIndex].player_positions,
    'ST',
  );
  assert.ok(result.some((r) => r.playerIndex === 11 && r.positionRole === 'winger'));
  assert.equal(
    rows[result.find((r) => r.positionRole === 'holdingMid').playerIndex].player_positions,
    'CDM',
  );
  assert.ok(result.every((r) => !r.fallback));
  assert.deepEqual(rows, before);
});
import { createGame } from '../packages/shared/game.mjs';

test('FC benchmark maps all thirty integer inputs, identifies proxies and refuses missing measurements', () => {
  const row = Object.fromEntries(
    [
      ...Object.values(FC_DIRECT_ATTRIBUTES),
      'movement_reactions',
      'goalkeeping_positioning',
      'goalkeeping_diving',
      'mentality_interceptions',
      'power_jumping',
    ].map((k) => [k, '62']),
  );
  row.attacking_finishing = '85';
  row.defending_standing_tackle = '31';
  const before = structuredClone(row),
    result = fcAttributes(row, 'FWD');
  const keys = Object.keys(createGame().clubs[0].players[0].attributes).sort();
  assert.deepEqual(Object.keys(result).sort(), keys);
  assert.equal(Object.keys(FC_DIRECT_ATTRIBUTES).length, 22);
  assert.equal(FC_PROXY_ATTRIBUTES.length, 8);
  assert.equal(result.finishing, 85);
  assert.equal(result.tackling, 31);
  for (const value of Object.values(result))
    assert.ok(Number.isInteger(value) && value >= 1 && value <= 100);
  assert.deepEqual(row, before);
  assert.throws(() => fcAttributes({ ...row, mentality_vision: '' }, 'MID'), /Missing FC/);
  assert.throws(() => fcAttributes({ ...row, goalkeeping_reflexes: null }, 'GK'), /Missing FC/);
});

test('rated real-match reference preserves edition, complete XI, missing coverage and separate FM context', () => {
  const r = JSON.parse(
    readFileSync(
      new URL(
        '../packages/shared/modules/matches/design/FC_FM_STRENGTH_REFERENCE_20261028.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  assert.equal(new Set(r.matches.map((m) => m.id)).size, r.coverage.matches);
  assert.equal(r.matches.filter((m) => m.family === 'league').length, r.coverage.leagues);
  assert.ok(r.matches.some((m) => m.competition === 'UEFA Champions League'));
  for (const m of r.matches) {
    assert.ok(m.date >= r.ratingSources.editions[m.edition].available);
    assert.ok(m.ratingDate <= m.date);
    assert.match(r.sources[m.sourceFile].sha256, /^[a-f0-9]{64}$/);
    if (m.family === 'cup') assert.doesNotMatch(m.status, /AET|EXTRA|OVERTIME/);
    if (m.ratings.actualXI)
      for (const side of m.lineupCoverage) {
        assert.equal(side.starters, 11);
        assert.equal(side.matched, 11);
        assert.equal(new Set(side.players.map((p) => p.fcPlayerId)).size, 11);
      }
  }
  const league = r.groups['league/teamOVR/noRed/10-14'];
  assert.ok(league.matches > 100);
  assert.equal(league.strong.passes.n, 0);
  assert.equal(
    league.strong.passes.mean,
    null,
    'unavailable league pass counts are not zero passes',
  );
  const rows = r.matches.filter(
    (m) =>
      m.family === 'league' &&
      m.ratings.teamOVR &&
      Math.abs(m.ratings.teamOVR[0] - m.ratings.teamOVR[1]) >= 10 &&
      Math.abs(m.ratings.teamOVR[0] - m.ratings.teamOVR[1]) < 15 &&
      m.stats.every((s) => s.redCards === 0),
  );
  const shots = rows.map((m) => m.stats[m.ratings.teamOVR[0] > m.ratings.teamOVR[1] ? 0 : 1].shots);
  const mean = shots.reduce((a, b) => a + b, 0) / shots.length;
  assert.ok(Math.abs(mean - league.strong.shots.mean) < 1e-10);
  assert.ok(
    Math.abs(
      shots.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (shots.length - 1) -
        league.strong.shots.sampleVariance,
    ) < 1e-10,
  );
  const newport = r.matches.find((m) => m.id === 'espn-eng.fa-694704');
  assert.deepEqual(newport.ratings.teamOVR, [60, 82]);
  assert.ok(newport.ratings.actualXI[1] < 81, 'the actual rotated XI is distinct from team OVR');
  assert.equal(newport.stats[0].passes, 220);
  assert.ok(r.fmCrosscheck.teams.length >= 6);
  assert.match(r.fmCrosscheck.scope, /never.*CA/i);
  assert.ok(r.fmCrosscheck.matchedPairs.every((p) => p.fmCommunityRating.length === 2));
});

test('international cup reference keeps regulation events, source provenance and comparable strength groups', () => {
  const ref = JSON.parse(
    readFileSync(
      new URL(
        '../packages/shared/modules/matches/design/INTERNATIONAL_CUP_REFERENCE_20261028.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  assert.match(ref.sourceCommit, /^[a-f0-9]{40}$/);
  assert.equal(new Set(ref.matches.map((m) => m.id)).size, 211);
  const counts = Object.fromEntries(
    ['World Cup 2018', 'World Cup 2022', 'Euro 2024', 'Copa America 2024'].map((label) => [
      label,
      ref.matches.filter((m) => m.competition === label).length,
    ]),
  );
  assert.deepEqual(Object.values(counts), [64, 64, 51, 32]);
  for (const m of ref.matches) {
    assert.match(m.sourceSha256, /^[a-f0-9]{64}$/);
    for (const row of m.regulation) {
      assert.ok(row.onTarget <= row.shots && row.completedPasses <= row.passes);
      assert.ok(row.outsideBoxShots <= row.shots && row.penaltyShots <= row.shots);
    }
    for (const excluded of ['Qatar', 'Russia', 'Wales', 'Australia', 'Costa Rica']) {
      if (m.competition !== 'World Cup 2022' && excluded !== 'Russia') continue;
      const side = m.teams.indexOf(excluded);
      if (side >= 0)
        assert.equal(m.seedPots[side], null, 'hosts/playoff slots do not express ranking strength');
    }
  }
  const mismatches = ref.matches.filter((m) => !m.hadRedCard && m.seedPotGap >= 2);
  assert.equal(mismatches.length, 41);
  const shots = mismatches.map((m) => m.regulation[m.strongSide].shots);
  const mean = shots.reduce((s, n) => s + n, 0) / shots.length;
  const variance = shots.reduce((s, n) => s + (n - mean) ** 2, 0) / (shots.length - 1);
  assert.equal(ref.groups.worldCupPotGap2PlusNoRed.strong.shots.mean, mean);
  assert.equal(ref.groups.worldCupPotGap2PlusNoRed.strong.shots.sampleVariance, variance);
});

test('Football-Data aggregator covers England and Scotland, preserving per-stat missingness', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'touchline-football-data-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const header = 'FTHG,FTAG,HS,AS,HST,AST,HF,AF,HC,AC,HY,AY,HR,AR';
  for (const season of footballSeasons) {
    for (const league of footballLeagues) {
      const lines = [header];
      for (let row = 0; row < league.expectedMatches; row++) {
        const fields = [row % 2, 1, 4 + (row % 2), 6, 2, 3, 8, 9, 3, 4, 1, 0, 0, 0];
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
  assert.equal(
    reference.manifest.reduce((total, file) => total + file.matches, 0),
    8412,
  );
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
