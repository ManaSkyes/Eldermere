// src/data/water.js — rivers and lakes carved into the terrain, worked out once for everything that needs the
// ground's real shape: the ground builder (src/game/ground.js), roads following the ground (src/data/paths.js),
// tiles settling on it (the creator), foundations and road walls reaching down to it.
//
//   carvedTerrain(d) → { h (heights on the terrain's 2 m grid, carved), bodies: [{ cells, has, level }] } or null
//   carvedFn(d)      → (x, z) => the carved ground's height there (the plain terrain where there's no water)
//
// Painted water squares under a road or a piece don't count: the road or piece wins there (it crosses on its own
// level, a causeway or ford until bridges exist), so a road never drags a river's level up or splits its bed.
import { terrainOf, terrainHash, mapHash } from './terrain.js';
import { groundOf } from './ground.js';
import { pathsOf, samplePath, outerHalfOf, bridgesOf, roadsLive } from './paths.js';   // (bridges: the water runs on under them)
import { pieceFoot } from './dungeon.js';

const C = 10, R = 2;
const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const cache = { key: null, val: null };
export function carvedTerrain(d) {
  const t = terrainOf(d), g = groundOf(d); if (!t) return null;
  if (roadsLive() && cache.d === d && cache.val) return cache.val;                          // (live road editing in the creator: the ground as last carved)
  const th = terrainHash(t);
  const roads = pathsOf(d).filter(p => p.points.length >= 2);
  const key = th + '|' + (g?.water ? mapHash(g.water) + JSON.stringify(g.flows || []) : '') + '|' + (g?.water ? JSON.stringify(roads.map(p => [p.points, p.road, p.pave])) + Object.keys(d.cells).join(';') : '');
  if (cache.key === key && cache.d === d) return cache.val;
  const VX = t.nx, VZ = t.nz, NX = VX - 1, NZ = VZ - 1, h = Float32Array.from(t.h);
  let bodies = [];
  if (g?.water) {
    // squares a road or a piece covers: no water there
    const block = new Set();
    for (const p of roads) { const reach = outerHalfOf(p) + 0.5, brs = bridgesOf(d, p); for (const q of samplePath(p, 1)) if (!brs.some(b => q.s > b.s0 + 0.5 && q.s < b.s1 - 0.5)) for (let j = Math.floor((q.z - reach) / R); j <= Math.floor((q.z + reach) / R); j++) for (let i = Math.floor((q.x - reach) / R); i <= Math.floor((q.x + reach) / R); i++) if (Math.hypot((i + 0.5) * R - q.x, (j + 0.5) * R - q.z) < reach) block.add(i * 65536 + j); }
    for (const [k, p] of Object.entries(d.cells)) { const [x, y] = k.split(',').map(Number), [fx, fy] = pieceFoot(p), x0 = x * C + (p.ox || 0), z0 = y * C + (p.oz || 0); for (let j = Math.floor(z0 / R); j < Math.ceil((z0 + fy * C) / R); j++) for (let i = Math.floor(x0 / R); i < Math.ceil((x0 + fx * C) / R); i++) block.add(i * 65536 + j); }
    bodies = carveWater(g.water, h, NX, NZ, VX, VZ, (i, j) => block.has(i * 65536 + j), g.flows || []);
  }
  const val = { h, bodies, nx: VX, nz: VZ };
  cache.key = key; cache.d = d; cache.val = val; return val;
}
export function carvedFn(d) {
  const c = carvedTerrain(d); if (!c) return null;
  const { h, nx, nz } = c;
  return (x, z) => { const fx = Math.max(0, Math.min(nx - 1.0001, x / R)), fz = Math.max(0, Math.min(nz - 1.0001, z / R)), i = Math.floor(fx), j = Math.floor(fz), a = fx - i, b = fz - j;
    return (h[j * nx + i] * (1 - a) + h[j * nx + i + 1] * a) * (1 - b) + (h[(j + 1) * nx + i] * (1 - a) + h[(j + 1) * nx + i + 1] * a) * b; };
}

