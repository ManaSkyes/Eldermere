// src/game/testGrounds.js — a flat field with labeled obstacles for testing movement.
import { cliffShapes, buildCliff } from './cliff.js';
import { testRouteShapes } from './traverse.js';
import { courseShapes } from './course.js';
// Every obstacle is a physics shape (src/game/physics.js) and gets a matching mesh.

const box = (min, max, color, label) => ({ type: 'box', min, max, color, label });
const ramp = (min, max, rise, color, label) => ({ type: 'ramp', min, max, rise, color, label });
const on = (shape, surface) => ({ ...shape, surface });      // a surface other than stone (src/data/surfaces.js)

export function testGroundsShapes() {
  const S = [];
  // the field (everything else sounds like stone): 300 × 300 m, in pieces around a lake hole in the east
  for (const [min, max] of [[[-150, -9, -150], [150, 0, -40]], [[-150, -9, 40], [150, 0, 150]], [[-150, -9, -40], [70, 0, 40]], [[110, -9, -40], [150, 0, 40]]])
    S.push({ ...box(min, max, '#7f9a6a'), surface: 'grass' });
  // the lake: 40 × 80 m (about 19 pools), 7.75 m deep, with a beach sloping in along its west side
  S.push(on(box([70, -9, -40], [110, -8, 40], '#8a8a70'), 'sand'));
  S.push(on(ramp([70, -8, -40], [82, 0, 40], '-x', '#c8b98a', 'Lake: 40 × 80 m, 7.75 m deep'), 'sand'));
  // steps: what you can and can't walk onto
  S.push(box([4, 0, -8], [6, 0.3, -6], '#c9b38a', '0.3 m step'));
  S.push(box([7, 0, -8], [9, 0.4, -6], '#c9b38a', '0.4 m step'));
  S.push(box([10, 0, -8], [12, 0.55, -6], '#b98e72', '0.55 m: jump'));
  S.push(box([13, 0, -8], [15, 1.0, -6], '#a8775c', '1 m crate: jump'));
  S.push(box([16, 0, -8], [18, 1.6, -6], '#8e5f4a', '1.6 m: too high'));
  // stairs up to a platform
  for (let i = 0; i < 10; i++) S.push(box([-6, 0, -6 - i * 0.3], [-3, 0.2 * (i + 1), -5.7 - i * 0.3], '#b7b2a6', i === 0 ? 'Stairs: 0.2 m steps' : null));
  S.push(box([-8, 0, -14], [-1, 2.0, -9], '#a9a49a', 'Platform 2 m'));
  // ramps
  S.push(ramp([0, 0, 6], [4, Math.tan(20 * Math.PI / 180) * 4, 9], '+x', '#d6c08c', 'Ramp 20°'));
  S.push(box([4, 0, 6], [6, Math.tan(20 * Math.PI / 180) * 4, 9], '#cdb886'));
  S.push(ramp([0, 0, 11], [3, Math.tan(40 * Math.PI / 180) * 3, 14], '+x', '#c6a878', 'Ramp 40°'));
  S.push(box([3, 0, 11], [5, Math.tan(40 * Math.PI / 180) * 3, 14], '#bc9f72'));
  S.push(ramp([0, 0, 16], [2, Math.tan(55 * Math.PI / 180) * 2, 19], '+x', '#b08a64', 'Ramp 55°: too steep'));
  S.push(box([2, 0, 16], [4, Math.tan(55 * Math.PI / 180) * 2, 19], '#a6825e'));
  // a low beam to crouch under, and a gap to jump
  S.push(box([-12, 0, 4], [-11.6, 2.2, 4.4], '#8a8070')); S.push(box([-12, 0, 7.6], [-11.6, 2.2, 8], '#8a8070'));
  S.push(box([-12, 1.3, 4], [-11.6, 2.2, 8], '#9c907c', 'Low beam 1.3 m: crouch'));
  S.push(box([-14, 0, 10], [-12, 0.8, 16], '#b5a68c', 'Gap 3.2 m: sprint and jump'));
  S.push(box([-8.8, 0, 10], [-6.8, 0.8, 16], '#b5a68c'));
  // walls and pillars to slide along
  S.push(box([-20, 0, -20], [20, 3, -19], '#c8c1b4', 'Wall'));
  for (let i = 0; i < 6; i++) S.push(box([-18 + i * 3, 0, 20], [-17.4 + i * 3, 3, 20.6], '#bfb6a6', i === 0 ? 'Pillars' : null));
  // surface samples: a strip of each material to walk on and hear
  ['wood', 'metal', 'sand', 'mud', 'stone'].forEach((m, i) => S.push(on(box([-6 + i * 3, 0, 26], [-3.5 + i * 3, 0.05, 32], ['#9c7a56', '#8a8f96', '#d8c79a', '#5f4e3a', '#a9a49a'][i], `${m[0].toUpperCase() + m.slice(1)} floor`), m)));
  // athletics course (east of the steps)
  S.push(on(box([24, 0, -2.1], [28, 0.9, -1.9], '#8a8f96', 'Rail 0.9 m (metal): run and jump to vault'), 'metal'));
  S.push(box([24, 0, 2], [28, 0.95, 4], '#b5a68c', 'Block 0.95 m: vault onto'));
  S.push(box([24, 0, 7], [28, 1.65, 10], '#a8946e', 'Ledge 1.65 m: jump at it to clamber'));
  S.push(box([24, 0, 13], [28, 2.1, 16], '#9a8462', 'Ledge 2.1 m: quick climb'));
  S.push(box([24, 0, 19], [28, 3.2, 23], '#948062', 'Block 3.2 m: sprint at it holding jump (wall run up, then clamber)'));
  S.push(box([31.4, 0, -6], [31.8, 6, 0], '#bdb3a2', 'Shaft: wall jump between'));
  S.push(box([33.4, 0, -6], [33.8, 6, 0], '#bdb3a2'));
  S.push(box([31.8, 4.6, -6], [33.4, 4.8, -5], '#a8946e'));                                          // a ledge high in the shaft
  S.push(box([37, 0, -12], [38.4, 2.6, 14], '#c8c1b4', 'Long wall 2.6 m: sprint alongside and jump to wall run; hold jump to grab the top'));
  // climbing walls: 8 m tall, 1 m deep (room to stand on top), one of each climbable surface
  [['climbStone', '#8c8275', 'Rough stone'], ['vines', '#4f7a3a', 'Vines'], ['wetStone', '#4a555c', 'Wet stone'], ['ice', '#cfe6f3', 'Ice']].forEach(([m, col, name], i) =>
    S.push(on(box([52, 0, -22 + i * 6], [53, 8, -18 + i * 6], col, `Climbing wall: ${name} (8 m). Jump at it and hold jump`), m)));
  // a chimney: two rough-stone walls facing each other, 2.5 m apart (Push off from one, catch the other)
  S.push(on(box([52, 0, 4], [53, 8, 8], '#8c8275', 'Chimney: push off to the facing wall'), 'climbStone'));
  S.push(on(box([55.5, 0, 4], [56.5, 8, 8], '#8c8275'), 'climbStone'));
  // cover in front of the sentry (it stands at z 40, facing the start): hide from its sight
  S.push(box([-4, 0, 33], [-1, 1.2, 33.4], '#a39a8a', 'Low cover 1.2 m: crouch behind it'));
  S.push(box([1, 0, 33], [4, 2.5, 33.4], '#a39a8a', 'Tall cover 2.5 m'));
  // thin edges to hang from (jump at them without moving forward and hold jump)
  S.push(box([41, 0, -12], [41.25, 2.8, -4], '#b9ad98', 'Thin wall 2.8 m: hang, shimmy, climb over'));
  S.push(box([44.4, 0, -12], [45.4, 6, -4], '#c4bcae', 'Lip at 3 m on a 6 m wall: hang and shimmy'));
  S.push(box([44.1, 2.85, -12], [44.4, 3, -4], '#8f8574'));
  // a pool: 1 m walls, 2.4 m high, around a deep end, a ramp and a shallow shelf (water in testGroundsWater)
  S.push(box([-33, 0, -15], [-19, 2.4, -14], '#9aa3a8', 'Pool: climb the stairs, jump in'));
  S.push(box([-33, 0, 0], [-19, 2.4, 1], '#9aa3a8'));
  S.push(box([-33, 0, -14], [-32, 2.4, 0], '#9aa3a8'));
  S.push(box([-20, 0, -14], [-19, 2.4, 0], '#9aa3a8'));
  S.push(ramp([-32, 0, -6], [-20, 1.4, -3], '+z', '#7f8f96', 'Shallows: wade'));
  S.push(box([-32, 0, -3], [-20, 1.4, 0], '#7f8f96'));
  for (let i = 0; i < 8; i++) S.push(on(box([-28, 0, 1 + i * 0.35], [-24, 2.4 - i * 0.3, 1.35 + i * 0.35], '#9c7a56', i === 7 ? 'Pool stairs (wood)' : null), 'wood'));
  // long slopes for sliding: 30 m runs at 10°, 20°, 30° and 40°, rising north (walk up, turn, slide down)
  [10, 20, 30, 40].forEach((deg, i) => {
    const x0 = -120 + i * 14, rise = 30 * Math.tan(deg * Math.PI / 180);
    S.push(ramp([x0, 0, 60], [x0 + 10, rise, 90], '+z', ['#c9c2a8', '#bdb59a', '#b0a78c', '#a3997e'][i], `Slope ${deg}°: run, crouch to slide`));
    if (i === 0) S.push(on(ramp([x0 - 14, 0, 60], [x0 - 4, rise, 90], '+z', '#6b5a44', 'Mud slope 10°: slides further'), 'mud'));
    S.push(box([x0, 0, 90], [x0 + 10, rise, 96], '#9a927a'));                                   // a landing at the top
  });
  // a low wall around the field's edge
  for (const [min, max] of [[[-150, 0, -150], [150, 1.2, -149.5]], [[-150, 0, 149.5], [150, 1.2, 150]], [[-150, 0, -150], [-149.5, 1.2, 150]], [[149.5, 0, -150], [150, 1.2, 150]]])
    S.push(box(min, max, '#a9a08c'));
  S.push(...courseShapes());          // the obstacle course (src/game/course.js)
  S.push(...testRouteShapes());       // the sneak course's roofs, posts and wall (routes in src/game/traverse.js)
  S.push(...cliffShapes());           // a natural cliff face to climb (src/game/cliff.js)
  return S;
}

