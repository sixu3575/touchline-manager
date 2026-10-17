import { mock } from 'node:test';
import * as matches from '../../packages/shared/modules/matches/index.mjs';
import * as engine from '../../packages/shared/modules/matches/simulation.mjs';
import * as physics from '../../packages/shared/modules/matches/physics.mjs';
import { fixtureReport, fixtureGenerator } from './fixture-report.mjs';

const forbidden = () => {
  throw Error('Real match simulation is forbidden in business/smoke tests; use the match tier.');
};
// Explicit test-process preload, also inherited by its isolated workers.
// No production entry point, environment variable, HTTP route or save can enable fixtures.
mock.module(new URL('../../packages/shared/modules/matches/simulation.mjs', import.meta.url).href, {
  cache: true,
  namedExports: { ...engine, simulate: forbidden, createMatchSimulation: forbidden },
});
mock.module(new URL('../../packages/shared/modules/matches/physics.mjs', import.meta.url).href, {
  cache: true,
  namedExports: {
    ...physics,
    createPhysics: forbidden,
    restorePhysics: forbidden,
    stepPhysics: forbidden,
  },
});
mock.module(new URL('../../packages/shared/modules/matches/index.mjs', import.meta.url).href, {
  cache: true,
  namedExports: { ...matches, simulate: fixtureReport, createMatchSimulation: fixtureGenerator },
});
