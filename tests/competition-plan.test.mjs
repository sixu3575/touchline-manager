import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { createGame } from '../packages/shared/game.mjs';
import {
  createCompetitionPlan,
  settleCompetition,
} from '../packages/shared/modules/competitions/index.mjs';
import { leaguePlayerLeaders } from '../packages/shared/modules/competitions/selectors/index.mjs';
import { createLeaguePlayerLeaderReader } from '../packages/server/src/league-player-leaders.mjs';
import { withPlayerRatings } from '../packages/shared/modules/matches/ratings/index.mjs';
import { fixtureReport } from './helpers/fixture-report.mjs';

test('fixture order has frozen independent inputs and settlement rejects partial rounds', () => {
  const g = createGame('任务计划', 42),
    before = structuredClone(g),
    plan = createCompetitionPlan(g, 'advance');
  assert.deepEqual(g, before);
  assert.ok(plan.order[0].homeId === 'me' || plan.order[0].awayId === 'me');
  assert.deepEqual(
    new Set(plan.order.map((f) => f.seed)),
    new Set(plan.fixtures.map((f) => f.seed)),
  );
  assert.throws(() => settleCompetition(plan, []), /不完整/);
});

test('league leaderboards aggregate conventional player statistics and exclude cups and other seasons', () => {
  const g = createGame('射手榜', 42),
    home = g.clubs[0],
    away = g.clubs[1],
    scorer = home.lineup[10],
    creator = home.lineup[9],
    report = fixtureReport(home, away, 42, 's1-r1-me-club-1', { durationSeconds: 5400 });
  report.competition = '先锋联赛';
  report.season = 1;
  report.statisticsVersion = 'opta-conventional-2';
  report.events = [
    {
      type: 'playerStat',
      second: 500,
      minute: 8,
      side: 0,
      playerId: scorer,
      statId: 1,
      changes: { passes: 10, completed: 9 },
    },
    { type: 'shot', second: 600, minute: 10, side: 0, playerId: scorer, shotId: 1, xg: 0.42 },
    {
      type: 'shotOutcome',
      second: 600,
      minute: 10,
      side: 0,
      playerId: scorer,
      shotId: 1,
      outcome: 'goal',
      onTarget: true,
    },
    {
      type: 'goal',
      second: 600,
      minute: 10,
      side: 0,
      playerId: scorer,
      assistId: creator,
      shotId: 1,
    },
  ];
  for (const row of report.performance) {
    row.passes = row.id === scorer ? 10 : 0;
    row.completed = row.id === scorer ? 9 : 0;
  }

  const excludedCup = { ...report, id: 's1-cup-1', competition: '城市挑战杯' };
  const excludedSeason = { ...report, id: 's2-r1-me-club-1', season: 2 };
  const leaders = leaguePlayerLeaders([withPlayerRatings(report), excludedCup, excludedSeason], {
    season: 1,
    expectedMatches: 1,
  });
  const scorerRow = leaders.players.find((row) => row.id === scorer),
    creatorRow = leaders.players.find((row) => row.id === creator);

  assert.equal(leaders.availableMatches, 1);
  assert.equal(leaders.complete, true);
  assert.equal(scorerRow.goals, 1);
  assert.equal(scorerRow.shots, 1);
  assert.equal(scorerRow.shotsOnTarget, 1);
  assert.equal(scorerRow.xg, 0.4);
  assert.equal(scorerRow.passes, 10);
  assert.equal(scorerRow.completedPasses, 9);
  assert.equal(scorerRow.passAccuracy, 90);
  assert.equal(scorerRow.appearances, 1);
  assert.equal(creatorRow.assists, 1);
});

test('league leader reader loads detailed reports within the save boundary and caches by revision', () => {
  const g = createGame('榜单归档', 45),
    report = fixtureReport(g.clubs[0], g.clubs[1], 45, 's1-r1-me-club-1', {
      durationSeconds: 5400,
    });
  report.competition = '先锋联赛';
  report.season = 1;
  const payload = gzipSync(JSON.stringify(withPlayerRatings(report)));
  let reads = 0;
  const reader = createLeaguePlayerLeaderReader({
    report(saveId, reportId) {
      reads++;
      assert.equal(reportId, report.id);
      return saveId === 'save-a' ? payload : undefined;
    },
  });
  const state = {
    season: 1,
    revision: 7,
    results: [{ id: report.id }],
    reports: [{ id: report.id, season: 1, competition: '先锋联赛', detailsStored: true }],
  };
  const first = reader('save-a', state);
  assert.equal(first.availableMatches, 1);
  assert.equal(reader('save-a', state).availableMatches, 1);
  assert.equal(reads, 1, 'same revision uses the cached aggregate');
  assert.equal(reader('save-b', state).availableMatches, 0);
  assert.equal(reads, 2, 'another save cannot reuse cached report details');
  assert.ok(!JSON.stringify(first).includes('attributes'));
});

