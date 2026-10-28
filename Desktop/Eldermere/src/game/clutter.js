// src/game/clutter.js — clutter painted in the creator's Ground mode (Clutter tab): one density per 2 m square;
// what appears depends on where it lands.
//   in water, near the edge or in the shallows: pebbles and stones half under the surface, driftwood
//   in water, deep and away from the banks: big boulders standing out of the water (solid: you can climb on them);
//     the water foams round them and a running current breaks white past them
//   on land, by surface: rock and cliffs → scree; sand → pebbles and shells; gravel → pebbles; snow → pale rocks;
//     dirt and mud → stones and sticks; grass → stones, sticks, now and then a fallen log
// Rocks are low-poly lumps (a squashed, knobbly icosahedron) drawn through kit.tris; nothing is random from run
// to run (a hash of the square and the map's position).

const hash = (i, j, n) => { const s = Math.sin(i * 127.1 + j * 311.7 + n * 74.7) * 43758.5453; return s - Math.floor(s); };
// a unit icosahedron (12 corners, 20 faces)
const ICO = (() => { const t = (1 + Math.sqrt(5)) / 2, V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(v => { const l = Math.hypot(...v); return v.map(c => c / l); });
  const F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  return { V, F }; })();
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * k)))); return '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''); };

// a rock: radius r, squashed (sy), knobbly, turned; sits with its bottom sunk a little (bury) below y
export function rock(kit, x, y, z, r, seed, color = '#7d776e', { sy = 0.6, bury = 0.25, knob = 0.28 } = {}) {
  const a = hash(seed, 1, 2) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), sx = 0.85 + hash(seed, 3, 4) * 0.4, sz = 0.85 + hash(seed, 5, 6) * 0.4;
  const P = ICO.V.map((v, n) => { const k = 1 + (hash(seed, n, 7) - 0.5) * 2 * knob, px = v[0] * r * sx * k, pz = v[2] * r * sz * k, py = v[1] * r * sy * k; return [x + px * ca - pz * sa, y + py + r * sy * (1 - bury * 2), z + px * sa + pz * ca]; });
  const out = []; for (const f of ICO.F) out.push(P[f[0]], P[f[1]], P[f[2]]);
  kit.tris(out, shade(color, 0.85 + hash(seed, 8, 9) * 0.3), 6);   // (texture 6: the plain colour, no wall grime)
}
// a stick or log: a thin eight-sided prism lying along the ground at angle a
export function log(kit, x, y, z, len, rad, a, color = '#5a4630') {
  const dx = Math.cos(a) * len / 2, dz = Math.sin(a) * len / 2, nx = -Math.sin(a), nz = Math.cos(a), ring = (cx, cz) => Array.from({ length: 8 }, (_, n) => { const t = n / 8 * Math.PI * 2; return [cx + nx * Math.cos(t) * rad, y + rad + Math.sin(t) * rad, cz + nz * Math.cos(t) * rad]; });
  const A = ring(x - dx, z - dz), B = ring(x + dx, z + dz), out = [];
  for (let n = 0; n < 8; n++) { const m = (n + 1) % 8; out.push(A[n], A[m], B[m], A[n], B[m], B[n]); }
  for (let n = 1; n < 7; n++) { out.push(A[0], A[n], A[n + 1]); out.push(B[0], B[n + 1], B[n]); }
  kit.tris(out, color, 4);   // (wood grain)
}

