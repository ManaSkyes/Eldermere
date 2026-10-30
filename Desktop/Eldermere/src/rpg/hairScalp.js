// src/rpg/hairScalp.js — scalp-surface sampling and groom-native hairstyle guides.
// The scalp cap is used only as a fitted surface. No card roots, card copies, or card paths are reused.
const SEG = 14;
const STYLE_NAMES = {
  main: ['High ponytail', 'Low ponytail'],
  bangs: ['Swept back', 'Fringe', 'Side-swept', 'Curtain', 'Wispy', 'None'],
};
export const GROOM_STYLE_NAMES = STYLE_NAMES;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return v.map(x => x / l); };
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function regionOf(p, n, head) {
  const x = (p[0] - head.C[0]) / head.Rad[0];
  const y = (p[1] - head.C[1]) / head.Rad[1];
  const z = (p[2] - head.C[2]) / head.Rad[2];
  const front = z > 0.34 || n[2] > 0.32;
  const rear = z < -0.34 || n[2] < -0.32;
  if (rear && y < -0.48) return 'nape';
  if (y > 0.42 || n[1] > 0.62) return 'crown';
  if (front && y < 0.48) return Math.abs(x) > 0.48 ? 'temples' : 'hairline';
  if (Math.abs(x) > 0.52 || Math.abs(n[0]) > 0.52) return 'sides';
  if (rear) return 'back';
  return y > 0 ? 'crown' : 'back';
}

function makeHead(headIds, P, eyeY) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const i of headIds) if (P[i * 3 + 1] > eyeY) for (let a = 0; a < 3; a++) {
    mn[a] = Math.min(mn[a], P[i * 3 + a]); mx[a] = Math.max(mx[a], P[i * 3 + a]);
  }
  const C = [0, eyeY + 0.1, (mn[2] + mx[2]) * 0.5];
  return { C, Rad: [(mx[0] - mn[0]) * 0.5, mx[1] - eyeY - 0.1, (mx[2] - mn[2]) * 0.5] };
}

// Dense even-area dart sampling over the fitted scalp triangles. Visual coverage takes priority here;
// roots are spaced closely enough to support overlapping guide bundles and a continuous groom.
// This makes coverage a property of the scalp map, not of hairstyle card placement.
function sampleScalp(scalp, P, N, spacing = 0.045, maxRoots = 10000) {
  const V = scalp.verts, T = scalp.tris, positions = scalp.positions;
  const faces = [], cumulative = [];
  let areaTotal = 0;
  for (let t = 0; t < T.length; t += 3) {
    const ia = T[t], ib = T[t + 1], ic = T[t + 2], a = V[ia], b = V[ib], c = V[ic];
    if (!a || !b || !c || a.inner || b.inner || c.inner) continue;
    const A = [positions[ia * 3], positions[ia * 3 + 1], positions[ia * 3 + 2]];
    const B = [positions[ib * 3], positions[ib * 3 + 1], positions[ib * 3 + 2]];
    const C = [positions[ic * 3], positions[ic * 3 + 1], positions[ic * 3 + 2]];
    const area = Math.hypot(...cross(sub(B, A), sub(C, A))) * 0.5;
    if (area < 1e-7) continue;
    areaTotal += area; faces.push({ ia, ib, ic, area }); cumulative.push(areaTotal);
  }
  if (!faces.length) return { roots: [], area: 0, spacing };
  let seed = 9127;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cell = spacing, grid = new Map(), roots = [];
  const key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  const target = Math.min(maxRoots, Math.max(2400, Math.ceil(areaTotal / (spacing * spacing * 0.72))));
  const attempts = Math.max(60000, target * 140);
  for (let attempt = 0; attempt < attempts && roots.length < target; attempt++) {
    const r = random() * areaTotal;
    let lo = 0, hi = cumulative.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cumulative[mid] < r) lo = mid + 1; else hi = mid; }
    const f = faces[lo];
    let u = random(), v = random();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const w = 1 - u - v, ids = [f.ia, f.ib, f.ic], weights = [w, u, v];
    const p = [0, 0, 0], n = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const vert = V[ids[k]], srcA = vert.a * 3, srcB = vert.b * 3, wt = weights[k], q = vert.t;
      for (let c = 0; c < 3; c++) {
        p[c] += positions[ids[k] * 3 + c] * wt;
        n[c] += (N[srcA + c] + (N[srcB + c] - N[srcA + c]) * q) * wt;
      }
    }
    const nl = Math.hypot(...n) || 1; for (let c = 0; c < 3; c++) n[c] /= nl;
    const cellKey = key(...p), [gx, gy, gz] = cellKey.split(',').map(Number);
    let near = false;
    for (let x = -1; x <= 1 && !near; x++) for (let y = -1; y <= 1 && !near; y++) for (let z = -1; z <= 1 && !near; z++) {
      const list = grid.get(`${gx + x},${gy + y},${gz + z}`);
      if (list) for (const q of list) if ((q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2 < spacing * spacing) { near = true; break; }
    }
    if (near) continue;
    const root = { p, n: norm(n) }; roots.push(root);
    (grid.get(cellKey) || grid.set(cellKey, []).get(cellKey)).push(p);
  }
  return { roots, area: areaTotal, spacing };
}

