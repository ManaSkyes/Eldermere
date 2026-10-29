// CPU-only jobs for the worker pool. Keep this file free of DOM and Three.js access.
self.onmessage = ({ data }) => {
  const { id, type, payload } = data || {};
  const workerStarted = performance.now();
  try {
    if (type === 'tree-cull') {
      const { X, Y, Z, Sc, cx, cy, cz, mid, edges, hidden, baked, targetLod } = payload;
      const records = [], wv = edges.map(e => Math.max(3, e * 0.1));
      if (!hidden) for (let i = 0; i < X.length; i++) {
        const dx = X[i] - cx, dz = Z[i] - cz, d = Math.hypot(dx, Y[i] + mid * Sc[i] - cy, dz);
        const far = edges[edges.length - 1];
        if (d > far) continue;
        // Cell-level frustum rejection happens on the main thread; avoid retesting each tree here.
        const blend = [0, 0, 0];
        for (let b = 0; b < 2; b++) blend[b] = Math.min(1, Math.max(0, (d - (edges[b] - wv[b])) / (2 * wv[b])));
        blend[2] = Math.min(1, Math.max(0, (d - (far - wv[2])) / wv[2]));
        if (!baked) blend[1] = blend[2];
        const lodCount = baked ? 3 : 2;
        const firstLod = Number.isInteger(targetLod) ? targetLod : 0;
        const lastLod = Number.isInteger(targetLod) ? targetLod + 1 : lodCount;
        for (let L = firstLod; L < Math.min(lastLod, lodCount); L++) {
          const lo = L === 0 ? 0 : 1 - blend[L - 1], hi = 1 - blend[L];
          if (lo < hi) records.push([i, L, lo, hi]);
        }
      }
      self.postMessage({ id, ok: true, workerMs: performance.now() - workerStarted, result: { records, scanned: X.length } });
    } else if (type === 'npc-ai-sense') {
      // Pure NPC perception math only: no Three.js, DOM, or game-state mutation in a worker.
      const { player, npcs } = payload;
      const results = npcs.map(n => {
        const dx = player.x - n.x, dz = player.z - n.z, dy = player.y - n.y;
        const distSq = dx * dx + dz * dz;
        const dist = Math.sqrt(distSq);
        const hearing = Math.max(0, player.loudness || 0) * (Math.max(0, n.hearing || 14) * Math.max(0, n.perception || 1) / 14);
        return { index: n.index, dist, distSq, close: Math.max(0, 1 - dist / Math.max(1, n.sight * Math.max(0, n.perception || 1))),
          heard: dist < hearing && Math.abs(dy) < 5 };
      });
      self.postMessage({ id, ok: true, workerMs: performance.now() - workerStarted, result: { results, player: { x: player.x, y: player.y, z: player.z }, count: results.length } });
    } else if (type === 'cpu-stress') {
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
      self.postMessage({ id, ok: true, workerMs: performance.now() - workerStarted, result: { start, end, checksum, signal } });
    } else {
      throw new Error('Unknown worker task: ' + type);
    }
  } catch (error) {
    self.postMessage({ id, ok: false, workerMs: performance.now() - workerStarted, error: error?.message || String(error) });
  }
};

self.postMessage({ type: 'ready' });
