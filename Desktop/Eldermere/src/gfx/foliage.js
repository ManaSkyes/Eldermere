import { createTrees } from './trees.js';
// src/gfx/foliage.js — every plant in a map, drawn, and the wind that moves them.
// The ground builder (and the town pieces) list plants as
//   { k: kind, x, y, z, s: scale, r: turn, v: variant, c: tint [r, g, b] }  (world coordinates)
// Kinds: tree (three broadleaf shapes), pine, dead, bush, grass (a patch: dozens of blades over a square metre),
// tallgrass (a tall patch with seed heads), flower, reed, cattail, lily, seagrass and pondweed (under water).
// Models are made here once (vertex-coloured, low-poly but detailed: branching trunks, crowns of leaf clusters with
// leaf cards round them for a soft outline); trees and bushes have a simpler far model they switch to with distance.
// Grass and small plants are drawn as one instanced mesh per kind, variant and level of detail for the whole map, refilled
// from the 32 m chunks in view whenever the camera moves or turns.
//
// Each kind has levels of detail (grass: the full patch to 22 m, fewer wider blades to 50, a few to 95; trees: the
// detailed model to 70 m, a simple one to 300), crossfading at each step and fading in at the edge of its range (trees
// and bushes dissolve in with a dither; grass and small plants grow up out of the ground). Chunks out of view or range
// aren't drawn.
//
// Wind (open for the weather to drive: createFoliage(...).wind = { dirX, dirZ, strength 0..1+, gust 0..1, speed m/s }):
// plants move in clusters, as in Where Winds Meet: a patch of dozens of blades bends as one, each patch a moment apart
// from its neighbours. Far off, the wind is a formula in the shader (no CPU work at all); near the player, a spring
// grid adds lag, overshoot, and plants pushed aside as you walk through them (see the wind section below).

export const PLANT_KINDS = ['tree', 'pine', 'dead', 'bush', 'grass', 'tallgrass', 'flower', 'reed', 'cattail', 'lily', 'seagrass', 'pondweed'];
const SWAY = { tree: 0.035, pine: 0.022, dead: 0.015, bush: 0.07, grass: 0.5, tallgrass: 0.32, flower: 0.4, reed: 0.18, cattail: 0.16, lily: 0, seagrass: 0.22, pondweed: 0.25 };
const CHUNK = 32;
const BIG = { tree: 1, pine: 1, dead: 1, bush: 1 };                              // trees, pines, dead trees and bushes: src/gfx/trees.js
const NT = 64, TILE = 192;                                                      // the gust noise: 64 texels, repeating every 192 m
const NG = 64, NEAR_FADE = [22, 30], RES = 1.5, PUSH = 4, TICK = 1 / 30;        // the spring grid round the player: 64 × 1 m cells (residual ±1.5, push ±4)

const rng = seed => () => { seed = (seed * 16807 + 11) % 2147483647; return seed / 2147483647; };

