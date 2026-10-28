// src/game/cliff.js — a natural cliff face for climbing: one noise-shaped surface, drawn as a smooth mesh
// and given collision as merged box columns that follow it (the physics knows boxes and ramps; see
// src/game/physics.js). Patches of different rock (src/data/surfaces.js) and shelves to stand on and jump
// between.
//
// Layout (test grounds, north of the start): the face runs along x from -40 to 0 at z ≈ 118, facing the
// start (-z), 24 m tall, with a plateau on top. Left to right:
//   vines over the lower left · rough stone everywhere else · a smooth, unclimbable slab (side leap or
//   jump past it) · a wet streak where water runs down · an ice band across the top right
//   shelves at several heights, some level with each other (run and jump), some higher (jump and catch
//   the edge, then pull up)

export const CLIFF = { x0: -40, x1: 0, z: 118, height: 24, back: 4, cell: 1.0, step: 0.5, quant: 0.25 };

// ---- deterministic value noise ----
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const smooth = t => t * t * (3 - 2 * t);
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return (a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf) * 2 - 1;   // -1..1
}

// ---- what the face is made of, and where ----
const SLAB = { u: [-27.5, -25], v: [6.5, 17.5] };          // smooth rock: no holds
const WET = { u: [-19.5, -16.5] };                          // a streak of running water
export function cliffMaterial(u, v) {
  if (u >= SLAB.u[0] && u < SLAB.u[1] && v >= SLAB.v[0] && v < SLAB.v[1]) return 'stone';
  if (u >= WET.u[0] && u < WET.u[1]) return 'wetStone';
  if (v >= 19 && u >= -15) return 'ice';
  if (u < -31 && v < 13 + 2 * vnoise(u * 0.4, 3)) return 'vines';
  return 'climbStone';
}
// how far the face sits back from the cliff line (m): broad bulges and hollows, finer knobs; the slab is flat
export function cliffDepth(u, v) {
  if (u >= SLAB.u[0] && u < SLAB.u[1] && v >= SLAB.v[0] && v < SLAB.v[1]) return 1.5;
  let d = 1.4 + 0.7 * vnoise(u * 0.12, v * 0.12) + 0.25 * vnoise(u * 0.45 + 7, v * 0.45 + 3);
  for (const f of FEATURES) { const r2 = ((u - f.u) ** 2 + ((v - f.v) / (f.tall || 1)) ** 2) / (f.r * f.r); if (r2 < 4) d += f.amp * Math.exp(-1.6 * r2); }
  return Math.max(-3, Math.min(3.6, d));
}

// Large features, for testing extreme rock: bulges stick out toward you (negative amp, m), hollows sink in.
//   u, v: centre · r: radius (m) · tall: stretch vertically
export const FEATURES = [
  { u: -34, v: 9, r: 2.8, amp: -2.4 },              // a big round bulge in the vines: climb up its underside and over
  { u: -21.5, v: 2.5, r: 2.4, amp: -2.0, tall: 1.4 }, // a buttress rising from the ground beside the wet streak
  { u: -8, v: 14.5, r: 3.4, amp: -3.0 },            // a huge overhanging bulge high on the right, under the ice
  { u: -12.5, v: 6, r: 2.4, amp: 2.0 },             // a deep hollow (an alcove)
];

// shelves: ledges about a metre deep to stand on. u range, top height.
export const SHELVES = [
  { u: [-38, -34], v: 4 },  { u: [-31.5, -28], v: 5.5 }, { u: [-24.5, -21], v: 5.5 },   // a run: jump and catch, then level
  { u: [-14, -9], v: 11 },  { u: [-31, -25.5], v: 16 },  { u: [-8, -3], v: 20 },
  { u: [-6.5, -2], v: 7 },
];
const SHELF_DEEP = 1.1, SHELF_THICK = 0.5;

// ---- the surface itself, for climbing that follows the rock exactly (src/game/controller.js) ----
// u: along the cliff (x), v: height. point(u, v) is on the face; normal(u, v) points out of the rock (toward
// the climber); material(u, v) is the surface id there.
export const CLIFF_FIELD = {
  u0: CLIFF.x0 + 0.4, u1: CLIFF.x1 - 0.4, v0: 0, v1: CLIFF.height,
  into: { x: 0, z: 1 },                                     // the horizontal direction into the rock
  point: (u, v) => ({ x: u, y: v, z: CLIFF.z + cliffDepth(u, v) }),
  normal(u, v) {
    const e = 0.15, du = (cliffDepth(u + e, v) - cliffDepth(u - e, v)) / (2 * e), dv = (cliffDepth(u, v + e) - cliffDepth(u, v - e)) / (2 * e);
    const l = Math.hypot(du, dv, 1); return { x: du / l, y: dv / l, z: -1 / l, du, dv };
  },
  material: (u, v) => cliffMaterial(u, v),
};

