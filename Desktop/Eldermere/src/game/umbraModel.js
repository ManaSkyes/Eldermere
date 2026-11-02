// src/game/umbraModel.js — the Umbrafiend's Blender model (art/blender/umbrafiend.blend; docs/CREATURE_PIPELINE.md).
//
// A charred hyena skeleton made of RIGID bone pieces: every vertex follows exactly one game bone (skull → head:0,
// jaw → jaw:0, each vertebra, rib and leg bone → its bone). So it is drawn as an ordinary skinned mesh bound to the
// creature's own bone frame (buildCreature(..., { bonesOnly: true })): the game's motion, foot IK, moves and hit
// zones drive it unchanged. The skull and jaw come from a museum scan (docs/CREDITS.md).
//
// File: data/creatures/umbrafiend/umbrafiend.json + .bin (per LOD: positions f32, normals i8x4, uvs u16x2, bone u8,
// baked ambient occlusion u8, indices u16/u32) and normal.jpg (the scan skull + jaw detail; body bones map to a flat
// corner). Geometry is in game space at size 1, default legs/tail. The charring is procedural (boneMaterial).
//
// Binding (any size or leg length): each bone's inverse is built from the bone's rest position in that size-1 model,
// scaled by the creature's size, and the mesh's bind matrix scales the model by size. A rigid piece then sits at its
// bone's actual position with its modelled offset (× size), so a longer-legged fiend just spaces its bones further apart.
import { buildCreature } from '../rpg/creature.js';
import { monsterSpec } from '../data/monsters.js';

const BASE = new URL('../../data/creatures/umbrafiend/', import.meta.url).href;
let promise = null, loaded = null;

export function loadedUmbraModel() { return loaded; }
export function getUmbraModel(THREE) {
  if (!promise) promise = load(THREE).then(d => (loaded = d)).catch(e => { console.warn('[umbrafiend] model failed to load; using the old body', e); promise = null; throw e; });
  return promise;
}

async function load(THREE) {
  const [head, bin] = await Promise.all([
    fetch(BASE + 'umbrafiend.json').then(r => { if (!r.ok) throw new Error('umbrafiend json ' + r.status); return r.json(); }),
    fetch(BASE + 'umbrafiend.bin').then(r => { if (!r.ok) throw new Error('umbrafiend bin ' + r.status); return r.arrayBuffer(); }),
  ]);
  const tl = new THREE.TextureLoader();
  const tex = f => new Promise((res, rej) => tl.load(BASE + f, res, undefined, rej));
  const normal = await tex(head.textures?.normal || 'normal.jpg'); normal.anisotropy = 4;
  const material = new THREE.MeshStandardMaterial({ normalMap: normal, roughness: 0.8, metalness: 0, skinning: true });
  // (Blender bakes OpenGL-style normals (+Y up); with flipY textures three reads them as-is: normalScale stays (1, 1))

  // the size-1 rest frame the model was built on
  const ref = buildCreature(THREE, monsterSpec('umbrafiend', { size: 1, legs: 1, tail: 1 }).spec, { bonesOnly: true });
  const restOf = name => ref.bones[name]?.userData?.rest || null;

  const lods = head.lods.map(L => {
    const g = new THREE.BufferGeometry(), n = L.verts;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bin, L.pos, n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(bin, L.nor, n * 4), 4, true));
    g.setAttribute('uv', new THREE.BufferAttribute(new Uint16Array(bin, L.uv, n * 2), 2, true));
    const bone = new Uint8Array(bin, L.bone, n);
    g.setAttribute('aAo', new THREE.BufferAttribute(new Uint8Array(bin, L.ao, n), 1, true));
    g.setIndex(new THREE.BufferAttribute(L.idx32 ? new Uint32Array(bin, L.idx, L.tris * 3) : new Uint16Array(bin, L.idx, L.tris * 3), 1));
    g.userData.bone = bone;   // index into head.bones; turned into skinIndex once the frame's bone order is known
    g.computeBoundingSphere();
    return g;
  });
  // the normal attribute is 4 x int8 (padded); three wants itemSize 3 for normals
  for (const g of lods) { const a = g.getAttribute('normal'), n = a.count, v = new Float32Array(n * 3); for (let i = 0; i < n; i++) { v[i * 3] = a.getX(i); v[i * 3 + 1] = a.getY(i); v[i * 3 + 2] = a.getZ(i); } g.setAttribute('normal', new THREE.BufferAttribute(v, 3)); }
  let hull = null;
  if (head.hull) {   // the shadow body: a hyena-shaped shell, smoothly skinned (up to 4 bones per vertex)
    const H = head.hull, n = H.verts; hull = new THREE.BufferGeometry();
    hull.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bin, H.pos, n * 3), 3));
    const nr = new Int8Array(bin, H.nor, n * 4), nv = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { nv[i * 3] = nr[i * 4] / 127; nv[i * 3 + 1] = nr[i * 4 + 1] / 127; nv[i * 3 + 2] = nr[i * 4 + 2] / 127; }
    hull.setAttribute('normal', new THREE.BufferAttribute(nv, 3));
    hull.setAttribute('skinWeight', new THREE.BufferAttribute(new Uint8Array(bin, H.weight, n * 4), 4, true));
    hull.userData.skin = new Uint8Array(bin, H.skin, n * 4);
    hull.setIndex(new THREE.BufferAttribute(new Uint16Array(bin, H.idx, H.tris * 3), 1));
  }
  return { head, lods, hull, material, restOf, order: null };
}

