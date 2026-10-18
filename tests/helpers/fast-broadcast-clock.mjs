// Explicit CLI preload for the real-engine HTTP transport test only.
// Accelerate presentation UTC, never simulation ticks, physics, RNG or reports.
// A stable multiplier survives child-process restarts without resetting the clock.
import { mock } from 'node:test';
import * as broadcast from '../../packages/server/src/broadcast.mjs';
mock.module(new URL('../../packages/server/src/broadcast.mjs', import.meta.url).href, {
  cache: true,
  namedExports: {
    ...broadcast,
    broadcastAt: (progress, now) => broadcast.broadcastAt(progress, now * 1000),
  },
});
