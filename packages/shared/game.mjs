export const ENGINE_VERSION = '0.1.0';
export const FORMATIONS = {
  '4-4-2': { GK: 1, DEF: 4, MID: 4, FWD: 2 },
  '4-3-3': { GK: 1, DEF: 4, MID: 3, FWD: 3 },
  '3-5-2': { GK: 1, DEF: 3, MID: 5, FWD: 2 },
};
export const SKILLS = ['pace', 'shooting', 'passing', 'defending', 'stamina', 'keeping'];
const names = [
  '林泽宇',
  '陈星野',
  '周奕辰',
  '王景行',
  '赵子昂',
  '许向北',
  '沈逸舟',
  '陆天佑',
  '江予安',
  '顾长风',
  '罗昊',
  '宋启航',
  '高远',
  '唐一鸣',
  '何嘉树',
  '季南川',
  '段云飞',
  '吴明哲',
  '谢宇航',
  '韩知远',
  '徐睿',
  '蒋林',
  '邵晨',
  '郑越',
  '马可·席尔瓦',
  '卢卡·科瓦奇',
  '莱昂·贝克',
  '迭戈·莫雷诺',
  '伊万·佩特罗夫',
  '诺亚·威尔逊',
  '阿米尔·哈桑',
  '凯文·米勒',
];
const teams = [
  '海港竞技',
  '山城流浪者',
  '北境联队',
  '江南绿茵',
  '蓝湾体育',
  '长安猎鹰',
  '星河青年',
];
export function random(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const avg = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
export function rating(p) {
  const s = p.skills;
  return Math.round(
    p.role === 'GK'
      ? s.keeping * 0.7 + s.passing * 0.1 + s.stamina * 0.2
      : p.role === 'DEF'
        ? s.defending * 0.5 + s.pace * 0.2 + s.passing * 0.15 + s.stamina * 0.15
        : p.role === 'MID'
          ? s.passing * 0.5 + s.pace * 0.15 + s.shooting * 0.15 + s.stamina * 0.2
          : s.shooting * 0.55 + s.pace * 0.25 + s.passing * 0.1 + s.stamina * 0.1,
  );
}
export function player(id, role, level, rng, youth = false) {
  let skills = {};
  for (const k of SKILLS) skills[k] = Math.round(clamp(level + (rng() - 0.5) * 22, 25, 86));
  if (role === 'GK') skills.keeping = clamp(Math.round(level + 4 + rng() * 8), 30, 87);
  else skills.keeping = 8 + Math.round(rng() * 12);
  const p = {
    id,
    name: names[Math.floor(rng() * names.length)],
    role,
    age: youth ? 16 + Math.floor(rng() * 3) : 20 + Math.floor(rng() * 12),
    skills,
    fitness: 100,
    potential: Math.round(clamp(level + 8 + rng() * 20, 55, 95)),
    number: 1 + Math.floor(rng() * 98),
    goals: 0,
    assists: 0,
    apps: 0,
    form: 6.5,
  };
  p.wage = Math.round((rating(p) * 18 + 100) / 50) * 50;
  p.price = Math.round((rating(p) ** 2 * 42 * (youth ? 1.35 : 1)) / 1000) * 1000;
  return p;
}
function squad(prefix, level, rng) {
  const roles = [
    'GK',
    'GK',
    ...Array(7).fill('DEF'),
    ...Array(7).fill('MID'),
    ...Array(4).fill('FWD'),
  ];
  return roles.map((r, i) => ({
    ...player(prefix + '-p' + i, r, level + rng() * 10 - 5, rng),
    number: i + 1,
  }));
}
export function bestLineup(club, formation = club.tactics.formation) {
  return Object.entries(FORMATIONS[formation]).flatMap(([role, count]) =>
    club.players
      .filter((p) => p.role === role)
      .sort((a, b) => rating(b) * b.fitness - rating(a) * a.fitness)
      .slice(0, count)
      .map((p) => p.id),
  );
}
export function validateLineup(club, ids, formation) {
  if (
    !Object.hasOwn(FORMATIONS, formation) ||
    !Array.isArray(ids) ||
    ids.length !== 11 ||
    new Set(ids).size !== 11
  )
    throw Error('需要选择 11 名不同球员。');
  const selected = ids.map((id) => club.players.find((p) => p.id === id));
  if (selected.some((p) => !p)) throw Error('阵容包含不属于本队的球员。');
  for (const [role, count] of Object.entries(FORMATIONS[formation]))
    if (selected.filter((p) => p.role === role).length !== count)
      throw Error('阵容位置与 ' + formation + ' 不符，请自动排阵或调整球员。');
}
export function schedule(ids) {
  let ring = [...ids],
    rounds = [];
  for (let r = 0; r < ids.length - 1; r++) {
    let matches = [];
    for (let i = 0; i < ids.length / 2; i++) {
      const pair = [ring[i], ring[ids.length - 1 - i]];
      matches.push(r % 2 ? pair.reverse() : pair);
    }
    rounds.push(matches);
    ring = [ring[0], ring.at(-1), ...ring.slice(1, -1)];
  }
  return [...rounds, ...rounds.map((r) => r.map(([a, b]) => [b, a]))];
}
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
export function createGame(name = '临场竞技', seed = 12345) {
  const rng = random(seed);
  const clubs = Array.from({ length: 8 }, (_, i) => {
    const c = {
      id: i === 0 ? 'me' : 'ai-' + i,
      name: i === 0 ? name : teams[i - 1],
      color: [
        '#c4f168',
        '#457cc7',
        '#bc6150',
        '#3b8f79',
        '#8d6dc2',
        '#ce9b3a',
        '#599da9',
        '#b17493',
      ][i],
      players: squad('c' + i, i === 0 ? 59 : 55 + rng() * 12, rng),
      tactics: { formation: '4-4-2', style: 'balanced', press: 'normal' },
      lineup: [],
    };
    c.lineup = bestLineup(c);
    return c;
  });
  return {
    schemaVersion: 1,
    seed,
    revision: 0,
    createdAt: new Date().toISOString(),
    season: 1,
    round: 0,
    clubs,
    schedule: schedule(clubs.map((c) => c.id)),
    results: [],
    reports: [],
    cash: 850000,
    fans: 1280,
    stadium: { level: 1, capacity: 2500, ticket: 18 },
    training: { used: 0 },
    market: Array.from({ length: 8 }, (_, i) =>
      player('market-1-' + i, ['GK', 'DEF', 'MID', 'FWD'][i % 4], 56 + rng() * 17, rng, i >= 6),
    ),
    ledger: [{ id: 'opening', season: 1, round: 0, label: '创始资金', amount: 850000 }],
    trophies: [],
    cup: { stage: 0, eliminated: false, wins: 0 },
    lastMessage: '欢迎来到临场。你的第一个赛季，现在开始。',
  };
}
export function standings(g) {
  const rows = g.clubs.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    gf: 0,
    ga: 0,
    points: 0,
  }));
  for (const m of g.results) {
    const h = rows.find((c) => c.id === m.homeId),
      a = rows.find((c) => c.id === m.awayId);
    h.played++;
    a.played++;
    h.gf += m.score[0];
    h.ga += m.score[1];
    a.gf += m.score[1];
    a.ga += m.score[0];
    if (m.score[0] > m.score[1]) {
      h.won++;
      a.lost++;
      h.points += 3;
    } else if (m.score[0] < m.score[1]) {
      a.won++;
      h.lost++;
      a.points += 3;
    } else {
      h.drawn++;
      a.drawn++;
      h.points++;
      a.points++;
    }
  }
  return rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.gf - b.ga - (a.gf - a.ga) ||
      b.gf - a.gf ||
      a.name.localeCompare(b.name),
  );
}
export function myClub(g) {
  return g.clubs[0];
}
function money(g, label, amount, id) {
  g.cash += amount;
  g.ledger.unshift({ id, season: g.season, round: g.round, label, amount });
  g.ledger = g.ledger.slice(0, 150);
}
function finishMatch(g, report, label) {
  const me = myClub(g);
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
    if (me.lineup.includes(p.id)) {
      p.apps++;
      p.fitness = clamp(
        p.fitness - (me.tactics.press === 'high' ? 12 : me.tactics.press === 'low' ? 5 : 8),
        20,
        100,
      );
      p.goals += report.events.filter((e) => e.type === 'goal' && e.playerId === p.id).length;
      p.form =
        Math.round(
          (6 +
            random(report.seed + p.number)() * 1.7 +
            (won ? 0.4 : 0) +
            Math.min(1.5, p.goals * 0.15)) *
            10,
        ) / 10;
    }
  }
  g.reports.unshift({
    ...report,
    competition: label === 'cup' ? '城市挑战杯' : '先锋联赛',
    round: g.round,
  });
  g.reports = g.reports.slice(0, 35);
}
function enough(g, cost) {
  if (g.cash < cost) throw Error('俱乐部资金不足。');
}
export function applyAction(g, type, payload = {}) {
  const me = myClub(g);
  const rng = random(g.seed + g.season * 101 + g.round * 7919 + g.revision * 31);
  if (type === 'rename') {
    const name = String(payload.name || '').trim();
    if (name.length < 2 || name.length > 18 || /[<>\u0000-\u001f]/.test(name))
      throw Error('队名需要 2–18 个字符。');
    me.name = name;
  } else if (type === 'tactics') {
    const formation = payload.formation;
    const style = payload.style;
    const press = payload.press;
    if (
      !Object.hasOwn(FORMATIONS, formation) ||
      !['balanced', 'possession', 'counter', 'wide'].includes(style) ||
      !['low', 'normal', 'high'].includes(press)
    )
      throw Error('战术选项无效。');
    const ids = payload.auto ? bestLineup(me, formation) : payload.lineup;
    validateLineup(me, ids, formation);
    me.tactics = { formation, style, press };
    me.lineup = [...ids];
  } else if (type === 'train') {
    if (g.training.used >= 2) throw Error('本轮训练已完成，请参加下一轮比赛。');
    if (!['attack', 'defence', 'fitness'].includes(payload.focus)) throw Error('训练方向无效。');
    enough(g, 6000);
    money(g, '专项训练', -6000, 'train-' + g.season + '-' + g.round + '-' + g.training.used);
    g.training.used++;
    for (const p of me.players) {
      const skills =
        payload.focus === 'attack'
          ? ['shooting', 'passing']
          : payload.focus === 'defence'
            ? ['defending', 'stamina']
            : ['pace', 'stamina'];
      for (const k of skills)
        p.skills[k] = Math.max(
          p.skills[k],
          Math.min(p.potential, Math.round((p.skills[k] + 0.6 + rng() * 0.7) * 10) / 10),
        );
      p.fitness = clamp(p.fitness + (payload.focus === 'fitness' ? 8 : -4), 30, 100);
    }
  } else if (type === 'sign') {
    if (me.players.length >= 28) throw Error('一线队最多 28 人。');
    const p = g.market.find((p) => p.id === payload.playerId);
    if (!p) throw Error('该球员已离开球探名单。');
    enough(g, p.price);
    money(g, '签约 · ' + p.name, -p.price, 'sign-' + p.id);
    me.players.push(p);
    g.market = g.market.filter((x) => x.id !== p.id);
  } else if (type === 'upgrade') {
    if (g.stadium.level >= 5) throw Error('试验版球场已达到最高等级。');
    const cost = g.stadium.level * 180000;
    enough(g, cost);
    money(g, '主场扩建', -cost, 'stadium-' + g.stadium.level);
    g.stadium.level++;
    g.stadium.capacity += 1500;
  } else if (type === 'advance') {
    if (g.round >= 14) throw Error('赛季已结束，请开启新赛季。');
    validateLineup(me, me.lineup, me.tactics.formation);
    const round = g.round;
    g.round++;
    for (const [h, a] of g.schedule[round]) {
      const home = g.clubs.find((c) => c.id === h),
        away = g.clubs.find((c) => c.id === a);
      const report = simulate(
        home,
        away,
        g.seed + g.season * 100000 + round * 100 + Number(h === 'me' ? 0 : h.slice(3)),
        's' + g.season + '-r' + g.round + '-' + h + '-' + a,
      );
      g.results.push({ id: report.id, homeId: h, awayId: a, score: report.score, round: g.round });
      if (h === 'me' || a === 'me') finishMatch(g, report, 'league');
    }
    money(
      g,
      '球员工资',
      -me.players.reduce((s, p) => s + p.wage, 0),
      'wages-' + g.season + '-' + g.round,
    );
    for (const c of g.clubs) for (const p of c.players) p.fitness = Math.min(100, p.fitness + 8);
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
  } else if (type === 'cup') {
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
    finishMatch(g, report, 'cup');
    g.cup.stage++;
    if (won) {
      g.cup.wins++;
      money(g, '杯赛晋级奖金', [18000, 40000, 100000][g.cup.stage - 1], report.id + '-bonus');
      if (g.cup.stage === 3) g.trophies.push({ season: g.season, title: '城市挑战杯冠军' });
    } else g.cup.eliminated = true;
  } else if (type === 'season') {
    if (g.round !== 14) throw Error('请先完成本赛季。');
    g.season++;
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
      ),
    );
    for (const c of g.clubs)
      for (const p of c.players) {
        p.age++;
        p.goals = 0;
        p.apps = 0;
        p.assists = 0;
        p.fitness = 100;
      }
    g.schedule = schedule(g.clubs.map((c) => c.id));
  } else throw Error('不支持的操作。');
  g.revision++;
  g.lastMessage = {
    rename: '俱乐部名称已更新。',
    tactics: '战术与首发已保存。',
    train: '训练完成，能力与体能已更新。',
    sign: '签约成功，欢迎新援！',
    upgrade: '主场扩建完成！',
    advance: '本轮联赛已结算，比赛回放已就绪。',
    cup: '杯赛已结算，查看战报了解比赛过程。',
    season: '新赛季开启，新的挑战正在等待。',
  }[type];
  return g;
}
