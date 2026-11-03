// Lightweight main-thread process registry for the F2 scheduler monitor.
// Reports are ignored while the monitor is closed, so systems may call reportProcess every frame for free.
// Check monitorEnabled() before building anything expensive just to report it.
const processes = new Map();
let enabled = false;
export function setMonitorEnabled(on) { enabled = !!on; if (!enabled) processes.clear(); }
export function monitorEnabled() { return enabled; }
export function reportProcess(id, detail = {}) {
  if (!enabled) return;
  processes.set(id, { id, label: detail.label || id, kind: detail.kind || 'task',
    status: detail.status || 'idle', task: detail.task || '', queued: Math.max(0, detail.queued || 0),
    workerMs: Math.max(0, detail.workerMs || 0), updatedAt: performance.now() });
}
export function clearProcess(id) { processes.delete(id); }
export function clearProcessesByPrefix(prefix) {
  for (const id of processes.keys()) if (id.startsWith(prefix)) processes.delete(id);
}
export function processSnapshot() {
  const now = performance.now();
  return [...processes.values()].map(p => ({ ...p, ageMs: now - p.updatedAt }));
}
