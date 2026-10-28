// src/rpg/hair.js — modular hair the way games do it: a scalp cap plus layered hair cards.
//
// The scalp is split into four zones (bangs, top, sides, back), each with its own style, so
// they mix freely. Strands grow from roots on the scalp following their zone's combing, fall
// with gravity, and are kept just above the real head surface (shrink-wrapped to the nearest
// skin), so hair hugs the head shape instead of floating or clipping. Ponytails and buns
// gather strands over the head to a tie. Cards are narrow, clumped and tapered, with an
// alpha-cut strand texture. Brows are short cards with styles and sliders.
// Units: decimeters (the base mesh's units).

import { makeGarment } from './clothing.js';

const HEAD_CZ = 0.6;
const hairlineY = (x, z) => { const th = Math.atan2(x, z - HEAD_CZ); return 7.425 + 0.65 * Math.cos(th) - 0.025 * Math.cos(2 * th); };
export const SCALP = {
  offset: 0.015, smooth: 6, tent: 4,
  field(x, y, z, w) {
    const ears = Math.max(0.78 - Math.abs(x), y - 7.72);
    return Math.min(y - hairlineY(x, z), ears, 0.6 - w(['neck', 'spine', 'clavicle']));
  },
};

// Zone of a root on the neutral head.
function zoneOf(x, y, z) {
  const th = Math.atan2(x, z - HEAD_CZ), c = Math.cos(th);
  if (y > 8.25 && c > -0.5) return 'top';
  if (c > 0.5) return 'bangs';
  if (c > -0.72) return 'sides';                     // temple to well behind the ear
  return 'back';
}

// Five options per zone. len: strand length (dm) from the root r (neutral-ish coords plus
// `eye`, the eye height); comb: brushing direction before gravity; gravity 0..1; curl: wave;
// lift: how far it sits above the layer below; gather: pulled into a ponytail or bun.
const sx = r => Math.sign(r.x || 1);
export const HAIR = {
  bangs: [
    { name: 'Swept back', len: () => 1.1, comb: () => [0, 0.35, -1], gravity: 0.08, lift: 0.04 },
    { name: 'Fringe', len: r => Math.max(0.5, r.y - r.eye - 0.32), comb: () => [0, -0.15, 1], gravity: 0.6, lift: 0.05, curl: 0.02 },
    { name: 'Side-swept', len: () => 1.25, comb: () => [1, -0.35, 0.5], gravity: 0.35, lift: 0.06, curl: 0.03 },
    { name: 'Curtain', len: () => 1.45, comb: r => [sx(r), -0.5, 0.45], gravity: 0.45, lift: 0.06, curl: 0.03, gatherable: true },
    { name: 'Wispy', len: () => 0.75, comb: () => [0, -0.45, 1], gravity: 0.35, lift: 0.04, curl: 0.06, sparse: true, stand: true },
  ],
  top: [
    { name: 'Cropped', len: () => 0.45, comb: () => [0, 0.25, -1], gravity: 0.05, lift: 0.03 },
    { name: 'Swept back', len: () => 1.5, comb: () => [0, 0, -1], gravity: 0.25, lift: 0.06, gatherable: true },
    { name: 'Center part', len: () => 1.8, comb: r => [sx(r), -0.25, -0.25], gravity: 0.4, lift: 0.07, gatherable: true },
    { name: 'Side part', len: () => 1.8, comb: () => [1, -0.2, -0.25], gravity: 0.4, lift: 0.07, gatherable: true },
    { name: 'Messy', len: () => 0.9, comb: r => [Math.sin(r.x * 9) * 0.6, 0.55, Math.cos(r.z * 7) * 0.6 - 0.3], gravity: 0.12, lift: 0.07, curl: 0.08, stand: true },
  ],
  sides: [
    { name: 'Shaved', none: true },
    { name: 'Short', len: () => 0.4, comb: r => [sx(r) * 0.2, -0.6, -0.8], gravity: 0.3, lift: 0.03 },
    { name: 'Chin', len: r => Math.max(0.5, r.y - r.eye + 0.75), comb: r => [sx(r) * 0.45, -1, -0.15], gravity: 0.5, lift: 0.05, curl: 0.02, gatherable: true },
    { name: 'Shoulder', len: r => Math.max(0.8, r.y - r.eye + 1.45), comb: r => [sx(r) * 0.45, -1, -0.2], gravity: 0.5, lift: 0.05, curl: 0.03, gatherable: true },
    { name: 'Long', len: r => Math.max(1.0, r.y - r.eye + 3.2), comb: r => [sx(r) * 0.45, -1, -0.25], gravity: 0.5, lift: 0.05, curl: 0.03, gatherable: true },
  ],
  back: [
    { name: 'Short', len: () => 0.5, comb: r => [sx(r) * 0.15, -1, -0.08], gravity: 0.6, lift: 0.03 },
    { name: 'Shoulder', len: r => Math.max(0.8, r.y - r.eye + 1.45), comb: r => [sx(r) * 0.25, -1, -0.3], gravity: 0.5, lift: 0.05, curl: 0.03 },
    { name: 'Long', len: r => Math.max(1.0, r.y - r.eye + 3.4), comb: r => [sx(r) * 0.25, -1, -0.3], gravity: 0.5, lift: 0.05, curl: 0.03 },
    { name: 'Ponytail', gather: 'tail', lift: 0.03 },
    { name: 'Bun', gather: 'bun', lift: 0.03 },
  ],
};
export const DEFAULT_HAIR = { bangs: 3, top: 2, sides: 4, back: 2 };

