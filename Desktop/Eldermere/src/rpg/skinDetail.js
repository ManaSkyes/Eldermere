// src/rpg/skinDetail.js — procedural skin detail layered on the base skin, the way game skin
// shaders layer detail maps: freckles, moles, pigment patches, pore texture, and scar decals.
//
// Everything is computed in the base mesh's NEUTRAL space (an extra attribute), so a freckle or
// scar stays on the same spot of skin through every slider, pose and transformation.
// Face and body have separate settings, blended across the neck.
// Units: decimeters.

const MAX_SCARS = 40;

// Scar types by shape: polylines in the scar's own 2D frame (units of its size), laid on the
// skin around a point the player picks. Each scar: { type, at: vertex index, size, angle, width }.
export const SCAR_TYPES = [
  { name: 'Straight', lines: [[[-1, 0], [1, 0]]] },
  { name: 'Curved', lines: [[[-1, -0.25], [-0.5, 0.15], [0, 0.28], [0.5, 0.15], [1, -0.25]]] },
  { name: 'Jagged', lines: [[[-1, 0], [-0.55, 0.18], [-0.15, -0.14], [0.3, 0.16], [0.7, -0.12], [1, 0.05]]] },
  { name: 'Cross', lines: [[[-0.8, -0.8], [0.8, 0.8]], [[-0.8, 0.8], [0.8, -0.8]]] },
  { name: 'Claw', lines: [[[-1, -0.35], [1, -0.55]], [[-1, 0.05], [1, -0.1]], [[-0.9, 0.45], [0.9, 0.35]]] },
  { name: 'Puncture', lines: [[[0, 0], [0, 0]]], round: true },
];

export const DETAIL_DEFAULTS = () => ({
  scars: [],                                   // placed scars, anywhere on the body
  face: { freckles: 0, freckleSize: 0, freckleCluster: 0.5, freckleX: 0, freckleY: 0, moles: 0, moleSize: 0, moleX: 0, moleY: 0, patches: 0, patchSize: 0, patchX: 0, patchY: 0, texture: 0.1, textureScale: 0, 
    freckleColor: '#9a5a36', moleColor: '#2e1a10', patchColor: '#a8704e', scarColor: '#f0c4bc' },
  body: { freckles: 0, freckleSize: 0, freckleCluster: 0.5, freckleX: 0, freckleY: 0, moles: 0, moleSize: 0, moleX: 0, moleY: 0, patches: 0, patchSize: 0, patchX: 0, patchY: 0, texture: 0.08, textureScale: 0, 
    freckleColor: '#9a5a36', moleColor: '#2e1a10', patchColor: '#a8704e', scarColor: '#f0c4bc' },
});

const GLSL_NOISE = `
float sdHash13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 sdHash33(vec3 p){ p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
vec2 sdWorley(vec3 p){
  vec3 i = floor(p), f = fract(p); float d = 8.0, id = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
    vec3 g = vec3(float(x), float(y), float(z)), r = g + sdHash33(i + g) - f; float dd = dot(r, r);
    if (dd < d) { d = dd; id = sdHash13(i + g); }
  }
  return vec2(sqrt(d), id);
}
// cells with the distance to the nearest (x) and second-nearest (y) point and the cell id (z)
vec3 sdWorley2(vec3 p){
  vec3 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
    vec3 g = vec3(float(x), float(y), float(z)), r = g + sdHash33(i + g) - f; float dd = dot(r, r);
    if (dd < d1) { d2 = d1; d1 = dd; id = sdHash13(i + g); } else if (dd < d2) { d2 = dd; }
  }
  return vec3(sqrt(d1), sqrt(d2), id);
}
// nearest cell: offset from its point (xyz) and id (w)
vec4 sdWorleyV(vec3 p){
  vec3 i = floor(p), f = fract(p), best = vec3(0.0); float d = 8.0, id = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
    vec3 g = vec3(float(x), float(y), float(z)), r = g + sdHash33(i + g) - f; float dd = dot(r, r);
    if (dd < d) { d = dd; best = r; id = sdHash13(i + g); }
  }
  return vec4(best, id);
}
// overlapping fish scales in 2D: staggered rows of arcs opening downward. Returns (edge, shade).
vec2 sdFishScales(vec2 uv){
  vec2 g = uv; g.x += mod(floor(g.y), 2.0) * 0.5;
  vec2 f = fract(g) - vec2(0.5, 1.0);                  // each scale's center sits at the top of its cell
  float d = length(f * vec2(1.0, 0.9));
  vec2 f2 = fract(g + vec2(0.5, 0.5)) - vec2(0.5, 1.0); float d2 = length(f2 * vec2(1.0, 0.9));
  float dd = min(d, d2);
  return vec2(smoothstep(0.62, 0.7, max(d, d2) > 0.0 ? dd : 1.0), 1.0 - dd);
}
float sdNoise(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sdHash13(i), sdHash13(i + vec3(1,0,0)), f.x), mix(sdHash13(i + vec3(0,1,0)), sdHash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(sdHash13(i + vec3(0,0,1)), sdHash13(i + vec3(1,0,1)), f.x), mix(sdHash13(i + vec3(0,1,1)), sdHash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float sdFbm(vec3 p){ float a = 0.5, s = 0.0; for (int k = 0; k < 4; k++) { s += a * sdNoise(p); p *= 2.03; a *= 0.5; } return s; }
// fade out detail finer than about a pixel (prevents noisy aliasing at a distance)
float sdAA(float freq){ return clamp(1.5 - length(fwidth(vBase * freq)) * 2.0, 0.0, 1.0); }
float sdSeg(vec3 p, vec3 a, vec3 b){ vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0); return length(pa - ba * h); }
`;

