// src/rpg/clothing.js — garments cut from the body's own surface, and procedural shoes.
//
// A garment is defined by a field over the neutral body: positive where it covers.
// Triangles are clipped exactly at the zero line, so edges are clean. Every garment
// vertex is stored as "a point between two body vertices", which keeps it attached to
// the body through morphs, and its skin weights let it animate with the skeleton.


export function boneShare(meta) {
  const names = meta.skeleton.map(b => b.name);
  return (i, prefixes) => {
    let s = 0;
    for (let k = 0; k < 4; k++) {
      const n = names[meta.skinIndex[i * 4 + k]];
      if (prefixes.some(p => n.startsWith(p))) s += meta.skinWeight[i * 4 + k] / 255;
    }
    return s;
  };
}

// Garments. Fields use the neutral base mesh, in decimeters (feet at y = -8.2, crown at 8.5).
// w(bones) is the share of the listed bones in a vertex's skin weights, e.g. w(['neck']).
// hang: a loose part that hangs from `from` down to `to` (neutral heights), widening by `flare`.
const ARMS = ['shoulder01', 'upperarm', 'lowerarm', 'wrist', 'finger', 'metacarpal'];
const BELOW_SHOULDER = ['upperarm02', 'lowerarm', 'wrist', 'finger', 'metacarpal'];   // upperarm01 reaches onto the chest
const HANDS = ['wrist', 'finger', 'metacarpal'];
const HEAD = ['neck', 'head', 'jaw', 'special', 'oris', 'levator', 'risorius', 'orbicularis', 'temporalis', 'oculi', 'tongue', 'eye'];
const HEAD_ONLY = HEAD.filter(b => b !== 'neck');
// A scoop neckline: dips in the middle (around the neck), deeper at the front than the back,
// and rises over the shoulders so sleeves join cleanly.
const neckline = (x, y, z, depth) => 6.7 - 1.0 * Math.exp(-Math.pow(x / 0.85, 2)) - depth * Math.max(0, Math.min(1, z / 1.1)) - y;
export const GARMENTS = {
  tank: {
    color: '#e4e1ea', offset: 0.05, smooth: 30, tent: 5,
    field(x, y, z, w) {
      const body = Math.min(y - 0.6, 4.7 - y, 0.3 - w(ARMS));                                  // hips to underarms
      const strap = Math.min(0.19 - Math.abs(Math.abs(x) - 0.92), y - 4.3, 6.5 - y, 0.35 - w(BELOW_SHOULDER));
      return Math.max(body, strap);
    },
  },
  shorts: {
    color: '#4a3f5c', offset: 0.05, smooth: 30, tent: 20,
    field(x, y, z, w) { return Math.min(y + 2.2, 1.45 - y, 0.3 - w(ARMS)); },
  },
  trousers: {
    color: '#4b4136', offset: 0.05, smooth: 30, tent: 20,
    field(x, y, z, w) { return Math.min(y + 7.0, 1.5 - y, 0.3 - w(ARMS)); },
  },
  tunic: {
    color: '#c9b690', offset: 0.06, smooth: 30, tent: 5,
    field(x, y, z, w) { return Math.min(y - 2.7, neckline(x, y, z, 0.35), 0.15 - w(HEAD), 0.5 - w(BELOW_SHOULDER)); },
    // loose part: from just under the chest to the hem. flare: extra width at the hem (dm);
    // ease: how far down (dm) it goes from following the body to hanging freely
    hang: { from: 3.0, to: -1.7, flare: 0.3, ease: 3.2 },
    springs: { stiffness: 0.16, drag: 0.4 },                 // loose part: how firmly it holds its shape, how quickly it settles
  },
  dress: {
    color: '#5b2f4c', offset: 0.05, smooth: 30, tent: 5,
    field(x, y, z, w) { return Math.min(y - 0.98, neckline(x, y, z, 0.6), 0.15 - w(HEAD), 0.35 - w(HANDS)); },
    hang: { from: 1.25, to: -7.4, flare: 1.6, ease: 1.5 },
    springs: { stiffness: 0.08, drag: 0.3 },
  },
  // ---- robes: full length, long sleeves, falling loose from the chest (heavier cloth than the dress) ----
  robe: {
    color: '#2f3a6b', offset: 0.06, smooth: 30, tent: 5,
    // a high closed collar, sleeves to the wrist
    field(x, y, z, w) { return Math.min(y - 2.7, neckline(x, y, z, 0.12) + 0.3, 0.15 - w(HEAD), 0.35 - w(HANDS)); },
    hang: { from: 3.0, to: -7.7, flare: 1.5, ease: 2.6 },
    springs: { stiffness: 0.1, drag: 0.34 },
  },
  vestments: {
    color: '#ddd6c6', offset: 0.06, smooth: 30, tent: 5,
    field(x, y, z, w) { return Math.min(y - 2.7, neckline(x, y, z, 0.3) + 0.1, 0.15 - w(HEAD), 0.35 - w(HANDS)); },
    hang: { from: 3.0, to: -7.6, flare: 1.9, ease: 2.2 },
    springs: { stiffness: 0.09, drag: 0.32 },
  },
  scholarRobe: {
    color: '#5c4733', offset: 0.06, smooth: 30, tent: 5,
    field(x, y, z, w) { return Math.min(y - 2.7, neckline(x, y, z, 0.4), 0.15 - w(HEAD), 0.35 - w(HANDS)); },
    hang: { from: 3.0, to: -7.0, flare: 1.1, ease: 2.8 },
    springs: { stiffness: 0.12, drag: 0.36 },
  },
  // ---- armor and accessories: thicker, stiffer shells (more smoothing bridges the body's small curves) ----
  // a focus bracelet: a band just above the left wrist (+x is the character's left)
  bracelet: {
    color: '#c9a64a', offset: 0.09, smooth: 15, tent: 6, material: { metal: 0.9, rough: 0.28 },
    field(x, y, z, w) { return Math.min(x, w(['lowerarm']) - 0.3, 0.3 - w(HANDS), y - 2.36, 2.62 - y); },
  },
  // material: { metal, rough } for the look. legs: sits around the legs (leaves room for loose cloth over them).
  jerkin: {
    color: '#6b4a32', offset: 0.12, smooth: 60, tent: 12, material: { metal: 0, rough: 0.7 },
    field(x, y, z, w) { return Math.min(y - 0.9, neckline(x, y, z, 0.3) + 0.15, 0.3 - w(ARMS), 0.15 - w(HEAD)); },
  },
  breastplate: {
    color: '#a4abb4', offset: 0.18, smooth: 90, tent: 15, material: { metal: 0.85, rough: 0.32 },
    field(x, y, z, w) { return Math.min(y - 0.8, neckline(x, y, z, 0.15) + 0.25, 0.3 - w(ARMS), 0.15 - w(HEAD)); },
  },
  pauldrons: {
    color: '#9aa1aa', offset: 0.17, smooth: 60, tent: 12, material: { metal: 0.85, rough: 0.35 },
    field(x, y, z, w) {
      const shoulder = Math.min(w(['shoulder01', 'upperarm01']) - 0.3, y - 4.75, Math.abs(x) - 1.05, 0.2 - w(HEAD));
      const bracer = Math.min(w(['lowerarm']) - 0.45, y - 2.4, 3.55 - y);
      return Math.max(shoulder, bracer);
    },
  },
  gloves: {
    color: '#4a3424', offset: 0.04, smooth: 10, tent: 5, material: { metal: 0, rough: 0.75 },
    field(x, y, z, w) { return Math.max(w(HANDS) - 0.35, Math.min(w(['lowerarm02']) - 0.5, 2.6 - y)); },
  },
  gauntlets: {
    color: '#959ca6', offset: 0.09, smooth: 25, tent: 8, material: { metal: 0.85, rough: 0.35 },
    field(x, y, z, w) { return Math.max(w(HANDS) - 0.35, Math.min(w(['lowerarm02']) - 0.4, 2.75 - y)); },
  },
  greaves: {
    color: '#a0a7b0', offset: 0.15, smooth: 60, tent: 12, material: { metal: 0.85, rough: 0.33 }, legs: true,
    field(x, y, z, w) { return Math.min(w(['lowerleg', 'upperleg02']) - 0.4, y + 6.75, -3.25 - y, 0.3 - w(['foot', 'toe'])); },
  },
  boots: {
    // a leather shaft from the ankle to below the knee; the soled shoe is worn with it
    color: '#3e2a1e', offset: 0.1, smooth: 40, tent: 10, material: { metal: 0, rough: 0.65 },
    field(x, y, z, w) { return Math.min(-4.7 - y, y + 7.05, w(['lowerleg', 'foot']) - 0.3); },
  },
  hood: {
    color: '#3f4a3a', offset: 0.1, smooth: 40, tent: 10, material: { metal: 0, rough: 0.9 },
    // head and neck, with an open window for the face
    field(x, y, z, w) { return Math.min(w(HEAD) - 0.3, y - 5.9, Math.max(0.5 - z, Math.abs(x) - 0.62, y - 7.95, 6.45 - y)); },
  },
  helmet: {
    color: '#a2a9b2', offset: 0.18, smooth: 60, tent: 12, material: { metal: 0.85, rough: 0.3 },
    // the cranium: down to the brow at the front, lower over the back of the head
    field(x, y, z, w) { return Math.min(w(HEAD_ONLY) - 0.3, y - 7.6 + 0.95 * Math.min(1, Math.max(0, (0.7 - z) / 1.0))); },
  },
  greathelm: {
    color: '#9aa1aa', offset: 0.22, smooth: 90, tent: 20, material: { metal: 0.85, rough: 0.3 },
    field(x, y, z, w) { return Math.min(w(HEAD_ONLY) - 0.3, y - 6.35); },
  },
};
// Outfits list garments inner to outer (kept for reference; the viewer now dresses from equipment.js).
export const OUTFITS = { basic: ['tank', 'shorts'], travel: ['trousers', 'tunic'], dress: ['dress'] };

