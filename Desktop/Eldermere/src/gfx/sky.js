// src/gfx/sky.js — the sky and the light of the day: a sky dome (gradient, sun, moon, stars), and the sun or moon,
// ambient light, fog and colour grade, all from the time of day.
//
// The day isn't a constant slide: it has eight core looks (PHASES), each holding for its stretch of the 24 hours —
// night, before dawn, dawn, morning, noon, afternoon, dusk, evening. When the clock passes into the next one the light
// eases over to it (BLEND real seconds, 20 by default) and then holds. The sun (or moon) moves with each change, not
// every frame, so shadows stay still and crisp between them.
//
//   const sky = createSky(THREE, scene, { hour, cycle, dayMinutes, blend, view, fogScale })
//   sky.update(dt, camera)     each frame: advances the clock, eases the light, keeps the dome round the camera
//   sky.state                  the light right now: { top, horizon, fog, near, far, sunColor, sun, sunDir, hemi: [sky,
//                              ground, strength], stars, bloom, grade, lamps, phase, hour }
//   sky.hour / sky.setHour(h, now?)  read or set the time (now: jump straight to that phase's look)
//   sky.onPhase = (phase) => {}     called when a new phase begins (lamps on at dusk, off at dawn…)
// Maps that aren't outdoors (dungeons, interiors) keep their own fixed light (the creator's Global tab) and don't
// use this; an outdoor map can stop the clock (cycle: false) and keep one hour's look.
import { GRADES } from './postfx.js';

const g = (top, horizon, fog, near, far, sunColor, sun, hemi, stars, bloom, grade, lamps, moon = false) => ({ top, horizon, fog, near, far, sunColor, sun, hemi, stars, bloom, grade, lamps, moon });
export const PHASES = [
  { id: 'night', name: 'Night', at: 0, look: g('#02040b', '#090f1e', '#060a14', 20, 110, '#8fa6e8', 0.2, ['#2c3a60', '#07090f', 0.11], 1, 0.95, 'cool', true, true) },
  { id: 'predawn', name: 'Before dawn', at: 4.5, look: g('#09112a', '#33294a', '#201d32', 25, 130, '#9aa8e0', 0.16, ['#40406a', '#100c14', 0.15], 0.55, 0.85, 'cool', true, true) },
  { id: 'dawn', name: 'Dawn', at: 6, look: g('#4d6ca6', '#f2a676', '#d6a48e', 35, 170, '#ffb27a', 0.9, ['#c2aac2', '#4a3a30', 0.4], 0, 0.6, 'dusk', false) },
  { id: 'morning', name: 'Morning', at: 8.5, look: g('#5b93d6', '#c6dcf0', '#bfd3e8', 55, 220, '#fff0d6', 1.15, ['#d6e4ff', '#5d6b4a', 0.5], 0, 0.4, 'warm', false) },
  { id: 'noon', name: 'Noon', at: 11.5, look: g('#3f82d6', '#b6d2f0', '#c4d8ea', 70, 260, '#fff8ec', 1.35, ['#dbe9ff', '#5d6b4a', 0.58], 0, 0.35, 'neutral', false) },
  { id: 'afternoon', name: 'Afternoon', at: 15, look: g('#5089cc', '#d2dbe2', '#cdd8e0', 60, 240, '#ffe6c2', 1.22, ['#e0e4f4', '#62604a', 0.54], 0, 0.4, 'warm', false) },
  { id: 'dusk', name: 'Dusk', at: 18, look: g('#344680', '#ff9858', '#c48674', 35, 160, '#ff8a4e', 0.75, ['#cc9cb0', '#4a3a3a', 0.38], 0.1, 0.75, 'dusk', true) },
  { id: 'evening', name: 'Evening', at: 20, look: g('#0b1130', '#35264a', '#1a1830', 25, 120, '#a0a8e0', 0.19, ['#484878', '#100c14', 0.15], 0.75, 0.9, 'cool', true, true) },
];
export const phaseAt = h => { h = ((h % 24) + 24) % 24; let i = PHASES.length - 1; for (let k = 0; k < PHASES.length; k++) if (h >= PHASES[k].at) i = k; return i; };
// where the sun is at an hour (a unit vector from the ground toward it); the moon is opposite it at night
export function sunAt(hour) {
  const a = (hour - 6) / 12 * Math.PI, up = Math.sin(a);
  return new Float32Array([Math.cos(a) * 0.8, up, 0.35]);
}
// each phase's sun (or moon) direction: the sun at the middle of its stretch; at night the moon, high in the south
function lightDir(i) {
  const P = PHASES[i], next = PHASES[(i + 1) % PHASES.length], mid = (P.at + ((next.at - P.at + 24) % 24) / 2) % 24;
  const s = sunAt(mid); if (!P.look.moon) { s[1] = Math.max(0.12, s[1]); return norm(s); }
  return norm([-s[0] * 0.6 + 0.1, Math.max(0.35, -s[1]), -0.5]);
}
const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

