// Rivers and lakes (the meshes from src/game/ground.js). One shader for all of them:
// - colour by depth: clear and sandy-green in the shallows (the bed shows through), dark blue-green in the deep
// - ripples from a tiling noise texture, carried along by the current with the flow-map trick (two copies half
//   a cycle apart, cross-faded, so they never stretch), plus a slow wind layer so still water isn't dead flat
// - the sky reflected (more at grazing angles), a sun glint, foam along the shore and over fast shallows
// Each corner of a mesh carries (depth, distance from the shore, current x, current z, roughness: rapids and the
// churn below a fall). Waterfalls are curtains (from ground.js) with their own streaming shader.

export function createRiverWater(THREE, scene, meshes, falls = [], fx = null) {
  if (!meshes?.length && !falls?.length) return { update() {} };
  // a tiling noise: R,G = the ripple normal, B = a foam pattern
  const N = 256, tex = (() => {
    const rnd = (() => { let s = 1234567; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    const layer = per => { const g = Array.from({ length: per * per }, rnd); return (x, y) => { const fx = x * per / N, fy = y * per / N, i = Math.floor(fx), j = Math.floor(fy), a = fx - i, b = fy - j, s = t => t * t * (3 - 2 * t), A = s(a), Bq = s(b);
      const v = (ii, jj) => g[((jj % per + per) % per) * per + ((ii % per + per) % per)]; return (v(i, j) * (1 - A) + v(i + 1, j) * A) * (1 - Bq) + (v(i, j + 1) * (1 - A) + v(i + 1, j + 1) * A) * Bq; }; };
    const oct = [[layer(4), 0.5], [layer(8), 0.25], [layer(16), 0.14], [layer(32), 0.07], [layer(64), 0.04]];
    const foam = [[layer(16), 0.5], [layer(32), 0.3], [layer(64), 0.2]];
    const H = new Float32Array(N * N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let h = 0; for (const [f, w] of oct) h += f(x, y) * w; H[y * N + x] = h; }
    const D = new Uint8Array(N * N * 4), hAt = (x, y) => H[((y + N) % N) * N + ((x + N) % N)];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = (hAt(x + 1, y) - hAt(x - 1, y)) * 9, dy = (hAt(x, y + 1) - hAt(x, y - 1)) * 9; let fo = 0; for (const [f, w] of foam) fo += f(x, y) * w;
      const k = (y * N + x) * 4; D[k] = Math.max(0, Math.min(255, 128 + dx * 127)); D[k + 1] = Math.max(0, Math.min(255, 128 + dy * 127)); D[k + 2] = Math.round(fo * 255); D[k + 3] = 255;
    }
    const t = new THREE.DataTexture(D, N, N, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true; return t;
  })();
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uNoise: { value: null }, uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() }, uSunCol: { value: new THREE.Color(1, 0.95, 0.85) },
    uSkyTop: { value: new THREE.Color('#7fa6c8') }, uSkyHor: { value: new THREE.Color('#c8d6e0') }, uLight: { value: 1 },
  }]);
  uniforms.uNoise.value = tex;
  const mat = new THREE.ShaderMaterial({
    uniforms, fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      attribute vec4 aData; attribute float aRough; varying vec4 vD; varying vec3 vW; varying float vR;
      #include <fog_pars_vertex>
      void main() { vD = aData; vR = aRough; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime, uLight; uniform sampler2D uNoise; uniform vec3 uSunDir, uSunCol, uSkyTop, uSkyHor;
      varying vec4 vD; varying vec3 vW; varying float vR;
      #include <fog_pars_fragment>
      vec2 nrm(vec2 uv) { return texture2D(uNoise, uv).rg * 2.0 - 1.0; }
      void main() {
        float depth = vD.x, shore = vD.y; vec2 fl = vD.zw; float spd = length(fl);
        float p0 = fract(uTime * 0.25), p1 = fract(uTime * 0.25 + 0.5), w0 = 1.0 - abs(1.0 - 2.0 * p0);
        vec2 uv = vW.xz, o0 = fl * p0 * 4.0, o1 = fl * p1 * 4.0;
        vec2 big = nrm((uv - o0) / 6.0) * w0 + nrm((uv - o1) / 6.0 + 0.37) * (1.0 - w0);
        vec2 fine = nrm((uv - o0) / 1.7 + 0.11) * w0 + nrm((uv - o1) / 1.7 + 0.71) * (1.0 - w0);
        vec2 wind = nrm(uv / 9.0 + uTime * vec2(0.013, 0.009)) + nrm(uv / 3.1 - uTime * vec2(0.02, -0.027)) * 0.6;
        float str = 0.22 + min(spd, 2.5) * 0.16 + vR * 0.45;
        vec3 n = normalize(vec3((big.x * 0.6 + fine.x * 0.4) * str + wind.x * 0.12, 1.0, (big.y * 0.6 + fine.y * 0.4) * str + wind.y * 0.12));
        vec3 view = normalize(cameraPosition - vW); if (view.y < 0.0) n.y = -n.y;        // (from under the surface)
        float fres = (0.03 + 0.97 * pow(1.0 - max(dot(n, view), 0.0), 5.0)) * 0.7;
        vec3 r = reflect(-view, n), sky = mix(uSkyHor, uSkyTop, clamp(r.y * 1.6, 0.0, 1.0));
        float spec = pow(max(dot(r, uSunDir), 0.0), 220.0) * 2.5;
        float ab = 1.0 - exp(-max(depth, 0.0) * 0.9);
        vec3 body = mix(vec3(0.19, 0.40, 0.34), vec3(0.012, 0.07, 0.11), ab) * uLight;
        body = mix(body, vec3(0.004, 0.025, 0.05) * uLight, smoothstep(4.0, 25.0, depth));   // (and darker still in really deep water)
        float alpha = mix(0.35, 0.96, ab);
        float fn = texture2D(uNoise, (uv - o0) / 1.4).b * w0 + texture2D(uNoise, (uv - o1) / 1.4 + 0.5).b * (1.0 - w0);
        float edge = 1.0 - smoothstep(0.0, 0.9, shore), fast = max(smoothstep(1.2, 2.8, spd) * (1.0 - smoothstep(0.5, 1.8, depth)), vR);
        float foam = smoothstep(0.55, 0.78, fn * 0.7 + edge * 0.45 + fast * 0.35) * max(edge * 0.75, fast);
        vec3 col = mix(body, sky * uLight * 0.8, fres) + uSunCol * spec;
        col = mix(col, vec3(0.88, 0.93, 0.94) * uLight, foam);
        alpha = max(max(alpha, fres * 0.85), foam) * smoothstep(-0.02, 0.1, depth);
        gl_FragColor = vec4(col, alpha);
        #include <fog_fragment>
      }`,
  });
  for (const w of meshes || []) {
    const g = new THREE.BufferGeometry(), ib = new THREE.InterleavedBuffer(w.data, 5); g.setAttribute('position', new THREE.BufferAttribute(w.positions, 3));
    g.setAttribute('aData', new THREE.InterleavedBufferAttribute(ib, 4, 0)); g.setAttribute('aRough', new THREE.InterleavedBufferAttribute(ib, 1, 4)); g.setIndex(w.index); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.renderOrder = 2; m.frustumCulled = true; m.userData.probe = 'water'; scene.add(m);
  }
  // waterfalls: sheets that leave the lip on a falling arc (hugging the rock where it stands out). Streaks stream
  // down, faster as the water falls; clearer and darker near the lip, aerated white lower down; soft at the sides
  const fallU = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uNoise: { value: null }, uLight: { value: 1 }, uSkyHor: { value: new THREE.Color('#c8d6e0') } }]); fallU.uNoise.value = tex;
  const fallMat = new THREE.ShaderMaterial({ uniforms: fallU, fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `attribute vec2 aUV, aEdge; varying vec2 vUv, vEd; varying vec3 vW;
      #include <fog_pars_vertex>
      void main() { vUv = aUV; vEd = aEdge; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime, uLight; uniform sampler2D uNoise; uniform vec3 uSkyHor; varying vec2 vUv, vEd; varying vec3 vW;
      #include <fog_pars_fragment>
      void main() {
        // down the sheet in 'time fallen' (the square root of the distance), so the streaks speed up as they fall and
        // always run downward
        float tf = sqrt(vUv.y + 0.3) * 2.2;
        float s1 = texture2D(uNoise, vec2(vUv.x * 0.22, (tf - uTime * 1.1) * 0.35)).b, s2 = texture2D(uNoise, vec2(vUv.x * 0.6 + 0.3, (tf - uTime * 1.4) * 0.7)).b;
        float s3 = texture2D(uNoise, vec2(vUv.x * 1.7 + 0.7, (tf - uTime * 1.8) * 1.5)).b;
        float streak = smoothstep(0.3, 0.8, s1 * 0.5 + s2 * 0.35 + s3 * 0.25);
        float aer = smoothstep(0.0, 0.9, vEd.y);                              // 0 at the lip, 1 at the foot
        vec3 deep = vec3(0.10, 0.25, 0.28), white = vec3(0.90, 0.95, 0.96);
        vec3 col = mix(mix(deep, uSkyHor * 0.8, 0.25), white, clamp(streak * (0.5 + 0.5 * aer) + aer * 0.35, 0.0, 1.0)) * uLight;
        float a = (0.45 + 0.45 * streak + 0.2 * aer) * smoothstep(0.0, 0.7, vEd.x) * (1.0 - smoothstep(0.85, 1.0, vEd.y) * (1.0 - streak) * 0.6);
        gl_FragColor = vec4(col, clamp(a, 0.0, 0.95));
        #include <fog_fragment>
      }` });
  for (const f of falls || []) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(f.positions, 3)); g.setAttribute('aUV', new THREE.BufferAttribute(f.uv, 2)); g.setAttribute('aEdge', new THREE.BufferAttribute(f.edge, 2)); g.setIndex(f.index); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, fallMat); m.renderOrder = 3; m.userData.probe = 'water'; scene.add(m);
  }
  // spray: mist rising off the foot of a fall, droplets thrown out of it, white flecks hopping over rapids and past
  // boulders. Each emitter (x, y, z, direction x, z, strength) sends out a few particles that loop in the shader
  // (nothing moves on the CPU)
  const fxMats = [];
  const KIND = { mist: [0, 3, 0.18], spray: [1, 6, 0.3], fleck: [2, 3, 0.2] };            // [kind, particles per emitter, base size]
  for (const [name, [kind, per, size]] of Object.entries(KIND)) {
    const E = fx?.[name]; if (!E?.length) continue;
    const P = new Float32Array(E.length * per * 3), Dd = new Float32Array(E.length * per * 3), Sd = new Float32Array(E.length * per * 2);
    let n = 0; for (const e of E) for (let q = 0; q < per; q++, n++) { P.set([e[0], e[1], e[2]], n * 3); Dd.set([e[3], e[4], e[5]], n * 3); Sd.set([Math.random(), Math.random()], n * 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('aDir', new THREE.BufferAttribute(Dd, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(Sd, 2)); g.computeBoundingSphere();
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uTime: { value: 0 }, uScale: { value: 400 }, uLight: { value: 1 } },
      vertexShader: `uniform float uTime, uScale; attribute vec3 aDir; attribute vec2 aSeed; varying float vA;
        void main() {
          float K = ${kind.toFixed(1)}, life = K < 0.5 ? 3.5 : (K < 1.5 ? 1.3 : 0.9), t = fract(uTime / life + aSeed.x), sz = ${size.toFixed(2)};
          vec3 p = position; vec2 side = vec2(-aDir.y, aDir.x); float r1 = aSeed.y * 2.0 - 1.0, r2 = fract(aSeed.y * 7.31) * 2.0 - 1.0, r3 = fract(aSeed.y * 3.7);
          if (K < 0.5) { p.xz += aDir.xy * (t * 2.5 + 0.4) + side * r1 * 0.9; p.y += 0.2 + t * (1.2 + min(aDir.z, 8.0) * 0.25); vA = sin(t * 3.14159) * 0.2; sz *= 14.0 + t * 18.0; }
          else if (K < 1.5) { float v = 2.0 + r3 * 2.5 * min(1.0, aDir.z / 4.0), tt = t * life; p.xz += (aDir.xy * (1.0 + r2 * 0.5) + side * r1 * 0.8) * tt * 1.8; p.y += v * tt - 4.9 * tt * tt; vA = (1.0 - t) * 0.75; }
          else { float tt = t * life; p.xz += aDir.xy * aDir.z * tt + side * r1 * 0.6 + aDir.xy * r2 * 0.8; p.y += 0.04 + sin(t * 3.14159) * (0.15 + 0.12 * aDir.z); vA = sin(t * 3.14159) * 0.75; }
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = sz * uScale / max(0.5, -mv.z); gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform float uLight; varying float vA;
        void main() { float d = length(gl_PointCoord - 0.5); float a = vA * smoothstep(0.5, 0.1, d); if (a < 0.01) discard; gl_FragColor = vec4(vec3(0.92, 0.95, 0.97) * uLight, a); }` });
    const pts = new THREE.Points(g, mat); pts.renderOrder = 4; pts.frustumCulled = false; pts.userData.probe = 'water'; scene.add(pts); fxMats.push(mat);
  }
  let sun = null; const tmp = new THREE.Vector3(), bg = new THREE.Color();
  return {
    update(t) {
      for (const m of fxMats) { m.uniforms.uTime.value = t; m.uniforms.uScale.value = (window.innerHeight || 800) * 0.5; m.uniforms.uLight.value = uniforms.uLight.value; }
      uniforms.uTime.value = t; fallU.uTime.value = t; fallU.uLight.value = uniforms.uLight.value; fallU.uSkyHor.value.copy(uniforms.uSkyHor.value);
      if (!sun) scene.traverse(o => { if (!sun && o.isDirectionalLight) sun = o; });
      if (sun) { tmp.copy(sun.position).sub(sun.target.position).normalize(); uniforms.uSunDir.value.copy(tmp); uniforms.uSunCol.value.copy(sun.color).multiplyScalar(Math.min(1.5, sun.intensity)); }
      if (scene.background?.isColor) { bg.copy(scene.background); uniforms.uSkyTop.value.copy(bg).multiplyScalar(0.85); uniforms.uSkyHor.value.copy(scene.fog?.color || bg); const lum = bg.r * 0.3 + bg.g * 0.55 + bg.b * 0.15; uniforms.uLight.value = Math.max(0.12, Math.min(1.1, lum * 1.5)); }
    },
  };
}
