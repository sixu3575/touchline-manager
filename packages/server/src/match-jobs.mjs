import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  createCompetitionPlan,
  settleCompetition,
} from '../../shared/modules/competitions/index.mjs';
import { ENGINE_VERSION, PARAMETER_VERSION } from '../../shared/modules/matches/index.mjs';
import { createJobStorage, unpack } from './storage/jobs.mjs';

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
  constructor(db, replays) {
    super();
    this.db = db;
    this.replays = replays;
    this.store = createJobStorage(db);
    queueMicrotask(() => this.pump());
  }
  view(row) {
    if (!row) return null;
    const p = JSON.parse(row.progress);
    return {
      id: row.id,
      status: row.status,
      engineVersion: ENGINE_VERSION,
      error: row.error,
      type: row.identity.split(':')[0],
      ...p,
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
        if (!this.writeStatus(prior.id, 'queued'))
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
        if (!this.writeStatus(pending.id, 'queued'))
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
    this.emit(id, this.view(this.store.get(id)));
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
      this.db.exec('BEGIN IMMEDIATE');
      transaction = true;
      if (own) {
        const track = done
          ? part.trajectory.subarray((progress.frameCount ?? 0) * 49)
          : part.trajectory;
        if (track?.length) {
          this.store.addChunk(row.id, work.seq++, track);
        }
        const report = done ? { ...part } : part.report;
        delete report.trajectory;
        report.competition = work.plan.type === 'cup' ? '城市挑战杯' : '先锋联赛';
        report.round = work.plan.state.round;
        progress.report = report;
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
      if (work.index === work.plan.order.length) {
        const current = JSON.parse(
          this.db.prepare('SELECT state FROM saves WHERE id=?').get(row.save_id).state,
        );
        if (current.revision !== row.revision) throw problem('存档版本冲突，比赛尚未结算。');
        const state = settleCompetition(work.plan, work.reports);
        const ownReport = state.reports[0];
        const chunks = [];
        for (let seq = 0; seq < work.seq; seq++) chunks.push(this.store.chunk(row.id, seq));
        this.replays.persistChunks(row.save_id, ownReport.id, chunks);
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
    clearTimeout(this.retryTimer);
    if (this.active) clearTimeout(this.active.timer);
    const worker = this.worker;
    this.worker = null;
    this.active = null;
    this.working = null;
    await this.retire(worker);
  }
}