// Rivers and lakes: the painted water squares (2 m, the terrain's own grid), grouped into connected bodies. Each body
// sits at one level: auto ('a') is the lowest ground anywhere under it, so a long river is level end to end and
// carves its channel down through any higher ground; a number fixes the level. The bed goes deeper away from the
// banks (0.5 m at the edge, to 2.5 m); the banks slope down to the water over 6 m (ground lower than the water
// just beside it is raised to a lip, so the water never hangs over a hole). Changes TH in place.
function carveWater(water, TH, NX, NZ, VX, VZ, blocked, flows = []) {
  const TH0 = Float32Array.from(TH);                                                        // the ground before carving
  const cells = new Map(); for (const [k, v] of Object.entries(water)) { const [i, j] = k.split(',').map(Number); if (i >= 0 && j >= 0 && i < NX && j < NZ) cells.set(i * 65536 + j, v); }
  const seen = new Set(), bodies = [], cellH = (i, j) => (TH[j * VX + i] + TH[j * VX + i + 1] + TH[(j + 1) * VX + i] + TH[(j + 1) * VX + i + 1]) / 4;
  for (const [k0] of cells) {
    if (seen.has(k0)) continue;
    const list = [], stack = [k0]; seen.add(k0);
    while (stack.length) { const k = stack.pop(), i = Math.floor(k / 65536), j = k % 65536; list.push([i, j]); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const kk = (i + a) * 65536 + j + b; if (cells.has(kk) && !seen.has(kk)) { seen.add(kk); stack.push(kk); } } }
    const fixed = list.map(([i, j]) => cells.get(i * 65536 + j)).filter(v => typeof v === 'number');
    // auto: the water fills its hollow up to where it would spill: the lowest ground round its shore (the body's edge
    // squares). Where that's no higher than the lowest ground under it (flat ground, a channel) it's that lowest
    // ground, and the bed is carved down from it as before
    const low = Math.min(...list.map(([i, j]) => Math.min(TH[j * VX + i], TH[j * VX + i + 1], TH[(j + 1) * VX + i], TH[(j + 1) * VX + i + 1])));
    const inBody = new Set(list.map(([i, j]) => i * 65536 + j)), edge = list.filter(([i, j]) => i > 0 && j > 0 && i < NX - 1 && j < NZ - 1 && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !inBody.has((i + a) * 65536 + j + b)));   // (not at the map's edge: water painted off the map carries on beyond it)
    const spill = edge.length ? Math.min(...edge.map(([i, j]) => cellH(i, j))) - 0.15 : low;
    const level = fixed.length ? Math.min(...fixed) : Math.max(low, spill);
    // squares under a road or a piece belong to the body (it stays one body, at one level, either side of a road
    // across it) but hold no water and aren't carved: the road crosses on its own level
    const wet = list.filter(([i, j]) => !blocked(i, j));
    const B = { cells: wet, has: new Set(wet.map(([i, j]) => `${i},${j}`)), level: Math.round(level * 20) / 20, falls: [] };
    if (!fixed.length) riverProfile(B, list, flows, TH, VX, cells);
    bodies.push(B);
  }
  const cellL = (n, i, j) => bodies[n].levelAt ? bodies[n].levelAt((i + 0.5) * R, (j + 0.5) * R).lv : bodies[n].level;
  // distance (in squares) from each body square to the nearest bank, and from each grid point to the water
  const inW = new Map(); bodies.forEach((B, n) => { for (const [i, j] of B.cells) inW.set(i * 65536 + j, n); });
  const dist = new Map(); let front = [];
  for (const [k] of inW) { const i = Math.floor(k / 65536), j = k % 65536; if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !inW.has((i + a) * 65536 + j + b))) { dist.set(k, 1); front.push(k); } }
  for (let dd = 2; front.length; dd++) { const nx = []; for (const k of front) { const i = Math.floor(k / 65536), j = k % 65536; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const kk = (i + a) * 65536 + j + b; if (inW.has(kk) && !dist.has(kk)) { dist.set(kk, dd); nx.push(kk); } } } front = nx; }
  const bed = new Float32Array(VX * VZ).fill(Infinity), shore = new Float32Array(VX * VZ).fill(Infinity);   // shore: the level of the water a grid point touches
  for (const [k, n] of inW) {
    const i = Math.floor(k / 65536), j = k % 65536, L = cellL(n, i, j), b = L - Math.min(2.5, 0.5 + 0.6 * (dist.get(k) - 1));
    for (const [a, c] of [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]]) { const v = c * VX + a; bed[v] = Math.min(bed[v], b); shore[v] = Math.min(shore[v], L); }
  }
  // grid points on the water's edge sit just under the surface; inside, on the bed
  for (let v = 0; v < VX * VZ; v++) {
    if (bed[v] === Infinity) continue; const i = v % VX, j = Math.floor(v / VX);
    const edge = [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]].some(([a, b]) => a < 0 || b < 0 || a >= NX || b >= NZ || !inW.has(a * 65536 + b));
    TH[v] = edge ? Math.min(TH[v], shore[v] - 0.25) : Math.min(TH[v], bed[v]);
    if (edge) shore[v] = -Infinity;                                                        // (marks it as an edge point for the banks below)
  }
  // the lip of a fall: the bed rises to just under the surface over the last few metres, so the river runs shallow over
  // the edge (no deep open pool right up to the drop)
  for (const B of bodies) for (const f of B.falls || []) for (let j = Math.max(0, Math.floor((f.z - 14) / R)); j <= Math.min(VZ - 1, Math.ceil((f.z + 14) / R)); j++) for (let i = Math.max(0, Math.floor((f.x - 14) / R)); i <= Math.min(VX - 1, Math.ceil((f.x + 14) / R)); i++) {
    const v = j * VX + i, rx = i * R - f.x, rz = j * R - f.z, al = rx * f.dx + rz * f.dz, ac = Math.abs(rz * f.dx - rx * f.dz);
    if (al < -7 || al > 3 || ac > 12 || TH0[v] < f.top - 1.5 || TH[v] >= TH0[v]) continue;     // (on the plateau, carved)
    TH[v] = Math.max(TH[v], Math.min(TH0[v], f.top - 0.3 - Math.max(0, -al) * 0.15));
  }
  // banks: grid points within 6 m of the water slope down to it (and never dip below its surface)
  const edgePts = []; for (let v = 0; v < VX * VZ; v++) if (shore[v] === -Infinity) edgePts.push(v);
  const levelAt = new Map(); for (const [k, n] of inW) { const i = Math.floor(k / 65536), j = k % 65536; for (const [a, c] of [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]]) { const v = c * VX + a; const L = bodies[n].levelAt ? Math.round(bodies[n].levelAt(a * R, c * R).lv * 20) / 20 : bodies[n].level; levelAt.set(v, Math.min(levelAt.get(v) ?? Infinity, L)); } }   // (a river: the level right at that point, the same the surface uses)
  const RB = 3;                                                                              // 3 grid squares = 6 m
  const bankH = new Map();
  for (const v0 of edgePts) {
    const i0 = v0 % VX, j0 = Math.floor(v0 / VX), L = levelAt.get(v0);
    for (let b = -RB; b <= RB; b++) for (let a = -RB; a <= RB; a++) {
      const i = i0 + a, j = j0 + b; if (i < 0 || j < 0 || i >= VX || j >= VZ) continue; const v = j * VX + i; if (bed[v] !== Infinity) continue;
      const dm = Math.hypot(a, b) * 2; if (dm > RB * 2) continue;
      const cur = bankH.get(v); if (!cur || dm < cur.dm) bankH.set(v, { dm, L });
    }
  }
  for (const [v, { dm, L }] of bankH) { const h = TH[v], target = Math.min(Math.max(h, L + 0.12), L + 0.12 + 0.5 * dm), w = h < L + 0.12 && dm <= 4 ? 1 : smooth(1 - dm / (RB * 2)); TH[v] = h + (target - h) * w; }   // (ground lower than the water is lifted to the lip all the way out to 4 m)
  // round it off: a few blur passes over the bed and banks, so the shore follows a smooth curve rather than the 2 m
  // squares it was painted in. A point on a straight stretch of shore (two or more water squares round it) stays
  // under the water so a narrow stream never closes up; a sharp outside corner (one) is free to round over
  const region = []; for (let v = 0; v < VX * VZ; v++) if (bed[v] !== Infinity || bankH.has(v)) region.push(v);
  const wetN = v => { const i = v % VX, j = Math.floor(v / VX); let n = 0; for (const [a, b] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) if (inW.has(a * 65536 + b)) n++; return n; };
  const cap = new Float32Array(region.length);
  region.forEach((v, n) => { const w = wetN(v), L = levelAt.get(v); cap[n] = w === 4 ? TH[v] : w === 2 ? L - 0.1 : Infinity; /* (an inside corner, 3, is free too: a painted diagonal's zig-zag straightens out) */ });
  const floor = region.map(v => { const bk = bankH.get(v); const w = wetN(v); return w === 1 ? levelAt.get(v) + 0.1 : bk && bk.dm <= 4 && w === 0 ? bk.L + 0.14 : -Infinity; });   /* (clear of the ground builder's 6 cm sink) */   // (a rounded-off outside corner becomes shore)   // the lip stays above the water
  for (let pass = 0; pass < 4; pass++) {
    const nv = region.map(v => { const i = v % VX, j = Math.floor(v / VX); let sum = TH[v] * 4, wt = 4; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { if (!a && !b) continue; const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= VX || jj >= VZ) continue; const w = a && b ? 1 : 2; sum += TH[jj * VX + ii] * w; wt += w; } return sum / wt; });
    region.forEach((v, n) => { TH[v] = Math.max(Math.min(nv[n], cap[n]), floor[n]); });
  }
  return bodies;
}

