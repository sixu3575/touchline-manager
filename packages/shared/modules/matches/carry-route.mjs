import { clamp } from '../../core/index.mjs';
import { distance, segmentPoint } from './spatial.mjs';
import { arrivalTime, pursuitMode } from './arrival.mjs';
import { actionQuality, ability } from './skills.mjs';
import { duelProbability } from './defending.mjs';

// Conditional route estimates only. Each distinct defender gets one encounter;
// actual contacts and tackles are still resolved by the physical simulation.
export function carryRouteRisk(actor, ball, destination, mode, opponents, actors, time = 0) {
  const points = [0, 0.2, 0.4, 0.65, 1].map((fraction) => {
    const point = {
      x: ball.x + (destination.x - ball.x) * fraction,
      z: ball.z + (destination.z - ball.z) * fraction,
    };
    return { point, own: arrivalTime(actor, point, mode, actor.reaction ?? 0.08) };
  });
  const seen = new Set();
  const encounters = [];
  for (const opponent of opponents) {
    const id = opponent.player.id ?? opponent;
    if (opponent.sentOff || seen.has(id)) continue;
    seen.add(id);
    let best = null;
    for (const { point, own } of points) {
      const reach = arrivalTime(
        opponent,
        point,
        pursuitMode(opponent, point),
        opponent.reaction ?? 0.08,
      );
      // A missed tackle cannot be immediately retried during recovery.
      const theirs = Math.max(reach, (opponent.tackleAt ?? time) - time);
      const exposure = clamp((own + 0.35 - theirs) / 1.1, 0, 1) / (1 + own * 0.12);
      if (!best || exposure > best.exposure) best = { point, own, theirs, exposure };
    }
    // Preserve pressure before the first forward route sample, without making
    // that same nearby defender a second independent challenge.
    const pressure = 0.6 * clamp((4 - distance(opponent.pos, ball)) / 4, 0, 1);
    const readiness = clamp((best.own + 0.35 - ((opponent.tackleAt ?? time) - time)) / 0.8, 0, 1);
    best.exposure = clamp(best.exposure + pressure * readiness, 0, 1);
    if (best.exposure > 0) encounters.push({ opponent, ...best });
  }
  encounters.sort(
    (a, b) =>
      a.own - b.own || String(a.opponent.player.id).localeCompare(String(b.opponent.player.id)),
  );
  let survival = 1,
    unchallenged = 1;
  for (const encounter of encounters) {
    const { opponent, point, own, theirs, exposure } = encounter;
    // Support requires the other defender to reach this same place at this
    // time. A later second line is another encounter, not instant assistance.
    const support = encounters.reduce((sum, other) => {
      if (other === encounter) return sum;
      const overlap =
        clamp(1 - distance(other.point, point) / 3, 0, 1) *
        clamp(1 - Math.abs(other.own - own) / 0.8, 0, 1);
      const coordination =
        (ability(other.opponent.player, 'anticipation') +
          ability(other.opponent.player, 'positioning') +
          ability(other.opponent.player, 'teamwork')) /
        300;
      return sum + other.exposure * overlap * coordination;
    }, 0);
    const carrierAt = { ...actor, pos: point },
      defenderAt = { ...opponent, pos: point };
    const attackers = actors
        .filter((a) => !a.sentOff && a.side === actor.side)
        .map((a) => (a === actor ? carrierAt : a)),
      defenders = actors
        .filter((a) => !a.sentOff && a.side === opponent.side)
        .map((a) => (a === opponent ? defenderAt : a));
    const defending = actionQuality(defenderAt, point, 'tackling', attackers).value,
      carrying = actionQuality(carrierAt, point, 'dribbling', defenders).value;
    const tackle = duelProbability(defending, carrying, (own - theirs) / 0.6, support);
    encounter.loss = exposure * tackle;
    encounter.support = support;
    encounter.carrierAdvantage = 1 - tackle;
    survival *= 1 - encounter.loss;
    unchallenged *= 1 - exposure;
  }
  const leading = encounters.reduce(
    (best, encounter) => (!best || encounter.loss > best.loss ? encounter : best),
    null,
  );
  return {
    survival,
    danger: 1 - unchallenged,
    duel: leading?.carrierAdvantage ?? 0.5,
    cover: Math.min(2, leading?.support ?? 0),
    near: leading ? Math.min(12, segmentPoint(ball, destination, leading.opponent.pos).gap) : 12,
    opponent: leading?.opponent,
    encounters,
  };
}
