// src/game/workers/workerPool.js — the application's worker threads.
//
// Rules (keep them when editing):
// - ONE shared pool for the whole game: getApplicationWorkerPool(). Never create private pools in systems.
//   Its close() is a no-op, so a subsystem turning its worker mode off cannot kill the pool for everyone.
// - Fixed size: cores − 2 (main thread + browser/GPU), between 1 and 6. Workers start lazily as work arrives
//   and then stay alive; there is no spawn/retire churn.
// - Only offload work that is big enough to pay for the message round trip (a rule of thumb: > 0.5 ms of CPU
//   per job). Small per-frame maths stays on the main thread; results from a worker arrive a frame or more late.
// - Large read-only inputs go through `cache` (sent to each worker once, then reused by key) and big outputs
//   come back as transferable typed arrays.
//
// API
//   run(type, payload, { cache: { key, data }, transfer: [ArrayBuffer], timeoutMs, low }) → Promise<result>
//   runBatch(tasks, concurrency)   tasks: [{ type, payload, cache?, low? }] → results in task order
//   evict(prefix)                  drop cached data whose key starts with prefix, in every worker
//   snapshot()                     { size, active, busy, queued, workers: [{ id, busy, task, lastTask, jobId }] }
// `low: true` marks bulk work (e.g. tree culling): it never starves, but latency-sensitive jobs go first.
const MAX_WORKERS = 6, DEFAULT_TIMEOUT_MS = 4000, LOW_PRIORITY_BURST = 3;

export function recommendedWorkerCount() {
  const cores = Number(globalThis.navigator?.hardwareConcurrency) || 4;
  return Math.max(1, Math.min(MAX_WORKERS, cores - 2));
}

