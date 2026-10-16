import { random, addDays, seasonStart } from '../../core/index.mjs';
import { player, updateAges, resetForSeason, recoverPlayer } from '../players/index.mjs';
import { validateLineup } from '../tactics/index.mjs';
import { simulate, finishMatch, settleClubPlayers } from '../matches/index.mjs';
import { money } from '../economy/index.mjs';
import { schedule, standings } from './selectors/index.mjs';
export { schedule, standings };
export function advance(g, payload, rng) {
  const me = g.clubs[0];

  if (g.round >= 14) throw Error('赛季已结束，请开启新赛季。');
  validateLineup(me, me.lineup, me.tactics.formation);
  const round = g.round;
  g.round++;
  g.gameDate = addDays(g.gameDate, 7);
  updateAges(g);
  for (const [h, a] of g.schedule[round]) {
    const home = g.clubs.find((c) => c.id === h),
      away = g.clubs.find((c) => c.id === a);
    const report = simulate(
      home,
      away,
      g.seed + g.season * 100000 + round * 100 + Number(h === 'me' ? 0 : h.slice(3)),
      's' + g.season + '-r' + g.round + '-' + h + '-' + a,
      { recordReplay: h === 'me' || a === 'me' },
    );
    g.results.push({ id: report.id, homeId: h, awayId: a, score: report.score, round: g.round });
    for (const club of [home, away]) if (club.id !== 'me') settleClubPlayers(club, report);
    if (h === 'me' || a === 'me') finishMatch(g, report, 'league');
  }
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
}
export function cup(g, payload, rng) {
  const me = g.clubs[0];

  if (g.cup.eliminated || g.cup.stage >= 3) throw Error('本赛季杯赛已结束。');
  if (g.round < 2 + g.cup.stage * 3) throw Error('杯赛下一轮尚未开放。');
  const opponent = g.clubs[1 + Math.floor(rng() * 7)];
  const report = simulate(
    me,
    opponent,
    g.seed + g.season * 20200 + g.cup.stage * 33,
    's' + g.season + '-cup-' + g.cup.stage,
  );
  let won = report.score[0] > report.score[1];
  if (report.score[0] === report.score[1]) {
    won = rng() > 0.5;
    report.penalties = won ? [5, 4] : [3, 4];
    report.events.push({
      minute: 91,
      type: won ? 'goal' : 'fulltime',
      side: 0,
      text: '点球大战结束：' + report.penalties.join(' : '),
      x: 88,
      y: 50,
    });
  }
  settleClubPlayers(opponent, report);
  finishMatch(g, report, 'cup');
  g.cup.stage++;
  if (won) {
    g.cup.wins++;
    money(g, '杯赛晋级奖金', [18000, 40000, 100000][g.cup.stage - 1], report.id + '-bonus');
    if (g.cup.stage === 3) g.trophies.push({ season: g.season, title: '城市挑战杯冠军' });
  } else g.cup.eliminated = true;
}
export function newSeason(g, payload, rng) {
  const me = g.clubs[0];

  if (g.round !== 14) throw Error('请先完成本赛季。');
  g.season++;
  g.gameDate = seasonStart(g.season);
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