export function makeGarment(meta, def) {
  const P0 = meta.positions, nb = meta.bodyVertexCount, share = boneShare(meta);
  const f = new Float32Array(nb);
  for (let i = 0; i < nb; i++) f[i] = def.field(P0[i * 3], P0[i * 3 + 1], P0[i * 3 + 2], bones => share(i, bones));
  const verts = [], key = new Map(), tris = [], hem = [];
  const vid = (a, b, t) => {
    if (t <= 0 || a === b) { b = a; t = 0; } else if (t >= 1) { a = b; t = 0; }
    if (a > b) { [a, b] = [b, a]; t = 1 - t; }
    const k = a === b ? a : a * 65536 + b;
    if (!key.has(k)) { key.set(k, verts.length); verts.push({ a, b, t }); }
    return key.get(k);
  };
  const T = meta.bodyTris;
  for (let n = 0; n < T.length; n += 3) {
    const tri = [T[n], T[n + 1], T[n + 2]];
    const inside = tri.map(i => f[i] > 0);
    if (!inside.some(Boolean)) continue;
    if (inside.every(Boolean)) { tris.push(...tri.map(i => vid(i, i, 0))); continue; }
    // clip the triangle against the field's zero line (Sutherland-Hodgman)
    const poly = [], cut = [];
    for (let e = 0; e < 3; e++) {
      const p = tri[e], q = tri[(e + 1) % 3];
      if (f[p] > 0) { poly.push(vid(p, p, 0)); cut.push(false); }
      if ((f[p] > 0) !== (f[q] > 0)) { poly.push(vid(p, q, f[p] / (f[p] - f[q]))); cut.push(true); }
    }
    for (let k = 1; k < poly.length - 1; k++) tris.push(poly[0], poly[k], poly[k + 1]);
    for (let k = 0; k < poly.length; k++) {
      const k2 = (k + 1) % poly.length;
      if (cut[k] && cut[k2]) hem.push([poly[k], poly[k2]]);
    }
  }
  // chains along each cut line, used to smooth the edge into a clean curve
  const chain = new Map();
  for (const [u, v] of hem) { (chain.get(u) || chain.set(u, []).get(u)).push(v); (chain.get(v) || chain.set(v, []).get(v)).push(u); }
  // hem: a strip from the garment's edge back down to the skin, so the fabric has thickness
  const inner = new Map();
  // where a loose part continues below the fitted part, the lower edge gets no hem strip
  // (it would cut through the loose fabric hanging underneath)
  const openBelow = def.hang ? (i => { const v = verts[i]; return P0[v.a * 3 + 1] + (P0[v.b * 3 + 1] - P0[v.a * 3 + 1]) * v.t < def.hang.from; }) : () => false;
  for (const [u, v] of hem) {
    if (openBelow(u) && openBelow(v)) continue;
    for (const g of [u, v]) if (!inner.has(g)) { inner.set(g, verts.length); verts.push({ ...verts[g], inner: true }); }
    tris.push(u, v, inner.get(v), u, inner.get(v), inner.get(u));
  }
  // body vertices the garment hangs from (draped together so fabric is smooth across them)
  const drapeSet = new Set();
  for (const v of verts) { drapeSet.add(v.a); drapeSet.add(v.b); }
  // grow a few rings past the edge, so smoothing near the hem has neighbors on both sides
  for (let ring = 0; ring < 3; ring++) {
    const add = [];
    for (let n = 0; n < T.length; n += 3) {
      const t3 = [T[n], T[n + 1], T[n + 2]];
      if (t3.some(i => drapeSet.has(i))) add.push(...t3);
    }
    add.forEach(i => drapeSet.add(i));
  }
  const drapeTris = [];
  for (let n = 0; n < T.length; n += 3) if (drapeSet.has(T[n]) && drapeSet.has(T[n + 1]) && drapeSet.has(T[n + 2])) drapeTris.push(T[n], T[n + 1], T[n + 2]);
  // skin weights: take them from the nearer of the two body vertices
  const skinIndex = new Uint16Array(verts.length * 4), skinWeight = new Float32Array(verts.length * 4);
  verts.forEach((v, i) => {
    const s = v.t < 0.5 ? v.a : v.b;
    for (let k = 0; k < 4; k++) { skinIndex[i * 4 + k] = meta.skinIndex[s * 4 + k]; skinWeight[i * 4 + k] = meta.skinWeight[s * 4 + k] / 255; }
  });
  return { def, verts, tris, skinIndex, skinWeight, adj: adjacency(drapeTris), chain, inner, positions: new Float32Array(verts.length * 3), D: new Float32Array(meta.vertexCount * 3),
    Ns: new Float32Array(meta.vertexCount * 3), hang: def.hang ? makeHang(meta, def) : null };
}