// Water volumes: physics and swimming apply inside (src/game/controller.js). Not solid.
export function testGroundsWater() {
  return [{ min: [-32, 0, -14], max: [-20, 2.1, 0], label: 'Deep end 2.1 m: swim' },
          { min: [70, -8, -40], max: [110, -0.25, 40], label: 'Lake' }];
}

// Meshes for the shapes, with a soft grid on the field and floating labels.
export function buildTestGrounds(THREE, scene, shapes, decor = [], pathSurfaces = [], groundSplat = null, { field = true } = {}) {
  const grid = document.createElement('canvas'); grid.width = grid.height = 256;
  const g = grid.getContext('2d'); g.fillStyle = '#7f9a6a'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2; g.strokeRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1; for (let i = 64; i < 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  const gridTex = new THREE.CanvasTexture(grid); gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping; gridTex.repeat.set(60, 60); gridTex.anisotropy = 8;
  gridTex.encoding = THREE.sRGBEncoding;
  if (field) buildCliff(THREE, scene);                                                     // (the test grounds' cliff: not when a map is played)
  // dungeon stone, hand-painted in the PS2-era style (paintStone / paintFlags below): warm blocks with a lit top
  // edge and a shadowed bottom, soft brush dabs, chips and the odd crack. 512 px covers 6 m.
  const stoneCv = document.createElement('canvas'); stoneCv.width = stoneCv.height = 512; paintStone(stoneCv.getContext('2d'));
  const stoneTex = new THREE.CanvasTexture(stoneCv); stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping; stoneTex.encoding = THREE.sRGBEncoding; stoneTex.anisotropy = 4;
  // Dungeon shapes are merged into one mesh per 32 m block (all sharing one material and one texture), so a big town
  // is a hundred-odd draw calls, not thousands, and whole blocks drop out when they're off screen.
  const chunks = new Map();
  for (const s of decor) { const k = `${Math.floor((s.min[0] + s.max[0]) / 64)},${Math.floor((s.min[1] + s.max[1]) / 40)},${Math.floor((s.min[2] + s.max[2]) / 64)}`; if (!chunks.has(k)) chunks.set(k, []); chunks.get(k).push(s); }   // trim: drawn with its cell, not solid
  for (const s of shapes) {
    if (s.hidden) continue;           // drawn some other way (the cliff face is one mesh)
    if (s.dungeon && s.type !== 'ramp') {
      const k = `${Math.floor((s.min[0] + s.max[0]) / 64)},${Math.floor((s.min[1] + s.max[1]) / 40)},${Math.floor((s.min[2] + s.max[2]) / 64)}`;
      if (!chunks.has(k)) chunks.set(k, []); chunks.get(k).push(s); continue;
    }
    const sx = s.max[0] - s.min[0], sy = s.max[1] - s.min[1], sz = s.max[2] - s.min[2];
    let geo;
    if (s.type === 'ramp') {
      // a wedge: full height at the rise end, zero at the other
      const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(1, 0); shape.lineTo(1, 1); shape.lineTo(0, 0);
      geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
      geo.translate(-0.5, 0, -0.5);
      const rot = { '+x': 0, '-x': Math.PI, '+z': -Math.PI / 2, '-z': Math.PI / 2 }[s.rise];
      geo.rotateY(rot);
      geo.scale(sx, sy, sz);
      geo.translate(0, -sy / 2, 0);
    } else geo = new THREE.BoxGeometry(sx, sy, sz);
    const isField = s.surface === 'grass';
    let map = null; if (isField) { map = gridTex.clone(); map.needsUpdate = true; map.repeat.set(sx / 2, sz / 2); }
    else if (s.dungeon) { map = stoneTex.clone(); map.needsUpdate = true; map.repeat.set(Math.max(0.3, Math.max(sx, sz) / 3), Math.max(0.3, Math.max(sy, Math.min(sx, sz)) / 3)); }
    const mat = new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.9, map });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((s.min[0] + s.max[0]) / 2, (s.min[1] + s.max[1]) / 2, (s.min[2] + s.max[2]) / 2);
    mesh.castShadow = !isField; mesh.receiveShadow = true;
    scene.add(mesh);
    if (s.label) scene.add(label(THREE, s.label, [(s.min[0] + s.max[0]) / 2, s.max[1] + 0.7, (s.min[2] + s.max[2]) / 2]));
  }
  const tex = stoneTex; tex.repeat.set(1, 1);
  const dungeonMat = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.9 }); dungeonMat.extensions = { derivatives: true };   // (relief from the textures: dFdx)
  // floors get their own pattern: big irregular flagstones (512 px = 6 m), split at random
  const flagCv = document.createElement('canvas'); flagCv.width = flagCv.height = 512;
  paintFlags(flagCv.getContext('2d'));
  const flagTex = new THREE.CanvasTexture(flagCv); flagTex.wrapS = flagTex.wrapT = THREE.RepeatWrapping; flagTex.encoding = THREE.sRGBEncoding; flagTex.anisotropy = 4;
  // the town's materials, hand-painted the same way (paintCobbles and the rest, below)
  const canvasTex = (paint, size = 256) => { const cv = document.createElement('canvas'); cv.width = cv.height = size; paint(cv.getContext('2d'), size); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t; };
  const townTex = { cobbleMap: canvasTex(paintCobbles), tileMap: canvasTex(paintTiles), plasterMap: canvasTex(paintPlaster), woodMap: canvasTex(paintWood), brickMap: canvasTex(paintBrick) };
  // the ground's paint (src/game/ground.js): 1 texel per square metre — surface kind, moisture, temperature, wetness
  let splatTex = null, splatRect = new THREE.Vector4(0, 0, 1, 1);
  if (groundSplat) { splatTex = new THREE.DataTexture(groundSplat.data, groundSplat.w, groundSplat.h, THREE.RGBAFormat); splatTex.magFilter = splatTex.minFilter = THREE.NearestFilter; splatTex.needsUpdate = true; splatRect.set(groundSplat.x, groundSplat.z, groundSplat.w, groundSplat.h); }
  else { splatTex = new THREE.DataTexture(new Uint8Array([0, 128, 128, 0]), 1, 1, THREE.RGBAFormat); splatTex.needsUpdate = true; }
  dungeonMat.onBeforeCompile = sh => { sh.uniforms.flagMap = { value: flagTex }; sh.uniforms.splatMap = { value: splatTex }; sh.uniforms.splatRect = { value: splatRect }; for (const [k, v] of Object.entries(townTex)) sh.uniforms[k] = { value: v }; weatherStone(sh); };
  const out = [];
  // Each chunk's mesh sits at its own middle (not the world origin): three.js draws solid things nearest first
  // by that position, so the walls in front hide what's behind before it costs any lighting. With every
  // chunk at the origin they were drawn in no particular order, and a long hall shaded the same pixels many times.
  for (const list of chunks.values()) {
    const geo = mergeBoxes(THREE, list), mid = geo.boundingBox.getCenter(new THREE.Vector3());
    geo.translate(-mid.x, -mid.y, -mid.z); geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, dungeonMat); m.position.copy(mid); m.castShadow = m.receiveShadow = true; m.userData.probe = 'buildings'; scene.add(m); out.push(m);
  }
  // drawn roads (src/game/pathBuild.js): one mesh per cell; each pixel picks cobbles, gutter, kerb or paving from
  // its distance to the carriageway's edge (pd), so the edges follow the curve exactly
  // drawn roads (src/game/pathBuild.js): one mesh per cell, in the same material as everything else (texture 9:
  // each pixel picks cobbles, gutter, kerb or paving from its distance to the carriageway's edge, pd), so they
  // match the grid streets exactly
  // merged into 64 m blocks (each block one mesh, one draw call): there are hundreds of ground and road pieces on a big
  // map, and drawing each on its own cost more than drawing their triangles
  const blocks = new Map();
  for (const sf of pathSurfaces) {
    const P = sf.positions, n = P.length / 3; if (!n) continue; let x = 0, z = 0; for (let i = 0; i < n; i += Math.max(1, n >> 4)) { x += P[i * 3]; z += P[i * 3 + 2]; }
    const c = Math.ceil(n / Math.max(1, n >> 4)), key = `${Math.floor(x / c / 64)},${Math.floor(z / c / 64)}`; (blocks.get(key) || blocks.set(key, []).get(key)).push(sf);
  }
  for (const list of blocks.values()) {
    let nv = 0, ni = 0; for (const sf of list) { const n = sf.positions.length / 3; nv += n; ni += sf.index ? sf.index.length : n; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), pd = new Float32Array(nv), tex = new Float32Array(nv), I = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let ov = 0, oi = 0;
    for (const sf of list) {
      const n = sf.positions.length / 3; pos.set(sf.positions, ov * 3); nor.set(sf.normals, ov * 3); if (sf.pd) pd.set(sf.pd, ov); tex.fill(sf.tex ?? 9, ov, ov + n);
      if (sf.index) for (let k = 0; k < sf.index.length; k++) I[oi++] = sf.index[k] + ov; else for (let k = 0; k < n; k++) I[oi++] = k + ov;
      ov += n;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('pd', new THREE.BufferAttribute(pd, 1)); geo.setIndex(new THREE.BufferAttribute(I, 1));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nv * 3).fill(1), 3)); geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(nv * 2), 2)); geo.setAttribute('tex', new THREE.BufferAttribute(tex, 1));
    geo.computeBoundingBox();
    const mid = geo.boundingBox.getCenter(new THREE.Vector3()); geo.translate(-mid.x, -mid.y, -mid.z); geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, dungeonMat); m.position.copy(mid); m.receiveShadow = true; m.userData.probe = 'ground'; scene.add(m); out.push(m);   // receives shadows, does not cast them (no acne on the risers)
  }
  return { dungeonChunks: out };
}
// Many boxes as one geometry: positions, normals, colours, and texture coordinates in metres / 6 on each face
// (so the stone blocks are the same size everywhere).
function mergeBoxes(THREE, list) {
  // Boxes, plus two prism shapes for trim: 'gable' (a pitched roof: ridge along `axis` at the top, sloping down to
  // both long sides; its end triangles can have their own colour and texture) and 'wedge' (a slab rising toward
  // the `high` side: awnings, lean-tos). Each vertex carries `tex`, which texture it's painted with (see weatherStone).
  const P = [], N = [], U = [], Cl = [], T = [];
  const c = new THREE.Color(), va = new THREE.Vector3(), vb = new THREE.Vector3(), vn = new THREE.Vector3();
  const tri = (a, b, d, col, tex, center) => {
    va.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); vb.set(d[0] - a[0], d[1] - a[1], d[2] - a[2]); vn.crossVectors(va, vb); if (vn.lengthSq() < 1e-10) return; vn.normalize();   // (a squashed, zero-area face would have no normal: drawn black)
    const mx = (a[0] + b[0] + d[0]) / 3 - center[0], my = (a[1] + b[1] + d[1]) / 3 - center[1], mz = (a[2] + b[2] + d[2]) / 3 - center[2];
    if (vn.x * mx + vn.y * my + vn.z * mz < 0) { vn.negate(); [b, d] = [d, b]; }   // keep it facing outward
    c.set(col);
    for (const q of [a, b, d]) { P.push(q[0], q[1], q[2]); N.push(vn.x, vn.y, vn.z); U.push(0, 0); Cl.push(c.r, c.g, c.b); T.push(tex); }
  };
  const quad = (a, b, d, e, col, tex, center) => { tri(a, b, d, col, tex, center); tri(a, d, e, col, tex, center); };
  for (const s of list) {
    const [x0, y0, z0] = s.min, [x1, y1, z1] = s.max, center = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], col = s.color || '#888888', tex = s.tex || 0;
    if (s.type === 'tris') {                                          // a convex solid as triangles (turned props); faces kept outward from its middle
      const Q = s.pts, ctr = [Q.reduce((a, q) => a + q[0], 0) / Q.length, Q.reduce((a, q) => a + q[1], 0) / Q.length, Q.reduce((a, q) => a + q[2], 0) / Q.length];
      for (let n = 0; n + 2 < Q.length; n += 3) tri(Q[n], Q[n + 1], Q[n + 2], col, tex, ctr);
      continue;
    }
    if (s.type === 'poly') {                                          // a flat-lying decoration (road details): facing up
      const P = s.pts, cx = P.reduce((a, q) => a + q[0], 0) / P.length, cz = P.reduce((a, q) => a + q[2], 0) / P.length, cy = P.reduce((a, q) => a + q[1], 0) / P.length - 5;
      for (let n = 1; n < P.length - 1; n++) tri(P[0], P[n], P[n + 1], col, tex, [cx, cy, cz]);
      continue;
    }
    if (s.type === 'gable') {
      const ec = s.endColor || col, et = s.endTex ?? tex, ctr = [center[0], y0 + (y1 - y0) / 3, center[2]];
      if (s.axis === 'x') { const zm = (z0 + z1) / 2;
        quad([x0, y0, z0], [x1, y0, z0], [x1, y1, zm], [x0, y1, zm], col, tex, ctr); quad([x0, y0, z1], [x1, y0, z1], [x1, y1, zm], [x0, y1, zm], col, tex, ctr);
        quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], col, tex, ctr);
        tri([x0, y0, z0], [x0, y0, z1], [x0, y1, zm], ec, et, ctr); tri([x1, y0, z0], [x1, y0, z1], [x1, y1, zm], ec, et, ctr);
      } else { const xm = (x0 + x1) / 2;
        quad([x0, y0, z0], [x0, y0, z1], [xm, y1, z1], [xm, y1, z0], col, tex, ctr); quad([x1, y0, z0], [x1, y0, z1], [xm, y1, z1], [xm, y1, z0], col, tex, ctr);
        quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], col, tex, ctr);
        tri([x0, y0, z0], [x1, y0, z0], [xm, y1, z0], ec, et, ctr); tri([x0, y0, z1], [x1, y0, z1], [xm, y1, z1], ec, et, ctr);
      }
      continue;
    }
    if (s.type === 'pyramid') {                                       // a hipped/pointed roof: four slopes up to a point (or a short ridge)
      const xm = (x0 + x1) / 2, zm = (z0 + z1) / 2, ctr = [center[0], y0 + (y1 - y0) / 3, center[2]];
      const rx = Math.max(0, (x1 - x0) - (z1 - z0)) / 2, rz = Math.max(0, (z1 - z0) - (x1 - x0)) / 2;   // a long footprint gets a ridge
      const a = [xm - rx, y1, zm - rz], b = [xm + rx, y1, zm + rz];
      const c00 = [x0, y0, z0], c10 = [x1, y0, z0], c11 = [x1, y0, z1], c01 = [x0, y0, z1];
      if (rx > 0) { tri(c00, c01, a, col, tex, ctr); tri(c10, c11, b, col, tex, ctr); quad(c00, c10, b, a, col, tex, ctr); quad(c01, c11, b, a, col, tex, ctr); }
      else if (rz > 0) { tri(c00, c10, a, col, tex, ctr); tri(c01, c11, b, col, tex, ctr); quad(c00, c01, b, a, col, tex, ctr); quad(c10, c11, b, a, col, tex, ctr); }
      else { tri(c00, c10, a, col, tex, ctr); tri(c10, c11, a, col, tex, ctr); tri(c11, c01, a, col, tex, ctr); tri(c01, c00, a, col, tex, ctr); }
      quad(c00, c10, c11, c01, col, tex, ctr);
      continue;
    }
    if (s.type === 'wedge') {
      // corners at the low edge are at y0 + (a little thickness), rising to y1 at the high side
      const th = s.thick ?? 0.12, h = s.high, ctr = center;
      const top = (x, z) => { const k = h === '+x' ? (x - x0) / (x1 - x0) : h === '-x' ? (x1 - x) / (x1 - x0) : h === '+z' ? (z - z0) / (z1 - z0) : (z1 - z) / (z1 - z0); return y0 + th + k * (y1 - y0 - th); };
      const bot = (x, z) => top(x, z) - th;
      const cs = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
      const T4 = cs.map(([x, z]) => [x, top(x, z), z]), B4 = cs.map(([x, z]) => [x, bot(x, z), z]);
      quad(T4[0], T4[1], T4[2], T4[3], col, tex, ctr); quad(B4[0], B4[1], B4[2], B4[3], col, tex, ctr);
      for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; quad(T4[k], T4[k2], B4[k2], B4[k], col, tex, ctr); }
      continue;
    }
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).toNonIndexed();
    const GP = g.attributes.position.array, GN = g.attributes.normal.array, GU = g.attributes.uv.array, sx = x1 - x0, sy = y1 - y0, sz = z1 - z0;
    c.set(col);
    for (let v = 0; v < GP.length / 3; v++) {
      const f = Math.floor(v / 6);                                    // faces: +x −x +y −y +z −z (6 vertices each)
      P.push(GP[v * 3] + center[0], GP[v * 3 + 1] + center[1], GP[v * 3 + 2] + center[2]); N.push(GN[v * 3], GN[v * 3 + 1], GN[v * 3 + 2]);
      const [du, dv] = f < 2 ? [sz, sy] : f < 4 ? [sx, sz] : [sx, sy];
      U.push(GU[v * 2] * du / 6, GU[v * 2 + 1] * dv / 6); Cl.push(c.r, c.g, c.b); T.push(tex);
    }
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); geo.setAttribute('color', new THREE.Float32BufferAttribute(Cl, 3));
  geo.setAttribute('tex', new THREE.Float32BufferAttribute(T, 1));
  geo.computeBoundingSphere(); geo.computeBoundingBox();
  return geo;
}
function label(THREE, text, pos) {
  const cv = document.createElement('canvas'), ctx = cv.getContext('2d'); ctx.font = '600 44px Georgia';
  cv.width = Math.ceil(ctx.measureText(text).width) + 40; cv.height = 70;
  ctx.font = '600 44px Georgia'; ctx.fillStyle = 'rgba(20,22,50,0.72)'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = '#f2eee6'; ctx.textBaseline = 'middle'; ctx.fillText(text, 20, 37);
  const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  sp.scale.set(cv.width / cv.height * 0.45, 0.45, 1); sp.position.set(...pos);
  return sp;
}