// Where freckles naturally collect: flat, outward-facing skin. Curvature from the neutral mesh
// (distance from each vertex to its neighbors' average, relative to edge length), smoothed.
function freckleBias(meta, faceMask) {
  const P = meta.positions, n = meta.vertexCount, T = meta.bodyTris;
  const sum = new Float32Array(n * 3), cnt = new Float32Array(n), edge = new Float32Array(n), nrm = new Float32Array(n * 3);
  for (let t = 0; t < T.length; t += 3) {
    const a = T[t], b = T[t + 1], c = T[t + 2];
    for (const [i, j] of [[a, b], [b, c], [c, a], [b, a], [c, b], [a, c]]) {
      for (let k = 0; k < 3; k++) sum[i * 3 + k] += P[j * 3 + k];
      cnt[i]++; edge[i] += Math.hypot(P[i * 3] - P[j * 3], P[i * 3 + 1] - P[j * 3 + 1], P[i * 3 + 2] - P[j * 3 + 2]);
    }
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) { nrm[i * 3] += nx; nrm[i * 3 + 1] += ny; nrm[i * 3 + 2] += nz; }
  }
  let bias = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!cnt[i]) { bias[i] = 0; continue; }
    const ax = sum[i * 3] / cnt[i], ay = sum[i * 3 + 1] / cnt[i], az = sum[i * 3 + 2] / cnt[i];
    const curv = Math.hypot(P[i * 3] - ax, P[i * 3 + 1] - ay, P[i * 3 + 2] - az) / (edge[i] / cnt[i] + 1e-6);
    const flat = 1 - Math.min(1, Math.max(0, (curv - 0.06) / 0.25));
    const nl = Math.hypot(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]) || 1, facing = Math.max(0, nrm[i * 3 + 2] / nl);
    // on the face, the front (cheeks, forehead) catches the sun; elsewhere flatness alone
    bias[i] = flat * (1 - faceMask[i] * 0.6 * (1 - facing));
  }
  // smooth, so the bias follows broad areas rather than individual vertices
  const nb = Array.from({ length: n }, () => []);
  for (let t = 0; t < T.length; t += 3) { const a = T[t], b = T[t + 1], c = T[t + 2]; nb[a].push(b, c); nb[b].push(a, c); nb[c].push(a, b); }
  for (let it = 0; it < 6; it++) {
    const q = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = bias[i]; for (const j of nb[i]) s += bias[j]; q[i] = s / (nb[i].length + 1); }
    bias = q;
  }
  return bias;
}

