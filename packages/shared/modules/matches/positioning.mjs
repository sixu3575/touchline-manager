import { clamp } from '../../core/index.mjs';
import { ability } from './skills.mjs';
import { movement } from './locomotion.mjs';
import { groundTravel, AIR_DRAG } from './ball-motion.mjs';
import { distance, localX, unit } from './spatial.mjs';
import { formationSlot, tacticalPreset } from '../tactics/index.mjs';
import { attackAssignments } from './tactical-plan.mjs';
import { arrivalTime, pursuitMode, movingBallIntercept } from './arrival.mjs';
import { markingTarget, supportTarget } from './offball.mjs';
import { defensiveAssignments, blockPosition, defensiveMismatch } from './defending.mjs';
import { kickTarget } from './execution.mjs';
import { keeperCrossing, readKeeperPreparation } from './goalkeeping.mjs';

export function formation(club) {
  const ps = club.lineup.map((id) => club.players.find((p) => p.id === id));
  return ps.map((p) => {
    const group = ps.filter((q) => q.role === p.role);
    const { x, z, positionRole } = formationSlot(
      club.tactics.formation,
      p.role,
      group.indexOf(p),
      group.length,
    );
    return { player: p, anchor: { x, z }, positionRole };
  });
}
export function teamRoles(
  actors,
  ball,
  owner,
  pendingPass,
  direction,
  tactics,
  time = 0,
  continuity = {},
) {
  // A missed pass becomes a loose-ball contest. Don't reserve it forever for a
  // distant intended receiver while a nearer teammate waits beside the ball.
  if (pendingPass && time > (pendingPass.expiresAt ?? pendingPass.time + 3.5)) pendingPass = null;
  const teamSide =
    owner?.side ??
    pendingPass?.actor.side ??
    (continuity.possessionAt != null || time <= (continuity.teamUntil ?? 0)
      ? continuity.side
      : null);
  const roles = {
    time,
    teamSide,
    marking: {},
    defensiveCover: {},
    chasers: [],
    receiverId: pendingPass?.receiverId ?? null,
    runnerId: null,
    receiveTarget: pendingPass?.target,
    passTime: pendingPass?.time,
    support: [],
    teams: {},
    duties: {},
    press: {},
    phase: owner
      ? localX(ball.x, direction(owner.side)) < 36
        ? 'buildup'
        : localX(ball.x, direction(owner.side)) < 70
          ? 'midfield'
          : 'finalThird'
      : 'transition',
  };
  for (const side of [0, 1]) {
    const mates = actors.filter((a) => a.side === side && !a.sentOff);
    const attack = teamSide === side;
    // The carrier and designated receiver have separate jobs; don't send a second teammate into their feet.
    const candidates = mates.filter(
      (a) =>
        a !== owner &&
        a.player.id !== roles.receiverId &&
        (!a.isKeeper || Math.abs(ball.x - (direction(side) === 1 ? 0 : 105)) < 7),
    );
    candidates.sort(
      (a, b) =>
        arrivalTime(a, ball, pursuitMode(a, ball)) - arrivalTime(b, ball, pursuitMode(b, ball)),
    );
    if (!attack) {
      roles.press[side] = tactics[side]?.press ?? 'normal';
      const defence = defensiveAssignments(
        actors,
        side,
        ball,
        owner,
        direction(side),
        tactics[side],
        time,
      );
      roles.chasers.push(...defence.chasers);
      Object.assign(roles.marking, defence.marking);
      Object.assign(roles.defensiveCover, defence.cover);
    } else if (!owner && !roles.receiverId && candidates[0])
      roles.chasers.push(candidates[0].index);
    const carrier =
      owner ??
      pendingPass?.actor ??
      actors.find((a) => a.index === continuity.lastController && !a.sentOff);
    if (attack && carrier) {
      roles.support = mates
        .filter(
          (a) =>
            a !== carrier &&
            !a.isKeeper &&
            a.player.id !== roles.receiverId &&
            ['DEF', 'MID'].includes(a.player.role),
        )
        .sort((a, b) => distance(a.pos, ball) - distance(b.pos, ball))
        .slice(0, 3)
        .map((a) => a.player.id);
      const runners = mates.filter(
        (a) =>
          a !== carrier &&
          !a.isKeeper &&
          ['FWD', 'MID'].includes(a.player.role) &&
          localX(a.pos.x, direction(side)) > localX(carrier.pos.x, direction(side)) - 5,
      );
      const runReadiness = (a) =>
        ability(a.player, 'offTheBall') * 0.3 +
        ability(a.player, 'decisions') * 0.18 +
        ability(a.player, 'acceleration') * 0.22 +
        ability(a.player, 'sprintSpeed') * 0.3;
      runners.sort((a, b) => runReadiness(b) - runReadiness(a));
      const passer = pendingPass?.actor;
      const giveGo = passer?.side === side && passer.player.role === 'FWD' ? passer : null;
      if (giveGo || runners[0]) roles.runnerId = (giveGo ?? runners[0]).player.id;
      const plan = attackAssignments(
        actors,
        ball,
        carrier,
        roles.receiverId,
        direction(side),
        tactics[side],
        time,
        continuity,
      );
      roles.teams[side] = plan;
      Object.assign(roles.duties, plan.assignments);
      if (plan.assignments[roles.runnerId]) roles.runnerId = null;
    }
  }
  return roles;
}