// ---- collision: per 1 m column, runs of equal (quantized) depth and material become one box ----
export function cliffShapes() {
  const C = CLIFF, S = [];
  for (let u = C.x0; u < C.x1; u += C.cell) {
    const uc = u + C.cell / 2;
    let run = null;
    const flush = vTop => { if (run) S.push({ type: 'box', min: [u, run.v0, C.z + run.d], max: [u + C.cell, vTop, C.z + C.back], surface: run.m, cliff: true, field: CLIFF_FIELD, hidden: true, noStand: vTop < C.height }); };   // only the top of the face can be stood on
    for (let v = 0; v < C.height; v += C.step) {
      const d = Math.round(cliffDepth(uc, v + C.step / 2) / C.quant) * C.quant, m = cliffMaterial(uc, v + C.step / 2);
      if (!run || run.d !== d || run.m !== m) { flush(v); run = { v0: v, d, m }; }
    }
    flush(C.height);
  }
  // shelves stick out from the face at their height (plain rock: stood on, not climbed)
  for (const sh of SHELVES) {
    let front = Infinity;
    for (let u = sh.u[0]; u <= sh.u[1]; u += 0.5) front = Math.min(front, Math.round(cliffDepth(u, sh.v) / C.quant) * C.quant);
    S.push({ type: 'box', min: [sh.u[0], sh.v - SHELF_THICK, C.z + front - SHELF_DEEP], max: [sh.u[1], sh.v, C.z + front + 0.3], color: '#7d7468', surface: 'stone', cliffShelf: true });
  }
  // the plateau behind and on top, and rock at both ends so the face has sides
  S.push({ type: 'box', min: [C.x0, 0, C.z + C.back], max: [C.x1, C.height, C.z + C.back + 16], color: '#77705f', surface: 'stone' });
  S.push({ type: 'box', min: [C.x0 - 1.5, 0, C.z + 0.2], max: [C.x0, C.height, C.z + C.back], color: '#6f685a', surface: 'stone' });
  S.push({ type: 'box', min: [C.x1, 0, C.z + 0.2], max: [C.x1 + 1.5, C.height, C.z + C.back], color: '#6f685a', surface: 'stone', label: 'Cliff face: vines, rough stone, a smooth slab, a wet streak, ice at the top. Shelves to stand on.' });
  return S;
}

// ---- the drawn face: a grid displaced by the same depth, coloured by material ----
const COLORS = { climbStone: [0.55, 0.51, 0.46], vines: [0.3, 0.45, 0.22], wetStone: [0.27, 0.31, 0.34], ice: [0.8, 0.9, 0.96], stone: [0.66, 0.64, 0.6] };
export function buildCliff(THREE, scene) {
  const C = CLIFF, du = 0.4, dv = 0.4, nu = Math.round((C.x1 - C.x0) / du) + 1, nv = Math.round(C.height / dv) + 1;
  const pos = new Float32Array(nu * nv * 3), col = new Float32Array(nu * nv * 3), idx = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const u = C.x0 + i * du, v = j * dv, k = (j * nu + i) * 3;
    const m = cliffMaterial(Math.min(C.x1 - 0.01, u), Math.min(C.height - 0.01, v));
    // drawn a few cm proud of the collision so feet and hands sit on it rather than in it
    pos[k] = u; pos[k + 1] = v; pos[k + 2] = C.z + cliffDepth(u, v) - 0.06;
    const shade = 0.85 + 0.15 * vnoise(u * 1.3, v * 1.3) + (m === 'vines' ? 0.15 * vnoise(u * 3, v * 3) : 0);
    const c = COLORS[m]; col[k] = c[0] * shade; col[k + 1] = c[1] * shade; col[k + 2] = c[2] * shade;
    if (i < nu - 1 && j < nv - 1) { const a = j * nu + i, b = a + 1, c2 = a + nu, d = c2 + 1; idx.push(a, c2, b, b, c2, d); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
  // relief and roughness from the rock itself (as the ground's cliffs: src/game/testGrounds.js): strata ledges, grain, fissures
  mat.extensions = { derivatives: true };
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vClW;').replace('#include <project_vertex>', '#include <project_vertex>\nvClW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vClW; float cDet = 0.0;
      float cH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float cN(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(cH(i), cH(i + vec3(1,0,0)), f.x), mix(cH(i + vec3(0,1,0)), cH(i + vec3(1,1,0)), f.x), f.y), mix(mix(cH(i + vec3(0,0,1)), cH(i + vec3(1,0,1)), f.x), mix(cH(i + vec3(0,1,1)), cH(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      { vec3 w = vClW; float rb2 = w.y * 1.6 + cN(w * 0.35) * 2.5, ledge = fract(rb2 / 6.2832); ledge *= ledge;
        float crk = smoothstep(0.55, 0.85, cN(w * vec3(2.2, 0.18, 2.2))) * smoothstep(0.4, 0.7, cN(w * 0.5 + 9.0)), gr = cN(w * 3.1) * 0.6 + cN(w * 9.0) * 0.4;
        cDet = (ledge - 0.33) * 0.22 + (gr - 0.5) * 0.16 - crk * 0.3 + (cN(w * 21.0) - 0.5) * 0.05; diffuseColor.rgb *= 0.92 + cDet * 0.8; }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(0.86 - cDet * 1.4, 0.45, 1.0);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      { vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition), r1 = cross(sy, normal), r2 = cross(normal, sx); float det = dot(sx, r1) * faceDirection;
        vec2 dH = vec2(dFdx(cDet), dFdy(cDet)) * 0.085 * smoothstep(30.0, 4.0, length(vViewPosition));
        vec3 o = abs(det) * normal - sign(det) * (dH.x * r1 + dH.y * r2); if (dot(o, o) > 1e-12) normal = normalize(o); }`);
  };
  const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh);
  // the wet streak glistens and the ice shines: a thin glossy sheet over those parts
  const gloss = (u0, u1, v0, v1, color, opacity) => {
    const g = new THREE.PlaneGeometry(u1 - u0, v1 - v0, Math.ceil((u1 - u0) / du), Math.ceil((v1 - v0) / dv));
    const p = g.attributes.position;
    for (let n = 0; n < p.count; n++) { const u = p.getX(n) + (u0 + u1) / 2, v = p.getY(n) + (v0 + v1) / 2; p.setXYZ(n, u, v, C.z + cliffDepth(u, v) - 0.09); }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.15, metalness: 0.1, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
    scene.add(m);
  };
  gloss(WET.u[0], WET.u[1], 0, C.height, '#9fc4d8', 0.35);
  gloss(-15, C.x1, 19, C.height, '#e8f6ff', 0.4);
  return mesh;
}
