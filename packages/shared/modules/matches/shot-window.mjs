import { clamp } from '../../core/index.mjs';
import { ability } from './skills.mjs';
import { distance } from './spatial.mjs';
import { movement } from './locomotion.mjs';
import { arrivalTime, pursuitMode } from './arrival.mjs';
import { angleDifference, turnRate } from './execution.mjs';
import { BALL_MOTION } from './ball-motion.mjs';

// Shared with the actual kick sampler: these are dispersion/flight parameters,
// never a sampled goal, a desired shot count, or a second physical simulation.
export function shotExecution(actor, dist, quality) {
  const speed = Math.hypot(actor.velocity.x, actor.velocity.z);
  const lateral = Math.abs(actor.velocity.z) / Math.max(1, speed);
  return {
    error:
      0.55 +
      dist * (0.035 + 0.26 * (1 - quality.value / 100)) +
      quality.pressure * 0.9 +
      lateral * 0.35,
    heightSpread:
      1.5 + (100 - quality.value) / 65 + Math.max(0, dist - 10) * 0.035 + quality.pressure * 0.4,
    speed: Math.min(
      23 + 0.1 * ability(actor.player, 'strength'),
      20 + dist * 0.25 + quality.pressure * 4,
    ),
  };
}

// CDF of U(0,1)+U(0,1)-1, the same lateral noise used by a real shot.
const triangularCdf = (x) =>
  x <= -1 ? 0 : x >= 1 ? 1 : x < 0 ? (x + 1) ** 2 / 2 : 1 - (1 - x) ** 2 / 2;
export function onTargetEstimate(actor, dist, quality) {
  const spread = shotExecution(actor, dist, quality);
  const half = 3.66 - BALL_MOTION.radius;
  const scale = spread.error * 1.6;
  // Three-point quadrature over the intended 1.1–2.3m corner placement.
  const horizontal =
    [1.1, 1.7, 2.3].reduce(
      (sum, aim) =>
        sum + triangularCdf((half - aim) / scale) - triangularCdf((-half - aim) / scale),
      0,
    ) / 3;
  return horizontal * clamp((2.44 - BALL_MOTION.radius - 0.15) / spread.heightSpread, 0, 1);
}

export function shotWindowValue(actor, ball, opponents, direction, quality, xg, blocked) {
  const goal = { x: direction === 1 ? 105 : 0, z: 34 };
  const dist = distance(ball, goal);
  const execution = shotExecution(actor, dist, quality);
  const heading = Math.atan2(goal.z - ball.z, goal.x - ball.x);
  const turn =
    Math.max(
      0,
      Math.abs(angleDifference(heading, actor.facing ?? (direction === 1 ? 0 : Math.PI))) - 0.55,
    ) / turnRate(actor);
  const preparation =
    0.22 +
    (100 - ability(actor.player, 'balance')) * 0.002 +
    execution.speed * 0.004 +
    Math.hypot(actor.velocity.x, actor.velocity.z) * 0.015 +
    turn;
  const closing = Math.min(
    Infinity,
    ...opponents
      .filter((o) => !o.sentOff)
      .map((o) => arrivalTime(o, ball, pursuitMode(o, ball), o.reaction ?? 0.15)),
  );
  const ready = 1 / (1 + Math.exp((preparation - closing) / 0.25));
  // xG remains the existing average-player report metric. Only action utility
  // uses the shooter's dispersion relative to a reference-quality 65 kick.
  const accuracy =
    onTargetEstimate(actor, dist, quality) /
    Math.max(0.01, onTargetEstimate(actor, dist, { ...quality, value: 65 }));
  const expected = clamp(xg * accuracy * ready, 0, 0.98);
  const range = clamp((dist - 16) / 8, 0, 1);
  const specialty = clamp(
    (ability(actor.player, 'longShots') -
      (ability(actor.player, 'passing') + ability(actor.player, 'dribbling')) / 2) /
      50,
    -1,
    1,
  );
  const confidence = actor.player.matchState?.confidence ?? 50;
  const preference = range * specialty * 0.12 * (0.5 + confidence / 200) * (1 - blocked) * ready;
  return { expected, value: expected * (1 + preference), preparation, ready };
}

// Forecast observed motion only, never another AI's hidden target or future RNG.
// This is a bounded reading horizon, not movement applied to the real actors.
export function projectedShotContext(actors, receiver, point, seconds, mode) {
  const reading = 0.35 + 0.0065 * ability(receiver.player, 'decisions');
  const horizon = Math.min(3, Math.max(0, seconds)) * reading;
  const projected = actors.map((a) => {
    if (a === receiver) {
      const length = distance(a.pos, point);
      const speed = mode
        ? movement(a.player, a.energy, mode).speed
        : Math.hypot(a.velocity.x, a.velocity.z);
      const velocity =
        mode && length > 0.1
          ? { x: ((point.x - a.pos.x) / length) * speed, z: ((point.z - a.pos.z) / length) * speed }
          : { ...a.velocity };
      return {
        ...a,
        pos: { x: point.x, z: point.z },
        velocity,
        facing: mode && length > 0.1 ? Math.atan2(velocity.z, velocity.x) : a.facing,
      };
    }
    const velocity = a.velocity ?? { x: 0, z: 0 };
    const speed = Math.hypot(velocity.x, velocity.z);
    const limits = movement(a.player, a.energy, 'sprint');
    const factor = speed > limits.speed ? limits.speed / speed : 1;
    return {
      ...a,
      pos: {
        x: clamp(a.pos.x + velocity.x * horizon * factor, 0.5, 104.5),
        z: clamp(a.pos.z + velocity.z * horizon * factor, 0.5, 67.5),
      },
    };
  });
  return {
    actors: projected,
    receiver: projected[actors.indexOf(receiver)],
    confidence: 3 / Math.max(3, seconds),
  };
}

// Keep build-up unchanged, smoothly replacing territorial potential with a
// short-horizon scoring opportunity as a legal shooting window comes into view.
export function continuationShotValue(baseline, shot, dist, confidence = 1) {
  const weight = clamp((38 - dist) / 12, 0, 1);
  const retained = baseline * 0.25;
  // Shooting after arrival and retaining the ball are alternative plans. Adding
  // both would reward waiting forever with the same shot plus free possession.
  const opportunity = Math.max(retained, (shot?.value ?? 0) * confidence);
  return baseline * (1 - weight) + opportunity * weight;
}
