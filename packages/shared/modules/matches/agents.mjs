import { effectiveAbility } from '../players/index.mjs';
import { clamp } from '../../core/index.mjs';

export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export function ability(p, key) {
  return effectiveAbility(p, key);
}
export function movement(p, energy) {
  if (!p.matchState)
    p = { ...p, matchState: { energy, morale: 50, confidence: 50, adaptation: 100 } };
  return {
    speed: 4.5 + ability(p, 'sprintSpeed') * 0.04,
    acceleration: 1.5 + ability(p, 'acceleration') * 0.03,
    response: 0.3 + ability(p, 'agility') * 0.007,
  };
}
export function formation(club) {
  const ps = club.lineup.map((id) => club.players.find((p) => p.id === id));
  const depth = { GK: 5, DEF: 27, MID: 49, FWD: 70 };
  return ps.map((p) => {
    const group = ps.filter((q) => q.role === p.role);
    return {
      player: p,
      anchor: { x: depth[p.role], z: 8 + ((group.indexOf(p) + 0.5) / group.length) * 52 },
    };
  });
}
function laneRisk(from, to, opponents) {
  const dx = to.x - from.x,
    dz = to.z - from.z;
  const len2 = dx * dx + dz * dz || 1;
  let risk = 0;
  for (const o of opponents) {
    const t = ((o.pos.x - from.x) * dx + (o.pos.z - from.z) * dz) / len2;
    if (t <= 0 || t >= 1) continue;
    const gap = distance(o.pos, { x: from.x + t * dx, z: from.z + t * dz });
    risk += Math.max(0, 4 - gap) * 1.7;
  }
  return risk;
}
// Geometry determines weak-side use; metadata and display changes consume no RNG.
export function actionQuality(actor, ball, key, opponents, lapse = false) {
  const a = (key) => ability(actor.player, key);
  const mix = {
    passing: 0.8 * a('passing') + 0.2 * a('balance'),
    crossing: 0.8 * a('crossing') + 0.2 * a('passing'),
    firstTouch: 0.65 * a('firstTouch') + 0.2 * a('balance') + 0.15 * a('agility'),
    dribbling: 0.65 * a('dribbling') + 0.2 * a('agility') + 0.15 * a('balance'),
    tackling: 0.7 * a('tackling') + 0.2 * a('balance') + 0.1 * a('strength'),
    distribution: 0.75 * a('distribution') + 0.25 * a('passing'),
    finishing: 0.75 * a('finishing') + 0.25 * a('balance'),
    longShots: 0.7 * a('longShots') + 0.3 * a('strength'),
    setPieces: 0.7 * a('setPieces') + 0.2 * a('longShots') + 0.1 * a('strength'),
    penalty: 0.55 * a('finishing') + 0.45 * a('setPieces'),
  };
  const pressure = clamp(
    1 - Math.min(3, ...opponents.map((o) => distance(o.pos, actor.pos))) / 3,
    0,
    1,
  );
  const facing =
    Math.hypot(actor.velocity.x, actor.velocity.z) > 0.5
      ? actor.velocity
      : { x: actor.direction ?? 1, z: 0 };
  const lateral = facing.x * (ball.z - actor.pos.z) - facing.z * (ball.x - actor.pos.x);
  const weak = actor.player.preferredFoot === 'left' ? lateral < -0.12 : lateral > 0.12;
  const foot =
    actor.player.preferredFoot === 'both'
      ? 0.95 + (0.05 * (actor.player.weakFoot ?? 50)) / 100
      : weak
        ? 1 - 0.18 * (1 - (actor.player.weakFoot ?? 50) / 100)
        : 1;
  const base = mix[key] ?? a(key);
  const pressureLoss = 10 * pressure * (1 - a('composure') / 100);
  return {
    value: clamp(base * foot - pressureLoss - (lapse ? 12 : 0), 1, 100),
    base,
    foot,
    pressure,
    pressureLoss,
    lapse,
    mental: actor.player.matchState ? actor.player.matchState.mental : 0,
  };
}
function ballVelocity(ball, target, speed, height) {
  const len = distance(ball, target),
    flight = Math.max(0.15, len / speed);
  return {
    x: (target.x - ball.x) / flight,
    z: (target.z - ball.z) / flight,
    y: (height - ball.y + 4.905 * flight * flight) / flight,
  };
}
export function chooseAction(actor, actors, ball, direction, tactics, rng, context = {}) {
  const p = actor.player,
    a = (key) => ability(p, key),
    opponents = actors.filter((o) => o.side !== actor.side && !o.sentOff);
  actor.direction = direction;
  const quality = (key) => actionQuality(actor, ball, key, opponents, context.lapse);
  const goalX = direction === 1 ? 105 : 0,
    goalDistance = distance(ball, { x: goalX, z: 34 });
  const pressure = quality('passing').pressure;
  const ambition =
    context.minute >= 70 && context.trailing
      ? (0.02 * ((p.personality?.ambition ?? 50) - 50)) / 50
      : 0;
  const direct =
    actor.setPiece === 'penalty' ||
    (actor.setPiece === 'freeKick' && goalDistance < 30 && Math.abs(ball.z - 34) < 20);
  const candidates = [];
  if (
    (p.role !== 'GK' && goalDistance < 18 + a('longShots') * 0.13 && Math.abs(ball.z - 34) < 21) ||
    direct
  ) {
    const alpha = clamp((goalDistance - 16) / 8, 0, 1);
    const q = direct
      ? quality(actor.setPiece === 'penalty' ? 'penalty' : 'setPieces')
      : quality('finishing');
    if (!direct) q.value = (1 - alpha) * q.value + alpha * quality('longShots').value;
    const blockers = laneRisk(
      ball,
      { x: goalX, z: 34 },
      opponents.filter((o) => o.player.role !== 'GK'),
    );
    const left = { x: goalX - ball.x, z: 30.34 - ball.z },
      right = { x: goalX - ball.x, z: 37.66 - ball.z };
    const angle = Math.acos(
      clamp(
        (left.x * right.x + left.z * right.z) /
          (Math.hypot(left.x, left.z) * Math.hypot(right.x, right.z)),
        -1,
        1,
      ),
    );
    const keeper = opponents.find((o) => o.player.role === 'GK');
    const g = keeper ? clamp(Math.abs(keeper.pos.z - 34) / 8, 0, 1) : 1;
    const xg =
      actor.setPiece === 'penalty'
        ? 0.76
        : clamp(
            1 /
              (1 +
                Math.exp(
                  -(
                    -2.1 -
                    0.09 * (goalDistance - 12) +
                    1.8 * (angle - 0.35) -
                    0.8 * clamp(blockers / 15, 0, 1) +
                    2.5 * g
                  ),
                )),
            0.005,
            0.8,
          );
    candidates.push({
      type: 'shot',
      quality: q,
      xg,
      utility: xg - 0.08 + ambition + (direct ? 1 : 0),
      make: () => {
        const error = 0.25 + 0.055 * (100 - q.value);
        const aim = 34 + (rng() < 0.5 ? -1 : 1) * (1.2 + rng() * 1.4) + (rng() - 0.5) * error * 2;
        return {
          ...ballVelocity(
            ball,
            { x: goalX + direction * 1.5, z: aim },
            20 + 0.11 * a('strength'),
            0.25 + rng() * (0.65 + (100 - q.value) / 24),
          ),
          xg,
        };
      },
    });
  }
  const mates = actors.filter((o) => o.side === actor.side && o !== actor && !o.sentOff);
  const nearest = mates
    .slice()
    .sort((x, y) => distance(actor.pos, x.pos) - distance(actor.pos, y.pos))[0];
  for (const mate of mates) {
    if (!actor.setPiece && actor.hold < 0.8 && pressure < 0.5) continue;
    const len = distance(actor.pos, mate.pos);
    if (len < 4 || len > 16 + a('vision') * 0.38) continue;
    const risk = laneRisk(actor.pos, mate.pos, opponents),
      progress = (mate.pos.x - actor.pos.x) * direction;
    const obscurity = clamp(risk / 16, 0, 1);
    const discover = 1 / (1 + Math.exp(-(Math.log(4) + (a('vision') - 50) / 20 - 1.2 * obscurity)));
    if (mate !== nearest && rng() > discover) continue;
    const cross =
      actor.setPiece === 'corner' ||
      (tactics.style === 'wide' && Math.abs(ball.z - 34) > 19 && goalDistance < 40);
    const q = quality(
      actor.setPiece === 'corner'
        ? 'setPieces'
        : p.role === 'GK'
          ? 'distribution'
          : cross
            ? 'crossing'
            : 'passing',
    );
    const success = clamp(
      0.92 - 0.005 * Math.max(0, len - 12) - risk * 0.015 + (q.value - 50) / 300,
      0.1,
      0.97,
    );
    const space = Math.min(10, ...opponents.map((o) => distance(o.pos, mate.pos))) / 10;
    const forward = clamp(progress / 35, -1, 1);
    const style = clamp(
      tactics.style === 'counter'
        ? 0.04 * forward
        : tactics.style === 'possession'
          ? 0.04 * success
          : tactics.style === 'wide' && cross
            ? 0.04
            : 0,
      -0.04,
      0.04,
    );
    const utility =
      success * (0.08 + 0.13 * space + 0.22 * forward) -
      (1 - success) * 0.12 +
      style +
      ambition * Math.sign(progress);
    candidates.push({
      type: cross ? 'cross' : 'pass',
      quality: q,
      receiverId: mate.player.id,
      utility,
      make: () => {
        const lob = cross || (len > 27 && tactics.style === 'counter');
        const flight = lob ? Math.max(1, len / 17) : len / (12 + len * 0.13);
        const error = ((100 - q.value) / 100) * (0.6 + len * 0.055);
        return {
          x:
            (mate.pos.x + mate.velocity.x * flight * 0.55 + (rng() - 0.5) * error * 2 - ball.x) /
            flight,
          z:
            (mate.pos.z + mate.velocity.z * flight * 0.55 + (rng() - 0.5) * error * 2 - ball.z) /
            flight,
          y: lob ? 4.905 * flight : 0.2,
        };
      },
    });
  }
  const q = quality('dribbling');
  candidates.push({
    type: 'dribble',
    quality: q,
    utility: 0.12 - 0.12 * pressure + (actor.hold > 2 ? -0.12 : 0) + ambition,
    make: () => {
      const defender = opponents
        .slice()
        .sort((x, y) => distance(x.pos, actor.pos) - distance(y.pos, actor.pos))[0];
      const dodge =
        defender && distance(defender.pos, actor.pos) < 4
          ? Math.sign(actor.pos.z - defender.pos.z || 1) * (1.5 + q.value / 70)
          : (34 - actor.pos.z) * 0.05;
      return {
        x: direction * (3.6 + q.value * 0.019),
        z: clamp(dodge + ((rng() - 0.5) * (100 - q.value)) / 80, -3, 3),
        y: 0.1,
      };
    },
  });
  const choices = direct
    ? candidates.filter((c) => c.type === 'shot')
    : actor.setPiece
      ? candidates.filter(
          (c) => c.type !== 'dribble' && (actor.setPiece !== 'indirect' || c.type !== 'shot'),
        )
      : candidates;
  if (!choices.length) return { type: 'pass', quality: q, x: direction * 12, z: 0, y: 0.3 };
  const temperature = 0.12 + 0.25 * (1 - a('decisions') / 100);
  const weights = choices.map((c) =>
    Math.exp((c.utility + (rng() - 0.5) * 0.4 * (1 - a('decisions') / 100)) / temperature),
  );
  let roll = rng() * weights.reduce((s, w) => s + w, 0),
    selected = choices[choices.length - 1];
  for (let i = 0; i < choices.length; i++) {
    roll -= weights[i];
    if (roll <= 0) {
      selected = choices[i];
      break;
    }
  }
  return {
    type: selected.type,
    receiverId: selected.receiverId,
    quality: selected.quality,
    ...selected.make(),
  };
}

