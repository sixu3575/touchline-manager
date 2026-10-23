// Aggregate CC0 Openfootball score files without retaining team names or raw results.
// Raw source checkouts stay in ignored work/ and are pinned by commit SHA in the output.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const round4 = (value) => Number(value.toFixed(4));

function moments(values) {
  if (values.length < 2) throw Error('At least two matches are required for sample variance');
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const sampleVariance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
  return {
    n: values.length,
    mean: round4(average),
    sampleVariance: round4(sampleVariance),
    standardDeviation: round4(Math.sqrt(sampleVariance)),
  };
}

function extractScore(line) {
  if (!/\s+v\s+/i.test(line)) return null;
  const shootout = line.match(/\b\d+\s*-\s*\d+\s+pen\.?\s+(\d+)\s*-\s*(\d+)\s+a\.e\.t\./i);
  if (shootout) return [Number(shootout[1]), Number(shootout[2])];
  if (/\bpen\.?\b/i.test(line)) return null;
  const withoutHalfTime = line.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const score = withoutHalfTime.match(/(\d+)\s*-\s*(\d+)(?:\s+a\.e\.t\.)?\s*$/i);
  return score ? [Number(score[1]), Number(score[2])] : null;
}

export function parseOpenfootballFile(text) {
  const title = text.match(/^=\s*(.+)$/m)?.[1]?.trim() ?? 'Unknown competition';
  const declaredMatches = Number(text.match(/^#\s*Matches\s+(\d+)\s*$/m)?.[1] ?? 0);
  const matches = text
    .split(/\r?\n/)
    .map(extractScore)
    .filter(Boolean);
  return { title, declaredMatches, matches };
}

function isTargetSeason(name, relativePath) {
  return /^(?:2024-25|2024|2025)_.*\.txt$/i.test(name) ||
    (relativePath.split(/[\\/]/).includes('2024-25') && name.endsWith('.txt'));
}

function collectFiles(root) {
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (isTargetSeason(entry.name, relative(root, path))) files.push(path);
    }
  };
  walk(root);
  return files.sort();
}