export function makeSkinDetail(THREE, meta, material, geometry) {
  const P = meta.positions, n = meta.vertexCount;
  geometry.setAttribute('basePos', new THREE.BufferAttribute(Float32Array.from(P), 3));
  const mask = new Float32Array(n);
  for (let i = 0; i < n; i++) { const y = P[i * 3 + 1], u = Math.min(1, Math.max(0, (y - 6.15) / 0.4)); mask[i] = u * u * (3 - 2 * u); }
  geometry.setAttribute('faceMask', new THREE.BufferAttribute(mask, 1));
  {
    const Tt = meta.bodyTris, BN = new Float32Array(n * 3);
    for (let t = 0; t < Tt.length; t += 3) {
      const a = Tt[t], b = Tt[t + 1], c = Tt[t + 2];
      const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
      const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const i of [a, b, c]) { BN[i * 3] += nx; BN[i * 3 + 1] += ny; BN[i * 3 + 2] += nz; }
    }
    for (let i = 0; i < n; i++) { const l = Math.hypot(BN[i * 3], BN[i * 3 + 1], BN[i * 3 + 2]) || 1; BN[i * 3] /= l; BN[i * 3 + 1] /= l; BN[i * 3 + 2] /= l; }
    geometry.setAttribute('baseNrm', new THREE.BufferAttribute(BN, 3));
  }
  geometry.setAttribute('freckleBias', new THREE.BufferAttribute(freckleBias(meta, mask), 1));
  // lips and eyelids (by their skin weights) never get freckles or moles
  const names = meta.skeleton.map(b => b.name), keepOff = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < 4; k++) { const b = names[meta.skinIndex[i * 4 + k]]; if (b.startsWith('oris') || b.startsWith('orbicularis')) s += meta.skinWeight[i * 4 + k] / 255; }
    keepOff[i] = 1 - Math.min(1, Math.max(0, (s - 0.12) / 0.3));
  }
  geometry.setAttribute('spotMask', new THREE.BufferAttribute(keepOff, 1));

  const U = {
    uFreck: { value: [new THREE.Vector4(), new THREE.Vector4()] }, uMole: { value: [new THREE.Vector4(), new THREE.Vector4()] },
    uPig: { value: [new THREE.Vector4(), new THREE.Vector4()] }, uRough: { value: [new THREE.Vector4(), new THREE.Vector4()] },
    uMove: { value: [new THREE.Vector4(), new THREE.Vector4()] }, uMoveP: { value: [new THREE.Vector4(), new THREE.Vector4()] },
    uCover: { value: new THREE.Vector4() }, uCovA: { value: new THREE.Color() }, uCovB: { value: new THREE.Color() },
    uCovC: { value: new THREE.Color(0.1, 0.07, 0.05) }, uNoseCol: { value: new THREE.Color(0.5, 0.25, 0.25) }, uFurPat: { value: 0 }, uLuster: { value: 0 },
    uFreckCol: { value: [new THREE.Color(), new THREE.Color()] }, uMoleCol: { value: [new THREE.Color(), new THREE.Color()] },
    uPatchCol: { value: [new THREE.Color(), new THREE.Color()] }, uScarCol: { value: [new THREE.Color(), new THREE.Color()] },
    uScarA: { value: Array.from({ length: MAX_SCARS }, () => new THREE.Vector4()) }, uScarB: { value: Array.from({ length: MAX_SCARS }, () => new THREE.Vector4()) },
  };
  material.extensions = { derivatives: true };
  const patch = (sh, shellU) => {
    Object.assign(sh.uniforms, U);
    if (shellU) Object.assign(sh.uniforms, shellU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 basePos;\nattribute float faceMask;\nattribute float freckleBias;\nattribute float spotMask;\nattribute vec3 baseNrm;\nvarying vec3 vBaseN;\nvarying vec3 vBase;\nvarying float vFace;\nvarying float vFreckleBias;\nvarying float vSpotMask;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBase = basePos; vBaseN = baseNrm; vFace = faceMask; vFreckleBias = freckleBias; vSpotMask = spotMask;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec4 uFreck[2]; uniform vec4 uMole[2]; uniform vec4 uPig[2]; uniform vec4 uRough[2]; uniform vec4 uMove[2]; uniform vec4 uMoveP[2];
uniform vec4 uCover; uniform vec3 uCovA; uniform vec3 uCovB; uniform vec3 uCovC; uniform vec3 uNoseCol; uniform float uFurPat; uniform float uLuster;
varying vec3 vBaseN;
uniform vec3 uFreckCol[2]; uniform vec3 uMoleCol[2]; uniform vec3 uPatchCol[2]; uniform vec3 uScarCol[2];
varying float vFreckleBias; varying float vSpotMask;
uniform vec4 uScarA[${MAX_SCARS}]; uniform vec4 uScarB[${MAX_SCARS}];
varying vec3 vBase; varying float vFace;
${GLSL_NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec4 fr = mix(uFreck[1], uFreck[0], vFace), mo = mix(uMole[1], uMole[0], vFace);
  vec4 pg = mix(uPig[1], uPig[0], vFace), rg = mix(uRough[1], uRough[0], vFace);
  vec4 mv = mix(uMove[1], uMove[0], vFace), mvp = mix(uMoveP[1], uMoveP[0], vFace);
  float skinH = 0.0, skinRough = 0.0;
#ifndef SKIN_SHELL
  // pigment patches (x: amount, y: size, z: tone -1 lighter .. +1 darker). The pattern is fixed;
  // size grows each patch, amount sets how strong it is.
  if (pg.x > 0.0) {
    float nz = sdFbm((vBase + vec3(mvp.xy, 0.0)) * 1.6);
    float edge = 0.66 - 0.16 * pg.y;
    float pat = smoothstep(edge, edge + 0.07, nz);
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(uPatchCol[1], uPatchCol[0], vFace), pat * pg.x * 0.85);
  }
  // freckles (x: amount, y: size, z: clustering). Favor flat, outward-facing skin (cheeks,
  // forehead, shoulders) over eyelids, the nose and creases; clustering groups them in patches.
  if (fr.x > 0.0) {
    vec3 q = vBase + vec3(mv.xy, 0.0);
    vec2 w = sdWorley(q * 32.0);
    float clump = smoothstep(0.35, 0.75, sdFbm(q * 2.2));
    float density = min(1.0, 1.4 * fr.x * mix(1.0, clump * 1.6, fr.z) * mix(1.0, vFreckleBias, 0.8));
    float r = 0.22 * fr.y;
    float spot = (1.0 - smoothstep(r, r + 0.12, w.x)) * step(w.y, density) * sdAA(9.0) * vSpotMask;
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(uFreckCol[1], uFreckCol[0], vFace), spot * (0.55 + 0.3 * w.y));
  }
  // moles (x: amount, y: size): rarer, darker, barely raised; fixed positions, size grows each one
  if (mo.x > 0.0) {
    vec2 w = sdWorley((vBase + vec3(mv.zw, 0.0)) * 4.5);
    float r = 0.05 * mo.y;
    float spot = (1.0 - smoothstep(r, r + 0.06, w.x)) * step(w.y, mo.x * 0.22) * vSpotMask;
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(uMoleCol[1], uMoleCol[0], vFace), spot * 0.9);
    skinH += spot * 0.15;
  }
