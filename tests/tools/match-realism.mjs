// Read-only diagnostics: no engine imports, RNG calls or mutation of archived reports.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { analyzeReplay } from '../../packages/shared/modules/matches/replay-analysis.mjs';

const englishReference = JSON.parse(
  readFileSync(
    new URL(
      '../../packages/shared/modules/matches/design/ENGLISH_LEAGUE_REFERENCE_20261023.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

export const references = {
  version: 'realism-reference-1',
  physical: {
    url: 'https://editorial.uefa.com/resources/0297-1d4e3592fbf1-f11d4e1c826a-1000/uefa_euro_2024_physical_analysis_report_20250318094958.pdf',
    pages: '9–10, 13',
    scope:
      'EURO 2024 men; regulation 90-minute portions; goalkeepers excluded; positional starters >70min. Elite anchor, not lower-league percentiles.',
    // Table 3: total / low-speed (0–7km/h) / >20km/h / >25km/h, in metres.
    positions: {
      striker: [9534, 1011, 4346, 495, 141],
      winger: [9780, 1254, 4201, 547, 131],
      wideMid: [9780, 1254, 4201, 547, 131],
      centreBack: [9793, 720, 4672, 359, 84],
      fullback: [10209, 957, 4467, 609, 166],
      wingBack: [10209, 957, 4467, 609, 166],
      centralMid: [10924, 1054, 4171, 497, 96],
      holdingMid: [10924, 1054, 4171, 497, 96],
    },
    teamOutfieldMetres: 115351,
  },
  technical: {
    url: 'https://www.fifatrainingcentre.com/media/native/world-cup-2022/report_133012.pdf',
    scope:
      'England–USA, 2022-11-25, includes added time; illustrative single match, not a population range. FIFA and game pass/turnover definitions differ.',
    passes: [550, 427],
    completed: [488, 368],
    shots: [8, 10],
    onTarget: [3, 2],
  },
  goals: {
    url: 'https://www.uefa.com/uefaeuro/history/seasons/2024/statistics/',
    scope:
      'EURO 2024, 117 goals / 51 matches; includes extra-time goals. Context only, not a per-90 target.',
    total: 117,
    matches: 51,
  },
  englishLeagueGoals: {
    referenceVersion: englishReference.referenceVersion,
    source: englishReference.source.repository,
    sourceCommit: englishReference.source.commit,
    license: englishReference.source.license,
    seasons: englishReference.method.recentSeasons,
    leagues: englishReference.leagues.map((league) => ({
      level: league.level,
      name: league.name,
      matches: league.recentStatistics.matches,
      totalGoalsMean: league.recentStatistics.totalGoals.mean,
      totalGoalsSampleVariance: league.recentStatistics.totalGoals.sampleVariance,
      homeGoalsMean: league.recentStatistics.homeGoals.mean,
      awayGoalsMean: league.recentStatistics.awayGoals.mean,
      resultRates: league.recentStatistics.resultRates,
    })),
  },
};
const sum = (a) => a.reduce((s, x) => s + x, 0);
const mean = (a) => (a.length ? sum(a) / a.length : null);
const quantile = (a, q) => {
  a = [...a].sort((a, b) => a - b);
  return a.length ? a[Math.floor((a.length - 1) * q)] : null;
};
const ratio = (a, b) => (b > 0 ? a / b : null);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function compareGoalSampleToEnglishLeagues(goalTotals) {
  if (
    !Array.isArray(goalTotals) ||
    goalTotals.length < 2 ||
    goalTotals.some((value) => !Number.isInteger(value) || value < 0)
  )
    throw Error('At least two non-negative integer match goal totals are required');
  const sampleMean = mean(goalTotals);
  const sampleVariance =
    sum(goalTotals.map((value) => (value - sampleMean) ** 2)) / (goalTotals.length - 1);
  return {
    status: 'descriptive-only',
    sample: {
      matches: goalTotals.length,
      totalGoalsMean: sampleMean,
      totalGoalsSampleVariance: sampleVariance,
    },
    comparisons: references.englishLeagueGoals.leagues.map((league) => ({
      level: league.level,
      name: league.name,
      referenceMatches: league.matches,
      referenceWindow: `${references.englishLeagueGoals.seasons[0]} through ${references.englishLeagueGoals.seasons.at(-1)}`,
      referenceTotalGoalsMean: league.totalGoalsMean,
      referenceTotalGoalsSampleVariance: league.totalGoalsSampleVariance,
      meanDifference: sampleMean - league.totalGoalsMean,
      varianceDifference: sampleVariance - league.totalGoalsSampleVariance,
    })),
    interpretation:
      'Exploratory comparison only. A small synthetic tactic/seed sample is not a league population estimate and does not pass or fail validation.',
  };
}

export function trackedMovement(report, trajectory = report.trajectory) {
  const meta = report.replay;
  if (!meta || !trajectory)
    return {
      status: 'missing',
      reason: 'No position trajectory; speed zones and distance reconciliation unavailable.',
    };
  if (
    meta.format !== 'positions-u16-v1' ||
    meta.stride !== 49 ||
    meta.sampleHz !== 5 ||
    !(trajectory instanceof Uint16Array) ||
    trajectory.length !== meta.frameCount * meta.stride ||
    meta.players?.length !== 22
  )
    throw Error('Invalid replay geometry; do not silently compare incompatible tracking');
  const at = (frame, player) => ({
    x: trajectory[frame * 49 + player * 2] / 100 - 5,
    z: trajectory[frame * 49 + player * 2 + 1] / 100 - 5,
  });
  const duration = Math.min(5400, meta.regulationDuration ?? meta.duration);
  const rows = meta.players.map((player, i) => {
    const perf = report.performance.find((p) => p.id === player.id);
    const seconds = Math.min(duration, perf?.dismissedAt ?? duration);
    const zones = [0, 0, 0, 0, 0],
      timeZones = [0, 0, 0, 0, 0];
    let excludedSeconds = 0,
      discontinuities = 0;
    for (let n = 1; n < meta.frameCount && n / meta.sampleHz <= seconds; n++) {
      const d = distance(at(n, i), at(n - 1, i)),
        speed = d * meta.sampleHz * 3.6;
      // Cut is global and also marks ball resets. Conservatively omit both adjoining
      // intervals, never count teleport distance or an extra-time/shootout segment.
      if (trajectory[n * 49 + 47] || trajectory[(n - 1) * 49 + 47] || speed > 45) {
        excludedSeconds += 1 / meta.sampleHz;
        if (speed > 45) discontinuities++;
        continue;
      }
      const zone = speed <= 7 ? 0 : speed <= 15 ? 1 : speed <= 20 ? 2 : speed <= 25 ? 3 : 4;
      zones[zone] += d;
      timeZones[zone] += 1 / meta.sampleHz;
    }
    return {
      id: player.id,
      seconds,
      zones,
      timeZones,
      metres: sum(zones),
      excludedSeconds,
      discontinuities,
      coverage: ratio(seconds - excludedSeconds, seconds),
      method:
        '5Hz centimetre-quantised planar displacement; approximate zones, not instantaneous velocity or official sprint-effort counts',
    };
  });
  return { status: 'available', players: rows };
}

export function compareMatch(report, { trajectory = report.trajectory } = {}) {
  if (report.testFixture) throw Error('Controlled business fixtures are not physical evidence');
  if (
    !Array.isArray(report.stats) ||
    report.stats.length !== 2 ||
    !Array.isArray(report.performance) ||
    report.performance.length !== 22 ||
    !Array.isArray(report.events) ||
    !report.continuity
  )
    throw Error('A detailed full-match report is required');
  const c = report.continuity;
  const seconds = sum([
    ...(c.controlledSeconds ?? []),
    ...(c.flightSeconds ?? []),
    c.deadSeconds ?? 0,
    c.looseSeconds ?? 0,
    c.contestedSeconds ?? 0,
  ]);
  const alerts = [];
  const flag = (severity, metric, actual, range, scope) =>
    alerts.push({ severity, metric, actual, engineeringRange: range, scope });
  if (!Number.isFinite(seconds) || Math.abs(seconds - 5400) > 1)
    throw Error('Realism comparisons require a complete regulation 90 minutes');
  const bounds = (metric, value, range, scope, severity = 'review') => {
    if (!Number.isFinite(value)) flag('block', metric + ':missing', null, range, scope);
    else if (value < range[0] || value > range[1]) flag(severity, metric, value, range, scope);
  };
  const tracking = trackedMovement(report, trajectory);
  if (tracking.status !== 'available') flag('review', 'tracking:missing', null, null, 'match');
  const players = report.performance.map((p) => {
    const snap = report.snapshots?.[p.side]?.players?.find((s) => s.id === p.id);
    const ev = report.events.filter(
      (e) => e.playerId === p.id || (e.type === 'goal' && e.scorer?.id === p.id),
    );
    const t = tracking.players?.find((row) => row.id === p.id);
    const native = p.locomotion?.version === 1 ? p.locomotion : null;
    const zones = native?.zones ?? t?.zones;
    const measuredMetres = native ? p.distance : t?.metres;
    const minutes = Math.min(5400, p.dismissedAt ?? 5400) / 60,
      per90 = 90 / minutes;
    const ref = references.physical.positions[p.positionRole];
    const row = {
      id: p.id,
      side: p.side,
      number: snap?.number,
      role: p.positionRole,
      minutes,
      distanceMetres: p.distance,
      distancePer90: p.distance * per90,
      trackedMetres: t?.metres ?? null,
      distanceDifference: t ? ratio(t.metres - p.distance, p.distance) : null,
      lowSpeedDistanceShare: zones ? ratio(zones[0], measuredMetres) : null,
      highSpeedMetresPer90: zones ? (zones[3] + zones[4]) * per90 : null,
      sprintMetresPer90: zones ? zones[4] * per90 : null,
      physicalSource: native ? '20Hz independent odometer' : '5Hz replay estimate',
      sprintEfforts: native?.sprintEfforts ?? null,
      adrenalineEfforts: native?.adrenalineEfforts ?? null,
      burstReserve: p.burstReserve ?? null,
      longestSprintSeconds: native?.longestSprint ?? null,
      defending: p.defenceTelemetry ?? null,
      trackingCoverage: t?.coverage ?? null,
      excludedTrackingSeconds: t?.excludedSeconds ?? null,
      maxKmh: p.maxSpeed * 3.6,
      energy: p.energy,
      carryMetres: p.carryDistance,
      passes: p.passes,
      completed: p.completed,
      completion: ratio(p.completed, p.passes),
      shots: ev.filter((e) => e.type === 'shot' || (e.type === 'header' && e.xg != null)).length,
      goals: ev.filter((e) => e.type === 'goal' && !e.ownGoal).length,
      assists: report.events.filter((e) => e.type === 'goal' && e.assistId === p.id).length,
      interceptions: p.interceptions ?? ev.filter((e) => e.type === 'interception').length,
      tackles: p.tackleAttempts ?? p.tackles,
      wonTackles: p.wonTackles,
      saves: ev.filter((e) => e.type === 'save').length,
      touches: p.touches,
      dribbleTouches: p.dribbleTouches,
      throughBalls: p.throughBalls,
      longPasses: p.longPasses,
      oneTouchPasses: p.oneTouchPasses,
      fouls: ev.filter((e) => e.type === 'foul').length,
      yellowCards: p.yellowCards,
      redCards: p.redCards,
      offsides: ev.filter((e) => e.type === 'offside').length,
      miscontrols: ev.filter((e) => e.type === 'miscontrol').length,
      ownGoals: ev.filter((e) => e.type === 'goal' && e.ownGoal).length,
      keyPasses: report.statisticsVersion
        ? report.events.filter((e) => e.type === 'shotOutcome' && e.keyPassId === p.id).length
        : null,
      reference: ref
        ? {
            meanMetres: ref[0],
            sdMetres: ref[1],
            lowSpeedDistanceShare: ref[2] / ref[0],
            highSpeedMetres: ref[3],
            sprintMetres: ref[4],
          }
        : null,
    };
    bounds('maxKmh', row.maxKmh, [0, 40], p.id, 'block');
    if (minutes >= 60 && p.positionRole !== 'keeper') {
      bounds('distancePer90', row.distancePer90, [6000, 14500], p.id);
      bounds('distancePer90-extreme', row.distancePer90, [4000, 17000], p.id, 'block');
      bounds('shotsPer90', row.shots * per90, [0, 12], p.id);
      bounds('shotsPer90-extreme', row.shots * per90, [0, 20], p.id, 'block');
      bounds('tacklesPer90', row.tackles * per90, [0, 15], p.id);
      bounds('tacklesPer90-extreme', row.tackles * per90, [0, 25], p.id, 'block');
      if (t) {
        bounds('trackingCoverage', t.coverage, [0.95, 1], p.id, 'block');
        bounds('distanceReconciliation', row.distanceDifference, [-0.08, 0.05], p.id);
        bounds('lowSpeedDistanceShare', row.lowSpeedDistanceShare, [0.25, 0.65], p.id);
        bounds('highSpeedMetresPer90', row.highSpeedMetresPer90, [0, 2000], p.id);
        bounds('highSpeedMetresPer90-extreme', row.highSpeedMetresPer90, [0, 3000], p.id, 'block');
        bounds('sprintMetresPer90', row.sprintMetresPer90, [0, 1200], p.id);
        bounds('sprintMetresPer90-extreme', row.sprintMetresPer90, [0, 1800], p.id, 'block');
      }
    }
    return row;
  });
  const teams = report.stats.map((s, side) => {
    const own = players.filter((p) => p.side === side),
      outfield = own.filter((p) => p.role !== 'keeper');
    const shots = report.events.filter(
      (e) => e.side === side && (e.type === 'shot' || (e.type === 'header' && e.xg != null)),
    );
    const chains = c.chains?.[side] ?? [];
    const row = {
      side,
      ...s,
      goals: report.score[side],
      completion: ratio(s.completedPasses, s.passes),
      outfieldMetres: sum(outfield.map((p) => p.distanceMetres)),
      trackedOutfieldMetres:
        tracking.status === 'available' ? sum(outfield.map((p) => p.trackedMetres)) : null,
      tackles: sum(own.map((p) => p.tackles)),
      wonTackles: sum(own.map((p) => p.wonTackles)),
      floorEnergyPlayers: outfield.filter((p) => p.energy <= 20).length,
      meanEndBurstReserve: mean(outfield.map((p) => p.burstReserve).filter(Number.isFinite)),
      adrenalineEfforts: sum(outfield.map((p) => p.adrenalineEfforts ?? 0)),
      chains: {
        count: chains.length,
        mean: mean(chains),
        median: quantile(chains, 0.5),
        p90: quantile(chains, 0.9),
        fivePlus: chains.filter((n) => n >= 5).length,
      },
      unpressuredShots: shots.filter((e) => e.quality?.pressure === 0).length,
      referenceTeamOutfieldMetres: references.physical.teamOutfieldMetres,
    };
    bounds('passes', s.passes, [200, 850], side);
    bounds('completion', row.completion, [0.6, 0.96], side);
    bounds('shots', s.shots, [2, 30], side);
    bounds('shots-extreme', s.shots, [0, 45], side, 'block');
    bounds('goals', row.goals, [0, 8], side);
    bounds('goals-extreme', row.goals, [0, 10], side, 'block');
    bounds('xg', s.xg, [0, 6], side);
    bounds('floorEnergyPlayers', row.floorEnergyPlayers, [0, 4], side);
    return row;
  });
  bounds('matchGoals', sum(report.score), [0, 10], 'match');
  bounds('matchGoals-extreme', sum(report.score), [0, 14], 'match', 'block');
  bounds('matchShots', sum(teams.map((t) => t.shots)), [10, 40], 'match');
  bounds('matchShots-extreme', sum(teams.map((t) => t.shots)), [0, 65], 'match', 'block');
  // Event-based spells are an explicitly labelled proxy. lastTouch in replay is
  // NOT a stable controller. looseCarry/miscontrol are NOT opponent possessions.
  const terminal = new Set([
    'goal',
    'out',
    'foul',
    'offside',
    'half',
    'kickoff',
    'freeKick',
    'penalty',
    'indirect',
    'fulltime',
  ]);
  const possessionEvents = new Set(['control', 'passComplete', 'interception', 'tackleWon']);
  let side = null,
    start = null;
  const spells = [];
  for (const e of report.events) {
    if (terminal.has(e.type)) {
      if (side !== null) spells.push({ seconds: e.second - start, turnover: false });
      side = null;
    } else if (possessionEvents.has(e.type)) {
      if (side !== null && side !== e.side) {
        spells.push({ seconds: e.second - start, turnover: true });
        side = null;
      }
      if (side === null) {
        side = e.side;
        start = e.second;
      }
    }
  }
  const match = {
    seconds,
    deadSeconds: c.deadSeconds,
    liveSeconds: seconds - c.deadSeconds,
    looseSeconds: c.looseSeconds,
    contestedSeconds: c.contestedSeconds,
    turnoversByModelDefinition: c.turnovers,
    deadCauses: c.deadCauses,
    boxEntries: c.boxEntries,
    replayFlow: analyzeReplay(report, trajectory),
    eventSpells: {
      count: spells.length,
      medianSeconds: quantile(
        spells.map((s) => s.seconds),
        0.5,
      ),
      p90Seconds: quantile(
        spells.map((s) => s.seconds),
        0.9,
      ),
      openTurnovers: spells.filter((s) => s.turnover).length,
    },
    teamPossessions: c.possessions
      ? {
          count: c.possessions.length,
          medianSeconds: quantile(
            c.possessions.map((p) => p.seconds),
            0.5,
          ),
          p90Seconds: quantile(
            c.possessions.map((p) => p.seconds),
            0.9,
          ),
        }
      : null,
    unavailable: [
      'Exact stable-possession duration distribution (not archived)',
      'Official take-ons (dribbleTouches are touches)',
      'Official sprint-effort counts',
      'Validated marking errors/pressure success (observation lapses and task time are diagnostics only)',
      'Cross-provider player-rating benchmark (no universal official rating scale)',
    ],
  };
  return {
    referenceVersion: references.version,
    engineVersion: report.engineVersion,
    parameterVersion: report.parameterVersion,
    statisticsVersion: report.statisticsVersion ?? 'legacy',
    id: report.id,
    seed: report.seed,
    tactics: report.snapshots?.map((s) => s.tactics),
    status: alerts.some((a) => a.severity === 'block')
      ? 'blocked'
      : alerts.length
        ? 'review'
        : 'pass',
    thresholds:
      'Broad engineering review/block envelopes, NOT published real-world percentile ranges. See REALISM_VALIDATION.md.',
    match,
    teams,
    players,
    alerts,
    references,
  };
}

export function writeComparison(report, path, options) {
  const result = compareMatch(report, options);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(result, null, 2) + '\n');
  return result;
}
