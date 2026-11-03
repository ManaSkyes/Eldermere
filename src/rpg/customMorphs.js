// src/rpg/customMorphs.js — morph targets made in code, for shapes the MakeHuman set doesn't have.
// Each is a sparse list of vertex offsets on the neutral body, exactly like a MakeHuman target,
// so it blends, layers and partially applies the same way (transformations, half-bloods, ...).
// Units: decimeters, neutral body (y up, +z forward, ears near x = +-0.84, y 7.0..7.35).

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const CUSTOM_MORPHS = {
  // Long elven ears: the upper ear swept up and back into a point.
  'race-ears-long': (x, y, z) => {
    const ax = Math.abs(x); if (ax < 0.76 || y < 6.95 || y > 7.85 || z < 0.25 || z > 0.7) return null;
    const out = smooth(0.76, 0.86, ax), up = smooth(7.1, 7.38, y);
    const t = out * up; if (t <= 0) return null;
    return [Math.sign(x) * 0.12 * t, 0.55 * t * t, -0.32 * t * t];
  },
  // Muzzle: nose, mouth and jaw pushed forward (Draconian, Therian).
  'race-snout': (x, y, z) => {
    if (z < 0.75 || y < 6.25 || y > 7.25) return null;
    const front = smooth(0.8, 1.25, z), band = Math.exp(-Math.pow((y - 6.8) / 0.32, 2)), mid = Math.max(0, 1 - Math.pow(Math.abs(x) / 0.6, 2));
    const w = front * band * mid; if (w <= 0.001) return null;
    return [0, -0.06 * w, 0.75 * w];
  },
  // Heavy brow ridge (Draconian, Solcaste).
  'race-brow-heavy': (x, y, z) => {
    if (z < 0.9 || y < 7.25 || y > 7.85 || Math.abs(x) > 0.7) return null;
    const w = smooth(0.95, 1.25, z) * Math.exp(-Math.pow((y - 7.52) / 0.12, 2)) * Math.max(0, 1 - Math.pow(Math.abs(x) / 0.7, 2));
    if (w <= 0.001) return null;
    return [0, 0.03 * w, 0.14 * w];
  },
  // Broad, heavy jaw (Solcaste, Boar Therian).
  'race-jaw-broad': (x, y, z) => {
    if (y < 6.2 || y > 7.0 || z < -0.2) return null;
    const w = Math.exp(-Math.pow((y - 6.55) / 0.25, 2)) * smooth(0.2, 0.6, Math.abs(x));
    if (w <= 0.001) return null;
    return [Math.sign(x) * 0.12 * w, -0.03 * w, 0.03 * w];
  },
};

