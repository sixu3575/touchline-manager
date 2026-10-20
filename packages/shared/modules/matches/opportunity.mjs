import { clamp } from '../../core/index.mjs';
import { ability } from './skills.mjs';
import { distance, pitchValue, segmentPoint } from './spatial.mjs';

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
  return (
    0.7 *
    pitchValue(point, direction) *
    (0.3 + 0.7 * room) *
    (0.8 + 0.2 * (1 - Math.exp(-outlets)) * coordination)
  );
}

export function lossValue(point, direction) {
  return 0.008 + 0.35 * pitchValue(point, -direction);
}
