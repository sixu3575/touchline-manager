import { ability } from './skills.mjs';
import { arrivalTime, pursuitMode, movingBallIntercept } from './arrival.mjs';
import { distance, localX, segmentPoint } from './spatial.mjs';
import { sprintAvailable } from './activity.mjs';
import { clamp } from '../../core/index.mjs';

export function duelProbability(defendingQuality, carryingQuality, reachEdge = 0, support = 0) {
  return clamp(
    1 /
      (1 +
        Math.exp(
          -(
            (defendingQuality - carryingQuality) / 28 +
            clamp(reachEdge, -1, 1) * 1.2 +
            clamp(support, 0, 2) * 0.35
          ),
        )),
    0.02,
    0.98,
  );
}

export function tackleProbability(
  defender,
  carrier,
  ball,
  actors,
  defendingQuality,
  carryingQuality,
) {
  const reachEdge = (distance(carrier.pos, ball) - distance(defender.pos, ball)) / 0.6;
  const support = actors.filter(
    (o) => !o.sentOff && o.side === defender.side && o !== defender && distance(o.pos, ball) < 3,
  ).length;
  return duelProbability(defendingQuality, carryingQuality, reachEdge, support);
}

export function tackleWindow(defender, carrier, ball) {
  const protectedTouch = distance(carrier.pos, ball) < 0.72;
  const reachDisadvantage = distance(defender.pos, ball) - distance(carrier.pos, ball);
  const judgement = ability(defender.player, 'decisions') / 100;
  const mismatch = defensiveMismatch(defender, carrier);
  if (mismatch > 0 && distance(carrier.pos, ball) < 1.3 && reachDisadvantage > -mismatch * 0.4)
    return false;
  return !protectedTouch || reachDisadvantage <= 0.08 + 0.08 * (1 - judgement);
}

// A defender who expects to lose a close duel contains and waits for genuine
// exposure, rather than repeatedly lunging and leaving a free shooting lane.
export function defensiveMismatch(defender, carrier) {
  const defending =
    0.7 * ability(defender.player, 'tackling') +
    0.2 * ability(defender.player, 'balance') +
    0.1 * ability(defender.player, 'strength');
  const carrying =
    0.65 * ability(carrier.player, 'dribbling') +
    0.2 * ability(carrier.player, 'agility') +
    0.15 * ability(carrier.player, 'balance');
  return clamp((carrying - defending) / 50, 0, 1);
}

// Winning contact is not automatically a cushioned trap and a counterattack.
// High-momentum challenges knock the ball into a physically contested space;
// a balanced, slow, close challenge can take clean control through reception.
export function tackleRelease(defender, carrier, ball, actors, quality) {
  const relative = Math.hypot(
    defender.velocity.x - carrier.velocity.x,
    defender.velocity.z - carrier.velocity.z,
  );
  const incoming = Math.hypot(
    (ball.vx ?? 0) - defender.velocity.x,
    (ball.vz ?? 0) - defender.velocity.z,
  );
  if (
    relative < 2.5 &&
    incoming < 3 + ability(defender.player, 'firstTouch') * 0.02 &&
    distance(defender.pos, ball) < 0.72
  )
    return null;
  const direction = defender.direction ?? (defender.side === 0 ? 1 : -1);
  const choices = [-1, 1]
    .map((flank) => {
      const point = { x: ball.x + direction * 2, z: clamp(ball.z + flank * 4, 0.2, 67.8) };
      const space = Math.min(
        12,
        ...actors
          .filter((a) => a.side !== defender.side && !a.sentOff)
          .map((a) => distance(a.pos, point)),
      );
      return { point, space };
    })
    .sort((a, b) => b.space - a.space);
  const target = choices[0].point;
  const dx = target.x - ball.x,
    dz = target.z - ball.z,
    length = Math.hypot(dx, dz) || 1;
  const emergency = localX(ball.x, direction) < 35;
  const speed = emergency
    ? 4 + incoming * 0.35 + quality * 0.025
    : 1.5 + relative * 0.25 + quality * 0.025;
  return { x: (dx / length) * speed, z: (dz / length) * speed, y: 0.08, target };
}

