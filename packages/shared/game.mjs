// Compatibility facade and action orchestration. Rules belong to their owning modules.
import { random } from './core/index.mjs';
import { rename } from './modules/club/index.mjs';
import { saveTactics } from './modules/tactics/index.mjs';
import { train } from './modules/training/index.mjs';
import { sign } from './modules/transfers/index.mjs';
import { upgrade } from './modules/stadium/index.mjs';
import { advance, cup, newSeason } from './modules/competitions/index.mjs';
export { random } from './core/index.mjs';
export { player, rating, SKILLS } from './modules/players/index.mjs';
export { FORMATIONS, bestLineup, validateLineup } from './modules/tactics/index.mjs';
export { ENGINE_VERSION, simulate } from './modules/matches/index.mjs';
export { schedule, standings } from './modules/competitions/index.mjs';
export { createGame } from './modules/world/index.mjs';
export const myClub = (g) => g.clubs[0];
const actions = {
  rename,
  tactics: saveTactics,
  train,
  sign,
  upgrade,
  advance,
  cup,
  season: newSeason,
};
export function applyAction(g, type, payload = {}) {
  if (!Object.hasOwn(actions, type)) throw Error('不支持的操作。');
  const rng = random(g.seed + g.season * 101 + g.round * 7919 + g.revision * 31);
  actions[type](g, payload, rng);
  g.revision++;
  g.lastMessage = {
    rename: '俱乐部名称已更新。',
    tactics: '战术与首发已保存。',
    train: '训练完成，细分能力与体能已更新。',
    sign: '签约成功，欢迎新援！',
    upgrade: '主场扩建完成！',
    advance: '本轮联赛已结算，比赛回放已就绪。',
    cup: '杯赛已结算，查看战报了解比赛过程。',
    season: '新赛季开启，新的挑战正在等待。',
  }[type];
  return g;
}
