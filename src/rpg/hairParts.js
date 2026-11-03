// src/rpg/hairParts.js — the new hair: modelled parts (art/blender/hair.blend, collection Parts; docs/HAIR_PARTS.md)
// combined into one mesh per character. Slots mix freely: Base (the opaque shell), Top, Front, Sides, Back, Ext.
//
// Each part was modelled on the neutral head; fitHead() maps it onto a character's actual head (scaled about the
// eyes by the cranium's size), so one set of parts fits every face. All vertices follow the head bone; the long
// pieces (ponytail, braids, side locks, back) also swing on short spring chains (R.step) and the material adds a
// Kajiya-Kay strand shine. The strand atlas (8 columns: sheet, dense, medium,
// sparse, flyaway, lock, wavy, curly; R = root→tip, G = strand id, B = depth, A = coverage) gives colour, a
// little strand variation and self-shadowing, so one atlas serves every hair colour.
//
//   const H = await loadHairParts(THREE)          H.slots: { Base: ['Base_short', …], … }
//   const R = createPartsRenderer(THREE, H, { skeleton, headIndex, bindMatrix })
//   R.build(sel, fit)    sel: { Base: 'Base_short', Front: 'Front_blunt', Ext: 'Ext_ponytail_long' … }; fit: fitHead(…)
//   R.mesh               a SkinnedMesh to add next to the body
//   R.colors(rootHex, tipHex)
const BASE = new URL('../../data/hair/', import.meta.url).href;
let loading = null;

export function loadHairParts(THREE) {
  if (loading) return loading;
  loading = (async () => {
    const meta = await (await fetch(BASE + 'parts.json')).json();
    const bin = await (await fetch(BASE + 'parts.bin')).arrayBuffer();
    const parts = {}, slots = {};
    for (const [name, p] of Object.entries(meta.parts)) {
      parts[name] = {
        slot: p.slot, verts: p.verts,
        pos: new Float32Array(bin, p.pos, p.verts * 3), nrm: new Float32Array(bin, p.nrm, p.verts * 3), uv: new Float32Array(bin, p.uv, p.verts * 2),
        t: new Float32Array(bin, p.t, p.verts), col: new Uint8Array(bin, p.col, p.verts), idx: new Uint16Array(bin, p.idx, p.tris * 3),
      };
      // a part's "_under" layer (blunt fringe, bob) goes with it automatically; braids come as a pair
      if (/_under$/.test(name) || /_R$/.test(name)) continue;
      (slots[p.slot] = slots[p.slot] || []).push(name);
    }
    const atlas = new THREE.TextureLoader().load(BASE + meta.atlas);
    atlas.anisotropy = 4; atlas.generateMipmaps = true; atlas.minFilter = THREE.LinearMipmapLinearFilter;
    return { meta, parts, slots, atlas };
  })();
  return loading;
}

// Complete styles: parts modelled together on the neutral head (art/blender/hair.blend, hair_kit.py STYLES), so they
// always sit right with each other. Add-ons hang from fixed points and go with any style.
export const HAIR_STYLES = {
  crop:     { label: 'Short crop', parts: ['Base_short'] },
  buzz:     { label: 'Buzz cut', parts: ['Base_buzz'] },
  penelo:   { label: 'Blunt fringe, long locks', parts: ['Base_short', 'Front_blunt', 'Sides_longlocks'] },
  ashe:     { label: 'Layered bob', parts: ['Base_medium', 'Back_bob', 'Front_sideswept'] },
  balthier: { label: 'Swept back', parts: ['Base_buzz', 'Top_sweptback'] },
  fran:     { label: 'Long waves', parts: ['Base_medium', 'Sides_wavy', 'Back_wavy'] },
};
export const HAIR_ADDONS = {
  braids:   { label: 'Twin braids', parts: ['Ext_braid_L'] },
  ponytail: { label: 'Long ponytail', parts: ['Ext_ponytail_long'] },
};
// a style plus add-ons → the part list build() takes
export function styleParts(style, addons = {}) {
  const st = HAIR_STYLES[style] || HAIR_STYLES.crop, out = [...st.parts];
  for (const [k, on] of Object.entries(addons)) if (on && HAIR_ADDONS[k]) out.push(...HAIR_ADDONS[k].parts);
  return out;
}

