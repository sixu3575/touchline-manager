// Aggregate Openfootball-generated JSON by competition; do not combine competitions into one target.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseOpenfootballFile } from './aggregate-openfootball-europe.mjs';

const round4 = (value) => Number(value.toFixed(4));
const moments = (values) => {
  if (values.length < 2) throw Error('At least two values are required for sample variance');
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const sampleVariance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
  return { n: values.length, mean: round4(average), sampleVariance: round4(sampleVariance), standardDeviation: round4(Math.sqrt(sampleVariance)) };
};
const targetFile = (name) => /^(?:2024-25|2024)_.*\.txt$/i.test(name);
const listFiles = (root, extension) => {
  const result = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (extension === '.txt' && (targetFile(entry.name) || relative(root, path).replaceAll('\\', '/').startsWith('2024-25/'))) result.push(path);
    }
  };
  walk(root);
  return result.sort();
};
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

function summarizeEuropeJson(sourcePath, sourceRoot, jsonRoot) {
  const relativePath = relative(sourceRoot, sourcePath).replaceAll('\\', '/');
  const jsonPath = join(jsonRoot, relativePath.replace(/\.txt$/i, '.json'));
  const sourceText = readFileSync(sourcePath, 'utf8');
  const source = parseOpenfootballFile(sourceText);
  const parsed = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const scored = parsed.matches.flatMap((match) => {
    const score = match.score?.ft;
    return Array.isArray(score) && score.length === 2 && score.every((value) => Number.isInteger(value) && value >= 0)
      ? [{ home: score[0], away: score[1], total: score[0] + score[1], pens: Array.isArray(match.score?.p), extraTime: Array.isArray(match.score?.et) }]
      : [];
  });
  if (scored.length < 2) return null;
  const declaredMatches = source.declaredMatches || parsed.matches.length;
  const coverage = declaredMatches ? scored.length / declaredMatches : null;
  const file = basename(sourcePath);
  const cupLike = /(?:cup|pokal|coppa|copa)(?:\.|_|-)/i.test(file);
  const country = relativePath.split('/')[0];
  const home = scored.map((match) => match.home), away = scored.map((match) => match.away), totals = scored.map((match) => match.total);
  return {
    source: 'Openfootball Europe generated JSON',
    sourceFile: relativePath,
    dataFile: relative(jsonRoot, jsonPath).replaceAll('\\', '/'),
    competition: parsed.name,
    country,
    competitionType: cupLike ? 'domestic-cup' : 'domestic-league',
    declaredMatches,
    scoredMatches: scored.length,
    excludedUnplayedMatches: parsed.matches.length - scored.length,
    scoreCoverage: round4(coverage),
    coverageCompleteEnoughForBroadContext: coverage >= 0.95,
    penaltyShootoutsExcludedFromGoalCount: scored.filter((match) => match.pens).length,
    extraTimeMatchScores: scored.filter((match) => match.extraTime).length,
    goalsTotal: totals.reduce((sum, value) => sum + value, 0),
    homeGoals: moments(home),
    awayGoals: moments(away),
    teamMatchGoals: moments([...home, ...away]),
    matchTotalGoals: moments(totals),
    sourceTextSHA256: sha256(sourcePath),
    generatedJsonSHA256: sha256(jsonPath),
  };
}

function summarizeUefaText(path, sourceRoot) {
  const parsed = parseOpenfootballFile(readFileSync(path, 'utf8'));
  if (parsed.matches.length < 2) return null;
  const rows = parsed.matches.map(([home, away]) => ({ home, away, total: home + away }));
  const home = rows.map((row) => row.home), away = rows.map((row) => row.away), totals = rows.map((row) => row.total);
  return {
    source: 'Openfootball UEFA club competitions text',
    sourceFile: relative(sourceRoot, path).replaceAll('\\', '/'),
    competition: parsed.title,
    competitionType: /qualif/i.test(basename(path)) ? 'uefa-qualifier' : 'uefa-cup',
    scoredMatches: rows.length,
    goalsTotal: totals.reduce((sum, value) => sum + value, 0),
    homeGoals: moments(home), awayGoals: moments(away),
    teamMatchGoals: moments([...home, ...away]), matchTotalGoals: moments(totals),
    scoreScope: 'Text parser uses stated full-time or after-extra-time scores; shootout kicks excluded. Penalty ties without an explicit after-extra-time score may be omitted.',
    sourceTextSHA256: sha256(path),
  };
}

