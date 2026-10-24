import { ability } from './skills.mjs';
import { movement } from './locomotion.mjs';
import { distance, unit } from './spatial.mjs';
import { groundArrivalTime, BALL_MOTION } from './ball-motion.mjs';

// Estimate whether the next reachable touch/turn fits before a real pitch edge.
// This never moves a ball, clamps its position, or changes the physical solver.
export function boundaryAwareness(actor, ball, velocity = { x: ball.vx ?? 0, z: ball.vz ?? 0 }) {
  const speed = Math.hypot(velocity.x, velocity.z);
  if (speed < 0.01) return { time: Infinity, risk: 0 };
  let travel = Infinity;
  for (const [p, v, end] of [
    [ball.x, velocity.x, 105],
    [ball.z, velocity.z, 68],
  ]) {
    if (Math.abs(v) < 0.001) continue;
    const gap = v > 0 ? end + BALL_MOTION.radius - p : p + BALL_MOTION.radius;
    travel = Math.min(travel, (Math.max(0, gap) * speed) / Math.abs(v));
  }
  const time = groundArrivalTime(speed, travel);
  const m = movement(actor.player, actor.energy, 'carry');
  const response = 0.25 + (100 - ability(actor.player, 'anticipation')) * 0.002;
  const turn = speed / (m.braking * m.response * 0.6);
  return {
    time,
    risk: Math.max(0, Math.min(1, (response + turn - time) / Math.max(0.2, response + turn))),
  };
}

export function boundaryVelocity(actor, point, desired, interval = 0.3) {
  const m = movement(actor.player, actor.energy, 'carry');
  // The gait touch can use the same 60% of the body's braking response that
  // motorTouch actually executes; assuming the full body brake reacts too late.
  const brake = m.braking * m.response * 0.6;
  const anticipation = 0.08 + (100 - ability(actor.player, 'anticipation')) * 0.002;
  const delay = interval + anticipation;
  const safe = (gap) =>
    Math.max(
      0,
      Math.sqrt((brake * delay) ** 2 + 2 * brake * Math.max(0, gap - BALL_MOTION.radius)) -
        brake * delay,
    );
  return {
    x: Math.max(-safe(point.x), Math.min(safe(105 - point.x), desired.x)),
    z: Math.max(-safe(point.z), Math.min(safe(68 - point.z), desired.z)),
  };
}

// Strategic perception and the repeated motor touches are different clocks.
// A touch never draws a new action lottery merely because a foot reached the ball.
export function needsOnBallScan(actor, ball, opponents, time) {
  const plan = actor.onBallPlan;
  if (!plan || !actor.intent || time >= plan.scanAt) return true;
  const pressureDistance = Math.min(12, ...opponents.map((o) => distance(o.pos, ball)));
  const boundary = boundaryAwareness(actor, ball);
  return (
    (boundary.risk > 0.05 &&
      time >= plan.scanAt - (0.2 * ability(actor.player, 'anticipation')) / 100) ||
    distance(ball, plan.ball) > 4 ||
    (pressureDistance < 2 && plan.pressureDistance - pressureDistance > 0.8) ||
    (plan.action.destination && distance(ball, plan.action.destination) < 1)
  );
}

export function rememberOnBallAction(actor, action, ball, opponents, time) {
  actor.onBallPlan = {
    action,
    ball: { x: ball.x, z: ball.z },
    pressureDistance: Math.min(12, ...opponents.map((o) => distance(o.pos, ball))),
    scanAt: time + 0.3 + (100 - ability(actor.player, 'decisions')) * 0.004,
  };
}

export function canReactToPass(actor, passTime, time, incoming) {
  const easy = incoming <= 3 + ability(actor.player, 'firstTouch') * 0.03;
  const reaction = 0.08 + (100 - ability(actor.player, 'anticipation')) * 0.003;
  return easy || time - passTime >= reaction;
}

// Independent ball feedback: match its velocity and correct the relative foot
// position. The body cannot accelerate through its own ball or ignore a spill.
export function controlMovement(actor, ball) {
  const route = actor.intent?.destination;
  let heading =
    actor.kickPlan?.heading ?? (route ? unit(ball, route) : { x: actor.direction ?? 1, z: 0 });
  if (actor.intent?.kind === 'settle') {
    const away = actor.intent.shieldHeading;
    if (away) heading = away;
  }
  const offset = actor.kickPlan ? 0.5 : 0.6;
  const settle = actor.intent?.kind === 'settle';
  const desired = {
    x: (ball.vx ?? 0) + (ball.x - actor.pos.x - heading.x * offset) * 3,
    z: (ball.vz ?? 0) + (ball.z - actor.pos.z - heading.z * offset) * 3,
    // A stationary shield should not inherit a long-range navigation target.
    ...(settle ? { settling: true } : {}),
  };
  return { ...desired, ...boundaryVelocity(actor, actor.pos, desired, 0.1) };
}

