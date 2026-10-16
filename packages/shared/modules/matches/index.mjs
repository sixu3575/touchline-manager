import { random, avg, clamp } from '../../core/index.mjs';
import { validateLineup } from '../tactics/index.mjs';
import { settlePlayerMatch } from '../players/index.mjs';
import { money } from '../economy/index.mjs';
export const ENGINE_VERSION = '0.2.0';
function strength(club, minute) {
  const ps = club.lineup.map((id) => club.players.find((p) => p.id === id)).filter(Boolean);
  const out = ps.filter((p) => p.role !== 'GK');
  const weighted = (key, role) =>
    avg(
      out
        .filter((p) => role.includes(p.role))
        .map((p) => p.skills[key] * (0.68 + (0.32 * p.fitness) / 100)),
    );
  const press = club.tactics.press;
  const wear = 1 - (minute / 90) * (press === 'high' ? 0.16 : press === 'low' ? 0.03 : 0.08);
  let attack =
    weighted('shooting', ['FWD', 'MID']) * 0.65 +
    weighted('passing', ['MID']) * 0.2 +
    weighted('pace', ['FWD']) * 0.15;
  let defence = weighted('defending', ['DEF', 'MID']) * 0.8 + weighted('stamina', ['DEF']) * 0.2;
  let control = weighted('passing', ['MID', 'DEF']) * 0.7 + weighted('stamina', ['MID']) * 0.3;
  if (club.tactics.style === 'counter') {
    attack *= 1.07;
    control *= 0.9;
  }
  if (club.tactics.style === 'possession') {
    control *= 1.12;
    attack *= 0.96;
  }
  if (club.tactics.style === 'wide')
    attack = attack * 0.8 + weighted('pace', ['MID', 'FWD']) * 0.2 + 2;
  if (press === 'high') {
    control *= 1.08;
    defence *= 0.97;
  }
  return {
    attack: attack * wear,
    defence: defence * wear,
    control: control * wear,
    keeper:
      (ps.find((p) => p.role === 'GK')?.skills.keeping || 30) *
      (0.7 + (0.3 * (ps.find((p) => p.role === 'GK')?.fitness || 50)) / 100),
  };
}
export function simulate(home, away, seed, id = 'match') {
  validateLineup(home, home.lineup, home.tactics.formation);
  validateLineup(away, away.lineup, away.tactics.formation);
  const rng = random(seed);
  const clubs = [home, away];
  let score = [0, 0],
    stats = [
      { shots: 0, onTarget: 0, xg: 0, possessions: 0 },
      { shots: 0, onTarget: 0, xg: 0, possessions: 0 },
    ],
    events = [
      { minute: 0, type: 'kickoff', text: '哨声响起，比赛正式开始。', side: 0, x: 50, y: 50 },
    ];
  for (let minute = 1; minute <= 90; minute++) {
    if (minute === 45)
      events.push({
        minute: 45,
        type: 'half',
        text: '半场结束。双方正在调整部署。',
        side: 0,
        x: 50,
        y: 50,
      });
    let st = clubs.map((c) => strength(c, minute));
    let side = rng() < (st[0].control * 1.025) / (st[0].control * 1.025 + st[1].control) ? 0 : 1;
    let other = 1 - side;
    stats[side].possessions++;
    if (rng() > 0.47) continue;
    let team = clubs[side];
    let eligible = team.players.filter(
      (p) => team.lineup.includes(p.id) && ['MID', 'FWD'].includes(p.role),
    );
    let shooter = eligible[Math.floor(rng() * eligible.length)];
    let chance = clamp(0.46 + (st[side].attack - st[other].defence) * 0.009, 0.12, 0.75);
    if (rng() > chance) {
      events.push({
        minute,
        type: 'tackle',
        side,
        text: clubs[other].name + '完成拦截，重新组织进攻。',
        x: side === 0 ? 62 : 38,
        y: 20 + rng() * 60,
      });
      continue;
    }
    stats[side].shots++;
    let xg = clamp(
      0.16 + (st[side].attack - st[other].defence) * 0.003 + (rng() - 0.5) * 0.13,
      0.035,
      0.4,
    );
    stats[side].xg += xg;
    let on = rng() < 0.54;
    if (on) stats[side].onTarget++;
    let goal =
      on &&
      rng() < clamp(xg / 0.54 + (shooter.skills.shooting - st[other].keeper) * 0.004, 0.03, 0.72);
    if (goal) score[side]++;
    const type = goal ? 'goal' : on ? 'save' : 'miss';
    const text = goal
      ? shooter.name + '破门得分！' + team.name + '改写比分。'
      : on
        ? shooter.name + '起脚打门！被门将扑出。'
        : shooter.name + '尝试射门，皮球偏出了球门。';
    events.push({
      minute,
      type,
      side,
      playerId: shooter.id,
      text,
      x: side === 0 ? 88 : 12,
      y: 34 + rng() * 32,
      score: [...score],
    });
  }
  events.push({ minute: 90, type: 'fulltime', side: 0, text: '全场比赛结束。', x: 50, y: 50 });
  const total = stats[0].possessions + stats[1].possessions;
  stats.forEach((s) => {
    s.possession = Math.round((s.possessions / total) * 100);
    s.xg = Math.round(s.xg * 100) / 100;
  });
  stats[1].possession = 100 - stats[0].possession;
  return {
    id,
    engineVersion: ENGINE_VERSION,
    seed,
    homeId: home.id,
    awayId: away.id,
    homeName: home.name,
    awayName: away.name,
    score,
    stats,
    events,
    snapshots: clubs.map((c) => ({
      id: c.id,
      name: c.name,
      tactics: structuredClone(c.tactics),
      players: structuredClone(c.players.filter((p) => c.lineup.includes(p.id))),
    })),
  };
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
  for (const p of me.players) {
    const goals = report.events.filter(
      (e) => e.type === 'goal' && e.minute <= 90 && e.playerId === p.id,
    ).length;
    settlePlayerMatch(p, {
      played: me.lineup.includes(p.id),
      won,
      drawn,
      goals,
      press: me.tactics.press,
      seed: report.seed,
    });
  }
  g.reports.unshift({
    ...report,
    competition: label === 'cup' ? '城市挑战杯' : '先锋联赛',
    round: g.round,
  });
  g.reports = g.reports.slice(0, 35);
}
