// src/gfx/postfx.js — glow and colour grading, for the PS2-era look: fires, crystals and bright light bloom
// softly, and the picture gets a gentle grade (warmth, saturation, a little contrast and a vignette).
//
//   const fx = createPostFX(THREE, renderer)
//   fx.render(scene, camera, { bloom, threshold, grade })   instead of renderer.render(scene, camera)
//   fx.setSize()                                              after the canvas resizes
//
// The scene is drawn (in HDR, without tone mapping) into an off-screen picture; its brightest parts are blurred
// at quarter size; then one pass adds the glow, tone-maps (ACES, as the renderer did), grades, and writes it to
// the screen. While this is on, the renderer's own tone mapping is off (the last pass does it instead).
export const GRADES = {
  neutral: { lift: [0, 0, 0], gain: [1, 1, 1], sat: 1.05, contrast: 1.03, vignette: 0.18 },
  warm: { lift: [0.012, 0.006, 0.004], gain: [1.03, 1.0, 0.96], sat: 1.06, contrast: 1.06, vignette: 0.26 },
  cool: { lift: [-0.004, 0.004, 0.024], gain: [0.92, 0.98, 1.08], sat: 1.06, contrast: 1.05, vignette: 0.28 },
  dusk: { lift: [0.03, 0.0, 0.03], gain: [1.05, 0.92, 0.98], sat: 1.12, contrast: 1.08, vignette: 0.3 },
  none: { lift: [0, 0, 0], gain: [1, 1, 1], sat: 1, contrast: 1, vignette: 0 },
};