export function motorTouch(actor, ball, rng = () => 0.5) {
  const intent = actor.intent;
  const h =
    intent?.kind === 'settle'
      ? (intent.shieldHeading ?? { x: actor.direction ?? 1, z: 0 })
      : unit(ball, intent?.destination ?? { x: ball.x + (actor.direction ?? 1) * 6, z: ball.z });
  const m = movement(actor.player, actor.energy, intent?.mode ?? 'carry');
  const settle = intent?.kind === 'settle';
  // Predict the next gait contact, including acceleration and grass resistance.
  // This is a physical touch interval, never a required possession duration.
  const contactInterval = 0.25 + (100 - ability(actor.player, 'dribbling')) * 0.001;
  const routeGap = intent?.destination ? distance(ball, intent.destination) : Infinity;
  const approach = Math.min(m.speed, Math.sqrt(2 * m.braking * m.response * routeGap));
  const desired = settle
    ? { x: 0, z: 0 }
    : boundaryVelocity(actor, ball, { x: h.x * approach, z: h.z * approach }, contactInterval);
  const dx = desired.x - actor.velocity.x,
    dz = desired.z - actor.velocity.z;
  const change = Math.hypot(dx, dz);
  const slowing =
    desired.x * actor.velocity.x + desired.z * actor.velocity.z <
    actor.velocity.x ** 2 + actor.velocity.z ** 2;
  const maxChange = (slowing ? m.braking : m.acceleration) * m.response * contactInterval * 0.6;
  const fraction = Math.min(1, maxChange / Math.max(0.001, change));
  const vx = actor.velocity.x + dx * fraction,
    vz = actor.velocity.z + dz * fraction;
  const speed = Math.hypot(vx, vz);
  const dragCredit = speed > 0.2 ? (0.65 * contactInterval * 0.5) / speed : 0;
  const error = (rng() - 0.5) * (1 - ability(actor.player, 'dribbling') / 100) * 0.45;
  const outgoing = {
    x: vx * (1 + dragCredit) - h.z * error,
    z: vz * (1 + dragCredit) + h.x * error,
    y: 0.03,
  };
  // The finite body acceleration above can leave the outgoing ball faster than
  // the boundary-safe target. A real foot contact can cushion that momentum;
  // recheck the velocity that kick() will actually apply, but only near edges.
  return { ...outgoing, ...boundaryVelocity(actor, ball, outgoing, contactInterval) };
}

// Exit-lane geometry includes the ball's source. A defender already in the
// striking corridor cannot be ignored as t<4% of a long pass.
export function exitBlocked(ball, velocity, opponents) {
  const speed = Math.hypot(velocity.x, velocity.z);
  if (speed < 1) return false;
  const h = { x: velocity.x / speed, z: velocity.z / speed };
  return opponents.some((o) => {
    let dx = o.pos.x - ball.x,
      dz = o.pos.z - ball.z;
    const interceptAt = Math.max(0, dx * h.x + dz * h.z) / speed;
    dx += (o.velocity?.x ?? 0) * interceptAt;
    dz += (o.velocity?.z ?? 0) * interceptAt;
    const along = dx * h.x + dz * h.z;
    const lateral = Math.abs(dx * h.z - dz * h.x);
    const travel = Math.max(0, along) / speed;
    const height = (ball.y ?? 0.11) + (velocity.y ?? 0) * travel - 4.905 * travel * travel;
    const footAngle = o.footAngle ?? o.facing ?? Math.atan2(-dz, -dx);
    const footX = dx + Math.cos(footAngle) * (o.footReach ?? 0.6);
    const footZ = dz + Math.sin(footAngle) * (o.footReach ?? 0.6);
    const footAlong = footX * h.x + footZ * h.z;
    const footLateral = Math.abs(footX * h.z - footZ * h.x);
    return (
      height < 1.2 &&
      ((along > -0.15 && along < 3 && lateral < 0.43) ||
        (footAlong > -0.15 && footAlong < 3 && footLateral < 0.29))
    );
  });
}
