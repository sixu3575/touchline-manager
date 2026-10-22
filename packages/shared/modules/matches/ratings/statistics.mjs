// Public read-only reducer. Live, archived replay and ratings share this clock gate.
export function playerStatisticsAt(report, playerId, second = Infinity) {
  const modern = report.statisticsVersion === 'opta-conventional-2';
  const player = report.replay?.players?.find((p) => p.id === playerId);
  /** @type {Record<string, number | undefined | null>} */
  const result = {
    goals: 0,
    assists: 0,
    shots: 0,
    onTarget: report.statisticsVersion?.startsWith('opta-conventional-') ? 0 : undefined,
    saves: 0,
    interceptions: 0,
    keyPasses: 0,
    fouls: 0,
    offsides: 0,
  };
  const fields = [
    'passes',
    'completed',
    'tackleAttempts',
    'tackles',
    'wonTackles',
    'failedChallenges',
    'blockedPasses',
    'blocks',
    'clearances',
    'recoveries',
    'takeOnAttempts',
    'takeOns',
    'failedTakeOns',
    'possessionLost',
    'failedPasses',
    'dispossessed',
    'miscontrolLosses',
    'outLosses',
  ];
  for (const key of fields) result[key] = modern ? 0 : undefined;
  const attempts = new Set(),
    outcomes = new Set(),
    deltas = new Set(),
    saves = new Set();
  for (const e of report.events ?? []) {
    const t = e.second ?? e.minute * 60;
    if (!Number.isFinite(t) || t < 0 || t > second || (e.minute ?? t / 60) > 90) continue;
    const own = e.playerId === playerId;
    if (e.type === 'playerStat') {
      if (!modern || !own || deltas.has(e.statId)) continue;
      deltas.add(e.statId);
      for (const [key, amount] of Object.entries(e.changes ?? {}))
        if ([...fields, 'saves', 'interceptions'].includes(key) && Number.isFinite(amount))
          result[key] += amount;
    } else if (e.type === 'shot' && own) {
      if (e.shotId === undefined || !attempts.has(e.shotId)) result.shots++;
      if (e.shotId !== undefined) attempts.add(e.shotId);
    } else if (e.type === 'shotOutcome') {
      const key = e.shotId ?? e;
      if (outcomes.has(key)) continue;
      outcomes.add(key);
      if (own && typeof e.onTarget === 'boolean')
        result.onTarget = (result.onTarget ?? 0) + Number(e.onTarget);
      if (
        e.keyPassId === playerId &&
        e.outcome !== 'goal' &&
        (!player || e.side === player.side) &&
        !own
      )
        result.keyPasses++;
    } else if (e.type === 'goal' && !e.ownGoal) {
      if (own) result.goals++;
      if (e.assistId === playerId && !own && (!player || e.side === player.side)) result.assists++;
    } else if (own) {
      if (e.type === 'foul') result.fouls++;
      if (e.type === 'offside') result.offsides++;
      if (!modern && e.type === 'interception') result.interceptions++;
      if (!modern && e.type === 'save' && !saves.has(e.shotId ?? e)) {
        saves.add(e.shotId ?? e);
        result.saves++;
      }
    }
  }
  if (!modern) {
    const duration = report.replay?.regulationDuration ?? report.replay?.duration ?? 5400;
    const rows =
      second >= duration
        ? report.performance
        : report.timeline?.filter((p) => p.second <= second).at(-1)?.performance;
    const p = rows?.find((p) => p.id === playerId);
    for (const key of ['passes', 'completed', 'tackles', 'wonTackles']) result[key] = p?.[key];
    result.tackleAttempts = result.tackles;
  }
  result.passCompletion = result.passes
    ? Math.round((100 * result.completed) / result.passes)
    : null;
  return result;
}