// Place a garment over a surface. P: the body (or the body plus inner layers), N: body normals.
// Garments are fitted inner to outer; see layerOver() for stacking them.
export function fitGarment(g, P, N) {
  smoothNormals(g, N);
  drape(g, P, g.Ns, N);
  const D = g.D, out = g.positions, Ns = g.Ns;
  g.verts.forEach((v, i) => {
    const a = v.a * 3, b = v.b * 3, t = v.t, src = v.inner ? P : D, lift = v.inner ? 0.004 : 0;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = src[a + c] + (src[b + c] - src[a + c]) * t + (Ns[a + c] + (Ns[b + c] - Ns[a + c]) * t) * lift;
  });
  // smooth each cut line along its length so hems read as clean curves
  for (let it = 0; it < 4; it++) {
    const tmp = new Map();
    for (const [u, nb] of g.chain) {
      if (nb.length !== 2) continue;
      for (const id of [u, g.inner.get(u)]) {
        if (id === undefined) continue;
        const a = id === u ? nb[0] : g.inner.get(nb[0]), b = id === u ? nb[1] : g.inner.get(nb[1]);
        if (a === undefined || b === undefined) continue;
        tmp.set(id, [0, 1, 2].map(c => 0.5 * out[id * 3 + c] + 0.25 * (out[a * 3 + c] + out[b * 3 + c])));
      }
    }
    for (const [id, p] of tmp) { out[id * 3] = p[0]; out[id * 3 + 1] = p[1]; out[id * 3 + 2] = p[2]; }
  }
  return out;
}

