import { clamp } from '../../core/index.mjs';
import { ability } from './skills.mjs';
import { movement } from './locomotion.mjs';
import { groundTravel, AIR_DRAG } from './ball-motion.mjs';
import { distance, localX, unit } from './spatial.mjs';

export function formation(club) {
  const ps = club.lineup.map((id) => club.players.find((p) => p.id === id));
  return ps.map((p) => {
    const group = ps.filter((q) => q.role === p.role);
    return {
      player: p,
      anchor: {
        x: { GK: 5, DEF: 27, MID: 49, FWD: 70 }[p.role],
        z: 8 + ((group.indexOf(p) + 0.5) / group.length) * 52,
      },
    };
  });
}
export function teamRoles(actors, ball, owner, pendingPass, direction, tactics, time = 0) {
  // A missed pass becomes a loose-ball contest. Don't reserve it forever for a
  // distant intended receiver while a nearer teammate waits beside the ball.
  if (pendingPass && time > (pendingPass.expiresAt ?? pendingPass.time + 3.5)) pendingPass = null;
  const roles = {
    time,
    marking: {},
    chasers: [],
    receiverId: pendingPass?.receiverId ?? null,
    runnerId: null,
    receiveTarget: pendingPass?.target,
    support: [],
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
    const attack = owner?.side === side || pendingPass?.actor.side === side;
    // The carrier and designated receiver have separate jobs; don't send a second teammate into their feet.
    const candidates = mates.filter(
      (a) =>
        a !== owner &&
        a.player.id !== roles.receiverId &&
        (!a.isKeeper || Math.abs(ball.x - (direction(side) === 1 ? 0 : 105)) < 7),
    );
    candidates.sort(
      (a, b) =>
        distance(a.pos, ball) / movement(a.player, a.energy).topSpeed -
        distance(b.pos, ball) / movement(b.player, b.energy).topSpeed,
    );
    if (!attack)
      roles.chasers.push(
        ...candidates
          .slice(0, tactics[side].press === 'high' || localX(ball.x, direction(side)) < 35 ? 2 : 1)
          .map((a) => a.index),
      );
    else if (!owner && !roles.receiverId && candidates[0]) roles.chasers.push(candidates[0].index);
    if (attack && (owner || pendingPass?.actor.side === side)) {
      const carrier = owner ?? pendingPass.actor;
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
      runners.sort(
        (a, b) =>
          ability(b.player, 'offTheBall') * 0.6 +
          ability(b.player, 'sprintSpeed') * 0.4 -
          (ability(a.player, 'offTheBall') * 0.6 + ability(a.player, 'sprintSpeed') * 0.4),
      );
      const passer = pendingPass?.actor;
      const giveGo = passer?.side === side && passer.player.role === 'FWD' ? passer : null;
      if (giveGo || runners[0]) roles.runnerId = (giveGo ?? runners[0]).player.id;
    }
  }
  // Assign cover one-to-one; nearest-by-lane independently sent several defenders
  // toward the same forward and left the other receiver unmarked.
  for (const side of [0, 1]) {
    if (owner?.side === side || pendingPass?.actor.side === side) continue;
    const defenders = actors.filter(
      (a) =>
        a.side === side &&
        !a.sentOff &&
        !a.isKeeper &&
        a.player.role === 'DEF' &&
        !roles.chasers.includes(a.index),
    );
    const threats = actors
      .filter(
        (a) =>
          a.side !== side &&
          !a.sentOff &&
          !a.isKeeper &&
          ['FWD', 'MID'].includes(a.player.role) &&
          localX(a.pos.x, direction(side)) < 48,
      )
      .sort((a, b) => localX(a.pos.x, direction(side)) - localX(b.pos.x, direction(side)));
    for (const threat of threats) {
      defenders.sort((a, b) => distance(a.pos, threat.pos) - distance(b.pos, threat.pos));
      const cover = defenders.shift();
      if (!cover) break;
      roles.marking[cover.player.id] = threat.player.id;
    }
  }
  return roles;
}

