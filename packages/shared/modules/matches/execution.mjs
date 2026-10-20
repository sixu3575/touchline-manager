import { clamp } from '../../core/index.mjs';
import { ability } from './skills.mjs';
import { airborneVelocity, groundPassPlan } from './ball-motion.mjs';

export const angleDifference = (to, from) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

// Engineering approximation of body orientation, in radians / real second.
// This changes execution, never the utility or availability of an action.
export function turnRate(actor) {
  const speed = Math.hypot(actor.velocity.x, actor.velocity.z);
  return (
    (3 + 0.035 * ability(actor.player, 'agility') + 0.01 * ability(actor.player, 'balance')) /
    (1 + 0.14 * speed)
  );
}

export function updateFacing(actor, ball, dt, time = 0) {
  const p = actor.pos,
    plan = actor.kickPlan;
  const bearing = Math.atan2(ball.z - p.z, ball.x - p.x);
  const forward = actor.direction === -1 ? Math.PI : 0;
  // A receiver opens side-on to see both the incoming ball and forward play;
  // near the ball a defender can jockey while facing it, rather than facing
  // the direction of each small positioning step. Navigation still uses inertia.
  const receiving =
    actor.receivePreparation &&
    time >= actor.receivePreparation.startedAt &&
    time - actor.receivePreparation.startedAt < 4 &&
    Math.hypot(ball.vx ?? 0, ball.vz ?? 0) > 1;
  const look = receiving ? forward + angleDifference(bearing, forward) * 0.5 : bearing;
  const visibleHeading = plan?.bodyHeading ?? plan?.heading;
  const target = plan
    ? { x: p.x + visibleHeading.x, z: p.z + visibleHeading.z }
    : receiving || Math.hypot(ball.x - p.x, ball.z - p.z) < 2.5
      ? { x: p.x + Math.cos(look), z: p.z + Math.sin(look) }
      : Math.hypot(actor.velocity.x, actor.velocity.z) > 0.4
        ? { x: p.x + actor.velocity.x, z: p.z + actor.velocity.z }
        : actor.target;
  if (!target || Math.hypot(target.x - p.x, target.z - p.z) < 0.1) return;
  const desired = Math.atan2(target.z - p.z, target.x - p.x);
  actor.facing ??= actor.direction === -1 ? Math.PI : 0;
  actor.facing += clamp(
    angleDifference(desired, actor.facing),
    -turnRate(actor) * dt,
    turnRate(actor) * dt,
  );
  actor.facing = angleDifference(actor.facing, 0);
}

export function prepareKick(actor, action, ball, time, actionId, lapse, oneTouch = false) {
  const power = Math.hypot(action.x, action.y, action.z);
  const norm = Math.hypot(action.x, action.z) || 1;
  const heading = { x: action.x / norm, z: action.z / norm };
  const bodyNorm = action.bodyAim
    ? Math.hypot(action.bodyAim.x - ball.x, action.bodyAim.z - ball.z)
    : 0;
  const bodyHeading = bodyNorm
    ? { x: (action.bodyAim.x - ball.x) / bodyNorm, z: (action.bodyAim.z - ball.z) / bodyNorm }
    : undefined;
  const speed = Math.hypot(actor.velocity.x, actor.velocity.z);
  const balanced = ability(actor.player, 'balance');
  const alignment = Math.abs(angleDifference(Math.atan2(heading.z, heading.x), actor.facing));
  // Scanning before reception and an already open body can prepare a first-time kick.
  // A back-facing receiver cannot use this credit to bypass a real turn.
  const credit =
    oneTouch && alignment < (action.type === 'shot' ? 0.65 : Math.PI / 2 + 0.05)
      ? Math.min(
          actor.lastReceptionPreparation ?? 0,
          0.12 + (100 - balanced) * 0.002 + power * 0.004 + speed * 0.015,
        )
      : 0;
  const windup = Math.max(
    0,
    (action.type === 'shot' ? 0.22 : 0.12) +
      (100 - balanced) * 0.002 +
      power * 0.004 +
      speed * 0.015 -
      credit,
  );
  return {
    action,
    actionId,
    lapse,
    oneTouch,
    heading,
    ...(bodyHeading ? { bodyHeading } : {}),
    power,
    startedAt: time,
    readyAt: time + windup,
    until: time + 2.4,
    ball: { x: ball.x, z: ball.z },
  };
}

export function kickReady(actor, time) {
  const plan = actor.kickPlan;
  return Boolean(
    plan &&
    time >= plan.readyAt &&
    Math.abs(
      angleDifference(
        Math.atan2((plan.bodyHeading ?? plan.heading).z, (plan.bodyHeading ?? plan.heading).x),
        actor.facing,
      ),
    ) < (plan.action.type === 'shot' ? 0.55 : Math.PI / 2 + 0.05),
  );
}

export function kickTarget(actor, ball) {
  return { x: ball.x - actor.kickPlan.heading.x * 0.5, z: ball.z - actor.kickPlan.heading.z * 0.5 };
}

export function releasedKick(plan, ball, actors = []) {
  const action = plan.action,
    receiver = actors.find((a) => a.player.id === action.receiverId && !a.sentOff);
  let aim = action.kickAim;
  if (!aim) return action;
  if (receiver && action.receiverAtDecision) {
    aim = {
      ...aim,
      x: clamp(
        aim.x +
          receiver.pos.x -
          action.receiverAtDecision.x +
          (receiver.velocity.x - action.receiverVelocity.x) * action.leadTime,
        1,
        104,
      ),
      z: clamp(
        aim.z +
          receiver.pos.z -
          action.receiverAtDecision.z +
          (receiver.velocity.z - action.receiverVelocity.z) * action.leadTime,
        1,
        67,
      ),
    };
  }
  if (action.kickFlight)
    return { ...action, destination: aim, ...airborneVelocity(ball, aim, action.kickFlight) };
  const dx = aim.x - ball.x,
    dz = aim.z - ball.z,
    length = Math.hypot(dx, dz);
  const speed = groundPassPlan(length, action.quality.value).speed;
  return {
    ...action,
    destination: aim,
    flight: groundPassPlan(length, action.quality.value).flight,
    x: (dx / Math.max(0.001, length)) * speed,
    z: (dz / Math.max(0.001, length)) * speed,
    y: 0.08,
  };
}

export function trackKickReceiver(actor, actors, ball, time) {
  const plan = actor.kickPlan;
  if (!plan?.action.receiverAtDecision || time < (plan.observeAt ?? 0)) return;
  const action = releasedKick(plan, ball, actors);
  const length = Math.hypot(action.x, action.z) || 1;
  plan.heading = { x: action.x / length, z: action.z / length };
  plan.observeAt = time + 0.1 + (100 - ability(actor.player, 'anticipation')) * 0.002;
}

export function kickRecovery(actor, action) {
  return (
    0.18 +
    Math.hypot(action.x, action.y, action.z) * 0.012 +
    (100 - ability(actor.player, 'balance')) * 0.002
  );
}
