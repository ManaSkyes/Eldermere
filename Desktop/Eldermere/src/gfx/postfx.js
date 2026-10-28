// src/gfx/postfx.js — small, explicit post-processing pipeline for Eldermere.
//
// Public API retained for existing callers:
//   const fx = createPostFX(THREE, renderer)
//   fx.render(scene, camera, { bloom, threshold, grade, exposure })
//   fx.renderInset(scene, camera, x, y, w, h, exposure)
//   fx.setSize(); fx.useDepth(true | false); fx.afterScene(sceneRT, camera)
//
// Effects can be independently switched with fx.setEffects({...}). Scene fog is deliberately
// not implemented here: Three.js/world fog belongs to the scene materials and weather system.

export const GRADES = {
  neutral: { lift: [0, 0, 0], gain: [1, 1, 1], sat: 1, contrast: 1, vignette: 0 },
  warm:    { lift: [0.006, 0.002, -0.004], gain: [1.025, 1.005, 0.975], sat: 1.035, contrast: 1.025, vignette: 0.12 },
  cool:    { lift: [-0.003, 0.002, 0.008], gain: [0.975, 1.005, 1.035], sat: 1.025, contrast: 1.02, vignette: 0.12 },
  dusk:    { lift: [0.012, 0.001, 0.012], gain: [1.025, 0.97, 1.015], sat: 1.06, contrast: 1.035, vignette: 0.16 },
  none:    { lift: [0, 0, 0], gain: [1, 1, 1], sat: 1, contrast: 1, vignette: 0 },
};

const DEFAULT_EFFECTS = Object.freeze({
  bloomExtraction: true,
  bloomBlur: true,
  toneMapping: true,
  colorGrade: true,
  vignette: true,
});

