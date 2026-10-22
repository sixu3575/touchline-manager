// Lightweight public entry: post-match statistics only; never imports the engine.
import { playerStatisticsAt } from './statistics.mjs';
export { playerStatisticsAt } from './statistics.mjs';
export const RATING_VERSION = 'match-rating-3';
const bound = (n, low, high) => Math.max(low, Math.min(high, n));
const number = (value) => (Number.isFinite(value) ? Math.max(0, value) : 0);
const second = (event) => event.second ?? event.minute * 60;
const round = (value, places = 2) =>
  Math.round((value + Number.EPSILON) * 10 ** places) / 10 ** places;
const goalsWeight = { GK: 1.3, DEF: 1.1, MID: 1, FWD: 0.9 };

export function buildPlayerRatings(report) {
  const players = new Map();
  for (const [side, team] of (report.snapshots ?? []).entries())
    for (const player of team.players ?? []) players.set(player.id, { ...player, side });
  for (const player of report.replay?.players ?? [])
    players.set(player.id, { ...players.get(player.id), ...player });
  const performances = new Map((report.performance ?? []).map((row) => [row.id, row]));
  const duration = report.replay?.regulationDuration ?? report.replay?.duration ?? 5400;
  const scale = report.replay?.clockScale ?? 1;
  const dismissals = new Map();
  for (const event of report.events ?? [])
    if (event.type === 'redCard' && Number.isFinite(second(event)))
      dismissals.set(
        event.playerId,
        Math.min(dismissals.get(event.playerId) ?? duration, second(event)),
      );
  const rows = new Map(
    [...players.values()].map((player) => {
      const p = performances.get(player.id) ?? {};
      const deadline = Math.min(
        duration,
        Number.isFinite(p.dismissedAt) ? p.dismissedAt : duration,
        dismissals.get(player.id) ?? duration,
      );
      return [
        player.id,
        {
          id: player.id,
          name: player.name,
          number: player.number ?? null,
          role: player.role ?? 'MID',
          side: player.side,
          minutes: round(bound((deadline * scale) / 60, 0, 90), 1),
          coverage:
            Number.isFinite(p.passes) && Number.isFinite(p.completed) ? 'standard' : 'limited',
          goals: 0,
          assists: 0,
          shots: 0,
          xg: 0,
          xgShots: 0,
          penaltyGoals: 0,
          keyPasses: 0,
          progressivePasses: 0,
          passes: number(p.passes),
          completed: number(p.completed),
          tackles: number(p.tackles),
          wonTackles: number(p.wonTackles),
          interceptions: 0,
          saves: 0,
          penaltySaves: 0,
          conceded: 0,
          ownGoals: 0,
          penaltyMisses: 0,
          yellowCards: number(p.yellowCards),
          redCards: number(p.redCards),
          fouls: 0,
          fouled: 0,
          concededPenalties: 0,
          miscontrols: 0,
          offsides: 0,
          carryDistance: number(p.carryDistance),
          deadline,
          eventYellow: 0,
          eventRed: 0,
          eventTackles: 0,
          eventWon: 0,
          eventPasses: 0,
          eventCompleted: 0,
        },
      ];
    }),
  );
  const reception = new Map(),
    attempts = new Map(),
    shotsById = new Map(),
    resolvedShots = new Set(),
    saves = [],
    shots = [];
  let shot = null,
    foul = null,
    penalty = null;
  const events = (report.events ?? []).filter(
    (event) =>
      Number.isFinite(second(event)) &&
      second(event) >= 0 &&
      (event.minute ?? second(event) / 60) <= 90 &&
      second(event) <= duration,
  );
  for (const event of events) {
    const row = rows.get(event.playerId),
      t = second(event);
    if (event.type === 'shot' && row) {
      row.shots++;
      if (Number.isFinite(event.xg)) {
        row.xg += bound(event.xg, 0, 1);
        row.xgShots++;
      }
      const assist = reception.get(row.id);
      if (
        event.shotId === undefined &&
        assist &&
        t - assist.second <= 10 &&
        rows.get(assist.passerId)?.side === row.side
      )
        rows.get(assist.passerId).keyPasses++;
      reception.delete(row.id);
      shot = {
        row,
        second: t,
        converted: false,
        penalty: Boolean(
          penalty &&
          penalty.side === row.side &&
          (!penalty.playerId || penalty.playerId === row.id) &&
          t - penalty.second <= 90,
        ),
      };
      shots.push(shot);
      if (event.shotId !== undefined) shotsById.set(event.shotId, shot);
      penalty = null;
    } else if (event.type === 'shotOutcome' && row && !resolvedShots.has(event.shotId)) {
      const attempt = shotsById.get(event.shotId);
      if (!attempt || attempt.row !== row) continue;
      resolvedShots.add(event.shotId);
      const creator = rows.get(event.keyPassId);
      if (event.outcome !== 'goal' && creator && creator !== row && creator.side === row.side)
        creator.keyPasses++;
    } else if (event.type === 'goal') {
      if (event.ownGoal) {
        const defender = rows.get(event.scorer?.id);
        if (defender && defender.side !== event.side) defender.ownGoals++;
      } else if (row) row.goals++;
      const assist = rows.get(event.assistId);
      if (!event.ownGoal && assist && assist.side === event.side && assist !== row)
        assist.assists++;
      const attempt = event.shotId !== undefined ? shotsById.get(event.shotId) : shot;
      if (
        attempt &&
        !event.ownGoal &&
        attempt.row === row &&
        (event.shotId !== undefined || t - attempt.second <= 10)
      ) {
        attempt.converted = true;
        if (attempt.penalty) row.penaltyGoals++;
      }
      for (const player of rows.values())
        if (player.side !== event.side && t <= player.deadline) player.conceded++;
      shot = null;
      penalty = null;
      reception.clear();
    } else if (event.type === 'save' && row) {
      const attempt = event.shotId !== undefined ? shotsById.get(event.shotId) : shot;
      saves.push({
        row,
        context: Boolean(
          attempt &&
          attempt.row.side !== row.side &&
          (event.shotId !== undefined || t - attempt.second <= 10),
        ),
        penalty: Boolean(attempt?.penalty),
      });
      shot = null;
      reception.clear();
    } else if (
      (['pass', 'cross', 'clearance'].includes(event.type) ||
        (event.type === 'header' && event.intent === 'headedPass')) &&
      row
    ) {
      row.eventPasses++;
      attempts.set(row.id, event);
      reception.delete(row.id);
      shot = null;
      penalty = null;
    } else if (event.type === 'passComplete') {
      const passer = rows.get(event.passerId),
        attempt = attempts.get(event.passerId);
      if (row && passer && row.side === passer.side) {
        passer.eventCompleted++;
        reception.set(row.id, { passerId: passer.id, second: t });
        if (
          attempt &&
          t - second(attempt) <= 10 &&
          ['through', 'switch', 'cross'].includes(attempt.intent)
        )
          passer.progressivePasses++;
        attempts.delete(passer.id);
      }
    } else if (event.type === 'tackleWon' && row) {
      row.eventTackles++;
      row.eventWon++;
      reception.clear();
      shot = null;
    } else if (event.type === 'tackleLost' && row) row.eventTackles++;
    else if (event.type === 'interception' && row) {
      row.interceptions++;
      reception.clear();
      shot = null;
    } else if (event.type === 'miscontrol' && row) {
      row.miscontrols++;
      reception.delete(row.id);
    } else if (event.type === 'yellowCard' && row) row.eventYellow++;
    else if (event.type === 'redCard' && row) row.eventRed++;
    else if (event.type === 'offside' && row) row.offsides++;
    else if (event.type === 'foul' && row) {
      row.fouls++;
      foul = { row, second: t };
      const victim = rows.get(event.opponentId);
      if (victim && victim.side !== row.side) victim.fouled++;
      shot = null;
      reception.clear();
      penalty = null;
    } else if (event.type === 'penalty') {
      penalty = { side: event.side, second: t, playerId: event.playerId };
      if (foul && foul.row.side !== event.side && t - foul.second <= 1)
        foul.row.concededPenalties++;
      foul = null;
    } else if (
      ['kickoff', 'half', 'out', 'freeKick', 'indirect', 'goalKick', 'corner', 'throwIn'].includes(
        event.type,
      )
    ) {
      shot = null;
      reception.clear();
      penalty = null;
    }
  }
  for (const attempt of shots)
    if (attempt.penalty && !attempt.converted) attempt.row.penaltyMisses++;
  // Engine save events also contain routine catches. Team save totals cap all credit.
  for (const side of [0, 1]) {
    const candidates = saves
      .filter((save) => save.row.side === side)
      .sort((a, b) => Number(b.context) - Number(a.context));
    const official = report.stats?.[side]?.saves;
    let remaining = Number.isFinite(official)
      ? Math.floor(number(official))
      : candidates.filter((save) => save.context).length;
    for (const save of candidates)
      if (remaining > 0 && (Number.isFinite(official) || save.context)) {
        save.row.saves++;
        if (save.context && save.penalty) save.row.penaltySaves++;
        remaining--;
      }
  }
  const result = [...rows.values()].map((row) => {
    const modern = report.statisticsVersion === 'opta-conventional-2';
    const p = performances.get(row.id) ?? {};
    row.passes = Number.isFinite(p.passes) ? row.passes : row.eventPasses;
    row.completed = Math.min(
      row.passes,
      Number.isFinite(p.completed) ? row.completed : row.eventCompleted,
    );
    row.tackles = Math.max(row.tackles, row.eventTackles);
    row.wonTackles = Math.min(row.tackles, Math.max(row.wonTackles, row.eventWon));
    row.yellowCards = Math.max(row.yellowCards, row.eventYellow);
    row.redCards = Math.max(row.redCards, row.eventRed);
    if (modern)
      Object.assign(row, playerStatisticsAt(report, row.id, duration), {
        coverage: 'standard',
      });
    else
      Object.assign(row, {
        takeOnAttempts: null,
        takeOns: null,
        failedTakeOns: null,
        possessionLost: null,
        blocks: null,
        clearances: null,
        blockedPasses: null,
        recoveries: null,
        failedPasses: null,
        dispossessed: null,
        miscontrolLosses: null,
        outLosses: null,
      });
    row.passCompletion = row.passes ? Math.round((100 * row.completed) / row.passes) : null;
    const role = row.role,
      weight = goalsWeight[role] ?? 1;
    const contribution = (key, label, value) => ({ key, label, value: round(value) });
    const categories = [
      contribution(
        'finishing',
        '进球与终结',
        Math.min(3, (row.goals - row.penaltyGoals * 0.25) * weight) +
          (row.xgShots ? bound((row.goals - row.xg) * 0.25, -0.45, 0.45) : 0) -
          Math.min(0.9, row.penaltyMisses * 0.45),
      ),
      contribution(
        'creation',
        '助攻与创造机会',
        Math.min(1.5, row.assists * 0.65) + Math.min(0.3, row.keyPasses * 0.06),
      ),
      contribution(
        'passing',
        '传球表现',
        row.passes
          ? bound(
              (row.completed / row.passes -
                ({ GK: 0.75, DEF: 0.8, MID: 0.78, FWD: 0.72 }[role] ?? 0.78)) *
                0.9 *
                Math.min(1, row.passes / 20),
              -0.4,
              0.25,
            ) +
              Math.min(0.1, row.completed * 0.001) +
              Math.min(0.2, row.progressivePasses * 0.02)
          : 0,
      ),
      contribution(
        'carrying',
        '过人与控球推进',
        modern
          ? 0.12 * Math.log1p(row.takeOns) + Math.min(0.25, row.carryDistance * 0.001)
          : Math.min(0.25, row.carryDistance * 0.001),
      ),
      contribution(
        'defending',
        '防守对抗',
        modern
          ? ({ GK: 0.8, DEF: 1.1, MID: 1, FWD: 0.85 }[role] ?? 1) *
              (0.12 * Math.log1p(row.wonTackles) +
                0.1 * Math.log1p(row.interceptions) +
                0.16 * Math.log1p(row.blocks) +
                0.06 * Math.log1p(row.clearances) +
                0.05 * Math.log1p(row.blockedPasses) +
                0.025 * Math.log1p(row.recoveries)) -
              Math.min(0.3, row.failedChallenges * 0.015)
          : Math.min(0.35, row.wonTackles * 0.05) +
              Math.min(0.3, row.interceptions * 0.05) -
              Math.min(0.5, Math.max(0, row.tackles - row.wonTackles) * 0.035) +
              (row.tackles
                ? bound(
                    (row.wonTackles / row.tackles - 0.55) * 0.5 * Math.min(1, row.tackles / 6),
                    -0.25,
                    0.2,
                  )
                : 0),
      ),
      contribution(
        'goalkeeping',
        '扑救表现',
        (modern ? 0.38 * Math.log1p(row.saves) : Math.min(1.5, row.saves * 0.12)) +
          Math.min(0.8, row.penaltySaves * 0.5),
      ),
      contribution(
        'teamDefense',
        '在场防守结果',
        (role === 'GK'
          ? -Math.min(0.9, row.conceded * 0.12)
          : role === 'DEF'
            ? -Math.min(0.35, row.conceded * 0.035)
            : 0) +
          (row.minutes >= 60 && !row.conceded
            ? role === 'GK'
              ? 0.35
              : role === 'DEF'
                ? 0.25
                : 0
            : 0),
      ),
      contribution(
        'discipline',
        '犯规与纪律',
        -Math.min(0.45, row.yellowCards * 0.15) -
          Math.min(1.8, row.redCards * 0.9) -
          Math.min(0.2, row.fouls * 0.03) -
          Math.min(0.7, row.concededPenalties * 0.35) +
          Math.min(0.1, row.fouled * 0.025),
      ),
      contribution(
        'errors',
        '失误与乌龙',
        (modern
          ? -0.045 * row.dispossessed - 0.06 * row.miscontrolLosses - 0.05 * row.outLosses
          : -Math.min(0.5, row.miscontrols * 0.04)) -
          Math.min(2, row.ownGoals) -
          Math.min(0.15, row.offsides * 0.015),
      ),
    ];
    const rated = row.minutes >= 10 || row.goals + row.assists + row.redCards + row.ownGoals > 0;
    const raw = 6.5 + categories.reduce((sum, category) => sum + category.value, 0);
    const scaled = bound(raw > 9 ? 9 + Math.tanh(raw - 9) : raw, 3, 10);
    if (Math.abs(scaled - raw) >= 0.005)
      categories.push(contribution('scaleAdjustment', '分数区间调整', scaled - raw));
    const rating = rated ? round(scaled, 1) : null;
    const {
      deadline,
      eventYellow,
      eventRed,
      eventTackles,
      eventWon,
      eventPasses,
      eventCompleted,
      xgShots,
      ...publicRow
    } = row;
    return {
      ...publicRow,
      chancesCreated: row.assists + row.keyPasses,
      xg: round(row.xg),
      rating,
      categories,
      unratedReason: rated ? null : '出场不足10分钟且无决定性事件',
    };
  });
  return { version: RATING_VERSION, baseline: 6.5, minimum: 3, maximum: 10, rows: result };
}

export function withPlayerRatings(report) {
  if (!report || (report.playerRatings?.version && Array.isArray(report.playerRatings.rows)))
    return report;
  return { ...report, playerRatings: buildPlayerRatings(report) };
}
