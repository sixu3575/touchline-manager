import { clamp, seedFrom, random } from '../../core/index.mjs';
import { ATTRIBUTE_GROUPS } from './catalog.mjs';
const keys = Object.values(ATTRIBUTE_GROUPS).flatMap((g) => Object.keys(g.attributes));
const physical = new Set(['acceleration', 'sprintSpeed', 'agility', 'stamina']);
const mental = new Set([
  'vision',
  'decisions',
  'composure',
  'positioning',
  'anticipation',
  'teamwork',
  'concentration',
  'offTheBall',
  'command',
]);
export function developmentState(p, date) {
  if (!p.development)
    p.development = {
      version: 1,
      lastDate: date,
      peaks: Object.fromEntries(keys.map((k) => [k, Math.round(p.attributes[k])])),
      decay: {},
      potentialDecay: 0,
    };
  for (const k of keys)
    p.development.peaks[k] = Math.max(p.development.peaks[k] ?? 1, Math.round(p.attributes[k]));
  return p.development;
}
export function ageDevelopment(p, date) {
  const d = developmentState(p, date),
    days = Math.max(0, Math.floor((Date.parse(date) - Date.parse(d.lastDate)) / 86400000));
  if (!days) return [];
  const rng = random(seedFrom(`${p.id}:${p.birthDate}:aging-v1`)),
    changes = [];
  for (const key of keys) {
    const variation = 0.65 + rng() * 0.8;
    const start =
      (physical.has(key)
        ? 28
        : mental.has(key)
          ? 35
          : key === 'strength' || key === 'balance'
            ? 32
            : p.role === 'GK' &&
                ['reflexes', 'handling', 'oneOnOnes', 'aerialReach', 'distribution'].includes(key)
              ? 33
              : 31) +
      rng() * 3;
    const past = Math.max(0, p.age - start);
    const annual = past
      ? (physical.has(key) ? 1.15 : mental.has(key) ? 0.22 : 0.65) *
        (1 + past * 0.55) *
        variation *
        (1.12 - (p.personality?.professionalism ?? 50) * 0.002)
      : 0;
    const total = (d.decay[key] ?? 0) + Math.round(((annual * days) / 365) * 100);
    const before = p.attributes[key];
    p.attributes[key] = Math.max(1, before - Math.floor(total / 100));
    d.decay[key] = total % 100;
    if (before !== p.attributes[key])
      changes.push({
        attribute: key,
        from: before,
        to: p.attributes[key],
        delta: p.attributes[key] - before,
        reason: 'age',
      });
  }
  const past = Math.max(0, p.age - (p.role === 'GK' ? 32 : 28));
  const pot =
    d.potentialDecay +
    Math.round((((past ? (0.6 + past * 0.35) * (0.7 + rng() * 0.6) : 0) * days) / 365) * 100);
  p.potential = Math.max(1, p.potential - Math.floor(pot / 100));
  d.potentialDecay = pot % 100;
  d.lastDate = date;
  return changes;
}
export function assignedTraining(p, attributes, quality, level, rng, date) {
  const d = developmentState(p, date),
    changes = [];
  for (const key of attributes) {
    const ceiling = Math.min(100, Math.max(p.potential, d.peaks[key] ?? p.attributes[key]));
    const room = clamp((ceiling - p.attributes[key]) / 22, 0.12, 1);
    const attitude =
      0.5 +
      (p.personality?.professionalism ?? 50) * 0.007 +
      (p.personality?.ambition ?? 50) * 0.002;
    const age = p.age <= 21 ? 1.15 : p.age < 29 ? 1 : p.age < 34 ? 0.55 : 0.27;
    const probability = clamp(
      (0.15 + quality / 230) * attitude * room * age * (1 + (level - 1) * 0.12),
      0.01,
      0.82,
    );
    const before = p.attributes[key];
    if (rng() < probability && before < ceiling) p.attributes[key]++;
    if (before !== p.attributes[key])
      changes.push({
        attribute: key,
        from: before,
        to: p.attributes[key],
        delta: 1,
        reason: 'training',
      });
  }
  developmentState(p, date);
  return changes;
}
