import { random, seasonStart } from '../../core/index.mjs';
import { player, squad } from '../players/index.mjs';
import { bestLineup } from '../tactics/index.mjs';
import { schedule } from '../competitions/index.mjs';
const teams = [
  '海港竞技',
  '山城流浪者',
  '北境联队',
  '江南绿茵',
  '蓝湾体育',
  '长安猎鹰',
  '星河青年',
];
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
    schemaVersion: 3,
    gameDate: seasonStart(1),
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
