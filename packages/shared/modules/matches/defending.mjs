import { ability } from './skills.mjs';
import { arrivalTime, pursuitMode } from './arrival.mjs';
import { distance, localX } from './spatial.mjs';
import { sprintAvailable } from './activity.mjs';
import { clamp } from '../../core/index.mjs';

export function tackleProbability(
  defender,
  carrier,
  ball,
  actors,
  defendingQuality,
  carryingQuality,
) {
  const reachEdge = clamp(
    (distance(carrier.pos, ball) - distance(defender.pos, ball)) / 0.6,
    -1,
    1,
  );
  const support = Math.min(
    2,
    actors.filter(
      (o) => !o.sentOff && o.side === defender.side && o !== defender && distance(o.pos, ball) < 3,
    ).length,
  );
  return clamp(
    1 /
      (1 +
        Math.exp(-((defendingQuality - carryingQuality) / 28 + reachEdge * 1.2 + support * 0.35))),
    0.02,
    0.98,
  );
}

export function tackleWindow(defender, carrier, ball) {
  const protectedTouch = distance(carrier.pos, ball) < 0.72;
  const reachDisadvantage = distance(defender.pos, ball) - distance(carrier.pos, ball);
  const judgement = ability(defender.player, 'decisions') / 100;
  return !protectedTouch || reachDisadvantage <= 0.08 + 0.08 * (1 - judgement);
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
    3.4 + Math.max(0, relativeSpeed - 2) * 0.08 + (50 - ability(defender.player, 'balance')) * 0.005,
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
  const cost = (a) =>
    arrivalTime(a, ball, pursuitMode(a, ball)) +
    (a.activity?.load ?? 0) +
    (sprintAvailable(a) ? 0 : 2.5) +
    (a.positionRole === 'centreBack' ? Math.max(0, bx - 28) * 0.12 : 0) +
    (a.player.role === 'FWD' ? Math.max(0, 48 - bx) * 0.12 : 0) -
    (a.pressUntil > time ? 0.65 : 0);
  candidates.sort((a, b) => cost(a) - cost(b) || a.index - b.index);
  const chasers = [];
  while (candidates.length) {
    if (chasers.length >= ((tactics.press === 'high' && bx > 35) || bx < 30 ? 2 : 1)) break;
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
    if (distance(a.pos, ball) > radius && chasers.length > 0) continue;
    if (chasers.length === 0 || distance(a.pos, ball) <= radius) chasers.push(a.index);
    if (!(a.pressUntil > time)) a.pressUntil = time + 1.2;
  }
  const pool = mates.filter(
    (a) =>
      !a.isKeeper &&
      !chasers.includes(a.index) &&
      (a.player.role === 'DEF' || ['holdingMid', 'centralMid'].includes(a.positionRole)),
  );
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
  return { chasers, marking };
}