// Turn the per-vertex bone names into skin indices for this frame's bone order (the same for every Umbrafiend).
function skinFor(THREE, data, C) {
  const list = C.skeleton.bones, key = list.map(b => b.name).join('|');
  if (data.order === key) return;
  const map = data.head.bones.map(name => Math.max(0, list.indexOf(C.bones[name])));
  for (const g of data.lods) {
    const b = g.userData.bone, n = b.length, si = new Uint8Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = map[b[i]]; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  }
  if (data.hull) { const b = data.hull.userData.skin, si = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) si[i] = map[b[i]]; data.hull.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); }
  data.order = key;
}

// The bone material for one fiend (a clone of the shared one; the shader program itself is shared):
// - the core lights the bones from inside: a violet glow falling off with distance from the core (the ribs round it)
// - sink / rise: everything below the ground (uGround, world y) is cut away along a ragged, drifting edge that burns
//   violet, so it melts into the floor rather than sliding through it
function boneMaterial(THREE, base, U) {
  const m = base.clone();
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vUmbraW, vRest; attribute float aAo; varying float vAo;')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\nvUmbraW = (modelMatrix * vec4(transformed, 1.0)).xyz; vRest = position; vAo = aAo;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vUmbraW, vRest; varying float vAo;
uniform vec3 uCore; uniform float uCoreK, uCoreR, uGround, uTime, uMelt;
float uHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float uNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(uHash(i), uHash(i + vec2(1, 0)), f.x), mix(uHash(i + vec2(0, 1)), uHash(i + vec2(1, 1)), f.x), f.y); }
float uHash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float uNoise3(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(uHash3(i), uHash3(i + vec3(1, 0, 0)), f.x), mix(uHash3(i + vec3(0, 1, 0)), uHash3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(uHash3(i + vec3(0, 0, 1)), uHash3(i + vec3(1, 0, 1)), f.x), mix(uHash3(i + vec3(0, 1, 1)), uHash3(i + vec3(1, 1, 1)), f.x), f.y), f.z); }`)
      // charred bone, from the model-space (rest) position: soot black, brown scorching, burnt bone showing through on the
      // exposed surfaces (baked occlusion), fine soot grain, violet-black hairline cracks; hollows darkened by the occlusion
      .replace('#include <color_fragment>', `#include <color_fragment>
float cN1 = uNoise3(vRest * 7.0), cN2 = uNoise3(vRest * 22.0), cN3 = uNoise3(vRest * 140.0);
float cRidge = 1.0 - abs(uNoise3(vRest * 55.0) * 2.0 - 1.0), uCrack = smoothstep(0.965, 0.992, cRidge) * smoothstep(0.4, 0.65, uNoise3(vRest * 9.0 + 3.1));
vec3 cCol = mix(vec3(0.2, 0.17, 0.145), vec3(0.1, 0.075, 0.058), smoothstep(0.42, 0.7, cN2));   // burnt bone, scorched brown in places
cCol = mix(cCol, vec3(0.028, 0.023, 0.026), smoothstep(0.52, 0.72, cN1 + cN2 * 0.3));             // soot patches
cCol = mix(cCol, vec3(0.028, 0.023, 0.026), (1.0 - smoothstep(0.2, 0.75, vAo)) * 0.7);           // soot packed into the hollows
cCol *= 1.0 - smoothstep(0.3, 0.7, cN3) * 0.3;
cCol = mix(cCol, vec3(0.03, 0.006, 0.055), uCrack);
diffuseColor.rgb = cCol * mix(0.5, 1.0, vAo);`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
float uEdge = vUmbraW.y - uGround + (uNoise(vUmbraW.xz * 18.0 + vec2(uTime * 0.7, -uTime * 0.5)) - 0.5) * 0.08;
if (uEdge < 0.0) discard;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{ vec3 dc = vUmbraW - uCore; float k = exp(-dot(dc, dc) / (uCoreR * uCoreR));
  totalEmissiveRadiance += vec3(0.5, 0.26, 1.0) * k * uCoreK * 1.4;
  totalEmissiveRadiance += vec3(0.6, 0.3, 1.0) * uCrack * 2.5 * k * uCoreK;   // the cracks smoulder near the core
  totalEmissiveRadiance += vec3(0.55, 0.25, 1.0) * smoothstep(0.05, 0.0, uEdge) * 2.0 * uMelt; }`);
  };
  m.customProgramCacheKey = () => 'umbraBones4';
  return m;
}

