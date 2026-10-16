import { clamp } from '../../core/index.mjs';

export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export function ability(p, key) {
  return p.attributes?.[key] ?? 50;
}
export function movement(p, energy) {
  return {
    speed: (4.7 + ability(p, 'sprintSpeed') * 0.037) * (0.7 + energy * 0.003),
    acceleration: (1.8 + ability(p, 'acceleration') * 0.052) * (0.75 + energy * 0.0025),
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
export function chooseAction(actor, actors, ball, direction, tactics, rng) {
  const p = actor.player,
    a = (key) => ability(p, key);
  const opponents = actors.filter((o) => o.side !== actor.side);
  const pressure = opponents.reduce(
    (v, o) => Math.max(v, Math.max(0, 5 - distance(o.pos, actor.pos))),
    0,
  );
  const goalX = direction === 1 ? 105 : 0;
  const goalDistance = distance(actor.pos, { x: goalX, z: 34 });
  const goalAngle = Math.atan2(3.66, Math.max(1, Math.abs(goalX - actor.pos.x))) * 2;
  const central = Math.abs(actor.pos.z - 34) < 21;
  const shotRange = 18 + a('longShots') * 0.13;
  if (
    p.role !== 'GK' &&
    central &&
    goalDistance < shotRange &&
    laneRisk(
      actor.pos,
      { x: goalX, z: 34 },
      opponents.filter((o) => o.player.role !== 'GK'),
    ) < 12 &&
    (goalDistance < 10 || rng() < 0.2 + a('decisions') / 250 - pressure * 0.05)
  ) {
    const skill = goalDistance > 20 ? a('longShots') : a('finishing');
    const composure = a('composure') / 100;
    const weakPenalty = p.preferredFoot === 'both' ? 1 : 1 + (100 - (p.weakFoot ?? 50)) / 400;
    const error = (0.4 + (100 - skill) * 0.065 + pressure * (1 - composure) * 0.3) * weakPenalty;
    const aim = 34 + (rng() < 0.5 ? -1 : 1) * (1.4 + rng() * 1.5) + (rng() - 0.5) * error * 2;
    const target = { x: goalX + direction * 1.5, z: aim };
    const len = distance(ball, target);
    const speed = 20 + a('strength') * 0.11;
    const flight = len / speed;
    const height = 0.3 + rng() * (0.7 + (100 - skill) / 16);
    return {
      type: 'shot',
      x: ((target.x - ball.x) / len) * speed,
      z: ((target.z - ball.z) / len) * speed,
      y: (height - ball.y + 4.905 * flight * flight) / flight,
      xg: clamp(goalAngle * Math.exp(-goalDistance / 24) * 0.65, 0.01, 0.65),
      onTarget: Math.abs(aim - 34) < 3.55 && height < 2.33,
    };
  }
  let best = null,
    utility = -Infinity;
  for (const mate of actors) {
    if (mate.side !== actor.side || mate === actor || mate.player.role === 'GK') continue;
    const len = distance(actor.pos, mate.pos);
    if (len < 5 || len > 16 + a('vision') * 0.38) continue;
    const progress = (mate.pos.x - actor.pos.x) * direction;
    const space = Math.min(12, ...opponents.map((o) => distance(o.pos, mate.pos)));
    const risk = laneRisk(actor.pos, mate.pos, opponents);
    const value =
      progress * (tactics.style === 'counter' ? 1.2 : 0.6) +
      space * 1.6 -
      risk * 2.5 -
      len * 0.15 +
      (tactics.style === 'wide' ? Math.abs(mate.pos.z - 34) * 0.15 : 0) +
      ((rng() - 0.5) * (100 - a('decisions'))) / 9;
    if (value > utility) {
      utility = value;
      best = mate;
    }
  }
  const hold = tactics.style === 'possession' ? 0.5 : 1.5;
  if (best && (pressure > 3.3 || (actor.hold > hold && utility > -4) || actor.hold > 4)) {
    const len = distance(ball, best.pos);
    const cross =
      actor.setPiece === 'corner' ||
      (tactics.style === 'wide' &&
        Math.abs(actor.pos.z - 34) > 19 &&
        105 - Math.abs(goalX - actor.pos.x) > 68);
    const lob = cross || (len > 27 && tactics.style === 'counter');
    const skill = actor.setPiece
      ? a('setPieces')
      : p.role === 'GK'
        ? a('distribution')
        : cross
          ? a('crossing')
          : a('passing');
    const error = ((100 - skill) / 100) * (0.6 + len * 0.055);
    const flight = lob ? Math.max(1, len / 17) : len / (12 + len * 0.13);
    const target = {
      x: best.pos.x + best.velocity.x * flight * 0.55 + (rng() - 0.5) * error * 2,
      z: best.pos.z + best.velocity.z * flight * 0.55 + (rng() - 0.5) * error * 2,
    };
    return {
      type: cross ? 'cross' : 'pass',
      receiverId: best.player.id,
      x: (target.x - ball.x) / flight,
      z: (target.z - ball.z) / flight,
      y: lob ? 4.905 * flight : 0.2,
    };
  }
  // Short physical taps into space; the ball is never attached to the dribbler.
  const defender = opponents
    .slice()
    .sort((a, b) => distance(a.pos, actor.pos) - distance(b.pos, actor.pos))[0];
  const dodge =
    defender && distance(defender.pos, actor.pos) < 4
      ? Math.sign(actor.pos.z - defender.pos.z || 1) * (1.5 + a('dribbling') / 70)
      : (34 - actor.pos.z) * 0.05;
  const error = ((rng() - 0.5) * (100 - a('dribbling'))) / 80;
  return {
    type: 'dribble',
    x: direction * (3.6 + a('dribbling') * 0.019),
    z: clamp(dodge + error, -3, 3),
    y: 0.1,
  };
}

export function targetFor(actor, actors, ball, owner, direction, tactics, chasers) {
  const p = actor.player;
  const ownGoal = direction === 1 ? 0 : 105;
  if (p.role === 'GK') {
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
