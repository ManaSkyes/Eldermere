// src/gfx/weather.js — the weather, in four layers that work together but can each be set on their own:
//   weather  what falls or blows through the air (rain, snow, sand, leaves, magic motes) and its tint on the light
//   clouds   the cloud type and how much of the sky they cover
//   wind     how hard it blows (and gusts); the map sets where from. Moves the grass and trees, the clouds, the air
//   fog      how thick
// Each kind of weather brings its own clouds, wind and fog; any of the three can be taken over (set a value) or
// handed back to the weather (null). It works on top of the time of day (src/gfx/sky.js) through sky.weather.
//
//   const wx = createWeather(THREE, scene, { sky, foliage, audio })
//   wx.set(kind, strength 0.1..1.5, seconds)      the weather (eases from what it is: a storm rolls in)
//   wx.clouds = { type, cover } | null           wx.wind = { strength, gust } | null       wx.fog = thickness | null
//   wx.update(dt, camera, t)
//
// Nothing ever flashes (it's hard on the eyes): lightning is a bolt you see — cloud to ground or across the clouds,
// far off — that brightens over a few hundredths of a second, flickers softly, and fades, lighting its cloud from
// inside; the land's light barely lifts. Thunder follows it by its distance.
//
// The particles cost no CPU: each kind is one mesh of points (rain: streaks) in a box round the camera; the shader
// places each one from its spot in the box plus how far that kind of air has moved (summed here frame by frame, so
// a change of wind or fall speed never throws them about), wrapped round the box so they stay fixed in the world.

