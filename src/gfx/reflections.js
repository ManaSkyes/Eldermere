// src/gfx/reflections.js — what the puddles (and the gutters) reflect. A choice in the options (Reflections):
//
//   planar  "Mirror view": the scene drawn a second time, mirrored in the level of the ground under you, at half the
//           screen's resolution, without grass or the rain. Buildings, lamps, trees, people and the sky all show in the
//           puddles, steady and sharp. Puddles from 1.2 m below your level to 3 m above read it exactly (shifted for
//           their own height); further away they fall back to the sky.
//   ssr     "Screen-space": the last frame (its colours and how far away each pixel was) is copied at half size, and
//           each puddle pixel follows its reflected ray across it until it meets something. Works at any height and
//           costs no second drawing, but only what's on screen can show: reflections thin out at the edges and behind
//           things. Needs "Glow and colour grading" on (its picture comes from there); without it, sky only.
//   off     the sky's colour only.
//
// The puddle shader lives in src/gfx/weathering.js and reads the uniforms set here (uReflMode 0 off, 1 planar, 2 ssr).
//   const R = createReflections(THREE, renderer, scene, weathering, fx)
//   R.mode = 'planar' | 'ssr' | 'off'
//   R.update(camera, groundY)      each frame, before the scene is drawn (groundY: the ground under you)
export function createReflections(THREE, renderer, scene, weathering, fx) {
  const U = weathering.U, size = new THREE.Vector2();
  const dummy = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat); dummy.needsUpdate = true;
  const rtOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
  // ---- planar ----
  const planarRT = new THREE.WebGLRenderTarget(2, 2, { ...rtOpts, depthBuffer: true });
  const vcam = new THREE.PerspectiveCamera(), N = new THREE.Vector3(0, 1, 0), plane = new THREE.Plane(), clip = new THREE.Vector4(), q = new THREE.Vector4();
  const rpos = new THREE.Vector3(), cpos = new THREE.Vector3(), view = new THREE.Vector3(), look = new THREE.Vector3(), target = new THREE.Vector3(), rot = new THREE.Matrix4();
  const hideRefl = o => o.isPoints || o.isLine || o.isSprite || o.userData.noCover || o.userData.noReflect;
  // What the mirror leaves out, found by walking the scene a little at a time (a few thousand objects a frame, a fresh
  // pass every couple of seconds) instead of all of it every frame — that walk, and the lists it made, were a steady
  // cost and a source of hitches. Two lists: always hidden (rain, sparkles, grass, hair cards), and small things
  // (props, clutter: under 1.2 m across) dropped from the mirror past 28 m and mid-sized ones (under 4 m) past 70 m,
  // where they'd be a few pixels in a half-size puddle picture anyway but still cost a draw each.
  let scanStack = [], scanHide = [], scanSmall = [], hideList = [], smallList = [], scanIdle = 0, firstPass = true;
  const SCAN_PER_FRAME = 2500, SMALL = 1.2, MID = 4, SMALL_FAR = 28 * 28, MID_FAR = 70 * 70;
  function scanStep() {
    if (!scanStack.length) {
      if (scanIdle-- > 0) return;
      hideList = scanHide; smallList = scanSmall; scanHide = []; scanSmall = []; scanStack = [scene]; scanIdle = 120;   // a finished pass takes over; the next starts in ~2 s
    }
    const budget = firstPass ? Infinity : SCAN_PER_FRAME;            // (the very first pass all at once, so nothing slips into the mirror)
    for (let n = 0; n < budget && scanStack.length; n++) {
      const o = scanStack.pop();
      if (o !== scene) {
        if (hideRefl(o)) { scanHide.push(o); continue; }                 // (its children go with it)
        if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && o.geometry) {
          const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
          const r = g.boundingSphere.radius * Math.max(o.scale.x, o.scale.y, o.scale.z);
          if (r < MID && o.frustumCulled !== false) scanSmall.push(o, r < SMALL ? SMALL_FAR : MID_FAR);
        }
      }
      const ch = o.children; for (let i = 0; i < ch.length; i++) scanStack.push(ch[i]);
    }
    if (firstPass && !scanStack.length) { firstPass = false; hideList = scanHide; smallList = scanSmall; scanHide = []; scanSmall = []; scanIdle = 120; }
  }
  const hid = [];
  const tmpV = new THREE.Vector3();
  function planar(camera, h) {
    renderer.getDrawingBufferSize(size); const w = Math.max(2, size.x >> 1), hh = Math.max(2, size.y >> 1); if (planarRT.width !== w || planarRT.height !== hh) planarRT.setSize(w, hh);
    camera.updateMatrixWorld(); cpos.setFromMatrixPosition(camera.matrixWorld); rpos.set(cpos.x, h, cpos.z);
    view.subVectors(rpos, cpos); if (view.dot(N) > 0) return false;                               // (the camera is below the ground's level)
    view.reflect(N).negate().add(rpos);
    rot.extractRotation(camera.matrixWorld); look.set(0, 0, -1).applyMatrix4(rot).add(cpos);
    target.subVectors(rpos, look).reflect(N).negate().add(rpos);
    vcam.position.copy(view); vcam.up.set(0, 1, 0).applyMatrix4(rot).reflect(N); vcam.lookAt(target);
    vcam.near = camera.near; vcam.far = camera.far; vcam.fov = camera.fov; vcam.aspect = camera.aspect; vcam.updateMatrixWorld(); vcam.projectionMatrix.copy(camera.projectionMatrix);
    U.uReflMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(vcam.projectionMatrix).multiply(vcam.matrixWorldInverse);
    // an oblique near plane: nothing under the ground's level gets into the mirror
    // (a little below the level: anything lower would bring the undersides of the street's own slabs into the mirror)
    plane.setFromNormalAndCoplanarPoint(N, tmpV.copy(rpos).setY(h - 0.3)).applyMatrix4(vcam.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const P = vcam.projectionMatrix.elements;
    q.set((Math.sign(clip.x) + P[8]) / P[0], (Math.sign(clip.y) + P[9]) / P[5], -1, (1 + P[10]) / P[14]); clip.multiplyScalar(2 / clip.dot(q));
    P[2] = clip.x; P[6] = clip.y; P[10] = clip.z + 1 - 0.003; P[14] = clip.w; vcam.projectionMatrixInverse.copy(vcam.projectionMatrix).invert();
    // draw it: no rain, grass or shadows redrawn; the puddles inside it don't read the picture being drawn
    hid.length = 0;
    for (let i = 0; i < hideList.length; i++) { const o = hideList[i]; if (o.visible) { o.visible = false; hid.push(o); } }
    for (let i = 0; i < smallList.length; i += 2) { const o = smallList[i]; if (!o.visible) continue; const e = o.matrixWorld.elements, dx = e[12] - cpos.x, dz = e[14] - cpos.z;
      if (dx * dx + dz * dz > smallList[i + 1]) { o.visible = false; hid.push(o); } }
    const prevRT = renderer.getRenderTarget(), prevSh = renderer.shadowMap.autoUpdate, mode = U.uReflMode.value;
    U.uRefl.value = dummy; U.uReflMode.value = 0; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(planarRT); renderer.clear(); renderer.render(scene, vcam);
    renderer.setRenderTarget(prevRT); renderer.shadowMap.autoUpdate = prevSh; for (let i = 0; i < hid.length; i++) hid[i].visible = true;
    U.uRefl.value = planarRT.texture; U.uReflMode.value = mode; U.uReflH.value = h;
    return true;
  }
  // ---- screen-space: after the scene is drawn (src/gfx/postfx.js afterScene), its colours and distances at half size ----
  const ssrRT = new THREE.WebGLRenderTarget(2, 2, { ...rtOpts, depthBuffer: false });
  const copyMat = new THREE.ShaderMaterial({ uniforms: { tCol: { value: null }, tDep: { value: null }, uNear: { value: 0.05 }, uFar: { value: 300 } }, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tCol, tDep; uniform float uNear, uFar; varying vec2 vUv;
      void main() { float z = texture2D(tDep, vUv).x * 2.0 - 1.0; float d = 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear));
        gl_FragColor = vec4(texture2D(tCol, vUv).rgb, d); }` });
  const qScene = new THREE.Scene(), qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copyMat); quad.frustumCulled = false; qScene.add(quad);
  let ssrReady = false;
  const afterScene = (sceneRT, camera) => {
    if (api.mode !== 'ssr' || !sceneRT.depthTexture) return;
    const w = Math.max(2, sceneRT.width >> 1), h = Math.max(2, sceneRT.height >> 1); if (ssrRT.width !== w || ssrRT.height !== h) ssrRT.setSize(w, h);
    copyMat.uniforms.tCol.value = sceneRT.texture; copyMat.uniforms.tDep.value = sceneRT.depthTexture; copyMat.uniforms.uNear.value = camera.near; copyMat.uniforms.uFar.value = camera.far;
    const prev = renderer.getRenderTarget(); renderer.setRenderTarget(ssrRT); renderer.render(qScene, qCam); renderer.setRenderTarget(prev);
    U.uSSRView.value.copy(camera.matrixWorldInverse); U.uSSRProj.value.copy(camera.projectionMatrix); U.uRefl.value = ssrRT.texture; ssrReady = true;
  };
  if (fx) fx.afterScene = afterScene;
  let mode = 'off';
  const api = {
    get mode() { return mode; },
    set mode(m) { mode = m === 'planar' || m === 'ssr' ? m : 'off'; fx?.useDepth?.(mode === 'ssr'); ssrReady = false; U.uRefl.value = dummy; U.uReflMode.value = 0; },
    update(camera, groundY) {
      const want = weathering.state.puddle + weathering.state.gutter > 0.01 && weathering.state.snow < 0.25;   // (no puddles — or snow lying over them as it melts —: nothing to reflect, nothing drawn)
      if (!want || mode === 'off') { U.uReflMode.value = 0; return; }
      if (mode === 'planar') { scanStep(); U.uReflMode.value = planar(camera, groundY) ? 1 : 0; }
      else U.uReflMode.value = ssrReady ? 2 : 0;
    },
  };
  return api;
}
