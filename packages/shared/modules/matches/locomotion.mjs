import { clamp } from '../../core/index.mjs';
import { ability } from './skills.mjs';
import { distance } from './spatial.mjs';
import { sprintAvailable, triggerAdrenalineSprint } from './activity.mjs';

export function movement(p, energy, mode = 'sprint') {
  if (!p.matchState)
    p = {
      ...p,
      matchState: { energy: energy ?? 100, morale: 50, confidence: 50, adaptation: 100 },
    };
  const a = (key) => clamp(ability(p, key), 1, 100);
  const remaining = clamp((p.matchState.energy ?? energy ?? 100) / 100, 0, 1);
  const effort = 0.35 + 0.65 * Math.sqrt(remaining);
  const pace = a('sprintSpeed'),
    top = 5.7 + 0.036 * pace;
  const speeds = {
    walk: 1.5,
    jog: 2.7 + 0.014 * pace,
    run: 4.1 + 0.012 * pace,
    stand: 0,
    sprint: top,
    carry: top * (0.6 + 0.002 * a('dribbling')),
    carryFast: top * (0.86 + 0.001 * a('dribbling')),
  };
  if (p.matchState?.sprintRecovering || remaining === 0) {
    speeds.sprint = speeds.run;
    speeds.carry = Math.min(speeds.carry, 4.5 + 0.003 * a('dribbling'));
    speeds.carryFast = speeds.carry;
  }
  return {
    speed:
      mode === 'stand'
        ? 0
        : mode === 'walk'
          ? speeds.walk
          : Math.max(speeds.walk, (speeds[mode] ?? speeds.run) * effort),
    topSpeed: top,
    acceleration: 2.4 + 0.035 * a('acceleration'),
    response: 0.55 + 0.0045 * a('agility'),
    braking: 4 + 0.04 * a('balance'),
  };
}

export function driveMovement(actor, desired, limits, dt, responseMultiplier = 1) {
  const speed = Math.hypot(desired.x, desired.z);
  const factor = speed > limits.speed ? limits.speed / speed : 1;
  const vx = desired.x * factor,
    vz = desired.z * factor;
  const velocity = actor.body.linvel();
  const dx = vx - velocity.x,
    dz = vz - velocity.z,
    delta = Math.hypot(dx, dz);
  const slowing = vx * velocity.x + vz * velocity.z < velocity.x ** 2 + velocity.z ** 2;
  const max =
    (slowing ? limits.braking : limits.acceleration) * limits.response * dt * responseMultiplier;
  const scale = delta > max ? max / delta : 1,
    mass = actor.body.mass();
  actor.body.applyImpulse({ x: dx * scale * mass, y: 0, z: dz * scale * mass }, true);
}

