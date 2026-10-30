// src/rpg/hairScalp.js — scalp-surface sampling and groom-native hairstyle guides.
// The scalp cap is used only as a fitted surface. No card roots, card copies, or card paths are reused.
const SEG = 14;
const STYLE_NAMES = {
  main: ['High ponytail', 'Low ponytail', 'Long straight', 'Long wavy', 'Long curly', 'Wolf cut', 'Shag cut', 'Layered cut', 'Bob', 'Lob', 'Pixie', 'Pigtails', 'Half-up', 'Top bun', 'Single braid', 'Braided pigtails'],
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
  const front = z > 0.18 || n[2] > 0.18;
  const rear = z < -0.34 || n[2] < -0.32;
  if (rear && y < -0.48) return 'nape';
  // This is a broad frontal overlay mask, not an exclusive scalp region.
  // Main hair is generated for every root, so extending the mask cannot expose the crown.
  if (front && y < 0.82 && Math.abs(x) < 0.92) return 'hairline';
  if (front && y < 0.82 && Math.abs(x) >= 0.92) return 'temples';
  if (y > 0.24 || n[1] > 0.48) return 'crown';
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
  let curl = (look.curl ?? 1) * 0.025 + (look.wave ?? 0) * 0.055;
  let len = 2.9, dir = [side * 0.12, -0.88, -0.18], gravity = 0.62;
  let gather = false, loose = 1, width = 0.055 + 0.012 * (1 - Math.abs(y));
  if (zone === 'bangs') {
    if (index === STYLE_NAMES.bangs.length - 1) return null;
    if (index === 0) { len = 0.22; dir = [0, 0.18, -1]; gravity = 0.12; }
    if (index === 1) { len = 0.30; dir = [0, -0.78, 0.72]; gravity = 0.65; }
    if (index === 2) { len = 0.34; dir = [side * 0.9, -0.34, 0.42]; gravity = 0.38; }
    if (index === 3) { len = 0.32; dir = [side * 0.55, -0.62, 0.58]; gravity = 0.48; }
    if (index === 4) { len = 0.23; dir = [side * 0.2, -0.5, 0.82]; gravity = 0.32; }
    len *= lengths.bangs ?? 1;
  } else {
    switch (index) {
      case 0: case 1: // Established ponytail shapes and gathering behavior.
        len = 0.68; dir = [side * 0.04, -0.12, -1]; gravity = 0.12; gather = !!tie; break;
      case 2: // Long straight.
        len = 3.05; break;
      case 3: // Long wavy: broader, slower wave.
        len = 3.0; break;
      case 4: // Long curly: tighter curl and a little more volume.
        len = 2.75; break;
      case 5: // Wolf cut: short crown layers, long tapered nape and side layers.
        len = (zone === 'crown' || zone === 'hairline' ? 0.95 : zone === 'nape' || zone === 'back' ? 2.35 : 1.35);
        gravity = 0.48; dir = [side * 0.2, -0.82, -0.28]; break;
      case 6: // Shag: irregular feathered layers with a longer back.
        len = (zone === 'crown' ? 1.05 : zone === 'nape' || zone === 'back' ? 2.0 : 1.42) * (0.88 + 0.22 * Math.abs(Math.sin(p[0] * 19 + p[2] * 13)));
        gravity = 0.52; dir = [side * 0.24, -0.84, -0.12]; break;
      case 7: // Layered cut: graduated lengths, longer toward the back.
        len = (zone === 'hairline' ? 1.55 : zone === 'crown' ? 1.8 : 2.55);
        gravity = 0.58; break;
      case 8: // Bob.
        len = 0.92; gravity = 0.58; break;
      case 9: // Lob.
        len = 1.38; gravity = 0.60; break;
      case 10: // Pixie: close crown, swept side fringe and nape.
        len = zone === 'crown' ? 0.38 : zone === 'hairline' ? 0.52 : 0.62;
        gravity = 0.32; dir = [side * 0.34, -0.35, -0.22]; break;
      case 11: // Twin pigtails; each side gathers to its own tie.
        len = 0.72; dir = [side * 0.08, -0.2, -0.92]; gravity = 0.16; gather = !!tie; break;
      case 12: // Half-up: crown and upper sides gather, lower hair stays loose.
        if (zone === 'crown' || zone === 'hairline' || zone === 'temples') {
          len = 0.62; dir = [side * 0.03, -0.1, -1]; gravity = 0.12; gather = !!tie;
        } else { len = 2.65; }
        break;
      case 13: // Top bun: gather the crown into a compact knot.
        len = 0.52; dir = [side * 0.03, -0.1, -1]; gravity = 0.1; gather = !!tie; break;
      case 14: // Single braid: gather the full length to a low rear anchor.
        len = 0.78; dir = [side * 0.04, -0.12, -1]; gravity = 0.12; gather = !!tie; break;
      case 15: // Braided pigtails.
        len = 0.72; dir = [side * 0.08, -0.2, -0.92]; gravity = 0.16; gather = !!tie; break;
    }
    if (index === 3) curl = Math.max(curl, 0.075);
    if (index === 4) curl = Math.max(curl, 0.15);
    if (index === 5 || index === 6) len *= 0.94 + 0.12 * Math.sin(p[0] * 23 + p[2] * 17);
    len *= lengths.main ?? 1;
  }
  const tone = 0.94 + 0.06 * Math.sin(p[0] * 17 + p[2] * 11);
  if (zone !== 'bangs' && [2, 3, 4, 5, 6, 7, 8, 9].includes(index)) {
    // Long straight hair routes frontal roots around the cheeks rather than down the face.
    const faceFrame = index === 2 && (zone === 'hairline' || zone === 'temples');
    return { len, dir: norm(dir), startDir: null, gravity, curl, gather: false, fringe: false, loose,
      width, tone, flow: faceFrame ? 'faceFrame' : 'drape' };
  }
  return { len, dir: norm(dir), startDir: null, gravity, curl, gather, fringe: zone === 'bangs', loose, width, tone };
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

function makeDrapeGuide(root, style, head, seed, underlayer = false) {
  const side = Math.sign(root.p[0] - head.C[0]) || 1;
  const frontBack = root.p[2] >= head.C[2] ? 1 : -1;
  const p0 = add(root.p, root.n, underlayer ? 0.022 : 0.04);
  const length = style.len * (underlayer ? 0.965 : 1);
  // Lift clear of the scalp first, then let the mass fall. The lower control points
  // stay close to the root's vertical column instead of fanning outward like a lampshade.
  const p1 = add(p0, root.n, underlayer ? 0.11 : 0.17);
  p1[1] -= length * 0.035;
  const p2 = [p0[0] + side * 0.035, p0[1] - length * 0.62, p0[2] + frontBack * 0.075];
  const p3 = [p0[0] + side * 0.055, p0[1] - length, p0[2] + frontBack * 0.12];
  const phase = seed * Math.PI * 2, points = [];
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG, v = 1 - t;
    const p = [
      v*v*v*p0[0] + 3*v*v*t*p1[0] + 3*v*t*t*p2[0] + t*t*t*p3[0],
      v*v*v*p0[1] + 3*v*v*t*p1[1] + 3*v*t*t*p2[1] + t*t*t*p3[1],
      v*v*v*p0[2] + 3*v*v*t*p1[2] + 3*v*t*t*p2[2] + t*t*t*p3[2]
    ];
    const wave = Math.sin(phase + t * Math.PI * 3) * style.curl * (underlayer ? 0.35 : 1) * t;
    points.push(add(p, root.n, wave));
  }
  return { points, center: head.C, width: underlayer ? 0.17 : style.width, tone: underlayer ? 0.91 : style.tone,
    loose: 1, dynamic: false, mass: underlayer, region: root.region || 'back' };
}

