import { clamp } from '../../core/index.mjs';
import { ability } from './skills.mjs';
import { distance, segmentPoint } from './spatial.mjs';
import { movement } from './locomotion.mjs';
import { arrivalTime, pursuitMode } from './arrival.mjs';
import { angleDifference, turnRate } from './execution.mjs';
import { BALL_MOTION } from './ball-motion.mjs';
import { preparationChallengeRisk } from './defending.mjs';
import { keeperLateralCover } from './goalkeeping.mjs';

// Intended crossing height: mid-low in the 2.44m mouth. The sampled height is
// symmetric around it with the shooter's own spread, so a hurried or poor
// strike can rise over the bar as well as drift wide.
export const SHOT_AIM_HEIGHT = 1;
const heightNode = (q) => (q < 0.5 ? Math.sqrt(2 * q) - 1 : 1 - Math.sqrt(2 * (1 - q)));

// Shared with the actual kick sampler: these are dispersion/flight parameters,
// never a sampled goal, a desired shot count, or a second physical simulation.
export function shotExecution(actor, dist, quality, ball = null) {
  const speed = Math.hypot(actor.velocity.x, actor.velocity.z);
  const lateral = Math.abs(actor.velocity.z) / Math.max(1, speed);
  // Striking a ball that is still moving relative to the foot, or is off the
  // ground, is harder than striking a settled one: a first-time finish of a
  // driven pass misses more often than a shot after a touch. Technique absorbs
  // part of it. The same observed ball state feeds the estimate and the kick.
  const contact = ball
    ? Math.hypot((ball.vx ?? 0) - actor.velocity.x, (ball.vz ?? 0) - actor.velocity.z) +
      2 * Math.max(0, (ball.y ?? BALL_MOTION.radius) - 0.3)
    : 0;
  const error =
    0.55 +
    dist * (0.035 + 0.26 * (1 - quality.value / 100)) +
    quality.pressure * 0.9 +
    lateral * 0.35 +
    contact * (0.04 + 0.08 * (1 - quality.value / 100));
  return {
    error,
    // Height and width errors come from the same strike, so the vertical
    // spread grows with range like the lateral one: a long shot can clear the
    // bar as easily as it drifts wide. Vertical control is slightly tighter.
    heightSpread: Math.max(
      1.2 + (100 - quality.value) / 65,
      error * 1.6 * 0.85 + quality.pressure * 0.4,
    ),
    speed: Math.min(
      23 + 0.1 * ability(actor.player, 'strength'),
      20 + dist * 0.25 + quality.pressure * 4,
    ),
  };
}

// Deterministic quadrature of the same two-corner, elevated shot plan used by
// the kick sampler. A grounded pass to the centre of goal wrongly treats a
// defender below a rising shot as an unavoidable block. This predicts contact;
// Rapier and the actual sampled kick still decide the outcome.
export function shotBlockRisk(actor, ball, opponents, direction, quality) {
  const goalX = direction === 1 ? 105 : 0;
  const execution = shotExecution(actor, distance(ball, { x: goalX, z: 34 }), quality, ball);
  let total = 0;
  for (const corner of [-1, 1]) {
    const target = { x: goalX + direction * (BALL_MOTION.radius + 0.05), z: 34 + corner * 1.7 };
    const flight = Math.max(0.15, distance(ball, target) / execution.speed);
    for (const quantile of [0.25, 0.75]) {
      const targetY = Math.max(
        0.15,
        SHOT_AIM_HEIGHT + heightNode(quantile) * execution.heightSpread,
      );
      let survival = 1;
      for (const opponent of opponents) {
        if (opponent.sentOff || opponent.isKeeper || opponent.player.role === 'GK') continue;
        const { t, gap } = segmentPoint(ball, target, opponent.pos);
        if (t <= 0 || t >= 1) continue;
        const height = (ball.y ?? 0.11) * (1 - t) + targetY * t + 4.905 * flight ** 2 * t * (1 - t);
        if (height > (opponent.height ?? 1.8) + 0.35) continue;
        const point = { x: ball.x + (target.x - ball.x) * t, z: ball.z + (target.z - ball.z) * t };
        const reaction = 0.08 + (100 - ability(opponent.player, 'anticipation')) * 0.002;
        const reach = arrivalTime(opponent, point, pursuitMode(opponent, point), reaction);
        const contact = gap < 0.43 ? 0.98 : clamp((flight * t + 0.08 - reach) / 0.35, 0, 0.94);
        survival *= 1 - contact;
      }
      total += 1 - survival;
    }
  }
  return total / 4;
}

