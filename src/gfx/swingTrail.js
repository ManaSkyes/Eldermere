// src/gfx/swingTrail.js — the pale ghost a swing leaves in the air (player only), so you can see where a blow goes.
// A ribbon between the blade's forte and its tip, laid down while the swing is live and fading out behind it in a
// fraction of a second. Its colour says what the blow deals: steel (slash, pierce, blunt, crush) a pale silver, an
// element its own hue (fire, frost, storm, light, lunar, dark, earth, arcane) — for enchanted weapons later.
//
//   const trail = createSwingTrail(THREE, scene)
//   trail.update(dt, { base, tip } | null, type)   once a frame after the body is posed: the blade's two ends in
//                                                    the world while the swing is live (null otherwise), and its type
const COLORS = {
  slash: '#e8ecf4', pierce: '#e8ecf4', blunt: '#dcd8d0', crush: '#d8d0c4', bleed: '#ffd0d0',
  fire: '#ff9a40', frost: '#a8e4ff', storm: '#fff08a', light: '#fff2b0', lunar: '#c8d4ff', dark: '#9a5aff',
  shadow: '#9a5aff', earth: '#c8a070', arcane: '#ff8af0', poison: '#a8ff7a',
};
export function createSwingTrail(THREE, scene, { life = 0.18, max = 48 } = {}) {
  const pos = new Float32Array(max * 2 * 3), fade = new Float32Array(max * 2), side = new Float32Array(max * 2);
  for (let i = 0; i < max; i++) { side[i * 2] = 0; side[i * 2 + 1] = 1; }
  const idx = []; for (let i = 0; i < max - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aFade', new THREE.BufferAttribute(fade, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1)); geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uCol: { value: new THREE.Color(COLORS.slash) }, uGlow: { value: 0 } },
    vertexShader: 'attribute float aFade, aSide; varying float vF, vS; void main() { vF = aFade; vS = aSide; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    // densest along the edge (the tip side) and freshest at the blade, gone at the tail; elements glow a little
    fragmentShader: 'uniform vec3 uCol; uniform float uGlow; varying float vF, vS; void main() { float a = vF * vF * (0.12 + 0.5 * smoothstep(0.25, 1.0, vS)); gl_FragColor = vec4(uCol * (1.0 + uGlow * 0.6), a * (0.9 + 0.3 * uGlow)); }',
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.visible = false;
  mesh.userData.noReflect = true; mesh.userData.noCover = true; mesh.userData.noLampShadow = true;
  scene.add(mesh);
  const S = [];   // samples: { b: Vector3, t: Vector3, age }
  const V = () => new THREE.Vector3(), cr = (p0, p1, p2, p3, u, out) => {   // Catmull-Rom: smooth between frames
    const u2 = u * u, u3 = u2 * u;
    return out.set(
      0.5 * (2 * p1.x + (-p0.x + p2.x) * u + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3),
      0.5 * (2 * p1.y + (-p0.y + p2.y) * u + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3),
      0.5 * (2 * p1.z + (-p0.z + p2.z) * u + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * u2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * u3));
  };
  let raw = [];   // the last few real samples, for the curve
  function update(dt, blade, type) {
    for (const s of S) s.age += dt;
    while (S.length && S[0].age > life) S.shift();
    if (blade) {
      if (type) { mat.uniforms.uCol.value.set(COLORS[type] || COLORS.slash); mat.uniforms.uGlow.value = ['slash', 'pierce', 'blunt', 'crush', 'bleed'].includes(type) ? 0 : 1; }
      raw.push({ b: blade.base.clone(), t: blade.tip.clone() }); if (raw.length > 4) raw.shift();
      if (raw.length >= 3) {   // fill in between the last two real samples (a fast swing at 60 fps leaves gaps)
        const n = raw.length, p0 = raw[Math.max(0, n - 4)], p1 = raw[n - 3], p2 = raw[n - 2], p3 = raw[n - 1];
        const steps = Math.min(6, Math.max(1, Math.ceil(p2.t.distanceTo(p1.t) / 0.08)));
        for (let k = 1; k <= steps; k++) { const u = k / steps; S.push({ b: cr(p0.b, p1.b, p2.b, p3.b, u, V()), t: cr(p0.t, p1.t, p2.t, p3.t, u, V()), age: dt * (1 - u) }); }
      } else S.push({ b: blade.base.clone(), t: blade.tip.clone(), age: 0 });
      while (S.length > max) S.shift();
    } else raw = [];
    mesh.visible = S.length > 1;
    if (!mesh.visible) return;
    for (let i = 0; i < max; i++) {
      const s = S[Math.min(S.length - 1, Math.max(0, i - (max - S.length)))], o = i * 6, f = i < max - S.length ? 0 : Math.max(0, 1 - s.age / life);
      pos[o] = s.b.x; pos[o + 1] = s.b.y; pos[o + 2] = s.b.z; pos[o + 3] = s.t.x; pos[o + 4] = s.t.y; pos[o + 5] = s.t.z;
      fade[i * 2] = f; fade[i * 2 + 1] = f;
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.aFade.needsUpdate = true;
  }
  return { update, mesh, dispose() { scene.remove(mesh); geo.dispose(); mat.dispose(); } };
}
