import { enough, money } from '../economy/index.mjs';
export function upgrade(g, payload, rng) {
  const me = g.clubs[0];

  if (g.stadium.level >= 5) throw Error('试验版球场已达到最高等级。');
  const cost = g.stadium.level * 180000;
  enough(g, cost);
  money(g, '主场扩建', -cost, 'stadium-' + g.stadium.level);
  g.stadium.level++;
  g.stadium.capacity += 1500;
}
