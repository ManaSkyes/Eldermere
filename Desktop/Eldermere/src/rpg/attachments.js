// src/rpg/attachments.js — species parts: horns, animal ears, fins, tusks, beaks.
//
// Each part is a shape made in code, anchored to a vertex on the neutral head (so it follows
// every morph and species shape), skinned to the head bone, and scaled by its race weight, so
// parts grow in during a transformation and appear partially on mixed races.
// Units: decimeters. Head frame at rest: +y up, +z forward, +x the character's left.

// Shapes as tubes and fans: helpers return { pos[], idx[], col[] } in a local frame
// (origin at the anchor, +y along the part's main direction).
export function tube(path, radius, ringN = 10, shade = t => 1) {
  const pos = [], idx = [], col = [];
  for (let s = 0; s < path.length; s++) {
    const p = path[s], q = path[Math.min(path.length - 1, s + 1)], o = path[Math.max(0, s - 1)];
    const t = [q[0] - o[0], q[1] - o[1], q[2] - o[2]], tl = Math.hypot(...t) || 1; t.forEach((v, i) => t[i] = v / tl);
    let a = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let u = [t[1] * a[2] - t[2] * a[1], t[2] * a[0] - t[0] * a[2], t[0] * a[1] - t[1] * a[0]], ul = Math.hypot(...u); u = u.map(v => v / ul);
    const w = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
    const r = radius(s / (path.length - 1)), c = shade(s / (path.length - 1));
    for (let k = 0; k < ringN; k++) {
      const an = (k / ringN) * Math.PI * 2, ca = Math.cos(an), sa = Math.sin(an);
      pos.push(p[0] + (u[0] * ca + w[0] * sa) * r, p[1] + (u[1] * ca + w[1] * sa) * r, p[2] + (u[2] * ca + w[2] * sa) * r);
      col.push(c, c, c);
      if (s < path.length - 1) { const a0 = s * ringN + k, a1 = s * ringN + (k + 1) % ringN; idx.push(a0, a1, a0 + ringN, a1, a1 + ringN, a0 + ringN); }
    }
  }
  return { pos, idx, col };
}
const bez = (a, b, c, d, n) => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n, m = 1 - t;
  return [0, 1, 2].map(k => m * m * m * a[k] + 3 * m * m * t * b[k] + 3 * m * t * t * c[k] + t * t * t * d[k]);
});
// a thin, gently curved fan or leaf (ears, fins): rows from base to tip, columns across
function leaf(width, length, opts = {}) {
  const rows = 10, cols = 8, pos = [], idx = [], col = [];
  for (let r = 0; r <= rows; r++) {
    const t = r / rows, w = width * (opts.shape ? opts.shape(t) : (1 - t));
    for (let c = 0; c <= cols; c++) {
      const u = c / cols - 0.5, x = u * w, y = t * length;
      const z = (opts.cup || 0) * (1 - 4 * u * u) * w + (opts.bend || 0) * t * t * length;
      pos.push(x, y, z);
      const rib = opts.ribs ? 0.82 + 0.18 * Math.abs(Math.cos(u * Math.PI * opts.ribs)) : 1;
      const inner = opts.inner ? (Math.abs(u) < 0.32 && t < 0.85 ? opts.inner : 1) : 1;
      col.push(rib * inner, rib * inner * (opts.inner && inner !== 1 ? 0.92 : 1), rib * inner * (opts.inner && inner !== 1 ? 0.92 : 1));
      if (r < rows && c < cols) { const a = r * (cols + 1) + c; idx.push(a, a + 1, a + cols + 1, a + 1, a + cols + 2, a + cols + 1); }
    }
  }
  return { pos, idx, col };
}