// Complete hairstyles modelled in Blender (art/blender/hair.blend, collection Styles → style_export.py): same layout
// as the parts, plus `solid` (1 = the opaque cap and braids) and 32-bit indices. Fitted to the head as one piece.
let stylesLoading = null;
export const STYLE_LABELS = { Style_penelo: 'Twin braids' };
export function loadHairStyles(THREE) {
  if (stylesLoading) return stylesLoading;
  stylesLoading = (async () => {
    const meta = await (await fetch(BASE + 'styles.json')).json();
    const bin = await (await fetch(BASE + 'styles.bin')).arrayBuffer();
    const parts = {}, slots = { Style: [] };
    for (const [name, p] of Object.entries(meta.parts)) {
      parts[name] = { slot: 'Style', verts: p.verts,
        pos: new Float32Array(bin, p.pos, p.verts * 3), nrm: new Float32Array(bin, p.nrm, p.verts * 3), uv: new Float32Array(bin, p.uv, p.verts * 2),
        t: new Float32Array(bin, p.t, p.verts), col: new Uint8Array(bin, p.col, p.verts), solid: new Uint8Array(bin, p.solid, p.verts),
        gid: new Int32Array(bin, p.gid, p.verts), idx: new Uint32Array(bin, p.idx, p.tris * 3) };
      slots.Style.push(name);
    }
    const atlas = new THREE.TextureLoader().load(BASE + meta.atlas);
    atlas.anisotropy = 4; atlas.generateMipmaps = true; atlas.minFilter = THREE.LinearMipmapLinearFilter;
    return { meta, parts, slots, atlas };
  })();
  return stylesLoading;
}

// a readable name for a part ("Front_blunt" → "Blunt", "Ext_braid_L" → "Braids")
export const partLabel = (n) => ({ Ext_braid_L: 'Twin braids', Ext_ponytail_long: 'Long ponytail' })[n] || n.split('_').slice(1).join(' ').replace(/^\w/, c => c.toUpperCase());

// how the neutral head maps onto this one: per-axis scale about the eye line, from the cranium's extent above the eyes
export function fitHead(neutralP, P, headIds, eyeY0, eyeY) {
  const box = (A, ey) => {
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (const i of headIds) { const y = A[i * 3 + 1]; if (y < ey) continue; for (let a = 0; a < 3; a++) { const v = A[i * 3 + a]; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; } }
    return { mn, mx };
  };
  const a = box(neutralP, eyeY0), b = box(P, eyeY), cl = v => Math.max(0.75, Math.min(1.35, v));
  const s = [cl((b.mx[0] - b.mn[0]) / (a.mx[0] - a.mn[0])), cl((b.mx[1] - eyeY) / (a.mx[1] - eyeY0)), cl((b.mx[2] - b.mn[2]) / (a.mx[2] - a.mn[2]))];
  const c0 = [(a.mn[0] + a.mx[0]) / 2, eyeY0, (a.mn[2] + a.mx[2]) / 2], c1 = [(b.mn[0] + b.mx[0]) / 2, eyeY, (b.mn[2] + b.mx[2]) / 2];
  return { s, c0, c1, key: [...s, ...c1].map(v => v.toFixed(4)).join(',') };
}