// CDF of U(0,1)+U(0,1)-1, the same lateral noise used by a real shot.
const triangularCdf = (x) =>
  x <= -1 ? 0 : x >= 1 ? 1 : x < 0 ? (x + 1) ** 2 / 2 : 1 - (1 - x) ** 2 / 2;
// Default aim is the empty-net placement (centre); pass a placement offset
// to evaluate a kick aimed away from a visible keeper.
export function onTargetEstimate(actor, dist, quality, aim = 0, ball = null) {
  const spread = shotExecution(actor, dist, quality, ball);
  const half = 3.66 - BALL_MOTION.radius;
  const scale = spread.error * 1.6;
  const horizontal = triangularCdf((half - aim) / scale) - triangularCdf((-half - aim) / scale);
  return (
    horizontal * triangularCdf((2.44 - BALL_MOTION.radius - SHOT_AIM_HEIGHT) / spread.heightSpread)
  );
}

// Inverse CDF of the same triangular lateral error at fixed quantiles.
const TRIANGULAR_NODES = Array.from({ length: 12 }, (_, i) => {
  const q = (i + 0.5) / 12;
  return q < 0.5 ? Math.sqrt(2 * q) - 1 : 1 - Math.sqrt(2 * (1 - q));
});

// Where across the goal a shooter places the ball. A real finisher trades the
// chance of missing the frame against the chance the visible keeper reaches it:
// aiming nearer the post beats the keeper more often but misses more often.
// Each candidate is scored with the shooter's own lateral dispersion and the
// keeper's physical cover (goalkeeping.mjs); the kick, the dive and Rapier
// still decide what happens. No miss, save or goal rate is targeted here.
export function shotPlacement(actor, ball, keeper, direction, quality) {
  const goalX = direction === 1 ? 105 : 0;
  const dist = distance(ball, { x: goalX, z: 34 });
  const execution = shotExecution(actor, dist, quality, ball);
  const spread = execution.error * 1.6;
  const half = 3.66 - BALL_MOTION.radius;
  const keeperDepth =
    keeper && Math.abs(goalX - ball.x) > 0.5
      ? clamp(Math.abs(keeper.pos.x - ball.x) / Math.abs(goalX - ball.x), 0, 1)
      : 1;
  const cover = keeper
    ? keeperLateralCover(keeper, Math.max(0.1, (dist * keeperDepth) / execution.speed))
    : 0;
  let best = { aim: 34, value: -1, onTarget: 0 };
  for (let offset = -half + 0.15; offset <= half - 0.15 + 1e-9; offset += 0.25) {
    let beaten = 0,
      framed = 0;
    for (const node of TRIANGULAR_NODES) {
      const z = 34 + offset + node * spread;
      if (Math.abs(z - 34) > half) continue;
      framed++;
      if (!keeper) {
        beaten++;
        continue;
      }
      const atKeeper = ball.z + (z - ball.z) * keeperDepth;
      beaten += 1 / (1 + Math.exp(-(Math.abs(atKeeper - keeper.pos.z) - cover) / 0.25));
    }
    const value = beaten / TRIANGULAR_NODES.length;
    // Equal value (an empty net) prefers the more central, safer aim.
    if (
      value > best.value + 1e-9 ||
      (value > best.value - 1e-9 && Math.abs(offset) < Math.abs(best.aim - 34))
    )
      best = { aim: 34 + offset, value, onTarget: framed / TRIANGULAR_NODES.length };
  }
  return { ...best, cover };
}

export function shotWindowValue(actor, ball, opponents, direction, quality, chance, blocked) {
  const goal = { x: direction === 1 ? 105 : 0, z: 34 };
  const dist = distance(ball, goal);
  const execution = shotExecution(actor, dist, quality, ball);
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
  const ready = 1 - preparationChallengeRisk(actor, ball, opponents, preparation);
  // `chance` is the uncalibrated geometric opportunity for an average kick;
  // this shooter's dispersion scales it relative to a reference 65 kick.
  const accuracy =
    onTargetEstimate(actor, dist, quality, 0, ball) /
    Math.max(0.01, onTargetEstimate(actor, dist, { ...quality, value: 65 }, 0, ball));
  const expected = clamp(chance * accuracy * ready, 0, 0.98);
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
