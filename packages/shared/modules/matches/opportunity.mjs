import { clamp } from '../../core/index.mjs';
import { ability } from './skills.mjs';
import { distance, pitchValue, segmentPoint, localX } from './spatial.mjs';

// One continuation scale for keeping, passing and carrying the ball. Territory
// alone is not an opportunity: a receiver also needs room and a next action.
// This is a local spatial approximation, never a requested match-stat target.
export function continuationValue(point, receiver, actors, direction) {
  const opponents = actors.filter((o) => o.side !== receiver.side && !o.sentOff);
  const room = clamp(Math.min(6, ...opponents.map((o) => distance(o.pos, point))) / 6, 0, 1);
  let outlets = 0;
  for (const mate of actors) {
    if (mate === receiver || mate.side !== receiver.side || mate.sentOff) continue;
    const length = distance(point, mate.pos);
    if (length < 4 || length > 28) continue;
    let obstruction = 0;
    for (const opponent of opponents) {
      const lane = segmentPoint(point, mate.pos, opponent.pos);
      if (lane.t > 0.03 && lane.t < 0.98)
        obstruction = Math.max(obstruction, Math.exp(-lane.gap / 1.5));
    }
    outlets += (1 - obstruction) / (1 + length / 18);
  }
  const coordination = 0.5 + ability(receiver.player, 'teamwork') * 0.005;
  const depth = localX(point.x, direction),
    dx = Math.max(0.01, 105 - depth),
    lateral = point.z - 34;
  const angle = Math.abs(Math.atan2(3.66 - lateral, dx) - Math.atan2(-3.66 - lateral, dx));
  // At the byline, territory alone no longer promises a central finishing
  // opportunity. Retain some value for a cutback and recycle, not a free goal.
  const access =
    1 -
    clamp((depth - 88.5) / 16.5, 0, 1) *
      clamp((Math.abs(lateral) - 3.66) / 10, 0, 1) *
      ((0.75 * 0.3) / (angle + 0.3));
  return (
    0.7 *
    pitchValue(point, direction) *
    access *
    (0.3 + 0.7 * room) *
    (0.8 + 0.2 * (1 - Math.exp(-outlets)) * coordination)
  );
}

export function lossValue(point, direction) {
  return 0.008 + 0.35 * pitchValue(point, -direction);
}

// Losing a long outlet near the opponent's box has a different consequence
// from losing a short square pass outside one's own box. Visible lane threats
// locate likely interceptions; execution/reception misses fall near the target.
export function passLossValue(ball, target, opponents, direction, assessment = null) {
  if (assessment) {
    if (assessment.obstructed) return lossValue(ball, direction);
    const { laneAssessment, failureProbability } = assessment;
    // Integrate only physically reachable interceptions, in flight order.
    // Remaining failures are inaccurate kicks / contested reception at target.
    // A defender beneath a high ball must not charge a deep-own-half turnover
    // cost to a lofted outlet that clears him.
    let weight = Math.max(0, failureProbability - laneAssessment.risk);
    let cost = weight * lossValue(target, direction);
    for (const threat of laneAssessment.threats) {
      weight += threat.firstProbability;
      cost += threat.firstProbability * lossValue(threat.point, direction);
    }
    return weight > 0 ? cost / weight : lossValue(target, direction);
  }
  let weight = 1,
    value = lossValue(target, direction);
  for (const opponent of opponents) {
    if (opponent.sentOff) continue;
    const lane = segmentPoint(ball, target, opponent.pos);
    if (lane.t <= 0.03 || lane.t >= 0.98) continue;
    const exposure = Math.exp(-lane.gap / 1.5);
    weight += exposure;
    value +=
      exposure *
      lossValue(
        { x: ball.x + (target.x - ball.x) * lane.t, z: ball.z + (target.z - ball.z) * lane.t },
        direction,
      );
  }
  return value / weight;
}