function makeFaceFrameGuide(root, style, head, seed) {
  // Side-panel roots sweep outward around the cheek, then fall beside the face.
  // This is authored hairstyle flow, not a stronger collision shove or a bang.
  const x = (root.p[0] - head.C[0]) / head.Rad[0];
  const side = Math.abs(x) < 0.045 ? (seed < 0.5 ? -1 : 1) : Math.sign(x);
  const lateral = 0.13 + clamp((0.82 - Math.abs(x)) * head.Rad[0] * 0.72, 0, 0.34);
  const p0 = add(root.p, root.n, 0.055);
  const p1 = add(add(p0, root.n, 0.20), [side * 0.07, 0, 0.045]);
  const p2 = [p0[0] + side * lateral * 0.78, p0[1] - style.len * 0.52, p0[2] + 0.035];
  const p3 = [p0[0] + side * lateral, p0[1] - style.len, p0[2] - 0.025];
  const phase = seed * Math.PI * 2, points = [];
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG, v = 1 - t;
    const p = [
      v*v*v*p0[0] + 3*v*v*t*p1[0] + 3*v*t*t*p2[0] + t*t*t*p3[0],
      v*v*v*p0[1] + 3*v*v*t*p1[1] + 3*v*t*t*p2[1] + t*t*t*p3[1],
      v*v*v*p0[2] + 3*v*v*t*p1[2] + 3*v*t*t*p2[2] + t*t*t*p3[2]
    ];
    points.push(add(p, root.n, Math.sin(phase + t * Math.PI * 2) * style.curl * 0.18 * t));
  }
  return { points, center: head.C, width: style.width, tone: style.tone, loose: 1, dynamic: false, region: root.region || 'temples' };
}

