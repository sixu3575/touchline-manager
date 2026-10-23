// Download public Football-Data CSVs for European league codes with available
// multi-stat archives. Raw data belongs under ignored work/, never in Git.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const seasons = [
  { name: '2022-23', code: '2223' },
  { name: '2023-24', code: '2324' },
  { name: '2024-25', code: '2425' },
];

export const leagues = [
  { country: 'England', code: 'E0', name: 'Premier League', level: 1 },
  { country: 'England', code: 'E1', name: 'Championship', level: 2 },
  { country: 'England', code: 'E2', name: 'League One', level: 3 },
  { country: 'England', code: 'E3', name: 'League Two', level: 4 },
  { country: 'Scotland', code: 'SC0', name: 'Premiership', level: 1 },
  { country: 'Scotland', code: 'SC1', name: 'Championship', level: 2 },
  { country: 'Scotland', code: 'SC2', name: 'League One', level: 3 },
  { country: 'Scotland', code: 'SC3', name: 'League Two', level: 4 },
  { country: 'Germany', code: 'D1', name: 'Bundesliga', level: 1 },
  { country: 'Germany', code: 'D2', name: '2. Bundesliga', level: 2 },
  { country: 'Italy', code: 'I1', name: 'Serie A', level: 1 },
  { country: 'Italy', code: 'I2', name: 'Serie B', level: 2 },
  { country: 'Spain', code: 'SP1', name: 'La Liga', level: 1 },
  { country: 'Spain', code: 'SP2', name: 'Segunda División', level: 2 },
  { country: 'France', code: 'F1', name: 'Ligue 1', level: 1 },
  { country: 'France', code: 'F2', name: 'Ligue 2', level: 2 },
  { country: 'Netherlands', code: 'N1', name: 'Eredivisie', level: 1 },
  { country: 'Belgium', code: 'B1', name: 'First Division A', level: 1 },
  { country: 'Portugal', code: 'P1', name: 'Primeira Liga', level: 1 },
  { country: 'Türkiye', code: 'T1', name: 'Süper Lig', level: 1 },
  { country: 'Greece', code: 'G1', name: 'Super League', level: 1 },
];

const safeName = (value) => value.replace(/[^a-z0-9-]/gi, '_');

export async function fetchEuropeanFootballData(outputDir, fetchImpl = fetch) {
  const directory = resolve(outputDir);
  mkdirSync(directory, { recursive: true });
  const jobs = seasons.flatMap((season) =>
    leagues.map((league) => ({
      season,
      league,
      url: `https://www.football-data.co.uk/mmz4281/${season.code}/${league.code}.csv`,
      path: resolve(directory, `${season.code}-${safeName(league.code)}.csv`),
    })),
  );
  const results = [];
  for (let index = 0; index < jobs.length; index += 4) {
    results.push(...(await Promise.all(jobs.slice(index, index + 4).map(async (job) => {
      const response = await fetchImpl(job.url);
      if (response.status === 404) return { ...job, status: 'not-published' };
      if (!response.ok) throw new Error(`${job.url}: HTTP ${response.status}`);
      const content = await response.text();
      if (!content.includes('FTHG') || !content.includes('FTAG'))
        throw new Error(`${job.url}: response does not look like a Football-Data match CSV`);
      writeFileSync(job.path, content, 'utf8');
      return { ...job, status: 'downloaded', bytes: Buffer.byteLength(content) };
    }))));
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = process.argv[2] ?? 'work/football-reference/football-data-europe';
  const results = await fetchEuropeanFootballData(output);
  console.log(JSON.stringify({ output: resolve(output), results }, null, 2));
}