// Normals averaged over the neighborhood: fabric lifts along these, which lets it bridge
// deep curves (the seat, between the shoulder blades) instead of following every fold.
function smoothNormals(g, N) {
  const { verts, nbrs, index } = g.adj, n = verts.length, Ns = g.Ns;
  let cur = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const v = verts[i] * 3; cur[i * 3] = N[v]; cur[i * 3 + 1] = N[v + 1]; cur[i * 3 + 2] = N[v + 2]; }
  for (let it = 0; it < (g.def.normalSmooth || 12); it++) {
    const q = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      let x = cur[i * 3], y = cur[i * 3 + 1], z = cur[i * 3 + 2];
      for (const j of nbrs[i]) { const k = index.get(j) * 3; x += cur[k]; y += cur[k + 1]; z += cur[k + 2]; }
      const L = Math.hypot(x, y, z) || 1; q[i * 3] = x / L; q[i * 3 + 1] = y / L; q[i * 3 + 2] = z / L;
    }
    cur = q;
  }
  for (let i = 0; i < n; i++) { const v = verts[i] * 3; Ns[v] = cur[i * 3]; Ns[v + 1] = cur[i * 3 + 1]; Ns[v + 2] = cur[i * 3 + 2]; }
}

// After fitting a garment, raise the surface the next (outer) garment drapes over,
// so an outer layer always sits on top of an inner one.
export function layerOver(g, S) {
  for (const v of g.verts) if (v.t === 0 && !v.inner) {
    const i = v.a * 3; S[i] = g.D[i]; S[i + 1] = g.D[i + 1]; S[i + 2] = g.D[i + 2];
  }
}

