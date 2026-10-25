import { clamp } from '../../core/index.mjs';

// Stable raw attributes, not fatigue-adjusted abilities: capacity must not
// shrink recursively as the player tires. Cached only in transient matchState.
export function physicalProfile(p) {
  const stamina = clamp(p.attributes?.stamina ?? p.skills?.stamina ?? 50, 1, 100);
  const strength = clamp(p.attributes?.strength ?? 50, 1, 100);
  return {
    stamina,
    strength,
    capacity: 80 + 0.3 * stamina + 0.1 * strength,
    economy: 1.18 - 0.0036 * stamina,
    burstCapacity: 0.7 + 0.004 * strength + 0.002 * stamina,
    reserveRecovery: 0.03 + 0.0003 * stamina + 0.0001 * strength,
    recoveryRate: 0.7 + 0.004 * stamina + 0.002 * strength,
    energyRecovery: 0.08 + 0.0004 * stamina + 0.0002 * strength,
    adrenalineDuration: 0.9 + 0.012 * strength + 0.004 * stamina,
    debtRecovery: 0.0015 + 0.00003 * stamina + 0.00001 * strength,
    // Weekly recovery is calibrated so an average full-match player (about
    // 64% energy at full time) returns to roughly 80% before the next fixture.
    conditionRecovery: 0.065 + 0.0003 * stamina + 0.0001 * strength,
  };
}

export function matchPhysicalProfile(p) {
  const cached = p.matchState?.physiology;
  if (
    cached &&
    cached.stamina === clamp(p.attributes?.stamina ?? p.skills?.stamina ?? 50, 1, 100) &&
    cached.strength === clamp(p.attributes?.strength ?? 50, 1, 100)
  )
    return cached;
  return physicalProfile(p);
}

export function recoveredCondition(p, fitness, days) {
  if (!Number.isFinite(days) || days < 0) throw Error('恢复天数必须是非负有限数值。');
  const before = clamp(Number.isFinite(fitness) ? fitness : 100, 0, 100);
  if (days === 0) return before;
  return 100 - (100 - before) * Math.exp(-physicalProfile(p).conditionRecovery * days);
}
