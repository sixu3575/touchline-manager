import { clamp } from '../../core/index.mjs';
import { matchPhysicalProfile, updateMatchEnergy } from '../players/index.mjs';

// Actor-local state is included by packActors. SI units; no frame/RNG dependence.
export function activityState() {
  return {
    load: 0,
    burst: 0,
    recovery: 0,
    adrenalineRemaining: 0,
    adrenalineEfforts: 0,
    emergencyDebt: 0,
    previousVelocity: { x: 0, z: 0 },
    sprinting: false,
    highDuration: 0,
    zones: [0, 0, 0, 0, 0],
    seconds: [0, 0, 0, 0, 0],
    liveMetres: 0,
    deadMetres: 0,
    sprintEfforts: 0,
    longestSprint: 0,
  };
}
export function sprintAvailable(actor) {
  if ((actor.energy ?? actor.player?.matchState?.energy ?? 100) <= 0) return false;
  return (
    !actor.activity ||
    actor.activity.adrenalineRemaining > 0 ||
    (actor.activity.recovery <= 0 && actor.activity.load < 0.78)
  );
}
export function triggerAdrenalineSprint(actor, critical) {
  const a = actor.activity;
  const energy = actor.energy ?? actor.player?.matchState?.energy ?? 100;
  if (!critical || !a || energy <= 0 || sprintAvailable(actor) || (a.emergencyDebt ?? 0) > 0.2)
    return false;
  a.adrenalineRemaining =
    matchPhysicalProfile(actor.player).adrenalineDuration * Math.sqrt(clamp(energy / 100, 0, 1));
  a.adrenalineEfforts++;
  a.emergencyDebt = 1;
  if (actor.player.matchState) actor.player.matchState.sprintRecovering = false;
  return true;
}
export function burstReserve(actor) {
  const load = actor.activity?.load ?? 0;
  return clamp((1 - load / 0.78) * 100, 0, 100);
}
export function recordMovement(actor, before, after, dt, active, carrying) {
  const a = (actor.activity ??= activityState());
  a.adrenalineRemaining = Math.max(0, a.adrenalineRemaining - dt);
  const metres = Math.hypot(after.x - before.x, after.z - before.z);
  const speed = metres / dt,
    kmh = speed * 3.6;
  const velocity = { x: (after.x - before.x) / dt, z: (after.z - before.z) / dt };
  const prior = a.previousVelocity ?? { x: 0, z: 0 };
  const priorSquared = prior.x ** 2 + prior.z ** 2;
  const positiveWork = Math.max(0, 0.5 * (speed ** 2 - priorSquared));
  const turningWork = 0.5 * Math.max(0, priorSquared - prior.x * velocity.x - prior.z * velocity.z);
  a.previousVelocity = velocity;
  const zone = kmh <= 7 ? 0 : kmh <= 15 ? 1 : kmh <= 20 ? 2 : kmh <= 25 ? 3 : 4;
  actor.distance += metres;
  if (carrying) actor.carryDistance += metres;
  a.zones[zone] += metres;
  a.seconds[zone] += dt;
  a[active ? 'liveMetres' : 'deadMetres'] += metres;
  const profile = matchPhysicalProfile(actor.player);
  const endurance = profile.stamina / 100;
  // Excess exertion recovers with low-intensity time, not a per-match quota.
  a.emergencyDebt = Math.max(
    0,
    (a.emergencyDebt ?? 0) - dt * profile.debtRecovery * (speed < 2 ? 1 : speed < 4.2 ? 0.4 : 0),
  );
  const high = speed > 5.56;
  if (high) a.highDuration += dt;
  else if (a.highDuration > 0) {
    if (a.highDuration >= 0.8)
      a.recovery = Math.max(a.recovery, 12 + 6 * (1 - endurance) + a.highDuration * 0.8);
    a.highDuration = 0;
  }
  // Repeated starts and cuts also consume short-term capacity. A fast player
  // cannot reset to 'rest' just by zigzagging below the high-speed threshold.
  const workLoad = (positiveWork / 96 + turningWork / 128) / profile.burstCapacity;
  a.load = clamp(
    a.load +
      workLoad +
      dt *
        (high
          ? (0.2 - 0.05 * endurance) / profile.burstCapacity
          : speed < 2
            ? -profile.reserveRecovery
            : -0.24 * profile.reserveRecovery),
    0,
    1,
  );
  a.recovery = Math.max(0, a.recovery - dt * (speed < 4.2 ? 1 : 0.4) * profile.recoveryRate);
  if (kmh > 25) {
    if (!a.sprinting) a.sprintEfforts++;
    a.burst += dt;
    a.longestSprint = Math.max(a.longestSprint, a.burst);
  } else a.burst = 0;
  a.sprinting = kmh > 25;
  if (a.load >= 0.78 && a.recovery === 0) a.recovery = 12 + 10 * (1 - endurance);
  if (actor.player.matchState) {
    actor.player.matchState.exertion = a.load;
    actor.player.matchState.sprintRecovering = !sprintAvailable(actor);
  }
}

// A real fifteen-minute interval, without advancing the 90-minute match clock
// or inventing movement distance. Only recover resources; never refill to 100.
export function restAtHalfTime(actor) {
  const a = actor.activity;
  const profile = matchPhysicalProfile(actor.player);
  actor.energy = updateMatchEnergy(actor.player, actor.energy, 0, 'normal', false, 900);
  actor.player.matchState.energy = actor.energy;
  a.load = Math.max(0, a.load - 900 * profile.reserveRecovery);
  a.recovery = Math.max(0, a.recovery - 900 * profile.recoveryRate);
  a.emergencyDebt = Math.max(0, (a.emergencyDebt ?? 0) - 900 * profile.debtRecovery);
  a.adrenalineRemaining = 0;
  a.highDuration = 0;
  a.burst = 0;
  a.sprinting = false;
  a.previousVelocity = { x: 0, z: 0 };
  actor.player.matchState.exertion = a.load;
  actor.player.matchState.sprintRecovering = !sprintAvailable(actor);
}