export function createWorkerPool(size = recommendedWorkerCount(), { shared = false } = {}) {
  const maxWorkers = Math.max(1, Math.min(MAX_WORKERS, Math.floor(Number(size) || 1)));
  let nextJobId = 1, nextWorkerId = 1, closed = false, readySettled = false, resolveReady, rejectReady, highStreak = 0;
  const workers = [], queue = [], pending = new Map(), cacheKeys = new Set();
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const now = () => performance.now();
  const live = () => workers.filter(w => !w.dead);

  // Latency-sensitive jobs first, but after a short burst one low-priority job always gets through.
  const takeNextJob = () => {
    const hi = queue.findIndex(j => !j.low), lo = queue.findIndex(j => j.low);
    if (hi < 0 && lo < 0) return null;
    const pick = hi < 0 || (lo >= 0 && highStreak >= LOW_PRIORITY_BURST) ? lo : hi;
    highStreak = queue[pick].low ? 0 : highStreak + 1;
    return queue.splice(pick, 1)[0];
  };

  const finish = (worker, jobId) => {
    const record = pending.get(jobId); if (!record) return null;
    pending.delete(jobId); clearTimeout(record.timer);
    worker.busy = false; worker.jobId = null; worker.task = '';
    return record;
  };

  const dispatch = worker => {
    if (closed || worker.dead || !worker.ready || worker.busy) return;
    const job = takeNextJob(); if (!job) return;
    worker.busy = true; worker.jobId = job.id; worker.task = worker.lastTask = job.type;
    const record = { job, worker, startedAt: now(), dispatchMs: 0, timer: 0 };
    pending.set(job.id, record);
    const message = { id: job.id, type: job.type, payload: job.payload };
    if (job.cache && !worker.cached.has(job.cache.key)) { message.cache = job.cache; worker.cached.add(job.cache.key); cacheKeys.add(job.cache.key); }
    else if (job.cache) message.cacheKey = job.cache.key;
    try {
      const t = now(); worker.instance.postMessage(message, job.transfer || []); record.dispatchMs = now() - t;
    } catch (error) {
      finish(worker, job.id); job.reject(error); dispatch(worker); return;
    }
    record.timer = setTimeout(() => {   // a hung worker is replaced; its job fails instead of blocking forever
      if (!pending.has(job.id)) return;
      finish(worker, job.id); job.reject(new Error(`Worker task "${job.type}" timed out after ${job.timeoutMs} ms`));
      kill(worker); pump();
    }, job.timeoutMs);
  };

  const pump = () => {
    if (closed) return;
    for (const w of live()) { if (!queue.length) break; if (w.ready && !w.busy) dispatch(w); }
    // start another worker only if queued work exceeds what starting workers can absorb
    const starting = live().filter(w => !w.ready).length;
    if (queue.length > starting && live().length < maxWorkers) spawn();
  };

  function kill(worker) {
    worker.dead = true; worker.instance.terminate();
    const record = worker.jobId == null ? null : finish(worker, worker.jobId);
    if (record) record.job.reject(new Error('Worker stopped'));
  }

  function spawn() {
    const worker = { id: nextWorkerId++, instance: new Worker(new URL('./compute.worker.js', import.meta.url), { type: 'module' }),
      ready: false, busy: false, dead: false, jobId: null, task: '', lastTask: '', cached: new Set() };
    for (let i = workers.length - 1; i >= 0; i--) if (workers[i].dead) workers.splice(i, 1);   // forget long-dead workers
    workers.push(worker);
    worker.instance.addEventListener('message', ({ data: m = {} }) => {
      if (m.type === 'ready') { worker.ready = true; if (!readySettled) { readySettled = true; resolveReady(); } pump(); return; }
      const record = finish(worker, m.id); if (!record) return;
      if (m.ok) {
        const r = m.result;
        if (r && typeof r === 'object') r.__timing = { queueMs: record.startedAt - record.job.queuedAt, workerMs: Number(m.workerMs) || 0,
          dispatchMs: record.dispatchMs, roundTripMs: now() - record.startedAt };
        record.job.resolve(r);
      } else record.job.reject(new Error(m.error || 'Worker task failed'));
      pump();
    });
    worker.instance.addEventListener('error', event => {
      event.preventDefault?.();
      const msg = event.message || 'Worker crashed';
      kill(worker);
      if (!readySettled) { readySettled = true; rejectReady(new Error(msg)); return; }
      pump();   // replaces the crashed worker if work is waiting
    });
    return worker;
  }

  spawn();   // one worker up front so ready() resolves; the rest start on demand
  const api = {
    size: maxWorkers,
    ready: () => ready,
    snapshot() {
      const ws = live();
      return { size: maxWorkers, active: ws.length, busy: ws.filter(w => w.busy).length, queued: queue.length,
        workers: ws.map(w => ({ id: w.id, busy: w.busy, task: w.task, lastTask: w.lastTask, jobId: w.jobId })) };
    },
    run(type, payload, { cache = null, transfer = null, timeoutMs = DEFAULT_TIMEOUT_MS, low = false } = {}) {
      if (closed) return Promise.reject(new Error('Worker pool is closed'));
      return new Promise((resolve, reject) => {
        queue.push({ id: nextJobId++, type, payload, cache, transfer, timeoutMs, low, resolve, reject, queuedAt: now() });
        pump();
      });
    },
    async runBatch(tasks, concurrency = maxWorkers) {
      await ready;
      const limit = Math.max(1, Math.min(tasks.length || 1, Math.floor(Number(concurrency) || maxWorkers)));
      const results = new Array(tasks.length); let next = 0;
      await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, async () => {
        while (next < tasks.length) { const i = next++, t = tasks[i]; results[i] = await api.run(t.type, t.payload, t); }
      }));
      return results;
    },
    evict(prefix) {
      for (const k of [...cacheKeys]) if (k.startsWith(prefix)) cacheKeys.delete(k);
      for (const w of live()) {
        for (const k of [...w.cached]) if (k.startsWith(prefix)) w.cached.delete(k);
        try { w.instance.postMessage({ type: '__evict', prefix }); } catch {}
      }
    },
    close() {
      if (shared) { console.warn('[workers] close() ignored on the shared application pool'); return; }
      if (closed) return; closed = true;
      for (const job of queue.splice(0)) job.reject(new Error('Worker pool closed'));
      for (const w of workers) if (!w.dead) kill(w);
    },
  };
  return api;
}

// The one pool every system uses. Do not create others.
let applicationWorkerPool = null;
export function getApplicationWorkerPool() {
  if (!applicationWorkerPool) applicationWorkerPool = createWorkerPool(recommendedWorkerCount(), { shared: true });
  return applicationWorkerPool;
}
