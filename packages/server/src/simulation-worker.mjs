import { parentPort } from 'node:worker_threads';
import {
  createMatchSimulation,
  ENGINE_VERSION,
  PARAMETER_VERSION,
} from '../../shared/modules/matches/index.mjs';

let engine = null,
  key = null,
  savedTick = 0;
parentPort.on(
  'message',
  ({
    id,
    fixture,
    home,
    away,
    checkpoint,
    commands = [],
    expectedTick,
    engineVersion,
    parameterVersion,
    sliceSeconds = 60,
  }) => {
    try {
      if (engineVersion !== ENGINE_VERSION || parameterVersion !== PARAMETER_VERSION)
        throw Error('比赛引擎版本不匹配；请用创建任务时的版本恢复，不能重新抽取赛果。');
      const nextKey = id + ':' + fixture.id;
      const tick = expectedTick ?? checkpoint?.tick ?? 0;
      let created = false;
      if (key !== nextKey || savedTick !== tick) {
        engine?.return();
        if (tick > 0 && !checkpoint) throw Error('Missing required committed checkpoint');
        engine = createMatchSimulation(home, away, fixture.seed, fixture.id, {
          ...fixture.options,
          checkpoint,
          initialCommands: commands,
          durable: true,
          sliceSeconds,
        });
        key = nextKey;
        created = true;
      }
      const result = created ? engine.next() : engine.next(commands);
      const { done, value: part } = result;
      const source = done ? part : part.report;
      const managerState = part.managerState ?? source?.managerState;
      const appliedCommands = part.appliedManagerCommands ?? source?.appliedManagerCommands ?? [];
      delete part.managerState;
      delete part.appliedManagerCommands;
      if (source) {
        delete source.managerState;
        delete source.appliedManagerCommands;
      }
      savedTick = part.checkpoint?.tick ?? 0;
      const transfers = [];
      if (part.trajectory?.buffer) transfers.push(part.trajectory.buffer);
      if (part.checkpoint?.frames?.buffer) transfers.push(part.checkpoint.frames.buffer);
      parentPort.postMessage({ id, done, part, managerState, appliedCommands }, transfers);
      if (done) {
        engine = null;
        key = null;
      }
    } catch (error) {
      engine?.return();
      engine = null;
      key = null;
      parentPort.postMessage({ id, error: error.message });
    }
  },
);
