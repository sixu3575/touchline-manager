import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame, applyAction } from '../../shared/game.mjs';

const ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const DATA = resolve(process.env.DATA_DIR || resolve(ROOT, 'data'));
mkdirSync(DATA, { recursive: true, mode: 0o700 });
const db = new DatabaseSync(resolve(DATA, 'game.sqlite'));
db.exec(
  'PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS saves (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, state TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS operations (save_id TEXT NOT NULL, request_id TEXT NOT NULL, body_hash TEXT NOT NULL, PRIMARY KEY(save_id,request_id)); PRAGMA user_version=1;',
);
const findSave = db.prepare('SELECT * FROM saves WHERE token_hash=?');
const insertSave = db.prepare('INSERT INTO saves VALUES (?,?,?,?)');
const updateSave = db.prepare('UPDATE saves SET state=?,updated_at=? WHERE id=?');
const findOperation = db.prepare(
  'SELECT body_hash FROM operations WHERE save_id=? AND request_id=?',
);
const insertOperation = db.prepare('INSERT INTO operations VALUES (?,?,?)');
const hash = (s) => createHash('sha256').update(s).digest('hex');
const rate = new Map();
const dist = resolve(ROOT, 'dist/client');
const version = '0.1.0';
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
      if (++entry.n > 150) {
        send(res, 429, { error: '操作太频繁，请稍后重试。' });
        return;
      }
      if (rate.size > 5000) for (const [k, v] of rate) if (v.until < now) rate.delete(k);
      if (req.method === 'GET' && url.pathname === '/api/state') {
        const row = session(req, res);
        send(res, 200, { state: JSON.parse(row.state), version });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/action') {
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
            send(res, 200, { state: current, replayed: true });
            return;
          }
          if (current.revision !== data.revision)
            throw Object.assign(Error('存档已更新，请重试刚才的操作。'), { status: 409 });
          const state = applyAction(current, data.type, data.payload);
          updateSave.run(JSON.stringify(state), new Date().toISOString(), row.id);
          insertOperation.run(row.id, data.requestId, bodyHash);
          db.exec('COMMIT');
          send(res, 200, { state });
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
function close() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8000).unref();
}
process.on('SIGTERM', close);
process.on('SIGINT', close);
