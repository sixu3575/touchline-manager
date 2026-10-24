import { clamp } from '../../core/index.mjs';
import { ability, actionQuality } from './skills.mjs';
import { movement } from './locomotion.mjs';
import {
  groundPassPlan,
  airborneVelocity,
  groundArrivalTime,
  groundTravel,
} from './ball-motion.mjs';
import { distance, unit, segmentPoint, localX } from './spatial.mjs';
import { carryOptions } from './carrying.mjs';
import { arrivalTime, pursuitMode } from './arrival.mjs';
import { exitBlocked } from './onball.mjs';
import { continuationValue, lossValue } from './opportunity.mjs';
import { prepareKick, turnRate, angleDifference } from './execution.mjs';
import {
  attackPhase,
  deliveryOptions,
  deliveryReceptionRisk,
  deliveryThreat,
  midfieldOutletValue,
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
  preparation = 0,
) {
  let survival = 1;
  for (const o of opponents) {
    const { t, gap } = segmentPoint(from, to, o.pos);
    if (t > 0.99) continue;
    const height = lob ? 4.905 * flight * flight * t * (1 - t) : 0.11;
    if (height > 2.4) continue;
    const arrival =
      preparation + (lob ? t * flight : groundArrivalTime(speed, distance(from, to) * t));
    const point = { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t };
    const reach = arrivalTime(
      o,
      point,
      pursuitMode(o, point),
      0.08 + (100 - ability(o.player, 'anticipation')) * 0.002,
    );
    const threat =
      !lob && gap < 0.43 && distance(from, o.pos) < 3
        ? 0.98
        : clamp((arrival + 0.15 - reach) / 0.55, 0, 0.94);
    survival *= 1 - threat;
  }
  return 1 - survival;
}

// A pass can clear every point on its line yet still be won by a defender at
// the intended receiving point. Estimate that race from the receiver's and
// defenders' actual movement capabilities, reaction, and current position.
export function receptionContestRisk(receiver, target, flight, opponents, preparation = 0) {
  const defenders = opponents.filter((opponent) => !opponent.sentOff);
  if (!defenders.length) return 0;
  const receiverArrival =
    preparation + arrivalTime(receiver, target, pursuitMode(receiver, target), 0);
  const contestAt = preparation + Math.max(flight, receiverArrival);
  let survival = 1;
  for (const opponent of defenders) {
    const reaction = 0.08 + (100 - ability(opponent.player, 'anticipation')) * 0.002;
    const reach = preparation + arrivalTime(opponent, target, pursuitMode(opponent, target), reaction);
    const threat = clamp((contestAt + 0.15 - reach) / 0.55, 0, 0.94);
    survival *= 1 - threat;
  }
  return 1 - survival;
}

export function passExecutionAccuracy(quality, length) {
  return clamp(0.88 + 0.001 * (quality - 50) - Math.max(0, length - 15) * 0.002, 0.55, 0.98);
}

export function passAimError(quality, length) {
  return (1 - quality / 100) * (0.28 + 0.025 * length);
}

