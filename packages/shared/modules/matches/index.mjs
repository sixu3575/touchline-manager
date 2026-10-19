import { random } from '../../core/index.mjs';
import { settlePlayerMatch } from '../players/index.mjs';
import { money } from '../economy/index.mjs';
export {
  simulate,
  createMatchSimulation,
  ENGINE_VERSION,
  PARAMETER_VERSION,
} from './simulation.mjs';
export function settleClubPlayers(club, report) {
  const side = report.homeId === club.id ? 0 : 1;
  const won = report.score[side] > report.score[1 - side];
  const drawn = report.score[side] === report.score[1 - side];
  for (const p of club.players) {
    settlePlayerMatch(p, {
      played: club.lineup.includes(p.id),
      won,
      drawn,
      goals: report.events.filter((e) => e.type === 'goal' && e.minute <= 90 && e.playerId === p.id)
        .length,
      press: club.tactics.press,
      seed: report.seed,
      energy: report.performance?.find((row) => row.id === p.id)?.energy,
      mind: report.performance?.find((row) => row.id === p.id)?.mind,
      assists: report.events.filter((e) => e.type === 'goal' && e.assistId === p.id).length,
    });
  }
}
export function finishMatch(g, report, label) {
  const me = g.clubs[0];
  const side = report.homeId === 'me' ? 0 : 1;
  const won = report.score[side] > report.score[1 - side];
  const drawn = report.score[side] === report.score[1 - side];
  const revenue =
    label === 'league'
      ? Math.round(
          Math.min(g.stadium.capacity, g.fans * (0.87 + random(report.seed + 99)() * 0.3)) *
            g.stadium.ticket,
        )
      : 0;
  if (report.homeId === 'me' && revenue) money(g, '主场门票', revenue, report.id + '-gate');
  money(
    g,
    label === 'cup' ? '杯赛出场收入' : '赞助与比赛奖金',
    label === 'cup' ? 12000 : 28000 + (won ? 12000 : drawn ? 6000 : 0),
    report.id + '-prize',
  );
  g.fans = Math.max(500, g.fans + (won ? 95 : drawn ? 20 : -35));
  settleClubPlayers(me, report);
  g.reports.unshift({
    ...report,
    competition: label === 'cup' ? '城市挑战杯' : '先锋联赛',
    round: g.round,
  });
  g.reports = g.reports.slice(0, 140);
}
