import {
  ENGINE_VERSION,
  PARAMETER_VERSION,
} from '../../packages/shared/modules/matches/simulation.mjs';
// Test data only: no physical world, trajectory integration or match decisions.
// Settlement, HTTP, SQLite and worker orchestration continue to use production code.
export function fixtureReport(home, away, seed, id = 'fixture', options = {}) {
  const duration = options.durationSeconds ?? 2;
  const count = Math.round(duration * 5) + 1;
  const sides = [home, away];
  const score = [Math.abs(seed) % 3, Math.floor(Math.abs(seed) / 3) % 3];
  const events = [{ type: 'kickoff', second: 0, minute: 0, side: 0, text: '受控测试数据' }];
  for (const side of [0, 1])
    for (let i = 0; i < score[side]; i++)
      events.push({
        type: 'goal',
        second: 1,
        minute: 1,
        side,
        playerId: sides[side].lineup[10],
        text: '受控进球数据',
      });
  events.push({ type: 'end', second: duration, minute: 90, side: 0, text: '受控报告结束' });
  const report = {
    id,
    seed,
    testFixture: true,
    engineVersion: ENGINE_VERSION,
    parameterVersion: PARAMETER_VERSION,
    rulesVersion: 'test-fixture',
    eventFormatVersion: 3,
    homeId: home.id,
    awayId: away.id,
    homeName: home.name,
    awayName: away.name,
    score,
    events,
    ...(options.knockout && score[0] === score[1] ? { penalties: [4, 3] } : {}),
    stats: sides.map((_, side) => ({
      possession: 50,
      passes: 10,
      completedPasses: 8,
      shots: score[side] + 1,
      onTarget: score[side],
      xg: 0.2,
      fouls: 0,
      offsides: 0,
    })),
    snapshots: sides.map((c) => ({
      id: c.id,
      name: c.name,
      tactics: structuredClone(c.tactics),
      players: structuredClone(c.lineup.map((id) => c.players.find((p) => p.id === id))),
    })),
    performance: sides.flatMap((c, side) =>
      c.lineup.map((id) => {
        const p = c.players.find((p) => p.id === id);
        return {
          id,
          side,
          energy: Math.max(20, p.fitness - 12),
          mind: { morale: p.wellbeing.morale, confidence: p.wellbeing.confidence },
        };
      }),
    ),
  };
  if (options.recordReplay !== false) {
    report.trajectory = new Uint16Array(count * 49);
    for (let i = 0; i < count; i++) report.trajectory[i * 49] = i;
    report.replay = {
      format: 'positions-u16-v1',
      sampleHz: 5,
      stride: 49,
      frameCount: count,
      duration,
      regulationDuration: duration,
      clockScale: 1,
      physics: 'TEST FIXTURE — no physics',
      stepHz: 20,
      players: sides.flatMap((c, side) => c.lineup.map((id) => ({ id, side }))),
    };
  }
  return report;
}

export function* fixtureGenerator(home, away, seed, id, options = {}) {
  const report = fixtureReport(home, away, seed, id, options);
  if (options.recordReplay === false) return report;
  if (!options.checkpoint) {
    const middle = Math.max(1, Math.floor(report.replay.frameCount / 2));
    const partial = structuredClone(report);
    delete partial.trajectory;
    partial.replay.frameCount = middle;
    partial.replay.duration = (middle - 1) / 5;
    yield {
      second: partial.replay.duration,
      trajectory: report.trajectory.slice(0, middle * 49),
      report: partial,
      checkpoint: {
        tick: Math.round(partial.replay.duration * 20),
        testFixture: true,
        frames: new Uint16Array(1),
      },
    };
  }
  // Only the isolated test worker waits, giving HTTP tests a deterministic restart window.
  // There is no sleep in business settlement and no production flag enabling this code.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  return report;
}
