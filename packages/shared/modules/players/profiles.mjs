import { clamp } from '../../core/index.mjs';

export const ATTRIBUTE_PROFILE_VERSION = 1;
export const SPECIALISMS = {
  stopper: '强硬防守型',
  ballPlaying: '出球防守型',
  fullback: '边路往返型',
  playmaker: '组织创造型',
  ballWinner: '拦截扫荡型',
  runner: '全能跑动型',
  winger: '速度突破型',
  poacher: '禁区抢点型',
  target: '支点争顶型',
  creator: '串联技术型',
  shotStopper: '反应扑救型',
  sweeper: '出击出球型',
  aerial: '制空指挥型',
  observation: '全能进攻型 · 观察球员',
};
const roles = {
  GK: ['shotStopper', 'sweeper', 'aerial'],
  DEF: ['stopper', 'ballPlaying', 'fullback'],
  MID: ['playmaker', 'ballWinner', 'runner', 'winger'],
  FWD: ['poacher', 'target', 'winger', 'creator'],
};
const bias = {
  stopper: {
    marking: 13,
    tackling: 12,
    positioning: 8,
    heading: 14,
    strength: 16,
    acceleration: -8,
    agility: -9,
    crossing: -12,
    firstTouch: -8,
  },
  ballPlaying: {
    passing: 12,
    vision: 9,
    composure: 11,
    firstTouch: 13,
    decisions: 5,
    strength: -5,
    tackling: -5,
    crossing: -6,
  },
  fullback: {
    acceleration: 12,
    sprintSpeed: 7,
    crossing: 18,
    dribbling: 11,
    offTheBall: 10,
    stamina: 8,
    heading: -14,
    strength: -10,
    positioning: -5,
  },
  playmaker: {
    vision: 16,
    passing: 7,
    decisions: 10,
    firstTouch: 17,
    composure: 12,
    teamwork: 10,
    sprintSpeed: -8,
    tackling: -14,
    strength: -9,
    heading: -9,
  },
  ballWinner: {
    tackling: 18,
    marking: 13,
    anticipation: 15,
    positioning: 12,
    strength: 13,
    concentration: 11,
    dribbling: -12,
    finishing: -10,
    crossing: -13,
    vision: -8,
  },
  runner: {
    stamina: 14,
    acceleration: 8,
    offTheBall: 12,
    teamwork: 11,
    anticipation: 6,
    firstTouch: -6,
    setPieces: -12,
    vision: -5,
  },
  winger: {
    acceleration: 14,
    sprintSpeed: 7,
    dribbling: 18,
    agility: 15,
    crossing: 12,
    firstTouch: 6,
    strength: -13,
    heading: -16,
    positioning: -9,
    longShots: -7,
  },
  poacher: {
    finishing: 13,
    offTheBall: 18,
    anticipation: 12,
    composure: 8,
    firstTouch: 7,
    longShots: -13,
    passing: -6,
    vision: -11,
    crossing: -14,
  },
  target: {
    heading: 21,
    strength: 19,
    balance: 12,
    firstTouch: 8,
    finishing: 7,
    sprintSpeed: -12,
    acceleration: -8,
    dribbling: -11,
    crossing: -14,
    agility: -10,
  },
  creator: {
    firstTouch: 17,
    passing: 10,
    vision: 15,
    decisions: 10,
    dribbling: 13,
    longShots: 9,
    finishing: -5,
    heading: -10,
    strength: -8,
  },
  shotStopper: {
    reflexes: 15,
    oneOnOnes: 10,
    agility: 12,
    distribution: -15,
    command: -10,
    aerialReach: -8,
  },
  sweeper: {
    distribution: 19,
    passing: 12,
    decisions: 13,
    acceleration: 9,
    oneOnOnes: 9,
    aerialReach: -11,
    handling: -5,
  },
  aerial: {
    aerialReach: 17,
    command: 14,
    handling: 7,
    strength: 15,
    heading: 12,
    reflexes: -9,
    agility: -10,
    distribution: -9,
  },
};
const groups = {
  pace: { acceleration: 0.5, sprintSpeed: 0.5 },
  shooting: { finishing: 0.6, longShots: 0.2, composure: 0.2 },
  passing: { passing: 0.6, vision: 0.2, decisions: 0.2 },
  defending: { tackling: 0.4, marking: 0.3, positioning: 0.3 },
  stamina: { stamina: 1 },
  keeping: { reflexes: 0.3, handling: 0.25, oneOnOnes: 0.2, aerialReach: 0.15, command: 0.1 },
};
const independent = [
  'firstTouch',
  'dribbling',
  'crossing',
  'heading',
  'setPieces',
  'anticipation',
  'offTheBall',
  'teamwork',
  'concentration',
  'agility',
  'balance',
  'strength',
  'distribution',
];
const normal = (rng) =>
  Math.sqrt(-2 * Math.log(Math.max(1e-9, rng()))) * Math.cos(2 * Math.PI * rng());

