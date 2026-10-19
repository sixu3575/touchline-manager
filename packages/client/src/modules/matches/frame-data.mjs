// Live metadata/clock and downloaded chunks arrive independently. Never read
// outside the complete frames currently buffered, including after rejoining.
function frameCount(data, meta) {
  return Math.max(0, Math.min(meta.frameCount, Math.floor(data.length / meta.stride)));
}
/** @param {Uint16Array} data @param {import('../../model').Report} report @param {number} time */
export function positionAt(data, report, time) {
  const meta = report.replay;
  const count = frameCount(data, meta),
    result = new Float64Array(47);
  if (!count) return { positions: result, owner: -1 };
  const frame = Math.min(count - 1, Math.max(0, Number.isFinite(time) ? time * meta.sampleHz : 0));
  const a = Math.floor(frame),
    b = Math.min(a + 1, count - 1);
  const blend = data[b * meta.stride + 47] === 1 ? 0 : frame - a;
  for (let i = 0; i < 47; i++) {
    const cm = data[a * meta.stride + i] * (1 - blend) + data[b * meta.stride + i] * blend;
    result[i] = cm / 100 - (i === 45 ? 0 : 5);
  }
  return { positions: result, owner: data[a * meta.stride + 48] - 1 };
}
/** @param {Uint16Array} data @param {import('../../model').Report} report @param {number} time @param {number} index */
export function speedAt(data, report, time, index = -1) {
  const meta = report.replay,
    count = frameCount(data, meta);
  if (count < 2) return 0;
  const a = Math.min(
      count - 2,
      Math.max(0, Math.floor(Number.isFinite(time) ? time * meta.sampleHz : 0)),
    ),
    b = a + 1;
  if (data[b * meta.stride + 47] || data[a * meta.stride + 47]) return 0;
  const x = index < 0 ? 44 : index * 2,
    z = index < 0 ? 46 : index * 2 + 1;
  const dx = (data[b * meta.stride + x] - data[a * meta.stride + x]) / 100;
  const dz = (data[b * meta.stride + z] - data[a * meta.stride + z]) / 100;
  const dy = index < 0 ? (data[b * meta.stride + 45] - data[a * meta.stride + 45]) / 100 : 0;
  return Math.hypot(dx, dy, dz) * meta.sampleHz;
}
