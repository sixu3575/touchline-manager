// Statistical provenance only. No random draws, player abilities or ball impulses.
export const STATISTICS_VERSION = 'opta-conventional-1';

export function attributionState() {
  return { version: STATISTICS_VERSION, sequence: 0, credit: null, attempt: null };
}

export function attributeTouch(state, player, incomingGoalSide = null, deliberate = false) {
  // A failed defensive intervention does not steal a goal already travelling in.
  // This also preserves the original own-goal scorer through a keeper's touch.
  if (!deliberate && incomingGoalSide !== null && player.side !== incomingGoalSide && state.credit)
    return;
  state.credit = { id: player.id, side: player.side };
}

export function startAttempt(state, player, source = null) {
  const assist = source?.receiverId === player.id && source.passerId !== player.id;
  state.attempt = {
    id: ++state.sequence,
    playerId: player.id,
    side: player.side,
    ...(assist && source.assistEligible ? { assistCandidateId: source.passerId } : {}),
    ...(assist && source.keyPassEligible ? { keyPassCandidateId: source.passerId } : {}),
    keeper: null,
    blocked: false,
    lastLineBlock: false,
    woodwork: false,
    deflectedBy: [],
  };
  attributeTouch(state, player, null, true);
  return {
    shotId: state.attempt.id,
    assistCandidateId: state.attempt.assistCandidateId,
    keyPassCandidateId: state.attempt.keyPassCandidateId,
  };
}

export function recordIntervention(
  state,
  player,
  incomingGoalSide,
  lastLine = false,
  outgoingGoalSide = null,
) {
  const attempt = state.attempt;
  if (!attempt || attempt.side === player.side) return;
  if (!attempt.deflectedBy.includes(player.id)) attempt.deflectedBy.push(player.id);
  if (incomingGoalSide !== attempt.side || outgoingGoalSide === attempt.side) return;
  if (player.isKeeper) attempt.keeper ??= { id: player.id, side: player.side };
  else {
    attempt.blocked = true;
    attempt.lastLineBlock ||= lastLine;
  }
}

export function finishAttempt(state, goalScorerId = null) {
  const attempt = state.attempt;
  if (!attempt) return null;
  state.attempt = null;
  const goal = goalScorerId === attempt.playerId;
  const outcome = goal
    ? 'goal'
    : attempt.keeper
      ? 'saved'
      : attempt.blocked
        ? 'blocked'
        : attempt.woodwork
          ? 'woodwork'
          : 'offTarget';
  return {
    shotId: attempt.id,
    playerId: attempt.playerId,
    side: attempt.side,
    outcome,
    onTarget: goal || Boolean(attempt.keeper) || attempt.lastLineBlock,
    deflectedBy: attempt.deflectedBy,
    ...(goal && attempt.assistCandidateId ? { assistId: attempt.assistCandidateId } : {}),
    ...(!goal && attempt.keyPassCandidateId ? { keyPassId: attempt.keyPassCandidateId } : {}),
    ...(!goal && attempt.keeper ? { keeper: attempt.keeper } : {}),
  };
}

export function goalCredit(state, scoringSide, fallback = null) {
  const credit = state.credit ?? fallback;
  return {
    playerId: credit?.side === scoringSide ? credit.id : null,
    ownGoalId: credit && credit.side !== scoringSide ? credit.id : null,
  };
}

// Conservative test for deflected assists: the actual recipient must have been
// the intended recipient and within reach of the original, undeflected line.
// The 2.5m reception corridor is a game approximation, not an Opta threshold.
export function originalRecipientReachable(pass, position, velocity) {
  if (!pass?.receiverId || !pass.target) return false;
  const dx = pass.target.x - position.x,
    dz = pass.target.z - position.z;
  const horizontal = Math.hypot(velocity.x, velocity.z);
  if (horizontal < 0.1 || dx * velocity.x + dz * velocity.z <= 0) return false;
  return Math.abs(dx * velocity.z - dz * velocity.x) / horizontal <= 2.5;
}

export function receptionSource(pass, receiverId) {
  if (!pass || pass.actor.player.id === receiverId) return null;
  return {
    passerId: pass.actor.player.id,
    receiverId,
    assistEligible: !pass.deflected || (pass.originalReachable && pass.receiverId === receiverId),
    keyPassEligible: !pass.deflected,
  };
}