export function targetFor(actor, actors, ball, owner, direction, tactics, chasers, roles = {}) {
  const p = actor.player,
    a = (key) => ability(p, key),
    ownGoal = direction === 1 ? 0 : 105;
  if (actor.isKeeper ?? p.role === 'GK') {
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
      depth = behind
        ? clamp(dist * (0.25 + a('oneOnOnes') * 0.003), 2, 8)
        : clamp(dist * 0.065, 1, 5),
      x = ownGoal + direction * depth;
    const t = Math.abs(ball.vx) > 1 ? (x - ball.x) / ball.vx : -1,
      intercept = t > 0 && t < 1.5 && ball.vx * direction < 0;
    return {
      x,
      z: clamp(
        intercept
          ? ball.z + ball.vz * t * (0.65 + a('anticipation') * 0.0035)
          : 34 + (ball.z - 34) * clamp(depth / Math.max(1, dist), 0.08, 0.7),
        29.4,
        38.6,
      ),
    };
  }
  if (owner === actor) {
    const plan = actor.intent;
    if (plan?.kind === 'settle') {
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
    if (distance(actor.pos, ball) > 0.82) {
      const destination = plan?.destination ?? { x: ball.x + direction * 8, z: ball.z };
      const travel = unit(ball, destination);
      return {
        x: clamp(ball.x - travel.x * 0.48, 0.5, 104.5),
        z: clamp(ball.z - travel.z * 0.48, 0.5, 67.5),
      };
    }
    if (plan?.destination) return plan.destination;
    return {
      x: clamp(actor.pos.x + direction * 8, 1, 104),
      z: clamp(actor.pos.z + (34 - actor.pos.z) * 0.15, 2, 66),
    };
  }
  if (roles.receiverId && roles.receiverId === p.id) {
    // Intercept the incoming trajectory instead of chasing its current position backwards.
    const m = movement(p, actor.energy, 'run'),
      speed = Math.hypot(ball.vx, ball.vz);
    let target = roles.receiveTarget ?? { x: ball.x, z: ball.z };
    for (let t = 0.05; t < 3; t += 0.05) {
      const travel =
        ball.y > 0.2 ? Math.log1p(AIR_DRAG * speed * t) / AIR_DRAG : groundTravel(speed, t);
      const f = travel / Math.max(0.001, speed);
      const point = { x: ball.x + ball.vx * f, z: ball.z + ball.vz * f };
      const heading = unit(actor.pos, point);
      const projection = actor.velocity.x * heading.x + actor.velocity.z * heading.z;
      const turn = Math.max(0, -projection) / m.braking;
      const available = Math.max(0, t - turn - 0.08);
      const reach = Math.min(
        m.speed * available,
        Math.max(0, projection) * available + 0.5 * m.acceleration * available * available,
      );
      if (distance(actor.pos, point) <= reach + 0.65) {
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
      const front = unit(owner.pos, { x: ownGoal, z: 34 });
      const separation = distance(actor.pos, owner.pos);
      // Close the forward lane first; enter a tackle only when within playing distance.
      const recovering = actor.tackleAt > (roles.time ?? Infinity);
      const firstPresser = chasers.find(
        (index) => actors.find((a) => a.index === index)?.side === actor.side,
      );
      const covering = firstPresser !== actor.index;
      const stand = covering ? 2.6 : recovering ? 1.7 : separation > 2.5 ? 1.5 : 0.35;
      return {
        x: clamp(owner.pos.x + front.x * stand + owner.velocity.x * anticipation * 0.4, 1, 104),
        z: clamp(owner.pos.z + front.z * stand + owner.velocity.z * anticipation * 0.4, 1, 67),
      };
    }
    return {
      x: clamp(ball.x + ball.vx * anticipation, 1, 104),
      z: clamp(ball.z + ball.vz * anticipation, 1, 67),
    };
  }
  const attacking =
    owner?.side === actor.side ||
    (roles.receiverId &&
      actors.some((o) => o.player.id === roles.receiverId && o.side === actor.side));
  if (!attacking && roles.marking?.[p.id]) {
    const threat = actors.find((o) => o.player.id === roles.marking[p.id]);
    const read = 0.1 + a('anticipation') * 0.002;
    return {
      x: clamp(
        threat.pos.x - direction * (1.1 + (100 - a('marking')) * 0.006) + threat.velocity.x * read,
        1,
        104,
      ),
      z: clamp(threat.pos.z + threat.velocity.z * read, 2, 66),
    };
  }
  const bx = localX(ball.x, direction),
    keeper = actors.find((o) => o.side === actor.side && o.isKeeper);
  let x = actor.anchor.x + (bx - 52.5) * 0.43 + (attacking ? 7 : -7);
  if (tactics.style === 'counter') x += attacking ? 3 : -6;
  if (tactics.press === 'high' && !attacking) x += 4;
  if (tactics.press === 'low' && !attacking) x -= 4;
  let z = 34 + (actor.anchor.z - 34) * (tactics.style === 'wide' ? 1.25 : 1) + (ball.z - 34) * 0.12;
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
