import { clamp } from '../../core/index.mjs';
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const localX = (x, dir) => (dir === 1 ? x : 105 - x);
export function unit(from, to) {
  const len = distance(from, to) || 1;
  return { x: (to.x - from.x) / len, z: (to.z - from.z) / len };
}
export function segmentPoint(from, to, point) {
  const dx = to.x - from.x,
    dz = to.z - from.z,
    len2 = dx * dx + dz * dz || 1;
  const t = clamp(((point.x - from.x) * dx + (point.z - from.z) * dz) / len2, 0, 1);
  return { t, gap: distance(point, { x: from.x + t * dx, z: from.z + t * dz }) };
}
export function pitchValue(point, dir) {
  const progress = clamp(localX(point.x, dir) / 105, 0, 1);
  const central = 1 - clamp(Math.abs(point.z - 34) / 34, 0, 1);
  return 0.015 + 0.04 * progress + 0.2 * progress ** 4 * (0.45 + 0.55 * central);
}
