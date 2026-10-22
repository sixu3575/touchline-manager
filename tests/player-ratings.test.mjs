import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { gzipSync, gunzipSync } from 'node:zlib';
import {
  buildPlayerRatings,
  withPlayerRatings,
  RATING_VERSION,
  playerStatisticsAt,
  buildTeamRatings,
  buildTeamAbility,
} from '../packages/shared/modules/matches/ratings/index.mjs';
import { createReplayStorage } from '../packages/server/src/storage/replays.mjs';
import { liveReport } from '../packages/server/src/broadcast.mjs';

function report() {
  const snapshots = [0, 1].map((side) => ({
    id: side ? 'away' : 'me',
    name: '球队' + side,
    players: ['GK', 'DEF', 'MID', 'FWD'].map((role, i) => ({
      id: `${side}-${role}`,
      name: role,
      number: i + 1,
      role,
    })),
  }));
  return {
    id: 'ratings-report',
    eventFormatVersion: 3,
    score: [0, 0],
    snapshots,
    homeId: 'me',
    awayId: 'away',
    stats: [{ saves: 0 }, { saves: 0 }],
    events: [],
    replay: { duration: 5400, regulationDuration: 5400, sampleHz: 5, frameCount: 27001 },
    performance: snapshots.flatMap((team, side) =>
      team.players.map((p) => ({
        id: p.id,
        side,
        passes: 0,
        completed: 0,
        tackles: 0,
        wonTackles: 0,
        carryDistance: 0,
      })),
    ),
  };
}
const event = (type, playerId, side = 0, second = 600, extra = {}) => ({
  type,
  playerId,
  side,
  second,
  minute: Math.floor(second / 60),
  ...extra,
});
const row = (r, id = '0-MID') => buildPlayerRatings(r).rows.find((p) => p.id === id);

test('goals, assists, defensive actions and discipline change scores with visible reasons', () => {
  const r = report(),
    neutral = row(r).rating;
  r.events = [
    event('shot', '0-FWD', 0, 600, { xg: 0.4 }),
    event('goal', '0-FWD', 0, 601, { assistId: '0-MID' }),
    event('interception', '0-DEF'),
    event('tackleWon', '0-DEF'),
  ];
  assert.ok(row(r, '0-FWD').rating > neutral);
  assert.ok(row(r).rating > neutral);
  assert.ok(row(r, '0-DEF').categories.find((c) => c.key === 'defending').value > 0);
  const efficient = report(),
    wasteful = report();
  Object.assign(efficient.performance[1], { tackles: 4, wonTackles: 4 });
  Object.assign(wasteful.performance[1], { tackles: 40, wonTackles: 4 });
  assert.ok(
    row(efficient, '0-DEF').rating > row(wasteful, '0-DEF').rating,
    'failed challenge volume must not farm a high score',
  );
  r.events.push(event('redCard', '0-MID'));
  assert.ok(row(r).rating < neutral);
  assert.ok(row(r).categories.find((c) => c.key === 'discipline').value < 0);
});
test('shirt number, identity, ability, touches, dribble attempts and final result never manufacture performance', () => {
  const r = report(),
    before = row(r).rating;
  r.snapshots[0].players[2] = {
    ...r.snapshots[0].players[2],
    name: '新名字',
    number: 99,
    nationality: 'OTHER',
    attributes: { finishing: 100 },
  };
  Object.assign(r.performance[2], { touches: 99999, dribbleTouches: 99999, throughBalls: 99999 });
  r.score = [9, 0];
  assert.equal(row(r).rating, before);
});
test('only completed progressive passes and a directly recorded reception-to-shot create passing credit', () => {
  const r = report();
  r.performance[2].passes = 2;
  r.performance[2].completed = 1;
  r.events = [
    event('pass', '0-MID', 0, 600, { intent: 'through' }),
    event('passComplete', '0-FWD', 0, 602, { passerId: '0-MID' }),
    event('shot', '0-FWD', 0, 604, { xg: 0.2 }),
    event('pass', '0-MID', 0, 610, { intent: 'through' }),
  ];
  const p = row(r);
  assert.equal(p.progressivePasses, 1);
  assert.equal(p.keyPasses, 1);
  r.events.splice(2, 0, event('interception', '1-DEF', 1, 603));
  assert.equal(row(r).keyPasses, 0);
});

