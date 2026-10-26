/**
 * @typedef {import('../../model').Report['replay']['players'][number]} ReplayPlayer
 * @param {ReplayPlayer[]} players
 * @param {import('../../model').MatchEvent[]} events
 * @param {number} second
 * @returns {ReplayPlayer[]}
 */
export function replayPlayersAt(players, events, second) {
  const current = players.map((player) => ({ ...player }));
  for (const event of events) {
    if (
      event.type === 'tacticalChange' &&
      (event.second ?? event.minute * 60) <= second &&
      Array.isArray(event.assignments)
    ) {
      for (const assignment of event.assignments) {
        const player = current[assignment.slotIndex];
        if (player && player.side === event.side)
          current[assignment.slotIndex] = {
            ...player,
            tacticalRole: assignment.role,
            positionRole: assignment.positionRole,
          };
      }
    }
    if (
      event.type !== 'substitution' ||
      (event.second ?? event.minute * 60) > second ||
      !Number.isInteger(event.slotIndex) ||
      !event.incoming ||
      event.slotIndex < 0 ||
      event.slotIndex >= current.length
    )
      continue;
    current[event.slotIndex] = {
      ...current[event.slotIndex],
      ...event.incoming,
      side: event.side,
    };
  }
  return current;
}