export function makeHair(meta) {
  const scalp = makeGarment(meta, SCALP);
  const P0 = meta.positions;
  // roots on the original head vertices only (the subdivided ones would quadruple the cards)
  const firstNew = meta.subdiv ? meta.subdiv.start : Infinity;
  const roots = [...new Set(scalp.verts.filter(v => v.t === 0 && !v.inner && v.a < firstNew).map(v => v.a))].sort((a, b) => a - b)
    .map(i => ({ i, zone: zoneOf(P0[i * 3], P0[i * 3 + 1], P0[i * 3 + 2]) }));
  const names = meta.skeleton.map(b => b.name), hi = names.indexOf('head');
  const headIds = [];
  for (let i = 0; i < meta.bodyVertexCount; i++) {
    for (let k = 0; k < 4; k++) if (meta.skinIndex[i * 4 + k] === hi && meta.skinWeight[i * 4 + k] > 200 && P0[i * 3 + 1] > 6.9) { headIds.push(i); break; }
  }
  const bodyIds = [];
  for (let i = 0; i < meta.bodyVertexCount; i += 5) {
    const y = P0[i * 3 + 1], x = Math.abs(P0[i * 3]);
    if (y > 2.5 && y < 7.0 && x < 2.3 && !headIds.includes(i)) bodyIds.push(i);
  }
  return { scalp, roots, headIds, bodyIds, zoneP0: P0 };
}

export function hairTexture(THREE) {
  const W = 512, H = 1024, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let n = 0; n < 1600; n++) {
    const x0 = rnd() * W, w = 0.9 + rnd() * 1.6, len = H * (0.7 + rnd() * 0.3), wob = (rnd() - 0.5) * 8, sh = 0.82 + rnd() * 0.18;
    const c = 255 * sh | 0, grd = g.createLinearGradient(0, 0, 0, len);
    grd.addColorStop(0, `rgba(${c},${c},${c},1)`); grd.addColorStop(0.75, `rgba(${c},${c},${c},0.95)`); grd.addColorStop(1, `rgba(${c},${c},${c},0)`);
    g.strokeStyle = grd; g.lineWidth = w; g.beginPath(); g.moveTo(x0, 0);
    g.bezierCurveTo(x0 + wob, len * 0.33, x0 - wob, len * 0.66, x0 + wob * 0.5, len); g.stroke();
  }
  // soften the card's side edges so cards blend into each other
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const e = Math.min(x, W - 1 - x) / (W * 0.12); if (e < 1) d[(y * W + x) * 4 + 3] *= e; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t;
}

