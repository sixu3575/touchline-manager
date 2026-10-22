// Observation only: never reads RNG, changes a target, or applies a ball impulse.
export const ACTION_STATISTICS_VERSION = 'actions-1';
const fields = [
  'passes',
  'completed',
  'tackleAttempts',
  'tackles',
  'wonTackles',
  'failedChallenges',
  'interceptions',
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
  'saves',
];
const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function createActionStatistics(players, emit, restored = null) {
  const state = restored ?? {
    version: ACTION_STATISTICS_VERSION,
    sequence: 0,
    context: null,
    challenge: null,
    takeOn: null,
    rows: Object.fromEntries(
      players.map((p) => [
        p.id,
        {
          id: p.id,
          side: p.side,
          ...Object.fromEntries(fields.map((k) => [k, 0])),
        },
      ]),
    ),
  };
  function credit(p, changes, second, reason, extra = {}) {
    const row = state.rows[p.id];
    if (!row) return;
    for (const [key, amount] of Object.entries(changes)) row[key] += amount;
    emit({
      type: 'playerStat',
      statId: ++state.sequence,
      playerId: p.id,
      side: p.side,
      second,
      changes,
      reason,
      ...extra,
    });
  }
  function finishChallenge(side, second, safe = false) {
    const c = state.challenge;
    if (!c) return;
    state.challenge = null;
    credit(
      c.player,
      c.player.side === side || safe ? { wonTackles: 1 } : {},
      second,
      c.player.side === side || safe ? 'tackleWon' : 'tackleLost',
      { opponentId: c.opponentId, occurredAt: c.second },
    );
  }
  function finishTakeOn(outcome, second) {
    const t = state.takeOn;
    if (!t) return;
    state.takeOn = null;
    if (!t.engaged && outcome !== 'won') return;
    if (!t.engaged) credit(t.player, { takeOnAttempts: 1 }, second, 'takeOnAttempt');
    credit(
      t.player,
      outcome === 'won' ? { takeOns: 1 } : outcome === 'lost' ? { failedTakeOns: 1 } : {},
      second,
      'takeOn-' + outcome,
      { opponentId: t.opponentId, occurredAt: t.second },
    );
  }
  function lose(second, reason) {
    const c = state.context;
    if (!c || c.lost || ['shot', 'clearance', 'restart'].includes(c.kind)) return;
    c.lost = true;
    const category =
      c.kind === 'pass'
        ? 'failedPasses'
        : c.kind === 'miscontrol'
          ? 'miscontrolLosses'
          : reason === 'out'
            ? 'outLosses'
            : 'dispossessed';
    credit(c.player, { possessionLost: 1, [category]: 1 }, second, category);
    if (state.takeOn?.player.id === c.player.id) finishTakeOn('lost', second);
  }
  function control(player, second, { bodyPart = 'foot', deliberate = true } = {}) {
    const c = state.context;
    finishChallenge(player.side, second);
    if (c && c.player.side !== player.side) {
      lose(second, 'opponent');
      credit(player, { recoveries: 1 }, second, 'recovery');
      if (
        deliberate &&
        c.kind === 'pass' &&
        second <= c.expiresAt &&
        !c.intercepted &&
        !c.deflected
      ) {
        c.intercepted = true;
        credit(player, { interceptions: 1 }, second, 'interception', { bodyPart });
      }
    } else if (c?.kind === 'pass' && c.player.id !== player.id && !c.completed) {
      c.completed = true;
      credit(c.player, { completed: 1 }, second, 'passComplete');
    }
    if (state.takeOn && state.takeOn.player.id !== player.id)
      finishTakeOn(state.takeOn.player.side === player.side ? 'cancelled' : 'lost', second);
    if (!c || c.player.id !== player.id || c.kind !== 'carry')
      state.context = { player, kind: 'carry', second, lost: false };
  }
  function release(player, kind, second, extra = {}) {
    if (state.takeOn?.player.id === player.id && kind !== 'miscontrol')
      finishTakeOn('cancelled', second);
    if (kind === 'pass') credit(player, { passes: 1 }, second, 'pass');
    if (kind === 'clearance') credit(player, { clearances: 1 }, second, 'clearance');
    state.context = { player, kind, second, lost: false, ...extra };
  }
  function challenge(player, opponentId, second, contact = false) {
    if (!contact) {
      credit(player, { tackleAttempts: 1 }, second, 'tackleAttempt', { opponentId });
      return;
    }
    finishChallenge(player.side, second);
    credit(player, { tackles: 1 }, second, 'tackleContact', { opponentId });
    state.challenge = { player, opponentId, second };
  }
  function failedChallenge(player, opponentId, second) {
    credit(player, { failedChallenges: 1 }, second, 'challengeFailed', { opponentId });
    if (state.takeOn?.opponentId === player.id && !state.takeOn.engaged) {
      state.takeOn.engaged = true;
      credit(state.takeOn.player, { takeOnAttempts: 1 }, second, 'takeOnAttempt', {
        opponentId: player.id,
      });
    }
  }
  function blockedPass(player, second, bodyPart = 'body') {
    const c = state.context;
    if (!c || c.kind !== 'pass' || c.player.side === player.side || second > c.expiresAt) return;
    c.blockers ??= [];
    if (c.blockers.includes(player.id)) return;
    c.blockers.push(player.id);
    c.deflected = true;
    credit(player, { blockedPasses: 1 }, second, 'blockedPass', { bodyPart });
  }
  function takeOn(player, opponent, ball, second, direction, destination = null) {
    if (!opponent || opponent.side === player.side || gap(player.pos, opponent.pos) > 4.5) return;
    const dx = destination ? destination.x - ball.x : direction,
      dz = destination ? destination.z - ball.z : 0,
      len = Math.hypot(dx, dz);
    if (len < 0.01) return;
    const route = { x: dx / len, z: dz / len };
    const ox = opponent.pos.x - ball.x,
      oz = opponent.pos.z - ball.z;
    if (ox * route.x + oz * route.z < 0.5 || Math.abs(ox * route.z - oz * route.x) > 1.8) return;
    if (state.takeOn?.player.id === player.id) return;
    if (state.takeOn) finishTakeOn('cancelled', second);
    state.takeOn = {
      player,
      opponentId: opponent.id,
      second,
      route,
      start: { x: ball.x, z: ball.z },
      engaged: false,
    };
  }
  function observe(players, ball, controllerId, second) {
    const t = state.takeOn;
    if (!t) return;
    const a = players.find((p) => p.id === t.player.id),
      b = players.find((p) => p.id === t.opponentId);
    if (!a || !b) return finishTakeOn('cancelled', second);
    if (!t.engaged && gap(a.pos, b.pos) <= 1.8) {
      t.engaged = true;
      credit(t.player, { takeOnAttempts: 1 }, second, 'takeOnAttempt', { opponentId: b.id });
    }
    if (
      t.engaged &&
      controllerId === a.id &&
      gap(a.pos, ball) <= 2.6 &&
      (a.pos.x - b.pos.x) * t.route.x + (a.pos.z - b.pos.z) * t.route.z > 0.8 &&
      gap(a.pos, b.pos) > 1.8 &&
      (ball.x - t.start.x) * t.route.x + (ball.z - t.start.z) * t.route.z >= 1.5
    )
      finishTakeOn('won', second);
    else if (second - t.second > 12 || gap(a.pos, b.pos) > 7) finishTakeOn('cancelled', second);
  }
  function stop(kind, side, second, lastTouchId = null) {
    const c = state.context;
    const safe =
      ['throwIn', 'goalKick'].includes(kind) ||
      (kind === 'corner' && side === state.challenge?.player.side);
    if (state.challenge && side !== null) finishChallenge(side, second, safe);
    else state.challenge = null;
    if (['throwIn', 'goalKick', 'corner'].includes(kind) && c && side !== c.player.side)
      lose(second, 'out');
    if (state.takeOn) finishTakeOn('cancelled', second);
    state.context = null;
  }
  return {
    state,
    rows: state.rows,
    credit,
    control,
    release,
    challenge,
    failedChallenge,
    blockedPass,
    takeOn,
    observe,
    stop,
  };
}
