/** @typedef {import('./useMatchJob').MatchJob} MatchJob */

/** @param {MatchJob} job @param {number} [now] */
export function liveSecond(job, now = performance.now()) {
  const clock = job.broadcast;
  if (!clock) return 0;
  return (
    clock.seconds +
    (clock.started && !clock.finished && !clock.buffering
      ? (Math.max(0, now - (job.receivedAt ?? now)) / 1000) * clock.speed
      : 0)
  );
}

/**
 * Presentation only. A report/frame download must never rewind an SSE clock.
 * Record receipt when the clock message arrives, not when its frames finish loading.
 * @param {MatchJob | null} previous
 * @param {MatchJob} incoming
 * @param {number} [receivedAt]
 * @returns {MatchJob}
 */
export function mergeLiveJob(previous, incoming, receivedAt = performance.now()) {
  if (!previous || previous.id !== incoming.id) return { ...incoming, receivedAt };
  const merged = { ...previous, ...incoming, receivedAt };
  if (!previous.broadcast) return merged;
  const before = previous.broadcast,
    next = incoming.broadcast;
  if (!next || next.serverNow < before.serverNow) {
    // Keep fresh state/clock, while accepting the downloaded report and its frame metadata.
    return {
      ...merged,
      broadcast: before,
      receivedAt: previous.receivedAt,
      status: previous.status,
      error: previous.error,
      ownComplete: previous.ownComplete,
    };
  }
  if (
    before.started &&
    !before.buffering &&
    !before.finished &&
    next.started &&
    !next.buffering &&
    !next.finished
  ) {
    // Network jitter can delay a newer sample. Keep the continuous 5× lower bound
    // rather than clamp the display until that delayed sample catches up.
    merged.broadcast = {
      ...next,
      seconds: Math.max(next.seconds, liveSecond(previous, receivedAt)),
    };
  }
  return merged;
}