// ---------------------------------------------------------------------------------------
// Head surface for shrink-wrapping: a grid of head vertices with their normals.
function headSurface(h, P, N) {
  const cell = 0.3, map = new Map(), key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (const i of h.headIds) { const k = key(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); (map.get(k) || map.set(k, []).get(k)).push(i); }
  // Keep point p at least `margin` above the nearest head skin. exact: hold it at exactly that
  // height (pulling it back down too), so hair lies along the head's curve.
  return (p, margin, exact = false) => {
    const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell), cz = Math.floor(p[2] / cell);
    let best = -1, bd = 1e9;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const L = map.get(`${cx + a},${cy + b},${cz + c}`); if (!L) continue;
      for (const i of L) { const d = (P[i * 3] - p[0]) ** 2 + (P[i * 3 + 1] - p[1]) ** 2 + (P[i * 3 + 2] - p[2]) ** 2; if (d < bd) { bd = d; best = i; } }
    }
    if (best < 0) return;
    const o = best * 3, d = (p[0] - P[o]) * N[o] + (p[1] - P[o + 1]) * N[o + 1] + (p[2] - P[o + 2]) * N[o + 2];
    if (d < margin || (exact && d - margin < 0.6)) { const f = margin - d; p[0] += N[o] * f; p[1] += N[o + 1] * f; p[2] += N[o + 2] * f; }
  };
}

