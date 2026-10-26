import { effectiveAbility } from '../players/index.mjs';
import { clamp } from '../../core/index.mjs';
import { distance } from './spatial.mjs';
export const ability = (p, key) => effectiveAbility(p, key);
export function actionQuality(actor, ball, key, opponents, lapse = false) {
  const a = (key) => ability(actor.player, key);
  const mix = {
    passing: 0.8 * a('passing') + 0.2 * a('balance'),
    crossing: 0.8 * a('crossing') + 0.2 * a('passing'),
    firstTouch: 0.65 * a('firstTouch') + 0.2 * a('balance') + 0.15 * a('agility'),
    dribbling: 0.65 * a('dribbling') + 0.2 * a('agility') + 0.15 * a('balance'),
    tackling: 0.7 * a('tackling') + 0.2 * a('balance') + 0.1 * a('strength'),
    distribution: 0.75 * a('distribution') + 0.25 * a('passing'),
    finishing: 0.75 * a('finishing') + 0.25 * a('balance'),
    longShots: 0.7 * a('longShots') + 0.3 * a('strength'),
    setPieces: 0.7 * a('setPieces') + 0.2 * a('longShots') + 0.1 * a('strength'),
    penalty: 0.55 * a('finishing') + 0.45 * a('setPieces'),
  };
  const pressureDistances = opponents.map((o) => distance(o.pos, actor.pos)).sort((a, b) => a - b);
  const immediatePressure = 1 - Math.min(3, pressureDistances[0] ?? 3) / 3;
  // A nearby second defender can close options and compress the touch, but has
  // diminishing effect. Defenders farther away than four metres add no crowding.
  const supportPressure = 1 - Math.min(4, pressureDistances[1] ?? 4) / 4;
  const pressure = clamp(immediatePressure + 0.3 * supportPressure, 0, 1);
  const facing = Number.isFinite(actor.facing)
    ? { x: Math.cos(actor.facing), z: Math.sin(actor.facing) }
    : Math.hypot(actor.velocity.x, actor.velocity.z) > 0.5
      ? actor.velocity
      : { x: actor.direction ?? 1, z: 0 };
  const lateral = facing.x * (ball.z - actor.pos.z) - facing.z * (ball.x - actor.pos.x);
  const weak = actor.player.preferredFoot === 'left' ? lateral < -0.12 : lateral > 0.12;
  const foot =
    actor.player.preferredFoot === 'both'
      ? 0.95 + (0.05 * (actor.player.weakFoot ?? 50)) / 100
      : weak
        ? 1 - 0.18 * (1 - (actor.player.weakFoot ?? 50) / 100)
        : 1;
  const base = mix[key] ?? a(key);
  const pressureLoss = 10 * pressure * (1 - a('composure') / 100);
  return {
    value: clamp(base * foot - pressureLoss - (lapse ? 12 : 0), 1, 100),
    base,
    foot,
    pressure,
    pressureLoss,
    lapse,
    mental: actor.player.matchState ? actor.player.matchState.mental : 0,
  };
}