test('league leader aggregation streams full reports within the server heap budget', () => {
  const readerUrl = new URL('../packages/server/src/league-player-leaders.mjs', import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    import { gzipSync } from 'node:zlib';
    import { createLeaguePlayerLeaderReader } from ${JSON.stringify(readerUrl)};

    const count = 43;
    const summaries = Array.from({ length: count }, (_, index) => ({
      id: 's1-r' + index,
      season: 1,
      competition: '先锋联赛',
      detailsStored: true,
    }));
    const row = {
      id: 'player-1', name: 'Player', number: 1, role: 'MID', side: 0,
      minutes: 90, goals: 0, assists: 0, redCards: 0, ownGoals: 0,
      shots: 0, onTarget: 0, xg: 0, keyPasses: 0, passes: 10, completed: 9,
      wonTackles: 0, interceptions: 0, saves: 0, conceded: 0,
      yellowCards: 0, fouls: 0, offsides: 0, takeOns: 0, blocks: 0,
      clearances: 0, possessionLost: 0, rating: 7,
    };
    const reader = createLeaguePlayerLeaderReader({
      report(_saveId, reportId) {
        return gzipSync(JSON.stringify({
          id: reportId, season: 1, competition: '先锋联赛',
          homeId: 'home', homeName: 'Home', awayId: 'away', awayName: 'Away',
          events: [], snapshots: [], playerRatings: { rows: [row] },
          padding: 'x'.repeat(4 * 1024 * 1024),
        }));
      },
    });
    const state = {
      season: 1, revision: 1,
      results: summaries.map(({ id }) => ({ id })),
      reports: summaries,
    };
    const result = reader('save', state);
    assert.equal(result.availableMatches, count);
    assert.equal(result.players[0].appearances, count);
  `;
  const run = spawnSync(
    process.execPath,
    ['--max-old-space-size=64', '--input-type=module', '-e', script],
    { encoding: 'utf8', timeout: 60_000 },
  );
  assert.equal(run.error, undefined, run.error?.message);
  assert.equal(run.status, 0, run.stderr || run.stdout);
});

test('elapsed recovery belongs to frozen pre-match inputs and is not repeated by settlement or same-date cups', () => {
  const g = createGame('恢复时点', 42);
  g.round = 2;
  for (const c of g.clubs) for (const p of c.players) p.fitness = 28;
  const plan = createCompetitionPlan(g, 'advance');
  assert.equal(g.clubs[0].players[0].fitness, 28, 'queuing does not publish future recovery');
  assert.ok(plan.state.clubs.every((c) => c.players.every((p) => p.fitness > 90)));
  assert.deepEqual(
    createCompetitionPlan(g, 'advance'),
    plan,
    'retry does not accumulate another week',
  );
  const exhausted = plan.state.clubs[0].lineup[0];
  const reports = plan.fixtures.map((f) => {
    const h = plan.state.clubs.find((c) => c.id === f.homeId),
      a = plan.state.clubs.find((c) => c.id === f.awayId);
    const r = fixtureReport(h, a, f.seed, f.id);
    for (const p of r.performance) p.energy = p.id === exhausted ? 0 : 43;
    return r;
  });
  const settled = settleCompetition(plan, reports);
  for (const c of settled.clubs)
    for (const p of c.players)
      if (c.lineup.includes(p.id))
        assert.equal(
          p.fitness,
          p.id === exhausted ? 0 : 43,
          'finished energy stays spent, including zero',
        );
  const cup = createCompetitionPlan(settled, 'cup');
  assert.equal(cup.state.gameDate, settled.gameDate);
  assert.equal(
    cup.state.clubs[0].players.find((p) => p.id === settled.clubs[0].lineup[0]).fitness,
    0,
  );
});