test('canonical shot outcomes credit delayed and headed chances once, and separate assists from non-goal key passes', () => {
  const r = report();
  r.events = [
    event('cross', '0-MID', 0, 600, { intent: 'cross' }),
    event('passComplete', '0-FWD', 0, 602, { passerId: '0-MID', bodyPart: 'head' }),
    event('shot', '0-FWD', 0, 622, { shotId: 1, bodyPart: 'head', xg: 0.2 }),
    event('shotOutcome', '0-FWD', 0, 625, { shotId: 1, outcome: 'offTarget', keyPassId: '0-MID' }),
    event('shotOutcome', '0-FWD', 0, 625, { shotId: 1, outcome: 'offTarget', keyPassId: '0-MID' }),
    event('shot', '0-FWD', 0, 650, { shotId: 2, xg: 0.3 }),
    event('shotOutcome', '0-FWD', 0, 665, { shotId: 2, outcome: 'goal' }),
    event('goal', '0-FWD', 0, 665, { shotId: 2, assistId: '0-MID' }),
  ];
  assert.equal(row(r).assists, 1);
  assert.equal(row(r).keyPasses, 1);
  assert.equal(row(r).chancesCreated, 2);
  assert.equal(row(r).categories.find((c) => c.key === 'creation').value, 0.71);
  assert.equal(row(r, '0-FWD').goals, 1);
  r.events[3].keyPassId = '1-MID';
  r.events[4].keyPassId = '1-MID';
  assert.equal(row(r, '1-MID').keyPasses, 0, 'the creator must be a teammate');
});
test('routine keeper catches receive no save credit, and total credit cannot exceed official saves', () => {
  const r = report();
  r.events = Array.from({ length: 20 }, (_, i) => event('save', '0-GK', 0, 600 + i));
  assert.equal(row(r, '0-GK').saves, 0);
  r.stats[0].saves = 1;
  assert.equal(row(r, '0-GK').saves, 1);
  assert.equal(
    buildPlayerRatings(r).rows.reduce((sum, p) => sum + p.saves, 0),
    1,
  );
});
test('a busy keeper can rate well in defeat; teammates are not all punished for the score', () => {
  const r = report();
  r.stats[0].saves = 12;
  for (let i = 0; i < 12; i++)
    r.events.push(
      event('shot', '1-FWD', 1, 600 + i * 20, { xg: 0.2 }),
      event('save', '0-GK', 0, 601 + i * 20),
    );
  for (let i = 0; i < 4; i++) r.events.push(event('goal', '1-FWD', 1, 1200 + i * 20));
  assert.ok(row(r, '0-GK').rating > row(report(), '0-GK').rating);
  assert.equal(row(r).rating, 6.5);
  assert.equal(row(r, '0-GK').conceded, 4);
});
test('dismissal ends on-pitch conceded counting, short quiet appearances are unrated, decisive ones are rated', () => {
  const r = report();
  r.performance.find((p) => p.id === '0-MID').dismissedAt = 120;
  assert.equal(row(r).rating, null);
  r.events = [event('redCard', '0-MID', 0, 120), event('goal', '1-FWD', 1, 600)];
  assert.ok(row(r).rating < 6.5);
  assert.equal(row(r).conceded, 0);
  delete r.performance;
  assert.equal(row(r).minutes, 2, 'legacy red-card events also establish departure time');
  assert.equal(row(r).conceded, 0);
});
test('own goals penalize the actual defender, ordinary penalty saves count, shootouts do not change regulation ratings', () => {
  const r = report();
  r.stats[1].saves = 1;
  r.events = [
    event('foul', '1-DEF', 1, 600),
    event('penalty', '0-FWD', 0, 600),
    event('shot', '0-FWD', 0, 625, { xg: 0.76 }),
    event('save', '1-GK', 1, 626),
    event('goal', undefined, 1, 1000, { ownGoal: true, scorer: { id: '0-DEF', side: 0 } }),
  ];
  assert.equal(row(r, '0-FWD').penaltyMisses, 1);
  assert.equal(row(r, '1-GK').penaltySaves, 1);
  assert.equal(row(r, '1-DEF').concededPenalties, 1);
  assert.equal(row(r, '0-DEF').ownGoals, 1);
  assert.equal(row(r, '1-FWD').goals, 0);
  const before = buildPlayerRatings(r);
  r.events.push({ type: 'penaltyGoal', playerId: '0-FWD', side: 0, second: 5410, minute: 91 });
  assert.deepEqual(buildPlayerRatings(r), before);
  r.events.splice(2, 0, event('out', '0-FWD', 0, 610));
  assert.equal(
    row(r, '0-FWD').penaltyMisses,
    0,
    'a broken penalty sequence cannot label a later open-play shot',
  );
});
test('ratings are deterministic, bounded and derived from archived participants without mutating input', () => {
  const r = report();
  r.events = Array.from({ length: 50 }, (_, i) => event('goal', '0-FWD', 0, 600 + i));
  for (let i = 0; i < 5; i++)
    r.events.push(event('goal', '0-MID', 0, 800 + i, { assistId: '0-FWD' }));
  const original = JSON.stringify(r),
    a = buildPlayerRatings(r);
  assert.deepEqual(a, buildPlayerRatings(r));
  assert.equal(JSON.stringify(r), original);
  assert.equal(row(r, '0-FWD').rating, 10);
  delete r.events[0].minute;
  assert.equal(row(r, '0-FWD').goals, 50, 'second-only archived events remain usable');
  assert.ok(a.rows.every((p) => p.rating === null || (p.rating >= 3 && p.rating <= 10)));
  delete r.performance;
  const legacy = buildPlayerRatings(r);
  assert.ok(legacy.rows.every((p) => p.coverage === 'limited'));
  assert.equal(withPlayerRatings(withPlayerRatings(r)).playerRatings.version, RATING_VERSION);
});
test('new report ratings are stored once, old BLOBs are enriched read-only, summaries remain compact and saves isolated', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA user_version=3');
    const storage = createReplayStorage(db),
      state = { reports: [report()] };
    db.exec('BEGIN');
    storage.persist('one', state);
    db.exec('COMMIT');
    assert.equal(state.reports[0].playerRatings, undefined);
    assert.equal(state.reports[0].detailsStored, true);
    assert.equal(state.reports[0].teamRatings.length, 2);
    assert.equal(
      state.reports[0].teamRatings[0].rating,
      null,
      'four-player fixture is not a full starting XI',
    );
    assert.equal(state.reports[0].teamAbility[0].starterCount, 4);
    assert.equal(state.reports[0].teamAbility[0].value, null);
    const payload = storage.report('one', 'ratings-report'),
      rated = JSON.parse(gunzipSync(payload));
    assert.equal(rated.playerRatings.version, RATING_VERSION);
    assert.equal(rated.playerRatings.rows.length, 8);
    assert.equal(storage.report('two', 'ratings-report'), undefined);
    const raw = gzipSync(JSON.stringify(report()));
    db.prepare('INSERT OR REPLACE INTO match_reports VALUES (?,?,?)').run('one', 'legacy', raw);
    const oldSummary = { id: 'legacy', detailsStored: true };
    const legacyTeam = storage.teamRatings('one', oldSummary);
    legacyTeam[0].rating = 10;
    assert.equal(
      storage.teamRatings('one', oldSummary)[0].rating,
      null,
      'cached aggregates cannot be mutated by a reader',
    );
    assert.equal(
      storage.teamRatings('two', oldSummary)[0].starterCount,
      0,
      'cache keys include save identity',
    );
    assert.equal(storage.teamAbility('one', oldSummary)[0].starterCount, 4);
    assert.equal(storage.teamAbility('two', oldSummary)[0].starterCount, 0);
    assert.equal(
      JSON.parse(gunzipSync(storage.report('one', 'legacy'))).playerRatings.version,
      RATING_VERSION,
    );
    assert.deepEqual(
      Buffer.from(
        db.prepare('SELECT payload FROM match_reports WHERE report_id=?').get('legacy').payload,
      ),
      raw,
    );
    db.exec('BEGIN');
    storage.persist('rollback', { reports: [{ ...report(), id: 'rolled-back' }] });
    db.exec('ROLLBACK');
    assert.equal(storage.report('rollback', 'rolled-back'), undefined);
  } finally {
    db.close();
  }
});
test('live reports hide final player scores until the authoritative broadcast has finished', () => {
  const r = withPlayerRatings(report());
  r.replay.players = [];
  r.stats = [{ possession: 50 }, { possession: 50 }];
  const live = liveReport(r, { finished: false, seconds: 100 });
  assert.equal(live.playerRatings, undefined);
  assert.equal(live.teamRatings, undefined);
  const finished = liveReport(r, { finished: true, seconds: 5400 });
  assert.equal(finished.playerRatings.version, RATING_VERSION);
});

