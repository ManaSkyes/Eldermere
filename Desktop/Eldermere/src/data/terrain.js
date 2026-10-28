// src/data/terrain.js — the ground's shape under and around a map: a heightmap (part 2 of the height system,
// after the pieces' own fine raising). Sculpted in the creator's Terrain mode (raise, lower, smooth, flatten),
// built in the game by src/game/ground.js (with the filler, as one surface), grassy, rocky where steep.
//
//   d.terrain = { res, h: [heights] }   res: metres between samples (2); h: (W+1) × (H+1) heights, row by row
//                                       (W = map width in metres / res), metres above layer 0's floor
// Pieces stand on their own foundations; the terrain is drawn a little under them and is left out where a
// piece covers it, so it never pokes through a floor unless it's sculpted higher than the floor.
export const TERRAIN_RES = 2, TERRAIN_MIN = -40, TERRAIN_MAX = 39.75;   // (down to four layers below the ground floor)
const C = 10;
export const terrainSize = d => [Math.round(d.w * C / TERRAIN_RES) + 1, Math.round(d.h * C / TERRAIN_RES) + 1];
// the terrain, sized to the map (a resized map keeps what overlaps); null if the map has none
// a checksum of the heights, for caches keyed on the ground's shape (worked out once per task: the creator asks for it
// many times while drawing one frame)
let thMemo = null;
export function terrainHash(t) {
  if (!t) return 0; if (thMemo && thMemo.t === t) return thMemo.v;
  const h = t.h; let v = h.length | 0; for (let i = 0; i < h.length; i++) v = (v * 31 + ((h[i] * 100) | 0)) | 0;
  thMemo = { t, v }; queueMicrotask(() => { thMemo = null; }); return v;
}
// the same for a map of painted squares (water, flows): its size and contents
let mhMemo = null;
export function mapHash(m) { if (!m) return 0; if (mhMemo && mhMemo.m === m) return mhMemo.v; let v = 0; for (const k in m) { const x = m[k]; v = (v * 31 + k.length * 7 + (typeof x === 'number' ? (x * 100) | 0 : typeof x === 'string' ? x.length * 13 + x.charCodeAt(0) : 1)) | 0; } mhMemo = { m, v }; queueMicrotask(() => { mhMemo = null; }); return v; }
export function terrainOf(d) {
  const t = d.terrain; if (!t || !t.h) return null;
  const [nx, nz] = terrainSize(d);
  if (t.nx !== nx || t.nz !== nz || t.h.length !== nx * nz) {
    const ox = t.nx || nx, oz = t.nz || Math.round(t.h.length / (t.nx || nx)), h = new Array(nx * nz).fill(0);
    for (let j = 0; j < Math.min(nz, oz); j++) for (let i = 0; i < Math.min(nx, ox); i++) h[j * nx + i] = t.h[j * ox + i] || 0;
    Object.assign(t, { res: TERRAIN_RES, nx, nz, h });
  }
  return t;
}
export function createTerrain(d, base = 0) { const [nx, nz] = terrainSize(d); d.terrain = { res: TERRAIN_RES, nx, nz, h: new Array(nx * nz).fill(base) }; return d.terrain; }
// height at a point (metres from the map's corner), bilinear between samples
export function terrainAt(t, x, z) {
  const fx = Math.max(0, Math.min(t.nx - 1.0001, x / t.res)), fz = Math.max(0, Math.min(t.nz - 1.0001, z / t.res)), i = Math.floor(fx), j = Math.floor(fz), a = fx - i, b = fz - j;
  const H = (ii, jj) => t.h[jj * t.nx + ii];
  return (H(i, j) * (1 - a) + H(i + 1, j) * a) * (1 - b) + (H(i, j + 1) * (1 - a) + H(i + 1, j + 1) * a) * b;
}
// one dab of a brush at (x, z), radius r (m), strength s (m per dab at the centre), smooth falloff to the edge.
//   raise / lower: up or down · smooth: toward the neighbours' average · flatten: toward `target`
// Returns true if anything changed.
// jump (optional): working on a layer above or below the ground floor, raise first lifts the ground straight to that
// layer's floor (lower: drops it straight to it), then carries on from there
export function sculpt(t, op, x, z, r, s, target = 0, jump = null) {
  const i0 = Math.max(0, Math.floor((x - r) / t.res)), i1 = Math.min(t.nx - 1, Math.ceil((x + r) / t.res));
  const j0 = Math.max(0, Math.floor((z - r) / t.res)), j1 = Math.min(t.nz - 1, Math.ceil((z + r) / t.res));
  const old = op === 'smooth' ? t.h.slice() : t.h; let changed = false;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const dd = Math.hypot(i * t.res - x, j * t.res - z) / r; if (dd >= 1) continue;
    const f = 0.5 + 0.5 * Math.cos(dd * Math.PI), k = j * t.nx + i, h = t.h[k]; let n = h;
    if (op === 'raise') n = jump != null && jump > 0 && h < jump - 0.01 && f > 0.15 ? jump : h + s * f;
    else if (op === 'lower') n = jump != null && jump < 0 && h > jump + 0.01 && f > 0.15 ? jump : h - s * f;
    else if (op === 'flatten') n = h + (target - h) * Math.min(1, f * s);
    else if (op === 'smooth') { let sum = 0, c = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= t.nx || jj >= t.nz) continue; sum += old[jj * t.nx + ii]; c++; } n = h + (sum / c - h) * Math.min(1, f * s); }
    n = Math.round(Math.max(TERRAIN_MIN, Math.min(TERRAIN_MAX, n)) * 100) / 100;
    if (n !== h) { t.h[k] = n; changed = true; }
  }
  return changed;
}
