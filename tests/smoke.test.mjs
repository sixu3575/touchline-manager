import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, sep, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startServer } from './helpers/api-suite.mjs';
import { simulate as realSimulation } from '../packages/shared/modules/matches/simulation.mjs';

test('smoke and business processes cannot accidentally invoke the real engine', () => {
  assert.throws(() => realSimulation(), /Real match simulation is forbidden/);
});

test('HTTP boots, creates a private save, accepts an ordinary action and serves it back', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'touchline-smoke-'));
  const app = await startServer(dir, false);
  try {
    assert.equal((await fetch(app.url + '/api/health')).status, 200);
    const response = await fetch(app.url + '/api/state');
    const cookie = response.headers.get('set-cookie').split(';')[0];
    const { state } = await response.json();
    assert.equal(state.clubs[0].lineup.length, 11);
    const action = await fetch(app.url + '/api/action', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'rename',
        payload: { name: '冒烟验证俱乐部' },
        requestId: randomUUID(),
        revision: state.revision,
      }),
    });
    assert.equal(action.status, 200);
    const next = await (await fetch(app.url + '/api/state', { headers: { cookie } })).json();
    assert.equal(next.state.clubs[0].name, '冒烟验证俱乐部');
    assert.equal(next.state.round, 0, 'ordinary smoke never advances a match');
  } finally {
    await app.stop();
    const target = resolve(dir);
    assert.ok(
      basename(target).startsWith('touchline-smoke-') && target.startsWith(resolve(tmpdir()) + sep),
    );
    rmSync(target, { recursive: true, force: true });
  }
});
