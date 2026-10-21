import { clamp } from '../../core/index.mjs';
import { physicalProfile, matchPhysicalProfile } from './physiology.mjs';

const physical = new Set(['acceleration', 'sprintSpeed', 'agility', 'balance', 'strength']);
const technical = new Set([
  'finishing',
  'longShots',
  'passing',
  'firstTouch',
  'dribbling',
  'crossing',
  'tackling',
  'marking',
  'heading',
  'setPieces',
  'reflexes',
  'handling',
  'oneOnOnes',
  'aerialReach',
  'command',
  'distribution',
]);
export function createMatchState(p) {
  return {
    energy: clamp(p.fitness ?? 100, 0, 100),
    energyCeiling: clamp(p.fitness ?? 100, 0, 100),
    physiology: physicalProfile(p),
    morale: p.wellbeing?.morale ?? 50,
    confidence: p.wellbeing?.confidence ?? 50,
    adaptation: p.wellbeing?.adaptation ?? 100,
    moraleChange: 0,
    confidenceChange: 0,
  };
}
export function mentalModifier(state) {
  return clamp(
    (2 * (state.morale - 50)) / 50 +
      (1.5 * (state.confidence - 50)) / 50 -
      4 * (1 - state.adaptation / 100),
    -4,
    3,
  );
}
export function effectiveAbility(p, key) {
  const state = p.matchState;
  let value = p.attributes?.[key] ?? 50;
  if (!state) return value;
  const remaining = clamp(state.energy / 100, 0, 1);
  if (physical.has(key)) value *= 0.7 + 0.3 * Math.sqrt(remaining);
  if (technical.has(key)) value *= 0.88 + 0.12 * remaining;
  if (key === 'composure' || key === 'decisions') value += mentalModifier(state);
  return clamp(value, 1, 100);
}
export function matchShock(p, morale, confidence, leadership = 0) {
  const state = p.matchState;
  if (morale < 0) morale *= 1 - (0.15 * leadership) / 100;
  if (confidence < 0)
    confidence *= clamp(1.25 - 0.0075 * (p.personality?.resilience ?? 50), 0.5, 1.25);
  for (const [key, amount] of [
    ['morale', morale],
    ['confidence', confidence],
  ]) {
    const changeKey = key + 'Change';
    const initial = state[key] - state[changeKey];
    // Cap the actual net change, including when a previous shock hit 0 or 100.
    state[key] = clamp(state[key] + amount, Math.max(0, initial - 10), Math.min(100, initial + 10));
    state[changeKey] = state[key] - initial;
  }
}
export function energyCost(p, speed, press, live, dt) {
  const profile = matchPhysicalProfile(p);
  const role = p.role === 'GK' ? 0.45 : 1;
  const intensity = { high: 1.2, normal: 1, low: 0.85 }[press] ?? 1;
  return (
    ((dt * 0.32) / 60) *
    role *
    intensity *
    (0.2 + 0.4 * speed + 0.03 * Math.max(0, speed - 4) ** 2) *
    profile.economy *
    (100 / profile.capacity) *
    (live ? 1 : 0.2)
  );
}
export function energyRecovery(p, speed, dt) {
  const profile = matchPhysicalProfile(p);
  return (
    (dt / 60) *
    profile.energyRecovery *
    (100 / profile.capacity) *
    clamp(1 - (speed / 2) ** 2, 0, 1)
  );
}
export function updateMatchEnergy(p, energy, speed, press, live, dt) {
  return clamp(
    energy - energyCost(p, speed, press, live, dt) + energyRecovery(p, speed, dt),
    0,
    p.matchState?.energyCeiling ?? p.fitness ?? 100,
  );
}
export function advanceAdaptation(g, days) {
  for (const c of g.clubs)
    for (const p of c.players)
      p.wellbeing.adaptation = Math.min(
        100,
        (p.wellbeing.adaptation ?? 100) + (days * (2 + 0.06 * p.personality.adaptability)) / 7,
      );
}
