// src/game/umbraModel.js — the Umbrafiend's Blender model (art/blender/umbrafiend.blend; docs/CREATURE_PIPELINE.md).
//
// A charred hyena skeleton made of RIGID bone pieces: every vertex follows exactly one game bone (skull → head:0,
// jaw → jaw:0, each vertebra, rib and leg bone → its bone). So it is drawn as an ordinary skinned mesh bound to the
// creature's own bone frame (buildCreature(..., { bonesOnly: true })): the game's motion, foot IK, moves and hit
// zones drive it unchanged. The skull and jaw come from a museum scan (docs/CREDITS.md).
//
// File: data/creatures/umbrafiend/umbrafiend.json + .bin (per LOD: positions f32, normals i8x4, uvs u16x2, bone u8,
// indices u16/u32), color.png, normal.png. Geometry is in game space at size 1, default legs/tail.
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
  const [color, normal] = await Promise.all([tex('color.png'), tex('normal.png')]);
  color.encoding = THREE.sRGBEncoding; color.anisotropy = normal.anisotropy = 4;
  const material = new THREE.MeshStandardMaterial({ map: color, normalMap: normal, roughness: 0.82, metalness: 0, skinning: true });
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
    g.setIndex(new THREE.BufferAttribute(L.idx32 ? new Uint32Array(bin, L.idx, L.tris * 3) : new Uint16Array(bin, L.idx, L.tris * 3), 1));
    g.userData.bone = bone;   // index into head.bones; turned into skinIndex once the frame's bone order is known
    g.computeBoundingSphere();
    return g;
  });
  // the normal attribute is 4 x int8 (padded); three wants itemSize 3 for normals
  for (const g of lods) { const a = g.getAttribute('normal'), n = a.count, v = new Float32Array(n * 3); for (let i = 0; i < n; i++) { v[i * 3] = a.getX(i); v[i * 3 + 1] = a.getY(i); v[i * 3 + 2] = a.getZ(i); } g.setAttribute('normal', new THREE.BufferAttribute(v, 3)); }
  return { head, lods, material, restOf, order: null };
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
  data.order = key;
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
  const mesh = new THREE.SkinnedMesh(data.lods[0], data.material);
  mesh.castShadow = true; mesh.receiveShadow = false; mesh.frustumCulled = false;
  C.root.add(mesh); mesh.bind(skeleton, new THREE.Matrix4().makeScale(s, s, s));

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
      C.core = core;
    }
  }
  for (const g of glows) g.userData.base = g.material.opacity;
  C.glows = glows;   // the spec's idle() pulses C.glows

  C.mesh = mesh; C.meshes = [mesh];
  C.setLodTier = tier => { const g = data.lods[Math.min(data.lods.length - 1, tier > 0 ? 1 : 0)]; if (mesh.geometry !== g) mesh.geometry = g; };
  C.setBodyVisible = on => { mesh.visible = !!on; };
  C.setGlowsVisible = on => { for (const o of extra) o.visible = !!on; };
  C.dispose = () => {
    mesh.removeFromParent(); skeleton.dispose?.();
    for (const o of extra) { o.removeFromParent(); if (o.isSprite) o.material.dispose(); else o.geometry.dispose(); }
    eyeMat.dispose(); coreMat.dispose();
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
