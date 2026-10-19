import { distance } from './spatial.mjs';

export const CARRY_CONTROL_RECOVERY_GRACE_SECONDS = 0.75;

export function continuityState() {
  return {
    controller: null,
    lastController: null,
    lastHeldAt: -Infinity,
    teamUntil: 0,
    possessionAt: null,
    released: null,
    controlledAt: 0,
    regainedAt: null,
    side: null,
    lastTeam: null,
    phase: 'dead',
    chain: 0,
    controlPlayerId: null,
    controlSide: null,
    controlRole: null,
    controlStartedAt: null,
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
      possessions: [],
      controlSpells: [],
    },
    inBox: false,
  };
}
function endPossession(s, time, reason) {
  if (s.possessionAt !== null)
    s.metrics.possessions.push({
      side: s.side,
      start: s.possessionAt,
      end: time,
      seconds: Math.max(0, time - s.possessionAt),
      reason,
    });
  s.possessionAt = null;
}
function endControlSpell(s, time, reason, details = {}) {
  if (s.controlStartedAt == null || !s.controlPlayerId) return;
  (s.metrics.controlSpells ??= []).push({
    side: s.controlSide,
    playerId: s.controlPlayerId,
    role: s.controlRole,
    start: s.controlStartedAt,
    end: time,
    seconds: Math.max(0, time - s.controlStartedAt),
    reason,
    ...details,
  });
  s.controlPlayerId = null;
  s.controlSide = null;
  s.controlRole = null;
  s.controlStartedAt = null;
}
// A player's short independent touch may be contestable even after losing a
// controller. This confers neither possession nor remote kicking permission.
export function contestOwner(s, actors, ball, time) {
  const actor = actors[s.controller ?? s.lastController];
  if (!actor || actor.sentOff || ball.y > 1.3 || distance(actor.pos, ball) > 2.6) return null;
  if (s.controller !== null) return actor;
  return !s.released && time - s.lastHeldAt < 0.65 ? actor : null;
}
function endChain(s) {
  if (s.side !== null && s.chain) s.metrics.chains[s.side].push(s.chain);
  s.chain = 0;
}
export function controlBall(s, actor, time, pass, opposingPass = false) {
  if (s.controlPlayerId && s.controlPlayerId !== actor.player.id)
    endControlSpell(s, time, s.controlSide === actor.side ? 'handoff' : 'dispossessed');
  if ((s.side ?? s.lastTeam) !== null && (s.side ?? s.lastTeam) !== actor.side) {
    endPossession(s, time, opposingPass ? 'interception' : 'dispossessed');
    s.regainedAt = time;
    endChain(s);
    s.metrics.turnovers[opposingPass ? 'interception' : 'dispossessed']++;
  }
  if (s.possessionAt === null) s.possessionAt = time;
  if (pass) s.chain++;
  s.controller = actor.index;
  s.lastController = actor.index;
  s.lastHeldAt = time;
  s.teamUntil = time + 2.5;
  s.released = null;
  s.controlledAt = time;
  s.side = actor.side;
  s.lastTeam = actor.side;
  s.phase = 'controlled';
  if (s.controlStartedAt == null) {
    s.controlPlayerId = actor.player.id;
    s.controlSide = actor.side;
    s.controlRole = actor.positionRole ?? actor.player.role;
    s.controlStartedAt = time;
  }
}
export function releaseControl(s, time, kind) {
  endControlSpell(s, time, kind);
  s.released = kind;
  s.teamUntil = time + (kind === 'shot' ? 0.6 : 3);
  s.controller = null;
  s.phase = kind === 'miscontrol' ? 'loose' : kind === 'shot' ? 'loose' : 'flight';
  if (kind === 'miscontrol') s.metrics.turnovers.miscontrol++;
}
export function deadBall(s, time, reason = 'restart') {
  endControlSpell(s, time, reason);
  endPossession(s, time, reason);
  if (s.phase !== 'dead') {
    s.metrics.restarts++;
    s.metrics.deadCauses[reason] = (s.metrics.deadCauses[reason] ?? 0) + 1;
    if (['throwIn', 'goalKick', 'corner'].includes(reason)) s.metrics.turnovers.out++;
  }
  endChain(s);
  s.controller = null;
  s.lastController = null;
  s.released = null;
  s.teamUntil = 0;
  s.side = null;
  s.lastTeam = null;
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
  const separation = a ? distance(a.pos, ball) : Infinity;
  const mode = a?.intent?.mode;
  const controlRadius = mode === 'carryFast' ? 4.2 : 2.6;
  const relativeSpeed = a
    ? Math.hypot(
        (ball.vx ?? 0) - (a.velocity?.x ?? 0),
        (ball.vz ?? 0) - (a.velocity?.z ?? 0),
      )
    : Infinity;
  const relativeSpeedLimit = mode === 'carryFast' ? 4.5 : 3.5;
  const carryIntentWithinGrace =
    a?.intent?.kind === 'carry' &&
    Number.isFinite(a.intent.expiresAt) &&
    time < a.intent.expiresAt + CARRY_CONTROL_RECOVERY_GRACE_SECONDS;
  // A short carry remains an intention, but never grants remote contact/kicks.
  const retained =
    a &&
    !a.sentOff &&
    ball.y < 1.3 &&
    separation < controlRadius &&
    (distance(a.pos, ball) < 1.3 ||
      time - s.controlledAt < 1.15 ||
      (carryIntentWithinGrace && relativeSpeed < relativeSpeedLimit));
  if (retained) {
    s.lastHeldAt = time;
    s.teamUntil = time + 2.5;
    s.phase = 'controlled';
    s.metrics.controlledSeconds[a.side] += 0.05;
    const box =
      (a.direction === 1 ? ball.x > 88.5 : ball.x < 16.5) && Math.abs(ball.z - 34) < 20.16;
    if (box && !s.inBox) s.metrics.boxEntries[a.side]++;
    s.inBox = box;
    return a;
  }
  if (a) {
    const looseCarryCause =
      ball.y >= 1.3
        ? 'airborne'
        : separation >= controlRadius
          ? 'outsideRadius'
          : relativeSpeed >= relativeSpeedLimit
            ? 'relativeSpeed'
            : a.intent?.kind === 'carry' && !carryIntentWithinGrace
              ? 'carryRecoveryExpired'
              : a.intent?.kind === 'carry'
                ? 'other'
                : 'noCarryIntent';
    endControlSpell(s, time, 'looseCarry', {
      looseCarryCause,
      ballSeparationAtEndMetres: separation,
      ballHeightAtEndMetres: ball.y,
      relativeSpeedAtEndMetresPerSecond: relativeSpeed,
      controlAgeAtEndSeconds: time - s.controlledAt,
      intentKindAtEnd: a.intent?.kind ?? null,
      intentModeAtEnd: a.intent?.mode ?? null,
      intentRemainingAtEndSeconds: Number.isFinite(a.intent?.expiresAt)
        ? a.intent.expiresAt - time
        : null,
      carryRecoveryRemainingAtEndSeconds:
        a.intent?.kind === 'carry' && Number.isFinite(a.intent.expiresAt)
          ? a.intent.expiresAt + CARRY_CONTROL_RECOVERY_GRACE_SECONDS - time
          : null,
      controlRadiusAtEndMetres: controlRadius,
      relativeSpeedLimitAtEndMetresPerSecond: relativeSpeedLimit,
    });
    s.controller = null;
    s.phase = 'loose';
    s.metrics.turnovers.looseCarry++;
  }
  const inFlight = pending && time < (pending.expiresAt ?? pending.time + 4);
  if (inFlight) s.phase = 'flight';
  else {
    const nearby = actors.filter((a) => !a.sentOff && distance(a.pos, ball) < 2.5);
    s.phase = new Set(nearby.map((a) => a.side)).size > 1 ? 'contested' : 'loose';
  }
  if (!inFlight && s.controller === null && time > s.teamUntil) {
    endPossession(s, time, 'loose');
    endChain(s);
    s.side = null;
  }
  if (s.phase === 'flight' && s.side !== null) s.metrics.flightSeconds[s.side] += 0.05;
  else if (s.phase === 'contested') s.metrics.contestedSeconds += 0.05;
  else s.metrics.looseSeconds += 0.05;
  return null;
}
