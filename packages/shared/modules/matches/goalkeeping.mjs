import { ability } from './skills.mjs';
import { BALL_MOTION } from './ball-motion.mjs';
import { movingBallIntercept } from './arrival.mjs';
import { distance, localX } from './spatial.mjs';
import { movement } from './locomotion.mjs';

// The hands may reach a slow dribble or a loose ball as well as a fast shot.
// This opens a physical catching posture, not a remote possession transfer.
export function keeperCloseClaim(actor, ball, owner, direction) {
  const depth = localX(ball.x, direction);
  return (
    depth >= 0 &&
    depth <= 16.5 &&
    Math.abs(ball.z - 34) <= 20.16 &&
    (ball.y ?? BALL_MOTION.radius) < 1.3 &&
    distance(actor.pos, ball) < 1.8 &&
    owner !== actor &&
    (!owner || owner.side !== actor.side)
  );
}

// A through ball can currently be outside the box while its reachable future
// interception is inside it. Select from observed motion, never a hidden pass
// destination. The keeper still has to run and reach the ball physically.
export function keeperSweepTarget(actor, ball, direction) {
  if ((ball.vx ?? 0) * direction >= -0.05 || Math.hypot(ball.vx ?? 0, ball.vz ?? 0) < 3)
    return null;
  const intercept = movingBallIntercept(actor, ball);
  const depth = localX(intercept.point.x, direction);
  return intercept.feasible &&
    depth >= 0.3 &&
    depth < 16.5 &&
    Math.abs(intercept.point.z - 34) < 20.16
    ? intercept
    : null;
}
// Engineering parameters for a reaction gate, distinct from outfield tactical scanning.
export const keeperReaction = (player) => 0.12 + (100 - ability(player, 'reflexes')) / 600;
// A dive is its own explosive action, not a running start. One-on-one
// technique and agility set it; running acceleration and response are not
// counted a second time. A 65/65 keeper keeps the previous dive (~13.7 m/s²);
// a 55 and an 80 keeper now differ by about 15% instead of about 57%.
export const diveAcceleration = (player) =>
  12.6 *
  (0.85 + 0.003 * ability(player, 'oneOnOnes')) *
  (0.85 + 0.003 * ability(player, 'agility'));
// A dive is a push from a standing set position, not a sprint: the body's
// lateral speed peaks well below running top speed (biomechanics of elite
// keepers: about 3.5-4.5 m/s), and the hands then extend from it.
export const diveSpeed = (player) =>
  3.2 + 0.012 * ability(player, 'agility') + 0.006 * ability(player, 'oneOnOnes');
// driveMovement multiplies the running limits, so convert to that multiplier.
export const diveResponse = (player, limits) =>
  diveAcceleration(player) / (limits.acceleration * limits.response);

// Two hands together are a contact patch about 0.3m across, not a 0.7m ball.
// Arm extension beyond the body: about 1.15m at full stretch for a 1.88m
// keeper (shoulder-to-fingertip with the body laid out), plus a little for
// one-on-one technique. Shared by the executed save and the shooter's read.
export const KEEPER_HAND_RADIUS = 0.15;
export const keeperHandReach = (player, height, lean) =>
  0.25 + ability(player, 'oneOnOnes') * 0.004 + height * 0.37 * lean;

// How far sideways a keeper can get a hand to a ball arriving after `flight`
// seconds. It mirrors the executed save: reaction gate, dive acceleration via
// driveMovement, the dive-lean build-up and the hand reach used in simulation.
// A shooter reads it from the visible keeper; it never decides a save.
export function keeperLateralCover(keeper, flight) {
  const p = keeper.player;
  const m = movement(p, keeper.energy, 'sprint');
  const accel = diveAcceleration(p);
  const t = Math.max(0, flight - keeperReaction(p));
  const top = Math.min(m.speed, diveSpeed(p));
  const ramp = top / accel;
  const body = t < ramp ? 0.5 * accel * t * t : 0.5 * accel * ramp * ramp + top * (t - ramp);
  const lean = Math.min(1, t * (1.5 + ability(p, 'oneOnOnes') * 0.02));
  const hands = keeperHandReach(p, keeper.height ?? 1.88, lean);
  return body + hands + KEEPER_HAND_RADIUS + BALL_MOTION.radius;
}

