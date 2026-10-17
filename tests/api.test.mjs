import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, copyFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { inflateRawSync } from 'node:zlib';
const root = fileURLToPath(new URL('../', import.meta.url));
async function start(data) {
  const proc = spawn(process.execPath, ['--no-warnings', 'packages/server/src/index.mjs'], {
    cwd: root,
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', DATA_DIR: data },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Server startup timeout: ' + output)), 10000);
    proc.stdout.on('data', (b) => {
      output += b;
      const m = output.match(/http:\/\/127.0.0.1:\d+/);
      if (m) {
        clearTimeout(timer);
        resolve(m[0]);
      }
    });
    proc.stderr.on('data', (b) => (output += b));
    proc.on('exit', (code) => {
      clearTimeout(timer);
      reject(Error('Server exited ' + code + ': ' + output));
    });
  });
  return {
    proc,
    url,
    async stop() {
      if (proc.exitCode !== null) return;
      proc.kill();
      await once(proc, 'exit');
    },
  };
}
test('API transactions, isolation, restart persistence and backup recovery', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'touchline-test-'));
  let app = await start(join(dir, 'data'));
  let cookie = '',
    otherCookie = '',
    state;
  const get = async (c = cookie) => {
    const res = await fetch(app.url + '/api/state', { headers: c ? { cookie: c } : {} });
    const data = await res.json();
    return { res, data };
  };
  const startServerAfterRestart = () => start(join(dir, 'data'));
  const action = async (
    type,
    payload = {},
    revision = state.revision,
    requestId = randomUUID(),
    extra = {},
  ) => {
    const res = await fetch(app.url + '/api/action', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', ...extra },
      body: JSON.stringify({ type, payload, revision, requestId }),
    });
    const data = await res.json();
    if (res.status === 202 && !extra.raw) {
      const timeout = Date.now() + 600000;
      while (Date.now() < timeout) {
        await new Promise((r) => setTimeout(r, 2000));
        const response = await fetch(app.url + '/api/match-jobs/' + data.job.id, {
          headers: { cookie },
        });
        const { job } = await response.json();
        if (job.status === 'failed') throw Error(job.error);
        if (job.status === 'complete') return { res: { status: 200 }, data: (await get()).data };
      }
      throw Error('Match job timeout');
    }
    return { res, data };
  };
  try {
    await t.test(
      'anonymous saves are isolated and credential stays in HttpOnly cookie',
      async () => {
        const a = await get('');
        cookie = a.res.headers.get('set-cookie').split(';')[0];
        state = a.data.state;
        assert.match(a.res.headers.get('set-cookie'), /HttpOnly/);
        const b = await get('');
        const other = b.res.headers.get('set-cookie').split(';')[0];
        otherCookie = other;
        assert.notEqual(other, cookie);
        const renamed = await action('rename', { name: '事务测试俱乐部' });
        state = renamed.data.state;
        const unchanged = await get(other);
        assert.equal(unchanged.data.state.clubs[0].name, '临场竞技');
        assert.ok(!JSON.stringify(state).includes(cookie));
      },
    );
    await t.test('concurrent duplicate training bills once and stale writes reject', async () => {
      const id = randomUUID(),
        rev = state.revision,
        cash = state.cash;
      const [a, b] = await Promise.all([
        action('train', { focus: 'attack' }, rev, id),
        action('train', { focus: 'attack' }, rev, id),
      ]);
      assert.equal(a.res.status, 200);
      assert.equal(b.res.status, 200);
      state = (await get()).data.state;
      assert.equal(state.cash, cash - 6000);
      assert.equal(state.training.used, 1);
      assert.equal(state.revision, rev + 1);
      assert.equal((await action('upgrade', {}, rev)).res.status, 409);
      assert.equal((await action('train', { focus: 'defence' }, rev, id)).res.status, 409);
    });
    await t.test('invalid action rolls back and cross-origin requests reject', async () => {
      const rev = state.revision,
        cash = state.cash;
      assert.equal(
        (
          await action('tactics', {
            formation: '__proto__',
            style: 'balanced',
            press: 'normal',
            lineup: state.clubs[0].lineup,
          })
        ).res.status,
        422,
      );
      assert.equal(
        (await action('upgrade', {}, rev, randomUUID(), { origin: 'https://attacker.invalid' })).res
          .status,
        403,
      );
      state = (await get()).data.state;
      assert.equal(state.revision, rev);
      assert.equal(state.cash, cash);
    });
    await t.test('competing transfers only sign once', async () => {
      const id = state.market[0].id,
        rev = state.revision,
        cash = state.cash,
        price = state.market[0].price;
      const results = await Promise.all([
        action('sign', { playerId: id }, rev),
        action('sign', { playerId: id }, rev),
      ]);
      assert.deepEqual(results.map((r) => r.res.status).sort(), [200, 409]);
      state = (await get()).data.state;
      assert.equal(state.cash, cash - price);
      assert.equal(state.clubs[0].players.filter((p) => p.id === id).length, 1);
    });
    await t.test(
      'durable match freezes writes, survives restart, and leaves HTTP responsive',
      async () => {
        const rev = state.revision;
        const requestId = randomUUID();
        const queued = await action('advance', {}, rev, requestId, { raw: true });
        assert.equal(queued.res.status, 202);
        const jobId = queued.data.job.id;
        const joined = await action('advance', {}, rev, randomUUID(), { raw: true });
        assert.equal(joined.data.job.id, jobId, 'two clicks join one competition');
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const start = performance.now();
        assert.equal((await fetch(app.url + '/api/health')).status, 200);
        assert.ok(performance.now() - start < 1500);
        assert.equal((await action('rename', { name: '不能覆盖比赛' }, rev)).res.status, 409);
        await app.stop();
        app = await startServerAfterRestart();
        const recovering = (await get()).data.job;
        assert.equal(recovering.id, jobId);
        const finished = await action('advance', {}, rev, requestId);
        assert.equal(finished.res.status, 200);
        state = (await get()).data.state;
        assert.equal(state.round, 1);
        assert.equal(state.revision, rev + 1);
        const partial = await fetch(app.url + '/api/match-jobs/' + jobId + '/chunks/0', {
          headers: { cookie },
        });
        assert.equal(partial.status, 200);
        assert.ok((await partial.arrayBuffer()).byteLength > 0);
        assert.equal(
          (await fetch(app.url + '/api/match-jobs/' + jobId, { headers: { cookie: otherCookie } }))
            .status,
          404,
        );
      },
    );
    await t.test(
      'duplicate match requests settle once and replay payloads are private and separate',
      async () => {
        const id = randomUUID(),
          rev = state.revision;
        const [a, b] = await Promise.all([
          action('advance', {}, rev, id),
          action('advance', {}, rev, id),
        ]);
        assert.equal(a.res.status, 200);
        assert.equal(b.res.status, 200);
        state = (await get()).data.state;
        assert.equal(state.round, 2);
        assert.equal(state.revision, rev + 1);
        assert.equal(state.reports.length, 2);
        const report = state.reports[0];
        assert.equal(report.engineVersion, '0.6.1-physical-motion');
        assert.equal(report.trajectory, undefined, 'large tracks must not enter JSON saves');
        assert.equal(report.detailsStored, true);
        assert.equal(
          report.events.length,
          0,
          'detailed logs must not inflate every state response',
        );
        const detailsPath = '/api/reports/' + encodeURIComponent(report.id);
        const details = await fetch(app.url + detailsPath, { headers: { cookie } });
        assert.equal(details.status, 200);
        const detailed = await details.json();
        assert.deepEqual(detailed.score, report.score);
        assert.ok(detailed.events.length > 0);
        assert.equal(detailed.snapshots.length, 2);
        assert.equal(
          (await fetch(app.url + detailsPath, { headers: { cookie: otherCookie } })).status,
          404,
        );
        const path = '/api/replays/' + encodeURIComponent(report.id);
        const replay = await fetch(app.url + path, { headers: { cookie } });
        assert.equal(replay.status, 200);
        const encoded = await new Promise((resolve, reject) => {
          const req = http.get(app.url + path, { headers: { cookie } }, (response) => {
            const parts = [];
            response.on('data', (part) => parts.push(part));
            response.on('end', () => resolve(Buffer.concat(parts)));
            response.on('error', reject);
          });
          req.setTimeout(15000, () => req.destroy(Error('Replay download timeout')));
          req.on('error', reject);
        });
        const member = inflateRawSync(encoded.subarray(10), { info: true });
        assert.equal(
          member.engine.bytesWritten + 18,
          encoded.length,
          'the browser must receive one complete gzip member',
        );
        assert.equal(member.buffer.length, report.replay.frameCount * report.replay.stride * 2);
        assert.equal(
          (await replay.arrayBuffer()).byteLength,
          report.replay.frameCount * report.replay.stride * 2,
        );
        assert.equal(
          (await fetch(app.url + path, { headers: { cookie: otherCookie } })).status,
          404,
        );
        assert.equal((await fetch(app.url + path)).status, 404);
      },
    );
    await t.test('full season persists through process restart', async () => {
      for (let i = state.round; i < 14; i++) {
        const r = await action('advance');
        assert.equal(r.res.status, 200);
        state = r.data.state;
      }
      assert.equal(state.round, 14);
      const cash = state.cash;
      await app.stop();
      app = await start(join(dir, 'data'));
      state = (await get()).data.state;
      assert.equal(state.round, 14);
      assert.equal(state.cash, cash);
      assert.equal(state.clubs[0].name, '事务测试俱乐部');
      assert.equal(
        (await fetch(app.url + '/api/replays/' + state.reports[0].id, { headers: { cookie } }))
          .status,
        200,
      );
    });
    await t.test('live database backup restores into a fresh data directory', async () => {
      const out = join(dir, 'snapshots');
      const result = spawnSync(process.execPath, ['scripts/backup.mjs'], {
        cwd: root,
        env: { ...process.env, DATA_DIR: join(dir, 'data'), BACKUP_DIR: out },
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr);
      const { mkdirSync } = await import('node:fs');
      const restored = join(dir, 'restored');
      mkdirSync(restored);
      copyFileSync(
        join(
          out,
          readdirSync(out).find((f) => f.endsWith('.sqlite')),
        ),
        join(restored, 'game.sqlite'),
      );
      await app.stop();
      app = await start(restored);
      state = (await get()).data.state;
      assert.equal(state.round, 14);
      assert.equal(
        (await fetch(app.url + '/api/replays/' + state.reports[0].id, { headers: { cookie } }))
          .status,
        200,
      );
      const r = await action('season');
      assert.equal(r.res.status, 200);
      assert.equal(r.data.state.season, 2);
    });
  } finally {
    await app.stop();
    const target = resolve(dir);
    if (
      !basename(target).startsWith('touchline-test-') ||
      !target.startsWith(resolve(tmpdir()) + sep)
    )
      throw Error('Refusing unsafe test cleanup');
    rmSync(target, { recursive: true, force: true });
  }
});
