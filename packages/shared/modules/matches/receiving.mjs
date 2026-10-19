import { clamp } from '../../core/index.mjs';
import { ability } from './skills.mjs';
import { movement } from './locomotion.mjs';
import { distance } from './spatial.mjs';

export function receptionPlan(actor, ball, direction, quality, incoming, opponents = [], time = 0) {
  const space = Math.min(20, ...opponents.map((o) => distance(o.pos, ball)));
  const running = Math.hypot(actor.velocity.x, actor.velocity.z);
  const forward = running < 1 || (actor.velocity.x * direction) / running > 0.35;
  const easy = incoming < 17 + quality * 0.05;
  const flow = space > 4 && forward && easy && quality >= 35;
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
    const d = Math.hypot(threat.pos.x - ball.x, threat.pos.z - ball.z);
    if (d < 3) {
      heading.x += ((ball.x - threat.pos.x) / Math.max(0.1, d)) * (3 - d);
      heading.z += ((ball.z - threat.pos.z) / Math.max(0.1, d)) * (3 - d);
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
    : Math.min(
        2.2,
        0.55 + running * 0.35 + clamp(incoming - 8, 0, 15) * (1 - quality / 100) * 0.06,
      );
  const error = (rng() - 0.5) * (1 - quality / 100) * (0.3 + incoming / 12);
  return {
    x: (heading.x / length) * speed - (heading.z / length) * error,
    z: (heading.z / length) * speed + (heading.x / length) * error,
    y: 0.04,
  };
}
