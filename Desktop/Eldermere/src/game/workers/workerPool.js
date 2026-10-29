// Small browser-native worker pool for CPU-only calculations.
// Main-thread work (DOM, Three.js scene objects, WebGL resources) must stay outside workers.
export function recommendedWorkerCount() {
  const cores = Number(globalThis.navigator?.hardwareConcurrency) || 2;
  // Leave a logical processor available for the browser/game loop, and cap memory/scheduling overhead.
  return Math.max(1, Math.min(12, cores - 1));
}

export function createWorkerPool(size = recommendedWorkerCount()) {
  const count = Math.max(1, Math.min(12, Math.floor(Number(size) || 1)));
  let nextId = 1, closed = false;
  const workers = [], queue = [], pending = new Map();
  let readyCount = 0, resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });

  const dispatch = worker => {
    if (closed || worker.busy || !queue.length) return;
    const job = queue.shift();
    worker.busy = true;
    worker.jobId = job.id;
    const startedAt = performance.now();
    pending.set(job.id, { resolve: job.resolve, reject: job.reject, worker, queuedAt: job.queuedAt, startedAt });
    try {
      const dispatchStarted = performance.now();
      worker.instance.postMessage({ id: job.id, type: job.type, payload: job.payload });
      pending.get(job.id).dispatchMs = performance.now() - dispatchStarted;
    } }
    catch (error) {
      pending.delete(job.id); worker.busy = false; worker.jobId = null;
      job.reject(error); dispatch(worker);
    }
  };

  for (let i = 0; i < count; i++) {
    const worker = { instance: new Worker(new URL('./compute.worker.js', import.meta.url), { type: 'module' }), busy: false, jobId: null };
    workers.push(worker);
    worker.instance.addEventListener('message', event => {
      const message = event.data || {};
      if (message.type === 'ready') {
        readyCount++;
        if (readyCount === count) resolveReady();
        return;
      }
      const job = pending.get(message.id);
      if (!job) return;
      pending.delete(message.id);
      worker.busy = false; worker.jobId = null;
      if (message.ok) {
        if (message.result && typeof message.result === 'object') message.result.__timing = { queueMs: Math.max(0, job.startedAt - job.queuedAt), workerMs: Number(message.workerMs) || 0, dispatchMs: job.dispatchMs || 0 };
        job.resolve(message.result);
      } else job.reject(new Error(message.error || 'Worker task failed'));
      dispatch(worker);
    });
    worker.instance.addEventListener('error', event => {
      const job = worker.jobId == null ? null : pending.get(worker.jobId);
      if (job) { pending.delete(worker.jobId); job.reject(new Error(event.message || 'Worker crashed')); }
      worker.busy = false; worker.jobId = null;
      if (!closed) rejectReady(new Error(event.message || 'Worker failed to initialize'));
    });
  }

  return {
    size: count,
    ready: () => ready,
    run(type, payload) {
      if (closed) return Promise.reject(new Error('Worker pool is closed'));
      return new Promise((resolve, reject) => {
        queue.push({ id: nextId++, type, payload, resolve, reject, queuedAt: performance.now() });
        for (const worker of workers) dispatch(worker);
      });
    },
    async runBatch(tasks) {
      await ready;
      return Promise.all(tasks.map(task => this.run(task.type, task.payload)));
    },
    close() {
      if (closed) return;
      closed = true;
      for (const job of queue.splice(0)) job.reject(new Error('Worker pool closed'));
      for (const [id, job] of pending) { job.reject(new Error('Worker pool closed')); pending.delete(id); }
      for (const worker of workers) worker.instance.terminate();
    },
  };
}
