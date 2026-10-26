import { clamp } from '../../core/index.mjs';
import { tacticalRoleOf } from './tactical-roles.mjs';
import { distance, unit, localX } from './spatial.mjs';

const isFreeKick = (state) => ['freeKick', 'indirect'].includes(state.type);
function onOwnGoalLine(actor, direction) {
  return localX(actor.pos.x, direction(actor.side)) < 0.3 && Math.abs(actor.pos.z - 34) < 3.66;
}
// Clipping a radial exclusion target to the pitch can put it back inside the
// exclusion circle forever. Select the closest valid circle/field intersection.
function outsideCircle(ball, target, radius) {
  let h = unit(ball, target);
  if (Math.hypot(h.x, h.z) < 0.1) h = { x: ball.x < 52.5 ? 1 : -1, z: 0 };
  const projected = { x: ball.x + h.x * radius, z: ball.z + h.z * radius };
  const inside = (p) => p.x >= 1 && p.x <= 104 && p.z >= 1 && p.z <= 67;
  if (inside(projected)) return projected;
  const candidates = [];
  for (const x of [1, 104]) {
    const square = radius ** 2 - (x - ball.x) ** 2;
    if (square >= 0)
      for (const sign of [-1, 1]) candidates.push({ x, z: ball.z + sign * Math.sqrt(square) });
  }
  for (const z of [1, 67]) {
    const square = radius ** 2 - (z - ball.z) ** 2;
    if (square >= 0)
      for (const sign of [-1, 1]) candidates.push({ x: ball.x + sign * Math.sqrt(square), z });
  }
  return candidates.filter(inside).sort((a, b) => distance(a, target) - distance(b, target))[0];
}

export function kickoffPosition(actor, direction) {
  const x = actor.isKeeper ? 5 : Math.min(47, actor.anchor.x * 0.68);
  return { x: direction === 1 ? x : 105 - x, z: actor.anchor.z };
}

