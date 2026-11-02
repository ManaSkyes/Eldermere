// src/game/batVat.js — the Nocturian swarm drawn from the Blender model with baked wing animation (VAT).
//
// Data: data/creatures/nocturian_bat/ (made in art/blender/nocturian_bat.blend):
//   nocturian_bat.json + .bin   3 LODs; per LOD: uv, part mask, indices, and for each animation (hover, cruise)
//                               24 frames of vertex positions (half float) and normals (int8).
//   color.png / normal.png      one baked texture sheet shared by every LOD.
// Every bat is one instance: its wings animate entirely on the GPU (the vertex shader reads its own position from the
// animation texture), so the CPU only writes a matrix and four numbers per bat. Instances are grouped by 20 m world
// cell and LOD so whole groups frustum-cull; that is one draw call per occupied cell per LOD.
// Part mask (vertex colour from Blender): R = membrane (0 on a finger bone → 1 midway between bones),
// G = eye. The fantasy look is shader-only: membranes dissolve into dithered smoke between the bones, eyes glow.
const BASE = new URL('../../data/creatures/nocturian_bat/', import.meta.url).href;   // relative to this file, so any page can load it
const LOD_DIST = [22, 55];          // metres: LOD0 nearer than 22 m, LOD1 to 55 m, LOD2 beyond
const MODEL_SIZE = 1.6;             // the model matches the monster spec at size param 1.6
const BEAT = { hover: 5.2 / (2 * Math.PI), cruise: 5.2 / 1.6 / (2 * Math.PI) };   // wingbeats per second (monsters.js flight)

let shared = null, sharedPromise = null;
export function getBatVat(THREE) {          // load once for the whole game (swarm, bestiary)
  if (!sharedPromise) sharedPromise = loadBatVat(THREE).then(d => (shared = d));
  return sharedPromise;
}
export const loadedBatVat = () => shared;
export async function loadBatVat(THREE) {
  const [meta, bin] = await Promise.all([
    fetch(BASE + 'nocturian_bat.json').then(r => { if (!r.ok) throw new Error('bat model json ' + r.status); return r.json(); }),
    fetch(BASE + 'nocturian_bat.bin').then(r => { if (!r.ok) throw new Error('bat model bin ' + r.status); return r.arrayBuffer(); }),
  ]);
  const tl = new THREE.TextureLoader();
  const load = url => new Promise((res, rej) => tl.load(BASE + url, res, undefined, rej));
  const [color, normal] = await Promise.all([load('color.png'), load('normal.png')]);
  color.encoding = THREE.sRGBEncoding;   // (flipY stays true: Blender UVs have their origin bottom-left, like GL)
  const F = meta.frames;
  const lods = meta.lods.map(L => {
    const N = L.verts, geo = new THREE.BufferGeometry();
    const uv = new Float32Array(bin, L.uv, N * 2), part = new Uint8Array(bin, L.part, N * 4);
    const index = L.indexType === 'u16' ? new Uint16Array(bin, L.index, L.tris * 3) : new Uint32Array(bin, L.index, L.tris * 3);
    const vid = new Float32Array(N); for (let i = 0; i < N; i++) vid[i] = (i + .5) / N;
    const tex = {};
    for (const [name, A] of Object.entries(L.anims)) {
      const half = new Uint16Array(bin, A.pos, F * N * 3), p4 = new Uint16Array(F * N * 4);
      for (let i = 0, j = 0; i < F * N; i++, j += 3) { p4[i * 4] = half[j]; p4[i * 4 + 1] = half[j + 1]; p4[i * 4 + 2] = half[j + 2]; }
      const n8 = new Int8Array(bin, A.nrm, F * N * 4), nu = new Uint8Array(F * N * 4);
      for (let i = 0; i < nu.length; i++) nu[i] = n8[i] + 128;
      const pt = new THREE.DataTexture(p4, N, F, THREE.RGBAFormat, THREE.HalfFloatType);
      const nt = new THREE.DataTexture(nu, N, F, THREE.RGBAFormat, THREE.UnsignedByteType);
      for (const t of [pt, nt]) { t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.flipY = false; t.needsUpdate = true; }
      tex[name] = { pos: pt, nrm: nt };
      if (name === 'hover') {   // rest attributes: frame 0 of hover (three needs position/normal; the shader replaces them)
        const pos = new Float32Array(N * 3), nrm = new Float32Array(N * 3);
        const f16 = h => { const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, m = h & 1023; return e === 0 ? s * 2 ** -14 * (m / 1024) : e === 31 ? 0 : s * 2 ** (e - 15) * (1 + m / 1024); };
        for (let i = 0; i < N * 3; i++) { pos[i] = f16(half[i]); nrm[i] = 0; }
        for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) nrm[i * 3 + c] = n8[i * 4 + c] / 127;
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      }
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('part', new THREE.BufferAttribute(part, 4, true));
    geo.setAttribute('vatU', new THREE.BufferAttribute(vid, 1));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    return { geo, tex, N, tris: L.tris };
  });
  return { meta, lods, color, normal };
}