// The shadow body: a hyena-shaped shell of living shadow round the bones. Dark violet smoke, dense at the silhouette and
// thin where you look straight through it (so the bones and the core show), drifting noise, a slow ripple of the surface,
// a violet rim, thinning out down the legs; lit from inside near the core; cut by the floor while it sinks / rises.
const NOISE3 = `float uHash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float uNoise3(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(uHash3(i), uHash3(i + vec3(1, 0, 0)), f.x), mix(uHash3(i + vec3(0, 1, 0)), uHash3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(uHash3(i + vec3(0, 0, 1)), uHash3(i + vec3(1, 0, 1)), f.x), mix(uHash3(i + vec3(0, 1, 1)), uHash3(i + vec3(1, 1, 1)), f.x), f.y), f.z); }`;
function hullMaterial(THREE, U) {
  return new THREE.ShaderMaterial({
    uniforms: U, skinning: true, transparent: true, depthWrite: false, side: THREE.FrontSide,
    vertexShader: `#include <common>
#include <skinning_pars_vertex>
uniform float uTime; varying vec3 vRest, vN, vV, vW;
void main() {
  #include <skinbase_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  transformed += normal * 0.012 * sin(dot(position, vec3(13.0, 17.0, 11.0)) + uTime * 1.7);   // the shadow breathes and ripples
  #include <skinning_vertex>
  #include <project_vertex>
  vRest = position; vN = normalize(normalMatrix * objectNormal); vV = -mvPosition.xyz; vW = (modelMatrix * vec4(transformed, 1.0)).xyz;
}`,
    fragmentShader: `uniform vec3 uCore; uniform float uCoreK, uCoreR, uGround, uTime, uMelt, uOpacity;
varying vec3 vRest, vN, vV, vW;
${NOISE3}
void main() {
  if (uMelt > 0.5 && vW.y < uGround) discard;
  float fres = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float n = uNoise3(vRest * 6.0 + vec3(0.0, -uTime * 0.35, uTime * 0.15)) * 0.6 + uNoise3(vRest * 15.0 + vec3(uTime * 0.2, -uTime * 0.6, 0.0)) * 0.4;
  float dens = smoothstep(0.3, 0.92, fres * 1.0 + n * 0.6 - 0.18) * smoothstep(0.04, 0.42, vRest.y);
  vec3 dc = vW - uCore; float k = exp(-dot(dc, dc) / (uCoreR * uCoreR * 2.6));
  vec3 col = mix(vec3(0.012, 0.004, 0.026), vec3(0.32, 0.13, 0.72), pow(fres, 3.0) * (0.4 + n * 0.8));
  col += vec3(0.4, 0.18, 0.9) * k * 0.45 * uCoreK;
  gl_FragColor = vec4(col, dens * uOpacity * (1.0 - 0.45 * k));
}`,
  });
}

// a soft additive glow (eyes and core)
let glowTex = null;
function glowTexture(THREE) {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); glowTex = new THREE.CanvasTexture(c); return glowTex;
}

