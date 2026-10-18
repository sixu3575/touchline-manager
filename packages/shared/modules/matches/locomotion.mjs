import { clamp } from '../../core/index.mjs';
import { ability } from './skills.mjs';
import { distance } from './spatial.mjs';

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
    run: 4.3 + 0.022 * pace,
    sprint: top,
    carry: top * (0.6 + 0.002 * a('dribbling')),
  };
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
export function movementMode(actor, ball, owner, roles, gap) {
  if (gap < 1.2) return 'walk';
  if (actor === owner) return 'carry';
  const chasing = roles.chasers.includes(actor.index);
  if (roles.receiverId === actor.player.id) return distance(actor.pos, ball) > 5 ? 'sprint' : 'run';
  if (chasing) return distance(actor.pos, ball) > 7 ? 'sprint' : 'run';
  if (roles.runnerId === actor.player.id) return 'sprint';
  if (
    gap > 5 &&
    ['overlap', 'nearPost', 'farPost', 'break'].includes(roles.duties?.[actor.player.id]?.duty)
  )
    return 'sprint';
  return gap > 18 ? 'run' : 'jog';
}
