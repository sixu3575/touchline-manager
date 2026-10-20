import { clamp } from '../../core/index.mjs';
import { tacticalPreset } from '../tactics/index.mjs';
import { ability } from './skills.mjs';
import { distance, localX, segmentPoint } from './spatial.mjs';

export function attackPhase(actors, ball, side, direction, tactics, time, continuity = {}) {
  const bx = localX(ball.x, direction);
  const behind = actors.filter(
    (a) => a.side !== side && !a.sentOff && localX(a.pos.x, direction) > bx + 3,
  ).length;
  const fastBreak =
    tactics.style === 'counter' &&
    continuity.side === side &&
    continuity.regainedAt !== null &&
    continuity.regainedAt !== undefined &&
    time >= continuity.regainedAt &&
    time - continuity.regainedAt < 8 &&
    behind < 7 &&
    bx < 88;
  return {
    style: tactics.style ?? 'balanced',
    phase: fastBreak ? 'counter' : bx < 36 ? 'buildup' : bx < 70 ? 'midfield' : 'finalThird',
    fastBreak,
  };
}

/** Targets are team intentions. Reception, ball contests, marking and physical limits retain priority. */
export function attackAssignments(
  actors,
  ball,
  carrier,
  receiverId,
  direction,
  tactics,
  time,
  continuity,
) {
  const mates = actors.filter((a) => a.side === carrier.side && !a.sentOff);
  const opponents = actors.filter((a) => a.side !== carrier.side && !a.sentOff);
  const state = attackPhase(actors, ball, carrier.side, direction, tactics, time, continuity);
  const preset = tacticalPreset(tactics.style),
    bx = localX(ball.x, direction);
  const flank = ball.z < 34 ? -1 : 1,
    outside = Math.abs(ball.z - 34) > 12;
  const wideAttack = tactics.style === 'wide';
  const line = opponents.map((o) => localX(o.pos.x, direction)).sort((a, b) => b - a)[1] ?? 105;
  const maxX = Math.max(52.5, bx, line) - 0.6;
  const assignments = {};
  const centralProtection = mates.filter(
    (a) =>
      ['centreBack', 'holdingMid'].includes(a.positionRole) && localX(a.pos.x, direction) < bx - 10,
  ).length;
  let strikerNumber = 0;
  for (const actor of mates) {
    if (actor === carrier || actor.isKeeper || actor.player.id === receiverId) continue;
    const role = actor.positionRole,
      ownFlank = actor.anchor.z < 34 ? -1 : 1;
    let x, z, duty;
    if (role === 'centreBack') {
      x = Math.min(bx - 18, 62, actor.anchor.x + (bx - 52.5) * 0.35 + 7);
      z = actor.anchor.z + (ball.z - 34) * 0.1;
      duty = 'cover';
    } else if (role === 'holdingMid') {
      x = Math.min(68, bx - (wideAttack ? 22 : 13));
      z = 34 + (ball.z - 34) * 0.12;
      duty = 'cover';
    } else if (state.fastBreak && ['winger', 'striker', 'wideMid'].includes(role)) {
      x = bx + 18 + ability(actor.player, 'offTheBall') * 0.06;
      z = role === 'striker' ? actor.anchor.z : 34 + ownFlank * 20;
      duty = 'break';
    } else if (wideAttack && outside && bx > 60 && role === 'striker') {
      x = Math.max(81, bx + 9);
      z = strikerNumber++ % 2 === 0 ? 34 + flank * 4 : 34 - flank * 3;
      duty = 'nearPost';
    } else if (['winger', 'wideMid', 'wingBack'].includes(role)) {
      if (wideAttack && outside && bx > 68 && ownFlank !== flank) {
        x = Math.max(83, bx + 7);
        z = 34 - flank * 6;
        duty = 'farPost';
      } else {
        x = Math.max(
          38,
          Math.min(
            actor.anchor.x + (bx - 52.5) * 0.45 + (wideAttack ? 11 : 6),
            bx + (wideAttack ? 14 : 18),
          ),
        );
        z = 34 + ownFlank * (wideAttack ? 26 : 22) * Math.min(1.04, preset.width);
        duty = 'width';
      }
    } else if (role === 'fullback' && wideAttack) {
      const target = {
        x: direction === 1 ? Math.min(94, bx + 12) : 105 - Math.min(94, bx + 12),
        z: 34 + flank * 28,
      };
      const blocked = opponents.some(
        (o) => segmentPoint(actor.pos, target, o.pos).gap < 2.5 && distance(o.pos, actor.pos) < 15,
      );
      if (
        ownFlank === flank &&
        outside &&
        bx > 38 &&
        bx < 89 &&
        centralProtection >= 3 &&
        !blocked &&
        carrier.positionRole !== 'fullback'
      ) {
        x = bx + 12;
        z = target.z;
        duty = 'overlap';
      } else {
        x = Math.min(66, bx - 20);
        z = 34 + ownFlank * 18;
        duty = 'cover';
      }
    } else if (role === 'centralMid' && wideAttack) {
      x = bx - (ownFlank === flank ? 7 : 15);
      z = ownFlank === flank ? 34 + flank * 9 : 34 - flank * 6;
      duty = outside && bx > 68 && ownFlank === flank ? 'cutback' : 'support';
    } else if (tactics.style === 'possession' && ['centralMid', 'fullback'].includes(role)) {
      x = bx - (role === 'fullback' ? 12 : 3);
      z = ball.z + ownFlank * (role === 'fullback' ? 15 : 9);
      duty = 'support';
    }
    if (x !== undefined)
      assignments[actor.player.id] = {
        x:
          direction === 1
            ? clamp(Math.min(x, maxX), 3, 101)
            : 105 - clamp(Math.min(x, maxX), 3, 101),
        z: clamp(z, 4, 64),
        duty,
      };
  }
  return { ...state, assignments };
}