// Fabric over skin. Every garment point stays on its own line straight out from the skin
// (no sliding), and only its height off the skin is computed:
//  1. smooth the heights so fabric bridges hollows (between the breasts, under the pecs, ...)
//  2. where smoothing would sink into a bump, lift a soft tent over it instead
//  3. add the fabric's thickness
function drape(g, P, N, Nbody) {
  const A = g.D, { verts, nbrs, index } = g.adj, n = verts.length;
  let h = new Float32Array(n);
  for (let it = 0; it < g.def.smooth; it++) {
    const q = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = verts[i] * 3, nb = nbrs[i];
      let x = 0, y = 0, z = 0;
      for (const j of nb) { const k = index.get(j), w = j * 3; x += P[w] + N[w] * h[k]; y += P[w + 1] + N[w + 1] * h[k]; z += P[w + 2] + N[w + 2] * h[k]; }
      const c = nb.length;
      q[i] = 0.5 * h[i] + 0.5 * ((x / c - P[v]) * N[v] + (y / c - P[v + 1]) * N[v + 1] + (z / c - P[v + 2]) * N[v + 2]);
    }
    h = q;
  }
  // soft tent over bumps: how far below the skin the smoothed fabric would be, spread outward
  let lift = new Float32Array(n);
  for (let i = 0; i < n; i++) lift[i] = Math.max(0, -h[i]);
  const base = lift.slice();
  for (let it = 0; it < (g.def.tent || 20); it++) {
    const q = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0; for (const j of nbrs[i]) s += lift[index.get(j)]; q[i] = Math.max(base[i], s / nbrs[i].length); }
    lift = q;
  }
  for (let i = 0; i < n; i++) {
    const v = verts[i] * 3;
    let d = Math.max(0, h[i] + lift[i]) + g.def.offset;
    // never closer to the skin than most of the fabric's thickness (measured along the true normal)
    const along = N[v] * Nbody[v] + N[v + 1] * Nbody[v + 1] + N[v + 2] * Nbody[v + 2];
    const gap = d * along, minGap = g.def.offset * 0.8;
    if (gap < minGap) d += (minGap - gap) / Math.max(0.25, along);
    A[v] = P[v] + N[v] * d; A[v + 1] = P[v + 1] + N[v + 1] * d; A[v + 2] = P[v + 2] + N[v + 2] * d;
  }
}

function adjacency(tris) {
  const m = new Map();
  const link = (a, b) => { if (!m.has(a)) m.set(a, new Set()); m.get(a).add(b); };
  for (let i = 0; i < tris.length; i += 3) {
    const a = tris[i], b = tris[i + 1], c = tris[i + 2];
    link(a, b); link(b, a); link(b, c); link(c, b); link(c, a); link(a, c);
  }
  const verts = [...m.keys()];
  return { verts, nbrs: verts.map(v => [...m.get(v)]), index: new Map(verts.map((v, i) => [v, i])) };
}
function smoothPositions(A, adj, iters, keepVolume = false) {
  const { verts, nbrs } = adj, tmp = new Float32Array(verts.length * 3);
  for (let it = 0; it < iters * (keepVolume ? 2 : 1); it++) {
    const f = keepVolume && it % 2 ? -0.53 : 0.5;
    for (let n = 0; n < verts.length; n++) {
      const v = verts[n] * 3, nb = nbrs[n];
      let x = 0, y = 0, z = 0;
      for (const j of nb) { x += A[j * 3]; y += A[j * 3 + 1]; z += A[j * 3 + 2]; }
      const k = nb.length;
      tmp[n * 3] = A[v] + f * (x / k - A[v]); tmp[n * 3 + 1] = A[v + 1] + f * (y / k - A[v + 1]); tmp[n * 3 + 2] = A[v + 2] + f * (z / k - A[v + 2]);
    }
    for (let n = 0; n < verts.length; n++) { const v = verts[n] * 3; A[v] = tmp[n * 3]; A[v + 1] = tmp[n * 3 + 1]; A[v + 2] = tmp[n * 3 + 2]; }
  }
}

