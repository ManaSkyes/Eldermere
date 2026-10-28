// CPU-only jobs for the worker pool. Keep this file free of DOM and Three.js access.
self.onmessage = ({ data }) => {
  const { id, type, payload } = data || {};
  try {
    if (type === 'cpu-stress') {
      const start = Math.max(0, payload.start | 0);
      const end = Math.max(start, payload.end | 0);
      const seed = payload.seed | 0;
      let checksum = 0, signal = 0;
      for (let i = start; i < end; i++) {
        // Deterministic integer work verifies that chunks neither overlap nor disappear.
        checksum = (checksum + Math.imul(i ^ seed, 2654435761)) >>> 0;
        // Floating-point work gives the stress test a meaningful CPU workload.
        const x = i * 0.0000137 + seed;
        signal += Math.sin(x) * Math.cos(x * 0.37) + Math.sqrt((i % 997) + 1) * 0.0001;
      }
      self.postMessage({ id, ok: true, result: { start, end, checksum, signal } });
    } else {
      throw new Error('Unknown worker task: ' + type);
    }
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message || String(error) });
  }
};
