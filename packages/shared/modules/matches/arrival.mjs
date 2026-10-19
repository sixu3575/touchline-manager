import { movement } from './locomotion.mjs';
import { distance, unit } from './spatial.mjs';
import { sprintAvailable } from './activity.mjs';

// Shared bounded arrival estimate, not a teleport or a claim of possession.
// Include momentum, braking a wrong-way velocity, acceleration and observation.
export function arrivalTime(actor, point, mode = 'sprint', reaction = 0.08) {
  if (!sprintAvailable(actor))
    mode = mode === 'carryFast' ? 'carry' : mode === 'sprint' ? 'run' : mode;
  const m = movement(actor.player, actor.energy, mode),
    h = unit(actor.pos, point);
  const v = actor.velocity ?? { x: 0, z: 0 };
  const forward = v.x * h.x + v.z * h.z;
  const lateral = Math.abs(v.x * h.z - v.z * h.x);
  const accel = m.acceleration * m.response,
    brake = m.braking * m.response;
  const turn = Math.max(0, -forward) / brake + (lateral / brake) * 0.35;
  const start = Math.max(0, Math.min(m.speed, forward));
  const length = Math.max(0, distance(actor.pos, point) - 0.65);
  const ramp = (m.speed - start) / accel;
  const rampDistance = start * ramp + 0.5 * accel * ramp * ramp;
  const travel =
    length < rampDistance
      ? (Math.sqrt(start * start + 2 * accel * length) - start) / accel
      : ramp + (length - rampDistance) / m.speed;
  return reaction + turn + travel;
}

export function pursuitMode(actor, ball) {
  return distance(actor.pos, ball) > 7 ? 'sprint' : 'run';
}
