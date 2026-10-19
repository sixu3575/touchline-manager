export function staminaAtTime(report, playerId, second, currentOnly = false) {
  const initial = (report.snapshots ?? [])
    .flatMap((snapshot, side) => (snapshot.players ?? []).map((player) => ({ ...player, side })))
    .find((player) => player.id === playerId);
  const entries = [
    ...(Number.isFinite(initial?.fitness)
      ? [{ second: 0, energy: initial.fitness, burstReserve: 100 }]
      : []),
    ...(report.timeline ?? []).flatMap((row) => {
      const performance = row.performance?.find((item) => item.id === playerId);
      return performance ? [{ second: row.second, ...performance }] : [];
    }),
    ...(report.replay && report.performance
      ? report.performance
          .filter((item) => item.id === playerId)
          .map((item) => ({ second: report.replay.duration, ...item }))
      : []),
  ]
    .filter((row) => Number.isFinite(row.energy))
    .sort((a, b) => a.second - b.second);
  const previous = entries.filter((row) => row.second <= second).at(-1);
  if (!previous) return currentOnly ? undefined : entries[0];
  if (currentOnly) return previous;
  const next = entries.find((row) => row.second > second);
  if (!next || next.second <= previous.second) return previous;
  const fraction = Math.max(
    0,
    Math.min(1, (second - previous.second) / (next.second - previous.second)),
  );
  const result = {
    energy: previous.energy + (next.energy - previous.energy) * fraction,
  };
  if (Number.isFinite(previous.burstReserve) && Number.isFinite(next.burstReserve))
    result.burstReserve =
      previous.burstReserve + (next.burstReserve - previous.burstReserve) * fraction;
  return result;
}
