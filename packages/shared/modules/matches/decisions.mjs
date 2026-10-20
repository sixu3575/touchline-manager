import { clamp } from '../../core/index.mjs';
import { ability, actionQuality } from './skills.mjs';
import { movement } from './locomotion.mjs';
import { groundPassPlan, airborneVelocity } from './ball-motion.mjs';
import { distance, unit, segmentPoint, pitchValue, localX } from './spatial.mjs';
import { carryOptions } from './carrying.mjs';
import {
  attackPhase,
  deliveryOptions,
  deliveryReceptionRisk,
  deliveryThreat,
  tacticalPassValue,
} from './tactical-plan.mjs';
import { positionRoleNames } from '../tactics/index.mjs';

export function playerProfile(p, anchor = { z: 34 }) {
  const pass = (ability(p, 'passing') + ability(p, 'vision') + ability(p, 'decisions')) / 3;
  const carry = (ability(p, 'dribbling') + ability(p, 'agility') + ability(p, 'firstTouch')) / 3;
  const inclination = clamp((carry - pass) / 35, -1, 1),
    wide = Math.abs(anchor.z - 34) > 14;
  const label =
    p.role === 'GK'
      ? '门将出球'
      : p.role === 'DEF'
        ? pass > carry
          ? '出球后卫'
          : '防守后卫'
        : p.role === 'MID'
          ? inclination > 0.05
            ? '推进型中场'
            : '组织型中场'
          : wide
            ? inclination > 0.05
              ? '边路突破手'
              : '边路接应者'
            : ability(p, 'offTheBall') > ability(p, 'vision')
              ? '纵向跑位前锋'
              : '回撤接应前锋';
  return { label, pass, carry, inclination, wide };
}

export function passSpeed(length, quality, lob = false) {
  return lob ? clamp(17 + length * 0.1, 18, 25) : groundPassPlan(length, quality).speed;
}

export function carryTouchSpeed(actor, mode, heading) {
  const limits = movement(actor.player, actor.energy, mode),
    running = Math.max(0, actor.velocity.x * heading.x + actor.velocity.z * heading.z);
  const controlLead =
    0.15 + (50 - ability(actor.player, 'dribbling')) * 0.004 + (mode === 'carryFast' ? 0.05 : 0);
  return Math.min(
    limits.speed + (mode === 'carryFast' ? 1.6 : 0.65),
    Math.max(2.2, running + controlLead),
  );
}

export function interceptionRisk(
  from,
  to,
  speed,
  opponents,
  lob = false,
  flight = distance(from, to) / speed,
) {
  let survival = 1;
  for (const o of opponents) {
    const { t, gap } = segmentPoint(from, to, o.pos);
    if (t < 0.04 || t > 0.99) continue;
    const height = lob ? 4.905 * flight * flight * t * (1 - t) : 0.11;
    if (height > 2.4) continue;
    const arrival = t * flight;
    const reach =
      Math.max(0, gap - 0.55) / movement(o.player, o.energy, 'run').speed +
      0.14 +
      (100 - ability(o.player, 'anticipation')) / 500;
    const threat =
      !lob && gap < 0.7 && arrival > 0.14 ? 0.98 : clamp((arrival + 0.25 - reach) / 0.55, 0, 0.94);
    survival *= 1 - threat;
  }
  return 1 - survival;
}

