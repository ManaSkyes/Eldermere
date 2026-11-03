// src/gfx/weathering.js — what the weather does to the world's surfaces: wet ground, puddles, snow lying, and rain and
// snow kept off what's under cover.
//
// Cover: every second or so (and when you've moved), the scene round the camera (96 m square) is drawn from straight
// above into a small depth picture — roofs, trees, bridges, walls — giving the height of the highest thing over every
// spot. Anything lower than that is under cover: no rain falls there (the rain's shader reads the same picture), no snow
// lies, it stays dry. Grass, water, the weather's own particles and the player aren't drawn into it (they'd shelter
// the ground under them): they're hidden while it's taken.
//
// Surfaces: weatherize(material) adds the weather to a material (the ground, roads and buildings share one; the trees
// and the grass have theirs). They read shared uniforms (state below) the weather drives:
//   wet     darker and glossier (rain soaks in over a minute, dries over a few)
//   puddles on level ground in the open, in hollows of a noise pattern that fill as it stays wet, reflecting the sky,
//           with rings from the rain falling in them
//   snow    settles on what faces up (more the flatter it is), patchy at first, then a blanket; melts slowly after
//   gutters water gathers at the foot of kerbs first (slowly), spreading out as it keeps raining, draining last
//   splashes tiny crowns of droplets where the rain lands
// How fast things dry and melt comes from the temperature (update's temp, °C), the sun and the wind. A spell can leave
// its own wet or snowy patch (addPatch) that goes the same way.
//
//   const W = createWeathering(THREE, renderer, scene)
//   W.weatherize(material)            (once per material)
//   W.update(dt, camera, { rain, snow, skyColor, t, temp, sun, wind })   rain/snow 0..1+: how hard it's falling now
//   W.addPatch('wet' | 'snow', x, z, radius, amount)
// The lamps' light on the surfaces and on characters (src/game/dungeonBuild.js litLamps; uLampC.w: 1 a street lamp, 0 a
// lantern on a wall).
//   street lamp: a cone of light down from its lantern with a wide soft spread and some spill sideways, over ~18 m
//   wall lantern: a glow all round it (the wall behind and the ground below light too), over ~10 m
// Shadows: each lit lamp has its own small shadow cube (6 faces, 128² each — what the lamp sees all round it, out to
// 20 m), kept in one atlas of 40 tiles (uLampSh; uLampT: each lamp's tile, -1 while it isn't drawn yet). The scene
// doesn't move, so a lamp's cube is drawn once, when it's first lit (two faces a frame), and kept while there's room.
// Read with a filtered 2×2 compare: soft edges, not stair-steps.
const LF = 128, LCOLS = 8, LROWS = 5, LTILES = LCOLS * LROWS, LFAR = 20, LW = LCOLS * 3 * LF, LH = LROWS * 2 * LF;
const LDIRS = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]], LUPS = [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 0, 1], [0, 0, 1]];
// each face's camera axes (as three.js lookAt builds them): screen x and y in world terms
const LBASIS = LDIRS.map((F, i) => { const u = LUPS[i], z = [-F[0], -F[1], -F[2]];
  const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], nz = v => { const l = Math.hypot(...v); return v.map(c => c / l); };
  const x = nz(cr(u, z)), y = cr(z, x); return { x, y }; });
const v3 = a => `vec3(${a.map(c => c.toFixed(1)).join(', ')})`;
const faceCase = (f, axis, sign) => `if (d.${axis} ${sign > 0 ? '>' : '<='} 0.0) return vec3(dot(d, ${v3(LBASIS[f].x)}), dot(d, ${v3(LBASIS[f].y)}), ${f}.0 + 0.5) / vec3(m, m, 1.0);`;
const LAMP_GLSL = `uniform vec4 uLampP[32]; uniform vec4 uLampC[32]; uniform float uLampK; uniform float uLampT[32]; uniform sampler2D uLampSh;
  vec3 wxLampFace(vec3 d) { vec3 a = abs(d); float m;
    if (a.x >= a.y && a.x >= a.z) { m = a.x; ${faceCase(0, 'x', 1)} ${faceCase(1, 'x', -1)} }
    if (a.z >= a.y) { m = a.z; ${faceCase(2, 'z', 1)} ${faceCase(3, 'z', -1)} }
    m = a.y; ${faceCase(4, 'y', 1)} ${faceCase(5, 'y', -1)} }
  float wxLampD(vec2 px) { vec4 c = texture2D(uLampSh, px / vec2(${LW}.0, ${LH}.0)); return dot(c, vec4(255.0 / 256.0) / vec4(16777216.0, 65536.0, 256.0, 1.0)) * ${LFAR}.0; }
  float wxLampVis(float t, vec3 d, float bias) { vec3 F = wxLampFace(d); float f = floor(F.z);
    vec2 base = vec2((mod(t, ${LCOLS}.0) * 3.0 + mod(f, 3.0)), floor(t / ${LCOLS}.0) * 2.0 + floor(f / 3.0)) * ${LF}.0;
    vec2 p = clamp((F.xy * 0.5 + 0.5) * ${LF}.0, 1.0, ${LF - 1}.0) - 0.5, w = fract(p), q = base + floor(p) + 0.5; float dl = length(d) - bias;
    float a = step(dl, wxLampD(q)), b = step(dl, wxLampD(q + vec2(1.0, 0.0))), c = step(dl, wxLampD(q + vec2(0.0, 1.0))), e = step(dl, wxLampD(q + vec2(1.0)));
    return mix(mix(a, b, w.x), mix(c, e, w.x), w.y); }
  vec3 wxLamps(vec3 P, vec3 Nw) { vec3 sum = vec3(0.0);
    for (int i = 0; i < 32; i++) { vec4 L = uLampP[i]; if (L.w <= 0.0) continue; float t = uLampT[i]; if (t < 0.0) continue; vec4 C = uLampC[i]; bool street = C.w > 0.5; float R = street ? 18.0 : 10.0;
      vec3 d = L.xyz - P; float dist = length(d); if (dist > R) continue;
      vec3 l = d / max(dist, 1e-3); float wrap = street ? 0.1 : 0.45, nl = (dot(Nw, l) + wrap) / (1.0 + wrap); if (nl <= 0.0) continue;
      float cone = street ? mix(0.25, 1.0, smoothstep(0.12, 0.6, l.y)) : mix(0.6, 1.0, smoothstep(-0.3, 0.6, l.y));
      float fall = pow(max(0.0, 1.0 - dist / R), 2.0) / (1.0 + dist * dist * 0.05);
      float vis = wxLampVis(t, P + Nw * (0.04 + dist * 0.01) - L.xyz, 0.04 + dist * 0.015);
      sum += C.rgb * (L.w * nl * cone * fall * vis); }
    return sum * uLampK; }`;
