import {
  createPhysics,
  createBody,
  orientFoot,
  kick,
  stepPhysics,
  STEP,
} from '../../packages/shared/modules/matches/physics.mjs';
import { movement } from '../../packages/shared/modules/matches/locomotion.mjs';
import { createGame, simulate } from '../../packages/shared/game.mjs';
const duration = Number(
  process.argv.find((v) => v.startsWith('--duration='))?.split('=')[1] ?? 180,
);
const out = { duration, running: [], rolling: [], flying: null, drop: null, matches: [] };
for (const attribute of [1, 20, 50, 80, 100]) {
  const player = {
    attributes: {
      sprintSpeed: attribute,
      acceleration: attribute,
      agility: attribute,
      balance: attribute,
    },
  };
  out.running.push({ attribute, fresh: movement(player, 100), tired: movement(player, 20) });
}
for (const speed of [3, 8, 16]) {
  const p = createPhysics(),
    a = createBody(p, 180, 50, 10, 15);
  p.ball.setTranslation({ x: 10.65, y: 0.12, z: 15 }, true);
  orientFoot(a, p.ball.translation());
  kick(p, a, { x: speed, y: 0.08, z: 0 });
  let stop = null;
  const samples = [];
  for (let i = 1; i <= 600; i++) {
    stepPhysics(p);
    const v = p.ball.linvel(),
      pos = p.ball.translation();
    const s = Math.hypot(v.x, v.z);
    if ([10, 20, 40, 80].includes(i))
      samples.push({ t: i * STEP, v: s, x: pos.x - 10.65, y: pos.y });
    if (s < 0.05 && i > 2) {
      stop = { t: i * STEP, distance: pos.x - 10.65, spin: p.ball.angvel() };
      break;
    }
    if (pos.x > 109) break;
  }
  out.rolling.push({ launch: speed, samples, stop });
  p.world.free();
}
{
  const p = createPhysics();
  p.ball.setTranslation({ x: 10, y: 8, z: 34 }, true);
  p.ball.setLinvel({ x: 30, y: 0, z: 0 }, true);
  for (let i = 0; i < 20; i++) stepPhysics(p);
  out.flying = { afterOneSecond: p.ball.linvel(), position: p.ball.translation() };
  p.world.free();
}
{
  const p = createPhysics();
  p.ball.setTranslation({ x: 50, y: 2.11, z: 34 }, true);
  let touched = false,
    peak = 0;
  for (let i = 0; i < 100; i++) {
    stepPhysics(p);
    const pos = p.ball.translation();
    if (p.ball.linvel().y > 0.5) touched = true;
    if (touched) peak = Math.max(peak, pos.y - 0.11);
  }
  out.drop = { reboundHeight: peak, finalVelocity: p.ball.linvel(), finalSpin: p.ball.angvel() };
  p.world.free();
}
const selected = process.argv.find((v) => v.startsWith('--seed='));
if (!process.argv.includes('--isolated'))
  for (const seed of selected ? [Number(selected.split('=')[1])] : [42, 2026, 77]) {
    const g = createGame('运动核对', seed);
    const r = simulate(g.clubs[0], g.clubs[1], seed, `speed-${seed}`, {
      durationSeconds: duration,
    });
    let playerMax = 0,
      ballMax = 0,
      fastPlayers = 0,
      fastBalls = 0;
    const samples = [],
      stride = r.replay.stride;
    for (let frame = 1; frame < r.replay.frameCount; frame++) {
      const i = frame * stride,
        prev = i - stride;
      if (r.trajectory[i + 47] || r.trajectory[prev + 47]) continue;
      const speed = (x, z, y) =>
        Math.hypot(
          ...[x, z, y]
            .filter((v) => v !== undefined)
            .map((k) => (r.trajectory[i + k] - r.trajectory[prev + k]) / 100),
        ) * 5;
      for (let j = 0; j < 44; j += 2) {
        const v = speed(j, j + 1);
        playerMax = Math.max(playerMax, v);
        if (v > 10.5) fastPlayers++;
      }
      const v = speed(44, 46, 45);
      ballMax = Math.max(ballMax, v);
      if (v > 40) {
        fastBalls++;
        if (samples.length < 5) samples.push({ frame, v });
      }
    }
    out.matches.push({
      seed,
      score: r.score,
      stats: r.stats,
      playerMax,
      ballMax,
      fastPlayers,
      fastBalls,
      samples,
      reportedMax: Math.max(...r.performance.map((p) => p.maxSpeed ?? 0)),
      motion: r.motion,
    });
  }
console.log(JSON.stringify(out, null, 2));
