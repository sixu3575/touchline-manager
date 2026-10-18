// Presentation only. Never changes simulation inputs, RNG, physics or match time.
export const LIVE_SPEED = 5;
export const FRAME_BUFFER_SECONDS = 10;
export const newBroadcast = () => ({ speed: LIVE_SPEED, anchorAt: null, anchorSecond: 0 });

export function broadcastAt(progress, now) {
  const clock = progress.broadcast;
  if (!clock) return null; // Published historical jobs retain their original contract.
  const available = progress.generatedSeconds ?? 0;
  let next = clock,
    seconds = clock.anchorSecond;
  if (clock.anchorAt === null && available > 0) next = { ...clock, anchorAt: now };
  if (next.anchorAt !== null) {
    seconds = Math.max(
      next.anchorSecond,
      next.anchorSecond + ((now - next.anchorAt) / 1000) * LIVE_SPEED,
    );
    if (seconds > available) {
      seconds = available;
      // A real buffer underrun pauses the public clock, including while nobody watches.
      next = { ...next, anchorAt: now, anchorSecond: seconds };
    }
  }
  const finished = Boolean(progress.ownComplete && seconds >= available);
  return {
    clock: next,
    changed: next !== clock,
    public: {
      speed: LIVE_SPEED,
      seconds,
      serverNow: now,
      started: next.anchorAt !== null,
      finished,
      buffering: !progress.ownComplete && seconds >= available,
    },
  };
}

export function liveReport(report, broadcast) {
  if (!report) return undefined;
  if (broadcast.finished) return report;
  const second = broadcast.seconds;
  const events = report.events.filter((e) => (e.second ?? e.minute * 60) <= second);
  // Bounded live payload. Preserve goals/cards even when ordinary touches roll out.
  const tail = Math.max(0, events.length - 120);
  const visibleEvents = events.filter(
    (e, i) => i >= tail || ['goal', 'redCard', 'yellowCard', 'penaltyGoal'].includes(e.type),
  );
  const prefix = report.timeline?.filter((p) => p.second <= second).at(-1);
  const stats =
    prefix?.stats ??
    report.stats.map((row) =>
      Object.fromEntries(Object.keys(row).map((key) => [key, key === 'possession' ? 50 : 0])),
    );
  const duration = Math.min(report.replay.duration, second + FRAME_BUFFER_SECONDS);
  const frameCount = Math.min(
    report.replay.frameCount,
    Math.floor(duration * report.replay.sampleHz) + 1,
  );
  return {
    id: report.id,
    seed: report.seed,
    engineVersion: report.engineVersion,
    parameterVersion: report.parameterVersion,
    rulesVersion: report.rulesVersion,
    eventFormatVersion: report.eventFormatVersion,
    testFixture: report.testFixture,
    homeId: report.homeId,
    awayId: report.awayId,
    homeName: report.homeName,
    awayName: report.awayName,
    competition: report.competition,
    round: report.round,
    score: [0, 1].map((side) => events.filter((e) => e.type === 'goal' && e.side === side).length),
    events: visibleEvents,
    stats,
    performance: prefix?.performance ?? [],
    timeline: prefix ? [prefix] : [],
    snapshots: report.snapshots.map((s) => ({
      id: s.id,
      name: s.name,
      tactics: s.tactics,
      players: [],
    })),
    replay: {
      ...report.replay,
      frameCount,
      duration: Math.max(0, (frameCount - 1) / report.replay.sampleHz),
    },
  };
}