export function createPostFX(THREE, renderer) {
  const size = new THREE.Vector2();
  const targetOptions = {
    format: THREE.RGBAFormat,
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    stencilBuffer: false,
  };
  const smallOptions = {
    format: THREE.RGBAFormat,
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  };

  // The normal scene target may be multisampled. Screen-space reflections can request a
  // depth-texture target instead; that path is intentionally non-multisampled for compatibility.
  const canMultisample = renderer.capabilities.isWebGL2 && !!THREE.WebGLMultisampleRenderTarget;
  const multisampleRT = canMultisample
    ? new THREE.WebGLMultisampleRenderTarget(1, 1, targetOptions)
    : new THREE.WebGLRenderTarget(1, 1, targetOptions);
  if (multisampleRT.samples !== undefined) multisampleRT.samples = 4;
  let depthRT = null;
  let sceneRT = multisampleRT;

  // Bloom is quarter-resolution. Linear filtering downsamples the HDR scene as it is sampled.
  const bloomRT = new THREE.WebGLRenderTarget(1, 1, smallOptions);
  const blurRT = new THREE.WebGLRenderTarget(1, 1, smallOptions);

  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadScene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  quadScene.add(quad);

  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `;

  const extractMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: null },
      threshold: { value: 0.9 },
      texel: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader,
    depthTest: false,
    depthWrite: false,
    fragmentShader: `
      uniform sampler2D tScene;
      uniform float threshold;
      uniform vec2 texel;
      varying vec2 vUv;

      vec3 safeColor(vec3 c) {
        if (!(c.r == c.r && c.g == c.g && c.b == c.b)) return vec3(0.0);
        return clamp(c, 0.0, 64.0);
      }

      void main() {
        // Four bilinear taps provide a stable downsample and reduce isolated-pixel sparkle.
        vec3 a = safeColor(texture2D(tScene, vUv + texel * vec2(-1.0, -1.0)).rgb);
        vec3 b = safeColor(texture2D(tScene, vUv + texel * vec2( 1.0, -1.0)).rgb);
        vec3 c = safeColor(texture2D(tScene, vUv + texel * vec2(-1.0,  1.0)).rgb);
        vec3 d = safeColor(texture2D(tScene, vUv + texel * vec2( 1.0,  1.0)).rgb);
        vec3 color = (a + b + c + d) * 0.25;
        float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
        float contribution = smoothstep(threshold, threshold + 0.6, luminance);
        gl_FragColor = vec4(color * contribution, 1.0);
      }
    `,
  });

  const blurMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tInput: { value: null },
      direction: { value: new THREE.Vector2(1, 0) },
      texel: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader,
    depthTest: false,
    depthWrite: false,
    fragmentShader: `
      uniform sampler2D tInput;
      uniform vec2 direction;
      uniform vec2 texel;
      varying vec2 vUv;
      void main() {
        vec2 stepUV = direction * texel;
        vec3 color = texture2D(tInput, vUv).rgb * 0.227027;
        color += texture2D(tInput, vUv + stepUV * 1.384615).rgb * 0.316216;
        color += texture2D(tInput, vUv - stepUV * 1.384615).rgb * 0.316216;
        color += texture2D(tInput, vUv + stepUV * 3.230769).rgb * 0.070270;
        color += texture2D(tInput, vUv - stepUV * 3.230769).rgb * 0.070270;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

  const finalMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: null },
      tBloom: { value: null },
      bloomStrength: { value: 0.7 },
      exposure: { value: 0.85 },
      lift: { value: new THREE.Vector3(0, 0, 0) },
      gain: { value: new THREE.Vector3(1, 1, 1) },
      saturation: { value: 1 },
      contrast: { value: 1 },
      vignetteStrength: { value: 0 },
      useToneMapping: { value: 1 },
      useColorGrade: { value: 1 },
      useVignette: { value: 1 },
    },
    vertexShader,
    depthTest: false,
    depthWrite: false,
    fragmentShader: `
      uniform sampler2D tScene;
      uniform sampler2D tBloom;
      uniform float bloomStrength;
      uniform float exposure;
      uniform vec3 lift;
      uniform vec3 gain;
      uniform float saturation;
      uniform float contrast;
      uniform float vignetteStrength;
      uniform float useToneMapping;
      uniform float useColorGrade;
      uniform float useVignette;
      varying vec2 vUv;

      // ACES fitted curve. The scene texture is linear HDR; display encoding happens once,
      // at the very end of this shader.
      vec3 acesFit(vec3 x) {
        return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
      }

      vec3 linearToSRGB(vec3 c) {
        c = max(c, vec3(0.0));
        vec3 low = c * 12.92;
        vec3 high = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
        return mix(low, high, step(vec3(0.0031308), c));
      }

      void main() {
        vec3 color = texture2D(tScene, vUv).rgb;
        color += texture2D(tBloom, vUv).rgb * bloomStrength;
        color *= max(exposure, 0.0);

        if (useToneMapping > 0.5) {
          color = acesFit(max(color, vec3(0.0)));
        } else {
          color = clamp(color, 0.0, 1.0);
        }

        if (useColorGrade > 0.5) {
          float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
          color = mix(vec3(luminance), color, saturation);
          color = (color - 0.5) * contrast + 0.5;
          color = color * gain + lift * (1.0 - color);
        }

        if (useVignette > 0.5) {
          vec2 p = vUv - vec2(0.5);
          float edge = smoothstep(0.22, 0.72, dot(p, p) * 2.0);
          color *= 1.0 - clamp(vignetteStrength, 0.0, 1.0) * edge;
        }

        gl_FragColor = vec4(linearToSRGB(clamp(color, 0.0, 1.0)), 1.0);
      }
    `,
  });

  const blackTexture = new THREE.DataTexture(
    new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat
  );
  blackTexture.needsUpdate = true;
  blackTexture.minFilter = THREE.NearestFilter;
  blackTexture.magFilter = THREE.NearestFilter;

  let effects = { ...DEFAULT_EFFECTS };
  const passStats = Object.create(null);
  function timePass(name, fn) {
    const t0 = performance.now();
    try { return fn(); }
    finally {
      const elapsed = performance.now() - t0;
      passStats[name] = (passStats[name] || 0) * 0.9 + elapsed * 0.1;
    }
  }
  function getStats() { return { ...passStats }; }

  function setSize() {
    renderer.getDrawingBufferSize(size);
    const width = Math.max(1, size.x);
    const height = Math.max(1, size.y);
    sceneRT.setSize(width, height);
    const bloomWidth = Math.max(1, Math.round(width / 4));
    const bloomHeight = Math.max(1, Math.round(height / 4));
    bloomRT.setSize(bloomWidth, bloomHeight);
    blurRT.setSize(bloomWidth, bloomHeight);
  }

  function drawQuad(material, target) {
    quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(quadScene, quadCamera);
  }

  function setGrade(grade) {
    if (grade && typeof grade === 'object') return grade;
    return GRADES[grade] || GRADES.neutral;
  }

  function setEffects(next = {}) {
    effects = { ...effects, ...next };
    return { ...effects };
  }

  function getEffects() {
    return { ...effects };
  }

  function render(scene, camera, params = {}) {
    const {
      bloom = 0.7,
      threshold = 0.9,
      grade = 'warm',
      exposure = 0.85,
    } = params;
    const effectOverrides = params.effects || {};
    const active = { ...effects, ...effectOverrides };
    const previousTarget = renderer.getRenderTarget();
    const previousViewport = new THREE.Vector4();
    const previousScissor = new THREE.Vector4();
    renderer.getViewport(previousViewport);
    renderer.getScissor(previousScissor);
    const previousScissorTest = renderer.getScissorTest();
    const previousAutoClear = renderer.autoClear;
    const previousXrEnabled = renderer.xr ? renderer.xr.enabled : undefined;

    try {
      if (renderer.xr) renderer.xr.enabled = false;
      renderer.autoClear = false;

      // Render the world once into a linear HDR target. Explicit clear prevents stale pixels
      // when the target or camera viewport changes.
      renderer.setRenderTarget(sceneRT);
      renderer.clear(true, true, true);
      timePass('Scene target', () => renderer.render(scene, camera));

      // Screen-space reflections copy this linear scene/depth before post-processing.
      if (typeof api.afterScene === 'function') api.afterScene(sceneRT, camera);

      const amount = Math.max(0, Number(bloom) || 0);
      let bloomTexture = blackTexture;
      if (amount > 0 && active.bloomExtraction) {
        extractMaterial.uniforms.tScene.value = sceneRT.texture;
        extractMaterial.uniforms.threshold.value = Math.max(0, Number(threshold) || 0);
        extractMaterial.uniforms.texel.value.set(1 / sceneRT.width, 1 / sceneRT.height);
        timePass('Bloom extraction', () => drawQuad(extractMaterial, bloomRT));
        bloomTexture = bloomRT.texture;

        if (active.bloomBlur) {
          blurMaterial.uniforms.texel.value.set(1 / bloomRT.width, 1 / bloomRT.height);
          blurMaterial.uniforms.tInput.value = bloomRT.texture;
          blurMaterial.uniforms.direction.value.set(1, 0);
          timePass('Bloom blur horizontal', () => drawQuad(blurMaterial, blurRT));

          blurMaterial.uniforms.tInput.value = blurRT.texture;
          blurMaterial.uniforms.direction.value.set(0, 1);
          timePass('Bloom blur vertical', () => drawQuad(blurMaterial, bloomRT));
          bloomTexture = bloomRT.texture;
        }
      }

      const G = setGrade(grade);
      const U = finalMaterial.uniforms;
      U.tScene.value = sceneRT.texture;
      U.tBloom.value = bloomTexture;
      U.bloomStrength.value = amount > 0 && active.bloomExtraction ? amount : 0;
      U.exposure.value = Number.isFinite(Number(exposure)) ? Number(exposure) : 0.85;
      U.lift.value.set(...(G.lift || [0, 0, 0]));
      U.gain.value.set(...(G.gain || [1, 1, 1]));
      U.saturation.value = active.colorGrade ? (G.sat ?? 1) : 1;
      U.contrast.value = active.colorGrade ? (G.contrast ?? 1) : 1;
      U.vignetteStrength.value = active.vignette ? (G.vignette ?? 0) : 0;
      U.useToneMapping.value = active.toneMapping ? 1 : 0;
      U.useColorGrade.value = active.colorGrade ? 1 : 0;
      U.useVignette.value = active.vignette ? 1 : 0;

      // Composite to the previously active target (normally the canvas).
      renderer.setRenderTarget(previousTarget);
      renderer.setViewport(previousViewport);
      renderer.setScissor(previousScissor);
      renderer.setScissorTest(previousScissorTest);
      timePass('Final composite', () => drawQuad(finalMaterial, previousTarget));
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.setViewport(previousViewport);
      renderer.setScissor(previousScissor);
      renderer.setScissorTest(previousScissorTest);
      renderer.autoClear = previousAutoClear;
      if (renderer.xr && previousXrEnabled !== undefined) renderer.xr.enabled = previousXrEnabled;
    }
  }

  // Character-book/inset render: keep the same simple display transform but no bloom, grade or vignette.
  const insetRT = new THREE.WebGLRenderTarget(2, 2, targetOptions);
  function renderInset(scene, camera, x, y, width, height, exposure = 0.85) {
    const pixelRatio = renderer.getPixelRatio();
    const w = Math.max(2, Math.round(width * pixelRatio));
    const h = Math.max(2, Math.round(height * pixelRatio));
    if (insetRT.width !== w || insetRT.height !== h) insetRT.setSize(w, h);

    const previousTarget = renderer.getRenderTarget();
    const previousViewport = new THREE.Vector4();
    const previousScissor = new THREE.Vector4();
    renderer.getViewport(previousViewport);
    renderer.getScissor(previousScissor);
    const previousScissorTest = renderer.getScissorTest();
    const previousAutoClear = renderer.autoClear;

    try {
      renderer.autoClear = false;
      renderer.setRenderTarget(insetRT);
      renderer.clear(true, true, true);
      renderer.render(scene, camera);

      const U = finalMaterial.uniforms;
      U.tScene.value = insetRT.texture;
      U.tBloom.value = blackTexture;
      U.bloomStrength.value = 0;
      U.exposure.value = exposure;
      U.lift.value.set(0, 0, 0);
      U.gain.value.set(1, 1, 1);
      U.saturation.value = 1;
      U.contrast.value = 1;
      U.vignetteStrength.value = 0;
      U.useToneMapping.value = 1;
      U.useColorGrade.value = 0;
      U.useVignette.value = 0;

      renderer.setRenderTarget(previousTarget);
      renderer.setViewport(x, y, width, height);
      renderer.setScissor(x, y, width, height);
      renderer.setScissorTest(true);
      drawQuad(finalMaterial, previousTarget);
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.setViewport(previousViewport);
      renderer.setScissor(previousScissor);
      renderer.setScissorTest(previousScissorTest);
      renderer.autoClear = previousAutoClear;
    }
  }

  const api = {
    render,
    renderInset,
    setSize,
    setEffects,
    getEffects,
    getStats,
    afterScene: null,
    get sceneRT() { return sceneRT; },
    useDepth(enabled) {
      if (enabled && !depthRT) {
        depthRT = new THREE.WebGLRenderTarget(1, 1, targetOptions);
        depthRT.depthTexture = new THREE.DepthTexture();
        depthRT.depthTexture.type = THREE.UnsignedIntType;
      }
      sceneRT = enabled ? depthRT : multisampleRT;
      setSize();
    },
    dispose() {
      multisampleRT.dispose();
      depthRT?.dispose();
      bloomRT.dispose();
      blurRT.dispose();
      insetRT.dispose();
      extractMaterial.dispose();
      blurMaterial.dispose();
      finalMaterial.dispose();
      quad.geometry.dispose();
      blackTexture.dispose();
    },
  };

  setSize();
  return api;
}