export function targetFor(actor, actors, ball, owner, direction, tactics, chasers, roles = {}) {
  const p = actor.player,
    a = (key) => ability(p, key),
    ownGoal = direction === 1 ? 0 : 105;
  if (actor.isKeeper ?? p.role === 'GK') {
    if (actor.keeperHold) return { x: ownGoal + direction * 2, z: clamp(actor.pos.z, 30.5, 37.5) };
    if (
      (chasers.includes(actor.index) || owner === actor) &&
      Math.abs(ball.x - ownGoal) < 16.5 &&
      Math.abs(ball.z - 34) < 20.16 &&
      Math.hypot(ball.vx, ball.vz) < 7
    )
      return { x: clamp(ball.x - direction * 0.45, 0.3, 104.7), z: clamp(ball.z, 14, 54) };
    const dist = Math.abs(ball.x - ownGoal),
      behind =
        owner &&
        owner.side !== actor.side &&
        dist < 26 &&
        !actors.some(
          (o) =>
            o.side === actor.side &&
            o !== actor &&
            !o.sentOff &&
            localX(o.pos.x, direction) < localX(owner.pos.x, direction) &&
            distance(o.pos, owner.pos) < 7,
        ),
      incomingShot = ball.vx * direction < -8 && dist < 35,
      depth = incomingShot
        ? clamp(Math.abs(actor.pos.x - ownGoal), 0.3, 7)
        : behind && dist < 16
          ? clamp(dist * (0.1 + a('oneOnOnes') * 0.0015), 1.2, 4)
          : clamp(dist * 0.065, 1, 5),
      x = ownGoal + direction * depth;
    const intercept =
      ball.vx * direction < 0 ? keeperCrossing(actor, ball, x, roles.time ?? 0) : null;
    const preparation =
      owner?.side !== actor.side && dist < 35
        ? readKeeperPreparation(actor, owner, x, roles.time ?? 0)
        : 0;
    if (preparation > 0)
      actor.keeperSet = { readiness: preparation, until: (roles.time ?? 0) + 0.5 };
    return {
      x,
      z: clamp(
        intercept !== null
          ? intercept
          : 34 + (ball.z - 34) * clamp(depth / Math.max(1, dist), 0.08, 0.7),
        29.4,
        38.6,
      ),
    };
  }
  if (owner === actor) {
    if (actor.kickPlan) return kickTarget(actor, ball);
    const plan = actor.intent;
    if (plan?.kind === 'settle' && plan.expiresAt > (roles.time ?? 0)) {
      const threat = actors
        .filter((a) => a.side !== actor.side && !a.sentOff)
        .sort((a, b) => distance(a.pos, ball) - distance(b.pos, ball))[0];
      const shield =
        threat && distance(threat.pos, ball) < 3.5
          ? unit(ball, threat.pos)
          : { x: -direction, z: 0 };
      return {
        x: clamp(ball.x + shield.x * 0.55, 0.5, 104.5),
        z: clamp(ball.z + shield.z * 0.55, 0.5, 67.5),
      };
    }
    const continuous = plan?.kind === 'carry' && plan.expiresAt > (roles.time ?? 0);
    if (
      continuous &&
      distance(actor.pos, ball) < 4.2 &&
      (ball.x - actor.pos.x) * direction >= -0.8
    ) {
      const dest =
        plan.destination && (plan.destination.x - ball.x) * direction > 2
          ? plan.destination
          : { x: ball.x + direction * 8, z: ball.z };
      const heading = unit(actor.pos, dest),
        length = Math.max(6, distance(actor.pos, dest));
      return {
        x: clamp(actor.pos.x + heading.x * length, 0.5, 104.5),
        z: clamp(actor.pos.z + heading.z * length, 2, 66),
      };
    }
    if (distance(actor.pos, ball) > 0.82 || (ball.x - actor.pos.x) * direction < -0.8) {
      const destination = plan?.destination ?? { x: ball.x + direction * 8, z: ball.z };
      const travel = unit(ball, destination);
      return {
        x: clamp(ball.x - travel.x * 0.48, 0.5, 104.5),
        z: clamp(ball.z - travel.z * 0.48, 0.5, 67.5),
      };
    }
    if (continuous && plan.destination) return plan.destination;
    return {
      x: clamp(actor.pos.x + direction * 8, 1, 104),
      z: clamp(actor.pos.z + (34 - actor.pos.z) * 0.15, 2, 66),
    };
  }
  if (roles.receiverId && roles.receiverId === p.id) {
    if (actor.receivePreparation?.passTime !== roles.passTime)
      actor.receivePreparation = { passTime: roles.passTime, startedAt: roles.time ?? 0 };
    // Intercept the incoming trajectory instead of chasing its current position backwards.
    const speed = Math.hypot(ball.vx, ball.vz);
    let target = roles.receiveTarget ?? { x: ball.x, z: ball.z };
    for (let t = 0.05; t < 3; t += 0.05) {
      const travel =
        ball.y > 0.2 ? Math.log1p(AIR_DRAG * speed * t) / AIR_DRAG : groundTravel(speed, t);
      const f = travel / Math.max(0.001, speed);
      const point = { x: ball.x + ball.vx * f, z: ball.z + ball.vz * f };
      if (arrivalTime(actor, point, distance(actor.pos, ball) > 5 ? 'sprint' : 'run') <= t) {
        target = point;
        break;
      }
    }
    const from = unit(target, actor.pos);
    return {
      x: clamp(target.x + from.x * 0.48, 0.6, 104.4),
      z: clamp(target.z + from.z * 0.48, 0.6, 67.4),
    };
  }
  if (chasers.includes(actor.index)) {
    const anticipation = 0.12 + a('anticipation') * 0.003;
    if (owner && owner.side !== actor.side) {
      actor.pressMemory = {
        id: owner.player.id,
        velocity: { ...owner.velocity },
        seenAt: roles.time ?? 0,
      };
      const front = unit(owner.pos, { x: ownGoal, z: 34 });
      const separation = distance(actor.pos, owner.pos);
      // Close the forward lane first; enter a tackle only when within playing distance.
      const recovering = actor.tackleAt > (roles.time ?? Infinity);
      const firstPresser = chasers.find(
        (index) => actors.find((a) => a.index === index)?.side === actor.side,
      );
      const covering = firstPresser !== actor.index;
      const teamPressers = chasers
        .map((index) => actors.find((a) => a.index === index))
        .filter((a) => a?.side === actor.side);
      const pressRank = teamPressers.findIndex((a) => a.index === actor.index);
      const first = actors.find((a) => a.index === firstPresser);
      const firstBeaten = first && localX(first.pos.x, direction) > localX(owner.pos.x, direction);
      const caution = defensiveMismatch(actor, owner);
      const shotThreat = localX(owner.pos.x, direction) < 26 && separation < 5;
      if (covering && !shotThreat && pressRank === 1) {
        // The second presser reads the nearest outlet and closes its passing
        // lane, while remaining close enough to add real pressure at the ball.
        const outlet = actors
          .filter((a) => a.side === owner.side && a !== owner && !a.sentOff && !a.isKeeper)
          .sort((a, b) => distance(owner.pos, a.pos) - distance(owner.pos, b.pos))[0];
        const lane = outlet ? unit(owner.pos, outlet.pos) : { x: -direction, z: 0 };
        const stand = 1.7 + (100 - a('decisions')) * 0.004;
        return {
          x: clamp(owner.pos.x + lane.x * stand, 1, 104),
          z: clamp(owner.pos.z + lane.z * stand, 1, 67),
        };
      }
      if (covering && !shotThreat && pressRank > 1) {
        // A third player closes from a different shoulder rather than stacking
        // on the first presser; the empty role/zone is left for the opponent.
        const shoulder = unit(owner.pos, actor.pos);
        return {
          x: clamp(owner.pos.x + shoulder.x * 2.4, 1, 104),
          z: clamp(owner.pos.z + shoulder.z * 2.4, 1, 67),
        };
      }
      const stand = covering
        ? shotThreat && !recovering && firstBeaten
          ? 0.65 + caution * 1.5
          : 2.6 + caution
        : recovering
          ? 1.7
          : separation > 2.5
            ? 1.5
            : 1.05 + caution * 1.5;
      return {
        x: clamp(owner.pos.x + front.x * stand + owner.velocity.x * anticipation * 0.4, 1, 104),
        z: clamp(owner.pos.z + front.z * stand + owner.velocity.z * anticipation * 0.4, 1, 67),
      };
    }
    if (Math.hypot(ball.vx ?? 0, ball.vz ?? 0) > 3) {
      const intercept = movingBallIntercept(actor, ball);
      const from = unit(intercept.point, actor.pos);
      return {
        x: clamp(intercept.point.x + from.x * 0.48, 0.1, 104.9),
        z: clamp(intercept.point.z + from.z * 0.48, 0.1, 67.9),
      };
    }
    return {
      x: clamp(ball.x + ball.vx * anticipation, 0.1, 104.9),
      z: clamp(ball.z + ball.vz * anticipation, 0.1, 67.9),
    };
  }
  const attacking =
    roles.teamSide === actor.side ||
    owner?.side === actor.side ||
    (roles.receiverId &&
      actors.some((o) => o.player.id === roles.receiverId && o.side === actor.side));
  if (!attacking && roles.defensiveCover?.[p.id]) return roles.defensiveCover[p.id];
  if (!attacking && roles.marking?.[p.id]) {
    const threat = actors.find((o) => o.player.id === roles.marking[p.id]);
    const tracked = markingTarget(actor, threat, ball, direction, roles.time ?? 0);
    const block = blockPosition(actor, ball, direction, tactics, roles.teams?.[1 - actor.side]?.style);
    // Hand off an opponent who drops far in front of this defensive line.
    // Track dangerous runs behind it fully; otherwise screen from the block.
    const depth = localX(threat.pos.x, direction) - localX(block.x, direction);
    const reading = (a('decisions') + a('anticipation') + a('positioning')) / 3;
    const weight = clamp((12 - depth) / 12 + (reading - 50) * 0.004, 0, 1);
    actor.markTrackingWeight = weight;
    return {
      x: tracked.x * weight + block.x * (1 - weight),
      z: tracked.z * weight + block.z * (1 - weight),
    };
  }
  if (!attacking) {
    const block = blockPosition(actor, ball, direction, tactics, roles.teams?.[1 - actor.side]?.style);
    const accuracy = (100 - (a('positioning') + a('teamwork')) / 2) / 40;
    return { x: block.x + actor.bias * accuracy, z: block.z + actor.bias * accuracy };
  }
  const bx = localX(ball.x, direction),
    keeper = actors.find((o) => o.side === actor.side && o.isKeeper);
  const assigned = attacking && roles.duties?.[p.id];
  if (assigned) {
    if (assigned.duty !== 'cover')
      return supportTarget(
        actor,
        assigned,
        actors,
        ball,
        direction,
        roles.time ?? 0,
        assigned.duty,
      );
    const accuracy = (100 - (a('offTheBall') + a('teamwork')) / 2) / 40;
    return {
      x: clamp(assigned.x + actor.bias * accuracy, 3, 102),
      z: clamp(assigned.z + actor.bias * accuracy, 3, 65),
    };
  }
  let x = actor.anchor.x + (bx - 52.5) * 0.43 + (attacking ? 7 : -7);
  if (tactics.style === 'counter')
    x += attacking ? (roles.teams?.[actor.side]?.fastBreak ? 3 : 0) : -6;
  if (tactics.press === 'high' && !attacking) x += 4;
  if (tactics.press === 'low' && !attacking) x -= 4;
  let z = 34 + (actor.anchor.z - 34) * tacticalPreset(tactics.style).width + (ball.z - 34) * 0.12;
  if (attacking && roles.runnerId === p.id) {
    const defenders = actors
      .filter((o) => o.side !== actor.side && !o.sentOff)
      .map((o) => localX(o.pos.x, direction))
      .sort((a, b) => b - a);
    x = Math.max(x, Math.min((defenders[1] ?? 90) - 0.6, bx + 12 + a('offTheBall') * 0.06));
    z = clamp(z + (actor.anchor.z < 34 ? -3 : 3), 4, 64);
  } else if (
    attacking &&
    owner &&
    (roles.support?.includes(p.id) || (p.role === 'MID' && distance(actor.pos, owner.pos) < 7))
  ) {
    // A distinct passing triangle, rather than a cluster around possession.
    const slot = Math.max(0, roles.support?.indexOf(p.id) ?? 0);
    x = localX(owner.pos.x, direction) + (slot === 2 ? -12 : -3);
    z = owner.pos.z + (slot === 0 ? -10 : slot === 1 ? 10 : 0);
  }
  if (!attacking && p.role === 'DEF') {
    const threats = actors
      .filter((o) => o.side !== actor.side && o.player.role === 'FWD' && !o.sentOff)
      .sort((a, b) => Math.abs(a.pos.z - z) - Math.abs(b.pos.z - z));
    if (threats[0]) {
      const weight = clamp(0.35 + a('marking') * 0.005, 0.4, 0.85);
      z = z * (1 - weight) + threats[0].pos.z * weight;
      x = x * (1 - weight) + (localX(threats[0].pos.x, direction) - 1.6) * weight;
    }
  }
  if (attacking)
    return supportTarget(
      actor,
      { x: direction === 1 ? x : 105 - x, z },
      actors,
      ball,
      direction,
      roles.time ?? 0,
      roles.runnerId === p.id ? 'run' : 'support',
    );
  const accuracy =
    ((100 - (a(attacking ? 'offTheBall' : 'positioning') + a('teamwork')) / 2) / 40) *
    (attacking ? 1 : 1 - ability(keeper?.player ?? p, 'command') / 1000);
  return {
    x:
      direction === 1
        ? clamp(x + actor.bias * accuracy, 3, 101)
        : 105 - clamp(x + actor.bias * accuracy, 3, 101),
    z: clamp(z + actor.bias * accuracy, 3, 65),
  };
}
