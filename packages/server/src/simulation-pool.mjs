import { Worker } from 'node:worker_threads';

// One worker and a bounded queue on the 1 GB VM; SQLite remains on the main thread.
export class SimulationPool {
  worker = null;
  queue = [];
  active = null;
  nextId = 0;
  closed = false;
  run(state, type, payload) {
    if (this.closed || this.queue.length >= 2)
      return Promise.reject(Object.assign(Error('比赛计算繁忙，请稍后重试。'), { status: 503 }));
    return new Promise((resolve, reject) => {
      this.queue.push({ id: ++this.nextId, state, type, payload, resolve, reject });
      this.pump();
    });
  }
  pump() {
    if (this.active || !this.queue.length || this.closed) return;
    if (!this.worker) {
      const worker = new Worker(new URL('./simulation-worker.mjs', import.meta.url), {
        resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16 },
      });
      this.worker = worker;
      worker.on('message', (result) => {
        if (this.worker !== worker || this.active?.id !== result.id) return;
        const task = this.active;
        this.active = null;
        clearTimeout(task.timer);
        if (result.error) task.reject(Error(result.error));
        else task.resolve(result.state);
        this.pump();
      });
      worker.on('error', () => this.failed(worker));
      worker.on('exit', (code) => {
        if (code !== 0) this.failed(worker);
      });
    }
    const task = this.queue.shift();
    this.active = task;
    task.timer = setTimeout(() => this.failed(this.worker), 120_000);
    this.worker.postMessage({
      id: task.id,
      state: task.state,
      type: task.type,
      payload: task.payload,
    });
  }
  failed(worker) {
    if (this.worker !== worker) return;
    this.worker = null;
    worker.terminate();
    if (this.active) {
      clearTimeout(this.active.timer);
      this.active.reject(
        Object.assign(Error('比赛计算中断，存档未结算，请重试。'), { status: 503 }),
      );
      this.active = null;
    }
    this.pump();
  }
  async close() {
    this.closed = true;
    for (const t of [this.active, ...this.queue].filter(Boolean)) {
      clearTimeout(t.timer);
      t.reject(Object.assign(Error('服务器正在重启，请稍后重试。'), { status: 503 }));
    }
    this.queue = [];
    this.active = null;
    const worker = this.worker;
    this.worker = null;
    if (worker) await worker.terminate();
  }
}