// Build the targets and register them with the morph engine.
export function addCustomMorphs(human) {
  const P = human.meta.positions, n = human.meta.bodyVertexCount;
  for (const [name, fn] of Object.entries(CUSTOM_MORPHS)) {
    const idx = [], d = [];
    for (let i = 0; i < n; i++) {
      const o = fn(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      if (o) { idx.push(i); d.push(o[0], o[1], o[2]); }
    }
    human.targets[name] = { idx: Uint32Array.from(idx), d: Float32Array.from(d), scale: 1, post: true };
  }
}

// ---------------------------------------------------------------------------------------
// Species heads by landmark warping. Landmarks are found on the neutral head; each species
// moves some of them; a thin-plate spline (smooth 3D warp) carries every head vertex along,
// so detail (eyelids, lips, nostrils) comes along intact. The neck is anchored, so the body
// below is untouched. The result is an ordinary target, blendable and partially appliable.
// ---------------------------------------------------------------------------------------

// Landmarks on the neutral head, measured from the mesh.
export function headLandmarks(meta) {
  const P = meta.positions, n = meta.bodyVertexCount;
  const eye = ['left', 'right'].map(sd => { const ids = meta.eyes[sd]; return [0, 1, 2].map(a => ids.reduce((t, i) => t + P[i * 3 + a], 0) / ids.length); });
  const ey = eye[0][1];
  const head = []; for (let i = 0; i < n; i++) if (P[i * 3 + 1] > ey - 1.6) head.push(i);
  const v = i => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
  const best = (score) => { let b = -1, bs = -1e9; for (const i of head) { const s = score(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); if (s > bs) { bs = s; b = i; } } return v(b); };
  const near = (x, y, z) => best((a, b, c) => -((a - x) ** 2 + (b - y) ** 2 + (c - z) ** 2));
  const front = (y, x = 0, w = 0.08) => best((a, b, c) => (Math.abs(a - x) < w && Math.abs(b - y) < 0.06) ? c : -1e9);
  const L = {};
  L.eyeL = eye[0]; L.eyeR = eye[1];
  L.noseTip = best((x, y, z) => (Math.abs(x) < 0.08 && y < ey - 0.05 && y > ey - 0.5) ? z : -1e9);
  L.mouth = best((x, y, z) => (Math.abs(x) < 0.06 && y < ey - 0.42 && y > ey - 0.72) ? z : -1e9);
  L.chin = best((x, y, z) => (Math.abs(x) < 0.08 && y < ey - 0.8 && y > ey - 1.1) ? z : -1e9);
  L.underChin = near(0, ey - 1.05, 0.9);
  L.brow = front(ey + 0.25); L.forehead = front(ey + 0.65); L.bridge = front(ey + 0.02);
  L.top = best((x, y, z) => y - Math.abs(x));
  L.back = best((x, y, z) => (Math.abs(x) < 0.1 && y > ey && y < ey + 0.5) ? -z : -1e9);
  for (const [s, k] of [[1, 'L'], [-1, 'R']]) {
    L['mouthC' + k] = near(s * 0.21, L.mouth[1] - 0.02, L.mouth[2] - 0.22);
    L['cheek' + k] = near(s * 0.55, ey - 0.18, 1.0);
    L['jaw' + k] = near(s * 0.58, ey - 0.78, 0.55);
    L['ear' + k] = near(s * 0.8, ey - 0.05, 0.45);
    L['temple' + k] = near(s * 0.7, ey + 0.4, 0.8);
    L['nostril' + k] = near(s * 0.13, L.noseTip[1] - 0.08, L.noseTip[2] - 0.15);
    L['neck' + k] = near(s * 0.55, ey - 1.45, 0.3);
  }
  L.neckF = near(0, ey - 1.45, 0.85); L.neckB = near(0, ey - 1.45, -0.25);
  return { L, ey };
}

// Thin-plate spline warp (3D kernel r) from src points to dst points.
function tps(src, dst) {
  const N = src.length, M = N + 4, A = [];
  for (let i = 0; i < M; i++) A.push(new Float64Array(M));
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) A[i][j] = Math.hypot(src[i][0] - src[j][0], src[i][1] - src[j][1], src[i][2] - src[j][2]);
    A[i][N] = 1; A[i][N + 1] = src[i][0]; A[i][N + 2] = src[i][1]; A[i][N + 3] = src[i][2];
    A[N][i] = 1; A[N + 1][i] = src[i][0]; A[N + 2][i] = src[i][1]; A[N + 3][i] = src[i][2];
  }
  const coef = [0, 1, 2].map(c => {
    const b = new Float64Array(M); for (let i = 0; i < N; i++) b[i] = dst[i][c] - src[i][c];
    return solve(A.map(r => Float64Array.from(r)), b);
  });
  return (x, y, z) => [0, 1, 2].map(c => {
    const w = coef[c]; let s = w[N] + w[N + 1] * x + w[N + 2] * y + w[N + 3] * z;
    for (let i = 0; i < N; i++) s += w[i] * Math.hypot(x - src[i][0], y - src[i][1], z - src[i][2]);
    return s;
  });
}
function solve(A, b) {
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    const d = A[c][c] || 1e-12;
    for (let r = c + 1; r < n; r++) { const f = A[r][c] / d; if (!f) continue; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) { let s = b[r]; for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]; x[r] = s / (A[r][r] || 1e-12); }
  return x;
}

