import { random, addDays, seasonStart } from '../../core/index.mjs';
import {
  player,
  updateAges,
  resetForSeason,
  recoverPlayer,
  advanceAdaptation,
  ensureAssessment,
} from '../players/index.mjs';
import { validateLineup } from '../tactics/index.mjs';
import { simulate, finishMatch, settleClubPlayers } from '../matches/index.mjs';
import { money } from '../economy/index.mjs';
import { ensureTraining, resolveTraining } from '../training/index.mjs';
import { payStaff } from '../staff/index.mjs';
import { schedule, standings } from './selectors/index.mjs';
export { schedule, standings };
// Freeze all inputs before queuing; fixture seeds are independent of execution order.
export function createCompetitionPlan(source, type) {
  const g = structuredClone(source),
    me = g.clubs[0];
  ensureTraining(g);
  validateLineup(me, me.lineup, me.tactics.formation);
  const rng = random(g.seed + g.season * 101 + g.round * 7919 + g.revision * 31);
  let fixtures;
  if (type === 'advance') {
    if (g.round >= 14) throw Error('赛季已结束，请开启新赛季。');
    const round = g.round++;
    g.gameDate = addDays(g.gameDate, 7);
    const ageChanges = updateAges(g);
    advanceAdaptation(g, 7);
    resolveTraining(g, ageChanges);
    fixtures = g.schedule[round].map(([h, a]) => ({
      homeId: h,
      awayId: a,
      seed: g.seed + g.season * 100000 + round * 100 + Number(h === 'me' ? 0 : h.slice(3)),
      id: 's' + g.season + '-r' + g.round + '-' + h + '-' + a,
      options: { recordReplay: h === 'me' || a === 'me' },
    }));
  } else if (type === 'cup') {
    if (g.cup.eliminated || g.cup.stage >= 3) throw Error('本赛季杯赛已结束。');
    if (g.round < 2 + g.cup.stage * 3) throw Error('杯赛下一轮尚未开放。');
    const opponent = g.clubs[1 + Math.floor(rng() * 7)];
    fixtures = [
      {
        homeId: 'me',
        awayId: opponent.id,
        seed: g.seed + g.season * 20200 + g.cup.stage * 33,
        id: 's' + g.season + '-cup-' + g.cup.stage,
        options: { knockout: true },
      },
    ];
  } else throw Error('不支持的比赛任务。');
  const order = [...fixtures].sort(
    (a, b) =>
      Number(b.homeId === 'me' || b.awayId === 'me') -
      Number(a.homeId === 'me' || a.awayId === 'me'),
  );
  return {
    type,
    state: g,
    fixtures,
    order,
    identity: [type, g.season, type === 'cup' ? g.cup.stage : g.round].join(':'),
  };
}
export function settleCompetition(plan, reports) {
  const g = structuredClone(plan.state),
    me = g.clubs[0];
  if (
    reports.length !== plan.fixtures.length ||
    new Set(reports.map((r) => r.id)).size !== reports.length
  )
    throw Error('比赛报告不完整。');
  for (const f of plan.fixtures) {
    const r = reports.find((r) => r.id === f.id);
    if (!r || r.seed !== f.seed || r.homeId !== f.homeId || r.awayId !== f.awayId)
      throw Error('比赛输入不匹配。');
    for (const id of [f.homeId, f.awayId])
      if (id !== 'me')
        settleClubPlayers(
          g.clubs.find((c) => c.id === id),
          r,
        );
    if (plan.type === 'advance')
      g.results.push({
        id: r.id,
        homeId: r.homeId,
        awayId: r.awayId,
        score: r.score,
        round: g.round,
      });
    if (f.homeId === 'me' || f.awayId === 'me') {
      const { timeline, ...finalReport } = r; // Prefix snapshots belong to durable live jobs, not every historical save.
      finishMatch(
        g,
        { ...finalReport, season: g.season, canReplay: true },
        plan.type === 'cup' ? 'cup' : 'league',
      );
    } else {
      const { timeline, trajectory, replay, ...finalReport } = r;
      g.reports.unshift({
        ...finalReport,
        season: g.season,
        round: g.round,
        competition: '先锋联赛',
        canReplay: false,
      });
    }
  }
  if (plan.type === 'advance') {
    payStaff(g);
    money(
      g,
      '球员工资',
      -me.players.reduce((s, p) => s + p.wage, 0),
      'wages-' + g.season + '-' + g.round,
    );
    for (const c of g.clubs) for (const p of c.players) recoverPlayer(p);
    g.training.used = 0;
    if (g.round === 14) {
      const rank = standings(g).findIndex((c) => c.id === 'me') + 1;
      money(g, '赛季排名奖金', Math.max(40000, 220000 - rank * 20000), 'season-' + g.season);
      if (rank <= 3)
        g.trophies.push({
          season: g.season,
          title: rank === 1 ? '先锋联赛冠军' : rank === 2 ? '先锋联赛亚军' : '先锋联赛季军',
        });
    }
  } else {
    const r = reports[0],
      won = (r.penalties ?? r.score)[0] > (r.penalties ?? r.score)[1];
    g.cup.stage++;
    if (won) {
      g.cup.wins++;
      money(g, '杯赛晋级奖金', [18000, 40000, 100000][g.cup.stage - 1], r.id + '-bonus');
      if (g.cup.stage === 3) g.trophies.push({ season: g.season, title: '城市挑战杯冠军' });
    } else g.cup.eliminated = true;
  }
  const reportSeason = (r) => r.season ?? Number(r.id.match(/^s(\d+)/)?.[1] ?? g.season);
  g.reports.sort(
    (a, b) =>
      reportSeason(b) - reportSeason(a) ||
      b.round - a.round ||
      Number(b.homeId === 'me' || b.awayId === 'me') -
        Number(a.homeId === 'me' || a.awayId === 'me'),
  );
  g.reports = g.reports.slice(0, 140);
  g.revision++;
  g.lastMessage =
    plan.type === 'cup' ? '杯赛已结算，查看战报了解比赛过程。' : '本轮联赛已结算，比赛回放已就绪。';
  return g;
}
function runCompetition(g, type) {
  const plan = createCompetitionPlan(g, type);
  const reports = plan.order.map((f) =>
    simulate(
      plan.state.clubs.find((c) => c.id === f.homeId),
      plan.state.clubs.find((c) => c.id === f.awayId),
      f.seed,
      f.id,
      f.options,
    ),
  );
  const next = settleCompetition(plan, reports);
  next.revision--; // Existing applyAction owns its single revision increment.
  // The synchronous compatibility API historically mutates live player entities.
  // Keep existing references valid; the async server still receives an isolated DTO.
  const reconcile = (current, incoming) => {
    const values = incoming.map((row) => {
      const original = current.find((item) => item.id === row.id);
      if (!original) return row;
      copyMutable(original, row);
      return original;
    });
    current.splice(0, current.length, ...values);
    return current;
  };
  for (const club of next.clubs) {
    const original = g.clubs.find((c) => c.id === club.id);
    if (original) club.players = reconcile(original.players, club.players);
  }
  next.clubs = reconcile(g.clubs, next.clubs);
  next.market = reconcile(g.market, next.market);
  copyMutable(g, next);
}
function copyMutable(target, source) {
  for (const [key, value] of Object.entries(source)) {
    const prior = target[key];
    if (
      value &&
      prior &&
      Object.getPrototypeOf(value) === Object.prototype &&
      Object.getPrototypeOf(prior) === Object.prototype
    )
      copyMutable(prior, value);
    else if (
      Array.isArray(value) &&
      Array.isArray(prior) &&
      value.length === prior.length &&
      value.every((item, i) => item === prior[i])
    )
      continue;
    else target[key] = value;
  }
}
export function advance(g) {
  runCompetition(g, 'advance');
}
export function cup(g) {
  runCompetition(g, 'cup');
}
export function newSeason(g, payload, rng) {
  const me = g.clubs[0];
  ensureTraining(g);

  if (g.round !== 14) throw Error('请先完成本赛季。');
  const previousDate = g.gameDate;
  g.season++;
  g.gameDate = seasonStart(g.season);
  advanceAdaptation(
    g,
    Math.round(
      (Date.parse(g.gameDate + 'T12:00:00Z') - Date.parse(previousDate + 'T12:00:00Z')) / 86400000,
    ),
  );
  g.round = 0;
  g.results = [];
  g.training.used = 0;
  g.cup = { stage: 0, eliminated: false, wins: 0 };
  g.market = Array.from({ length: 8 }, (_, i) =>
    player(
      'market-' + g.season + '-' + i,
      ['GK', 'DEF', 'MID', 'FWD'][i % 4],
      58 + rng() * 15,
      rng,
      i >= 6,
      g.gameDate,
    ),
  );
  for (const c of g.clubs) for (const p of c.players) resetForSeason(p, g.gameDate);
  g.schedule = schedule(g.clubs.map((c) => c.id));
}
