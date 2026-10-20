import { clamp } from '../../core/index.mjs';
import { ability, actionQuality } from './skills.mjs';
import { distance, unit, segmentPoint, localX } from './spatial.mjs';
import { tacticalPreset } from '../tactics/index.mjs';
import { arrivalTime, pursuitMode } from './arrival.mjs';
import { sprintAvailable } from './activity.mjs';
import { duelProbability } from './defending.mjs';

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
    const heading = unit(ball, destination),
      length = distance(ball, destination);
    const clear = !opponents.some(
      (o) =>
        distance(o.pos, ball) < 4.5 ||
        (segmentPoint(ball, destination, o.pos).gap < 2.7 && distance(o.pos, ball) < 6),
    );
    const mode = clear && sprintAvailable(actor) ? 'carryFast' : 'carry';
    const defenders = opponents
      .filter((o) => distance(o.pos, ball) < 24)
      .map((opponent) => {
        let risk = 0,
          carrierAdvantage = 0.5;
        for (const fraction of [0.2, 0.4, 0.65, 1]) {
          const point = {
            x: ball.x + heading.x * length * fraction,
            z: ball.z + heading.z * length * fraction,
          };
          const own = arrivalTime(actor, point, mode, actor.reaction ?? 0.08);
          const theirs = arrivalTime(
            opponent,
            point,
            pursuitMode(opponent, point),
            opponent.reaction ?? 0.08,
          );
          const carrierAt = { ...actor, pos: point },
            defenderAt = { ...opponent, pos: point },
            attackers = allActors
              .filter((a) => !a.sentOff && a.side === actor.side)
              .map((a) => (a === actor ? carrierAt : a)),
            defendersAtRoute = allActors
              .filter((a) => !a.sentOff && a.side === opponent.side)
              .map((a) => (a === opponent ? defenderAt : a)),
            carryingQuality = actionQuality(carrierAt, point, 'dribbling', defendersAtRoute).value,
            defendingQuality = actionQuality(defenderAt, point, 'tackling', attackers).value,
            support = Math.min(
              2,
              defendersAtRoute.filter((a) => a !== defenderAt && distance(a.pos, point) < 3).length,
            ),
            tackleChance = duelProbability(
              defendingQuality,
              carryingQuality,
              (own - theirs) / 0.6,
              support,
            ),
            arrivalChance = clamp((own + 0.35 - theirs) / 1.1, 0, 1) / (1 + own * 0.12);
          if (arrivalChance > risk) {
            risk = arrivalChance;
            carrierAdvantage = 1 - tackleChance;
          }
        }
        // Immediate pressure still matters before a predicted interception point.
        risk = clamp(risk + 0.6 * clamp((4 - distance(opponent.pos, ball)) / 4, 0, 1), 0, 1);
        return {
          opponent,
          risk,
          carrierAdvantage,
          gap: segmentPoint(ball, destination, opponent.pos).gap,
        };
      })
      .sort((a, b) => b.risk - a.risk);
    const first = defenders[0],
      near = Math.min(12, first?.gap ?? 12);
    const danger = first?.risk ?? 0;
    const cover = Math.min(2, defenders.slice(1).filter((d) => d.risk > 0.22).length);
    const duel = first?.carrierAdvantage ?? 0.5;
    const success = clamp(0.97 - danger * (1 - duel) - 0.14 * cover, 0.12, 0.98);
    const spaceBonus = 0.08 * clamp((near - 2.5) / 6, 0, 1) * clamp(progress / 8, 0, 1);
    const takeOn = danger > 0.15;
    return [
      {
        destination,
        mode,
        success,
        danger,
        intent: takeOn ? 'takeOn' : 'carry',
        bonus:
          spaceBonus +
          quality.pressure *
            0.05 *
            clamp((near - distance(first?.opponent?.pos ?? destination, ball)) / 5, 0, 1) +
          0.045 * profile.inclination +
          (0.22 * danger * Math.max(0, duel - 0.45)) / (1 + cover) +
          (destination === persistent ? 0.015 : 0) -
          0.035 * cover +
          (wide
            ? 0.055 *
              clamp((Math.abs(destination.z - 34) - 12) / 12, 0, 1) *
              clamp((near - 1) / 5, 0, 1)
            : 0) +
          (tactical.fastBreak ? 0.025 * success : 0),
        ownRisk: actor.player.role === 'DEF' && localX(ball.x, direction) < 35 ? 0.05 * danger : 0,
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
