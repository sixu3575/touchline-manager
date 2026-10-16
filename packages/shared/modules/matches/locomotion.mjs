import { clamp } from '../../core/index.mjs';
import { ability } from './skills.mjs';
import { distance } from './spatial.mjs';

export function movement(p, energy, mode = 'sprint') {
  if (!p.matchState)
    p = {
      ...p,
      matchState: { energy: energy ?? 100, morale: 50, confidence: 50, adaptation: 100 },
    };
  const pace = ability(p, 'sprintSpeed'),
    top = 5.7 + 0.036 * pace;
  const speeds = {
    walk: 1.5,
    jog: 2.7 + 0.014 * pace,
    run: 4.3 + 0.022 * pace,
    sprint: top,
    carry: top * (0.6 + 0.002 * ability(p, 'dribbling')),
  };
  return {
    speed: speeds[mode] ?? speeds.run,
    topSpeed: top,
    acceleration: 2.4 + 0.035 * ability(p, 'acceleration'),
    response: 0.55 + 0.0045 * ability(p, 'agility'),
    braking: 4 + 0.04 * ability(p, 'balance'),
  };
}
export function movementMode(actor, ball, owner, roles, gap) {
  if (gap < 1.2) return 'walk';
  if (actor === owner) return 'carry';
  const chasing = roles.chasers.includes(actor.index);
  if (roles.receiverId === actor.player.id) return distance(actor.pos, ball) > 5 ? 'sprint' : 'run';
  if (chasing) return distance(actor.pos, ball) > 7 ? 'sprint' : 'run';
  if (roles.runnerId === actor.player.id && owner?.side === actor.side) return 'sprint';
  return gap > 18 ? 'run' : 'jog';
}
