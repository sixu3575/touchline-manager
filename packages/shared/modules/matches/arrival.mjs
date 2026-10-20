import { movement } from './locomotion.mjs';
import { distance, unit } from './spatial.mjs';
import { sprintAvailable } from './activity.mjs';
import { groundTravel, AIR_DRAG } from './ball-motion.mjs';

// Shared bounded arrival estimate, not a teleport or a claim of possession.
// Include momentum, braking a wrong-way velocity, acceleration and observation.
export function arrivalTime(actor, point, mode = 'sprint', reaction = 0.08) {
  if (!sprintAvailable(actor))
    mode = mode === 'carryFast' ? 'carry' : mode === 'sprint' ? 'run' : mode;
  return boundedArrival(actor, point, movement(actor.player, actor.energy, mode), reaction);
}
function boundedArrival(actor, point, m, reaction) {
  const h = unit(actor.pos, point);
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

// A defender races a reachable future point, not the ball's old position. Use
// the same movement limits and observed drag/gravity as the receiving predictor.
export function movingBallIntercept(actor, ball) {
  const speed = Math.hypot(ball.vx ?? 0, ball.vz ?? 0);
  const mode = pursuitMode(actor, ball);
  const m = movement(actor.player, actor.energy, sprintAvailable(actor) ? mode : 'run');
  let fallback = { point: { x: ball.x, z: ball.z }, time: Infinity },
    bestLate = Infinity;
  for (let t = 0.1; t <= 2.4; t += 0.1) {
    const travel =
      ball.y > 0.2 ? Math.log1p(AIR_DRAG * speed * t) / AIR_DRAG : groundTravel(speed, t);
    const scale = travel / Math.max(0.001, speed);
    const point = { x: ball.x + (ball.vx ?? 0) * scale, z: ball.z + (ball.vz ?? 0) * scale };
    if (point.x < 0 || point.x > 105 || point.z < 0 || point.z > 68) break;
    const height = Math.max(0.11, (ball.y ?? 0.11) + (ball.vy ?? 0) * t - 4.905 * t * t);
    if (height > (actor.height ?? 1.8) + 0.35) continue;
    const arrival = boundedArrival(actor, point, m, 0.08);
    if (arrival <= t) return { point, time: t, feasible: true };
    if (arrival - t < bestLate) {
      bestLate = arrival - t;
      fallback = { point, time: 2.5 + bestLate, feasible: false };
    }
  }
  return fallback;
}

export function pursuitMode(actor, ball) {
  return distance(actor.pos, ball) > 7 ? 'sprint' : 'run';
}