// ---------------------------------------------------------------------------------
// Hanging parts: loose fabric (skirts, the lower part of a tunic). Each ring follows the
// outline of the body (plus inner layers) at its height, never narrowing on the way down,
// and flares out toward the hem. Skinned partly to the legs so it moves when walking.
// ---------------------------------------------------------------------------------
const HANG_RINGS = 34, HANG_SEG = 56;
export const HANG_SIZE = { rings: HANG_RINGS, seg: HANG_SEG };
function makeHang(meta, def) {
  const P0 = meta.positions, share = boneShare(meta), h = def.hang;
  const cand = [];
  for (let i = 0; i < meta.bodyVertexCount; i++) {
    const y = P0[i * 3 + 1];
    if (y < h.to - 0.6 || y > h.from + 0.6) continue;
    if (share(i, ['shoulder01', 'upperarm', 'lowerarm', 'wrist', 'finger', 'metacarpal']) > 0.2) continue;
    // the chest is left out: the loose part falls from under it, so its size never pushes the hem around
    if (share(i, ['breast']) > 0.1) continue;
    cand.push(i);
  }
  const names = meta.skeleton.map(b => b.name), bi = n => names.indexOf(n);
  const count = (HANG_RINGS + 1) * HANG_SEG, tris = [];
  for (let j = 0; j < HANG_RINGS; j++) for (let k = 0; k < HANG_SEG; k++) {
    const a = j * HANG_SEG + k, a1 = j * HANG_SEG + (k + 1) % HANG_SEG, b = a + HANG_SEG, b1 = a1 + HANG_SEG;
    tris.push(a, b, a1, a1, b, b1);
  }
  const skinIndex = new Uint16Array(count * 4), skinWeight = new Float32Array(count * 4);
  for (let j = 0; j <= HANG_RINGS; j++) for (let k = 0; k < HANG_SEG; k++) {
    const i = j * HANG_SEG + k, th = (k / HANG_SEG) * Math.PI * 2;
    const side = Math.sin(th);                                   // +1 on the left leg's side, -1 on the right
    // follow the legs more the further below the hips the fabric is (in decimeters, neutral body)
    const depth = (j / HANG_RINGS) * (h.from - h.to), u = Math.min(1, Math.max(0, depth - (h.ease || 1.5) * 0.5) / 1.6);
    const most = Math.min(0.92, 0.3 + 0.08 * (h.from - h.to));      // short hems follow the legs less
    const legs = most * u * u * (3 - 2 * u), wl = legs * (0.5 + 0.5 * side), wr = legs * (0.5 - 0.5 * side);
    // the body part above follows the spine bone at that height; lower down, the hips and legs
    const yN = h.from - depth, spine = yN > 2.2 ? 'spine03' : yN > 1.2 ? 'spine04' : 'spine05';
    skinIndex.set([bi('root'), bi('upperleg01.L'), bi('upperleg01.R'), bi(spine)], i * 4);
    skinWeight.set([(1 - legs) * 0.7, wl, wr, (1 - legs) * 0.3], i * 4);
  }
  return { cand, tris, skinIndex, skinWeight, positions: new Float32Array(count * 3), loose: new Float32Array(HANG_RINGS + 1), joints: heightJoints(meta) };
}

// Map a neutral height to the current body by interpolating between joints.
function heightJoints(meta) {
  const want = ['foot.L', 'lowerleg02.L', 'lowerleg01.L', 'upperleg02.L', 'upperleg01.L', 'root', 'spine04', 'spine02', 'neck01'];
  return want.map(n => meta.skeleton.find(b => b.name === n)).filter(Boolean).map(b => b.head);
}
function mapHeight(meta, joints, P, y) {
  const P0 = meta.positions, avg = (A, ids) => ids.reduce((s, i) => s + A[i * 3 + 1], 0) / ids.length;
  const pts = joints.map(ids => [avg(P0, ids), avg(P, ids)]).sort((a, b) => a[0] - b[0]);
  if (y <= pts[0][0]) return pts[0][1] + (y - pts[0][0]);
  for (let i = 0; i < pts.length - 1; i++) if (y <= pts[i + 1][0]) {
    const t = (y - pts[i][0]) / (pts[i + 1][0] - pts[i][0]); return pts[i][1] + t * (pts[i + 1][1] - pts[i][1]);
  }
  const l = pts[pts.length - 1]; return l[1] + (y - l[0]);
}

