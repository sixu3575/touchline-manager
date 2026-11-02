import { ability } from './skills.mjs';
import { arrivalTime, pursuitMode, movingBallIntercept } from './arrival.mjs';
import { distance, localX, segmentPoint } from './spatial.mjs';
import { sprintAvailable } from './activity.mjs';
import { clamp } from '../../core/index.mjs';
import { tacticalRoleOf } from './tactical-roles.mjs';
import { keeperSweepTarget } from './goalkeeping.mjs';

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

// Reaching a carrier before his next action is not the same as winning the
// ball. Forecast the same skill/shield contest used by real challenges instead
// of treating every reachable opponent as a certain interruption.
export function preparationChallengeRisk(actor, ball, opponents, seconds) {
  const shielding =
    0.5 * ability(actor.player, 'firstTouch') +
    0.3 * ability(actor.player, 'strength') +
    0.2 * ability(actor.player, 'balance');
  return Math.max(
    0,
    ...opponents
      .filter((o) => !o.sentOff)
      .map((o) => {
        const closing = arrivalTime(o, ball, pursuitMode(o, ball), o.reaction ?? 0.15);
        const support = opponents.filter(
          (m) => m !== o && !m.sentOff && distance(m.pos, ball) < 3,
        ).length;
        const protectedSide =
          (o.pos.x - actor.pos.x) * (ball.x - actor.pos.x) +
            (o.pos.z - actor.pos.z) * (ball.z - actor.pos.z) <
          0;
        const defending = o.isKeeper
          ? 0.5 * ability(o.player, 'oneOnOnes') +
            0.3 * ability(o.player, 'handling') +
            0.2 * ability(o.player, 'reflexes')
          : 0.7 * ability(o.player, 'tackling') +
            0.2 * ability(o.player, 'balance') +
            0.1 * ability(o.player, 'strength');
        return (
          duelProbability(defending, shielding, protectedSide ? -1 : 0, support) /
          (1 + Math.exp((closing - seconds) / 0.25))
        );
      }),
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
  // This runs only after the defender's finite foot actually reaches the
  // football. Comparing torso centres here penalised that same reach again:
  // an extended tackling leg lost to a carrier whose foot was no longer near
  // the ball. Compare the actual observed foot geometry instead.
  const contactDistance = (actor) => {
    const point =
      Number.isFinite(actor.footAngle) && Number.isFinite(actor.footReach)
        ? {
            x: actor.pos.x + Math.cos(actor.footAngle) * actor.footReach,
            z: actor.pos.z + Math.sin(actor.footAngle) * actor.footReach,
          }
        : actor.pos;
    return distance(point, ball);
  };
  const reachEdge = (contactDistance(carrier) - contactDistance(defender)) / 0.6;
  const support = actors.filter(
    (o) => !o.sentOff && o.side === defender.side && o !== defender && distance(o.pos, ball) < 3,
  ).length;
  return duelProbability(defendingQuality, carryingQuality, reachEdge, support);
}

export function tackleWindow(defender, carrier, ball) {
  const protectedTouch = distance(carrier.pos, ball) < 0.72;
  const reachDisadvantage = distance(defender.pos, ball) - distance(carrier.pos, ball);
  const judgement = ability(defender.player, 'decisions') / 100;
  // A forward's ordinary press contains a superior close controller rather
  // than repeating low-percentage lunges. Defenders retain the actual exposed
  // foot window; a high-tackling forward or a loose touch can still challenge.
  const mismatch = defensiveMismatch(defender, carrier);
  if (
    tacticalRoleOf(defender) === 'FWD' &&
    localX(ball.x, defender.direction ?? 1) > 35 &&
    mismatch > 0 &&
    distance(carrier.pos, ball) < 1.3 &&
    reachDisadvantage > -mismatch * 0.4
  )
    return false;
  // The real protected touch and foot reach decide availability. Skill mismatch
  // already affects containment and duelProbability; it cannot grant immunity.
  const shielded =
    (defender.pos.x - carrier.pos.x) * (ball.x - carrier.pos.x) +
      (defender.pos.z - carrier.pos.z) * (ball.z - carrier.pos.z) <
    0;
  const underBody = distance(carrier.pos, ball) < 0.35 && distance(defender.pos, ball) > 0.5;
  return (
    !underBody &&
    (!protectedTouch || !shielded || reachDisadvantage <= 0.08 + 0.08 * (1 - judgement))
  );
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
  const awareness = (a) =>
    (ability(a.player, 'decisions') +
      ability(a.player, 'anticipation') +
      ability(a.player, 'positioning') +
      ability(a.player, 'teamwork')) /
    4;
  const bx = localX(ball.x, direction);
  const candidates = mates.filter(
    (a) =>
      a !== owner &&
      (!a.isKeeper ||
        (!owner &&
          ((bx < 16.5 && Math.abs(ball.z - 34) < 20.16) ||
            keeperSweepTarget(a, ball, direction))) ||
        (owner &&
          bx < 7 &&
          Math.abs(ball.z - 34) < 12 &&
          distance(a.pos, ball) < 2 &&
          distance(owner.pos, ball) > 0.8)),
  );
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
    (tacticalRoleOf(a) === 'FWD' ? Math.max(0, 48 - bx) * 0.12 : 0) -
    (a.pressUntil > time ? 0.65 : 0);
  candidates.sort((a, b) => cost(a) - cost(b) || a.index - b.index);
  const chasers = [];
  while (candidates.length) {
    const canAddPresser = (next) => {
      // Preserve the last line against a through ball it cannot reach. Farther
      // upfield, an imperfect interception can still pressure the next touch;
      // suppressing all late pursuits changed ordinary midfield tempo.
      if (
        intercepts &&
        bx < 35 &&
        ['centreBack', 'holdingMid', 'fullback', 'wingBack'].includes(next.positionRole) &&
        !intercepts.get(next.index).feasible
      )
        return false;
      const nextGap = owner ? distance(next.pos, owner.pos) : distance(next.pos, ball);
      const group = [...chasers.map((index) => mates.find((a) => a.index === index)), next].filter(
        Boolean,
      );
      const groupAwareness = group.reduce((sum, a) => sum + awareness(a), 0) / group.length;
      return !owner
        ? chasers.length < (bx < 30 ? 2 : 1)
        : tactics.press === 'high'
          ? chasers.length === 0
            ? nextGap <= 22
            : chasers.length === 1
              ? nextGap <= 17 && groupAwareness >= 52
              : chasers.length === 2 && nextGap <= 11 && groupAwareness >= 64 && bx < 78
          : tactics.press === 'normal'
            ? chasers.length === 0
              ? nextGap <= 17
              : chasers.length === 1 && nextGap <= 7.5 && groupAwareness >= 66 && bx < 72
            : chasers.length === 0
              ? nextGap <= 12
              : chasers.length === 1 && bx < 28 && nextGap < 6 && groupAwareness >= 40;
    };
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
    const eligible = candidates.findIndex(canAddPresser);
    if (eligible < 0) break;
    const a = candidates.splice(eligible, 1)[0];
    const radius = !owner ? 105 : tactics.press === 'low' ? 12 : tactics.press === 'high' ? 22 : 17;
    if (owner && (distance(a.pos, ball) > radius || distance(a.pos, owner.pos) > radius)) continue;
    if (owner && tactics.press !== 'high' && tacticalRoleOf(a) === 'FWD' && bx > 60) {
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
      (tacticalRoleOf(a) === 'DEF' ||
        ['holdingMid', 'centralMid'].includes(a.positionRole) ||
        ['wideMid', 'wingBack'].includes(a.positionRole)),
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
        tacticalRoleOf(a) === 'FWD' &&
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
        (['FWD', 'MID'].includes(tacticalRoleOf(a)) || localX(a.pos.x, direction) < 35),
    )
    .sort((a, b) => localX(a.pos.x, direction) - localX(b.pos.x, direction));
  const marking = {};
  for (const threat of threats) {
    pool.sort((a, b) => {
      const value = (o) =>
        arrivalTime(o, threat.pos) +
        (o.activity?.load ?? 0) * 0.6 -
        (o.defenceMemory?.id === threat.player.id && o.defenceMemory.until > time ? 1.2 : 0) +
        (tactics.press === 'low' ? 0.22 : 0.1) * Math.abs((o.anchor?.z ?? o.pos.z) - threat.pos.z) -
        (ability(o.player, 'marking') +
          ability(o.player, 'positioning') +
          ability(o.player, 'anticipation') +
          ability(o.player, 'decisions') +
          ability(o.player, 'teamwork')) *
          0.0016;
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
export function blockPosition(actor, ball, direction, tactics, opponentStyle = 'balanced') {
  const bx = localX(ball.x, direction);
  const awareness =
    (ability(actor.player, 'decisions') +
      ability(actor.player, 'anticipation') +
      ability(actor.player, 'positioning') +
      ability(actor.player, 'teamwork')) /
    4;
  const low = tactics.press === 'low',
    high = tactics.press === 'high';
  const lineFollow = (low ? 0.42 : high ? 0.57 : 0.5) + (awareness - 50) * 0.0005;
  const back = clamp(2 + bx * lineFollow, 4, low ? 26 : high ? 46 : 38);
  const gap = low ? 8 : high ? 11 : 10;
  const outlet =
    tactics.style === 'counter' && low
      ? Math.max(back + gap + 14, clamp(bx + 12, 38, 52))
      : back + gap + 14;
  const depth =
    tacticalRoleOf(actor) === 'DEF'
      ? back
      : tacticalRoleOf(actor) === 'FWD'
        ? outlet
        : back + gap + (actor.positionRole === 'holdingMid' ? -1 : 1);
  const compact = tactics.style === 'counter';
  const ballSideBase = opponentStyle === 'possession' ? 0.65 : low || compact ? 0.24 : 0.3;
  const ballSideShift = clamp(ballSideBase + (awareness - 50) * 0.002, 0.06, 0.82);
  const backWidth =
    low && tacticalRoleOf(actor) === 'DEF'
      ? actor.positionRole === 'centreBack'
        ? 0.55
        : 0.72 - 0.17 * clamp((35 - bx) / 25, 0, 1)
      : compact || low
        ? 0.72
        : 0.78;
  return {
    x: direction === 1 ? clamp(depth, 3, 83) : 105 - clamp(depth, 3, 83),
    z: clamp(34 + (actor.anchor.z - 34) * backWidth + (ball.z - 34) * ballSideShift, 5, 63),
  };
}