// Re-estimate a committed pass against the state immediately before release.
// This is a decision aid only; the eventual outcome still comes from physical
// contact with the ball and is never forced by this estimate.
export function releasedPassSuccess(action, receiver, ball, opponents) {
  if (!receiver || !action.destination) return action.estimatedSuccess ?? 0;
  const defenders = opponents.filter((opponent) => !opponent.sentOff);
  const length = distance(ball, action.destination);
  const speed = Math.hypot(action.x ?? 0, action.z ?? 0);
  const flight = action.kickFlight ?? action.flight ?? groundArrivalTime(speed, length);
  if (!Number.isFinite(flight)) return 0;
  const laneRisk = interceptionRisk(
    ball,
    action.destination,
    speed,
    defenders,
    Boolean(action.kickFlight),
    flight,
  );
  const deliveryRisk =
    action.type === 'cross'
      ? deliveryReceptionRisk(receiver, action.destination, defenders, {
          lob: Boolean(action.kickFlight),
          delivery: action.delivery,
        })
      : 0;
  const receiverArrival = arrivalTime(
    receiver,
    action.destination,
    pursuitMode(receiver, action.destination),
    0,
  );
  const receiveMargin = flight - receiverArrival;
  const firstTouchRisk =
    (1 - ability(receiver.player, 'firstTouch') / 120) /
    (1 + Math.exp((receiveMargin + 0.3) / 0.18));
  const contestRisk = receptionContestRisk(receiver, action.destination, flight, defenders);
  const quality = action.quality?.value ?? 50;
  const accuracy = passExecutionAccuracy(quality, length);
  return (1 - Math.max(laneRisk, deliveryRisk, contestRisk)) * accuracy * (1 - firstTouchRisk);
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
                -(-2.1 - 0.09 * (dist - 12) + 1.8 * (angle - 0.35) - 1.4 * blocked -
                  0.9 * q.pressure +
                  2.5 * g),
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
      (1 - shotReturnScore) * lossValue(ball, direction) * 0.25 +
      (actor.player.role === 'FWD' ? 0.006 : 0),
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
        0.55 + dist * (0.035 + 0.26 * (1 - q.value / 100)) + q.pressure * 0.9 + lateral * 0.35;
      const intendedAim = 34 + (rng() < 0.5 ? -1 : 1) * (1.1 + rng() * 1.2);
      const aim = intendedAim + (rng() + rng() - 1) * error * 1.6;
      // Strength supplies available power, not an instruction to blast every
      // six-metre finish at full effort. Near, unhurried finishes use placement;
      // range and closing pressure call for more power. No shot is removed.
      const availablePower = 23 + 0.1 * ability(actor.player, 'strength');
      const intendedSpeed = Math.min(availablePower, 20 + dist * 0.25 + q.pressure * 4);
      const target = { x: goalX + direction * 1.5, z: aim },
        flight = Math.max(0.15, distance(ball, target) / intendedSpeed);
      // Aim height is a point in the goal mouth, with skill-, range- and
      // pressure-dependent dispersion around it. The previous expression used
      // a low-skill spread of several metres above the turf, so average shots
      // were deliberately launched over the bar far too often.
      const targetY =
        0.15 +
        rng() *
          (1.5 + (100 - q.value) / 65 + Math.max(0, dist - 10) * 0.035 + q.pressure * 0.4);
      const kickAim = { ...target, y: targetY };
      return {
        ...airborneVelocity(ball, kickAim, flight),
        xg,
        kickAim,
        kickFlight: flight,
        bodyAim: { x: target.x, z: intendedAim },
      };
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
    currentValue = continuationValue(ball, actor, actors, direction);
  const lost = lossValue(ball, direction);
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
  const closingTime = Math.min(
    Infinity,
    ...opponents.map((o) => arrivalTime(o, ball, pursuitMode(o, ball), o.reaction ?? 0.15)),
  );
  if (!actor.setPiece && !actor.isKeeper) {
    const nearestThreat = opponents
      .slice()
      .sort((a, b) => distance(a.pos, ball) - distance(b.pos, ball))[0];
    const shieldHeading = nearestThreat ? unit(nearestThreat.pos, ball) : { x: direction, z: 0 };
    const waitingRisk = Math.exp(-closingTime / 1.2) * 0.5;
    candidates.push({
      type: 'hold',
      intent: 'shield',
      quality: quality('firstTouch'),
      utility:
        (1 - waitingRisk) * currentValue -
        waitingRisk * lost +
        (tactics.style === 'possession' ? 0.002 : 0),
      shieldHeading,
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
      const corridor = unit(ball, target);
      const preview = prepareKick(
        actor,
        {
          type: 'pass',
          x: corridor.x * speed,
          z: corridor.z * speed,
          y: variant.lob ? 4.905 * flight : 0.08,
        },
        ball,
        time,
        0,
        false,
        Boolean(context.oneTouch),
      );
      const preparation = Math.max(
        preview.readyAt - time,
        (Math.abs(angleDifference(Math.atan2(corridor.z, corridor.x), actor.facing ?? 0)) -
          Math.PI / 2 -
          0.05) /
          turnRate(actor),
      );
      const rollingSpeed = Math.hypot(ball.vx ?? 0, ball.vz ?? 0);
      const rollingDistance = groundTravel(rollingSpeed, preparation);
      const releasePoint = {
        x: ball.x + ((ball.vx ?? 0) / Math.max(0.001, rollingSpeed)) * rollingDistance,
        z: ball.z + ((ball.vz ?? 0) / Math.max(0.001, rollingSpeed)) * rollingDistance,
      };
      const futureTarget = {
        x: clamp(target.x + mate.velocity.x * preparation, 1, 104),
        z: clamp(target.z + mate.velocity.z * preparation, 1, 67),
      };
      const laneRisk = interceptionRisk(
        releasePoint,
        futureTarget,
        speed,
        opponents,
        variant.lob,
        flight,
        preparation,
      );
      const obstructed = exitBlocked(
        ball,
        {
          x: corridor.x * speed,
          z: corridor.z * speed,
          y: variant.lob ? 4.905 * flight : 0.08,
        },
        opponents,
      );
      const contestRisk = receptionContestRisk(mate, futureTarget, flight, opponents, preparation);
      const deliveryRisk = cross ? deliveryReceptionRisk(mate, target, opponents, variant) : 0;
      const risk = Math.max(laneRisk, contestRisk, deliveryRisk, obstructed ? 0.98 : 0);
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
      const accuracy = passExecutionAccuracy(q.value, len);
      const receiveMargin =
        flight + preparation - arrivalTime(mate, futureTarget, pursuitMode(mate, futureTarget), 0);
      const firstTouchRisk =
        (1 - ability(mate.player, 'firstTouch') / 120) /
        (1 + Math.exp((receiveMargin + 0.3) / 0.18));
      const success = (1 - risk) * accuracy * (1 - firstTouchRisk);
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
      const escape = success * pressure * clamp(space / 7, 0, 1) * 0.14;
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
        success * continuationValue(target, mate, actors, direction) -
        (1 - success) * lost * (cross ? 0.6 : 1) +
        (cross ? deliveryThreat(mate, target, direction, variant, success) * 0.25 : 0) +
        midfieldOutletValue(tactical, mate, forward, success, space) +
        (escape + retention + penetration + style) * 0.25 -
        0.035 * 0.25 * profile.inclination * clamp(forward / 10, 0.3, 1) +
        ambition * 0.25 * Math.sign(forward);
      candidates.push({
        type: cross ? 'cross' : 'pass',
        intent: variant.intent,
        delivery: variant.delivery,
        receiverId: mate.player.id,
        target,
        receiverAtDecision: { ...mate.pos },
        receiverVelocity: { ...mate.velocity },
        leadTime,
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
          const error = passAimError(q.value, len),
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
          success * continuationValue(destination, actor, actors, direction) -
          (1 - success) * lost +
          option.bonus * 0.25 -
          option.ownRisk * 0.4 -
          0.01 * clamp((3 - Math.min(destination.z, 68 - destination.z)) / 3, 0, 1) +
          ambition * 0.25,
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
    localX(ball.x, direction) < 35 ||
    (pressure > 0.55 && (actor.hold ?? 0) > 1.2)
  ) {
    const target = { x: clamp(ball.x + direction * 40, 1, 104), z: ball.z < 34 ? 5 : 63 };
    candidates.push({
      type: 'pass',
      intent: 'clearance',
      quality: quality(actor.isKeeper ? 'distribution' : 'passing'),
      utility:
        0.5 * continuationValue(target, actor, actors, direction) -
        0.5 * lossValue(target, direction) -
        lost / (1 + Math.exp((closingTime - (0.3 + (100 - a('balance')) * 0.002)) / 0.2)),
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
  if (best.type === 'hold')
    actor.intent = { kind: 'settle', shieldHeading: best.shieldHeading, expiresAt: time + 1 };
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
    receiverAtDecision: best.receiverAtDecision,
    receiverVelocity: best.receiverVelocity,
    leadTime: best.leadTime,
    quality: best.quality,
    utility: best.utility,
    reason:
      (positionRoleNames[actor.positionRole] ? positionRoleNames[actor.positionRole] + '：' : '') +
      best.reason,
    estimatedSuccess: best.estimatedSuccess,
    flight: best.flight,
    destination: best.destination ?? best.target,
    ...best.make(),
  };
}
