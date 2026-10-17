// Rapier snapshots include collision manifolds, velocities, sleep/solver state and handles.
// Domain references are encoded as actor indexes; no JS/Rapier wrappers enter storage.
const handles = ['body', 'collider', 'foot', 'head', 'hands'];
export function packActors(actors) {
  return actors.map((a) => {
    const row = { ...a, legs: a.legs.map((c) => c.handle) };
    for (const key of handles) row[key] = a[key]?.handle ?? null;
    return row;
  });
}
export function unpackActors(rows, physics) {
  return rows.map((row) => {
    const a = { ...row, legs: row.legs.map((h) => physics.world.getCollider(h)) };
    for (const key of handles)
      a[key] =
        row[key] === null
          ? undefined
          : key === 'body'
            ? physics.world.getRigidBody(row[key])
            : physics.world.getCollider(row[key]);
    return a;
  });
}