// fog thickness by name (the creator's Global tab and F8 offer these, or a number): thick closes right in round you
export const FOG = { thin: 0.5, normal: 1, thick: 14 };
// a magic flare-up's strength: low (motes of light in many colours, a violet tinge), medium (and auroras, and arcs of
// magic across the sky), high (and rocks and debris floating up round you; and when you cast a spell, crystals grow
// out of the ground: power crystallizing)
export const MAGIC_LEVELS = { low: 0.5, medium: 1, high: 1.5 };
export const CLOUDS = {
  clear: { name: 'Clear', cover: 0, puff: 1, cirrus: 0, dark: 0, scale: 1 },
  cirrus: { name: 'High streaks', cover: 0.05, puff: 0.6, cirrus: 1, dark: 0, scale: 1 },
  scattered: { name: 'Scattered', cover: 0.32, puff: 1, cirrus: 0.25, dark: 0, scale: 1.2 },
  cumulus: { name: 'Big heaps', cover: 0.6, puff: 1, cirrus: 0, dark: 0.1, scale: 0.7 },
  broken: { name: 'Broken', cover: 0.68, puff: 0.8, cirrus: 0, dark: 0.2, scale: 1 },
  overcast: { name: 'Overcast', cover: 0.9, puff: 0.35, cirrus: 0, dark: 0.3, scale: 1.1 },
  stratus: { name: 'Low grey sheet', cover: 0.97, puff: 0.08, cirrus: 0, dark: 0.35, scale: 1.4 },
  storm: { name: 'Storm clouds', cover: 1, puff: 0.7, cirrus: 0, dark: 0.75, scale: 0.8 },
  magic: { name: 'Magic', cover: 0.55, puff: 0.9, cirrus: 0.5, dark: 0.2, scale: 0.9 },
};
const W = (o) => o;
// each kind: its clouds, wind (strength 0..2, gust), fog (thickness: 1 normal, 0.2 thin… 6 very thick) and what's in
// the air; tint/fogTint colour the light
export const WEATHER = {
  clear: W({ name: 'Clear', clouds: 'scattered', wind: 0.3, gust: 0.4, fog: 1 }),
  cloudy: W({ name: 'Cloudy', clouds: 'broken', wind: 0.5, gust: 0.6, fog: 1.15, sunK: 0.8, tint: '#8f969e', tintK: 0.2, fogTint: '#a4aab0', fogTintK: 0.25 }),
  drizzle: W({ name: 'Drizzle', clouds: 'stratus', wind: 0.3, gust: 0.4, fog: 1.5, sunK: 0.6, tint: '#7e868c', tintK: 0.4, fogTint: '#8e969c', fogTintK: 0.5, rain: 0.35, drop: 0.7, sound: { rain: 0.3 } }),
  rain: W({ name: 'Rain', clouds: 'overcast', wind: 0.55, gust: 0.7, fog: 1.8, sunK: 0.5, ambK: 0.88, tint: '#6e767e', tintK: 0.5, fogTint: '#7e868c', fogTintK: 0.6, rain: 1, sound: { rain: 0.65, wind: 0.2 } }),
  downpour: W({ name: 'Downpour', clouds: 'stratus', wind: 0.6, gust: 0.8, fog: 2.6, sunK: 0.4, ambK: 0.8, tint: '#5c646c', tintK: 0.65, fogTint: '#6a7278', fogTintK: 0.7, rain: 1.6, sound: { rain: 0.95, wind: 0.25 } }),
  storm: W({ name: 'Thunderstorm', clouds: 'storm', wind: 1.2, gust: 1, fog: 2.4, sunK: 0.35, ambK: 0.72, tint: '#3e4450', tintK: 0.7, fogTint: '#4a5058', fogTintK: 0.72, rain: 1.5, slant: 1.4, lightning: 1, sound: { rain: 0.9, wind: 0.7 } }),
  flurries: W({ aurora: 0.55, name: 'Snow flurries', clouds: 'broken', wind: 0.4, gust: 0.7, fog: 1.2, sunK: 0.75, tint: '#c8d0dc', tintK: 0.25, fogTint: '#d6dde6', fogTintK: 0.35, snow: 0.3, flake: 0.8, sound: { wind: 0.15 } }),
  snow: W({ aurora: 0.35, name: 'Snow', clouds: 'overcast', wind: 0.25, gust: 0.4, fog: 2, sunK: 0.6, ambK: 1.05, tint: '#c8d0dc', tintK: 0.5, fogTint: '#d6dde6', fogTintK: 0.65, snow: 1, sound: { wind: 0.15 } }),
  heavysnow: W({ name: 'Heavy snow', clouds: 'stratus', wind: 0.3, gust: 0.5, fog: 3.2, sunK: 0.5, ambK: 1.05, tint: '#c4ccd8', tintK: 0.6, fogTint: '#d2d9e2', fogTintK: 0.8, snow: 1.7, flake: 1.3, sound: { wind: 0.2 } }),
  blizzard: W({ name: 'Blizzard', clouds: 'stratus', wind: 1.6, gust: 1.1, fog: 5, sunK: 0.45, ambK: 1.0, tint: '#bcc6d4', tintK: 0.7, fogTint: '#ccd5e0', fogTintK: 0.9, snow: 2, flake: 0.9, slant: 2.5, sound: { wind: 1.0 } }),
  sleet: W({ name: 'Sleet', clouds: 'overcast', wind: 0.6, gust: 0.7, fog: 2, sunK: 0.5, tint: '#8a94a0', tintK: 0.5, fogTint: '#9aa4ae', fogTintK: 0.6, rain: 0.7, snow: 0.5, flake: 0.6, sound: { rain: 0.45, wind: 0.3 } }),
  fog: W({ name: 'Fog', clouds: 'stratus', wind: 0.08, gust: 0.15, fog: 5, sunK: 0.6, tint: '#c4c8cc', tintK: 0.4, fogTint: '#cfd3d6', fogTintK: 0.8 }),
  sandstorm: W({ name: 'Sandstorm', clouds: 'broken', wind: 1.6, gust: 1, fog: 6, sunK: 0.5, ambK: 0.9, tint: '#b08850', tintK: 0.7, fogTint: '#c09868', fogTintK: 0.9, sand: 1, sandCol: '#d8b47c', sound: { wind: 0.9, sand: 0.8 } }),
  duststorm: W({ name: 'Dust storm', clouds: 'scattered', wind: 1.1, gust: 0.9, fog: 3.5, sunK: 0.65, tint: '#9a8c74', tintK: 0.5, fogTint: '#ad9f88', fogTintK: 0.8, sand: 0.7, sandCol: '#bcae96', sound: { wind: 0.7, sand: 0.5 } }),
  windstorm: W({ name: 'Windstorm', clouds: 'broken', wind: 1.8, gust: 1.2, fog: 1.2, sunK: 0.8, tint: '#8a929a', tintK: 0.2, fogTint: '#a0a8ae', fogTintK: 0.2, debris: 1, sound: { wind: 1.1 } }),
  magic: W({ name: 'Magic flare-up', clouds: 'magic', wind: 0.4, gust: 0.8, fog: 1.6, sunK: 0.75, tint: '#7a48c8', tintK: 0.4, fogTint: '#5c3c94', fogTintK: 0.5, magic: 1, cloudCol: '#b088f0', sound: { wind: 0.2 } }),
};
// each kind's temperature (°C) when the map doesn't set its own: how fast things dry and melt, whether snow can lie
export const TEMP = { clear: 17, cloudy: 13, drizzle: 11, rain: 10, downpour: 10, storm: 12, flurries: -2, snow: -4, heavysnow: -6, blizzard: -10, sleet: 1, fog: 8, sandstorm: 33, duststorm: 28, windstorm: 12, magic: 10 };
const AIR = ['rain', 'snow', 'sand', 'debris', 'magic'];
const NUM = ['aurora', 'auroraDay', 'cover', 'puff', 'cirrus', 'dark', 'cscale', 'wind', 'gust', 'fog', 'sunK', 'ambK', 'tintK', 'fogTintK', 'lightning', 'slant', 'drop', 'flake', ...AIR, 'sRain', 'sWind', 'sSand'];
const BOX = [44, 26, 44];

