import { clamp } from '../../core/index.mjs';

export const RULES_VERSION = 'IFAB-2026/27-basic-v1';
export const localX = (x, direction) => (direction === 1 ? x : 105 - x);
export function inPenaltyArea(pos, defendingDirection) {
  return (
    localX(pos.x, defendingDirection) <= 16.5 &&
    localX(pos.x, defendingDirection) >= 0 &&
    Math.abs(pos.z - 34) <= 20.16
  );
}
export function offsideSnapshot(actor, actors, ball, direction, restart) {
  if (['corner', 'throwIn', 'goalKick'].includes(restart)) return null;
  const defenders = actors
    .filter((a) => a.side !== actor.side && !a.sentOff)
    .map((a) => localX(a.pos.x, direction))
    .sort((a, b) => b - a);
  const line = Math.max(52.5, localX(ball.x, direction), defenders[1] ?? 0);
  return {
    side: actor.side,
    passer: actor.player.id,
    line,
    direction,
    candidates: actors
      .filter(
        (a) =>
          a.side === actor.side &&
          a !== actor &&
          !a.sentOff &&
          localX(a.pos.x, direction) > line + 0.01,
      )
      .map((a) => a.player.id),
  };
}
export function offsideInvolvement(snapshot, actor) {
  return Boolean(
    snapshot && snapshot.side === actor.side && snapshot.candidates.includes(actor.player.id),
  );
}
export function foulAssessment({ tackling, late, danger, penalty, dogso = false }, roll) {
  const probability = clamp(
    0.18 + 0.12 * late + 0.1 * danger - 0.0015 * (tackling - 50),
    0.03,
    0.55,
  );
  if (roll >= probability) return { foul: false, probability, severity: 'fair', card: null };
  const severity =
    danger >= 0.9 ? 'excessive' : danger >= 0.55 || late >= 0.75 ? 'reckless' : 'careless';
  const card =
    severity === 'excessive' || (dogso && !penalty)
      ? 'red'
      : severity === 'reckless' || dogso
        ? 'yellow'
        : null;
  return { foul: true, probability, severity, card };
}
export function applyCard(actor, card) {
  if (actor.sentOff) return null;
  if (card === 'yellow') actor.yellowCards++;
  if (card === 'red' || actor.yellowCards >= 2) {
    actor.sentOff = true;
    return card === 'red' ? 'red' : 'secondYellow';
  }
  return 'yellow';
}
export function dissentProbability(temperament) {
  return clamp(0.008 * Math.exp((50 - temperament) / 30), 0.0015, 0.04);
}