// Dress a bones-only Umbrafiend frame in the model. size: the creature's size param.
// Adds the skinned skeleton mesh, the eyes and the core; gives C working setLodTier/update/dispose.
export function attachUmbraModel(THREE, C, data, size = 1) {
  skinFor(THREE, data, C);
  const s = size, inv = C.skeleton.bones.map(b => {
    const p = data.restOf(b.name) || b.userData.rest || new THREE.Vector3();
    return new THREE.Matrix4().makeTranslation(-p.x * s, -p.y * s, -p.z * s);
  });
  const skeleton = new THREE.Skeleton(C.skeleton.bones, inv);
  const U = { uCore: { value: new THREE.Vector3(0, -1e4, 0) }, uCoreK: { value: 1 }, uCoreR: { value: 0.16 * s }, uGround: { value: -1e4 }, uTime: { value: 0 }, uMelt: { value: 0 } };
  const mesh = new THREE.SkinnedMesh(data.lods[0], boneMaterial(THREE, data.material, U));
  mesh.castShadow = true; mesh.receiveShadow = false; mesh.frustumCulled = false;
  C.root.add(mesh); mesh.bind(skeleton, new THREE.Matrix4().makeScale(s, s, s));
  U.uOpacity = { value: 0.88 };
  let shade = null;
  if (data.hull) {
    shade = new THREE.SkinnedMesh(data.hull, hullMaterial(THREE, U)); shade.frustumCulled = false; shade.renderOrder = 2;
    shade.userData.noReflect = true; shade.userData.noCover = true;
    C.root.add(shade); shade.bind(skeleton, new THREE.Matrix4().makeScale(s, s, s));
  }
  C.uniforms.uSmoke.value = 0.7;   // (monsterActors fades this to 0 while it dies; the shadow body thins with it)

  // eyes: a hot violet-white point in each socket with a halo; the core: a burning heart inside the ribs
  const gt = glowTexture(THREE), extra = [], glows = [];
  const at = (boneName, p) => { const b = C.bones[boneName], r = data.restOf(boneName) || new THREE.Vector3(); return { b, local: new THREE.Vector3((p[0] - r.x) * s, (p[1] - r.y) * s, (p[2] - r.z) * s) }; };
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#f2e6ff' });
  const coreMat = new THREE.MeshBasicMaterial({ color: '#c79bff' });
  const halo = (color, opacity) => new THREE.SpriteMaterial({ map: gt, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
  for (const sx of [1, -1]) {
    const { b, local } = at('head:1', [0.066 * sx, 1.198, 0.805]); if (!b) continue;
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.011 * s, 10, 8), eyeMat); e.position.copy(local); b.add(e); extra.push(e);
    const h = new THREE.Sprite(halo('#9a5cff', 0.85)); h.scale.setScalar(0.09 * s); h.position.copy(local); b.add(h); extra.push(h); glows.push(h);
  }
  {
    const { b, local } = at('spine:2', [0, 0.72, 0.06]);
    if (b) {
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.032 * s, 2), coreMat); core.position.copy(local); b.add(core); extra.push(core);
      const h = new THREE.Sprite(halo('#7a3cff', 0.75)); h.scale.setScalar(0.42 * s); h.position.copy(local); b.add(h); extra.push(h); glows.push(h);
      C.core = core; C.coreHalo = h;
    }
  }
  for (const g of glows) g.userData.base = g.material.opacity;
  // per frame, just before drawing: where the core is (it lights the ribs) and where the ground is (sink / rise)
  const tmp = new THREE.Vector3();
  mesh.onBeforeRender = () => {
    U.uTime.value = performance.now() / 1000;
    if (C.core) U.uCore.value.copy(C.core.getWorldPosition(tmp));
    U.uCoreK.value = C.coreHalo ? C.coreHalo.material.opacity / (C.coreHalo.userData.base || 1) : 1;   // follows the core's pulse
    // the floor only cuts it while it sinks or rises (C.melting, set by the actor); otherwise nothing is clipped
    U.uOpacity.value = 0.88 * Math.min(1, C.uniforms.uSmoke.value / 0.7);
    U.uMelt.value = C.melting ? 1 : 0; U.uGround.value = C.melting ? (C.groundY ?? -1e4) : -1e4;
  };
  C.glows = glows;   // the spec's idle() pulses C.glows

  C.mesh = mesh; C.meshes = shade ? [mesh, shade] : [mesh];
  C.setLodTier = tier => { const g = data.lods[Math.min(data.lods.length - 1, tier > 0 ? 1 : 0)]; if (mesh.geometry !== g) mesh.geometry = g; };
  C.setBodyVisible = on => { mesh.visible = !!on; };
  C.setGlowsVisible = on => { for (const o of extra) o.visible = !!on; };
  C.setSmokeAuraVisible = on => { if (shade) shade.visible = !!on; };
  C.dispose = () => {
    mesh.removeFromParent(); skeleton.dispose?.(); if (shade) { shade.removeFromParent(); shade.material.dispose(); }
    for (const o of extra) { o.removeFromParent(); if (o.isSprite) o.material.dispose(); else o.geometry.dispose(); }
    eyeMat.dispose(); coreMat.dispose(); mesh.material.dispose();
  };
  C.root.traverse(o => { if (o.isMesh) o.userData.noLampShadow = true; });
  C.umbraModel = true;
  return C;
}

// The bestiary's turntable: a posed (rest) Umbrafiend.
export function createUmbraShowcase(THREE, data) {
  const C = buildCreature(THREE, monsterSpec('umbrafiend').spec, { bonesOnly: true });
  attachUmbraModel(THREE, C, data, 1); C.sync(); return C;
}