test('team score averages only the eleven archived starters, retaining historical player grades', () => {
  const r = report();
  r.snapshots = [0, 1].map((side) => ({
    players: Array.from({ length: 11 }, (_, i) => ({ id: `${side}-${i}` })),
  }));
  r.playerRatings = {
    version: 'historic-grades',
    rows: r.snapshots.flatMap((team, side) =>
      team.players.map((p, i) => ({ ...p, side, rating: i === 0 ? 8 : 7 })),
    ),
  };
  r.playerRatings.rows.push({ id: 'unused-bench', side: 0, rating: 10 });
  const original = JSON.stringify(r);
  assert.deepEqual(
    buildTeamRatings(r),
    [0, 1].map(() => ({ rating: 7.1, starterCount: 11, ratedPlayers: 11 })),
  );
  const augmented = withPlayerRatings(r);
  assert.strictEqual(augmented.playerRatings, r.playerRatings);
  assert.equal(JSON.stringify(r), original, 'aggregation is read-only');
  assert.strictEqual(withPlayerRatings(augmented), augmented, 'enrichment is idempotent');
  r.playerRatings.rows[0].rating = null;
  assert.equal(buildTeamRatings(r)[0].rating, null, 'do not silently average an incomplete XI');
  assert.equal(buildTeamRatings(r)[0].ratedPlayers, 10);
  assert.equal(
    buildTeamRatings({ ...r, snapshots: [] })[0].rating,
    null,
    'grades alone cannot identify starters',
  );
  const compact = {
    detailsStored: true,
    replay: { players: r.snapshots.flatMap((s, side) => s.players.map((p) => ({ ...p, side }))) },
  };
  assert.equal(
    buildTeamRatings(compact)[0].rating,
    null,
    'a summary must never invent neutral grades',
  );
});
test('team ability is the rounded mean of the saved starting XI overall, never its match grades', () => {
  const r = report();
  r.snapshots = [0, 1].map((side) => ({
    players: Array.from({ length: 11 }, (_, i) => ({
      id: `${side}-${i}`,
      role: 'MID',
      ...(side === 0 && i === 0
        ? {
            attributes: Object.fromEntries(
              [
                'acceleration',
                'sprintSpeed',
                'finishing',
                'longShots',
                'composure',
                'passing',
                'vision',
                'decisions',
                'tackling',
                'marking',
                'positioning',
                'stamina',
                'reflexes',
                'handling',
                'oneOnOnes',
                'aerialReach',
                'command',
              ].map((key) => [key, 70]),
            ),
          }
        : {}),
      overall: side ? 81 : i === 0 ? 99 : 59 + i,
    })),
  }));
  r.playerRatings = {
    version: 'match-rating-3',
    rows: r.snapshots.flatMap((team, side) =>
      team.players.map((player) => ({ ...player, side, rating: side ? 3 : 10 })),
    ),
  };
  assert.deepEqual(buildTeamAbility(r), [
    { value: 65, starterCount: 11, assessedPlayers: 11 },
    { value: 81, starterCount: 11, assessedPlayers: 11 },
  ]);
  r.snapshots[0].players[10].overall = undefined;
  assert.equal(buildTeamAbility(r)[0].value, null, 'an incomplete XI is not averaged');
  assert.equal(buildTeamAbility(r)[0].assessedPlayers, 10);
});

