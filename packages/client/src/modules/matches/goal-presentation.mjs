/** @param {import('../../model').Report} report @param {number} time */
export function latestGoal(report, time) {
  for (let i = report.events.length - 1; i >= 0; i--) {
    const event = report.events[i];
    if (['goal', 'penaltyGoal'].includes(event.type) && (event.second ?? event.minute * 60) <= time)
      return event;
  }
  return null;
}

/** @param {import('../../model').Report} report @param {import('../../model').MatchEvent} event */
export function goalDetails(report, event) {
  const saved =
    report.replay?.players.find((player) => player.id === event.playerId) ??
    report.snapshots.flatMap((team) => team.players).find((player) => player.id === event.playerId);
  const scorer = event.scorer ?? saved;
  const ownGoal = Boolean(event.ownGoal);
  const penalty = event.type === 'penaltyGoal';
  const second = event.second ?? event.minute * 60;
  const score = penalty
    ? event.penalties
    : (event.score ??
      [0, 1].map(
        (side) =>
          report.events.filter(
            (row) =>
              row.type === 'goal' && row.side === side && (row.second ?? row.minute * 60) <= second,
          ).length,
      ));
  return {
    key: `${report.id}:${event.type}:${event.second ?? event.minute * 60}:${event.playerId ?? event.scorer?.id ?? ''}`,
    second: event.second ?? event.minute * 60,
    title: penalty ? '点球罚进' : ownGoal ? '乌龙球' : '进球！',
    team: event.side === 0 ? report.homeName : report.awayName,
    name: scorer?.name ?? (ownGoal ? '对方球员' : '进球球员'),
    number: scorer?.number ?? null,
    score: score ? score.join(' : ') : null,
    text: event.text,
  };
}