function field(THREE, scene, n, look, color, size) {
  const streak = look === 'streak', P = new Float32Array(n * (streak ? 6 : 3)), R = new Float32Array(n * (streak ? 2 : 1)), E = streak ? new Float32Array(n * 2) : null;
  for (let i = 0; i < n; i++) { const x = Math.random(), y = Math.random(), z = Math.random(), r = Math.random();
    if (streak) { P.set([x, y, z, x, y, z], i * 6); R[i * 2] = R[i * 2 + 1] = r; E[i * 2] = 0; E[i * 2 + 1] = 1; } else { P.set([x, y, z], i * 3); R[i] = r; } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('aR', new THREE.BufferAttribute(R, 1)); if (E) g.setAttribute('aE', new THREE.BufferAttribute(E, 1));
  const uniforms = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(...BOX) }, uOff: { value: new THREE.Vector3() }, uVel: { value: new THREE.Vector3(0, -8, 0) }, uCol: { value: new THREE.Color(color) }, uAlpha: { value: 0 }, uSize: { value: size }, uLen: { value: 0.045 }, uSway: { value: 0 }, uScale: { value: 400 }, uCover: { value: null }, uCoverRect: { value: new THREE.Vector4(-1e6, -1e6, 96, -1e6) }, uCoverRange: { value: new THREE.Vector2(0.5, 220) }, uUseCover: { value: 0 } };
  const m = new THREE.ShaderMaterial({ uniforms, transparent: true, depthWrite: false, blending: look === 'mote' ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: `uniform float uTime, uSize, uLen, uSway, uScale, uAlpha; uniform vec3 uCam, uBox, uOff, uVel; attribute float aR; ${E ? 'attribute float aE;' : ''} varying float vA, vR; uniform float uUseCover;
      uniform sampler2D uCover; uniform vec4 uCoverRect; uniform vec2 uCoverRange;
      float coverTop(vec3 p) { vec2 uv = vec2((p.x - uCoverRect.x) / uCoverRect.z, 1.0 - (p.z - uCoverRect.y) / uCoverRect.z);
        if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return -1e5;
        vec4 c = texture2D(uCover, uv); float d = dot(c, vec4(255.0 / 256.0) / vec4(16777216.0, 65536.0, 256.0, 1.0));
        if (d > 0.999) return -1e5; return uCoverRect.w - uCoverRange.x - d * (uCoverRange.y - uCoverRange.x); }
      void main() {
        vec3 base = position * uBox + uOff;
        base.x += sin(uTime * (0.6 + aR) + aR * 40.0) * uSway; base.z += cos(uTime * (0.5 + aR * 0.8) + aR * 23.0) * uSway;
        vec3 lo = uCam - uBox * 0.5, p = lo + mod(base - lo, uBox);                                     // wrapped round the camera, fixed in the world
        ${E ? 'p -= uVel * uLen * aE;' : ''}
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        float d = length(p - uCam); float shel = 1.0;
        if (uUseCover > 0.5) { if (coverTop(p) > p.y + 0.1) shel = 0.0;                          // under a roof or a tree
          else { vec3 vd = normalize(uVel - vec3(0.0, 0.001, 0.0)); float hz = length(vd.xz);           // blown sideways (a blizzard, a sandstorm): trace back along its path —
            if (hz > 0.2) for (int k = 1; k <= 3; k++) { float dh = float(k * k) * 1.2 + 0.6; vec3 q = p - vd * (dh / hz);   // if that runs through a building upwind, it's in the lee: none here
              if (coverTop(q) > q.y) { shel = 0.0; break; } } } } vA = shel * uAlpha * smoothstep(uBox.x * 0.5, uBox.x * 0.25, d) * smoothstep(0.3, 1.5, d); vR = aR;
        ${E ? '' : 'gl_PointSize = min(22.0, uSize * uScale / max(0.5, -mv.z) * (0.6 + aR * 0.8));'   /* (a flake right at your eye would fill a large patch of the screen for nothing: capped) */}
      }`,
    fragmentShader: `uniform vec3 uCol; uniform float uTime; varying float vA, vR;
      void main() { ${E ? 'float a = vA;' : 'vec2 c = gl_PointCoord - 0.5; float r = length(c); if (r > 0.5) discard; float a = vA * smoothstep(0.5, 0.15, r);'}
        ${look === 'mote' ? 'a *= 0.6 + 0.4 * sin(uTime * (2.0 + vR * 2.0) + vR * 60.0);' : ''}
        vec3 col = uCol;
        ${look === 'mote' ? `float h = fract(vR * 5.0); col = h < 0.2 ? vec3(0.75, 0.45, 1.0) : h < 0.4 ? vec3(0.35, 0.85, 1.0) : h < 0.6 ? vec3(1.0, 0.8, 0.4) : h < 0.8 ? vec3(1.0, 0.5, 0.8) : vec3(0.5, 1.0, 0.7); col = mix(col, uCol, 0.2) * 1.4;` : ''}
        gl_FragColor = vec4(col, a); }`,
  });
  const o = E ? new THREE.LineSegments(g, m) : new THREE.Points(g, m); o.frustumCulled = false; o.renderOrder = 5; o.visible = false; scene.add(o);
  return { o, u: uniforms, n, step: E ? 2 : 1, off: new THREE.Vector3() };
}

