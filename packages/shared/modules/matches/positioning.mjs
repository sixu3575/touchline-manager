import { clamp } from '../../core/index.mjs';
import { ability } from './skills.mjs';
import { movement } from './locomotion.mjs';
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
export function teamRoles(actors, ball, owner, pendingPass, direction, tactics) {
  const roles = { chasers: [], receiverId: pendingPass?.receiverId ?? null, runnerId: null };
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
        ...candidates.slice(0, tactics[side].press === 'high' && owner ? 2 : 1).map((a) => a.index),
      );
    else if (!owner && !roles.receiverId && candidates[0]) roles.chasers.push(candidates[0].index);
    if (attack && (owner || pendingPass?.actor.side === side)) {
      const carrier = owner ?? pendingPass.actor;
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
      x = ownGoal + direction * clamp(dist * 0.065, 1, 5);
    const t = Math.abs(ball.vx) > 1 ? (x - ball.x) / ball.vx : -1,
      intercept = t > 0 && t < 1.5 && ball.vx * direction < 0;
    return {
      x,
      z: clamp(
        intercept
          ? ball.z + ball.vz * t * (0.65 + a('anticipation') * 0.0035)
          : 34 + (ball.z - 34) * clamp(3 / Math.max(1, dist), 0.08, 0.7),
        29.4,
        38.6,
      ),
    };
  }
  if (owner === actor) {
    const plan = actor.intent;
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
    const t = clamp(
      distance(actor.pos, ball) /
        (Math.hypot(ball.vx, ball.vz) + movement(p, actor.energy, 'run').speed),
      0.05,
      1,
    );
    return { x: clamp(ball.x + ball.vx * t, 1, 104), z: clamp(ball.z + ball.vz * t, 1, 67) };
  }
  if (chasers.includes(actor.index)) {
    const anticipation = 0.12 + a('anticipation') * 0.003;
    if (owner && owner.side !== actor.side) {
      const front = unit(owner.pos, { x: ownGoal, z: 34 });
      const separation = distance(actor.pos, owner.pos);
      // Close the forward lane first; enter a tackle only when within playing distance.
      const stand = separation > 2.5 ? 1.5 : 0.35;
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
  } else if (attacking && p.role === 'MID' && owner && distance(actor.pos, owner.pos) < 7) {
    // A distinct passing triangle, rather than a cluster around possession.
    x = localX(owner.pos.x, direction) - 3;
    z = owner.pos.z + (actor.anchor.z < 34 ? -9 : 9);
  }
  if (!attacking && p.role === 'DEF') {
    const threats = actors
      .filter((o) => o.side !== actor.side && o.player.role === 'FWD' && !o.sentOff)
      .sort((a, b) => Math.abs(a.pos.z - z) - Math.abs(b.pos.z - z));
    if (threats[0]) {
      const weight = a('marking') / 200;
      z = z * (1 - weight) + threats[0].pos.z * weight;
      x = x * (1 - weight) + (localX(threats[0].pos.x, direction) - 2) * weight;
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
