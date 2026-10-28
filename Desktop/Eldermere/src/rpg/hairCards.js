// src/rpg/hairCards.js — the hair, made the way modern games make it, light enough for every character on screen.
//
//   Guides   one strand per scalp root (src/rpg/hair.js grows them for the chosen style: combing, gravity, ties).
//            Only the guides are simulated (a few hundred points), on the CPU, at a fixed 60 Hz.
//   Cards    a few wide cards around each guide, in layers: a dense base, a looser mid layer, and a few flyaways.
//            Each card follows its guide. The guides' motion goes to the GPU as one small texture (guides × points);
//            the vertex shader moves every card vertex from it — the CPU never touches the card vertices per frame.
//   Look     a strand atlas (4 kinds of card, painted once), root-to-tip colour, two-lobe strand highlights along the
//            hair's direction (Kajiya-Kay: a sharp white shine and a softer coloured one, shifted by strand), alpha
//            that keeps its coverage at a distance (no thinning to nothing in the mip levels), soft shadows.
//   Detail   cards are ordered base → mid → flyaway, so a distant character draws only the first part (hairLOD).
//   Motion   realistic and settling: heavy damping, a bend stiffness that keeps the style's shape (stiff at the roots,
//            free at the tips), gravity and wind, inertia from moving (the guides live in world space), collisions with
//            the skull and the body. Long hair swings, short hair barely moves; nothing bounces.
//
//   const R = createHairRenderer(THREE, { headBone, skeleton })
//   R.build(guides, head)          guides: hair.js buildHairCards(..., { copies: 1 }).cards; head: { C, Rad }
//   R.mesh                         a SkinnedMesh (bound to the head) — add it to the character
//   R.step(dt, meshWorld, headM, caps, opts)   each frame
//   R.lod(distance)                metres from the camera
//   R.colors(root, tip, blend)

const SEG = 14;                                            // points per guide - 1 (as hair.js grows them)

