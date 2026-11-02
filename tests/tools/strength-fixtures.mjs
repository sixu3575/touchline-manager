import { createGame } from '../../packages/shared/game.mjs';
import { bestLineup } from '../../packages/shared/modules/tactics/index.mjs';
import { rating, skillSummary } from '../../packages/shared/modules/players/index.mjs';

export function lineupAbility(club) {
  return (
    club.lineup.reduce((sum, id) => sum + rating(club.players.find((p) => p.id === id)), 0) /
    club.lineup.length
  );
}

// Synthetic diagnosis only: preserve generated specialisms and integer skills.
// This is not a player migration, a FIFA-ranking conversion, or a match handicap.
export function strengthTeam(worldSeed, clubIndex, target, tactics) {
  const club = createGame('强弱对抗诊断', worldSeed).clubs[clubIndex];
  const source = club.players.map((p) => p.attributes);
  const shifted = (index, delta) =>
    Object.fromEntries(
      Object.entries(source[index]).map(([key, value]) => [
        key,
        Math.max(1, Math.min(100, Math.round(value + delta))),
      ]),
    );
  let best;
  for (let delta = -40; delta <= 60; delta++) {
    const sample = {
      ...club,
      tactics,
      players: club.players.map((p, index) => ({ ...p, attributes: shifted(index, delta) })),
    };
    const ids = bestLineup(sample);
    const mean =
      ids.reduce((sum, id) => sum + rating(sample.players.find((p) => p.id === id)), 0) / 11;
    if (!best || Math.abs(mean - target) < best.error)
      best = { error: Math.abs(mean - target), delta };
  }
  club.players.forEach((p, index) => {
    p.attributes = shifted(index, best.delta);
    p.skills = skillSummary(p.attributes);
  });
  club.tactics = { ...tactics };
  club.lineup = bestLineup(club);
  return club;
}