function summarizeFile(file, root, source) {
  const parsed = parseOpenfootballFile(readFileSync(file, 'utf8'));
  if (parsed.matches.length < 2) return null;
  const relativePath = relative(root, file).replaceAll('\\', '/');
  const filename = basename(file);
  const competitionType = source === 'Openfootball UEFA club competitions'
    ? filename.toLowerCase().includes('q') ? 'uefa-qualifier' : 'uefa-cup'
    : /(?:cup|pokal|coppa|copa)(?:\.|_|-)/i.test(filename) ? 'domestic-cup' : 'domestic-league';
  const home = parsed.matches.map(([a]) => a);
  const away = parsed.matches.map(([, b]) => b);
  const totals = home.map((value, index) => value + away[index]);
  return {
    source,
    competitionType,
    sourceFile: relativePath,
    competition: parsed.title,
    matches: parsed.matches.length,
    goalsTotal: totals.reduce((sum, value) => sum + value, 0),
    declaredMatches: parsed.declaredMatches || null,
    countDifference: parsed.declaredMatches ? parsed.matches.length - parsed.declaredMatches : null,
    scoreScope: 'Reported match score; extra-time goals included where listed; penalty shootout kicks excluded.',
    homeGoals: moments(home),
    awayGoals: moments(away),
    teamMatchGoals: moments([...home, ...away]),
    matchTotalGoals: moments(totals),
  };
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function buildOpenfootballEuropeReference({ europeRoot, uefaRoot, revisions }) {
  const groups = [
    { root: resolve(europeRoot), source: 'Openfootball Europe' },
    { root: resolve(uefaRoot), source: 'Openfootball UEFA club competitions' },
  ];
  const rows = [];
  const sources = [];
  for (const { root, source } of groups) {
    const files = collectFiles(root);
    if (!files.length) throw Error(`No 2024/25 source files found under ${root}`);
    sources.push({
      source,
      repository: source === 'Openfootball Europe'
        ? 'https://github.com/openfootball/europe'
        : 'https://github.com/openfootball/champions-league',
      revision: revisions[source],
      license: 'CC0-1.0 (public domain dedication by repository)',
      files: files.length,
      filesSHA256: files.map((file) => ({ path: relative(root, file).replaceAll('\\', '/'), sha256: sha256(file) })),
    });
    for (const file of files) {
      const row = summarizeFile(file, root, source);
      if (row) rows.push(row);
    }
  }
  const qualified = rows.filter((row) => row.competitionType === 'uefa-qualifier');
  const uefaMatches = rows.filter((row) => row.source === 'Openfootball UEFA club competitions' && row.competitionType === 'uefa-cup');
  for (const [needle, expectedMatches, expectedGoals] of [
    ['Champions League', 189, 618],
    ['Europa League', 189, 556],
    ['Conference League', 153, 451],
  ]) {
    const row = uefaMatches.find((entry) => entry.competition.startsWith(`UEFA ${needle}`));
    if (!row || row.matches !== expectedMatches || row.goalsTotal !== expectedGoals)
      throw Error(`UEFA anchor mismatch for ${needle}: ${row?.matches} matches, ${row?.matchTotalGoals.mean} goals/match`);
  }
  const totalByType = Object.fromEntries(
    [...new Set(rows.map((row) => row.competitionType))].map((type) => {
      const group = rows.filter((row) => row.competitionType === type);
      return [type, { competitions: group.length, matches: group.reduce((sum, row) => sum + row.matches, 0) }];
    }),
  );
  return {
    referenceVersion: 'openfootball-europe-goals-2024-25-v1',
    attribution: 'Openfootball / football.db maintainers. CC0 1.0 public-domain data.',
    use: 'Broad European score-only context, not an in-game quota. Keep leagues, domestic cups, UEFA main competitions and qualifiers separate.',
    method: {
      seasonSelection: 'All matching 2024-25 season files plus 2024/2025 calendar-year league files present in the pinned Openfootball Europe and UEFA club-competition repositories.',
      scoreParsing: 'Reported home/away match score; extra time included when explicitly provided; penalty shootout score excluded in favor of the preceding after-extra-time score.',
      variance: 'Unbiased sample variance using n−1 over matches, or team-match scores as noted.',
      limitations: [
        'This is the available CC0 coverage in two repositories, not a complete census of every UEFA member league, tier or domestic cup. Coverage and declared-vs-parsed match counts are recorded per file.',
        'Some sources have results only; goals cannot validate shots, passes, possession, duels, distance, player roles or match tempo.',
        'League strength varies. Per-competition distributions are retained; aggregate counts are only a coverage inventory and are not a blended target.',
        'Cup ties include both legs as separate matches. Shootout kicks are excluded, while extra-time goals remain in reported scores.',
      ],
      totalByType,
      qualifierCompetitions: qualified.map(({ competition, matches }) => ({ competition, matches })),
      competitionCount: rows.length,
    },
    sources,
    competitions: rows,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [europeRoot, uefaRoot, output, europeRevision, uefaRevision] = process.argv.slice(2);
  if (!europeRoot || !uefaRoot || !output || !europeRevision || !uefaRevision)
    throw Error('Usage: aggregate-openfootball-europe.mjs <europe-repo> <uefa-repo> <output-json> <europe-sha> <uefa-sha>');
  const reference = buildOpenfootballEuropeReference({
    europeRoot,
    uefaRoot,
    revisions: {
      'Openfootball Europe': europeRevision,
      'Openfootball UEFA club competitions': uefaRevision,
    },
  });
  writeFileSync(resolve(output), JSON.stringify(reference, null, 2) + '\n');
  console.log(JSON.stringify({
    referenceVersion: reference.referenceVersion,
    competitionCount: reference.method.competitionCount,
    totalByType: reference.method.totalByType,
    sources: reference.sources.map(({ source, revision, files }) => ({ source, revision, files })),
    mismatchFiles: reference.competitions.filter((row) => row.countDifference !== null && row.countDifference !== 0).map(({ sourceFile, declaredMatches, matches, countDifference }) => ({ sourceFile, declaredMatches, matches, countDifference })),
  }, null, 2));
}