function models(THREE) {
  // tri(a, b, c, colour (or three, one per corner), centre?): with a centre, the corners' normals point out from it
  // (leaves lit like a soft ball, not faceted); 'up', mostly up (grass: lit evenly, as a lawn is); without, the face's
  // own. Corners that end up identical are shared (an indexed geometry: fewer vertices to move in the wind)
  const make = fn => { const P = [], C = [], O = [], tri = (a, b, c, col, ctr) => { P.push(...a, ...b, ...c); const cs = Array.isArray(col[0]) ? col : [col, col, col]; for (let i = 0; i < 3; i++) C.push(...cs[i]); O.push(ctr || null); }; fn(tri);
    const g0 = new THREE.BufferGeometry(); g0.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g0.computeVertexNormals();
    const Nn = g0.attributes.normal.array; O.forEach((ctr, t) => { if (!ctr) return; for (let v = 0; v < 3; v++) { const q = (t * 3 + v) * 3;
      const d = ctr === 'up' ? [0, 1, 0] : [P[q] - ctr[0], (P[q + 1] - ctr[1]) * 1.3 + 0.25 * Math.hypot(P[q] - ctr[0], P[q + 2] - ctr[2]), P[q + 2] - ctr[2]], l = Math.hypot(...d) || 1; Nn[q] = d[0] / l; Nn[q + 1] = d[1] / l; Nn[q + 2] = d[2] / l; } });
    const key = new Map(), VP = [], VC = [], VN = [], I = [];
    for (let v = 0; v < P.length / 3; v++) { const q = v * 3, k = [P[q], P[q + 1], P[q + 2], C[q], C[q + 1], C[q + 2], Nn[q], Nn[q + 1], Nn[q + 2]].map(x => Math.round(x * 1e4)).join(); let n = key.get(k);
      if (n === undefined) { n = VP.length / 3; key.set(k, n); VP.push(P[q], P[q + 1], P[q + 2]); VC.push(C[q], C[q + 1], C[q + 2]); VN.push(Nn[q], Nn[q + 1], Nn[q + 2]); } I.push(n); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(VP, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(VC, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(VN, 3)); g.setIndex(I);
    return g; };
  const hex = h => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
  const jit = (col, r, k = 0.12) => col.map(v => Math.max(0, Math.min(1, v * (1 - k + r() * 2 * k))));
  const mul = (col, k) => col.map(v => Math.max(0, Math.min(1, v * k)));
  // an icosphere, once subdivided (80 faces): leaf clusters, bush lobes
  const SPH = (() => { const t = (1 + Math.sqrt(5)) / 2; let V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(v => { const l = Math.hypot(...v); return v.map(c => c / l); });
    let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    const mid = new Map(), m = (a, b) => { const k = a < b ? a + '_' + b : b + '_' + a; if (mid.has(k)) return mid.get(k); const p = V[a].map((c, i) => (c + V[b][i]) / 2), l = Math.hypot(...p); V.push(p.map(c => c / l)); mid.set(k, V.length - 1); return V.length - 1; };
    F = F.flatMap(([a, b, c]) => { const ab = m(a, b), bc = m(b, c), ca = m(c, a); return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]]; });
    return { V, F }; })();
  const ICO = { V: SPH.V.slice(0, 12), F: [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]] };
  // a lumpy ball, shaded darker underneath and lighter on top (as if the light came through the leaves)
  const blob = (tri, S, cx, cy, cz, rx, ry, rz, col, r, lit = 0.22, lump = 0.32, soft = true) => { const K = S.V.map(() => 1 - lump / 2 + r() * lump);
    const P = S.V.map((v, n) => [cx + v[0] * rx * K[n], cy + v[1] * ry * K[n], cz + v[2] * rz * K[n]]);
    const ctr = soft ? [cx, cy, cz] : null; for (const f of S.F) { const up = (S.V[f[0]][1] + S.V[f[1]][1] + S.V[f[2]][1]) / 3; tri(P[f[0]], P[f[1]], P[f[2]], jit(mul(col, 0.78 + (up + 1) * 0.5 * (0.22 + lit)), r, 0.06), ctr); } };
  // leaf cards round a cluster: little double-sided quads tilted every way, so its outline is soft and leafy
  const cards = (tri, cx, cy, cz, rx, ry, rz, n, size, col, r) => { for (let q = 0; q < n; q++) {
    const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u), d = 0.85 + r() * 0.3, p = [cx + Math.cos(a) * s * rx * d, cy + u * ry * d, cz + Math.sin(a) * s * rz * d];
    const t1 = [r() - 0.5, r() - 0.5, r() - 0.5], t2 = [r() - 0.5, r() - 0.5, r() - 0.5], L1 = Math.hypot(...t1) || 1, L2 = Math.hypot(...t2) || 1, sz = size * (0.7 + r() * 0.6);
    const A = p.map((c, i) => c + t1[i] / L1 * sz), B = p.map((c, i) => c + t2[i] / L2 * sz * 0.6), C2 = p.map((c, i) => c - t1[i] / L1 * sz * 0.4), cc = jit(mul(col, 0.85 + (u + 1) * 0.18), r, 0.1);
    tri(p, A, B, cc, [cx, cy, cz]); tri(p, C2, A, mul(cc, 0.92), [cx, cy, cz]); } };
  // a tapered limb from a (radius r0) to b (r1): trunks, roots, branches, stems
  const limb = (tri, a, b, r0, r1, col, n = 6) => {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d) || 1, u = d.map(v => v / l), t0 = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const s = [u[1] * t0[2] - u[2] * t0[1], u[2] * t0[0] - u[0] * t0[2], u[0] * t0[1] - u[1] * t0[0]], sl = Math.hypot(...s); s.forEach((v, i) => s[i] = v / sl); const w = [u[1] * s[2] - u[2] * s[1], u[2] * s[0] - u[0] * s[2], u[0] * s[1] - u[1] * s[0]];
    const ring = (c, rr) => Array.from({ length: n }, (_, k) => { const ang = k / n * Math.PI * 2, cs = Math.cos(ang), sn = Math.sin(ang); return [c[0] + (s[0] * cs + w[0] * sn) * rr, c[1] + (s[1] * cs + w[1] * sn) * rr, c[2] + (s[2] * cs + w[2] * sn) * rr]; });
    const A = ring(a, r0), B = ring(b, r1); for (let k = 0; k < n; k++) { const m2 = (k + 1) % n, sh = 0.8 + 0.3 * Math.cos(k / n * Math.PI * 2 - 0.8); tri(A[k], B[k], B[m2], mul(col, sh)); tri(A[k], B[m2], A[m2], mul(col, sh)); }
  };
  const lerp3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  // a blade: a bent strip of three triangles from the ground to height h, leaning toward (dx, dz)
  const blade = (tri, x, z, h, w, dx, dz, colB, colT, y0 = 0) => {
    const nx = -dz || 1, nz = dx, ln = Math.hypot(nx, nz) || 1, ux = nx / ln, uz = nz / ln, m = [x + dx * h * 0.22, y0 + h * 0.55, z + dz * h * 0.22], top = [x + dx * h * 0.65, y0 + h, z + dz * h * 0.65];
    const a = [x - ux * w, y0, z - uz * w], b = [x + ux * w, y0, z + uz * w], c = [m[0] - ux * w * 0.6, m[1], m[2] - uz * w * 0.6], e = [m[0] + ux * w * 0.6, m[1], m[2] + uz * w * 0.6];
    const cm = lerp3(colB, colT, 0.55); tri(a, b, e, [colB, colB, cm], 'up'); tri(a, e, c, [colB, cm, cm], 'up'); tri(c, e, top, [cm, cm, colT], 'up');
  };
  const M = {}, F = {};                                                       // detailed models, and far ones
  const BARK = hex('#5d4332'), BARK_D = hex('#47342a'), BIRCH = hex('#d8d2c4'), LEAF = ['#3f7a2e', '#4d8a34', '#36692a', '#5a9440', '#6a9a3a'].map(hex), PINE = ['#2b5236', '#335e3c', '#264a30'].map(hex);
  const GRASS_B = hex('#36601f'), GRASS_T = hex('#8cb24c');
  // ---- grass: a patch of blades over about a square metre (one instance: dozens of blades, one wind cluster) ----
  const patch = (tri, r, n, rad, h0, h1, w, colB, colT) => { for (let k = 0; k < n; k++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad, la = r() * Math.PI * 2, lean = 0.15 + r() * 0.45; blade(tri, Math.cos(a) * d, Math.sin(a) * d, h0 + r() * (h1 - h0), w * (0.8 + r() * 0.4), Math.cos(la) * lean, Math.sin(la) * lean, jit(colB, r, 0.1), jit(colT, r, 0.14)); } };
  // (grass has three levels of detail: the full patch up close, then fewer, wider blades further off)
  M.grass = [1, 2, 3].map(sd => make(tri => patch(tri, rng(sd * 17), 34, 0.55, 0.22, 0.48, 0.035, GRASS_B, GRASS_T)));
  const G1 = [1, 2, 3].map(sd => make(tri => patch(tri, rng(sd * 17), 13, 0.55, 0.26, 0.46, 0.06, GRASS_B, GRASS_T))), G2 = [1, 2, 3].map(sd => make(tri => patch(tri, rng(sd * 17), 6, 0.5, 0.3, 0.45, 0.09, GRASS_B, GRASS_T)));
  const T1 = [1, 2].map(sd => make(tri => patch(tri, rng(sd * 29), 11, 0.5, 0.6, 1.0, 0.065, GRASS_B, hex('#a8b860')))), T2 = [1, 2].map(sd => make(tri => patch(tri, rng(sd * 29), 5, 0.45, 0.65, 0.95, 0.1, GRASS_B, hex('#a8b860'))));
  M.tallgrass = [1, 2].map(sd => make(tri => { const r = rng(sd * 29); patch(tri, r, 26, 0.5, 0.55, 1.05, 0.04, GRASS_B, hex('#a8b860'));
    for (let k = 0; k < 5; k++) { const a = r() * Math.PI * 2, d = r() * 0.4, x = Math.cos(a) * d, z = Math.sin(a) * d, h = 0.9 + r() * 0.35; limb(tri, [x, 0, z], [x + 0.05, h, z], 0.008, 0.006, hex('#8a9a50'), 3); blob(tri, ICO, x + 0.05, h + 0.06, z, 0.025, 0.08, 0.025, hex('#c8b878'), r, 0, 0.2); } }));
  const PETALS = ['#e04a6a', '#f0c040', '#f2f2f2', '#c060d0', '#5a8ae0', '#e86a3a'].map(hex);
  M.flower = PETALS.map((pc, sd) => make(tri => { const r = rng(sd * 41 + 3); patch(tri, r, 10, 0.25, 0.15, 0.3, 0.03, GRASS_B, GRASS_T);
    for (let k = 0; k < 4; k++) { const a = r() * Math.PI * 2, d = r() * 0.18, x = Math.cos(a) * d, z = Math.sin(a) * d, h = 0.28 + r() * 0.2; limb(tri, [x, 0, z], [x, h, z], 0.01, 0.008, GRASS_B, 3);
      for (let lf = 0; lf < 2; lf++) { const la = r() * 6.28, y = h * (0.3 + r() * 0.3); tri([x, y, z], [x + Math.cos(la) * 0.08, y + 0.04, z + Math.sin(la) * 0.08], [x + Math.cos(la + 0.4) * 0.05, y + 0.06, z + Math.sin(la + 0.4) * 0.05], GRASS_B); }
      for (let p = 0; p < 6; p++) { const pa = p / 6 * Math.PI * 2, c = [x, h, z], e1 = [x + Math.cos(pa - 0.3) * 0.045, h + 0.012, z + Math.sin(pa - 0.3) * 0.045], e2 = [x + Math.cos(pa) * 0.08, h + 0.025, z + Math.sin(pa) * 0.08], e3 = [x + Math.cos(pa + 0.3) * 0.045, h + 0.012, z + Math.sin(pa + 0.3) * 0.045]; tri(c, e1, e2, pc); tri(c, e2, e3, mul(pc, 0.88)); }
      blob(tri, ICO, x, h + 0.015, z, 0.018, 0.014, 0.018, hex('#f0d040'), r, 0, 0); } }));
  const REED_B = hex('#4a6a2a'), REED_T = hex('#9aa860');
  M.reed = [1, 2].map(sd => make(tri => { const r = rng(sd * 61); for (let k = 0; k < 16; k++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.35; blade(tri, Math.cos(a) * d, Math.sin(a) * d, 1.3 + r() * 0.8, 0.03, (r() - 0.5) * 0.25, (r() - 0.5) * 0.25, REED_B, jit(REED_T, r, 0.15)); } }));
  M.cattail = [1].map(sd => make(tri => { const r = rng(sd * 71); for (let k = 0; k < 10; k++) { const a = r() * Math.PI * 2, d = r() * 0.25; blade(tri, Math.cos(a) * d, Math.sin(a) * d, 1.2 + r() * 0.5, 0.03, (r() - 0.5) * 0.2, (r() - 0.5) * 0.2, REED_B, REED_T); }
    for (let k = 0; k < 4; k++) { const a = r() * Math.PI * 2, d = r() * 0.18, x = Math.cos(a) * d, z = Math.sin(a) * d, h = 1.5 + r() * 0.4; limb(tri, [x, 0, z], [x, h + 0.35, z], 0.015, 0.01, REED_B, 3); limb(tri, [x, h, z], [x, h + 0.3, z], 0.045, 0.04, hex('#6a4428'), 7); } }));
  M.lily = [1, 2, 3].map(sd => make(tri => { const r = rng(sd * 83), col = hex('#3f7a34'); for (let p = 0; p < 3; p++) { const cx = (r() - 0.5) * 0.7, cz = (r() - 0.5) * 0.7, rad = 0.16 + r() * 0.12, notch = r() * Math.PI * 2, n = 12;
      for (let q = 0; q < n; q++) { const a0 = notch + 0.35 + q / n * (Math.PI * 2 - 0.5), a1 = notch + 0.35 + (q + 1) / n * (Math.PI * 2 - 0.5); tri([cx, 0.02, cz], [cx + Math.cos(a1) * rad, 0.02, cz + Math.sin(a1) * rad], [cx + Math.cos(a0) * rad, 0.02, cz + Math.sin(a0) * rad], jit(col, r, 0.1)); } }
    if (sd === 2) for (let p = 0; p < 8; p++) { const pa = p / 8 * Math.PI * 2; tri([0, 0.05, 0], [Math.cos(pa) * 0.1, 0.11, Math.sin(pa) * 0.1], [Math.cos(pa + 0.4) * 0.1, 0.11, Math.sin(pa + 0.4) * 0.1], hex('#f4d8e4')); }
  }));
  // ---- under water: ribbons of eelgrass, and bushy pondweed ----
  M.seagrass = [1, 2].map(sd => make(tri => { const r = rng(sd * 211), B = hex('#2a4a22'), T = hex('#5a7a34'); for (let k = 0; k < 14; k++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.45, x = Math.cos(a) * d, z = Math.sin(a) * d, h = 0.6 + r() * 0.9, w = 0.04, la = r() * 6.28;
      let px = x, pz = z, py = 0; for (let s = 0; s < 4; s++) { const nx = px + Math.cos(la + s) * 0.06, nz = pz + Math.sin(la + s) * 0.06, ny = py + h / 4, ux = -Math.sin(la), uz = Math.cos(la), c0 = lerp3(B, T, s / 4), c1 = lerp3(B, T, (s + 1) / 4);
        tri([px - ux * w, py, pz - uz * w], [px + ux * w, py, pz + uz * w], [nx + ux * w * 0.9, ny, nz + uz * w * 0.9], c0); tri([px - ux * w, py, pz - uz * w], [nx + ux * w * 0.9, ny, nz + uz * w * 0.9], [nx - ux * w * 0.9, ny, nz - uz * w * 0.9], c1); px = nx; pz = nz; py = ny; } } }));
  M.pondweed = [1].map(sd => make(tri => { const r = rng(sd * 223), col = hex('#3a5a2a'); for (let k = 0; k < 6; k++) { const a = r() * Math.PI * 2, d = r() * 0.3, x = Math.cos(a) * d, z = Math.sin(a) * d, h = 0.4 + r() * 0.5; limb(tri, [x, 0, z], [x + (r() - 0.5) * 0.2, h, z + (r() - 0.5) * 0.2], 0.012, 0.008, col, 3); cards(tri, x, h * 0.6, z, 0.18, h * 0.45, 0.18, 12, 0.07, mul(col, 1.2), r); } }));
  // levels of detail per kind: [model per variant, out to this distance (m)]; the last one's distance is the kind's range
  const L = { grass: [[M.grass, 22], [G1, 50], [G2, 95]], tallgrass: [[M.tallgrass, 25], [T1, 55], [T2, 100]], flower: [[M.flower, 80]], reed: [[M.reed, 90]], cattail: [[M.cattail, 90]], lily: [[M.lily, 100]], seagrass: [[M.seagrass, 70]], pondweed: [[M.pondweed, 70]] };
  return L;
}

