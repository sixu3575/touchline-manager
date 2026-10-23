// Rebuilds a private, read-only English league match-statistics benchmark from
// Football-Data CSVs. Raw downloads remain outside Git under ignored work/.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { format, resolveConfig } from 'prettier';

export const source = {
  website: 'https://football-data.co.uk/',
  downloadPages: [
    'https://football-data.co.uk/englandm.php',
    'https://football-data.co.uk/scotlandm.php',
  ],
  fieldNotes: 'https://football-data.co.uk/notes.txt',
  fairUsePolicy: 'https://football-data.co.uk/contact.php',
};

export const seasons = [
  { name: '2022-23', code: '2223' },
  { name: '2023-24', code: '2324' },
  { name: '2024-25', code: '2425' },
];

export const leagues = [
  { country: 'England', level: 1, code: 'E0', name: 'Premier League', expectedMatches: 380 },
  { country: 'England', level: 2, code: 'E1', name: 'Championship', expectedMatches: 552 },
  { country: 'England', level: 3, code: 'E2', name: 'League One', expectedMatches: 552 },
  { country: 'England', level: 4, code: 'E3', name: 'League Two', expectedMatches: 552 },
  { country: 'Scotland', level: 1, code: 'SC0', name: 'Premiership', expectedMatches: 228 },
  { country: 'Scotland', level: 2, code: 'SC1', name: 'Championship', expectedMatches: 180 },
  { country: 'Scotland', level: 3, code: 'SC2', name: 'League One', expectedMatches: 180 },
  { country: 'Scotland', level: 4, code: 'SC3', name: 'League Two', expectedMatches: 180 },
];

export const metrics = {
  goals: { home: 'FTHG', away: 'FTAG' },
  shots: { home: 'HS', away: 'AS' },
  shotsOnTarget: { home: 'HST', away: 'AST' },
  fouls: { home: 'HF', away: 'AF' },
  corners: { home: 'HC', away: 'AC' },
  yellowCards: { home: 'HY', away: 'AY' },
  redCards: { home: 'HR', away: 'AR' },
};

const round4 = (value) => Number(value.toFixed(4));
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const mean = (values) => values.reduce((total, value) => total + value, 0) / values.length;

function moments(values) {
  if (values.length < 2) throw Error('At least two values are required for a sample variance');
  const average = mean(values);
  const sampleVariance =
    values.reduce((total, value) => total + (value - average) ** 2, 0) / (values.length - 1);
  return {
    mean: round4(average),
    sampleVariance: round4(sampleVariance),
    standardDeviation: round4(Math.sqrt(sampleVariance)),
  };
}

