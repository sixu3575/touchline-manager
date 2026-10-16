import RAPIER from '@dimforge/rapier3d-compat';
await RAPIER.init();

export const FIELD = Object.freeze({ length: 105, width: 68, goalWidth: 7.32, goalHeight: 2.44 });
export const BALL_RADIUS = 0.11;
export const STEP = 1 / 20;
const vector = (x, y, z) => ({ x, y, z });

// The world uses metres, seconds and kilograms. Y is elevation; Z is pitch width.
export function createPhysics() {
  const world = new RAPIER.World(vector(0, -9.81, 0));
  world.timestep = STEP;
  world.numSolverIterations = 4;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(60, 0.2, 40)
      .setTranslation(52.5, -0.2, 34)
      .setFriction(0.65)
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
    // A yielding back and side net, behind the goal line (never a pitch wall).
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.07, 1.25, 3.8)
        .setTranslation(x === 0 ? -2 : 107, 1.25, 34)
        .setRestitution(0.05),
    );
    for (const z of [30.25, 37.75])
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(1, 1.25, 0.04)
          .setTranslation(x === 0 ? -1 : 106, 1.25, z)
          .setRestitution(0.05),
      );
  }
  const ball = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(52.5, BALL_RADIUS + 0.01, 34)
      .setCcdEnabled(true)
      .setLinearDamping(0.035)
      .setAngularDamping(0.18)
      .setCanSleep(false),
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.ball(BALL_RADIUS)
      .setMass(0.43)
      .setFriction(0.45)
      .setRestitution(0.6)
      .setCollisionGroups(0x0001ffff),
    ball,
  );
  return { world, ball, collider };
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
    RAPIER.ColliderDesc.capsule(Math.max(0.4, height / 2 - 0.28), 0.28)
      .setMass(60 + strength * 0.3)
      .setFriction(0)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setRestitution(0.1)
      .setCollisionGroups(0x00020007),
    body,
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
  return { body, collider, foot, head, height };
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
  actor.foot.setTranslationWrtParent(
    vector(
      ((ballPosition.x - p.x) / d) * 0.45,
      0.2 - actor.height / 2,
      ((ballPosition.z - p.z) / d) * 0.45,
    ),
  );
}

// Kicks change momentum only when an actual foot/ball intersection exists.
export function kick(physics, actor, velocity, contact = actor.foot) {
  if (!physics.world.intersectionPair(contact, physics.collider)) return false;
  const v = physics.ball.linvel();
  const mass = physics.ball.mass();
  physics.ball.applyImpulse(
    vector((velocity.x - v.x) * mass, (velocity.y - v.y) * mass, (velocity.z - v.z) * mass),
    true,
  );
  return true;
}

export function stepPhysics(physics) {
  const { ball, world } = physics;
  const p = ball.translation(),
    v = ball.linvel();
  const speed = Math.hypot(v.x, v.z);
  // Grass rolling resistance, separate from contact friction (which alone permits rolling).
  if (p.y < BALL_RADIUS + 0.04 && speed > 0.01) {
    const dv = Math.min(speed, 0.65 * STEP);
    ball.applyImpulse(
      vector((-v.x / speed) * dv * ball.mass(), 0, (-v.z / speed) * dv * ball.mass()),
      true,
    );
  }
  world.step();
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
