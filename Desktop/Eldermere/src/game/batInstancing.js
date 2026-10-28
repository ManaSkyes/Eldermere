// src/game/batInstancing.js — spatially batched low-detail visuals for Nocturian swarms.
// Actors keep individual AI, movement, targets and combat. Their proxy meshes are split into world cells so
// Three.js can frustum-cull whole cells instead of keeping one giant, always-visible swarm batch.
export function createBatSwarmInstances(THREE, scene, capacity = 128) {
  const CELL = 20;
  const bodyGeo = new THREE.SphereGeometry(0.12, 7, 5);
  const headGeo = new THREE.SphereGeometry(0.075, 7, 5);
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
  const buckets = new Map(), previous = new Set(), current = [], root = new THREE.Object3D();
  const b = new THREE.Object3D(), h = new THREE.Object3D(), wl = new THREE.Object3D(), wr = new THREE.Object3D();
  root.add(b, h, wl, wr);
  b.position.set(0, 0, 0); b.scale.set(1.05, 0.85, 1.35);
  h.position.set(0, 0.055, 0.12); h.scale.set(0.72, 0.72, 0.8);
  wl.position.set(-0.075, 0.035, 0); wl.scale.set(-0.9, 0.9, 1);
  wr.position.set(0.075, 0.035, 0); wr.scale.set(0.9, 0.9, 1);

  function makeMesh(geo, mat, name, max) {
    const mesh = new THREE.InstancedMesh(geo, mat, max);
    mesh.name = 'Instanced Nocturian swarm · ' + name;
    mesh.count = 0; mesh.frustumCulled = true;
    mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.userData.instancedBatSwarm = true;
    scene.add(mesh);
    return mesh;
  }
  function makeBucket(key, gx, gz, max = capacity) {
    return { key, gx, gz, actors: [], body: makeMesh(bodyGeo, bodyMat, key + ' bodies', max),
      head: makeMesh(headGeo, bodyMat, key + ' heads', max), wings: makeMesh(wingGeo, wingMat, key + ' wings', max * 2),
      minY: Infinity, maxY: -Infinity };
  }
  function ensureCapacity(bucket, needed) {
    if (needed <= bucket.body.instanceMatrix.count) return;
    let next = bucket.body.instanceMatrix.count;
    while (next < needed) next *= 2;
    const old = [bucket.body, bucket.head, bucket.wings];
    bucket.body = makeMesh(bodyGeo, bodyMat, bucket.key + ' bodies', next);
    bucket.head = makeMesh(headGeo, bodyMat, bucket.key + ' heads', next);
    bucket.wings = makeMesh(wingGeo, wingMat, bucket.key + ' wings', next * 2);
    for (const mesh of old) scene.remove(mesh);
  }
  function beginFrame() { current.length = 0; }
  function add(actor) {
    if (!actor?.C?.root) return false;
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
    for (const bucket of buckets.values()) { bucket.actors.length = 0; bucket.minY = Infinity; bucket.maxY = -Infinity; }
    for (const actor of current) {
      const gx = Math.floor(actor.pos.x / CELL), gz = Math.floor(actor.pos.z / CELL), key = gx + ',' + gz;
      let bucket = buckets.get(key);
      if (!bucket) { bucket = makeBucket(key, gx, gz); buckets.set(key, bucket); }
      bucket.actors.push(actor);
      const y = actor.pos.y + (actor.M.hover || 0) + (actor.alt || 0);
      bucket.minY = Math.min(bucket.minY, y); bucket.maxY = Math.max(bucket.maxY, y);
    }
    for (const bucket of buckets.values()) {
      const n = bucket.actors.length;
      if (!n) {
        scene.remove(bucket.body, bucket.head, bucket.wings);
        buckets.delete(bucket.key);
        continue;
      }
      ensureCapacity(bucket, n);
      bucket.body.count = bucket.head.count = n; bucket.wings.count = n * 2;
      // Keep each cell's conservative world-space bounds tight enough for useful frustum culling.
      const cx = (bucket.gx + 0.5) * CELL, cz = (bucket.gz + 0.5) * CELL;
      const cy = (bucket.minY + bucket.maxY) * 0.5;
      const radius = Math.hypot(CELL * 0.7072, (bucket.maxY - bucket.minY) * 0.5) + 2;
      for (const mesh of [bucket.body, bucket.head, bucket.wings]) {
        mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, cy, cz), radius);
      }
      for (let i = 0; i < n; i++) {
        const A = bucket.actors[i], p = A.pos;
        root.position.set(p.x, p.y + (A.M.hover || 0) + (A.alt || 0), p.z);
        root.rotation.set(A.pitch || 0, A.yaw || 0, 0, 'YXZ');
        const phase = time * (5.5 + (A.rad || 1) * 0.7) + (A.phase || A.slot || i) * 2.17;
        const flap = Math.sin(phase) * 0.62;
        wl.rotation.set(0, 0, flap); wr.rotation.set(0, 0, -flap);
        root.updateMatrixWorld(true);
        bucket.body.setMatrixAt(i, b.matrixWorld); bucket.head.setMatrixAt(i, h.matrixWorld);
        bucket.wings.setMatrixAt(i * 2, wl.matrixWorld); bucket.wings.setMatrixAt(i * 2 + 1, wr.matrixWorld);
      }
      bucket.body.instanceMatrix.needsUpdate = true;
      bucket.head.instanceMatrix.needsUpdate = true;
      bucket.wings.instanceMatrix.needsUpdate = true;
    }
    previous.clear(); for (const actor of current) previous.add(actor);
  }
  function dispose() {
    for (const actor of previous) if (actor._batProxyHidden) {
      actor.C.root.visible = actor._batProxyWasVisible !== false; actor._batProxyHidden = false;
    }
    for (const bucket of buckets.values()) scene.remove(bucket.body, bucket.head, bucket.wings);
    buckets.clear();
    bodyGeo.dispose(); headGeo.dispose(); wingGeo.dispose(); bodyMat.dispose(); wingMat.dispose();
  }
  return { beginFrame, add, finish, dispose, get count() { return current.length; }, get batches() {
    let n = 0; for (const bucket of buckets.values()) if (bucket.actors.length) n += 3; return n;
  } };
}