function makeGuide(root, style, head, tie, seed) {
  if (style.flow === 'faceFrame') return makeFaceFrameGuide(root, style, head, seed);
  if (style.flow === 'drape') return makeDrapeGuide(root, style, head, seed, false);
  const pts = [add(root.p, root.n, 0.035)];
  // Fringe leaves the forehead first; tangent projection had flattened it into the face.
  if (style.fringe) {
    const p0 = pts[0], forward = style.dir;
    const p1 = add(add(p0, root.n, 0.12), forward, style.len * 0.16);
    const p2 = add(p0, forward, style.len * 0.78);
    p2[1] -= style.len * 0.12;
    const p3 = add(p0, forward, style.len);
    p3[1] -= style.len * (0.42 + style.gravity * 0.18);
    const phase = seed * Math.PI * 2;
    for (let s = 1; s <= SEG; s++) {
      const t = s / SEG, v = 1 - t;
      const p = [
        v*v*v*p0[0] + 3*v*v*t*p1[0] + 3*v*t*t*p2[0] + t*t*t*p3[0],
        v*v*v*p0[1] + 3*v*v*t*p1[1] + 3*v*t*t*p2[1] + t*t*t*p3[1],
        v*v*v*p0[2] + 3*v*v*t*p1[2] + 3*v*t*t*p2[2] + t*t*t*p3[2]
      ];
      pts.push(add(p, root.n, Math.sin(phase + t * Math.PI * 2) * style.curl * 0.012 * t));
    }
    return { points: pts, center: head.C, width: style.width, tone: style.tone, loose: style.loose, dynamic: true, region: root.region || 'hairline' };
  }
  let p = pts[0].slice(), d = style.startDir ? style.startDir.slice() : style.dir.slice();
  const radial = norm(sub(p, head.C));
  // Both the crossing start-flow and the eventual style flow are tangent to the scalp.
  d = tangentFlow(d, root.n);
  const endDir = tangentFlow(style.dir, root.n);
  const phase = seed * Math.PI * 2;
  let gatherStart = null;
  const gatherAt = 0.32;
  const tailDir = [0, -1, -0.24];
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

    if (style.gather && tie && t < gatherAt) {
      const gravity = style.gravity * (0.25 + 0.75 * t);
      d = norm([d[0] * (1 - gravity * 0.18), d[1] * (1 - gravity * 0.18) - gravity * 0.28, d[2] * (1 - gravity * 0.18)]);
      p = add(p, d, style.len / SEG);
      if (s === Math.floor(SEG * gatherAt)) gatherStart = p.slice();
    } else if (style.gather && tie) {
      if (!gatherStart) gatherStart = p.slice();
      const u = clamp((t - gatherAt) / (1 - gatherAt), 0, 1), v = 1 - u;
      const p0 = gatherStart, approach = tangentFlow(style.dir, root.n);
      const p1 = add(p0, approach, 0.20), p2 = add(tie, tailDir, 0.20);
      // Keep the last part of the gathering curve on the outside/back of the skull.
      const target = add(tie, [0, 0, -1], 0.035 * (1 - u));
      p = [
        v*v*v*p0[0] + 3*v*v*u*p1[0] + 3*v*u*u*p2[0] + u*u*u*target[0],
        v*v*v*p0[1] + 3*v*v*u*p1[1] + 3*v*u*u*p2[1] + u*u*u*target[1],
        v*v*v*p0[2] + 3*v*v*u*p1[2] + 3*v*u*u*p2[2] + u*u*u*target[2]
      ];
    } else {
      const gravity = style.gravity * (0.25 + 0.75 * t);
      d = norm([d[0] * (1 - gravity * 0.22), d[1] * (1 - gravity * 0.22) - gravity * 0.45, d[2] * (1 - gravity * 0.22)]);
      p = add(p, d, style.len / SEG);
    }
    const wave = Math.sin(phase + t * Math.PI * 4) * style.curl * t;
    p = add(p, radial, wave);
    pts.push(p.slice());
  }
  return { points: pts, center: head.C, width: style.width, tone: style.tone, loose: style.loose, dynamic: false, region: root.region || 'crown' };
}

