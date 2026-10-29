// Lightweight main-thread process registry for the F2 scheduler monitor.
const processes = new Map();
export function reportProcess(id, detail = {}) {
  processes.set(id, { id, label: detail.label || id, kind: detail.kind || 'task',
    status: detail.status || 'idle', task: detail.task || '', queued: Math.max(0, detail.queued || 0),
    workerMs: Math.max(0, detail.workerMs || 0), updatedAt: performance.now() });
}
export function clearProcess(id) { processes.delete(id); }
export function processSnapshot() {
  const now = performance.now();
  return [...processes.values()].map(p => ({ ...p, ageMs: now - p.updatedAt }));
}
