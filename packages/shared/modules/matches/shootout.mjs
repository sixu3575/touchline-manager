import { random, seedFrom, clamp } from '../../core/index.mjs';
import { keeperReaction } from './goalkeeping.mjs';
import { chooseAction, ability, movement } from './agents.mjs';
import { updateFacing } from './execution.mjs';
import {
  STEP,
  BALL_RADIUS,
  orientFoot,
  orientHands,
  kick,
  touchesBall,
  stepPhysics,
  goalCrossing,
} from './physics.mjs';

// Separate phase: no regular goals, xG, appearances, or career statistics are added.
export function shootout({ physics, actors, seed, time, event, direction }) {
  const score = [0, 0],
    taken = [0, 0],
    frames = [];
  const available = actors.filter((a) => !a.sentOff);
  // Equalise eligible kickers when dismissals left unequal sides.
  const eligibleCount = Math.min(
    ...[0, 1].map((side) => available.filter((a) => a.side === side).length),
  );
  const order = [0, 1].map((side) => {
    const team = available.filter((a) => a.side === side);
    const keeper = team.find((a) => a.isKeeper);
    const chosen = team
      .filter((a) => a !== keeper)
      .sort(
        (a, b) =>
          0.55 * ability(b.player, 'finishing') +
          0.45 * ability(b.player, 'setPieces') -
          (0.55 * ability(a.player, 'finishing') + 0.45 * ability(a.player, 'setPieces')),
      )
      .slice(0, eligibleCount - 1);
    return [...chosen, keeper];
  });
  const goalX = 105,
    ballX = 94;
  let attempt = 0;
  event('shootout', 0, '常规时间战平，进入物理点球大战。', null, {}, time);
  while (attempt < 200) {
    const side = attempt % 2,
      taker = order[side][taken[side] % eligibleCount];
    const keeper = available.find((a) => a.side !== side && a.isKeeper);
    if (!keeper) throw Error('Shootout requires an eligible goalkeeper');
    const rng = random(seedFrom(`${seed}:penalty:${attempt}`));
    for (const a of available) {
      const x = a === taker ? 93.35 : a === keeper ? 104.95 : 52.5;
      const z = a === taker || a === keeper ? 34 : 5 + a.index * 2.5;
      a.body.setTranslation({ x, y: a.height / 2, z }, true);
      a.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      a.pos = { x, z };
      a.velocity = { x: 0, z: 0 };
      a.kickPlan = null;
    }
    physics.ball.setTranslation({ x: ballX, y: BALL_RADIUS + 0.015, z: 34 }, true);
    physics.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
    physics.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
    taker.setPiece = 'penalty';
    taker.direction = 1;
    let kicked = false,
      saved = false,
      goal = false,
      lastTouch = null,
      cut = true;
    const start = time;
    for (let tick = 1; tick <= 160; tick++) {
      time = start + tick * STEP;
      const ball = physics.ball.translation(),
        velocity = physics.ball.linvel();
      taker.pos = taker.body.translation();
      keeper.pos = keeper.body.translation();
      // The taker has 0.8 seconds of preparation in this separate phase;
      // orient continuously instead of inheriting the previous half's facing.
      updateFacing(taker, ball, STEP, time);
      orientFoot(taker, ball);
      orientHands(keeper, ball, 0.45 + ability(keeper.player, 'oneOnOnes') * 0.004);
      if (tick === 16) {
        const action = chooseAction(
          taker,
          available,
          { ...ball, vx: velocity.x, vz: velocity.z },
          1,
          { style: 'balanced' },
          rng,
          { minute: 90 },
        );
        kicked = kick(physics, taker, action);
        lastTouch = taker;
        if (!kicked) throw Error('Penalty taker failed physical contact');
        event(
          'penaltyShot',
          side,
          `${taker.player.name}主罚点球。`,
          taker,
          { attempt: attempt + 1, quality: action.quality },
          time,
        );
      }
      if (kicked && !goal) {
        const delay = keeperReaction(keeper.player);
        const targetZ =
          time - start > 0.8 + delay ? clamp(ball.z + velocity.z * 0.15, 30.4, 37.6) : 34;
        const m = movement(keeper.player, keeper.energy),
          v = keeper.body.linvel();
        const desired = clamp((targetZ - keeper.pos.z) * 5, -m.speed, m.speed);
        const dv = clamp(desired - v.z, -m.acceleration * STEP * 2.3, m.acceleration * STEP * 2.3);
        keeper.body.applyImpulse({ x: 0, y: 0, z: dv * keeper.body.mass() }, true);
        if (!saved && time - start > 0.8 + delay && touchesBall(physics, keeper.hands)) {
          kick(physics, keeper, { x: -8, y: 2, z: (rng() - 0.5) * 10 }, keeper.hands);
          saved = true;
          lastTouch = keeper;
        }
      }
      const before = physics.ball.translation();
      stepPhysics(physics, null, actors);
      if (kicked && !goal && goalCrossing(before, physics.ball.translation()) === 1) goal = true;
      if (tick % 4 === 0) {
        for (const a of actors) {
          const p = a.body.translation();
          frames.push(
            Math.round(clamp(p.x + 5, 0, 655.35) * 100),
            Math.round(clamp(p.z + 5, 0, 655.35) * 100),
          );
        }
        const p = physics.ball.translation();
        frames.push(
          Math.round(clamp(p.x + 5, 0, 655.35) * 100),
          Math.round(clamp(p.y, 0, 655.35) * 100),
          Math.round(clamp(p.z + 5, 0, 655.35) * 100),
          Number(cut),
          lastTouch ? lastTouch.index + 1 : 0,
        );
        cut = false;
      }
    }
    taken[side]++;
    if (goal) score[side]++;
    event(
      goal ? 'penaltyGoal' : 'penaltyMiss',
      side,
      `${taker.player.name}${goal ? '罚进' : '未能罚进'}，点球 ${score.join(' : ')}。`,
      taker,
      { attempt: attempt + 1, penalties: [...score], saved },
      time,
    );
    attempt++;
    const remaining = taken.map((n) => Math.max(0, 5 - n));
    if (
      (taken[0] <= 5 &&
        taken[1] <= 5 &&
        (score[0] > score[1] + remaining[1] || score[1] > score[0] + remaining[0])) ||
      (taken[0] >= 5 && taken[0] === taken[1] && score[0] !== score[1])
    )
      return { score, frames: new Uint16Array(frames), time };
  }
  throw Error('Unresolved shootout after 100 pairs');
}