function styleFor(zone, index, p, head, lengths, look, tie) {
  const side = Math.sign(p[0] - head.C[0]) || 1;
  const y = (p[1] - head.C[1]) / head.Rad[1];
  const curl = (look.curl ?? 1) * 0.025 + (look.wave ?? 0) * 0.055;
  let len, dir, gravity, gather = false, loose = 1;

  if (zone === 'bangs') {
    if (index === STYLE_NAMES.bangs.length - 1) return null;
    if (index === 0) { len = 1.1; dir = [0, 0.2, -1]; gravity = 0.12; }
    if (index === 1) { len = 0.9; dir = [0, -0.72, 0.72]; gravity = 0.65; }
    if (index === 2) { len = 1.15; dir = [side * 0.9, -0.3, 0.25]; gravity = 0.38; }
    if (index === 3) { len = 1.25; dir = [side * 0.55, -0.55, 0.45]; gravity = 0.48; }
    if (index === 4) { len = 0.72; dir = [side * 0.2, -0.45, 0.7]; gravity = 0.32; }
    len *= Math.exp((lengths.bangs || 0) * 0.69);
  } else {
    // All non-fringe scalp regions share one calm backward flow into the selected ponytail.
    // There is deliberately no mirrored/crossing crown start direction.
    len = 1.15;
    dir = [side * 0.08, -0.28, -1];
    gravity = 0.32;
    gather = !!tie;
    len *= Math.exp((lengths.main || 0) * 0.69);
  }
  return { len, dir: norm(dir), startDir: null, gravity, curl, gather, loose, width: 0.055 + 0.012 * (1 - Math.abs(y)), tone: 0.94 + 0.06 * Math.sin(p[0] * 17 + p[2] * 11) };
}