// A parry tries to send danger outside the posts, rather than returning every
// save straight into the central shooting area. Handling controls the angular
// error and how much incoming energy remains; the ball then travels freely.
export function parryVelocity(actor, ball, incoming, rng) {
  const handling = ability(actor.player, 'handling') / 100;
  const direction = actor.direction ?? (actor.side === 0 ? 1 : -1);
  const flank = Math.abs(ball.z - 34) < 0.01 ? (rng() < 0.5 ? -1 : 1) : Math.sign(ball.z - 34);
  const heading = Math.atan2(flank * 10, direction * 3) + (rng() - 0.5) * (1 - handling) * 1.6;
  const speed = Math.hypot(incoming.x, incoming.y, incoming.z);
  const outgoing = Math.min(speed * 0.75, 2 + speed * (0.25 + 0.15 * (1 - handling)));
  return {
    x: Math.cos(heading) * outgoing,
    z: Math.sin(heading) * outgoing,
    y: Math.min(1.5, 0.35 + Math.abs(incoming.y) * 0.1),
  };
}

// With isotropic air/ground drag the horizontal slope remains vz/vx. Lower
// anticipation delays a fresh observation; it must not systematically predict
// every shot 20–35% short of its actual lateral crossing point.
export function keeperCrossing(actor, ball, planeX, time) {
  if (!actor.keeperRead || time >= actor.keeperRead.nextAt) {
    actor.keeperRead = {
      ball: { ...ball },
      seenAt: time,
      nextAt: time + 0.08 + (100 - ability(actor.player, 'anticipation')) * 0.002,
    };
  }
  const observed = actor.keeperRead.ball;
  const flight = Math.abs(observed.vx) > 0.05 ? (planeX - observed.x) / observed.vx : -1;
  return flight > 0 && flight < 1.5 ? observed.z + observed.vz * flight : null;
}

// A pass/cross travelling toward the end line is not necessarily a shot at
// goal. Diving toward its unbounded lateral crossing pulled keepers out of
// position, even beyond the targetFor post limits. Claims remain independent.
export function keeperGoalThreat(actor, ball, time) {
  const direction = actor.direction ?? (actor.side === 0 ? 1 : -1);
  const ownGoal = direction === 1 ? 0 : 105;
  if ((ball.vx ?? 0) * direction >= -0.05) return false;
  const z = keeperCrossing(actor, ball, ownGoal, time);
  if (z === null || z < 30.34 - BALL_MOTION.radius || z > 37.66 + BALL_MOTION.radius) return false;
  const observed = actor.keeperRead.ball;
  const flight = (ownGoal - observed.x) / observed.vx;
  const y = Math.max(
    BALL_MOTION.radius,
    (observed.y ?? BALL_MOTION.radius) + (observed.vy ?? 0) * flight - 4.905 * flight * flight,
  );
  return y <= 2.44 + BALL_MOTION.radius;
}

// A dive is an interception, not parking at a point. Ordinary position feedback
// slows down before reaching the incoming ball. Request the lateral velocity
// needed before impact; driveMovement still applies finite speed/acceleration.
export function keeperDiveVelocity(actor, ball, time) {
  if (!keeperGoalThreat(actor, ball, time)) return null;
  const target = keeperCrossing(actor, ball, actor.pos.x, time);
  if (target === null) return null;
  const observed = actor.keeperRead.ball;
  const remaining =
    (actor.pos.x - observed.x) / observed.vx - Math.max(0, time - actor.keeperRead.seenAt);
  if (remaining <= 0 || remaining > 1.5) return null;
  return (target - actor.pos.z) / Math.max(0.05, remaining);
}

export function keeperHandTarget(actor, ball, time) {
  const z = keeperCrossing(actor, ball, actor.pos.x, time);
  if (z === null) return ball;
  const observed = actor.keeperRead.ball;
  const flight = (actor.pos.x - observed.x) / observed.vx;
  return {
    x: actor.pos.x,
    z,
    y: Math.max(0.2, observed.y + (observed.vy ?? 0) * flight - 4.905 * flight * flight),
  };
}

// Visible wind-up permits a balanced set stance, not a pre-release guess of
// the final corner. All kick animations can supply the cue; aim/error are private.
export function readKeeperPreparation(actor, shooter, planeX, time) {
  if (!shooter?.kickPlan || !Number.isFinite(shooter.facing)) return 0;
  const anticipation = ability(actor.player, 'anticipation');
  const elapsed = time - shooter.kickPlan.startedAt - (0.08 + (100 - anticipation) * 0.002);
  const dx = Math.cos(shooter.facing);
  if (elapsed <= 0 || Math.abs(dx) < 0.25 || (planeX - shooter.pos.x) / dx <= 0) return 0;
  return (1 - Math.exp(-elapsed / 0.2)) * (0.35 + anticipation * 0.004);
}
