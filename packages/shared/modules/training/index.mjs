import { trainPlayer } from '../players/index.mjs';
import { enough, money } from '../economy/index.mjs';
export function train(g, payload, rng) {
  if (g.training.used >= 2) throw Error('本轮训练已完成，请参加下一轮比赛。');
  if (!['attack', 'defence', 'fitness'].includes(payload.focus)) throw Error('训练方向无效。');
  enough(g, 6000);
  money(g, '专项训练', -6000, 'train-' + g.season + '-' + g.round + '-' + g.training.used);
  g.training.used++;
  for (const p of g.clubs[0].players) trainPlayer(p, payload.focus, rng);
}