/** A viable receiving point is required; no unconditional crossing instruction. */
export function deliveryOptions(actor, mate, ball, direction) {
  if (actor.setPiece === 'corner') return [{ delivery: 'lofted', lob: true }];
  const bx = localX(ball.x, direction),
    tx = localX(mate.pos.x, direction);
  if (
    actor.isKeeper ||
    mate.isKeeper ||
    bx < 65 ||
    Math.abs(ball.z - 34) < 17 ||
    tx < 76 ||
    Math.abs(mate.pos.z - 34) > 18 ||
    distance(ball, mate.pos) < 8
  )
    return [];
  const options = [
    { delivery: 'lofted', lob: true },
    { delivery: 'low', lob: false },
  ];
  if (bx > 83 && tx < bx - 3) options.push({ delivery: 'cutback', lob: false });
  return options;
}

export function deliveryReceptionRisk(mate, target, opponents, variant) {
  const marker = opponents
    .filter((o) => !o.isKeeper)
    .sort((a, b) => distance(a.pos, target) - distance(b.pos, target))[0];
  if (!marker) return 0;
  const attack = variant.lob
    ? 0.7 * ability(mate.player, 'heading') + 0.3 * ability(mate.player, 'strength')
    : ability(mate.player, 'firstTouch');
  const defence = variant.lob
    ? 0.7 * ability(marker.player, 'heading') + 0.3 * ability(marker.player, 'strength')
    : ability(marker.player, 'anticipation');
  return (
    clamp((3.5 - distance(marker.pos, target)) / 3.5, 0, 1) *
    clamp(0.5 + (defence - attack) * 0.004, 0.2, 0.8)
  );
}

export function deliveryThreat(mate, target, direction, variant, success) {
  const abilityKey = variant.lob ? 'heading' : 'finishing';
  const readiness = (ability(mate.player, abilityKey) + ability(mate.player, 'offTheBall')) / 200;
  return (
    0.12 *
    success *
    (0.4 + 0.6 * readiness) *
    clamp((localX(target.x, direction) - 70) / 20, 0.3, 1)
  );
}

export function tacticalPassValue(
  tactics,
  state,
  variant,
  actor,
  mate,
  ball,
  target,
  direction,
  success,
  space,
) {
  const preset = tacticalPreset(tactics.style),
    forward = (target.x - ball.x) * direction;
  let bonus = preset.pass * success;
  if (variant.delivery) bonus += preset.delivery * success * clamp(space / 4, 0.25, 1);
  if (
    Math.abs(target.z - 34) > 18 &&
    forward > -6 &&
    ['winger', 'wideMid', 'wingBack', 'fullback'].includes(mate.positionRole)
  )
    bonus += preset.flank * success * clamp(space / 5, 0, 1);
  if (tactics.style === 'counter')
    bonus += (state.fastBreak ? 0.09 : 0.015) * success * clamp(forward / 20, -1, 1);
  if (actor.positionRole === 'centreBack' && localX(ball.x, direction) < 35)
    bonus -= (1 - success) * 0.035;
  return clamp(bonus, -0.06, 0.14);
}