// Dead ball targets move bodies through the same finite acceleration controller.
// Only the stopped ball is placed; players are never teleported between restarts.
export function deadballTarget(actor, actors, state, direction, time) {
  const dir = direction(actor.side),
    attackDir = direction(state.side),
    b = state.ball;
  if (state.type === 'goal') {
    const home = kickoffPosition(actor, dir);
    if (actor.side !== state.scoringSide || actor.isKeeper || time - state.startedAt > 5)
      return home;
    const scorer = actors.find((a) => a.player.id === state.scorerId);
    const center = state.celebration;
    if (actor === scorer) return center;
    const friends = actors
      .filter((a) => a.side === state.scoringSide && !a.sentOff && !a.isKeeper && a !== scorer)
      .sort((a, b) => distance(a.pos, center) - distance(b.pos, center))
      .slice(0, 3);
    const i = friends.indexOf(actor);
    return i >= 0
      ? { x: clamp(center.x - dir * (1.5 + i), 2, 103), z: clamp(center.z + (i - 1) * 1.8, 2, 66) }
      : home;
  }
  if (actor.index === state.taker) return { x: clamp(b.x - attackDir * 0.65, 0.1, 104.9), z: b.z };
  // IFAB Law 13: opponents may remain on their own goal line between the posts.
  if (isFreeKick(state) && actor.side !== state.side && actor.isKeeper && localX(b.x, dir) < 9.15)
    return { x: dir === 1 ? 0.05 : 104.95, z: clamp(b.z, 30.8, 37.2) };
  if (state.type === 'kickoff' || state.type === 'half') {
    const target = kickoffPosition(actor, dir);
    if (actor.side !== state.side && distance(target, b) < 9.65) {
      const h = unit(b, target);
      return { x: b.x + h.x * 9.65, z: b.z + h.z * 9.65 };
    }
    return target;
  }
  if (state.type === 'penalty') {
    if (actor.isKeeper && actor.side !== state.side)
      return { x: attackDir === 1 ? 104.95 : 0.05, z: 34 };
    return { x: clamp(b.x - attackDir * 12, 2, 103), z: clamp(7 + actor.index * 2.5, 3, 65) };
  }
  let x = actor.anchor.x + (localX(b.x, dir) - 52.5) * 0.35 + (actor.side === state.side ? 4 : -5);
  let target = {
    x: dir === 1 ? clamp(x, 3, 101) : 105 - clamp(x, 3, 101),
    z: clamp(actor.anchor.z + (b.z - 34) * 0.18, 3, 65),
  };
  const attackers = actors.filter(
    (a) =>
      a.side === state.side &&
      !a.sentOff &&
      !a.isKeeper &&
      a.index !== state.taker &&
      ['FWD', 'MID'].includes(tacticalRoleOf(a)),
  );
  if (state.type === 'corner') {
    const i = attackers.indexOf(actor);
    if (i >= 0)
      target = { x: attackDir === 1 ? 96 - (i % 3) * 3 : 9 + (i % 3) * 3, z: 27 + (i % 5) * 3.5 };
    if (actor.side !== state.side && tacticalRoleOf(actor) === 'DEF') {
      const defenders = actors.filter(
        (a) => a.side === actor.side && !a.sentOff && tacticalRoleOf(a) === 'DEF',
      );
      const i = defenders.indexOf(actor),
        threat = attackers[i];
      if (threat)
        target = { x: attackDir === 1 ? 97 - (i % 3) * 3 : 8 + (i % 3) * 3, z: 27 + (i % 5) * 3.5 };
    }
  }
  if (actor.isKeeper) target = { x: dir === 1 ? 3 : 102, z: clamp(34 + (b.z - 34) * 0.08, 30, 38) };
  if (
    state.type === 'freeKick' &&
    actor.side !== state.side &&
    !actor.isKeeper &&
    distance(b, { x: attackDir === 1 ? 105 : 0, z: 34 }) < 32
  ) {
    const wall = actors
      .filter((a) => a.side !== state.side && !a.sentOff && !a.isKeeper)
      .slice(0, 3);
    const i = wall.indexOf(actor),
      h = unit(b, { x: attackDir === 1 ? 105 : 0, z: 34 });
    if (i >= 0)
      target = {
        x: b.x + h.x * 9.7 - h.z * (i - 1) * 0.9,
        z: b.z + h.z * 9.7 + h.x * (i - 1) * 0.9,
      };
  }
  const exclusion =
    actor.side === state.side
      ? 2
      : ['freeKick', 'indirect', 'corner', 'goalKick'].includes(state.type)
        ? 9.15
        : 3;
  // The movement controller parks within 0.2m of a target. A target only a few
  // centimetres outside the legal circle can therefore leave the player inside
  // it forever. Include the physical parking tolerance in all retreat targets.
  if (distance(target, b) < exclusion + 0.5) {
    target = outsideCircle(b, target, exclusion + 0.5);
  }
  return target;
}

export function restartReady(state, actors, direction) {
  const taker = actors.find((a) => a.index === state.taker && !a.sentOff);
  if (!taker || distance(taker.pos, state.ball) > 1) return false;
  if (['kickoff', 'half'].includes(state.type))
    return actors.every(
      (a) =>
        a.sentOff ||
        a === taker ||
        (localX(a.pos.x, direction(a.side)) <= 52.5 &&
          (a.side === state.side || distance(a.pos, state.ball) >= 9.15)),
    );
  return actors.every(
    (a) =>
      a.sentOff ||
      a.side === state.side ||
      (state.type === 'penalty' && a.isKeeper) ||
      (isFreeKick(state) && onOwnGoalLine(a, direction)) ||
      distance(a.pos, state.ball) >=
        (['freeKick', 'indirect', 'corner', 'goalKick', 'penalty'].includes(state.type) ? 9.15 : 3),
  );
}
