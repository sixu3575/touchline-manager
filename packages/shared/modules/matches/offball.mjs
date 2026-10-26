import { clamp, random, seedFrom } from '../../core/index.mjs';
import { ability } from './skills.mjs';
import { arrivalTime } from './arrival.mjs';
import { distance, unit, localX, segmentPoint } from './spatial.mjs';

// Each actor owns serializable perception/plan memory. No wall clock/global RNG.
export function markingTarget(marker, threat, ball, direction, time) {
  let memory = marker.markMemory;
  if (!memory || memory.id !== threat.player.id) {
    memory = marker.markMemory = {
      id: threat.player.id,
      pos: { ...threat.pos },
      velocity: { ...threat.velocity },
      seenAt: time,
      nextAt: time,
      checkAt: time,
      ball: { x: ball.x, z: ball.z },
      checks: 0,
    };
  }
  if (time >= memory.nextAt) {
    const a = (key) => ability(marker.player, key);
    const focus =
      (a('marking') +
        a('anticipation') +
        a('concentration') +
        a('decisions') +
        a('teamwork')) /
      5;
    const cunning = (ability(threat.player, 'offTheBall') + ability(threat.player, 'agility')) / 2;
    const speed = Math.hypot(threat.velocity.x, threat.velocity.z);
    const change = Math.hypot(
      threat.velocity.x - memory.velocity.x,
      threat.velocity.z - memory.velocity.z,
    );
    const distracted = distance(ball, memory.ball) > 7;
    const chance = clamp(
      0.012 + (cunning - focus) * 0.00065 + (1 - (marker.energy ?? 100) / 100) * 0.025,
      0.003,
      0.07,
    );
    const eligible = time >= memory.checkAt && speed > 2 && (change > 1.8 || distracted);
    const rng = random(
      seedFrom(`${marker.player.id}:${marker.bias}:${memory.checks++}:${Math.round(time * 20)}`),
    );
    if (eligible) memory.checkAt = time + 2.5;
    if (eligible && rng() < chance) {
      // Follow the last observation briefly. Body still brakes/turns normally;
      // a lapse creates an opportunity, never an automatic completed pass/goal.
      memory.nextAt = time + 0.35 + (100 - focus) * 0.006;
      marker.markLapses = (marker.markLapses ?? 0) + 1;
    } else {
      memory.pos = { ...threat.pos };
      memory.velocity = { ...threat.velocity };
      memory.ball = { x: ball.x, z: ball.z };
      memory.seenAt = time;
      memory.nextAt = time + 0.16 + (100 - focus) * 0.004;
    }
  }
  const lead = Math.min(
    0.9,
    time -
      memory.seenAt +
      0.1 +
      ability(marker.player, 'anticipation') * 0.0012 +
      ability(marker.player, 'decisions') * 0.0008,
  );
  const stand = 0.9 + (100 - ability(marker.player, 'marking')) * 0.012;
  return {
    x: clamp(memory.pos.x - direction * stand + memory.velocity.x * lead, 1, 104),
    z: clamp(memory.pos.z + memory.velocity.z * lead, 2, 66),
  };
}

export function supportTarget(actor, base, actors, ball, direction, time, duty = 'support') {
  if (['cover'].includes(duty)) return base;
  const old = actor.offBallPlan;
  if (old && old.duty === duty && time < old.until && distance(old.ball, ball) < 6)
    return old.target;
  const judgement =
    (ability(actor.player, 'offTheBall') + ability(actor.player, 'decisions')) / 200;
  const opponents = actors.filter((o) => o.side !== actor.side && !o.sentOff);
  const mates = actors.filter((o) => o.side === actor.side && o !== actor && !o.sentOff);
  const line = opponents.map((o) => localX(o.pos.x, direction)).sort((a, b) => b - a)[1] ?? 100;
  const cap = Math.max(52.5, localX(ball.x, direction), line) - 0.7;
  let best,
    score = -Infinity;
  for (const [dx, dz] of [
    [0, 0],
    [-3, -4],
    [-3, 4],
    [3, -4],
    [3, 4],
    [0, -6],
    [0, 6],
  ]) {
    const x = clamp(Math.min(localX(base.x, direction) + dx, cap), 3, 101);
    const point = { x: direction === 1 ? x : 105 - x, z: clamp(base.z + dz, 4, 64) };
    // Preserve flank width and distinct near/far post responsibilities.
    if (duty === 'width' && Math.abs(point.z - 34) < Math.abs(base.z - 34) - 3) continue;
    if (['nearPost', 'farPost'].includes(duty) && Math.abs(point.z - base.z) > 4) continue;
    const travel = arrivalTime(
      actor,
      point,
      ['break', 'overlap', 'run', 'nearPost', 'farPost'].includes(duty) ? 'sprint' : 'run',
    );
    let space = 10,
      blocked = 0,
      edge = 2;
    for (const o of opponents) {
      const predicted = {
        x: o.pos.x + (o.velocity?.x ?? 0) * 0.4,
        z: o.pos.z + (o.velocity?.z ?? 0) * 0.4,
      };
      space = Math.min(space, distance(point, predicted));
      const lane = segmentPoint(ball, point, predicted);
      if (lane.t > 0.08 && lane.t < 0.92)
        blocked = Math.max(blocked, clamp((2.4 - lane.gap) / 2.4, 0, 1));
      if (distance(o.pos, point) < 16) edge = Math.min(edge, arrivalTime(o, point) - travel);
    }
    const crowd = mates.reduce((v, m) => v + clamp((3 - distance(m.pos, point)) / 3, 0, 1), 0);
    const value =
      judgement * (Math.min(7, space) * 0.5 - blocked * 3 + clamp(edge, -2, 2) * 0.6) -
      distance(point, base) * 0.14 -
      travel * 0.13 -
      crowd * 2;
    if (value > score) {
      best = point;
      score = value;
    }
  }
  const accuracy =
    (100 - (ability(actor.player, 'offTheBall') + ability(actor.player, 'teamwork')) / 2) / 40;
  best = best ?? base;
  best = {
    x: clamp(best.x + (actor.bias ?? 0) * accuracy, 3, 102),
    z: clamp(best.z + (actor.bias ?? 0) * accuracy, 3, 65),
  };
  actor.offBallPlan = {
    duty,
    target: best,
    ball: { x: ball.x, z: ball.z },
    until: time + 0.8 + ability(actor.player, 'teamwork') * 0.008,
  };
  return best;
}
