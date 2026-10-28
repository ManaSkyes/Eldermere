// src/game/mirror.js — a planar mirror: the scene rendered from the camera's reflection into a
// texture, projected back onto the glass. (The standard reflector technique, with an oblique near
// plane so nothing behind the glass leaks into the reflection.)
//
//   const m = createMirror(THREE, 1.2, 2.1); scene.add(m.mesh);
//   each frame, before the main render: m.render(renderer, scene, camera, { before, after })
// before/after run around the mirror's own render (e.g. show the player's head only in the mirror).

export function createMirror(THREE, width, height, { resolution = 1024, tint = 0xdfe4ea } = {}) {
  const target = new THREE.WebGLRenderTarget(resolution, Math.round(resolution * height / width), {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, encoding: THREE.sRGBEncoding,
  });
  const textureMatrix = new THREE.Matrix4();
  const material = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: target.texture }, textureMatrix: { value: textureMatrix }, tint: { value: new THREE.Color(tint) } },
    vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv;
      void main() { vUv = textureMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec3 tint; varying vec4 vUv;
      void main() { vec4 c = texture2DProj(tDiffuse, vUv); gl_FragColor = vec4(c.rgb * tint, 1.0); }`,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);

  const cam = new THREE.PerspectiveCamera();
  const plane = new THREE.Plane(), normal = new THREE.Vector3(), mirrorPos = new THREE.Vector3(), camPos = new THREE.Vector3();
  const rot = new THREE.Matrix4(), look = new THREE.Vector3(0, 0, -1), clip = new THREE.Vector4(), q = new THREE.Vector4();
  const view = new THREE.Vector3(), tgt = new THREE.Vector3();

  function render(renderer, scene, camera, hooks = {}) {
    mesh.updateMatrixWorld();
    mirrorPos.setFromMatrixPosition(mesh.matrixWorld); camPos.setFromMatrixPosition(camera.matrixWorld);
    rot.extractRotation(mesh.matrixWorld); normal.set(0, 0, 1).applyMatrix4(rot);
    view.subVectors(mirrorPos, camPos);
    if (view.dot(normal) > 0) return;                                 // looking at the back of the mirror
    view.reflect(normal).negate().add(mirrorPos);
    rot.extractRotation(camera.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(rot).add(camPos);
    tgt.subVectors(mirrorPos, look).reflect(normal).negate().add(mirrorPos);
    cam.position.copy(view);
    cam.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal);
    cam.lookAt(tgt);
    cam.far = camera.far; cam.near = camera.near;
    cam.updateMatrixWorld(); cam.projectionMatrix.copy(camera.projectionMatrix);
    textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse).multiply(mesh.matrixWorld);
    // oblique near plane: clip everything on the far side of the glass
    plane.setFromNormalAndCoplanarPoint(normal, mirrorPos).applyMatrix4(cam.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const e = cam.projectionMatrix.elements;
    q.x = (Math.sign(clip.x) + e[8]) / e[0]; q.y = (Math.sign(clip.y) + e[9]) / e[5]; q.z = -1; q.w = (1 + e[10]) / e[14];
    clip.multiplyScalar(2 / clip.dot(q));
    e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1 - 0.003; e[14] = clip.w;

    mesh.visible = false; hooks.before?.();
    const prevTarget = renderer.getRenderTarget(), prevShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(target); renderer.state.buffers.depth.setMask(true);
    if (renderer.autoClear === false) renderer.clear();
    renderer.render(scene, cam);
    renderer.shadowMap.autoUpdate = prevShadow; renderer.setRenderTarget(prevTarget);
    hooks.after?.(); mesh.visible = true;
  }
  return { mesh, render, dispose() { target.dispose(); material.dispose(); mesh.geometry.dispose(); } };
}