function makeMaterials(THREE, data, uTime) {
  const F = data.meta.frames;
  return data.lods.map(L => {
    const m = new THREE.MeshStandardMaterial({ map: data.color, normalMap: data.normal, roughness: .82, metalness: 0, side: THREE.DoubleSide });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, { uTime, uFrames: { value: F },
        uPosH: { value: L.tex.hover.pos }, uNrmH: { value: L.tex.hover.nrm }, uPosC: { value: L.tex.cruise.pos }, uNrmC: { value: L.tex.cruise.nrm },
        uSmokeColor: { value: new THREE.Color('#1a0b33') }, uEye: { value: new THREE.Color('#8f55ff').multiplyScalar(2.6) }, uSmokeGlow: { value: new THREE.Color('#3b1a7a') } });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
attribute float vatU; attribute vec4 part; attribute vec4 iAnim;
uniform sampler2D uPosH, uNrmH, uPosC, uNrmC; uniform float uFrames;
varying vec4 vPart; varying vec2 vSmokeUv;
vec3 vatN(sampler2D t, vec2 c) { return texture2D(t, c).xyz * (255.0 / 127.0) - (128.0 / 127.0); }`)
        .replace('#include <beginnormal_vertex>', `
float vf = fract(iAnim.x) * uFrames, f0 = floor(vf), ft = vf - f0, f1 = mod(f0 + 1.0, uFrames);
vec2 c0 = vec2(vatU, (f0 + .5) / uFrames), c1 = vec2(vatU, (f1 + .5) / uFrames);
vec3 vatP = mix(mix(texture2D(uPosH, c0).xyz, texture2D(uPosH, c1).xyz, ft), mix(texture2D(uPosC, c0).xyz, texture2D(uPosC, c1).xyz, ft), iAnim.y);
vec3 objectNormal = normalize(mix(mix(vatN(uNrmH, c0), vatN(uNrmH, c1), ft), mix(vatN(uNrmC, c0), vatN(uNrmC, c1), ft), iAnim.y));
#ifdef USE_TANGENT
vec3 objectTangent = vec3(tangent.xyz);
#endif
vPart = part; vSmokeUv = uv * 6.0 + iAnim.z;`)
        .replace('#include <begin_vertex>', 'vec3 transformed = vatP;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
uniform float uTime; uniform vec3 uSmokeColor, uEye, uSmokeGlow; varying vec4 vPart; varying vec2 vSmokeUv;
float h21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
float smoke = clamp(vPart.r, 0.0, 1.0), wisp = 0.0;
if (smoke > 0.02) {
  vec2 q = vSmokeUv + vec2(uTime * .07, -uTime * .11);
  wisp = vnoise(q * 3.0) * .6 + vnoise(q * 7.0) * .4;
  float a = 1.0 - smoke * smoke * (.35 + .75 * wisp);           // solid along the bones, smoke midway between them
  vec2 bp = mod(floor(gl_FragCoord.xy), 4.0);                      // stable 4x4 Bayer dither: no sorting, no shimmer
  float bayer = (mod(bp.x + bp.y * 2.0, 4.0) * 4.0 + mod(bp.x * 2.0 + bp.y * 3.0, 4.0) + .5) / 16.0;
  if (a < bayer) discard;
  diffuseColor.rgb = mix(diffuseColor.rgb, uSmokeColor, smoke * .55);
}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += uEye * vPart.g + uSmokeGlow * smoke * wisp * .35;`);
    };
    m.customProgramCacheKey = () => 'batVat' + L.N;
    return m;
  });
}

