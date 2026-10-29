// Demand-scaled browser-native worker pool. Jobs share one FIFO queue, so any free worker
// takes the next job (work stealing across task types). Keep one warm worker; retire excess idle workers.
export function recommendedWorkerCount() {
  const cores = Number(globalThis.navigator?.hardwareConcurrency) || 2;
  return Math.max(1, Math.min(12, cores - 1));
}

export function createWorkerPool(size = recommendedWorkerCount()) {
  const maxWorkers = Math.max(1, Math.min(12, Math.floor(Number(size) || 1)));
  let nextJobId = 1, nextWorkerId = 1, closed = false, readySettled = false, resolveReady, rejectReady;
  const workers = [], queue = [], pending = new Map();
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const now = () => performance.now();
  const live = () => workers.filter(w => !w.retired);
  const idle = () => live().filter(w => !w.busy && w.ready);

  const dispatch = worker => {
    if (closed || worker.retired || !worker.ready || worker.busy || !queue.length) return;
    const job = queue.shift();
    worker.busy = true; worker.jobId = job.id; worker.taskType = job.type; worker.lastTaskType = job.type;
    const startedAt = now();
    const record = { resolve: job.resolve, reject: job.reject, worker, queuedAt: job.queuedAt, startedAt, dispatchMs: 0 };
    pending.set(job.id, record);
    try {
      const dispatchStarted = now();
      worker.instance.postMessage({ id: job.id, type: job.type, payload: job.payload });
      record.dispatchMs = now() - dispatchStarted;
    } catch (error) {
      pending.delete(job.id); worker.busy = false; worker.jobId = null; worker.taskType = '';
      job.reject(error); dispatch(worker);
    }
  };

  const scaleToDemand = () => {
    if (closed) return;
    // Fill existing idle workers first. Additional workers are created only when queued work
    // cannot be serviced by current capacity.
    for (const worker of idle()) { if (!queue.length) break; dispatch(worker); }
    while (queue.length && live().length < maxWorkers) spawnWorker();
  };

  const retireExcessIdle = () => {
    if (closed) return;
    const idleWorkers = idle().sort((a,b) => b.index-a.index);
    while (live().length > 1 && idleWorkers.length) {
      const worker = idleWorkers.shift();
      worker.retired = true; worker.instance.terminate();
    }
  };

  function spawnWorker() {
    if (closed || live().length >= maxWorkers) return null;
    const worker = { index: nextWorkerId++, instance: new Worker(new URL('./compute.worker.js', import.meta.url), { type: 'module' }),
      busy: false, ready: false, jobId: null, taskType: '', lastTaskType: '', retired: false };
    workers.push(worker);
    worker.instance.addEventListener('message', event => {
      const message = event.data || {};
      if (message.type === 'ready') {
        worker.ready = true;
        if (!readySettled) { readySettled = true; resolveReady(); }
        scaleToDemand();
        return;
      }
      const record = pending.get(message.id);
      if (!record) return;
      pending.delete(message.id);
      worker.busy = false; worker.jobId = null; worker.taskType = '';
      const endedAt = now();
      if (message.ok) {
        const result = message.result;
        if (result && typeof result === 'object') result.__timing = {
          queueMs: Math.max(0, record.startedAt - record.queuedAt),
          workerMs: Math.max(0, Number(message.workerMs) || 0),
          dispatchMs: record.dispatchMs,
          roundTripMs: Math.max(0, endedAt - record.startedAt),
        };
        record.resolve(result);
      } else record.reject(new Error(message.error || 'Worker task failed'));
      scaleToDemand();
      // Avoid timer-per-worker churn: each completed job checks whether the pool can shrink.
      if (live().length > 1 && !queue.length) setTimeout(retireExcessIdle, 5000);
    });
    worker.instance.addEventListener('error', event => {
      const record = worker.jobId == null ? null : pending.get(worker.jobId);
      if (record) { pending.delete(worker.jobId); record.reject(new Error(event.message || 'Worker crashed')); }
      worker.retired = true; worker.instance.terminate();
      if (!closed && !readySettled) { readySettled = true; rejectReady(new Error(event.message || 'Worker failed to initialize')); }
      scaleToDemand();
    });
    return worker;
  }

  // Start one worker so ready() remains useful to existing callers without eagerly creating
  // the maximum pool. The pool scales up only when submitted jobs exceed available capacity.
  spawnWorker();
  return {
    size: maxWorkers,
    ready: () => ready,
    snapshot() {
      const active = live();
      return { size: maxWorkers, active: active.length, busy: active.filter(w=>w.busy).length,
        queued: queue.length, workers: active.map(w => ({ id:w.index, busy:w.busy, task:w.taskType||'', lastTask:w.lastTaskType||'', jobId:w.jobId })) };
    },
    run(type, payload) {
      if (closed) return Promise.reject(new Error('Worker pool is closed'));
      return new Promise((resolve, reject) => {
        queue.push({ id: nextJobId++, type, payload, resolve, reject, queuedAt: now() });
        scaleToDemand();
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
      for (const [id, record] of pending) { record.reject(new Error('Worker pool closed')); pending.delete(id); }
      for (const worker of workers) { worker.retired = true; worker.instance.terminate(); }
    },
  };
}


// One application-wide worker budget shared by foliage, creature AI, and presentation.
// The underlying pool scales up only when queued demand exceeds current capacity and
// retires excess idle workers after a quiet period.
let applicationWorkerPool = null;
export function getApplicationWorkerPool() {
  if (!applicationWorkerPool) applicationWorkerPool = createWorkerPool(recommendedWorkerCount());
  return applicationWorkerPool;
}
