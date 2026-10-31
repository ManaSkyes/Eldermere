// src/rpg/creature.js — the creature builder: a rig and a skinned body made in code from a body plan (docs/MONSTERS.md).
//
// A creature spec (src/data/monsters.js makes them from a preset and its sliders) is:
//   chains   [{ name, parent: 'chain:joint' | null, pts: [[x, y, z], ...], r: [[w, h], ...], color, mirror, cap, sides }]
//            joints in the rest pose (metres, character space: +x the creature's left, +y up, +z forward); a bone at
//            every joint. r: the body's half-width and half-height at each joint (an ellipse round the bone). mirror:
//            the chain is written for the left side and copied to the right (`name.L`, `name.R`).
//   webs     [{ a: [['chain', joint], ...], b: [...], color, opacity, mirror }]   membranes (wings) between two rails
//   parts    [{ bone: 'chain:joint', kind: 'sphere' | 'cone' | 'glow', at: [x, y, z], dir, r, len, color, emissive,
//            mirror }]   rigid pieces on a bone: eyes, fangs, claws, horns, a glowing core
//   look     { shade: bool, smoke, coreGlow, ... }   how it's drawn
//   chain.fade [from, to]   (shade) the body thins into smoke along the chain: solid up to `from` (share of its length),
//            gone by `to` — wispy legs, tails, horn tips. web.solid: 'membrane' (wispy between its rails) | 'fin'
//            (solid at rail a, smoke at rail b). A rail point can carry an offset: ['chain', joint, [dx, dy, dz]].
//   chain.aura [[w, h], ...]   (shade) a cloud in the shape of flesh round the chain's bones: the body the creature
//            would have, drawn as a glowing, rolling purple cloud over its skeleton (same bones, its own radii).
// Bones are axis-aligned at rest (only positions), so a rotation on a bone turns its segment and everything past it
// about the bone's joint, in the creature's own axes.
//
//   const C = buildCreature(THREE, spec)  → { root, mesh, bones: { 'chain:joint' → Bone }, chain(name) → [Bone],
//                                             skeleton, update(t), dispose() }
export function buildCreature(THREE, spec, { particles = null, instances = null, twoInfluenceVariant = false } = {}) {   // particles: src/gfx/particles.js — a shade's smoke and haze are drawn there (one draw for every creature)
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const root = new THREE.Group(); root.name = 'creature';
  // ---- chains (mirrored copies made here) ----
  const chains = [];
  for (const c of spec.chains) {
    if (!c.mirror) { chains.push(c); continue; }
    const flip = p => [-p[0], p[1], p[2]], par = s => (s && s.includes('.L')) ? s : s;
    chains.push({ ...c, name: c.name + '.L', parent: mirrorRef(c.parent, 'L') });
    chains.push({ ...c, name: c.name + '.R', parent: mirrorRef(c.parent, 'R'), pts: c.pts.map(flip) });
    void par;
  }
  function mirrorRef(ref, side) { if (!ref) return ref; const [n, j] = ref.split(':'); return spec.chains.find(x => x.name === n && x.mirror) ? `${n}.${side}:${j}` : ref; }
  // ---- bones ----
  const bones = {}, list = [], byChain = {};
  const rootBone = new THREE.Bone(); rootBone.name = 'root'; list.push(rootBone); root.add(rootBone); bones.root = rootBone;
  for (const c of chains) {
    const arr = []; byChain[c.name] = arr;
    let parent = rootBone, pPos = V(0, 0, 0);
    if (c.parent) { const pb = bones[c.parent]; if (!pb) throw new Error(`creature: no bone ${c.parent} for ${c.name}`); parent = pb; pPos = pb.userData.rest; }
    c.pts.forEach((p, j) => {
      const b = new THREE.Bone(); b.name = `${c.name}:${j}`; b.userData.rest = V(...p);
      b.position.copy(b.userData.rest).sub(j ? arr[j - 1].userData.rest : pPos);
      (j ? arr[j - 1] : parent).add(b); arr.push(b); bones[b.name] = b; list.push(b);
    });
  }
  const index = new Map(list.map((b, i) => [b, i]));
  // ---- geometry: built once per distinct spec and shared by every creature made from it (20 bats: one set of
  // buffers on the GPU, and spawning the 2nd..20th costs almost nothing) ----
  const GKEY = JSON.stringify(spec);
  let G = GEO_CACHE.get(GKEY);
  if (!G) G = (() => {
  let pos = [], nor = [], col = [], si = [], sw = [], idx = [], sol = [];
  const mainBuf = { pos, nor, col, si, sw, idx, sol };
  const tmpC = new THREE.Color();
  const push = (p, n, c, w, solid = 1) => {   // w: [[boneIndex, weight], ...]
    sol.push(solid); pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); col.push(c.r, c.g, c.b);
    w = w.filter(e => e[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4); const s = w.reduce((t, e) => t + e[1], 0) || 1;
    for (let k = 0; k < 4; k++) { si.push(w[k] ? w[k][0] : 0); sw.push(w[k] ? w[k][1] / s : 0); }
    return pos.length / 3 - 1;
  };
  const frameOf = t => { let up = Math.abs(t.y) > 0.9 ? V(0, 0, 1) : V(0, 1, 0); const side = new THREE.Vector3().crossVectors(up, t).normalize(); up = new THREE.Vector3().crossVectors(t, side).normalize(); return { side, up }; };
  const auraBuf = { pos: [], nor: [], col: [], si: [], sw: [], idx: [], sol: [] };
  const passes = [];
  for (const c of chains) { passes.push([c, false]); if (c.aura) passes.push([{ ...c, r: c.aura, sides: Math.max(12, c.sides || 12), fade: c.auraFade }, true]); }
  for (const [c, isAura] of passes) {
    ({ pos, nor, col, si, sw, idx, sol } = isAura ? auraBuf : mainBuf);   // (the ring builder writes into the body's buffers, or the aura's)
    const B = byChain[c.name], P = c.pts.map(p => V(...p)), n = P.length, sides = c.sides || 12, seg = c.seg || 4;
    const base = new THREE.Color(c.color || '#888').convertSRGBToLinear(), belly = new THREE.Color(c.belly || c.color || '#888').convertSRGBToLinear();   // (colours are picked as you see them: the renderer works in linear light)
    if (n < 2) continue;
    const rings = [];    // { p, t, w, h, weights, frac }
    const segL = []; let totL = 0; for (let j = 0; j < n - 1; j++) { const l = P[j].distanceTo(P[j + 1]); segL.push(l); totL += l; }
    const cumL = j => segL.slice(0, j).reduce((a, b) => a + b, 0);
    const tangent = j => j < n - 1 ? P[j + 1].clone().sub(P[j]).normalize() : P[j].clone().sub(P[j - 1]).normalize();
    const capN = c.cap === false ? 0 : 3;
    // start cap: shrinking rings before the first joint
    for (let k = capN; k >= 1; k--) { const a = k / (capN + 1) * Math.PI / 2, t0 = tangent(0), r = c.r[0]; rings.push({ p: P[0].clone().addScaledVector(t0, -Math.sin(a) * Math.min(r[0], r[1]) * 0.9), t: t0, w: r[0] * Math.cos(a), h: r[1] * Math.cos(a), wt: [[index.get(B[0]), 1]] }); }
    for (let j = 0; j < n - 1; j++) {
      const t = P[j + 1].clone().sub(P[j]).normalize();
      for (let k = 0; k < seg; k++) {
        const f = k / seg, p = P[j].clone().lerp(P[j + 1], f), r = [c.r[j][0] + (c.r[j + 1][0] - c.r[j][0]) * f, c.r[j][1] + (c.r[j + 1][1] - c.r[j][1]) * f];
        const bj = index.get(B[j]), wt = [[bj, 1]];
        if (j > 0 && f < 0.3) { const k2 = 0.5 * (1 - f / 0.3); wt[0][1] = 1 - k2; wt.push([index.get(B[j - 1]), k2]); }
        if (f > 0.7 && j + 1 < n - 1) { const k2 = 0.5 * (f - 0.7) / 0.3; wt[0][1] -= k2; wt.push([index.get(B[j + 1]), k2]); }
        // tangent eased across the joint so rings don't pinch
        const tt = j > 0 && f < 0.25 ? tangent(j - 1).lerp(t, 0.5 + f * 2).normalize() : t;
        rings.push({ p, t: tt, w: r[0], h: r[1], wt, frac: (cumL(j) + f * segL[j]) / (totL || 1) });
      }
    }
    { const j = n - 1, r = c.r[j]; rings.push({ p: P[j].clone(), t: tangent(j), w: r[0], h: r[1], wt: [[index.get(B[n - 2]), 0.5], [index.get(B[n - 1]), 0.5]], frac: 1 }); }
    for (let k = 1; k <= capN; k++) { const a = k / (capN + 1) * Math.PI / 2, tl = tangent(n - 1), r = c.r[n - 1]; rings.push({ p: P[n - 1].clone().addScaledVector(tl, Math.sin(a) * Math.min(r[0], r[1]) * 0.9), t: tl, w: r[0] * Math.cos(a), h: r[1] * Math.cos(a), wt: [[index.get(B[n - 1]), 1]] }); }
    if (capN) { rings.unshift({ p: rings[0].p.clone().addScaledVector(rings[0].t, -Math.min(c.r[0][0], c.r[0][1]) * 0.08), t: rings[0].t, w: 0.0001, h: 0.0001, wt: rings[0].wt }); const L = rings[rings.length - 1]; rings.push({ p: L.p.clone().addScaledVector(L.t, Math.min(c.r[n - 1][0], c.r[n - 1][1]) * 0.08), t: L.t, w: 0.0001, h: 0.0001, wt: L.wt }); }
    // the rings' frames carried along the chain (parallel transport): each ring's 'up' is the last one's turned by
    // just the bend between them — worked out afresh per ring it flipped wherever a limb bent back on itself (a
    // hock, a knee), twisting the surface into a pinched candy-wrapper at the joint
    { let up0 = null; const qt = new THREE.Quaternion();
      for (let k = 0; k < rings.length; k++) {
        const R0 = rings[k];
        if (!up0) { up0 = frameOf(R0.t).up.clone(); }
        else { qt.setFromUnitVectors(rings[k - 1].t.clone().normalize(), R0.t.clone().normalize()); up0.applyQuaternion(qt); }
        up0.addScaledVector(R0.t, -up0.dot(R0.t)).normalize();
        // keep the ellipse's height axis leaning the way the chain's own first frame had it (no slow drift round the limb)
        R0.up = up0.clone(); R0.side = new THREE.Vector3().crossVectors(R0.up, R0.t).normalize();
      }
    }
    // vertices
    const first = pos.length / 3;
    for (const R of rings) {
      const side = R.side, up = R.up;
      for (let s = 0; s < sides; s++) {
        const a = s / sides * Math.PI * 2, cx = Math.cos(a), cy = Math.sin(a);
        const p = R.p.clone().addScaledVector(side, cx * R.w).addScaledVector(up, cy * R.h);
        const nn = side.clone().multiplyScalar(cx / Math.max(1e-4, R.w)).addScaledVector(up, cy / Math.max(1e-4, R.h)).normalize();
        tmpC.copy(base).lerp(belly, Math.max(0, -nn.y) * 0.8);   // lighter underneath
        const jit = 0.94 + 0.12 * fract(Math.sin((p.x * 91.7 + p.y * 37.3 + p.z * 53.1)) * 43758.5);
        const fr = R.frac ?? (rings.indexOf(R) < rings.length / 2 ? 0 : 1), fd = c.fade;
        const solid = fd ? 1 - Math.min(1, Math.max(0, (fr - fd[0]) / Math.max(1e-3, fd[1] - fd[0]))) : 1;
        push(p, nn, { r: tmpC.r * jit, g: tmpC.g * jit, b: tmpC.b * jit }, R.wt, solid);
      }
    }
    for (let r = 0; r < rings.length - 1; r++) for (let s = 0; s < sides; s++) {
      const a = first + r * sides + s, b = first + r * sides + (s + 1) % sides, cc = a + sides, d = b + sides;
      idx.push(a, b, cc, b, d, cc);
    }
  }
  const geo = new THREE.BufferGeometry();
  const finish = (g, P, N, Cc, I, W, Ix, S) => {
    if (S) g.setAttribute('aSolid', new THREE.Float32BufferAttribute(S, 1));
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3)); g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(I, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(W, 4));
    g.setIndex(Ix); g.computeBoundingSphere();
  };
  ({ pos, nor, col, si, sw, idx, sol } = mainBuf);
  finish(geo, pos, nor, col, si, sw, idx, sol);
  let auraGeo = null; if (auraBuf.pos.length) { auraGeo = new THREE.BufferGeometry(); finish(auraGeo, auraBuf.pos, auraBuf.nor, auraBuf.col, auraBuf.si, auraBuf.sw, auraBuf.idx, auraBuf.sol); }
  // ---- webs (membranes) ----
  const webs = [];
  for (const w of spec.webs || []) {
    const sides = w.mirror ? ['L', 'R'] : [null];
    for (const sd of sides) {
      const ref = ([cn, j, off]) => { const name = sd && byChain[`${cn}.${sd}`] ? `${cn}.${sd}` : cn; const arr = byChain[name], fx = sd === 'R' ? -1 : 1;
        return { b: arr[j], p: off ? arr[j].userData.rest.clone().add(V(off[0] * fx, off[1], off[2])) : arr[j].userData.rest }; };
      const A = w.a.map(ref), Bn = w.b.map(ref), K = w.cols || 8, M = w.rows || 6;
      const sample = (rail, u) => {   // a point along a rail by arc length, and its bones
        const L = []; let tot = 0; for (let i = 0; i < rail.length - 1; i++) { const l = rail[i].p.distanceTo(rail[i + 1].p); L.push(l); tot += l; }
        let d = u * tot; for (let i = 0; i < L.length; i++) { if (d <= L[i] || i === L.length - 1) { const f = L[i] ? Math.min(1, d / L[i]) : 0; return { p: rail[i].p.clone().lerp(rail[i + 1].p, f), w: [[index.get(rail[i].b), 1 - f], [index.get(rail[i + 1].b), f]] }; } d -= L[i]; }
        return { p: rail[0].p.clone(), w: [[index.get(rail[0].b), 1]] };
      };
      const wp = [], wn = [], wc = [], wi = [], ww = [], wx = [], ws = [], c = new THREE.Color(w.color || '#3a2a2a').convertSRGBToLinear(), c2 = new THREE.Color(w.edge || w.color || '#3a2a2a').convertSRGBToLinear();
      for (let m = 0; m <= M; m++) for (let k = 0; k <= K; k++) {
        const u = k / K, sA = sample(A, u), sB = sample(Bn, u), v = m / M;
        const sag = Math.sin(Math.PI * v) * (w.sag || 0) * Math.sin(Math.PI * u);   // the membrane bellies a little
        const p = sA.p.clone().lerp(sB.p, v); p.y -= sag;
        const wt = [...sA.w.map(([i, x]) => [i, x * (1 - v)]), ...sB.w.map(([i, x]) => [i, x * v])];
        const merged = new Map(); for (const [i, x] of wt) merged.set(i, (merged.get(i) || 0) + x);
        const mw = [...merged.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4), s = mw.reduce((t, e) => t + e[1], 0) || 1;
        ws.push(w.solid === 'fin' ? 1 - v : w.solid === 'membrane' ? 1 - 0.75 * Math.sin(Math.PI * v) * (0.6 + 0.4 * Math.sin(Math.PI * u)) : 1);
        wp.push(p.x, p.y, p.z); wn.push(0, 1, 0); const cc = c.clone().lerp(c2, Math.max(u, v) ** 3); wc.push(cc.r, cc.g, cc.b);
        for (let q = 0; q < 4; q++) { wi.push(mw[q] ? mw[q][0] : 0); ww.push(mw[q] ? mw[q][1] / s : 0); }
      }
      for (let m = 0; m < M; m++) for (let k = 0; k < K; k++) { const a = m * (K + 1) + k, b = a + 1, cc = a + K + 1, d = cc + 1; wx.push(a, cc, b, b, cc, d); }
      const g = new THREE.BufferGeometry(); finish(g, wp, wn, wc, wi, ww, wx, ws); g.computeVertexNormals();
      webs.push({ g, opacity: w.opacity ?? 0.94, smoke: !!w.solid });
    }
  }
  const g = { geo, auraGeo, webs: mergeWebs(THREE, webs, finish), refs: 0 };
  for (const x of [geo, auraGeo, ...g.webs.map(w => w.g)]) if (x) { x.computeBoundingSphere(); x.boundingSphere.radius += 3.5; }   // (bounds grown for what its moves can do: a swoop, a pounce)
  GEO_CACHE.set(GKEY, g); return g;
  })();
  G.refs++;
  const { geo, auraGeo } = G, webs = G.webs;
  // ---- skeleton, materials, meshes ----
  root.updateMatrixWorld(true);                              // (the bones' rest matrices, so the skin binds to the pose it was built in)
  const skeleton = new THREE.Skeleton(list);
  const look = spec.look || {};
  const uniforms = { uTime: { value: 0 }, uSmoke: { value: look.smoke ?? 0.6 }, uCore: { value: look.coreGlow ?? 1 }, uNz: { value: look.shade ? noiseTexture(THREE) : null } };
  const meshes = [], smokeAuraMeshes = [], membraneMeshes = []; let bodyVisible = true, partsVisible = true, attached = false, lodTier = 0, smokeAuraVisible = true, membranesVisible = true, glowsVisible = true, wispsVisible = true;
  const bodyMat = look.shade ? shadeBodyMaterial(THREE, uniforms, look) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: look.rough ?? 0.85, metalness: 0, skinning: true });
  // Experimental A/B material: the procedural Umbrafiend body uses at most two non-zero bone weights per vertex.
  // Its alternate shader evaluates only those two influences instead of the stock four-influence skinning path.
  const bodyMatTwoInfluence = look.shade && twoInfluenceVariant ? shadeBodyMaterial(THREE, uniforms, look, true) : null;
  const mesh = new THREE.SkinnedMesh(geo, bodyMat); mesh.name = 'creature-body'; mesh.castShadow = !look.shade; mesh.receiveShadow = true; mesh.frustumCulled = false;
  root.add(mesh); mesh.bind(skeleton); meshes.push(mesh);
  // fur (look.fur: { length m, density strands/m, shells, tip colour }): shells of the same skin pushed out along its
  // normals, each cutting away all but the strands that reach that high — thinner toward the tips, lighter at the ends.
  // Cut out, not blended, so it costs little more than drawing the body again a few times; furOn(false) hides it far away.
  const furShells = [];
  if (look.fur && !look.shade) {
    const F = look.fur, n = Math.max(2, Math.min(8, F.shells || 5));
    for (let k = 1; k <= n; k++) {
      const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, skinning: true });
      const h = k / n, len = (F.length ?? 0.025) * h, dens = (F.density ?? 140).toFixed(1), tip = new THREE.Color(F.tip || '#ffffff').convertSRGBToLinear(), tipK = (F.tipMix ?? 0.35) * h;
      m.onBeforeCompile = sh => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFP;').replace('#include <begin_vertex>', `#include <begin_vertex>\nvFP = position; transformed += normalize(normal) * ${len.toFixed(4)};`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vFP;\nfloat fh(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }`)
          .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
            { vec3 q = vFP * ${dens}; vec3 c = floor(q); vec3 f = fract(q) - 0.5; float r = fh(c);
              float strand = 1.0 - smoothstep(0.3, 0.55, length(f) / (1.0 - ${h.toFixed(3)} * 0.55));   // (fat at the root, fine at the tip)
              if (r < ${(h * h * 0.9).toFixed(3)} || strand < 0.5) discard;
              diffuseColor.rgb = mix(diffuseColor.rgb * ${(0.75 + 0.25 * h).toFixed(3)}, vec3(${tip.r.toFixed(3)}, ${tip.g.toFixed(3)}, ${tip.b.toFixed(3)}), ${tipK.toFixed(3)}); }`);
      };
      m.customProgramCacheKey = () => `fur${k}/${n}|${len.toFixed(4)}|${dens}|${tipK.toFixed(3)}|${tip.getHexString()}`;
      const fm = new THREE.SkinnedMesh(geo, m); fm.castShadow = false; fm.receiveShadow = true; fm.frustumCulled = false; fm.userData.noReflect = true; fm.userData.noCover = true;
      root.add(fm); fm.bind(skeleton); meshes.push(fm); furShells.push(fm);
    }
  }
  const P = look.shade ? particles : null;   // (with the particle system: no shells, no aura meshes, no wisps — puffs on the bones instead)
  if (look.shade && !P) {   // the smoke round the body: a loose, flickering shell over the same skin (fallback without particles)
    for (const [inflate, alpha] of [[0.055, 0.8]]) {   // (one shell: each one is a full transparent pass over the creature)
      const sm = new THREE.SkinnedMesh(geo, smokeMaterial(THREE, uniforms, inflate, alpha, look)); sm.frustumCulled = false; sm.renderOrder = 2; sm.userData.noReflect = true; sm.userData.noCover = true; root.add(sm); sm.bind(skeleton); meshes.push(sm); smokeAuraMeshes.push(sm);
    }
  }
  // the aura: the body's would-be flesh as a rolling purple cloud — a dark inner cloud and a faint glow round it
  if (auraGeo && !P) {
    for (const [inflate, glow] of [[0.02, false]]) {   // (one layer: the haze carries the glow at its heart itself)
      const am = new THREE.SkinnedMesh(auraGeo, auraMaterial(THREE, uniforms, look, inflate, glow)); am.frustumCulled = false; am.renderOrder = glow ? 3 : 1; am.userData.noReflect = true; am.userData.noCover = true;   // (the puddles show its bones, not its haze) root.add(am); am.bind(skeleton); meshes.push(am); smokeAuraMeshes.push(am);
    }
  }
  // wisps: dark smoke rising off a shade's body (points that start at random bones and drift up and away)
  let wisps = null, wispPoints = null, puffs = null;
  if (look.shade && P) puffs = shadePuffs(THREE, P, chains, byChain, look);
  if (look.shade && !P) {
    const N = 70, P = new Float32Array(N * 3), A = new Float32Array(N), seeds = Array.from({ length: N }, (_, i) => ({ b: list[1 + Math.floor(Math.random() * (list.length - 1))], o: V((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.25), ph: Math.random(), sp: 0.5 + Math.random() * 0.7 }));
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('aA', new THREE.BufferAttribute(A, 1));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uCol: { value: new THREE.Color(look.smokeColor || '#140a22') }, uSize: { value: 260 * (look.wispSize ?? 1) } },
      vertexShader: 'attribute float aA; varying float vA; uniform float uSize; void main() { vA = aA; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = uSize * (0.4 + 0.6 * aA) / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 uCol; varying float vA; void main() { vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; gl_FragColor = vec4(uCol, (1.0 - r * 2.0) * (1.0 - r * 2.0) * vA * 0.45); }' });
    const pts = new THREE.Points(g, m); wispPoints = pts; pts.frustumCulled = false; pts.renderOrder = 4; pts.userData.noReflect = true; pts.visible = wispsVisible; root.add(pts);
    const wv = V(0, 0, 0), inv = new THREE.Matrix4();
    wisps = t => {
      sync(); inv.copy(root.matrixWorld).invert();
      seeds.forEach((s, i) => { const life = (t * 0.45 * s.sp + s.ph) % 1; wv.setFromMatrixPosition(s.b.matrixWorld).applyMatrix4(inv).add(s.o);   // (the bones' matrices are fresh from the root update just above)
        P[i * 3] = wv.x + s.o.x * life * 2; P[i * 3 + 1] = wv.y + life * (look.wispRise ?? 0.6); P[i * 3 + 2] = wv.z + s.o.z * life * 2; A[i] = Math.sin(Math.PI * life) * uniforms.uSmoke.value; });
      g.attributes.position.needsUpdate = true; g.attributes.aA.needsUpdate = true;
    };
  }
  const webMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0, side: THREE.DoubleSide, transparent: true, opacity: 0.94, skinning: true, emissive: new THREE.Color(look.webGlow || '#000000') });
  const smokeWebMat = look.shade ? smokeWebMaterial(THREE, uniforms, look) : null;
  // (all the membranes of one kind are one mesh: a bat's eight wing panels were eight skinned draws)
  for (const w of webs) { const m = new THREE.SkinnedMesh(w.g, w.smoke && smokeWebMat ? smokeWebMat : webMat); m.castShadow = !look.shade && !(w.smoke && smokeWebMat); m.frustumCulled = false; m.visible = membranesVisible; if (w.smoke && smokeWebMat) { m.renderOrder = 1; m.userData.noReflect = true; m.userData.noCover = true; } root.add(m); m.bind(skeleton); meshes.push(m); membraneMeshes.push(m); }
  // off screen, not drawn: the bind-pose bounds grown to cover what its moves can do (a swoop, a pounce, a rear-up)
  for (const m of meshes) m.frustumCulled = true;
  // ---- parts ----
  const parts = [], glows = [], instancedParts = [];
  const glowTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(cv); return t; })();
  for (const p of spec.parts || []) {
    for (const sd of p.mirror ? ['L', 'R'] : [null]) {
      const [cn, j] = p.bone.split(':'), name = sd && byChain[`${cn}.${sd}`] ? `${cn}.${sd}` : cn, b = byChain[name]?.[+j]; if (!b) continue;
      const fx = sd === 'R' ? -1 : 1, at = V(p.at[0] * fx, p.at[1], p.at[2]).sub(b.userData.rest);
      let o;
      if (p.kind === 'glow' && look.cheap && !p.dark) continue;   // (a swarm creature: no halos — each one is a blended draw)
      if (p.kind === 'glow') {
        o = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: p.color || '#ffffff', transparent: true, depthWrite: false, blending: p.dark ? THREE.NormalBlending : THREE.AdditiveBlending, opacity: p.opacity ?? 0.9 }));   // (dark: a glow of blackness — a shade's eyes)
        o.scale.setScalar(p.r * 2); o.renderOrder = 3; glows.push(o);
      } else {
        const g = p.kind === 'cone' ? new THREE.ConeGeometry(p.r, p.len, 6) : new THREE.SphereGeometry(p.r, 12, 8);
        if (p.kind === 'cone') g.translate(0, p.len / 2, 0);
        const mat = p.emissive ? new THREE.MeshBasicMaterial({ color: p.emissive, transparent: !!p.opacity, opacity: p.opacity ?? 1 }) : new THREE.MeshStandardMaterial({ color: new THREE.Color(p.color || '#ddd').convertSRGBToLinear(), roughness: 0.5 });
        o = new THREE.Mesh(g, mat); o.castShadow = !look.shade && !p.emissive;
        if (p.dir) { const d = V(p.dir[0] * fx, p.dir[1], p.dir[2]).normalize(); o.quaternion.setFromUnitVectors(V(0, 1, 0), d); }
        if (p.scale) o.scale.set(...p.scale);
      }
      o.position.copy(at); parts.push(o); o.userData.noReflect = true; o.updateMatrix(); o.matrixAutoUpdate = false;
      if (instances && o.isMesh) instancedParts.push(instances.register(o, b));
      else b.add(o);
    }
  }
  // The skeleton is posed once a frame and its matrices worked out then (sync), not again by every render pass (the
  // main view, the puddle mirror, the weather's cover...): with 50 creatures that was most of the frame.
  root.updateMatrixWorld(true);
  root.matrixAutoUpdate = false; for (const b of list) b.matrixAutoUpdate = false; for (const m of meshes) { m.updateMatrix(); m.matrixAutoUpdate = false; }
  const restLocal = list.map(b => b.userData.rest ? b.userData.rest.clone().sub(b.parent?.userData?.rest || V(0, 0, 0)) : V(0, 0, 0));
  function sync() { root.updateMatrix(); for (let i = 0; i < list.length; i++) list[i].updateMatrix(); root.updateMatrixWorld(true); if (instances) instances.updateMany ? instances.updateMany(instancedParts) : instancedParts.forEach(h => instances.update(h)); }
  function applyVisibility() {
    mesh.visible = bodyVisible;
    for (const m of smokeAuraMeshes) m.visible = smokeAuraVisible;
    for (const m of membraneMeshes) m.visible = membranesVisible;
    for (const g of glows) g.visible = glowsVisible && lodTier < 2;
    if (wispPoints) wispPoints.visible = wispsVisible;
    if (instances) for (const h of instancedParts) instances.setVisible(h, partsVisible && attached);
    if (puffs) { puffs.setGroupEnabled('smokeAura', smokeAuraVisible); puffs.setGroupEnabled('coreGlow', glowsVisible && lodTier < 2); puffs.setGroupEnabled('wisps', wispsVisible); }
  }
  applyVisibility();
  return {
    root, mesh, meshes, bones, skeleton, parts, glows, uniforms, sync,
    setBodyVisible(visible) { bodyVisible = !!visible; applyVisibility(); },
    setPartsVisible(visible) { partsVisible = !!visible; applyVisibility(); },
    setAttached(visible) { attached = !!visible; applyVisibility(); },
    setLodTier(tier) { const next = Number.isFinite(tier) ? tier : 0; if (next === lodTier) return; lodTier = next; for (const g of glows) g.visible = glowsVisible && lodTier < 2; if (puffs) puffs.setGroupEnabled('coreGlow', glowsVisible && lodTier < 2); },
    setSmokeAuraVisible(visible) { smokeAuraVisible = !!visible; applyVisibility(); },
    setMembranesVisible(visible) { membranesVisible = !!visible; applyVisibility(); },
    setGlowsVisible(visible) { glowsVisible = !!visible; applyVisibility(); },
    setWispsVisible(visible) { wispsVisible = !!visible; applyVisibility(); },
    setSkinnedVariant(on) { if (bodyMatTwoInfluence) mesh.material = on ? bodyMatTwoInfluence : bodyMat; },
    chain: name => byChain[name] || [],
    // back to the rest pose before each frame's layers — written straight into the fields: going through
    // quaternion.identity() fires the Euler sync on every bone, and that was a sixth of a monster's frame
    rest() { for (let i = 0; i < list.length; i++) { const b = list[i], q = b.quaternion, e = b.rotation, lp = restLocal[i]; q._x = q._y = q._z = 0; q._w = 1; e._x = e._y = e._z = 0; b.scale.set(1, 1, 1); b.position.copy(lp); } },
    puffs,
    furOn(on) { for (const f of furShells) f.visible = on; },
    update(t) { uniforms.uTime.value = t; if (wispsVisible) wisps?.(t); },
    dispose() { puffs?.remove(); bodyMatTwoInfluence?.dispose(); if (instances) for (const h of instancedParts) instances.unregister(h); if (--G.refs <= 0) { GEO_CACHE.delete(GKEY); G.geo.dispose(); G.auraGeo?.dispose(); for (const w of G.webs) w.g.dispose(); } },
  };
}
const fract = x => x - Math.floor(x);
const GEO_CACHE = new Map();   // spec → shared geometry (see buildCreature)

// membranes of the same kind merged into one geometry (one draw each for smoke wings and flesh wings)
function mergeWebs(THREE, webs, finish) {
  const out = [];
  for (const smoke of [false, true]) {
    const ws = webs.filter(w => w.smoke === smoke); if (!ws.length) continue;
    const A = { position: [], normal: [], color: [], skinIndex: [], skinWeight: [], aSolid: [] }, ix = []; let base = 0;
    for (const w of ws) {
      for (const k in A) { const at = w.g.attributes[k]; if (at) A[k].push(...at.array); }
      for (const i of w.g.index.array) ix.push(i + base); base += w.g.attributes.position.count; w.g.dispose();
    }
    const g = new THREE.BufferGeometry(); finish(g, A.position, A.normal, A.color, A.skinIndex, A.skinWeight, ix, A.aSolid.length ? A.aSolid : null);
    out.push({ g, smoke, opacity: ws[0].opacity });
  }
  return out;
}

// ---- a shade's smoke as particles (src/gfx/particles.js) ----
// Where the body has an aura (its would-be flesh), a dense rolling cloud clings to the bones: a dark heart, a purple
// haze round it, a violet glow at the core. Everywhere else smoke hugs the bones. Wisps break off and are left
// trailing in the air as it moves. Everything scales with look.smoke.
function shadePuffs(THREE, P, chains, byChain, look) {
  const avg = r => Array.isArray(r) ? (r[0] + r[1]) / 2 : r;
  const anchors = [], aura = [], hug = [], core = [], wing = [];
  for (const c of chains) {
    const arr = byChain[c.name], R = (c.aura || c.r || []).map(avg).map(v => c.aura ? v : v * 1.8);
    arr.forEach((b, j) => {
      if (j === arr.length - 1 && arr.length > 1) return;   // (segments run joint to joint; the tip joint ends the last)
      const i = anchors.length, ra = R[j] ?? 0.05, rb = R[j + 1] ?? ra * 0.5;
      anchors.push({ a: b, b: arr[j + 1] || null, ra, rb });
      (c.aura ? aura : hug).push(i);
      if (c.aura && /^spine/.test(c.name) && (j === 1 || j === 2)) core.push(i);
      if (/^(arm|f\d|wing)/.test(c.name)) wing.push(i);
    });
  }
  const k = (look.smoke ?? 0.6) / 0.6 * (look.cheap ? 0.35 : 1) * (look.puffK ?? 1), aK = 1 + (1 - (look.puffK ?? 1)) * 0.5, smoke = look.smokeColor || '#0c0616', puffs = [];
  if (aura.length) {
    const haze = new THREE.Color(look.aura || '#1e0c40').lerp(new THREE.Color(look.auraGlow || '#5a28b8'), 0.4);   // (lifted toward the glow: it has to read against a night sky)
    puffs.push({ group: 'smokeAura', on: aura, mode: 'cling', rate: 170 * k, life: [0.8, 1.4], size: [1.9, 2.8], sizeByRadius: true, color: '#' + haze.getHexString(), alpha: 0.5 * aK, rise: 0.02, drift: 0.05 });
    puffs.push({ group: 'smokeAura', on: aura, mode: 'cling', rate: 70 * k, life: [0.6, 1.1], size: [1.2, 1.8], sizeByRadius: true, color: smoke, alpha: 0.55 * aK, rise: 0.01, drift: 0.03 });
    if (core.length) puffs.push({ group: 'coreGlow', on: core, mode: 'cling', rate: 22 * (look.coreGlow ?? 1), life: [0.6, 1.0], size: [1.1, 1.7], sizeByRadius: true, color: look.auraGlow || '#5a28b8', alpha: 0.3, add: true, rise: 0.03, drift: 0.02 });
  }
  if (hug.length) puffs.push({ group: 'smokeAura', on: hug, mode: 'cling', rate: (aura.length ? 30 : 70) * k, life: [0.6, 1.1], size: [1.6, 2.6], sizeByRadius: true, color: smoke, alpha: 0.38, rise: 0.05, drift: 0.04 });
  puffs.push({ group: 'wisps', on: wing.length ? [...wing, ...aura] : null, mode: 'trail', rate: 34 * k, life: [0.9, 1.7], size: [0.07 * (look.wispSize ?? 1) / 0.6, 0.26 * (look.wispSize ?? 1) / 0.6], color: smoke, alpha: 0.32, rise: look.wispRise ?? 0.4, drift: 0.12 });
  return P.attach({ anchors, puffs });
}

// ---- the shade look (src/data/monsters.js Umbrafiend): a near-black body that drinks the light, a faint violet rim,
// and two shells of smoke that roll and flicker over it ----
// noise from a small tiling texture (two lookups) — the shells cover a lot of screen; arithmetic noise (three octaves of
// 3D value noise, 24 hashes a pixel per layer) was the main cost of a creature on screen
const NOISE = `
  uniform sampler2D uNz;
  float fbm(vec3 p) { vec2 q = p.xz + vec2(p.y * 0.73, -p.y * 0.41); return texture2D(uNz, q * 0.18).r * 0.62 + texture2D(uNz, q * 0.43 + 0.37).r * 0.38; }`;
let noiseTex = null;
function noiseTexture(THREE) {
  if (noiseTex) return noiseTex;
  const N = 128, g = new Float32Array(N * N), d = new Uint8Array(N * N * 4), h = (x, y) => { const v = Math.sin((x % 32) * 127.1 + (y % 32) * 311.7) * 43758.5453; return v - Math.floor(v); };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {   // smooth value noise, two octaves, tiling every 128 texels
    let v = 0, a = 0.65;
    for (const cell of [16, 8]) { const cx = x / cell, cy = y / cell, ix = Math.floor(cx), iy = Math.floor(cy), fx = cx - ix, fy = cy - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), M = N / cell;
      const c = (i, j) => h(((ix + i) % M + M) % M + cell * 7, ((iy + j) % M + M) % M + cell * 3);
      v += a * ((c(0, 0) * (1 - sx) + c(1, 0) * sx) * (1 - sy) + (c(0, 1) * (1 - sx) + c(1, 1) * sx) * sy); a = 0.35; }
    g[y * N + x] = v;
  }
  for (let i = 0; i < N * N; i++) { const v = Math.round(g[i] * 255); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  noiseTex = new THREE.DataTexture(d, N, N, THREE.RGBAFormat); noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping; noiseTex.magFilter = THREE.LinearFilter; noiseTex.minFilter = THREE.LinearFilter; noiseTex.needsUpdate = true;
  return noiseTex;
}
function shadeBodyMaterial(THREE, U, look, twoInfluence = false) {
  const m = new THREE.MeshStandardMaterial({ color: look.body || '#07040c', roughness: 1, metalness: 0, skinning: true, emissive: new THREE.Color(look.rim || '#2a1050') });   // (solid, so it writes depth and is cheap: where it thins to smoke it's cut away, not blended)
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uNz = U.uNz;
    if (twoInfluence) {
      // Umbrafiend body vertices are authored with one or two non-zero influences. Keep the same
      // skeleton and pose, but avoid fetching and blending the unused Z/W bone matrices.
      sh.vertexShader = sh.vertexShader
        .replace('#include <skinbase_vertex>', `#ifdef USE_SKINNING
          mat4 boneMatX = getBoneMatrix( skinIndex.x );
          mat4 boneMatY = getBoneMatrix( skinIndex.y );
        #endif`)
        .replace('#include <skinnormal_vertex>', `#ifdef USE_SKINNING
          mat4 skinMatrix = mat4( 0.0 );
          skinMatrix += skinWeight.x * boneMatX;
          skinMatrix += skinWeight.y * boneMatY;
          skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
          objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
        #endif`)
        .replace('#include <skinning_vertex>', `#ifdef USE_SKINNING
          vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
          vec4 skinned = vec4( 0.0 );
          skinned += boneMatX * skinVertex * skinWeight.x;
          skinned += boneMatY * skinVertex * skinWeight.y;
          transformed = ( bindMatrixInverse * skinned ).xyz;
        #endif`);
    }
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; attribute float aSolid; varying float vSolid;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vSolid = aSolid;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime; varying vec3 vWP; varying float vSolid;' + NOISE)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float rim = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 3.5);   // only the edges show, faintly violet
          float n = fbm(vWP * 3.0 + vec3(0.0, -uTime * 0.6, 0.0));
          totalEmissiveRadiance *= rim * (0.5 + 0.8 * n) * (0.3 + 0.7 * vSolid); diffuseColor.rgb *= 0.5 + 0.5 * n;
          float d = vSolid + (fbm(vWP * 6.0 + vec3(0.0, -uTime * 1.1, 0.0)) - 0.5) * 0.7;   // where it thins to smoke the edge frays and moves
          if (d < 0.3) discard; }`);
  };
  m.customProgramCacheKey = () => twoInfluence ? 'umbrafiend-two-influence-skinning-v1' : 'umbrafiend-four-influence-skinning-v1';
  return m;
}
function smokeMaterial(THREE, U, inflate, alpha, look) {
  const m = new THREE.MeshBasicMaterial({ color: look.smokeColor || '#140a22', transparent: true, depthWrite: false, skinning: true });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uSmoke = U.uSmoke; sh.uniforms.uNz = U.uNz;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime, uSmoke; varying vec3 vWP; varying float vRim; attribute float aSolid; varying float vSolid;' + NOISE)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { float n = fbm(position * 2.2 + vec3(0.0, -uTime * 0.8, uTime * 0.2));   // (puffed out in the bind pose, then skinned with the body; more where it's thinning to smoke)
          vSolid = aSolid; transformed += normal * ${inflate.toFixed(3)} * (0.4 + 1.4 * n) * (0.4 + uSmoke) * (1.0 + 1.6 * (1.0 - aSolid)); }`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vRim = 1.0 - abs(dot(normalize(-mvPosition.xyz), normalize(normalMatrix * normal)));`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime, uSmoke; varying vec3 vWP; varying float vRim; varying float vSolid;' + NOISE)
      .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
        { float n = fbm(vWP * 4.0 + vec3(0.0, -uTime * 1.3, 0.0));
          diffuseColor.a = ${alpha.toFixed(2)} * uSmoke * smoothstep(0.35, 0.75, n) * (0.35 + 0.65 * max(vRim, 1.0 - vSolid)) * (0.5 + 0.9 * (1.0 - vSolid * 0.6)); }`);
  };
  return m;
}

