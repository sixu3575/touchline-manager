import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, copyFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
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
    return { res, data: await res.json() };
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
      'simulation leaves HTTP responsive and stale computed results cannot overwrite saves',
      async () => {
        const rev = state.revision;
        const pending = action('advance', {}, rev);
        await new Promise((resolve) => setTimeout(resolve, 100));
        const start = performance.now();
        assert.equal((await fetch(app.url + '/api/health')).status, 200);
        assert.ok(performance.now() - start < 1500, 'worker must not block HTTP');
        const renamed = await action('rename', { name: '事务测试俱乐部' }, rev);
        assert.equal(renamed.res.status, 200);
        assert.equal((await pending).res.status, 409);
        state = (await get()).data.state;
        assert.equal(state.round, 0);
        assert.equal(state.revision, rev + 1);
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
        assert.equal(state.round, 1);
        assert.equal(state.revision, rev + 1);
        assert.equal(state.reports.length, 1);
        const report = state.reports[0];
        assert.equal(report.engineVersion, '0.3.0-rapier');
        assert.equal(report.trajectory, undefined, 'large tracks must not enter JSON saves');
        const path = '/api/replays/' + encodeURIComponent(report.id);
        const replay = await fetch(app.url + path, { headers: { cookie } });
        assert.equal(replay.status, 200);
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
