// Rebuild a match-level reference from the Wyscout public event dataset.
// Keep downloaded source files under ignored work/; only derived summaries are tracked.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const AREAS = [
  { key: 'England', country: 'England', competition: 'Premier League', season: '2017/18' },
  { key: 'France', country: 'France', competition: 'Ligue 1', season: '2017/18' },
  { key: 'Germany', country: 'Germany', competition: 'Bundesliga', season: '2017/18' },
  { key: 'Italy', country: 'Italy', competition: 'Serie A', season: '2017/18' },
  { key: 'Spain', country: 'Spain', competition: 'La Liga', season: '2017/18' },
  {
    key: 'European_Championship',
    country: 'Europe',
    competition: 'UEFA European Championship',
    season: '2016',
  },
  { key: 'World_Cup', country: 'International', competition: 'FIFA World Cup', season: '2018' },
];

export const metrics = [
  'goals',
  'shots',
  'shotsOnTarget',
  'blockedShots',
  'passesAttempted',
  'passesCompleted',
  'fouls',
  'corners',
  'yellowCards',
  'redCards',
  'offsides',
  'saves',
  'attackingDuels',
  'wonAttackingDuels',
  'defendingDuels',
  'wonDefendingDuels',
  'interceptions',
  'clearances',
];

const round4 = (value) => Number(value.toFixed(4));
const mean = (values) => values.reduce((total, value) => total + value, 0) / values.length;
const moments = (values) => {
  if (values.length < 2) throw Error('At least two observations are required for sample variance');
  const average = mean(values);
  const sampleVariance =
    values.reduce((total, value) => total + (value - average) ** 2, 0) / (values.length - 1);
  return {
    n: values.length,
    mean: round4(average),
    sampleVariance: round4(sampleVariance),
    standardDeviation: round4(Math.sqrt(sampleVariance)),
  };
};
const hasTag = (event, id) => (event.tags ?? []).some((tag) => tag.id === id);

const emptyLine = () => Object.fromEntries(metrics.map((metric) => [metric, 0]));

export function summarizeWyscoutCompetition(matches, events, competition) {
  const matchById = new Map(
    matches.filter((match) => match.status === 'Played').map((match) => [match.wyId, match]),
  );
  if (!matchById.size) throw Error(`No played matches for ${competition.competition}`);

  const linesByMatch = new Map();
  for (const match of matchById.values()) {
    const teams = Object.values(match.teamsData);
    if (teams.length !== 2 || teams.some((team) => !['home', 'away'].includes(team.side)))
      throw Error(`Expected home and away team rows in Wyscout match ${match.wyId}`);
    const rows = new Map(
      teams.map((team) => [
        team.teamId,
        { side: team.side, stats: { ...emptyLine(), goals: Number(team.score) } },
      ]),
    );
    linesByMatch.set(match.wyId, rows);
  }

  for (const event of events) {
    const rows = linesByMatch.get(event.matchId);
    if (!rows || (event.matchPeriod !== '1H' && event.matchPeriod !== '2H')) continue;
    const row = rows.get(event.teamId);
    if (!row) continue;
    const stat = row.stats;
    if (event.eventName === 'Pass') {
      stat.passesAttempted++;
      if (hasTag(event, 1801)) stat.passesCompleted++;
    }
    if (event.eventName === 'Shot') {
      stat.shots++;
      if (hasTag(event, 1801) || hasTag(event, 101)) stat.shotsOnTarget++;
      if (hasTag(event, 2101)) stat.blockedShots++;
    }
    if (event.eventName === 'Foul') stat.fouls++;
    if (event.eventName === 'Free Kick' && event.subEventName === 'Corner') stat.corners++;
    if (event.eventName === 'Offside') stat.offsides++;
    if (event.eventName === 'Save attempt') stat.saves++;
    if (event.eventName === 'Duel' && event.subEventName === 'Ground attacking duel') {
      stat.attackingDuels++;
      if (hasTag(event, 703)) stat.wonAttackingDuels++;
    }
    if (event.eventName === 'Duel' && event.subEventName === 'Ground defending duel') {
      stat.defendingDuels++;
      if (hasTag(event, 703)) stat.wonDefendingDuels++;
    }
    if (hasTag(event, 1401)) stat.interceptions++;
    if (event.eventName === 'Others on the ball' && event.subEventName === 'Clearance')
      stat.clearances++;
    if (hasTag(event, 1702)) stat.yellowCards++;
    if (hasTag(event, 1701) || hasTag(event, 1703)) stat.redCards++;
  }

  const teamRows = [],
    matchRows = [];
  for (const [matchId, rows] of linesByMatch) {
    const home = [...rows.values()].find((row) => row.side === 'home');
    const away = [...rows.values()].find((row) => row.side === 'away');
    if (!home || !away) throw Error(`Incomplete team statistics for Wyscout match ${matchId}`);
    teamRows.push(home.stats, away.stats);
    matchRows.push(
      Object.fromEntries(metrics.map((metric) => [metric, home.stats[metric] + away.stats[metric]])),
    );
  }

  return {
    ...competition,
    matches: matchRows.length,
    scope: 'Played matches; events and scores limited to regulation 1H/2H; extra time and penalties excluded.',
    teamMatch: Object.fromEntries(
      metrics.map((metric) => [metric, moments(teamRows.map((row) => row[metric]))]),
    ),
    matchTotal: Object.fromEntries(
      metrics.map((metric) => [metric, moments(matchRows.map((row) => row[metric]))]),
    ),
  };
}