#endif
  // species covering (uCover: x type 1 scales / 2 feathers / 3 fur, y face amount, z body amount, w size).
  // Coverage fades in through soft-edged patches, and stays off the lips and eyelids.
  if (uCover.x > 0.5) {
    float amt = mix(uCover.z, uCover.y, vFace);
    float cov = smoothstep(1.0 - amt - 0.08, 1.0 - amt + 0.08, 0.5 + 0.5 * (sdFbm(vBase * 0.9) - 0.5) * 1.6 + amt * 0.0) * mix(1.0, vSpotMask, 0.8);
    cov = amt >= 0.999 ? mix(1.0, vSpotMask, 0.8) : cov;
    if (cov > 0.0) {
      vec3 col = uCovA; float h = 0.0, rgh = 0.0;
      if (uCover.x < 1.5) {
        // scales: rounded plates with grooves between them; a few lighter plates
        vec3 w = sdWorley2(vBase * 11.0 * uCover.w);
        float groove = smoothstep(0.0, 0.12, w.y - w.x), dome = 1.0 - smoothstep(0.0, 0.7, w.x);
        col = mix(uCovA, uCovB, step(0.72, w.z) * 0.6 + dome * 0.25) * (0.65 + 0.35 * groove);
        h = groove * 0.6 + dome * 0.6; rgh = -0.3;
      } else if (uCover.x < 2.5) {
        // feathers: long cells pointing down, each with a center shaft, lighter toward its tip,
        // and shaded darker at the top where the feather above overlaps it
        vec3 q = vBase * 6.0 * uCover.w * vec3(1.0, 0.4, 1.0);
        vec4 w = sdWorleyV(q);
        vec3 w2 = sdWorley2(q);
        float along = clamp(-w.y * 1.2 + 0.5, 0.0, 1.0);                 // 0 at the top of the feather, 1 at the tip
        float shaft = 1.0 - smoothstep(0.015, 0.05, abs(w.x + w.z * 0.3));
        float edge = smoothstep(0.0, 0.15, w2.y - w2.x);
        float barbs = 0.5 + 0.5 * sin((w.x - w.y * 0.6) * 140.0);
        col = mix(uCovA, uCovB, smoothstep(0.45, 1.0, along) * 0.8 + w.w * 0.15) * (0.62 + 0.38 * edge) * (0.92 + 0.08 * barbs);
        col = mix(col, uCovB * 1.1, shaft * 0.5);
        h = edge * 0.5 + along * 0.5 + shaft * 0.15; rgh = 0.1;
      } else if (uCover.x > 3.5) {
        // fish scales: even rows laid on the skin (projected from the side the surface faces)
        vec3 nb = abs(vBaseN); nb /= (nb.x + nb.y + nb.z);
        float fr = 26.0 * uCover.w;
        vec2 a1 = sdFishScales(vec2(vBase.z, vBase.y) * fr), a2 = sdFishScales(vec2(vBase.x, vBase.y) * fr), a3 = sdFishScales(vec2(vBase.x, vBase.z) * fr);
        vec2 sc = a1 * nb.x + a2 * nb.z + a3 * nb.y;
        col = mix(uCovA, uCovB, 0.25 + 0.5 * sc.y) * (0.7 + 0.3 * (1.0 - sc.x));
        h = sc.y * 0.7 + (1.0 - sc.x) * 0.3; rgh = -0.12;
      } else {
        // fur: fine strands running downward, clumped, with soft variation
        float strands = sdFbm(vBase * vec3(90.0, 9.0, 90.0) * uCover.w), clump = sdFbm(vBase * 6.0 * uCover.w);
        // zones (neutral body): lighter muzzle and chest/belly, the nose pad
        float muzzle = vFace * smoothstep(0.95, 1.3, vBase.z) * smoothstep(7.2, 6.9, vBase.y);
        float chest = (1.0 - vFace) * smoothstep(0.1, 0.6, vBaseN.z) * (1.0 - smoothstep(0.3, 0.6, abs(vBase.x))) * step(1.2, vBase.y);
        float nose = vFace * (1.0 - smoothstep(0.06, 0.13, length(vBase - vec3(0.0, 7.03, 1.62))));
        float ext = max(smoothstep(3.7, 4.4, abs(vBase.x)), smoothstep(-6.4, -7.2, vBase.y));   // hands and feet
        vec3 c = uCovA;
        if (uFurPat > 0.5 && uFurPat < 1.5) {                               // tabby stripes
          float st = sin(vBase.y * 16.0 + sdFbm(vBase * 2.2) * 5.0 + atan(vBase.x, vBase.z) * 1.5);
          c = mix(c, uCovC, smoothstep(0.45, 0.75, st) * 0.85);
        } else if (uFurPat > 1.5 && uFurPat < 2.5) {                        // rosettes
          vec3 w = sdWorley2(vBase * 5.0);
          float ring = smoothstep(0.34, 0.26, w.x) - smoothstep(0.2, 0.12, w.x) * 0.6;
          c = mix(c, uCovC, clamp(ring, 0.0, 1.0) * step(0.25, w.z) * 0.9);
        } else if (uFurPat > 2.5 && uFurPat < 3.5) {                        // points: darker face, hands, feet
          c = mix(c, uCovC, max(vFace * (1.0 - muzzle * 0.4) * 0.85, ext));
        } else if (uFurPat > 3.5) {                                         // tuxedo: dark coat, white front and paws
          c = uCovC; muzzle = max(muzzle, 0.0); chest = smoothstep(0.0, 0.4, vBaseN.z) * (1.0 - smoothstep(0.4, 0.8, abs(vBase.x))) * (1.0 - vFace * 0.5); ext = ext;
          c = mix(c, uCovB, max(chest, ext));
        }
        c = mix(c, uCovB, max(muzzle, chest * 0.85) * (uFurPat > 3.5 ? 0.0 : 1.0));
        c = mix(c, uNoseCol, nose);
        col = c * (0.82 + 0.3 * strands) * (0.92 + 0.12 * clump);
        h = strands * 0.7 * (1.0 - nose); rgh = 0.25;
      }
      diffuseColor.rgb = mix(diffuseColor.rgb, col, cov);
      skinH = mix(skinH, h, cov); skinRough += (rgh - 0.35 * uLuster) * cov;   // luster: matte (-1) .. glossy (+1)
    }
  }
