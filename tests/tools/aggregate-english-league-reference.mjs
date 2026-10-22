// Rebuilds the versioned English league goals reference from locally downloaded
// OpenFootball source snapshots. It is offline, read-only with respect to game
// code, and never changes simulator behavior or player-facing statistics.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { format, resolveConfig } from 'prettier';

export const source = {
  repository: 'https://github.com/openfootball/england',
  commit: '9ee7a0c351805c99cc334478a9bf04b7d0432fec',
  license: 'CC0-1.0',
};

export const seasons = [
  '2015-16',
  '2016-17',
  '2017-18',
  '2018-19',
  '2022-23',
  '2023-24',
  '2024-25',
];
export const recentSeasons = ['2022-23', '2023-24', '2024-25'];

export const leagues = [
  { level: 1, code: '1-premierleague', name: 'Premier League', expectedMatches: 380 },
  { level: 2, code: '2-championship', name: 'Championship', expectedMatches: 552 },
  { level: 3, code: '3-league1', name: 'League One', expectedMatches: 552 },
  { level: 4, code: '4-league2', name: 'League Two', expectedMatches: 552 },
  { level: 5, code: '5-nationalleague', name: 'National League', expectedMatches: 552 },
];

const roundHeader = /^\s*▪\s*(.*?)\s*$/;
const regularRound = /^(?:Regular Season|Regular, Matchday|Matchday|\d+\.\s+Round)\b/i;
const scorePattern = /\b(\d{1,2})-(\d{1,2})(?:\s+\(\d{1,2}-\d{1,2}\))?(?=\s|$)/g;

export function extractRegularScores(text) {
  let inRegularSeason = false;
  const scores = [];
  for (const line of text.split(/\r?\n/)) {
    const header = line.match(roundHeader);
    if (header) {
      inRegularSeason = regularRound.test(header[1].trim());
      continue;
    }
    if (!inRegularSeason) continue;
    for (const match of line.matchAll(scorePattern)) {
      scores.push([Number(match[1]), Number(match[2])]);
    }
  }
  return scores;
}

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const mean = (values) => values.reduce((total, value) => total + value, 0) / values.length;

function moments(values) {
  const average = mean(values);
  const sampleVariance =
    values.reduce((total, value) => total + (value - average) ** 2, 0) / (values.length - 1);
  return {
    mean: Number(average.toFixed(4)),
    sampleVariance: Number(sampleVariance.toFixed(4)),
    standardDeviation: Number(Math.sqrt(sampleVariance).toFixed(4)),
  };
}

function summarise(matches) {
  if (matches.length < 2) throw Error('At least two regular-season scores are required');
  const home = matches.map(([homeGoals]) => homeGoals);
  const away = matches.map(([, awayGoals]) => awayGoals);
  const total = matches.map(([homeGoals, awayGoals]) => homeGoals + awayGoals);
  const counts = Array(9).fill(0);
  for (const goals of total) counts[Math.min(goals, 8)]++;
  return {
    matches: matches.length,
    totalGoals: moments(total),
    homeGoals: moments(home),
    awayGoals: moments(away),
    resultRates: {
      homeWin: Number((matches.filter(([h, a]) => h > a).length / matches.length).toFixed(4)),
      draw: Number((matches.filter(([h, a]) => h === a).length / matches.length).toFixed(4)),
      awayWin: Number((matches.filter(([h, a]) => h < a).length / matches.length).toFixed(4)),
    },
    totalGoalsHistogram: counts.map((count, index) => ({
      goals: index === 8 ? '8+' : index,
      count,
    })),
  };
}

export function aggregateReference(sourceDir) {
  const manifest = [];
  const leagueResults = leagues.map((league) => {
    const seasonRows = seasons.map((season) => {
      const file = resolve(sourceDir, `${season}-${league.code}.txt`);
      const text = readFileSync(file, 'utf8');
      const scores = extractRegularScores(text);
      if (scores.length !== league.expectedMatches) {
        throw Error(
          `${basename(file)}: expected ${league.expectedMatches} regular matches, found ${scores.length}`,
        );
      }
      manifest.push({
        season,
        league: league.name,
        expectedRegularMatches: league.expectedMatches,
        scoredRegularMatches: scores.length,
        sha256: sha256(text),
        sourceUrl: `${source.repository}/blob/${source.commit}/${season}/${league.code}.txt`,
      });
      return { season, matches: scores, statistics: summarise(scores) };
    });
    const allScores = seasonRows.flatMap((row) => row.matches);
    return {
      level: league.level,
      name: league.name,
      recentWindow: `${recentSeasons[0]} through ${recentSeasons.at(-1)}`,
      recentStatistics: summarise(
        seasonRows
          .filter((row) => recentSeasons.includes(row.season))
          .flatMap((row) => row.matches),
      ),
      longWindow: '2015-16 through 2018-19 plus 2022-23 through 2024-25',
      longWindowStatistics: summarise(allScores),
      seasons: seasonRows.map(({ season, statistics }) => ({ season, ...statistics })),
    };
  });

  return {
    referenceVersion: 'english-league-results-1',
    scope: 'English men’s football pyramid levels 1–5; regular league fixtures only.',
    source: {
      ...source,
      licenseUrl: `${source.repository}/blob/${source.commit}/LICENSE.md`,
      dataDescription:
        'Fixtures, full-time scores and, where present, half-time scores; no event or tracking statistics.',
    },
    method: {
      seasons,
      recentSeasons,
      excludedSeasons: {
        '2019-20': 'Interrupted COVID season; not a complete common five-tier sample.',
        '2020-21': 'National League regular season was incomplete.',
        '2021-22': 'National League regular season source has only 506 of 552 scores.',
        '2025-26': 'League One, League Two and National League source files are incomplete.',
      },
      playoffs: 'Excluded by reading only regular-season matchday sections.',
      score:
        'Full-time 90-minute result as recorded by the source; extra-time cup results are out of scope.',
      variance:
        'Unbiased match-level sample variance with denominator n−1; season samples are pooled by match, not by season mean.',
      rounding: 'Aggregate values rounded to 4 decimal places; rates are fractions from 0 to 1.',
    },
    leagues: leagueResults,
    manifest,
    limitations: [
      'This is an England top-five-level results sample, not all UK nations or the full English pyramid.',
      'Results data supports goals and home/draw/away outcomes only; it cannot validate passes, shots, xG, possession, duels, tackles, saves, player ratings, or running distances.',
      'These figures are offline validation references, not in-game caps, target quotas, or instructions to alter individual decisions.',
      'League level and season strength differ; compare against the intended tier and inspect match-level distributions rather than forcing every game toward the pooled mean.',
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [sourceDir, outputPath] = process.argv.slice(2);
  if (!sourceDir || !outputPath) {
    throw Error(
      'Usage: node tests/tools/aggregate-english-league-reference.mjs <source-dir> <output-json>',
    );
  }
  const output = resolve(outputPath);
  const json = JSON.stringify(aggregateReference(resolve(sourceDir)), null, 2);
  const config = (await resolveConfig(output)) ?? {};
  writeFileSync(output, await format(json, { ...config, parser: 'json' }));
  process.stdout.write(`Wrote ${output}\n`);
}
