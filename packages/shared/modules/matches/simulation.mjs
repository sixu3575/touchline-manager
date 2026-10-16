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

export const ENGINE_VERSION = '0.5.0-rapier-intelligence';
export const SAMPLE_HZ = 5;
export const FRAME_STRIDE = 49; // 22*(x,z), ball*(x,height,z), cut, last-touch actor+1.
// A 90-minute game clock covers 12 minutes of continuous physical play on the free VM.
// Physics remains in real seconds: never scale ball velocity or gravity by CLOCK_SCALE.
const DURATION = 12 * 60;
const CLOCK_SCALE = 7.5;
const toCm = (n) => Math.round(clamp(n, 0, 655.35) * 100);

export function simulate(home, away, seed, id = 'match', options = {}) {
  validateLineup(home, home.lineup, home.tactics.formation);
  validateLineup(away, away.lineup, away.tactics.formation);
  const clubs = [home, away],
    rng = random(seed),
    physics = createPhysics();
  const actors = clubs.flatMap((club, side) =>
    formation(club).map(({ player, anchor }, i) => ({
      player: { ...player, matchState: createMatchState(player) },
      anchor,
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
  for (const a of actors) if (a.isKeeper) a.hands = createHands(physics, a);
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
  const score = [0, 0],
    events = [];
  const duration = options.durationSeconds ?? DURATION; // Short fixture harness; not exposed to HTTP.
  if (!Number.isInteger(duration) || duration < 1 || duration > DURATION)
    throw Error('Invalid simulation duration');
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
  function placeBall(x, z) {
    physics.ball.setTranslation({ x, y: BALL_RADIUS + 0.015, z }, true);
    physics.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
    physics.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
    lastTouch = null;
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
    placeBall(52.5, 34);
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
    restartUntil = time + 2;
    restartSide = side;
    restartTaker = taker;
    taker.setPiece = 'kickoff';
    event(type, side, type === 'half' ? '双方交换场地，下半场开始。' : '中圈开球，比赛开始。');
  }
  function restart(type, side, x, z) {
    placeBall(x, z);
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
    restartSide = side;
    restartTaker = taker;
    restartUntil = time + 2.5;
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
  kickoff(0);
  record();
  try {
    for (let tick = 1; tick <= ticks; tick++) {
      time = tick * STEP;
      if (tick === 7_200) {
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
      owner =
        lastTouch &&
        !lastTouch.sentOff &&
        ball.y < 1.25 &&
        distance(lastTouch.pos, ball) < 1.3 &&
        Math.hypot(bv.x - lastTouch.velocity.x, bv.z - lastTouch.velocity.z) < 7
          ? lastTouch
          : null;
      if (active && tick % 6 === 0) {
        roles = teamRoles(
          actors,
          ball,
          owner,
          pendingPass,
          direction,
          clubs.map((c) => c.tactics),
          time,
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
            ? 0.1 + (100 - ability(a.player, 'reflexes')) / 180
            : 0.1 +
              (100 - (ability(a.player, 'concentration') + ability(a.player, 'decisions')) / 2) /
                180;
          a.nextDecision = time + a.reaction;
        }
      }
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
        const desiredSpeed = Math.hypot(vx, vz);
        if (desiredSpeed > m.speed) {
          vx *= m.speed / desiredSpeed;
          vz *= m.speed / desiredSpeed;
        }
        const dvx = vx - a.velocity.x,
          dvz = vz - a.velocity.z,
          dv = Math.hypot(dvx, dvz);
        const diving =
          a.isKeeper && bv.x * direction(a.side) < -8 && Math.abs(ball.x - a.pos.x) < 25;
        const slowing =
          vx * a.velocity.x + vz * a.velocity.z < Math.hypot(a.velocity.x, a.velocity.z) ** 2;
        const max = (slowing ? m.braking : m.acceleration) * STEP * m.response * (diving ? 2.3 : 1);
        const scale = dv > max ? max / dv : 1;
        a.body.applyImpulse(
          { x: dvx * scale * a.body.mass(), y: 0, z: dvz * scale * a.body.mass() },
          true,
        );
        if (!active || touchedThisTick || a.cooldown > 0) continue;
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
              continue;
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
              continue;
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
            continue;
          }
        }
        if (ball.y > 1.25 && touchesBall(physics, a.head)) {
          if (checkInvolvement(a)) {
            active = false;
            continue;
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
            continue;
          }
        }
        if (distance(a.pos, ball) > 0.92 || !touchesBall(physics, a.foot)) continue;
        if (checkInvolvement(a)) {
          active = false;
          continue;
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
          continue;
        }
        const previous = lastTouch;
        if (
          previous &&
          previous !== a &&
          previous.side !== a.side &&
          distance(previous.pos, a.pos) < 1.8 &&
          time >= a.tackleAt
        ) {
          a.tackleAt = time + 0.9;
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
            const judgement = foulAssessment(
              {
                tackling: ability(a.player, 'tackling'),
                late,
                danger,
                penalty,
                dogso: progress > 82 && Math.abs(ball.z - 34) < 12 && covering <= 1,
              },
              rulesRng(),
            );
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
            continue;
          }
          a.wonTackles++;
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
        const newControl = previous !== a || Boolean(incomingPass);
        if (newControl) a.intent = null;
        if (newControl) {
          if (previous && previous.side !== a.side) {
            stats[a.side].interceptions++;
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
          a.cooldown = 0.35 + (100 - ability(a.player, 'balance')) / 200;
        } else {
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
            const speed = Math.min(5, Math.hypot(a.velocity.x, a.velocity.z) * 0.75 + 1.9);
            const heading =
              Math.hypot(a.velocity.x, a.velocity.z) > 1
                ? { x: a.velocity.x, z: a.velocity.z }
                : { x: direction(a.side), z: 0 };
            const length = Math.hypot(heading.x, heading.z) || 1;
            const error = ((rng() - 0.5) * (100 - control)) / 90;
            kick(physics, a, {
              x: (heading.x / length) * speed - (heading.z / length) * error,
              z: (heading.z / length) * speed + (heading.x / length) * error,
              y: 0.08,
            });
            playedBall(a, 'control');
            touchedThisTick = true;
            lastTouch = a;
            a.touches++;
            a.cooldown = 0.14 + 0.18 * (1 - control / 100);
            a.hold = 0;
            a.intent = {
              kind: 'carry',
              destination: { x: clamp(a.pos.x + direction(a.side) * 7, 1, 104), z: a.pos.z },
              expiresAt: time + 0.4,
            };
            event('control', a.side, `${a.player.name}调整第一脚触球，为下一步处理留出空间。`, a, {
              quality: control,
              result: 'controlled',
            });
            continue;
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
            },
          );
          if (!kick(physics, a, action)) continue;
          playedBall(a, action.type, action.receiverId);
          touchedThisTick = true;
          const explanation = {
            actionId: actionNumber,
            receiverId: action.receiverId,
            quality: action.quality,
            result: 'impulse',
            intent: action.intent,
            decision: action.reason,
            estimatedSuccess: action.estimatedSuccess,
            velocity: { x: action.x, y: action.y, z: action.z },
            reason: lapse
              ? '专注失误降低动作质量'
              : action.quality.foot < 1
                ? '逆足处理影响动作精度'
                : action.quality.pressure > 0.5
                  ? '贴身压迫影响动作精度'
                  : '按当前空间执行动作',
          };
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
            };
            shot = null;
            if (events.length < 2500)
              event(
                action.type,
                a.side,
                `${a.player.name}${{ through: '将球送入队友前插的空间。', switch: '长传转移到另一侧。', cross: '送出高空传中。', clearance: '将球解围到安全区域。', feet: '将球快速传到队友脚下。' }[action.intent] ?? '传球寻找队友。'}`,
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
            event('dribble', a.side, `${a.player.name}短触球向前推进。`, a, explanation);
          }
          a.setPiece = null;
        }
        a.setPiece = null;
        lastTouch = a;
        a.touches++;
      }
      const beforeBall = physics.ball.translation();
      stepPhysics(physics);
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
              pendingPass = null;
            }
            if (deliberate?.side !== a.side) deliberate = null;
            if (restartPlay && restartPlay.taker !== a.player.id) restartPlay.touched = true;
            lastTouch = a;
          }
        }
      });
      if (active) {
        const end = goalCrossing(beforeBall, afterBall);
        if (end !== null && restartPlay?.kind === 'indirect' && !restartPlay.touched) {
          const defending = direction(0) === (end === 0 ? 1 : -1) ? 0 : 1;
          restart('goalKick', defending, end === 0 ? 5.5 : 99.5, 34);
        } else if (end !== null) {
          const side = direction(0) === (end === 1 ? 1 : -1) ? 0 : 1;
          score[side]++;
          const scorer = lastTouch?.side === side ? lastTouch : null;
          if (shot?.side === side) stats[side].onTarget++;
          event(
            'goal',
            side,
            `${scorer?.player.name ?? '对方球员乌龙'}破门！${clubs[side].name}改写比分。`,
            scorer,
            {
              score: [...score],
              ...(scorer ? {} : { ownGoal: true }),
              ...(scorer && lastPass?.receiver === scorer && time - lastPass.time < 10
                ? { assistId: lastPass.actor.player.id }
                : {}),
            },
          );
          shock(side, 2, scorer, 3);
          shock(1 - side, -2);
          // Keep the actual goal/net trajectory visible before the dead-ball reset.
          restartUntil = time + 2.5;
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
        const s = owner?.side ?? lastTouch?.side;
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
      if (abandoned) break;
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
    const total = stats[0].possessionTicks + stats[1].possessionTicks;
    stats[0].possession = total ? Math.round((stats[0].possessionTicks / total) * 100) : 50;
    stats[1].possession = 100 - stats[0].possession;
    stats.forEach((s) => {
      s.xg = Math.round(s.xg * 100) / 100;
      delete s.possessionTicks;
    });
    const report = {
      id,
      engineVersion: ENGINE_VERSION,
      rulesVersion: RULES_VERSION,
      parameterVersion: 'tempo-intelligence-1',
      eventFormatVersion: 2,
      ...(penalties ? { penalties } : {}),
      ...(abandoned ? { abandoned: true } : {}),
      seed,
      homeId: home.id,
      awayId: away.id,
      homeName: home.name,
      awayName: away.name,
      score,
      stats,
      events,
      motion: {
        passSpeedMean: motion.passSpeedSum / (motion.passSamples || 1),
        playerSpeedMean: motion.playerSpeedSum / (motion.playerSamples || 1),
        sprintShare: motion.sprintSamples / (motion.playerSamples || 1),
      },
      performance: actors.map((a) => ({
        id: a.player.id,
        side: a.side,
        distance: Math.round(a.distance),
        energy: Math.round(a.energy * 10) / 10,
        touches: a.touches,
        passes: a.passes,
        completed: a.completed,
        style: a.profile.label,
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
      })),
      snapshots: clubs.map((c) => ({
        id: c.id,
        name: c.name,
        tactics: structuredClone(c.tactics),
        players: structuredClone(c.lineup.map((id) => c.players.find((p) => p.id === id))),
      })),
    };
    if (frames) {
      report.replay = {
        format: 'positions-u16-v1',
        sampleHz: SAMPLE_HZ,
        stride: FRAME_STRIDE,
        frameCount: cursor / FRAME_STRIDE + (penaltyFrames?.length ?? 0) / FRAME_STRIDE,
        duration: penaltyFrames ? time : duration,
        regulationDuration: duration,
        clockScale: CLOCK_SCALE,
        physics: 'Rapier 3D 0.21.0',
        stepHz: 20,
        players: actors.map((a) => ({
          id: a.player.id,
          side: a.side,
          number: a.player.number,
          name: a.player.name,
          role: a.player.role,
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