export function createWeathering(THREE, renderer, scene) {
  const SIZE = 96, RES = 512, TOP = 90, FAR = 220;
  const rt = new THREE.WebGLRenderTarget(RES, RES, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const cam = new THREE.OrthographicCamera(-SIZE / 2, SIZE / 2, SIZE / 2, -SIZE / 2, 0.5, FAR); cam.up.set(0, 0, -1); 
  const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  const canopyRT = new THREE.WebGLRenderTarget(256, 256, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const kRT = new THREE.WebGLRenderTarget(256, 256, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const kGrey = new THREE.MeshBasicMaterial({ color: 0x808080, toneMapped: false });   // each surface's share of the snow, from above (streets keep less)   // the trees' crowns alone (userData.canopy)
  const U = {
    uCover: { value: rt.texture }, uCoverRect: { value: new THREE.Vector4(-1e6, -1e6, SIZE, -1e6) }, uCoverRange: { value: new THREE.Vector2(0.5, FAR) },
    uWet: { value: 0 }, uPuddle: { value: 0 }, uSnow: { value: 0 }, uRainNow: { value: 0 }, uSkyCol: { value: new THREE.Color('#9fb8d0') }, uWTime: { value: 0 }, uGutter: { value: 0 }, uIce: { value: 0 }, uLampP: { value: Array.from({ length: 32 }, () => new THREE.Vector4(0, -1e5, 0, 0)) }, uLampC: { value: Array.from({ length: 32 }, () => new THREE.Vector4(1, 0.8, 0.5, 1)) }, uLampK: { value: 1 }, uWxAny: { value: 1 }, uLampT: { value: new Array(32).fill(-1) }, uLampSh: { value: null }, uCloud: { value: new THREE.Vector4(0, 0, 0, 0.5) }, uSunD: { value: new THREE.Vector3(0, 1, 0) }, uDust: { value: 0 }, uDustK: { value: 1 }, uWindD: { value: new THREE.Vector2(1, 0) }, uDustCol: { value: new THREE.Color('#c8a878') }, uSnowOn: { value: 0 }, uKPass: { value: 0 }, uCanopy: { value: null }, uFoot: { value: null }, uFootRect: { value: new THREE.Vector3(-1e6, -1e6, 16) },
    uRefl: { value: null }, uReflMode: { value: 0 }, uReflMat: { value: new THREE.Matrix4() }, uReflH: { value: -1e5 }, uSSRView: { value: new THREE.Matrix4() }, uSSRProj: { value: new THREE.Matrix4() },   // (src/gfx/reflections.js)
    uPatch: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 1, 0)) }, uPatchKind: { value: new Array(8).fill(0) },
  };
  const state = { wet: 0, puddle: 0, snow: 0, gutter: 0, temp: 15, ice: 0, dust: 0 };
  // ---- the lamps' shadow cubes (see LAMP_GLSL) ----
  const lampRT = new THREE.WebGLRenderTarget(LW, LH, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
  U.uLampSh.value = lampRT.texture;
  const lampCam = new THREE.PerspectiveCamera(90, 1, 0.6, LFAR)   /* (near 0.6 m: the lamp's own cage and cap, round the light, cast no shadow — they left a dark square under every lamppost) */; const _lc = 0, distMat = new THREE.MeshDistanceMaterial({ side: THREE.DoubleSide });
  distMat.nearDistance = 0; distMat.farDistance = LFAR;
  const tmpCC = new THREE.Color();
  const tiles = new Array(LTILES).fill(null), lampQ = []; let lampUse = 0, lampHide = null, lampHideT = -1e9;
  { const prev = renderer.getRenderTarget(), cc = new THREE.Color(); renderer.getClearColor(cc); const ca = renderer.getClearAlpha();   // (empty: every direction open)
    renderer.setRenderTarget(lampRT); renderer.setClearColor(0xffffff, 1); renderer.clear(); renderer.setRenderTarget(prev); renderer.setClearColor(cc, ca); }
  const tileFor = o => {                                       // a tile for this lamp: a free one, or the one used longest ago by a lamp not lit now
    if (o._lt != null && tiles[o._lt] === o) return o._lt;
    let best = -1, bu = Infinity;
    for (let i = 0; i < LTILES; i++) { const T = tiles[i]; if (!T) { best = i; break; } if (T._lu < bu && T._lu < lampUse) { bu = T._lu; best = i; } }
    if (best < 0) return -1;
    if (tiles[best]) { tiles[best]._lt = null; tiles[best]._lf = 0; }
    tiles[best] = o; o._lt = best; o._lf = 0; lampQ.push(o); return best;
  };
  function lampShadowStep(t) {                                 // two faces of one waiting lamp's cube, each frame
    while (lampQ.length && (lampQ[0]._lt == null || tiles[lampQ[0]._lt] !== lampQ[0])) lampQ.shift();
    const o = lampQ[0]; if (!o) return;
    const prevRT = renderer.getRenderTarget(), prevOv = scene.overrideMaterial, prevBg = scene.background, prevFog = scene.fog, prevSh = renderer.shadowMap.autoUpdate, cc = tmpCC; renderer.getClearColor(cc); const ca = renderer.getClearAlpha();
    const lampHide = sceneLists.lamp;                                                        // (not in the lamps' shadows: the lamps' own heads, leaves, glass, particles, bodies)
    const hid = hidA; hid.length = 0; for (const h of lampHide) if (h.visible) { h.visible = false; hid.push(h); }
    scene.overrideMaterial = distMat; scene.background = null; scene.fog = null; renderer.shadowMap.autoUpdate = false; renderer.setClearColor(0xffffff, 1);
    distMat.referencePosition.copy(o.at); lampCam.position.copy(o.at);
    for (let k = 0; k < 2 && o._lf < 6; k++, o._lf++) { const f = o._lf, col = o._lt % LCOLS, row = Math.floor(o._lt / LCOLS);
      const x = (col * 3 + f % 3) * LF, y = (row * 2 + Math.floor(f / 3)) * LF;
      lampRT.viewport.set(x, y, LF, LF); lampRT.scissor.set(x, y, LF, LF); lampRT.scissorTest = true; renderer.setRenderTarget(lampRT); renderer.clear();
      lampCam.up.set(...LUPS[f]); lampCam.lookAt(o.at.x + LDIRS[f][0], o.at.y + LDIRS[f][1], o.at.z + LDIRS[f][2]); lampCam.updateMatrixWorld();
      renderer.render(scene, lampCam); }
    renderer.setRenderTarget(prevRT); renderer.setClearColor(cc, ca); scene.overrideMaterial = prevOv; scene.background = prevBg; scene.fog = prevFog; renderer.shadowMap.autoUpdate = prevSh; for (const h of hid) h.visible = true;
    if (o._lf >= 6) lampQ.shift();
  }
  U.uCanopy.value = canopyRT.texture;
  const patches = [];                                                                          // spells' wet / snowy patches
  let next = 0, cx = 1e9, cz = 1e9, kNext = 0; const jobs = [];
  // the GLSL both the surfaces and the rain use: the cover's height over a point (very low where nothing's drawn)
  const COVER_GLSL = `uniform sampler2D uCover; uniform vec4 uCoverRect; uniform vec2 uCoverRange;
    float coverTop(vec3 p) { vec2 uv = vec2((p.x - uCoverRect.x) / uCoverRect.z, 1.0 - (p.z - uCoverRect.y) / uCoverRect.z);
      if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return -1e5;
      vec4 c = texture2D(uCover, uv); float d = dot(c, vec4(255.0 / 256.0) / vec4(16777216.0, 65536.0, 256.0, 1.0));
      if (d > 0.999) return -1e5; return uCoverRect.w - uCoverRange.x - d * (uCoverRange.y - uCoverRange.x); }`;
  // ---- cloud shadows: the sunlight (only the direct light — the sky still lights the ground) dimmed where a cloud is
  // between the sun and the point: a cloud layer 600 m up, its pattern drifting with the wind, its gaps set by the
  // cover. Strongest for scattered and broken clouds; overcast already dims the sun as a whole, so there it fades out.
  const CLOUD_GLSL = `uniform vec4 uCloud; uniform vec3 uSunD;
    float wcH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float wcN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(wcH(i), wcH(i + vec2(1, 0)), f.x), mix(wcH(i + vec2(0, 1)), wcH(i + vec2(1, 1)), f.x), f.y); }
    float wxCloud(vec3 p) { if (uCloud.z < 0.005) return 1.0;
      vec2 q = p.xz + uSunD.xz / max(uSunD.y, 0.3) * (600.0 - p.y) + uCloud.xy;
      float n = wcN(q / 90.0) * 0.6 + wcN(q / 34.0 + 7.3) * 0.28 + wcN(q / 13.0 + 3.1) * 0.12;
      n = clamp((n - 0.5) * 2.4 + 0.5, 0.0, 1.0);                                              // (the blend of octaves bunches up round 0.5: spread it out)
      return 1.0 - uCloud.z * smoothstep(uCloud.w - 0.06, uCloud.w + 0.08, n); }`;
  const DIRLINE = 'getDirectionalDirectLightIrradiance( directionalLight, geometry, directLight );';
  const cloudFrag = (sh, posExpr) => { sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + CLOUD_GLSL)
    .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(DIRLINE, DIRLINE + ` directLight.color *= wxCloud(${posExpr});`)); };
  const cloudLambert = sh => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + CLOUD_GLSL)
    .replace('#include <lights_lambert_vertex>', `vec4 wcW = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        wcW = instanceMatrix * wcW;
      #endif
      wcW = modelMatrix * wcW;
      ` + THREE.ShaderChunk.lights_lambert_vertex.replace('getDirectionalDirectLightIrradiance( directionalLights[ i ], geometry, directLight );', 'getDirectionalDirectLightIrradiance( directionalLights[ i ], geometry, directLight ); directLight.color *= wxCloud(wcW.xyz);')); };
  const weatherize = (mat, { plant = false } = {}) => {
    if (!mat || mat.userData.weatherized) return; mat.userData.weatherized = true;
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      prev?.call(mat, sh, r);
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
          varying vec3 vWxP, vWxN; uniform sampler2D uSnowMap; uniform float uSnowBase; ${COVER_GLSL}`)

        .replace('#include <fog_vertex>', `#include <fog_vertex>
          { vec4 wp = vec4(transformed, 1.0); vec3 wn = objectNormal;
            #ifdef USE_INSTANCING
              wp = instanceMatrix * wp; wn = mat3(instanceMatrix) * wn;
            #endif
            wp = modelMatrix * wp; vWxP = wp.xyz; vWxN = normalize(mat3(modelMatrix) * wn); }`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
          varying vec3 vWxP, vWxN; uniform float uWet, uPuddle, uSnow, uRainNow, uWTime, uSnowBase; uniform vec3 uSkyCol; uniform sampler2D uSnowMap; ${COVER_GLSL}
          vec2 wxCUv(vec3 p) { return vec2((p.x - uCoverRect.x) / uCoverRect.z, 1.0 - (p.z - uCoverRect.y) / uCoverRect.z); }
          float wxSnowD(vec3 p) { vec2 uv = wxCUv(p); return (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? uSnowBase : texture2D(uSnowMap, uv).r; }
          float wxH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }   // (no sin: stays random with big inputs on any GPU)
          float wxN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(wxH(i), wxH(i + vec2(1, 0)), f.x), mix(wxH(i + vec2(0, 1)), wxH(i + vec2(1, 1)), f.x), f.y); }
          uniform sampler2D uCanopy; uniform float uSnowOn, uKPass, uDust, uDustK; uniform vec3 uDustCol; uniform vec2 uWindD;
          // the trees' crowns alone, drawn from above like the cover: under a crown a tenth of the snow and rain gets
          // through (layer by layer the tree fills up slowly); under a roof none does
          float canopyTop(vec3 p) { vec2 uv = vec2((p.x - uCoverRect.x) / uCoverRect.z, 1.0 - (p.z - uCoverRect.y) / uCoverRect.z);
            vec4 c = texture2D(uCanopy, uv); float d = dot(c, vec4(255.0 / 256.0) / vec4(16777216.0, 65536.0, 256.0, 1.0));
            return d > 0.999 ? -1e5 : uCoverRect.w - uCoverRange.x - d * (uCoverRange.y - uCoverRange.x); }
          float wxOpen(vec3 p) { float ct = coverTop(p); return ct > p.y + 0.3 ? (canopyTop(p) > ct - 0.5 ? 0.1 : 0.0) : 1.0; }
          vec3 wxBump(vec3 p, vec3 nrm, vec2 dH, float fd) { vec3 sx = dFdx(p), sy = dFdy(p), r1 = cross(sy, nrm), r2 = cross(nrm, sx); float det = dot(sx, r1) * fd;
            vec3 o = abs(det) * nrm - sign(det) * (dH.x * r1 + dH.y * r2); return dot(o, o) > 1e-12 ? normalize(o) : nrm; }
          ${LAMP_GLSL}
          uniform float uGutter, uReflMode, uReflH, uIce, uWxAny; uniform sampler2D uFoot; uniform vec3 uFootRect; uniform sampler2D uRefl; uniform mat4 uReflMat, uSSRView, uSSRProj; uniform vec4 uPatch[8]; uniform float uPatchKind[8];
          // one layer of raindrop rings: each cell has its own drop — where in the cell, how big, how often — and a
          // drop only lands some of the time (more in heavier rain), so no two rings march together
          float wxRing(vec2 p, float sc, float seed) {
            vec2 q = p * sc, c = floor(q), f = fract(q); float h1 = wxH(c + seed), h2 = wxH(c + seed + 7.13), h3 = wxH(c + seed + 13.7);
            float per = 0.55 + h3 * 1.1, tt = uWTime / per + h1 * 9.7, cyc = floor(tt), ph = fract(tt);
            if (wxH(c + vec2(cyc * 0.731, seed)) > 0.25 + uRainNow * 0.55) return 0.0;
            vec2 ctr = 0.28 + 0.44 * vec2(wxH(c + vec2(cyc, 1.7) + seed), wxH(c + vec2(2.3, cyc) + seed));
            float rmax = 0.1 + 0.16 * h2, r = length(f - ctr), w = 0.012 + 0.02 * ph;
            return smoothstep(w, 0.0, abs(r - ph * rmax)) * (1.0 - ph) * (1.0 - ph) * (0.6 + 0.4 * h2) + smoothstep(0.025, 0.0, r) * smoothstep(0.08, 0.0, ph);
          }
          float wxRings(vec2 p) { return wxRing(p, 1.15, 0.0) + wxRing(p + 3.1, 2.05, 17.0) * 0.8 + wxRing(p + 7.7, 3.4, 41.0) * 0.6; }
          // a spell's wet or snowy patch (src/gfx/weathering.js addPatch): kind 0 wet, 1 snow
          vec2 wxPatches(vec3 p) { vec2 o = vec2(0.0); for (int i = 0; i < 8; i++) { vec4 P = uPatch[i]; if (P.w <= 0.0) continue;
              float k = P.w * smoothstep(P.z, P.z * 0.55, length(p.xz - P.xy)); if (uPatchKind[i] < 0.5) o.x = max(o.x, k); else o.y = max(o.y, k); } return o; }`)
        .replace('#include <emissivemap_fragment>', `
          { float open = 1.0, up = clamp(vWxN.y, 0.0, 1.0), n = 0.5, wxFlat = 0.0; vec2 pat = vec2(0.0);
            if (uWxAny > 0.5) {                                                                     // (dry, clear, no spell patches: none of this — a uniform test, the same for every pixel)
            open = wxOpen(vWxP);                                                                    // under a roof: none; under a tree: a tenth gets through
            n = wxN(vWxP.xz * 0.35) * 0.6 + wxN(vWxP.xz * 1.7) * 0.4;
            // wet: soaked in the open, damp under cover; darker and glossier
            if (uDust > 0.003) {                                                                    // a coat of dust: most on what faces up, some on walls, none underneath; patchy, thicker in the open
              float face = vWxN.y > -0.3 ? mix(0.7, 1.0, clamp(vWxN.y, 0.0, 1.0)) : 0.0;           // walls take it too (blown sideways), floors most
              face *= 1.0 + 0.8 * max(0.0, dot(normalize(vWxN.xz + 1e-4), -uWindD)) * (1.0 - clamp(vWxN.y, 0.0, 1.0)) - 0.35 * max(0.0, dot(normalize(vWxN.xz + 1e-4), uWindD)) * (1.0 - clamp(vWxN.y, 0.0, 1.0));   // (walls facing into the wind take most, the lee side least)
              float du = uDust * uDustK * face * mix(1.0, mix(0.3, 1.0, open), clamp(vWxN.y, 0.0, 1.0)) * smoothstep(0.1, 0.55, n + uDust * 0.5);   // (a roof shelters what's under it, not the wall below it)
              diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.35 + uDustCol * (0.55 + 0.25 * n), clamp(du, 0.0, 0.55 + 0.35 * (uDustK - 1.0)));   // (a thin coat — a sandstorm's heavier —: the surface still shows through)
              #ifdef STANDARD
                roughnessFactor = mix(roughnessFactor, 0.95, du);
              #endif
            }
            pat = wxPatches(vWxP);
            float wet = max(uWet * mix(0.25, 1.0, open), pat.x); wxFlat = wet * 0.5;
            diffuseColor.rgb *= 1.0 - wet * ${plant ? '0.18' : '0.32'};
            if (uIce > 0.01) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75, 0.8, 0.86), uIce * wet * 0.18 * smoothstep(0.4, 0.9, up));   // a thin frost over frozen wet ground
            #ifdef STANDARD
              roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.3, wet * 0.85);   // (keeps the surface's own variation: the grain still shows when it's wet)
            #endif
            ${plant ? '' : `
            // puddles: level ground in the open, in the hollows of a noise pattern, filling as it stays wet
            float pud = uPuddle * open * smoothstep(0.96, 0.99, up) * smoothstep(0.64 - uPuddle * 0.13, 0.68 - uPuddle * 0.13, 1.0 - n);
            // gutters: along the foot of a kerb (a step up of 6–45 cm close by, read from the cover picture), water
            // gathers first and spreads out from the kerb as it keeps raining
            if (uGutter > 0.01 && up > 0.95 && open > 0.5) { float gw = 0.0, h0 = vWxP.y, d2 = 0.22 + 0.45 * uGutter;
              for (int i = 0; i < 4; i++) { vec2 dir = i == 0 ? vec2(1, 0) : i == 1 ? vec2(-1, 0) : i == 2 ? vec2(0, 1) : vec2(0, -1);
                float a = coverTop(vWxP + vec3(dir.x, 0.0, dir.y) * 0.22) - h0, b = coverTop(vWxP + vec3(dir.x, 0.0, dir.y) * d2) - h0;
                gw = max(gw, max(step(0.06, a) * step(a, 0.45), step(0.06, b) * step(b, 0.45) * 0.85)); }
              pud = max(pud, gw * smoothstep(0.0, 0.25, uGutter) * (0.75 + 0.25 * n)); }
            if (pud > 0.001) {
              vec3 V = normalize(cameraPosition - vWxP); float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
              float rings = uRainNow > 0.02 && uIce < 0.5 ? wxRings(vWxP.xz) * min(1.0, uRainNow * 1.5) * (1.0 - uIce) : 0.0;
              // what the water shows: the sky's colour, or the mirror view / the screen (src/gfx/reflections.js), stirred
              // by the rain; added as light of its own (a reflection isn't lit again by the sun)
              vec2 stir = (vec2(wxN(vWxP.xz * 2.3 + uWTime * 0.7), wxN(vWxP.zx * 2.3 - uWTime * 0.6)) - 0.5) * 0.012 * uRainNow + vec2(rings) * 0.004;
              vec3 refl = uSkyCol * 0.75;
              if (uReflMode > 0.5 && uReflMode < 1.5 && vWxP.y - uReflH > -1.2 && vWxP.y - uReflH < 3.0) {   // mirror view, for a puddle at any height near yours:
                // the mirror was taken at your level (h); for water at y it's the same view moved by 2(y − h), which for the
                // water's own point means looking up the picture at (x, 2h − y, z). Exact, so a kerb, a ditch, a step don't
                // change what the puddles show when you step up or down.
                vec4 rp = uReflMat * vec4(vWxP.x, 2.0 * uReflH - vWxP.y, vWxP.z, 1.0); vec2 ruv = rp.xy / rp.w + stir;
                refl = texture2D(uRefl, clamp(ruv, 0.001, 0.999)).rgb;
              } else if (uReflMode > 1.5) {                                                         // screen-space: follow the reflected ray over the last frame
                vec3 Rd = reflect(-V, normalize(vec3(stir.x * 6.0, 1.0, stir.y * 6.0))), rpp = vWxP + vec3(0.0, 0.02, 0.0); float sl = 0.2, hit = 0.0; vec3 hc = refl;
                for (int i = 0; i < 28; i++) { rpp += Rd * sl; sl *= 1.13;
                  vec4 vp = uSSRView * vec4(rpp, 1.0); if (vp.z > -0.05) break; vec4 cp = uSSRProj * vp; vec2 uv = cp.xy / cp.w * 0.5 + 0.5;
                  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) break;
                  vec4 sc = texture2D(uRefl, uv); float pd = -vp.z;
                  if (pd > sc.a + 0.03 && pd < sc.a + 0.6 + sl) { vec2 e = smoothstep(0.0, 0.12, uv) * smoothstep(1.0, 0.88, uv); hit = e.x * e.y * (1.0 - float(i) / 28.0); hc = sc.rgb; break; } }
                refl = mix(refl, hc, hit);
              }
              diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.15, pud); wxFlat = max(wxFlat, pud);
              if (uIce > 0.01) {                                                                    // frozen: frosted pale ice, cracks, a duller mirror
                float cr = smoothstep(0.035, 0.0, abs(wxN(vWxP.xz * 3.1) - 0.5)) * 0.6 + smoothstep(0.02, 0.0, abs(wxN(vWxP.xz * 7.3 + 4.0) - 0.5)) * 0.4;
                float fr = 0.55 + 0.45 * wxN(vWxP.xz * 1.9 + 2.0);
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.7, 0.78) * fr + cr * 0.25, uIce * pud * 0.75);
                refl *= 1.0 - uIce * 0.45;
                #ifdef STANDARD
                  roughnessFactor = mix(roughnessFactor, 0.14 + cr * 0.3, uIce * pud);
                #endif
              }
              totalEmissiveRadiance += (refl * (0.3 + fres * 0.6) + rings * 0.06 * uSkyCol) * pud;
              #ifdef STANDARD
                roughnessFactor = mix(roughnessFactor, 0.04 + rings * 0.15, pud);
              #endif
            }`}
            }
            #if defined(STANDARD) && !defined(FLAT_SHADED)
              { vec3 gN = normalize(vNormal) * faceDirection;                                       // water is flat: puddles lose the stone's bumps, wet stone half of them
                { vec3 m2 = mix(normal, gN, clamp(wxFlat, 0.0, 1.0)); if (dot(m2, m2) > 1e-6) normal = normalize(m2); }
                vec3 dn = fwidth(normal); roughnessFactor = max(roughnessFactor, min(0.75, sqrt(dot(dn, dn)) * 3.0)); }   // (specular anti-aliasing: no sparkle where the bumps are finer than a pixel)
            #endif
            // snow: from the depth map (it already knows what's sheltered, steep or melted); patchy and soft-edged where
            // it's thin, a blanket where it's deep, its drifts shading the light. Only on what's on top: the shelter test is
            // softened over a few samples so eaves don't cut a stair-stepped line.
            float sn = 0.0;
            if (uSnowOn > 0.5) {                                                                    // (a uniform test: the drift slopes below need every pixel's neighbours)
              float snD = wxSnowD(vWxP);
              float op = 0.5 * (wxOpen(vWxP + vec3(0.11, 0.0, 0.11)) + wxOpen(vWxP - vec3(0.11, 0.0, 0.11)));   // softened shelter (eaves don't cut a stair-stepped line)
              float th = snD * op;
              if (op < 0.6 && up > 0.3) {                                                         // sheltered (under eaves, by a wall): snow spreads in from the open ground beside it,
                float best = 0.0;                                                                   // thinning over ~1.8 m (it can creep a little way into a ground floor: interiors are instanced)
                for (int i = 0; i < 4; i++) { vec2 dir = i == 0 ? vec2(1.0, 0.0) : i == 1 ? vec2(-1.0, 0.0) : i == 2 ? vec2(0.0, 1.0) : vec2(0.0, -1.0);   // (4 ways × 2 steps: it runs on every sheltered pixel)
                  for (int j = 1; j <= 2; j++) { float dist = float(j) * 0.75; vec3 q = vWxP + vec3(dir.x * dist, 0.0, dir.y * dist); float ct = coverTop(q);
                    if (ct > q.y + 0.3 || abs(ct - vWxP.y) > 0.4) continue;                      // (open ground at about this level only)
                    best = max(best, wxSnowD(q) * (1.0 - dist / 1.9)); break; } }
                th = max(th, best * 0.85); }
              vec2 fuv = (vWxP.xz - uFootRect.xy) / uFootRect.z, fpr = vec2(0.0);
              if (fuv.x > 0.0 && fuv.y > 0.0 && fuv.x < 1.0 && fuv.y < 1.0) fpr = texture2D(uFoot, fuv).rg;   // prints and trenches (r), the snow pushed up beside them (g)
              th = th * (1.0 - fpr.x * 0.85) + fpr.y * min(snD, 0.3) * 0.6 * op;
              th = max(th, pat.y * 0.1);
              sn = smoothstep(0.004, ${plant ? '0.09' : '0.07'}, th + (n - 0.5) * 0.03) * smoothstep(${plant ? '0.15, 0.6' : '0.3, 0.7'}, up);
              vec3 sc = mix(vec3(0.78, 0.82, 0.9), vec3(0.93, 0.95, 0.99), smoothstep(0.02, 0.15, th));     // thin snow greyer (the ground shows through), deep snow bright
              sc *= 1.0 - fpr.x * 0.12;                                                             // (a print's floor, packed and in its own shade)
              diffuseColor.rgb = mix(diffuseColor.rgb, sc, clamp(sn, 0.0, ${plant ? '0.8' : '1.0'})); totalEmissiveRadiance *= 1.0 - sn;   // (a puddle under the snow doesn't shine through)
              #if defined(STANDARD) && !defined(FLAT_SHADED)
                { vec3 nb = wxBump(-vViewPosition, normal, vec2(dFdx(th), dFdy(th)) * 1.6, faceDirection);   // the drifts', prints' and trenches' own slopes, from the pixels round this one
                  vec3 m3 = mix(normal, nb, clamp(sn, 0.0, 1.0)); if (dot(m3, m3) > 1e-6) normal = normalize(m3); }
                roughnessFactor = mix(roughnessFactor, 0.8, sn);
              #endif
            }
            if (uLampP[0].w > 0.0) totalEmissiveRadiance += wxLamps(vWxP, normalize(vWxN)) * diffuseColor.rgb;   // the street lamps' light on it
          }
          #include <emissivemap_fragment>`)
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
          if (uKPass > 0.5) {                                                                     // (the snow-share pass: how much snow this material keeps)
            #ifdef WX_HAS_SNOWK
              gl_FragColor = vec4(wxSnowK / 2.0, 0.0, 0.0, 1.0);
            #else
              gl_FragColor = vec4(0.5, 0.0, 0.0, 1.0);
            #endif
          }`);
      if (sh.vertexShader.includes('#include <lights_lambert_vertex>')) cloudLambert(sh); else cloudFrag(sh, 'vWxP');   // the clouds' shadows on it
    };
    const prevKey = mat.customProgramCacheKey?.bind(mat);
    mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|wx' + (plant ? 'p' : 's') + (prev ? prev.toString().length + prev.toString().slice(0, 200) : '');   // (one compiled shader per kind of material, not shared by mistake)
    mat.extensions = Object.assign(mat.extensions || {}, { derivatives: true });
    mat.needsUpdate = true;
  };
  // ---- the snow: a depth map (metres) over the same 96 m as the cover picture, on the GPU ----
  // It lies on whatever is on top (the cover picture is exactly that: roofs, ground, tree crowns, a cart), so anything
  // under cover gets none. Ten times a second a pass adds what's falling (a little uneven), sheds it off steep slopes
  // and edges, lets it settle sideways between neighbours at the same height (soft rounded edges, no stair steps),
  // and melts it by the temperature (patchily). When you move far enough that the area re-centres, the depth moves
  // with the world; ground you haven't been near starts at the area's average (base).
  const SR = 512, snowRT = [0, 1].map(() => new THREE.WebGLRenderTarget(SR, SR, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false }));
  let snowI = 0, snowAcc = 0, snowShift = new THREE.Vector2(), snowLive = false;
  // The ground's own part — how much each spot catches (the wind's lee and scour, alleys, the patches), where it slides
  // off, which neighbours are at its height — depends only on the cover picture and the wind, so it's worked out once
  // whenever the cover is redrawn (every 1.5 s) into catchRT, and the snow's 10-a-second pass just reads it.
  const catchRT = new THREE.WebGLRenderTarget(SR, SR, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
  const catchMat = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false,
    uniforms: { uCover: U.uCover, uK: { value: kRT.texture }, uCoverRect: U.uCoverRect, uCoverRange: U.uCoverRange, uTx: { value: 1 / SR }, uWind: { value: new THREE.Vector2(0, 0) } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D uCover, uK; uniform vec4 uCoverRect; uniform vec2 uCoverRange; uniform float uTx; uniform vec2 uWind; varying vec2 vUv;
      float top(vec2 uv) { vec4 c = texture2D(uCover, uv); float d = dot(c, vec4(255.0 / 256.0) / vec4(16777216.0, 65536.0, 256.0, 1.0)); return d > 0.999 ? -1e5 : uCoverRect.w - uCoverRange.x - d * (uCoverRange.y - uCoverRange.x); }
      float hh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float nz(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hh(i), hh(i + vec2(1, 0)), f.x), mix(hh(i + vec2(0, 1)), hh(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec2 w = uCoverRect.xy + vec2(vUv.x, 1.0 - vUv.y) * uCoverRect.z;
        float h = top(vUv); if (h < -1e4) { gl_FragColor = vec4(0.0); return; }
        float hx0 = top(vUv - vec2(uTx, 0.0)), hx1 = top(vUv + vec2(uTx, 0.0)), hz0 = top(vUv - vec2(0.0, uTx)), hz1 = top(vUv + vec2(0.0, uTx));
        // a slope (both sides fall the same way) sheds; a step (a kerb, a road's edge, a wall's foot) doesn't: one side flat
        float m = uTx * uCoverRect.z, ax0 = h - hx0, ax1 = hx1 - h, az0 = h - hz0, az1 = hz1 - h;
        float sx = ax0 * ax1 > 0.0 ? min(abs(ax0), abs(ax1)) : 0.0, sz = az0 * az1 > 0.0 ? min(abs(az0), abs(az1)) : 0.0;
        float shed = smoothstep(0.9, 1.7, length(vec2(sx, sz)) / m);                           // steeper than ~45°: it slides off
        // neighbours at about the same height (snow settles between them, never off a roof onto the street): 4 bits
        float mask = step(abs(hx1 - h), 0.25) + 2.0 * step(abs(hx0 - h), 0.25) + 4.0 * step(abs(hz1 - h), 0.25) + 8.0 * step(abs(hz0 - h), 0.25);
        // where it gathers: never evenly. The wind scours open ground and drops its load in the lee of walls and
        // buildings (and piles some against their windward faces); narrow places between tall things (alleys, yards,
        // corners) catch more and lose less; and it falls in big soft patches and clumps (the "hot zones").
        float ws = clamp(length(uWind), 0.0, 2.0); vec2 wd = ws > 0.01 ? uWind / length(uWind) : vec2(1.0, 0.0);
        vec2 wuv = vec2(wd.x, -wd.y) * (0.75 / uCoverRect.z);
        float lee = 0.0, front = 0.0, encl = 0.0;
        for (int k = 1; k <= 5; k++) { float fk = float(k);
          lee = max(lee, step(0.6, top(vUv - wuv * fk) - h) / (0.6 + fk * 0.35));
          front = max(front, step(0.6, top(vUv + wuv * fk) - h) * step(fk, 2.5) / fk); }
        for (int i = 0; i < 4; i++) { vec2 o = (i == 0 ? vec2(1.0, 0.0) : i == 1 ? vec2(-1.0, 0.0) : i == 2 ? vec2(0.0, 1.0) : vec2(0.0, -1.0)) * (3.0 / uCoverRect.z);
          encl += step(1.5, top(vUv + o) - h) * 0.25; }
        float hot = 0.08 + 1.8 * smoothstep(0.3, 0.8, nz(w * 0.085 + 3.0)) * (0.6 + 0.8 * nz(w * 0.45));
        float catchK = hot * (1.0 + encl * 0.8) * mix(1.0, (1.0 - 0.6 * clamp(1.0 - lee - front - encl, 0.0, 1.0)) + lee * 1.4 + front * 0.9, min(1.0, ws));
        catchK *= texture2D(uK, vUv).r * 2.0;                                                  // (the surface's own share: a road's carriageway 0.4 … open ground 1.1)
        gl_FragColor = vec4(catchK, shed, mask / 16.0, 0.6 + 0.8 * nz(w * 0.21 + 5.0));       // (a: how fast it melts here: in patches)
      }` });
  const snowMat = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false,
    uniforms: { uPrev: { value: null }, uCatch: { value: catchRT.texture }, uShift: { value: snowShift }, uBase: { value: 0 }, uDt: { value: 0 }, uFall: { value: 0 }, uMelt: { value: 0 }, uForce: { value: -1 }, uTx: { value: 1 / SR } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D uPrev, uCatch; uniform vec2 uShift; uniform float uBase, uDt, uFall, uMelt, uForce, uTx; varying vec2 vUv;
      float prev(vec2 uv) { vec2 q = uv + uShift; return uForce >= 0.0 ? uForce : (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) ? uBase : texture2D(uPrev, q).r; }
      void main() {
        vec4 C = texture2D(uCatch, vUv); if (C.r <= 0.0 && C.b <= 0.0) { gl_FragColor = vec4(0.0); return; }
        float d = prev(vUv), mask = floor(C.b * 16.0 + 0.5), acc = 0.0, wsum = 0.0;
        // settle: towards the neighbours at about the same height (rounded edges, no stair steps)
        if (mod(mask, 2.0) > 0.5) { acc += prev(vUv + vec2(uTx, 0.0)); wsum += 1.0; }
        if (mod(floor(mask / 2.0), 2.0) > 0.5) { acc += prev(vUv - vec2(uTx, 0.0)); wsum += 1.0; }
        if (mod(floor(mask / 4.0), 2.0) > 0.5) { acc += prev(vUv + vec2(0.0, uTx)); wsum += 1.0; }
        if (mask >= 7.5) { acc += prev(vUv - vec2(0.0, uTx)); wsum += 1.0; }
        d = mix(d, wsum > 0.0 ? acc / wsum : 0.0, wsum < 3.5 ? 0.35 : 0.12);                   // (at an edge it thins faster: rounded, not cut off)
        // build-up: to half of what this spot can hold quickly (a few minutes), on to three quarters slowly (another
        // quarter hour), and the last of it over about an hour. What it can hold: 0.675 m × its share (deep drifts more)
        float Dm = 0.675 * clamp(C.r, 0.0, 1.8), x = Dm > 0.001 ? d / Dm : 1.0;
        float g = mix(1.0, 0.1, smoothstep(0.45, 0.55, x)); g = mix(g, 0.036, smoothstep(0.72, 0.8, x)); g *= 1.0 - step(1.0, x);
        d += uDt * uFall * g * Dm / 0.675;
        d -= uDt * uMelt * C.a;
        d *= 1.0 - C.g * min(1.0, uDt * 4.0 + (uForce >= 0.0 ? 1.0 : 0.0));
        if (uForce >= 0.0) d = uForce * Dm * (1.0 - C.g);                                         // (a preview: that share of what it can hold)
        gl_FragColor = vec4(clamp(d, 0.0, 1.25), 0.0, 0.0, 1.0);
      }` });
  const sq = new THREE.Scene(), sqCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), sqm = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), snowMat); sqm.frustumCulled = false; sq.add(sqm);
  U.uSnowMap = { value: snowRT[0].texture }; U.uSnowBase = { value: 0 };
  const catchStep = (wx, wz) => { catchMat.uniforms.uWind.value.set(wx, wz); sqm.material = catchMat; const prev = renderer.getRenderTarget(); renderer.setRenderTarget(catchRT); renderer.render(sq, sqCam); renderer.setRenderTarget(prev); sqm.material = snowMat; };
  const snowStep = (dt, fall, melt, force) => {
    const src = snowRT[snowI], dst = snowRT[1 - snowI]; const u = snowMat.uniforms;
    u.uPrev.value = src.texture; u.uDt.value = dt; u.uFall.value = fall; u.uMelt.value = melt; u.uBase.value = U.uSnowBase.value; u.uForce.value = force;
    const prev = renderer.getRenderTarget(); renderer.setRenderTarget(dst); renderer.render(sq, sqCam); renderer.setRenderTarget(prev);
    snowI = 1 - snowI; U.uSnowMap.value = dst.texture; snowShift.set(0, 0);
  };
  // ---- footprints: a fine map (16 m round you, 512², 3 cm) of where the snow has been pressed down ----
  // Each footfall in snow stamps a print (an oval the size of a boot, left or right of your line, along your heading);
  // fresh snow fills them back in slowly, melting softens them. The map follows you in whole 4 m steps.
  const FS = 16, FR = 512, footRT = [0, 1].map(() => new THREE.WebGLRenderTarget(FR, FR, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false }));
  let footI = 0, footLive = false, footAcc = 0; const stamps = [], footShift = new THREE.Vector2(); let fcx = 1e9, fcz = 1e9;
  const footMat = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false,
    uniforms: { uPrev: { value: null }, uRect: U.uFootRect, uShift: { value: footShift }, uFill: { value: 0 }, uStamp: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0)) } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D uPrev; uniform vec3 uRect; uniform vec2 uShift; uniform float uFill; uniform vec4 uStamp[8]; varying vec2 vUv;
      void main() { vec2 q = vUv + uShift; float d = (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) ? 0.0 : texture2D(uPrev, q).r;
        d = max(0.0, d - uFill);
        vec2 w = uRect.xy + vUv * uRect.z;
        float g = (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) ? 0.0 : max(0.0, texture2D(uPrev, q).g - uFill);
        for (int i = 0; i < 8; i++) { vec4 S = uStamp[i]; if (S.w <= 0.0) continue;
          // a boot print (30 × 12 cm), or — wading through deep snow (w > 1) — the trench your legs push (76 × 60 cm)
          bool tr = S.w > 1.0; float k = tr ? S.w - 1.0 : S.w; vec2 ax = tr ? vec2(0.38, 0.3) : vec2(0.15, 0.06);
          vec2 r = w - S.xy, f = vec2(cos(S.z), sin(S.z)), sd = vec2(-f.y, f.x); vec2 l = vec2(dot(r, f) / ax.x, dot(r, sd) / ax.y); float L = length(l);
          float m = smoothstep(1.0, 0.65, L) * (tr ? 1.0 : 0.85 + 0.15 * smoothstep(-0.2, 0.6, dot(r, f) / 0.15));
          float rim = smoothstep(0.95, 1.12, L) * smoothstep(tr ? 1.9 : 1.6, 1.2, L) * k * (tr ? 1.0 : 0.35);   // the snow pushed aside, heaped along the edge
          d = max(d, m * k); g = max(g * (1.0 - m), rim); }
        gl_FragColor = vec4(min(1.0, d), min(1.0, g), 0.0, 1.0); }` });
  const fq = new THREE.Scene(), fqm = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), footMat); fqm.frustumCulled = false; fq.add(fqm);
  U.uFoot.value = footRT[0].texture;
  const footStep = (fill) => {
    const u = footMat.uniforms; u.uPrev.value = footRT[footI].texture; u.uFill.value = fill;
    u.uStamp.value.forEach((v, i) => { const S = stamps[i]; v.set(S ? S.x : 0, S ? S.z : 0, S ? S.a : 0, S ? S.k : 0); }); stamps.length = 0;
    const prev = renderer.getRenderTarget(); renderer.setRenderTarget(footRT[1 - footI]); renderer.render(fq, sqCam); renderer.setRenderTarget(prev);
    footI = 1 - footI; U.uFoot.value = footRT[footI].texture; footShift.set(0, 0);
  };
  // ---- the snow you stand in: a real snow surface over the whole snowy area round you ----
  // Snow isn't paint: this surface lies on whatever is on top (the cover picture, smoothed across level ground, kept
  // sharp at steps) raised by the snow's depth, minus your prints and trenches, plus the snow heaped beside them.
  // It's three nested square grids, each a vertex every 19, 38 and 75 cm (24, 48 and 96 m across), each fixed to the
  // world on its own spacing: as you walk nothing under it moves or reshapes; the rings just step along. The outer
  // ring thins into the shaded snow at the snow map's edge, in the fog.
  // Next to anything standing up (a wall, a planter, a post, a crate: more than 45 cm above the ground within 1.8 m),
  // the surface stays down at that ground's level with the snow drifting in against it (it may run a little way into a
  // building's ground floor: interiors are instanced), so buildings don't cut it off with a hard edge and nothing gets
  // a sheet of snow floating over it. The tops of those things keep the surfaces' own shaded snow.
  const LV = [{ sp: 0.1875 }, { sp: 0.375 }, { sp: 0.75 }], GN = 128;
  const nearMeshes = LV.map((L, li) => {
    const half = L.sp * GN / 2, inner = li ? LV[li - 1].sp * GN / 2 : 0;
    const lu = { uNearC: { value: new THREE.Vector2() }, uInnerC: { value: new THREE.Vector2() }, uLv: { value: new THREE.Vector4(L.sp, half, inner, li === LV.length - 1 ? 1 : 0) } };
    L.u = lu; L.half = half;
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.93, 0.95, 0.99), roughness: 0.82, metalness: 0 });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U, lu);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
        uniform sampler2D uSnowMap, uFoot, uCanopy; uniform vec3 uFootRect; uniform vec2 uNearC; uniform vec4 uLv; uniform float uSnowBase; varying float vThick, vStep, vPrint, vWy; varying vec2 vXZ; ${COVER_GLSL}
        vec2 cuv(vec2 xz) { return vec2((xz.x - uCoverRect.x) / uCoverRect.z, 1.0 - (xz.y - uCoverRect.y) / uCoverRect.z); }
        float topTex(vec2 uv) { vec4 c = texture2D(uCover, uv); float d = dot(c, vec4(255.0 / 256.0) / vec4(16777216.0, 65536.0, 256.0, 1.0)); return d > 0.999 ? -1e5 : uCoverRect.w - uCoverRange.x - d * (uCoverRange.y - uCoverRange.x); }
        float topN(vec2 xz) { return topTex(cuv(xz)); }
        // the top surface's height, smoothed between texels where they're level (no terraces on a slope), sharp at a step
        float topAt(vec2 xz) { vec2 t = cuv(xz) * 512.0 - 0.5, i = floor(t), f = t - i;
          float a = topTex((i + vec2(0.5, 0.5)) / 512.0), b = topTex((i + vec2(1.5, 0.5)) / 512.0), c = topTex((i + vec2(0.5, 1.5)) / 512.0), d = topTex((i + vec2(1.5, 1.5)) / 512.0);
          float lo = min(min(a, b), min(c, d)), hi = max(max(a, b), max(c, d));
          if (hi - lo > 0.25) return f.x < 0.5 ? (f.y < 0.5 ? a : c) : (f.y < 0.5 ? b : d);
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
        float canopyAt(vec2 xz) { vec4 c = texture2D(uCanopy, cuv(xz)); float d = dot(c, vec4(255.0 / 256.0) / vec4(16777216.0, 65536.0, 256.0, 1.0)); return d > 0.999 ? -1e5 : uCoverRect.w - uCoverRange.x - d * (uCoverRange.y - uCoverRange.x); }
        float snowD(vec2 xz) { vec2 uv = cuv(xz); return (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? uSnowBase : texture2D(uSnowMap, uv).r; }
        // the surface at xz: its ground and the snow on it (pr: how pressed down by prints there)
        float hAt(vec2 xz, float rim, bool full, out float tk, out float pr, out bool tall) {
          float tp = topAt(xz), d = snowD(xz); tall = false;
          // standing up out of the ground (a wall, a planter, a post)? Then stay down at the ground beside it, the snow
          // drifting in from there, thinning over 1.8 m
          float lo = 1e5;
          if (full) { float s1 = topN(xz + vec2(1.8, 0.0)), s2 = topN(xz - vec2(1.8, 0.0)), s3 = topN(xz + vec2(0.0, 1.8)), s4 = topN(xz - vec2(0.0, 1.8));
            lo = min(min(s1, s2), min(s3, s4)); tall = max(max(s1, s2), max(s3, s4)) - tp > 0.45 || tp - lo > 0.45; }   // (anything standing up within 1.8 m)
          if (full && tp - lo > 0.45 && lo > -1e4) { float g = 1e5, best = 0.0;
            for (int k = 0; k < 8; k++) { float a = float(k) * 0.7854; vec2 dir = vec2(cos(a), sin(a));
              for (int j = 1; j <= 3; j++) { float dist = float(j) * 0.6; vec2 q = xz + dir * dist; float tq = topN(q);
                if (tp - tq > 0.45) { if (tq < g + 0.3) { g = min(g, tq); best = max(best, snowD(q) * (1.0 - dist / 2.0)); } break; } } }
            if (g < 1e4) { tp = g; d = best; } }
          vec2 fuv = (xz - uFootRect.xy) / uFootRect.z, fp = (fuv.x > 0.0 && fuv.y > 0.0 && fuv.x < 1.0 && fuv.y < 1.0) ? texture2D(uFoot, fuv).rg : vec2(0.0);
          pr = fp.x; tk = (d * (1.0 - fp.x * 0.9) + fp.y * min(d, 0.35) * 0.55) * rim;
          if (full && canopyAt(xz) > tp - 0.5) tk = 0.0;                                         // (a tree's crown: its leaves have their own snow)
          return tp + tk; }`)
        .replace('#include <beginnormal_vertex>', `
        vec2 xz = position.xz * uLv.y + uNearC; float sp = uLv.x;
        vec2 e = abs(xz - uNearC) / uLv.y; float rim = uLv.w > 0.5 ? smoothstep(1.0, 0.8, max(e.x, e.y)) : 1.0;   // (the outer ring thins out at the snow map's edge)
        float tk0, tk1, tk2, pr0, pr1, pr2;
        // the vertex itself in full; its two neighbours (for the slope) the quick way, unless it's beside something standing
        // up (then they need the full treatment too, or the slope would lean into the wall); the outer ring never searches
        bool full = uLv.w < 0.5;
        bool near, t1, t2; float h0 = hAt(xz, rim, full, tk0, pr0, near);
        float hx = hAt(xz + vec2(sp, 0.0), rim, near, tk1, pr1, t1), hz = hAt(xz + vec2(0.0, sp), rim, near, tk2, pr2, t2);
        vPrint = pr0; vThick = tk0; vXZ = xz; vWy = h0; vStep = max(abs(hx - h0), abs(hz - h0));
        vec3 objectNormal = normalize(vec3(h0 - hx, sp, h0 - hz));`)
        .replace('#include <begin_vertex>', `vec3 transformed = vec3(position.x * uLv.y, h0 + 0.004, position.z * uLv.y);`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying float vThick, vStep, vPrint, vWy; varying vec2 vXZ; uniform vec2 uInnerC; uniform vec4 uLv;
        float nH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float nN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(nH(i), nH(i + vec2(1, 0)), f.x), mix(nH(i + vec2(0, 1)), nH(i + vec2(1, 1)), f.x), f.y); }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          if (uLv.z > 0.0) { vec2 ie = abs(vXZ - uInnerC); if (max(ie.x, ie.y) < uLv.z - uLv.x) discard; }   // (the finer ring inside draws there; a cell of overlap, no cracks)
          float n = nN(vXZ * 0.35) * 0.6 + nN(vXZ * 1.7) * 0.4;
          if (vStep > 0.6 || smoothstep(0.004, 0.07, vThick + (n - 0.5) * 0.03) < 0.5) discard;   // (thin snow breaks up just as the shaded snow does)
          diffuseColor.rgb = mix(vec3(0.78, 0.82, 0.9), vec3(0.93, 0.95, 0.99), smoothstep(0.02, 0.15, vThick)) * (1.0 - vPrint * 0.12);`);
      cloudFrag(sh, 'vec3(vXZ.x, vWy, vXZ.y)');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        ${COVER_GLSL}
        ${LAMP_GLSL}`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n if (uLampP[0].w > 0.0) totalEmissiveRadiance += wxLamps(vec3(vXZ.x, vWy, vXZ.y), vec3(0.0, 1.0, 0.0)) * diffuseColor.rgb;');
    };
    const g = new THREE.PlaneGeometry(2, 2, GN, GN); g.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.castShadow = false; mesh.visible = false; mesh.userData.noCover = true; mesh.renderOrder = -li; scene.add(mesh);
    return mesh;
  });
  // ---- splashes: where the rain lands (on whatever's on top: ground, roofs, a cart), a tiny crown of droplets thrown up
  // and out, and gone in a fifth of a second. All on the GPU: each splash picks a new spot round you each time it
  // lands, and stands on the cover picture's height there.
  const splash = (() => {
    const N = 3500, K = 5, id = new Float32Array(N * K), kk = new Float32Array(N * K), pos = new Float32Array(N * K * 3);
    for (let i = 0; i < N; i++) for (let k = 0; k < K; k++) { id[i * K + k] = i + 0.5; kk[i * K + k] = k; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aId', new THREE.BufferAttribute(id, 1)); g.setAttribute('aK', new THREE.BufferAttribute(kk, 1));
    const u = { uT: { value: 0 }, uCamP: { value: new THREE.Vector3() }, uScale: { value: 400 }, uCol: { value: new THREE.Color('#c8d2dc') }, uA: { value: 0 }, uCover: U.uCover, uCoverRect: U.uCoverRect, uCoverRange: U.uCoverRange };
    const m = new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, fog: false,
      vertexShader: `uniform float uT, uScale, uA; uniform vec3 uCamP; attribute float aId, aK; varying float vA; ${COVER_GLSL}
        float h1(float n) { n = fract(n * 0.1031); n *= n + 33.33; n *= n + n; return fract(n); }
        void main() {
          float per = 0.5 + h1(aId * 0.618) * 0.6, tt = uT / per + h1(aId * 0.37) * 7.0, cyc = floor(tt), age = fract(tt) * per / 0.2;
          vec2 lo = uCamP.xz - 18.0, xz = lo + mod(vec2(h1(aId * 1.37 + cyc * 0.713), h1(aId * 2.71 + cyc * 1.319)) * 36.0 - lo, 36.0);   // a spot in the world (wrapped into the 36 m round you): it stays put while you move
          float top = coverTop(vec3(xz.x, 0.0, xz.y)), d = length(xz - uCamP.xz);
          if (age > 1.0 || top < -1e4 || d > 18.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
          vec3 p = vec3(xz.x, top + 0.015, xz.y); float sz;
          if (aK < 3.5) { float ang = aK * 1.5708 + h1(aId + cyc) * 6.2832, sp = 0.6 + h1(aId * 3.1 + aK) * 0.7;
            p.xz += vec2(cos(ang), sin(ang)) * age * 0.1 * sp; p.y += (age * 0.9 - age * age * 0.75) * 0.14 * sp; sz = 0.02; }
          else sz = 0.035 + age * 0.06;                                                          // the little burst where it hit
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(sz * uScale / max(0.3, -mv.z), 1.0, 4.0); vA = uA * (1.0 - age) * smoothstep(18.0, 10.0, d) * smoothstep(1.2, 3.0, length(p - cameraPosition)) * (aK < 3.5 ? 1.0 : 0.5);   // (never big blobs right by your eyes)
        }`,
      fragmentShader: `uniform vec3 uCol; varying float vA; void main() { vec2 c = gl_PointCoord - 0.5; float r = length(c); if (r > 0.5) discard; gl_FragColor = vec4(uCol, vA * smoothstep(0.5, 0.1, r)); }` });
    const o = new THREE.Points(g, m); o.frustumCulled = false; o.visible = false; o.renderOrder = 4; scene.add(o);
    return { o, update(r, camera, t) { o.visible = r > 0.05 && !!camera; if (!o.visible) return; g.setDrawRange(0, Math.round(N * Math.min(1, r)) * K);
      u.uT.value = t % 900; u.uCamP.value.copy(camera.position); u.uA.value = 0.7; u.uScale.value = camera.isPerspectiveCamera ? window.innerHeight / Math.tan(camera.fov * Math.PI / 360) / 2 : 400; } };
  })();
  // the snow-share picture: the scene drawn from above (the cover's camera) with each material writing how much snow
  // it keeps. (A surface that isn't weathered — made later, or of another kind — counts as an ordinary 1: it's drawn
  // plain grey here, not in its own colours, which read as 'keeps no snow' and left bare patches.)
  function kPass() {
    const prevRT = renderer.getRenderTarget(), prevBg = scene.background, prevFog = scene.fog, prevSh = renderer.shadowMap.autoUpdate, cc = tmpCC; renderer.getClearColor(cc); const ca = renderer.getClearAlpha();
    const hid = [], swap = []; scene.traverse(o => { if (!o.visible || o === scene) return; if (skip(o)) { o.visible = false; hid.push(o); } else if (o.isMesh && o.material && !Array.isArray(o.material) && !o.material.userData.weatherized) { swap.push([o, o.material]); o.material = kGrey; } });
    scene.background = null; scene.fog = null; renderer.shadowMap.autoUpdate = false; U.uKPass.value = 1;
    renderer.setRenderTarget(kRT); renderer.setClearColor(0x808080, 1); renderer.clear(); renderer.render(scene, cam);
    U.uKPass.value = 0; renderer.setRenderTarget(prevRT); renderer.setClearColor(cc, ca); scene.background = prevBg; scene.fog = prevFog; renderer.shadowMap.autoUpdate = prevSh;
    for (const o of hid) o.visible = true; for (const [o, m] of swap) o.material = m;
  }
  // asynchronous one-texel reads of the snow map (WebGL2: a pixel buffer and a fence); WebGL1 falls back to a plain,
  // throttled read
  const gl = renderer.getContext(), GL2 = renderer.capabilities.isWebGL2, rb = { x: 1e9, z: 1e9, t: -1e9, v: 0, pbo: null, fence: null, out: new Float32Array(4) };
  function rbIssue(x, z, u, v) {
    if (rb.fence) return; rb.x = x; rb.z = z; rb.t = performance.now();
    const prev = renderer.getRenderTarget(); renderer.setRenderTarget(snowRT[snowI]);
    try {
      if (GL2) { if (!rb.pbo) { rb.pbo = gl.createBuffer(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, rb.pbo); gl.bufferData(gl.PIXEL_PACK_BUFFER, 16, gl.STREAM_READ); } else gl.bindBuffer(gl.PIXEL_PACK_BUFFER, rb.pbo);
        gl.readPixels(Math.floor(u * SR), Math.floor(v * SR), 1, 1, gl.RGBA, gl.FLOAT, 0); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        rb.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); }
      else { const b = new Uint16Array(4); renderer.readRenderTargetPixels(snowRT[snowI], Math.floor(u * SR), Math.floor(v * SR), 1, 1, b); const e = (b[0] >> 10) & 31, m = b[0] & 1023; rb.v = e ? (1 + m / 1024) * Math.pow(2, e - 15) : m / 1024 * Math.pow(2, -14); }
    } catch { rb.v = state.snow * 0.4; }
    renderer.setRenderTarget(prev);
  }
  function rbPoll() {
    if (!rb.fence) return; const st = gl.clientWaitSync(rb.fence, 0, 0);
    if (st === gl.ALREADY_SIGNALED || st === gl.CONDITION_SATISFIED) { gl.bindBuffer(gl.PIXEL_PACK_BUFFER, rb.pbo); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, rb.out); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); gl.deleteSync(rb.fence); rb.fence = null; rb.v = rb.out[0]; }
    else if (st === gl.WAIT_FAILED) { gl.deleteSync(rb.fence); rb.fence = null; }
  }
  // what isn't drawn into the cover: particles, lines, glass and water (see-through), the sky, skinned bodies, small
  // plants (userData.noCover). Hidden for the moment the picture is taken.
  // The lists the cover and lamp-shadow passes hide things from, kept by walking the scene a few thousand objects a
  // frame (a fresh pass every ~1.5 s) — they used to walk the whole scene in the frame that needed them: a hitch
  // every few seconds while you moved.
  const sceneLists = { cover: [], lamp: [], mesh: [] }, hidA = [], hidB = [], hidC = [];
  const SPLASH_COL = new THREE.Color('#c8d2dc');
  let scanS = null, scanIdle = 0, scanFirst = true;
  function sceneScan() {
    if (!scanS) { if (scanIdle-- > 0) return; scanS = { stack: [scene], cover: [], lamp: [], mesh: [] }; }
    const S = scanS, budget = scanFirst ? Infinity : 3000;
    for (let n = 0; n < budget && S.stack.length; n++) {
      const o = S.stack.pop();
      if (o !== scene) {
        const sk = skip(o);
        if (sk) S.cover.push(o);
        if (sk || o.userData.noLampShadow || o.userData.canopy) S.lamp.push(o);
        if ((o.isMesh || o.isInstancedMesh) && !o.userData.canopy) S.mesh.push(o);
      }
      const ch = o.children; for (let i = 0; i < ch.length; i++) S.stack.push(ch[i]);
    }
    if (!S.stack.length) { sceneLists.cover = S.cover; sceneLists.lamp = S.lamp; sceneLists.mesh = S.mesh; scanS = null; scanFirst = false; scanIdle = 90; }
  }
  const skip = o => o.isPoints || o.isLine || o.isSprite || o.isSkinnedMesh || o.userData.noCover || (o.material && !Array.isArray(o.material) && (o.material.transparent || o.material.depthTest === false || o.material.isShaderMaterial));
  // every solid surface in the scene gets the weather (ground, roads, buildings, rocks, trees, grass); instanced
  // Lambert or alpha-cut ones count as plants (soak less, no puddles, a lighter snow)
  const weatherizeScene = root => root.traverse(o => { if (!(o.isMesh) || o.isSkinnedMesh || skip(o)) return;
    for (const m of [].concat(o.material)) if (m && (m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) weatherize(m, { plant: !!(o.isInstancedMesh && (m.isMeshLambertMaterial || m.alphaTest > 0)) }); });
  // characters (skinned bodies aren't weathered): the lamps' light alone, added to their own shading — for standard and
  // physical materials; any shader changes of their own are kept (chained)
  const lampLit = mat => {
    if (!mat || mat.userData.lampLit || mat.userData.weatherized || !(mat.isMeshStandardMaterial)) return; mat.userData.lampLit = true;
    const prev = mat.onBeforeCompile, own = mat.hasOwnProperty('customProgramCacheKey') ? mat.customProgramCacheKey.bind(mat) : null, pk = prev ? prev.toString() : '';
    mat.onBeforeCompile = (sh, r) => { if (prev) prev.call(mat, sh, r);
      for (const k of ['uLampP', 'uLampC', 'uLampK', 'uLampT', 'uLampSh']) sh.uniforms[k] = U[k];
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLmP;').replace('#include <project_vertex>', '#include <project_vertex>\nvLmP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLmP;\n' + LAMP_GLSL)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n if (uLampP[0].w > 0.0) totalEmissiveRadiance += wxLamps(vLmP, normalize((vec4(normal, 0.0) * viewMatrix).xyz)) * diffuseColor.rgb;'); };
    mat.customProgramCacheKey = () => (own ? own() : pk) + '|lamplit'; mat.needsUpdate = true;
  };
  const lampLitScene = root => root.traverse(o => { if (o.isSkinnedMesh) for (const m of [].concat(o.material)) lampLit(m); });
  return {
    lampLit, lampLitScene,
    U, state, COVER_GLSL, weatherize, weatherizeScene, force: null, rt, splash, patches, get footRT() { return footRT[footI]; }, kRT, get snowRT() { return snowRT[snowI]; }, get snowLive() { return snowLive; },
    // the street lamps burning now (src/game/dungeonBuild.js litLamps): up to 32, packed so the lit ones come first
    setLamps(list) { const P = U.uLampP.value, Cc = U.uLampC.value, T = U.uLampT.value; let n = 0; lampUse++;
      if (list) for (let i = 0; i < list.length && i < 32; i++) list[i]._lu = lampUse;   // (all marked as in use first: none of them can lose its tile to another)
      for (const o of list || []) { if (n >= 32) break; const tl = tileFor(o); T[n] = tl >= 0 && o._lf >= 6 ? tl : -1; const st = o.t.ground != null; P[n].set(o.at.x, o.at.y, o.at.z, this.lampsOff ? 0 : (st ? 5 : 3.6) * (o.base / 2.4) * o.k); Cc[n].set(o.hot.r, o.hot.g, o.hot.b, st ? 1 : 0); n++; }
      for (let i = n; i < 32; i++) P[i].w = 0; },
    // a footfall: a print in the snow if there's any lying there (heading: radians, the way you face; side ±1)
    footstep(x, z, heading, side = 1, depth = null) { const sd = depth ?? this.snowAt(x, z); if (sd < 0.01) return; const fx = Math.cos(heading), fz = Math.sin(heading);
      stamps.push({ x: x - fz * 0.11 * side, z: z + fx * 0.11 * side, a: heading, k: Math.min(1, 0.4 + sd * 5) });
      if (sd > 0.12) stamps.push({ x: x + fx * 0.2, z: z + fz * 0.2, a: heading, k: 1 + Math.min(1, (sd - 0.08) * 4) });   // deep: you push through it — a trench, the snow heaped either side
      while (stamps.length > 8) stamps.shift(); footLive = true; },
    // the snow's depth (m) at a spot — read back from the GPU, one texel (footsteps: a couple a second)
    snowAt(x, z) { if (!snowLive) return 0; const R = U.uCoverRect.value, u = (x - R.x) / R.z, v = 1 - (z - R.y) / R.z; if (u < 0 || v < 0 || u > 1 || v > 1) return U.uSnowBase.value;
      // read back from the GPU without waiting for it: the request goes in now, the answer is picked up a frame or two
      // later (a plain read stalls everything until the GPU catches up — that was a micro-stutter five times a second).
      // Asking near the same spot returns the last answer meanwhile.
      if (Math.hypot(x - rb.x, z - rb.z) > 0.6 || performance.now() - rb.t > 150) rbIssue(x, z, u, v);
      return rb.v; },
    // a spell's patch: kind 'wet' or 'snow', at (x, z), radius r m, how much (0..1). It dries or melts by the
    // temperature like everything else (the oldest of 8 goes first)
    addPatch(kind, x, z, r = 3, amount = 1) { if (patches.length >= 8) patches.shift(); patches.push({ kind: kind === 'snow' ? 1 : 0, x, z, r, a: Math.min(1, amount) }); },
    // temperature (°C) decides how fast things dry and melt, and whether snow can lie: warm sun dries a street in a minute
    // or two, a cold night leaves it wet for an hour; snow doesn't melt below 0 (a little in strong sun)
    update(dt, camera, { rain = 0, rainK = null, snow = 0, sand = 0, sandCol = null, sandHeavy = false, skyColor = null, t = 0, temp = 15, sun = 1, wind = 0, windDir = [1, 0], cover = 0, sunDir = null } = {}) {
      sceneScan();
      if (!this.lampShadowsOff) { lampShadowStep(t); if (this.lampBurst) for (let i = 0; i < 300 && lampQ.length; i++) lampShadowStep(t); }   // (lampBurst: testing — every waiting cube at once)
      dt = Math.max(0, Math.min(0.25, dt || 0)); sun = Math.max(0, sun || 0); wind = Math.max(0, wind || 0); if (GL2) rbPoll();
      const r = Math.min(1, rain), s = Math.min(1.5, snow), T = state.temp = temp;
      const dryK = Math.max(0.06, Math.min(3, 0.25 + (T - 5) / 15)) * (0.55 + 0.6 * Math.min(1, sun)) * (1 + 0.6 * Math.min(1.5, wind));
      const meltK = T > 0 ? (T / 5) * (0.6 + 0.6 * Math.min(1, sun)) : 0.15 * Math.max(0, Math.min(1, sun) - 0.6);
      this.dryK = dryK; this.meltK = meltK;
      // rain, by how hard it falls (rk: 1 = a downpour, rain ~0.6, drizzle ~0.2): a downpour soaks the ground in ~20 s,
      // fills the puddles to half in under a minute, to three quarters in a few more, full in about six; the gutters
      // follow, slower. Lighter rain takes as much longer as it's lighter.
      const rk = rainK ?? r, stage = x => x < 0.5 ? 1 : x < 0.75 ? 0.3 : 0.12;
      state.wet = rk > 0.03 ? Math.min(1, state.wet + dt * rk / 20) : Math.max(0, state.wet - dt * dryK / 240);
      state.puddle = rk > 0.08 && state.wet > 0.5 ? Math.min(1, state.puddle + dt * rk / 45 * stage(state.puddle)) : Math.max(0, state.puddle - dt * dryK * (1 - state.ice) / 300);
      state.gutter = rk > 0.06 && state.wet > 0.4 ? Math.min(1, state.gutter + dt * rk / 70 * stage(state.gutter)) : Math.max(0, state.gutter - dt * dryK / 420);   // gutters fill slowly and drain last
      // dust: a sand or dust storm lays a thin coat over everything out in it (most on what faces up, some on walls);
      // wind without dust in it slowly scours it off, rain washes it away fast
      state.dust = sand > 0.05 ? Math.max(state.dust || 0, Math.min(Math.min(1, sand), (state.dust || 0) + dt * sand / 150)) :   /* (builds as fast and as thick as the storm is strong) */ Math.max(0, (state.dust || 0) - dt * (Math.max(0, wind - 0.5) / 400 + rk / 25));
      if (sandCol) U.uDustCol.value.lerp(sandCol, Math.min(1, dt * 0.3));
      if (sand > 0.05) U.uDustK.value += ((sandHeavy ? 1.45 : 1) - U.uDustK.value) * Math.min(1, dt * 0.2); U.uWindD.value.set(windDir[0], windDir[1]);   // (sand lies thicker than dust)
      state.snow = s > 0.05 && T < 2 ? Math.min(1, state.snow + dt * s / 180) : Math.max(0, state.snow - dt * meltK / 360);   // (the area's average: what new ground starts with)
      const fall = s > 0.05 && T < 2 ? s / 1.5 * 0.0024 : 0,   /* (scaled by how hard it's falling: a blizzard builds fastest — half depth in ~3 min — snow ~6, flurries ~20) */ melt = meltK * 0.0008;               // m/s at the start: steady snow ~20 cm in three minutes (then slower: see the snow pass); melting ~5 cm a minute at 10°C in sun
      if (state.snow > 0.05) state.wet = Math.max(state.wet, state.snow * 0.3);
      if (fall === 0 && melt > 0 && state.snow > 0.005) {                                     // melting snow: the water has to go somewhere — wet ground, puddles, the gutters running
        const mw = Math.min(3, meltK) * Math.min(1, state.snow * 4); state.wet = Math.max(state.wet, Math.min(1, state.snow * 5) * 0.8);
        state.puddle = Math.min(1, state.puddle + dt * mw / 100); state.gutter = Math.min(1, state.gutter + dt * mw / 120); }
      // ice: below freezing, water lying about freezes (puddles first, over a minute or two, faster the colder); above,
      // it thaws. state.ice 0..1: how frozen the water there is
      { const water = Math.min(1, state.puddle + state.wet * 0.6 + state.gutter * 0.3);
        if (T < 0 && water > 0.05) state.ice = Math.min(water, state.ice + dt / 90 * Math.max(0.3, Math.min(2, -T / 3)));
        else if (T >= 0) state.ice = Math.max(0, state.ice - dt * (0.2 + T / 5) / 60); }
      if (state.ice > 0.3) { state.wet = Math.max(state.wet, state.ice * 0.5); }                 // (frozen water doesn't dry away)
      if (this.force) Object.assign(state, this.force);                                         // (the F8 panel / sky lab: see a look at once)
      for (let i = patches.length - 1; i >= 0; i--) { const P = patches[i]; P.a -= dt * (P.kind ? meltK / 120 : dryK / 90); if (P.a <= 0) patches.splice(i, 1); }
      U.uPatch.value.forEach((v, i) => { const P = patches[i]; v.set(P ? P.x : 0, P ? P.z : 0, P ? P.r : 1, P ? P.a : 0); U.uPatchKind.value[i] = P ? P.kind : 0; });
      { const cu = U.uCloud.value, spd = 4 + wind * 10; cu.x = (cu.x - windDir[0] * spd * dt) % 100000; cu.y = (cu.y - windDir[1] * spd * dt) % 100000;   // (the clouds drift downwind)
        cu.z = 0.72 * Math.min(1, Math.max(0, (cover - 0.06) / 0.28)) * (1 - Math.min(1, Math.max(0, (cover - 0.8) / 0.17))); cu.w = 1 - Math.min(0.95, cover) * 0.95;
        if (sunDir) U.uSunD.value.set(sunDir.x, sunDir.y, sunDir.z); }
      U.uLampK.value = 1 - 0.3 * Math.min(1, rk) - 0.2 * Math.min(1, s) - 0.25 * Math.min(1, sand);   // (rain, snow and dust dim the lamps a little: the weather reads stronger)
      U.uSnowOn.value = snowLive || patches.some(P => P.kind) ? 1 : 0; U.uWxAny.value = U.uSnowOn.value || state.wet + state.puddle + state.gutter + state.dust + state.ice > 0.001 || patches.some(P => P.a > 0.001) ? 1 : 0; U.uWet.value = state.wet; U.uIce.value = state.ice; U.uDust.value = state.dust; U.uPuddle.value = state.puddle; U.uGutter.value = state.gutter; U.uSnow.value = state.snow; U.uRainNow.value = r; U.uWTime.value = t % 900; if (skyColor) U.uSkyCol.value.copy(skyColor);
      splash.update(r, camera, t); if (skyColor) { const c = splash.o.material.uniforms.uCol.value.copy(SPLASH_COL); const l = skyColor.r * 0.21 + skyColor.g * 0.72 + skyColor.b * 0.07; c.multiplyScalar(Math.min(1, 0.15 + l * 1.3)).lerp(skyColor, 0.3); }   // (lit like the day round it: at night faint, never glowing)
      // the cover: redrawn every 4 s (a cart, a door that moved), or at once if you've moved 12 m
      const c = camera?.position;
      if (c && !(t < next && Math.hypot(c.x - cx, c.z - cz) < 12)) {
      const ox = cx, oz = cz; next = t + 4; cx = Math.round(c.x / 3) * 3; cz = Math.round(c.z / 3) * 3;   /* (3 m = 16 of the snow's texels: it moves by whole texels, never resampled and blurred) */ if (ox < 1e8) snowShift.set((cx - ox) / SIZE, -(cz - oz) / SIZE);
      cam.position.set(cx, c.y + TOP, cz); cam.lookAt(cx, c.y - 10, cz); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      const prevRT = renderer.getRenderTarget(), prevOv = scene.overrideMaterial, prevBg = scene.background, prevFog = scene.fog, prevSh = renderer.shadowMap.autoUpdate, cc = tmpCC; renderer.getClearColor(cc); const ca = renderer.getClearAlpha();
      const hid = hidB; hid.length = 0; for (const o of sceneLists.cover) if (o.visible) { o.visible = false; hid.push(o); }
      scene.overrideMaterial = depthMat; scene.background = null; scene.fog = null; renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(rt); renderer.setClearColor(0xffffff, 1); renderer.clear(); renderer.render(scene, cam);
      { const off = hidC; off.length = 0; for (const o of sceneLists.mesh) if (o.visible) { o.visible = false; off.push(o); }   // the crowns alone
        renderer.setRenderTarget(canopyRT); renderer.clear(); renderer.render(scene, cam); for (const o of off) o.visible = true; }
      renderer.setRenderTarget(prevRT); renderer.setClearColor(cc, ca); scene.overrideMaterial = prevOv; scene.background = prevBg; scene.fog = prevFog; renderer.shadowMap.autoUpdate = prevSh; for (const o of hid) o.visible = true;
      U.uCoverRect.value.set(cx - SIZE / 2, cz - SIZE / 2, SIZE, c.y + TOP);
      // the heavier follow-ups go on later frames, one each, so no single frame carries them all (that was a stutter
      // every 1.5 s): the snow-share picture only when the area moved (or every 12 s), then the catch map
      if (ox !== cx || oz !== cz || t > kNext) { jobs.push('k'); kNext = t + 12; } jobs.push('catch');
      }
      else if (jobs.length && c) { const job = jobs.shift();
        if (job === 'k') kPass();
        else catchStep(windDir[0] * wind, windDir[1] * wind); }
      if (c) { const vis = snowLive && (state.snow > 0.01 || !!this.force);                     // each ring snapped to twice its spacing: fixed to the world, aligned with the ring inside it
        LV.forEach((L, i) => { const m = nearMeshes[i]; m.visible = vis; if (!vis) return; const q = L.sp * 2, sx = Math.round(c.x / q) * q, sz = Math.round(c.z / q) * q;
          L.u.uNearC.value.set(sx, sz); m.position.set(sx, 0, sz); if (i) L.u.uInnerC.value.copy(LV[i - 1].u.uNearC.value); }); }
      // the snow, after the cover (on a re-centre it moves in the same frame)
      U.uSnowBase.value = state.snow * 0.4; snowAcc += dt;
      if (fall > 0 || this.force || snowLive) { if (snowAcc >= 0.1 || snowShift.lengthSq() > 0) { snowStep(Math.min(0.5, snowAcc), fall, melt, this.force ? (this.force.snow || 0) : -1); snowAcc = 0; } snowLive = fall > 0 || state.snow > 0.002 || !!this.force; } else snowShift.set(0, 0);
      // footprints: the near map follows you (4 m steps); snowfall fills prints back in (~a minute of steady snow), melting too
      if (c) { const nx = Math.round(c.x / 4) * 4 - FS / 2, nz = Math.round(c.z / 4) * 4 - FS / 2; if (nx !== fcx || nz !== fcz) { if (fcx < 1e8) footShift.set((nx - fcx) / FS, (nz - fcz) / FS); fcx = nx; fcz = nz; U.uFootRect.value.set(nx, nz, FS); } }
      footAcc += dt; if (footLive && (stamps.length || footShift.lengthSq() > 0 || footAcc > 0.25)) { footStep(footAcc * (fall * 6 + melt * 4)); footAcc = 0; if (!stamps.length && state.snow < 0.002 && fall === 0) footLive = false; }
    },
  };
}