// Each hair vertex is tied to the four nearest neutral head vertices (its offset from their blend), so on any head it
// lands at the same place over the actual surface — follows the skull's shape, not just its size.
function bindPart(p, neutralP, headIds) {
  if (p.bind) return p.bind;
  const n = p.verts, idx = new Int32Array(n * 4), w = new Float32Array(n * 4), off = new Float32Array(n * 3);
  const hx = new Float32Array(headIds.length * 3); headIds.forEach((i, k) => { hx[k * 3] = neutralP[i * 3]; hx[k * 3 + 1] = neutralP[i * 3 + 1]; hx[k * 3 + 2] = neutralP[i * 3 + 2]; });
  const bi = [0, 0, 0, 0], bd = [0, 0, 0, 0];
  for (let v = 0; v < n; v++) {
    const x = p.pos[v * 3], y = p.pos[v * 3 + 1], z = p.pos[v * 3 + 2];
    bd.fill(1e9);
    for (let k = 0; k < headIds.length; k++) {
      const d = (hx[k * 3] - x) ** 2 + (hx[k * 3 + 1] - y) ** 2 + (hx[k * 3 + 2] - z) ** 2;
      if (d >= bd[3]) continue;
      let j = 3; while (j > 0 && bd[j - 1] > d) { bd[j] = bd[j - 1]; bi[j] = bi[j - 1]; j--; } bd[j] = d; bi[j] = k;
    }
    let ws = 0, ax = 0, ay = 0, az = 0;
    for (let j = 0; j < 4; j++) { const ww = 1 / (Math.sqrt(bd[j]) + 0.05); w[v * 4 + j] = ww; ws += ww; }
    for (let j = 0; j < 4; j++) { w[v * 4 + j] /= ws; const k = bi[j]; idx[v * 4 + j] = headIds[k]; ax += hx[k * 3] * w[v * 4 + j]; ay += hx[k * 3 + 1] * w[v * 4 + j]; az += hx[k * 3 + 2] * w[v * 4 + j]; }
    off[v * 3] = x - ax; off[v * 3 + 1] = y - ay; off[v * 3 + 2] = z - az;
  }
  return (p.bind = { idx, w, off });
}