// ---- the strand atlas: 4 columns (dense, medium, sparse, flyaway), 256 × 1024 each ----
export function hairAtlas(THREE) {
  const CW = 256, H = 1024, cv = document.createElement('canvas'); cv.width = CW * 4; cv.height = H;
  const g = cv.getContext('2d'); g.lineCap = 'round';
  let seed = 9; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const kinds = [
    { n: 340, w: [1.1, 2.2], len: [0.82, 1], clump: 0.35, a: 1 },          // dense: the body of the hair
    { n: 190, w: [1.0, 1.9], len: [0.7, 1], clump: 0.5, a: 0.95 },         // medium: looser, gaps between strands
    { n: 80, w: [0.8, 1.5], len: [0.55, 1], clump: 0.65, a: 0.9 },         // sparse: wisps at the edges of the style
    { n: 14, w: [0.9, 1.4], len: [0.6, 1], clump: 0, a: 0.85, wave: 26 },  // flyaways: a few single hairs
  ];
  kinds.forEach((k, c) => {
    const x0 = c * CW;
    for (let i = 0; i < k.n; i++) {
      // strands clump toward a few centres across the card, as real hair does
      const cl = Math.floor(rnd() * 5), cx = (cl + 0.5) / 5, u = rnd(), x = x0 + CW * (0.08 + 0.84 * (u * (1 - k.clump) + cx * k.clump));
      const len = H * (k.len[0] + rnd() * (k.len[1] - k.len[0])), w = k.w[0] + rnd() * (k.w[1] - k.w[0]), wob = (rnd() - 0.5) * (k.wave || 7), sh = 0.78 + rnd() * 0.22;
      const v = 255 * sh | 0, grd = g.createLinearGradient(0, 0, 0, len);
      grd.addColorStop(0, `rgba(${v},${v},${v},${k.a})`); grd.addColorStop(0.8, `rgba(${v},${v},${v},${k.a * 0.9})`); grd.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.strokeStyle = grd; g.lineWidth = w; g.beginPath(); g.moveTo(x, 0);
      g.bezierCurveTo(x + wob, len * 0.33, x - wob, len * 0.66, x + wob * 0.6, len); g.stroke();
    }
  });
  // the cards' side edges fade, so neighbouring cards blend instead of showing their outline
  const img = g.getImageData(0, 0, CW * 4, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < CW * 4; x++) { const lx = x % CW, e = Math.min(lx, CW - 1 - lx) / (CW * 0.16); if (e < 1) d[(y * CW * 4 + x) * 4 + 3] *= e; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; return t;
}

// ---- the vertex patch (shared by the hair and its shadow): every card vertex moved by its guide's motion ----
const VERT_PARS = `attribute vec2 hairRef; attribute vec3 hairT; uniform sampler2D uHairOff; uniform vec2 uHairOffSize; uniform float uHairWiden; attribute vec3 hairSide;
  varying vec3 vHairT; varying float vHairN;
  vec3 hairOffAt(float s) { return texture2D(uHairOff, (vec2(s, hairRef.x) + 0.5) / uHairOffSize).xyz; }`;
const VERT_BEGIN = `#include <begin_vertex>
  { float hs = hairRef.y; vec3 o0 = hairOffAt(hs), o1 = hairOffAt(min(hs + 1.0, ${SEG}.0)); transformed += o0 + hairSide * (uHairWiden - 1.0);
    hairTan = hairT + (hs < ${SEG}.0 ? o1 - o0 : vec3(0.0)); }`;

export function createHairRenderer(THREE, { headBone, skeleton, bindMatrix = null }) {
  const atlas = hairAtlas(THREE);
  const U = {
    uHairOff: { value: null }, uHairOffSize: { value: new THREE.Vector2(SEG + 1, 1) }, uHairWiden: { value: 1 },
    uHairRoot: { value: new THREE.Color(1, 1, 1) }, uHairTip: { value: new THREE.Color(1, 1, 1) }, uHairBlend: { value: 0.55 },
  };
  const patchVert = (sh, full = true) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_PARS + '\nvec3 hairTan = vec3(0.0, -1.0, 0.0);')
      .replace('#include <begin_vertex>', VERT_BEGIN);
    if (full) sh.vertexShader = sh.vertexShader.replace('#include <skinning_vertex>', `#include <skinning_vertex>
        #ifdef USE_SKINNING
          vHairT = normalize((modelViewMatrix * (skinMatrix * vec4(hairTan, 0.0))).xyz);
        #else
          vHairT = normalize((modelViewMatrix * vec4(hairTan, 0.0)).xyz);
        #endif
        vHairN = fract(sin(dot(hairRef, vec2(12.9898, 78.233)) + hairT.x * 91.7) * 43758.5);`);
  };
  const mat = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, roughness: 0.72, metalness: 0, skinning: true });
  mat.onBeforeCompile = sh => {
    patchVert(sh);
    const SPEC = '\n reflectedLight.directSpecular += hairSpec(directLight.direction, directLight.color, geometry.normal, geometry.viewDir);';
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uHairRoot; uniform vec3 uHairTip; uniform float uHairBlend; varying vec3 vHairT; varying float vHairN; vec3 hairBase = vec3(1.0);
        // two strand highlights along the hair's direction (Kajiya-Kay), shifted along the normal by a per-strand amount:
        // a sharp white one and a broader one in the hair's own colour, offset down the strand
        vec3 hairSpec(vec3 L, vec3 col, vec3 N, vec3 V) {
          vec3 T = normalize(vHairT), H = normalize(L + V); float sh = (vHairN - 0.5) * 0.24;
          vec3 T1 = normalize(T + N * (-0.06 + sh)), T2 = normalize(T + N * (0.14 + sh));
          float d1 = dot(T1, H), d2 = dot(T2, H), at = smoothstep(-1.0, 0.0, dot(T, H));
          float s1 = pow(max(0.0, 1.0 - d1 * d1), 60.0), s2 = pow(max(0.0, 1.0 - d2 * d2), 10.0);
          float wrap = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
          return col * at * wrap * (s1 * 0.32 + s2 * 0.22 * hairBase); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        { vec2 dx = dFdx(vUv * vec2(1024.0)), dy = dFdy(vUv * vec2(1024.0)); float mip = max(0.0, 0.5 * log2(max(dot(dx, dx), dot(dy, dy))));
          diffuseColor.a = clamp(diffuseColor.a * (1.0 + mip * 0.28), 0.0, 1.0); }   // (coverage kept as the strands shrink below a pixel)`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        hairBase = mix(uHairRoot, uHairTip, smoothstep(uHairBlend - 0.22, uHairBlend + 0.22, 1.0 - vUv.y));
        diffuseColor.rgb *= hairBase * (0.78 + 0.22 * smoothstep(0.0, 0.2, 1.0 - vUv.y));   // (a touch darker at the roots: the hair's own shade)`)
      .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.split('RE_Direct( directLight, geometry, material, reflectedLight );').join('RE_Direct( directLight, geometry, material, reflectedLight );' + SPEC));
  };
  mat.customProgramCacheKey = () => 'hairCards2';
  const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlas, alphaTest: 0.5, skinning: true, side: THREE.DoubleSide });
  depthMat.onBeforeCompile = sh => patchVert(sh, false); depthMat.customProgramCacheKey = () => 'hairCards2depth';

  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), mat);
  mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true; mesh.customDepthMaterial = depthMat; mesh.userData.hairCards = true;
  let sim = null, offTex = null, offData = null, counts = [0, 0, 0], G = 0, info = null;

  // ---- cards around each guide ----
  function build(guides, head, look = {}) {
    const vol = look.volume ?? 1, dens = look.density ?? 1;   // (the creator's volume and density)
    let seed = 21; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    G = guides.length;
    const layers = [[], [], []];                          // base, mid, flyaway: drawn in that order
    guides.forEach((gd, gi) => {
      const pts = gd.points; if (pts.length !== SEG + 1) return;
      const tied = gd.loose === 0, w0 = Math.max(0.2, (gd.width || 0.1) * 2.6) * vol;
      layers[0].push({ gi, w: w0 * (0.95 + 0.15 * rnd()), col: 0, lift: 0, shift: 0, twist: 0, tone: gd.tone || 1, center: gd.center, rootDark: gd.rootDark });
      if (rnd() < 0.35 + 0.65 * Math.min(1, dens)) layers[1].push({ gi, w: w0 * (0.75 + 0.2 * rnd()), col: 1, lift: 0.025 + 0.015 * rnd(), shift: (rnd() - 0.5) * w0 * 0.7, twist: (rnd() - 0.5) * 0.7, tone: (gd.tone || 1) * (0.9 + 0.15 * rnd()), center: gd.center, rootDark: gd.rootDark });
      if (!tied && rnd() < 0.3 * dens) layers[2].push({ gi, w: w0 * 0.45, col: 3, lift: 0.05 + 0.03 * rnd(), shift: (rnd() - 0.5) * w0, twist: (rnd() - 0.5) * 1.2, tone: gd.tone || 1, center: gd.center, rootDark: gd.rootDark, fly: true });
      else if (rnd() < 0.35 * dens) layers[2].push({ gi, w: w0 * 0.7, col: 2, lift: 0.04, shift: (rnd() - 0.5) * w0 * 0.8, twist: (rnd() - 0.5) * 0.9, tone: gd.tone || 1, center: gd.center, rootDark: gd.rootDark });
    });
    const all = [...layers[0], ...layers[1], ...layers[2]], nV = all.length * (SEG + 1) * 2;
    const pos = new Float32Array(nV * 3), nrm = new Float32Array(nV * 3), uv = new Float32Array(nV * 2), col = new Float32Array(nV * 3), ref = new Float32Array(nV * 2), tan = new Float32Array(nV * 3), side = new Float32Array(nV * 3);
    const idx = []; let v = 0;
    const C = head.C, Rad = head.Rad;
    const outward = (p, c) => { const q = [(p[0] - c[0]) / Rad[0], (p[1] - c[1]) / Rad[1] * 0.8, (p[2] - c[2]) / Rad[2]], l = Math.hypot(...q) || 1; return q.map(x => x / l); };
    for (const cd of all) {
      const pts = guides[cd.gi].points, u0 = cd.col / 4 + 0.004, u1 = (cd.col + 1) / 4 - 0.004, flip = rnd() < 0.5, base = v;
      for (let s = 0; s <= SEG; s++) {
        const p = pts[s], q = pts[Math.min(SEG, s + 1)], o = pts[Math.max(0, s - 1)];
        let t = [q[0] - o[0], q[1] - o[1], q[2] - o[2]]; const tl = Math.hypot(...t) || 1; t = t.map(x => x / tl);
        const nv = outward(p, cd.center || C);
        let sd = [t[1] * nv[2] - t[2] * nv[1], t[2] * nv[0] - t[0] * nv[2], t[0] * nv[1] - t[1] * nv[0]]; const sl = Math.hypot(...sd) || 1; sd = sd.map(x => x / sl);
        // twist the card a little about the strand (layers don't all lie flat on each other)
        const ct = Math.cos(cd.twist), st = Math.sin(cd.twist); sd = [sd[0] * ct + nv[0] * st, sd[1] * ct + nv[1] * st, sd[2] * ct + nv[2] * st];
        const f = s / SEG, ww = cd.w * (1 - 0.55 * Math.pow(f, 1.4)) * 0.5, lift = cd.lift * (0.4 + 0.6 * Math.min(1, f * 3));
        const c = [p[0] + nv[0] * lift + sd[0] * cd.shift * (0.3 + 0.7 * f), p[1] + nv[1] * lift + sd[1] * cd.shift * (0.3 + 0.7 * f), p[2] + nv[2] * lift + sd[2] * cd.shift * (0.3 + 0.7 * f)];
        const tn = [pts[Math.min(SEG, s + 1)][0] - p[0], pts[Math.min(SEG, s + 1)][1] - p[1], pts[Math.min(SEG, s + 1)][2] - p[2]];
        if (s === SEG) { tn[0] = p[0] - o[0]; tn[1] = p[1] - o[1]; tn[2] = p[2] - o[2]; }
        for (let e = 0; e < 2; e++) {
          const sg = e ? 1 : -1;
          pos.set([c[0] + sd[0] * ww * sg, c[1] + sd[1] * ww * sg, c[2] + sd[2] * ww * sg], v * 3);
          side.set([sd[0] * ww * sg, sd[1] * ww * sg, sd[2] * ww * sg], v * 3);
          nrm.set(nv, v * 3); tan.set(tn, v * 3);
          uv[v * 2] = (e ^ flip) ? u1 : u0; uv[v * 2 + 1] = 1 - f;
          const k = cd.tone * (0.86 + 0.14 * ((cd.gi * 7919 + cd.col * 31) % 97) / 97); col[v * 3] = col[v * 3 + 1] = col[v * 3 + 2] = k;
          ref[v * 2] = cd.gi; ref[v * 2 + 1] = s; v++;
        }
        if (s < SEG) { const a = base + s * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('hairRef', new THREE.BufferAttribute(ref, 2)); geo.setAttribute('hairT', new THREE.BufferAttribute(tan, 3)); geo.setAttribute('hairSide', new THREE.BufferAttribute(side, 3));
    const si = new Uint16Array(nV * 4), sw = new Float32Array(nV * 4); for (let i = 0; i < nV; i++) { si[i * 4] = headBone; sw[i * 4] = 1; }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    geo.setIndex(nV > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    mesh.geometry.dispose(); mesh.geometry = geo; mesh.bind(skeleton, bindMatrix ? bindMatrix() : mesh.matrixWorld);   // (bound like the body — not to wherever the character stands when the hair is regrown)
    counts = [layers[0].length, layers[0].length + layers[1].length, all.length].map(n => n * SEG * 6);
    // the guides' motion, as a texture: one row per guide, one texel per point (offsets in the head's rest space)
    offData = new Float32Array(Math.max(1, G) * (SEG + 1) * 4);
    if (offTex) offTex.dispose();
    offTex = new THREE.DataTexture(offData, SEG + 1, Math.max(1, G), THREE.RGBAFormat, THREE.FloatType); offTex.needsUpdate = true;
    U.uHairOff.value = offTex; U.uHairOffSize.value.set(SEG + 1, Math.max(1, G));
    sim = makeGuideSim(guides, head);
    lod(0);
    info = { cards: all.length, tris: idx.length / 3, guides: G, layers: layers.map(l => l.length) }; return info;
  }

  let lodNow = -1, lodForce = null;
  function lod(d) {                                        // d: metres from the camera to the head
    // (with a margin either side of each step, so a camera hovering at the edge doesn't flip cards on and off)
    const cur = lodNow < 0 ? 2 : lodNow, up = cur === 2 ? 5.5 : 5, mid = cur >= 1 ? 15 : 13.5;
    const L = lodForce ?? (d < up ? 2 : d < mid ? 1 : 0);
    if (L !== lodNow) { lodNow = L; mesh.geometry.setDrawRange(0, counts[L]); U.uHairWiden.value = L === 0 ? 1.35 : L === 1 ? 1.12 : 1; }
  }
  // meshWorld: the hair mesh's world matrix; headM: the head's skin matrix in the mesh's space (rest -> now)
  function step(dt, meshWorld, headM, caps, opts = {}) {
    if (!sim || !G) return;
    sim.step(dt, meshWorld, headM, caps, opts);
    sim.write(offData); offTex.needsUpdate = true;
  }
  function colors(rootC, tipC, blend) { U.uHairRoot.value.copy(rootC); U.uHairTip.value.copy(tipC); if (blend != null) U.uHairBlend.value = blend; }
  return { mesh, build, step, lod, colors, U, set lodForce(v) { lodForce = v; lodNow = -1; lod(0); }, get info() { return info; }, get lodLevel() { return lodNow; }, get sim() { return sim; }, reset: () => sim?.reset() };
}

// ---------------------------------------------------------------------------------------------------------------------
// The guides' physics. Points live in WORLD space (so walking, turning and jumping move the hair the way inertia does);
// the head is the anchor. Per 1/60 s tick, for each point below the root:
//   verlet with heavy damping (settles in well under a second) · gravity (a little: the style already hangs) · wind
//   bend: pulled toward where the style puts it relative to the point above (turned with the head) — stiff near the
//     roots, free at the tips, so long hair swings and short hair holds
//   a weak pull back to the whole style shape (tied hair: locked to it)
//   length: keeps its spacing to the point above (exact)
//   collisions: out of the skull (an ellipsoid in the head's own space) and out of the neck, shoulders and torso
export function makeGuideSim(guides, head) {
  const n = SEG + 1, G = guides.length;
  const rest = new Float32Array(G * n * 3), p = new Float32Array(G * n * 3), prev = new Float32Array(G * n * 3), seg = new Float32Array(G * n);
  const bend = new Float32Array(G * n), pull = new Float32Array(G * n), dampK = new Float32Array(G * n), tied = new Uint8Array(G), activeFrom = new Uint8Array(G), restInside = new Uint8Array(G * n);
  // Whether each rest-pose point starts inside the skull is invariant for this hairstyle.
  // Cache it once so every 60 Hz physics tick can skip the inverse transform and ellipsoid test
  // for points that are intentionally embedded in the scalp/face.
  // the feel, live-tunable (the creator's Hair lab): follow — how much of the head's turning the hair turns with at once
  // (the rest becomes swing); inertia — how much speeding up and slowing down throws it; stiffness, damping, gravity
  const params = { follow: 0.6, inertia: 0.3, stiffness: 1, damping: 1, gravity: 1 };
  guides.forEach((gd, k) => {
    tied[k] = gd.loose === 0 ? 1 : 0; let L = 0; activeFrom[k] = n;
    gd.points.forEach((q, s) => { const i = k * n + s; rest.set(q, i * 3); if (s) { const a = gd.points[s - 1]; seg[i] = Math.hypot(q[0] - a[0], q[1] - a[1], q[2] - a[2]); L += seg[i]; }
      // The first 25 cm are strongly style-locked; keep them on the authored curve and simulate only the free length.
      // Very short loose hair therefore needs no point physics, while the card geometry and guide texture stay unchanged.
      if (L >= 0.25 && activeFrom[k] === n) activeFrom[k] = s;
      const ex = (q[0] - head.C[0]) / (head.Rad[0] * 0.9), ey = (q[1] - head.C[1]) / (head.Rad[1] * 0.9), ez = (q[2] - head.C[2]) / (head.Rad[2] * 0.9);
      restInside[i] = ex * ex + ey * ey + ez * ez < 1 ? 1 : 0;
      const u = Math.max(0, Math.min(1, (L - 0.25) / 1.6)), f = u * u * (3 - 2 * u);   // free from ~2.5 cm, fully free by ~18 cm (decimetres)
      bend[i] = 0.75 - 0.55 * f; pull[i] = 0.12 * (1 - f) + 0.006; dampK[i] = 0.14 + 0.18 * f; });   // (the ends of long hair damped hardest: they settle instead of flailing)
  });
  const D = new Float32Array(16), Dr = new Float32Array(16), Wpi = new Float32Array(16), WMp = new Float32Array(16), T1 = new Float32Array(16), T1i = new Float32Array(16); let havePrev = false;
  const M = new Float32Array(16), Mi = new Float32Array(16), W = new Float32Array(16), Wi = new Float32Array(16), WM = new Float32Array(16), WMi = new Float32Array(16);
  let acc = 0, lastT = -1e9, ready = false, scale = 1, lastRoot = [0, 0, 0], lastHC = [0, 0, 0], lastVel = [0, 0, 0], accW = [0, 0, 0]; const STEP = 1 / 60, tmp = [0, 0, 0], tg = [0, 0, 0], cw = [];
  function reset() { ready = false; havePrev = false; }
  function place() { for (let i = 0; i < G * n; i++) { xf(WM, rest, i * 3, p, i * 3); prev[i * 3] = p[i * 3]; prev[i * 3 + 1] = p[i * 3 + 1]; prev[i * 3 + 2] = p[i * 3 + 2]; } ready = true; }
  function step(dt, meshWorld, headM, caps, opts) {
    W.set(meshWorld.elements); M.set(headM.elements); mul(W, M, WM); inv(WM, WMi); inv(W, Wi); inv(M, Mi);
    scale = Math.hypot(W[0], W[1], W[2]);
    // a jump in place (a respawn, the creator's turntable reset): start again from the style
    const rx = WM[12], ry = WM[13], rz = WM[14];
    // start again from the style after a jump in place (a respawn) or a pause (the hair hidden — bald, a hood, first
    // person — or the page in the background): stale points would be flung across the body
    const now = opts.time ?? 0, gap = now - lastT; lastT = now;
    if (!ready || gap > 0.25 || gap < 0 || Math.hypot(rx - lastRoot[0], ry - lastRoot[1], rz - lastRoot[2]) > 30 * scale) { place(); havePrev = false; }
    // The head's motion: its movement is carried completely (walking or running at a steady pace doesn't stream the hair
    // back — only speeding up, slowing down, jumping and landing throw it, through 'inertia'); its turning is carried in
    // part ('follow'), the rest becomes swing. A big jump in one frame (a low frame rate, a teleport) is carried completely.
    const hc = [0, 0, 0]; xf(WM, head.C, 0, hc, 0);
    if (ready && havePrev) {
      // 1) the body's own movement and turning (the character's root: walking, the mouse turning you): carried almost
      //    entirely, so turning on the spot doesn't whip the hair round the head (10% of a turn becomes swing)
      mul(W, Wpi, Dr);
      for (let i = 0; i < G * n; i++) { const o = i * 3;
        xf(Dr, p, o, tmp, 0); p[o] += (tmp[0] - p[o]) * 0.9; p[o + 1] += (tmp[1] - p[o + 1]) * 0.9; p[o + 2] += (tmp[2] - p[o + 2]) * 0.9;
        xf(Dr, prev, o, tmp, 0); prev[o] += (tmp[0] - prev[o]) * 0.9; prev[o + 1] += (tmp[1] - prev[o + 1]) * 0.9; prev[o + 2] += (tmp[2] - prev[o + 2]) * 0.9; }
      // (the 10% left of the body's movement — not its turning — is carried too: steady running mustn't stream the hair)
      const cx = [0, 0, 0]; xf(Dr, lastHC, 0, cx, 0); { const mx = (cx[0] - lastHC[0]) * 0.1, my = (cx[1] - lastHC[1]) * 0.1, mz = (cx[2] - lastHC[2]) * 0.1;
        for (let i = 0; i < G * n; i++) { const o = i * 3; p[o] += mx; p[o + 1] += my; p[o + 2] += mz; prev[o] += mx; prev[o + 1] += my; prev[o + 2] += mz; } }
      // 2) the head moving on the body (the animation: nods, turns, the bob of a stride): its movement carried, its turning
      //    in part ('follow'), the rest swings
      mul(Dr, WMp, T1); inv(T1, T1i); mul(WM, T1i, D);
      const tx = hc[0] - cx[0], ty = hc[1] - cx[1], tz = hc[2] - cx[2], ang = Math.acos(Math.max(-1, Math.min(1, (D[0] + D[5] + D[10] - 1) / 2)));
      const big = Math.hypot(tx, ty, tz) > 6 * scale || ang > 0.3, ff = big ? 1 : Math.min(1, Math.max(0, params.follow));
      for (let i = 0; i < G * n; i++) { const o = i * 3;
        xf(D, p, o, tmp, 0); p[o] += tx + (tmp[0] - p[o] - tx) * ff; p[o + 1] += ty + (tmp[1] - p[o + 1] - ty) * ff; p[o + 2] += tz + (tmp[2] - p[o + 2] - tz) * ff;
        xf(D, prev, o, tmp, 0); prev[o] += tx + (tmp[0] - prev[o] - tx) * ff; prev[o + 1] += ty + (tmp[1] - prev[o + 1] - ty) * ff; prev[o + 2] += tz + (tmp[2] - prev[o + 2] - tz) * ff; }
      // speeding up, slowing down, jumping, landing: the head's acceleration in the world throws the hair ('inertia')
      const idt = 1 / Math.max(1 / 240, dt), v = [(hc[0] - lastHC[0]) * idt, (hc[1] - lastHC[1]) * idt, (hc[2] - lastHC[2]) * idt], lim = 40 * scale * 10;
      for (let a = 0; a < 3; a++) accW[a] = big ? 0 : Math.max(-lim, Math.min(lim, (v[a] - lastVel[a]) * idt)) * 0.5 + accW[a] * 0.5;
      lastVel = v;
    }
    inv(W, Wpi); WMp.set(WM);
    lastHC = hc;
    havePrev = true;
    lastRoot = [rx, ry, rz];
    // the body's capsules, in world space
    cw.length = 0; for (const c of caps || []) { const a = [0, 0, 0], b = [0, 0, 0]; xf(W, c.a, 0, a, 0); xf(W, c.b, 0, b, 0); cw.push({ a, b, r: (c.r + 0.05) * scale, r2: ((c.r2 ?? c.r) + 0.05) * scale }); }
    acc = Math.min(acc + dt, STEP * 2);
    while (acc >= STEP) { acc -= STEP; tick(opts); }
  }
  function tick(opts) {
    const g = -9.8 * 10 * scale * 0.18 * params.gravity * STEP * STEP, wind = opts.wind || [0, 0, 0], t = (opts.time || 0), dm = params.damping, sk = params.stiffness;
    const ia = -params.inertia * STEP * STEP, ix = accW[0] * ia, iy = accW[1] * ia, iz = accW[2] * ia;
    const wk = STEP * STEP * 10 * scale;
    for (let k = 0; k < G; k++) {
      const o0 = k * n * 3; xf(WM, rest, o0, p, o0); prev[o0] = p[o0]; prev[o0 + 1] = p[o0 + 1]; prev[o0 + 2] = p[o0 + 2];   // the root rides the head
      for (let s = 1; s < n; s++) {
        const i = k * n + s, o = i * 3, q = o - 3;
        if (tied[k] || s < activeFrom[k]) { xf(WM, rest, o, p, o); prev[o] = p[o]; prev[o + 1] = p[o + 1]; prev[o + 2] = p[o + 2]; continue; }
        const gust = 0.6 + 0.4 * Math.sin(t * 1.7 + k * 0.37 + s * 0.2);
        const damp = Math.min(0.9, dampK[i] * dm), fr = s / n;
        for (let a = 0; a < 3; a++) { const cur = p[o + a]; p[o + a] = cur + (cur - prev[o + a]) * (1 - damp) + (a === 1 ? g : 0) + wind[a] * wk * gust * fr + (a === 0 ? ix : a === 1 ? iy : iz) * fr; prev[o + a] = cur; }
        // bend: where the style puts this point, seen from the point above (the rest segment turned with the head)
        tmp[0] = rest[o] - rest[q]; tmp[1] = rest[o + 1] - rest[q + 1]; tmp[2] = rest[o + 2] - rest[q + 2]; rot(WM, tmp);
        const b = Math.min(0.95, bend[i] * sk); p[o] += (p[q] + tmp[0] - p[o]) * b; p[o + 1] += (p[q + 1] + tmp[1] - p[o + 1]) * b; p[o + 2] += (p[q + 2] + tmp[2] - p[o + 2]) * b;
        // a weak pull back to the style as a whole
        xf(WM, rest, o, tg, 0); const pl = pull[i]; p[o] += (tg[0] - p[o]) * pl; p[o + 1] += (tg[1] - p[o + 1]) * pl; p[o + 2] += (tg[2] - p[o + 2]) * pl;
        // The skull collision can only push points whose rest pose starts outside the skull.
        // Points intentionally rooted inside the face/scalp skip this transform and ellipsoid test.
        if (!restInside[i]) {
          tmp[0] = p[o]; tmp[1] = p[o + 1]; tmp[2] = p[o + 2]; xf(WMi, tmp, 0, tmp, 0);
          const ex = (tmp[0] - head.C[0]) / (head.Rad[0] * 0.9), ey = (tmp[1] - head.C[1]) / (head.Rad[1] * 0.9), ez = (tmp[2] - head.C[2]) / (head.Rad[2] * 0.9), ed = Math.hypot(ex, ey, ez);
          if (ed < 1 && ed > 1e-4) { tmp[0] = head.C[0] + (tmp[0] - head.C[0]) / ed; tmp[1] = head.C[1] + (tmp[1] - head.C[1]) / ed; tmp[2] = head.C[2] + (tmp[2] - head.C[2]) / ed; xf(WM, tmp, 0, tmp, 0); p[o] = tmp[0]; p[o + 1] = tmp[1]; p[o + 2] = tmp[2]; }
        }
        // neck, shoulders, back (only where the style itself isn't resting inside one)
        if (cw.length) { xf(WM, rest, o, tg, 0); for (const c of cw) if (!insideCap(tg, c)) pushCap(p, o, c); }
        // spacing to the point above, exactly
        const L = seg[i] * scale, dx = p[o] - p[q], dy = p[o + 1] - p[q + 1], dz = p[o + 2] - p[q + 2], d = Math.hypot(dx, dy, dz) || 1e-6;
        p[o] = p[q] + dx / d * L; p[o + 1] = p[q + 1] + dy / d * L; p[o + 2] = p[q + 2] + dz / d * L;
      }
    }
  }
  // offsets in the head's rest space, for the texture
  function write(out) {
    for (let i = 0; i < G * n; i++) { const o = i * 3; tmp[0] = p[o]; tmp[1] = p[o + 1]; tmp[2] = p[o + 2]; xf(WMi, tmp, 0, tmp, 0);
      out[i * 4] = tmp[0] - rest[o]; out[i * 4 + 1] = tmp[1] - rest[o + 1]; out[i * 4 + 2] = tmp[2] - rest[o + 2]; out[i * 4 + 3] = 1;
      if (!(Math.abs(out[i * 4]) + Math.abs(out[i * 4 + 1]) + Math.abs(out[i * 4 + 2]) < 1e3)) { out.fill(0); for (let k = 0; k < out.length; k += 4) out[k + 3] = 1; ready = false; return; } }   // (a broken step: back to the style, never vanish)
  }
  return { step, write, reset, params, guides: G, dbg: () => ({ p: Array.from(p.slice(0, 45)), rest: Array.from(rest.slice(0, 45)), WM: Array.from(WM), scale }) };
}
function xf(m, src, so, dst, d) { const x = src[so], y = src[so + 1], z = src[so + 2];
  dst[d] = m[0] * x + m[4] * y + m[8] * z + m[12]; dst[d + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; dst[d + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]; }
function rot(m, v) { const x = v[0], y = v[1], z = v[2]; v[0] = m[0] * x + m[4] * y + m[8] * z; v[1] = m[1] * x + m[5] * y + m[9] * z; v[2] = m[2] * x + m[6] * y + m[10] * z; }
function mul(a, b, o) { for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } }
function inv(m, o) {
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7], a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; if (!det) return; det = 1 / det;
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det; o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det; o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det; o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det; o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
}
function insideCap(p, c) { const r = nearCap(p, 0, c); return r.d < r.r; }
function nearCap(p, o, c) {
  const bx = c.b[0] - c.a[0], by = c.b[1] - c.a[1], bz = c.b[2] - c.a[2], L2 = bx * bx + by * by + bz * bz || 1e-6;
  const px = p[o] - c.a[0], py = p[o + 1] - c.a[1], pz = p[o + 2] - c.a[2], t = Math.max(0, Math.min(1, (px * bx + py * by + pz * bz) / L2));
  const qx = px - bx * t, qy = py - by * t, qz = pz - bz * t; return { d: Math.hypot(qx, qy, qz), r: c.r + (c.r2 - c.r) * t, qx, qy, qz };
}
function pushCap(p, o, c) { const r = nearCap(p, o, c); if (r.d < r.r && r.d > 1e-6) { const f = (r.r - r.d) / r.d; p[o] += r.qx * f; p[o + 1] += r.qy * f; p[o + 2] += r.qz * f; } }