export function targetFor(actor, actors, ball, owner, direction, tactics, chasers) {
  const p = actor.player;
  const ownGoal = direction === 1 ? 0 : 105;
  if (actor.isKeeper ?? p.role === 'GK') {
    const goalDist = Math.abs(ball.x - ownGoal);
    const keeperX = ownGoal + direction * clamp(goalDist * 0.07, 1.2, 4.2);
    const flight = Math.abs(ball.vx) > 1 ? (keeperX - ball.x) / ball.vx : -1;
    const intercept = flight > 0 && flight < 1.8 && ball.vx * direction < 0;
    const reading = 0.65 + ability(p, 'anticipation') * 0.0035;
    return {
      x: keeperX,
      z: clamp(
        intercept
          ? ball.z + ball.vz * flight * reading
          : 34 + (ball.z - 34) * clamp(2.5 / Math.max(1, goalDist), 0.07, 0.65),
        29.5,
        38.5,
      ),
    };
  }
  const attacking = owner?.side === actor.side;
  if (chasers.includes(actor.index)) {
    const reaction = 0.12 + ability(p, 'anticipation') * 0.003;
    return {
      x: clamp(ball.x + ball.vx * reaction, 1, 104),
      z: clamp(ball.z + ball.vz * reaction, 1, 67),
    };
  }
  const localBallX = direction === 1 ? ball.x : 105 - ball.x;
  let x = actor.anchor.x + (localBallX - 52.5) * 0.35 + (attacking ? 10 : -5);
  if (tactics.style === 'counter') x += attacking ? 5 : -7;
  if (tactics.press === 'high' && !attacking) x += 5;
  if (tactics.press === 'low' && !attacking) x -= 5;
  if (attacking && p.role === 'FWD') {
    const defenders = actors
      .filter((o) => o.side !== actor.side && o.player.role !== 'GK')
      .map((o) => (direction === 1 ? o.pos.x : 105 - o.pos.x))
      .sort((a, b) => b - a);
    const line = defenders[0] ?? 90;
    x = Math.min(x + ability(p, 'offTheBall') * 0.08, Math.max(localBallX, line - 1));
  }
  let z =
    34 + (actor.anchor.z - 34) * (tactics.style === 'wide' ? 1.2 : 0.9) + (ball.z - 34) * 0.16;
  if (!attacking && p.role === 'DEF') {
    const threats = actors.filter((o) => o.side !== actor.side && o.player.role === 'FWD');
    const mark = threats.slice().sort((a, b) => Math.abs(a.pos.z - z) - Math.abs(b.pos.z - z))[0];
    if (mark) {
      const weight = ability(p, 'marking') / 180;
      z = z * (1 - weight) + mark.pos.z * weight;
      x = x * (1 - weight) + ((direction === 1 ? mark.pos.x : 105 - mark.pos.x) - 2) * weight;
    }
  }
  const keeper = actors.find((a) => a.side === actor.side && a.player.role === 'GK');
  const coordination = attacking ? 1 : 1 - ability(keeper?.player ?? p, 'command') / 1000;
  const accuracy =
    ((100 - (ability(p, attacking ? 'offTheBall' : 'positioning') + ability(p, 'teamwork')) / 2) /
      35) *
    coordination;
  return {
    x:
      direction === 1
        ? clamp(x + actor.bias * accuracy, 3, 100)
        : 105 - clamp(x + actor.bias * accuracy, 3, 100),
    z: clamp(z + actor.bias * accuracy, 3, 65),
  };
}
