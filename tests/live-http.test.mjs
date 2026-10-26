import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, basename, sep } from 'node:path';
import { startServer } from './helpers/api-suite.mjs';
test('HTTP hides staged results, future events, raw chunks and other saves while the broadcast continues', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'touchline-live-test-'));
  let app = await startServer(
    dir,
    false,
    new URL('./helpers/stream-fixtures.mjs', import.meta.url).href,
  );
  try {
    const fresh = await fetch(app.url + '/api/state');
    const cookie = fresh.headers.get('set-cookie').split(';')[0],
      state = (await fresh.json()).state;
    const headers = { cookie };
    const begin = await fetch(app.url + '/api/action', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'advance',
        payload: {},
        requestId: 'http-live-watch-0001',
        revision: state.revision,
      }),
    });
    const { job } = await begin.json();
    assert.equal(begin.status, 202);
    assert.equal(job.manager.players.length, state.clubs[0].players.length);
    assert.ok(job.manager.players.every((player) => player.overview.length === 6));
    assert.ok(job.manager.players.every((player) => !('attributes' in player)));
    const command = {
      requestId: 'http-live-tactics-0001',
      command: { type: 'tactics', formation: '4-3-3', style: 'wide', press: 'high' },
    };
    const sendCommand = () =>
      fetch(app.url + `/api/match-jobs/${job.id}/commands`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify(command),
      });
    const accepted = await sendCommand();
    assert.equal(accepted.status, 202);
    const acceptedJob = (await accepted.json()).job;
    assert.equal(acceptedJob.manager.commands.length, 1);
    assert.equal(acceptedJob.manager.commands[0].status, '排队中');
    assert.equal('body' in acceptedJob.manager.commands[0], false);
    assert.equal((await (await sendCommand()).json()).job.manager.commands.length, 1);
    const other = await fetch(app.url + '/api/state'),
      otherCookie = other.headers.get('set-cookie').split(';')[0];
    const crossSave = await fetch(app.url + `/api/match-jobs/${job.id}/commands`, {
      method: 'POST',
      headers: { cookie: otherCookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        requestId: 'http-cross-save-0001',
        command: { type: 'tactics', formation: '4-3-3', style: 'wide', press: 'high' },
      }),
    });
    assert.equal(crossSave.status, 404, 'a different save cannot control this match');
    let view;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      view = (await (await fetch(app.url + '/api/match-jobs/' + job.id, { headers })).json()).job;
      if (view.status === 'airing') break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(view.status, 'airing', 'the backend has completed all four synthetic fixtures');
    assert.equal(view.broadcast.finished, false);
    assert.equal(view.ownComplete, false);
    assert.deepEqual(view.report.score, [0, 0]);
    assert.equal(view.manager.commands[0].status, '已生效');
    assert.equal(view.manager.tactics.formation, '4-3-3');
    assert.ok(view.report.events.every((e) => e.second <= view.broadcast.seconds));
    const before = (await (await fetch(app.url + '/api/state', { headers })).json()).state;
    assert.deepEqual(
      before,
      state,
      'no financial, player, league or calendar state is revealed early',
    );
    for (const path of ['/api/reports/' + view.report.id, '/api/replays/' + view.report.id])
      assert.equal((await fetch(app.url + path, { headers })).status, 404);
    assert.equal(
      (await fetch(app.url + '/api/match-jobs/' + job.id + '/chunks/0', { headers })).status,
      409,
    );
    assert.equal(
      (await fetch(app.url + '/api/match-jobs/' + job.id + '/frames?from=100000', { headers }))
        .status,
      416,
    );
    assert.equal(
      (await fetch(app.url + '/api/match-jobs/' + job.id + '/frames?from=0')).status,
      404,
    );
    const frames = await fetch(app.url + '/api/match-jobs/' + job.id + '/frames?from=0', {
      headers,
    });
    assert.equal(frames.status, 200);
    assert.ok((await frames.arrayBuffer()).byteLength > 0);
    const previous = view.broadcast.seconds;
    await app.stop();
    app = await startServer(
      dir,
      false,
      new URL('./helpers/stream-fixtures.mjs', import.meta.url).href,
    );
    view = (await (await fetch(app.url + '/api/state', { headers })).json()).job;
    assert.equal(view.id, job.id);
    assert.ok(
      view.broadcast.seconds > previous,
      'restart and absent viewer preserve elapsed wall time',
    );
    assert.deepEqual(view.report.score, [0, 0]);
  } finally {
    await app.stop();
    const target = resolve(dir);
    if (
      !basename(target).startsWith('touchline-live-test-') ||
      !target.startsWith(resolve(tmpdir()) + sep)
    )
      throw Error('Unsafe cleanup');
    rmSync(target, { recursive: true, force: true });
  }
});
