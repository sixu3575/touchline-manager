// Build non-betting, match-level European league reference moments.
// Raw files are private/ignored work inputs; this emits only aggregates.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { leagues, seasons } from './fetch-football-data-europe.mjs';

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
const moments = (values) => {
  if (values.length < 2) return null;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const sampleVariance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
  return { n: values.length, mean: round4(average), sampleVariance: round4(sampleVariance), standardDeviation: round4(Math.sqrt(sampleVariance)) };
};

function parseCsv(text, filename = 'CSV') {
  const lines = text.replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  const parseLine = (line) => {
    const values = [];
    let value = '', quoted = false;
    for (let index = 0; index < line.length; index++) {
      const char = line[index];
      if (char === '"') {
        if (quoted && line[index + 1] === '"') { value += '"'; index++; }
        else quoted = !quoted;
      } else if (char === ',' && !quoted) { values.push(value); value = ''; }
      else value += char;
    }
    if (quoted) throw new Error(`${filename}: unterminated quoted CSV field`);
    values.push(value);
    return values;
  };
  const headers = parseLine(lines.shift()).map((value) => value.trim());
  return lines.filter((line) => line.trim()).map((line, index) => {
    const values = parseLine(line);
    if (values.length !== headers.length) throw new Error(`${filename}:${index + 2}: column count mismatch`);
    return Object.fromEntries(headers.map((header, column) => [header, values[column].trim()]));
  });
}

function summarize(rows) {
  const summary = {};
  for (const [key, columns] of Object.entries(metrics)) {
    const valid = rows.flatMap((row) => {
      const home = row[key].home, away = row[key].away;
      return Number.isInteger(home) && Number.isInteger(away) ? [{ home, away }] : [];
    });
    const home = valid.map((row) => row.home), away = valid.map((row) => row.away);
    summary[key] = {
      matches: valid.length,
      coverage: rows.length ? round4(valid.length / rows.length) : 0,
      home: moments(home),
      away: moments(away),
      teamPerMatch: moments([...home, ...away]),
      matchTotal: moments(home.map((value, index) => value + away[index])),
      sourceColumns: [columns.home, columns.away],
    };
  }
  return summary;
}

export function aggregateEuropeanLeagueStats(sourceDir) {
  const directory = resolve(sourceDir);
  const files = new Set(readdirSync(directory));
  const manifest = [];
  const competitionRows = [];
  for (const league of leagues) {
    const seasonRows = [];
    for (const season of seasons) {
      const filename = `${season.code}-${league.code}.csv`;
      if (!files.has(filename)) continue;
      const sourceText = readFileSync(resolve(directory, filename), 'utf8');
      const rawRows = parseCsv(sourceText, filename);
      const rows = rawRows.map((row, index) => Object.fromEntries(Object.entries(metrics).map(([key, columns]) => {
        const get = (column) => {
          const value = row[column];
          if (value === undefined || value === '') return null;
          if (!/^\d+$/.test(value)) throw new Error(`${filename}:${index + 2}: invalid ${column}=${value}`);
          return Number(value);
        };
        return [key, { home: get(columns.home), away: get(columns.away) }];
      })));
      const validGoals = rows.filter((row) => Number.isInteger(row.goals.home) && Number.isInteger(row.goals.away));
      if (validGoals.length !== rows.length) throw new Error(`${filename}: missing final scores; do not silently treat them as unplayed results`);
      const matchStats = summarize(rows);
      manifest.push({
        country: league.country, season: season.name, competition: league.name,
        divisionCode: league.code, rawRows: rawRows.length, completedMatches: validGoals.length,
        metricMatchCounts: Object.fromEntries(Object.entries(matchStats).map(([key, value]) => [key, value.matches])),
        sourceUrl: `https://www.football-data.co.uk/mmz4281/${season.code}/${league.code}.csv`,
        sha256: sha256(sourceText),
      });
      seasonRows.push({ season: season.name, matches: rows.length, metrics: matchStats });
    }
    if (seasonRows.length) {
      const allRows = [];
      for (const season of seasons) {
        const filename = `${season.code}-${league.code}.csv`;
        if (!files.has(filename)) continue;
        allRows.push(...parseCsv(readFileSync(resolve(directory, filename), 'utf8'), filename).map((row) => Object.fromEntries(Object.entries(metrics).map(([key, columns]) => {
          const get = (column) => /^\d+$/.test(row[column] ?? '') ? Number(row[column]) : null;
          return [key, { home: get(columns.home), away: get(columns.away) }];
        }))));
      }
      competitionRows.push({
        country: league.country, level: league.level, code: league.code, name: league.name,
        seasons: seasonRows, pooled: { matches: allRows.length, metrics: summarize(allRows) },
      });
    }
  }
  const representedCountries = [...new Set(competitionRows.map((row) => row.country))].sort();
  return {
    referenceVersion: 'european-league-multistat-football-data-1',
    source: 'Football-Data.co.uk public CSV archives; see notes.txt and contact.php for field definitions and permitted use.',
    scope: 'Available regular-league match rows in 21 European competition codes, 2022-23 through 2024-25. Availability and statistical completeness vary by competition and metric; no odds fields are read.',
    method: {
      seasons: seasons.map((season) => season.name), requestedCompetitionCodes: leagues,
      representedCountries, representedCompetitionCodes: competitionRows.map(({ country, code, name }) => ({ country, code, name })),
      metrics: Object.fromEntries(Object.entries(metrics).map(([key, columns]) => [key, [columns.home, columns.away]])),
      variance: 'Unbiased sample variance (n-1); home, away, team-match and match-total distributions kept separate.',
      missingness: 'Each metric uses pairwise-complete home/away rows and records n/coverage; missing statistics are excluded, never zero-filled.',
      nonLeagueCompetitions: 'Domestic cups and UEFA club competitions are not provided by this Football-Data league archive; see the separate Openfootball and UEFA anchors.',
    },
    manifest, competitions: competitionRows,
    limitations: [
      'Not a census of every European country, division, league or cup; only listed and downloadable codes are included.',
      'Football-Data describes the CSV data as free for personal/academic use; check source terms before commercial redistribution or large-scale automated collection.',
      'Provider definitions can vary by competition and season. This dataset has shots, fouls, corners and cards but not passes, possession, xG, duels, players or tracking.',
      'Descriptive reference only; no per-match quotas, caps, or direct transfer from elite leagues to the game’s lower-level fictional league.',
    ],
  };
}

async function main() {
  const sourceDir = process.argv[2] ?? 'work/football-reference/football-data-europe';
  const output = process.argv[3] ?? 'packages/shared/modules/matches/design/EUROPEAN_LEAGUE_STATS_REFERENCE_20261023.json';
  const result = aggregateEuropeanLeagueStats(sourceDir);
  const config = await resolveConfig(resolve('package.json'));
  writeFileSync(resolve(output), await format(`${JSON.stringify(result)}\n`, { ...config, filepath: resolve(output) }));
  console.log(JSON.stringify({ output: resolve(output), requested: result.method.requestedCompetitionCodes.length, represented: result.competitions.length, countries: result.method.representedCountries.length, files: result.manifest.length, matches: result.manifest.reduce((sum, row) => sum + row.completedMatches, 0) }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
