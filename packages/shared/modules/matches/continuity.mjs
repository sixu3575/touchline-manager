import { distance } from './spatial.mjs';

export function continuityState() {
  return {
    controller: null,
    controlledAt: 0,
    regainedAt: null,
    side: null,
    phase: 'dead',
    chain: 0,
    metrics: {
      controlledSeconds: [0, 0],
      looseSeconds: 0,
      contestedSeconds: 0,
      deadSeconds: 0,
      flightSeconds: [0, 0],
      chains: [[], []],
      restarts: 0,
      deadCauses: {},
      errors: { forced: 0, unforced: 0, deflected: 0, carryOut: 0, shotOut: 0 },
      turnovers: { interception: 0, miscontrol: 0, dispossessed: 0, looseCarry: 0, out: 0 },
      boxEntries: [0, 0],
    },
    inBox: false,
  };
}
function endChain(s) {
  if (s.side !== null && s.chain) s.metrics.chains[s.side].push(s.chain);
  s.chain = 0;
}
export function controlBall(s, actor, time, pass, opposingPass = false) {
  if (s.side !== null && s.side !== actor.side) {
    s.regainedAt = time;
    endChain(s);
    s.metrics.turnovers[opposingPass ? 'interception' : 'dispossessed']++;
  }
  if (pass) s.chain++;
  s.controller = actor.index;
  s.controlledAt = time;
  s.side = actor.side;
  s.phase = 'controlled';
}
export function releaseControl(s, time, kind) {
  s.controller = null;
  s.phase = kind === 'miscontrol' ? 'loose' : kind === 'shot' ? 'loose' : 'flight';
  if (kind === 'miscontrol') s.metrics.turnovers.miscontrol++;
}
export function deadBall(s, time, reason = 'restart') {
  if (s.phase !== 'dead') {
    s.metrics.restarts++;
    s.metrics.deadCauses[reason] = (s.metrics.deadCauses[reason] ?? 0) + 1;
    if (['throwIn', 'goalKick', 'corner'].includes(reason)) s.metrics.turnovers.out++;
  }
  endChain(s);
  s.controller = null;
  s.side = null;
  s.regainedAt = null;
  s.phase = 'dead';
  s.inBox = false;
}
export function updateContinuity(s, actors, ball, time, active, pending) {
  if (!active) {
    s.metrics.deadSeconds += 0.05;
    return null;
  }
  const a = s.controller === null ? null : actors[s.controller];
  // A short carry remains an intention, but never grants remote contact/kicks.
  const retained =
    a &&
    !a.sentOff &&
    ball.y < 1.3 &&
    distance(a.pos, ball) < 2.6 &&
    (distance(a.pos, ball) < 1.3 ||
      time - s.controlledAt < 1.15 ||
      (a.intent?.kind === 'carry' &&
        a.intent.expiresAt > time &&
        Math.hypot((ball.vx ?? 0) - (a.velocity?.x ?? 0), (ball.vz ?? 0) - (a.velocity?.z ?? 0)) <
          3.5));
  if (retained) {
    s.phase = 'controlled';
    s.metrics.controlledSeconds[a.side] += 0.05;
    const box =
      (a.direction === 1 ? ball.x > 88.5 : ball.x < 16.5) && Math.abs(ball.z - 34) < 20.16;
    if (box && !s.inBox) s.metrics.boxEntries[a.side]++;
    s.inBox = box;
    return a;
  }
  if (a) {
    s.controller = null;
    s.phase = 'loose';
    s.metrics.turnovers.looseCarry++;
  }
  if (pending && time < (pending.expiresAt ?? pending.time + 4)) s.phase = 'flight';
  else {
    const nearby = actors.filter((a) => !a.sentOff && distance(a.pos, ball) < 2.5);
    s.phase = new Set(nearby.map((a) => a.side)).size > 1 ? 'contested' : 'loose';
  }
  if (s.phase === 'flight' && s.side !== null) s.metrics.flightSeconds[s.side] += 0.05;
  else if (s.phase === 'contested') s.metrics.contestedSeconds += 0.05;
  else s.metrics.looseSeconds += 0.05;
  return null;
}
