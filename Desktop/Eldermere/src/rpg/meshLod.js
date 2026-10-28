// src/rpg/meshLod.js — detail levels for the character's meshes that need no second mesh.
//
// A lower level is only a different list of triangles over the SAME vertices: nearby vertices are gathered into cells
// and each cell is drawn by one of its own vertices (the one nearest the cell's middle); triangles that collapse are
// dropped. Because the vertex data is shared, everything that moves the vertices — the body sliders and morphs, the
// clothes being fitted, skinning, transformations — moves every level at once, for free.
//
//   clusterIndex(positions, index, cell)        -> Uint32Array (or Uint16Array) of the kept triangles
//   createLods(THREE, meshes, levels)           -> { set(distanceMetres) }   switches each mesh's geometry by distance

export function clusterIndex(pos, index, cell) {
  const n = pos.length / 3, used = new Uint8Array(n);
  for (let i = 0; i < index.length; i++) used[index[i]] = 1;
  const cells = new Map(), key = i => `${Math.floor(pos[i * 3] / cell)},${Math.floor(pos[i * 3 + 1] / cell)},${Math.floor(pos[i * 3 + 2] / cell)}`;
  const cellOf = new Array(n);
  for (let i = 0; i < n; i++) { if (!used[i]) continue; const k = key(i); cellOf[i] = k; let c = cells.get(k); if (!c) cells.set(k, c = { x: 0, y: 0, z: 0, n: 0, list: [] }); c.x += pos[i * 3]; c.y += pos[i * 3 + 1]; c.z += pos[i * 3 + 2]; c.n++; c.list.push(i); }
  const rep = new Int32Array(n).fill(-1);
  for (const c of cells.values()) {
    const mx = c.x / c.n, my = c.y / c.n, mz = c.z / c.n; let best = c.list[0], bd = Infinity;
    for (const i of c.list) { const d = (pos[i * 3] - mx) ** 2 + (pos[i * 3 + 1] - my) ** 2 + (pos[i * 3 + 2] - mz) ** 2; if (d < bd) { bd = d; best = i; } }
    for (const i of c.list) rep[i] = best;
  }
  const out = [], seen = new Set();
  for (let t = 0; t < index.length; t += 3) {
    const a = rep[index[t]], b = rep[index[t + 1]], c = rep[index[t + 2]];
    if (a === b || b === c || a === c) continue;
    const s = a < b ? (a < c ? (b < c ? `${a},${b},${c}` : `${a},${c},${b}`) : `${c},${a},${b}`) : (b < c ? (a < c ? `${b},${a},${c}` : `${b},${c},${a}`) : `${c},${b},${a}`);
    if (seen.has(s)) continue; seen.add(s); out.push(a, b, c);   // (the same triangle twice: kept once — both windings would z-fight)
  }
  return n > 65535 ? new Uint32Array(out) : new Uint16Array(out);
}

// meshes: a function returning the meshes to manage (the list can change: clothes put on and taken off).
// levels: [{ dist, cell }] from near to far (cell in the meshes' own units); level 0 is the full mesh.
export function createLods(THREE, meshes, levels, { minTris = 1500 } = {}) {
  let level = 0;
  function apply(m) {
    const u = m.userData;
    // the mesh's own geometry (code elsewhere may replace it: then the levels are made again from the new one)
    if (!u.lodBase || (m.geometry !== u.lodBase && m.geometry !== u.lodGeo)) { u.lodBase = m.geometry; u.lodIdx = []; u.lodGeo = null; }
    const base = u.lodBase;
    if (!base.index || base.index.count / 3 < minTris || level === 0) { if (m.geometry !== base) m.geometry = base; return; }
    let idx = u.lodIdx[level];
    if (!idx) { const pos = base.attributes.position; if (!pos) return; idx = u.lodIdx[level] = clusterIndex(pos.array, base.index.array, levels[level - 1].cell); }
    const g = u.lodGeo || (u.lodGeo = new THREE.BufferGeometry());
    for (const [k, v] of Object.entries(base.attributes)) if (g.attributes[k] !== v) g.setAttribute(k, v);   // (shared: always the live vertex data)
    if (!g.index || g.index.array !== idx) g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = base.boundingSphere; m.geometry = g;
  }
  return {
    // d: metres from the camera; a margin either side of each step, so a camera at a boundary doesn't flip levels
    set(d) {
      let L = 0; for (let i = 0; i < levels.length; i++) if (d > levels[i].dist * (i + 1 <= level ? 0.9 : 1.1)) L = i + 1;
      if (L !== level) { level = L; }
      for (const m of meshes()) apply(m);
    },
    get level() { return level; },
  };
}