// A challenge must finish its recovery and repositioning before the same player
// can attempt another tackle. Balance improves recovery; opposing momentum adds
// time. This regulates repeated same-player challenges, not tackle probability.
export function tackleRecoverySeconds(defender, carrier) {
  const relativeSpeed = Math.hypot(
    defender.velocity.x - carrier.velocity.x,
    defender.velocity.z - carrier.velocity.z,
  );
  return clamp(
    3.4 +
      Math.max(0, relativeSpeed - 2) * 0.08 +
      (50 - ability(defender.player, 'balance')) * 0.005,
    2.9,
    4.8,
  );
}

// Press, mark and protect are distinct jobs. A quick forward is not automatically
// the best defender everywhere on the pitch; abandoning the last line has a cost.
export function defensiveAssignments(actors, side, ball, owner, direction, tactics, time) {
  const mates = actors.filter((a) => a.side === side && !a.sentOff);
  const bx = localX(ball.x, direction);
  const candidates = mates.filter((a) => a !== owner && (!a.isKeeper || bx < 7));
  const intercepts =
    !owner && Math.hypot(ball.vx ?? 0, ball.vz ?? 0) > 3
      ? new Map(candidates.map((a) => [a.index, movingBallIntercept(a, ball)]))
      : null;
  const cost = (a) =>
    (intercepts?.get(a.index)?.time ?? arrivalTime(a, ball, pursuitMode(a, ball))) +
    (a.activity?.load ?? 0) +
    (sprintAvailable(a) ? 0 : 2.5) +
    (owner && bx < 35 && localX(a.pos.x, direction) > bx + 0.3 ? 1.1 : 0) +
    (a.positionRole === 'centreBack' ? Math.max(0, bx - 28) * 0.12 : 0) +
    (a.player.role === 'FWD' ? Math.max(0, 48 - bx) * 0.12 : 0) -
    (a.pressUntil > time ? 0.65 : 0);
  candidates.sort((a, b) => cost(a) - cost(b) || a.index - b.index);
  const chasers = [];
  while (candidates.length) {
    const maxChasers = (tactics.press === 'high' && bx > 35) || (!owner && bx < 30) ? 2 : 1;
    if (chasers.length >= maxChasers) break;
    // In the danger area, one closes and the other protects the forward lane.
    // Selecting both solely by proximity can put both pursuers behind a break.
    if (chasers.length === 1 && owner && bx < 30)
      candidates.sort(
        (a, b) =>
          cost(a) +
            (localX(a.pos.x, direction) > bx ? 5 : 0) -
            cost(b) -
            (localX(b.pos.x, direction) > bx ? 5 : 0) || a.index - b.index,
      );
    const a = candidates.shift();
    const radius = !owner ? 105 : tactics.press === 'low' ? 12 : tactics.press === 'high' ? 22 : 17;
    if (owner && distance(a.pos, ball) > radius) continue;
    if (owner && tactics.press !== 'high' && a.player.role === 'FWD' && bx > 60) {
      const supported = mates.some((o) => o !== a && !o.isKeeper && distance(o.pos, a.pos) < 12);
      const exits = actors.filter(
        (o) =>
          o.side === owner.side &&
          o !== owner &&
          !o.sentOff &&
          distance(o.pos, ball) < 22 &&
          distance(o.pos, ball) > 4 &&
          !mates.some((d) => {
            const lane = segmentPoint(ball, o.pos, d.pos);
            return lane.t > 0.05 && lane.t < 0.98 && lane.gap < 1.8;
          }),
      ).length;
      const handlingTime =
        0.32 +
        (100 - ability(owner.player, 'decisions')) * 0.003 +
        (100 - ability(owner.player, 'balance')) * 0.002;
      if (!supported && exits >= 2 && arrivalTime(a, ball, pursuitMode(a, ball)) > handlingTime)
        continue;
    }
    chasers.push(a.index);
    if (!(a.pressUntil > time)) a.pressUntil = time + 1.2;
  }
  const pool = mates.filter(
    (a) =>
      !a.isKeeper &&
      !chasers.includes(a.index) &&
      (a.player.role === 'DEF' || ['holdingMid', 'centralMid'].includes(a.positionRole)),
  );
  const cover = {};
  if (owner && owner.side !== side && bx < 35) {
    const point = {
      x: direction === 1 ? clamp(bx * 0.5, 5, 16) : 105 - clamp(bx * 0.5, 5, 16),
      z: clamp(34 + (ball.z - 34) * 0.35, 24, 44),
    };
    const options = pool.filter(
      (a) =>
        ['centreBack', 'holdingMid'].includes(a.positionRole) &&
        localX(a.pos.x, direction) < bx + 1,
    );
    options.sort((a, b) => {
      const cost = (p) =>
        distance(p.pos, point) + ((p.anchor?.z ?? p.pos.z) - 34) * (ball.z - 34) * 0.015;
      return cost(a) - cost(b) || a.index - b.index;
    });
    const centralThreats = actors.filter(
      (a) =>
        a.side !== side &&
        a !== owner &&
        !a.sentOff &&
        a.player.role === 'FWD' &&
        Math.abs(a.pos.z - 34) < 14 &&
        localX(a.pos.x, direction) < bx + 4,
    ).length;
    if (options.length > centralThreats) {
      const defender = options[0];
      cover[defender.player.id] = point;
      pool.splice(pool.indexOf(defender), 1);
    }
  }
  const threats = actors
    .filter(
      (a) =>
        a.side !== side &&
        !a.sentOff &&
        !a.isKeeper &&
        a !== owner &&
        localX(a.pos.x, direction) < 58 &&
        ['FWD', 'MID'].includes(a.player.role),
    )
    .sort((a, b) => localX(a.pos.x, direction) - localX(b.pos.x, direction));
  const marking = {};
  for (const threat of threats) {
    pool.sort((a, b) => {
      const value = (o) =>
        arrivalTime(o, threat.pos) +
        (o.activity?.load ?? 0) * 0.6 -
        (o.defenceMemory?.id === threat.player.id && o.defenceMemory.until > time ? 1.2 : 0) -
        (ability(o.player, 'marking') + ability(o.player, 'positioning')) * 0.002;
      return value(a) - value(b) || a.index - b.index;
    });
    const defender = pool.shift();
    if (!defender) break;
    marking[defender.player.id] = threat.player.id;
    if (defender.defenceMemory?.id !== threat.player.id) {
      defender.markSwitches = (defender.markSwitches ?? 0) + 1;
      defender.defenceMemory = { id: threat.player.id, until: time + 2 };
    }
  }
  return { chasers, marking, cover };
}

// The three lines move as a block. Pressers and genuinely dangerous runners can
// leave it; a forward otherwise need not chase every opposing centre-back.
export function blockPosition(actor, ball, direction, tactics) {
  const bx = localX(ball.x, direction);
  const pressShift = tactics.press === 'high' ? 6 : tactics.press === 'low' ? -6 : 0;
  const centre = clamp(10 + bx * 0.55 + pressShift, 22, 52 + pressShift);
  const line = actor.player.role === 'DEF' ? -12 : actor.player.role === 'FWD' ? 12 : 0;
  return {
    x: direction === 1 ? clamp(centre + line, 5, 83) : 105 - clamp(centre + line, 5, 83),
    z: clamp(34 + (actor.anchor.z - 34) * 0.78 + (ball.z - 34) * 0.18, 5, 63),
  };
}