// Beak halves: length, width and depth at the base (decimeters), how the tip curves
// (+ down), and how quickly it tapers.
const BEAKS = [
  { upper: { len: 1.15, w: 0.78, d: 0.46, curve: 0.42, taper: 0.8 }, lower: { len: 0.82, w: 0.66, d: 0.24, curve: 0.05, taper: 1.0 } },   // raptor
  { upper: { len: 0.9, w: 0.78, d: 0.4, curve: 0.05, taper: 1.0 }, lower: { len: 0.8, w: 0.72, d: 0.3, curve: -0.02, taper: 1.0 } },    // songbird
  { upper: { len: 2.0, w: 0.66, d: 0.3, curve: 0.03, taper: 1.25 }, lower: { len: 1.9, w: 0.6, d: 0.24, curve: -0.01, taper: 1.25 } },   // long
];
// One beak half: a half-ellipse cross-section along a gently curved path, closed by a flat face.
// side -1: the upper half (bulging up, flat underneath); +1: the lower half.
function mandible(m, size, side) {
  const rows = 16, segs = 12, pos = [], idx = [], col = [];
  const L = m.len * size;
  for (let r = 0; r <= rows; r++) {
    const t = r / rows, taper = Math.pow(1 - t, m.taper) + 0.02;
    const y = t * L, zc = m.curve * size * t * t;                      // centerline: forward, curving down (+z)
    const w = m.w * size * 0.5 * taper, d = m.d * size * taper;
    for (let k = 0; k <= segs; k++) {
      const a = (k / segs) * Math.PI;                                  // across the half-ellipse
      pos.push(Math.cos(a) * w, y, zc + side * Math.sin(a) * d);
      const c = 0.72 + 0.28 * t; col.push(c, c, c);
      if (r < rows && k < segs) { const i0 = r * (segs + 1) + k; idx.push(i0, i0 + 1, i0 + segs + 1, i0 + 1, i0 + segs + 2, i0 + segs + 1); }
    }
  }
  // the flat face (where the halves meet)
  const base = pos.length / 3;
  for (let r = 0; r <= rows; r++) {
    const t = r / rows, taper = Math.pow(1 - t, m.taper) + 0.02, w = m.w * size * 0.5 * taper, zc = m.curve * size * t * t;
    pos.push(-w, t * L, zc, w, t * L, zc); col.push(0.55, 0.55, 0.55, 0.55, 0.55, 0.55);
    if (r < rows) { const a = base + r * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  if (side > 0) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  return { pos, idx, col };
}

// ---------------------------------------------------------------------------------------
// Wings. Local frame: x outward from the spine, y up, z forward (so behind the back is -z).
// partOptions.spread: 0 folded behind the back .. 1 fully open.
export const partOptions = { spread: 0.35 };
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sc3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
function merge(...gs) {
  const out = { pos: [], idx: [], col: [], uv: [] };
  for (const g of gs) {
    const base = out.pos.length / 3;
    out.pos.push(...g.pos); out.col.push(...g.col); out.idx.push(...g.idx.map(v => v + base));
    out.uv.push(...(g.uv || new Array(g.pos.length / 3 * 2).fill(0.5)));
  }
  return out;
}
// a triangle of membrane, subdivided and billowing backward in the middle
function membrane(a, b, c, sag, shade) {
  const n = 7, pos = [], idx = [], col = [], row = [];
  let k = 0;
  for (let i = 0; i <= n; i++) {
    row.push(k);
    for (let j = 0; j <= n - i; j++) {
      const u = i / n, v = j / n, w = 1 - u - v;
      const p = [0, 1, 2].map(m => a[m] * w + b[m] * u + c[m] * v);
      p[2] -= sag * 27 * u * v * w;
      pos.push(...p); col.push(shade, shade, shade); k++;
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) {
    const p0 = row[i] + j, p1 = row[i] + j + 1, p2 = row[i + 1] + j;
    idx.push(p0, p2, p1);
    if (j < n - i - 1) idx.push(p1, p2, row[i + 1] + j + 1);
  }
  return { pos, idx, col };
}
function membraneWing(size, spread) {
  const OPEN = { J1: [2.0, 1.4, -0.5], J2: [4.0, 2.2, -0.8], f1: [6.4, 3.0, -1.0], f2: [6.6, 0.6, -1.1], f3: [5.2, -1.6, -1.0], f4: [3.2, -2.8, -0.8], B: [0.25, -3.0, -0.1] };
  const FOLD = { J1: [0.9, 1.9, -0.7], J2: [1.5, 0.5, -1.1], f1: [1.8, 2.4, -1.3], f2: [1.6, -2.4, -1.35], f3: [1.2, -3.0, -1.15], f4: [0.8, -3.2, -0.95], B: [0.25, -3.0, -0.3] };
  const P = {}; for (const k of Object.keys(OPEN)) P[k] = sc3(lerp3(FOLD[k], OPEN[k], spread), size);
  const J0 = [0, 0, 0], sag = 0.12 * size * (0.4 + 0.6 * spread);
  const parts = [
    tube([J0, lerp3(J0, P.J1, 0.5), P.J1], t => 0.1 * size * (1 - 0.3 * t), 8, () => 0.55),
    tube([P.J1, lerp3(P.J1, P.J2, 0.5), P.J2], t => 0.075 * size * (1 - 0.2 * t), 8, () => 0.55),
  ];
  for (const f of ['f1', 'f2', 'f3', 'f4']) parts.push(tube([P.J2, lerp3(P.J2, P[f], 0.5), P[f]], t => 0.05 * size * (1 - 0.75 * t), 6, () => 0.55));
  parts.push(membrane(P.J2, P.f1, P.f2, sag, 0.9), membrane(P.J2, P.f2, P.f3, sag, 0.9), membrane(P.J2, P.f3, P.f4, sag, 0.9),
    membrane(P.J2, P.f4, P.J1, sag, 0.88), membrane(P.J1, P.f4, P.B, sag, 0.86), membrane(J0, P.J1, P.B, sag * 0.6, 0.84));
  return merge(...parts);
}
// one feather card from root r along direction d
function featherCard(r, d, len, w, shade, layerZ) {
  const segs = 4, pos = [], idx = [], col = [], uv = [];
  const n = [0, 0, 1], dl = Math.hypot(...d), dd = d.map(v => v / dl);
  let sd = [dd[1] * n[2] - dd[2] * n[1], dd[2] * n[0] - dd[0] * n[2], dd[0] * n[1] - dd[1] * n[0]];
  const sl = Math.hypot(...sd) || 1; sd = sd.map(v => v / sl);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, c = [r[0] + dd[0] * len * t, r[1] + dd[1] * len * t, r[2] + dd[2] * len * t + layerZ - 0.12 * len * t * t];
    const ww = w * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, 0.25 + t)));
    pos.push(c[0] - sd[0] * ww / 2, c[1] - sd[1] * ww / 2, c[2] - sd[2] * ww / 2, c[0] + sd[0] * ww / 2, c[1] + sd[1] * ww / 2, c[2] + sd[2] * ww / 2);
    const sh = shade * (1 - 0.25 * t); col.push(sh, sh, sh, sh, sh, sh);
    uv.push(0, t, 1, t);
    if (i < segs) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  return { pos, idx, col, uv };
}
function featherWing(size, spread) {
  const OPEN = { J1: [2.2, 1.0, -0.5], J2: [4.2, 1.6, -0.7], T: [5.6, 1.9, -0.8] };
  const FOLD = { J1: [0.9, 1.8, -0.7], J2: [1.4, 0.2, -1.0], T: [1.5, -0.6, -1.05] };
  const P = {}; for (const k of Object.keys(OPEN)) P[k] = sc3(lerp3(FOLD[k], OPEN[k], spread), size);
  const J0 = [0, 0, 0], S = size, parts = [];
  const down = [0.04, -1, -0.02];
  // primaries: fanned from the hand when open, hanging down when folded
  for (let k = 0; k < 10; k++) {
    const t = k / 9, r = lerp3(P.J2, P.T, t);
    const open = lerp3([0.2, -1, 0], [1, -0.18, 0], t);
    parts.push(featherCard(r, lerp3(down, open, spread), (2.6 + 1.1 * t) * S, 0.55 * S, 0.8, -0.05 * S));
  }
  for (let k = 0; k < 12; k++) parts.push(featherCard(lerp3(P.J1, P.J2, k / 11), lerp3(down, [0.12, -1, 0], spread), 2.5 * S, 0.5 * S, 0.88, -0.035 * S));
  for (let k = 0; k < 5; k++) parts.push(featherCard(lerp3(J0, P.J1, 0.3 + 0.7 * k / 4), lerp3(down, [-0.1, -1, 0.05], spread), (1.6 + 0.6 * k / 4) * S, 0.5 * S, 0.9, -0.02 * S));
  // coverts: two shorter rows over the arm
  for (let k = 0; k < 16; k++) { const t = k / 15, r = t < 0.5 ? lerp3(J0, P.J1, t * 2) : lerp3(P.J1, P.T, (t - 0.5) * 2); parts.push(featherCard(r, lerp3(down, [0.1, -1, 0], spread), 1.1 * S, 0.45 * S, 1.0, 0.0)); }
  for (let k = 0; k < 14; k++) { const t = k / 13, r = t < 0.5 ? lerp3(J0, P.J1, t * 2) : lerp3(P.J1, P.T, (t - 0.5) * 2); parts.push(featherCard(lerp3(r, [r[0], r[1] + 0.1 * S, r[2]], 1), lerp3(down, [0.1, -1, 0], spread), 0.6 * S, 0.4 * S, 1.05, 0.02 * S)); }
  parts.push(tube([J0, P.J1, P.J2, P.T], t => 0.13 * S * (1 - 0.6 * t), 8, () => 1));
  return merge(...parts);
}
// a feather texture: a shaft and soft vanes, with alpha
export function featherTexture(THREE) {
  const W = 128, H = 512, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  for (let y = 0; y < H; y++) {
    const t = y / H, half = W * 0.47 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.08 + t * 0.95)), 0.6);
    for (let x = 0; x < W; x++) {
      const d = Math.abs(x - W / 2) / Math.max(1, half);
      if (d > 1) continue;
      const barb = 0.85 + 0.15 * Math.sin((y * 0.9 + Math.abs(x - W / 2) * 1.4) * 0.9);
      const a = (1 - Math.pow(d, 6)) * (t < 0.04 ? t / 0.04 : 1);
      const c = Math.round(255 * barb * (0.9 + 0.1 * (1 - d)));
      g.fillStyle = `rgba(${c},${c},${c},${a})`; g.fillRect(x, H - 1 - y, 1, 1);
    }
  }
  g.fillStyle = 'rgba(255,255,250,1)'; g.fillRect(W / 2 - 1.5, 0, 3, H);
  const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; return t;
}