const SEGS = 14;
// Build all hair cards for a zone selection on body positions P, normals N. eyeY: eye height.
// lengths: per-zone length scale (1 = the style's own length).
export function buildHairCards(h, sel, P, N, eyeY, lengths = {}, opts = {}) {
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const i of h.headIds) if (P[i * 3 + 1] > eyeY) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], P[i * 3 + a]); mx[a] = Math.max(mx[a], P[i * 3 + a]); }
  const C = [0, eyeY + 0.1, (mn[2] + mx[2]) / 2], Rad = [(mx[0] - mn[0]) / 2, mx[1] - eyeY - 0.1, (mx[2] - mn[2]) / 2], crown = mx[1];
  const wrap = headSurface(h, P, N);
  const body = h.bodyIds.map(i => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
  const offBody = (p, m) => {
    if (p[1] > eyeY - 0.6) return;
    // push out sideways only: lifting a strand over a shoulder made the ends stand up; sliding it
    // around the body lets it keep falling and drape over the shoulders and back
    for (const b of body) {
      const dx = p[0] - b[0], dy = p[1] - b[1], dz = p[2] - b[2], d = Math.hypot(dx, dy, dz);
      if (d >= m || d < 1e-6) continue;
      const need = Math.sqrt(Math.max(0, m * m - dy * dy)), h = Math.hypot(dx, dz);
      if (h > 1e-4) { p[0] = b[0] + dx / h * need; p[2] = b[2] + dz / h * need; }
      else p[2] = b[2] - need;
    }
  };
  const out = { pos: [], uv: [], col: [], nrm: [], idx: [], skinHead: [], cards: [] };
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const vnorm = (p, c, sy = 0.8) => { const v = [(p[0] - c[0]) / Rad[0], (p[1] - c[1]) / Rad[1] * sy, (p[2] - c[2]) / Rad[2]], l = Math.hypot(...v) || 1; return v.map(x => x / l); };

  // a card along points pts; center: what "outward" means for lighting and for laying it flat
  // loose: 0 = never moves (brushed into a tie), 1 = free hair
  const addCard = (pts, width, center, rootDark = true, loose = 1, tone = 1) => {
    out.cards.push({ first: out.pos.length / 3, points: pts.map(p => p.slice()), loose, center: center.slice(), width, tone, rootDark, zone: curZone });
    const base = out.pos.length / 3, n = pts.length - 1, shade = (0.84 + 0.16 * rnd()) * tone, u0 = rnd() * 0.7;
    for (let s = 0; s <= n; s++) {
      const p = pts[s], q = pts[Math.min(n, s + 1)], o = pts[Math.max(0, s - 1)];
      const t = [q[0] - o[0], q[1] - o[1], q[2] - o[2]], nv = vnorm(p, center);
      let side = [t[1] * nv[2] - t[2] * nv[1], t[2] * nv[0] - t[0] * nv[2], t[0] * nv[1] - t[1] * nv[0]];
      const sl = Math.hypot(...side) || 1; side = side.map(v => v / sl);
      const ww = width * (1 - 0.65 * Math.pow(s / n, 1.5)) * 0.5;               // tapers to the tip
      out.pos.push(p[0] - side[0] * ww, p[1] - side[1] * ww, p[2] - side[2] * ww, p[0] + side[0] * ww, p[1] + side[1] * ww, p[2] + side[2] * ww);
      out.nrm.push(...nv, ...nv);
      out.uv.push(u0, 1 - s / n, u0 + 0.3, 1 - s / n);
      const c = shade * (rootDark ? 0.8 + 0.2 * Math.min(1, s / 3) : 1); out.col.push(c, c, c, c, c, c);
      out.skinHead.push(1, 1);                       // follows the head; the hair physics handles the rest
      if (s < n) { const a = base + s * 2; out.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
  };

  const backOpt = HAIR.back[sel.back];
  const tie = backOpt.gather ? (() => {
    // start inside the skull and push out to the surface, so the tie sits on the head
    const p = [0, C[1] + (backOpt.gather === 'bun' ? Rad[1] * 0.55 : Rad[1] * 0.1), C[2] - Rad[2] * 0.75];
    for (let k = 0; k < 4; k++) wrap(p, 0.1);
    return p;
  })() : null;

  let curZone = 'top';
  for (const root of h.roots) {
    const opt = HAIR[root.zone][sel[root.zone]]; curZone = root.zone;
    if (opt.none) continue;
    const i = root.i, r = { x: P[i * 3], y: P[i * 3 + 1], z: P[i * 3 + 2], eye: eyeY };
    const nr = [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]];
    const layer = Math.max(0, Math.min(1, (r.y - eyeY) / (crown - eyeY)));
    const copies = opts.copies ?? (opt.sparse ? 2 : 3);
    for (let cpy = 0; cpy < copies; cpy++) {
      // close to the head: just above the textured cap, with a little layering from the crown down
      const margin = 0.02 + (opt.lift || 0.04) * 0.5 * layer + 0.006 * rnd() + cpy * 0.005;
      // a slightly jittered start, so neighboring cards don't line up
      const p = [r.x + (rnd() - 0.5) * 0.06, r.y + (rnd() - 0.5) * 0.06, r.z + (rnd() - 0.5) * 0.06];
      wrap(p, margin);
      const pts = [p.slice()];
      const gathered = tie && (root.zone === 'back' || (opt.gatherable && root.zone === 'top'));
      if (gathered) {
        // brushed over the head to the tie, hugging the skull all the way
        for (let s = 1; s <= SEGS; s++) {
          const t = s / SEGS, q = [p[0] + (tie[0] - p[0]) * t, p[1] + (tie[1] - p[1]) * t, p[2] + (tie[2] - p[2]) * t];
          wrap(q, margin * (1 - 0.4 * t) + 0.01, t < 0.85); pts.push(q);
        }
        pts[SEGS] = tie.slice();
      } else {
        const L = opt.len(r) * (lengths[root.zone] ?? 1) * (0.88 + 0.24 * rnd()), step = L / SEGS;
        let d = opt.comb(r); const dl = Math.hypot(...d); d = d.map(v => v / dl);
        const dn = d[0] * nr[0] + d[1] * nr[1] + d[2] * nr[2]; d = d.map((v, a) => v - nr[a] * dn);
        const phase = rnd() * 6.28, curl = (opt.curl || 0) * (opts.curl ?? 1) + (opts.wave || 0) * 0.06;   // (the creator's curl and wave)
        let q = p.slice();
        for (let s = 1; s <= SEGS; s++) {
          const gv = opt.gravity * (0.35 + s / SEGS);
          d = [d[0] * (1 - gv * 0.3), d[1] * (1 - gv * 0.3) - gv, d[2] * (1 - gv * 0.3) + (q[1] < eyeY - 0.4 ? -0.08 : 0)];
          const l = Math.hypot(...d); d = d.map(v => v / l);
          q = [q[0] + d[0] * step + Math.sin(phase + s) * curl, q[1] + d[1] * step, q[2] + d[2] * step + Math.cos(phase + s * 0.7) * curl];
          const overSkull = !opt.stand && q[1] > C[1] - Rad[1] * 0.1 && q[2] < C[2] + Rad[2] * 0.6;
          wrap(q, margin, overSkull); offBody(q, 0.42 + margin);
          pts.push(q.slice());
        }
      }
      addCard(pts, 0.08 + 0.04 * rnd(), C, true, gathered ? 0 : 1);
    }
  }
  curZone = 'back';
  if (tie && backOpt.gather === 'tail') tail(tie);
  if (tie && backOpt.gather === 'bun') bun(tie);
  return { pos: new Float32Array(out.pos), uv: new Float32Array(out.uv), col: new Float32Array(out.col), nrm: new Float32Array(out.nrm), idx: out.idx, skinHead: new Float32Array(out.skinHead), cards: out.cards, head: { C, Rad }, tie };

  function tail(T) {
    for (let n = 0; n < (opts.tailN ?? 110); n++) {
      const a = rnd() * Math.PI * 2, rr = 0.03 + 0.07 * rnd(), L = 3.2 * (lengths.back ?? 1) * (0.8 + 0.3 * rnd()), pts = [];
      for (let s = 0; s <= SEGS; s++) {
        const t = s / SEGS, spread = rr * (1 + 2.2 * Math.sin(Math.PI * Math.min(1, t * 1.2)));
        // out from the tie first, then down along the back
        const p = [T[0] + Math.cos(a) * spread, T[1] - L * t * t * 0.9 - 0.25 * t, T[2] - 0.35 * Math.sin(Math.PI * Math.min(1, t * 1.6)) * (1 - t * 0.3) + Math.sin(a) * spread * 0.5];
        wrap(p, 0.08); offBody(p, 0.45); pts.push(p);
      }
      addCard(pts, 0.08 + 0.03 * rnd(), [T[0], T[1] - 1.4, T[2] + 0.9], false, 1);
    }
  }
  function bun(T) {
    // the bun sits on the head just over the tie
    const dv = [T[0] - C[0], T[1] - C[1], T[2] - C[2]], dl = Math.hypot(...dv), B = [T[0] + dv[0] / dl * 0.12, T[1] + dv[1] / dl * 0.12, T[2] + dv[2] / dl * 0.12];
    for (let n = 0; n < (opts.bunN ?? 60); n++) {
      const lat = (rnd() - 0.5) * 2.2, rr = 0.3 * Math.cos(lat * 0.7), y0 = 0.25 * Math.sin(lat * 0.7), ph = rnd() * 6.28, pts = [];
      for (let s = 0; s <= 14; s++) {
        const a = ph + (s / 14) * Math.PI * 1.6;
        pts.push([B[0] + Math.cos(a) * rr, B[1] + y0 + Math.sin(a) * rr * 0.25, B[2] + Math.sin(a) * rr * 0.8]);
      }
      addCard(pts, 0.1, B, false, 0);
    }
  }
}

// ---------------------------------------------------------------------------------------
// Brows: short hair cards along an arch above each eye, laid on the skin.
export const BROW_STYLES = [
  { name: 'Natural', count: 34, len: 0.1, width: 0.022, arch: 0.07, tilt: 0, inner: 0.42, outer: 1.47, rows: 1 },
  { name: 'Straight', count: 34, len: 0.1, width: 0.022, arch: 0.015, tilt: -0.02, inner: 0.4, outer: 1.45, rows: 1 },
  { name: 'Arched', count: 34, len: 0.1, width: 0.02, arch: 0.13, tilt: 0.02, inner: 0.45, outer: 1.5, rows: 1 },
  { name: 'Thick', count: 48, len: 0.13, width: 0.026, arch: 0.05, tilt: 0, inner: 0.36, outer: 1.45, rows: 2 },
  { name: 'Thin', count: 26, len: 0.07, width: 0.016, arch: 0.09, tilt: 0.03, inner: 0.5, outer: 1.5, rows: 1 },
];
// opts: style index plus sliders (-1..1): thickness, arch, tilt, height, length
export function buildBrows(P, eyeCenters, skinAt, o) {
  // skinAt(x, y) -> [point, normal] on the face's skin nearest to (x, y), seen from the front
  const st = BROW_STYLES[o.style || 0];
  const out = { pos: [], uv: [], col: [], idx: [] };
  let seed = 5; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const count = Math.round(st.count * 2.4 * (1 + 0.5 * (o.thickness || 0))), L0 = st.len * (1 + 0.35 * (o.thickness || 0));
  const arch = st.arch + 0.07 * (o.arch || 0), tilt = st.tilt + 0.08 * (o.tilt || 0), lift = 0.27 + 0.1 * (o.height || 0);
  const outer = Math.min(1.42, st.outer - 0.08 + 0.2 * (o.length || 0));
  const above = 0.02;
  for (const e of eyeCenters) {
    const s = Math.sign(e[0]);
    for (let row = 0; row < st.rows; row++) for (let n = 0; n < count; n++) {
      const t = n / (count - 1) + (rnd() - 0.5) * 0.02, x = e[0] * (st.inner + (outer - st.inner) * t);
      const y = e[1] + lift + row * 0.035 + arch * Math.sin(Math.PI * Math.min(1, t * 1.25)) - 0.05 * t * t + tilt * (t - 0.3) + (rnd() - 0.5) * 0.025;
      const [sp, sn] = skinAt(x, y);
      // hair direction: up and out near the nose, along the brow toward the tail; laid flat on the skin
      let d = [s * (0.45 + 0.65 * t), 0.75 - 0.9 * t, 0];
      const dn = d[0] * sn[0] + d[1] * sn[1] + d[2] * sn[2]; d = d.map((v, a) => v - sn[a] * dn);
      const dl = Math.hypot(...d) || 1; d = d.map(v => v / dl);
      const L = L0 * (0.8 + 0.4 * rnd()) * (1 - 0.35 * t);
      const base = [sp[0] + sn[0] * above, sp[1] + sn[1] * above, sp[2] + sn[2] * above];
      const [tp, tn] = skinAt(base[0] + d[0] * L, base[1] + d[1] * L);
      const tip = [tp[0] + tn[0] * above * 1.3, tp[1] + tn[1] * above * 1.3, tp[2] + tn[2] * above * 1.3];
      let side = [d[1] * sn[2] - d[2] * sn[1], d[2] * sn[0] - d[0] * sn[2], d[0] * sn[1] - d[1] * sn[0]];
      const sl = Math.hypot(...side) || 1, w = st.width * 0.55; side = side.map(v => v / sl * w);
      const b = out.pos.length / 3;
      out.pos.push(base[0] - side[0], base[1] - side[1], base[2] - side[2], base[0] + side[0], base[1] + side[1], base[2] + side[2],
        tip[0] - side[0] * 0.3, tip[1] - side[1] * 0.3, tip[2] - side[2] * 0.3, tip[0] + side[0] * 0.3, tip[1] + side[1] * 0.3, tip[2] + side[2] * 0.3);
      out.uv.push(0.2, 1, 0.5, 1, 0.2, 0, 0.5, 0);
      const c = 0.7 + 0.3 * rnd(); for (let k = 0; k < 12; k++) out.col.push(c);
      out.idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }
  return { pos: new Float32Array(out.pos), uv: new Float32Array(out.uv), col: new Float32Array(out.col), idx: out.idx };
}

// ---------------------------------------------------------------------------------------
// Flow direction for every scalp-cap vertex: the way its zone is combed (or toward the tie),
// laid along the skin. The cap's shader draws fine strands along this flow, so the cap itself
// is the hair's base layer.
export function capFlow(h, sel, P, N, eyeY, tieDir = null) {
  const verts = h.scalp.verts, out = new Float32Array(verts.length * 3);
  const P0 = h.zoneP0;
  verts.forEach((v, k) => {
    const i = v.a, x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    const zone = zoneOf(P0[i * 3], P0[i * 3 + 1], P0[i * 3 + 2]), opt = HAIR[zone][sel[zone]];
    let d;
    if (opt.none || !opt.comb) d = [0, -1, -0.3];
    else if (tieDir && (zone === 'back' || (opt.gatherable && zone === 'top'))) d = [tieDir[0] - x, tieDir[1] - y, tieDir[2] - z];
    else { d = opt.comb({ x, y, z, eye: eyeY }); d = [d[0], d[1] - (opt.gravity || 0.3) * 0.8, d[2]]; }
    const n = [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]], dn = d[0] * n[0] + d[1] * n[1] + d[2] * n[2];
    d = d.map((c, a) => c - n[a] * dn); const l = Math.hypot(...d) || 1;
    out[k * 3] = d[0] / l; out[k * 3 + 1] = d[1] / l; out[k * 3 + 2] = d[2] / l;
  });
  return out;
}

// ---------------------------------------------------------------------------------------
// Brows as a decal: a thin patch of the face's own skin around the brows, lifted a hair's
// breadth, with the brows painted into its texture. Always exactly on the skin, follows every
// face slider. The texture covers x in [-BX, BX] and y from eye height +BY0 to +BY1
// (neutral head, decimeters).
// ---------------------------------------------------------------------------------------
const BX = 0.62, BY0 = 0.05, BY1 = 0.6;
export function browDecal(meta) {
  const P = meta.positions, eye = ['left', 'right'].map(sd => { const ids = meta.eyes[sd]; return [0, 1, 2].map(a => ids.reduce((t, i) => t + P[i * 3 + a], 0) / ids.length); });
  const ey = eye[0][1];
  const def = {
    offset: 0.003, smooth: 2, tent: 1,
    field(x, y, z) { return Math.min(BX - Math.abs(x), y - (ey + BY0), ey + BY1 - y, z - 0.85); },
  };
  return { def, eye, ey };
}
// UVs for the decal's vertices (neutral positions), so the painted brows stay put on the skin.
export function browUVs(meta, garment, decal) {
  const P = meta.positions, uv = new Float32Array(garment.verts.length * 2);
  garment.verts.forEach((v, k) => {
    const x = P[v.a * 3] + (P[v.b * 3] - P[v.a * 3]) * v.t, y = P[v.a * 3 + 1] + (P[v.b * 3 + 1] - P[v.a * 3 + 1]) * v.t;
    uv[k * 2] = (x + BX) / (2 * BX); uv[k * 2 + 1] = (y - decal.ey - BY0) / (BY1 - BY0);
  });
  return uv;
}
// Paint brows into a canvas for a style and slider settings (o as in buildBrows).
export function paintBrows(cv, decal, o) {
  const st = BROW_STYLES[o.style || 0], W = cv.width, H = cv.height, g = cv.getContext('2d');
  g.clearRect(0, 0, W, H);
  const px = x => (x + BX) / (2 * BX) * W, py = y => (1 - (y - decal.ey - BY0) / (BY1 - BY0)) * H, sc = W / (2 * BX);
  let seed = 5; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const count = Math.round(st.count * 4 * (1 + 0.6 * (o.thickness || 0)));
  const L0 = st.len * (1 + 0.35 * (o.thickness || 0)), band = 0.022 * st.rows * (1 + 0.5 * (o.thickness || 0));
  const arch = st.arch + 0.07 * (o.arch || 0), tilt = st.tilt + 0.08 * (o.tilt || 0), lift = 0.27 + 0.1 * (o.height || 0);
  const outer = Math.min(1.45, st.outer + 0.2 * (o.length || 0));
  g.lineCap = 'round';
  for (const e of decal.eye) {
    const s = Math.sign(e[0]);
    for (let n = 0; n < count; n++) {
      const t = rnd(), x = e[0] * (st.inner + (outer - st.inner) * t);
      // thicker toward the inner end, tapering to a fine tail
      const thick = band * (1.2 - 0.8 * t);
      const y = decal.ey + lift + arch * Math.sin(Math.PI * Math.min(1, t * 1.25)) - 0.05 * t * t + tilt * (t - 0.3) + (rnd() - 0.5) * thick;
      // hairs point up and out near the nose, along the brow in the middle, slightly down at the tail
      const ang = (1 - t) * 1.05 + t * -0.35 + (rnd() - 0.5) * 0.35, L = L0 * (0.7 + 0.5 * rnd()) * (1 - 0.3 * t) * sc;
      const dx = Math.cos(ang) * L * s, dy = -Math.sin(ang) * L;
      const a = 0.55 + 0.4 * rnd();
      g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = 1.1 + rnd() * 1.4;
      g.beginPath(); g.moveTo(px(x), py(y));
      g.quadraticCurveTo(px(x) + dx * 0.6, py(y) + dy * 0.5 - L * 0.05, px(x) + dx, py(y) + dy); g.stroke();
    }
  }
}

// ---------------------------------------------------------------------------------------
// Lashes: the base mesh's lash cards, given UVs along the eyelid (u) and from root to tip (v),
// textured with fine tapered lashes.
// ---------------------------------------------------------------------------------------
export function lashUVs(meta) {
  const P = meta.positions, uv = new Float32Array(meta.vertexCount * 2);
  const ids = [...new Set(meta.lashes)];
  const eye = ['left', 'right'].map(sd => { const v = meta.eyes[sd]; return [0, 1, 2].map(a => v.reduce((t, i) => t + P[i * 3 + a], 0) / v.length); });
  // group: which eye, upper or lower lid
  const groups = new Map();
  for (const i of ids) {
    const e = P[i * 3] > 0 ? 0 : 1, up = P[i * 3 + 1] > eye[e][1] ? 1 : 0, key = e * 2 + up;
    const dx = P[i * 3] - eye[e][0], dy = P[i * 3 + 1] - eye[e][1], dz = P[i * 3 + 2] - eye[e][2];
    const d = Math.hypot(dx, dy, dz), ang = Math.atan2(dy, dx * Math.sign(eye[e][0]));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ i, d, ang });
  }
  const upperOf = new Uint8Array(meta.vertexCount);
  for (const [key, list] of groups) {
    const dmin = Math.min(...list.map(v => v.d)), dmax = Math.max(...list.map(v => v.d));
    for (const v of list) { uv[v.i * 2] = v.ang * 3; uv[v.i * 2 + 1] = 1 - (v.d - dmin) / ((dmax - dmin) || 1); upperOf[v.i] = key % 2; }
  }
  const upper = [], lower = [];
  for (let t = 0; t < meta.lashes.length; t += 3) (upperOf[meta.lashes[t]] ? upper : lower).push(meta.lashes[t], meta.lashes[t + 1], meta.lashes[t + 2]);
  return { uv, upper, lower };
}
// Paint lashes into a canvas. o: thickness and curl (-1..1).
export function paintLashes(cv, o = {}) {
  const W = cv.width, H = cv.height, g = cv.getContext('2d');
  g.clearRect(0, 0, W, H);
  let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.lineCap = 'round';
  const thick = 1 + 0.6 * (o.thickness || 0), curl = 1 + 0.9 * (o.curl || 0);
  for (let n = 0; n < 260; n++) {
    const x = rnd() * W, len = H * (0.6 + 0.4 * rnd()), bend = (rnd() - 0.3) * 16 * curl;
    const grd = g.createLinearGradient(0, 0, 0, len);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.7, 'rgba(255,255,255,0.8)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = grd; g.lineWidth = (1.2 + rnd() * 1.6) * thick;
    g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + bend * 0.3, len * 0.6, x + bend, len); g.stroke();
  }
}
