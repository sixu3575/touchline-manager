import { clamp } from '../../core/index.mjs';
import { ability } from './skills.mjs';
import { distance } from './spatial.mjs';
import { sprintAvailable, triggerAdrenalineSprint } from './activity.mjs';

export function movement(p, energy, mode = 'sprint') {
  if (!p.matchState)
    p = {
      ...p,
      matchState: { energy: energy ?? 100, morale: 50, confidence: 50, adaptation: 100 },
    };
  const a = (key) => clamp(ability(p, key), 1, 100);
  const pace = a('sprintSpeed'),
    top = 5.7 + 0.036 * pace;
  const speeds = {
    walk: 1.5,
    jog: 2.7 + 0.014 * pace,
    run: 4.1 + 0.012 * pace,
    stand: 0,
    sprint: top,
    carry: top * (0.6 + 0.002 * a('dribbling')),
    carryFast: top * (0.86 + 0.001 * a('dribbling')),
  };
  if (p.matchState?.sprintRecovering) {
    speeds.sprint = speeds.run;
    speeds.carry = Math.min(speeds.carry, 4.5 + 0.003 * a('dribbling'));
    speeds.carryFast = speeds.carry;
  }
  return {
    speed: speeds[mode] ?? speeds.run,
    topSpeed: top,
    acceleration: 2.4 + 0.035 * a('acceleration'),
    response: 0.55 + 0.0045 * a('agility'),
    braking: 4 + 0.04 * a('balance'),
  };
}

export function driveMovement(actor, desired, limits, dt, responseMultiplier = 1) {
  const speed = Math.hypot(desired.x, desired.z);
  const factor = speed > limits.speed ? limits.speed / speed : 1;
  const vx = desired.x * factor,
    vz = desired.z * factor;
  const velocity = actor.body.linvel();
  const dx = vx - velocity.x,
    dz = vz - velocity.z,
    delta = Math.hypot(dx, dz);
  const slowing = vx * velocity.x + vz * velocity.z < velocity.x ** 2 + velocity.z ** 2;
  const max =
    (slowing ? limits.braking : limits.acceleration) * limits.response * dt * responseMultiplier;
  const scale = delta > max ? max / delta : 1,
    mass = actor.body.mass();
  actor.body.applyImpulse({ x: dx * scale * mass, y: 0, z: dz * scale * mass }, true);
}
// Tracking a moving person needs both position correction and observed velocity.
// A position-only controller necessarily trails by v/gain, even at equal ability.
// Use the marker's last observation, not the opponent's current hidden velocity.
export function markingVelocity(actor, owner, roles) {
  const memory = actor.markMemory;
  if (
    actor === owner ||
    actor.isKeeper ||
    actor.kickPlan ||
    roles.receiverId === actor.player.id ||
    roles.chasers.includes(actor.index) ||
    !memory ||
    roles.marking?.[actor.player.id] !== memory.id
  )
    return { x: 0, z: 0 };
  const age = Math.max(0, (roles.time ?? memory.seenAt) - memory.seenAt);
  const fade = clamp(1 - Math.max(0, age - 0.9) / 0.5, 0, 1);
  return { x: memory.velocity.x * fade, z: memory.velocity.z * fade };
}
export function movementMode(actor, ball, owner, roles, gap) {
  const fresh = sprintAvailable(actor);
  const criticalSprint = (critical) => fresh || triggerAdrenalineSprint(actor, critical);
  const attackingDepth = actor.direction === -1 ? 105 - ball.x : ball.x;
  const ownGoalDistance = attackingDepth;
  if (actor.kickPlan) return gap > 0.15 ? 'walk' : 'stand';
  if (actor === owner) return actor.intent?.mode === 'carryFast' && fresh ? 'carryFast' : 'carry';
  if (actor.isKeeper) return gap > 0.35 ? 'run' : 'stand';
  const chasing = roles.chasers.includes(actor.index);
  if (chasing || roles.receiverId === actor.player.id) {
    if (gap < 0.4) return 'walk';
    const ballGap = distance(actor.pos, ball);
    const urgent =
      ballGap <= 8 &&
      ((chasing && (attackingDepth >= 70 || ownGoalDistance < 26)) ||
        (roles.receiverId === actor.player.id && attackingDepth >= 70));
    return gap > 2 && ballGap < 18 && criticalSprint(urgent) ? 'sprint' : 'run';
  }
  if (roles.marking?.[actor.player.id]) {
    const speed = actor.markMemory
      ? Math.hypot(actor.markMemory.velocity.x, actor.markMemory.velocity.z)
      : 0;
    const emergencyCover = ownGoalDistance < 26 && gap > 4 && speed > 3.5;
    return criticalSprint(emergencyCover) &&
      speed > movement(actor.player, actor.energy, 'run').speed
      ? 'sprint'
      : speed > 3.5 || gap > 9
        ? 'run'
        : speed > 1.8 || gap > 4
          ? 'jog'
          : gap < 0.8 && speed < 0.3
            ? 'stand'
            : 'walk';
  }
  if (gap < 0.8) return 'stand';
  if (gap < 2.5) return 'walk';
  if (roles.runnerId === actor.player.id) {
    const urgent = attackingDepth >= 70 && distance(actor.pos, ball) < 24 && gap > 9;
    return criticalSprint(urgent) ? 'sprint' : 'jog';
  }
  if (
    gap > 5 &&
    ['overlap', 'nearPost', 'farPost', 'break'].includes(roles.duties?.[actor.player.id]?.duty)
  )
    return criticalSprint(attackingDepth >= 74 && distance(actor.pos, ball) < 18 && gap > 9) &&
      gap > 9
      ? 'sprint'
      : 'jog';
  return gap > 14 ? 'jog' : 'walk';
}