export function createSky(THREE, scene, { hour = 12, cycle = true, dayMinutes = 24, blend = 20, view = 300, fogScale = 1 } = {}) {
  const C = () => new THREE.Color();
  // the light as it is now, eased toward the phase's look
  const mk = () => ({ top: C(), horizon: C(), fog: C(), sunColor: C(), hemiSky: C(), hemiGround: C(), near: 0, far: 0, sun: 0, hemiK: 0, stars: 0, bloom: 0, dir: [0, 1, 0], grade: { lift: [0, 0, 0], gain: [1, 1, 1], sat: 1, contrast: 1, vignette: 0 } });
  const lookOf = i => { const L = PHASES[i].look, o = mk(); o.top.set(L.top); o.horizon.set(L.horizon); o.fog.set(L.fog); o.sunColor.set(L.sunColor); o.hemiSky.set(L.hemi[0]); o.hemiGround.set(L.hemi[1]);
    o.near = L.near; o.far = L.far; o.sun = L.sun; o.hemiK = L.hemi[2]; o.stars = L.stars; o.bloom = L.bloom; o.dir = lightDir(i); const G = GRADES[L.grade] || GRADES.neutral; o.grade = { lift: [...G.lift], gain: [...G.gain], sat: G.sat, contrast: G.contrast, vignette: G.vignette }; return o; };
  const lerpLook = (a, b, t, o) => {
    for (const k of ['top', 'horizon', 'fog', 'sunColor', 'hemiSky', 'hemiGround']) o[k].copy(a[k]).lerp(b[k], t);
    for (const k of ['near', 'far', 'sun', 'hemiK', 'stars', 'bloom']) o[k] = a[k] + (b[k] - a[k]) * t;
    o.dir = norm(a.dir.map((v, i) => v + (b.dir[i] - v) * t));
    for (const k of ['lift', 'gain']) o.grade[k] = a.grade[k].map((v, i) => v + (b.grade[k][i] - v) * t);
    for (const k of ['sat', 'contrast', 'vignette']) o.grade[k] = a.grade[k] + (b.grade[k] - a.grade[k]) * t;
    // the sun dims and comes back through the change when it swaps for the moon (no sudden jump of shadows)
    if (PHASES[from].look.moon !== PHASES[to].look.moon) o.sun *= Math.abs(1 - 2 * t);
    return o;
  };
  let clock = ((hour % 24) + 24) % 24, from = phaseAt(clock), to = from, bt = 1, A = lookOf(from), B = A;
  const cur = mk(); lerpLook(A, B, 1, cur);
  // ---- the dome: a sphere round the camera, the gradient, the sun's disc and glow, the moon, the stars ----
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: { top: { value: C() }, horizon: { value: C() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: C() }, sunK: { value: 1 }, moon: { value: 0 }, stars: { value: 0 }, uTime: { value: 0 }, cover: { value: 0 }, cloudCol: { value: C() }, cloudOff: { value: new THREE.Vector2() }, flash: { value: 0 }, puff: { value: 1 }, cirrus: { value: 0 }, dark: { value: 0 }, cscale: { value: 1 }, windDir: { value: new THREE.Vector2(1, 0) }, boltDir: { value: new THREE.Vector3(0, 1, 0) }, boltGlow: { value: 0 }, boltCol: { value: C() }, aurora: { value: 0 }, auroraA: { value: C().set('#3cff9a') }, auroraB: { value: C().set('#9a5cff') } },
    vertexShader: `varying vec3 vD; void main() { vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 top, horizon, sunDir, sunColor, cloudCol; uniform float sunK, moon, stars, uTime, cover, flash, puff, cirrus, dark, cscale, boltGlow; uniform vec2 cloudOff, windDir; uniform vec3 boltDir, boltCol, auroraA, auroraB; uniform float aurora; varying vec3 vD;
      float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * vn(p); p *= 2.03; a *= 0.5; } return v; }
      void main() {
        vec3 d = normalize(vD); float y = d.y;
        vec3 col = mix(horizon, top, pow(clamp(y, 0.0, 1.0), 0.55));
        col = mix(col, horizon * 0.55, clamp(-y * 3.0, 0.0, 1.0));                                   // below the horizon: a darker haze
        float sd = dot(d, normalize(sunDir));
        if (moon < 0.5) { col += sunColor * (pow(max(sd, 0.0), 8.0) * 0.35 + pow(max(sd, 0.0), 64.0) * 0.6) * sunK; col = mix(col, vec3(1.0, 0.97, 0.9) * 2.5, smoothstep(0.9993, 0.9996, sd) * sunK); }
        else { col += sunColor * pow(max(sd, 0.0), 30.0) * 0.12; float m = smoothstep(0.99955, 0.9997, sd); col = mix(col, vec3(0.86, 0.9, 1.0) * 1.4, m); }
        if (stars > 0.0 && y > 0.0) { vec3 q = floor(d * 280.0); float s = h3(q); float tw = 0.6 + 0.4 * sin(uTime * (1.0 + s * 3.0) + s * 50.0);
          col += vec3(smoothstep(0.996, 1.0, s)) * tw * stars * smoothstep(0.0, 0.25, y) * 1.2; }
        // aurora: two curtains of light low over the sky, their bottoms sharp, fading upward, rippling slowly, with fine
        // rays; one colour at the base, another at the top (behind the clouds)
        if (aurora > 0.001 && y > 0.0) { float az = atan(d.x, d.z); vec2 ring = vec2(cos(az), sin(az)); vec3 ac = vec3(0.0);
          for (int i = 0; i < 2; i++) { float fi = float(i);
            float c0 = 0.2 + fi * 0.13 + 0.07 * sin(az * (2.0 + fi) + uTime * 0.04 + fi * 2.0) + 0.06 * (fbm(ring * 1.7 + vec2(fi * 5.0, uTime * 0.02)) - 0.5);
            float h = y - c0, curtain = smoothstep(-0.012, 0.012, h) * exp(-max(h, 0.0) / (0.11 + 0.05 * fi));
            float rays = 0.5 + 0.5 * vn(ring * 38.0 + vec2(fi * 17.0, uTime * 0.3)), wave = 0.55 + 0.45 * sin(az * 7.0 - uTime * 0.1 + fi * 3.0);
            ac += mix(auroraA, auroraB, clamp(h / 0.22, 0.0, 1.0)) * curtain * (0.35 + rays * 0.9) * wave * (1.0 - fi * 0.2)
              + auroraA * exp(-abs(h) / 0.05) * 0.35 * wave; }                                            // (and a soft glow round the base of each curtain)
          ac = mix(vec3(dot(ac, vec3(0.333))), ac, 1.35);                                             // more saturated
          col = col * (1.0 - min(0.4, aurora * 0.25)) + ac * aurora * smoothstep(0.0, 0.06, y) * 1.9; }
        // clouds: a layer seen from below (flattened toward the horizon), drifting with the wind. Two kinds mixed by the
        // cloud type: puffy heaps (domain-warped noise, lit on the sun's side, darker underneath) and high streaks of
        // cirrus drawn out along the wind. Cover is how much of the sky they fill; dark how heavy (storm) they are.
        if ((cover > 0.001 || cirrus > 0.001) && y > -0.05) {
          vec2 uv = d.xz / (max(y, 0.0) + 0.1) * 0.75 * cscale + cloudOff;
          vec2 w = vec2(fbm(uv * 0.35 + 1.3), fbm(uv * 0.35 + 7.1)) - 0.5;                               // warp: billowy, not blobby
          float n = fbm(uv * 0.5 + w * 1.6) * 0.65 + fbm(uv * 1.9 + w * 0.8 + 3.7) * 0.25 + fbm(uv * 6.0 + 9.0) * 0.1;
          n = clamp((n - 0.28) / 0.44, 0.0, 1.0);                                                         // (stretched: cover maps evenly onto the sky)
          float th = 1.0 - cover, c = smoothstep(th - 0.02, th + mix(0.3, 0.06, puff), n);
          // light: sample the density a step toward the sun; thinner there means a lit edge
          vec2 sdir = normalize(sunDir.xz + 1e-4) * 0.12; float n2 = clamp((fbm((uv + sdir) * 0.5 + w * 1.6) * 0.65 + fbm((uv + sdir) * 1.9 + w * 0.8 + 3.7) * 0.25 + 0.05 - 0.28) / 0.44, 0.0, 1.0);
          float lit = clamp(0.7 + (n - n2) * 1.6 * puff + 0.25 * max(sd, 0.0) - (n - th) * 0.35 * puff, 0.3, 1.3) * mix(1.0, 0.45, dark * smoothstep(th, th + 0.5, n));
          float fade = smoothstep(-0.03, 0.08, y);
          vec3 cc = cloudCol * lit; col = mix(col, cc, clamp(c * fade, 0.0, 1.0) * (0.92 + 0.08 * puff));
          if (cirrus > 0.001) { vec2 cu = vec2(dot(uv, windDir), dot(uv, vec2(-windDir.y, windDir.x))) * vec2(0.18, 2.4);
            float ci = smoothstep(0.55, 0.85, fbm(cu * 1.3 + 2.0)) * cirrus * fade * (1.0 - c * 0.7); col = mix(col, cloudCol * 1.05, ci * 0.8); }
          col += boltCol * boltGlow * pow(max(dot(d, normalize(boltDir)), 0.0), 6.0) * (0.5 + c);          // a bolt lighting its cloud from inside (soft)
        }
        gl_FragColor = vec4(col, 1.0); }`,
  }));
  dome.renderOrder = -1000; dome.frustumCulled = false; scene.add(dome);
  const state = { top: cur.top, horizon: cur.horizon, fog: cur.fog, near: 0, far: 0, sunColor: cur.sunColor, sun: 0, sunDir: { x: 0, y: 1, z: 0 }, hemi: ['#ffffff', '#000000', 0], hemiSky: cur.hemiSky, hemiGround: cur.hemiGround, stars: 0, bloom: 0, grade: cur.grade, lamps: PHASES[to].look.lamps, phase: PHASES[to], hour: clock, view };
  // the weather's hold on the light (src/gfx/weather.js sets these each frame): cloud cover, a tint over the sky and
  // the fog, the fog pulled closer, the sun and ambient light dimmed, and a lightning flash
  const W = { aurora: 0, auroraDay: 0, auroraA: C().set('#3cff9a'), auroraB: C().set('#9a5cff'), puff: 1, cirrus: 0, dark: 0, cscale: 1, windDir: [1, 0], boltDir: [0, 1, 0], boltGlow: 0, cover: 0, tint: C().set('#8a9098'), tintK: 0, fogTint: C().set('#9aa0a8'), fogTintK: 0, fogK: 1, sunK: 1, ambK: 1, flash: 0, flashColor: C().set('#e4ecff'), cloudOff: [0, 0], cloudCol: null };
  state.top = C(); state.horizon = C(); state.fog = C(); state.hemiSky = C(); state.hemiGround = C(); state.sunColor = C();
  // the weather's colours keep the time of day's brightness: a rain tint greys the light by day and the dark by night
  // (it never lifts a night sky to day grey). lum: how bright a colour is.
  const lum = c => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722, tmp = C(), grey = C();
  const tinted = (out, base, tint, k, lift = 1) => { if (k <= 0) return out.copy(base); tmp.copy(tint); const lb = lum(base), lt = Math.max(1e-4, lum(tmp));
    tmp.multiplyScalar(Math.min(lt * lift, lb * lift) / lt); return out.copy(base).lerp(tmp, k); };
  const moon0 = () => PHASES[to].look.moon;
  const sync = () => {
    const ck = W.cover, moon = PHASES[to].look.moon, day = Math.min(1, cur.sun / 1.1) * (moon ? 0 : 1);
    tinted(state.top, cur.top, W.tint, W.tintK); tinted(state.horizon, cur.horizon, W.tint, W.tintK * 0.85); tinted(state.fog, cur.fog, W.fogTint, W.fogTintK, 1.05);
    // overcast evens the light: by day the sun goes weak and grey and the whole sky lights the ground instead; by
    // night the clouds hide the moon and stars, and it gets properly dark
    state.hemiSky.copy(cur.hemiSky).lerp(state.fog, ck * 0.45); state.hemiGround.copy(cur.hemiGround).lerp(state.fog, ck * 0.2);
    grey.setScalar(lum(cur.sunColor)); state.sunColor.copy(cur.sunColor).lerp(grey, ck * 0.6 + W.dark * 0.2);
    state.near = cur.near * fogScale * W.fogK; state.far = Math.max(state.near + 8, Math.min(cur.far * fogScale * W.fogK, view * 0.95));   /* (fogScale: a map that sees further on a clear day) */
    state.sun = cur.sun * W.sunK * (1 - ck * (moon ? 0.65 : 0.7)) * (1 - W.dark * 0.4); state.sunDir = { x: cur.dir[0], y: cur.dir[1], z: cur.dir[2] };
    state.hemi = [state.hemiSky, state.hemiGround, cur.hemiK * W.ambK * (1 + ck * 0.3 * day - ck * 0.2 * (1 - day)) * (1 - W.dark * 0.3) + W.boltGlow * 0.08];   /* (a bolt: the faintest, slow-eased lift: never a flash) */
    state.stars = cur.stars * Math.max(0, 1 - ck * 1.4); state.bloom = cur.bloom; state.grade = cur.grade; state.phase = PHASES[to]; state.hour = clock;
    const U = dome.material.uniforms; U.top.value.copy(state.top); U.horizon.value.copy(state.horizon); U.sunDir.value.set(...cur.dir); U.sunColor.value.copy(cur.sunColor); U.sunK.value = Math.min(1, cur.sun) * Math.max(0, 1 - ck * 1.1);
    U.moon.value = PHASES[to].look.moon && bt > 0.5 || PHASES[from].look.moon && bt <= 0.5 ? 1 : 0; U.stars.value = state.stars;
    U.cover.value = ck; U.cloudOff.value.set(W.cloudOff[0], W.cloudOff[1]); U.flash.value = 0; U.puff.value = W.puff; U.cirrus.value = W.cirrus; U.dark.value = W.dark; U.cscale.value = W.cscale; U.windDir.value.set(W.windDir[0], W.windDir[1]); U.boltDir.value.set(...W.boltDir); U.boltGlow.value = W.boltGlow; U.boltCol.value.copy(W.flashColor);
    { const night = 1 - Math.min(1, cur.sun / 0.9); U.aurora.value = W.aurora * Math.max(night, W.auroraDay) * (1 - ck * 0.45); U.auroraA.value.copy(W.auroraA); U.auroraB.value.copy(W.auroraB); }   // (an aurora shows at night; a magic one by day too, fainter)
    U.cloudCol.value.copy(W.cloudCol || cur.top).lerp(new THREE.Color(1, 1, 1), 0.55).lerp(cur.sunColor, 0.25).lerp(W.tint, W.tintK * 0.7).multiplyScalar((0.1 + Math.min(1.2, cur.sun) * 0.85) * (moon0() ? 0.7 : 1) * (1 - W.dark * 0.62) * (1 - ck * 0.18));   /* (rain clouds grey, storm clouds dark) */   // clouds lit by the day: white in sunlight (clear of the sky's blue), dim at night
  };
  const enter = (i, now) => {
    if (i === to && !now) return;
    from = to; to = i; A = { ...cur, top: cur.top.clone(), horizon: cur.horizon.clone(), fog: cur.fog.clone(), sunColor: cur.sunColor.clone(), hemiSky: cur.hemiSky.clone(), hemiGround: cur.hemiGround.clone(), dir: [...cur.dir], grade: JSON.parse(JSON.stringify(cur.grade)) };
    B = lookOf(i); bt = now ? 1 : 0; if (now) { from = i; lerpLook(B, B, 1, cur); }
    state.lamps = PHASES[i].look.lamps; api.onPhase?.(PHASES[i]);
  };
  sync();
  const api = {
    dome, state, PHASES, onPhase: null, weather: W,
    get hour() { return clock; },
    set cycle(v) { cycle = v; }, get cycle() { return cycle; },
    set dayMinutes(v) { dayMinutes = v; }, set blend(v) { blend = v; },
    setHour(h, now = false) { clock = ((h % 24) + 24) % 24; enter(phaseAt(clock), now); if (now) sync(); },
    setView(v) { view = v; },
    update(dt, camera, t = 0) {
      dt = Math.max(0, Math.min(0.25, dt || 0));
      if (cycle && dayMinutes > 0) { clock = (clock + dt * 24 / (dayMinutes * 60)) % 24; const i = phaseAt(clock); if (i !== to) enter(i, false); }
      if (bt < 1) { bt = Math.min(1, bt + dt / Math.max(0.01, blend)); const e = bt * bt * (3 - 2 * bt); lerpLook(A, B, e, cur); }
      sync(); dome.material.uniforms.uTime.value = t;
      if (camera) { dome.position.copy(camera.position); dome.scale.setScalar(camera.far * 0.9); }
    },
  };
  return api;
}