export function buildEuropeanGoalReference({ europeSourceRoot, europeJsonRoot, uefaSourceRoot, revisions }) {
  const europeFiles = listFiles(resolve(europeSourceRoot), '.txt');
  const europe = europeFiles.map((file) => summarizeEuropeJson(file, resolve(europeSourceRoot), resolve(europeJsonRoot))).filter(Boolean);
  const uefaFiles = listFiles(resolve(uefaSourceRoot), '.txt').filter((file) => relative(resolve(uefaSourceRoot), file).replaceAll('\\', '/').startsWith('2024-25/'));
  const uefa = uefaFiles.map((file) => summarizeUefaText(file, resolve(uefaSourceRoot))).filter(Boolean);
  for (const [needle, matches, goals] of [['Champions League', 189, 618], ['Europa League', 189, 556], ['Conference League', 153, 451]]) {
    const row = uefa.find((entry) => entry.competition.startsWith(`UEFA ${needle}`) && entry.competitionType === 'uefa-cup');
    if (!row || row.scoredMatches !== matches || row.goalsTotal !== goals) throw Error(`Official UEFA score cross-check failed: ${needle}`);
  }
  const competitions = [...europe, ...uefa];
  const eligible = europe.filter((row) => row.coverageCompleteEnoughForBroadContext);
  const summaryByType = Object.fromEntries([...new Set(europe.map((row) => row.competitionType))].map((type) => {
    const rows = eligible.filter((row) => row.competitionType === type);
    return [type, { eligibleCompetitions: rows.length, eligibleMatches: rows.reduce((sum, row) => sum + row.scoredMatches, 0) }];
  }));
  return {
    referenceVersion: 'openfootball-europe-goals-2024-25-v1',
    attribution: 'Openfootball / football.db maintainers; generated data is dedicated to CC0 1.0 public domain.',
    use: 'Broad European goal-score context only. Keep each competition separate. Never infer shots, passes, player roles, duels or tempo from goal-only rows.',
    method: {
      seasonSelection: 'Openfootball Europe files labelled 2024-25 or calendar 2024, plus UEFA 2024-25 Champions/Europa/Conference League main stages and qualifiers.',
      scoreField: 'Use generated JSON score.ft as full-time/after-extra-time total; exclude score.p shootout kicks; include score.et match scores where supplied.',
      variance: 'Unbiased sample variance using n−1 across the listed match rows, and across home+away team-match rows.',
      eligibleCoverage: 'For broad contextual summaries only, include domestic rows whose scored matches / declared matches coverage is at least 95%; all rows and coverage are kept for transparency.',
      eligibleDomesticCoverageSummary: summaryByType,
      limitations: [
        'This pinned repository snapshot does not include every league, division or domestic cup in all UEFA associations; per-file coverage exposes gaps and is not described as a complete census.',
        'Many files are score-only. Goals do not validate shots, passes, possession, duels, running distance or the match decision process.',
        'The 2024–25 season is used for cross-league context, while calendar-year 2024 is used where the source schedules a European league by calendar year. These are not a single season boundary.',
        'UEFA qualifiers, UEFA main competitions, domestic leagues and domestic cups remain distinct distributions. Cup ties are each a match; shootout kicks are not goals.',
      ],
      domesticCompetitionRows: europe.length,
      eligibleDomesticCompetitionRows: eligible.length,
      uefaCompetitionRows: uefa.length,
    },
    sources: [
      { repository: 'https://github.com/openfootball/europe', revision: revisions.europe, license: 'CC0-1.0' },
      { repository: 'https://github.com/openfootball/champions-league', revision: revisions.uefa, license: 'CC0-1.0' },
    ],
    competitions,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [europeSourceRoot, europeJsonRoot, uefaSourceRoot, output, europeRevision, uefaRevision] = process.argv.slice(2);
  if (!europeSourceRoot || !europeJsonRoot || !uefaSourceRoot || !output || !europeRevision || !uefaRevision)
    throw Error('Usage: aggregate-openfootball-json.mjs <europe-source> <europe-json> <uefa-source> <output> <europe-sha> <uefa-sha>');
  const reference = buildEuropeanGoalReference({
    europeSourceRoot, europeJsonRoot, uefaSourceRoot,
    revisions: { europe: europeRevision, uefa: uefaRevision },
  });
  writeFileSync(resolve(output), JSON.stringify(reference, null, 2) + '\n');
  console.log(JSON.stringify({
    referenceVersion: reference.referenceVersion,
    domesticCompetitionRows: reference.method.domesticCompetitionRows,
    eligibleDomesticCompetitionRows: reference.method.eligibleDomesticCompetitionRows,
    uefa: reference.competitions.filter((row) => row.competitionType.startsWith('uefa-')).map(({ competition, scoredMatches, goalsTotal, matchTotalGoals }) => ({ competition, scoredMatches, goalsTotal, goalsPerMatch: matchTotalGoals.mean })),
    coverageByType: reference.method.eligibleDomesticCoverageSummary,
  }, null, 2));
}