// a lightning bolt: a jagged path (and a branch or two) as camera-facing ribbons, glowing
function boltMesh(THREE, scene) {
  const MAX = 220, P = new Float32Array(MAX * 6 * 3), A = new Float32Array(MAX * 6);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('aA', new THREE.BufferAttribute(A, 1));
  const m = new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Color('#dfe8ff') }, uK: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: 'attribute float aA; varying float vA; void main() { vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uCol; uniform float uK; varying float vA; void main() { gl_FragColor = vec4(uCol * 1.6, uK * vA); }' });
  const o = new THREE.Mesh(g, m); o.frustumCulled = false; o.renderOrder = 4; o.visible = false; scene.add(o);
  return { o, m, P, A, g, MAX,
    path(pts, w, cam) {                                                                              // a smooth path (a magic arc): ribbons facing the camera, thinner at the ends
      let n = 0; const c = cam.position;
      for (let i = 0; i < pts.length - 1 && n < MAX; i++) { const a = pts[i], b = pts[i + 1], f = Math.sin((i + 0.5) / (pts.length - 1) * Math.PI);
        const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [(a[0] + b[0]) / 2 - c.x, (a[1] + b[1]) / 2 - c.y, (a[2] + b[2]) / 2 - c.z];
        let s = [d[1] * v[2] - d[2] * v[1], d[2] * v[0] - d[0] * v[2], d[0] * v[1] - d[1] * v[0]]; const l = Math.hypot(...s) || 1; s = s.map(x => x / l * w * (0.3 + 0.7 * f));
        const q = [[a[0] - s[0], a[1] - s[1], a[2] - s[2]], [a[0] + s[0], a[1] + s[1], a[2] + s[2]], [b[0] + s[0], b[1] + s[1], b[2] + s[2]], [b[0] - s[0], b[1] - s[1], b[2] - s[2]]];
        [0, 1, 2, 0, 2, 3].forEach((k, j) => { P.set(q[k], (n * 6 + j) * 3); A[n * 6 + j] = f; }); n++; }
      g.setDrawRange(0, n * 6); g.attributes.position.needsUpdate = true; g.attributes.aA.needsUpdate = true;
    },
    make(start, end, cam, wide) {                                                                   // build the path and its ribbons facing the camera
      const segs = []; const walk = (a, b, depth, w, alpha) => {
        const pts = [a]; const n = 10; for (let i = 1; i < n; i++) { const t = i / n, j = (1 - Math.abs(t - 0.5) * 2) * 0.18 * Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / n * 4;
          pts.push([a[0] + (b[0] - a[0]) * t + (Math.random() - 0.5) * j * 2, a[1] + (b[1] - a[1]) * t + (Math.random() - 0.5) * j, a[2] + (b[2] - a[2]) * t + (Math.random() - 0.5) * j * 2]); }
        pts.push(b); for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i], pts[i + 1], w, alpha]);
        if (depth < 2) for (let k = 0; k < 2; k++) if (Math.random() < 0.6) { const i = 2 + (Math.random() * (pts.length - 4)) | 0, p = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * 0.3;
          walk(p, [p[0] + (Math.random() - 0.5) * L, p[1] - L * (wide ? 0.1 : 0.6), p[2] + (Math.random() - 0.5) * L], depth + 1, w * 0.5, alpha * 0.6); }
      };
      walk(start, end, 0, 2.4, 1);
      let n = 0; const c = cam.position;
      for (const [a, b, w, al] of segs) { if (n >= MAX) break;
        const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [(a[0] + b[0]) / 2 - c.x, (a[1] + b[1]) / 2 - c.y, (a[2] + b[2]) / 2 - c.z];
        let s = [d[1] * v[2] - d[2] * v[1], d[2] * v[0] - d[0] * v[2], d[0] * v[1] - d[1] * v[0]]; const l = Math.hypot(...s) || 1; s = s.map(x => x / l * w);
        const q = [[a[0] - s[0], a[1] - s[1], a[2] - s[2]], [a[0] + s[0], a[1] + s[1], a[2] + s[2]], [b[0] + s[0], b[1] + s[1], b[2] + s[2]], [b[0] - s[0], b[1] - s[1], b[2] - s[2]]];
        [0, 1, 2, 0, 2, 3].forEach((k, j) => { P.set(q[k], (n * 6 + j) * 3); A[n * 6 + j] = al; }); n++; }
      g.setDrawRange(0, n * 6); g.attributes.position.needsUpdate = true; g.attributes.aA.needsUpdate = true;
    } };
}