// At a restart everyone can walk around either team's body. Pure radial
// separation can pin a retreating defender outside a touchline behind the taker.
// Add a finite lateral route, preferring the side that leads back onto the pitch;
// driveMovement still limits the resulting movement, and Rapier resolves bodies.
export function restartAvoidance(actor, actors, desired) {
  const speed = Math.hypot(desired.x, desired.z);
  if (speed < 0.1) return desired;
  const ux = desired.x / speed,
    uz = desired.z / speed;
  let x = desired.x,
    z = desired.z;
  for (const other of actors) {
    if (other === actor || other.sentOff) continue;
    const dx = other.pos.x - actor.pos.x,
      dz = other.pos.z - actor.pos.z;
    const gap = Math.hypot(dx, dz),
      ahead = dx * ux + dz * uz;
    const lateral = -dx * uz + dz * ux;
    if (gap > 1.5 || ahead < -0.1 || Math.abs(lateral) > 0.95) continue;
    const edgeCost = (side) => {
      const px = actor.pos.x - uz * side,
        pz = actor.pos.z + ux * side;
      return Math.max(0, 0.5 - px, px - 104.5) + Math.max(0, 0.5 - pz, pz - 67.5);
    };
    const plus = edgeCost(1),
      minus = edgeCost(-1);
    const side =
      Math.abs(plus - minus) > 0.01
        ? plus < minus
          ? 1
          : -1
        : Math.abs(lateral) > 0.05
          ? -Math.sign(lateral)
          : actor.index % 2
            ? 1
            : -1;
    const steer = (1.5 - Math.min(1.4, gap)) * 4;
    x -= uz * side * steer;
    z += ux * side * steer;
  }
  return { x, z };
}
// Tracking a moving person needs both position correction and observed velocity.
// A position-only controller necessarily trails by v/gain, even at equal ability.
// Use the marker's last observation, not the opponent's current hidden velocity.
export function markingVelocity(actor, owner, roles) {
  if (
    roles.chasers.includes(actor.index) &&
    owner &&
    owner.side !== actor.side &&
    actor.pressMemory?.id === owner.player.id
  ) {
    const age = Math.max(0, (roles.time ?? actor.pressMemory.seenAt) - actor.pressMemory.seenAt);
    const fade = clamp(1 - Math.max(0, age - 0.6) / 0.5, 0, 1);
    return { x: actor.pressMemory.velocity.x * fade, z: actor.pressMemory.velocity.z * fade };
  }
  const memory = actor.markMemory;
  if (
    actor === owner ||
    actor.isKeeper ||
    actor.kickPlan ||
    roles.receiverId === actor.player.id ||
    roles.chasers.includes(actor.index) ||
    !memory ||
    roles.marking?.[actor.player.id] !== memory.id
  )
    return { x: 0, z: 0 };
  const age = Math.max(0, (roles.time ?? memory.seenAt) - memory.seenAt);
  const fade = clamp(1 - Math.max(0, age - 0.9) / 0.5, 0, 1) * (actor.markTrackingWeight ?? 1);
  return { x: memory.velocity.x * fade, z: memory.velocity.z * fade };
}
export function movementMode(actor, ball, owner, roles, gap) {
  const fresh = sprintAvailable(actor);
  // Available sprint reserve is capacity, not an instruction to use it. A burst
  // needs an actual tactical deadline; otherwise choose the sustainable gait.
  const sprintFor = (intent, critical = false) =>
    intent && (fresh || triggerAdrenalineSprint(actor, critical));
  const attackingDepth = actor.direction === -1 ? 105 - ball.x : ball.x;
  const ownGoalDistance = attackingDepth;
  if (actor.kickPlan) {
    const ballSpeed = Math.hypot(ball.vx ?? 0, ball.vz ?? 0);
    if (ballSpeed > movement(actor.player, actor.energy, 'run').speed)
      return fresh ? 'sprint' : 'run';
    return ballSpeed > 1.5 ? 'run' : gap > 0.15 ? 'walk' : 'stand';
  }
  if (actor === owner) return actor.intent?.mode === 'carryFast' && fresh ? 'carryFast' : 'carry';
  if (actor.isKeeper) return gap > 0.35 ? 'run' : 'stand';
  if (roles.defensiveCover?.[actor.player.id])
    return gap > 3 ? 'run' : gap > 1 ? 'jog' : gap > 0.3 ? 'walk' : 'stand';
  const chasing = roles.chasers.includes(actor.index);
  if (chasing || roles.receiverId === actor.player.id) {
    const ballGap = distance(actor.pos, ball);
    const ballSpeed = Math.hypot(ball.vx ?? 0, ball.vz ?? 0);
    const pressStyle = roles.press?.[actor.side] ?? 'normal';
    const pressing = chasing && owner && owner.side !== actor.side;
    const pressDistance = pressStyle === 'high' ? 22 : pressStyle === 'low' ? 12 : 17;
    const fastBreak =
      roles.teams?.[actor.side]?.fastBreak && roles.duties?.[actor.player.id]?.duty === 'break';
    const dangerSprint =
      ballGap <= 8 &&
      ((chasing && (attackingDepth >= 70 || ownGoalDistance < 26)) ||
        (roles.receiverId === actor.player.id && attackingDepth >= 70));
    const pressingSprint = pressing && ballGap < pressDistance;
    const looseBallSprint = !owner && ballSpeed > 8 && ballGap < 18;
    const receiverSprint = roles.receiverId === actor.player.id && ballSpeed > 8 && ballGap < 18;
    const breakSprint = fastBreak && ballGap < 24;
    const sprintIntent =
      dangerSprint || pressingSprint || looseBallSprint || receiverSprint || breakSprint;
    const emergency =
      dangerSprint || breakSprint || (pressing && pressStyle === 'high' && ballGap < 8);
    const looseBallRace = !owner && chasing && ballGap < 18;
    if (
      chasing &&
      owner &&
      owner.side !== actor.side &&
      actor.pressMemory?.id === owner.player.id
    ) {
      const trackedSpeed = Math.hypot(actor.pressMemory.velocity.x, actor.pressMemory.velocity.z);
      if (
        trackedSpeed > movement(actor.player, actor.energy, 'run').speed &&
        ballGap < 18 &&
        sprintFor(sprintIntent, emergency)
      )
        return 'sprint';
      if (trackedSpeed > 1.8) return 'run';
    }
    if (gap < 0.4) return 'walk';
    const canCloseInBurst = ballGap < 18 || (pressing && ballGap < pressDistance);
    if (gap <= 2 || !canCloseInBurst) return 'run';
    return sprintFor(sprintIntent, emergency) || (looseBallRace && fresh) ? 'sprint' : 'run';
  }
  if (roles.marking?.[actor.player.id]) {
    const speed = actor.markMemory
      ? Math.hypot(actor.markMemory.velocity.x, actor.markMemory.velocity.z)
      : 0;
    const emergencyCover = ownGoalDistance < 26 && gap > 4 && speed > 3.5;
    const mustMatchObservedRun =
      speed > movement(actor.player, actor.energy, 'run').speed && gap > 4;
    return sprintFor(mustMatchObservedRun, emergencyCover)
      ? 'sprint'
      : speed > 3.5 || gap > 9
        ? 'run'
        : speed > 1.8 || gap > 4
          ? 'jog'
          : gap < 0.8 && speed < 0.3
            ? 'stand'
            : 'walk';
  }
  if (gap < 0.8) return 'stand';
  if (gap < 2.5) return 'walk';
  if (roles.runnerId === actor.player.id) {
    const fastBreak =
      roles.teams?.[actor.side]?.fastBreak && roles.duties?.[actor.player.id]?.duty === 'break';
    const opportunity =
      gap > 9 &&
      distance(actor.pos, ball) < 24 &&
      (attackingDepth >= 55 ||
        (actor.positionRole === 'centralMid' && attackingDepth >= 45) ||
        fastBreak);
    const emergency =
      gap > 9 && distance(actor.pos, ball) < 24 && (attackingDepth >= 74 || fastBreak);
    return sprintFor(opportunity, emergency) ? 'sprint' : 'jog';
  }
  if (
    gap > 5 &&
    ['overlap', 'nearPost', 'farPost', 'break'].includes(roles.duties?.[actor.player.id]?.duty)
  ) {
    const duty = roles.duties?.[actor.player.id]?.duty;
    const fastBreak = roles.teams?.[actor.side]?.fastBreak && duty === 'break';
    const possessionBreak =
      roles.teams?.[actor.side]?.style === 'possession' && duty === 'break';
    const urgent =
      gap > 9 &&
      distance(actor.pos, ball) < 18 &&
      (duty === 'overlap'
        ? attackingDepth >= 45
        : attackingDepth >= 74 || fastBreak || (possessionBreak && attackingDepth >= 55));
    const emergency =
      gap > 9 && distance(actor.pos, ball) < 18 && (attackingDepth >= 74 || fastBreak);
    return sprintFor(urgent, emergency) ? 'sprint' : 'jog';
  }
  return gap > 14 ? 'jog' : 'walk';
}