// One flapping bat for the Bestiary page: { root, update(dt) }.
export function createBatShowcase(THREE, data) {
  const uTime = { value: 0 }, mat = makeMaterials(THREE, data, uTime)[0], base = data.lods[0].geo, geo = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(base.attributes)) geo.setAttribute(k, a);
  geo.setIndex(base.index); geo.computeBoundingBox(); geo.computeBoundingSphere();
  const ia = new THREE.InstancedBufferAttribute(new Float32Array([0, 0, 0, 0]), 4); geo.setAttribute('iAnim', ia);
  const mesh = new THREE.InstancedMesh(geo, mat, 1); mesh.setMatrixAt(0, new THREE.Matrix4()); mesh.frustumCulled = false;
  const root = new THREE.Group(); root.add(mesh);
  return { root, update(dt) { uTime.value += dt; ia.array[0] = (ia.array[0] + dt * BEAT.hover) % 1; ia.needsUpdate = true; },
    dispose() { geo.dispose(); mat.dispose(); } };
}

export function createBatVatSwarm(THREE, scene, data, capacity = 64) {
  const CELL = 20;
  const uTime = { value: 0 };
  const mats = makeMaterials(THREE, data, uTime);
  const buckets = new Map(), previous = new Set(), current = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let lastTime = null, batches = 0;
  const bind = new WeakMap(), mInv = new THREE.Matrix4(), mS = new THREE.Matrix4();
  // Attacks (swoop, bite) move the creature's body through its bones, not its position. While one plays, the model
  // follows the procedural body's spine bone: world = bone · (bone's bind pose relative to the creature)⁻¹ · scale.
  function followBone(A, k) {
    const C = A.C, bone = C?.bones?.['spine:0'], sk = C?.skeleton; if (!bone || !sk) return false;
    let inv = bind.get(C);
    if (!inv) { const j = sk.bones.indexOf(bone); if (j < 0) return false; inv = sk.boneInverses[j].clone(); bind.set(C, inv); }   // boneInverse = (bind pose)⁻¹
    C.sync ? C.sync() : bone.updateWorldMatrix(true, false);   // creature bones don't auto-update; sync() computes them (only attacking bats get here)
    m4.multiplyMatrices(bone.matrixWorld, inv).multiply(mS.makeScale(k, k, k));
    return true;
  }
  function makeBucket(key, gx, gz, lod) {
    const base = data.lods[lod].geo, geo = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(base.attributes)) geo.setAttribute(k, a);
    geo.setIndex(base.index);
    const bk = { key, gx, gz, lod, geo, actors: [], minY: Infinity, maxY: -Infinity, mesh: null, cap: 0 };
    grow(bk, capacity); return bk;
  }
  function grow(bk, n) {
    let cap = bk.cap || capacity; while (cap < n) cap *= 2;
    if (cap === bk.cap) return;
    if (bk.mesh) scene.remove(bk.mesh);
    bk.geo.setAttribute('iAnim', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4));
    const mesh = new THREE.InstancedMesh(bk.geo, mats[bk.lod], cap);
    mesh.name = 'Nocturian swarm (VAT) · ' + bk.key; mesh.count = 0; mesh.frustumCulled = true;
    mesh.castShadow = mesh.receiveShadow = false; mesh.userData.instancedBatSwarm = true;
    scene.add(mesh); bk.mesh = mesh; bk.cap = cap;
  }
  function beginFrame() { current.length = 0; }
  function add(actor) {
    if (!actor?.C?.root) return false;
    current.push(actor);
    if (!actor._batProxyHidden) { actor._batProxyWasVisible = actor.C.root.visible; actor._batProxyHidden = true; }
    actor.C.root.visible = false;
    return true;
  }
  function finish(time, camPos) {
    const dt = lastTime == null ? 0 : Math.min(.1, Math.max(0, time - lastTime)); lastTime = time; uTime.value = time;
    const now = new Set(current);
    for (const a of previous) if (!now.has(a) && a._batProxyHidden) { a.C.root.visible = a._batProxyWasVisible !== false; a._batProxyHidden = false; }
    for (const bk of buckets.values()) { bk.actors.length = 0; bk.minY = Infinity; bk.maxY = -Infinity; }
    for (const a of current) {
      const y = a.pos.y + (a.M.hover || 0) + (a.alt || 0);
      const d = camPos ? Math.hypot(a.pos.x - camPos.x, y - camPos.y, a.pos.z - camPos.z) : 0;
      const lod = d < LOD_DIST[0] ? 0 : d < LOD_DIST[1] ? 1 : 2;
      const gx = Math.floor(a.pos.x / CELL), gz = Math.floor(a.pos.z / CELL), key = gx + ',' + gz + '/' + lod;
      let bk = buckets.get(key); if (!bk) { bk = makeBucket(key, gx, gz, lod); buckets.set(key, bk); }
      bk.actors.push(a); bk.minY = Math.min(bk.minY, y); bk.maxY = Math.max(bk.maxY, y);
    }
    batches = 0;
    for (const bk of buckets.values()) {
      const n = bk.actors.length;
      if (!n) { scene.remove(bk.mesh); bk.geo.dispose(); buckets.delete(bk.key); continue; }
      grow(bk, n); batches++;
      const cx = (bk.gx + .5) * CELL, cz = (bk.gz + .5) * CELL, cy = (bk.minY + bk.maxY) * .5;
      bk.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, cy, cz), Math.hypot(CELL * .7072, (bk.maxY - bk.minY) * .5) + 3);
      const ia = bk.geo.attributes.iAnim, arr = ia.array;
      for (let i = 0; i < n; i++) {
        const A = bk.actors[i], k = (A.sizeK ?? MODEL_SIZE) / MODEL_SIZE;
        // wingbeat: hover when slow, cruise when moving; each bat keeps its own continuous phase
        const blend = Math.min(1, Math.max(0, ((A.moveSpeed || 0) - 1.2) / 4));
        A._vatBlend = A._vatBlend == null ? blend : A._vatBlend + (blend - A._vatBlend) * Math.min(1, dt * 3);
        const rate = BEAT.hover + (BEAT.cruise - BEAT.hover) * A._vatBlend;
        if (A._vatPhase == null) A._vatPhase = Math.random();
        A._vatPhase = (A._vatPhase + dt * rate * (.92 + ((A.presentationId || i) % 7) * .025)) % 1;
        arr[i * 4] = A._vatPhase; arr[i * 4 + 1] = A._vatBlend; arr[i * 4 + 2] = ((A.presentationId || i) * .37) % 1; arr[i * 4 + 3] = 0;
        if (A.mo?.actName && followBone(A, k)) { bk.mesh.setMatrixAt(i, m4); continue; }
        p.set(A.pos.x, A.pos.y + (A.M.hover || 0) + (A.alt || 0), A.pos.z);
        q.setFromEuler(e.set(A.pitch || 0, A.yaw || 0, 0, 'YXZ')); s.set(k, k, k);
        bk.mesh.setMatrixAt(i, m4.compose(p, q, s));
      }
      bk.mesh.count = n; bk.mesh.instanceMatrix.needsUpdate = true; ia.needsUpdate = true;
    }
    previous.clear(); for (const a of current) previous.add(a);
  }
  function dispose() {
    for (const a of previous) if (a._batProxyHidden) { a.C.root.visible = a._batProxyWasVisible !== false; a._batProxyHidden = false; }
    for (const bk of buckets.values()) { scene.remove(bk.mesh); bk.geo.dispose(); }
    buckets.clear(); for (const m of mats) m.dispose();
  }
  return { beginFrame, add, finish, dispose, get count() { return current.length; }, get batches() { return batches; }, vat: true };
}