// Variety for dungeon stone, worked out per pixel from where it is in the world, so it never repeats and the
// bigger a surface is, the more of it you see:
//   broad patches (about 7 m across) lighter and darker, warmer and cooler; smaller mottling (about 2 m)
//   walls: grime and damp creeping up from the floor
//   floors: flagstones (their own pattern) instead of wall blocks
//   floors: worn paths (lighter) and dark stains
//   ceilings: darker, sooty
function weatherStone(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float tex; attribute float pd; varying vec3 vStoneW; varying vec3 vStoneN; varying float vTex; varying float vPd;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvStoneW = (modelMatrix * vec4(transformed, 1.0)).xyz; vStoneN = normalize(mat3(modelMatrix) * objectNormal); vTex = tex; vPd = pd;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
#define WX_HAS_SNOWK
float wxSnowK = 1.0, sRock = 0.0;                                                  // how much snow this material keeps (src/gfx/weathering.js): streets less, open ground more
varying vec3 vStoneW; varying vec3 vStoneN; varying float vTex; varying float vPd; uniform sampler2D flagMap, cobbleMap, tileMap, plasterMap, woodMap, brickMap, splatMap; uniform vec4 splatRect;
// relief and roughness from the painted textures themselves: a texel against its blurred neighbourhood (a coarse mip)
// says whether it stands proud (a cobble's face, a brick) or sits in a gap (grout, a crack). sDet: that difference;
// sBase: the material's own roughness. Proud bits are a little smoother (worn), gaps rougher, and the difference
// bumps the lighting so every surface gets depth.
float sDet = 0.0;
float sLum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 tSam(sampler2D m, vec2 uv) { vec3 c = mapTexelToLinear(texture2D(m, uv)).rgb; sDet = sLum(c) - sLum(mapTexelToLinear(texture2D(m, uv, 4.0)).rgb); return c; }
vec3 sBump(vec3 p, vec3 nrm, vec2 dH, float fd) { vec3 sx = dFdx(p), sy = dFdy(p), r1 = cross(sy, nrm), r2 = cross(nrm, sx); float det = dot(sx, r1) * fd;
  vec3 o = abs(det) * nrm - sign(det) * (dH.x * r1 + dH.y * r2); return dot(o, o) > 1e-12 ? normalize(o) : nrm; }
float sHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float sNoise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sHash(i), sHash(i + vec3(1,0,0)), f.x), mix(sHash(i + vec3(0,1,0)), sHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(sHash(i + vec3(0,0,1)), sHash(i + vec3(1,0,1)), f.x), mix(sHash(i + vec3(0,1,1)), sHash(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
    .replace('#include <map_fragment>', `#include <map_fragment>
{ vec3 w = vStoneW; vec3 n = normalize(vStoneN);
  // The noise is sampled in the face's own plane: the coordinate along its normal is held at a constant, so a
  // floor at y 10 (or a wall at x 130) never sits exactly on the noise grid, where rounding flickers between
  // two cells and draws stripes. (The ground floor at y 0 got away with it; every other layer didn't.)
  vec3 wn = w; if (abs(n.x) > 0.5) wn.x = 1.37; else if (abs(n.y) > 0.5) wn.y = 1.37; else wn.z = 1.37;
  float big = sNoise(wn / 7.0), mid = sNoise(wn / 2.0 + 17.3), fine = sNoise(wn * 1.3 + 4.1);
  float tone = 0.72 + 0.48 * big + 0.2 * (mid - 0.5) + 0.06 * (fine - 0.5);
  vec3 tint = mix(vec3(0.94, 0.98, 1.04), vec3(1.06, 1.0, 0.9), sNoise(wn / 11.0 + 3.7));
  float h = mod(w.y + 0.25, 10.0);                                     // height above this layer's floor
  // town materials (tex 1–7), painted in world space so any shape takes them:
  //   1 cobbles · 2 roof tiles (rows along x) · 7 roof tiles (rows along z) · 3 plaster · 4 wood · 5 brick · 6 plain (metal, glass) · 8 paving · 9 drawn road · 10 terrain
  bool town = vTex > 0.5;
  if (town) wxSnowK = vTex < 1.5 ? 0.6 : vTex > 9.5 ? 1.1 : (vTex > 7.5 && vTex < 8.5) ? 0.7 : (vTex > 8.5 && vTex < 9.5) ? (vPd - floor((vPd + 50.0) / 100.0) * 100.0 < -0.45 ? (floor((vPd + 50.0) / 100.0) > 1.5 && floor((vPd + 50.0) / 100.0) < 3.5 ? 0.75 : 0.4) : 0.7) : 1.0;   // (cobbles, paving, road carriageway / dirt track, pavement)
  #ifdef USE_MAP
    if (!town) sDet = sLum(texelColor.rgb) - sLum(mapTexelToLinear(texture2D(map, vUv, 4.0)).rgb);
  #endif
  if (town) {
    vec2 tuv = abs(n.y) > 0.5 ? w.xz : (abs(n.x) > abs(n.z) ? w.zy : w.xy);
    vec3 tc = vec3(1.0);
    if (vTex < 1.5) tc = 0.4 + 0.6 * tSam(cobbleMap, tuv / 2.6);
    else if (vTex < 2.5) tc = tSam(tileMap, abs(n.y) > 0.3 ? w.xz / 3.0 : tuv / 3.0);
    else if (vTex < 3.5) tc = tSam(plasterMap, tuv / 4.0);
    else if (vTex < 4.5) tc = tSam(woodMap, tuv / 2.0);
    else if (vTex < 5.5) tc = tSam(brickMap, tuv / 3.0);
    else if (vTex > 5.5 && vTex < 6.5) {                              // 6: plain (props, metal, painted wood): no picture, so a fine grain of its own — wear,
      float g1 = sNoise(w * 3.3 + 1.7), g2 = sNoise(w * 13.0 + 4.1), g3 = sNoise(vec3(w.x * 2.0, w.y * 9.0, w.z * 2.0));   // little dents and streaks — for relief and roughness
      sDet = (g1 - 0.5) * 0.07 + (g2 - 0.5) * 0.05 + (g3 - 0.5) * 0.03; tc = vec3(0.93 + sDet * 1.4 + 0.05 * g1);
    }
    else if (vTex > 9.5) {                                            // 10: the ground (src/game/ground.js), painted from the splat map: 4 texels blended
      vec2 sp = (w.xz - splatRect.xy) - 0.5, f0 = floor(sp), fr = sp - f0; vec3 acc = vec3(0.0); float steep = 1.0 - smoothstep(0.55, 0.74, n.y);   // (rock from about 42°, all rock by 57°: as the cliffs, src/game/rock.js)
      float g1 = sNoise(wn / 5.0), g2 = sNoise(wn * 0.6 + 7.0), g3 = sNoise(wn * 2.7 + 1.0);
      // fine detail, so close up the ground isn't blobs: grain at a few centimetres, blade-like streaks in grass,
      // specks in gravel, ripples in sand
      float f1 = sNoise(w * 7.0 + 3.1), f2 = sNoise(w * 19.0 + 8.7), blade = sNoise(vec3(w.x * 31.0, 0.5, w.z * 9.0)) * sNoise(vec3(w.x * 9.0, 1.5, w.z * 31.0));
      float fine = 0.72 + 0.38 * f1 + 0.22 * f2, m1 = sNoise(w / 1.4 + 11.0), speck = step(0.72, sNoise(w * 13.0 + 2.0)), ripple = 0.94 + 0.06 * sin(w.x * 2.7 + w.z * 1.3 + sNoise(w * 0.8) * 5.0);
      // (everything that doesn't depend on the splat texel is worked out once here, not four times in the loop below)
      vec3 grass0 = mix(vec3(0.17, 0.30, 0.08), vec3(0.30, 0.42, 0.12), g1) * (0.8 + 0.35 * g3) * fine * (0.72 + 0.6 * blade) * mix(vec3(0.92, 1.0, 0.86), vec3(1.08, 1.0, 1.1), m1);
      vec3 dirt = vec3(0.36, 0.27, 0.17) * (0.85 + 0.3 * g3) * fine * (1.0 - 0.18 * speck);
      float bare = max(smoothstep(0.66, 0.74, g2 + (f1 - 0.5) * 0.12), smoothstep(0.8, 0.86, sNoise(w / 1.7 + 4.0)) * 0.7) * 0.8;
      vec3 shoreSand = vec3(0.70, 0.62, 0.45) * ripple * fine, shoreGravel = mix(vec3(0.46, 0.43, 0.38), vec3(0.62, 0.58, 0.52), f2) * (0.85 + 0.25 * speck);
      float shoreN = sNoise(w * 0.45 + 5.0);
      float n31 = sNoise(w * 3.1), n90 = sNoise(w * 9.0);
      float rb = w.y * 1.6 + sNoise(w * 0.35) * 2.5, strata = 0.5 + 0.5 * sin(rb) * 0.6 + 0.25 * sin(rb * 2.7 + 1.3);
      float crack = smoothstep(0.55, 0.85, sNoise(w * vec3(2.2, 0.18, 2.2))) * smoothstep(0.4, 0.7, sNoise(w * 0.5 + 9.0)), grain = n31 * 0.5 + n90 * 0.25;
      vec3 rock = mix(vec3(0.36, 0.33, 0.30), vec3(0.55, 0.51, 0.45), strata) * (0.78 + 0.35 * grain) * mix(vec3(1.0), vec3(1.05, 0.98, 0.9), sNoise(w * 0.12));
      rock *= 1.0 - 0.4 * crack;
      rock = mix(rock, vec3(0.30, 0.34, 0.20) * (0.8 + 0.4 * g3), smoothstep(0.84, 0.96, n.y) * smoothstep(0.5, 0.8, g2) * 0.6);
      vec3 snow = vec3(0.92, 0.94, 0.98) * (0.92 + 0.08 * g3);
      vec3 gravelC = mix(vec3(0.46, 0.44, 0.40), vec3(0.58, 0.55, 0.50), g3) * (0.8 + 0.3 * sNoise(wn * 6.0)) * (0.85 + 0.3 * speck) * fine;
      for (int q = 0; q < 4; q++) {
        vec2 o = vec2(float(q - (q / 2) * 2), float(q / 2)); float wq = (o.x > 0.5 ? fr.x : 1.0 - fr.x) * (o.y > 0.5 ? fr.y : 1.0 - fr.y);
        vec4 s4 = texture2D(splatMap, (f0 + o + 0.5) / splatRect.zw); float kind = floor(s4.r * 255.0 + 0.5), moist = s4.g, temp = s4.b, wet = s4.a;
        // grass, tinted by the climate: dry is yellow, wet is deep green, cold is pale
        vec3 grass = mix(grass0, vec3(0.44, 0.40, 0.16) * (0.85 + 0.3 * g3), smoothstep(0.45, 0.0, moist) * 0.85);
        grass = mix(grass, vec3(0.10, 0.24, 0.07) * (0.85 + 0.3 * g3), smoothstep(0.6, 1.0, moist) * 0.7);
        grass = mix(grass, vec3(0.55, 0.6, 0.5), smoothstep(0.35, 0.1, temp) * 0.5);
        vec3 c = mix(grass, dirt, bare);   // (big patches and small bare spots)
        // the shore: sand and gravel under the water, thinning out up the bank (wet: 1 under water, fading up to 5 m out)
        vec3 shore = mix(shoreSand, shoreGravel, smoothstep(0.4, 0.75, shoreN + (wet - 0.6) * 0.6));
        // rock: strata (bands by height, wavering), grain, cracks; lichen and dirt on the ledges that face up
        bool soft = true;
        if (kind > 8.5) c = mix(mix(vec3(0.24, 0.30, 0.12), vec3(0.34, 0.36, 0.18), g1) * (0.8 + 0.35 * g3), dirt, smoothstep(0.5, 0.75, g2) * 0.7);   // 9 rough grass
        else if (kind > 7.5) { c = (0.4 + 0.6 * tSam(cobbleMap, w.xz / 2.6)) * vec3(0.604, 0.549, 0.478); soft = false; }   // 8 cobbles
        else if (kind > 6.5) c = snow;                                                                                   // 7 snow
        else if (kind > 5.5) c = mix(vec3(0.20, 0.15, 0.10), vec3(0.28, 0.21, 0.13), g1) * (0.85 + 0.2 * g3);         // 6 mud
        else if (kind > 4.5) { c = gravelC; }   // 5 gravel
        else if (kind > 3.5) c = mix(vec3(0.72, 0.64, 0.44), vec3(0.80, 0.72, 0.52), g1) * (0.9 + 0.12 * g3) * ripple * (0.92 + 0.1 * f2);         // 4 sand
        else if (kind > 2.5) { c = rock; soft = false; }                                                                 // 3 rock
        else if (kind > 1.5) c = mix(vec3(0.30, 0.23, 0.15), vec3(0.40, 0.31, 0.20), g1) * (0.85 + 0.25 * g3);        // 2 dirt
        else if (kind > 0.5) c = grass;                                                                                  // 1 grass
        else {                                                                                                           // 0 auto: snow on the flat when cold, sand when very dry
          c = mix(c, snow, smoothstep(0.2, 0.05, temp) * smoothstep(0.55, 0.85, n.y));
          c = mix(c, vec3(0.72, 0.64, 0.44) * (0.9 + 0.12 * g3), smoothstep(0.15, 0.0, moist) * 0.8);
        }
        if (soft) c = mix(c, shore, smoothstep(0.12, 0.7, wet));                                                   // sand and gravel by the water
        if (soft) c = mix(c, rock, steep);
        c = mix(c, c * vec3(0.62, 0.66, 0.68), smoothstep(0.55, 1.0, wet) * 0.5);                                  // darker where it's wet
        acc += c * wq;
      }
      tc = acc; sDet = (f1 - 0.5) * 0.16 + (f2 - 0.5) * 0.12 + (blade - 0.25) * 0.05;
      // cliffs (too steep for grass: the rock): their own relief — the strata stepping out as ledges, the grain, the
      // fissures cut in — and rougher, duller stone
      { float stp = 1.0 - smoothstep(0.55, 0.74, n.y);
        if (stp > 0.01) { float ledge = fract(rb / 6.2832); ledge = ledge * ledge;   // (the strata, cracks and grain already worked out above)
          float crk = crack, gr = n31 * 0.6 + n90 * 0.4;
          float rd = (ledge - 0.33) * 0.22 + (gr - 0.5) * 0.16 - crk * 0.3 + (sNoise(w * 21.0) - 0.5) * 0.05;
          sDet = mix(sDet, rd, stp); sRock = stp; } }
    }
    else if (vTex > 8.5) {                                            // 9: a drawn road; its distance to the carriageway edge picks the material
      // the painted surface rides along in pd (100 per material): 0 cobbles · 1 flagstones · 2 dirt track · 3 gravel · 4 planks
      float mi = floor((vPd + 50.0) / 100.0), rpd = vPd - mi * 100.0;
      vec3 pc = vec3(0.761, 0.706, 0.612);                                                       // paving  #c2b49c
      if (mi > 1.5 && mi < 3.5) {                                                                // dirt / gravel: the whole width, ruts down the carriageway
        float n1 = sNoise(w * 1.3), n2 = sNoise(w * 6.0), sp = step(0.7, sNoise(w * 15.0));
        vec3 base = mi < 2.5 ? mix(vec3(0.42, 0.32, 0.21), vec3(0.50, 0.40, 0.27), n1) : mix(vec3(0.52, 0.50, 0.46), vec3(0.64, 0.61, 0.56), n1) * (0.85 + 0.3 * sp);
        float rut = rpd < -0.45 ? smoothstep(0.35, 0.0, abs(abs(fract(rpd * 0.25 + 0.5) - 0.5) - 0.32)) * 0.18 : 0.0;
        tc = base * (0.85 + 0.25 * n2) * (1.0 - rut) * (rpd > 0.3 ? 1.06 : 1.0); pc = vec3(1.0); sDet = (n2 - 0.5) * 0.16 + (sp - 0.3) * 0.08 - rut;
      } else if (mi > 3.5) {                                                                     // planks: boards across the road
        tc = tSam(woodMap, tuv / 2.0) * vec3(0.85, 0.72, 0.58); pc = vec3(1.0);
      } else if (rpd < -0.45) {
        if (mi > 0.5) { pc = vec3(0.70, 0.66, 0.58); tc = tSam(flagMap, tuv / 2.5); }   // flagstones down the carriageway
        else { pc = vec3(0.604, 0.549, 0.478); tc = 0.4 + 0.6 * tSam(cobbleMap, tuv / 2.6); }   // road #9a8c7a
      }
      else { tc = tSam(flagMap, tuv / 3.5); if (rpd < 0.0) pc = vec3(0.478, 0.431, 0.376); else if (rpd < 0.3) pc = vec3(0.816, 0.761, 0.651); }   // gutter #7a6e60, kerb #d0c2a6
      tc *= pc;
    }
    else if (vTex > 7.5) tc = tSam(flagMap, tuv / 3.5);
    else if (vTex > 6.5 && vTex < 7.5) tc = tSam(tileMap, abs(n.y) > 0.3 ? w.zx / 3.0 : tuv / 3.0);
    diffuseColor.rgb = diffuse * tc;
    tone = 0.86 + 0.24 * big + 0.08 * (mid - 0.5);                    // the town is cleaner: gentle variation only
  } else
  if (abs(n.y) < 0.5) {                                                // walls
    float creep = 0.35 + 0.9 * sNoise(vec3(wn.x, 0.0, wn.z) / 1.6);       // grime climbs unevenly
    tone *= mix(0.42, 1.0, smoothstep(0.0, creep, h));
    tint = mix(vec3(0.8, 0.82, 1.02), tint, smoothstep(0.0, creep, h));   // the grime is cool and violet, like painted shadow
    float damp = smoothstep(0.62, 0.78, sNoise(wn / 3.0 + 9.1)) * (1.0 - smoothstep(0.5, 2.5, h));
    tint = mix(tint, vec3(0.8, 0.92, 0.82), damp * 0.6); tone *= 1.0 - damp * 0.25;
  } else if (n.y > 0.5) {                                              // floors: flagstones instead of wall blocks
    diffuseColor.rgb = diffuse * tSam(flagMap, w.xz / 6.0);
    tone *= 0.9 + 0.22 * smoothstep(0.55, 0.8, sNoise(wn / 4.0 + 2.2));  // worn, lighter
    tone *= 1.0 - 0.45 * smoothstep(0.62, 0.8, sNoise(wn / 2.5 + 31.0)); // dark stains
  } else tone *= 0.72 + 0.2 * mid;                                     // ceilings: sooty
  diffuseColor.rgb *= tone * tint; }`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
{ float rb = 0.86;                                                     // each material's own roughness
  if (vTex > 0.5) rb = vTex < 1.5 ? 0.74 : vTex < 2.5 ? 0.62 : vTex < 3.5 ? 0.9 : vTex < 4.5 ? 0.8 : vTex < 5.5 ? 0.86 : vTex < 6.5 ? 0.62 : vTex < 7.5 ? 0.62 : vTex < 8.5 ? 0.76 : vTex < 9.5 ? 0.8 : 0.93;
  rb = mix(rb, 0.84, sRock);                                          // (cliff rock: duller than open ground, rougher in its cracks)
  roughnessFactor = clamp(rb - sDet * 1.5, 0.3, 1.0); }`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{ float fadeB = smoothstep(30.0, 4.0, length(vViewPosition));          // (fades out far off, where it would only shimmer)
  normal = sBump(-vViewPosition, normal, vec2(dFdx(sDet), dFdy(sDet)) * 0.085 * fadeB, faceDirection); }`);
}

// ---- hand-painted stone (seeded, so it's the same every time) ----
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const STONE_HUES = [[200, 180, 150], [204, 176, 136], [172, 164, 166], [214, 198, 168], [188, 168, 140], [160, 152, 146]];
function paintBlock(g, R, x, y, w, h, hue) {
  const k = 0.88 + R() * 0.24, c = hue.map(v => Math.round(v * k)), m = 3, r = 5;
  const rect = () => { g.beginPath(); g.moveTo(x + m + r, y + m); g.lineTo(x + w - m - r, y + m); g.quadraticCurveTo(x + w - m, y + m, x + w - m, y + m + r); g.lineTo(x + w - m, y + h - m - r); g.quadraticCurveTo(x + w - m, y + h - m, x + w - m - r, y + h - m); g.lineTo(x + m + r, y + h - m); g.quadraticCurveTo(x + m, y + h - m, x + m, y + h - m - r); g.lineTo(x + m, y + m + r); g.quadraticCurveTo(x + m, y + m, x + m + r, y + m); g.closePath(); };
  const grd = g.createLinearGradient(x, y, x + w * 0.3, y + h);
  grd.addColorStop(0, `rgb(${c.map(v => Math.min(255, v * 1.14)).join(',')})`); grd.addColorStop(0.55, `rgb(${c.join(',')})`); grd.addColorStop(1, `rgb(${c.map(v => v * 0.8).join(',')})`);
  rect(); g.fillStyle = grd; g.fill();
  g.save(); rect(); g.clip();
  for (let i = 0; i < 9; i++) {                                         // soft brush dabs: warm lights, cool violet darks
    const warm = R() < 0.55; g.fillStyle = warm ? `rgba(255,${226 + R() * 20 | 0},${170 + R() * 40 | 0},${0.07 + R() * 0.1})` : `rgba(${70 + R() * 30 | 0},${60 + R() * 20 | 0},${100 + R() * 30 | 0},${0.06 + R() * 0.1})`;
    g.beginPath(); g.ellipse(x + R() * w, y + R() * h, 6 + R() * w * 0.35, 4 + R() * h * 0.3, R() * Math.PI, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 5; i++) { g.strokeStyle = `rgba(255,240,210,${0.05 + R() * 0.08})`; g.lineWidth = 2 + R() * 3; g.beginPath(); const sx = x + R() * w, sy = y + R() * h; g.moveTo(sx, sy); g.lineTo(sx + 10 + R() * 20, sy + (R() - 0.5) * 6); g.stroke(); }   // brush strokes
  g.restore();
  // drawn-in light along the top and left, shadow along the bottom and right
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(255,238,205,0.55)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x + m + 3, y + h - m - 4); g.lineTo(x + m + 1.5, y + m + 1.5); g.lineTo(x + w - m - 4, y + m + 1.5); g.stroke();
  g.strokeStyle = 'rgba(48,28,34,0.5)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + m + 4, y + h - m - 1.5); g.lineTo(x + w - m - 1.5, y + h - m - 1.5); g.lineTo(x + w - m - 1.5, y + m + 4); g.stroke();
  if (R() < 0.3) { const cx = R() < 0.5 ? x + m : x + w - m, cy = R() < 0.5 ? y + m : y + h - m, s = 6 + R() * 8;   // a chipped corner
    g.fillStyle = '#3a2c24'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + (cx === x + m ? s : -s), cy); g.lineTo(cx, cy + (cy === y + m ? s : -s)); g.fill(); }
  if (R() < 0.14) {                                                     // a painted crack, dark with a lit lip
    let px = x + w * (0.25 + R() * 0.5), py = y + m + 2; const pts = [[px, py]];
    while (py < y + h - m - 3) { px += (R() - 0.5) * 10; py += 5 + R() * 7; pts.push([px, Math.min(py, y + h - m - 3)]); }
    for (const [col, off, lw] of [['rgba(255,235,200,0.35)', 1.2, 1.2], ['rgba(40,24,22,0.75)', 0, 1.6]]) { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); pts.forEach(([a, b], i) => i ? g.lineTo(a + off, b + off) : g.moveTo(a + off, b + off)); g.stroke(); }
  }
}
// wall blocks: rows 0.75 m tall, blocks 0.75–1.5 m long, staggered, wrapping seamlessly
function paintStone(g) {
  const R = rng(1337); g.fillStyle = '#3c2e24'; g.fillRect(0, 0, 512, 512);
  for (let row = 0; row < 8; row++) {
    const y = row * 64; let x = Math.floor(R() * 64), left = 512;
    while (left > 0) {
      let w = [64, 96, 96, 128][Math.floor(R() * 4)]; if (left - w < 48) w = left; if (w > left) w = left;
      const hue = STONE_HUES[Math.floor(R() * STONE_HUES.length)];
      const st = R(); const draw = ox => { const r2 = rng(Math.floor(st * 1e9)); paintBlock(g, r2, ox, y, w, 64, hue); };
      draw(x); if (x + w > 512) draw(x - 512);
      x = (x + w) % 512; left -= w;
    }
  }
}
// floor flagstones: big slabs split at random
function paintFlags(g) {
  const R = rng(4242); g.fillStyle = '#3a2c22'; g.fillRect(0, 0, 512, 512);
  const slab = (x, y, w, h, depth) => {
    if (depth < 4 && (w > 120 || h > 120 || (depth < 2 && R() < 0.8))) {
      if (w > h) { const c = Math.round(w * (0.35 + R() * 0.3)); slab(x, y, c, h, depth + 1); slab(x + c, y, w - c, h, depth + 1); }
      else { const c = Math.round(h * (0.35 + R() * 0.3)); slab(x, y, w, c, depth + 1); slab(x, y + c, w, h - c, depth + 1); }
      return;
    }
    paintBlock(g, R, x, y, w, h, STONE_HUES[Math.floor(R() * STONE_HUES.length)]);
  };
  slab(0, 0, 512, 512, 0);
}

