import { clamp } from '../../core/index.mjs';
// The desired outgoing velocity becomes an impulse only after a finite-foot contact.
// Quality controls spill/angle error; the body remains independent of the ball.
export function firstTouchVelocity(actor, ball, direction, quality, incoming, rng, opponents = []) {
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
  const speed = Math.min(
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
