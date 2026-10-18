// Explicit test preload only. Synthetic coordinates validate UI transport, never match physics.
import { installFixtures } from './install-fixtures.mjs';
import { fixtureReport } from './fixture-report.mjs';
function report(home, away, seed, id, options = {}) {
  const r = fixtureReport(home, away, seed, id, {
    ...options,
    durationSeconds: options.recordReplay === false ? 2 : 60,
  });
  if (!r.replay) return r;
  r.score = [1, 0];
  r.events = [
    { type: 'kickoff', side: 0, minute: 0, second: 0, text: '测试开球' },
    { type: 'goal', side: 0, minute: 1, second: 40, text: '测试进球' },
    { type: 'end', side: 0, minute: 90, second: 60, text: '测试终场' },
  ];
  r.timeline = [
    {
      second: 0,
      stats: r.stats.map((s) => ({
        ...s,
        shots: 0,
        onTarget: 0,
        xg: 0,
        passes: 0,
        completedPasses: 0,
      })),
      performance: [],
    },
  ];
  for (let frame = 0; frame < r.replay.frameCount; frame++) {
    r.replay.players.forEach((p, index) => {
      const group = r.replay.players.filter((q) => q.side === p.side && q.role === p.role);
      const x = { GK: 5, DEF: 27, MID: 49, FWD: 70 }[p.role],
        z = 8 + ((group.findIndex((q) => q.id === p.id) + 0.5) / group.length) * 52;
      r.trajectory[frame * 49 + index * 2] = Math.round(
        (5 + (p.side ? 105 - x : x) + Math.sin(frame / 30 + index)) * 100,
      );
      r.trajectory[frame * 49 + index * 2 + 1] = Math.round((5 + z) * 100);
    });
    r.trajectory[frame * 49 + 44] = Math.round((57.5 + Math.sin(frame / 35) * 15) * 100);
    r.trajectory[frame * 49 + 45] = 11;
    r.trajectory[frame * 49 + 46] = 3900;
    r.trajectory[frame * 49 + 47] = 0;
    r.trajectory[frame * 49 + 48] = 1;
  }
  return r;
}
function* generator(home, away, seed, id, options = {}) {
  const r = report(home, away, seed, id, options);
  if (!r.replay) return r;
  if (!options.checkpoint) {
    const partial = structuredClone(r);
    delete partial.trajectory;
    partial.replay.frameCount = 76;
    partial.replay.duration = 15;
    yield {
      second: 15,
      trajectory: r.trajectory.slice(0, 76 * 49),
      report: partial,
      checkpoint: { tick: 300, frames: new Uint16Array(1), testFixture: true },
    };
  }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  return r;
}
installFixtures(report, generator);