export function shotCandidate(actor, ball, opponents, direction, quality, rng, direct) {
  const goalX = direction === 1 ? 105 : 0,
    dist = distance(ball, { x: goalX, z: 34 });
  if (
    !direct &&
    (actor.isKeeper ||
      dist > 17 + ability(actor.player, 'longShots') * 0.14 ||
      Math.abs(ball.z - 34) > 20)
  )
    return null;
  const q = direct
    ? quality(actor.setPiece === 'penalty' ? 'penalty' : 'setPieces')
    : quality('finishing');
  if (!direct) {
    const alpha = clamp((dist - 16) / 8, 0, 1);
    q.value = q.value * (1 - alpha) + quality('longShots').value * alpha;
  }
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
  const keeper = opponents.find((o) => o.isKeeper ?? o.player.role === 'GK');
  const expectedKeeperZ = keeper
    ? 34 +
      (ball.z - 34) *
        Math.min(1, Math.abs(keeper.pos.x - goalX) / Math.max(0.5, Math.abs(ball.x - goalX)))
    : 34;
  const g = keeper ? clamp(Math.abs(keeper.pos.z - expectedKeeperZ) / 8, 0, 1) : 1;
  const blocked = interceptionRisk(
    ball,
    { x: goalX, z: 34 },
    27,
    opponents.filter((o) => !o.isKeeper),
  );
  const opportunity =
    actor.setPiece === 'penalty'
      ? 0.76
      : clamp(
          1 /
            (1 +
              Math.exp(
                -(-2.1 - 0.09 * (dist - 12) + 1.8 * (angle - 0.35) - 0.8 * blocked + 2.5 * g),
              )),
          0.005,
          0.8,
        );
  // Geometry-based action value and calibrated expected-goal probability have
  // separate jobs. Calibration changes reported expectation, never goal physics.
  const xg =
    actor.setPiece === 'penalty'
      ? 0.76
      : opportunity / (opportunity + Math.exp(0.9) * (1 - opportunity));
  const shotReturnScore = clamp(xg * (0.65 + q.value / 100), 0, 0.98);
  return {
    type: 'shot',
    intent: actor.setPiece === 'penalty' ? 'penalty' : direct ? 'freeKick' : 'shoot',
    quality: q,
    xg,
    utility:
      shotReturnScore -
      0.3 * pitchValue(ball, direction) -
      (1 - shotReturnScore) * 0.025 +
      (actor.player.role === 'FWD' ? 0.02 : 0),
    reason: direct
      ? '定位球按门将和球门位置瞄准'
      : blocked > 0.7
        ? '射门线路有封堵，需权衡传球'
        : '已有射门角度，尝试完成进攻',
    make: () => {
      // Angular error grows with range and pressure; quality narrows dispersion.
      // Opportunity ranks actions; xG records expectation, neither awards a goal.
      const speed = Math.hypot(actor.velocity.x, actor.velocity.z);
      const lateral = Math.abs(actor.velocity.z) / Math.max(1, speed);
      const error =
        0.7 + dist * (0.05 + 0.35 * (1 - q.value / 100)) + q.pressure * 1.2 + lateral * 0.5;
      const aim =
        34 + (rng() < 0.5 ? -1 : 1) * (1.1 + rng() * 1.2) + (rng() + rng() - 1) * error * 2;
      const target = { x: goalX + direction * 1.5, z: aim },
        flight = Math.max(
          0.15,
          distance(ball, target) / (23 + 0.1 * ability(actor.player, 'strength')),
        );
      const targetY =
        0.2 +
        rng() * (0.9 + (100 - q.value) / 14 + Math.max(0, dist - 10) * 0.06 + q.pressure * 0.5);
      const kickAim = { ...target, y: targetY };
      return { ...airborneVelocity(ball, kickAim, flight), xg, kickAim, kickFlight: flight };
    },
  };
}