// Part definitions. anchor: neutral point on the head (relative to the eyes: x from center,
// y above the eyes, z forward); build(size, side, opt) makes the shape in the part's frame;
// frame: how the part is oriented on the head ([yaw, pitch, roll] in radians, per left side).
export const PARTS = {
  horns: {
    name: 'Horns', material: 'horn',
    styles: ['Swept back', 'Curled', 'Upright', 'Nubs'],
    anchor: [0.38, 0.72, 0.95], frame: [-0.35, -0.3, -0.2], sink: 0.12,
    build(size, style) {
      const L = [3.2, 2.6, 2.6, 0.7][style] * size, base = 0.16 * Math.sqrt(size);
      const path = style === 1 ? bez([0, 0, 0], [0, L * 0.5, -L * 0.2], [0, L * 0.35, -L * 0.75], [0, -L * 0.05, -L * 0.55], 20)
        : style === 2 ? bez([0, 0, 0], [0, L * 0.4, 0.05], [0, L * 0.75, 0.1], [0.02, L, -0.05], 16)
        : bez([0, 0, 0], [0, L * 0.35, -L * 0.1], [0, L * 0.55, -L * 0.45], [0, L * 0.6, -L * 0.85], 18);
      // ridged: the radius ripples gently along the length
      return tube(path, t => base * (1 - 0.88 * t) * (1 + 0.06 * Math.sin(t * 40)), 12, t => 0.75 + 0.25 * t);
    },
  },
  catEars: {
    name: 'Ears', material: 'skin', anchor: [0.46, 0.78, 0.25], frame: [0.15, 0.1, -0.45], sink: 0.16,
    build(size) { return leaf(0.6 * size, 0.85 * size, { cup: -0.22, bend: -0.1, inner: 0.82, shape: t => Math.pow(1 - t, 0.85) }); },
  },
  boarEars: {
    name: 'Ears', material: 'skin', anchor: [0.62, 0.62, 0.1], frame: [0.6, 0.3, -1.1], sink: 0.06,
    build(size) { return leaf(0.6 * size, 0.9 * size, { cup: -0.3, bend: 0.25, inner: 0.85, shape: t => Math.sin(Math.PI * (0.35 + 0.65 * t)) * (1 - 0.6 * t) }); },
  },
  finEars: {
    name: 'Head fins', material: 'fin', anchor: [0.74, 0.32, 0.35], frame: [1.35, 0.55, -1.25], sink: 0.08,
    build(size) { return leaf(1.5 * size, 1.4 * size, { ribs: 8, bend: -0.25, cup: 0.08, shape: t => 0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, 0.15 + 0.9 * t)) }); },
  },
  tusks: {
    name: 'Tusks', material: 'horn', anchor: [0.24, -0.62, 1.35], frame: [0.3, 0.25, 0],
    build(size) {
      const L = 0.75 * size;
      return tube(bez([0, 0, 0], [0, L * 0.4, L * 0.15], [0.05, L * 0.8, L * 0.15], [0.1, L, -L * 0.15], 12), t => 0.07 * Math.sqrt(size) * (1 - 0.9 * t), 10, t => 0.9 + 0.1 * t);
    },
  },
  wingsMembrane: {
    name: 'Wings', material: 'membrane', anchor: [0.42, -2.35, -0.6], frame: [0, 0, 0], back: true, bone: 'spine01',
    build(size) { return membraneWing(size, partOptions.spread); },
  },
  wingsFeathered: {
    name: 'Wings', material: 'feather', anchor: [0.42, -2.35, -0.6], frame: [0, 0, 0], back: true, bone: 'spine01',
    build(size) { return featherWing(size, partOptions.spread); },
  },
  beak: {
    // upper mandible: flat underneath, covering where the nose and mouth were
    name: 'Beak', material: 'horn', anchor: [0, -0.56, 1.42], frame: [0, 1.5, 0], center: true, sink: 0.1,
    styles: ['Raptor', 'Songbird', 'Long'],
    build(size, style) { return mandible(BEAKS[style].upper, size, -1); },
  },
  beakLower: {
    // lower mandible on the jaw bone: flat on top, meeting the upper one when closed
    name: 'Lower beak', material: 'horn', anchor: [0, -0.56, 1.42], frame: [0, 1.5, 0], center: true, sink: 0.1, bone: 'jaw', styleOf: 'beak',
    build(size, style) { return mandible(BEAKS[style].lower, size, 1); },
  },
};

