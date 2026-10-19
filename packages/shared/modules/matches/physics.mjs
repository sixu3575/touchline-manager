import RAPIER from '@dimforge/rapier3d-compat';
import { AIR_DRAG, BALL_MOTION } from './ball-motion.mjs';
import { movement } from './locomotion.mjs';
await RAPIER.init();

export const FIELD = Object.freeze({ length: 105, width: 68, goalWidth: 7.32, goalHeight: 2.44 });
export const BALL_RADIUS = BALL_MOTION.radius;
export const STEP = 1 / 20;
const vector = (x, y, z) => ({ x, y, z });

export function restorePhysics(snapshot) {
  const world = RAPIER.World.restoreSnapshot(snapshot.world);
  return {
    world,
    ball: world.getRigidBody(snapshot.ball),
    collider: world.getCollider(snapshot.collider),
    legRecovery: new Map(),
  };
}

// The world uses metres, seconds and kilograms. Y is elevation; Z is pitch width.
export function createPhysics() {
  const world = new RAPIER.World(vector(0, -9.81, 0));
  world.timestep = STEP;
  world.numSolverIterations = 4;
  world.integrationParameters.normalizedAllowedLinearError = 0.001;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(60, 0.2, 40)
      .setTranslation(52.5, -0.2, 34)
      // Grass resistance is integrated explicitly below. Rapier 0.21 caps spin
      // at ~45 degrees/step, which otherwise turns a rolling ball into a skid.
      .setFriction(0)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setRestitution(0.48)
      .setCollisionGroups(0x00080001),
  );
  for (const x of [0, 105]) {
    for (const z of [34 - 3.66, 34 + 3.66])
      world.createCollider(
        RAPIER.ColliderDesc.cylinder(1.22, 0.06).setTranslation(x, 1.22, z).setRestitution(0.62),
      );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.06, 0.06, 3.72).setTranslation(x, 2.44, 34).setRestitution(0.62),
    );
    // Ball-only, energy-absorbing net: Min overrides the ball's restitution.
    // Posts remain hard; the goal mouth stays open and never blocks a legal shot.
    const net = (shape) =>
      world.createCollider(
        shape
          .setRestitution(0)
          .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min)
          .setFriction(1)
          .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max)
          .setCollisionGroups(0x00040001),
      );
    net(RAPIER.ColliderDesc.cuboid(0.07, 1.25, 3.8).setTranslation(x === 0 ? -2 : 107, 1.25, 34));
    for (const z of [30.25, 37.75])
      net(RAPIER.ColliderDesc.cuboid(1, 1.25, 0.04).setTranslation(x === 0 ? -1 : 106, 1.25, z));
    net(RAPIER.ColliderDesc.cuboid(1, 0.04, 3.8).setTranslation(x === 0 ? -1 : 106, 2.5, 34));
  }
  const ball = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(52.5, BALL_RADIUS + 0.01, 34)
      .setCcdEnabled(true)
      .setLinearDamping(0)
      .setAngularDamping(0.015)
      .setCanSleep(false),
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.ball(BALL_RADIUS)
      .setMass(BALL_MOTION.mass)
      .setFriction(0.28)
      .setRestitution(0.6)
      .setCollisionGroups(0x0001ffff),
    ball,
  );
  return { world, ball, collider, legRecovery: new Map() };
}

export function createBody(physics, heightCm, strength, x, z) {
  const height = heightCm / 100;
  const body = physics.world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, height / 2, z)
      .lockRotations()
      .setCanSleep(false),
  );
  // Movement is force controlled in the horizontal plane. Bodies still collide.
  body.setEnabledTranslations(true, false, true, true);
  const collider = physics.world.createCollider(
    RAPIER.ColliderDesc.capsule(Math.max(0.25, height / 2 - 0.46), 0.28)
      .setTranslation(0, 0.18, 0)
      .setMass(60 + strength * 0.3)
      .setFriction(0)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setRestitution(0.1)
      .setCollisionGroups(0x00020007),
    body,
  );
  // Two narrow lower legs leave a real ground-level gap; a solid trunk down to
  // the turf made every forward first touch collide with the receiver's own body.
  const legs = [-1, 1].map((side) =>
    physics.world.createCollider(
      RAPIER.ColliderDesc.capsule(0.12, 0.08)
        .setTranslation(0, 0.23 - height / 2, side * 0.24)
        .setDensity(0)
        .setFriction(0)
        .setRestitution(0.1)
        .setCollisionGroups(0x00020007),
      body,
    ),
  );
  // A finite foot contact volume; it can be oriented toward the ball, not extended.
  const foot = physics.world.createCollider(
    RAPIER.ColliderDesc.ball(0.34)
      .setTranslation(0.45, 0.2 - height / 2, 0)
      .setSensor(true)
      .setCollisionGroups(0x00100001),
    body,
  );
  const head = physics.world.createCollider(
    RAPIER.ColliderDesc.ball(0.32)
      .setTranslation(0, height / 2 - 0.1, 0)
      .setSensor(true)
      .setCollisionGroups(0x00100001),
    body,
  );
  return { body, collider, legs, foot, head, height };
}

