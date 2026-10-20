import { ability } from './skills.mjs';
import { movement } from './locomotion.mjs';
import { distance, unit } from './spatial.mjs';

// Strategic perception and the repeated motor touches are different clocks.
// A touch never draws a new action lottery merely because a foot reached the ball.
export function needsOnBallScan(actor, ball, opponents, time) {
  const plan = actor.onBallPlan;
  if (!plan || !actor.intent || time >= plan.scanAt) return true;
  const pressureDistance = Math.min(12, ...opponents.map((o) => distance(o.pos, ball)));
  return (
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
  return {
    x: (ball.vx ?? 0) + (ball.x - actor.pos.x - heading.x * offset) * 3,
    z: (ball.vz ?? 0) + (ball.z - actor.pos.z - heading.z * offset) * 3,
    // A stationary shield should not inherit a long-range navigation target.
    ...(settle ? { settling: true } : {}),
  };
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
  const desired = settle ? { x: 0, z: 0 } : { x: h.x * m.speed, z: h.z * m.speed };
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
  return {
    x: vx * (1 + dragCredit) - h.z * error,
    z: vz * (1 + dragCredit) + h.x * error,
    y: 0.03,
  };
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
