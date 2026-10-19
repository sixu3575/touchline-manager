import { clamp } from '../../core/index.mjs';
import { ability } from './skills.mjs';

// Actor-local state is included by packActors. SI units; no frame/RNG dependence.
export function activityState() {
  return {
    load: 0,
    burst: 0,
    recovery: 0,
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
  return !actor.activity || (actor.activity.recovery <= 0 && actor.activity.load < 0.78);
}
export function recordMovement(actor, before, after, dt, active, carrying) {
  const a = (actor.activity ??= activityState());
  const metres = Math.hypot(after.x - before.x, after.z - before.z);
  const speed = metres / dt,
    kmh = speed * 3.6;
  const zone = kmh <= 7 ? 0 : kmh <= 15 ? 1 : kmh <= 20 ? 2 : kmh <= 25 ? 3 : 4;
  actor.distance += metres;
  if (carrying) actor.carryDistance += metres;
  a.zones[zone] += metres;
  a.seconds[zone] += dt;
  a[active ? 'liveMetres' : 'deadMetres'] += metres;
  const endurance = ability(actor.player, 'stamina') / 100;
  const high = speed > 5.56;
  if (high) a.highDuration += dt;
  else if (a.highDuration > 0) {
    if (a.highDuration >= 0.8)
      a.recovery = Math.max(a.recovery, 12 + 6 * (1 - endurance) + a.highDuration * 0.8);
    a.highDuration = 0;
  }
  a.load = clamp(a.load + dt * (high ? 0.2 - 0.05 * endurance : speed < 2 ? -0.05 : -0.012), 0, 1);
  a.recovery = Math.max(0, a.recovery - dt * (speed < 4.2 ? 1 : 0.4));
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