// clutter in water: called per body by the ground builder. at(x, z) → { depth, shore } or null (no water there);
// returns the boulders (for the foam round them and the collision)
export function waterClutter(kit, dens, squares, at, level, seedBase) {
  const boulders = [], stones = [];
  for (const [ci, cj] of squares) {
    const D = dens(ci, cj); if (!D) continue;
    const n = Math.round(D * 0.7 + hash(ci, cj, 1) * 1.2);
    for (let q = 0; q < n; q++) {
      const x = (ci + hash(ci, cj, 10 + q)) * 2, z = (cj + hash(ci, cj, 30 + q)) * 2, w = at(x, z); if (!w) continue;
      const seed = seedBase + ci * 131 + cj * 17 + q, bed = level - w.depth;
      if (q === 0 && w.depth > 1.0 && w.shore > 2.5 && hash(ci, cj, 50) < 0.01 + D * 0.007) {   // (a few per stretch: one in 20 deep squares at density 6)     // a boulder out in the stream, standing out of the water
        const r = 0.7 + hash(ci, cj, 60 + q) * 1.1, top = level + 0.3 + hash(ci, cj, 70 + q) * 0.9, h = top - bed, sy = Math.max(0.6, h / (2 * r));
        rock(kit, x, bed, z, r, seed, '#8e897f', { sy, bury: 0.1, knob: 0.22 }); boulders.push({ x, z, r: r * 0.95, top, bed });
      } else if (w.depth < 0.7 || w.shore < 1.5) {                                          // the edges: stones half under, driftwood
        if (hash(ci, cj, 80 + q) < 0.06) log(kit, x, bed - 0.05, z, 1 + hash(ci, cj, 90 + q) * 1.8, 0.07 + hash(ci, cj, 95 + q) * 0.06, hash(ci, cj, 97 + q) * Math.PI, '#6b5a46');
        else { rock(kit, x, bed, z, 0.12 + hash(ci, cj, 100 + q) * 0.35, seed, '#a59e92', { sy: 0.5 }); if (q % 3 === 0) stones.push({ x, z }); }   // (stones in a current gurgle)
      } else if (hash(ci, cj, 110 + q) < 0.5) rock(kit, x, bed, z, 0.25 + hash(ci, cj, 120 + q) * 0.4, seed, '#8a857c', { sy: 0.55 });   // stones on the bed
    }
  }
  boulders.stones = stones; return boulders;
}
// clutter on land: kind is the splat's surface kind there (src/data/ground.js MAT_INDEX), cliff how cliff-like
export function landClutter(kit, dens, W, H, skip, groundY, kindAt, cliffAt, seedBase) {
  for (let cj = 0; cj < Math.ceil(H / 2); cj++) for (let ci = 0; ci < Math.ceil(W / 2); ci++) {
    const D = dens(ci, cj); if (!D) continue;
    const n = Math.round(D * 0.35 + hash(ci, cj, 2) * 0.9);   // (density 9: about four things per 2 m square)
    for (let q = 0; q < n; q++) {
      const x = (ci + hash(ci, cj, 10 + q)) * 2, z = (cj + hash(ci, cj, 30 + q)) * 2; if (x >= W || z >= H || skip(x, z)) continue;
      const y = groundY(x, z), kind = kindAt(x, z), cl = cliffAt(x, z), seed = seedBase + ci * 131 + cj * 17 + q, h1 = hash(ci, cj, 40 + q), h2 = hash(ci, cj, 50 + q);
      if (cl > 0.3 || kind === 3) { rock(kit, x, y, z, 0.15 + h1 * 0.45, seed, '#9a958c', { sy: 0.55, knob: 0.35 }); continue; }          // scree
      if (kind === 4) { if (h2 < 0.3) rock(kit, x, y, z, 0.06 + h1 * 0.05, seed, '#e8dcc8', { sy: 0.35, bury: 0.2 }); else rock(kit, x, y, z, 0.05 + h1 * 0.12, seed, '#b2a898', { sy: 0.5 }); continue; }   // sand: shells, pebbles
      if (kind === 5) { rock(kit, x, y, z, 0.05 + h1 * 0.1, seed, '#aaa498', { sy: 0.5 }); continue; }                                       // gravel: pebbles
      if (kind === 7) { rock(kit, x, y, z, 0.2 + h1 * 0.5, seed, '#c8ccd0', { sy: 0.55 }); continue; }                                        // snow: pale rocks
      if (h2 < (kind === 2 || kind === 6 ? 0.12 : 0.07)) { log(kit, x, y - 0.03, z, 0.5 + h1 * 1.2, 0.03 + h1 * 0.03, hash(ci, cj, 60 + q) * Math.PI, '#5e4a36'); continue; }   // sticks
      if (h2 > 0.985 && D >= 5) { log(kit, x, y - 0.1, z, 3 + h1 * 2.5, 0.22 + h1 * 0.12, hash(ci, cj, 60 + q) * Math.PI, '#4e3e2c'); continue; }   // a fallen log
      rock(kit, x, y, z, 0.1 + h1 * (h2 > 0.9 ? 0.7 : 0.25), seed, h2 > 0.6 ? '#8e927e' : '#a09a90', { sy: 0.55 });   // stones (some mossy)
    }
  }
}
