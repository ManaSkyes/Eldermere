// src/game/batInstancing.js — low-detail instanced visuals for reserve Nocturian swarm members.
// Engaged bats retain their full skinned creature model. Reserve orbit layers use this lightweight proxy instead,
// preserving each actor's AI/target/combat state while collapsing their visuals to three instanced draw calls.
export function createBatSwarmInstances(THREE, scene, capacity = 512) {
  const bodyGeo = new THREE.SphereGeometry(0.12, 7, 5);
  const headGeo = new THREE.SphereGeometry(0.075, 7, 5);
  // One scalloped membrane wing, mirrored for the other side. Flat geometry keeps distant swarm silhouettes cheap.
  const outline = [[0, 0], [0.22, 0.13], [0.48, 0.19], [0.78, 0.08], [0.92, -0.02],
    [0.72, -0.06], [0.61, 0.015], [0.49, -0.13], [0.35, -0.045], [0.22, -0.16], [0.1, -0.075]];
  const P = [], I = [];
  for (const [x, y] of outline) P.push(x, y, 0);
  for (let i = 1; i < outline.length - 1; i++) I.push(0, i, i + 1);
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  wingGeo.setIndex(I); wingGeo.computeVertexNormals();
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#21172d', roughness: 0.92, metalness: 0 });
  const wingMat = new THREE.MeshStandardMaterial({ color: '#180f24', roughness: 1, side: THREE.DoubleSide });
  const batch = (geo, mat, name, max = capacity) => {
    const mesh = new THREE.InstancedMesh(geo, mat, max);
    mesh.name = 'Instanced Nocturian swarm · ' + name;
    mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.userData.instancedBatSwarm = true; scene.add(mesh); return mesh;
  };
  const body = batch(bodyGeo, bodyMat, 'bodies');
  const head = batch(headGeo, bodyMat, 'heads');
  const wings = batch(wingGeo, wingMat, 'wings', capacity * 2);
  const root = new THREE.Object3D(), b = new THREE.Object3D(), h = new THREE.Object3D(), wl = new THREE.Object3D(), wr = new THREE.Object3D();
  root.add(b, h, wl, wr);
  b.position.set(0, 0, 0); b.scale.set(1.05, 0.85, 1.35);
  h.position.set(0, 0.055, 0.12); h.scale.set(0.72, 0.72, 0.8);
  wl.position.set(-0.075, 0.035, 0); wl.scale.set(-0.9, 0.9, 1);
  wr.position.set(0.075, 0.035, 0); wr.scale.set(0.9, 0.9, 1);
  const previous = new Set(), current = [], matrix = new THREE.Matrix4();
  function beginFrame() { current.length = 0; }
  function add(actor) {
    if (current.length >= capacity || !actor?.C?.root) return false;
    current.push(actor);
    if (!actor._batProxyHidden) {
      actor._batProxyWasVisible = actor.C.root.visible;
      actor._batProxyHidden = true;
    }
    actor.C.root.visible = false;
    return true;
  }
  function finish(time) {
    const now = new Set(current);
    for (const actor of previous) if (!now.has(actor) && actor._batProxyHidden) {
      actor.C.root.visible = actor._batProxyWasVisible !== false;
      actor._batProxyHidden = false;
    }
    body.count = head.count = current.length; wings.count = current.length * 2;
    for (let i = 0; i < current.length; i++) {
      const A = current[i], p = A.pos;
      root.position.set(p.x, p.y + (A.M.hover || 0) + (A.alt || 0), p.z);
      root.rotation.set(A.pitch || 0, A.yaw || 0, 0, 'YXZ');
      const phase = time * (5.5 + (A.rad || 1) * 0.7) + (A.phase || A.slot || i) * 2.17;
      const flap = Math.sin(phase) * 0.62;
      wl.rotation.set(0, 0, flap); wr.rotation.set(0, 0, -flap);
      root.updateMatrixWorld(true);
      body.setMatrixAt(i, b.matrixWorld); head.setMatrixAt(i, h.matrixWorld);
      wings.setMatrixAt(i * 2, wl.matrixWorld); wings.setMatrixAt(i * 2 + 1, wr.matrixWorld);
    }
    if (current.length) {
      body.instanceMatrix.needsUpdate = true; head.instanceMatrix.needsUpdate = true; wings.instanceMatrix.needsUpdate = true;
    }
    previous.clear(); for (const A of current) previous.add(A);
  }
  function dispose() {
    for (const A of previous) if (A._batProxyHidden) { A.C.root.visible = A._batProxyWasVisible !== false; A._batProxyHidden = false; }
    scene.remove(body, head, wings);
    bodyGeo.dispose(); headGeo.dispose(); wingGeo.dispose(); bodyMat.dispose(); wingMat.dispose();
  }
  return { beginFrame, add, finish, dispose, get count() { return current.length; } };
}
