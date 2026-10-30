// src/gfx/particles.js — one shared GPU particle system for the whole map: every puff of smoke, haze and glow from
// every monster (and later spells, hits, fires) is drawn in ONE draw call.
//
//   const P = createParticles(THREE, scene, { max: 16384 })
//   const h = P.attach({ anchors, puffs })      a body that gives off particles (a creature): returns a handle
//       anchors: [{ a: bone, b: bone|null, ra, rb }]   segments of a skeleton (bone a → bone b, radius ra → rb)
//       puffs:   [{ rate, life: [lo, hi], size: [start, end], color, alpha, add, rise, drift, mode, on: [anchor i...] }]
//                mode 'cling' — the puff rides its segment (it moves with the body: a cloud in the shape of flesh)
//                mode 'trail' — born on the segment, then left in the world (smoke trailing behind it as it moves)
//       h.scale  emission × this (0 stops it: a dying shade thins away); h.remove()
//       h.sleep  true: skipped entirely (its owner decides: far away, off screen); h.extLod + h.lod: the owner sets the detail
//   P.burst(pos, { n, life, size, color, alpha, add, speed, rise })   a one-off spray (hits, bursts)
//   P.update(dt, camera)                        once a frame, after the bodies have moved
//
// How it stays cheap with 50+ creatures:
//   - one InstancedBufferGeometry (a quad) and a ring buffer of particles; only the slots written this frame are
//     uploaded. Each particle carries its birth, life, motion and look; the GPU works out where it is and how it looks
//     (nothing is touched on the CPU after it's born).
//   - 'cling' particles read their segment's position from a small float texture of anchor points (2 texels a
//     segment, written once a frame), so a body-shaped cloud follows the skeleton with no per-particle CPU work.
//   - emission thins with distance and off screen (far monsters puff less); near the camera puffs fade out, so a
//     creature in your face can't fill the screen with overdraw.
//   - one cheap fragment shader: a texture lookup from a 2×2 atlas of soft puffs. Premultiplied alpha, so dark smoke
//     (normal blend) and glows (additive) share the same draw.