// Keep the six existing summary budgets while allowing different ways to achieve them.
function fit(attributes, weights, target) {
  const entries = Object.entries(weights);
  let low = -150,
    high = 150;
  for (let i = 0; i < 45; i++) {
    const offset = (low + high) / 2;
    const value = entries.reduce(
      (s, [key, w]) => s + w * clamp(attributes[key] + offset, 1, 100),
      0,
    );
    if (value < target) low = offset;
    else high = offset;
  }
  for (const [key] of entries)
    attributes[key] = Math.round(clamp(attributes[key] + (low + high) / 2, 1, 100));
  // Preserve the rounded summary budget after integer quantisation.
  const goal = Math.round(target);
  for (let i = 0; i < 12; i++) {
    const value = entries.reduce((sum, [key, w]) => sum + attributes[key] * w, 0);
    if (Math.round(value) === goal) break;
    const direction = Math.round(value) < goal ? 1 : -1;
    const candidate = entries
      .filter(([key]) => attributes[key] + direction >= 1 && attributes[key] + direction <= 100)
      .sort((a, b) => b[1] - a[1])[0];
    if (!candidate) break;
    attributes[candidate[0]] += direction;
  }
}
export function profileAttributes(role, budgets, rng, heightCm = 180) {
  const pool = roles[role];
  if (!pool) throw Error('Unknown player role');
  const archetype = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  const attributes = {},
    movement = normal(rng) * 5,
    power = normal(rng) * 5,
    technique = normal(rng) * 5,
    awareness = normal(rng) * 5;
  for (const [group, weights] of Object.entries(groups))
    for (const key of Object.keys(weights)) attributes[key] = budgets[group] + normal(rng) * 8;
  const anchors = {
    firstTouch: budgets.passing,
    dribbling: budgets.pace,
    crossing: budgets.passing,
    heading: budgets.defending,
    setPieces: budgets.shooting,
    anticipation: budgets.defending,
    offTheBall: budgets.pace,
    teamwork: budgets.passing,
    concentration: budgets.defending,
    agility: budgets.pace,
    balance: budgets.pace,
    strength: budgets.stamina,
    distribution: budgets.passing,
  };
  for (const key of independent) attributes[key] = anchors[key] + normal(rng) * 8;
  for (const key of ['acceleration', 'sprintSpeed', 'agility', 'dribbling', 'offTheBall'])
    attributes[key] += movement;
  for (const key of ['strength', 'heading', 'balance']) attributes[key] += power;
  for (const key of ['passing', 'firstTouch', 'dribbling', 'crossing', 'setPieces'])
    attributes[key] += technique;
  for (const key of ['vision', 'decisions', 'anticipation', 'positioning', 'concentration'])
    attributes[key] += awareness;
  // Height nudges aerial/strength tendencies; nationality never enters ability generation.
  attributes.heading += (heightCm - 180) * 0.35;
  attributes.strength += (heightCm - 180) * 0.25;
  for (const [key, value] of Object.entries(bias[archetype])) attributes[key] += value;
  for (const key of Object.keys(attributes))
    attributes[key] = Math.round(clamp(attributes[key], 1, 100));
  for (const [group, weights] of Object.entries(groups)) fit(attributes, weights, budgets[group]);
  return { attributes, archetype };
}