// Fit a hanging part over surface S (body plus inner layers), for body positions P.
export function fitHang(g, meta, S) {
  const H = g.hang, h = g.def.hang;
  const y0 = mapHeight(meta, H.joints, S, h.from), y1 = mapHeight(meta, H.joints, S, h.to);
  // center: the middle of the body at the top of the hang
  let cz = 0, cn = 0;
  for (const i of H.cand) { const y = S[i * 3 + 1]; if (Math.abs(y - y0) < 0.3) { cz += S[i * 3 + 2]; cn++; } }
  cz = cn ? cz / cn : 0;
  const R = new Float32Array((HANG_RINGS + 1) * HANG_SEG);
  const dy = (y0 - y1) / HANG_RINGS;
  for (const i of H.cand) {
    const x = S[i * 3], y = S[i * 3 + 1], z = S[i * 3 + 2] - cz;
    const j = Math.round((y0 - y) / dy);
    if (j < 0 || j > HANG_RINGS) continue;
    const k = ((Math.round(Math.atan2(x, z) / (Math.PI * 2) * HANG_SEG) % HANG_SEG) + HANG_SEG) % HANG_SEG;
    const r = Math.hypot(x, z);
    for (const jj of [j - 1, j, j + 1]) if (jj >= 0 && jj <= HANG_RINGS) R[jj * HANG_SEG + k] = Math.max(R[jj * HANG_SEG + k], r);
  }
  for (let j = 0; j <= HANG_RINGS; j++) {
    const row = R.subarray(j * HANG_SEG, (j + 1) * HANG_SEG);
    // fill gaps, then a soft circular smoothing that favors the outer edge
    for (let pass = 0; pass < 3; pass++) for (let k = 0; k < HANG_SEG; k++) if (!row[k]) row[k] = Math.max(row[(k + HANG_SEG - 1) % HANG_SEG], row[(k + 1) % HANG_SEG]);
    for (let pass = 0; pass < 4; pass++) {
      const c = row.slice();
      for (let k = 0; k < HANG_SEG; k++) row[k] = Math.max(c[k], (c[(k + HANG_SEG - 1) % HANG_SEG] + 2 * c[k] + c[(k + 1) % HANG_SEG]) / 4);
    }
  }
  const out = H.positions, off = g.def.offset + 0.06;
  // looseness down the length: 0 = sits on the body, 1 = hangs freely (games paint this as
  // the cloth's "max distance"). It eases in over `ease` decimeters below the top.
  const ease = h.ease || 1.5, span = h.from - h.to, loose = H.loose;
  for (let j = 0; j <= HANG_RINGS; j++) { const u = Math.min(1, (j / HANG_RINGS) * span / ease); loose[j] = u * u * (3 - 2 * u); }
  // the body's outline at each height (can narrow, e.g. at the waist) ...
  const E = R.slice();
  for (let j = 0; j <= HANG_RINGS; j++) for (let k = 0; k < HANG_SEG; k++) E[j * HANG_SEG + k] += 0.015 + off * loose[j];
  for (let pass = 0; pass < 3; pass++) {
    const c = E.slice();
    for (let j = 1; j < HANG_RINGS; j++) for (let k = 0; k < HANG_SEG; k++) { const i = j * HANG_SEG + k; E[i] = Math.max(c[i], (c[i - HANG_SEG] + 2 * c[i] + c[i + HANG_SEG]) / 4); }
  }
  // ... and the hanging shape, never narrower than the ring above, smoothed down the length
  const Hs = E.slice();
  for (let j = 1; j <= HANG_RINGS; j++) for (let k = 0; k < HANG_SEG; k++) { const i = j * HANG_SEG + k; Hs[i] = Math.max(Hs[i], Hs[i - HANG_SEG]); }
  for (let pass = 0; pass < 4; pass++) {
    const c = Hs.slice();
    for (let j = 1; j < HANG_RINGS; j++) for (let k = 0; k < HANG_SEG; k++) {
      const i = j * HANG_SEG + k; Hs[i] = Math.max(c[i - HANG_SEG], (c[i - HANG_SEG] + 2 * c[i] + c[i + HANG_SEG]) / 4);
    }
  }
  for (let j = 0; j <= HANG_RINGS; j++) {
    const t = j / HANG_RINGS, y = y0 - j * dy, l = loose[j], flare = h.flare * Math.pow(t, 1.4) * l;
    for (let k = 0; k < HANG_SEG; k++) {
      const i = j * HANG_SEG + k, r = E[i] * (1 - l) + Hs[i] * l + flare;
      const th = (k / HANG_SEG) * Math.PI * 2, n = i * 3;
      out[n] = Math.sin(th) * r; out[n + 1] = y; out[n + 2] = cz + Math.cos(th) * r;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------
// Shoes: a lofted shape sized from each foot every time the body changes.
// Cross-sections run heel to toe; each follows the foot's width and height there,
// with a sole underneath. Skinned rigidly to the foot bone.
// ---------------------------------------------------------------------------------
const SLICES = 22, RING = 28;
export function makeShoes(meta) {
  const P0 = meta.positions, share = boneShare(meta);
  const foot = { L: [], R: [] };
  for (let i = 0; i < meta.bodyVertexCount; i++) {
    if (P0[i * 3 + 1] > -6.9 || share(i, ['foot', 'toe']) < 0.4) continue;
    foot[P0[i * 3] > 0 ? 'L' : 'R'].push(i);
  }
  const names = meta.skeleton.map(b => b.name);
  const perShoe = (SLICES + 1) * RING + 2;
  const tris = [];
  for (let s = 0; s < 2; s++) {
    const o = s * perShoe;
    for (let j = 0; j < SLICES; j++) for (let r = 0; r < RING; r++) {
      const a = o + j * RING + r, a1 = o + j * RING + (r + 1) % RING, b = a + RING, b1 = a1 + RING;
      tris.push(a, a1, b, a1, b1, b);
    }
    const c0 = o + (SLICES + 1) * RING, c1 = c0 + 1;
    for (let r = 0; r < RING; r++) { tris.push(c0, o + (r + 1) % RING, o + r); tris.push(c1, o + SLICES * RING + r, o + SLICES * RING + (r + 1) % RING); }
  }
  const count = perShoe * 2;
  const skinIndex = new Uint16Array(count * 4), skinWeight = new Float32Array(count * 4);
  ['L', 'R'].forEach((side, s) => {
    const bi = names.indexOf(`foot.${side}`);
    for (let i = 0; i < perShoe; i++) { skinIndex[(s * perShoe + i) * 4] = bi; skinWeight[(s * perShoe + i) * 4] = 1; }
  });
  return { foot, tris, skinIndex, skinWeight, positions: new Float32Array(count * 3), colors: new Float32Array(count * 3), perShoe };
}

// Rebuild the shoe shapes for body positions P. Returns the lowest point (for the ground).
export function fitShoes(sh, P, upper, sole) {
  let ground = 1e9;
  for (const side of ['L', 'R']) for (const i of sh.foot[side]) ground = Math.min(ground, P[i * 3 + 1]);
  const soleT = 0.16, bottom = ground - soleT;
  ['L', 'R'].forEach((side, s) => {
    const ids = sh.foot[side];
    let z0 = 1e9, z1 = -1e9;
    for (const i of ids) { z0 = Math.min(z0, P[i * 3 + 2]); z1 = Math.max(z1, P[i * 3 + 2]); }
    z0 -= 0.06; z1 += 0.12;
    const xmin = new Float32Array(SLICES + 1).fill(1e9), xmax = new Float32Array(SLICES + 1).fill(-1e9), top = new Float32Array(SLICES + 1).fill(-1e9);
    const dz = (z1 - z0) / SLICES;
    for (const i of ids) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      const j = Math.round((z - z0) / dz);
      for (let k = Math.max(0, j - 1); k <= Math.min(SLICES, j + 1); k++) {
        xmin[k] = Math.min(xmin[k], x); xmax[k] = Math.max(xmax[k], x); top[k] = Math.max(top[k], y);
      }
    }
    for (let j = 0; j <= SLICES; j++) if (xmin[j] > 1e8) {           // empty slices borrow from neighbors
      const k = j < SLICES / 2 ? j + 1 : j - 1; xmin[j] = xmin[k]; xmax[j] = xmax[k]; top[j] = top[k];
    }
    for (let pass = 0; pass < 2; pass++) for (const arr of [xmin, xmax, top]) {
      const c = arr.slice(); for (let j = 1; j < SLICES; j++) arr[j] = (c[j - 1] + 2 * c[j] + c[j + 1]) / 4;
    }
    const o = s * sh.perShoe, Pp = sh.positions, C = sh.colors;
    const put = (n, x, y, z) => { Pp[n * 3] = x; Pp[n * 3 + 1] = y; Pp[n * 3 + 2] = z; const c = y < bottom + soleT + 0.04 ? sole : upper; C[n * 3] = c.r; C[n * 3 + 1] = c.g; C[n * 3 + 2] = c.b; };
    for (let j = 0; j <= SLICES; j++) {
      const t = j / SLICES;
      // round in plan at both ends; full height at the heel (a heel cup), tapering only at the toe
      const ew = Math.pow(Math.sin(Math.PI * (0.04 + 0.92 * t)), t < 0.5 ? 0.22 : 0.3);
      const eh = t < 0.5 ? 1 : Math.pow(Math.sin(Math.PI * (0.03 + 0.94 * t)), 0.3);
      const ankle = t < 0.42 ? 0.15 : 0.1;
      const cx = (xmin[j] + xmax[j]) / 2, w = ((xmax[j] - xmin[j]) / 2 + 0.11) * ew;
      const ty = Math.min(top[j] + ankle, -6.6), h = (ty - bottom) / 2 * Math.max(0.35, eh), cy = bottom + h;
      for (let r = 0; r < RING; r++) {
        const a = (r / RING) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const x = cx + w * Math.sign(ca) * Math.pow(Math.abs(ca), 0.55);
        const y = cy + h * Math.sign(sa) * Math.pow(Math.abs(sa), sa < 0 ? 0.25 : 0.7);     // flat sole, rounded top
        put(o + j * RING + r, x, y, z0 + t * (z1 - z0));
      }
    }
    const mid = (j) => { let x = 0, y = 0; for (let r = 0; r < RING; r++) { x += Pp[(o + j * RING + r) * 3]; y += Pp[(o + j * RING + r) * 3 + 1]; } return [x / RING, y / RING]; };
    const m0 = mid(0), m1 = mid(SLICES);
    put(o + (SLICES + 1) * RING, m0[0], m0[1], z0 - 0.01);
    put(o + (SLICES + 1) * RING + 1, m1[0], m1[1], z1 + 0.01);
  });
  return bottom;
}