function tangentFlow(direction, normal, fallback = [0, 0, -1]) {
  let d = add(direction, normal, -dot(direction, normal));
  if (Math.hypot(...d) < 1e-4) d = add(fallback, normal, -dot(fallback, normal));
  if (Math.hypot(...d) < 1e-4) {
    const axis = Math.abs(normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    d = cross(normal, axis);
  }
  return norm(d);
}

function makeGuide(root, style, head, tie, seed) {
  const pts = [add(root.p, root.n, 0.025)];
  let p = pts[0].slice(), d = style.startDir ? style.startDir.slice() : style.dir.slice();
  const radial = norm(sub(p, head.C));
  // Both the crossing start-flow and the eventual style flow are tangent to the scalp.
  d = tangentFlow(d, root.n);
  const endDir = tangentFlow(style.dir, root.n);
  const phase = seed * Math.PI * 2;
  for (let s = 1; s <= SEG; s++) {
    const t = s / SEG;
    if (style.startDir && t < 0.3) {
      const blend = Math.min(1, t / 0.3);
      d = tangentFlow([
        style.startDir[0] * (1 - blend) + style.dir[0] * blend,
        style.startDir[1] * (1 - blend) + style.dir[1] * blend,
        style.startDir[2] * (1 - blend) + style.dir[2] * blend
      ], root.n);
    } else if (style.startDir) d = endDir.slice();
    if (style.gather && tie && t > 0.2) {
      const u = (t - 0.2) / 0.8, target = add(tie, root.n, 0.025 * (1 - u));
      p = [p[0] + (target[0] - p[0]) * 0.22, p[1] + (target[1] - p[1]) * 0.22, p[2] + (target[2] - p[2]) * 0.22];
    } else {
      const gravity = style.gravity * (0.25 + 0.75 * t);
      d = norm([d[0] * (1 - gravity * 0.22), d[1] * (1 - gravity * 0.22) - gravity * 0.45, d[2] * (1 - gravity * 0.22)]);
      p = add(p, d, style.len / SEG);
    }
    const wave = Math.sin(phase + t * Math.PI * 4) * style.curl * t;
    p = add(p, radial, wave);
    pts.push(p.slice());
  }
  return { points: pts, center: head.C, width: style.width, tone: style.tone, loose: style.loose };
}

export function buildScalpGroom(scalp, headIds, P, N, eyeY, selection, lengths = {}, look = {}) {
  const head = makeHead(headIds, P, eyeY);
  const map = sampleScalp(scalp, P, N);
  const mainStyle = selection.main ?? 0;
  const tie = mainStyle === 0 || mainStyle === 1
    ? [head.C[0], head.C[1] + head.Rad[1] * (mainStyle === 0 ? 0.34 : -0.38), head.C[2] - head.Rad[2] * 0.78]
    : null;
  const guides = [];
  const regionCounts = { hairline: 0, temples: 0, crown: 0, sides: 0, back: 0, nape: 0 };
  const coverage = clamp(Number(look.coverage ?? 1), 0, 1);
  const hairlineCoverage = clamp(Number(look.hairlineCoverage ?? 1), 0, 1);
  let seed = 17;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const root of map.roots) {
    if (dot(root.n, sub(root.p, head.C)) < 0) root.n = root.n.map(v => -v);
    const region = regionOf(root.p, root.n, head);
    const zone = region === 'hairline' ? 'bangs' : 'main';
    const keep = coverage * (region === 'hairline' ? hairlineCoverage : 1);
    const hash = Math.abs(Math.sin(root.p[0] * 127.1 + root.p[1] * 311.7 + root.p[2] * 74.7) * 43758.5453) % 1;
    if (hash > keep) continue;
    regionCounts[region]++;
    const style = styleFor(zone, selection[zone], root.p, head, lengths, look, tie);
    if (!style) continue;
    guides.push(makeGuide(root, style, head, tie, random()));
  }
  if (tie) {
    for (let i = 0; i < 110; i++) {
      const a = random() * Math.PI * 2, radius = 0.035 + random() * 0.075, len = 2.8 * Math.exp((lengths.main || 0) * 0.69);
      const points = [];
      for (let s = 0; s <= SEG; s++) { const t = s / SEG; points.push([tie[0] + Math.cos(a) * radius * (1 + t), tie[1] - len * t * t, tie[2] + Math.sin(a) * radius * 0.6 - 0.25 * Math.sin(Math.PI * t)]); }
      guides.push({ points, center: [tie[0], tie[1] - 1.2, tie[2] + 0.8], width: 0.06, tone: 0.96, loose: 1 });
    }
  }
  return { guides, head, tie, coverage: { area: map.area, sampledRoots: map.roots.length, roots: guides.length, guides: guides.length, spacing: map.spacing, regions: regionCounts, coverage, hairlineCoverage } };
}