// the magic flare-up's own things: arcs across the sky (medium and up), rocks floating round you, crystals grown by
// your spells (high)
function magicThings(THREE, scene) {
  const arcs = [boltMesh(THREE, scene), boltMesh(THREE, scene)].map(m => ({ m, t: -1, life: 3.5 }));
  const rockGeo = new THREE.IcosahedronGeometry(0.32, 0), rockMat = new THREE.MeshStandardMaterial({ color: '#6e6a74', roughness: 0.9, emissive: '#5a2a9a', emissiveIntensity: 0.25, flatShading: true });
  const N = 44, rocks = new THREE.InstancedMesh(rockGeo, rockMat, N); rocks.count = 0; rocks.castShadow = true; rocks.frustumCulled = false; scene.add(rocks);
  const R = Array.from({ length: N }, () => ({ x: 0, z: 0, base: 0, h: 0, up: 0, s: 1, rx: 0, ry: 0, spin: 0, live: false }));
  const crystMat = new THREE.MeshStandardMaterial({ color: '#c8a8ff', emissive: '#7a40e0', emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88, flatShading: true });
  const shard = new THREE.ConeGeometry(0.18, 1, 6); shard.translate(0, 0.5, 0);
  const crystals = [];
  return { arcs, rocks, R, crystals, crystMat, shard };
}
export function createWeather(THREE, scene, { sky, foliage = null, audio = null } = {}) {
  const PF = { fall: { rain: 10, snow: 1.1, sand: 0.25, debris: 1.4, magic: -0.5 }, sway: { rain: 0, snow: 0.5, sand: 0.3, debris: 1.5, magic: 0.7 },
    windK: { rain: 0.8, snow: 1, sand: 3, debris: 3.2, magic: 0.3 }, alpha: { rain: 0.55, snow: 0.95, sand: 0.5, debris: 0.85, magic: 0.95 }, cap: { rain: 1.6, snow: 2, sand: 1, debris: 1, magic: 1 },
    size: { rain: 1, snow: 0.11, sand: 0.05, debris: 0.12, magic: 0.13 }, rainCol: new THREE.Color('#b8c4d0'), snowCol: new THREE.Color('#f4f8ff') };
  const fields = { rain: field(THREE, scene, 9000, 'streak', '#b8c4d0', 1), snow: field(THREE, scene, 9000, 'flake', '#f4f8ff', 0.11), sand: field(THREE, scene, 9000, 'flake', '#d8b47c', 0.05), debris: field(THREE, scene, 900, 'flake', '#6a7a3a', 0.12), magic: field(THREE, scene, 3000, 'mote', '#b890ff', 0.13) };
  const bolt = boltMesh(THREE, scene), MG = magicThings(THREE, scene); let nextArc = 3;
  const o3 = new THREE.Object3D();
  const zero = () => Object.fromEntries(NUM.map(k => [k, 0]));
  const cur = zero(), from = zero(), goal = zero(); let tempNow = null;
  const auA = new THREE.Color('#3cff9a'), auB = new THREE.Color('#9a5cff');
  const tint = new THREE.Color('#8a9098'), fogTint = new THREE.Color('#9aa0a8'), cloud = new THREE.Color('#ffffff'), sandCol = new THREE.Color('#d8b47c');
  const tF = tint.clone(), fF = fogTint.clone(), sF = sandCol.clone(), tT = tint.clone(), fT = fogTint.clone(), sT = sandCol.clone();
  let kind = 'clear', strength = 1, t01 = 1, dur = 1, nextBolt = 6, B = null, cloudX = 0, cloudZ = 0, cloudCustom = false;
  // ---- magic: arcs across the sky (medium and up), floating rocks (high), crystals grown by spells (high) ----
  const PAL = ['#c070ff', '#40e0ff', '#ffc860', '#ff80c8', '#80ffb0'];
  let magMed = 0, magHigh = 0;
  const magicFx = (dt, camera, t) => {
    magMed = Math.max(0, Math.min(1, (cur.magic - 0.7) / 0.3)); magHigh = Math.max(0, Math.min(1, (cur.magic - 1.2) / 0.25));
    if (!camera) return; const c = camera.position, feet = c.y - 1.6;
    // arcs: a slow curve of light between two points far off, fading in over half a second and out over a second and a half
    nextArc -= dt * magMed;
    if (nextArc <= 0 && magMed > 0.05) { const A = MG.arcs.find(q => q.t < 0); if (A) { const a = Math.random() * Math.PI * 2, far = 140 + Math.random() * 260, x = c.x + Math.cos(a) * far, z = c.z + Math.sin(a) * far, y0 = c.y + 40 + Math.random() * 70, L = 90 + Math.random() * 160, b = a + 1.57 + (Math.random() - 0.5);
        const x1 = x + Math.cos(b) * L, z1 = z + Math.sin(b) * L, up = 30 + Math.random() * 50, pts = [];
        for (let i = 0; i <= 40; i++) { const u = i / 40; pts.push([x + (x1 - x) * u + Math.sin(u * 9 + a) * 4, y0 + Math.sin(u * Math.PI) * up + Math.sin(u * 13) * 2, z + (z1 - z) * u + Math.cos(u * 7 + a) * 4]); }
        A.m.path(pts, 1.6, camera); A.m.m.uniforms.uCol.value.set(PAL[(Math.random() * PAL.length) | 0]); A.t = 0; A.life = 3 + Math.random() * 2; }
      nextArc = 3 + Math.random() * 7; }
    for (const A of MG.arcs) { if (A.t < 0) { A.m.o.visible = false; continue; } A.t += dt; const k = Math.min(1, A.t / 0.5) * Math.min(1, Math.max(0, (A.life - A.t) / 1.5)); A.m.m.uniforms.uK.value = k * 0.8 * (0.85 + 0.15 * Math.sin(A.t * 3)); A.m.o.visible = k > 0.01; if (A.t > A.life) A.t = -1; }
    // floating rocks: up to 44 round you, lifting off the ground and bobbing in the air; far ones come back near
    const want = Math.round(MG.R.length * magHigh);
    for (let i = 0; i < MG.R.length; i++) { const r = MG.R[i];
      if (i < want) { if (!r.live || Math.hypot(r.x - c.x, r.z - c.z) > 32) { const a = Math.random() * Math.PI * 2, d = 5 + Math.random() * 22; Object.assign(r, { x: c.x + Math.cos(a) * d, z: c.z + Math.sin(a) * d, base: feet, h: 0.8 + Math.random() * 4.5, up: 0, s: 0.4 + Math.random() * 1.3, rx: Math.random() * 6, ry: Math.random() * 6, spin: (Math.random() - 0.5) * 0.8, live: true }); } r.up = Math.min(1, r.up + dt / 3); }
      else if (r.live) { r.up -= dt / 2; if (r.up <= 0) r.live = false; }
      r.rx += r.spin * dt; r.ry += r.spin * 0.7 * dt; }
    let n = 0; for (const r of MG.R) { if (!r.live) continue; const e = r.up * r.up * (3 - 2 * r.up); o3.position.set(r.x, r.base + e * r.h + Math.sin(t * 0.8 + r.rx * 3) * 0.25 * e, r.z); o3.rotation.set(r.rx, r.ry, 0); o3.scale.setScalar(r.s); o3.updateMatrix(); MG.rocks.setMatrixAt(n++, o3.matrix); }
    MG.rocks.count = n; MG.rocks.instanceMatrix.needsUpdate = true;
    // crystals: grow over a second and a half, glow, stand a minute, then sink away
    for (let i = MG.crystals.length - 1; i >= 0; i--) { const C = MG.crystals[i]; C.t += dt; const g = Math.min(1, C.t / 1.5), e = 1 - Math.pow(1 - g, 3), out = Math.max(0, Math.min(1, (C.life - C.t) / 2));
      C.g.scale.set(1, e * out, 1); C.g.children.forEach(m => m.material.emissiveIntensity = 0.6 + 0.4 * Math.sin(t * 2 + C.seed));
      if (C.t > C.life) { scene.remove(C.g); MG.crystals.splice(i, 1); } }
  };
  // the weather's own goals for the layers, kept so a layer handed back (null) returns to them
  let wGoal = {};
  const api = {
    WEATHER, CLOUDS, state: { kind, strength },
    clouds: null, wind: null, fog: null, aurora: null, temp: null,                                 // (temp: the map's own temperature, °C)
    get temperature() { return tempNow ?? (api.temp ?? TEMP[kind] ?? 15); },
    // rain and snow stop at roofs and trees: share the cover picture made by src/gfx/weathering.js
    useCover(Wt) { for (const k of ['rain', 'snow', 'sand', 'debris']) { const u = fields[k].u; u.uCover = Wt.U.uCover; u.uCoverRect = Wt.U.uCoverRect; u.uCoverRange = Wt.U.uCoverRange; u.uUseCover.value = 1; fields[k].o.material.uniforms = u; } },
    get windNow() { return cur.wind || 0; },
    get falling() { return { rain: Math.min(1, cur.rain), rainK: Math.min(1.5, cur.rain / 1.6), snow: Math.min(1.5, cur.snow / 1.3), sand: Math.min(1.5, cur.sand || 0), sandCol: sandCol, sandHeavy: kind === 'sandstorm' }; },   // (rainK: 1 = a downpour; sand: a sand or dust storm, and its colour)                                              // the layers taken over (null: the weather's)
    set(k, s = 1, seconds = 20) {
      if (MAGIC_LEVELS[String(k).replace('magic_', '')] != null && String(k).startsWith('magic_')) { s = MAGIC_LEVELS[k.slice(6)]; k = 'magic'; }   // 'magic_low' / 'magic_medium' / 'magic_high': the tier fixes the strength
      const Wk = WEATHER[k] || WEATHER.clear; kind = WEATHER[k] ? k : 'clear'; strength = s; api.state = { kind, strength };
      const C0 = WEATHER.clear, mix = (v, c) => c + (v - c) * Math.min(1, s), Cl = CLOUDS[Wk.clouds] || CLOUDS.clear, Cc = CLOUDS[C0.clouds];
      wGoal = { cover: mix(Cl.cover, Cc.cover), puff: Cl.puff, cirrus: Cl.cirrus, dark: mix(Cl.dark, 0) * Math.max(1, s * 0.8), cscale: Cl.scale, wind: mix(Wk.wind, C0.wind) * (s > 1 ? s : 1), gust: mix(Wk.gust, C0.gust),
        fog: mix(Wk.fog ?? 1, 1) * (s > 1 ? s : 1), sunK: mix(Wk.sunK ?? 1, 1), ambK: mix(Wk.ambK ?? 1, 1), tintK: mix(Wk.tintK ?? 0, 0), fogTintK: mix(Wk.fogTintK ?? 0, 0), lightning: (Wk.lightning || 0) * s, slant: Wk.slant || 0, drop: Wk.drop || 1, flake: Wk.flake || 1,
        sRain: (Wk.sound?.rain || 0) * s, sWind: (Wk.sound?.wind || 0) * s, sSand: (Wk.sound?.sand || 0) * s };
      for (const a of AIR) wGoal[a] = (Wk[a] || 0) * s;
      // the aurora: a magic flare-up of medium strength or more (by day too, fainter); some snow, on clear nights
      wGoal.aurora = k === 'magic' ? Math.max(0, Math.min(1, (s - 0.7) / 0.3)) : (Wk.aurora || 0) * Math.min(1, s); wGoal.auroraDay = k === 'magic' ? 0.5 : 0;
      auA.set(k === 'magic' ? '#c070ff' : '#3cff9a'); auB.set(k === 'magic' ? '#40e0ff' : '#9a5cff');
      tT.set(Wk.tint || '#8a9098'); fT.set(Wk.fogTint || '#9aa0a8'); sT.set(Wk.sandCol || '#d8b47c'); cloud.set(Wk.cloudCol || '#ffffff'); cloudCustom = !!Wk.cloudCol;
      api.retarget(seconds);
    },
    // (the layers' overrides changed, or the weather did: ease everything from where it is to the new goals)
    retarget(seconds = 6) {
      Object.assign(from, cur); tF.copy(tint); fF.copy(fogTint); sF.copy(sandCol);
      Object.assign(goal, wGoal);
      if (api.clouds) { const C = CLOUDS[api.clouds.type] || CLOUDS.clear; Object.assign(goal, { cover: api.clouds.cover ?? C.cover, puff: C.puff, cirrus: C.cirrus, dark: C.dark, cscale: C.scale }); }
      if (api.wind) { goal.wind = api.wind.strength; goal.gust = api.wind.gust ?? Math.min(1.2, 0.4 + api.wind.strength * 0.4); goal.sWind = Math.max(0, api.wind.strength - 0.3) * 0.6; }
      if (api.fog != null) goal.fog = typeof api.fog === 'string' ? FOG[api.fog] ?? 1 : api.fog;
      if (api.aurora != null) { goal.aurora = api.aurora; goal.auroraDay = Math.max(goal.auroraDay, 0); }
      t01 = 0; dur = Math.max(0.01, seconds);
    },
    // a spell cast during a strong magic flare-up: power crystallizes, a cluster of crystals grows out of the ground near
    // where it was cast (at: { x, y (the feet), z })
    crystallize(at) {
      if (magHigh < 0.3 || !at) return false;
      const g = new THREE.Group(), seed = Math.random() * 10, a0 = Math.random() * Math.PI * 2, d = 1.5 + Math.random() * 2;
      g.position.set(at.x + Math.cos(a0) * d, at.y - 0.1, at.z + Math.sin(a0) * d);
      const k = 5 + (Math.random() * 4 | 0); for (let i = 0; i < k; i++) { const m = new THREE.Mesh(MG.shard, MG.crystMat.clone()); const a = i / k * Math.PI * 2 + Math.random(), lean = i ? 0.25 + Math.random() * 0.45 : 0.05;
        m.position.set(Math.cos(a) * (i ? 0.2 : 0), 0, Math.sin(a) * (i ? 0.2 : 0)); m.rotation.set(Math.sin(a) * lean, Math.random() * 6, -Math.cos(a) * lean); const h = (i ? 0.6 + Math.random() * 1.1 : 1.6 + Math.random() * 0.8) * (0.7 + magHigh * 0.5); m.scale.set(0.8 + Math.random() * 0.8, h, 0.8 + Math.random() * 0.8); m.castShadow = true; g.add(m); }
      g.scale.set(1, 0.001, 1); scene.add(g); MG.crystals.push({ g, t: 0, life: 60, seed });
      if (MG.crystals.length > 12) { const old = MG.crystals.shift(); scene.remove(old.g); }
      return true;
    },
    get magicLevel() { return magHigh > 0.3 ? 'high' : magMed > 0.3 ? 'medium' : cur.magic > 0.05 ? 'low' : 'none'; },
    update(dt, camera, t = 0) { dt = Math.max(0, Math.min(0.25, dt || 0));   // (a frame's time can come in negative or huge: the easing would run away)
      if (t01 < 1) { t01 = Math.min(1, t01 + dt / dur); const e = t01 * t01 * (3 - 2 * t01); for (const n of NUM) cur[n] = from[n] + (goal[n] - from[n]) * e; tint.copy(tF).lerp(tT, e); fogTint.copy(fF).lerp(fT, e); sandCol.copy(sF).lerp(sT, e); }
      // the wind: the grass and trees (foliage.wind: strength up to 2 bends them hard), the clouds, the air
      const wd = foliage?.wind || api.windDir || { dirX: 0.8, dirZ: 0.55 }, L = Math.hypot(wd.dirX, wd.dirZ) || 1, dx = wd.dirX / L, dz = wd.dirZ / L, ws = cur.wind;
      if (foliage?.wind) { foliage.wind.strength = Math.min(2, ws); foliage.wind.gust = cur.gust; foliage.wind.speed = 3 + ws * 7; }
      cloudX += dx * (0.003 + ws * 0.01) * dt; cloudZ += dz * (0.003 + ws * 0.01) * dt;
      // lightning: a bolt you see far off (never a flash): brightens over 60 ms, two or three soft flickers, fades
      bolt.o.visible = false; let glow = 0;
      if (cur.lightning > 0.05 && camera) { nextBolt -= dt;
        if (nextBolt <= 0 && !B) { const a = Math.random() * Math.PI * 2, far = 220 + Math.random() * 700, c = camera.position, gx = c.x + Math.cos(a) * far, gz = c.z + Math.sin(a) * far, top = c.y + 140 + Math.random() * 60, ground = Math.random() < 0.6;
          if (ground) bolt.make([gx, top, gz], [gx + (Math.random() - 0.5) * 60, c.y - 5, gz + (Math.random() - 0.5) * 60], camera, false);
          else bolt.make([gx, top, gz], [gx + Math.cos(a + 1.6) * 220, top - 20, gz + Math.sin(a + 1.6) * 220], camera, true);
          B = { t: 0, far, dir: [Math.cos(a), 0.35, Math.sin(a)], flick: 2 + (Math.random() * 2 | 0), heard: false };
          nextBolt = (8 + Math.random() * 18) / Math.max(0.3, cur.lightning); }
        if (B) { B.t += dt; const x = B.t, up = Math.min(1, x / 0.06), env = up * Math.exp(-Math.max(0, x - 0.06) * 3.2), fl = 0.75 + 0.25 * Math.cos(x * Math.PI * 2 * 7) * Math.exp(-x * 2);
          const k = env * fl; bolt.m.uniforms.uK.value = k; bolt.o.visible = k > 0.01; glow = k * 0.6;
          if (!B.heard && x >= B.far / 340) { B.heard = true; audio?.thunder?.(B.far); }
          if (x > Math.max(1.6, B.far / 340 + 0.1)) B = null; } }
      const S = sky.weather; S.cover = Math.min(1, cur.cover); S.puff = cur.puff; S.cirrus = cur.cirrus; S.dark = cur.dark; S.cscale = cur.cscale || 1; S.windDir = [dx, dz];
      S.tint.copy(tint); S.tintK = cur.tintK; S.fogTint.copy(fogTint); S.fogTintK = cur.fogTintK; S.fogK = 1 / Math.max(0.15, cur.fog || 1); S.sunK = cur.sunK || 1; S.ambK = cur.ambK || 1;
      S.aurora = cur.aurora; S.auroraDay = cur.auroraDay; S.auroraA.lerp(auA, Math.min(1, dt * 0.5)); S.auroraB.lerp(auB, Math.min(1, dt * 0.5));
      magicFx(dt, camera, t);
      { const goalT = api.temp ?? TEMP[kind] ?? 15; tempNow = tempNow == null ? goalT : tempNow + Math.sign(goalT - tempNow) * Math.min(Math.abs(goalT - tempNow), dt * 0.15); }   // (the air warms and cools slowly: ~1° every 7 s)
      S.flash = 0; S.boltGlow = glow; if (B) S.boltDir = B.dir; S.cloudOff = [cloudX, cloudZ]; S.cloudCol = cloudCustom ? cloud : null;
      // the particles
      if (camera) {
        // (the per-kind tables are made once and reused: no new objects every frame — garbage the collector would stop to clear)
        const cp = camera.position, fall = PF.fall, windK = PF.windK, sway = PF.sway, alpha = PF.alpha, cap = PF.cap;
        fall.rain = 10 * (cur.drop || 1); fall.snow = 1.1 * (cur.flake || 1); windK.rain = 0.8 * (1 + cur.slant); windK.snow = 1 + cur.slant * 0.6;
        for (const k in fields) { const F = fields[k];
          const amt = Math.min(1, cur[k] / cap[k]); F.o.visible = amt > 0.005;
          const vx = dx * ws * windK[k] * 3, vy = -fall[k], vz = dz * ws * windK[k] * 3; F.off.x = (F.off.x + vx * dt) % (BOX[0] * 50); F.off.y = (F.off.y + vy * dt) % (BOX[1] * 50); F.off.z = (F.off.z + vz * dt) % (BOX[2] * 50);
          if (!F.o.visible) continue;
          F.o.geometry.setDrawRange(0, Math.round(F.n * amt) * F.step);
          F.u.uTime.value = t; F.u.uCam.value.copy(cp); F.u.uOff.value.copy(F.off); F.u.uVel.value.set(vx, vy, vz);
          F.u.uAlpha.value = alpha[k] * Math.min(1, 0.4 + amt) * (sky.state.sun + sky.state.hemi[2] > 0.5 ? 1 : 0.6); F.u.uSway.value = sway[k];
          F.u.uScale.value = camera.isPerspectiveCamera ? window.innerHeight / Math.tan(camera.fov * Math.PI / 360) / 2 : 400; F.u.uSize.value = k === 'snow' ? 0.11 * (cur.flake || 1) : PF.size[k];
          if (k === 'sand') F.u.uCol.value.copy(sandCol).multiplyScalar(0.6 + 0.4 * Math.min(1, sky.state.sun));
          if (k === 'rain' || k === 'snow') F.u.uCol.value.copy(k === 'rain' ? PF.rainCol : PF.snowCol).lerp(sky.state.fog, 0.35);
        }
      }
      audio?.weather?.({ rain: Math.min(1.2, cur.sRain), wind: Math.max(cur.sWind, Math.max(0, ws - 0.6) * 0.5), sand: cur.sSand });
    },
  };
  return api;
}
