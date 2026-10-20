import { clamp } from '../../core/index.mjs';

// SI units. Cd is a fixed dry-weather approximation, not a wind-tunnel fit.
export const BALL_MOTION = Object.freeze({
  mass: 0.43,
  radius: 0.11,
  airDensity: 1.225,
  dragCoefficient: 0.25,
  rollingDeceleration: 0.65,
  maxKickSpeed: 38,
  maxGroundPassSpeed: 30,
});
export const AIR_DRAG =
  (0.5 * BALL_MOTION.airDensity * BALL_MOTION.dragCoefficient * Math.PI * BALL_MOTION.radius ** 2) /
  BALL_MOTION.mass;

// Ground planning and the physical solver use the same a + k*v^2 resistance.
// Integrating v*dv/dx = -(a + k*v^2) gives the required launch speed.
export function groundPassPlan(length, quality) {
  const distance = clamp(length, 0.05, 125),
    arrival = clamp(4.5 + 0.17 * distance + 0.015 * quality, 5, 14),
    a = BALL_MOTION.rollingDeceleration,
    k = AIR_DRAG;
  const speed = Math.min(
    BALL_MOTION.maxGroundPassSpeed,
    Math.sqrt((arrival ** 2 + a / k) * Math.exp(2 * k * distance) - a / k),
  );
  const actualArrival = Math.sqrt(
    Math.max(0, (speed ** 2 + a / k) * Math.exp(-2 * k * distance) - a / k),
  );
  const flight =
    (Math.atan(speed * Math.sqrt(k / a)) - Math.atan(actualArrival * Math.sqrt(k / a))) /
    Math.sqrt(a * k);
  return { speed, arrival: actualArrival, flight };
}

// Approximate shooting solution with a constant mean drag rate. The actual
// trajectory is still integrated by Rapier with instantaneous quadratic drag.
export function airborneVelocity(from, to, flight) {
  const dx = to.x - from.x,
    dz = to.z - from.z;
  const meanSpeed = Math.hypot(Math.hypot(dx, dz) / flight, (9.81 * flight) / Math.sqrt(12));
  const rate = AIR_DRAG * meanSpeed;
  const loss = -Math.expm1(-rate * flight),
    gain = rate / loss;
  return {
    x: dx * gain,
    z: dz * gain,
    y: (to.y - from.y) * gain + 9.81 * (flight / loss - 1 / rate),
  };
}

export function groundTravel(speed, time) {
  const a = BALL_MOTION.rollingDeceleration,
    k = AIR_DRAG;
  const angle = Math.atan(speed * Math.sqrt(k / a));
  const remaining = Math.max(0, angle - Math.sqrt(a * k) * time);
  return Math.log(Math.cos(remaining) / Math.cos(angle)) / k;
}

export function groundArrivalTime(speed, length) {
  const a = BALL_MOTION.rollingDeceleration,
    k = AIR_DRAG;
  const remainingSquared = (speed ** 2 + a / k) * Math.exp(-2 * k * length) - a / k;
  if (remainingSquared < 0) return Infinity;
  return (
    (Math.atan(speed * Math.sqrt(k / a)) -
      Math.atan(Math.sqrt(remainingSquared) * Math.sqrt(k / a))) /
    Math.sqrt(a * k)
  );
}