// Species: landmark moves in decimeters (x mirrored for L/R pairs: give the left side).
// Fixed: skull top, neck. Unlisted landmarks stay put.
export const SPECIES = {
  'species-draconian': {
    // a wedge snout: straight top from the bridge to the tip, long gape back toward the jaw
    bridge: [0, 0.02, 0.55], noseTip: [0, -0.2, 1.0], nostrilL: [0.02, -0.16, 0.98], mouth: [0, -0.14, 1.0], mouthCL: [0.06, -0.06, -0.12],
    chin: [0, 0.02, 0.85], underChin: [0, 0.06, 0.55], cheekL: [0.1, 0.02, 0.15], jawL: [0.08, 0, 0.05],
    eyeL: [0.1, 0.05, -0.12], brow: [0, 0.03, 0.22], forehead: [0, -0.06, 0.02], back: [0, -0.05, -0.25], templeL: [0.04, 0, -0.02],
  },
  'species-feline': {
    // short muzzle with a broad nose pad, wide cheeks, large forward eyes, rounded skull
    bridge: [0, 0, 0.18], noseTip: [0, -0.06, 0.32], nostrilL: [0.05, -0.05, 0.3], mouth: [0, -0.04, 0.34], mouthCL: [0.02, 0.02, 0.08],
    chin: [0, 0.06, 0.18], underChin: [0, 0.05, 0.15], cheekL: [0.14, 0.03, 0.05], jawL: [0.04, 0.03, 0.02],
    eyeL: [0.03, 0.04, 0.0], brow: [0, -0.02, 0.05], forehead: [0, 0.02, 0.0], back: [0, 0.05, -0.08], templeL: [0.06, 0.04, 0],
  },
  'species-boar': {
    // long heavy snout ending in a flat disc, small eyes set back, deep jaw, sloping forehead
    bridge: [0, -0.02, 0.5], noseTip: [0, -0.18, 1.1], nostrilL: [0.04, -0.18, 1.08], mouth: [0, -0.26, 0.85], mouthCL: [0.08, -0.12, 0.25],
    chin: [0, -0.06, 0.5], underChin: [0, -0.04, 0.35], cheekL: [0.14, -0.04, 0.12], jawL: [0.14, -0.08, 0.08],
    eyeL: [0.06, 0.02, -0.1], brow: [0, 0, 0.25], forehead: [0, -0.12, 0.2], back: [0, -0.08, -0.1], templeL: [0.06, -0.04, 0],
  },
  'species-avian': {
    // a flat face: nose and mouth drawn back flush (the beak takes their place), eyes to the sides, high crown
    bridge: [0, 0, 0.08], noseTip: [0, -0.08, -0.3], nostrilL: [0, -0.06, -0.22], mouth: [0, 0.04, -0.28], mouthCL: [-0.04, 0.04, -0.1],
    chin: [0, 0.06, -0.12], underChin: [0, 0.06, -0.05], cheekL: [-0.02, 0, 0.02], jawL: [-0.05, 0.03, 0],
    eyeL: [0.08, 0.04, -0.08], brow: [0, 0.04, 0.06], forehead: [0, 0.1, 0.02], back: [0, 0.08, -0.1], top: [0, 0.12, 0], templeL: [-0.02, 0.04, 0],
  },
  'species-piscine': {
    // a gentle reshape: taller, smooth domed cranium, flatter nose, slightly wider mouth (the fins and
    // scaled skin carry the species; the face keeps its proportions and nothing is squeezed)
    top: [0, 0.18, -0.08], back: [0, 0.1, -0.12], forehead: [0, 0.06, 0], templeL: [0.02, 0.06, 0],
    noseTip: [0, -0.02, -0.12], nostrilL: [0.02, -0.02, -0.06], mouthCL: [0.05, 0, 0], cheekL: [0.03, 0, 0],
  },
};

export function addSpeciesTargets(human) {
  const meta = human.meta, P = meta.positions, { L, ey } = headLandmarks(meta);
  const names = Object.keys(L);
  for (const [species, moves] of Object.entries(SPECIES)) {
    const src = [], dst = [];
    for (const k of names) {
      const base = k.replace(/[LR]$/, '') !== k && /[a-z][LR]$/.test(k) ? k.slice(0, -1) : k;
      const side = /[a-z]R$/.test(k) ? -1 : 1;
      const mv = moves[k] || (side === -1 ? moves[base + 'L'] : null);
      const d = mv ? [mv[0] * side, mv[1], mv[2]] : [0, 0, 0];
      src.push(L[k]); dst.push([L[k][0] + d[0], L[k][1] + d[1], L[k][2] + d[2]]);
    }
    const warp = tps(src, dst), idx = [], dd = [];
    // every vertex of the head (helpers too: eyes, lashes, teeth), fading out down the neck
    for (let i = 0; i < meta.vertexCount; i++) {
      const y = P[i * 3 + 1], f = Math.min(1, Math.max(0, (y - (ey - 1.45)) / 0.35));
      if (f <= 0) continue;
      const w = warp(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]), s = f * f * (3 - 2 * f);
      if (Math.abs(w[0]) + Math.abs(w[1]) + Math.abs(w[2]) < 1e-4) continue;
      idx.push(i); dd.push(w[0] * s, w[1] * s, w[2] * s);
    }
    human.targets[species] = { idx: Uint32Array.from(idx), d: Float32Array.from(dd), scale: 1, post: true };
  }
}