export function chooseAction(actor, actors, ball, direction, tactics, rng, context = {}) {
  actor.direction = direction;
  const p = actor.player,
    a = (key) => ability(p, key),
    profile = actor.profile ?? playerProfile(p, actor.anchor);
  const opponents = actors.filter((o) => o.side !== actor.side && !o.sentOff);
  const quality = (key) => actionQuality(actor, ball, key, opponents, context.lapse);
  const pressure = quality('passing').pressure,
    currentValue = pitchValue(ball, direction);
  const minute = context.minute ?? 0,
    time = context.time ?? 0;
  const tactical = attackPhase(
    actors,
    ball,
    actor.side,
    direction,
    tactics,
    time,
    context.continuity,
  );
  const ambition =
    minute >= 70 && context.trailing ? (0.02 * ((p.personality?.ambition ?? 50) - 50)) / 50 : 0;
  const direct =
    actor.setPiece === 'penalty' ||
    (actor.setPiece === 'freeKick' &&
      distance(ball, { x: direction === 1 ? 105 : 0, z: 34 }) < 30 &&
      Math.abs(ball.z - 34) < 20);
  const candidates = [],
    shot = shotCandidate(actor, ball, opponents, direction, quality, rng, direct);
  if (shot) {
    shot.utility += ambition;
    candidates.push(shot);
  }
  const mates = actors.filter((o) => o.side === actor.side && o !== actor && !o.sentOff);
  if (!actor.setPiece && !actor.isKeeper && pressure < 0.65 && (actor.hold ?? 0) < 1.2) {
    candidates.push({
      type: 'hold',
      intent: 'shield',
      quality: quality('firstTouch'),
      utility:
        0.004 +
        (tactics.style === 'possession' ? 0.008 : 0) -
        pressure * 0.035 -
        Math.min(2, actor.hold ?? 0) * 0.03,
      reason: '护住球观察接应，等待安全线路',
      make: () => ({ x: 0, y: 0, z: 0 }),
    });
  }
  const nearest = mates
    .slice()
    .sort((a, b) => distance(actor.pos, a.pos) - distance(actor.pos, b.pos))[0];
  for (const mate of mates) {
    const len = distance(ball, mate.pos);
    if (len < 3 || len > 18 + a('vision') * 0.45) continue;
    const forward = (mate.pos.x - ball.x) * direction;
    const deliveries = deliveryOptions(actor, mate, ball, direction);
    const variants = deliveries.length ? [] : [{ intent: 'feet', lob: false, lead: 0 }];
    for (const option of deliveries) variants.push({ intent: 'cross', lead: 0, ...option });
    if (!deliveries.length && forward > 2 && !mate.isKeeper && len > 9)
      variants.push({ intent: 'through', lob: false, lead: 2 + a('vision') * 0.035 });
    if (
      !deliveries.length &&
      len > 26 &&
      (tactics.style === 'counter' || Math.abs(ball.z - mate.pos.z) > 24)
    )
      variants.push({ intent: 'switch', lob: true, lead: 0 });
    for (const variant of variants) {
      const cross = variant.intent === 'cross';
      const q = quality(
        actor.setPiece === 'corner'
          ? 'setPieces'
          : actor.isKeeper
            ? 'distribution'
            : cross && variant.delivery !== 'cutback'
              ? 'crossing'
              : 'passing',
      );
      const ground = variant.lob ? null : groundPassPlan(len, q.value);
      const speed = ground?.speed ?? passSpeed(len, q.value, true),
        flight = variant.lob ? Math.max(1.15, len / speed) : ground.flight;
      const leadTime = clamp(flight * 0.45, 0, 0.65);
      const target = {
        x: clamp(
          mate.pos.x +
            mate.velocity.x * leadTime +
            direction *
              (variant.lead
                ? Math.min(
                    variant.lead,
                    0.3 +
                      0.35 *
                        movement(mate.player, mate.energy).acceleration *
                        Math.max(0.1, flight - 0.2) ** 2,
                  )
                : 0),
          2.5,
          102.5,
        ),
        z: clamp(mate.pos.z + mate.velocity.z * leadTime, 2.5, 65.5),
      };
      const laneRisk = interceptionRisk(ball, target, speed, opponents, variant.lob, flight);
      const risk = cross
        ? 1 - (1 - laneRisk) * (1 - deliveryReceptionRisk(mate, target, opponents, variant))
        : laneRisk;
      // A high-risk corridor is not a viable professional pass, except a necessary clearance.
      if (risk > 0.88 && pressure < 0.7) continue;
      if (cross && risk > 0.75) continue;
      if (mate !== nearest && a('vision') < 45 && len > 25 && risk > 0.3) continue;
      const space = Math.min(12, ...opponents.map((o) => distance(o.pos, target)));
      const offsideLine =
        opponents.map((o) => localX(o.pos.x, direction)).sort((a, b) => b - a)[1] ?? 105;
      if (
        localX(mate.pos.x, direction) >
        Math.max(52.5, localX(ball.x, direction), offsideLine) + 0.01
      )
        continue;
      const accuracy = clamp(
        0.88 + 0.001 * (q.value - 50) - Math.max(0, len - 15) * 0.002,
        0.55,
        0.98,
      );
      const success = (1 - risk) * accuracy;
      const style = tacticalPassValue(
        tactics,
        tactical,
        variant,
        actor,
        mate,
        ball,
        target,
        direction,
        success,
        space,
      );
      const escape = pressure * clamp(space / 7, 0, 1) * 0.14;
      const outlets = mates.filter(
        (o) => o !== mate && distance(o.pos, target) > 5 && distance(o.pos, target) < 23,
      ).length;
      const retention =
        0.008 * success +
        0.003 * Math.min(3, outlets) +
        0.012 * pressure * Math.min(1, actor.hold ?? 0);
      const penetration =
        0.035 *
        success *
        clamp((forward - 10) / 12, 0, 1) *
        clamp((localX(target.x, direction) - 70) / 20, 0, 1);
      const utility =
        success * pitchValue(target, direction) -
        currentValue * (cross ? 0.65 : 1) -
        (1 - success) * (cross ? 0.045 + currentValue * 0.15 : 0.07 + currentValue * 0.3) +
        (cross ? deliveryThreat(mate, target, direction, variant, success) : 0) +
        escape +
        retention +
        penetration +
        style -
        0.035 * profile.inclination * clamp(forward / 10, 0.3, 1) +
        ambition * Math.sign(forward);
      candidates.push({
        type: cross ? 'cross' : 'pass',
        intent: variant.intent,
        delivery: variant.delivery,
        receiverId: mate.player.id,
        target,
        quality: q,
        utility,
        estimatedSuccess: success,
        flight,
        reason:
          variant.intent === 'through'
            ? '队友前插，传到其前方空间'
            : variant.intent === 'switch'
              ? '转换进攻侧，避开密集防守'
              : cross
                ? variant.delivery === 'cutback'
                  ? '下底后倒三角寻找后排接应'
                  : variant.delivery === 'low'
                    ? '低平球横传寻找禁区接应'
                    : '高球传中寻找禁区包抄'
                : tactics.style === 'wide' && Math.abs(target.z - 34) > 18
                  ? '向边路接应点出球，展开进攻宽度'
                  : pressure > 0.5
                    ? '受到压迫，交给更空闲的队友'
                    : forward > 4
                      ? '通过可用线路向前传递'
                      : '利用接应点保持球权',
        make: () => {
          const error = (1 - q.value / 100) * (0.28 + 0.025 * len),
            aim = {
              x: target.x + (rng() - 0.5) * error * 2,
              z: target.z + (rng() - 0.5) * error * 2,
            };
          const actualLength = distance(ball, aim);
          const launch = variant.lob
            ? actualLength / flight
            : groundPassPlan(actualLength, q.value).speed;
          const heading = unit(ball, aim);
          if (variant.lob)
            return {
              ...airborneVelocity(ball, { ...aim, y: 0.15 }, flight),
              kickAim: { ...aim, y: 0.15 },
              kickFlight: flight,
            };
          return {
            kickAim: aim,
            x: heading.x * launch,
            z: heading.z * launch,
            y: 0.08,
          };
        },
      });
    }
  }
  const q = quality('dribbling');
  if (!actor.setPiece && !actor.isKeeper) {
    for (const option of carryOptions(
      actor,
      ball,
      direction,
      opponents,
      q,
      profile,
      time,
      tactical,
      actors,
    )) {
      const { destination, success } = option;
      candidates.push({
        type: 'dribble',
        intent: option.intent,
        destination,
        mode: option.mode,
        quality: q,
        utility:
          success * pitchValue(destination, direction) -
          currentValue -
          (1 - success) * (0.09 + currentValue * 0.4) +
          option.bonus -
          option.ownRisk -
          0.03 * clamp((3 - Math.min(destination.z, 68 - destination.z)) / 3, 0, 1) +
          ambition,
        estimatedSuccess: success,
        reason: option.reason,
        make: () => {
          const travel = unit(ball, destination),
            speed = carryTouchSpeed(actor, option.mode, travel);
          const error = ((rng() - 0.5) * (100 - q.value)) / 350;
          return {
            x: travel.x * speed - travel.z * error,
            z: travel.z * speed + travel.x * error,
            y: 0.08,
          };
        },
      });
    }
  }
  if (
    actor.isKeeper ||
    (pressure > 0.7 && localX(ball.x, direction) < 30) ||
    (pressure > 0.55 && (actor.hold ?? 0) > 1.2)
  ) {
    const target = { x: clamp(ball.x + direction * 40, 1, 104), z: ball.z < 34 ? 5 : 63 };
    candidates.push({
      type: 'pass',
      intent: 'clearance',
      quality: quality(actor.isKeeper ? 'distribution' : 'passing'),
      utility: pressure * 0.17 - 0.07,
      reason: '本方危险区域受压，优先解围',
      make: () => {
        const t = 1.7;
        return airborneVelocity(ball, { ...target, y: 0.15 }, t);
      },
    });
  }
  let choices = direct
    ? candidates.filter((c) => c.type === 'shot')
    : actor.setPiece
      ? candidates.filter(
          (c) => c.type !== 'dribble' && (actor.setPiece !== 'indirect' || c.type !== 'shot'),
        )
      : candidates;
  if (!choices.length)
    choices = [
      {
        type: 'pass',
        intent: 'clearance',
        quality: quality('passing'),
        reason: '没有安全短传，向边线解围',
        utility: 0,
        make: () => ({ x: direction * 17, z: ball.z < 34 ? -8 : 8, y: 3 }),
      },
    ];
  // Independent, bounded decision error; higher judgement follows opportunity values more closely.
  // One evaluation per intent, rather than a high-temperature lottery on every foot tap.
  const noise = 0.006 + 0.045 * (1 - a('decisions') / 100);
  let best = choices[0],
    value = -Infinity;
  const disturbances = new Map();
  for (const c of choices) {
    const kind = c.type === 'cross' ? 'pass' : c.type;
    if (!disturbances.has(kind)) disturbances.set(kind, (rng() - 0.5) * noise * 2);
    const u = c.utility + disturbances.get(kind);
    if (u > value) {
      value = u;
      best = c;
    }
  }
  if (best.type === 'hold') actor.intent = { kind: 'settle', expiresAt: time + 0.6 };
  else if (best.type === 'dribble')
    actor.intent = {
      kind: 'carry',
      mode: best.mode,
      destination: best.destination,
      expiresAt: time + 1.6 + a('decisions') * 0.01,
    };
  else
    actor.intent = {
      kind: best.intent,
      targetId: best.receiverId,
      destination: best.target,
      expiresAt: time + 1.8,
    };
  return {
    type: best.type,
    intent: best.intent,
    delivery: best.delivery,
    phase: tactical.phase,
    receiverId: best.receiverId,
    quality: best.quality,
    reason:
      (positionRoleNames[actor.positionRole] ? positionRoleNames[actor.positionRole] + '：' : '') +
      best.reason,
    estimatedSuccess: best.estimatedSuccess,
    flight: best.flight,
    destination: best.destination ?? best.target,
    ...best.make(),
  };
}