export function buildScalpGroom(scalp, headIds, P, N, eyeY, selection, lengths = {}, look = {}) {
  const head = makeHead(headIds, P, eyeY);
  const map = sampleScalp(scalp, P, N);
  const mainStyle = selection.main ?? 0;
  // Rear-facing skull surface is negative Z in this rig. Place the elastic outside
  // the head bounds rather than inside the ellipsoid used for scalp-relative shaping.
  const ties = mainStyle === 11 || mainStyle === 15
    ? [[head.C[0] - head.Rad[0] * 0.72, head.C[1] - head.Rad[1] * 0.22, head.C[2] - head.Rad[2] * 0.82],
       [head.C[0] + head.Rad[0] * 0.72, head.C[1] - head.Rad[1] * 0.22, head.C[2] - head.Rad[2] * 0.82]]
    : (mainStyle === 0 || mainStyle === 1 || mainStyle === 12 || mainStyle === 13 || mainStyle === 14)
      ? [[head.C[0], head.C[1] + head.Rad[1] * (mainStyle === 0 ? 0.22 : mainStyle === 1 || mainStyle === 14 ? -0.34 : 0.48), head.C[2] - head.Rad[2] * 1.12]]
      : [];
  const tieForRoot = root => ties.length > 1 ? ties[root.p[0] < head.C[0] ? 0 : 1] : ties[0] || null;
  const guides = [];
  const regionCounts = { hairline: 0, temples: 0, crown: 0, sides: 0, back: 0, nape: 0 };
  const coverage = clamp(Number(look.coverage ?? 1), 0, 1);
  const hairlineCoverage = clamp(Number(look.hairlineCoverage ?? 1), 0, 1);
  let seed = 17;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const root of map.roots) {
    if (dot(root.n, sub(root.p, head.C)) < 0) root.n = root.n.map(v => -v);
    const region = regionOf(root.p, root.n, head);
    root.region = region;
    const keep = coverage * (region === 'hairline' ? hairlineCoverage : 1);
    const hash = Math.abs(Math.sin(root.p[0] * 127.1 + root.p[1] * 311.7 + root.p[2] * 74.7) * 43758.5453) % 1;
    if (hash > keep) continue;
    regionCounts[region]++;

    // Every follicle first receives the continuous main groom. Bangs are an extra
    // front layer, never a replacement for the underlying hairline/crown coverage.
    const rootTie = tieForRoot(root);
    const baseStyle = styleFor('main', selection.main, root.p, head, lengths, look, rootTie);
    // Keep one guide per follicle. A second broad underlayer doubled guide simulation
    // and ribbon generation without solving surface collision or silhouette coverage.
    if (baseStyle) guides.push(makeGuide(root, baseStyle, head, rootTie, random()));
    if (region === 'hairline') {
      const fringeStyle = styleFor('bangs', selection.bangs, root.p, head, lengths, look, null);
      if (fringeStyle) guides.push(makeGuide(root, fringeStyle, head, null, random()));
    }
  }
  if (ties.length) {
    for (let ti = 0; ti < ties.length; ti++) {
      const tie = ties[ti], high = mainStyle === 0 || mainStyle === 12 || mainStyle === 13;
      if (mainStyle === 13) {
        // A compact spiral knot built from a small bundle of short curved guides.
        for (let i = 0; i < 42; i++) {
          const a = i / 42 * Math.PI * 2, points = [];
          for (let s = 0; s <= SEG; s++) {
            const t = s / SEG, r = 0.055 * (1 - t * 0.35);
            points.push([tie[0] + Math.cos(a + t * Math.PI * 2) * r, tie[1] + Math.sin(a + t * Math.PI * 2) * r * 0.62 + t * 0.035, tie[2] + Math.sin(a + t * Math.PI * 2) * r]);
          }
          guides.push({ points, center: tie, width: 0.042, tone: 0.98, loose: 0.2, dynamic: false, region: 'crown' });
        }
      } else if (mainStyle === 14 || mainStyle === 15) {
        // Three substantial, interwoven guide bundles form the braid silhouette.
        // Their phase offsets create the over-under rhythm; the surrounding hair is gathered
        // into the braid root and a wrap conceals the transition.
        const braidLength = (mainStyle === 15 ? 0.92 : 1.22) * (lengths.main ?? 1);
        const phaseSide = ti === 0 ? -1 : 1;
        for (let strand = 0; strand < 3; strand++) {
          const points = [], phase = strand * Math.PI * 2 / 3;
          for (let step = 0; step <= SEG; step++) {
            const t = step / SEG, a = phase + t * Math.PI * 2 * 3.2;
            const radius = 0.038 * (1 - 0.32 * t);
            points.push([
              tie[0] + Math.cos(a) * radius,
              tie[1] - braidLength * t,
              tie[2] + Math.sin(a) * radius + (mainStyle === 15 ? phaseSide * 0.025 * t : 0)
            ]);
          }
          guides.push({ points, center: tie, width: 0.095, tone: 0.96 + strand * 0.015, loose: 0.28, dynamic: true, region: 'back' });
        }
      } else {
        const tailLength = (mainStyle === 11 ? 1.05 : mainStyle === 12 ? 0.9 : 1.25) * (lengths.main ?? 1);
        for (let i = 0; i < (mainStyle === 11 ? 100 : 150); i++) {
          const a = random() * Math.PI * 2, phase = random(), rootRadius = 0.035 + random() * 0.045, points = [];
          for (let s = 0; s <= SEG; s++) {
            const t = s / SEG, envelope = 0.58 + 0.62 * Math.sin(Math.PI * Math.min(1, t * 0.82));
            const taper = 1 - 0.88 * Math.pow(t, 1.45), radius = rootRadius * envelope * taper;
            const lift = high ? 0.13 * Math.sin(Math.PI * t) : 0.018 * Math.sin(Math.PI * t);
            const drop = tailLength * (high ? 0.82 : 1.0) * t * t;
            points.push([tie[0] + Math.cos(a) * radius, tie[1] + lift - drop, tie[2] + Math.sin(a) * radius * 0.72 - (high ? 0.22 : 0.10) * t]);
          }
          guides.push({ points, center: [tie[0], tie[1] - tailLength * 0.42, tie[2] + 0.18], width: 0.052 + phase * 0.008, tone: 0.96, loose: 1, dynamic: true, region: 'back' });
        }
      }
      // A small overlapping wrap at the gather point. The wrap is intentionally hair-toned
      // for now; the accessory pass will add selectable fabric/leather colors and bow shapes.
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * Math.PI * 2, points = [];
        for (let s = 0; s <= SEG; s++) {
          const t = s / SEG, ang = a + t * Math.PI * 2;
          points.push([tie[0] + Math.cos(ang) * 0.052, tie[1] + Math.sin(ang) * 0.052, tie[2] + Math.sin(ang) * 0.052]);
        }
        guides.push({ points, center: tie, width: 0.022, tone: 0.72, loose: 0.25, dynamic: false, region: 'crown' });
      }
    }
  }
  return { guides, head, tie: ties[0] || null, ties, coverage: { area: map.area, sampledRoots: map.roots.length, roots: guides.length, guides: guides.length, spacing: map.spacing, regions: regionCounts, coverage, hairlineCoverage } };
}