// Football-Data files use one CSV record per line. Parse quoted commas and
// escaped double quotes so a future team-name change cannot shift columns.
function parseCsvLine(line) {
  const fields = [];
  let field = '',
    quoted = false;
  for (let i = 0; i < line.length; i++) {
    const character = line[i];
    if (character === '"') {
      if (quoted && line[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      fields.push(field);
      field = '';
    } else field += character;
  }
  if (quoted) throw Error('Unterminated quoted CSV field');
  fields.push(field);
  return fields;
}

function readCsv(path) {
  const sourceText = readFileSync(path, 'utf8');
  const text = sourceText.replace(/^\uFEFF/, '').trimEnd();
  const lines = text.split(/\r?\n/);
  const headers = parseCsvLine(lines.shift());
  return {
    sourceText,
    rows: lines
      .filter((line) => line.trim())
      .map((line, index) => {
        const fields = parseCsvLine(line);
        if (fields.length !== headers.length)
          throw Error(`${basename(path)}:${index + 2}: expected ${headers.length} columns, got ${fields.length}`);
        return Object.fromEntries(headers.map((header, column) => [header, fields[column].trim()]));
      }),
  };
}

function readInteger(row, column, file) {
  const value = row[column];
  if (!/^-?\d+$/.test(value ?? '')) throw Error(`${file}: missing or invalid ${column} value`);
  return Number(value);
}

function summarise(rows) {
  if (!rows.length) throw Error('No matches to summarise');
  const summaries = {};
  for (const [name, columns] of Object.entries(metrics)) {
    const metricRows = rows.filter(
      (row) => Number.isInteger(row[name].home) && Number.isInteger(row[name].away),
    );
    const home = metricRows.map((row) => row[name].home);
    const away = metricRows.map((row) => row[name].away);
    summaries[name] = {
      matches: metricRows.length,
      teamObservations: metricRows.length * 2,
      coverage: round4(metricRows.length / rows.length),
      home: moments(home),
      away: moments(away),
      matchTotal: moments(home.map((value, index) => value + away[index])),
      teamPerMatch: moments([...home, ...away]),
      sourceColumns: [columns.home, columns.away],
    };
  }
  const goalRows = rows.filter(
    (row) => Number.isInteger(row.goals.home) && Number.isInteger(row.goals.away),
  );
  const results = goalRows.map(({ goals }) => goals.home - goals.away);
  const resultCounts = {
    homeWin: results.filter((result) => result > 0).length,
    draw: results.filter((result) => result === 0).length,
    awayWin: results.filter((result) => result < 0).length,
  };
  return {
    matches: rows.length,
    metrics: summaries,
    results: Object.fromEntries(
      Object.entries(resultCounts).map(([key, count]) => [key, round4(count / goalRows.length)]),
    ),
  };
}

export function aggregateReference(sourceDir) {
  const manifest = [];
  const leagueResults = leagues.map((league) => {
    const seasonRows = seasons.map((season) => {
      const fileName = `${season.code}-${league.code}.csv`;
      const filePath = resolve(sourceDir, fileName);
      const { sourceText, rows: rawRows } = readCsv(filePath);
      if (rawRows.length !== league.expectedMatches)
        throw Error(`${fileName}: expected ${league.expectedMatches} league matches, found ${rawRows.length}`);
      const rows = rawRows.map((row, index) =>
        Object.fromEntries(
          Object.entries(metrics).map(([metric, columns]) => [
            metric,
            {
              home: row[columns.home] === '' ? null : readInteger(row, columns.home, `${fileName}:${index + 2}`),
              away: row[columns.away] === '' ? null : readInteger(row, columns.away, `${fileName}:${index + 2}`),
            },
          ]),
        ),
      );
      manifest.push({
        country: league.country,
        season: season.name,
        league: league.name,
        divisionCode: league.code,
        expectedMatches: league.expectedMatches,
        matches: rawRows.length,
        metricMatchCounts: Object.fromEntries(
          Object.keys(metrics).map((metric) => [
            metric,
            rows.filter(
              (row) => Number.isInteger(row[metric].home) && Number.isInteger(row[metric].away),
            ).length,
          ]),
        ),
        sourceUrl: `https://www.football-data.co.uk/mmz4281/${season.code}/${league.code}.csv`,
        sha256: sha256(sourceText),
      });
      return { season: season.name, rows, statistics: summarise(rows) };
    });
    const pooledRows = seasonRows.flatMap((season) => season.rows);
    return {
      country: league.country,
      level: league.level,
      code: league.code,
      name: league.name,
      recentStatistics: summarise(pooledRows),
      seasons: seasonRows.map(({ season, statistics }) => ({ season, ...statistics })),
    };
  });

  return {
    referenceVersion: 'england-scotland-match-statistics-football-data-1',
    scope:
      'English and Scottish men’s league levels 1–4; regular league matches and match statistics only, 2022-23 through 2024-25.',
    source: {
      ...source,
      dataDescription:
        'Results and team-level match statistics. Football-Data credits BBC, Flashscore, ESPN Soccer, Bundesliga.de, Gazzetta.it and Football.fr for match statistics.',
      rawDataPolicy: 'Raw CSV downloads are kept locally outside Git; this artifact contains aggregates only.',
    },
    method: {
      seasons: seasons.map((season) => season.name),
      completeSeasons: true,
      leagues: leagues.map(({ country, level, code, name }) => ({ country, level, code, name })),
      unavailableCompetitions: [
        {
          country: 'England',
          level: 5,
          name: 'National League / Conference',
          reason:
            'Football-Data lists Conference result files but does not list match-stat coverage for them; excluded from this multi-stat benchmark rather than represented by goals alone.',
        },
        {
          name: 'Welsh and Northern Irish leagues',
          reason: 'Not present in Football-Data’s listed league data pages.',
        },
      ],
      fields: {
        goals: ['FTHG', 'FTAG'],
        shots: ['HS', 'AS'],
        shotsOnTarget: ['HST', 'AST'],
        fouls: ['HF', 'AF'],
        corners: ['HC', 'AC'],
        yellowCards: ['HY', 'AY'],
        redCards: ['HR', 'AR'],
      },
      variance:
        'Unbiased sample variance with denominator n−1; match totals are calculated per match, and home/away values remain separate. TeamPerMatch pools home and away team rows.',
      coverage:
        '24 files across 8 competitions and 3 seasons contain 8,412 match rows. All goals and card statistics are complete. One 2024-25 Scottish League One match has no shots, shots-on-target, fouls or corners; those metrics use pairwise-complete rows (539/540 for that competition) rather than treating the missing values as zero.',
      rounding: 'Means, sample variances, standard deviations and result rates rounded to 4 decimal places.',
      cardDefinitionNote:
        'Football-Data notes that English and Scottish yellow-card counts omit the initial yellow when a second yellow is converted to a red; this affects comparison with sources that count both.',
    },
    leagues: leagueResults,
    manifest,
    limitations: [
      'This is a multi-stat English and Scottish levels 1–4 sample, not a benchmark for the National League, Wales, Northern Ireland or every UK competition.',
      'No xG, passing, possession, tackles, interceptions, saves, player-level events, player ratings or tracking/running data are provided in this common sample.',
      'Match statistics are provider-compiled and can vary by source and season; definitions must be kept aligned before comparing to game events.',
      'These are descriptive references, not per-match quotas, caps or instructions to alter player decisions.',
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [sourceDir, outputPath] = process.argv.slice(2);
  if (!sourceDir || !outputPath)
    throw Error(
      'Usage: node tests/tools/aggregate-england-scotland-reference.mjs <source-dir> <output-json>',
    );
  const output = resolve(outputPath);
  const json = JSON.stringify(aggregateReference(resolve(sourceDir)), null, 2);
  const config = (await resolveConfig(output)) ?? {};
  writeFileSync(output, await format(json, { ...config, parser: 'json' }));
  process.stdout.write(`Wrote ${output}\n`);
}