// ---- the wind ----
// The far wind is a formula the shader works out from a small repeating noise texture rolling along the wind (gust
// strength in red, sideways sway in green): nothing on the CPU per frame but a few numbers. Near the player a real
// spring grid (64 × 1 m cells, out to about 30 m, 30 updates a second, scrolling with the player) adds what a formula can't: the lag and
// overshoot of each cell chasing the gusts, and plants pushed aside by the player (and anything in pushers), springing
// back when it's gone. The shader blends the grid in toward the player, so the two meet without a seam.
function gustNoise() {
  const h = (i, j, n) => { const s = Math.sin(i * 127.1 + j * 311.7 + n * 74.7) * 43758.5453; return s - Math.floor(s); };
  const chan = (P, n) => { const L = NT / P, out = new Float32Array(NT * NT); for (let y = 0; y < NT; y++) for (let x = 0; x < NT; x++) {
    const fx = x / P, fy = y / P, i = Math.floor(fx), j = Math.floor(fy), a = fx - i, b = fy - j, sa = a * a * (3 - 2 * a), sb = b * b * (3 - 2 * b), H = (u, v) => h(((u % L) + L) % L, ((v % L) + L) % L, n);
    out[y * NT + x] = (H(i, j) * (1 - sa) + H(i + 1, j) * sa) * (1 - sb) + (H(i, j + 1) * (1 - sa) + H(i + 1, j + 1) * sa) * sb; } return out; };
  const R = chan(8, 1), G = chan(16, 2), data = new Uint8Array(NT * NT * 4);
  for (let k = 0; k < NT * NT; k++) { data[k * 4] = Math.round(R[k] * 255); data[k * 4 + 1] = Math.round(G[k] * 255); data[k * 4 + 3] = 255; }
  // the same lookup the GPU does (linear filtering, repeating): so the grid's springs chase exactly the shader's wind
  const at = (u, v) => { const x = u * NT - 0.5, y = v * NT - 0.5, i = Math.floor(x), j = Math.floor(y), a = x - i, b = y - j, w = q => ((q % NT) + NT) % NT, I0 = w(i), I1 = w(i + 1), J0 = w(j), J1 = w(j + 1), t = (c, q) => data[q * 4 + c] / 255;
    const s = c => (t(c, J0 * NT + I0) * (1 - a) + t(c, J0 * NT + I1) * a) * (1 - b) + (t(c, J1 * NT + I0) * (1 - a) + t(c, J1 * NT + I1) * a) * b; return [s(0), s(1)]; };
  return { data, at };
}

