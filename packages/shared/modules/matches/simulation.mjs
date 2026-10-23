import { packActors, unpackActors } from './checkpoint.mjs';
import { createActionStatistics } from './statistics.mjs';
import { airborneVelocity } from './ball-motion.mjs';
import { firstTouchVelocity, receptionPlan } from './receiving.mjs';
import { deadballTarget, kickoffPosition, restartReady } from './deadball.mjs';
import {
  keeperReaction,
  diveResponse,
  keeperDiveVelocity,
  parryVelocity,
  keeperHandTarget,
} from './goalkeeping.mjs';
import {
  STATISTICS_VERSION,
  attributionState,
  attributeTouch,
  startAttempt,
  recordIntervention,
  finishAttempt,
  goalCredit,
  originalRecipientReachable,
  receptionSource,
} from './attribution.mjs';
import { driveMovement, markingVelocity, restartAvoidance } from './locomotion.mjs';
import {
  needsOnBallScan,
  rememberOnBallAction,
  controlMovement,
  motorTouch,
  canReactToPass,
} from './onball.mjs';
import { interceptionRisk } from './decisions.mjs';
import {
  updateFacing,
  prepareKick,
  kickReady,
  kickTarget,
  releasedKick,
  kickRecovery,
  trackKickReceiver,
} from './execution.mjs';
import { activityState, burstReserve, recordMovement, restAtHalfTime } from './activity.mjs';
import {
  tackleWindow,
  tackleProbability,
  tackleRecoverySeconds,
  tackleRelease,
} from './defending.mjs';
import {
  continuityState,
  updateContinuity,
  controlBall,
  releaseControl,
  deadBall,
  contestOwner,
} from './continuity.mjs';
import { random, clamp, seedFrom } from '../../core/index.mjs';
import {
  createMatchState,
  matchShock,
  updateMatchEnergy,
  mentalModifier,
} from '../players/index.mjs';
import {
  RULES_VERSION,
  inPenaltyArea,
  offsideSnapshot,
  offsideInvolvement,
  foulAssessment,
  physicalContactFoulRisk,
  applyCard,
  dissentProbability,
  localX,
} from './rules.mjs';
import { shootout } from './shootout.mjs';
import { validateLineup } from '../tactics/index.mjs';
import {
  createPhysics,
  restorePhysics,
  createBody,
  physicalPlayerContact,
  createHands,
  orientFoot,
  orientHands,
  secureCatch,
  releaseCatch,
  moveCatch,
  kick,
  touchesBall,
  stepPhysics,
  goalCrossing,
  projectedGoal,
  STEP,
  BALL_RADIUS,
} from './physics.mjs';
import {
  formation,
  ability,
  movement,
  chooseAction,
  targetFor,
  distance,
  actionQuality,
  movementMode,
  teamRoles,
  playerProfile,
} from './agents.mjs';

export const ENGINE_VERSION = '0.34.0-contact-referee';
export const PARAMETER_VERSION = 'physiology-1';
export const SAMPLE_HZ = 5;
export const FRAME_STRIDE = 49; // 22*(x,z), ball*(x,height,z), cut, last-touch actor+1.
// Full regulation clock in real SI seconds. Playback speed is a client concern.
const DURATION = 90 * 60;
const CLOCK_SCALE = 1;
const toCm = (n) => Math.round(clamp(n, 0, 655.35) * 100);