export function createPartsRenderer(THREE, H, { skeleton, headIndex, bindMatrix }) {
  const MAXC = 4, J = 6;                                  // swing chains per character, joints per chain
  const U = { uRoot: { value: new THREE.Color('#3a2418') }, uTip: { value: new THREE.Color('#6a4a30') }, uAtlas: { value: H.atlas },
    uSwX: { value: Array.from({ length: MAXC * J }, () => new THREE.Vector3()) }, uSwR: { value: Array.from({ length: MAXC * J }, () => new THREE.Vector3()) }, uSwQ: { value: Array.from({ length: MAXC * J }, () => new THREE.Vector4(0, 0, 0, 1)) }, uShine: { value: 1 } };
  const mat = new THREE.MeshStandardMaterial({ skinning: true, side: THREE.DoubleSide, alphaTest: 0.42, roughness: 0.72, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
        attribute float aCol; attribute float aT; attribute vec2 aUv; attribute float aChain; attribute vec3 aTan; attribute float aShell; varying float vShell; attribute float aGid; varying float vGid;
        uniform vec3 uSwX[${MAXC * J}]; uniform vec3 uSwR[${MAXC * J}]; uniform vec4 uSwQ[${MAXC * J}];
        vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
        // a vertex on a swinging chain: carried by the segment it's on (rotated about its joint), blended into the next
        int swC; int swA; int swB; float swW;
        void swingSetup() {
          float f = clamp(aT, 0.0, 1.0) * ${(J - 1).toFixed(1)}; int i = int(min(floor(f), ${(J - 2).toFixed(1)}));
          swC = int(aChain + 0.5) * ${J}; swA = swC + i; swB = swC + int(min(float(i + 1), ${(J - 2).toFixed(1)})); swW = smoothstep(0.35, 1.0, f - float(i));
        }
        vec3 swingP(vec3 p) { vec3 a = uSwX[swA] + qrot(uSwQ[swA], p - uSwR[swA]); vec3 b = uSwX[swB] + qrot(uSwQ[swB], p - uSwR[swB]); return mix(a, b, swW); }
        vec3 swingN(vec3 n) { return normalize(mix(qrot(uSwQ[swA], n), qrot(uSwQ[swB], n), swW)); } varying float vCol; varying float vT; varying vec2 vHuv; varying vec3 vTan;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vCol = aCol; vT = aT; vHuv = aUv; vShell = aShell; vGid = aGid;
        // swing: the long pieces follow their chain's offset (root fixed, blended joint to joint toward the tip)
        if (aChain > -0.5) transformed = mix(transformed, swingP(transformed), smoothstep(0.08, 0.3, aT));   // the root stays with the head, the swing fades in below it`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        if (aChain > -0.5) { swingSetup(); objectNormal = normalize(mix(objectNormal, swingN(objectNormal), smoothstep(0.08, 0.3, aT))); }`)
      .replace('#include <skinnormal_vertex>', `#include <skinnormal_vertex>
        vec3 objTan = aChain > -0.5 ? swingN(aTan) : aTan;
        #ifdef USE_SKINNING
          objTan = (skinMatrix * vec4(aTan, 0.0)).xyz;
        #endif
        vTan = normalize((modelViewMatrix * vec4(objTan, 0.0)).xyz);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uRoot; uniform vec3 uTip; uniform sampler2D uAtlas; uniform float uShine; varying float vCol; varying float vT; varying vec2 vHuv; varying vec3 vTan; varying float vShell; varying float vGid;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        // the strand atlas: u tiles inside its column (clamped clear of the neighbours), v runs root → tip
        vec2 auv = vec2((floor(vCol + 0.5) + clamp(fract(vHuv.x), 0.03, 0.97)) / 8.0, vHuv.y);
        vec4 hs = texture2D(uAtlas, auv);
        float along = clamp(max(vT, hs.r), 0.0, 1.0);
        vec3 hc = mix(uRoot, uTip, smoothstep(0.15, 1.0, along));
        hc *= (0.55 + 0.45 * hs.b) * (0.9 + 0.2 * (hs.g - 0.5));          // deeper layers darker, strands vary
        diffuseColor.rgb = hc; diffuseColor.a = hs.a;
        // roots darker (light doesn't reach the scalp), each strand a little lighter or darker
        diffuseColor.rgb *= mix(vShell > 0.5 ? 0.8 : 0.45, 1.0, smoothstep(0.0, 0.35, vT)) * (0.9 + 0.18 * vGid);
        // the cap and braids stay solid (no scalp showing through); the cards' roots fade in so their ends don't show
        if (vShell > 0.5) diffuseColor.a = max(hs.a, 1.0 - smoothstep(0.72, 0.95, vT)); else diffuseColor.a *= smoothstep(0.0, 0.09, vT);
        float hStrand = hs.g, hDepth = hs.b;`)
      // Kajiya-Kay shine: two highlights along the strands (a white one shifted toward the root, a coloured one toward
      // the tip), broken up per strand, dimmer in the deep layers
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        #if NUM_DIR_LIGHTS > 0
        {
          vec3 T = normalize(vTan), Vd = normalize(vViewPosition), Nn = normal;
          float jit = (hStrand - 0.5) * 0.3;
          for (int li = 0; li < NUM_DIR_LIGHTS; li++) {
            vec3 Ld = directionalLights[li].direction, Hh = normalize(Ld + Vd);
            vec3 T1 = normalize(T + Nn * (0.12 + jit)), T2 = normalize(T + Nn * (-0.1 + jit));
            float d1 = dot(T1, Hh), d2 = dot(T2, Hh);
            float s1 = pow(max(0.0, sqrt(max(0.0, 1.0 - d1 * d1))), 90.0), s2 = pow(max(0.0, sqrt(max(0.0, 1.0 - d2 * d2))), 22.0);
            float wrap = clamp(dot(Nn, Ld) * 0.6 + 0.4, 0.0, 1.0) * (0.35 + 0.65 * hDepth);
            reflectedLight.directSpecular += directionalLights[li].color * wrap * uShine * (s1 * 0.22 + s2 * 0.16 * diffuseColor.rgb * 2.0);
          }
        }
        #endif`);
  };
  const geo = new THREE.BufferGeometry();
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.customDepthMaterial = undefined;
  let bound = false, info = { parts: 0, tris: 0 }, chains = [], headC = null, headR = 1, acc = 0;
  // list: part names (styleParts) or a slot → part map; P: this body's positions (with neutralP and headIds, the
  // parts follow the head's surface; otherwise fit scales them)
  function build(sel, fit, P0 = null, neutralP = null, headIds = null) {
    const names = [];
    for (const n of (Array.isArray(sel) ? sel : Object.values(sel || {}))) {
      if (!n || !H.parts[n]) continue;
      names.push(n);
      if (H.parts[n + '_under']) names.push(n + '_under');                         // under-layers ride along
      if (/_L$/.test(n) && H.parts[n.replace(/_L$/, '_R')]) names.push(n.replace(/_L$/, '_R'));
    }
    let nv = 0, ni = 0; for (const n of names) { nv += H.parts[n].verts; ni += H.parts[n].idx.length; }
    const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), UV = new Float32Array(nv * 2), T = new Float32Array(nv), C = new Float32Array(nv);
    const SI = new Uint16Array(nv * 4), SW = new Float32Array(nv * 4), I = new Uint32Array(ni), CH = new Float32Array(nv).fill(-1), SH = new Float32Array(nv), GI = new Float32Array(nv);
    let ov = 0, oi = 0; const groups = new Map();     // swing chain key → vertex ranges
    for (const n of names) {
      const p = H.parts[n], sw = swingOf(n);
      if (sw) for (let i = 0; i < p.verts; i++) {
        // the sides come as one part: a chain on each side of the face
        const x = p.pos[i * 3];
        const key = sw.key + (sw.split ? (x < 0 ? '.R' : '.L') : '');
        let g = groups.get(key); if (!g) { if (groups.size >= MAXC) continue; g = { id: groups.size, verts: [], stiff: sw.stiff }; groups.set(key, g); }
        g.verts.push(ov + i); CH[ov + i] = g.id;
      }
      // a complete style: its braids (strand ids 10000+, one per braid; t runs anchor → tip) each swing on a chain
      if (!sw && p.gid) for (let i = 0; i < p.verts; i++) {
        const gi = p.gid[i]; if (gi < 10000) continue;
        const key = n + '.braid' + gi;
        let g = groups.get(key); if (!g) { if (groups.size >= MAXC) continue; g = { id: groups.size, verts: [], stiff: 0.5 }; groups.set(key, g); }
        g.verts.push(ov + i); CH[ov + i] = g.id;
      }
      for (let i = 0; i < p.verts; i++) {
        if (P0 && neutralP && headIds) {
          const B = bindPart(p, neutralP, headIds);
          for (let a = 0; a < 3; a++) { let q = B.off[i * 3 + a]; for (let j = 0; j < 4; j++) q += P0[B.idx[i * 4 + j] * 3 + a] * B.w[i * 4 + j]; P[(ov + i) * 3 + a] = q; }
        } else for (let a = 0; a < 3; a++) P[(ov + i) * 3 + a] = fit ? fit.c1[a] + (p.pos[i * 3 + a] - fit.c0[a]) * fit.s[a] : p.pos[i * 3 + a];
        SH[ov + i] = p.solid ? p.solid[i] : p.slot === 'Base' ? 1 : 0; GI[ov + i] = p.gid ? (p.gid[i] * 0.61803) % 1 : 0;
        N.set([p.nrm[i * 3], p.nrm[i * 3 + 1], p.nrm[i * 3 + 2]], (ov + i) * 3);
        UV[(ov + i) * 2] = p.uv[i * 2]; UV[(ov + i) * 2 + 1] = p.uv[i * 2 + 1]; T[ov + i] = p.t[i]; C[ov + i] = p.col[i];
        SI[(ov + i) * 4] = headIndex; SW[(ov + i) * 4] = 1;
      }
      for (let k = 0; k < p.idx.length; k++) I[oi + k] = p.idx[k] + ov;
      ov += p.verts; oi += p.idx.length;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geo.setAttribute('aUv', new THREE.BufferAttribute(UV, 2)); geo.setAttribute('aT', new THREE.BufferAttribute(T, 1)); geo.setAttribute('aCol', new THREE.BufferAttribute(C, 1));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
    geo.setAttribute('aChain', new THREE.BufferAttribute(CH, 1)); geo.setAttribute('aShell', new THREE.BufferAttribute(SH, 1)); geo.setAttribute('aGid', new THREE.BufferAttribute(GI, 1)); geo.setAttribute('aTan', new THREE.BufferAttribute(strandTangents(P, UV, T, I, nv), 3));
    geo.setIndex(new THREE.BufferAttribute(I, 1)); geo.computeBoundingSphere();
    // each chain's rest joints: the centre of its vertices at evenly spaced points along the strands
    const old = new Map(chains.map(c => [c.key, c]));
    chains = [...groups.entries()].map(([key, g]) => {
      const rest = [];
      for (let j = 0; j < J; j++) {
        const t0 = j / (J - 1); let x = 0, y = 0, z = 0, w = 0;
        for (const v of g.verts) { const d = Math.abs(T[v] - t0); if (d > 0.5 / (J - 1)) continue; const k = 1 - d * (J - 1); x += P[v * 3] * k; y += P[v * 3 + 1] * k; z += P[v * 3 + 2] * k; w += k; }
        rest.push(w ? new THREE.Vector3(x / w, y / w, z / w) : (rest[j - 1] ? rest[j - 1].clone() : new THREE.Vector3()));
      }
      const o = old.get(key);      // the same chain after a slider change: keep swinging from where it is
      return { key, id: g.id, rest, stiff: g.stiff, x: o ? o.x : rest.map(() => new THREE.Vector3()), px: o ? o.px : rest.map(() => new THREE.Vector3()), len: rest.map((r, j) => j ? r.distanceTo(rest[j - 1]) : 0), live: !!o };
    });
    if (!chains.length) { for (const v of U.uSwX.value) v.set(0, 0, 0); for (const v of U.uSwR.value) v.set(0, 0, 0); for (const q of U.uSwQ.value) q.set(0, 0, 0, 1); }
    for (const c of chains) for (let j = 0; j < J; j++) { U.uSwR.value[c.id * J + j].copy(c.rest[j]); U.uSwX.value[c.id * J + j].copy(c.rest[j]); U.uSwQ.value[c.id * J + j].set(0, 0, 0, 1); }
    headC = fit ? new THREE.Vector3(fit.c1[0], fit.c1[1] + 0.25, fit.c1[2]) : new THREE.Vector3(0, 7, 0);
    headR = fit ? 0.95 * Math.max(0.5, Math.min(1.3, fit.s[0])) : 0.95;
    if (!bound) { mesh.bind(skeleton, bindMatrix ? bindMatrix() : undefined); bound = true; }
    info = { parts: names.length, tris: ni / 3 };
  }
  // Swing for the long pieces: each chain's joints live in world space (so moving and turning throw them), pulled
  // back toward where the head carries them, kept at their lengths, out of the head and the body's capsules.
  //   M: bind space → world this frame (mesh.matrixWorld · bindMatrixInverse · head bone · boneInverse · bindMatrix)
  //   caps: [{ a, b, r, r2 }] in world space; opts.wind: [x, y, z] (m/s)
  let swing = 0, prevFrame = null; const _fd = new THREE.Matrix4(), _fi = new THREE.Matrix4(), _qq = new THREE.Quaternion(), _m = new THREE.Vector3(), _m0 = new THREE.Vector3(), _r = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Vector3(), _hc = new THREE.Vector3(), Minv = new THREE.Matrix4(), M3 = new THREE.Matrix3();
  const segPush = (p, a, b, ra, rb) => {
    _d.subVectors(b, a); const L2 = _d.lengthSq(); const t = L2 > 1e-9 ? Math.max(0, Math.min(1, _q.subVectors(p, a).dot(_d) / L2)) : 0;
    _q.copy(a).addScaledVector(_d, t); const r = ra + (rb - ra) * t; _r.subVectors(p, _q); const l = _r.length();
    if (l < r && l > 1e-6) p.addScaledVector(_r, (r - l) / l);
  };
  function step(dt, M, caps = [], opts = {}) {
    if (!chains.length) return;
    const sc = Math.cbrt(Math.abs(M.determinant())) || 1;            // bind units → metres
    const mg = opts.margin ?? 0.014;                                 // the strand's half-thickness (m): a braid is ~2.5 cm across
    _hc.copy(headC).applyMatrix4(M); const hr = headR * sc;
    acc = Math.min(acc + dt, 0.1); const h = 1 / 60, wind = opts.wind || [0, 0, 0], tm = opts.time || 0;
    const capW = caps.map(c => ({ a: new THREE.Vector3().fromArray(c.a), b: new THREE.Vector3().fromArray(c.b), r: c.r, r2: c.r2 ?? c.r }));
    // the character's own movement carries the hair along (walking or running doesn't leave it behind and slam it
    // into the body); only a little of the motion (`lag`) is felt as inertia, plus the head's own sway
    if (opts.frame) {
      if (prevFrame) {
        _fd.copy(opts.frame).multiply(_fi.copy(prevFrame).invert()); const f = 1 - (opts.lag ?? 0.08);
        for (const c of chains) if (c.live) for (let j = 1; j < J; j++) { _m.copy(c.x[j]).applyMatrix4(_fd); c.x[j].lerp(_m, f); _m.copy(c.px[j]).applyMatrix4(_fd); c.px[j].lerp(_m, f); }
      } else prevFrame = new THREE.Matrix4();
      prevFrame.copy(opts.frame);
    }
    for (const c of chains) {
      if (!c.live || c.x[0].distanceTo(_r.copy(c.rest[0]).applyMatrix4(M)) > 0.5) { c.rest.forEach((r, j) => { c.x[j].copy(r).applyMatrix4(M); c.px[j].copy(c.x[j]); }); c.live = true; }
    }
    while (acc >= h) {
      acc -= h;
      for (const c of chains) {
        const gust = 0.6 + 0.4 * Math.sin(tm * 2.3 + c.id * 1.7);
        c.x[0].copy(c.rest[0]).applyMatrix4(M); c.px[0].copy(c.x[0]);
        for (let j = 1; j < J; j++) {
          const x = c.x[j], px = c.px[j]; _d.subVectors(x, px).multiplyScalar(0.95);      // inertia, damped
          const sp = _d.length(); if (sp > 0.025) _d.multiplyScalar(0.025 / sp);                 // (no whipping on a sudden jump)
          px.copy(x); x.add(_d);
          x.y -= 9.8 * h * h; x.x += wind[0] * gust * h * h * 0.6; x.y += wind[1] * h * h * 0.6; x.z += wind[2] * gust * h * h * 0.6;
          // keep the style: firm where it leaves the head, loose toward the tip (it hangs and swings there)
          const q = (J - 1 - j) / (J - 2), k = j === 1 ? 1 : 0.004 + 0.05 * c.stiff * q * q;   // (the first joint is held: the root is part of the head)
          _r.copy(c.rest[j]).applyMatrix4(M); x.lerp(_r, k);
        }
        for (let it = 0; it < 2; it++) for (let j = 2; j < J; j++) {
          const a = c.x[j - 1], b = c.x[j]; _d.subVectors(b, a); const L = c.len[j] * sc;
          // a cone round the style's own direction (narrow at the root, wider toward the tip): it can swing, never flip over the face
          _r.copy(c.rest[j]).applyMatrix4(M); _q.copy(c.rest[j - 1]).applyMatrix4(M); _r.sub(_q).normalize();
          _d.normalize(); const cosA = Math.cos(0.55 + 0.6 * (j - 1) / (J - 2)), dd = _d.dot(_r);
          if (dd < cosA) { _m.copy(_d).addScaledVector(_r, -dd); if (_m.lengthSq() < 1e-9) _m.set(1, 0, 0); _m.normalize(); _d.copy(_r).multiplyScalar(cosA).addScaledVector(_m, Math.sqrt(1 - cosA * cosA)); }
          b.copy(a).addScaledVector(_d, L);
          _r.subVectors(b, _hc); const lh = _r.length(); if (lh < hr && lh > 1e-6) b.addScaledVector(_r, (hr - lh) / lh);
          // the body: the joint and the middle of its segment, kept the strand's own thickness clear of every capsule
          for (const cp of capW) {
            segPush(b, cp.a, cp.b, cp.r + mg, cp.r2 + mg);
            _m.addVectors(a, b).multiplyScalar(0.5); _m0.copy(_m); segPush(_m, cp.a, cp.b, cp.r + mg, cp.r2 + mg);
            if (_m.distanceToSquared(_m0) > 1e-12) { _m.sub(_m0); b.add(_m); if (j > 2) a.add(_m); }
          }
        }
      }
    }
    // back into bind space for the shader: each joint's position, each segment's turn from its rest direction
    Minv.copy(M).invert(); swing = 0;
    for (const c of chains) {
      for (let j = 0; j < J; j++) { const X = U.uSwX.value[c.id * J + j]; X.copy(c.x[j]).applyMatrix4(Minv); swing = Math.max(swing, X.distanceTo(c.rest[j])); }
      for (let j = 0; j < J - 1; j++) {
        _d.subVectors(c.rest[j + 1], c.rest[j]).normalize(); _r.subVectors(U.uSwX.value[c.id * J + j + 1], U.uSwX.value[c.id * J + j]).normalize();
        _qq.setFromUnitVectors(_d, _r); U.uSwQ.value[c.id * J + j].set(_qq.x, _qq.y, _qq.z, _qq.w);
      }
      U.uSwQ.value[c.id * J + J - 1].copy(U.uSwQ.value[c.id * J + J - 2]);
    }
  }
  const lin = h => new THREE.Color(h).convertSRGBToLinear();
  return { mesh, build, step, colors(root, tip) { U.uRoot.value.copy(lin(root)); U.uTip.value.copy(lin(tip || root)); }, shine(v) { U.uShine.value = v; }, get info() { return { ...info, chains: chains.length, swing: +swing.toFixed(3) }; } };
}

// which parts swing, and how stiffly (short pieces barely move)
function swingOf(n) {
  const base = n.replace(/_under$/, '');
  if (/^Ext_ponytail/.test(base)) return { key: base, stiff: 0.55 };
  if (/^Ext_braid/.test(base)) return { key: base, stiff: 0.7 };
  if (/^Sides_/.test(base)) return { key: base, stiff: 0.8, split: true };
  if (/^Back_bob/.test(base)) return { key: base, stiff: 1.6 };
  if (/^Back_/.test(base)) return { key: base, stiff: 0.9 };
  return null;
}

// a tangent along each strand (the direction t grows across each triangle), for the shine
function strandTangents(P, UV, T, I, nv) {
  const out = new Float32Array(nv * 3);
  for (let k = 0; k < I.length; k += 3) {
    const a = I[k], b = I[k + 1], c = I[k + 2];
    const e1 = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]], e2 = [P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]];
    const u1 = UV[b * 2] - UV[a * 2], v1 = UV[b * 2 + 1] - UV[a * 2 + 1], u2 = UV[c * 2] - UV[a * 2], v2 = UV[c * 2 + 1] - UV[a * 2 + 1];
    const det = u1 * v2 - u2 * v1; if (Math.abs(det) < 1e-12) continue;
    const r = 1 / det;   // dP/dv: v runs root → tip in the atlas
    const t = [(e2[0] * u1 - e1[0] * u2) * r, (e2[1] * u1 - e1[1] * u2) * r, (e2[2] * u1 - e1[2] * u2) * r];
    for (const v of [a, b, c]) { out[v * 3] += t[0]; out[v * 3 + 1] += t[1]; out[v * 3 + 2] += t[2]; }
  }
  for (let v = 0; v < nv; v++) { const l = Math.hypot(out[v * 3], out[v * 3 + 1], out[v * 3 + 2]); if (l > 1e-9) { out[v * 3] /= l; out[v * 3 + 1] /= l; out[v * 3 + 2] /= l; } else out[v * 3 + 1] = -1; }
  return out;
}
