// Read-only presentation of the engine's confirmed attribution events. Never
// infer an assist from the last touch or count an unresolved shot as on target.
export function playerEventStatistics(report, playerId, second) {
  const player = report.replay?.players.find((p) => p.id === playerId);
  const result = {
    goals: 0,
    assists: 0,
    shots: 0,
    onTarget: report.statisticsVersion === 'opta-conventional-1' ? 0 : undefined,
    saves: 0,
    interceptions: 0,
    keyPasses: 0,
    fouls: 0,
    offsides: 0,
  };
  const attempts = new Set(),
    outcomes = new Set();
  for (const event of report.events ?? []) {
    const at = event.second ?? event.minute * 60;
    if (!Number.isFinite(at) || at < 0 || at > second || (event.minute ?? at / 60) > 90) continue;
    const own = event.playerId === playerId;
    if (event.type === 'shot' && own) {
      if (event.shotId === undefined || !attempts.has(event.shotId)) result.shots++;
      if (event.shotId !== undefined) attempts.add(event.shotId);
    } else if (event.type === 'shotOutcome') {
      const key = event.shotId ?? event;
      if (outcomes.has(key)) continue;
      outcomes.add(key);
      if (own && typeof event.onTarget === 'boolean')
        result.onTarget = (result.onTarget ?? 0) + Number(event.onTarget);
      if (
        event.keyPassId === playerId &&
        event.outcome !== 'goal' &&
        (!player || event.side === player.side) &&
        !own
      )
        result.keyPasses++;
    } else if (event.type === 'goal' && !event.ownGoal) {
      if (own) result.goals++;
      if (event.assistId === playerId && !own && (!player || event.side === player.side))
        result.assists++;
    } else if (own) {
      const field = {
        save: 'saves',
        interception: 'interceptions',
        foul: 'fouls',
        offside: 'offsides',
      }[event.type];
      if (field) result[field]++;
    }
  }
  return result;
}