#ifndef SKIN_SHELL
  // scars: paler, a little pink, raised, smoother
  for (int k = 0; k < ${MAX_SCARS}; k++) {
    if (uScarB[k].w <= 0.0) continue;
    float wdt = uScarA[k].w * (0.75 + 0.5 * sdNoise(vBase * 40.0));
    float d = sdSeg(vBase, uScarA[k].xyz, uScarB[k].xyz), s = (1.0 - smoothstep(wdt * 0.35, wdt, d)) * uScarB[k].w;
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(uScarCol[1], uScarCol[0], vFace), s * 0.6);
    skinH += s * 0.8; skinRough -= s * 0.25;
  }
  // skin texture: pore-scale bumps and roughness variation
  if (rg.x > 0.0) {
    float fade = sdAA(rg.y * 0.5);
    if (fade > 0.01) {
      float pores = sdFbm(vBase * rg.y);
      skinH += (pores - 0.5) * 0.9 * rg.x * fade;
      diffuseColor.rgb *= 1.0 + (pores - 0.5) * rg.x * 0.04 * fade;
      skinRough += rg.x * 0.12 * (pores - 0.3);
    }
  }
#endif`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = clamp(roughnessFactor + skinRough, 0.2, 1.0);')
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
  {
    // bump from the detail height (screen-space derivatives, as in standard bump mapping)
    vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
    float hx = dFdx(skinH) * 0.0012, hy = dFdy(skinH) * 0.0012;
    vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
    float det = dot(sx, r1);
    vec3 grad = sign(det) * (hx * r1 + hy * r2);
    normal = normalize(abs(det) * normal - grad);
  }`);
    if (!shellU) {
      // skin lets light in: the diffuse light wraps past the shadow line, more in red than in green and blue (a cheap
      // subsurface scattering — the soft, warm terminator of real skin instead of a hard plastic edge). uSkinWrap per
      // channel; the creator's species covering lowers it (fur and scales scatter less)
      sh.uniforms.uSkinWrap = skinWrap;
      const D = 'reflectedLight.directDiffuse += ( 1.0 - clearcoatDHR ) * irradiance * BRDF_Diffuse_Lambert( material.diffuseColor );';
      const chunk = THREE.ShaderChunk.lights_physical_pars_fragment;
      if (chunk.includes(D)) sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uSkinWrap;')
        .replace('#include <lights_physical_pars_fragment>', chunk.replace(D, `{ float sNL = dot( geometry.normal, directLight.direction ); vec3 sW = clamp( ( vec3( sNL ) + uSkinWrap ) / ( 1.0 + uSkinWrap ), 0.0, 1.0 );
          sW *= sW * ( 3.0 - 2.0 * sW ) * 0.35 + 0.65;   // (a softer, rounder fall-off)
          vec3 sIrr = sW * directLight.color * PI;
          reflectedLight.directDiffuse += ( 1.0 - clearcoatDHR ) * sIrr * BRDF_Diffuse_Lambert( material.diffuseColor ); }`));
    }
    if (shellU) {
      // shell fur / feathers: this copy of the body is pushed out along the skin's normal (and
      // combed a little downward), and cut to fewer, thinner strands the further out it is
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uShellOff; uniform float uShellT;\nattribute float clothed;\nvarying float vClothed;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvClothed = clothed;\ntransformed += objectNormal * uShellOff + vec3(0.0, -1.0, 0.0) * uShellOff * 0.5 * uShellT;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#define SKIN_SHELL\n#include <common>\nuniform float uShellT; uniform float uShellDen;\nvarying float vClothed;')
        .replace('  vec4 fr = mix(uFreck[1]', `  // shells: throw away empty pixels first, before any pattern work (most of a shell is empty)
  if (uCover.x < 1.5 || uCover.x > 3.5 || vClothed > 0.5) discard;
  {
    bool feather = uCover.x < 2.5;
    vec3 q = vBase * uShellDen * (feather ? vec3(1.0, 0.4, 1.0) : vec3(1.0));
    vec3 id = floor(q), f = fract(q) - 0.5 - (sdHash33(id) - 0.5) * 0.5;
    float strand = (1.0 - length(f) * (feather ? 1.6 : 2.3)) * (0.65 + 0.35 * sdHash13(id + 7.0));
    if (strand < uShellT * (feather ? 0.75 : 0.9)) discard;
  }
  vec4 fr = mix(uFreck[1]`)
        .replace('      diffuseColor.rgb = mix(diffuseColor.rgb, col, cov);', `      if (cov < 0.5) discard;
      col *= 0.6 + 0.45 * uShellT;                                     // darker at the roots, lighter at the tips
      diffuseColor.rgb = mix(diffuseColor.rgb, col, cov);`);
    }
  };
  const skinWrap = { value: new THREE.Vector3(0.42, 0.17, 0.11) };
  material.onBeforeCompile = sh => patch(sh, null);
  material.needsUpdate = true;
  // which skin is under clothing (shells skip it)
  const clothedAttr = new THREE.BufferAttribute(new Float32Array(n), 1);
  geometry.setAttribute('clothed', clothedAttr);
  // a shell layer's material: i of count, sharing every detail uniform with the skin
  const shells = [];
  function shellMaterial(i, count) {
    const m = new THREE.MeshStandardMaterial({ color: material.color, roughness: 0.85, skinning: true });
    m.extensions = { derivatives: true };
    const su = { uShellOff: { value: 0 }, uShellT: { value: (i + 1) / count }, uShellDen: { value: 70 } };
    m.onBeforeCompile = sh => patch(sh, su);
    shells.push({ m, su, i, count });
    return m;
  }
  // fur length in decimeters; density in strands per decimeter
  function setShells(length, density) {
    for (const s of shells) { s.su.uShellOff.value = length * (s.i + 1) / s.count; s.su.uShellDen.value = density; s.m.color = material.color; }
  }
  function setClothed(arr) { clothedAttr.array.set(arr); clothedAttr.needsUpdate = true; }

  // neutral normals (to lay scars flat on the skin) and a grid for snapping points to the surface
  const NN = new Float32Array(n * 3), T = meta.bodyTris;
  for (let t = 0; t < T.length; t += 3) {
    const a = T[t], b = T[t + 1], c = T[t + 2];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) { NN[i * 3] += nx; NN[i * 3 + 1] += ny; NN[i * 3 + 2] += nz; }
  }
  for (let i = 0; i < n; i++) { const l = Math.hypot(NN[i * 3], NN[i * 3 + 1], NN[i * 3 + 2]) || 1; NN[i * 3] /= l; NN[i * 3 + 1] /= l; NN[i * 3 + 2] /= l; }
  const cell = 0.2, grid = new Map(), key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (let i = 0; i < meta.bodyVertexCount; i++) { const k = key(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); (grid.get(k) || grid.set(k, []).get(k)).push(i); }
  const snap = (p, nrm) => {
    // nearest skin point to p, searching along the scar's normal so points stay on the same side of the body
    let best = -1, bd = 1e9;
    const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell), cz = Math.floor(p[2] / cell);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const L = grid.get(`${cx + a},${cy + b},${cz + c}`); if (!L) continue;
      for (const i of L) {
        if (NN[i * 3] * nrm[0] + NN[i * 3 + 1] * nrm[1] + NN[i * 3 + 2] * nrm[2] < 0.3) continue;
        const d = (P[i * 3] - p[0]) ** 2 + (P[i * 3 + 1] - p[1]) ** 2 + (P[i * 3 + 2] - p[2]) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
    }
    return best < 0 ? p : [P[best * 3], P[best * 3 + 1], P[best * 3 + 2]];
  };
  // a placed scar -> segments [a, b, width] on the neutral skin
  const scarSegments = sc => {
    const i = sc.at, c = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], nrm = [NN[i * 3], NN[i * 3 + 1], NN[i * 3 + 2]];
    // tangent frame: "across" is horizontal along the skin, "up" completes it
    let t1 = [nrm[2], 0, -nrm[0]]; let l = Math.hypot(...t1); if (l < 0.2) { t1 = [1, 0, 0]; l = 1; }
    t1 = t1.map(v => v / l);
    const t2 = [nrm[1] * t1[2] - nrm[2] * t1[1], nrm[2] * t1[0] - nrm[0] * t1[2], nrm[0] * t1[1] - nrm[1] * t1[0]];
    const ca = Math.cos(sc.angle), sa = Math.sin(sc.angle), size = 0.25 * Math.exp(0.9 * sc.size);
    const width = 0.03 * Math.exp(0.7 * sc.width) * (SCAR_TYPES[sc.type].round ? 2.2 : 1);
    const segs = [];
    for (const line of SCAR_TYPES[sc.type].lines) {
      const pts = line.map(([u, v]) => {
        const x = (u * ca - v * sa) * size, y = (u * sa + v * ca) * size;
        return snap([c[0] + t1[0] * x + t2[0] * y, c[1] + t1[1] * x + t2[1] * y, c[2] + t1[2] * x + t2[2] * y], nrm);
      });
      for (let k = 0; k < pts.length - 1; k++) segs.push([pts[k], pts[k + 1], width]);
    }
    return segs;
  };
  // species covering: type 'scales' | 'feathers' | 'fur' | null, amounts per region, size, colors
  function setCover(c, colA, colB) {
    const type = { scales: 1, feathers: 2, fur: 3, fishscales: 4 }[c && c.type] || 0;
    U.uFurPat.value = c && c.pattern ? c.pattern : 0;
    U.uLuster.value = c && c.luster ? c.luster : 0;
    if (c && c.patternColor) U.uCovC.value.copy(new THREE.Color(c.patternColor).convertSRGBToLinear()); else if (colA) U.uCovC.value.copy(colA).multiplyScalar(0.35);
    if (c && c.noseColor) U.uNoseCol.value.copy(new THREE.Color(c.noseColor).convertSRGBToLinear()); else U.uNoseCol.value.setRGB(0.45, 0.22, 0.22);
    U.uCover.value.set(type, c ? c.face : 0, c ? c.body : 0, c ? Math.exp(-0.7 * (c.size || 0)) : 1);
    if (colA) U.uCovA.value.copy(colA); if (colB) U.uCovB.value.copy(colB);
  }
  function apply(settings) {
    ['face', 'body'].forEach((region, r) => {
      const o = settings[region];
      U.uFreck.value[r].set(o.freckles, Math.exp(0.55 * o.freckleSize), o.freckleCluster, 0);
      U.uMole.value[r].set(o.moles, Math.exp(0.7 * o.moleSize), 0, 0);
      U.uPig.value[r].set(o.patches, o.patchSize, 0, 0);
      const lin = c => new THREE.Color(c).convertSRGBToLinear();
      U.uFreckCol.value[r].copy(lin(o.freckleColor)); U.uMoleCol.value[r].copy(lin(o.moleColor));
      U.uPatchCol.value[r].copy(lin(o.patchColor)); U.uScarCol.value[r].copy(lin(o.scarColor));
      // moves: freckles and moles shift within about a hand's width, patches further
      U.uMove.value[r].set(o.freckleX * 0.6, o.freckleY * 0.6, o.moleX * 1.5, o.moleY * 1.5);
      U.uMoveP.value[r].set(o.patchX * 3, o.patchY * 3, 0, 0);
      U.uRough.value[r].set(o.texture, 55 / Math.exp(0.7 * o.textureScale), 0, 0);
    });
    let k = 0;
    for (const sc of settings.scars) for (const [a, b, w] of scarSegments(sc)) {
      if (k >= MAX_SCARS) break;
      U.uScarA.value[k].set(a[0], a[1], a[2], w); U.uScarB.value[k].set(b[0], b[1], b[2], 1); k++;
    }
    for (; k < MAX_SCARS; k++) U.uScarB.value[k].w = 0;
  }
  // how much light the skin lets through (0 none .. 1.6); saved with the look
  function setTranslucency(k) { skinWrap.value.set(0.42, 0.17, 0.11).multiplyScalar(Math.max(0, k)); }
  return { apply, setCover, shellMaterial, setShells, setClothed, setTranslucency };
}