// ---- the town's painted materials (each tiles seamlessly; light from the top left, like the stone) ----
function paintCobbles(g, S) {
  const R = rng(77); g.fillStyle = '#4a4038'; g.fillRect(0, 0, S, S);
  const rows = 8, h = S / rows;
  for (let r = 0; r < rows; r++) {
    let x = -R() * 20;
    while (x < S) {
      const w = h * (0.8 + R() * 0.7), cx = x + w / 2, cy = r * h + h / 2, v = 120 + R() * 50, warm = R() * 14;
      for (const ox of [0, -S, S]) {
        const grd = g.createRadialGradient(cx + ox - w * 0.15, cy - h * 0.2, 1, cx + ox, cy, w * 0.6);
        grd.addColorStop(0, `rgb(${v + 50 + warm},${v + 44},${v + 36})`); grd.addColorStop(0.7, `rgb(${v + warm},${v - 4},${v - 12})`); grd.addColorStop(1, `rgb(${v * 0.62},${v * 0.58},${v * 0.56})`);
        g.fillStyle = grd; g.beginPath(); g.ellipse(cx + ox, cy, w / 2 - 2, h / 2 - 2.5, (R() - 0.5) * 0.2, 0, Math.PI * 2); g.fill();
      }
      x += w;
    }
  }
}
function paintTiles(g, S) {
  // curved clay roof tiles: rows of overlapping scallops, orange-red with lit tops and dark undersides
  const R = rng(91); g.fillStyle = '#5a2418'; g.fillRect(0, 0, S, S);
  const rows = 8, h = S / rows, w = S / 8;
  for (let r = rows; r >= -1; r--) {
    for (let c = -1; c <= 8; c++) {
      const x = c * w + (r % 2) * w / 2, y = r * h, k = 0.85 + R() * 0.3;
      const grd = g.createLinearGradient(x, y, x, y + h * 1.1);
      grd.addColorStop(0, `rgb(${232 * k | 0},${128 * k | 0},${70 * k | 0})`); grd.addColorStop(0.6, `rgb(${196 * k | 0},${92 * k | 0},${52 * k | 0})`); grd.addColorStop(1, `rgb(${120 * k | 0},${50 * k | 0},${34 * k | 0})`);
      for (const oy of [0, S]) { g.fillStyle = grd; g.beginPath(); g.moveTo(x + 1, y - oy); g.lineTo(x + w - 1, y - oy); g.lineTo(x + w - 1, y + h * 0.7 - oy); g.quadraticCurveTo(x + w / 2, y + h * 1.25 - oy, x + 1, y + h * 0.7 - oy); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(255,220,180,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + 4, y + 3 - oy); g.lineTo(x + w - 4, y + 3 - oy); g.stroke(); }
    }
  }
}
function paintPlaster(g, S) {
  const R = rng(13); g.fillStyle = '#ece0c4'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) { const warm = R() < 0.5; g.fillStyle = warm ? `rgba(255,240,210,${0.1 + R() * 0.15})` : `rgba(150,130,110,${0.05 + R() * 0.08})`; g.beginPath(); g.ellipse(R() * S, R() * S, 8 + R() * 40, 6 + R() * 26, R() * 3, 0, Math.PI * 2); g.fill(); }
  for (let i = 0; i < 4; i++) { g.strokeStyle = 'rgba(110,90,70,0.3)'; g.lineWidth = 1; g.beginPath(); let x = R() * S, y = R() * S; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (R() - 0.5) * 20; y += 6 + R() * 8; g.lineTo(x, y); } g.stroke(); }
}
function paintWood(g, S) {
  const R = rng(5); const n = 6, w = S / n;
  for (let i = 0; i < n; i++) {
    const k = 0.85 + R() * 0.3; g.fillStyle = `rgb(${134 * k | 0},${88 * k | 0},${52 * k | 0})`; g.fillRect(i * w, 0, w, S);
    for (let j = 0; j < 14; j++) { g.strokeStyle = `rgba(${R() < 0.5 ? '60,36,20' : '200,150,100'},${0.15 + R() * 0.2})`; g.lineWidth = 1 + R(); g.beginPath(); const x = i * w + R() * w; g.moveTo(x, 0); g.bezierCurveTo(x + (R() - 0.5) * 8, S / 3, x + (R() - 0.5) * 8, S * 2 / 3, x, S); g.stroke(); }
    g.fillStyle = 'rgba(40,24,14,0.7)'; g.fillRect(i * w, 0, 2, S); g.fillStyle = 'rgba(230,190,140,0.3)'; g.fillRect(i * w + 2, 0, 1.5, S);
  }
}
function paintBrick(g, S) {
  const R = rng(29); g.fillStyle = '#6a5a4a'; g.fillRect(0, 0, S, S);
  const rows = 12, h = S / rows, w = S / 6;
  for (let r = 0; r < rows; r++) for (let c = -1; c < 7; c++) {
    const x = c * w + (r % 2) * w / 2, y = r * h, k = 0.82 + R() * 0.32;
    g.fillStyle = `rgb(${168 * k | 0},${82 * k | 0},${58 * k | 0})`; g.fillRect(x + 2, y + 2, w - 4, h - 4);
    g.fillStyle = 'rgba(255,210,170,0.3)'; g.fillRect(x + 2, y + 2, w - 4, 2); g.fillStyle = 'rgba(40,16,12,0.35)'; g.fillRect(x + 2, y + h - 4, w - 4, 2);
  }
}
