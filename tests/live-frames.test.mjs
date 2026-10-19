import { test } from 'node:test';
import assert from 'node:assert/strict';
import { positionAt, speedAt } from '../packages/client/src/modules/matches/frame-data.mjs';
const report = { replay: { frameCount: 10000, stride: 49, sampleHz: 5 } };
function frames(count) {
  const data = new Uint16Array(count * 49);
  for (let f = 0; f < count; f++) {
    for (let i = 0; i < 47; i++) data[f * 49 + i] = 500 + 100 * f;
    data[f * 49 + 48] = 2;
  }
  return data;
}
test('rejoin clock and metadata ahead of downloaded frames hold the last valid picture without NaN', () => {
  const data = frames(3),
    position = positionAt(data, report, 616.4);
  assert.equal(position.positions[0], 2);
  assert.equal(position.owner, 1);
  assert.ok([...position.positions].every(Number.isFinite));
  assert.equal(speedAt(data, report, 616.4, 0), Math.hypot(1, 1) * 5);
  assert.ok(Number.isFinite(speedAt(data, report, 616.4)));
});
test('empty, single and partially downloaded frames never read missing coordinates', () => {
  for (const data of [frames(0), frames(1), new Uint16Array(51)]) {
    assert.ok([...positionAt(data, report, 100).positions].every(Number.isFinite));
    assert.equal(speedAt(data, report, 100), 0);
  }
  assert.equal(positionAt(frames(3), report, -10).positions[0], 0);
});
test('interpolation and restart cuts retain their original physical meaning', () => {
  const data = frames(3);
  assert.equal(positionAt(data, report, 0.1).positions[0], 0.5);
  data[49 + 47] = 1;
  assert.equal(positionAt(data, report, 0.1).positions[0], 0);
  assert.equal(speedAt(data, report, 0), 0);
});