function assembleReference(rows, competitions, hashes) {
  const matchTotal = rows.reduce((total, row) => total + row.matches, 0);
  const expectedTotal = 1941;
  if (matchTotal !== expectedTotal)
    throw Error(`Wyscout dataset integrity check failed: expected ${expectedTotal}, got ${matchTotal}`);
  return {
    referenceVersion: 'wyscout-european-events-2017-18-v1',
    source: {
      title: 'Soccer match event dataset',
      authors: 'Pappalardo, Massucco et al.',
      doi: '10.6084/m9.figshare.c.4415000.v5',
      datasetPaperDoi: '10.1038/s41597-019-0247-7',
      url: 'https://figshare.com/collections/Soccer_match_event_dataset/4415000/5',
      license: 'CC BY 4.0',
      attribution: 'Wyscout event data; Pappalardo et al. (2019), CC BY 4.0.',
    },
    method: {
      matchCount: matchTotal,
      competitions: rows.length,
      metrics,
      variance: 'Unbiased sample variance using n−1; teamMatch uses one team per match, matchTotal uses one row per match.',
      definitions:
        'Passes count Pass events; completed passes carry tag 1801. Shots on target are Shot events tagged 1801 or goal tag 101. Fouls, corners, saves and cards follow Wyscout event/type tags. Ground duels are reported as duels, not re-labelled as official tackles or take-ons. Scores use the regulation score field; event counts include only 1H/2H. This source has no tracking distance or xG.',
      limitations:
        'Coverage is 2017/18 full Big Five first divisions, UEFA EURO 2016 and FIFA World Cup 2018; it is not a full European league/cup census and does not include a full Champions League season.',
    },
    sourceFiles: hashes,
    competitions,
    samples: rows,
    disclaimer:
      'Descriptive benchmark only. It is not an in-game target, player-rating model, or statistical quota. Providers use different event definitions; compare only matching metrics and keep each competition separate.',
  };
}

export function buildWyscoutReference({ competitions, datasets, hashes }) {
  const rows = AREAS.map((area) => {
    const matches = datasets[area.key]?.matches;
    const events = datasets[area.key]?.events;
    if (!matches || !events) throw Error(`Missing Wyscout input for ${area.key}`);
    return summarizeWyscoutCompetition(matches, events, area);
  });
  return assembleReference(rows, competitions, hashes);
}

function loadLocalData(dir) {
  const rows = [];
  for (const area of AREAS) {
    const matches = JSON.parse(
      readFileSync(resolve(dir, 'matches', `matches_${area.key}.json`), 'utf8'),
    );
    const events = JSON.parse(
      readFileSync(resolve(dir, 'events', `events_${area.key}.json`), 'utf8'),
    );
    rows.push(summarizeWyscoutCompetition(matches, events, area));
    global.gc?.();
  }
  const competitionMap = JSON.parse(readFileSync(resolve(dir, 'competitions.json'), 'utf8'));
  return assembleReference(rows, competitionMap.map(({ name, wyId, format, area }) => ({
    id: wyId,
    name,
    format,
    country: area.name,
  })), ['events.zip', 'matches.zip', 'players.json', 'teams.json'].map((name) => ({
    file: name,
    sha256: createHash('sha256').update(readFileSync(resolve(dir, name))).digest('hex'),
  })));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2] || !process.argv[3])
    throw Error('Provide the extracted Wyscout data directory and explicit output JSON');
  const result = loadLocalData(resolve(process.argv[2]));
  writeFileSync(resolve(process.argv[3]), JSON.stringify(result, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        referenceVersion: result.referenceVersion,
        totalMatches: result.method.matchCount,
        competitions: result.samples.map(({ country, competition, season, matches, teamMatch }) => ({
          country,
          competition,
          season,
          matches,
          goals: teamMatch.goals.mean,
          shots: teamMatch.shots.mean,
          passes: teamMatch.passesAttempted.mean,
        })),
      },
      null,
      2,
    ),
  );
}
