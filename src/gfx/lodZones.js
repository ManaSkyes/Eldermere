// Player-centred LOD zone scheduler.
// Scheduling is independent of camera orientation. Call runFrame() from the game loop;
// each zone callback should update only that zone's membership/instance buffers.
export const DEFAULT_LOD_ZONES = Object.freeze([
  { id: 1, name: 'LOD 1 · Near', radius: 25, interval: 1, assignment: 'main', enabled: true },
  { id: 2, name: 'LOD 2 · Close', radius: 60, interval: 10, assignment: 'main', enabled: true },
  { id: 3, name: 'LOD 3 · Mid', radius: 120, interval: 20, assignment: 'worker-1', enabled: true },
  { id: 4, name: 'LOD 4 · Far', radius: 220, interval: 40, assignment: 'worker-2', enabled: true },
  { id: 5, name: 'LOD 5 · Horizon', radius: 350, interval: 100, assignment: 'worker-2', enabled: true }
]);

const cloneDefaults = () => DEFAULT_LOD_ZONES.map(z => ({ ...z }));
const now = () => typeof performance !== 'undefined' ? performance.now() : Date.now();

export function createLodZoneScheduler({ onZoneDue = null } = {}) {
  let zones = cloneDefaults();
  let frame = 0, frozen = false, revision = 0;
  const stats = new Map(zones.map(z => [z.id, {
    checks: 0, runs: 0, skipped: 0, lastMs: 0, totalMs: 0, maxMs: 0,
    lastFrame: -1, lastPosition: null, pending: 0, staleResults: 0, errors: 0
  }]));

  function normalize(input) {
    const ids = new Set();
    const next = input.slice(0, 5).map((z, i) => {
      const id = Math.max(1, Math.min(5, Math.round(Number(z.id) || i + 1)));
      if (ids.has(id)) throw new Error('Each LOD zone must have a unique ID.');
      ids.add(id);
      return {
        id, name: String(z.name || `LOD ${id}`),
        radius: Math.max(1, Math.min(10000, Number(z.radius) || 1)),
        interval: Math.max(1, Math.min(10000, Math.round(Number(z.interval) || 1))),
        assignment: ['main', 'worker-1', 'worker-2', 'worker-3', 'worker-4', 'worker-5', 'worker-6', 'auto'].includes(z.assignment) ? z.assignment : 'main',
        enabled: z.enabled !== false
      };
    }).sort((a, b) => a.id - b.id);
    for (let i = 1; i < next.length; i++) {
      if (next[i].radius <= next[i - 1].radius) throw new Error('Zone radii must increase outwards.');
    }
    return next;
  }

  function configure(input) {
    zones = normalize(input);
    revision++;
    for (const z of zones) {
      if (!stats.has(z.id)) stats.set(z.id, { checks: 0, runs: 0, skipped: 0, lastMs: 0, totalMs: 0, maxMs: 0, lastFrame: -1, lastPosition: null, pending: 0, staleResults: 0, errors: 0 });
    }
    return snapshot();
  }

  function runFrame(position, context = {}) {
    frame++;
    if (frozen) return snapshot();
    const p = { x: Number(position?.x) || 0, y: Number(position?.y) || 0, z: Number(position?.z) || 0 };
    for (const zone of zones) {
      if (!zone.enabled) continue;
      const st = stats.get(zone.id);
      st.checks++;
      if (frame % zone.interval !== 0) { st.skipped++; continue; }
      const started = now();
      try {
        const result = onZoneDue?.({ zone: { ...zone }, frame, revision, position: p, context, stats: st });
        if (result && typeof result.then === 'function') {
          st.pending++;
          const jobRevision = revision;
          result.then(() => {
            st.pending = Math.max(0, st.pending - 1);
            if (jobRevision !== revision) st.staleResults++;
          }).catch(() => { st.pending = Math.max(0, st.pending - 1); st.errors++; });
        }
        st.lastMs = now() - started;
        st.totalMs += st.lastMs;
        st.maxMs = Math.max(st.maxMs, st.lastMs);
        st.runs++;
        st.lastFrame = frame;
        st.lastPosition = p;
      } catch (error) {
        st.errors++;
        st.lastError = error?.message || String(error);
      }
    }
    return snapshot();
  }

  function snapshot() {
    return {
      frame, frozen, revision,
      zones: zones.map(z => ({ ...z, stats: { ...stats.get(z.id) } }))
    };
  }

  return {
    configure,
    runFrame,
    snapshot,
    setFrozen(value) { frozen = !!value; return frozen; },
    reset() {
      zones = cloneDefaults(); frame = 0; frozen = false; revision++;
      for (const st of stats.values()) Object.assign(st, { checks: 0, runs: 0, skipped: 0, lastMs: 0, totalMs: 0, maxMs: 0, lastFrame: -1, lastPosition: null, pending: 0, staleResults: 0, errors: 0, lastError: '' });
      return snapshot();
    }
  };
}
