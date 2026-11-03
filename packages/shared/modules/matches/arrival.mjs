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
export function interceptionReadTime(actor) {
  const anticipation = actor.player.attributes?.anticipation ?? 50;
  const positioning = actor.player.attributes?.positioning ?? 50;
  return 0.08 + ((100 - anticipation) * 0.0007 + (100 - positioning) * 0.0005);
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

// Heights at which an outfield body can actually play the ball, matching the
// physical contacts: the foot volume (centre 0.2m, radius 0.18m) and the head
// volume used for headers (from 1.25m up to just above standing height).
// There is no thigh/chest trap, so a ball passing at waist height is not a
// receiving point; plan for where it drops to the feet or rises to the head.
export const FOOT_PLAY_HEIGHT = 0.45;
export function playableHeight(actor, height) {
  return height <= FOOT_PLAY_HEIGHT || (height >= 1.25 && height <= (actor.height ?? 1.8) + 0.35);
}

// A defender races a reachable future point, not the ball's old position. Use
// the same movement limits and observed drag/gravity as the receiving predictor.
export function movingBallIntercept(actor, ball) {
  const speed = Math.hypot(ball.vx ?? 0, ball.vz ?? 0);
  const mode = pursuitMode(actor, ball);
  const m = movement(actor.player, actor.energy, sprintAvailable(actor) ? mode : 'run');
  const readingTime = interceptionReadTime(actor);
  let fallback = { point: { x: ball.x, z: ball.z }, time: Infinity },
    bestLate = Infinity;
  for (let t = 0.1; t <= 2.4; t += 0.1) {
    const travel =
      ball.y > 0.2 ? Math.log1p(AIR_DRAG * speed * t) / AIR_DRAG : groundTravel(speed, t);
    const scale = travel / Math.max(0.001, speed);
    const point = { x: ball.x + (ball.vx ?? 0) * scale, z: ball.z + (ball.vz ?? 0) * scale };
    if (point.x < 0 || point.x > 105 || point.z < 0 || point.z > 68) break;
    const height = Math.max(0.11, (ball.y ?? 0.11) + (ball.vy ?? 0) * t - 4.905 * t * t);
    if (!playableHeight(actor, height)) continue;
    const arrival = boundedArrival(actor, point, m, readingTime);
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

// A carrier keeps moving. A pursuer who cannot get level with the carrier's
// observed path is not the defender who can stop him, however near he is now;
// one who can step into that path is. Same movement limits as arrivalTime.
export function carrierIntercept(actor, carrier, reaction = 0.08) {
  let mode = pursuitMode(actor, carrier.pos);
  if (!sprintAvailable(actor)) mode = 'run';
  const m = movement(actor.player, actor.energy, mode);
  const v = carrier.velocity ?? { x: 0, z: 0 };
  let bestLate = Infinity;
  for (let t = 0; t <= 3; t += 0.15) {
    const point = {
      x: Math.min(105, Math.max(0, carrier.pos.x + v.x * t)),
      z: Math.min(68, Math.max(0, carrier.pos.z + v.z * t)),
    };
    const arrival = boundedArrival(actor, point, m, reaction);
    if (arrival <= t + 0.15) return Math.max(arrival, t);
    bestLate = Math.min(bestLate, arrival - t);
  }
  return 3 + bestLate;
}
