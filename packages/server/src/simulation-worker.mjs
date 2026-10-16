import { parentPort } from 'node:worker_threads';
import { applyAction } from '../../shared/game.mjs';

parentPort.on('message', ({ id, state, type, payload }) => {
  try {
    const next = applyAction(state, type, payload);
    const transfers = next.reports
      .filter((r) => r.trajectory instanceof Uint16Array)
      .map((r) => r.trajectory.buffer);
    parentPort.postMessage({ id, state: next }, transfers);
  } catch (error) {
    parentPort.postMessage({ id, error: error.message });
  }
});