// A river runs downhill: along each flow line through a body its surface follows the ground's lowest line
// downstream (never rising), in level pools; where it drops 1 m or more within one 2 m step it falls (a waterfall),
// and on a steady slope it runs as rapids (faster, white). Off the flow lines (a lake at the end, a wide bay) a
// square takes the level of the nearest point on a line. Sets B.levelAt(x, z) → { lv, rough } and B.falls.
export const FALL_DROP = 1.0, FALL_MIN = 2.0;   // a step that can start a fall; how far a fall must drop in all
function riverProfile(B, list, flows, TH, VX, cells) {
  const inBody = new Set(list.map(([i, j]) => i * 65536 + j)), lines = [];
  const NXr = VX - 1, NZr = TH.length / VX - 1, edges = list.filter(([i, j]) => i > 0 && j > 0 && i < NXr - 1 && j < NZr - 1 && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !inBody.has((i + a) * 65536 + j + b)));   // (the body's banks, not the map's edge)
  for (const fl of flows) {
    if (!(fl.points?.length >= 2)) continue;
    const S = samplePath({ points: fl.points }, R).filter(q => inBody.has(Math.floor(q.x / R) * 65536 + Math.floor(q.z / R)));
    if (S.length < 2) continue;
    // the ground under each sample: the lowest corner of the body squares round it
    const g = S.map(q => { const ci = Math.floor(q.x / R), cj = Math.floor(q.z / R); let m = Infinity;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const i = ci + a, j = cj + b; if (!inBody.has(i * 65536 + j)) continue; m = Math.min(m, TH[j * VX + i], TH[j * VX + i + 1], TH[(j + 1) * VX + i], TH[(j + 1) * VX + i + 1]); }
      // ...or, where the river runs in a channel, up to the lowest of its banks close by (it fills its bed to the
      // top, as a pond does, rather than lying at the bottom)
      let bank = Infinity; for (const [i, j] of edges) { if (Math.abs((i + 0.5) * R - q.x) > 10 || Math.abs((j + 0.5) * R - q.z) > 10) continue; bank = Math.min(bank, (TH[j * VX + i] + TH[j * VX + i + 1] + TH[(j + 1) * VX + i] + TH[(j + 1) * VX + i + 1]) / 4); }
      return Number.isFinite(bank) ? Math.max(m, bank - 0.15) : m; });
    const run = []; for (let n = 0; n < g.length; n++) run.push(Math.min(n ? run[n - 1] : Infinity, g[n]));
    // falls: steps of 1 m or more in a row (within 4 m) make one candidate; it's a real fall only if it drops at least
    // FALL_MIN in all and has water backing it (the river runs level for 4 m before the lip). Anything else is
    // smoothed into a slope: rapids, not a curtain
    const steps = []; for (let n = 1; n < run.length; n++) if (run[n - 1] - run[n] >= FALL_DROP) { const g2 = steps[steps.length - 1]; if (g2 && n - g2.end <= 2) g2.end = n; else steps.push({ start: n, end: n }); }
    const realF = steps.filter(g2 => { const top = run[g2.start - 1], back = run[Math.max(0, g2.start - 3)]; return top - run[g2.end] >= FALL_MIN && back - top < 0.4 && g2.start >= 2; });
    const seg = [0]; for (const g2 of realF) seg.push(g2.start); seg.push(run.length);
    // smooth within each stretch between falls (it stays downhill: an average of a falling line falls), keeping
    // the falls sharp; never above the plain running minimum
    const lv = run.slice();
    for (let k = 0; k + 1 < seg.length; k++) for (let n = seg[k]; n < seg[k + 1]; n++) { let sm = 0, c = 0; for (let m = Math.max(seg[k], n - 3); m <= Math.min(seg[k + 1] - 1, n + 3); m++) { sm += run[m]; c++; } lv[n] = Math.min(run[n], sm / c); }
    for (const g2 of realF) for (let n = g2.start; n <= g2.end; n++) lv[n] = run[g2.end];          // (the whole fall drops at its lip)
    for (let n = 0; n < lv.length; n++) lv[n] = Math.round(lv[n] * 20) / 20;
    const rough = lv.map((_, n) => { const a = lv[Math.max(0, n - 1)], b = lv[Math.min(lv.length - 1, n + 1)]; return Math.min(1, Math.max(0, ((a - b) / (2 * R) - 0.02) / 0.1)); });
    for (const g2 of realF) {
      const n = g2.start, a = S[n - 1], b = S[n], len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      B.falls.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, dx: (b.x - a.x) / len, dz: (b.z - a.z) / len, top: lv[n - 1], bot: lv[n], n, line: lines.length });
      for (let m = n; m < lv.length && Math.hypot(S[m].x - b.x, S[m].z - b.z) < 5; m++) rough[m] = Math.max(rough[m], 1 - Math.hypot(S[m].x - b.x, S[m].z - b.z) / 5);   // churned white below the fall
      for (let m = n; m < lv.length && m <= g2.end + 1; m++) rough[m] = 1;
    }
    if (lv[0] - lv[lv.length - 1] < 0.05 && !B.falls.length) continue;                  // (dead level: nothing to do)
    lines.push({ S, lv, rough });
  }
  if (!lines.length) return;
  B.level = Math.min(...lines.map(L => L.lv[L.lv.length - 1]), B.level);
  B.levelAt = (x, z) => {
    let best = null, bd = Infinity;
    for (const L of lines) for (let n = 0; n < L.S.length; n++) { const q = L.S[n], dd = (q.x - x) ** 2 + (q.z - z) ** 2; if (dd < bd) { bd = dd; best = [L, n]; } }
    const [L, n] = best; return { lv: L.lv[n], rough: L.rough[n] };
  };
}