export function createFoliage(THREE, scene, plants) {
  const wind = { dirX: 0.8, dirZ: 0.55, strength: 0.45, gust: 0.6, speed: 5 };            // the weather can change these any time
  const pushers = [];                                                                       // more things that push plants aside: { x, z, r } (world)
  if (!plants?.length) return { update() {}, bake() {}, cull() {}, wind, pushers };
  const L = models(THREE), GN = gustNoise();
  const noiseTex = new THREE.DataTexture(GN.data, NT, NT, THREE.RGBAFormat); noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping; noiseTex.magFilter = noiseTex.minFilter = THREE.LinearFilter; noiseTex.needsUpdate = true;
  const gridData = new Uint8Array(NG * NG * 4).fill(128), gridTex = new THREE.DataTexture(gridData, NG, NG, THREE.RGBAFormat); gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping; gridTex.magFilter = gridTex.minFilter = THREE.LinearFilter; gridTex.needsUpdate = true;
  const uniforms = { uTime: { value: 0 }, uNoise: { value: noiseTex }, uWind: { value: new THREE.Vector4() }, uScroll: { value: new THREE.Vector2() }, uNear: { value: gridTex }, uNearAt: { value: new THREE.Vector4(1e6, 1e6, NEAR_FADE[0], NEAR_FADE[1]) }, uEye: { value: new THREE.Vector2(1e6, 1e6) } };
  const inject = dither => sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      uniform float uTime; uniform sampler2D uNoise, uNear; uniform vec4 uWind, uNearAt; uniform vec2 uScroll, uEye; attribute vec4 aP; varying vec2 vFade;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec3 c0 = instanceMatrix[0].xyz, c1 = instanceMatrix[1].xyz, c2 = instanceMatrix[2].xyz; vec2 ip = instanceMatrix[3].xz; float hgt = max(0.0, position.y);
          // fading in and out with distance (aP.z, aP.w: this level of detail's near and far edge)
          float d = distance(ip, uEye), Fo = max(3.0, aP.w * 0.1), Fi = max(3.0, aP.z * 0.1);
          vFade = vec2(clamp((aP.w - d) / Fo, 0.0, 1.0), aP.z <= 0.0 ? 1.0 : clamp((d - aP.z + Fi) / Fi, 0.0, 1.0));
          ${dither ? '' : 'float grow = vFade.x * vFade.y; transformed.y *= grow; transformed.xz *= 0.5 + 0.5 * grow;'}
          // the wind formula: the gust noise rolling along the wind, read a touch upwind by this plant's own amount
          vec2 dir = uWind.xy; vec4 nz = texture2D(uNoise, (ip - dir * aP.y * 0.9 - uScroll) / ${TILE.toFixed(1)});
          float f = uWind.z * (0.3 + 0.7 * pow(nz.r, 1.5) * (0.5 + uWind.w));
          vec2 bend = dir * f + vec2(-dir.y, dir.x) * (nz.g - 0.5) * uWind.z * 0.35;
          // near the player: the spring grid (lag and overshoot in rg; plants pushed aside in ba, the small ones only)
          float wn = 1.0 - smoothstep(uNearAt.z, uNearAt.w, distance(ip, uNearAt.xy));
          if (wn > 0.0) { vec2 wp = (instanceMatrix * vec4(position, 1.0)).xz; vec4 g = texture2D(uNear, wp / ${NG.toFixed(1)}) * 2.0 - 1.0;
            bend += g.xy * ${RES.toFixed(2)} * wn; if (aP.x > 0.1) bend += g.zw * ${PUSH.toFixed(2)} * wn; }
          float flut = sin(uTime * (5.0 + aP.y * 3.0) + aP.y * 40.0 + position.x * 3.0) * 0.08 * (0.3 + length(bend));
          vec3 off = vec3(bend.x + flut * bend.y, 0.0, bend.y - flut * bend.x) * aP.x * hgt * hgt;
          float ol = length(off.xz), cap = hgt * 0.9; if (ol > cap) off.xz *= cap / ol;
          off.y = -length(off.xz) * 0.45 * min(1.0, length(off.xz) / max(0.1, hgt));                       // bending over lowers the tip
          // into the model's own frame (the instance turns and scales it), so it bends along the wind in the world
          float isc = 1.0 / max(0.04, dot(c0, c0)); transformed += vec3(dot(c0, off), dot(c1, off), dot(c2, off)) * isc; }`);
    if (dither) sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vFade;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        { float hd = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); if (hd >= vFade.x || hd < 1.0 - vFade.y) discard; }`);
  };
    const matSmall = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }); matSmall.onBeforeCompile = inject(false);
  // ---- the instanced meshes: one per kind, variant and level of detail for the whole map (about 30 draw calls) ----
  // Each kind's plants are sorted by 32 m chunk; whenever the camera moves or turns, the chunks in view and in range of
  // a level are copied into that level's buffer (each plant then fades by its own distance in the shader).
  const trees = createTrees(THREE, scene, plants.filter(p => BIG[p.k]), { uniforms, TILE });
  const byKV = new Map();
  for (const p of plants) { if (!L[p.k] || BIG[p.k]) continue; const v = Math.abs(p.v || 0) % L[p.k][0][0].length, key = p.k + v; (byKV.get(key) || byKV.set(key, { k: p.k, v, list: [] }).get(key)).list.push(p); }
  const sets = [];
  for (const { k, v, list } of byKV.values()) {
    const gx = p => Math.floor(p.x / CHUNK), gz = p => Math.floor(p.z / CHUNK), ck = p => gx(p) + ',' + gz(p); list.sort((a, b) => gx(a) - gx(b) || gz(a) - gz(b));
    const n = list.length, MAT = new Float32Array(n * 16), COL = new Float32Array(n * 3), PR = new Float32Array(n * 4), chunks = [];
    list.forEach((p, i) => { const s2 = p.s || 1, c = Math.cos(p.r || 0) * s2, sn = Math.sin(p.r || 0) * s2; MAT.set([c, 0, -sn, 0, 0, s2, 0, 0, sn, 0, c, 0, p.x, p.y, p.z, 1], i * 16); COL.set(p.c || [1, 1, 1], i * 3);
      const h = Math.sin(p.x * 12.9898 + p.z * 78.233) * 43758.5453; PR.set([SWAY[k], h - Math.floor(h), 0, 0], i * 4);
      const key = ck(p), last = chunks[chunks.length - 1];
      if (!last || last.key !== key) chunks.push({ key, a: i, b: i + 1, x0: p.x, x1: p.x, z0: p.z, z1: p.z, y0: p.y, y1: p.y, box: new THREE.Box3() });
      else { last.b = i + 1; last.x0 = Math.min(last.x0, p.x); last.x1 = Math.max(last.x1, p.x); last.z0 = Math.min(last.z0, p.z); last.z1 = Math.max(last.z1, p.z); last.y0 = Math.min(last.y0, p.y); last.y1 = Math.max(last.y1, p.y); } });
    for (const c of chunks) c.box.min.set(c.x0 - 1.5, c.y0 - 0.5, c.z0 - 1.5), c.box.max.set(c.x1 + 1.5, c.y1 + 2, c.z1 + 1.5);
    const chunkLookup = new Map(chunks.map(c => [c.key, c]));
    const lods = []; let lo = 0;
    for (const [geos, hi] of L[k]) {
      const geo = geos[v % geos.length].clone(), aP = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aP', aP);
      const im = new THREE.InstancedMesh(geo, matSmall, n); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
      im.count = 0; im.frustumCulled = false; im.castShadow = false; im.receiveShadow = true; im.userData.noCover = true; scene.add(im);
      lods.push({ im, aP, lo, hi, from: lo - Math.max(3, lo * 0.1), activeChunkKeys: null }); lo = hi;
    }
    sets.push({ k, n, MAT, COL, PR, chunks, chunkLookup, lods });
  }
  const fr = new THREE.Frustum(), pm = new THREE.Matrix4(), wide = new THREE.PerspectiveCamera(), lastCam = { x: 1e9, y: 0, z: 0, q: new THREE.Quaternion(), fov: 0 };
  // F7 policy is passed in by the play screen. The three small-foliage LOD buffers
  // are independently scheduled; a missing initial buffer is always populated immediately.
  let lodZonePolicy = null, lodRenderFrame = 0;
  const refill = (camera, eye) => {
    lodRenderFrame++;
    camera.updateMatrixWorld(); wide.copy(camera); wide.fov = Math.min(170, camera.fov * 1.35); wide.updateProjectionMatrix(); pm.multiplyMatrices(wide.projectionMatrix, camera.matrixWorldInverse); fr.setFromProjectionMatrix(pm);   // (a third wider than the screen: turning needs no refill for a while)
    for (const S of sets) for (let lodIndex = 0; lodIndex < S.lods.length; lodIndex++) {
      const Lv = S.lods[lodIndex];
      const zoneId = lodIndex + 1;
      const zone = lodZonePolicy?.zones?.find(z => z.id === zoneId);
      const zoneInterval = Math.max(1, Math.floor(zone?.interval || 1));
      const zoneRadius = Math.max(1, Number(zone?.radius) || Lv.hi);
      if (zone?.enabled === false) {
        if (Lv.im.count !== 0 || Lv.activeChunkKeys !== null) { Lv.im.count = 0; Lv.activeChunkKeys = null; }
        continue;
      }
      if (Lv.activeChunkKeys !== null && lodRenderFrame % zoneInterval !== 0) continue;
      const effectiveHi = zoneRadius;
      const effectiveFrom = Math.min(Lv.from, Math.max(0, zoneRadius - Math.max(3, zoneRadius * 0.1)));
      const visibleChunks = [];
      const reach = effectiveHi + CHUNK * 1.5, gx0 = Math.floor((eye.x - reach) / CHUNK), gx1 = Math.floor((eye.x + reach) / CHUNK), gz0 = Math.floor((eye.z - reach) / CHUNK), gz1 = Math.floor((eye.z + reach) / CHUNK);
      for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
        const c = S.chunkLookup.get(gx + ',' + gz); if (!c) continue;
        const ex = Math.max(c.x0 - eye.x, 0, eye.x - c.x1), ez = Math.max(c.z0 - eye.z, 0, eye.z - c.z1); if (ex * ex + ez * ez > (effectiveHi + 1) * (effectiveHi + 1)) continue;
        const fx = Math.max(Math.abs(eye.x - c.x0), Math.abs(eye.x - c.x1)), fz = Math.max(Math.abs(eye.z - c.z0), Math.abs(eye.z - c.z1)); if (fx * fx + fz * fz < (effectiveFrom - 1) * (effectiveFrom - 1)) continue;
        if (!fr.intersectsBox(c.box)) continue;
        visibleChunks.push(c);
      }
      const sameChunks = Lv.activeChunkKeys && Lv.activeChunkKeys.length === visibleChunks.length && visibleChunks.every((c, i) => Lv.activeChunkKeys[i] === c.key);
      if (sameChunks) continue; // camera moved/turned, but this LOD's source chunks are unchanged: reuse its GPU buffers.
      let cnt = 0; const M = Lv.im.instanceMatrix.array, Cc = Lv.im.instanceColor.array, A = Lv.aP.array;
      for (const c of visibleChunks) {
        const m = c.b - c.a; M.set(S.MAT.subarray(c.a * 16, c.b * 16), cnt * 16); Cc.set(S.COL.subarray(c.a * 3, c.b * 3), cnt * 3); A.set(S.PR.subarray(c.a * 4, c.b * 4), cnt * 4);
        for (let q = cnt; q < cnt + m; q++) { A[q * 4 + 2] = effectiveFrom; A[q * 4 + 3] = effectiveHi; }
        cnt += m;
      }
      Lv.activeChunkKeys = visibleChunks.map(c => c.key);
      Lv.im.count = cnt;
      if (cnt) {
        const attrs = [[Lv.im.instanceMatrix, cnt * 16], [Lv.im.instanceColor, cnt * 3], [Lv.aP, cnt * 4]];
        for (const [attr, length] of attrs) { if (attr.clearUpdateRanges) attr.clearUpdateRanges(); if (attr.addUpdateRange) attr.addUpdateRange(0, length); attr.needsUpdate = true; }
      }
    }
  };
  // ---- the spring grid round the player ----
  const N2 = NG * NG, bx = new Float32Array(N2), bz = new Float32Array(N2), vx = new Float32Array(N2), vz = new Float32Array(N2), px = new Float32Array(N2), pz = new Float32Array(N2), qx = new Float32Array(N2), qz = new Float32Array(N2);
  const own = new Float64Array(N2).fill(NaN), scroll = [0, 0];
  const D = GN.data, wr = q => q & (NT - 1), GC = new Uint8ClampedArray(gridData.buffer);   // (clamped: writes round and clip to 0..255)
  const tick = (dt, cx, cz, W, dx, dz) => {
    const pi = Math.floor(cx) - NG / 2, pj = Math.floor(cz) - NG / 2, k = 9, damp = 3.2, kp = 30, dp = 7, st = W.strength, gk = 0.5 + W.gust;
    const push = [{ x: cx, z: cz, r: 1.3 }, ...pushers].filter(P => Math.abs(P.x - cx) < NG / 2 && Math.abs(P.z - cz) < NG / 2);
    for (let j = 0; j < NG; j++) { const cj = pj + ((((j - pj) % NG) + NG) % NG), wz = cj + 0.5, ty = (wz - scroll[1]) / TILE * NT - 0.5, j0 = Math.floor(ty), b = ty - j0, J0 = wr(j0) * NT, J1 = wr(j0 + 1) * NT;
      for (let i = 0; i < NG; i++) {
      const ci = pi + ((((i - pi) % NG) + NG) % NG), n = j * NG + i, id = ci * 100003 + cj, wx = ci + 0.5;
      // the wind here: the same gust lookup the shader does (bilinear, repeating)
      const tx0 = (wx - scroll[0]) / TILE * NT - 0.5, i0 = Math.floor(tx0), a = tx0 - i0, I0 = wr(i0), I1 = wr(i0 + 1);
      const g = ((D[(J0 + I0) * 4] * (1 - a) + D[(J0 + I1) * 4] * a) * (1 - b) + (D[(J1 + I0) * 4] * (1 - a) + D[(J1 + I1) * 4] * a) * b) / 255;
      const sw = ((D[(J0 + I0) * 4 + 1] * (1 - a) + D[(J0 + I1) * 4 + 1] * a) * (1 - b) + (D[(J1 + I0) * 4 + 1] * (1 - a) + D[(J1 + I1) * 4 + 1] * a) * b) / 255;
      const f = st * (0.3 + 0.7 * g * Math.sqrt(g) * gk), s2 = (sw - 0.5) * st * 0.35, tx = dx * f - dz * s2, tz = dz * f + dx * s2;
      if (own[n] !== id) { own[n] = id; bx[n] = tx; bz[n] = tz; vx[n] = vz[n] = px[n] = pz[n] = qx[n] = qz[n] = 0; }     // a cell come into the grid: start it at the wind
      vx[n] += ((tx - bx[n]) * k - vx[n] * damp) * dt; vz[n] += ((tz - bz[n]) * k - vz[n] * damp) * dt; bx[n] += vx[n] * dt; bz[n] += vz[n] * dt;
      let gx = 0, gz = 0; for (let q = 0; q < push.length; q++) { const P = push[q]; const ex = wx - P.x, ez = wz - P.z, dd = Math.hypot(ex, ez); if (dd < P.r && dd > 1e-3) { const m = (1 - dd / P.r) * 3.2 / dd; gx += ex * m; gz += ez * m; } }
      qx[n] += ((gx - px[n]) * kp - qx[n] * dp) * dt; qz[n] += ((gz - pz[n]) * kp - qz[n] * dp) * dt; px[n] += qx[n] * dt; pz[n] += qz[n] * dt;   // pushed aside, and springing back
      GC[n * 4] = 128 + (bx[n] - tx) * (127 / RES); GC[n * 4 + 1] = 128 + (bz[n] - tz) * (127 / RES); GC[n * 4 + 2] = 128 + px[n] * (127 / PUSH); GC[n * 4 + 3] = 128 + pz[n] * (127 / PUSH);
    } }
    gridTex.needsUpdate = true;
  };
  let last = null, acc = 0;
  return {
    wind, pushers, trees,
    get workerMode() { return trees.workerMode || 'main'; },
    get workerCount() { return trees.workerCount || 2; },
    get workerState() { return trees.workerState || { status: 'no tree instances', jobs: 0, lastMs: 0, queueMs: 0, workerMs: 0, dispatchMs: 0, applyMs: 0, workerCount: 2, chunkSize: 1024, error: '' }; },
    setWorkerMode(mode) { trees.setWorkerMode?.(mode); },
    setWorkerCount(count) { trees.setWorkerCount?.(count); },
    // Expose the tree system's optional traversal counters to the F8 report.
    get diagnostics() { return trees.diagnostics; },
    resetDiagnostics() { trees.resetDiagnostics?.(); },
    bake(renderer) { trees.bake(renderer); },                                                       // (once, when the map's ready: the trees' impostor pictures)
    // each frame, just before drawing: the trees to their levels, and the small plants' buffers refilled when the
    // camera has moved or turned enough (or the F8 panel hid them)
    setLodZonePolicy(policy) { lodZonePolicy = policy || null; trees.setLodZonePolicy?.(lodZonePolicy); for (const S of sets) for (const Lv of S.lods) Lv.activeChunkKeys = null; this.dirty = true; lastCam.x = 1e9; },
    cull(camera) {
      trees.hidden = !!(this.off || this.hideBig); trees.cull(camera);
      const hs = !!(this.off || this.hideSmall), eye = this.eye || camera.position, c = camera.position;
      if (hs) { for (const S of sets) for (const Lv of S.lods) { Lv.im.count = 0; Lv.activeChunkKeys = null; } lastCam.x = 1e9; return; }
      const scheduledRefresh = !!lodZonePolicy?.zones?.some(z => z.enabled !== false && (lodRenderFrame + 1) % Math.max(1, Math.floor(z.interval || 1)) === 0);
      if (!this.dirty && !scheduledRefresh && Math.hypot(c.x - lastCam.x, c.y - lastCam.y, c.z - lastCam.z) < 0.5 && Math.abs(camera.quaternion.dot(lastCam.q)) > 0.9976 && camera.fov === lastCam.fov) return;
      this.dirty = false; lastCam.x = c.x; lastCam.y = c.y; lastCam.z = c.z; lastCam.q.copy(camera.quaternion); lastCam.fov = camera.fov;
      refill(camera, eye);
    },
    update(t, player) {
      const dt = last === null ? 0 : Math.min(0.25, Math.max(0, t - last)); last = t; uniforms.uTime.value = t;
      const Lw = Math.hypot(wind.dirX, wind.dirZ) || 1, dx = wind.dirX / Lw, dz = wind.dirZ / Lw, sp = wind.speed ?? 4;
      scroll[0] += dx * sp * dt; scroll[1] += dz * sp * dt; scroll[0] %= TILE * 64; scroll[1] %= TILE * 64;                     // (the gusts roll on; changing their speed doesn't jump)
      uniforms.uWind.value.set(dx, dz, wind.strength, wind.gust); uniforms.uScroll.value.set(scroll[0], scroll[1]);
      if (!player) return;
      uniforms.uEye.value.set(player.x, player.z); uniforms.uNearAt.value.x = player.x; uniforms.uNearAt.value.y = player.z; this.eye = player;
      acc += dt; let n = 0; while (acc >= TICK && n < 2) { tick(TICK, player.x, player.z, wind, dx, dz); acc -= TICK; n++; } if (acc > TICK) acc = 0;
    },
  };
}
