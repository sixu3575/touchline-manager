import { random, clamp } from '../../core/index.mjs';
import { validateLineup } from '../tactics/index.mjs';
import {
  createPhysics,
  createBody,
  createHands,
  orientFoot,
  orientHands,
  kick,
  stepPhysics,
  goalCrossing,
  STEP,
  BALL_RADIUS,
} from './physics.mjs';
import { formation, ability, movement, chooseAction, targetFor, distance } from './agents.mjs';

export const ENGINE_VERSION = '0.3.0-rapier';
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
      player,
      anchor,
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
  for (const a of actors) if (a.player.role === 'GK') a.hands = createHands(physics, a);
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
  let restartUntil = 0,
    restartSide = 0,
    restartTaker = null,
    goalRestart = null,
    cut = true,
    cursor = 0;
  const direction = (side) => (side === 0 ? 1 : -1) * (half === 0 ? 1 : -1);
  const event = (type, side, text, actor = null, extra = {}) => {
    const b = physics.ball.translation();
    events.push({
      second: Math.round(time * 20) / 20,
      minute: Math.min(90, Math.floor((time * CLOCK_SCALE) / 60)),
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
  }
  function placeActor(a, x, z) {
    a.body.setTranslation({ x, y: a.height / 2, z }, true);
    a.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    a.pos = { x, z };
    a.velocity = { x: 0, z: 0 };
    a.target = { x, z };
    a.hold = 0;
    a.setPiece = null;
  }
  function kickoff(side, type = 'kickoff') {
    goalRestart = null;
    placeBall(52.5, 34);
    for (const a of actors) {
      const dir = direction(a.side);
      const x = a.player.role === 'GK' ? 5 : Math.min(47, a.anchor.x * 0.68);
      placeActor(a, dir === 1 ? x : 105 - x, a.anchor.z);
    }
    const taker = actors.find((a) => a.side === side && a.player.role === 'FWD');
    placeActor(taker, 52.5 - direction(side) * 0.66, 34);
    restartUntil = time + 2;
    restartSide = side;
    restartTaker = taker;
    event(type, side, type === 'half' ? '双方交换场地，下半场开始。' : '中圈开球，比赛开始。');
  }
  function restart(type, side, x, z) {
    placeBall(x, z);
    const candidates = actors.filter(
      (a) =>
        a.side === side && (type === 'goalKick' ? a.player.role === 'GK' : a.player.role !== 'GK'),
    );
    const taker = candidates.sort(
      (a, b) => distance(a.pos, { x, z }) - distance(b.pos, { x, z }),
    )[0];
    for (const a of actors)
      if (distance(a.pos, { x, z }) < 3)
        placeActor(
          a,
          clamp(a.pos.x - direction(side) * 4, 1, 104),
          clamp(a.pos.z + (a.index % 2 ? 4 : -4), 1, 67),
        );
    placeActor(taker, clamp(x - direction(side) * 0.65, 0.1, 104.9), z);
    taker.setPiece = type;
    restartSide = side;
    restartTaker = taker;
    restartUntil = time + 2.5;
    event(
      type,
      side,
      `${clubs[side].name}${{ corner: '获得角球。', goalKick: '开出球门球。', throwIn: '获得边线球（简化为脚下开球）。' }[type]}`,
      taker,
    );
    if (type === 'corner') stats[side].corners++;
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
      const active = time >= restartUntil;
      owner =
        lastTouch && distance(lastTouch.pos, ball) < 2 && Math.hypot(bv.x, bv.z) < 9
          ? lastTouch
          : null;
      if (active && tick % 6 === 0) {
        const chasers = [];
        for (const side of [0, 1]) {
          const ownGoal = direction(side) === 1 ? 0 : 105;
          const candidates = actors
            .filter(
              (a) => a.side === side && (a.player.role !== 'GK' || Math.abs(ball.x - ownGoal) < 9),
            )
            .sort(
              (a, b) =>
                distance(a.pos, ball) / movement(a.player, a.energy).speed -
                distance(b.pos, ball) / movement(b.player, b.energy).speed,
            );
          const count = owner?.side !== side && clubs[side].tactics.press === 'high' ? 2 : 1;
          chasers.push(...candidates.slice(0, count).map((a) => a.index));
          if (pendingPass?.actor.side === side) {
            const receiver = actors.find((a) => a.player.id === pendingPass.receiverId);
            if (receiver) chasers.push(receiver.index);
          }
        }
        for (const a of actors) {
          if (time < a.nextDecision) continue;
          a.target = targetFor(
            a,
            actors,
            ball,
            owner,
            direction(a.side),
            clubs[a.side].tactics,
            chasers,
          );
          a.reaction =
            a.player.role === 'GK'
              ? 0.1 + (100 - ability(a.player, 'reflexes')) / 180
              : 0.1 +
                (100 - (ability(a.player, 'concentration') + ability(a.player, 'decisions')) / 2) /
                  180;
          a.nextDecision = time + a.reaction;
        }
      }
      for (const a of actors) {
        const before = a.pos;
        a.pos = a.body.translation();
        a.velocity = a.body.linvel();
        const moved = distance(before, a.pos);
        a.distance += moved;
        const effort = Math.hypot(a.velocity.x, a.velocity.z) / 8;
        a.energy = Math.max(
          20,
          a.energy -
            STEP * effort * (0.006 + (100 - ability(a.player, 'stamina')) * 0.00008) * CLOCK_SCALE,
        );
        a.cooldown -= STEP;
        a.hold = owner === a ? a.hold + STEP : 0;
        orientFoot(a, ball);
        if (a.hands) orientHands(a, ball, 0.45 + ability(a.player, 'oneOnOnes') * 0.004);
        if (active && a.player.role === 'GK' && tick % 2 === 0)
          a.target = targetFor(
            a,
            actors,
            ball,
            owner,
            direction(a.side),
            clubs[a.side].tactics,
            [],
          );
        const target = active ? a.target : a.pos;
        const dx = target.x - a.pos.x,
          dz = target.z - a.pos.z,
          gap = Math.hypot(dx, dz);
        const m = movement(a.player, a.energy);
        // Separation steers around teammates; Rapier resolves any remaining body contacts.
        let vx = gap > 0.2 ? (dx / gap) * Math.min(m.speed, gap * 2) : 0;
        let vz = gap > 0.2 ? (dz / gap) * Math.min(m.speed, gap * 2) : 0;
        if (active && gap > 1)
          for (const o of actors) {
            if (o === a || o.side !== a.side) continue;
            const d = distance(a.pos, o.pos);
            if (d > 0.01 && d < 1.4) {
              vx += ((a.pos.x - o.pos.x) / d) * (1.4 - d) * 2;
              vz += ((a.pos.z - o.pos.z) / d) * (1.4 - d) * 2;
            }
          }
        const dvx = vx - a.velocity.x,
          dvz = vz - a.velocity.z,
          dv = Math.hypot(dvx, dvz);
        const diving =
          a.player.role === 'GK' &&
          bv.x * direction(a.side) < -8 &&
          Math.abs(ball.x - a.pos.x) < 25;
        const max = m.acceleration * STEP * m.response * (diving ? 2.3 : 1);
        const scale = dv > max ? max / dv : 1;
        a.body.applyImpulse(
          { x: dvx * scale * a.body.mass(), y: 0, z: dvz * scale * a.body.mass() },
          true,
        );
        if (!active || a.cooldown > 0) continue;
        // Goalkeepers intercept physically reachable high balls with a finite hand volume.
        if (
          a.player.role === 'GK' &&
          bv.x * direction(a.side) < -1 &&
          Math.abs(a.pos.x - (direction(a.side) === 1 ? 0 : 105)) < 16.5 &&
          Math.abs(a.pos.z - 34) < 20 &&
          distance(a.pos, ball) < 0.9 + ability(a.player, 'oneOnOnes') * 0.004 &&
          ball.y < a.height + ability(a.player, 'aerialReach') * 0.008 &&
          (!shot || time - shot.time > a.reaction)
        ) {
          if (physics.world.intersectionPair(a.hands, physics.collider)) {
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
        if (ball.y > 1.25 && physics.world.intersectionPair(a.head, physics.collider)) {
          const goalX = direction(a.side) === 1 ? 105 : 0;
          const headerShot = distance(a.pos, { x: goalX, z: 34 }) < 22;
          const target = {
            x: headerShot ? goalX + direction(a.side) : ball.x + direction(a.side) * 14,
            z: 34 + (rng() - 0.5) * (100 - ability(a.player, 'heading')) * 0.12,
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
        if (!physics.world.intersectionPair(a.foot, physics.collider)) continue;
        const previous = lastTouch;
        if (previous !== a) {
          if (previous && previous.side !== a.side) {
            stats[a.side].interceptions++;
            shot = null;
          }
          if (pendingPass && pendingPass.actor !== a) {
            if (pendingPass.actor.side === a.side && time - pendingPass.time < 10) {
              pendingPass.actor.completed++;
              stats[a.side].completedPasses++;
            }
            pendingPass = null;
          }
          a.hold = 0;
        }
        const incoming = Math.hypot(bv.x - a.velocity.x, bv.z - a.velocity.z);
        const control =
          previous && previous.side !== a.side
            ? ability(a.player, 'tackling') * 0.65 + ability(a.player, 'firstTouch') * 0.35
            : ability(a.player, 'firstTouch');
        if (previous !== a && incoming > 5 + control * 0.17) {
          // A difficult first touch dissipates only part of momentum and may spill loose.
          kick(physics, a, {
            x: bv.x * 0.45 + (rng() - 0.5) * 3,
            y: Math.max(0.2, bv.y * 0.2),
            z: bv.z * 0.45 + (rng() - 0.5) * 3,
          });
          a.cooldown = 0.35 + (100 - ability(a.player, 'balance')) / 200;
        } else {
          const action = chooseAction(
            a,
            actors,
            ball,
            direction(a.side),
            clubs[a.side].tactics,
            rng,
          );
          if (!kick(physics, a, action)) continue;
          if (action.type === 'shot') {
            stats[a.side].shots++;
            stats[a.side].xg += action.xg;
            shot = { side: a.side, actor: a, time };
            event('shot', a.side, `${a.player.name}起脚射门！`, a, { xg: action.xg });
            pendingPass = null;
          } else if (action.type !== 'dribble') {
            a.passes++;
            stats[a.side].passes++;
            pendingPass = { actor: a, time, receiverId: action.receiverId };
            shot = null;
            if (events.length < 2500)
              event(
                action.type,
                a.side,
                `${a.player.name}${action.type === 'cross' ? '送出高空传中。' : '传球寻找队友。'}`,
                a,
              );
          }
          a.cooldown =
            action.type === 'dribble' ? 0.28 + (100 - ability(a.player, 'dribbling')) / 300 : 0.6;
          a.setPiece = null;
        }
        lastTouch = a;
        a.touches++;
      }
      const beforeBall = physics.ball.translation();
      stepPhysics(physics);
      const afterBall = physics.ball.translation();
      // Body deflections count as touches even without an intentional foot action.
      physics.world.contactPairsWith(physics.collider, (c) => {
        const a = actors.find((a) => a.collider.handle === c.handle);
        if (a) {
          let contact = false;
          physics.world.contactPair(physics.collider, c, (manifold) => {
            if (manifold.numSolverContacts() > 0) contact = true;
          });
          if (contact) lastTouch = a;
        }
      });
      if (active) {
        const end = goalCrossing(beforeBall, afterBall);
        if (end !== null) {
          const side = direction(0) === (end === 1 ? 1 : -1) ? 0 : 1;
          score[side]++;
          const scorer = lastTouch?.side === side ? lastTouch : null;
          if (shot?.side === side) stats[side].onTarget++;
          event(
            'goal',
            side,
            `${scorer?.player.name ?? '对方球员乌龙'}破门！${clubs[side].name}改写比分。`,
            scorer,
            { score: [...score], ...(scorer ? {} : { ownGoal: true }) },
          );
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
      if (tick % 4 === 0) record();
    }
    event('fulltime', 0, '全场比赛结束。');
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
      seed,
      homeId: home.id,
      awayId: away.id,
      homeName: home.name,
      awayName: away.name,
      score,
      stats,
      events,
      performance: actors.map((a) => ({
        id: a.player.id,
        side: a.side,
        distance: Math.round(a.distance),
        energy: Math.round(a.energy * 10) / 10,
        touches: a.touches,
        passes: a.passes,
        completed: a.completed,
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
        frameCount: cursor / FRAME_STRIDE,
        duration,
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
      report.trajectory = frames.slice(0, cursor);
    }
    return report;
  } finally {
    physics.world.free();
  }
}
