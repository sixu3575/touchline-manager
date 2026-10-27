import { clamp } from '../../core/index.mjs';
import { ability } from './skills.mjs';
import { distance, unit, segmentPoint, localX } from './spatial.mjs';
import { tacticalPreset } from '../tactics/index.mjs';
import { sprintAvailable } from './activity.mjs';
import { carryRouteRisk } from './carry-route.mjs';
import { boundaryAwareness, boundaryVelocity } from './onball.mjs';
import { movement } from './locomotion.mjs';
import { tacticalRoleOf } from './tactical-roles.mjs';

// Opportunity estimates rank routes only. Actual touches, tackles and collisions
// still decide whether the player keeps the independently simulated ball.
export function carryOptions(
  actor,
  ball,
  direction,
  opponents,
  quality,
  profile,
  time,
  tactical = {},
  allActors = [actor, ...opponents],
) {
  const a = (key) => ability(actor.player, key);
  const preset = tacticalPreset(tactical.style);
  const wide = tactical.style === 'wide';
  const forward = (6 + a('offTheBall') * 0.035) * (tactical.fastBreak ? 1.2 : preset.carry);
  const previous =
    actor.intent?.kind === 'carry' && actor.intent.expiresAt > time
      ? actor.intent.destination
      : null;
  const persistent =
    previous && distance(ball, previous) > 2 && (previous.x - ball.x) * direction > 1
      ? previous
      : null;
  const routes = [-6, -3, 0, 3, 6].map((lane) => ({
    x: clamp(ball.x + direction * forward, 1, 104),
    z: clamp(ball.z + lane + (34 - ball.z) * (wide ? 0 : 0.07), 3.5, 64.5),
  }));
  const cutInsideRoute =
    wide && actor.positionRole === 'winger' && Math.abs(ball.z - 34) > 12
      ? {
          x: clamp(ball.x + direction * forward, 1, 104),
          z: clamp(ball.z + (34 - ball.z) * 0.52, 4, 64),
        }
      : null;
  if (cutInsideRoute) routes.push(cutInsideRoute);
  for (const lane of [-5, 5]) {
    routes.push({ x: clamp(ball.x + direction * 0.5, 1, 104), z: clamp(ball.z + lane, 3.5, 64.5) });
    routes.push({
      x: clamp(ball.x - direction * 3, 1, 104),
      z: clamp(ball.z + lane * 0.6, 3.5, 64.5),
    });
  }
  if (wide) {
    const flank = Math.abs(ball.z - 34) > 8 ? (ball.z < 34 ? -1 : 1) : actor.anchor.z < 34 ? -1 : 1;
    routes.push({
      x: clamp(ball.x + direction * forward, 1, 104),
      z: clamp(ball.z + clamp(34 + flank * 24 - ball.z, -8, 8), 4, 64),
    });
  }
  if (persistent) routes.unshift(persistent);
  return routes.flatMap((destination) => {
    const progress = (destination.x - ball.x) * direction;
    const heading = unit(ball, destination);
    const clear = !opponents.some(
      (o) =>
        distance(o.pos, ball) < 4.5 ||
        (segmentPoint(ball, destination, o.pos).gap < 2.7 && distance(o.pos, ball) < 6),
    );
    let mode = clear && sprintAvailable(actor) ? 'carryFast' : 'carry';
    const pace = movement(actor.player, actor.energy, mode).speed;
    const planned = { x: heading.x * pace, z: heading.z * pace };
    const boundary = boundaryAwareness(actor, ball, planned);
    const safe = boundaryVelocity(actor, ball, planned);
    if (Math.hypot(safe.x, safe.z) < pace * 0.85) mode = 'carry';
    const route = carryRouteRisk(actor, ball, destination, mode, opponents, allActors, time);
    const { danger, cover, duel, near } = route;
    const success =
      0.97 * route.survival * (1 - boundary.risk * (0.35 + 0.35 * (1 - a('dribbling') / 100)));
    const spaceBonus = 0.08 * clamp((near - 2.5) / 6, 0, 1) * clamp(progress / 8, 0, 1);
    const takeOn = danger > 0.15;
    const cutInsideBonus =
      destination === cutInsideRoute && progress > 1 && cover < 2
        ? 0.04 * (0.5 + a('dribbling') / 200) * clamp((near - 2) / 5, 0, 1)
        : 0;
    const isolatedWideDuelBonus =
      wide && actor.positionRole === 'winger' && takeOn && cover === 0 && progress > 2
        ? 0.075 *
          clamp((a('dribbling') - ability(route.opponent.player, 'tackling') + 20) / 70, 0, 1)
        : 0;
    return [
      {
        destination: { x: destination.x, z: destination.z },
        mode,
        success,
        danger,
        intent: takeOn ? 'takeOn' : 'carry',
        bonus:
          spaceBonus +
          quality.pressure *
            0.05 *
            clamp((near - distance(route.opponent?.pos ?? destination, ball)) / 5, 0, 1) +
          0.045 * profile.inclination +
          (0.22 * danger * Math.max(0, duel - 0.45)) / (1 + cover) +
          (destination === persistent ? 0.015 : 0) -
          0.035 * cover +
          (wide
            ? 0.055 *
              clamp((Math.abs(destination.z - 34) - 12) / 12, 0, 1) *
              clamp((near - 1) / 5, 0, 1)
            : 0) +
          cutInsideBonus +
          isolatedWideDuelBonus +
          (tactical.fastBreak ? 0.025 * success : 0),
        ownRisk:
          tacticalRoleOf(actor) === 'DEF' && localX(ball.x, direction) < 35 ? 0.05 * danger : 0,
        reason:
          progress < 1
            ? '横向或回撤护球，离开上抢线路并寻找接应'
            : cover > 0 && takeOn
              ? '防线有协防，权衡带球路线与出球'
              : takeOn
                ? '比较个人盘带与单防能力，变向挑战防守者'
                : wide && Math.abs(destination.z - 34) > 18
                  ? '沿边路空地推进，等待套边或包抄接应'
                  : tactical.fastBreak
                    ? '夺回球权后利用空地快速向前'
                    : '前方空地可利用，持球向前推进',
      },
    ];
  });
}
