import { clamp } from '../../core/index.mjs';
import { ability } from './skills.mjs';
import { movement } from './locomotion.mjs';
import { distance } from './spatial.mjs';
import { arrivalTime, pursuitMode } from './arrival.mjs';
import { boundaryAwareness, boundaryVelocity } from './onball.mjs';

export function receptionPlan(actor, ball, direction, quality, incoming, opponents = [], time = 0) {
  const space = Math.min(20, ...opponents.map((o) => distance(o.pos, ball)));
  const running = Math.hypot(actor.velocity.x, actor.velocity.z);
  const forward = running < 1 || (actor.velocity.x * direction) / running > 0.35;
  const easy = incoming < 17 + quality * 0.05;
  const pressArrival = Math.min(
    Infinity,
    ...opponents.map((o) => arrivalTime(o, ball, pursuitMode(o, ball), o.reaction ?? 0.1)),
  );
  const usableTouch =
    (actor.reaction ?? 0.1 + (100 - ability(actor.player, 'decisions')) / 180) +
    0.14 +
    0.18 * (1 - quality / 100);
  const boundary = boundaryAwareness(actor, ball, actor.velocity);
  const flow =
    space > 4 &&
    pressArrival > usableTouch &&
    forward &&
    easy &&
    quality >= 35 &&
    boundary.risk < 0.15;
  const delay = flow
    ? 0.08 + (100 - ability(actor.player, 'decisions')) * 0.002 + (100 - quality) * 0.001
    : 0.22 +
      (100 - quality) * 0.004 +
      (100 - ability(actor.player, 'decisions')) * 0.003 +
      clamp((3 - space) / 3, 0, 1) * 0.28 +
      (forward ? 0 : 0.22) +
      clamp(incoming - 14, 0, 15) * 0.015;
  const prepared =
    actor.receivePreparation && time - actor.receivePreparation.startedAt < 4
      ? (clamp(time - actor.receivePreparation.startedAt, 0, 0.18) *
          (ability(actor.player, 'decisions') + ability(actor.player, 'anticipation'))) /
        200
      : 0;
  return {
    flow,
    delay: Math.max(0.04, delay - prepared),
    space,
    pressArrival,
    shieldHeading: opponents.length
      ? (() => {
          const threat = opponents
            .slice()
            .sort((a, b) => arrivalTime(a, ball) - arrivalTime(b, ball))[0];
          const x = ball.x - threat.pos.x - (threat.velocity?.x ?? 0) * 0.3;
          const z = ball.z - threat.pos.z - (threat.velocity?.z ?? 0) * 0.3;
          const norm = Math.hypot(x, z) || 1;
          return { x: x / norm, z: z / norm };
        })()
      : null,
    destination: {
      x: clamp(actor.pos.x + direction * 9, 1, 104),
      z: clamp(actor.pos.z + (34 - actor.pos.z) * 0.05, 3, 65),
    },
  };
}
// The desired outgoing velocity becomes an impulse only after a finite-foot contact.
// Quality controls spill/angle error; the body remains independent of the ball.
export function firstTouchVelocity(
  actor,
  ball,
  direction,
  quality,
  incoming,
  rng,
  opponents = [],
  plan = null,
) {
  const running = Math.hypot(actor.velocity.x, actor.velocity.z);
  let heading = running > 1 ? { ...actor.velocity } : { x: direction, z: 0 };
  const threat = opponents
    .slice()
    .sort(
      (a, b) =>
        Math.hypot(a.pos.x - ball.x, a.pos.z - ball.z) -
        Math.hypot(b.pos.x - ball.x, b.pos.z - ball.z),
    )[0];
  if (threat) {
    const tx = threat.pos.x + (threat.velocity?.x ?? 0) * 0.3,
      tz = threat.pos.z + (threat.velocity?.z ?? 0) * 0.3;
    const d = Math.hypot(tx - ball.x, tz - ball.z);
    if (d < 3) {
      heading.x += ((ball.x - tx) / Math.max(0.1, d)) * (3 - d);
      heading.z += ((ball.z - tz) / Math.max(0.1, d)) * (3 - d);
    }
  }
  if (ball.z < 3) heading.z = Math.max(1, heading.z);
  if (ball.z > 65) heading.z = Math.min(-1, heading.z);
  const length = Math.hypot(heading.x, heading.z) || 1;
  const speed = plan?.flow
    ? Math.min(
        movement(actor.player, actor.energy, 'carryFast').speed + 0.8,
        Math.max(2.2, running + 0.65 + quality * 0.006),
      )
    : 0.55 + clamp(incoming - 8, 0, 15) * (1 - quality / 100) * 0.06;
  const error = (rng() - 0.5) * (1 - quality / 100) * (0.3 + incoming / 12);
  const nominal = boundaryVelocity(actor, ball, {
    x: (plan?.flow ? 0 : actor.velocity.x * 0.85) + (heading.x / length) * speed,
    z: (plan?.flow ? 0 : actor.velocity.z * 0.85) + (heading.z / length) * speed,
  });
  return {
    x: nominal.x - (heading.z / length) * error,
    z: nominal.z + (heading.x / length) * error,
    y: 0.04,
  };
}