export function createParticles(THREE, scene, { max = 16384 } = {}) {
  // ---- the particle buffer ----
  const quad = new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('corner', new THREE.BufferAttribute(quad, 2)); geo.setIndex([0, 1, 2, 0, 2, 3]);
  const mk = () => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); a.setUsage(THREE.DynamicDrawUsage); return a; };
  const iA = mk(), iB = mk(), iC = mk(), iD = mk(), iE = mk();   // A pos/offset + born · B velocity + life · C size0 size1 alpha slot · D rgb add · E u seed spin
  geo.setAttribute('iA', iA); geo.setAttribute('iB', iB); geo.setAttribute('iC', iC); geo.setAttribute('iD', iD); geo.setAttribute('iE', iE);
  for (let i = 0; i < max; i++) iB.array[i * 4 + 3] = -1;    // (all dead to begin with)
  geo.instanceCount = max;
  let head = 0, dirtyLo = Infinity, dirtyHi = -1, now = 0;

  // ---- anchor texture: 2 texels per segment (start xyz + radius, end xyz + radius) ----
  const TW = 512, TH = 16, SLOTS = TW * TH / 2;
  const anchorData = new Float32Array(TW * TH * 4);
  const anchorTex = new THREE.DataTexture(anchorData, TW, TH, THREE.RGBAFormat, THREE.FloatType);
  anchorTex.magFilter = anchorTex.minFilter = THREE.NearestFilter; anchorTex.generateMipmaps = false; anchorTex.needsUpdate = true;
  const freeSlots = []; for (let i = SLOTS - 1; i >= 0; i--) freeSlots.push(i);
  const parked = [];   // slots of removed bodies, freed once their last puffs have died
  let parkedHead = 0;   // expiry times are appended in order, so reclaim from the front without repeated array shifts
  for (let s = 0; s < SLOTS; s++) anchorData[s * 8 + 3] = -1;

  // ---- the soft puff atlas (2×2 cells, made once) ----
  const tex = (() => {
    const N = 128, cv = document.createElement('canvas'); cv.width = cv.height = N * 2; const g = cv.getContext('2d');
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let cell = 0; cell < 4; cell++) {
      const ox = (cell % 2) * N, oy = Math.floor(cell / 2) * N;
      g.save(); g.beginPath(); g.rect(ox, oy, N, N); g.clip();
      for (let k = 0; k < 14; k++) {   // a puff: a soft heap of blobs, denser at its heart
        const a = rnd() * Math.PI * 2, d = Math.pow(rnd(), 1.4) * N * 0.24, r = N * (0.12 + rnd() * 0.16);
        const x = ox + N / 2 + Math.cos(a) * d, y = oy + N / 2 + Math.sin(a) * d;
        const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${0.26 + rnd() * 0.2})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(ox, oy, N, N);
      }
      g.restore();
    }
    const t = new THREE.CanvasTexture(cv); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t;
  })();

  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
    uniforms: { uTime: { value: 0 }, uAnchors: { value: anchorTex }, uAT: { value: new THREE.Vector2(TW, TH) }, uTex: { value: tex },
      uFogCol: { value: new THREE.Color() }, uFog: { value: new THREE.Vector3(1e6, 1e6, 0) } },   // fog: near, far, density (0: linear)
    vertexShader: `
      uniform float uTime; uniform sampler2D uAnchors; uniform vec2 uAT;
      attribute vec2 corner; attribute vec4 iA, iB, iC, iD, iE;
      varying vec2 vUv; varying float vA; varying vec3 vCol; varying float vAdd; varying float vDepth;
      vec4 anchor(float i) { return texture2D(uAnchors, (vec2(mod(i, uAT.x), floor(i / uAT.x)) + 0.5) / uAT); }
      void main() {
        float age = uTime - iA.w, t = age / iB.w;
        vec3 p;
        bool dead = t < 0.0 || t > 1.0;
        if (!dead && iC.w >= 0.0) {                          // clinging: ride the segment it was born on
          vec4 a = anchor(iC.w * 2.0), b = anchor(iC.w * 2.0 + 1.0);
          dead = a.w < 0.0;
          p = mix(a.xyz, b.xyz, iE.x) + iA.xyz * mix(a.w, b.w, iE.x) + iB.xyz * age;
        } else p = iA.xyz + iB.xyz * age;                    // free: born somewhere, then drifts in the world
        if (dead) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        float ph = iE.y * 6.2832;
        p += vec3(sin(age * 1.7 + ph), 0.0, cos(age * 1.3 + ph)) * 0.05 * age;   // a lazy curl as it goes
        vec4 mv = viewMatrix * vec4(p, 1.0);
        float s = mix(iC.x, iC.y, t), ang = ph + age * iE.z, cs = cos(ang), sn = sin(ang);
        mv.xy += mat2(cs, sn, -sn, cs) * corner * s;
        float nearFade = smoothstep(0.25, 1.4, -mv.z);       // (no screen-filling puffs in your face)
        vA = iC.z * smoothstep(0.0, 0.18, t) * (1.0 - smoothstep(0.5, 1.0, t)) * nearFade;
        float cell = floor(fract(iE.y * 7.31) * 4.0);
        vUv = (corner + 0.5 + vec2(mod(cell, 2.0), floor(cell / 2.0))) * 0.5;
        vCol = iD.rgb; vAdd = iD.w; vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uTex; uniform vec3 uFogCol; uniform vec3 uFog;
      varying vec2 vUv; varying float vA; varying vec3 vCol; varying float vAdd; varying float vDepth;
      void main() {
        float a = texture2D(uTex, vUv).a * vA;
        if (a < 0.004) discard;
        float f = uFog.z > 0.0 ? 1.0 - exp(-uFog.z * uFog.z * vDepth * vDepth) : smoothstep(uFog.x, uFog.y, vDepth);
        vec3 c = mix(mix(vCol, uFogCol, f), vCol * (1.0 - f), vAdd);   // smoke melts into the fog; a glow just fades
        gl_FragColor = vec4(c * a, a * (1.0 - vAdd));
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.name = 'particles';
  mesh.userData.noReflect = true; mesh.userData.noCover = true; mesh.userData.noLampShadow = true;
  scene.add(mesh);

  // ---- writing a particle ----
  const col = new THREE.Color();
  function write(px, py, pz, vx, vy, vz, life, s0, s1, alpha, slot, r, g, b, add, u, spin) {
    const i = head, o = i * 4; head = (head + 1) % max;
    iA.array[o] = px; iA.array[o + 1] = py; iA.array[o + 2] = pz; iA.array[o + 3] = now;
    iB.array[o] = vx; iB.array[o + 1] = vy; iB.array[o + 2] = vz; iB.array[o + 3] = life;
    iC.array[o] = s0; iC.array[o + 1] = s1; iC.array[o + 2] = alpha; iC.array[o + 3] = slot;
    iD.array[o] = r; iD.array[o + 1] = g; iD.array[o + 2] = b; iD.array[o + 3] = add ? 1 : 0;
    iE.array[o] = u; iE.array[o + 1] = Math.random(); iE.array[o + 2] = spin;
    if (i < dirtyLo) dirtyLo = i; if (i > dirtyHi) dirtyHi = i;
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  function sphere(out) { let x, y, z, l; do { x = Math.random() * 2 - 1; y = Math.random() * 2 - 1; z = Math.random() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1 || l < 0.05); out[0] = x; out[1] = y; out[2] = z; return out; }
  const dir = [0, 0, 0];

  // ---- bodies ----
  const bodies = [];
  const wa = new THREE.Vector3(), wb = new THREE.Vector3(), camPos = new THREE.Vector3(), frustum = new THREE.Frustum(), pm = new THREE.Matrix4(), sph = new THREE.Sphere();
  function attach({ anchors, puffs }) {
    const segs = anchors.map(an => ({ ...an, slot: freeSlots.pop() ?? -1, w: 0 }));
    for (const s of segs) { const len = s.b ? s.a.userData.rest.distanceTo(s.b.userData.rest) : 0; s.w = (len + (s.ra + s.rb) * 0.5) * (s.ra + s.rb) * 0.5; }   // (weighted by area seen, roughly: thin legs still get their share)
    const P = puffs.map(p => {
      const on = (p.on || segs.map((_, i) => i)).filter(i => segs[i] && segs[i].slot >= 0);
      const tot = on.reduce((t, i) => t + segs[i].w, 0) || 1, cum = []; let c = 0; for (const i of on) { c += segs[i].w / tot; cum.push(c); }
      const cc = new THREE.Color(p.color || '#140a22');
      return { ...p, enabled: true, on, cum, r: cc.r, g: cc.g, b: cc.b, acc: Math.random() };
    });
    const h = { segs, puffs: P, scale: 1, lod: 1, enabled: true, removed: false,
      setEnabled(on) { h.enabled = !!on; },
      setGroupEnabled(group, on) { for (const p of P) if (p.group === group) p.enabled = !!on; },
      remove() { if (h.removed) return; h.removed = true; bodies.splice(bodies.indexOf(h), 1); for (const s of segs) if (s.slot >= 0) { anchorData[s.slot * 8 + 3] = -1; anchorData[s.slot * 8 + 7] = -1; parked.push([s.slot, now + 4]); } anchorTex.needsUpdate = true; } };
    bodies.push(h); return h;
  }
  function pick(p) { const r = Math.random(); for (let k = 0; k < p.cum.length; k++) if (r <= p.cum[k]) return p.on[k]; return p.on[p.on.length - 1]; }
  function emit(h, p, n) {
    for (let k = 0; k < n; k++) {
      const s = h.segs[pick(p)]; if (!s) return;
      const u = s.b ? Math.random() : 0, life = rnd(p.life[0], p.life[1]), rad = 0.55 + 0.45 * Math.sqrt(Math.random());
      sphere(dir); const sz = p.size, scaleR = p.sizeByRadius ? (s.ra + s.rb) * 0.5 : 1;
      const rise = p.rise || 0, dr = p.drift || 0.05;
      if (p.mode === 'trail') {   // born on the body, then left behind in the world
        const ax = anchorData, o = s.slot * 8, r0 = ax[o + 3] + (ax[o + 7] - ax[o + 3]) * u;
        const x = ax[o] + (ax[o + 4] - ax[o]) * u + dir[0] * r0 * rad, y = ax[o + 1] + (ax[o + 5] - ax[o + 1]) * u + dir[1] * r0 * rad, z = ax[o + 2] + (ax[o + 6] - ax[o + 2]) * u + dir[2] * r0 * rad;
        write(x, y, z, dir[0] * dr, rise + dir[1] * dr * 0.5, dir[2] * dr, life, sz[0] * scaleR, sz[1] * scaleR, p.alpha ?? 0.4, -1, p.r, p.g, p.b, p.add, 0, rnd(-0.6, 0.6));
      } else {                    // clinging: an offset round the segment, scaled by its radius on the GPU
        write(dir[0] * rad, dir[1] * rad, dir[2] * rad, dir[0] * dr, rise + dir[1] * dr * 0.5, dir[2] * dr, life, sz[0] * scaleR, sz[1] * scaleR, p.alpha ?? 0.4, s.slot, p.r, p.g, p.b, p.add, u, rnd(-0.6, 0.6));
      }
    }
  }
  function burst(pos, { n = 12, life = [0.4, 0.8], size = [0.15, 0.4], color = '#ffffff', alpha = 0.5, add = false, speed = 1.5, rise = 0.3 } = {}) {
    col.set(color);
    for (let k = 0; k < n; k++) { sphere(dir); const sp = speed * rnd(0.4, 1); write(pos.x, pos.y, pos.z, dir[0] * sp, dir[1] * sp + rise, dir[2] * sp, rnd(life[0], life[1]), size[0], size[1], alpha, -1, col.r, col.g, col.b, add, 0, rnd(-1, 1)); }
  }

  function update(dt, camera) {
    now += dt; mat.uniforms.uTime.value = now;
    // fog, from the scene (linear or exponential)
    const F = scene.fog; if (F) { mat.uniforms.uFogCol.value.copy(F.color); if (F.isFogExp2) mat.uniforms.uFog.value.set(0, 0, F.density); else mat.uniforms.uFog.value.set(F.near, F.far, 0); } else mat.uniforms.uFog.value.set(1e6, 1e6, 0);
    // Removed-body slots expire in insertion order. A head cursor avoids repeated splice() calls
    // when many creatures disappear together (each splice would shift the remaining queue).
    while (parkedHead < parked.length && parked[parkedHead][1] < now) {
      freeSlots.push(parked[parkedHead][0]); parkedHead++;
    }
    if (parkedHead > 256 && parkedHead * 2 > parked.length) { parked.splice(0, parkedHead); parkedHead = 0; }
    if (camera) { camera.getWorldPosition(camPos); pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pm); }
    // anchors where the bones are now, then new puffs
    for (const h of bodies) {
      if (h.sleep) continue;   // (its owner says it's asleep — far, off screen: no anchors, no puffs, no cost)
      let cx = 0, cy = 0, cz = 0, n = 0;
      for (const s of h.segs) {
        if (s.slot < 0) continue; const o = s.slot * 8;
        wa.setFromMatrixPosition(s.a.matrixWorld); if (s.b) wb.setFromMatrixPosition(s.b.matrixWorld); else wb.copy(wa);
        const sc = s.a.matrixWorld.elements, k = Math.hypot(sc[0], sc[1], sc[2]) || 1;   // (the body's scale: a dissolving shade shrinks)
        anchorData[o] = wa.x; anchorData[o + 1] = wa.y; anchorData[o + 2] = wa.z; anchorData[o + 3] = s.ra * k;
        anchorData[o + 4] = wb.x; anchorData[o + 5] = wb.y; anchorData[o + 6] = wb.z; anchorData[o + 7] = s.rb * k;
        cx += wa.x; cy += wa.y; cz += wa.z; n++;
      }
      // fewer puffs far away and off screen: nobody sees the difference, and 50 monsters cost little more than 5
      if (camera && n && !h.extLod) { sph.center.set(cx / n, cy / n, cz / n); sph.radius = 2.5; const d = sph.center.distanceTo(camPos); h.lod = (frustum.intersectsSphere(sph) ? 1 : 0.15) * (d < 15 ? 1 : d < 35 ? 0.55 : d < 70 ? 0.25 : 0.08); }
      const k = Math.max(0, h.scale) * h.lod;
      for (const p of h.puffs) { p.acc += p.rate * k * dt; const m = Math.floor(p.acc); if (m > 0) { p.acc -= m; emit(h, p, Math.min(m, 64)); } }
    }
    anchorTex.needsUpdate = bodies.length > 0 || anchorTex.needsUpdate;
    // upload only what was written this frame
    if (dirtyHi >= 0) {
      for (const a of [iA, iB, iC, iD, iE]) { a.updateRange.offset = dirtyLo * 4; a.updateRange.count = (dirtyHi - dirtyLo + 1) * 4; a.needsUpdate = true; }
      dirtyLo = Infinity; dirtyHi = -1;
    }
  }
  return { attach, burst, update, mesh, get count() { return max; }, dispose() { scene.remove(mesh); geo.dispose(); mat.dispose(); tex.dispose(); anchorTex.dispose(); } };
}