test('new ratings reward measured take-ons and defensive work, without twice penalizing the same possession loss', () => {
  const make = (changes) => {
    const r = report();
    r.statisticsVersion = 'opta-conventional-2';
    r.events = [event('playerStat', '0-MID', 0, 600, { statId: 1, changes })];
    return r;
  };
  const baseline = row(make({})).rating;
  assert.ok(row(make({ takeOns: 3, takeOnAttempts: 3 })).rating > baseline);
  const defensive = row(
    make({
      wonTackles: 3,
      interceptions: 2,
      blocks: 2,
      clearances: 4,
      blockedPasses: 2,
      recoveries: 5,
    }),
  );
  assert.ok(defensive.categories.find((c) => c.key === 'defending').value > 0);
  const lost = make({ possessionLost: 1, dispossessed: 1, failedTakeOns: 1, takeOnAttempts: 1 });
  const noDuplicate = make({ possessionLost: 1, dispossessed: 1 });
  assert.equal(row(lost).rating, row(noDuplicate).rating);
  assert.equal(row(lost).categories.find((c) => c.key === 'errors').value, -0.04);
  const missed = make({ passes: 10, completed: 5, failedPasses: 5, possessionLost: 5 });
  assert.equal(row(missed).passCompletion, 50);
  assert.equal(
    row(missed).categories.find((c) => c.key === 'errors').value,
    0,
    'pass accuracy already evaluates failed passes',
  );
  assert.ok(row(missed).categories.find((c) => c.key === 'passing').value < 0);
  const inflated = make({ takeOnAttempts: 999 });
  assert.equal(
    row(inflated).rating,
    baseline,
    'intentions or unsuccessful volume do not create credit',
  );
  const ordinaryCarry = make({});
  ordinaryCarry.performance[2].carryDistance = 100000;
  assert.ok(
    row(ordinaryCarry).rating <= baseline + 0.3,
    'ordinary carrying distance keeps its original limited contribution instead of farming a high grade',
  );
});

