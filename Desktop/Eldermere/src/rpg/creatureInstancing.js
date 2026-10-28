// Shared InstancedMesh batches for rigid creature details (eyes, cores, horns, claws).
// Skinned body/aura meshes remain individually animated; these rigid parts can safely share draw calls.
export function createCreaturePartInstancing(THREE, scene, capacity = 512) {
  const batches = new Map();
  function materialKey(m) {
    return JSON.stringify({
      type: m.type, color: m.color?.getHexString?.(), emissive: m.emissive?.getHexString?.(),
      opacity: m.opacity, transparent: m.transparent, blending: m.blending,
      depthWrite: m.depthWrite, side: m.side, roughness: m.roughness, metalness: m.metalness
    });
  }
  function geometryKey(g) {
    return JSON.stringify({ type: g.type, parameters: g.parameters || null,
      positionCount: g.attributes.position?.count, indexCount: g.index?.count || 0 });
  }
  function keyFor(mesh) { return geometryKey(mesh.geometry) + "|" + materialKey(mesh.material); }
  function newBatch(mesh, key) {
    const geometry = mesh.geometry, material = mesh.material;
    const instanced = new THREE.InstancedMesh(geometry, material, capacity);
    instanced.name = "creature-rigid-parts-instanced";
    instanced.count = 0;
    instanced.castShadow = mesh.castShadow;
    instanced.receiveShadow = mesh.receiveShadow;
    instanced.frustumCulled = false;
    instanced.userData.noReflect = true;
    scene.add(instanced);
    const batch = { key, mesh: instanced, geometry, material, items: [], capacity };
    batches.set(key + "#" + batches.size, batch);
    return batch;
  }
  function findBatch(source) {
    const key = keyFor(source);
    for (const b of batches.values()) if (b.key === key && b.items.length < b.capacity) return b;
    return newBatch(source, key);
  }
  function register(source, bone) {
    const batch = findBatch(source);
    const handle = { batch, bone, local: source.matrix.clone(), slot: batch.items.length, active: true };
    batch.items.push(handle);
    batch.mesh.count = batch.items.length;
    update(handle);
    batch.mesh.instanceMatrix.needsUpdate = true;
    // The first geometry/material become the batch's shared resources.
    if (source.geometry !== batch.geometry) source.geometry.dispose();
    if (source.material !== batch.material) source.material.dispose();
    return handle;
  }
  function update(handle) {
    if (!handle?.active) return;
    const matrix = new THREE.Matrix4().multiplyMatrices(handle.bone.matrixWorld, handle.local);
    handle.batch.mesh.setMatrixAt(handle.slot, matrix);
    handle.batch.mesh.instanceMatrix.needsUpdate = true;
  }
  function unregister(handle) {
    if (!handle?.active) return;
    const batch = handle.batch, lastIndex = batch.items.length - 1, last = batch.items[lastIndex];
    if (handle.slot !== lastIndex) {
      batch.items[handle.slot] = last;
      last.slot = handle.slot;
      batch.mesh.setMatrixAt(handle.slot, new THREE.Matrix4().multiplyMatrices(last.bone.matrixWorld, last.local));
    }
    batch.items.pop();
    handle.active = false;
    batch.mesh.count = batch.items.length;
    batch.mesh.instanceMatrix.needsUpdate = true;
  }
  return { register, update, unregister, get counts() {
    let batchesN = 0, instancesN = 0;
    for (const b of batches.values()) { batchesN++; instancesN += b.items.length; }
    return { batches: batchesN, instances: instancesN };
  } };
}
