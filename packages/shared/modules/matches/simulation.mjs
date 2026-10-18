import { packActors, unpackActors } from './checkpoint.mjs';
import { firstTouchVelocity } from './receiving.mjs';
import { keeperReaction, diveResponse } from './goalkeeping.mjs';
import { driveMovement } from './locomotion.mjs';
import {
  continuityState,
  updateContinuity,
  controlBall,
  releaseControl,
  deadBall,
} from './continuity.mjs';
import { random, clamp, seedFrom } from '../../core/index.mjs';
import { createMatchState, matchShock, energyCost, mentalModifier } from '../players/index.mjs';
import {
  RULES_VERSION,
  inPenaltyArea,
  offsideSnapshot,
  offsideInvolvement,
  foulAssessment,
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
  createHands,
  orientFoot,
  orientHands,
  kick,
  touchesBall,
  stepPhysics,
  goalCrossing,
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

export const ENGINE_VERSION = '0.10.0-tactical-roles';
export const PARAMETER_VERSION = 'tactics-1';
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
  const timeline = [];
  const score = [0, 0],
    events = [];
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
  function placeBall(x, z, reason) {
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
    a.body.setTranslation({ x, y: a.height / 2, z }, true);
    a.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    a.pos = { x, z };
    a.velocity = { x: 0, z: 0 };
    a.target = { x, z };
    a.hold = 0;
    a.setPiece = null;
    a.intent = null;
  }
  function kickoff(side, type = 'kickoff') {
    goalRestart = null;
    placeBall(52.5, 34, type);
    for (const a of actors) {
      if (a.sentOff) continue;
      const dir = direction(a.side);
      const x = a.isKeeper ? 5 : Math.min(47, a.anchor.x * 0.68);
      placeActor(a, dir === 1 ? x : 105 - x, a.anchor.z);
    }
    const taker =
      actors.find((a) => a.side === side && !a.sentOff && a.player.role === 'FWD') ??
      actors.find((a) => a.side === side && !a.sentOff && !a.isKeeper);
    placeActor(taker, 52.5 - direction(side) * 0.66, 34);
    restartUntil = time + 10;
    restartSide = side;
    restartTaker = taker;
    taker.setPiece = 'kickoff';
    event(type, side, type === 'half' ? '双方交换场地，下半场开始。' : '中圈开球，比赛开始。');
  }
  function restart(type, side, x, z) {
    placeBall(x, z, type);
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
    for (const a of actors)
      if (
        !a.sentOff &&
        a !== taker &&
        distance(a.pos, { x, z }) < (['freeKick', 'indirect', 'penalty'].includes(type) ? 9.15 : 3)
      )
        placeActor(
          a,
          clamp(x - direction(side) * (type === 'penalty' ? 12 : 10), 1, 104),
          clamp(a.pos.z + (a.index % 2 ? 4 : -4), 1, 67),
        );
    placeActor(taker, clamp(x - direction(side) * 0.65, 0.1, 104.9), z);
    if (
      type === 'freeKick' &&
      distance({ x, z }, { x: direction(side) === 1 ? 105 : 0, z: 34 }) < 32
    ) {
      const defenders = playing()
        .filter((a) => a.side !== side && !a.isKeeper)
        .slice(0, 3);
      const goal = { x: direction(side) === 1 ? 105 : 0, z: 34 },
        len = distance({ x, z }, goal);
      defenders.forEach((a, i) =>
        placeActor(
          a,
          x + ((goal.x - x) / len) * 9.15,
          z + ((goal.z - z) / len) * 9.15 + (i - 1) * 0.65,
        ),
      );
    }
    if (type === 'penalty') {
      for (const a of actors.filter((a) => !a.sentOff)) {
        if (a === taker) continue;
        if (a.isKeeper && a.side !== side) placeActor(a, direction(side) === 1 ? 104.95 : 0.05, 34);
        else placeActor(a, x - direction(side) * 12, clamp(8 + a.index * 2.3, 3, 65));
      }
    }
    taker.setPiece = type;
    for (const a of actors) {
      a.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      a.velocity = { x: 0, z: 0 };
    }
    restartSide = side;
    restartTaker = taker;
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
    if (a.setPiece) restartPlay = { kind: a.setPiece, taker: a.player.id, touched: false };
    else if (restartPlay && restartPlay.taker !== a.player.id) restartPlay.touched = true;
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
      cut,
      cursor,
      roles,
    } = c.state);
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
        cut,
        cursor,
        roles,
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
        xg: Math.round(row.xg * 100) / 100,
        possession: side === 0 ? home : 100 - home,
      };
    });
  }
  function playerStats() {
    return actors.map((a) => ({
      id: a.player.id,
      side: a.side,
      distance: Math.round(a.distance),
      energy: Math.round(a.energy * 10) / 10,
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
    }));
  }
  function buildReport(penalties, abandoned = false) {
    return {
      id,
      engineVersion: ENGINE_VERSION,
      rulesVersion: RULES_VERSION,
      parameterVersion: PARAMETER_VERSION,
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
      timeline: structuredClone(timeline),
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
        half = 1;
        kickoff(1, 'half');
      } else if (goalRestart && time >= goalRestart.at) {
        kickoff(goalRestart.side);
      }
      const bp = physics.ball.translation(),
        bv = physics.ball.linvel();
      const ball = { ...bp, vx: bv.x, vz: bv.z };
      let active = time >= restartUntil;
      let touchedThisTick = false;
      // Waiting for a stationary restart needs clock/recovery/samples, not 22 AI decisions
      // and a collision solve. Goal-to-net motion still runs through the physical path.
      if (!active && !goalRestart) {
        continuity.metrics.deadSeconds += STEP;
        for (const a of actors)
          if (!a.sentOff) {
            a.energy = Math.max(
              20,
              a.energy - energyCost(a.player, 0, clubs[a.side].tactics.press, false, STEP),
            );
            a.player.matchState.energy = a.energy;
            a.cooldown -= STEP;
          }
        if (tick % 4 === 0) record();
        if (frames && tick % 600 === 0)
          timeline.push({
            second: time,
            stats: publicStats(),
            performance: playerStats(),
            continuity: structuredClone(continuity.metrics),
          });
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
        continue;
      }
      owner = updateContinuity(continuity, actors, ball, time, active, pendingPass);
      if (active && tick % 6 === 0) {
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
        const ball = { ...bp, vx: bv.x, vz: bv.z };
        a.pos = a.body.translation();
        a.velocity = a.body.linvel();
        orientFoot(a, ball);
        if (!active || touchedThisTick || a.cooldown > 0) return;
        // Goalkeepers intercept physically reachable high balls with a finite hand volume.
        if (
          a.isKeeper &&
          bv.x * direction(a.side) < -1 &&
          Math.abs(a.pos.x - (direction(a.side) === 1 ? 0 : 105)) < 16.5 &&
          Math.abs(a.pos.z - 34) < 20 &&
          distance(a.pos, ball) < 0.9 + ability(a.player, 'oneOnOnes') * 0.004 &&
          ball.y < a.height + ability(a.player, 'aerialReach') * 0.008 &&
          (!shot || time - shot.time > a.reaction)
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
            const impulse = {
              x: (direction(a.side) * (retain ? 1.5 : 8) - bv.x) * physics.ball.mass(),
              y: ((retain ? 0.1 : 2.5) - bv.y) * physics.ball.mass(),
              z: ((rng() - 0.5) * (retain ? 1 : 10) - bv.z) * physics.ball.mass(),
            };
            physics.ball.applyImpulse(impulse, true);
            lastTouch = a;
            if (retain && ball.y < 1.3)
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
            if (shot && shot.side !== a.side) {
              stats[a.side].saves++;
              stats[shot.side].onTarget++;
            }
            event(
              'save',
              a.side,
              `${a.player.name}${retain ? '近身卸下来球。' : '将球扑出，皮球仍在比赛中！'}`,
              a,
            );
            shot = null;
            return;
          }
        }
        if (ball.y > 1.25 && touchesBall(physics, a.head)) {
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
            if (
              pendingPass &&
              pendingPass.actor.side === a.side &&
              pendingPass.actor !== a &&
              time - pendingPass.time < 10
            ) {
              pendingPass.actor.completed++;
              stats[a.side].completedPasses++;
              lastPass = { actor: pendingPass.actor, receiver: a, time };
            } else if (lastTouch?.side !== a.side) lastPass = null;
            playedBall(a, 'header');
            touchedThisTick = true;
            lastTouch = a;
            a.touches++;
            a.cooldown = 0.8;
            pendingPass = null;
            if (headerShot) {
              stats[a.side].shots++;
              stats[a.side].xg += 0.1;
              shot = { side: a.side, actor: a, time };
            }
            event(
              headerShot ? 'shot' : 'header',
              a.side,
              `${a.player.name}${headerShot ? '头球攻门！' : '争到高球并顶向前场。'}`,
              a,
            );
            return;
          }
        }
        if (distance(a.pos, ball) > 0.92 || !touchesBall(physics, a.foot)) return;
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
        const previous = actorAt(continuity.controller);
        if (previous && previous !== a && previous.side !== a.side && time < a.tackleAt) return;
        if (
          previous &&
          previous !== a &&
          previous.side !== a.side &&
          distance(previous.pos, a.pos) < 1.8 &&
          time >= a.tackleAt
        ) {
          a.tackleAt = time + 1.6;
          a.tackles++;
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
          const success = clamp(1 / (1 + Math.exp(-(qa - qd) / 18)), 0.02, 0.98);
          if (rulesRng() > success) {
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
            const separation = Math.max(0.1, distance(a.pos, previous.pos));
            const closing =
              ((a.velocity.x - previous.velocity.x) * (previous.pos.x - a.pos.x) +
                (a.velocity.z - previous.velocity.z) * (previous.pos.z - a.pos.z)) /
              separation;
            const judgement =
              closing > 2.2 || (late > 0.65 && relative > 1.2)
                ? foulAssessment(
                    {
                      tackling: ability(a.player, 'tackling'),
                      late,
                      danger,
                      penalty,
                      dogso: progress > 82 && Math.abs(ball.z - 34) < 12 && covering <= 1,
                    },
                    rulesRng(),
                  )
                : { foul: false, probability: 0, severity: 'standingChallenge', card: null };
            event('tackleLost', a.side, `${a.player.name}尝试抢断未能夺球。`, a, {
              opponentId: previous.player.id,
              quality: qa,
              opponentQuality: qd,
              probability: success,
              result: 'failed',
            });
            a.cooldown = 0.5;
            if (judgement.foul) {
              stats[a.side].fouls++;
              event(
                'foul',
                a.side,
                `${a.player.name}抢断犯规，${penalty ? '禁区内判罚点球！' : '对手获得任意球。'}`,
                a,
                { opponentId: previous.player.id, ...judgement },
              );
              if (judgement.card) card(a, judgement.card, '抢断动作');
              if (
                !a.sentOff &&
                rulesRng() < dissentProbability(a.player.personality?.temperament ?? 50)
              )
                card(a, 'yellow', '抗议判罚');
              restart(
                penalty ? 'penalty' : 'freeKick',
                previous.side,
                penalty ? (direction(previous.side) === 1 ? 94 : 11) : clamp(ball.x, 1, 104),
                penalty ? 34 : clamp(ball.z, 1, 67),
              );
              active = false;
            }
            return;
          }
          a.wonTackles++;
          previous.tackleAt = Math.max(previous.tackleAt, time + 1.2);
          previous.cooldown = Math.max(previous.cooldown, 0.7);
          event('tackleWon', a.side, `${a.player.name}成功抢下脚下球。`, a, {
            opponentId: previous.player.id,
            quality: qa,
            opponentQuality: qd,
            probability: success,
            result: 'won',
          });
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
        const newControl = previous !== a || Boolean(incomingPass);
        if (newControl) {
          a.intent = null;
          a.readyAt = time + 0.65 + (100 - ability(a.player, 'decisions')) * 0.012;
        }
        if (newControl) {
          if (opposingPass) {
            stats[a.side].interceptions++;
            event('interception', a.side, `${a.player.name}切断传球并控制住球。`, a, {
              passerId: opposingPass.actor.player.id,
              result: 'controlled',
            });
          }
          if ((previous && previous.side !== a.side) || opposingPass) {
            lastPass = null;
            shot = null;
          }
          if (pendingPass && pendingPass.actor !== a) pendingPass = null;
          a.hold = 0;
        }
        const incoming = Math.hypot(bv.x - a.velocity.x, bv.z - a.velocity.z);
        const control =
          previous && previous.side !== a.side
            ? ability(a.player, 'tackling') * 0.65 + ability(a.player, 'firstTouch') * 0.35
            : actionQuality(
                a,
                ball,
                'firstTouch',
                playing().filter((o) => o.side !== a.side),
              ).value;
        if (newControl && incoming > 11 + control * 0.3) {
          // A difficult first touch dissipates only part of momentum and may spill loose.
          kick(physics, a, {
            x: bv.x * 0.45 + (rng() - 0.5) * 3,
            y: Math.max(0.2, bv.y * 0.2),
            z: bv.z * 0.45 + (rng() - 0.5) * 3,
          });
          playedBall(a, 'control');
          touchedThisTick = true;
          matchShock(a.player, 0, -2);
          event('miscontrol', a.side, `${a.player.name}来球过快，停球未稳。`, a, {
            quality: control,
            incoming,
            result: 'loose',
          });
          releaseControl(continuity, time, 'miscontrol');
          continuity.metrics.errors[
            playing().some((o) => o.side !== a.side && distance(o.pos, ball) < 3)
              ? 'forced'
              : 'unforced'
          ]++;
          a.cooldown = 0.35 + (100 - ability(a.player, 'balance')) / 200;
        } else {
          controlBall(continuity, a, time, incomingPass, Boolean(opposingPass));
          if (incomingPass && incomingPass.actor.side === a.side && time - incomingPass.time < 10) {
            incomingPass.actor.completed++;
            stats[a.side].completedPasses++;
            lastPass = { actor: incomingPass.actor, receiver: a, time };
            event('passComplete', a.side, `${a.player.name}接到队友传球。`, a, {
              passerId: incomingPass.actor.player.id,
            });
          }
          const oneTouch = Boolean(
            incomingPass &&
            ability(a.player, 'firstTouch') >= 78 &&
            ability(a.player, 'decisions') >= 72,
          );
          if (newControl && incoming > 3 && !a.setPiece && !oneTouch) {
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
              ),
            );
            playedBall(a, 'control');
            touchedThisTick = true;
            lastTouch = a;
            a.touches++;
            a.cooldown = 0.14 + 0.18 * (1 - control / 100);
            a.hold = 0;
            a.intent = {
              kind: 'settle',
              destination: { x: clamp(a.pos.x + direction(a.side) * 7, 1, 104), z: a.pos.z },
              expiresAt: time + 0.4,
            };
            event('control', a.side, `${a.player.name}调整第一脚触球，为下一步处理留出空间。`, a, {
              quality: control,
              result: 'controlled',
            });
            return;
          }
          if (!a.setPiece && !oneTouch && time < (a.readyAt ?? 0)) {
            // Keep looking while making a real, gentle shielding touch if needed.
            const speed = Math.hypot(a.velocity.x, a.velocity.z);
            if (incoming > 0.8 || distance(a.pos, ball) > 0.72) {
              const threat = playing()
                .filter((o) => o.side !== a.side)
                .sort((x, y) => distance(x.pos, ball) - distance(y.pos, ball))[0];
              const length = threat ? Math.max(0.1, distance(threat.pos, ball)) : 10;
              const shield =
                threat && length < 3
                  ? { x: (ball.x - threat.pos.x) / length, z: (ball.z - threat.pos.z) / length }
                  : { x: 0, z: 0 };
              kick(physics, a, {
                x: a.velocity.x * 0.4 + shield.x * 0.6,
                z: a.velocity.z * 0.4 + shield.z * 0.6,
                y: 0.03,
              });
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
          const actionRng = random(seedFrom(`${seed}:action:${++actionNumber}`));
          const lapse = actionRng() < lapseProbability;
          const action = chooseAction(
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
            },
          );
          if (!kick(physics, a, action)) return;
          playedBall(a, action.type, action.receiverId);
          touchedThisTick = true;
          const explanation = {
            actionId: actionNumber,
            receiverId: action.receiverId,
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
            stats[a.side].shots++;
            stats[a.side].xg += action.xg;
            shot = { side: a.side, actor: a, time };
            event('shot', a.side, `${a.player.name}起脚射门！`, a, {
              xg: action.xg,
              ...explanation,
            });
            pendingPass = null;
          } else if (action.type !== 'dribble') {
            a.passes++;
            if (action.intent === 'through') a.throughBalls++;
            if (['switch', 'cross', 'clearance'].includes(action.intent)) a.longPasses++;
            if (oneTouch) a.oneTouchPasses++;
            stats[a.side].passes++;
            pendingPass = {
              actor: a,
              time,
              receiverId: action.receiverId,
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
              : 0.28;
          if (action.type === 'dribble') {
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
      for (const a of actionOrder) {
        if (a.sentOff) continue;
        const before = a.pos;
        a.pos = a.body.translation();
        a.velocity = a.body.linvel();
        const moved = distance(before, a.pos);
        a.distance += moved;
        if (owner === a) a.carryDistance += moved;
        a.direction = direction(a.side);
        a.maxSpeed = Math.max(a.maxSpeed, Math.hypot(a.velocity.x, a.velocity.z));
        a.energy = Math.max(
          20,
          a.energy -
            energyCost(
              a.player,
              Math.hypot(a.velocity.x, a.velocity.z),
              clubs[a.side].tactics.press,
              active,
              STEP * CLOCK_SCALE,
            ),
        );
        a.player.matchState.energy = a.energy;
        a.player.matchState.mental = mentalModifier(a.player.matchState);
        a.cooldown -= STEP;
        a.hold = owner === a ? a.hold + STEP : 0;
        orientFoot(a, ball);
        if (a.hands) orientHands(a, ball, 0.45 + ability(a.player, 'oneOnOnes') * 0.004);
        if (active && a.isKeeper && tick % 2 === 0)
          a.target = targetFor(
            a,
            playing(),
            ball,
            owner,
            direction(a.side),
            clubs[a.side].tactics,
            roles.chasers,
            roles,
          );
        const target = active ? a.target : a.pos;
        const dx = target.x - a.pos.x,
          dz = target.z - a.pos.z,
          gap = Math.hypot(dx, dz);
        a.movementMode = active ? movementMode(a, ball, owner, roles, gap) : 'walk';
        const m = movement(a.player, a.energy, a.movementMode);
        // Separation steers around teammates; Rapier resolves any remaining body contacts.
        let vx = gap > 0.2 ? (dx / gap) * Math.min(m.speed, gap * 2) : 0;
        let vz = gap > 0.2 ? (dz / gap) * Math.min(m.speed, gap * 2) : 0;
        if (active && gap > 1)
          for (const o of actors) {
            if (o.sentOff || o === a || o.side !== a.side) continue;
            const d = distance(a.pos, o.pos);
            if (d > 0.01 && d < 1.4) {
              vx += ((a.pos.x - o.pos.x) / d) * (1.4 - d) * 2;
              vz += ((a.pos.z - o.pos.z) / d) * (1.4 - d) * 2;
            }
          }
        const diving =
          a.isKeeper && bv.x * direction(a.side) < -8 && Math.abs(ball.x - a.pos.x) < 25;
        driveMovement(a, { x: vx, z: vz }, m, STEP, diving ? diveResponse(a.player) : 1);
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
      );
      const afterBall = physics.ball.translation();
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
            if (lastTouch?.side !== a.side) {
              lastPass = null;
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
          const scorer = lastTouch?.side === side ? lastTouch : null;
          const credited = scorer ?? lastTouch;
          const identity = credited
            ? `${credited.player.number}号 ${credited.player.name}`
            : '对方球员';
          if (shot?.side === side) stats[side].onTarget++;
          event(
            'goal',
            side,
            `${identity}${scorer ? '破门' : '乌龙球'}！${clubs[side].name}改写比分为 ${score.join(' : ')}。`,
            scorer,
            {
              score: [...score],
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
              ...(scorer && lastPass?.receiver === scorer && time - lastPass.time < 10
                ? { assistId: lastPass.actor.player.id }
                : {}),
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
        if (s !== undefined) stats[s].possessionTicks++;
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
          performance: playerStats(),
          continuity: structuredClone(continuity.metrics),
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
