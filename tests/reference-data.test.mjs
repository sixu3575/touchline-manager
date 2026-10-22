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
