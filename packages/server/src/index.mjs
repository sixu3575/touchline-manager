import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRENT_SCHEMA, migrateDatabase } from './storage/migrations.mjs';
import { createReplayStorage } from './storage/replays.mjs';
import { MatchJobs } from './match-jobs.mjs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createGame, applyAction } from '../../shared/game.mjs';
import { bestLineup } from '../../shared/modules/tactics/index.mjs';
import { publicState, publicJob, publicReport } from './player-view.mjs';

const ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const DATA = resolve(process.env.DATA_DIR || resolve(ROOT, 'data'));
mkdirSync(DATA, { recursive: true, mode: 0o700 });
const db = new DatabaseSync(resolve(DATA, 'game.sqlite'));
db.exec(
  'PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS saves (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, state TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS operations (save_id TEXT NOT NULL, request_id TEXT NOT NULL, body_hash TEXT NOT NULL, PRIMARY KEY(save_id,request_id));',
);
const replays = createReplayStorage(db);
const jobs = new MatchJobs(db, replays);
const migrated = migrateDatabase(db);
if (migrated) console.log(`Migrated ${migrated} saves to schema ${CURRENT_SCHEMA}`);
const findSave = db.prepare('SELECT * FROM saves WHERE token_hash=?');
const insertSave = db.prepare('INSERT INTO saves VALUES (?,?,?,?)');
const updateSave = db.prepare('UPDATE saves SET state=?,updated_at=? WHERE id=?');
const findOperation = db.prepare(
  'SELECT body_hash FROM operations WHERE save_id=? AND request_id=?',
);
const insertOperation = db.prepare('INSERT INTO operations VALUES (?,?,?)');
const hash = (s) => createHash('sha256').update(s).digest('hex');
const rate = new Map();
const streams = new Map();
const dist = resolve(ROOT, 'dist/client');
const version = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).version;
const security = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy':
    "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
};
function send(res, status, data, headers = {}) {
  res.writeHead(status, {
    ...security,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(data));
}
function cookies(req) {
  const pairs = (req.headers.cookie || '').split(';').map((s) => s.trim().split('='));
  return Object.fromEntries(pairs);
}
function session(req, res) {
  const raw = cookies(req).tl_session;
  let row = raw && /^[a-f0-9]{64}$/.test(raw) ? findSave.get(hash(raw)) : null;
  if (!row) {
    if (db.prepare('SELECT COUNT(*) AS n FROM saves').get().n >= 1000)
      throw Object.assign(Error('试玩名额暂满，请稍后再试。'), { status: 503 });
    const token = randomBytes(32).toString('hex');
    const id = randomBytes(16).toString('hex');
    const seed = randomBytes(4).readUInt32LE();
    const state = createGame('临场竞技', seed);
    insertSave.run(id, hash(token), JSON.stringify(state), new Date().toISOString());
    res.setHeader(
      'Set-Cookie',
      'tl_session=' + token + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000',
    );
    row = { id, state: JSON.stringify(state) };
  }
  return row;
}
async function body(req) {
  let chunks = [],
    size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8192) throw Object.assign(Error('请求过大。'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw Object.assign(Error('请求格式无效。'), { status: 400 });
  }
}
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/health') {
      send(res, 200, { ok: true, version, build: process.env.BUILD_SHA || 'development' });
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
      const now = Date.now();
      let entry = rate.get(ip);
      if (!entry || entry.until < now) {
        entry = { n: 0, until: now + 60000 };
        rate.set(ip, entry);
      }
      if (++entry.n > (req.method === 'GET' ? 600 : 150)) {
        send(res, 429, { error: '操作太频繁，请稍后重试。' });
        return;
      }
      if (rate.size > 5000) for (const [k, v] of rate) if (v.until < now) rate.delete(k);
      if (req.method === 'GET' && url.pathname === '/api/state') {
        jobs.pulse();
        const row = session(req, res);
        const state = JSON.parse(row.state);
        send(res, 200, {
          state: publicState(state),
          version,
          job: publicJob(state, jobs.latest(row.id)),
        });
        return;
      }
      if (req.method === 'GET' && url.pathname.startsWith('/api/reports/')) {
        const raw = cookies(req).tl_session;
        const row = raw && /^[a-f0-9]{64}$/.test(raw) ? findSave.get(hash(raw)) : null;
        const id = decodeURIComponent(url.pathname.slice('/api/reports/'.length));
        const rawReport = row && replays.report(row.id, id);
        const payload =
          rawReport &&
          gzipSync(
            JSON.stringify(publicReport(JSON.parse(row.state), JSON.parse(gunzipSync(rawReport)))),
            { level: 3 },
          );
        if (!payload) {
          send(res, 404, { error: '战报不存在或不属于此存档。' });
          return;
        }
        res.writeHead(200, {
          ...security,
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Encoding': 'gzip',
          'Content-Length': payload.length,
          'Cache-Control': 'no-store',
        });
        res.end(payload);
        return;
      }
      if (req.method === 'GET' && url.pathname.startsWith('/api/replays/')) {
        const raw = cookies(req).tl_session;
        const row = raw && /^[a-f0-9]{64}$/.test(raw) ? findSave.get(hash(raw)) : null;
        const id = decodeURIComponent(url.pathname.slice('/api/replays/'.length));
        const summary = row && JSON.parse(row.state).reports.find((r) => r.id === id);
        const payload =
          row &&
          summary &&
          (summary.homeId === 'me' || summary.awayId === 'me') &&
          replays.find(row.id, id);
        if (!payload) {
          send(res, 404, { error: '回放不存在或不属于此存档。' });
          return;
        }
        res.writeHead(200, {
          ...security,
          'Content-Type': 'application/octet-stream',
          'Content-Encoding': 'gzip',
          'Content-Length': payload.length,
          'Cache-Control': 'no-store',
        });
        res.end(payload);
        return;
      }
      if (req.method === 'GET' && url.pathname.startsWith('/api/match-jobs/')) {
        const raw = cookies(req).tl_session;
        const save = raw && /^[a-f0-9]{64}$/.test(raw) ? findSave.get(hash(raw)) : null;
        const parts = url.pathname.split('/').slice(3),
          row = save && jobs.store.owned(parts[0], save.id);
        if (!row) {
          send(res, 404, { error: '比赛任务不存在或不属于此存档。' });
          return;
        }
        if (parts[1] === 'events' && parts.length === 2) {
          if ([...streams.values()].filter((id) => id === save.id).length >= 4) {
            send(res, 429, { error: '观赛连接过多，请关闭重复页面。' });
            return;
          }
          const emit = () => {
            const view = jobs.view(jobs.store.presentation(row.id), { summary: true });
            const { report, ...summary } = view;
            res.write('id: ' + (view.seq ?? 0) + '\ndata: ' + JSON.stringify(summary) + '\n\n');
          };
          res.writeHead(200, {
            ...security,
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-store',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          });
          res.flushHeaders();
          streams.set(res, save.id);
          emit();
          jobs.on(row.id, emit);
          const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 15000);
          req.on('close', () => {
            clearInterval(heartbeat);
            jobs.off(row.id, emit);
            streams.delete(res);
          });
          return;
        }
        if (parts[1] === 'frames' && parts.length === 2) {
          const from = Number(url.searchParams.get('from') ?? '0');
          const { payload: frames, end } = jobs.frames(row, from);
          const payload = gzipSync(frames, { level: 1 });
          res.writeHead(200, {
            ...security,
            'Content-Type': 'application/octet-stream',
            'Content-Encoding': 'gzip',
            'Content-Length': payload.length,
            'X-Frame-Start': String(from),
            'X-Frame-End': String(end),
            'Cache-Control': 'no-store',
          });
          res.end(payload);
          return;
        }
        if (parts[1] === 'chunks' && parts.length === 3 && /^\d{1,4}$/.test(parts[2])) {
          if (JSON.parse(row.progress).broadcast && row.status !== 'complete') {
            send(res, 409, { error: '直播期间仅提供当前画面的短缓冲，请使用观赛入口。' });
            return;
          }
          const payload = jobs.store.chunk(row.id, Number(parts[2]));
          if (!payload) {
            send(res, 404, { error: '轨迹尚未生成。' });
            return;
          }
          res.writeHead(200, {
            ...security,
            'Content-Type': 'application/octet-stream',
            'Content-Encoding': 'gzip',
            'Content-Length': payload.length,
            'Cache-Control': 'no-store',
          });
          res.end(payload);
          return;
        }
        if (parts.length !== 1) {
          send(res, 404, { error: '接口不存在。' });
          return;
        }
        const payload = gzipSync(
          JSON.stringify({ job: publicJob(JSON.parse(save.state), jobs.view(row)) }),
          { level: 1 },
        );
        res.writeHead(200, {
          ...security,
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Encoding': 'gzip',
          'Content-Length': payload.length,
          'Cache-Control': 'no-store',
        });
        res.end(payload);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/action') {
        jobs.pulse();
        if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) {
          send(res, 403, { error: '来源校验失败。' });
          return;
        }
        if (!(req.headers['content-type'] || '').startsWith('application/json')) {
          send(res, 415, { error: '需要 JSON 请求。' });
          return;
        }
        const data = await body(req);
        if (
          !data ||
          typeof data !== 'object' ||
          typeof data.type !== 'string' ||
          typeof data.requestId !== 'string' ||
          !/^[a-zA-Z0-9-]{8,80}$/.test(data.requestId) ||
          !Number.isSafeInteger(data.revision) ||
          !data.payload ||
          typeof data.payload !== 'object' ||
          Array.isArray(data.payload)
        ) {
          send(res, 400, { error: '操作参数无效。' });
          return;
        }
        const row = session(req, res);
        const bodyHash = hash(JSON.stringify({ type: data.type, payload: data.payload }));
        const before = JSON.parse(row.state);
        const prior = findOperation.get(row.id, data.requestId);
        if (prior) {
          if (prior.body_hash !== bodyHash)
            throw Object.assign(Error('操作标识已被使用。'), { status: 409 });
          send(res, 200, { state: publicState(before), replayed: true });
          return;
        }
        if (['advance', 'cup'].includes(data.type)) {
          const job = jobs.start(row.id, before, data, bodyHash);
          send(res, 202, { job: publicJob(before, job) });
          return;
        }
        if (jobs.locked(row.id))
          throw Object.assign(Error('比赛正在结算，暂不能修改俱乐部；可继续浏览和观赛。'), {
            status: 409,
          });
        if (before.revision !== data.revision)
          throw Object.assign(Error('存档已更新，请刷新后重试。'), { status: 409 });
        db.exec('BEGIN IMMEDIATE');
        try {
          const existing = findOperation.get(row.id, data.requestId);
          const current = JSON.parse(
            db.prepare('SELECT state FROM saves WHERE id=?').get(row.id).state,
          );
          if (existing) {
            if (existing.body_hash !== bodyHash)
              throw Object.assign(Error('操作标识已被使用。'), { status: 409 });
            db.exec('COMMIT');
            send(res, 200, { state: publicState(current), replayed: true });
            return;
          }
          if (current.revision !== data.revision)
            throw Object.assign(Error('存档已更新，请重试刚才的操作。'), { status: 409 });
          const payload =
            data.type === 'tactics' && data.payload.auto
              ? {
                  ...data.payload,
                  auto: false,
                  lineup: bestLineup(publicState(current).clubs[0], data.payload.formation),
                }
              : data.payload;
          const state = applyAction(current, data.type, payload);
          replays.persist(row.id, state);
          updateSave.run(JSON.stringify(state), new Date().toISOString(), row.id);
          insertOperation.run(row.id, data.requestId, bodyHash);
          db.exec('COMMIT');
          send(res, 200, { state: publicState(state) });
          return;
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      }
      send(res, 404, { error: '接口不存在。' });
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      send(res, 405, { error: '不支持的请求。' });
      return;
    }
    let file = resolve(dist, '.' + decodeURIComponent(url.pathname));
    if (file !== dist && !file.startsWith(dist + sep)) {
      send(res, 403, { error: '禁止访问。' });
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) {
      if (extname(url.pathname) && extname(url.pathname) !== '.html') {
        send(res, 404, { error: '资源不存在。' });
        return;
      }
      file = resolve(dist, 'index.html');
    }
    if (!existsSync(file)) {
      send(res, 503, { error: '请先执行 npm run build。' });
      return;
    }
    res.writeHead(200, {
      ...security,
      'Content-Type': mime[extname(file)] || 'application/octet-stream',
      'Cache-Control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=86400',
    });
    res.end(req.method === 'HEAD' ? undefined : readFileSync(file));
  } catch (error) {
    const status =
      error.status || (error instanceof TypeError || error instanceof SyntaxError ? 400 : 422);
    if (!res.headersSent)
      send(res, status, { error: status === 500 ? '服务器暂时不可用。' : error.message });
    else res.end();
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.maxRequestsPerSocket = 100;
server.listen(Number(process.env.PORT || 3100), process.env.HOST || '127.0.0.1', () =>
  console.log(
    'TOUCHLINE listening on http://' +
      (process.env.HOST || '127.0.0.1') +
      ':' +
      server.address().port,
  ),
);
async function close() {
  await jobs.close();
  for (const res of streams.keys()) res.end();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8000).unref();
}
process.on('SIGTERM', close);
process.on('SIGINT', close);