test('the live counter stream survives the ordinary-event tail and never exposes future counters or ratings', () => {
  const r = report();
  r.statisticsVersion = 'opta-conventional-2';
  r.replay.players = [];
  r.events = [
    event('playerStat', '0-MID', 0, 1, { statId: 1, changes: { passes: 1 } }),
    ...Array.from({ length: 200 }, (_, i) => event('control', '0-MID', 0, 2 + i / 10)),
    event('playerStat', '0-MID', 0, 500, { statId: 2, changes: { takeOns: 1 } }),
  ];
  const live = liveReport(r, { finished: false, seconds: 100 });
  assert.ok(live.events.some((e) => e.statId === 1));
  assert.ok(!live.events.some((e) => e.statId === 2));
  assert.equal(live.playerRatings, undefined);
});

test('live counters use the non-future snapshot plus deltas without repeating the full history', () => {
  const r = report();
  r.statisticsVersion = 'opta-conventional-2';
  r.replay.players = [];
  const stat = (statId, second, changes) =>
    event('playerStat', '0-MID', 0, second, { statId, changes });
  r.events = [
    stat(1, 10, { passes: 2, completed: 2 }),
    stat(4, 30, { passes: 1 }),
    stat(2, 40, { passes: 1, completed: 1 }),
    stat(3, 200, { passes: 1 }),
  ];
  r.timeline = [
    { second: 30 - 1e-12, stats: r.stats, performance: [{ id: '0-MID', passes: 3, completed: 2 }] },
    { second: 90, stats: r.stats, performance: [{ id: '0-MID', passes: 4, completed: 3 }] },
  ];
  const live = liveReport(r, { finished: false, seconds: 100 });
  assert.equal(live.statisticsBaseSecond, r.timeline[0].second);
  assert.deepEqual(
    live.events.filter((e) => e.type === 'playerStat').map((e) => e.statId),
    [2],
  );
  const p = playerStatisticsAt(live, '0-MID', 100);
  assert.equal(p.passes, 4);
  assert.equal(p.completed, 3);
  assert.equal(p.passCompletion, 75);
  assert.equal(
    playerStatisticsAt(live, '0-MID', 20).passes,
    undefined,
    'a client behind the base never sees future counters',
  );
  assert.equal(
    playerStatisticsAt({ ...live, timeline: [] }, '0-MID', 100).passes,
    undefined,
    'missing base data is unknown, not zero',
  );
  const finished = liveReport(r, { finished: true, seconds: 5400 });
  assert.equal(finished.statisticsBaseSecond, undefined);
  assert.equal(
    playerStatisticsAt(finished, '0-MID', 5400).passes,
    5,
    'final archive evidence remains complete',
  );
});
