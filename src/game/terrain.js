// src/game/terrain.js — the map's terrain (src/data/terrain.js) as a surface to see and walk on.
//
//   buildTerrain(d, origin, coverAt, lo) → { surface (for testGrounds: positions, normals, tex 10), shapes (hidden
//                                            collision boxes on a 1 m grid) } or null
// The surface is the heightmap's grid of quads (2 m), drawn SINK below its true height so pieces and roads
// standing at the same height cover it cleanly. Quads under a piece are left out. Its edge at the map's border
// drops in a skirt of earth down below the lowest layer. The shader paints it (texture 10): grass with dirt
// patches, turning to rock where it's steep.
import { terrainOf, terrainAt } from '../data/terrain.js';

const C = 10, SINK = 0.06, GRID = 1;

export function buildTerrain(d, origin, coverAt, lo = 0) {
  const t = terrainOf(d); if (!t) return null;
  const P = [], N = [], shapes = [], bottom = lo * C - 3, R = t.res;
  const H = (i, j) => t.h[j * t.nx + i] - SINK;
  // is the ground here under a piece? (any piece whose floor is at or above the terrain there)
  const under = new Map(), covered = (cx, cy, hy) => {
    const k = cx * 4096 + cy; let v = under.get(k);
    if (v === undefined) { v = []; for (let l = lo; l < lo + 12; l++) { const c = coverAt(d, cx, cy, l); if (c && c.base === l) v.push(l * C + (c.piece.elev || 0)); } under.set(k, v); }
    return v.some(fy => fy >= hy - 4);                                         // (a piece more than 4 m under the ground is a cellar: the ground stays over it)
  };
  const vert = (x, y, z) => P.push(origin.x + x, origin.y + y, origin.z + z);
  const nrm = (i, j) => {                                                    // the normal from the neighbouring samples
    const hx = H(Math.min(t.nx - 1, i + 1), j) - H(Math.max(0, i - 1), j), hz = H(i, Math.min(t.nz - 1, j + 1)) - H(i, Math.max(0, j - 1));
    const sx = (Math.min(t.nx - 1, i + 1) - Math.max(0, i - 1)) * R, sz = (Math.min(t.nz - 1, j + 1) - Math.max(0, j - 1)) * R;
    const nx = -hx / sx, nz = -hz / sz, l = Math.hypot(nx, 1, nz); return [nx / l, 1 / l, nz / l];
  };
  for (let j = 0; j < t.nz - 1; j++) for (let i = 0; i < t.nx - 1; i++) {
    const x0 = i * R, z0 = j * R, hc = (H(i, j) + H(i + 1, j) + H(i, j + 1) + H(i + 1, j + 1)) / 4;
    if (covered(Math.floor((x0 + R / 2) / C), Math.floor((z0 + R / 2) / C), hc)) continue;
    const q = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
    for (const k of [0, 2, 1, 0, 3, 2]) { const [a, b] = q[k]; vert(a * R, H(a, b), b * R); N.push(...nrm(a, b)); }
  }
  // the skirt round the map's edge
  const skirt = (a0, b0, a1, b1, h0, h1, nx, nz) => { for (const [x, y, z] of [[a0, h0, b0], [a1, h1, b1], [a1, bottom, b1], [a0, h0, b0], [a1, bottom, b1], [a0, bottom, b0]]) { vert(x, y, z); N.push(nx, 0, nz); } };
  for (let i = 0; i < t.nx - 1; i++) { skirt(i * R, 0, (i + 1) * R, 0, H(i, 0), H(i + 1, 0), 0, -1); skirt((i + 1) * R, (t.nz - 1) * R, i * R, (t.nz - 1) * R, H(i + 1, t.nz - 1), H(i, t.nz - 1), 0, 1); }
  for (let j = 0; j < t.nz - 1; j++) { skirt(0, (j + 1) * R, 0, j * R, H(0, j + 1), H(0, j), -1, 0); skirt((t.nx - 1) * R, j * R, (t.nx - 1) * R, (j + 1) * R, H(t.nx - 1, j), H(t.nx - 1, j + 1), 1, 0); }
  // collision: a 1 m grid of columns up to the surface, merged along x where the tops match
  const W = Math.round((t.nx - 1) * R / GRID), D = Math.round((t.nz - 1) * R / GRID);
  for (let j = 0; j < D; j++) {
    let run = null;
    const flush = () => { if (run) shapes.push({ type: 'box', hidden: true, surface: 'grass', terrain: true, min: [origin.x + run.i0 * GRID, origin.y + bottom, origin.z + j * GRID], max: [origin.x + run.i1 * GRID, origin.y + run.top, origin.z + (j + 1) * GRID] }); run = null; };
    for (let i = 0; i < W; i++) {
      const x = (i + 0.5) * GRID, z = (j + 0.5) * GRID, top = Math.round((terrainAt(t, x, z) - SINK) * 20) / 20;
      if (covered(Math.floor(x / C), Math.floor(z / C), top)) { flush(); continue; }
      if (run && Math.abs(run.top - top) < 0.001) run.i1 = i + 1; else { flush(); run = { i0: i, i1: i + 1, top }; }
    }
    flush();
  }
  return { surface: { positions: new Float32Array(P), normals: new Float32Array(N), tex: 10 }, shapes };
}