export function createHands(physics, actor) {
  return physics.world.createCollider(
    RAPIER.ColliderDesc.ball(0.35)
      .setTranslation(0, 0, 0)
      .setSensor(true)
      .setCollisionGroups(0x00100001),
    actor.body,
  );
}

export function orientHands(actor, ballPosition, reach) {
  const p = actor.body.translation();
  const d = Math.hypot(ballPosition.x - p.x, ballPosition.z - p.z) || 1;
  const extension = Math.min(d, reach);
  actor.hands.setTranslationWrtParent(
    vector(
      ((ballPosition.x - p.x) / d) * extension,
      Math.max(0.3, Math.min(actor.height + 0.35, ballPosition.y)) - actor.height / 2,
      ((ballPosition.z - p.z) / d) * extension,
    ),
  );
}

export function orientFoot(actor, ballPosition) {
  const p = actor.body.translation();
  const d = Math.hypot(ballPosition.x - p.x, ballPosition.z - p.z) || 1;
  const facing =
    Math.hypot(actor.velocity?.x ?? 0, actor.velocity?.z ?? 0) > 0.4
      ? actor.velocity
      : { x: actor.direction ?? 1, z: 0 };
  const norm = Math.hypot(facing.x, facing.z) || 1;
  actor.legs?.forEach((leg, i) =>
    leg.setTranslationWrtParent(
      vector(
        (-facing.z / norm) * (i ? 1 : -1) * 0.24,
        0.23 - actor.height / 2,
        (facing.x / norm) * (i ? 1 : -1) * 0.24,
      ),
    ),
  );
  actor.foot.setTranslationWrtParent(
    vector(
      ((ballPosition.x - p.x) / d) * 0.45,
      0.2 - actor.height / 2,
      ((ballPosition.z - p.z) / d) * 0.45,
    ),
  );
}

// Query the current Rapier shapes: narrow-phase sensor pairs still describe the
// previous world step after a foot/hand was reoriented to the incoming ball.
export function touchesBall(physics, contact) {
  const offset = contact.translationWrtParent(),
    body = contact.parent(),
    p = body.translation();
  const center = vector(p.x + offset.x, p.y + offset.y, p.z + offset.z);
  return (
    contact.shape.contactShape(
      center,
      { x: 0, y: 0, z: 0, w: 1 },
      physics.collider.shape,
      physics.ball.translation(),
      physics.ball.rotation(),
      0,
    ) !== null
  );
}
// Kicks change momentum only when current finite contact shapes overlap.
export function kick(physics, actor, velocity, contact = actor.foot) {
  if (!touchesBall(physics, contact)) return false;
  const requested = Math.hypot(velocity.x, velocity.y, velocity.z);
  if (!Number.isFinite(requested)) return false;
  const scale = Math.min(1, BALL_MOTION.maxKickSpeed / Math.max(0.001, requested));
  velocity = vector(velocity.x * scale, velocity.y * scale, velocity.z * scale);
  const v = physics.ball.linvel();
  const mass = physics.ball.mass();
  physics.ball.applyImpulse(
    vector((velocity.x - v.x) * mass, (velocity.y - v.y) * mass, (velocity.z - v.z) * mass),
    true,
  );
  if (contact === actor.foot && actor.legs) {
    // A striking leg lifts out of the outgoing ball's path for 0.15 seconds.
    // The trunk, other players and the finite strike-contact test remain active.
    actor.legs.forEach((leg) => leg.setCollisionGroups(0x00020006));
    physics.legRecovery.set(actor, 3);
  }
  if (contact === actor.foot && velocity.y < 1) {
    const spin = physics.ball.angvel(),
      inertia = 0.4 * mass * BALL_RADIUS * BALL_RADIUS;
    physics.ball.applyTorqueImpulse(
      vector(
        (velocity.z / BALL_RADIUS - spin.x) * inertia,
        -spin.y * inertia,
        (-velocity.x / BALL_RADIUS - spin.z) * inertia,
      ),
      true,
    );
  }
  return true;
}

function ballResistance(ball, dt) {
  const v = ball.linvel(),
    p = ball.translation(),
    mass = ball.mass();
  const speed = Math.hypot(v.x, v.y, v.z);
  // Exact drag-only velocity update: drag always removes energy and cannot reverse it.
  const drag = 1 / (1 + AIR_DRAG * speed * dt);
  let vx = v.x * drag,
    vy = v.y * drag,
    vz = v.z * drag;
  // A flying or bouncing ball does not receive a grass impulse before landing.
  if (p.y <= BALL_RADIUS + 0.002 && Math.abs(v.y) < 0.75) {
    const horizontal = Math.hypot(vx, vz);
    const factor = Math.max(
      0,
      1 - (BALL_MOTION.rollingDeceleration * dt) / Math.max(1e-9, horizontal),
    );
    vx *= factor;
    vz *= factor;
    const spin = ball.angvel(),
      angular = Math.hypot(spin.x, spin.y, spin.z);
    const loss = Math.min(
      1,
      (BALL_MOTION.rollingDeceleration * dt) / (BALL_RADIUS * Math.max(1e-9, angular)),
    );
    const inertia = ball.principalInertia();
    ball.applyTorqueImpulse(
      vector(-spin.x * loss * inertia.x, -spin.y * loss * inertia.y, -spin.z * loss * inertia.z),
      true,
    );
  }
  ball.applyImpulse(vector((vx - v.x) * mass, (vy - v.y) * mass, (vz - v.z) * mass), true);
}