export function createPostFX(THREE, renderer) {
  const size = new THREE.Vector2();
  const webgl2 = renderer.capabilities.isWebGL2;
  const opts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true };
  const msRT = webgl2 && THREE.WebGLMultisampleRenderTarget ? new THREE.WebGLMultisampleRenderTarget(1, 1, opts) : new THREE.WebGLRenderTarget(1, 1, opts);
  if (msRT.samples !== undefined) msRT.samples = 0; // Experimental: avoid a 4x multisampled HDR scene target; compare GPU time and edge quality against the glow-off path.
  // with a depth picture (screen-space reflections need it: src/gfx/reflections.js): no multisampling then
  let depthRT = null, sceneRT = msRT;
  const small = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
  const rtA = new THREE.WebGLRenderTarget(1, 1, small), rtB = new THREE.WebGLRenderTarget(1, 1, small);

  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quadScene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false; quadScene.add(quad);
  const vert = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  // the bright pass, at a quarter size: it averages the whole 4×4 block of screen pixels under each of its own (4
  // bilinear taps), each weighted down by its brightness (a "Karis" average), so a single sparkling pixel — a lamp's
  // glint on wet stone — can't blow up into a glowing disc that blinks as you move
  const bright = new THREE.ShaderMaterial({ uniforms: { tex: { value: null }, threshold: { value: 0.9 }, px: { value: new THREE.Vector2(1, 1) } }, vertexShader: vert, depthTest: false, depthWrite: false,
    fragmentShader: `uniform sampler2D tex; uniform float threshold; uniform vec2 px; varying vec2 vUv;
      vec3 tap(vec2 o, inout float ws) { vec3 c = texture2D(tex, vUv + o * px).rgb; if (!(c.r == c.r && c.g == c.g && c.b == c.b)) c = vec3(0.0); c = clamp(c, 0.0, 64.0);   /* (a broken pixel — NaN — would black out a whole block) */ float w = 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722))); ws += w; return c * w; }
      void main() { float ws = 0.0; vec3 c = tap(vec2(-1.0, -1.0), ws) + tap(vec2(1.0, -1.0), ws) + tap(vec2(-1.0, 1.0), ws) + tap(vec2(1.0, 1.0), ws); c /= ws;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); gl_FragColor = vec4(c * smoothstep(threshold, threshold + 0.6, l), 1.0); }` });
  const blur = new THREE.ShaderMaterial({ uniforms: { tex: { value: null }, dir: { value: new THREE.Vector2() } }, vertexShader: vert, depthTest: false, depthWrite: false,
    fragmentShader: `uniform sampler2D tex; uniform vec2 dir; varying vec2 vUv;
      void main() { vec3 c = texture2D(tex, vUv).rgb * 0.227027;
        c += texture2D(tex, vUv + dir * 1.384615).rgb * 0.316216; c += texture2D(tex, vUv - dir * 1.384615).rgb * 0.316216;
        c += texture2D(tex, vUv + dir * 3.230769).rgb * 0.070270; c += texture2D(tex, vUv - dir * 3.230769).rgb * 0.070270;
        gl_FragColor = vec4(c, 1.0); }` });
  const final = new THREE.ShaderMaterial({
    uniforms: { tScene: { value: null }, tBloom: { value: null }, bloom: { value: 0.7 }, exposure: { value: 0.85 }, lift: { value: new THREE.Vector3() }, gain: { value: new THREE.Vector3(1, 1, 1) }, sat: { value: 1 }, contrast: { value: 1 }, vignette: { value: 0 } },
    vertexShader: vert, depthTest: false, depthWrite: false,
    fragmentShader: `uniform sampler2D tScene, tBloom; uniform float bloom, exposure, sat, contrast, vignette; uniform vec3 lift, gain; varying vec2 vUv;
      vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
      vec3 aces(vec3 c) {
        const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
        const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
        c *= exposure / 0.6; c = I * c; c = RRTAndODTFit(c); c = O * c; return clamp(c, 0.0, 1.0); }
      vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
      void main() {
        vec3 c = texture2D(tScene, vUv).rgb + texture2D(tBloom, vUv).rgb * bloom;
        c = aces(c);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(l), c, sat);
        c = (c - 0.5) * contrast + 0.5; c = c * gain + lift * (1.0 - c);
        vec2 q = vUv - 0.5; c *= 1.0 - vignette * smoothstep(0.25, 0.75, dot(q, q) * 2.2);
        gl_FragColor = vec4(toSRGB(clamp(c, 0.0, 1.0)), 1.0); }` });

  function setSize() {
    renderer.getDrawingBufferSize(size);
    sceneRT.setSize(size.x, size.y);
    const w = Math.max(1, Math.round(size.x / 4)), h = Math.max(1, Math.round(size.y / 4));
    rtA.setSize(w, h); rtB.setSize(w, h);
  }
  setSize();
  const pass = (material, target) => { quad.material = material; renderer.setRenderTarget(target); renderer.render(quadScene, cam); };

  function render(scene, camera, { bloom = 0.7, threshold = 0.9, grade = 'warm', exposure = 0.85 } = {}) {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(sceneRT); renderer.render(scene, camera);
    api.afterScene?.(sceneRT, camera);                                                         // (the reflections take their copy here)
    if (bloom > 0) {
      bright.uniforms.tex.value = sceneRT.texture; bright.uniforms.threshold.value = threshold; bright.uniforms.px.value.set(1 / sceneRT.width, 1 / sceneRT.height); pass(bright, rtA);
      for (let i = 0; i < 1; i++) { // one separable blur iteration: two quarter-resolution passes instead of four
        blur.uniforms.tex.value = rtA.texture; blur.uniforms.dir.value.set(1 / rtA.width, 0); pass(blur, rtB);
        blur.uniforms.tex.value = rtB.texture; blur.uniforms.dir.value.set(0, 1 / rtA.height); pass(blur, rtA);
      }
    }
    const G = (typeof grade === 'object' && grade) || GRADES[grade] || GRADES.warm, U = final.uniforms;   // (a grade by name, or one eased between two: src/gfx/sky.js)
    U.tScene.value = sceneRT.texture; U.tBloom.value = rtA.texture; U.bloom.value = bloom; U.exposure.value = exposure;
    U.lift.value.set(...G.lift); U.gain.value.set(...G.gain); U.sat.value = G.sat; U.contrast.value = G.contrast; U.vignette.value = G.vignette;
    pass(final, prev);
  }
  // a small view drawn into part of the screen (the character book's figure): drawn the same way as the scene (linear,
  // not tone-mapped — so the scene's shaders are reused, not compiled a second time), then graded straight onto the screen
  const insetRT = new THREE.WebGLRenderTarget(2, 2, opts);
  function renderInset(scene, camera, x, y, w, h, exposure = 0.85) {
    const pr = renderer.getPixelRatio(), W = Math.max(2, Math.round(w * pr)), H = Math.max(2, Math.round(h * pr)); if (insetRT.width !== W || insetRT.height !== H) insetRT.setSize(W, H);
    const prev = renderer.getRenderTarget(); renderer.setRenderTarget(insetRT); renderer.clear(); renderer.render(scene, camera);
    const G = GRADES.none, U = final.uniforms; U.tScene.value = insetRT.texture; U.tBloom.value = rtA.texture; U.bloom.value = 0; U.exposure.value = exposure;
    U.lift.value.set(...G.lift); U.gain.value.set(...G.gain); U.sat.value = 1; U.contrast.value = 1; U.vignette.value = 0;
    quad.material = final; renderer.setRenderTarget(prev); renderer.setScissorTest(true); renderer.setScissor(x, y, w, h); renderer.setViewport(x, y, w, h);
    renderer.render(quadScene, cam); renderer.setScissorTest(false);
  }
  const api = { render, renderInset, setSize, afterScene: null, get sceneRT() { return sceneRT; },
    useDepth(on) { if (on && !depthRT) { depthRT = new THREE.WebGLRenderTarget(1, 1, opts); depthRT.depthTexture = new THREE.DepthTexture(); depthRT.depthTexture.type = THREE.UnsignedIntType; }
      sceneRT = on ? depthRT : msRT; setSize(); } };
  return api;
}
