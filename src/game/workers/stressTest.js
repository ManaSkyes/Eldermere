import { createWorkerPool, recommendedWorkerCount } from './workerPool.js';

const now = () => globalThis.performance?.now?.() ?? Date.now();
const checksumRange = (start, end, seed) => {
  let checksum = 0;
  for (let i = start; i < end; i++) checksum = (checksum + Math.imul(i ^ seed, 2654435761)) >>> 0;
  return checksum;
};

export async function runWorkerStressTest({ totalIterations = 2_400_000, workerCounts = null } = {}) {
  const maxWorkers = recommendedWorkerCount();
  const counts = [...new Set(workerCounts || [1, 2, 4, maxWorkers])]
    .map(n => Math.max(1, Math.min(maxWorkers, Math.floor(n))))
    .filter((n, i, a) => a.indexOf(n) === i)
    .sort((a, b) => a - b);
  const results = [];
  let expectedChecksum = null;

  for (const count of counts) {
    const pool = createWorkerPool(count);
    const initStart = now();
    try {
      await pool.ready();
      const initMs = now() - initStart;
      // Warm each worker once so the measured pass is less dominated by first-use/JIT costs.
      const warmStart = now();
      await pool.runBatch(Array.from({ length: count }, (_, worker) => ({
        type: 'cpu-stress', payload: { start: worker * 40_000, end: (worker + 1) * 40_000, seed: 71 },
      })));
      const warmupMs = now() - warmStart;
      const seed = 173;
      const chunks = Math.max(count * 4, 4);
      const tasks = [];
      for (let chunk = 0; chunk < chunks; chunk++) {
        const start = Math.floor(totalIterations * chunk / chunks);
        const end = Math.floor(totalIterations * (chunk + 1) / chunks);
        tasks.push({ type: 'cpu-stress', payload: { start, end, seed } });
      }
      const samples = [], checksums = [], signals = [];
      let valid = true;
      const reference = checksumRange(0, totalIterations, seed);
      for (let sample = 0; sample < 3; sample++) {
        const start = now();
        const parts = await pool.runBatch(tasks);
        samples.push(now() - start);
        const checksum = parts.reduce((sum, part) => (sum + part.checksum) >>> 0, 0);
        const signal = parts.reduce((sum, part) => sum + part.signal, 0);
        const covered = parts.reduce((sum, part) => sum + (part.end - part.start), 0);
        checksums.push(checksum); signals.push(signal);
        valid = valid && checksum === reference && covered === totalIterations;
      }
      const sorted = [...samples].sort((a, b) => a - b);
      const elapsedMs = sorted[1];
      const checksum = checksums[checksums.length - 1];
      const signal = signals[signals.length - 1];
      if (expectedChecksum == null) expectedChecksum = checksum;
      results.push({
        workers: count, iterations: totalIterations, repeats: samples.length, samplesMs: samples.map(n => Number(n.toFixed(1))),
        initMs, warmupMs, elapsedMs,
        iterationsPerSecond: Math.round(totalIterations / Math.max(0.001, elapsedMs / 1000)),
        speedupVsFirst: null, checksum, valid: valid && checksums.every(n => n === expectedChecksum),
        signal: Number(signal.toFixed(4)),
      });
    } finally {
      pool.close();
    }
  }

  const baseline = results[0]?.elapsedMs || 0;
  for (const result of results) result.speedupVsFirst = baseline > 0 ? Number((baseline / result.elapsedMs).toFixed(2)) : null;
  return {
    hardwareConcurrency: Number(globalThis.navigator?.hardwareConcurrency) || null,
    recommendedWorkers: maxWorkers,
    totalIterations,
    results,
    note: 'CPU-only synthetic stress test. Includes worker message/scheduling overhead, excludes worker startup time from task time, and does not prove gameplay speedup.',
  };
}
