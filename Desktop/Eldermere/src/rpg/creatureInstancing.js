// Shared InstancedMesh batches for rigid creature details (eyes, cores, horns, claws).
// The F8 A/B switch can move these same parts between individual meshes and shared batches.
export function createCreaturePartInstancing(THREE, scene, capacity = 512) {
  const batches = new Map(), handles = new Set();
  let enabled = true;
  function materialKey(m) {
    return JSON.stringify({ type: m.type, color: m.color?.getHexString?.(), emissive: m.emissive?.getHexString?.(), opacity: m.opacity, transparent: m.transparent, blending: m.blending, depthWrite: m.depthWrite, side: m.side, roughness: m.roughness, metalness: m.metalness });
  }
  function geometryKey(g) {
    return JSON.stringify({ type: g.type, parameters: g.parameters || null, positionCount: g.attributes.position?.count, indexCount: g.index?.count || 0 });
  }
  function keyFor(mesh) { return geometryKey(mesh.geometry) + "|" + materialKey(mesh.material); }
  function newBatch(source, key) {
    const instanced = new THREE.InstancedMesh(source.geometry, source.material, capacity);
    instanced.name = "creature-rigid-parts-instanced"; instanced.count = 0;
    instanced.castShadow = source.castShadow; instanced.receiveShadow = source.receiveShadow;
    instanced.frustumCulled = false; instanced.userData.noReflect = true; scene.add(instanced);
    const batch = { key, mesh: instanced, items: [], capacity };
    batches.set(key + "#" + batches.size, batch); return batch;
  }
  function addToBatch(handle) {
    const source = handle.source, key = keyFor(source);
    let batch = null;
    for (const b of batches.values()) if (b.key === key && b.items.length < b.capacity) { batch = b; break; }
    if (!batch) batch = newBatch(source, key);
    handle.batch = batch; handle.slot = batch.items.length; batch.items.push(handle); batch.mesh.count = batch.items.length;
    if (source.parent) source.parent.remove(source); source.visible = false; update(handle);
  }
  function removeFromBatch(handle) {
    const batch = handle.batch; if (!batch) return;
    const lastIndex = batch.items.length - 1, last = batch.items[lastIndex];
    if (handle.slot !== lastIndex) { batch.items[handle.slot] = last; last.slot = handle.slot; batch.mesh.setMatrixAt(handle.slot, last.scratch.multiplyMatrices(last.bone.matrixWorld, last.local)); }
    batch.items.pop(); batch.mesh.count = batch.items.length; batch.mesh.instanceMatrix.needsUpdate = true; handle.batch = null; handle.slot = -1;
  }
  function register(source, bone) {
    const handle = { source, bone, local: source.matrix.clone(), scratch: new THREE.Matrix4(), batch: null, slot: -1, active: true, visible: true };
    handles.add(handle);
    if (enabled) addToBatch(handle); else { bone.add(source); source.visible = true; }
    return handle;
  }
  const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  function updateMany(list) {
    if (!list?.length) return;
    const dirty = new Set();
    for (const handle of list) {
      if (!handle?.active || !handle.batch) continue;
      const batch = handle.batch;
      batch.mesh.setMatrixAt(handle.slot, handle.visible === false ? hiddenMatrix : handle.scratch.multiplyMatrices(handle.bone.matrixWorld, handle.local));
      dirty.add(batch);
    }
    // Mark each batch once after all of this creature's rigid details have been written.
    for (const batch of dirty) batch.mesh.instanceMatrix.needsUpdate = true;
  }
  function update(handle) { updateMany(handle ? [handle] : []); }
  function setVisible(handle, visible) {
    if (!handle?.active) return;
    handle.visible = !!visible;
    if (handle.batch) update(handle);
    else handle.source.visible = handle.visible;
  }
  function unregister(handle) {
    if (!handle?.active) return;
    removeFromBatch(handle); if (handle.source.parent) handle.source.parent.remove(handle.source); handle.active = false; handles.delete(handle);
  }
  function setEnabled(on) {
    on = !!on; if (on === enabled) return; enabled = on;
    for (const h of handles) {
      if (enabled) addToBatch(h);
      else { removeFromBatch(h); h.bone.add(h.source); h.source.visible = h.visible !== false; }
    }
  }
  return { register, update, updateMany, setVisible, unregister, setEnabled, get enabled() { return enabled; }, get counts() {
    let batchesN = 0, instancesN = 0; for (const b of batches.values()) { batchesN++; instancesN += b.items.length; }
    return { batches: batchesN, instances: instancesN };
  } };
}