export function simulate(home, away, seed, id = 'match', options = {}) {
  const engine = createMatchSimulation(home, away, seed, id, options);
  try {
    let part;
    do {
      part = engine.next();
    } while (!part.done);
    return part.value;
  } finally {
    engine.return();
  }
}
// One deterministic implementation for synchronous simulation and durable server slices.
export function* createMatchSimulation(home, away, seed, id = 'match', options = {}) {
  const duration = options.durationSeconds ?? DURATION;
  if (!Number.isInteger(duration) || duration < 1 || duration > DURATION)
    throw Error('Invalid simulation duration');
  if (
    options.checkpoint &&
    (options.checkpoint.version !== ENGINE_VERSION ||
      options.checkpoint.seed !== seed ||
      options.checkpoint.id !== id ||
      options.checkpoint.duration !== duration)
  )
    throw Error('Incompatible match checkpoint');
  validateLineup(home, home.lineup, home.tactics.formation);
  validateLineup(away, away.lineup, away.tactics.formation);
  const clubs = [home, away],
    rng = random(seed),
    physics = options.checkpoint ? restorePhysics(options.checkpoint.physics) : createPhysics();
  const actors = options.checkpoint
    ? unpackActors(options.checkpoint.actors, physics)
    : clubs.flatMap((club, side) =>
        formation(club).map(({ player, anchor, positionRole }, i) => ({
          player: { ...player, matchState: createMatchState(player) },
          anchor,
          positionRole,
          profile: playerProfile(player, anchor),
          intent: null,
          facing: side === 0 ? 0 : Math.PI,
          kickPlan: null,
          movementMode: 'jog',
          carries: 0,
          carryDistance: 0,
          throughBalls: 0,
          longPasses: 0,
          oneTouchPasses: 0,
          maxSpeed: 0,
          isKeeper: player.role === 'GK',
          yellowCards: 0,
          sentOff: false,
          dismissedAt: null,
          tackles: 0,
          wonTackles: 0,
          tackleAt: 0,
          side,
          index: side * 11 + i,
          ...createBody(physics, player.heightCm ?? 180, ability(player, 'strength'), 0, 0),
          pos: { x: 0, z: 0 },
          velocity: { x: 0, z: 0 },
          target: { x: 0, z: 0 },
          energy: player.fitness,
          distance: 0,
          activity: activityState(),
          touches: 0,
          passes: 0,
          completed: 0,
          hold: 0,
          cooldown: 0,
          bias: rng() * 2 - 1,
          reaction: 0,
          setPiece: null,
          nextDecision: 0,
        })),
      );
  for (const a of actors) if (a.isKeeper && !a.hands) a.hands = createHands(physics, a);
  const colliderActors = new Map(
    actors.flatMap((a) => [a.collider, ...a.legs].map((c) => [c.handle, a])),
  );
  const stats = clubs.map(() => ({
    shots: 0,
    onTarget: 0,
    xg: 0,
    possession: 0,
    passes: 0,
    completedPasses: 0,
    saves: 0,
    interceptions: 0,
    corners: 0,
    fouls: 0,
    offsides: 0,
    yellowCards: 0,
    redCards: 0,
    possessionTicks: 0,
  }));
  const continuity = continuityState();
  const attribution = attributionState();
  let statisticalContacts = new Set();
  let physicalContactPairs = new Set();
  let physicalFoulCooldowns = {};
  const timeline = [];
  const score = [0, 0],
    events = [];
  const participant = (a) => ({
    id: a.player.id,
    side: a.side,
    isKeeper: a.isKeeper,
    pos: { ...a.body.translation() },
  });
  const actionStatistics = createActionStatistics(
    actors.map(participant),
    (e) => {
      events.push({
        ...e,
        second: Math.round(e.second * 20) / 20,
        minute: Math.min(90, Math.floor(e.second / 60)),
        text: '',
        x: 0,
        y: 0,
      });
      const labels = {
        interception: ['interception', '主动截断对方传球。'],
        tackleWon: ['tackleWon', '抢断后本方获得球权或将球安全破坏出界。'],
        tackleLost: ['tackleLost', '抢断碰到球，但球权仍归对方。'],
        blockedPass: ['blockedPass', '挡住对方传球。'],
        block: ['block', '封堵对方射门。'],
        'takeOn-won': ['takeOnWon', '突破防守并保住球权。'],
        'takeOn-lost': ['takeOnLost', '突破中失去球权。'],
      };
      const label = labels[e.reason];
      if (label) {
        const a = actors.find((a) => a.player.id === e.playerId);
        event(label[0], e.side, `${a.player.name}${label[1]}`, a, {
          statId: e.statId,
          opponentId: e.opponentId,
          occurredAt: e.occurredAt,
        });
      }
    },
    options.checkpoint?.state.actionStatistics,
  );
  const ticks = duration * 20;
  const frames =
    options.recordReplay === false
      ? null
      : new Uint16Array((Math.floor(ticks / 4) + 1) * FRAME_STRIDE);
  let time = 0,
    half = 0,
    lastTouch = null,
    owner = null,
    pendingPass = null,
    shot = null;
  let shootoutPhase = false;
  let offside = null,
    lastPass = null,
    deliberate = null,
    restartPlay = null,
    actionNumber = 0,
    abandoned = false;
  const rulesRng = random(seedFrom(`${seed}:rules`));
  let restartUntil = 0,
    restartSide = 0,
    restartTaker = null,
    goalRestart = null,
    deadState = null,
    cut = true,
    cursor = 0;
  let roles = { chasers: [], receiverId: null, runnerId: null };
  const motion = {
    passSpeedSum: 0,
    passSamples: 0,
    playerSpeedSum: 0,
    playerSamples: 0,
    sprintSamples: 0,
  };
  const direction = (side) => (side === 0 ? 1 : -1) * (half === 0 ? 1 : -1);
  const event = (type, side, text, actor = null, extra = {}) => {
    const b = physics.ball.translation();
    events.push({
      second: Math.round(time * 20) / 20,
      minute: shootoutPhase ? 91 : Math.min(90, Math.floor((time * CLOCK_SCALE) / 60)),
      type,
      side,
      text,
      x: clamp((b.x / 105) * 100, 0, 100),
      y: clamp((b.z / 68) * 100, 0, 100),
      ...(actor ? { playerId: actor.player.id } : {}),
      ...extra,
    });
  };
  const statisticalPlayer = (a) => ({ id: a.player.id, side: a.side, isKeeper: a.isKeeper });
  const actorById = (id) => actors.find((a) => a.player.id === id);
  const goalSide = (end) => (end === null ? null : direction(0) === (end === 1 ? 1 : -1) ? 0 : 1);
  function resolveAttempt(scorerId = null) {
    const result = finishAttempt(attribution, scorerId);
    if (!result) return null;
    if (result.onTarget) stats[result.side].onTarget++;
    if (result.keeper) {
      stats[result.keeper.side].saves++;
      actionStatistics.credit(result.keeper, { saves: 1 }, time, 'save', { shotId: result.shotId });
      event(
        'save',
        result.keeper.side,
        `${actorById(result.keeper.id).player.name}扑救化解射门。`,
        actorById(result.keeper.id),
        { shotId: result.shotId },
      );
    }
    if (result.defender)
      actionStatistics.credit(result.defender, { blocks: 1 }, time, 'block', {
        shotId: result.shotId,
      });
    const { keeper, defender, ...outcome } = result;
    event('shotOutcome', result.side, '本次射门统计已确认。', actorById(result.playerId), outcome);
    return result;
  }
  function receivePass(a, pass, bodyPart = 'foot') {
    if (!pass || pass.actor === a || pass.actor.side !== a.side) return;
    pass.actor.completed++;
    stats[a.side].completedPasses++;
    const source = receptionSource(pass, a.player.id);
    lastPass = { actor: pass.actor, receiver: a, time, source };
    event('passComplete', a.side, `${a.player.name}接到队友传球。`, a, {
      passerId: pass.actor.player.id,
      actionId: pass.actionId,
      bodyPart,
    });
  }
  function registerAttempt(a) {
    resolveAttempt();
    const source = lastPass?.receiver === a ? lastPass.source : null;
    const details = startAttempt(attribution, statisticalPlayer(a), source);
    lastPass = null; // A rebound is a new opportunity, not a second use of the pass.
    return details;
  }
  function statisticalDeflection(a, sample, hands = false) {
    if (a.pendingStatTackle) {
      if (time - a.pendingStatTackle.second < 0.6)
        actionStatistics.challenge(participant(a), a.pendingStatTackle.opponentId, time, true);
      a.pendingStatTackle = null;
    }
    if (
      attribution.credit?.id === a.player.id &&
      (!attribution.attempt || attribution.attempt.side === a.side)
    )
      return;
    const incomingSide = goalSide(projectedGoal(sample));
    const ownGoalX = direction(a.side) === 1 ? 0 : 105;
    const lastLine = !actors.some(
      (other) =>
        other !== a &&
        !other.sentOff &&
        other.side === a.side &&
        Math.abs(other.body.translation().x - ownGoalX) + 0.3 <
          Math.abs(a.body.translation().x - ownGoalX),
    );
    const outgoingSide =
      attribution.attempt?.side === incomingSide
        ? goalSide(
            projectedGoal({
              position: { ...physics.ball.translation() },
              velocity: { ...physics.ball.linvel() },
              spin: { ...physics.ball.angvel() },
            }),
          )
        : null;
    recordIntervention(
      attribution,
      statisticalPlayer(a),
      incomingSide,
      lastLine,
      outgoingSide,
      time,
    );
    attributeTouch(attribution, statisticalPlayer(a), incomingSide);
    if (pendingPass && pendingPass.actor.side !== a.side) {
      pendingPass.originalReachable =
        (pendingPass.originalReachable ?? true) &&
        originalRecipientReachable(pendingPass, sample.position, sample.velocity);
      pendingPass.deflected = true;
    }
    if (lastPass && lastPass.actor.side !== a.side) {
      lastPass.source.keyPassEligible = false;
      if (hands) lastPass = null;
    }
  }
  function placeBall(x, z, reason, side = null) {
    actionStatistics.stop(reason, side, time, lastTouch?.player.id);
    for (const a of actors) releaseCatch(physics, a);
    resolveAttempt();
    attribution.credit = null;
    statisticalContacts.clear();
    physics.ball.setTranslation({ x, y: BALL_RADIUS + 0.015, z }, true);
    physics.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
    physics.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
    lastTouch = null;
    deadBall(continuity, time, reason);
    owner = null;
    pendingPass = null;
    shot = null;
    cut = true;
    offside = null;
    lastPass = null;
    deliberate = null;
    restartPlay = null;
  }
  function placeActor(a, x, z) {
    releaseCatch(physics, a);
    a.body.setTranslation({ x, y: a.height / 2, z }, true);
    a.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    a.pos = { x, z };
    a.velocity = { x: 0, z: 0 };
    a.facing = direction(a.side) === 1 ? 0 : Math.PI;
    a.footAngle = a.facing;
    a.target = { x, z };
    a.hold = 0;
    a.setPiece = null;
    a.intent = null;
    a.kickPlan = null;
    a.onBallPlan = null;
    a.offBallPlan = null;
    a.markMemory = null;
    a.pressMemory = null;
    a.keeperRead = null;
    a.keeperSet = null;
    a.diveLean = 0;
    a.handOffset = null;
  }
  function kickoff(side, type = 'kickoff', natural = false) {
    goalRestart = null;
    placeBall(52.5, 34, type, side);
    for (const a of actors) {
      if (a.sentOff) continue;
      if (!natural) {
        const point = kickoffPosition(a, direction(a.side));
        placeActor(a, point.x, point.z);
      } else {
        a.intent = null;
        a.kickPlan = null;
        a.offBallPlan = null;
        a.markMemory = null;
      }
    }
    const taker =
      actors.find((a) => a.side === side && !a.sentOff && a.player.role === 'FWD') ??
      actors.find((a) => a.side === side && !a.sentOff && !a.isKeeper);
    if (!natural) placeActor(taker, 52.5 - direction(side) * 0.66, 34);
    restartUntil = time + 10;
    restartSide = side;
    restartTaker = taker;
    taker.setPiece = 'kickoff';
    deadState = { type, side, taker: taker.index, ball: { x: 52.5, z: 34 }, startedAt: time };
    event(type, side, type === 'half' ? '双方交换场地，下半场开始。' : '中圈开球，比赛开始。');
  }
  function restart(type, side, x, z) {
    // Attacking indirect free kicks inside the goal area move to its 5.5m line.
    if (type === 'indirect' && localX(x, direction(side)) > 99.5 && Math.abs(z - 34) < 9.16)
      x = direction(side) === 1 ? 99.5 : 5.5;
    placeBall(x, z, type, side);
    const candidates = actors.filter(
      (a) => !a.sentOff && a.side === side && (type === 'goalKick' ? a.isKeeper : !a.isKeeper),
    );
    const taker = candidates.sort((a, b) =>
      type === 'penalty'
        ? 0.55 * ability(b.player, 'finishing') +
          0.45 * ability(b.player, 'setPieces') -
          (0.55 * ability(a.player, 'finishing') + 0.45 * ability(a.player, 'setPieces'))
        : distance(a.pos, { x, z }) - distance(b.pos, { x, z }),
    )[0];
    taker.setPiece = type;
    for (const a of actors) {
      a.intent = null;
      a.kickPlan = null;
      a.offBallPlan = null;
      a.markMemory = null;
      a.pressMemory = null;
      a.keeperRead = null;
      a.keeperSet = null;
    }
    restartSide = side;
    restartTaker = taker;
    deadState = { type, side, taker: taker.index, ball: { x, z }, startedAt: time };
    restartUntil =
      time +
      ({ throwIn: 12, goalKick: 18, corner: 18, freeKick: 20, indirect: 15, penalty: 25 }[type] ??
        12);
    event(
      type,
      side,
      `${clubs[side].name}${{ corner: '获得角球。', goalKick: '开出球门球。', throwIn: '获得边线球（简化为脚下开球）。', freeKick: '获得直接任意球。', indirect: '获得间接任意球。', penalty: '获得点球！' }[type]}`,
      taker,
    );
    if (type === 'corner') stats[side].corners++;
  }
  const playing = () => actors.filter((a) => !a.sentOff);
  const captain = (side) =>
    playing()
      .filter((a) => a.side === side)
      .sort(
        (a, b) =>
          (b.player.personality?.leadership ?? 50) - (a.player.personality?.leadership ?? 50),
      )[0];
  function shock(side, morale, actor = null, confidence = 0) {
    const leadership = captain(side)?.player.personality?.leadership ?? 0;
    for (const a of playing())
      if (a.side === side) matchShock(a.player, morale, a === actor ? confidence : 0, leadership);
  }
  function card(a, kind, reason) {
    const result = applyCard(a, kind);
    if (!result) return;
    if (kind === 'yellow') stats[a.side].yellowCards++;
    if (a.sentOff) {
      stats[a.side].redCards++;
      a.dismissedAt = time;
      placeActor(a, -4, 5 + a.index * 2.5);
      a.body.setEnabled(false);
      cut = true;
      if (a.isKeeper) {
        a.isKeeper = false;
        const replacement = playing()
          .filter((o) => o.side === a.side)
          .sort((x, y) => ability(y.player, 'reflexes') - ability(x.player, 'reflexes'))[0];
        if (replacement) {
          replacement.isKeeper = true;
          replacement.hands = createHands(physics, replacement);
        }
      }
    }
    event(
      a.sentOff ? 'redCard' : 'yellowCard',
      a.side,
      `${a.player.name}${result === 'secondYellow' ? '两黄变红，被罚下！' : a.sentOff ? '被红牌罚下！' : '被出示黄牌。'}${reason}`,
      a,
      { card: result },
    );
    if (playing().filter((o) => o.side === a.side).length < 7) abandoned = true;
  }
  function awardChallengeFoul(a, victim, penalty, judgement, source = 'tackle') {
    stats[a.side].fouls++;
    event(
      'foul',
      a.side,
      `${a.player.name}${source === 'bodyContact' ? '身体对抗犯规' : '抢断犯规'}，${penalty ? '禁区内判罚点球！' : '对手获得任意球。'}`,
      a,
      { opponentId: victim.player.id, source, ...judgement },
    );
    if (judgement.card)
      card(a, judgement.card, source === 'bodyContact' ? '身体对抗动作' : '抢断动作');
    if (
      !a.sentOff &&
      rulesRng() < dissentProbability(a.player.personality?.temperament ?? 50)
    )
      card(a, 'yellow', '抗议判罚');
    restart(
      penalty ? 'penalty' : 'freeKick',
      victim.side,
      penalty ? (direction(victim.side) === 1 ? 94 : 11) : clamp(physics.ball.translation().x, 1, 104),
      penalty ? 34 : clamp(physics.ball.translation().z, 1, 67),
    );
  }

  function assessCarrierContactFouls(isActive) {
    if (!isActive || deadState || continuity.controller === null) {
      physicalContactPairs = new Set();
      return false;
    }
    const carrier = actors[continuity.controller];
    if (!carrier || carrier.sentOff) {
      physicalContactPairs = new Set();
      return false;
    }
    const ballPosition = physics.ball.translation();
    const carrierPosition = carrier.body.translation();
    if (Math.hypot(carrierPosition.x - ballPosition.x, carrierPosition.z - ballPosition.z) > 2.6) {
      physicalContactPairs = new Set();
      return false;
    }

    const detected = new Set();
    for (const defender of actors) {
      if (defender.sentOff || defender.side === carrier.side) continue;
      const defenderPosition = defender.body.translation();
      const separation = Math.hypot(
        carrierPosition.x - defenderPosition.x,
        carrierPosition.z - defenderPosition.z,
      );
      if (separation > 1.35 || !physicalPlayerContact(physics, defender, carrier)) continue;

      const pair = `${defender.index}:${carrier.index}`;
      detected.add(pair);
      if (physicalContactPairs.has(pair) || (physicalFoulCooldowns[pair] ?? -Infinity) > time)
        continue;
      physicalFoulCooldowns[pair] = time + 2.5;

      const dv = defender.body.linvel();
      const cv = carrier.body.linvel();
      const towardX = (carrierPosition.x - defenderPosition.x) / Math.max(0.01, separation);
      const towardZ = (carrierPosition.z - defenderPosition.z) / Math.max(0.01, separation);
      const closingSpeed = Math.max(0, (dv.x - cv.x) * towardX + (dv.z - cv.z) * towardZ);
      // This is a carrier collision, not a tackle at the ball: a defender being
      // farther from the ball does not prove they arrived late. Keep lateness
      // neutral and use the same relative-speed danger scale as ball challenges.
      const late = 0;
      const danger = clamp((closingSpeed - 2) / 9, 0, 1);
      const behind =
        (defenderPosition.x - carrierPosition.x) * direction(carrier.side) < -0.25;
      const contact = physicalContactFoulRisk({ closingSpeed, late, danger, behind });
      const penalty = inPenaltyArea(ballPosition, direction(defender.side));
      const progress = localX(carrierPosition.x, direction(carrier.side));
      const covering = actors.filter(
        (o) =>
          !o.sentOff &&
          o.side === defender.side &&
          o !== defender &&
          localX(o.body.translation().x, direction(carrier.side)) > progress,
      ).length;
      const judgement = foulAssessment(
        {
          tackling: ability(defender.player, 'tackling'),
          late,
          danger,
          contact,
          wonBall: false,
          aggression: defender.player.personality?.aggression ?? 50,
          penalty,
          dogso: progress > 82 && Math.abs(ballPosition.z - 34) < 12 && covering <= 1,
        },
        rulesRng(),
      );
      if (judgement.foul) {
        awardChallengeFoul(defender, carrier, penalty, judgement, 'bodyContact');
        physicalContactPairs = detected;
        return true;
      }
    }
    physicalContactPairs = detected;
    for (const [pair, until] of Object.entries(physicalFoulCooldowns))
      if (until < time - 8) delete physicalFoulCooldowns[pair];
    return false;
  }
  function offence(type, side, a, x, z, text) {
    event(type, side, text, a);
    if (a && !a.sentOff && rulesRng() < dissentProbability(a.player.personality?.temperament ?? 50))
      card(a, 'yellow', '抗议判罚');
    restart('indirect', 1 - side, clamp(x, 1, 104), clamp(z, 1, 67));
  }
  function checkInvolvement(a) {
    if (!offsideInvolvement(offside, a)) return false;
    stats[a.side].offsides++;
    offence(
      'offside',
      a.side,
      a,
      a.pos.x,
      a.pos.z,
      `${a.player.name}在队友触球时越位，随后参与接球。`,
    );
    return true;
  }
  function playedBall(a, kind, receiverId) {
    offside = offsideSnapshot(a, actors, physics.ball.translation(), direction(a.side), a.setPiece);
    deliberate = { side: a.side, playerId: a.player.id, kind, receiverId };
    if (a.setPiece) {
      restartPlay = { kind: a.setPiece, taker: a.player.id, touched: false };
      deadState = null;
      restartTaker = null;
    } else if (restartPlay && restartPlay.taker !== a.player.id) restartPlay.touched = true;
  }
  function record() {
    if (!frames) return;
    for (const a of actors) {
      const p = a.body.translation();
      frames[cursor++] = toCm(p.x + 5);
      frames[cursor++] = toCm(p.z + 5);
    }
    const b = physics.ball.translation();
    frames[cursor++] = toCm(b.x + 5);
    frames[cursor++] = toCm(b.y);
    frames[cursor++] = toCm(b.z + 5);
    frames[cursor++] = Number(cut);
    frames[cursor++] = lastTouch === null ? 0 : lastTouch.index + 1;
    cut = false;
  }
  const actorAt = (i) => (i === null || i === undefined ? null : actors[i]);
  const link = (row) =>
    row
      ? {
          ...row,
          actor: actorAt(row.actor),
          ...(row.receiver !== undefined ? { receiver: actorAt(row.receiver) } : {}),
        }
      : null;
  let startTick = 0;
  if (options.checkpoint) {
    const c = options.checkpoint;
    if (c.version !== ENGINE_VERSION || c.seed !== seed || c.id !== id || c.duration !== duration)
      throw Error('Incompatible match checkpoint');
    ({
      time,
      half,
      pendingPass,
      shot,
      offside,
      lastPass,
      deliberate,
      restartPlay,
      actionNumber,
      abandoned,
      restartUntil,
      restartSide,
      goalRestart,
      deadState,
      cut,
      cursor,
      roles,
    } = c.state);
    Object.assign(attribution, c.state.attribution);
    statisticalContacts = new Set(c.state.statisticalContacts ?? []);
    physicalContactPairs = new Set(c.state.physicalContactPairs ?? []);
    physicalFoulCooldowns = { ...(c.state.physicalFoulCooldowns ?? {}) };
    lastTouch = actorAt(c.state.lastTouch);
    owner = actorAt(c.state.owner);
    restartTaker = actorAt(c.state.restartTaker);
    pendingPass = link(pendingPass);
    shot = link(shot);
    lastPass = link(lastPass);
    stats.splice(0, 2, ...c.stats);
    score.splice(0, 2, ...c.score);
    events.push(...c.events);
    timeline.push(...c.timeline);
    Object.assign(motion, c.motion);
    Object.assign(continuity, c.continuity);
    if (frames && c.frames) frames.set(c.frames);
    rng.restore(c.rng);
    rulesRng.restore(c.rulesRng);
    startTick = c.tick;
    for (const [i, n] of c.legRecovery) physics.legRecovery.set(actors[i], n);
  } else {
    kickoff(0);
    record();
    timeline.push({
      second: 0,
      stats: publicStats(),
      performance: playerStats(true),
      continuity: timelineContinuity(),
    });
  }
  const unlink = (row) =>
    row
      ? {
          ...row,
          actor: row.actor?.index,
          ...(row.receiver ? { receiver: row.receiver.index } : {}),
        }
      : null;
  function checkpoint(tick) {
    return {
      version: ENGINE_VERSION,
      seed,
      id,
      duration,
      tick,
      rng: rng.state(),
      rulesRng: rulesRng.state(),
      physics: {
        world: physics.world.takeSnapshot(),
        ball: physics.ball.handle,
        collider: physics.collider.handle,
      },
      actors: packActors(actors),
      legRecovery: [...physics.legRecovery].map(([a, n]) => [a.index, n]),
      stats,
      score,
      events,
      timeline,
      motion,
      continuity,
      frames: frames?.slice(0, cursor),
      state: {
        time,
        half,
        lastTouch: lastTouch?.index ?? null,
        owner: owner?.index ?? null,
        pendingPass: unlink(pendingPass),
        shot: unlink(shot),
        offside,
        lastPass: unlink(lastPass),
        deliberate,
        restartPlay,
        actionNumber,
        abandoned,
        restartUntil,
        restartSide,
        restartTaker: restartTaker?.index ?? null,
        goalRestart,
        deadState,
        cut,
        cursor,
        roles,
        attribution: structuredClone(attribution),
        statisticalContacts: [...statisticalContacts],
        physicalContactPairs: [...physicalContactPairs],
        physicalFoulCooldowns: { ...physicalFoulCooldowns },
        actionStatistics: structuredClone(actionStatistics.state),
      },
    };
  }
  let chunkStart = cursor === FRAME_STRIDE ? 0 : cursor;
  const sliceTicks = (options.sliceSeconds ?? 60) * 20;
  function publicStats() {
    const total = stats[0].possessionTicks + stats[1].possessionTicks;
    return stats.map((row, side) => {
      const { possessionTicks, ...rest } = row;
      const home = total ? Math.round((stats[0].possessionTicks / total) * 100) : 50;
      return {
        ...rest,
        ...Object.fromEntries(
          [
            'passes',
            'interceptions',
            'saves',
            'blocks',
            'clearances',
            'recoveries',
            'blockedPasses',
            'wonTackles',
            'tackleAttempts',
            'tackles',
            'takeOns',
            'takeOnAttempts',
            'possessionLost',
          ].map((key) => [
            key,
            Object.values(actionStatistics.rows)
              .filter((p) => p.side === side)
              .reduce((sum, p) => sum + p[key], 0),
          ]),
        ),
        completedPasses: Object.values(actionStatistics.rows)
          .filter((p) => p.side === side)
          .reduce((sum, p) => sum + p.completed, 0),
        xg: Math.round(row.xg * 100) / 100,
        possession: side === 0 ? home : 100 - home,
      };
    });
  }
  function playerStats(timelineOnly = false) {
    return actors.map((a) => {
      const row = {
        id: a.player.id,
        side: a.side,
        distance: Math.round(a.distance),
        locomotion: {
          version: 1,
          zones: a.activity.zones.map((n) => Math.round(n)),
          seconds: a.activity.seconds.map((n) => Math.round(n * 100) / 100),
          liveMetres: Math.round(a.activity.liveMetres),
          deadMetres: Math.round(a.activity.deadMetres),
          sprintEfforts: a.activity.sprintEfforts,
          longestSprint: Math.round(a.activity.longestSprint * 100) / 100,
          adrenalineEfforts: a.activity.adrenalineEfforts,
        },
        defenceTelemetry: {
          pressSeconds: Math.round(a.pressSeconds ?? 0),
          markingSeconds: Math.round(a.markingSeconds ?? 0),
          markingSwitches: a.markSwitches ?? 0,
          observationLapses: a.markLapses ?? 0,
        },
        energy: Math.round(a.energy * 10) / 10,
        burstReserve: Math.round(burstReserve(a)),
        touches: a.touches,
        passes: a.passes,
        completed: a.completed,
        style: a.profile.label,
        positionRole: a.positionRole,
        dribbleTouches: a.carries,
        carryDistance: Math.round(a.carryDistance),
        throughBalls: a.throughBalls,
        longPasses: a.longPasses,
        oneTouchPasses: a.oneTouchPasses,
        maxSpeed: Math.round(a.maxSpeed * 100) / 100,
        tackles: a.tackles,
        wonTackles: a.wonTackles,
        yellowCards: a.yellowCards,
        redCards: Number(a.sentOff),
        dismissedAt: a.dismissedAt,
        mind: { morale: a.player.matchState.morale, confidence: a.player.matchState.confidence },
        ...actionStatistics.rows[a.player.id],
      };
      if (timelineOnly) {
        delete row.locomotion;
        delete row.defenceTelemetry;
      }
      return row;
    });
  }
  function timelineContinuity() {
    // Individual control spells are full-match replay diagnostics, not live snapshots.
    // Duplicating the growing list every 30 seconds bloats durable checkpoints and broadcasts.
    const { controlSpells, possessions, chains, ...summary } = continuity.metrics;
    return structuredClone(summary);
  }
  function buildReport(penalties, abandoned = false) {
    return {
      id,
      engineVersion: ENGINE_VERSION,
      rulesVersion: RULES_VERSION,
      parameterVersion: PARAMETER_VERSION,
      statisticsVersion: STATISTICS_VERSION,
      eventFormatVersion: 3,
      ...(penalties ? { penalties } : {}),
      ...(abandoned ? { abandoned: true } : {}),
      seed,
      homeId: home.id,
      awayId: away.id,
      homeName: home.name,
      awayName: away.name,
      score: [...score],
      stats: publicStats(),
      continuity: structuredClone(continuity.metrics),
      // Rows contain detached numeric snapshots and are never edited after push.
      // Copy the array so a yielded report cannot grow when simulation resumes.
      timeline: timeline.slice(),
      events: [...events],
      motion: {
        passSpeedMean: motion.passSpeedSum / (motion.passSamples || 1),
        playerSpeedMean: motion.playerSpeedSum / (motion.playerSamples || 1),
        sprintShare: motion.sprintSamples / (motion.playerSamples || 1),
      },
      performance: playerStats(),
      replay: frames
        ? {
            format: 'positions-u16-v1',
            sampleHz: SAMPLE_HZ,
            stride: FRAME_STRIDE,
            frameCount: cursor / FRAME_STRIDE,
            duration: time,
            regulationDuration: duration,
            clockScale: 1,
            physics: 'Rapier 3D 0.21.0',
            stepHz: 20,
            players: actors.map((a) => ({
              id: a.player.id,
              side: a.side,
              number: a.player.number,
              name: a.player.name,
              role: a.player.role,
              positionRole: a.positionRole,
            })),
          }
        : undefined,
      snapshots: clubs.map((c) => ({
        id: c.id,
        name: c.name,
        tactics: structuredClone(c.tactics),
        players: structuredClone(c.lineup.map((id) => c.players.find((p) => p.id === id))),
      })),
    };
  }
  try {
    for (let tick = startTick + 1; tick <= ticks; tick++) {
      time = tick * STEP;
      if (tick === Math.floor(ticks / 2)) {
        for (const a of actors) if (!a.sentOff) restAtHalfTime(a);
        half = 1;
        kickoff(1, 'half');
      } else if (goalRestart && time >= goalRestart.at) {
        kickoff(goalRestart.side, 'kickoff', true);
      }
      const bp = physics.ball.translation(),
        bv = physics.ball.linvel();
      const ball = { ...bp, vx: bv.x, vy: bv.y, vz: bv.z };
      let active = time >= restartUntil;
      for (const a of actors) {
        a.pos = a.body.translation();
        a.velocity = a.body.linvel();
      }
      if (
        active &&
        deadState &&
        deadState.type !== 'goal' &&
        !restartReady(deadState, actors, direction)
      ) {
        restartUntil = time + 0.3;
        active = false;
      }
      let touchedThisTick = false;
      const heldKeeper = actors.find((a) => a.keeperHold);
      if (active && heldKeeper && time - heldKeeper.keeperHold.startedAt > 8) {
        event(
          'keeperTime',
          heldKeeper.side,
          `${heldKeeper.player.name}手持球超过八秒，对方获得角球。`,
          heldKeeper,
        );
        restart(
          'corner',
          1 - heldKeeper.side,
          direction(heldKeeper.side) === 1 ? 0.5 : 104.5,
          ball.z < 34 ? 0.5 : 67.5,
        );
        active = false;
      }
      owner = updateContinuity(continuity, actors, ball, time, active && !deadState, pendingPass);
      if (active && !deadState && tick % 6 === 0) {
        roles = teamRoles(
          actors,
          ball,
          owner,
          pendingPass,
          direction,
          clubs.map((c) => c.tactics),
          time,
          continuity,
        );
        const chasers = roles.chasers;
        for (const a of actors) {
          if (a.sentOff) continue;
          if (time < a.nextDecision) continue;
          a.target = targetFor(
            a,
            playing(),
            ball,
            owner,
            direction(a.side),
            clubs[a.side].tactics,
            chasers,
            roles,
          );
          a.reaction = a.isKeeper
            ? keeperReaction(a.player)
            : 0.1 +
              (100 - (ability(a.player, 'concentration') + ability(a.player, 'decisions')) / 2) /
                180;
          a.nextDecision = time + a.reaction;
        }
      }
      const attemptTouch = (a) => {
        const bv = physics.ball.linvel(),
          bp = physics.ball.translation();
        const incomingSample = {
          position: { ...bp },
          velocity: { ...bv },
          spin: { ...physics.ball.angvel() },
        };
        const ball = { ...bp, vx: bv.x, vy: bv.y, vz: bv.z };
        a.pos = a.body.translation();
        a.velocity = a.body.linvel();
        if (!active || touchedThisTick || a.cooldown > 0) return;
        if (heldKeeper && heldKeeper !== a) return;
        if (a.keeperHold && time < a.keeperHold.readyAt) return;
        if (deadState && deadState.type !== 'goal' && a.index !== deadState.taker) return;
        // During a committed wind-up there is no new touch or decision to
        // evaluate. The ball and challengers remain independent; orientation,
        // expiry and loss of control are handled in the outer physical step.
        if (a.kickPlan && !kickReady(a, time)) return;
        // Goalkeepers intercept physically reachable high balls with a finite hand volume.
        if (
          a.isKeeper &&
          !a.keeperHold &&
          bv.x * direction(a.side) < -1 &&
          Math.abs(a.pos.x - (direction(a.side) === 1 ? 0 : 105)) < 16.5 &&
          Math.abs(a.pos.z - 34) < 20 &&
          ball.y < a.height + 0.3 + ability(a.player, 'aerialReach') * 0.006 &&
          (!shot ||
            time - shot.time >
              Math.max(
                0.08,
                a.reaction - (a.keeperSet?.until > time ? a.keeperSet.readiness * 0.12 : 0),
              ))
        ) {
          if (touchesBall(physics, a.hands)) {
            if (checkInvolvement(a)) {
              active = false;
              return;
            }
            if (
              deliberate?.side === a.side &&
              deliberate.playerId !== a.player.id &&
              (deliberate.receiverId === a.player.id || deliberate.kind === 'throwIn')
            ) {
              offence(
                'backpass',
                a.side,
                a,
                ball.x,
                ball.z,
                `${a.player.name}违规用手处理队友故意回传，判间接任意球。`,
              );
              active = false;
              return;
            }
            touchedThisTick = true;
            offside = null;
            lastPass = null;
            deliberate = null;
            if (restartPlay && restartPlay.taker !== a.player.id) restartPlay.touched = true;
            const speed = Math.hypot(bv.x, bv.y, bv.z);
            const handling = ability(a.player, 'handling');
            const retain = speed < 8 + handling * 0.17;
            const outgoing = retain
              ? { x: direction(a.side) * 1.5, y: 0.1, z: rng() - 0.5 }
              : parryVelocity(a, ball, bv, rng);
            const impulse = {
              x: (outgoing.x - bv.x) * physics.ball.mass(),
              y: (outgoing.y - bv.y) * physics.ball.mass(),
              z: (outgoing.z - bv.z) * physics.ball.mass(),
            };
            physics.ball.applyImpulse(impulse, true);
            if (retain) {
              const joint = secureCatch(physics, a);
              if (joint !== null) {
                a.keeperHold = {
                  joint,
                  startedAt: time,
                  readyAt: time + 0.35 + (100 - handling) * 0.005,
                };
                a.kickPlan = null;
                a.onBallPlan = null;
              }
            }
            statisticalDeflection(a, incomingSample, true);
            lastTouch = a;
            if (retain && (a.keeperHold || ball.y < 1.3))
              actionStatistics.control(participant(a), time, { bodyPart: 'hands' });
            if (retain && (a.keeperHold || ball.y < 1.3))
              controlBall(
                continuity,
                a,
                time,
                null,
                Boolean(pendingPass && pendingPass.actor.side !== a.side),
              );
            else releaseControl(continuity, time, 'shot');
            pendingPass = null;
            a.cooldown = 0.4;
            event(
              attribution.attempt ? 'keeperTouch' : 'claim',
              a.side,
              `${a.player.name}${retain ? '近身卸下来球。' : '将球扑出，皮球仍在比赛中！'}`,
              a,
            );
            shot = null;
            if (a.keeperHold) resolveAttempt();
            return;
          }
        }
        if (!a.keeperHold && ball.y > 1.25 && touchesBall(physics, a.head)) {
          if (checkInvolvement(a)) {
            active = false;
            return;
          }
          const goalX = direction(a.side) === 1 ? 105 : 0;
          const headerShot = distance(a.pos, { x: goalX, z: 34 }) < 22;
          const target = {
            x: headerShot ? goalX + direction(a.side) : ball.x + direction(a.side) * 14,
            z:
              34 +
              (rng() - 0.5) *
                (100 -
                  (0.75 * ability(a.player, 'heading') + 0.25 * ability(a.player, 'balance'))) *
                0.12,
          };
          const len = distance(ball, target),
            speed = 8 + ability(a.player, 'strength') * 0.1;
          const flight = Math.max(0.2, len / speed);
          if (
            kick(
              physics,
              a,
              {
                x: (target.x - ball.x) / flight,
                z: (target.z - ball.z) / flight,
                y: (0.7 - ball.y + 4.905 * flight * flight) / flight,
              },
              a.head,
            )
          ) {
            statisticalDeflection(a, incomingSample);
            actionStatistics.control(participant(a), time, { bodyPart: 'head' });
            if (pendingPass && pendingPass.actor.side === a.side && pendingPass.actor !== a)
              receivePass(a, pendingPass, 'head');
            else if (lastTouch?.side !== a.side) lastPass = null;
            playedBall(a, 'header');
            touchedThisTick = true;
            lastTouch = a;
            a.touches++;
            a.cooldown = 0.8;
            let shotDetails;
            if (headerShot) {
              actionStatistics.release(participant(a), 'shot', time);
              stats[a.side].shots++;
              stats[a.side].xg += 0.1;
              shot = { side: a.side, actor: a, time };
              shotDetails = registerAttempt(a);
              pendingPass = null;
            } else {
              const defendingHeader = localX(ball.x, direction(a.side)) < 35;
              actionStatistics.release(
                participant(a),
                defendingHeader ? 'clearance' : 'pass',
                time,
                { expiresAt: time + flight + 1.8 },
              );
              resolveAttempt();
              attributeTouch(attribution, statisticalPlayer(a), null, true);
              a.passes++;
              stats[a.side].passes++;
              pendingPass = {
                actor: a,
                time,
                target,
                arrivalAt: time + flight,
                expiresAt: time + flight + 1.8,
              };
              lastPass = null;
            }
            event(
              headerShot ? 'shot' : 'header',
              a.side,
              `${a.player.name}${headerShot ? '头球攻门！' : '争到高球并顶向前场。'}`,
              a,
              headerShot
                ? { ...shotDetails, xg: 0.1, bodyPart: 'head' }
                : { intent: 'headedPass', bodyPart: 'head' },
            );
            return;
          }
        }
        if (!a.keeperHold && (distance(a.pos, ball) > 0.92 || !touchesBall(physics, a.foot)))
          return;
        if (checkInvolvement(a)) {
          active = false;
          return;
        }
        if (
          restartPlay &&
          !restartPlay.touched &&
          restartPlay.taker === a.player.id &&
          deliberate?.playerId === a.player.id
        ) {
          offence(
            'doubleTouch',
            a.side,
            a,
            ball.x,
            ball.z,
            `${a.player.name}重开后连续两次触球，判间接任意球。`,
          );
          active = false;
          return;
        }
        const previous = contestOwner(continuity, actors, ball, time);
        if (previous && previous !== a && previous.side !== a.side && time < a.tackleAt) return;
        if (
          previous &&
          previous !== a &&
          previous.side !== a.side &&
          distance(previous.pos, a.pos) < 1.8 &&
          time >= a.tackleAt
        ) {
          if (!tackleWindow(a, previous, ball)) {
            // Jockeying is not a failed tackle. Do not trigger the post-tackle
            // retreat here, which otherwise renews forever against close control.
            return;
          }
          a.tackleAt = time + tackleRecoverySeconds(a, previous);
          a.tackles++;
          actionStatistics.challenge(participant(a), previous.player.id, time);
          const qa = actionQuality(
            a,
            ball,
            'tackling',
            playing().filter((o) => o.side !== a.side),
          ).value;
          const qd = actionQuality(
            previous,
            ball,
            'dribbling',
            playing().filter((o) => o.side !== previous.side),
          ).value;
          const success = tackleProbability(a, previous, ball, playing(), qa, qd),
            won = rulesRng() <= success;
          const relative = Math.hypot(
            a.velocity.x - previous.velocity.x,
            a.velocity.z - previous.velocity.z,
          );
          const late = clamp((distance(a.pos, ball) - distance(previous.pos, ball)) / 1.1, 0, 1),
            danger = clamp((relative - 2) / 9, 0, 1);
          const penalty = inPenaltyArea(ball, direction(a.side));
          const progress = localX(previous.pos.x, direction(previous.side));
          const covering = playing().filter(
            (o) =>
              o.side === a.side &&
              o !== a &&
              localX(o.pos.x, direction(previous.side)) > progress,
          ).length;
          const contact = physicalPlayerContact(physics, a, previous) ? 1 : 0;
          const judgement = contact
            ? foulAssessment(
                {
                  tackling: ability(a.player, 'tackling'),
                  late,
                  danger,
                  contact,
                  wonBall: won,
                  aggression: a.player.personality?.aggression ?? 50,
                  penalty,
                  dogso: progress > 82 && Math.abs(ball.z - 34) < 12 && covering <= 1,
                },
                rulesRng(),
              )
            : { foul: false, probability: 0, severity: 'noContact', card: null };
          if (judgement.foul) {
            actionStatistics.failedChallenge(participant(a), previous.player.id, time);
            event('challengeFailed', a.side, `${a.player.name}的抢断动作被判犯规。`, a, {
              opponentId: previous.player.id,
              quality: qa,
              opponentQuality: qd,
              probability: success,
              result: 'foul',
            });
            a.cooldown = 0.5;
            awardChallengeFoul(a, previous, penalty, judgement);
            active = false;
            return;
          }
          if (!won) {
            actionStatistics.failedChallenge(participant(a), previous.player.id, time);
            event('challengeFailed', a.side, `${a.player.name}尝试抢断未能夺球。`, a, {
              opponentId: previous.player.id,
              quality: qa,
              opponentQuality: qd,
              probability: success,
              result: 'failed',
            });
            a.cooldown = 0.5;
            return;
          }
          a.wonTackles++;
          a.pendingStatTackle = { opponentId: previous.player.id, second: time };
          previous.tackleAt = Math.max(previous.tackleAt, time + 1.2);
          previous.cooldown = Math.max(previous.cooldown, 0.7);
          event('challenge', a.side, `${a.player.name}抢断对抗占优，继续争夺球权。`, a, {
            opponentId: previous.player.id,
            quality: qa,
            opponentQuality: qd,
            probability: success,
            result: 'won',
          });
          const poke = tackleRelease(a, previous, ball, playing(), qa);
          if (poke && kick(physics, a, poke)) {
            statisticalDeflection(a, incomingSample);
            playedBall(a, 'tackle');
            touchedThisTick = true;
            lastTouch = a;
            lastPass = null;
            pendingPass = null;
            shot = null;
            a.touches++;
            a.cooldown = 0.25 + (100 - ability(a.player, 'balance')) * 0.002;
            a.kickPlan = null;
            a.onBallPlan = null;
            a.intent = null;
            releaseControl(continuity, time, 'tackle');
            event(
              'tackleRelease',
              a.side,
              `${a.player.name}将球捅向安全侧，双方继续争夺落点。`,
              a,
              { result: 'loose', target: poke.target },
            );
            return;
          }
        }
        const incomingPass =
          pendingPass && pendingPass.actor !== a && pendingPass.actor.side === a.side
            ? pendingPass
            : null;
        const opposingPass =
          pendingPass &&
          pendingPass.actor.side !== a.side &&
          time < (pendingPass.expiresAt ?? pendingPass.time + 4)
            ? pendingPass
            : null;
        const ownCarry =
          lastTouch === a &&
          !incomingPass &&
          a.intent?.kind === 'carry' &&
          a.intent.expiresAt > time &&
          distance(a.pos, ball) < 4.2;
        const ownPreparation =
          a.kickPlan && lastTouch === a && (!previous || previous === a) && !incomingPass;
        const newControl =
          !a.keeperHold &&
          (previous !== a || Boolean(incomingPass)) &&
          !ownCarry &&
          !ownPreparation;
        if (newControl) {
          a.intent = null;
          a.onBallPlan = null;
          if (lastPass && lastPass.receiver.side !== a.side) lastPass = null;
        }
        const incoming = Math.hypot(bv.x - a.velocity.x, bv.z - a.velocity.z);
        // A fast pass can strike a leg/body immediately, but reacting and
        // deliberately cushioning it is a separate action. Slow exposed balls
        // remain playable at once; ordinary physical collisions stay enabled.
        if (opposingPass && !canReactToPass(a, opposingPass.time, time, incoming)) return;
        const control =
          previous && previous.side !== a.side
            ? ability(a.player, 'tackling') * 0.65 + ability(a.player, 'firstTouch') * 0.35
            : actionQuality(
                a,
                ball,
                'firstTouch',
                playing().filter((o) => o.side !== a.side),
              ).value;
        const reception = receptionPlan(
          a,
          ball,
          direction(a.side),
          control,
          incoming,
          playing().filter((o) => o.side !== a.side),
          time,
        );
        if (newControl) {
          a.readyAt = time + reception.delay;
          a.lastReceptionPreparation = a.receivePreparation
            ? Math.max(0, time - a.receivePreparation.startedAt)
            : 0;
          a.receivePreparation = null;
        }
        const confirmControl = () => {
          actionStatistics.control(participant(a), time);
          if (incomingPass) receivePass(a, incomingPass);
          if (newControl) {
            if ((previous && previous.side !== a.side) || opposingPass) {
              lastPass = null;
              shot = null;
            }
            if (pendingPass && pendingPass.actor !== a) pendingPass = null;
            a.hold = 0;
          }
          controlBall(continuity, a, time, incomingPass, Boolean(opposingPass));
        };
        if (newControl && incoming > 11 + control * 0.3) {
          // A difficult first touch dissipates only part of momentum and may spill loose.
          kick(physics, a, {
            x: bv.x * 0.45 + (rng() - 0.5) * 3,
            y: Math.max(0.2, bv.y * 0.2),
            z: bv.z * 0.45 + (rng() - 0.5) * 3,
          });
          statisticalDeflection(a, incomingSample);
          playedBall(a, 'control');
          touchedThisTick = true;
          matchShock(a.player, 0, -2);
          event('miscontrol', a.side, `${a.player.name}来球过快，停球未稳。`, a, {
            quality: control,
            incoming,
            result: 'loose',
          });
          if (actionStatistics.state.context?.player.id === a.player.id)
            actionStatistics.release(participant(a), 'miscontrol', time);
          else actionStatistics.blockedPass(participant(a), time, 'foot');
          releaseControl(continuity, time, 'miscontrol');
          continuity.metrics.errors[
            playing().some((o) => o.side !== a.side && distance(o.pos, ball) < 3)
              ? 'forced'
              : 'unforced'
          ]++;
          a.cooldown = 0.35 + (100 - ability(a.player, 'balance')) / 200;
        } else {
          const oneTouch =
            a.kickPlan?.oneTouch ??
            Boolean(
              incomingPass &&
              ((ability(a.player, 'firstTouch') >= 78 && ability(a.player, 'decisions') >= 72) ||
                (localX(ball.x, direction(a.side)) < 35 &&
                  reception.pressArrival < reception.delay)),
            );
          if (newControl && !a.setPiece && !oneTouch) {
            kick(
              physics,
              a,
              firstTouchVelocity(
                a,
                ball,
                direction(a.side),
                control,
                incoming,
                rng,
                playing().filter((o) => o.side !== a.side),
                reception,
              ),
            );
            statisticalDeflection(a, incomingSample);
            confirmControl();
            playedBall(a, 'control');
            touchedThisTick = true;
            lastTouch = a;
            a.touches++;
            a.cooldown = 0.14 + 0.18 * (1 - control / 100);
            a.hold = 0;
            a.intent = {
              kind: reception.flow ? 'carry' : 'settle',
              mode: reception.flow ? 'carryFast' : 'carry',
              destination: reception.destination,
              shieldHeading: reception.shieldHeading,
              expiresAt: time + (reception.flow ? 1.8 : reception.delay),
            };
            a.target = reception.destination;
            event('control', a.side, `${a.player.name}调整第一脚触球，为下一步处理留出空间。`, a, {
              quality: control,
              flow: reception.flow,
              preparation: reception.delay,
              result: 'controlled',
            });
            return;
          }
          const urgentRecovery =
            localX(ball.x, direction(a.side)) < 35 &&
            reception.pressArrival < Math.max(0, (a.readyAt ?? 0) - time) + 0.4;
          if (!a.setPiece && !oneTouch && !urgentRecovery && time < (a.readyAt ?? 0)) {
            // A settling touch must respect the same running inertia as a
            // carry. Scaling world velocity to 40% leaves the ball behind a
            // still-running receiver, particularly after a defensive recovery.
            if (incoming > 0.8 || distance(a.pos, ball) > 0.72) {
              kick(physics, a, motorTouch(a, ball, rng));
              statisticalDeflection(a, incomingSample);
              touchedThisTick = true;
              lastTouch = a;
              a.cooldown = 0.2;
            }
            return;
          }
          const lapseProbability = clamp(
            0.0015 *
              Math.exp((50 - ability(a.player, 'concentration')) / 30) *
              (1 + 0.8 * (1 - a.energy / 100)),
            0.0002,
            0.012,
          );
          const opponents = playing().filter((o) => o.side !== a.side);
          const scan = !a.kickPlan && needsOnBallScan(a, ball, opponents, time);
          const actionRng = random(
            seedFrom(`${seed}:action:${scan ? ++actionNumber : actionNumber}`),
          );
          const lapse =
            a.kickPlan?.lapse ??
            (scan ? actionRng() < lapseProbability : Boolean(a.onBallPlan.action.quality?.lapse));
          let action =
            a.kickPlan?.action ??
            (!scan
              ? a.onBallPlan.action
              : chooseAction(
                  a,
                  playing(),
                  ball,
                  direction(a.side),
                  clubs[a.side].tactics,
                  actionRng,
                  {
                    minute: (time * CLOCK_SCALE) / 60,
                    time,
                    trailing: score[a.side] < score[1 - a.side],
                    lapse,
                    continuity,
                    oneTouch,
                  },
                ));
          if (scan) rememberOnBallAction(a, action, ball, opponents, time);
          // Before the legal eight-second deadline a keeper chooses to release
          // even without a safe short outlet. This is a Laws-of-the-Game decision,
          // not a general possession duration limit.
          if (a.keeperHold && time - a.keeperHold.startedAt > 7 && action.type === 'hold') {
            action = {
              type: 'pass',
              intent: 'clearance',
              quality: actionQuality(a, ball, 'distribution', opponents),
              destination: { x: clamp(ball.x + direction(a.side) * 40, 1, 104), z: 34 },
              reason: '接近手持球时限，向前释放球',
              x: direction(a.side) * 20,
              y: 5,
              z: 0,
              flight: 2,
            };
          }
          if (action.type === 'hold') {
            a.cooldown = 0.25;
            if (incoming > 0.4 || distance(a.pos, ball) > 0.65) {
              if (kick(physics, a, motorTouch(a, ball, rng))) {
                playedBall(a, 'control');
                touchedThisTick = true;
                lastTouch = a;
                a.touches++;
              }
            }
            return;
          }
          if (action.type === 'dribble') action = { ...action, ...motorTouch(a, ball, rng) };
          let execution = null;
          if (action.type !== 'dribble') {
            if (!a.kickPlan)
              a.kickPlan = prepareKick(a, action, ball, time, actionNumber, lapse, oneTouch);
            a.target = kickTarget(a, ball);
            if (!kickReady(a, time)) return;
            execution = a.kickPlan;
            action = releasedKick(execution, ball, playing());
            if (action.receiverId && !execution.reviewed) {
              const risk = interceptionRisk(
                ball,
                action.destination,
                Math.hypot(action.x, action.z),
                opponents,
                Boolean(action.kickFlight),
                action.flight ?? action.kickFlight,
              );
              if (risk > 1 - (action.estimatedSuccess ?? 0.8) + 0.2) {
                const reviewRng = random(seedFrom(`${seed}:action-review:${execution.actionId}`));
                const alternative = chooseAction(
                  a,
                  playing(),
                  ball,
                  direction(a.side),
                  clubs[a.side].tactics,
                  reviewRng,
                  {
                    minute: time / 60,
                    time,
                    trailing: score[a.side] < score[1 - a.side],
                    continuity,
                  },
                );
                if (
                  alternative.type === 'hold' ||
                  alternative.type === 'dribble' ||
                  alternative.receiverId !== action.receiverId
                ) {
                  a.kickPlan = null;
                  rememberOnBallAction(a, alternative, ball, opponents, time);
                  a.cooldown = 0;
                  return;
                }
              }
              execution.reviewed = true;
            }
          }
          if (a.keeperHold) {
            if (!touchesBall(physics, a.hands)) return;
            const forward =
              (ball.x - a.pos.x) * Math.cos(a.facing) + (ball.z - a.pos.z) * Math.sin(a.facing);
            if (forward < 0.25) return;
            const target = action.destination ?? action.kickAim;
            action = {
              ...action,
              ...airborneVelocity(ball, { ...target, y: 0.2 }, Math.max(0.5, action.flight ?? 2)),
              bodyPart: 'hands',
            };
            releaseCatch(physics, a);
            if (!kick(physics, a, action, a.hands)) return;
          } else if (!kick(physics, a, action)) return;
          if (newControl || a.setPiece) confirmControl();
          a.kickPlan = null;
          if (action.type !== 'dribble') a.onBallPlan = null;
          playedBall(a, action.type, action.receiverId);
          touchedThisTick = true;
          const explanation = {
            actionId: execution?.actionId ?? actionNumber,
            bodyPart: action.bodyPart,
            preparation: execution
              ? { seconds: time - execution.startedAt, facing: a.facing }
              : undefined,
            receiverId: action.receiverId,
            destination: action.destination,
            quality: action.quality,
            result: 'impulse',
            intent: action.intent,
            delivery: action.delivery,
            phase: action.phase,
            setPiece: a.setPiece ?? undefined,
            decision: action.reason,
            estimatedSuccess: action.estimatedSuccess,
            velocity: { ...physics.ball.linvel() },
            reason: lapse
              ? '专注失误降低动作质量'
              : action.quality.foot < 1
                ? '逆足处理影响动作精度'
                : action.quality.pressure > 0.5
                  ? '贴身压迫影响动作精度'
                  : '按当前空间执行动作',
          };
          if (action.type !== 'dribble') releaseControl(continuity, time, action.type);
          if (action.type === 'shot') {
            actionStatistics.release(participant(a), 'shot', time);
            stats[a.side].shots++;
            stats[a.side].xg += action.xg;
            shot = { side: a.side, actor: a, time };
            const shotDetails = registerAttempt(a);
            event('shot', a.side, `${a.player.name}起脚射门！`, a, {
              xg: action.xg,
              ...explanation,
              ...shotDetails,
            });
            pendingPass = null;
          } else if (action.type !== 'dribble') {
            actionStatistics.release(
              participant(a),
              action.intent === 'clearance' ? 'clearance' : 'pass',
              time,
              { expiresAt: time + (action.flight ?? 2) + 1.8 },
            );
            resolveAttempt();
            attributeTouch(attribution, statisticalPlayer(a), null, true);
            lastPass = null;
            a.passes++;
            if (action.intent === 'through') a.throughBalls++;
            if (['switch', 'cross', 'clearance'].includes(action.intent)) a.longPasses++;
            if (oneTouch) a.oneTouchPasses++;
            stats[a.side].passes++;
            pendingPass = {
              actor: a,
              time,
              receiverId: action.receiverId,
              actionId: explanation.actionId,
              target: action.destination,
              arrivalAt: time + (action.flight ?? 2),
              expiresAt: time + (action.flight ?? 2) + 1.8,
              pressure: action.quality.pressure,
            };
            shot = null;
            if (events.length < 25000)
              event(
                action.type,
                a.side,
                `${a.player.name}${action.delivery === 'cutback' ? '下底倒三角回传。' : action.delivery === 'low' ? '低平球横传禁区。' : ({ through: '将球送入队友前插的空间。', switch: '长传转移到另一侧。', cross: '送出高空传中。', clearance: '将球解围到安全区域。', feet: '将球快速传到队友脚下。' }[action.intent] ?? '传球寻找队友。')}`,
                a,
                explanation,
              );
          }
          a.cooldown =
            action.type === 'dribble'
              ? 0.22 + 0.16 * (1 - ability(a.player, 'dribbling') / 100)
              : kickRecovery(a, action);
          if (action.type === 'dribble') {
            if (action.intent === 'takeOn') {
              const opponent = playing()
                .filter((o) => o.side !== a.side)
                .sort(
                  (x, y) =>
                    distance(x.body.translation(), ball) - distance(y.body.translation(), ball),
                )[0];
              actionStatistics.takeOn(
                participant(a),
                opponent ? participant(opponent) : null,
                ball,
                time,
                direction(a.side),
                action.destination,
              );
            }
            resolveAttempt();
            attributeTouch(attribution, statisticalPlayer(a), null, true);
            a.target = action.destination;
            a.carries++;
            event(
              'dribble',
              a.side,
              `${a.player.name}${action.intent === 'takeOn' ? '变向带球挑战防守者。' : '短触球向前推进。'}`,
              a,
              explanation,
            );
          }
          a.setPiece = null;
        }
        a.setPiece = null;
        lastTouch = a;
        a.touches++;
      };
      const actionOrder = actors
        .slice()
        .sort((a, b) => distance(a.pos, ball) - distance(b.pos, ball) || a.bias - b.bias);
      const movementStarts = actors.map((a) => a.body.translation());
      for (const a of actionOrder) {
        if (a.sentOff) continue;
        if (active && roles.chasers.includes(a.index))
          a.pressSeconds = (a.pressSeconds ?? 0) + STEP;
        if (active && roles.marking?.[a.player.id])
          a.markingSeconds = (a.markingSeconds ?? 0) + STEP;
        a.pos = a.body.translation();
        a.velocity = a.body.linvel();
        a.direction = direction(a.side);
        a.maxSpeed = Math.max(a.maxSpeed, Math.hypot(a.velocity.x, a.velocity.z));
        a.energy = updateMatchEnergy(
          a.player,
          a.energy,
          Math.hypot(a.velocity.x, a.velocity.z),
          clubs[a.side].tactics.press,
          active,
          STEP * CLOCK_SCALE,
        );
        a.player.matchState.energy = a.energy;
        a.player.matchState.mental = mentalModifier(a.player.matchState);
        a.cooldown -= STEP;
        a.hold = owner === a ? a.hold + STEP : 0;
        if (
          a.kickPlan &&
          (time > a.kickPlan.until ||
            distance(a.kickPlan.ball, ball) > 2.4 ||
            (continuity.controller !== null && continuity.controller !== a.index))
        ) {
          a.kickPlan = null;
          a.intent = null;
        }
        if (active && a.kickPlan) {
          trackKickReceiver(a, playing(), ball, time);
          a.target = kickTarget(a, ball);
        }
        if (
          active &&
          !deadState &&
          !owner &&
          !a.isKeeper &&
          !a.kickPlan &&
          lastTouch?.side !== a.side &&
          roles.chasers.includes(a.index) &&
          Math.hypot(ball.vx, ball.vz) > 5 &&
          time >= (a.interceptAt ?? 0)
        ) {
          const reaction = 0.08 + (100 - ability(a.player, 'anticipation')) * 0.002;
          const releasedAt = pendingPass?.time ?? shot?.time ?? time - reaction;
          if (time - releasedAt >= reaction) {
            a.target = targetFor(
              a,
              playing(),
              ball,
              null,
              direction(a.side),
              clubs[a.side].tactics,
              roles.chasers,
              { ...roles, time },
            );
            a.interceptAt = time + reaction;
          }
        }
        updateFacing(a, ball, STEP, time);
        moveCatch(physics, a);
        orientFoot(a, ball);
        if (a.hands) {
          const incoming =
            active &&
            !deadState &&
            !a.keeperHold &&
            bv.x * direction(a.side) < -8 &&
            Math.abs(ball.x - a.pos.x) < 25;
          const response = Math.max(
            0.08,
            a.reaction - (a.keeperSet?.until > time ? a.keeperSet.readiness * 0.12 : 0),
          );
          const ready = incoming && (!shot || time - shot.time >= response);
          a.diveLean = clamp(
            (a.diveLean ?? 0) +
              (ready ? STEP * (1.5 + ability(a.player, 'oneOnOnes') * 0.02) : -STEP * 2),
            0,
            1,
          );
          const target = ready ? keeperHandTarget(a, ball, time) : ball;
          const reach = 0.45 + ability(a.player, 'oneOnOnes') * 0.004 + a.height * 0.4 * a.diveLean;
          orientHands(a, target, reach, STEP);
        }
        if (active && a.isKeeper && tick % 2 === 0)
          a.target = targetFor(
            a,
            playing(),
            ball,
            owner,
            direction(a.side),
            clubs[a.side].tactics,
            roles.chasers,
            { ...roles, time },
          );
        if (deadState && !a.kickPlan)
          a.target = deadballTarget(a, playing(), deadState, direction, time);
        const target = a.target;
        const dx = target.x - a.pos.x,
          dz = target.z - a.pos.z,
          gap = Math.hypot(dx, dz);
        a.movementMode =
          active && !deadState
            ? movementMode(a, ball, owner, roles, gap)
            : gap > 6
              ? 'run'
              : gap > 1.5
                ? 'jog'
                : 'walk';
        const m = movement(a.player, a.energy, a.movementMode);
        // Separation steers around teammates; Rapier resolves any remaining body contacts.
        let vx = gap > 0.2 ? (dx / gap) * Math.min(m.speed, gap * 2) : 0;
        let vz = gap > 0.2 ? (dz / gap) * Math.min(m.speed, gap * 2) : 0;
        if (active && !deadState) {
          const following = markingVelocity(a, owner, roles);
          vx += following.x;
          vz += following.z;
          if (
            !a.keeperHold &&
            (owner === a || (a.kickPlan && lastTouch === a && distance(a.pos, ball) < 2.6))
          ) {
            const controlled = controlMovement(a, ball);
            vx = controlled.x;
            vz = controlled.z;
          }
        }
        if (gap > 1)
          for (const o of actors) {
            if (o.sentOff || o === a || o.side !== a.side) continue;
            const d = distance(a.pos, o.pos);
            if (d > 0.01 && d < 1.4) {
              vx += ((a.pos.x - o.pos.x) / d) * (1.4 - d) * 2;
              vz += ((a.pos.z - o.pos.z) / d) * (1.4 - d) * 2;
            }
          }
        if (deadState && gap > 1) {
          const routed = restartAvoidance(a, actors, { x: vx, z: vz });
          vx = routed.x;
          vz = routed.z;
        }
        const diving =
          a.isKeeper && bv.x * direction(a.side) < -8 && Math.abs(ball.x - a.pos.x) < 25;
        if (diving) vz = keeperDiveVelocity(a, ball, time) ?? vz;
        const setStance = a.keeperSet?.until > time ? a.keeperSet.readiness : 0;
        driveMovement(
          a,
          { x: vx, z: vz },
          m,
          STEP,
          diving ? diveResponse(a.player) * (1 + 0.4 * setStance) : 1,
        );
        attemptTouch(a);
      }
      const beforeBall = physics.ball.translation();
      stepPhysics(
        physics,
        active
          ? () => {
              if (touchedThisTick) return;
              for (const a of actionOrder) {
                if (!a.sentOff) attemptTouch(a);
                if (touchedThisTick) break;
              }
            }
          : null,
        actors,
        (sample) => {
          if (!active) return;
          const contacts = new Set();
          physics.world.contactPairsWith(physics.collider, (collider) => {
            let touching = false;
            physics.world.contactPair(physics.collider, collider, (m) => {
              if (m.numSolverContacts() > 0) touching = true;
            });
            if (!touching) return;
            contacts.add(collider.handle);
            if (statisticalContacts.has(collider.handle)) return;
            const a = colliderActors.get(collider.handle);
            if (a && !a.sentOff) {
              actionStatistics.blockedPass(participant(a), time);
              statisticalDeflection(a, sample);
              // The Rapier body collision is an actual touch. Restart ownership
              // (corner vs goal kick/throw-in) must use this physical toucher,
              // not the last intentional kick that happened before the deflection.
              lastTouch = a;
            } else if (!collider.parent() && attribution.attempt) {
              const p = collider.translation();
              if ((Math.abs(p.x) < 0.1 || Math.abs(p.x - 105) < 0.1) && p.y > 1)
                attribution.attempt.woodwork = true;
            }
          });
          statisticalContacts = contacts;
        },
      );
      if (assessCarrierContactFouls(active)) active = false;
      // A referee-placed restart ball is not live until deliberately kicked.
      // Waiting bodies cannot knock it out repeatedly before the restart.
      if (deadState && deadState.type !== 'goal') {
        physics.ball.setTranslation({ ...deadState.ball, y: BALL_RADIUS + 0.015 }, true);
        physics.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
        physics.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
      const afterBall = physics.ball.translation();
      if (active && actionStatistics.state.takeOn) {
        const duel = actionStatistics.state.takeOn;
        const involved = [actorById(duel.player.id), actorById(duel.opponentId)].filter(
          (a) => a && !a.sentOff,
        );
        actionStatistics.observe(
          involved.map(participant),
          afterBall,
          continuity.controller === null ? null : actors[continuity.controller]?.player.id,
          time,
        );
      }
      for (const a of actors)
        if (!a.sentOff)
          recordMovement(
            a,
            movementStarts[a.index],
            a.body.translation(),
            STEP,
            active,
            continuity.controller === a.index,
          );
      if (!active && deadState && deadState.type !== 'goal') {
        physics.ball.setTranslation(
          { x: deadState.ball.x, y: BALL_RADIUS + 0.015, z: deadState.ball.z },
          true,
        );
        physics.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
        physics.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
      // Body deflections count as touches even without an intentional foot action.
      physics.world.contactPairsWith(physics.collider, (c) => {
        const a = actors.find(
          (a) => a.collider.handle === c.handle || a.legs.some((leg) => leg.handle === c.handle),
        );
        if (a && !a.sentOff && active) {
          let contact = false;
          physics.world.contactPair(physics.collider, c, (manifold) => {
            if (manifold.numSolverContacts() > 0) contact = true;
          });
          if (contact) {
            if (checkInvolvement(a)) {
              active = false;
              return;
            }
            if (deliberate?.side !== a.side) deliberate = null;
            if (restartPlay && restartPlay.taker !== a.player.id) restartPlay.touched = true;
            lastTouch = a;
          }
        }
      });
      if (active) {
        if (
          afterBall.z < -BALL_RADIUS ||
          afterBall.z > 68 + BALL_RADIUS ||
          afterBall.x < -BALL_RADIUS ||
          afterBall.x > 105 + BALL_RADIUS
        ) {
          if (goalCrossing(beforeBall, afterBall) === null) {
            const cause = shot
              ? 'shotOut'
              : pendingPass
                ? lastTouch?.side !== pendingPass.actor.side
                  ? 'deflected'
                  : pendingPass.pressure > 0.45
                    ? 'forced'
                    : 'unforced'
                : 'carryOut';
            continuity.metrics.errors[cause]++;
            event(
              'out',
              lastTouch?.side ?? restartSide,
              `皮球出界：${{ shotOut: '射门偏出', deflected: '对手碰球后折出', forced: '受压传球未能保留', unforced: '传球未被接住', carryOut: '控制或争抢中出界' }[cause]}。`,
              lastTouch,
              { cause },
            );
          }
        }
        const end = goalCrossing(beforeBall, afterBall);
        if (end !== null && restartPlay?.kind === 'indirect' && !restartPlay.touched) {
          const defending = direction(0) === (end === 0 ? 1 : -1) ? 0 : 1;
          restart('goalKick', defending, end === 0 ? 5.5 : 99.5, 34);
        } else if (end !== null) {
          const side = direction(0) === (end === 1 ? 1 : -1) ? 0 : 1;
          score[side]++;
          const credit = goalCredit(
            attribution,
            side,
            lastTouch ? statisticalPlayer(lastTouch) : null,
          );
          const scorer = actorById(credit.playerId);
          const credited = scorer ?? actorById(credit.ownGoalId);
          const identity = credited
            ? `${credited.player.number}号 ${credited.player.name}`
            : '对方球员';
          if (scorer && attribution.attempt?.playerId !== scorer.player.id) {
            const details = registerAttempt(scorer);
            stats[side].shots++;
            event('shot', side, `${scorer.player.name}的触球直接入网。`, scorer, {
              ...details,
              attributedFrom: 'goal',
            });
          }
          const outcome = resolveAttempt(scorer?.player.id);
          event(
            'goal',
            side,
            `${identity}${scorer ? '破门' : '乌龙球'}！${clubs[side].name}改写比分为 ${score.join(' : ')}。`,
            scorer,
            {
              score: [...score],
              ...(outcome ? { shotId: outcome.shotId } : {}),
              ...(credited
                ? {
                    scorer: {
                      id: credited.player.id,
                      number: credited.player.number,
                      name: credited.player.name,
                      side: credited.side,
                    },
                  }
                : {}),
              ...(scorer ? {} : { ownGoal: true }),
              ...(scorer && outcome?.assistId ? { assistId: outcome.assistId } : {}),
            },
          );
          shock(side, 2, scorer, 3);
          shock(1 - side, -2);
          // Keep the actual goal/net trajectory visible before the dead-ball reset.
          restartUntil = time + 15;
          restartTaker = null;
          owner = null;
          pendingPass = null;
          shot = null;
          goalRestart = { side: 1 - side, at: restartUntil };
          actors.forEach((a) => (a.kickPlan = null));
          deadBall(continuity, time, 'goal');
          actionStatistics.stop('goal', side, time);
          const leader = scorer ?? playing().find((a) => a.side === side && !a.isKeeper);
          deadState = {
            type: 'goal',
            side: 1 - side,
            scoringSide: side,
            startedAt: time,
            scorerId: leader?.player.id,
            celebration: {
              x: clamp(afterBall.x - direction(side) * 7, 4, 101),
              z: afterBall.z < 34 ? 12 : 56,
            },
          };
        } else if (afterBall.z < -BALL_RADIUS || afterBall.z > 68 + BALL_RADIUS) {
          restart(
            'throwIn',
            lastTouch ? 1 - lastTouch.side : restartSide,
            clamp(afterBall.x, 2, 103),
            afterBall.z < 0 ? 0.3 : 67.7,
          );
        } else if (afterBall.x < -BALL_RADIUS || afterBall.x > 105 + BALL_RADIUS) {
          const end = afterBall.x < 0 ? 0 : 1;
          const defending = direction(0) === (end === 0 ? 1 : -1) ? 0 : 1;
          if (lastTouch?.side === defending)
            restart(
              'corner',
              1 - defending,
              end === 0 ? 0.6 : 104.4,
              afterBall.z < 34 ? 0.6 : 67.4,
            );
          else restart('goalKick', defending, end === 0 ? 5.5 : 99.5, 34);
        }
        const s = owner?.side ?? (continuity.phase === 'flight' ? continuity.side : undefined);
        if (s === 0 || s === 1) stats[s].possessionTicks++;
      } else if (restartTaker) {
        // At the whistle, the taker pursues the stationary ball; all subsequent touches are physical.
        restartTaker.target = { x: afterBall.x, z: afterBall.z };
      }
      if (tick % 4 === 0) {
        if (active) {
          if (pendingPass && time - pendingPass.time < 1.2) {
            motion.passSpeedSum += Math.hypot(bv.x, bv.z);
            motion.passSamples++;
          }
          for (const a of actors.filter((a) => !a.sentOff)) {
            motion.playerSpeedSum += Math.hypot(a.velocity.x, a.velocity.z);
            motion.playerSamples++;
            if (a.movementMode === 'sprint') motion.sprintSamples++;
          }
        }
        record();
      }
      if (frames && tick % 600 === 0)
        timeline.push({
          second: time,
          stats: publicStats(),
          performance: playerStats(true),
          continuity: timelineContinuity(),
        });
      if (abandoned) break;
      if (tick % sliceTicks === 0 && tick < ticks) {
        const part = {
          second: time,
          trajectory: frames?.slice(chunkStart, cursor),
          report: options.durable ? buildReport() : undefined,
          checkpoint: options.durable ? checkpoint(tick) : undefined,
        };
        chunkStart = cursor;
        yield part;
      }
    }
    resolveAttempt();
    deadBall(continuity, time, 'fulltime');
    actionStatistics.stop('fulltime', null, time);
    event(
      'fulltime',
      0,
      abandoned ? '一队不足七人，比赛中止，按中止时比分结算。' : '全场比赛结束。',
    );
    let penalties,
      penaltyFrames = null;
    if (options.knockout && score[0] === score[1] && !abandoned) {
      shootoutPhase = true;
      const outcome = shootout({
        physics,
        actors,
        seed,
        time,
        event: (t, side, text, a, extra, second) => {
          time = second;
          event(t, side, text, a, extra);
        },
        direction,
      });
      penalties = outcome.score;
      penaltyFrames = outcome.frames;
      time = outcome.time;
    }
    const report = buildReport(penalties, abandoned);
    if (frames) {
      report.replay = {
        format: 'positions-u16-v1',
        sampleHz: SAMPLE_HZ,
        stride: FRAME_STRIDE,
        frameCount: cursor / FRAME_STRIDE + (penaltyFrames?.length ?? 0) / FRAME_STRIDE,
        duration: penaltyFrames || abandoned ? time : duration,
        regulationDuration: abandoned ? time : duration,
        clockScale: CLOCK_SCALE,
        physics: 'Rapier 3D 0.21.0',
        stepHz: 20,
        players: actors.map((a) => ({
          id: a.player.id,
          side: a.side,
          number: a.player.number,
          name: a.player.name,
          role: a.player.role,
          positionRole: a.positionRole,
        })),
      };
      report.trajectory = new Uint16Array(cursor + (penaltyFrames?.length ?? 0));
      report.trajectory.set(frames.subarray(0, cursor));
      if (penaltyFrames) report.trajectory.set(penaltyFrames, cursor);
    }
    return report;
  } finally {
    physics.world.free();
  }
}