function limitImpactSpeed(actor) {
  const v = actor.body.linvel(),
    speed = Math.hypot(v.x, v.z);
  if (speed <= 5.7 + 0.036 + 0.6) return;
  // A collision can push a body briefly beyond its own sprint speed, within a
  // small margin. Overlapping capsules must never launch a footballer like a projectile.
  const limit = movement(actor.player, actor.energy).topSpeed + 0.6;
  if (speed > limit) {
    const scale = limit / speed - 1,
      mass = actor.body.mass();
    actor.body.applyImpulse(vector(v.x * scale * mass, 0, v.z * scale * mass), true);
  }
}

export function stepPhysics(physics, contactStep = null, actors = [], observeStep = null) {
  const { ball, world } = physics;
  const p = ball.translation(),
    v = ball.linvel();
  const speed = Math.hypot(v.x, v.y, v.z);
  // Resolve fast trajectories against actual finite feet at intermediate times.
  // Only the nearby fast-ball case needs extra physical steps; no enlarged touch radius.
  const near =
    contactStep &&
    speed > 6 &&
    actors.some((a) => !a.sentOff && Math.hypot(a.pos.x - p.x, a.pos.z - p.z) < 3);
  const steps = near ? Math.min(8, Math.max(2, Math.ceil((speed * STEP) / 0.22))) : 1;
  world.timestep = STEP / steps;
  for (let i = 0; i < steps; i++) {
    if (i && contactStep) contactStep();
    const before = observeStep
      ? {
          position: { ...ball.translation() },
          velocity: { ...ball.linvel() },
          spin: { ...ball.angvel() },
        }
      : null;
    ballResistance(ball, STEP / steps);
    world.step();
    if (observeStep) observeStep(before);
    for (const actor of actors) if (!actor.sentOff) limitImpactSpeed(actor);
  }
  world.timestep = STEP;
  for (const [actor, remaining] of physics.legRecovery) {
    if (remaining <= 1) {
      actor.legs.forEach((leg) => leg.setCollisionGroups(0x00020007));
      physics.legRecovery.delete(actor);
    } else physics.legRecovery.set(actor, remaining - 1);
  }
}

let projectionSnapshot;
// An independent, player-free Rapier world evaluates the ball's actual incoming
// trajectory, including grass, air, gravity and the goal frame. Never step the
// match world or use its random generator to decide statistical ownership.
export function projectedGoal({ position, velocity, spin = { x: 0, y: 0, z: 0 } }) {
  if (
    ![position.x, position.y, position.z, velocity.x, velocity.y, velocity.z].every(Number.isFinite)
  )
    return null;
  if (Math.abs(velocity.x) < 0.05) return null;
  const line = velocity.x > 0 ? 105 : 0;
  const travel = (line - position.x) / velocity.x;
  if (travel < 0 || Math.abs(position.z + velocity.z * travel - 34) > 3.95) return null;
  if (!projectionSnapshot) {
    const empty = createPhysics();
    try {
      projectionSnapshot = {
        world: empty.world.takeSnapshot(),
        ball: empty.ball.handle,
        collider: empty.collider.handle,
      };
    } finally {
      empty.world.free();
    }
  }
  const shadow = restorePhysics(projectionSnapshot);
  try {
    shadow.ball.setTranslation(position, true);
    shadow.ball.setLinvel(velocity, true);
    shadow.ball.setAngvel(spin, true);
    for (let i = 0; i < 400; i++) {
      const before = shadow.ball.translation();
      stepPhysics(shadow);
      const after = shadow.ball.translation();
      const end = goalCrossing(before, after);
      if (end !== null) return end;
      if (after.x < -0.5 || after.x > 105.5 || after.z < 0 || after.z > 68) return null;
      const v = shadow.ball.linvel();
      if (after.y < BALL_RADIUS + 0.01 && Math.hypot(v.x, v.z) < 0.05) return null;
    }
    return null;
  } finally {
    shadow.world.free();
  }
}

// Swept whole-ball crossing. A shot outcome is never sampled from a probability.
export function goalCrossing(before, after) {
  for (const [line, end] of [
    [-BALL_RADIUS, 0],
    [105 + BALL_RADIUS, 1],
  ]) {
    if (
      (end === 0 && before.x >= line && after.x < line) ||
      (end === 1 && before.x <= line && after.x > line)
    ) {
      const f = (line - before.x) / (after.x - before.x);
      const y = before.y + (after.y - before.y) * f;
      const z = before.z + (after.z - before.z) * f;
      if (Math.abs(z - 34) < 3.66 - BALL_RADIUS && y < 2.44 - BALL_RADIUS) return end;
    }
  }
  return null;
}