// smoke membranes (a shade's wings and fins): dark smoke stretched between bones, solid along them, wispy and moving
// where it's thin, fraying at the free edge
function smokeWebMaterial(THREE, U, look) {
  const cheap = !!look.cheap;   // (a swarm's wings: solid and cut out — no blending, no overdraw, the depth test throws away what's behind)
  const m = new THREE.MeshBasicMaterial({ color: look.webColor || look.smokeColor || '#0c0616', transparent: !cheap, depthWrite: cheap, side: THREE.DoubleSide, skinning: true });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uSmoke = U.uSmoke; sh.uniforms.uNz = U.uNz;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSolid; varying float vSolid; varying vec3 vWP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvSolid = aSolid; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime, uSmoke; varying float vSolid; varying vec3 vWP;' + NOISE)
      .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
        { float n = fbm(vWP * 5.0 + vec3(0.0, uTime * 0.9, -uTime * 0.5));
          float d = vSolid + (n - 0.5) * 0.9;
          diffuseColor.a = smoothstep(0.1, 0.55, d) * (0.7 + 0.3 * vSolid); diffuseColor.rgb *= 0.7 + 0.6 * n; diffuseColor.rgb += vec3(0.05, 0.02, 0.1) * (1.0 - vSolid) * n; ${cheap ? 'if (diffuseColor.a < 0.45) discard; diffuseColor.a = 1.0;' : 'if (diffuseColor.a < 0.02) discard;'} }`);
  };
  m.customProgramCacheKey = () => cheap ? 'smokeweb-cheap' : 'smokeweb';   // (same patch code, different shader: keep them apart)
  return m;
}

// the aura (a shade's would-be flesh): a cloud that's densest where you look straight into it and soft at its edges,
// rolling upward; the inner layer a deep violet haze, the outer a faint additive glow
function auraMaterial(THREE, U, look, inflate, glow) {
  const m = new THREE.MeshBasicMaterial({ color: glow ? (look.auraGlow || '#6a30d0') : (look.aura || '#2a1052'), transparent: true, depthWrite: false, skinning: true,
    blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending, side: glow ? THREE.FrontSide : THREE.DoubleSide });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uSmoke = U.uSmoke; sh.uniforms.uNz = U.uNz;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; attribute float aSolid; varying float vSolid; varying vec3 vWP; varying float vFace;' + NOISE)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { float n = fbm(position * 3.0 + vec3(0.0, -uTime * 0.7, 0.0)); transformed += normal * (${inflate.toFixed(3)} + 0.03 * (n - 0.5)); }`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vSolid = aSolid; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vFace = abs(dot(normalize(-mvPosition.xyz), normalize(normalMatrix * normal)));`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime, uSmoke; varying float vSolid; varying vec3 vWP; varying float vFace;' + NOISE)
      .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
        { float n = fbm(vWP * 3.5 + vec3(0.0, -uTime * 0.9, uTime * 0.3)), n2 = fbm(vWP * 9.0 + vec3(uTime * 0.4, -uTime * 1.6, 0.0));
          float body = pow(vFace, ${glow ? '0.6' : '1.4'}) * smoothstep(0.05, 0.6, vSolid + (n - 0.5) * 0.8);
          diffuseColor.a = body * ${glow ? '0.16' : '0.6'} * (0.4 + 1.2 * n * n2) * (0.5 + 0.7 * uSmoke);
          diffuseColor.rgb *= 0.5 + 1.0 * n; diffuseColor.rgb += ${glow ? 'vec3(0.0)' : 'vec3(0.10, 0.04, 0.22) * pow(vFace, 2.0) * n'}; if (diffuseColor.a < 0.01) discard; }`);
  };
  return m;
}