// Bake a part onto the body at rest: returns { pos, idx, col, nrm } in character space.
// anchorPos / anchorNrm: the anchor vertex on the morphed body; side: +1 left, -1 right.
export function placePart(part, size, style, anchorPos, side, headCenter) {
  const g = part.build(size, style);
  if (part.sink && headCenter) {
    // sink the base into the head, so the part grows out of it rather than sitting on it
    const d = [headCenter[0] - anchorPos[0], headCenter[1] - anchorPos[1], headCenter[2] - anchorPos[2]], l = Math.hypot(...d) || 1;
    anchorPos = anchorPos.map((v, i) => v + d[i] / l * part.sink * size);
  }
  const [yaw, pitch, roll] = part.frame;
  // rotate the part's frame (y = along the part) onto the head: pitch about x, yaw about y, roll about z
  const cy = Math.cos(yaw * side), sy = Math.sin(yaw * side), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll * side), sr = Math.sin(roll * side);
  const out = [];
  for (let i = 0; i < g.pos.length; i += 3) {
    let x = g.pos[i] * side, y = g.pos[i + 1], z = g.pos[i + 2];
    [x, y] = [x * cr - y * sr, x * sr + y * cr];             // roll
    [y, z] = [y * cp - z * sp, y * sp + z * cp];             // pitch
    [x, z] = [x * cy + z * sy, -x * sy + z * cy];            // yaw
    out.push(anchorPos[0] + x, anchorPos[1] + y, anchorPos[2] + z);
  }
  const idx = side < 0 ? g.idx.map((v, i) => g.idx[i - (i % 3) + [0, 2, 1][i % 3]]) : g.idx;
  return { pos: out, idx, col: g.col, uv: g.uv };
}

// Pick the anchor vertex for each part on the neutral head (nearest to the anchor point).
export function partAnchors(meta, eyeY) {
  const P = meta.positions, n = meta.bodyVertexCount, out = {};
  for (const [id, part] of Object.entries(PARTS)) {
    out[id] = [1, -1].map(side => {
      const a = [part.anchor[0] * side, eyeY + part.anchor[1], part.anchor[2]];
      let best = 0, bd = 1e9;
      if (part.back) {
        // on the back: the rearmost skin near that point (so it never lands on an arm)
        for (let i = 0; i < n; i++) if (Math.abs(P[i * 3] - a[0]) < 0.12 && Math.abs(P[i * 3 + 1] - a[1]) < 0.12 && P[i * 3 + 2] < bd) { bd = P[i * 3 + 2]; best = i; }
        return best;
      }
      for (let i = 0; i < n; i++) { const d = (P[i * 3] - a[0]) ** 2 + (P[i * 3 + 1] - a[1]) ** 2 + (P[i * 3 + 2] - a[2]) ** 2; if (d < bd) { bd = d; best = i; } }
      return best;
    });
  }
  return out;
}
