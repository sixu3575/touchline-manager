import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  createCompetitionPlan,
  settleCompetition,
} from '../../shared/modules/competitions/index.mjs';
import { ENGINE_VERSION, PARAMETER_VERSION } from '../../shared/modules/matches/index.mjs';
import { createJobStorage, unpack } from './storage/jobs.mjs';
import { gunzipSync } from 'node:zlib';
import {
  broadcastAt,
  liveReport,
  broadcastFrameCount,
  compactBroadcastReport,
} from './broadcast.mjs';

const problem = (message, status = 409) => Object.assign(Error(message), { status });
// One bounded worker, durable input/checkpoint/chunks. It never owns SQLite.
export class MatchJobs extends EventEmitter {
  worker = null;
  active = null;
  closing = false;
  retries = new Map();
  working = null;
  workerKey = null;
  retryTimer = null;
  retiring = null;
  progressCache = new Map();
  constructor(db, replays, { now = () => Date.now() } = {}) {
    super();
    this.db = db;
    this.replays = replays;
    this.store = createJobStorage(db);
    this.now = now;
    this.clockTimer = setInterval(() => this.pulse(), 500);
    this.clockTimer.unref();
    queueMicrotask(() => this.pump());
  }
  readProgress(row) {
    const cached = this.progressCache.get(row.id);
    if (cached?.raw === row.progress) return cached.value;
    const value = JSON.parse(row.progress);
    // Old running jobs remain readable; no startup rewrite or migration.
    if (value.report) value.report = compactBroadcastReport(value.report);
    if (this.progressCache.size >= 2)
      this.progressCache.delete(this.progressCache.keys().next().value);
    this.progressCache.set(row.id, { raw: row.progress, value });
    return value;
  }
  view(row, { summary = false } = {}) {
    if (!row) return null;
    const p = this.readProgress(row);
    const broadcast = broadcastAt(p, this.now())?.public;
    const report = summary ? undefined : broadcast ? liveReport(p.report, broadcast) : p.report;
    return {
      id: row.id,
      status: row.status,
      engineVersion: ENGINE_VERSION,
      error: row.error,
      type: row.identity.split(':')[0],
      ...(broadcast
        ? {
            broadcast,
            ownComplete: broadcast.finished,
            report,
            frameCount: report?.replay?.frameCount,
            generatedSeconds: broadcast.seconds,
          }
        : p),
    };
  }
  latest(saveId) {
    return this.view(this.store.latest(saveId));
  }
  locked(saveId) {
    return this.store.pending(saveId);
  }
  start(saveId, before, data, bodyHash) {
    const prior = this.db
      .prepare('SELECT * FROM match_jobs WHERE save_id=? AND request_id=?')
      .get(saveId, data.requestId);
    if (prior) {
      if (prior.body_hash !== bodyHash) throw problem('操作标识已被使用。');
      if (prior.status === 'failed') {
        if (!this.writeStatus(prior.id, this.resumeStatus(prior)))
          throw problem('存储暂时繁忙，请稍后恢复比赛。', 503);
        this.retries.delete(prior.id);
        this.pump();
      }
      return this.view(this.store.get(prior.id));
    }
    const pending = this.store.pending(saveId);
    // A different click/tab joins this competition, never starts another seed.
    if (pending) {
      if (pending.body_hash !== bodyHash || pending.revision !== data.revision)
        throw problem('本存档有未结算的比赛，请等待完成。');
      if (pending.status === 'failed') {
        if (!this.writeStatus(pending.id, this.resumeStatus(pending)))
          throw problem('存储暂时繁忙，请稍后恢复比赛。', 503);
        this.retries.delete(pending.id);
        this.pump();
      }
      return this.view(this.store.get(pending.id));
    }
    if (before.revision !== data.revision) throw problem('存档已更新，请刷新后重试。');
    if (this.store.count() >= 3) throw problem('比赛计算繁忙，请稍后重试。', 503);
    const plan = createCompetitionPlan(before, data.type);
    const existing = this.db
      .prepare('SELECT * FROM match_jobs WHERE save_id=? AND identity=?')
      .get(saveId, plan.identity);
    if (existing) return this.view(existing);
    const id = randomUUID();
    this.store.insert(
      {
        id,
        saveId,
        identity: plan.identity,
        requestId: data.requestId,
        bodyHash,
        revision: data.revision,
        engineVersion: ENGINE_VERSION,
        parameterVersion: PARAMETER_VERSION,
        total: plan.order.length,
      },
      {
        engineVersion: ENGINE_VERSION,
        parameterVersion: PARAMETER_VERSION,
        plan,
        index: 0,
        reports: [],
        checkpoint: null,
        seq: 0,
      },
    );
    this.pump();
    return this.view(this.store.get(id));
  }
  notify(id) {
    if (this.listenerCount(id)) this.emit(id);
  }
  resumeStatus(row) {
    const work = unpack(row.work);
    return work && work.index === work.plan.order.length ? 'airing' : 'queued';
  }
  pulse() {
    if (this.closing) return;
    for (const row of this.store.pendingRows()) {
      try {
        const p = this.readProgress(row),
          clock = broadcastAt(p, this.now());
        if (clock?.changed) {
          this.store.progress(row.id, { ...p, broadcast: clock.clock });
        }
        if (row.status === 'airing' && clock?.public.finished)
          this.finishAiring(this.store.get(row.id));
        this.notify(row.id);
      } catch {
        // A temporary SQLite writer never advances state or loses the last durable clock.
      }
    }
  }
  finishAiring(row) {
    let transaction = false;
    try {
      const work = unpack(row.work),
        progress = JSON.parse(row.progress);
      this.db.exec('BEGIN IMMEDIATE');
      transaction = true;
      this.settle(row, progress, work);
      this.db.exec('COMMIT');
      transaction = false;
    } catch (error) {
      if (transaction) this.db.exec('ROLLBACK');
      this.writeStatus(row.id, 'failed', error.message);
    }
  }
  frames(row, from) {
    const p = this.readProgress(row);
    const end = broadcastFrameCount(p.report, broadcastAt(p, this.now())?.public);
    if (!Number.isSafeInteger(from) || from < 0 || from > end) throw problem('轨迹范围无效。', 416);
    let offset = 0;
    const parts = [];
    for (let seq = 0; seq < (p.seq ?? 0) && offset < end; seq++) {
      const chunkEnd = p.chunkEnds?.[seq];
      if (chunkEnd !== undefined && chunkEnd <= from) {
        offset = chunkEnd;
        continue;
      }
      const raw = gunzipSync(this.store.chunk(row.id, seq));
      const next = offset + raw.length / 98;
      if (next > from)
        parts.push(
          raw.subarray(Math.max(0, from - offset) * 98, Math.min(next - offset, end - offset) * 98),
        );
      offset = next;
    }
    return { payload: Buffer.concat(parts), end };
  }
  settle(row, progress, work) {
    const current = JSON.parse(
      this.db.prepare('SELECT state FROM saves WHERE id=?').get(row.save_id).state,
    );
    if (current.revision !== row.revision) throw problem('存档版本冲突，比赛尚未结算。');
    const state = settleCompetition(work.plan, work.reports);
    const chunks = [];
    for (let seq = 0; seq < work.seq; seq++) chunks.push(this.store.chunk(row.id, seq));
    this.replays.persistChunks(row.save_id, state.reports[0].id, chunks);
    this.replays.persist(row.save_id, state);
    this.db
      .prepare('UPDATE saves SET state=?,updated_at=? WHERE id=?')
      .run(JSON.stringify(state), new Date().toISOString(), row.save_id);
    this.db
      .prepare('INSERT INTO operations VALUES (?,?,?)')
      .run(row.save_id, row.request_id, row.body_hash);
    progress.settledRevision = state.revision;
    this.store.save(row.id, progress, null, 'complete');
    this.store.prune(row.save_id);
  }
  writeStatus(id, status, error = null) {
    try {
      this.store.status(id, status, error);
      return true;
    } catch {
      // Keep the last committed bytes intact if a backup temporarily owns the writer.
      if (!this.closing && !this.retryTimer)
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          this.pump();
        }, 5000);
      return false;
    }
  }
  failTask(id, error) {
    this.working = null;
    this.workerKey = null;
    if (!this.writeStatus(id, 'failed', error)) return;
    this.notify(id);
    this.pump();
  }
  retire(worker) {
    if (!worker) return this.retiring;
    const pending = worker.terminate();
    this.retiring = pending;
    pending.then(() => {
      if (this.retiring === pending) this.retiring = null;
      this.pump();
    });
    return pending;
  }
  pump() {
    if (this.closing || this.active || this.retiring) return;
    const next = this.store.waiting()[0];
    if (!next) {
      const worker = this.worker;
      this.worker = null;
      this.working = null;
      this.retire(worker);
      return;
    }
    const row = this.store.get(next.id);
    let work;
    try {
      work = this.working?.id === row.id ? this.working.work : unpack(row.work);
    } catch {
      this.working = null;
      this.failTask(row.id, '检查点无法读取；请使用原运行版本和备份恢复，存档尚未结算。');
      return;
    }
    this.working = { id: row.id, work };
    if (row.status !== 'running' && !this.writeStatus(row.id, 'running')) return;
    const freshWorker = !this.worker;
    if (!this.worker) {
      const worker = new Worker(new URL('./simulation-worker.mjs', import.meta.url), {
        resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16 },
      });
      this.worker = worker;
      worker.on('message', (result) => {
        if (this.worker === worker) this.received(result);
      });
      worker.on('error', () => this.failed(worker));
      worker.on('exit', (code) => {
        if (code !== 0) this.failed(worker);
      });
    }
    this.active = { id: row.id, work, timer: setTimeout(() => this.failed(this.worker), 45000) };
    const f = work.plan.order[work.index];
    const key = row.id + ':' + f.id,
      resume = freshWorker || this.workerKey !== key;
    this.workerKey = key;
    this.worker.postMessage({
      id: row.id,
      fixture: f,
      home: work.plan.state.clubs.find((c) => c.id === f.homeId),
      away: work.plan.state.clubs.find((c) => c.id === f.awayId),
      checkpoint: resume ? work.checkpoint : undefined,
      expectedTick: work.checkpoint?.tick ?? 0,
      engineVersion: work.engineVersion,
      parameterVersion: work.parameterVersion,
      sliceSeconds: work.index === 0 ? 15 : 60,
    });
  }
  received(result) {
    if (this.active?.id !== result.id) return;
    const active = this.active;
    clearTimeout(active.timer);
    this.active = null;
    const row = this.store.get(result.id),
      work = active.work;
    if (result.error) {
      this.failTask(row.id, result.error);
      return;
    }
    let transaction = false;
    try {
      const { done, part } = result,
        own = work.index === 0;
      const progress = JSON.parse(row.progress);
      // An existing job may already be computing AI fixtures when this repair
      // is deployed. Its next ordinary checkpoint also sheds the old live copy.
      if (!own && progress.report) progress.report = compactBroadcastReport(progress.report);
      const beforeClock = broadcastAt(progress, this.now());
      if (beforeClock) progress.broadcast = beforeClock.clock;
      this.db.exec('BEGIN IMMEDIATE');
      transaction = true;
      if (own) {
        const track = done
          ? part.trajectory.subarray((progress.frameCount ?? 0) * 49)
          : part.trajectory;
        if (track?.length) {
          this.store.addChunk(row.id, work.seq++, track);
          (progress.chunkEnds ??= []).push((progress.chunkEnds?.at(-1) ?? 0) + track.length / 49);
        }
        const report = done ? { ...part } : part.report;
        delete report.trajectory;
        report.competition = work.plan.type === 'cup' ? '城市挑战杯' : '先锋联赛';
        report.round = work.plan.state.round;
        progress.report = compactBroadcastReport(report);
        progress.seq = work.seq;
        progress.frameCount = report.replay.frameCount;
        progress.generatedSeconds = report.replay.duration;
        progress.ownComplete = done;
      }
      if (done) {
        // Read the player's full trajectory from committed chunks during final settlement.
        const report = own ? { ...part } : part;
        delete report.trajectory;
        delete report.timeline;
        work.reports.push(report);
        work.index++;
        work.checkpoint = null;
      } else work.checkpoint = part.checkpoint;
      progress.fixturesDone = work.index;
      progress.fixturesTotal = work.plan.order.length;
      progress.fixtureSeconds = done ? 0 : part.second;
      progress.computedAt = this.now();
      const clock = broadcastAt(progress, this.now());
      if (clock) progress.broadcast = clock.clock;
      if (work.index === work.plan.order.length) {
        if (!clock || clock.public.finished) this.settle(row, progress, work);
        else this.store.save(row.id, progress, work, 'airing');
        this.working = null;
      } else this.store.save(row.id, progress, work);
      this.db.exec('COMMIT');
      transaction = false;
    } catch (error) {
      if (transaction) this.db.exec('ROLLBACK');
      this.failTask(row.id, error.message);
      return;
    }
    this.notify(row.id);
    this.pump();
  }
  failed(worker) {
    if (this.worker !== worker || !worker) return;
    this.worker = null;
    this.working = null;
    this.retire(worker);
    if (this.active) {
      const { id, timer } = this.active;
      clearTimeout(timer);
      this.active = null;
      const n = (this.retries.get(id) ?? 0) + 1;
      this.retries.set(id, n);
      // Replay only the last uncommitted slice from its original checkpoint.
      if (
        !this.writeStatus(
          id,
          n < 3 ? 'queued' : 'failed',
          n < 3 ? null : '计算中断；可重试恢复原场比赛。',
        )
      )
        return;
      this.notify(id);
    }
    this.pump();
  }
  async close() {
    this.closing = true;
    clearInterval(this.clockTimer);
    clearTimeout(this.retryTimer);
    if (this.active) clearTimeout(this.active.timer);
    const worker = this.worker;
    this.worker = null;
    this.active = null;
    this.working = null;
    await this.retire(worker);
    this.progressCache.clear();
  }
}
