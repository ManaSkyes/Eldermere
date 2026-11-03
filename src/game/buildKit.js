// src/game/buildKit.js — the modular building kit (art/blender/buildkit.blend, text block kit3.py; docs/BUILDKIT.md).
//
// Two kinds of piece:
//   WALLS    — a surface type (brick, brick_cracked, …): one seamless tiling texture per type, 2.5 m × 3 m per tile.
//              A wall is any width × height slab, generated here, with the openings of its features CUT into it
//              (front, back, and the reveal round each hole, brick carrying round the edges).
//   FEATURES — modelled pieces (arched window, door, rectangular window, …) that sit in a wall and carry the
//              outline of the opening they need. Placing one cuts its outline into whichever wall it sits in, so a
//              feature works on any flat wall face at any position, arched or square.
//
//   TRIMS    — profiles (string course, cornice, plinth) swept along any length on a tiling trim sheet, ends
//              mitred for outside (+1) or inside (−1) corners, or capped flat (0).
//   CORNERS  — quoins: a 0.6 m modelled unit stacked up a corner.
//
// A building is then merged into ONE mesh per material (one per wall type used + one for all features), so a
// whole building is a handful of draw calls, and its colliders are split round the doors.
//
// Wall-local axes: x along the wall, y up, z out of the front face (front at z = 0, back at z = -thick).
// Feature outlines are [x, y] in the same frame with x = 0 at the feature's centre and y from the wall's base.
const BASE = new URL('../../data/buildkit/', import.meta.url).href;
let promise = null;

export function loadBuildKit() {
  if (promise) return promise;
  promise = (async () => {
    const meta = await (await fetch(BASE + 'buildkit.json')).json();
    const bin = await (await fetch(BASE + 'buildkit.bin')).arrayBuffer();
    const tl = new THREE.TextureLoader();
    const tex = (f, srgb, rep) => {
      const t = tl.load(BASE + f); if (srgb) t.encoding = THREE.sRGBEncoding;
      if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } t.anisotropy = 8; return t;
    };
    const kit = { meta, thick: meta.thick, walls: {}, features: {}, materials: {} };
    for (const [name, w] of Object.entries(meta.walls)) {
      kit.walls[name] = { tile: w.tile };
      kit.materials['wall:' + name] = grimeMaterial(tex(w.color, true, true), tex(w.normal, false, true));
    }
    kit.materials.features = grimeMaterial(tex(meta.features_tex.color, true, false), tex(meta.features_tex.normal, false, false));
    const trimTex = (f) => { const t = tex(f, f.endsWith('.jpg'), true); t.wrapT = THREE.ClampToEdgeWrapping; return t; };
    kit.materials.trims = grimeMaterial(trimTex(meta.trims_tex.color), trimTex(meta.trims_tex.normal));
    kit.materials.lead = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.55, metalness: 0.2 });
    kit.materials.clay = new THREE.MeshStandardMaterial({ color: 0x8a4a30, roughness: 0.85, metalness: 0 });
    kit.materials.timber = grimeMaterial(tex('oak_color.jpg', true, true), tex('oak_normal.png', false, true));
    kit.trims = meta.trims;
    if (meta.civic_tex) kit.materials.civic = grimeMaterial(trimTex(meta.civic_tex.color), trimTex(meta.civic_tex.normal));
    if (meta.plinths_tex) kit.materials.plinths = grimeMaterial(trimTex(meta.plinths_tex.color), trimTex(meta.plinths_tex.normal));
    const ivy = tl.load(BASE + 'ivy.png'); ivy.encoding = THREE.sRGBEncoding; ivy.anisotropy = 4;
    kit.materials.vines = new THREE.MeshStandardMaterial({ map: ivy, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, roughness: 0.6, metalness: 0 });
    kit.materials.timber.color.setScalar(0.6);   // tarred, near black
    kit.materials.iron = new THREE.MeshStandardMaterial({ color: 0x1d1e21, roughness: 0.55, metalness: 0.35 });
    kit.materials.glass = new THREE.MeshStandardMaterial({ color: 0x18242a, roughness: 0.12, metalness: 0.45 });
    kit.materials.endgrain = new THREE.MeshStandardMaterial({ color: 0x8c6a45, roughness: 0.92, metalness: 0 });
    kit.materials.crystal = new THREE.MeshStandardMaterial({ color: 0x7fe6ff, emissive: 0x2fb8e6, emissiveIntensity: 1.2, roughness: 0.15, metalness: 0.1, flatShading: true });
    kit.materials.paint = new THREE.MeshStandardMaterial({ color: 0xe2dccd, roughness: 0.8, metalness: 0 });
    const dec = tl.load(BASE + 'decals.png'); dec.encoding = THREE.sRGBEncoding; dec.anisotropy = 4;
    kit.materials.decals = new THREE.MeshStandardMaterial({ map: dec, transparent: true, depthWrite: false, alphaTest: 0.02, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, roughness: 0.9, metalness: 0 });
    kit.materials.canvas = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
    const flora = tl.load(BASE + 'flora.png'); flora.encoding = THREE.sRGBEncoding; flora.anisotropy = 4;
    kit.materials.flora = new THREE.MeshStandardMaterial({ map: flora, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, roughness: 0.65, metalness: 0 });
    kit.floraDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: flora, alphaTest: 0.5 });
    kit.vineDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: ivy, alphaTest: 0.5 });
    for (const [name, f] of Object.entries(meta.features)) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bin, f.pos, f.verts * 3), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(bin, f.nrm, f.verts * 3), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(bin, f.uv, f.verts * 2), 2));
      g.setIndex(new THREE.BufferAttribute(new Uint16Array(bin, f.idx, f.tris * 3), 1));
      g.computeBoundingBox();
      const outline = f.outline && f.outline.length ? f.outline : null;
      kit.features[name] = { geometry: g, kind: f.kind || 'opening', outline, unit: f.unit,
        door: !!outline && Math.min(...outline.map(p => p[1])) < 0.05 };
    }
    addCodeFeatures(kit);
    return kit;
  })();
  return promise;
}

// ---- the wooden town, batch 1: features made in code (planks, frames and ironwork from the kit's materials) ----
// Each is { parts: { materialKey: geometry }, geometry (for its bounding box), kind, outline, door }.
// Plank leaves use the board texture (wall:boards), frames the tarred oak (timber), fittings the iron.
function addCodeFeatures(kit) {
  if (!kit.materials['wall:boards']) return;
  const T = 2.5;                                                     // the board texture's tile width (m)
  const mk = (name, kind, outline, build) => {
    const B = { boards: meshBuilder(), timber: meshBuilder(), iron: meshBuilder(), glass: meshBuilder(), lead: meshBuilder(), stone: meshBuilder(), shingle: meshBuilder(), endgrain: meshBuilder(), ashlar: meshBuilder(), paint: meshBuilder() };
    build(B);
    const parts = {}; let first = null;
    const KEY = { boards: 'wall:boards', stone: 'wall:cobble', shingle: 'wall:shingle', ashlar: 'wall:ashlar' };
    // (features may also use gilt / crystal: ensured below)
    for (const [k, m] of Object.entries(B)) if (!m.empty()) { parts[KEY[k] || k] = m.done(); first = first || parts[KEY[k] || k]; }
    const all = mergeGeometries(Object.values(parts).map(g => [g, new THREE.Matrix4()])); all.computeBoundingBox();
    kit.features[name] = { geometry: all, parts, kind, outline, door: !!outline && Math.min(...outline.map(p => p[1])) < 0.05, code: true };
  };
  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  // an oak frame round an opening: jambs, head and (for windows) a sill; d = depth into the wall
  const frame = (B, x0, y0, x1, y1, fw = 0.12, sill = true, d = 0.2) => {
    const t = B.timber, c = (a, b) => (a + b) / 2;
    t.box([x0 - fw / 2, c(y0, y1 + fw), -d / 2 + 0.03], [fw / 2, 0, 0], [0, (y1 - y0 + fw) / 2, 0], [0, 0, d / 2], 1);
    t.box([x1 + fw / 2, c(y0, y1 + fw), -d / 2 + 0.03], [fw / 2, 0, 0], [0, (y1 - y0 + fw) / 2, 0], [0, 0, d / 2], 1);
    t.box([c(x0, x1), y1 + fw / 2, -d / 2 + 0.035], [(x1 - x0) / 2 + fw, 0, 0], [0, fw / 2, 0], [0, 0, d / 2 + 0.005], 1);
    if (sill) t.box([c(x0, x1), y0 - 0.05, -d / 2 + 0.06], [(x1 - x0) / 2 + fw + 0.04, 0, 0], [0, 0.05, 0], [0, 0, d / 2 + 0.04], 1);
  };
  // a ledged plank leaf: vertical boards (each its own width, tiny gaps) on horizontal ledges and a diagonal brace
  const leaf = (B, x0, y0, x1, y1, z, { ledges = 2, brace = true, back = true } = {}) => {
    const W = x1 - x0, n = Math.max(2, Math.round(W / 0.16)), bw = W / n;
    for (let i = 0; i < n; i++) B.boards.box([x0 + bw * (i + 0.5), (y0 + y1) / 2, z], [bw / 2 - 0.003, 0, 0], [0, (y1 - y0) / 2, 0], [0, 0, 0.018], T);
    if (!back) return;
    const ly = ledges === 2 ? [y0 + 0.15, y1 - 0.15] : [y0 + 0.15, (y0 + y1) / 2, y1 - 0.15];
    for (const y of ly) B.boards.box([(x0 + x1) / 2, y, z + 0.032], [W / 2 - 0.02, 0, 0], [0, 0.06, 0], [0, 0, 0.014], T);
    if (brace) { const dx = W - 0.1, dy = ly[ly.length - 1] - ly[0] - 0.12, L = Math.hypot(dx, dy) / 2, a = [dx / (2 * L) * L, dy / (2 * L) * L, 0];
      B.boards.box([(x0 + x1) / 2, (ly[0] + ly[ly.length - 1]) / 2, z + 0.032], a, [-dy / (2 * L) * 0.055, dx / (2 * L) * 0.055, 0], [0, 0, 0.013], T); }
  };
  // strap hinges: iron bands across the leaf from the hinge side
  const straps = (B, x0, x1, ys, z, side = -1) => { for (const y of ys) B.iron.box([side < 0 ? x0 + (x1 - x0) * 0.33 : x1 - (x1 - x0) * 0.33, y, z], [(x1 - x0) * 0.33, 0, 0], [0, 0.022, 0], [0, 0, 0.006], 1); };

  // stable door: a split plank door, the halves opening separately; a shelf on the lower leaf
  mk('feat_door_stable', 'opening', rect(-0.5, 0, 0.5, 2.05), B => {
    frame(B, -0.5, 0, 0.5, 2.05, 0.13, false);
    leaf(B, -0.47, 0.0, 0.47, 1.0, -0.06, { ledges: 2 }); leaf(B, -0.47, 1.03, 0.47, 2.02, -0.06, { ledges: 2 });
    B.timber.box([0, 1.03, -0.02], [0.5, 0, 0], [0, 0.022, 0], [0, 0, 0.07], 1);                     // the shelf
    straps(B, -0.47, 0.47, [0.2, 0.82, 1.22, 1.84], -0.038); B.iron.box([0.36, 1.12, -0.03], [0.05, 0, 0], [0, 0.012, 0], [0, 0, 0.012], 1);   // + the latch
  });
  // a simple ledged-and-braced board door (cottages, sheds, back doors)
  mk('feat_door_board', 'opening', rect(-0.45, 0, 0.45, 1.95), B => {
    frame(B, -0.45, 0, 0.45, 1.95, 0.11, false);
    leaf(B, -0.43, 0.0, 0.43, 1.93, -0.06, { ledges: 3 }); straps(B, -0.43, 0.43, [0.2, 0.96, 1.72], -0.038);
    B.iron.box([0.33, 1.0, -0.03], [0.012, 0, 0], [0, 0.07, 0], [0, 0, 0.014], 1);
  });
  // plank shutters, folded open against the wall either side of a ~1.0–1.2 m window (0.95–2.25 m high)
  const shutters = (B, louvre) => {
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? -1.12 : 0.62, x1 = s < 0 ? -0.62 : 1.12, y0 = 0.95, y1 = 2.25, z = 0.03;
      if (!louvre) { leaf(B, x0, y0, x1, y1, z, { ledges: 2, brace: false, back: false }); B.boards.box([(x0 + x1) / 2, y0 + 0.18, z + 0.025], [(x1 - x0) / 2, 0, 0], [0, 0.05, 0], [0, 0, 0.012], T); B.boards.box([(x0 + x1) / 2, y1 - 0.18, z + 0.025], [(x1 - x0) / 2, 0, 0], [0, 0.05, 0], [0, 0, 0.012], T); }
      else {
        for (const xx of [x0 + 0.03, x1 - 0.03]) B.boards.box([xx, (y0 + y1) / 2, z], [0.03, 0, 0], [0, (y1 - y0) / 2, 0], [0, 0, 0.022], T);
        for (const yy of [y0 + 0.04, (y0 + y1) / 2, y1 - 0.04]) B.boards.box([(x0 + x1) / 2, yy, z], [(x1 - x0) / 2, 0, 0], [0, 0.04, 0], [0, 0, 0.022], T);
        for (let yy = y0 + 0.1; yy < y1 - 0.08; yy += 0.055) if (Math.abs(yy - (y0 + y1) / 2) > 0.05) B.boards.box([(x0 + x1) / 2, yy, z], [(x1 - x0) / 2 - 0.05, 0, 0], [0, 0.026, -0.012], [0, 0.006, 0.014], T);   // slats, angled
      }
      for (const yy of [y0 + 0.18, y1 - 0.18]) B.iron.box([s < 0 ? x1 - 0.02 : x0 + 0.02, yy, z + 0.03], [0.045, 0, 0], [0, 0.015, 0], [0, 0, 0.006], 1);   // hinge pins
    }
  };
  // ---- batch 2: small windows (glass behind lead cames or timber bars), props for the street ----
  const rodS = (m, p, q, rr) => { const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], L2 = Math.hypot(...d) / 2; if (L2 < 1e-6) return; const u = d.map(v => v / (2 * L2)), side = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const w = [u[1] * side[2] - u[2] * side[1], u[2] * side[0] - u[0] * side[2], u[0] * side[1] - u[1] * side[0]], wl = Math.hypot(...w), v = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    m.box([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2], u.map(x => x * L2), w.map(x => x / wl * rr), v.map(x => x / wl * rr), 1); };
  // glass with diamond cames: lines at ±45° every `step`, clipped to the light
  const lattice = (B, x0, y0, x1, y1, z, step = 0.11) => {
    B.glass.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    const seg = (c, sgn) => {   // the line y = sgn·x + c within the rectangle
      const pts = [];
      for (const x of [x0, x1]) { const y = sgn * x + c; if (y >= y0 - 1e-6 && y <= y1 + 1e-6) pts.push([x, y]); }
      for (const y of [y0, y1]) { const x = (y - c) * sgn; if (x > x0 + 1e-6 && x < x1 - 1e-6) pts.push([x, y]); }
      if (pts.length >= 2) rodS(B.lead, [pts[0][0], pts[0][1], z + 0.004], [pts[1][0], pts[1][1], z + 0.004], 0.0045);
    };
    for (let c = y0 - x1 - step; c < y1 - x0 + step; c += step) seg(c, 1);
    for (let c = y0 + x0 - step; c < y1 + x1 + step; c += step) seg(c, -1);
  };
  mk('feat_window_lattice', 'opening', rect(-0.35, 1.05, 0.35, 1.75), B => { frame(B, -0.35, 1.05, 0.35, 1.75, 0.1, true); lattice(B, -0.35, 1.05, 0.35, 1.75, -0.09); });
  mk('feat_window_lattice2', 'opening', rect(-0.6, 0.95, 0.6, 1.85), B => {
    frame(B, -0.6, 0.95, 0.6, 1.85, 0.11, true); B.timber.box([0, 1.4, -0.07], [0.045, 0, 0], [0, 0.45, 0], [0, 0, 0.08], 1);   // mullion
    lattice(B, -0.6, 0.95, -0.045, 1.85, -0.1); lattice(B, 0.045, 0.95, 0.6, 1.85, -0.1);
  });
  mk('feat_window_square', 'opening', rect(-0.42, 1.0, 0.42, 1.84), B => {
    frame(B, -0.42, 1.0, 0.42, 1.84, 0.11, true);
    B.glass.quad([-0.42, 1.0, -0.1], [0.42, 1.0, -0.1], [0.42, 1.84, -0.1], [-0.42, 1.84, -0.1], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    B.timber.box([0, 1.42, -0.07], [0.035, 0, 0], [0, 0.42, 0], [0, 0, 0.05], 1); B.timber.box([0, 1.42, -0.07], [0.42, 0, 0], [0, 0.035, 0], [0, 0, 0.05], 1);   // cross bars
  });
  // a cylinder (n-sided prism) along y from y0 to y1, radius r (or [r0, r1]), into builder m
  const cylY = (m, cx, cz, y0, y1, r, n = 12, tile = 1) => {
    const [r0, r1] = Array.isArray(r) ? r : [r, r];
    for (let i = 0; i < n; i++) { const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, P = (a, rr, y) => [cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr];
      m.quad(P(a1, r0, y0), P(a0, r0, y0), P(a0, r1, y1), P(a1, r1, y1), [[a1 * r0 / tile, 0], [a0 * r0 / tile, 0], [a0 * r1 / tile, (y1 - y0) / tile], [a1 * r1 / tile, (y1 - y0) / tile]]); }
    for (const [y, rr, up] of [[y1, r1, 1], [y0, r0, -1]]) for (let i = 0; i < n; i++) { const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
      const A = [cx + Math.cos(a0) * rr, y, cz + Math.sin(a0) * rr], Bp = [cx + Math.cos(a1) * rr, y, cz + Math.sin(a1) * rr], C = [cx, y, cz];
      up > 0 ? m.quad(C, Bp, A, C, [[0, 0], [1, 0], [1, 1], [0, 1]]) : m.quad(C, A, Bp, C, [[0, 0], [1, 0], [1, 1], [0, 1]]); }
  };
  // a log lying along x
  const logX = (m, x0, x1, y, z, r, n = 8) => {
    for (let i = 0; i < n; i++) { const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, P = (x, a) => [x, y + Math.sin(a) * r, z + Math.cos(a) * r];
      m.quad(P(x0, a0), P(x1, a0), P(x1, a1), P(x0, a1), [[x0, a0 * r], [x1, a0 * r], [x1, a1 * r], [x0, a1 * r]]); }
    for (const [x, sg] of [[x0, -1], [x1, 1]]) for (let i = 0; i < n; i++) { const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, c = [x, y, z];
      const A = [x, y + Math.sin(a0) * r, z + Math.cos(a0) * r], Bq = [x, y + Math.sin(a1) * r, z + Math.cos(a1) * r];
      sg > 0 ? m.quad(c, A, Bq, c, [[0.5, 0.5], [1, 0.5], [1, 1], [0.5, 0.5]]) : m.quad(c, Bq, A, c, [[0.5, 0.5], [1, 0.5], [1, 1], [0.5, 0.5]]); }
  };
  mk('prop_barrel', 'prop', null, B => {
    const n = 14, H = 0.86, rm = 0.3, re = 0.25;
    for (let i = 0; i < n; i++) {         // staves: each a bowed board (two lengths), so the barrel bulges
      const a = (i + 0.5) / n * Math.PI * 2, w = Math.PI * 2 * re / n / 2 - 0.002, t = [-Math.sin(a), 0, Math.cos(a)], o = [Math.cos(a), 0, Math.sin(a)];
      for (const [ya, yb, ra, rb] of [[0, H / 2, re, rm], [H / 2, H, rm, re]]) {
        const pa = [o[0] * ra, ya, o[2] * ra], pb = [o[0] * rb, yb, o[2] * rb], c = [(pa[0] + pb[0]) / 2, (ya + yb) / 2, (pa[2] + pb[2]) / 2];
        B.boards.box(c, [(pb[0] - pa[0]) / 2, (yb - ya) / 2, (pb[2] - pa[2]) / 2], t.map(v => v * w * (ra + rb) / (2 * re)), o.map(v => v * 0.012), 2.5);
      }
    }
    for (const y of [0.1, 0.3, H - 0.3, H - 0.1]) { const rr = re + (rm - re) * (1 - Math.abs(y - H / 2) / (H / 2)) + 0.012; cylY(B.iron, 0, 0, y - 0.022, y + 0.022, rr, 16); }
    cylY(B.boards, 0, 0, H - 0.04, H - 0.03, re - 0.01, 14, 2.5);
  });
  const crate = (B, cx, cy, cz, s, rot = 0) => {
    const c = Math.cos(rot), sn = Math.sin(rot), X = [c * s / 2, 0, -sn * s / 2], Z = [sn * s / 2, 0, c * s / 2];
    B.boards.box([cx, cy + s / 2, cz], X, [0, s / 2 - 0.005, 0], Z, 2.5);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.boards.box([cx + X[0] * sx * 0.92 + Z[0] * sz * 0.92, cy + s / 2, cz + X[2] * sx * 0.92 + Z[2] * sz * 0.92], X.map(v => v * 0.1), [0, s / 2, 0], Z.map(v => v * 0.1), 2.5);
    for (const y of [cy + 0.05, cy + s - 0.05]) for (const [A, Bv] of [[X, Z], [Z, X]]) for (const sg of [-1, 1]) B.boards.box([cx + Bv[0] * sg * 1.02, y, cz + Bv[2] * sg * 1.02], A, [0, 0.04, 0], Bv.map(v => v * 0.03), 2.5);
  };
  mk('prop_crate', 'prop', null, B => crate(B, 0, 0, 0, 0.6));
  mk('prop_crates', 'prop', null, B => { crate(B, -0.33, 0, 0, 0.6); crate(B, 0.34, 0, 0.05, 0.6, 0.12); crate(B, 0, 0.6, 0.02, 0.5, -0.2); });
  // a log lying along z (its end grain to the front)
  const logZ = (m, me, x, y, z0, z1, r, n = 7) => {
    for (let i = 0; i < n; i++) { const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, P = (z, a) => [x + Math.cos(a) * r, y + Math.sin(a) * r, z];
      m.quad(P(z1, a0), P(z0, a0), P(z0, a1), P(z1, a1), [[z1 * 2, a0 * r * 2], [z0 * 2, a0 * r * 2], [z0 * 2, a1 * r * 2], [z1 * 2, a1 * r * 2]]); }
    for (const [z, sg] of [[z1, 1], [z0, -1]]) for (let i = 0; i < n; i++) { const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, c = [x, y, z], A = [x + Math.cos(a0) * r, y + Math.sin(a0) * r, z], Bq = [x + Math.cos(a1) * r, y + Math.sin(a1) * r, z];
      sg > 0 ? me.quad(c, A, Bq, c, [[0.5, 0.5], [1, 0.5], [1, 1], [0.5, 0.5]]) : me.quad(c, Bq, A, c, [[0.5, 0.5], [1, 0.5], [1, 1], [0.5, 0.5]]); }
  };
  mk('prop_column_ionic', 'prop', null, B => column(B, 'ionic', 0, 0, 3)); kit.features.prop_column_ionic.column = 'ionic';
  mk('prop_column_plain', 'prop', null, B => column(B, 'plain', 0, 0, 3)); kit.features.prop_column_plain.column = 'plain';
  // a Venetian (Palladian) window: a tall arched light between two lower side lights, in dressed stone
  { const arc = []; for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI; arc.push([Math.cos(a) * 0.52, 2.25 + Math.sin(a) * 0.52]); }
    mk('feat_window_venetian', 'opening', [[-1.12, 0.92], [1.12, 0.92], [1.12, 2.25], ...arc, [-1.12, 2.25]], B => {
      const st = B.ashlar, z = -0.07, zd = 0.14;
      for (const x of [-1.17, -0.57, 0.57, 1.17]) st.box([x, 1.6, z], [0.06, 0, 0], [0, 0.68, 0], [0, 0, zd], 1);
      for (const sx of [-1, 1]) st.box([sx * 0.87, 2.33, z + 0.01], [0.36, 0, 0], [0, 0.08, 0], [0, 0, zd + 0.01], 1);   // lintels (the side lights' entablature)
      for (let i = 0; i < 13; i++) {                                                                                  // voussoirs round the arch, a big keystone
        const a = (i + 0.5) / 13 * Math.PI, t = [-Math.sin(a), Math.cos(a), 0], rr = [Math.cos(a), Math.sin(a), 0], key = i === 6, ro = key ? 0.68 : 0.63;
        st.box([Math.cos(a) * ro, 2.25 + Math.sin(a) * ro, z + 0.01], t.map(v => v * 0.058), rr.map(v => v * (key ? 0.16 : 0.1)), [0, 0, zd + (key ? 0.03 : 0.01)], 1);
      }
      st.box([0, 0.86, 0.0], [1.3, 0, 0], [0, 0.06, 0], [0, 0, 0.14], 1);                                               // the sill
      const g = B.glass, zg = -0.12, P = (x, y) => [x, y, zg];
      for (const [a, b] of [[-1.11, -0.63], [0.63, 1.11], [-0.51, 0.51]]) g.quad(P(a, 0.92), P(b, 0.92), P(b, 2.25), P(a, 2.25), [[0, 0], [1, 0], [1, 1], [0, 1]]);
      for (let i = 0; i < 12; i++) g.quad(P(0, 2.25), P(arc[i][0], arc[i][1]), P(arc[i + 1][0], arc[i + 1][1]), P(0, 2.25), [[0.5, 0], [1, 1], [0, 1], [0.5, 0]]);
      const L = B.lead, bar = (x0, y0, x1, y1) => { const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, l = Math.hypot(x1 - x0, y1 - y0) / 2, d = [(x1 - x0) / 2 / l, (y1 - y0) / 2 / l]; L.box([cx, cy, zg + 0.01], [d[0] * l, d[1] * l, 0], [-d[1] * 0.012, d[0] * 0.012, 0], [0, 0, 0.012], 1); };
      for (const sx of [-1, 1]) { bar(sx * 0.87, 0.92, sx * 0.87, 2.25); for (const y of [1.36, 1.8]) bar(sx * 0.63, y, sx * 1.11, y); }
      for (const x of [-0.17, 0.17]) bar(x, 0.92, x, 2.25 + Math.sqrt(0.52 * 0.52 - x * x)); for (const y of [1.36, 1.8, 2.25]) bar(-0.51, y, 0.51, y);
      for (const a of [Math.PI / 4, Math.PI * 3 / 4]) bar(Math.cos(a) * 0.12, 2.25 + Math.sin(a) * 0.12, Math.cos(a) * 0.52, 2.25 + Math.sin(a) * 0.52);
    }); }
  mk('prop_woodpile', 'prop', null, B => {
    // split firewood stacked between two end posts under a little board roof, the cut ends facing out
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let row = 0; row < 7; row++) { const y = 0.12 + row * 0.115;
      for (let x = -0.72 + (row % 2) * 0.055; x < 0.73; x += 0.11) { const rr = 0.05 + rnd() * 0.012, z0 = -0.22 - rnd() * 0.04, z1 = 0.2 + rnd() * 0.05; logZ(B.boards, B.endgrain, x, y, z0, z1, rr, 6 + ((rnd() * 2) | 0)); } }
    for (const x of [-0.82, 0.82]) for (const z of [-0.2, 0.2]) B.timber.box([x, 0.55, z], [0.04, 0, 0], [0, 0.55, 0], [0, 0, 0.04], 1);
    B.timber.box([0, 0.04, 0], [0.86, 0, 0], [0, 0.04, 0], [0, 0, 0.26], 1);                                                          // bearers
    B.boards.box([0, 1.14, 0], [0.92, 0, 0], [0, 0.015, 0.0], [0, 0, 0.36], 2.5);                                                     // the board roof
  });
  mk('prop_well', 'prop', null, B => {
    const n = 16, R0 = 0.62, R1 = 0.86;
    for (let c = 0; c < 4; c++) for (let i = 0; i < n; i++) {     // a ring of stone blocks, coursed, the joints staggered
      const a = (i + (c % 2) * 0.5) / n * Math.PI * 2, rm = (R0 + R1) / 2, o = [Math.cos(a), 0, Math.sin(a)], t = [-Math.sin(a), 0, Math.cos(a)];
      B.stone.box([o[0] * rm, 0.12 + c * 0.22, o[2] * rm], t.map(v => v * Math.PI * rm / n * 0.98), [0, 0.105, 0], o.map(v => v * (R1 - R0) / 2), 2.5);
    }
    cylY(B.glass, 0, 0, 0.3, 0.32, R0 - 0.01, 16);                                                        // dark water
    for (const x of [-0.78, 0.78]) B.timber.box([x, 1.25, 0], [0.06, 0, 0], [0, 1.25, 0], [0, 0, 0.06], 1);   // posts
    logX(B.timber, -0.82, 0.82, 1.62, 0, 0.06, 8);                                                        // the windlass
    B.iron.box([0.9, 1.62, 0.12], [0.012, 0, 0], [0, 0.012, 0], [0, 0, 0.12], 1);                          // its crank
    for (const s of [-1, 1]) { const ang = 0.7; B.shingle.box([0, 2.22 + 0.0, s * 0.33], [1.0, 0, 0], [0, Math.sin(ang) * 0.42, -s * Math.cos(ang) * 0.42].map(v => v), [0, s * Math.cos(ang) * 0.02, Math.sin(ang) * 0.02], 2.5); }   // the little roof
    B.timber.box([0, 2.5, 0], [1.02, 0, 0], [0, 0.03, 0], [0, 0, 0.04], 1);
    cylY(B.boards, 0.0, 0.0, 1.0, 1.24, [0.11, 0.13], 10, 2.5);                                            // the bucket
    rodS(B.iron, [0, 1.24, 0], [0, 1.56, 0], 0.004);
  });
  mk('feat_shutters_plank', 'mount', null, B => shutters(B, false));
  mk('feat_shutters_louvre', 'mount', null, B => shutters(B, true));
  // shop counter: a wide opening with an oak frame; the lower shutter drops to a counter on two iron chains, the
  // upper one is propped up as a canopy
  mk('feat_shopfront', 'opening', rect(-1.1, 0.75, 1.1, 2.05), B => {
    frame(B, -1.1, 0.75, 1.1, 2.05, 0.14, false, 0.26);
    B.timber.box([0, 0.72, 0.0], [1.22, 0, 0], [0, 0.04, 0], [0, 0, 0.13], 1);                         // the sill / counter beam
    leaf(B, -1.08, 0.04, 1.08, 0.66, 0.022, { ledges: 2, brace: false, back: false });                       // counter (laid flat below)
    const cnt = B.boards; cnt.box([0, 0.74, 0.34], [1.08, 0, 0], [0, 0.02, 0], [0, 0, 0.31], T);
    // a rod from p to q, r thick (half-size)
    const rod = (m, p, q, rr) => { const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], L2 = Math.hypot(...d) / 2, u = d.map(v => v / (2 * L2)), side = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      const w = [u[1] * side[2] - u[2] * side[1], u[2] * side[0] - u[0] * side[2], u[0] * side[1] - u[1] * side[0]], wl = Math.hypot(...w), v = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      m.box([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2], u.map(x => x * L2), w.map(x => x / wl * rr), v.map(x => x / wl * rr), 1); };
    for (const x of [-0.95, 0.95]) rod(B.iron, [x, 1.95, 0.03], [x, 0.77, 0.62], 0.007);                // the counter's chains
    // the upper shutter, propped: hinged at the head, swung out and up ~60°
    const a = 1.05, L = 0.68, cy = 2.12 + Math.sin(a) * L / 2, cz = Math.cos(a) * L / 2 + 0.02;
    const n = Math.round(2.2 / 0.16), bw = 2.2 / n;
    for (let i = 0; i < n; i++) B.boards.box([-1.1 + bw * (i + 0.5), cy, cz], [bw / 2 - 0.003, 0, 0], [0, Math.sin(a) * L / 2, Math.cos(a) * L / 2], [0, -Math.cos(a) * 0.018, Math.sin(a) * 0.018], T);
    for (const x of [-0.9, 0.9]) rod(B.timber, [x, 1.55, 0.03], [x, 2.12 + Math.sin(a) * L * 0.9, Math.cos(a) * L * 0.9 + 0.01], 0.022);   // the props
  });
}

// Matte, and darker toward the foot of the building (soot, damp, splash) — done here rather than in the bake so
// tiles stack on any number of floors. Height is building-local (the building's origin is its ground line).
const hash2 = (a, b) => { const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); };
// fallen masonry at the foot of a damaged wall: rough blocks in the wall's own material, in front and behind
export function rubbleGeometry(kit, w, surf, dmg) {
  const B = meshBuilder(), tile = kit.walls[surf].tile, n = Math.round((dmg - 0.25) * w.width * 6), T = w.thick || kit.thick;
  for (let i = 0; i < n; i++) {
    const h = hash2(w.x + i * 1.3, w.z - i * 0.7), h2 = hash2(i * 2.1, w.x - w.z), h3 = hash2(h, h2);
    const x = h * w.width, z = h2 < 0.6 ? 0.08 + h3 * 0.9 * dmg : -T - 0.08 - h3 * 0.7 * dmg, s = 0.07 + 0.12 * h2 * dmg, a = h3 * 6.28;
    const ca = Math.cos(a), sa = Math.sin(a);
    B.box([x, s * 0.6, z], [ca * s * 1.4, 0.04 * (h - 0.5), sa * s * 1.4], [0, s * 0.7, 0], [-sa * s, 0.05 * (h2 - 0.5), ca * s], tile[0]);
  }
  return B.done();
}
// ---- wear: weathering (bleaching, rain streaks, stains; rust on iron), damage (cracks, chips, scorch; tattered
// cloth) and growth (moss on tops, slopes and crevices, lichen specks), from a per-vertex aWear = [w, d, g] that
// buildFromKit writes from desc.wear / part.wear. Patterns are world-space noise, so they run across seams.
const WEAR_GLSL = `
varying vec3 vWear; varying vec3 vWPos; varying vec3 vWNrm; varying float vObjY; varying vec2 vWUv;
float wh3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float wn3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wh3(i), wh3(i + vec3(1,0,0)), f.x), mix(wh3(i + vec3(0,1,0)), wh3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(wh3(i + vec3(0,0,1)), wh3(i + vec3(1,0,1)), f.x), mix(wh3(i + vec3(0,1,1)), wh3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float wf3(vec3 p) { return wn3(p) * 0.5 + wn3(p * 2.03 + 1.7) * 0.25 + wn3(p * 4.11 + 3.1) * 0.125 + wn3(p * 8.3 + 5.3) * 0.0625; }
`;
function wearify(m) {
  if (!m || m.userData.wear) return m;
  m.userData.wear = true; m.extensions = { ...(m.extensions || {}), derivatives: true };
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (s, r) => {
    if (prev) prev(s, r);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aWear;\n' + WEAR_GLSL)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWear = aWear; vObjY = position.y; vWUv = uv; vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWNrm = normalize(mat3(modelMatrix) * objectNormal);');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\n' + WEAR_GLSL)
      .replace('#include <map_fragment>', `#include <map_fragment>
  float wMoss = 0.0, wRust = 0.0, wHc = 0.0;
  if (vWear.x + vWear.y + vWear.z > 0.001) {
    vec3 P = vWPos, Nw = normalize(vWNrm); float up = Nw.y, lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
    float side = 1.0 - abs(up), base = 1.0 - smoothstep(0.0, 1.3, vObjY);
    float W = vWear.x;
    if (W > 0.0) {
      float streak = smoothstep(0.4, 0.72, wf3(vec3((P.x + P.z) * 6.5, P.y * 0.22, 0.0))) * side * (0.6 + 0.4 * wn3(P * 0.8));
      float blot = smoothstep(0.38, 0.72, wf3(P * 0.65 + 4.0));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum) * vec3(1.0, 0.97, 0.9), W * 0.42);
      diffuseColor.rgb *= 1.0 - W * (0.5 * streak + 0.2 * blot + 0.3 * base);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.86, 0.78, 0.62), W * base * 0.5);
      wRust = W * smoothstep(0.35, 0.7, wf3(P * 2.2 + 9.0) + streak * 0.3);
    }
    float D = vWear.y;
    if (D > 0.0) {
      float area = smoothstep(1.0 - D, 1.12 - D, wf3(P * 0.42 + 7.0) + D * 0.25);
      float c = abs(wn3(P * 2.7) - 0.5) + abs(wn3(P * 6.1 + 3.0) - 0.5) * 0.5;
      float crk = (1.0 - smoothstep(0.01, 0.06, c)) * area * smoothstep(0.3, 0.7, wn3(P * 1.3 + 2.0));
      float cn = wf3(P * 4.6 + 11.0), chip = smoothstep(0.64, 0.66, cn) * area, rim = (smoothstep(0.6, 0.64, cn) - chip) * area;
      diffuseColor.rgb = mix(diffuseColor.rgb, min(vec3(1.0), diffuseColor.rgb * 1.12 + 0.03), chip * 0.6);
      diffuseColor.rgb *= 1.0 - rim * 0.35;
      wHc = -(smoothstep(0.6, 0.68, cn) * area) - crk * 0.4;
      diffuseColor.rgb *= 1.0 - crk * 0.55;
      diffuseColor.rgb *= 1.0 - 0.7 * smoothstep(0.7, 0.82, wf3(P * 0.33 + 19.0)) * smoothstep(0.55, 1.0, D);
      #ifdef WEAR_TATTER
      if (wf3(P * 7.0) + (1.0 - vWUv.y) * D * 0.9 > 1.25 - D * 0.35) discard;
      #endif
    }
    float G = vWear.z;
    if (G > 0.0) {
      float m = wf3(P * 1.6 + 23.0), upw = smoothstep(-0.15, 0.85, up), crev = 1.0 - smoothstep(0.12, 0.5, lum);
      float t0 = 1.08 - G * 0.52;
      wMoss = smoothstep(t0, t0 + 0.07, m + upw * 0.25 + crev * 0.15 + base * 0.25 + (wn3(P * 11.0) - 0.5) * 0.12);
      vec3 moss = mix(vec3(0.09, 0.15, 0.04), vec3(0.3, 0.37, 0.1), wn3(P * 9.0)) * (0.75 + 0.5 * wn3(P * 31.0));
      diffuseColor.rgb = mix(diffuseColor.rgb, moss * (0.45 + lum * 1.1), wMoss * 0.85);
      float lich = smoothstep(0.78, 0.81, wn3(P * 13.0 + 5.0)) * G * (1.0 - wMoss);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.64, 0.63, 0.44), lich * 0.6);
    }
  }`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  if (wHc != 0.0 || vWear.y > 0.0) normal = normalize(normal + vec3(dFdx(wHc), dFdy(wHc), 0.0) * 7.0);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = min(1.0, roughnessFactor + vWear.x * 0.12 + wMoss * 0.3);')
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
  if (metalnessFactor > 0.15 && wRust > 0.0) { diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.34, 0.16, 0.07) * (0.7 + wn3(vWPos * 20.0) * 0.6), wRust * 0.85); metalnessFactor *= 1.0 - wRust; roughnessFactor = mix(roughnessFactor, 0.95, wRust); }`);
  };
  const key = m.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : () => '';
  m.customProgramCacheKey = () => key() + '|wear';
  m.needsUpdate = true;
  return m;
}

function grimeMaterial(map, normalMap) {
  const m = new THREE.MeshStandardMaterial({ map, normalMap, roughness: 0.92, metalness: 0 });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying float vLocalY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocalY = position.y;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vLocalY;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.0, 1.4, vLocalY));');
  };
  return m;
}

// ---------------------------------------------------------------- walls with holes
// wall = { width, height, variant, openings: [{ feature, x, y=0 }] }  (x = feature centre along the wall from its
// left end; y = feature base above the wall's base, e.g. 3 for a first-floor window in a 6 m wall)
// Does an opening feature fit inside its wall (with a 5 cm margin)? Ones that don't are skipped, not cut.
export function featureFits(kit, w, o) {
  const f = kit.features[o.feature]; if (!f) return false; if (!f.outline) return true;
  const b = f.geometry.boundingBox, x0 = o.x + b.min.x, x1 = o.x + b.max.x, y1 = (o.y || 0) + b.max.y;
  if (w.shape === 'gable') {
    const tp = Math.tan((w.pitch || 50) * Math.PI / 180), top = x => (w.width / 2 - Math.abs(x - w.width / 2)) * tp;
    return x0 > 0.05 && x1 < w.width - 0.05 && y1 < Math.min(top(x0), top(x1)) - 0.05;
  }
  const nr = notchRect(w), y0 = (o.y || 0) + b.min.y;
  if (nr && x0 < nr[2] && x1 > nr[0] && y0 < nr[3] && y1 > nr[1]) return false;
  return x0 > -0.3 && x1 < w.width + 0.3 && y1 < w.height + 0.3;
}

// The wall's face outline, anticlockwise from the left end of its bottom edge. A notch (an L wall: a square cut
// out of one corner) is { corner: 'tl' | 'tr' | 'bl' | 'br', w, h }.
export function wallOutline(w) {
  const W = w.width;
  if (w.shape === 'gable') { const H = W / 2 * Math.tan((w.pitch || 50) * Math.PI / 180); return [[0, 0], [W, 0], [W / 2, H]]; }
  const H = w.height, n = w.notch;
  if (!n || !n.corner) return [[0, 0], [W, 0], [W, H], [0, H]];
  const nw = Math.min(W - 0.1, n.w || W / 2), nh = Math.min(H - 0.1, n.h || H / 2);
  return { tr: [[0, 0], [W, 0], [W, H - nh], [W - nw, H - nh], [W - nw, H], [0, H]],
           tl: [[0, 0], [W, 0], [W, H], [nw, H], [nw, H - nh], [0, H - nh]],
           br: [[0, 0], [W - nw, 0], [W - nw, nh], [W, nh], [W, H], [0, H]],
           bl: [[nw, 0], [W, 0], [W, H], [0, H], [0, nh], [nw, nh]] }[n.corner];
}
// the notch as a rectangle [x0, y0, x1, y1] (or null)
export function notchRect(w) {
  const n = w.notch; if (!n || !n.corner || w.shape === 'gable') return null;
  const W = w.width, H = w.height, nw = Math.min(W - 0.1, n.w || W / 2), nh = Math.min(H - 0.1, n.h || H / 2);
  return { tr: [W - nw, H - nh, W, H], tl: [0, H - nh, nw, H], br: [W - nw, 0, W, nh], bl: [0, 0, nw, nh] }[n.corner];
}

// shape: 'rect' (default) or 'gable' — a triangle W wide rising at `pitch` degrees (default 50) to an apex
// over the centre; height is then derived.
export function wallGeometry(kit, wall) {
  const gable = wall.shape === 'gable', pitch = (wall.pitch || 50) * Math.PI / 180;
  const W = wall.width, H = gable ? W / 2 * Math.tan(pitch) : wall.height, T = wall.thick || kit.thick, tile = kit.walls[wall.variant].tile;
  const holes = [];
  for (const o of wall.openings || []) {
    const f = kit.features[o.feature]; if (!f || !f.outline || !featureFits(kit, wall, o)) continue;     // mounts (shutters…) cut nothing
    let pts = f.outline.map(([x, y]) => [x + o.x, y + (o.y || 0)]);
    // a door's outline reaches the wall foot: keep it a hole by lifting the bottom edge a hair (the gap is
    // the threshold; the door piece covers it)
    pts = pts.map(([x, y]) => [Math.min(W - 0.02, Math.max(0.02, x)), Math.min(H - 0.02, Math.max(f.door ? 0.0 : 0.02, y))]);
    holes.push({ pts, door: f.door });
  }
  const P = [], N = [], U = [], I = [];
  const quad = (a, b, c, d, n, uv) => {
    const i = P.length / 3;
    for (const p of [a, b, c, d]) { P.push(...p); N.push(...n); U.push(...uv(p)); }
    I.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };
  const front = (p) => [p[0] / tile[0], p[1] / tile[1]];
  // a door opens the wall foot, so the face outline goes round it rather than holding it as a hole
  const doors = holes.filter(h => h.door).sort((a, b) => a.pts[0][0] - b.pts[0][0]);
  let OL = wallOutline(wall);
  const dm = wall._dmg || 0;
  if (dm > 0.45 && !gable) {
    // a ruin: the wall top breaks back in stepped courses (never below what its openings need), and breaches open
    const k = (dm - 0.45) / 0.55, step = Math.min(0.25, tile[1] / 12 * 2), nx = Math.max(2, Math.round(W / 0.3));
    const need = x => Math.max(0.6, ...holes.filter(h => { const xs = h.pts.map(p => p[0]); return x > Math.min(...xs) - 0.15 && x < Math.max(...xs) + 0.15; }).flatMap(h => h.pts.map(p => p[1] + 0.2)));
    const ph = hash2(wall.x, wall.z) * 40, top = []; for (let i = nx; i >= 0; i--) {
      const x = W * i / nx, edge = Math.min(1, Math.min(x, W - x) / 0.8), nz = 0.5 + 0.3 * Math.sin(x * 0.9 + ph) + 0.15 * Math.sin(x * 2.3 + ph * 1.7) + 0.08 * (hash2(i, ph) - 0.5);
      const dr = k * H * 0.6 * Math.max(0, nz) * (0.35 + 0.65 * edge);
      top.push([x, Math.max(need(x), Math.round((H - dr) / step) * step)]);
    }
    const stepped = []; for (let i = 0; i < top.length; i++) { stepped.push(top[i]); if (i < top.length - 1 && top[i + 1][1] !== top[i][1]) stepped.push([top[i + 1][0], top[i][1]]); }
    if (wall._ruin && !wall.notch?.corner) OL = [[0, 0], [W, 0], ...stepped.filter(p => p[0] > 1e-4 || p === stepped[stepped.length - 1])];
    if (OL[OL.length - 1][0] > 1e-4) OL.push([0, OL[OL.length - 1][1]]);
    const topMin = wall._ruin && !wall.notch?.corner ? Math.min(...OL.slice(2).map(p => p[1])) : H;
    for (let b = 0; b < (dm > 0.7 ? 2 : 1); b++) {   // breaches: ragged holes clear of the openings and edges
      const bw = 0.5 + k * 0.6, cx = 0.8 + bw + hash2(wall.x + b * 5, wall.z - b) * (W - 1.6 - 2 * bw), cy = 0.6 + bw * 0.7 + hash2(wall.z + b, wall.x * 2) * 0.6;
      if (W < 2 * bw + 1.8 || cy + bw > topMin - 0.3) continue;
      if (holes.some(h => h.pts.some(p => Math.abs(p[0] - cx) < bw + 0.3) || (() => { const xs = h.pts.map(p => p[0]); return cx > Math.min(...xs) - bw - 0.3 && cx < Math.max(...xs) + bw + 0.3; })())) continue;
      const pts = []; for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, rr = bw * (0.65 + 0.35 * hash2(i + b, cx)); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8]); }
      holes.push({ pts, door: false, breach: true });
    }
  }
  const shape = new THREE.Shape();
  shape.moveTo(OL[0][0], OL[0][1]);
  for (const d of doors) {
    const xs = d.pts.map(p => p[0]); const l = Math.min(...xs), r = Math.max(...xs);
    shape.lineTo(l, 0);
    // walk the door outline from its left foot over the top to its right foot
    let top = d.pts.filter(p => p[1] > 0.01);       // outlines run CCW from the bottom edge: the top goes right → left
    if (top[0][0] > top[top.length - 1][0]) top = top.slice().reverse();
    for (const p of top) shape.lineTo(p[0], p[1]);
    shape.lineTo(r, 0);
  }
  for (let i = 1; i < OL.length; i++) shape.lineTo(OL[i][0], OL[i][1]);
  shape.lineTo(OL[0][0], OL[0][1]);
  for (const h of holes) if (!h.door) {
    const path = new THREE.Path(); h.pts.forEach((p, i) => i ? path.lineTo(p[0], p[1]) : path.moveTo(p[0], p[1]));
    path.closePath(); shape.holes.push(path);
  }
  const sg = new THREE.ShapeGeometry(shape, 1);
  const sp = sg.attributes.position, si = sg.index;
  // the back face's ends move in (outside corner mitre) or out (inside corner) by the join offsets
  const e0 = wall._e ? wall._e[0] : 0, e1 = wall._e ? wall._e[1] : 0;
  const bx = x => x <= 1e-4 ? e0 : x >= W - 1e-4 ? W - e1 : Math.min(W - Math.max(e1, 0), Math.max(Math.max(e0, 0), x));
  for (const [z, nz] of [[0, 1], [-T, -1]]) {
    const base = P.length / 3;
    for (let i = 0; i < sp.count; i++) {
      const x = nz > 0 ? sp.getX(i) : bx(sp.getX(i)), y = sp.getY(i);
      P.push(x, y, z); N.push(0, 0, nz); U.push(nz > 0 ? x / tile[0] : (W - x) / tile[0], y / tile[1]);
    }
    for (let i = 0; i < si.count; i += 3) {
      const a = si.getX(i), b = si.getX(i + 1), c = si.getX(i + 2);
      if (nz > 0) I.push(base + a, base + b, base + c); else I.push(base + a, base + c, base + b);
    }
  }
  sg.dispose();
  // reveals: each outline edge swept back through the wall, normal facing into the opening
  for (const h of holes) {
    const pts = h.pts, n = pts.length;
    let area = 0; for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
    const ccw = area > 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      if (h.door && a[1] < 0.01 && b[1] < 0.01) continue;       // no reveal across a threshold
      const ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey); if (L < 1e-5) continue;
      let nx = ccw ? -ey / L : ey / L, ny = ccw ? ex / L : -ex / L;   // into the opening
      const side = Math.abs(nx) > Math.abs(ny);
      const uv = (p) => side ? [(p[0] + (nx > 0 ? -1 : 1) * p[2]) / tile[0], p[1] / tile[1]]
                             : [p[0] / tile[0], (p[1] + (ny > 0 ? -1 : 1) * p[2]) / tile[1]];
      const A = [a[0], a[1], 0], B = [b[0], b[1], 0], C = [b[0], b[1], -T], D = [a[0], a[1], -T];
      if (ccw) quad(A, B, C, D, [nx, ny, 0], uv); else quad(A, D, C, B, [nx, ny, 0], uv);
    }
  }
  // the outline's edges swept back through the wall (not the foot, which sits on the ground or the storey
  // below). End caps are optional (caps: [left, right]): off where the wall butts into another at a corner.
  for (let i = 0; i < OL.length; i++) {
    const a = OL[i], b = OL[(i + 1) % OL.length];
    if (a[1] < 0.01 && b[1] < 0.01) continue;
    if (Math.abs(a[0]) < 1e-4 && Math.abs(b[0]) < 1e-4 && wall.caps && wall.caps[0] === false) continue;
    if (Math.abs(a[0] - W) < 1e-4 && Math.abs(b[0] - W) < 1e-4 && wall.caps && wall.caps[1] === false) continue;
    const ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey); if (L < 1e-5) continue;
    const n = [ey / L, -ex / L, 0], vert = Math.abs(n[0]) > Math.abs(n[1]);
    const uv = vert ? (p => [-p[2] / tile[0], p[1] / tile[1]]) : (p => [p[0] / tile[0], -p[2] / tile[1]]);
    const ba = bx(a[0]), bb = bx(b[0]);
    const nn = (ba !== a[0] || bb !== b[0]) ? (() => { const v1 = [ba - a[0], 0, -T], v2 = [b[0] - a[0], b[1] - a[1], 0];
      const c = [v1[1] * v2[2] - v1[2] * v2[1], v1[2] * v2[0] - v1[0] * v2[2], v1[0] * v2[1] - v1[1] * v2[0]], l = Math.hypot(...c) || 1; return c.map(q => q / l); })() : n;
    quad([a[0], a[1], 0], [ba, a[1], -T], [bb, b[1], -T], [b[0], b[1], 0], nn, uv);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  return g;
}

// ---------------------------------------------------------------- wall joins
// Walls drawn separately meet without overlapping: where two walls' ends meet at a corner both are mitred (the
// back face of each stops short — or runs on, at an inside corner — so the tops and faces never share a plane);
// a wall running straight on from another, or ending against another's face, drops its end cap.
// Returns, per wall, { e: [left, right] back-face offsets, caps: [left, right], kind: [left, right] } where kind is
// 'out' | 'in' | 'butt' | null (what a trim running into that end should do).
export function joinWalls(kit, walls) {
  const T = kit.thick, out = new Map();
  const info = w => {
    const r = w.rot || 0, d = [Math.cos(r), -Math.sin(r)], n = [Math.sin(r), Math.cos(r)];
    return { w, d, n, P: [[w.x, w.z], [w.x + d[0] * w.width, w.z + d[1] * w.width]], y0: w.base || 0, y1: (w.base || 0) + (w.shape === 'gable' ? 0.1 : (w.height || 3)) };
  };
  const L = walls.filter(w => w.shape !== 'gable').map(info);
  for (const a of L) out.set(a.w, { e: [0, 0], caps: [...(a.w.caps || [true, true])].map(c => c !== false), kind: [null, null] });
  for (const a of L) for (let k = 0; k < 2; k++) {
    const P = a.P[k], tA = k ? a.d : [-a.d[0], -a.d[1]], ra = out.get(a.w);
    for (const b of L) {
      if (b === a || b.y1 <= a.y0 + 0.01 || b.y0 >= a.y1 - 0.01) continue;
      let hit = false;
      for (let j = 0; j < 2 && !hit; j++) {
        const Q = b.P[j]; if (Math.hypot(P[0] - Q[0], P[1] - Q[1]) > 0.12) continue;
        const tB = j ? [-b.d[0], -b.d[1]] : b.d;                       // from the shared point into b
        const c = -(tA[0] * tB[0] + tA[1] * tB[1]);                      // cos of the corner angle between the walls
        if (c < -0.97) { ra.caps[k] = false; ra.kind[k] = 'butt'; hit = true; break; }   // straight on
        if (c > 0.97) continue;                                          // folded back on itself: leave it
        const phi = Math.acos(Math.max(-1, Math.min(1, c))), off = Math.min(T * 3, T / Math.tan(phi / 2));
        const outside = tB[0] * a.n[0] + tB[1] * a.n[1] < 0;             // b runs off behind a: a convex (outside) corner
        ra.e[k] = outside ? off : -off; ra.caps[k] = false; ra.kind[k] = outside ? 'out' : 'in'; hit = true;
      }
      if (hit) break;
      // ending against b's face (a T): the cap is hidden in b
      const dx = P[0] - b.P[0][0], dz = P[1] - b.P[0][1], lx = dx * b.d[0] + dz * b.d[1], lz = dx * b.n[0] + dz * b.n[1];
      if (lx > 0.05 && lx < b.w.width - 0.05 && lz > -T - 0.08 && lz < 0.08) { ra.caps[k] = false; ra.kind[k] = 'butt'; break; }
    }
  }
  return out;
}

// ---------------------------------------------------------------- buildings
// desc = { walls: [{ x, z, rot, width, height, base=0, variant, openings }] }  — each wall's left front corner at
// (x, base, z) in building space, running along +x rotated by rot (radians about y). Returns
// { group, colliders: [{ center: Vector3, size: Vector3, rot }] } with one merged mesh per material.
export function buildFromKit(kit, desc) {
  const parts = {};   // material key → [geometry, matrix]
  const colliders = [];
  // wear: [weathering, damage, growth] 0–1, on the whole building (desc.wear) or on any part (part.wear)
  const W0 = desc.wear || [0, 0, 0]; let cw = W0; const wr = o => (cw = o && o.wear ? o.wear : W0);
  const add = (key, g, m) => (parts[key] = parts[key] || []).push([g, m, cw]);
  // growth over ~0.35 brings ivy up walls that have none (deterministic patches from the wall's position)
  const walls = desc.walls.map(w => {
    const G = (w.wear || W0)[2] || 0; if (G < 0.35 || (w.vines && w.vines.length) || w.shape === 'gable') return w;
    const n = Math.max(1, Math.round(G * w.width / 5)), H = w.height || 3, vines = [];
    for (let i = 0; i < n; i++) { const h = hash2(w.x * 3.1 + i, w.z * 1.7 - i); if (h > 0.35 + G * 0.6) continue; vines.push({ x: w.width * (i + 0.3 + h * 0.4) / n, y: 0, width: Math.min(w.width / n, 0.9 + G * 1.4 * h), height: Math.min(H, 0.6 + (G - 0.3) * 4 * (0.5 + h)), seed: (h * 1e4) | 0, out: 0.05 }); }
    return { ...w, vines };
  });
  // a damaged wall crumbles at the top only where nothing stands on it: the top storey of a roofless building
  const roofed = new Set((desc.roofs || []).map(r => r.g ?? '_')), topOf = new Map();
  for (const w of walls) { const k = w.g ?? '_', t = (w.base || 0) + (w.height || 0); topOf.set(k, Math.max(topOf.get(k) || 0, t)); }
  const canRuin = w => !roofed.has(w.g ?? '_') && Math.abs((w.base || 0) + (w.height || 0) - topOf.get(w.g ?? '_')) < 0.05;
  const joins = desc.autoJoin === false ? new Map() : joinWalls(kit, walls);
  const vinePlan = planVines(walls);
  for (const w0 of walls) {
    wr(w0); const J = joins.get(w0), w = J ? { ...w0, caps: J.caps, _e: J.e } : w0;
    const m = new THREE.Matrix4().makeRotationY(w.rot || 0).setPosition(w.x, w.base || 0, w.z);
    const frame = FRAMES[w.variant];
    const surf = frame ? (kit.walls[w.infill] ? w.infill : frame.surface) : w.variant;
    const dmg = cw[1] || 0;
    add('wall:' + surf, wallGeometry(kit, { ...w, variant: surf, _dmg: dmg, _ruin: canRuin(w0) }), m);
    if (dmg > 0.3 && !(w.base > 0)) add('wall:' + surf, rubbleGeometry(kit, w, surf, dmg), m);
    if (frame) add('timber', timberFrame(kit, w, frame.pattern), m);
    for (const o of w.openings || []) {
      const f = kit.features[o.feature]; if (!f || !featureFits(kit, w, o)) continue;
      const fm = m.clone().multiply(new THREE.Matrix4().makeTranslation(o.x, o.y || 0, 0));
      if (o.sx || o.sy) fm.multiply(new THREE.Matrix4().makeScale(o.sx || 1, o.sy || 1, 1));
      if (f.parts) for (const k in f.parts) add(k, f.parts[k], fm); else add('features', f.geometry, fm);
      if (o.feature === 'feat_flowerbox' && o.flowers && o.flowers !== 'none') add('flora', flowerGeometry(o), fm);
      if (f.door && !(w.base > 0) && (o.y || 0) < 0.1 && o.step !== false) add('trims', stepGeometry(kit, f, o), m);
    }
    for (const c of w.canopies || []) { const g = canopyGeometry(kit, c); for (const k in g) add(k, g[k], m); }
    // a balustrade parapet along the wall top (or anywhere): whole bays stretched to fill the run, a die at each end
    const bal = kit.features.feat_balustrade;
    if (bal) for (const r of w.balustrades || []) {
      const x0 = r.x0 ?? 0, x1 = r.x1 ?? w.width, n = Math.max(1, Math.round((x1 - x0) / 1.2)), bw = (x1 - x0) / n, y = r.y ?? (w.height || 3);
      for (let i = 0; i < n; i++) add('features', bal.geometry, m.clone().multiply(new THREE.Matrix4().makeTranslation(x0 + bw * (i + 0.5), y, 0)).multiply(new THREE.Matrix4().makeScale(bw / 1.2, 1, 1)));
    }
    for (const p of w.pipes || []) add('lead', pipeGeometry(kit, w, p), m);
    if (w.jetty > 0) add('timber', jettyGeometry(w), m);
    for (const pd of w.pediments || []) { const g = pedimentGeometry(kit, pd, 0.02, w.thick || 0.3); for (const k in g) add(k, g[k], m); }
    for (const bn of w.banners || []) { const g = bannerGeometry(kit, bn); for (const k in g) add(k, g[k], m); }
    if (w.decals && w.decals.length) add('decals', decalGeometry(w.decals), m);
    for (const cl of vinePlan.get(w0) || []) add('vines', vineGeometry(kit, w, cl), m);
    colliders.push(...wallColliders(kit, w, m));
  }
  for (const t of desc.trims || []) { wr(t);
    const m = new THREE.Matrix4().makeRotationY(t.rot || 0).setPosition(t.x, t.base || 0, t.z);
    const pv = t.variant && kit.trims[t.trim]?.variants?.[t.variant] && kit.materials.plinths;
    const sheet = kit.trims[t.trim]?.sheet === 'civic' && kit.materials.civic ? 'civic' : null;
    add(sheet || (pv ? 'plinths' : 'trims'), trimGeometry(kit, t.trim, t.length, t.ends || [0, 0], pv ? t.variant : null), m);
  }
  for (const r of desc.roofs || []) { wr(r);
    const m = new THREE.Matrix4().makeRotationY(r.rot || 0).setPosition(r.x, r.base || 0, r.z);
    const g = roofGeometry(kit, r, cw);
    for (const k in g) add(k, g[k], m);
  }
  for (const c of desc.chimneys || []) { wr(c);
    const m = new THREE.Matrix4().makeRotationY(c.rot || 0).setPosition(c.x, c.base || 0, c.z);
    const g = c.turret ? turretGeometry(kit, c) : chimneyGeometry(kit, c);
    for (const k in g) add(k, g[k], m);
  }
  // props: free-standing pieces (porch columns, posts): { prop, x, z, rot, base, height } (height stretches it)
  for (const p of desc.props || []) { wr(p);
    const f = kit.features[p.prop]; if (!f) continue;
    const bbp = f.geometry.boundingBox, h0 = bbp.max.y, ph = f.code && !f.column ? h0 : (p.height || h0), k = ph / h0;   // (code props keep their own size)
    const m = new THREE.Matrix4().makeRotationY(p.rot || 0).setPosition(p.x, p.base || 0, p.z).multiply(new THREE.Matrix4().makeScale(1, k, 1));
    if (f.column) { const g = columnParts(kit, f.column, p.height || 3); m.multiply(new THREE.Matrix4().makeScale(1, 1 / k, 1)); for (const key in g) add(key, g[key], m); }
    else if (f.parts) for (const key in f.parts) add(key, f.parts[key], m); else add('features', f.geometry, m);
    const sx = f.code ? bbp.max.x - bbp.min.x : 0.36, sz = f.code ? bbp.max.z - bbp.min.z : 0.36;
    colliders.push({ center: new THREE.Vector3(p.x, (p.base || 0) + ph / 2, p.z), size: new THREE.Vector3(sx, ph, sz), rot: p.rot || 0 });
    // lanterns and signs mounted on the post: { feature, side (0–3, quarter turns), y }
    const rad = PROP_RADIUS[p.prop] ?? 0.12;
    for (const pm of p.mounts || []) {
      const mf = kit.features[pm.feature]; if (!mf) continue;
      add('features', mf.geometry, new THREE.Matrix4().makeRotationY((p.rot || 0) + (pm.side || 0) * Math.PI / 2).setPosition(p.x, p.base || 0, p.z).multiply(new THREE.Matrix4().makeTranslation(0, pm.y ?? 2.1, rad)));
    }
  }
  for (const f of desc.fences || []) { wr(f);
    const m = new THREE.Matrix4().makeRotationY(f.rot || 0).setPosition(f.x, f.base || 0, f.z);
    const { geo, boxes } = fenceGeometry(kit, { ...f, cuts: fenceCuts(kit, f, walls) });
    for (const k in geo) add(k, geo[k], m);
    for (const b of boxes) colliders.push({ center: new THREE.Vector3(...b.c).applyMatrix4(m), size: new THREE.Vector3(...b.s), rot: f.rot || 0 });
  }
  wr(null); if (desc.floorDecals && desc.floorDecals.length) add('decals', floorDecalGeometry(desc.floorDecals), new THREE.Matrix4());
  // platforms and steps: { kind: 'platform' | 'steps', x, z, rot, base, width, depth, height, material: 'stone' | 'oak' }
  // origin at the middle of the back edge (against the wall / the platform), running out along local +z
  for (const p of desc.platforms || []) { wr(p);
    const m = new THREE.Matrix4().makeRotationY(p.rot || 0).setPosition(p.x, p.base || 0, p.z);
    const { geo, boxes } = platformGeometry(kit, p);
    for (const k in geo) add(k, geo[k], m);
    for (const b of boxes) colliders.push({ center: new THREE.Vector3(...b.c).applyMatrix4(m), size: new THREE.Vector3(...b.s), rot: p.rot || 0 });
  }
  // corner: { x, z, rot, base, height } — the corner edge at (x, z), face 1 running along the rotated +x, face 2
  // along the rotated −z (the left end of a wall placed with the same x, z, rot)
  const q = kit.features.feat_quoin;
  for (const c of desc.corners || []) if (q) { wr(c);
    const n = Math.max(1, Math.round(c.height / q.unit));
    for (let i = 0; i < n; i++)
      add('features', q.geometry, new THREE.Matrix4().makeRotationY(c.rot || 0).setPosition(c.x, (c.base || 0) + i * q.unit, c.z));
  }
  const group = new THREE.Group();
  for (const [key, list] of Object.entries(parts)) {
    const mesh = new THREE.Mesh(mergeGeometries(list), wearify(kit.materials[key]));
    mesh.castShadow = mesh.receiveShadow = true; mesh.name = key; group.add(mesh);
    if (key === 'vines') mesh.customDepthMaterial = kit.vineDepth;
    if (key === 'flora') mesh.customDepthMaterial = kit.floraDepth;
    if (key === 'decals') { mesh.castShadow = false; mesh.renderOrder = 2; }
  }
  return { group, colliders };
}

// A trim profile swept along x from 0 to length. Profile points are [d out of the wall, h up]; ends: [left, right]
// as +1 mitre (outside corner), −1 mitre (inside corner), 0 flat with an end cap.
export function trimGeometry(kit, name, length, ends = [0, 0], variant = null) {
  const t = kit.trims[name], p = t.profile, [v0, v1] = (variant && t.variants && t.variants[variant]) || t.v;
  const s = [0]; for (let i = 1; i < p.length; i++) s.push(s[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  const S = s[s.length - 1], P = [], N = [], U = [], I = [];
  const xl = (d) => -ends[0] * d, xr = (d) => length + ends[1] * d;
  for (let i = 0; i < p.length - 1; i++) {
    const [d0, h0] = p[i], [d1, h1] = p[i + 1];
    const ex = d1 - d0, ey = h1 - h0, L = Math.hypot(ex, ey) || 1, n = [0, -ex / L, ey / L];   // [x, y, z]: out/up
    const b = P.length / 3;
    const vtx = [[xl(d0), h0, d0, s[i]], [xr(d0), h0, d0, s[i]], [xr(d1), h1, d1, s[i + 1]], [xl(d1), h1, d1, s[i + 1]]];
    for (const [x, y, z, si] of vtx) { P.push(x, y, z); N.push(...n); U.push(x / t.tile, v0 + (v1 - v0) * (0.01 + 0.98 * si / S)); }
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  // flat end caps: the profile's cross-section against the wall
  for (const [e, x, dir] of [[ends[0], 0, -1], [ends[1], length, 1]]) {
    if (e) continue;
    const b = P.length / 3, pts = [[0, p[0][1]], ...p, [0, p[p.length - 1][1]]];
    for (const [d, h] of pts) { P.push(x, h, d); N.push(dir, 0, 0); U.push(d / t.tile + 0.3, v0 + 0.02); }
    for (let i = 1; i < pts.length - 1; i++) dir > 0 ? I.push(b, b + i, b + i + 1) : I.push(b, b + i + 1, b + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  return g;
}

// ---------------------------------------------------------------- vines
// vine = { x, y=0, width, height, seed, out=0.04, density=1 } on a wall (x = centre along the wall, y = base). Stems climb from the
// foot, wander, branch and stop short of openings; leaves are alpha-tested cards angled out from the wall.
// Each seed grows a different patch, so the same vine never repeats.
const LEAF_CELLS = [[0, 0.5], [0.5, 0.5], [0, 0]], STEM_CELL = [0.5, 0];
function rng(seed) { let a = (seed * 2654435761) >>> 0 || 1; return () => ((a = (a ^ (a << 13)) >>> 0, a = (a ^ (a >>> 17)) >>> 0, a = (a ^ (a << 5)) >>> 0) / 4294967296); }
function inPoly(x, y, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const vineCache = new Map();
// Ivy patches that touch or overlap on a wall grow as one plant (a cluster); a cluster sitting on top of one on the
// wall below carries its main stems on. planVines works the clusters out for a whole building; vineGeometry grows one.
// cluster = { rects: [[x0, y0, x1, y1]], seed, out, density, entries: [x] (stems arriving from below at the foot),
// exits: [x] (stems that must climb out of the top) }
export function planVines(walls) {
  const out = new Map(), lineOf = w => { const r = w.rot || 0, d = [Math.cos(r), -Math.sin(r)]; return { d, n: [-d[1], d[0]], c: w.x * -d[1] + w.z * d[0], s0: w.x * d[0] + w.z * d[1] }; };
  for (const w of walls) {
    const vs = (w.vines || []).map(v => ({ v, r: [v.x - v.width / 2, v.y || 0, v.x + v.width / 2, (v.y || 0) + v.height] }));
    const clusters = [];
    for (const it of vs) {                                       // union of patches within 15 cm of each other
      const near = clusters.filter(c => c.items.some(o => it.r[0] < o.r[2] + 0.15 && it.r[2] > o.r[0] - 0.15 && it.r[1] < o.r[3] + 0.15 && it.r[3] > o.r[1] - 0.15));
      const merged = { items: [it, ...near.flatMap(c => c.items)] };
      for (const c of near) clusters.splice(clusters.indexOf(c), 1);
      clusters.push(merged);
    }
    out.set(w, clusters.map(c => ({ rects: c.items.map(o => o.r), seed: c.items.reduce((a, o) => a + (o.v.seed || 1), 0),
      out: Math.max(...c.items.map(o => o.v.out ?? 0.04)), density: c.items.reduce((a, o) => a + (o.v.density ?? 1), 0) / c.items.length, entries: [], exits: [] })));
  }
  // storeys: a wall directly on top of another, in line with it — share crossing points on a grid fixed to the line
  for (const lo of walls) for (const hi of walls) {
    if (lo === hi || !out.get(lo).length || !out.get(hi).length) continue;
    if (Math.abs(((hi.base || 0)) - ((lo.base || 0) + (lo.height || 3))) > 0.05) continue;
    const A = lineOf(lo), Bl = lineOf(hi);
    if (A.d[0] * Bl.d[0] + A.d[1] * Bl.d[1] < 0.999 || Math.abs(A.c - Bl.c) > 0.05) continue;
    const H = lo.height || 3;
    for (const cl of out.get(lo)) for (const ch of out.get(hi)) {
      // lower cluster reaching the top of its wall, upper cluster touching its foot, over the same stretch
      for (const r of cl.rects) for (const q of ch.rects) {
        if (r[3] < H - 0.15 || q[1] > 0.15) continue;
        const t0 = Math.max(A.s0 + r[0], Bl.s0 + q[0]), t1 = Math.min(A.s0 + r[2], Bl.s0 + q[2]); if (t1 - t0 < 0.3) continue;
        for (let k = Math.ceil(t0 / 0.55); k * 0.55 < t1; k++) {
          const h = Math.sin(k * 12.9898 + A.c * 78.233) * 43758.5453, t = (k + 0.15 + 0.7 * (h - Math.floor(h))) * 0.55;
          if (t <= t0 + 0.08 || t >= t1 - 0.08) continue;
          cl.exits.push(+(t - A.s0).toFixed(3)); ch.entries.push(+(t - Bl.s0).toFixed(3));
        }
      }
    }
  }
  return out;
}
export function vineGeometry(kit, wall, cl) {
  if (!cl.rects) cl = { rects: [[cl.x - cl.width / 2, cl.y || 0, cl.x + cl.width / 2, (cl.y || 0) + cl.height]], seed: cl.seed, out: cl.out, density: cl.density, entries: [], exits: [] };
  const key = JSON.stringify([cl, wall.width, wall.height, wall.openings || []]);
  let g = vineCache.get(key);
  if (!g) { g = growVine(kit, wall, cl); vineCache.set(key, g); if (vineCache.size > 300) vineCache.delete(vineCache.keys().next().value); }
  return g;
}
function growVine(kit, wall, cl) {
  const R = rng(cl.seed || 1), rects = cl.rects, H = wall.height || 3;
  const inside = (x, y) => rects.some(r => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3] + 0.02) && x >= 0 && x <= wall.width;
  const topAt = (x, y) => { let t = y; for (let k = 0; k < 80 && inside(x, t + 0.1); k++) t += 0.1; return t; };   // how far up the union goes here
  const holes = (wall.openings || []).map(o => [o, kit.features[o.feature]]).filter(([, f]) => f && f.outline)
    .map(([o, f]) => f.outline.map(([x, y]) => [x + o.x, y + (o.y || 0)]));
  const blocked = (x, y) => holes.some(h => inPoly(x, y, h) || inPoly(x - 0.12, y, h) || inPoly(x + 0.12, y, h) || inPoly(x, y + 0.1, h));
  const out = cl.out ?? 0.04, dens = cl.density ?? 1;
  const P = [], N = [], U = [], C = [], I = [];
  const quad = (pts, n, uvs, col) => {
    const b = P.length / 3;
    pts.forEach((p, i) => { P.push(...p); N.push(...n); U.push(...uvs[i]); C.push(...col); });
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  const ylo = Math.min(...rects.map(r => r[1])), yhi = Math.max(...rects.map(r => r[3]));
  const leaf = (cx, cy) => {
    const top = (cy - ylo) / Math.max(0.5, yhi - ylo);
    const s = 0.09 + R() * 0.08, a = (R() - 0.5) * 1.8, t = 0.35 + R() * 0.6, z = out + R() * 0.07;
    const e1 = [Math.cos(a) * s, Math.sin(a) * s, 0], e2 = [-Math.sin(a) * Math.cos(t) * s, Math.cos(a) * Math.cos(t) * s, Math.sin(t) * s];
    const c = [cx, cy, z], p = (k1, k2) => [c[0] + e1[0] * k1 + e2[0] * k2, c[1] + e1[1] * k1 + e2[1] * k2, c[2] + e1[2] * k1 + e2[2] * k2];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], L = Math.hypot(...n);
    const [u0, v0] = LEAF_CELLS[(R() * 3) | 0], g = 0.7 + R() * 0.45 + top * 0.25, y = R() * 0.15 * top;
    quad([p(-0.5, 0), p(0.5, 0), p(0.5, 1), p(-0.5, 1)], n.map(q => q / L), [[u0, v0], [u0 + 0.5, v0], [u0 + 0.5, v0 + 0.5], [u0, v0 + 0.5]],
      [g * (1 + y), g * (1 + y * 0.6), g * (1 - y)]);
  };
  const stem = (ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, px = -dy / L * 0.009, py = dx / L * 0.009, z = out * 0.6 + 0.008;
    const [u0, v0] = STEM_CELL;
    quad([[ax - px, ay - py, z], [ax + px, ay + py, z], [bx + px, by + py, z], [bx - px, by - py, z]], [0, 0, 1],
      [[u0, v0 + 0.02], [u0 + 0.5, v0 + 0.02], [u0 + 0.5, v0 + 0.48], [u0, v0 + 0.48]], [1, 1, 1]);
  };
  const tips = [];
  // roots: along every patch's foot where nothing grows below it (and no stem arrives from the wall below)
  for (const r of rects) {
    const n = Math.max(1, Math.round((r[2] - r[0]) / 0.45));
    for (let i = 0; i < n; i++) {
      const x = r[0] + (i + 0.2 + R() * 0.6) * (r[2] - r[0]) / n;
      if (inside(x, r[1] - 0.06)) continue;
      if (r[1] < 0.15 && cl.entries.some(e => Math.abs(e - x) < 0.3)) continue;
      tips.push({ x, y: r[1], d: (R() - 0.5) * 0.4, life: (topAt(x, r[1]) - r[1]) * (0.55 + R() * 0.55) });
    }
  }
  // main stems: carried on from the wall below, and climbing out to the wall above
  for (const x of cl.entries) tips.push({ x, y: 0, d: 0, life: topAt(x, 0) + 0.2, trunk: true });
  for (const x of cl.exits) if (!cl.entries.some(e => Math.abs(e - x) < 0.2)) {
    let y = H - 0.05; while (y > 0 && inside(x, y - 0.1)) y -= 0.1;
    tips.push({ x, y, d: 0, life: H - y + 0.2, trunk: true, aim: x });
  }
  let guard = 0;
  while (tips.length && guard++ < 1500) {
    const t = tips.pop(); let len = 0, steps = 0;
    while (len < t.life && steps++ < 400) {
      t.d = t.trunk ? t.d * 0.7 + (R() - 0.5) * 0.35 + (t.aim !== undefined ? (t.aim - t.x) * 0.6 : 0) : t.d * 0.88 + (R() - 0.5) * 0.55;
      let nx = t.x + Math.sin(t.d) * 0.07, ny = t.y + Math.cos(t.d) * 0.07;
      if (blocked(nx, ny)) {
        const side = t.side || (t.side = R() < 0.5 ? -1 : 1); let ok = false;
        for (const turn of [1.2, 1.57, -1.2, -1.57]) {
          const d = turn * side; nx = t.x + Math.sin(d) * 0.07; ny = t.y + Math.cos(d) * 0.07;
          if (!blocked(nx, ny)) { t.d = d * 0.5; ok = true; break; }
        }
        if (!ok) break;
      } else t.side = 0;
      if (t.trunk && ny > H) { if (t.aim !== undefined || cl.exits.some(e => Math.abs(e - nx) < 0.4)) { stem(t.x, t.y, t.aim ?? nx, H + 0.01); } break; }
      if (!inside(nx, ny)) { if (t.trunk && ny <= H && steps < 300) { t.d = -t.d * 0.5 - Math.sign(t.d || 1) * 0.3; len += 0.02; continue; } break; }
      stem(t.x, t.y, nx, ny); t.x = nx; t.y = ny; len += 0.07;
      for (let k = 0; k < 3; k++) if (R() < (t.trunk ? 0.45 : 0.8) * dens) {
        const lx = nx + (R() - 0.5) * 0.24, ly = ny + (R() - 0.5) * 0.12;
        if (inside(lx, ly) && !blocked(lx, ly)) leaf(lx, ly);
      }
      if (R() < (t.trunk ? 0.08 : 0.14)) tips.push({ x: nx, y: ny, d: t.d + (R() < 0.5 ? -1 : 1) * (0.6 + R() * 0.5), life: Math.min(t.trunk ? 1.6 : t.life - len, topAt(nx, ny) - ny) * (0.4 + R() * 0.6) });
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(I);
  return g;
}

// ---------------------------------------------------------------- timber framing
// A timber wall is lime plaster with a real oak frame laid out for THAT wall: posts at the ends, a sole plate,
// plates at every floor line and the head, a rail at sill height, studs (close) or braced bays (cross).
// Every opening gets trimmer studs either side, a header over it and a sill beam under it; studs and rails
// stop at it, and braces only go in bays with nothing in them.
export const FRAMES = {
  timber_close: { surface: 'plaster', pattern: 'close' }, timber_close_fresh: { surface: 'plaster_fresh', pattern: 'close' }, timber_close_cracked: { surface: 'plaster_cracked', pattern: 'close' },
  timber_cross: { surface: 'plaster', pattern: 'cross' }, timber_cross_fresh: { surface: 'plaster_fresh', pattern: 'cross' }, timber_cross_cracked: { surface: 'plaster_cracked', pattern: 'cross' },
};
export function timberFrame(kit, w, pattern) {
  const gable = w.shape === 'gable', tp = Math.tan((w.pitch || 50) * Math.PI / 180);
  const W = w.width, H = gable ? W / 2 * tp : w.height, R = rng((w.seed || 7) + Math.round(W * 100 + H * 10));
  const obs = (w.openings || []).map(o => [o, kit.features[o.feature]]).filter(([, f]) => f && f.outline).map(([o, f]) => {
    const b = f.geometry.boundingBox;
    return [o.x + b.min.x - 0.02, (o.y || 0) + b.min.y - 0.02, o.x + b.max.x + 0.02, (o.y || 0) + b.max.y + 0.02];
  });
  const nr = notchRect(w); if (nr) obs.push([nr[0] - 0.02, nr[1] - 0.02, nr[2] + 0.02, nr[3] + 0.02]);
  const hit = (r, o) => r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1];
  const P = [], N = [], U = [], I = [];
  const quad = (a, b, c, d, n, uv) => { const i = P.length / 3; for (const [p, t] of [[a, uv[0]], [b, uv[1]], [c, uv[2]], [d, uv[3]]]) { P.push(...p); N.push(...n); U.push(...t); } I.push(i, i + 1, i + 2, i, i + 2, i + 3); };
  // an oak timber centred (cx, cy), len along angle a, wid across, front face proud by z
  const timber = (cx, cy, len, wid, a, z) => {
    const ca = Math.cos(a), sa = Math.sin(a), ex = [ca * len / 2, sa * len / 2], ey = [-sa * wid / 2, ca * wid / 2];
    const c = (i, j, zz) => [cx + ex[0] * i + ey[0] * j, cy + ex[1] * i + ey[1] * j, zz];
    const u0 = R() * 4, L = len / 1.0, V = wid / 0.25 * 0.5, zb = -0.01;
    quad(c(-1, -1, z), c(1, -1, z), c(1, 1, z), c(-1, 1, z), [0, 0, 1], [[u0, 0], [u0 + L, 0], [u0 + L, V], [u0, V]]);
    const sides = [[c(-1, -1, zb), c(1, -1, zb), c(1, -1, z), c(-1, -1, z), [sa, -ca, 0]], [c(1, 1, zb), c(-1, 1, zb), c(-1, 1, z), c(1, 1, z), [-sa, ca, 0]],
      [c(1, -1, zb), c(1, 1, zb), c(1, 1, z), c(1, -1, z), [ca, sa, 0]], [c(-1, 1, zb), c(-1, -1, zb), c(-1, -1, z), c(-1, 1, z), [-ca, -sa, 0]]];
    for (const [a1, b1, c1, d1, n] of sides) quad(a1, b1, c1, d1, n, [[u0, 0], [u0 + L, 0], [u0 + L, 0.12], [u0, 0.12]]);
  };
  // axis-aligned beam [x0,y0,x1,y1], with the openings cut out of it
  const rect = (r, z) => {
    let parts = [[Math.max(0, r[0]), Math.max(0, r[1]), Math.min(W, r[2]), Math.min(H, r[3])]];
    for (const o of obs) parts = parts.flatMap(p => !hit(p, o) ? [p] : [[p[0], p[1], o[0], p[3]], [o[2], p[1], p[2], p[3]], [Math.max(p[0], o[0]), p[1], Math.min(p[2], o[2]), o[1]], [Math.max(p[0], o[0]), o[3], Math.min(p[2], o[2]), p[3]]]);
    for (const [x0, y0, x1, y1] of parts) {
      const dx = x1 - x0, dy = y1 - y0; if (dx < 0.06 || dy < 0.06) continue;
      if (dx >= dy) timber((x0 + x1) / 2, (y0 + y1) / 2, dx, dy, 0, z); else timber((x0 + x1) / 2, (y0 + y1) / 2, dy, dx, Math.PI / 2, z);
    }
  };
  const brace = (x0, y0, x1, y1, wid, z) => timber((x0 + x1) / 2, (y0 + y1) / 2, Math.hypot(x1 - x0, y1 - y0), wid, Math.atan2(y1 - y0, x1 - x0), z);
  // proud heights differ a hair per class so crossing timbers never share a face
  const Z = { post: 0.036, plate: 0.034, trim: 0.033, rail: 0.031, stud: 0.029, brace: 0.027 };
  if (gable) {                    // a gable: plate, rafters under the verge, king post, collar, studs to the slope
    const top = x => (W / 2 - Math.abs(x - W / 2)) * tp;
    rect([0, 0, W, 0.2], Z.plate);
    const rw = 0.2, off = rw / 2 / Math.cos(Math.atan(tp));
    brace(0, off, W / 2, H - off, rw, Z.post); brace(W, off, W / 2, H - off, rw, Z.post);
    rect([W / 2 - 0.09, 0.2, W / 2 + 0.09, H - 0.2], Z.trim);
    const cy = H * 0.5, cx = (cy + 0.2) / tp; if (W / 2 - cx > 0.3) rect([cx, cy - 0.08, W - cx, cy + 0.08], Z.rail);
    for (const o of obs) { rect([o[0] - 0.15, 0.2, o[0], Math.min(top(o[0]), H) - 0.15], Z.trim); rect([o[2], 0.2, o[2] + 0.15, top(o[2] + 0.15) - 0.15], Z.trim);
      rect([o[0] - 0.15, o[3], o[2] + 0.15, o[3] + 0.15], Z.rail); if (o[1] > 0.3) rect([o[0] - 0.15, o[1] - 0.15, o[2] + 0.15, o[1]], Z.rail); }
    const sp = pattern === 'close' ? 0.42 : 0.9, n = Math.max(1, Math.round(W / sp));
    for (let i = 1; i < n; i++) {
      const x = i * W / n, y1 = top(x) - 0.17;
      if (Math.abs(x - W / 2) < 0.24 || y1 < 0.45 || obs.some(o => Math.abs(x - o[0] + 0.075) < 0.24 || Math.abs(x - o[2] - 0.075) < 0.24)) continue;
      rect([x - 0.07, 0.2, x + 0.07, y1], Z.stud);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); return g;
  }
  rect([0, 0, 0.22, H], Z.post); rect([W - 0.22, 0, W, H], Z.post);
  const floors = Math.max(1, Math.round(H / 3));
  rect([0, 0, W, 0.22], Z.plate); rect([0, H - 0.2, W, H], Z.plate);
  for (let k = 1; k < floors; k++) rect([0, k * 3 - 0.12, W, k * 3 + 0.12], Z.plate);
  for (let k = 0; k < floors; k++) {
    const y0 = k * 3 + (k ? 0.12 : 0.22), y1 = Math.min(H, (k + 1) * 3) - (k + 1 < floors ? 0.12 : 0.2), rail = k * 3 + 1.0;
    const here = obs.filter(o => o[1] < y1 && o[3] > y0);
    const vx = [0.11, W - 0.11];
    for (const o of here) {                                   // trimmers, header, sill
      rect([o[0] - 0.15, y0, o[0], y1], Z.trim); rect([o[2], y0, o[2] + 0.15, y1], Z.trim); vx.push(o[0] - 0.075, o[2] + 0.075);
      if (o[3] < y1 - 0.08) rect([o[0] - 0.15, o[3], o[2] + 0.15, o[3] + 0.15], Z.rail);
      if (o[1] > y0 + 0.08) rect([o[0] - 0.15, o[1] - 0.15, o[2] + 0.15, o[1]], Z.rail);
    }
    rect([0, rail - 0.08, W, rail + 0.08], Z.rail);
    const spacing = pattern === 'close' ? 0.42 : 1.25, n = Math.max(1, Math.round(W / spacing)), studs = [];
    for (let i = 1; i < n; i++) { const x = i * W / n; if (vx.every(v => Math.abs(v - x) > 0.24)) studs.push(x); }
    for (const x of studs) rect([x - (pattern === 'close' ? 0.07 : 0.09), y0, x + (pattern === 'close' ? 0.07 : 0.09), y1], Z.stud);
    if (pattern === 'cross') {
      const xs = [...vx, ...studs].sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i++) {
        const a = xs[i] + 0.09, b = xs[i + 1] - 0.09; if (b - a < 0.45) continue;
        const lo = [a, y0, b, rail - 0.08], hi = [a, rail + 0.08, b, y1];
        if (!obs.some(o => hit(lo, o))) { brace(a, y0, b, rail - 0.08, 0.11, Z.brace); brace(a, rail - 0.08, b, y0, 0.11, Z.brace); }
        if (!obs.some(o => hit(hi, o))) { const m = (a + b) / 2; brace(a, rail + 0.08, m, y1, 0.12, Z.brace); brace(b, rail + 0.08, m, y1, 0.12, Z.brace); }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  return g;
}

// ---------------------------------------------------------------- roofs
// A builder for small meshes: quads and oriented boxes with UVs in metres / tile.
function meshBuilder() {
  const P = [], N = [], U = [], I = [];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = v => { const l = Math.hypot(...v) || 1; return v.map(q => q / l); };
  const quad = (a, b, c, d, uv) => {
    const n = norm(cross(sub(b, a), sub(c, a))), i = P.length / 3;
    [a, b, c, d].forEach((p, k) => { P.push(...p); N.push(...n); U.push(...uv[k]); });
    I.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };
  // box from centre c with half-axes ax, ay, az (vectors); UVs: length along ax in metres / tile
  const box = (c, ax, ay, az, tile = 1, faces = 'all') => {
    const v = (i, j, k) => [c[0] + ax[0] * i + ay[0] * j + az[0] * k, c[1] + ax[1] * i + ay[1] * j + az[1] * k, c[2] + ax[2] * i + ay[2] * j + az[2] * k];
    const L = Math.hypot(...ax) * 2 / tile, Wd = Math.hypot(...ay) * 2 / tile, D = Math.hypot(...az) * 2 / tile, u0 = Math.random() * 3;
    const F = [
      [v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1), L, Wd], [v(1, -1, -1), v(-1, -1, -1), v(-1, 1, -1), v(1, 1, -1), L, Wd],
      [v(-1, 1, 1), v(1, 1, 1), v(1, 1, -1), v(-1, 1, -1), L, D], [v(-1, -1, -1), v(1, -1, -1), v(1, -1, 1), v(-1, -1, 1), L, D],
      [v(1, -1, 1), v(1, -1, -1), v(1, 1, -1), v(1, 1, 1), D, Wd], [v(-1, -1, -1), v(-1, -1, 1), v(-1, 1, 1), v(-1, 1, -1), D, Wd]];
    for (const [a, b, cc, d, uu, vv] of F) quad(a, b, cc, d, [[u0, 0], [u0 + uu, 0], [u0 + uu, vv], [u0, vv]]);
  };
  const done = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); return g;
  };
  return { quad, box, done, empty: () => !P.length };
}

// A lean-to roof: one slope from a high back edge (against a wall, z = −depth) down to the eave at the front
// (z = 0), its foot at `base`; the side cheeks (the triangles between the shed's walls and the slope) in boards.
function leanRoofGeometry(kit, r, cover) {
  const W = r.width, D = r.depth, tp = Math.tan((r.pitch || 25) * Math.PI / 180), e = r.eave ?? 0.3, g = r.verge ?? 0.15, th = 0.12;
  const tile = kit.walls[cover].tile, S = meshBuilder(), Tm = meshBuilder(), Ch = meshBuilder(), rise = D * tp;
  const y = z => -z * tp, x0 = -g, x1 = W + g, z0 = e, z1 = -D, len = Math.hypot(D + e, (D + e) * tp);
  S.quad([x0, y(z0) + th, z0], [x1, y(z0) + th, z0], [x1, y(z1) + th, z1], [x0, y(z1) + th, z1], [[x0 / tile[0], 0], [x1 / tile[0], 0], [x1 / tile[0], len / tile[1]], [x0 / tile[0], len / tile[1]]]);
  Tm.quad([x1, y(z0), z0], [x0, y(z0), z0], [x0, y(z1), z1], [x1, y(z1), z1], [[0, 0], [W, 0], [W, 2], [0, 2]]);                        // soffit
  Tm.quad([x0, y(z0), z0], [x1, y(z0), z0], [x1, y(z0) + th, z0], [x0, y(z0) + th, z0], [[0, 0], [W, 0], [W, 0.2], [0, 0.2]]);         // fascia
  for (const [x, sg] of [[0, -1], [W, 1]]) {
    const A = [x, 0, 0], Bq = [x, 0, -D], C = [x, rise, -D];
    sg > 0 ? Ch.quad(A, Bq, C, A, [[0, 0], [D / 2.5, 0], [D / 2.5, rise / 3], [0, 0]]) : Ch.quad(A, C, Bq, A, [[0, 0], [D / 2.5, rise / 3], [D / 2.5, 0], [0, 0]]);   // (never a repeated first corner: the normal comes from it)
    for (const xv of [x0, x1]) Tm.quad([xv, y(z0), z0], [xv, y(z1), z1], [xv, y(z1) + th, z1], [xv, y(z0) + th, z0], [[0, 0], [2, 0], [2, 0.2], [0, 0.2]]);
  }
  Tm.box([W / 2, rise + th + 0.04, -D + 0.04], [W / 2 + g, 0, 0], [0, 0.05, 0], [0, 0, 0.05], 1);                                         // the flashing board at the wall
  return { ['wall:' + cover]: S.done(), timber: Tm.done(), 'wall:boards': Ch.done() };
}

// A jettied storey: the wall stands `jetty` metres out from the storey below (the lab places it there). Under its
// foot: a moulded bressumer beam, the floor joists' ends running back to the lower wall's face, and curved-ish
// brackets (a straight brace with a knee) every bay, all in tarred oak. Wall-local: the lower face is at z = −jetty.
export function jettyGeometry(w) {
  const B = meshBuilder(), J = w.jetty, W = w.width;
  B.box([W / 2, -0.12, -0.11], [W / 2 + 0.02, 0, 0], [0, 0.13, 0], [0, 0, 0.13], 1);                       // bressumer
  B.box([W / 2, -0.015, 0.035], [W / 2 + 0.02, 0, 0], [0, 0.03, 0], [0, 0, 0.03], 1);                      // its moulded lip
  for (let x = 0.2; x < W - 0.1; x += 0.42) B.box([x, -0.31, -J / 2 - 0.06], [0.055, 0, 0], [0, 0.065, 0], [0, 0, J / 2 + 0.06], 1);   // joist ends
  B.box([W / 2, -0.37, -J / 2 - 0.05], [W / 2, 0, 0], [0, 0.012, 0], [0, 0, J / 2 + 0.05], 1);             // the soffit boards
  const n = Math.max(1, Math.round(W / 1.25));
  for (let i = 0; i <= n; i++) {
    const x = Math.min(W - 0.12, Math.max(0.12, W * i / n)), y0 = -1.05, z0 = -J, y1 = -0.25, z1 = -0.12;
    const dy = y1 - y0, dz = z1 - z0, L = Math.hypot(dy, dz) / 2;
    B.box([x, (y0 + y1) / 2, (z0 + z1) / 2], [0, dy / 2, dz / 2], [0.07, 0, 0], [0, -dz / (2 * L) * 0.07, dy / (2 * L) * 0.07], 1);
    B.box([x, y0 - 0.12, z0 + 0.06], [0.08, 0, 0], [0, 0.16, 0], [0, 0, 0.06], 1);                         // the knee post on the wall below
  }
  return B.done();
}

// roof = { x, z, rot, base, width, depth, pitch=50, eave=0.35, verge=0.3, thick=0.16, barge=true, finial=true }
// A gable roof: ridge along local x (0..width) over the middle of depth (front wall face z = 0 → back z = −depth),
// eaves at `base`. Slate slopes, timber fascia + soffit, lead roll ridge, bargeboards and finials at the gables.
export function roofGeometry(kit, r, wear = null) {
  // cover: 'slate' (default), 'thatch' (a deep, soft-edged straw coat with a ridge roll, no bargeboards) or
  // 'shingle' (oak shingles with a board ridge)
  const cover = r.cover && kit.walls[r.cover] ? r.cover : 'slate', thatch = cover === 'thatch';
  const W = r.width, D = r.depth, pt = (r.pitch || 50) * Math.PI / 180, tp = Math.tan(pt), e = r.eave ?? (thatch ? 0.5 : 0.35), g = r.verge ?? (thatch ? 0.4 : 0.3), th = r.thick ?? (thatch ? 0.38 : cover === 'shingle' ? 0.12 : 0.16);
  if (r.kind === 'lean') return leanRoofGeometry(kit, r, cover);
  const tile = kit.walls[cover].tile, rise = D / 2 * tp, ridgeZ = -D / 2, x0 = -g, x1 = W + g;
  const S = meshBuilder(), Tm = meshBuilder(), L = meshBuilder();
  const cp = Math.cos(pt), sp = Math.sin(pt), slopeLen = (D / 2 + e) / cp, up0 = th / cp;
  // ---- the slope surface with depth: slate and shingle are laid in overlapping courses (each course's butt
  // stands proud of the one below, matching the texture's rows), thatch is a lumpy coat. Damage (wear[1]) drops
  // and slips tiles (dark battens show through the gaps) and sags the roof between the gables.
  const Dmg = wear ? wear[1] || 0 : 0, sag = Dmg * Math.min(0.22, W * 0.02);
  const hsh = (a, b, c) => { const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return v - Math.floor(v); };
  const UL = meshBuilder();
  function courses(side, ze, ye, n, up) {
    const ez = [x0, ye + up, ze], uz = (ridgeZ - ze) / slopeLen, uy = (rise - ye) / slopeLen;
    const sg = (x, s0) => sag * Math.sin(Math.PI * Math.min(1, Math.max(0, (x - x0) / (x1 - x0)))) * Math.sin(Math.PI * Math.min(1, s0 / slopeLen) * 0.5 + Math.PI * 0.5 * Math.min(1, s0 / slopeLen));
    const P = (x, s0, d) => { const dd = d - sg(x, s0); return [x, ez[1] + uy * s0 + n[1] * dd, ez[2] + uz * s0 + n[2] * dd]; };
    const Q = (a, b, c, d, uv) => side > 0 ? S.quad(a, b, c, d, uv) : S.quad(b, a, d, c, [uv[1], uv[0], uv[3], uv[2]]);
    const U = (x, s0) => [x / tile[0], s0 / tile[1]];
    if (thatch) {   // a soft, lumpy straw coat, flat at its edges so it still meets the verge and eave faces
      const nx = Math.max(2, Math.ceil((x1 - x0) / 0.5)), ns = Math.max(2, Math.ceil(slopeLen / 0.5));
      const lump = (x, s0) => { const ex = Math.min(1, (x - x0) / 0.5, (x1 - x) / 0.5), es = Math.min(1, s0 / 0.6, (slopeLen - s0) / 0.4);
        return Math.max(0, ex) * Math.max(0, es) * (0.05 * Math.sin(x * 2.1 + s0 * 0.7 + side) * Math.sin(x * 0.9 - s0 * 1.7) + 0.03 * Math.sin(x * 5.3 + s0 * 3.1)) + (s0 < 0.6 ? 0.04 * Math.sin(Math.PI * Math.min(1, s0 / 0.6)) * Math.max(0, ex) : 0); };
      for (let i = 0; i < nx; i++) for (let j = 0; j < ns; j++) {
        const xa = x0 + (x1 - x0) * i / nx, xb = x0 + (x1 - x0) * (i + 1) / nx, sa = slopeLen * j / ns, sb = slopeLen * (j + 1) / ns;
        Q(P(xa, sa, lump(xa, sa)), P(xb, sa, lump(xb, sa)), P(xb, sb, lump(xb, sb)), P(xa, sb, lump(xa, sb)), [U(xa, sa), U(xb, sa), U(xb, sb), U(xa, sb)]);
      }
      return;
    }
    const c = cover === 'shingle' ? 3 / 16.67 : 0.25, t = cover === 'shingle' ? 0.035 : 0.022, sw = cover === 'shingle' ? 0.24 : 0.32;
    const nC = Math.ceil(slopeLen / c - 1e-3), segX = (Dmg > 0 || sag > 0) ? Math.max(1, Math.round((x1 - x0) / sw)) : 1;
    for (let k = 0; k < nC; k++) {
      const s0 = k * c, s1 = Math.min(slopeLen, (k + 1) * c);
      for (let i = 0; i < segX; i++) {
        const xa = x0 + (x1 - x0) * i / segX, xb = x0 + (x1 - x0) * (i + 1) / segX, h = hsh(k, i, side);
        if (k > 0 && k < nC - 1 && h < Dmg * 0.07) {   // a missing tile: the battens and felt show
          const pa = P(xa, s0, -0.01), pb = P(xb, s0, -0.01), pc = P(xb, s1, -0.01), pd = P(xa, s1, -0.01);
          side > 0 ? UL.quad(pa, pb, pc, pd, [[0, 0], [1, 0], [1, 0.3], [0, 0.3]]) : UL.quad(pb, pa, pd, pc, [[0, 0], [1, 0], [1, 0.3], [0, 0.3]]);
          continue;
        }
        const slip = k > 0 && k < nC - 1 && h < Dmg * 0.15 ? c * (0.25 + 0.4 * hsh(i, k, 3)) : 0, tl = slip ? t * 1.8 : t;
        const a0 = s0 - slip, a1 = s1 - slip;
        Q(P(xa, a0, tl), P(xb, a0, tl), P(xb, a1, slip ? t : 0), P(xa, a1, slip ? t : 0), [U(xa, s0), U(xb, s0), U(xb, s1), U(xa, s1)]);
        if (k > 0 || slip) Q(P(xa, a0, 0), P(xb, a0, 0), P(xb, a0, tl), P(xa, a0, tl), [U(xa, s0 - 0.01), U(xb, s0 - 0.01), U(xb, s0), U(xa, s0)]);   // the course's butt
        if (segX > 1) for (const [xv, sx] of [[xa, -1], [xb, 1]]) {   // cheeks where courses break (sag / damage)
          const A = P(xv, a0, 0), Bq = P(xv, a0, tl), C = P(xv, a1, slip ? t : 0);
          (sx * side > 0) ? S.quad(A, C, Bq, A, [U(xv, s0), U(xv, s1), U(xv, s0), U(xv, s0)]) : S.quad(A, Bq, C, A, [U(xv, s0), U(xv, s0), U(xv, s1), U(xv, s0)]);
        }
      }
    }
  }
  for (const side of [1, -1]) {                      // front (+1, eave at z = +e) and back (−1)
    const ze = side > 0 ? e : -D - e, ye = -e * tp, n = [0, cp, side * sp];
    const up = th / cp;                                // vertical thickness of the slab
    const a = [x0, ye + up, ze], b = [x1, ye + up, ze], c = [x1, rise + up, ridgeZ], d = [x0, rise + up, ridgeZ];
    const uv = [[x0 / tile[0], 0], [x1 / tile[0], 0], [x1 / tile[0], slopeLen / tile[1]], [x0 / tile[0], slopeLen / tile[1]]];
    courses(side, ze, ye, n, up);
    if (thatch) {
      // the thatch's thickness shows at the eave and the verges: straw faces, not timber
      if (side > 0) S.quad([x0, ye, ze], [x1, ye, ze], b, a, [[x0 / tile[0], 0.92], [x1 / tile[0], 0.92], [x1 / tile[0], 1], [x0 / tile[0], 1]]);
      else S.quad([x1, ye, ze], [x0, ye, ze], a, b, [[x1 / tile[0], 0.92], [x0 / tile[0], 0.92], [x0 / tile[0], 1], [x1 / tile[0], 1]]);
      for (const [xv, s2] of [[x0, -1], [x1, 1]]) {
        const p = [[xv, ye, ze], [xv, ye + up, ze], [xv, rise + up, ridgeZ], [xv, rise, ridgeZ]];
        (s2 * side > 0) ? S.quad(p[0], p[3], p[2], p[1], [[0, 0], [slopeLen / tile[1], 0], [slopeLen / tile[1], 0.1], [0, 0.1]]) : S.quad(p[0], p[1], p[2], p[3], [[0, 0], [0.1, 0], [0.1, slopeLen / tile[1]], [0, slopeLen / tile[1]]]);
      }
      const u0 = [x0, ye, ze], u1 = [x1, ye, ze], u2 = [x1, rise, ridgeZ], u3 = [x0, rise, ridgeZ];   // the underside (straw too)
      if (side > 0) S.quad(u1, u0, u3, u2, [uv[1], uv[0], uv[3], uv[2]]); else S.quad(u0, u1, u2, u3, uv);
      continue;
    }
    // soffit (underside) and fascia (eave edge) in timber
    const as = [x0, ye, ze], bs = [x1, ye, ze], cs = [x1, rise, ridgeZ], ds = [x0, rise, ridgeZ];
    if (side > 0) Tm.quad(bs, as, ds, cs, [[0, 0], [W, 0], [W, 3], [0, 3]]); else Tm.quad(as, bs, cs, ds, [[0, 0], [W, 0], [W, 3], [0, 3]]);
    if (side > 0) Tm.quad(as, bs, b, a, [[0, 0], [W, 0], [W, 0.6], [0, 0.6]]); else Tm.quad(bs, as, a, b, [[0, 0], [W, 0], [W, 0.6], [0, 0.6]]);
    // verge edges of the slab (the slate thickness at the gable ends)
    for (const [xv, s2] of [[x0, -1], [x1, 1]]) {
      const p = [[xv, ye, ze], [xv, ye + up, ze], [xv, rise + up, ridgeZ], [xv, rise, ridgeZ]];
      (s2 * side > 0) ? Tm.quad(p[0], p[3], p[2], p[1], [[0, 0], [3, 0], [3, 0.3], [0, 0.3]]) : Tm.quad(p[0], p[1], p[2], p[3], [[0, 0], [0.3, 0], [0.3, 3], [0, 3]]);
    }
  }
  // the ridge: a lead roll on slate, a capped board ridge on shingles, a thick straw roll on thatch
  const ry = rise + th / cp + (thatch ? -0.04 : 0.02), rr = thatch ? 0.2 : 0.06;
  const R = thatch ? S : L;
  if (cover === 'shingle') { Tm.box([(x0 + x1) / 2, rise + th / cp + 0.03, ridgeZ + 0.05], [(x1 - x0) / 2 + 0.03, 0, 0], [0, 0.07, -0.07], [0, 0.012, 0.012], 1); Tm.box([(x0 + x1) / 2, rise + th / cp + 0.03, ridgeZ - 0.05], [(x1 - x0) / 2 + 0.03, 0, 0], [0, 0.07, 0.07], [0, 0.012, -0.012], 1); }
  else for (let i = 0; i < 8; i++) {
    const a0 = i / 8 * Math.PI * 2, a1 = (i + 1) / 8 * Math.PI * 2, p = a => [Math.sin(a) * rr, Math.cos(a) * rr];
    const [z0, y0] = p(a0), [z1, y1] = p(a1);
    R.quad([x0 - 0.02, ry + y0, ridgeZ + z0], [x0 - 0.02, ry + y1, ridgeZ + z1], [x1 + 0.02, ry + y1, ridgeZ + z1], [x1 + 0.02, ry + y0, ridgeZ + z0], thatch ? [[x0 / tile[0], 0], [x0 / tile[0], 0.08], [x1 / tile[0], 0.08], [x1 / tile[0], 0]] : [[0, 0], [0, 1], [1, 1], [1, 0]]);
  }
  // bargeboards: boards under the verge on each rake, a finial at the apex
  if (r.barge !== false && !thatch) for (const xv of [x0 - 0.02, x1 + 0.02]) {
    for (const side of [1, -1]) {
      const zA = side > 0 ? e : -D - e, yA = -e * tp, zB = ridgeZ, yB = rise, len = Math.hypot(zB - zA, yB - yA) / 2;
      const dir = [0, (yB - yA) / (2 * len), (zB - zA) / (2 * len)], down = [0, -Math.abs(dir[2]), Math.sign(zB - zA) * -Math.abs(dir[1]) * -1];
      const nrm = Math.hypot(...down); const dn = down.map(q => q / nrm);
      const c = [xv, (yA + yB) / 2 + th / cp * 0.5 - 0.11 * Math.abs(dn[1]), (zA + zB) / 2];
      Tm.box(c, dir.map(q => q * len), [0, -0.13, 0], [0.025, 0, 0], 1);
    }
    if (r.finial !== false) Tm.box([xv, rise + th / cp + 0.25, ridgeZ], [0, 0.4, 0], [0, 0, 0.05], [0.05, 0, 0], 1);
  }
  // dormers on the front slope: { x (along the ridge), width = 1.3, height = 1.15, wall = 'plaster' }
  const DW = {}, DG = meshBuilder();
  // on thatch a dormer is an eyebrow: the straw swells up over a low window and melts back into the slope
  function eyebrowDormer(d) {
    const wv = 'wall:' + (kit.walls[d.wall] ? d.wall : 'plaster'), Dm = DW[wv] = DW[wv] || meshBuilder(), dt = kit.walls[d.wall]?.tile || [2.5, 3];
    const w2 = (d.width || 1.8) / 2, h = d.height || 0.8, cx = d.x, zf = -0.1, ys = z => -z * tp + up0, y0 = ys(zf) - 0.12;
    const Wh = w2 * 2.3, hpk = y0 + h + up0, zr0 = zf + 0.38, zend = -(hpk + 0.3 - up0) / tp, NU = 18, NV = 12;
    const bell = u => Math.abs(u) >= 1 ? 0 : Math.pow((1 + Math.cos(Math.PI * u)) / 2, 0.6), soft = t => 0.12 * Math.log(1 + Math.exp(t / 0.12));
    const top = (x, z) => { const u = (x - cx) / Wh; return ys(z) + soft(hpk - ys(z)) * bell(u) + 0.012; };
    const under = (x, z) => top(x, z) - up0 * 0.9;
    const X = i => cx - Wh + 2 * Wh * i / NU, Z = j => zr0 + (zend - zr0) * j / NV;
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {     // the swelling straw
      const xa = X(i), xb = X(i + 1), za = Z(j), zb = Z(j + 1);
      S.quad([xa, top(xa, za), za], [xb, top(xb, za), za], [xb, top(xb, zb), zb], [xa, top(xa, zb), zb], [[xa / tile[0], -za / tile[1]], [xb / tile[0], -za / tile[1]], [xb / tile[0], -zb / tile[1]], [xa / tile[0], -zb / tile[1]]]);
    }
    for (let i = 0; i < NU; i++) {                                   // its thick front lip and the straw underside back to the window
      const xa = X(i), xb = X(i + 1);
      S.quad([xa, under(xa, zr0), zr0], [xb, under(xb, zr0), zr0], [xb, top(xb, zr0), zr0], [xa, top(xa, zr0), zr0], [[xa / tile[0], 0.9], [xb / tile[0], 0.9], [xb / tile[0], 1], [xa / tile[0], 1]]);
      S.quad([xb, under(xb, zr0), zr0], [xa, under(xa, zr0), zr0], [xa, under(xa, zf), zf], [xb, under(xb, zf), zf], [[xb / tile[0], 0], [xa / tile[0], 0], [xa / tile[0], 0.1], [xb / tile[0], 0.1]]);
    }
    // the front wall follows the hood's underside, with a low wide window in it
    const wx0 = cx - w2 * 0.58, wx1 = cx + w2 * 0.58, wy0 = y0 + 0.22, wy1 = Math.max(wy0 + 0.3, Math.min(under(wx0, zf), under(wx1, zf)) - 0.07);
    const col = (a, b, lo, hi) => { if (hi - lo < 0.005) return; Dm.quad([a, lo, zf], [b, lo, zf], [b, hi, zf], [a, hi, zf], [[a / dt[0], lo / dt[1]], [b / dt[0], lo / dt[1]], [b / dt[0], hi / dt[1]], [a / dt[0], hi / dt[1]]]); };
    const xs = []; for (let i = 0; i <= NU * 2; i++) xs.push(cx - Wh + Wh * i / NU); xs.push(wx0, wx1); xs.sort((p, q) => p - q);
    for (let i = 0; i < xs.length - 1; i++) {
      const a = xs[i], b = xs[i + 1]; if (b - a < 1e-4) continue;
      const hi = Math.min(under(a, zf), under(b, zf)) , m = (a + b) / 2;
      if (m > wx0 && m < wx1) { col(a, b, y0, wy0); col(a, b, wy1, hi); } else col(a, b, y0, hi);
    }
    DG.quad([wx0, wy0, zf - 0.08], [wx1, wy0, zf - 0.08], [wx1, wy1, zf - 0.08], [wx0, wy1, zf - 0.08], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    Tm.box([(wx0 + wx1) / 2, wy0 - 0.02, zf + 0.02], [(wx1 - wx0) / 2 + 0.05, 0, 0], [0, 0.03, 0], [0, 0, 0.06], 1);
    for (const x of [wx0 - 0.025, wx1 + 0.025, cx - (wx1 - wx0) / 6, cx + (wx1 - wx0) / 6]) Tm.box([x, (wy0 + wy1) / 2, zf + 0.02], [0.022, 0, 0], [0, (wy1 - wy0) / 2, 0], [0, 0, 0.045], 1);
  }
  for (const d of r.dormers || []) {
    if (thatch) { eyebrowDormer(d); continue; }
    const wv = 'wall:' + (kit.walls[d.wall] ? d.wall : 'plaster'), Dm = DW[wv] = DW[wv] || meshBuilder(), dt = kit.walls[d.wall]?.tile || [2.5, 3];
    const w2 = (d.width || 1.3) / 2, h = d.height || 1.15, cx = d.x, zf = -0.08, y0 = -zf * tp + up0 - 0.12, yt = y0 + h, zb = -(yt - up0) / tp, ux = v => v / dt[0], uy = v => v / dt[1];
    // front panel (with the window cut as a frame round a glass light), cheeks back to the slope, and a gable roof
    const wx0 = cx - w2 + 0.22, wx1 = cx + w2 - 0.22, wy0 = y0 + 0.28, wy1 = yt - 0.15;
    const panel = (a, b, c, e) => Dm.quad([a, b, zf], [c, b, zf], [c, e, zf], [a, e, zf], [[ux(a), uy(b)], [ux(c), uy(b)], [ux(c), uy(e)], [ux(a), uy(e)]]);
    panel(cx - w2, y0, cx + w2, wy0); panel(cx - w2, wy1, cx + w2, yt); panel(cx - w2, wy0, wx0, wy1); panel(wx1, wy0, cx + w2, wy1);
    DG.quad([wx0, wy0, zf - 0.08], [wx1, wy0, zf - 0.08], [wx1, wy1, zf - 0.08], [wx0, wy1, zf - 0.08], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    for (const [a, b, c] of [[[wx0 - 0.05, wy0 - 0.05], [wx1 + 0.05, wy0], 0], [[wx0 - 0.05, wy1], [wx1 + 0.05, wy1 + 0.05], 0]]) Tm.box([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, zf + 0.02], [(b[0] - a[0]) / 2, 0, 0], [0, (b[1] - a[1]) / 2, 0], [0, 0, 0.05], 1);
    for (const x of [wx0 - 0.025, wx1 + 0.025, (wx0 + wx1) / 2]) Tm.box([x, (wy0 + wy1) / 2, zf + 0.02], [x === (wx0 + wx1) / 2 ? 0.02 : 0.03, 0, 0], [0, (wy1 - wy0) / 2, 0], [0, 0, 0.05], 1);
    for (const sx of [-1, 1]) {   // cheeks: a triangle from the front panel back to where the slope meets the dormer's top
      const x = cx + sx * w2, A = [x, y0, zf], Bc = [x, yt, zf], C = [x, yt, zb];
      sx > 0 ? Dm.quad(A, C, Bc, A, [[0, uy(y0)], [ux(zf - zb), uy(yt)], [0, uy(yt)], [0, uy(y0)]]) : Dm.quad(A, Bc, C, A, [[0, uy(y0)], [0, uy(yt)], [ux(zf - zb), uy(yt)], [0, uy(y0)]]);
    }
    // its roof: a small gable, ridge running back into the main slope
    const rh = w2 * 0.9, ov = 0.12, zr0 = zf + ov, zr1 = zb - 0.1, ridge = yt + rh;
    for (const sx of [-1, 1]) {
      const e0 = [cx + sx * (w2 + 0.08), yt - 0.06, zr0], e1 = [cx + sx * (w2 + 0.08), yt - 0.06, zr1], k0 = [cx, ridge, zr0], k1 = [cx, ridge, zr1], sl = Math.hypot(w2 + 0.08, rh + 0.06);
      sx > 0 ? S.quad(e0, e1, k1, k0, [[0, 0], [(zr0 - zr1) / tile[0], 0], [(zr0 - zr1) / tile[0], sl / tile[1]], [0, sl / tile[1]]]) : S.quad(e1, e0, k0, k1, [[0, 0], [(zr0 - zr1) / tile[0], 0], [(zr0 - zr1) / tile[0], sl / tile[1]], [0, sl / tile[1]]]);
    }
    Dm.quad([cx - w2, yt, zf], [cx + w2, yt, zf], [cx, ridge - 0.04, zf], [cx, ridge - 0.04, zf], [[ux(-w2), uy(yt)], [ux(w2), uy(yt)], [0, uy(ridge)], [0, uy(ridge)]]);   // the dormer's gable
  }
  const out = { ['wall:' + cover]: S.done() };
  for (const k in DW) out[k] = DW[k].done(); if (!DG.empty()) out.glass = DG.done();
  if (!Tm.empty() || !UL.empty()) out.timber = UL.empty() ? Tm.done() : Tm.empty() ? UL.done() : mergeGeometries([[Tm.done(), new THREE.Matrix4()], [UL.done(), new THREE.Matrix4()]]); if (!L.empty()) out.lead = L.done();
  return out;
}

// chimney = { x, z, rot, base, height, width=1.1, depth=0.6, pots=2, variant='brick' }: a brick stack centred on
// (x, z), a stone corbel course and cap, clay pots on top.
export function chimneyGeometry(kit, c) {
  const W = c.width || 1.1, D = c.depth || 0.6, H = c.height, v = c.variant || 'brick', tile = kit.walls[v].tile;
  const B = meshBuilder(), Pm = meshBuilder();
  const hw = W / 2, hd = D / 2;
  const sides = [[[-hw, hd], [hw, hd]], [[hw, hd], [hw, -hd]], [[hw, -hd], [-hw, -hd]], [[-hw, -hd], [-hw, hd]]];
  let run = 0;
  for (const [[ax, az], [bx, bz]] of sides) {
    const l = Math.hypot(bx - ax, bz - az);
    B.quad([ax, 0, az], [bx, 0, bz], [bx, H, bz], [ax, H, az], [[run / tile[0], 0], [(run + l) / tile[0], 0], [(run + l) / tile[0], H / tile[1]], [run / tile[0], H / tile[1]]]);
    run += l;
  }
  B.quad([-hw, H, hd], [hw, H, hd], [hw, H, -hd], [-hw, H, -hd], [[0, 0], [W / tile[0], 0], [W / tile[0], D / tile[1]], [0, D / tile[1]]]);
  const geo = { ['wall:' + v]: B.done() };
  // corbel band and cap: string course round all four sides, mitred
  const trims = [];
  for (const [y, nm] of [[H - 0.75, 'string_course'], [H - 0.25, 'string_course']]) {
    for (const [px, pz, rot, len] of [[-hw, hd, 0, W], [hw, hd, Math.PI / 2, D], [hw, -hd, Math.PI, W], [-hw, -hd, -Math.PI / 2, D]]) {
      trims.push([trimGeometry(kit, nm, len, [1, 1]), new THREE.Matrix4().makeRotationY(rot).setPosition(px, y, pz)]);
    }
  }
  geo.trims = mergeGeometries(trims);
  // pots: tapered octagonal clay pots with a rim
  const n = c.pots ?? 2;
  for (let i = 0; i < n; i++) {
    const px = n === 1 ? 0 : -hw + 0.3 + i * (W - 0.6) / (n - 1), h = 0.55 + (i % 2) * 0.12;
    for (const [y0, y1, r0, r1] of [[0, h, 0.15, 0.11], [h, h + 0.06, 0.135, 0.135]]) {
      for (let k = 0; k < 8; k++) {
        const a0 = k / 8 * Math.PI * 2, a1 = (k + 1) / 8 * Math.PI * 2;
        const p = (a, y, r) => [px + Math.sin(a) * r, H + y, Math.cos(a) * r];
        Pm.quad(p(a0, y0, r0), p(a1, y0, r0), p(a1, y1, r1), p(a0, y1, r1), [[0, 0], [1, 0], [1, 1], [0, 1]]);
      }
    }
  }
  geo.clay = Pm.done();
  return geo;
}

// ---------------------------------------------------------------- small details
// canopy = { kind: 'porch' | 'awning', x, y, width, depth, pitch, color } on a wall (x = centre along it, y = where
// it meets the wall). A porch is a slate lean-to on timber brackets; an awning is striped canvas on iron arms with a
// scalloped valance.
const AWNING = { green: [0x2f5a3a, 0xe6dcc4], red: [0x8a2a22, 0xe6dcc4], blue: [0x2a3f6a, 0xe6dcc4], ochre: [0xb07a28, 0x3a2a1a] };
export function canopyGeometry(kit, c) {
  const W = c.width || 2.5, D = c.depth || 1.2, x0 = c.x - W / 2, x1 = c.x + W / 2, y = c.y, pt = (c.pitch ?? (c.kind === 'awning' ? 28 : 22)) * Math.PI / 180;
  const drop = D * Math.tan(pt), Lm = meshBuilder();
  if (c.kind === 'awning') {
    const P = [], N = [], U = [], C = [], I = [], col = AWNING[c.color] || AWNING.green, ca = new THREE.Color(col[0]), cb = new THREE.Color(col[1]);
    const n = Math.max(2, Math.round(W / 0.25)), sw = W / n, rows = 5;
    const at = (x, t) => [x, y - drop * t - 0.05 * Math.sin(Math.PI * t), D * t];
    const q = (a, b, cc, d, k) => { const i = P.length / 3, cl = k % 2 ? cb : ca; for (const p of [a, b, cc, d]) { P.push(...p); N.push(0, Math.cos(pt), Math.sin(pt)); U.push(0, 0); C.push(cl.r, cl.g, cl.b); } I.push(i, i + 1, i + 2, i, i + 2, i + 3); };
    for (let i = 0; i < n; i++) {
      const xa = x0 + i * sw, xb = xa + sw;
      for (let j = 0; j < rows; j++) { const t0 = j / rows, t1 = (j + 1) / rows; q(at(xa, t0), at(xb, t0), at(xb, t1), at(xa, t1), i); }
      // valance with a scalloped hem
      const [, yf, zf] = at(xa, 1), xm = (xa + xb) / 2;
      q([xa, yf, zf], [xb, yf, zf], [xb, yf - 0.16, zf], [xa, yf - 0.16, zf], i);
      const b = P.length / 3, cl = i % 2 ? cb : ca;
      for (const p of [[xa, yf - 0.16, zf], [xb, yf - 0.16, zf], [xm, yf - 0.25, zf]]) { P.push(...p); N.push(0, 0, 1); U.push(0, 0); C.push(cl.r, cl.g, cl.b); }
      I.push(b, b + 1, b + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I);
    // iron arms from the wall below to the front corners, and a roller box at the wall
    for (const xa of [x0 + 0.08, x1 - 0.08]) {
      const a = [xa, y - drop - 0.55, 0.02], b = [xa, y - drop, D - 0.02], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], h = [0, (b[1] - a[1]) / 2, (b[2] - a[2]) / 2];
      Lm.box(m, h, [0.012, 0, 0], [0, -h[2] / Math.hypot(h[1], h[2]) * 0.012, h[1] / Math.hypot(h[1], h[2]) * 0.012]);
    }
    Lm.box([c.x, y + 0.06, 0.07], [W / 2 + 0.04, 0, 0], [0, 0.07, 0], [0, 0, 0.07]);
    return { canvas: g, lead: Lm.done() };
  }
  // porch: a slate lean-to on exposed rafters, a wall plate and a front beam (which the posts carry), with a
  // fascia and verge boards so its edge has real thickness, and timber brackets under the ends
  const S = meshBuilder(), Tm = meshBuilder(), tile = kit.walls.slate.tile, tp = Math.tan(pt), cp = Math.cos(pt), sp = Math.sin(pt);
  const F = canopyFront(c), over = 0.14, zE = D + over;                 // the roof runs past the beam to the eave
  const yT = z => y + 0.06 - z * tp;                                     // top of the slates
  const sdir = [0, -sp, cp], nrm = [0, cp, sp];
  const along = (z0, z1, x, wid, hgt, below) => {                        // a timber laid down the slope, under the slates
    const zm = (z0 + z1) / 2, l = (z1 - z0) / cp / 2, yc = yT(zm) - 0.06 - below / cp;
    Tm.box([x, yc, zm], sdir.map(q => q * l), nrm.map(q => q * hgt / 2), [wid / 2, 0, 0], 1);
  };
  // slates (top) and the boards between the rafters (soffit)
  S.quad([x0, yT(zE), zE], [x1, yT(zE), zE], [x1, yT(0), 0], [x0, yT(0), 0], [[x0 / tile[0], 0], [x1 / tile[0], 0], [x1 / tile[0], zE / cp / tile[1]], [x0 / tile[0], zE / cp / tile[1]]]);
  Tm.quad([x1, yT(zE) - 0.06, zE], [x0, yT(zE) - 0.06, zE], [x0, yT(0) - 0.06, 0], [x1, yT(0) - 0.06, 0], [[0, 0], [W, 0], [W, 2], [0, 2]]);
  const nr = Math.max(2, Math.round(W / 0.45));
  for (let i = 0; i <= nr; i++) along(0.02, zE - 0.02, x0 + 0.05 + i * (W - 0.1) / nr, 0.07, 0.12, 0.06);   // rafters
  Tm.box([c.x, y - 0.06 - 0.12 - 0.1, 0.06], [W / 2, 0, 0], [0, 0.1, 0], [0, 0, 0.06], 1);                 // wall plate
  Tm.box([c.x, F.y + 0.1, F.z], [W / 2 + 0.04, 0, 0], [0, 0.1, 0], [0, 0, 0.08], 1);                         // front beam
  const yE = yT(zE);
  Tm.box([c.x, yE - 0.1, zE + 0.018], [W / 2 + 0.03, 0, 0], [0, 0.13, 0], [0, 0, 0.018], 1);                 // fascia
  for (const xs of [x0 - 0.015, x1 + 0.015]) {                                                                  // verge boards
    const zm = zE / 2, l = zE / cp / 2; Tm.box([xs, yT(zm) - 0.06, zm], sdir.map(q => q * l), nrm.map(q => q * 0.11), [0.015, 0, 0], 1);
  }
  for (const xb of [x0 + 0.05, x1 - 0.05]) {                                                                    // brackets
    const a = [xb, y - 0.95, 0.03], b = [xb, F.y + 0.02, F.z - 0.1];
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], h = [0, (b[1] - a[1]) / 2, (b[2] - a[2]) / 2], l = Math.hypot(h[1], h[2]);
    Tm.box(m, h, [0.045, 0, 0], [0, -h[2] / l * 0.05, h[1] / l * 0.05], 1);
  }
  Lm.box([c.x, y + 0.12, 0.012], [W / 2, 0, 0], [0, 0.09, 0], [0, 0, 0.012]);                                  // lead flashing
  return { 'wall:slate': S.done(), timber: Tm.done(), lead: Lm.done() };
}
// where posts go under a canopy (wall-local): z of the front beam / awning edge and the height of its underside
export function canopyFront(c) {
  const D = c.depth || 1.2, pt = (c.pitch ?? (c.kind === 'awning' ? 28 : 22)) * Math.PI / 180, tp = Math.tan(pt);
  if (c.kind === 'awning') return { z: D - 0.05, y: c.y - D * tp - 0.03 };
  const z = Math.max(0.3, D - 0.12);
  return { z, y: c.y - z * tp - 0.12 / Math.cos(pt) - 0.2 };
}
// platform = a raised stone or oak floor; steps = a flight running down and out from its origin
export function platformGeometry(kit, p) {
  if (p.kind === 'portico') return porticoGeometry(kit, p);
  const W = p.width || 2.5, D = p.depth || 1.5, H = p.height || 0.45, oak = p.material === 'oak';
  const B = meshBuilder(), tile = oak ? [1, 1] : kit.walls.flags.tile, boxes = [];
  // a solid block x ∈ [−W/2, W/2], z ∈ [z0, z1], y ∈ [0, h], every face mapped flat in world metres
  const block = (z0, z1, h) => {
    const xa = -W / 2, xb = W / 2, u = v => v / tile[0], w = v => v / tile[1];
    B.quad([xa, h, z1], [xb, h, z1], [xb, h, z0], [xa, h, z0], [[u(xa), w(z1)], [u(xb), w(z1)], [u(xb), w(z0)], [u(xa), w(z0)]]);           // top
    B.quad([xa, 0, z1], [xb, 0, z1], [xb, h, z1], [xa, h, z1], [[u(xa), 0], [u(xb), 0], [u(xb), w(h)], [u(xa), w(h)]]);                       // front
    B.quad([xb, 0, z1], [xb, 0, z0], [xb, h, z0], [xb, h, z1], [[u(z1), 0], [u(z0), 0], [u(z0), w(h)], [u(z1), w(h)]]);                       // right
    B.quad([xa, 0, z0], [xa, 0, z1], [xa, h, z1], [xa, h, z0], [[u(z0), 0], [u(z1), 0], [u(z1), w(h)], [u(z0), w(h)]]);                       // left
    boxes.push({ c: [0, h / 2, (z0 + z1) / 2], s: [W, h, z1 - z0] });
  };
  if (p.kind === 'stair') {
    // an outside stair up the wall: oak treads on two stringers, rising along +x from the left end to a landing at the
    // right; posts and a handrail on the open side. Origin: middle of the back edge (against the wall); z runs out.
    const Hh = p.height || 3, Wd = p.width || 1.0, n = Math.max(2, Math.round(Hh / 0.19)), rise = Hh / n, run = 0.25, land = 1.0, Lx = n * run + land, xa = -Lx / 2;
    const T = meshBuilder();
    for (let k = 0; k < n; k++) { const x = xa + k * run, yt = (k + 1) * rise; T.box([x + run / 2, yt - 0.025, Wd / 2], [run / 2 + 0.02, 0, 0], [0, 0.025, 0], [0, 0, Wd / 2], 1); boxes.push({ c: [x + run / 2, yt / 2, Wd / 2], s: [run, yt, Wd] }); }
    T.box([xa + n * run + land / 2, Hh - 0.03, Wd / 2], [land / 2, 0, 0], [0, 0.03, 0], [0, 0, Wd / 2], 1); boxes.push({ c: [xa + n * run + land / 2, Hh / 2, Wd / 2], s: [land, Hh, Wd] });
    const sl = Math.hypot(n * run, Hh) / 2, d = [n * run / (2 * sl), Hh / (2 * sl), 0];
    for (const zz of [0.04, Wd - 0.04]) T.box([xa + n * run / 2, Hh / 2 - 0.12, zz], d.map(v => v * sl), [-d[1] * 0.13, d[0] * 0.13, 0], [0, 0, 0.035], 1);   // stringers
    for (const [x, ht] of [[xa + 0.05, 0], [xa + n * run, Hh], [xa + Lx - 0.05, Hh]]) T.box([x, ht / 2 + 0.5, Wd - 0.04], [0.045, 0, 0], [0, ht / 2 + 0.5, 0], [0, 0, 0.045], 1);   // posts (to the ground)
    T.box([xa + n * run / 2, Hh / 2 + 0.95, Wd - 0.04], d.map(v => v * sl), [-d[1] * 0.035, d[0] * 0.035, 0], [0, 0, 0.03], 1);   // handrail
    T.box([xa + n * run + land / 2, Hh + 0.95, Wd - 0.04], [land / 2, 0, 0], [0, 0.035, 0], [0, 0, 0.03], 1);
    T.box([xa + Lx - 0.04, Hh + 0.95, Wd / 2], [0.03, 0, 0], [0, 0.035, 0], [0, 0, Wd / 2], 1);
    return { geo: { timber: T.done() }, boxes };
  }
  if (p.kind === 'steps') {
    const n = Math.max(1, Math.round(H / 0.16)), rise = H / n, tread = p.tread || 0.3;
    for (let k = 0; k < n; k++) block(k * tread, (k + 1) * tread, H - k * rise);
  } else block(0, D, H);
  return { geo: { [oak ? 'timber' : 'wall:flags']: B.done() }, boxes };
}

// pipe = { x } — a cast-iron downpipe from a hopper head under the eaves to a shoe at the foot
export function pipeGeometry(kit, w, p) {
  const B = meshBuilder(), H = w.shape === 'gable' ? 0.5 : w.height, r = 0.042, z = 0.09, y0 = 0.12, y1 = H - 0.32;
  for (let k = 0; k < 8; k++) {
    const a0 = k / 8 * Math.PI * 2, a1 = (k + 1) / 8 * Math.PI * 2, P = (a, yy) => [p.x + Math.sin(a) * r, yy, z + Math.cos(a) * r];
    B.quad(P(a0, y0), P(a1, y0), P(a1, y1), P(a0, y1), [[0, 0], [1, 0], [1, 1], [0, 1]]);
  }
  B.box([p.x, H - 0.2, 0.11], [0.12, 0, 0], [0, 0.12, 0], [0, 0, 0.1]);                                             // hopper head
  B.box([p.x, 0.08, 0.15], [0.05, 0, 0], [0, 0.06, 0], [0, 0, 0.09]);                                                // shoe
  for (let yy = 0.8; yy < y1 - 0.3; yy += 1.6) B.box([p.x, yy, 0.05], [0.07, 0, 0], [0, 0.03, 0], [0, 0, 0.05]);  // holdfasts
  return B.done();
}
// a stone doorstep under a ground-floor door, on the trim sheet's plinth strip
function stepGeometry(kit, f, o) {
  const B = meshBuilder(), bb = f.geometry.boundingBox, w = bb.max.x - bb.min.x + 0.1, cx = o.x + (bb.min.x + bb.max.x) / 2;
  B.box([cx, 0.06, 0.22], [w / 2, 0, 0], [0, 0.08, 0], [0, 0, 0.2], 2.5);
  const g = B.done(), uv = g.attributes.uv, [v0, v1] = kit.trims.plinth.v;
  for (let i = 0; i < uv.count; i++) uv.setY(i, v0 + 0.02 + Math.min(1, uv.getY(i) * 2.5) * (v1 - v0 - 0.04));
  return g;
}
// flowers in a window box (feat_flowerbox): leaves, bloom clusters and a few trailing leaves, from a seed
const FLORA_CELLS = { leaf: [0, 0.5], red: [0.5, 0.5], pink: [0, 0], white: [0.5, 0] };
const floraCache = new Map();
export function flowerGeometry(o) {
  const key = (o.flowers || 'red') + (o.seed || 1); if (floraCache.has(key)) return floraCache.get(key);
  const R = rng(o.seed || 1), P = [], N = [], U = [], C = [], I = [];
  const card = (c, s, a, t, cell, tint) => {
    const e1 = [Math.cos(a) * s, 0, -Math.sin(a) * s], e2 = [Math.sin(a) * Math.sin(t) * s, Math.cos(t) * s, Math.cos(a) * Math.sin(t) * s];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], L = Math.hypot(...n) || 1;
    const b = P.length / 3, [u0, v0] = FLORA_CELLS[cell];
    for (const [k1, k2, uu, vv] of [[-0.5, -0.5, 0, 0], [0.5, -0.5, 0.5, 0], [0.5, 0.5, 0.5, 0.5], [-0.5, 0.5, 0, 0.5]]) {
      P.push(c[0] + e1[0] * k1 + e2[0] * k2, c[1] + e1[1] * k1 + e2[1] * k2, c[2] + e1[2] * k1 + e2[2] * k2); N.push(n[0] / L, n[1] / L, n[2] / L);
      U.push(u0 + uu, v0 + vv); C.push(tint, tint, tint);
    }
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  const colours = o.flowers === 'mixed' ? ['red', 'pink', 'white'] : [o.flowers || 'red'];
  for (let i = 0; i < 40; i++) card([(R() - 0.5) * 1.02, 0.03 + R() * 0.13, 0.04 + R() * 0.2], 0.13 + R() * 0.07, (R() - 0.5) * 2.6, 0.7 + R() * 0.8, 'leaf', 0.7 + R() * 0.45);
  for (let i = 0; i < 16; i++) card([(R() - 0.5) * 0.98, 0.17 + R() * 0.12, 0.05 + R() * 0.18], 0.17 + R() * 0.07, (R() - 0.5) * 1.8, 0.3 + R() * 0.5, colours[(R() * colours.length) | 0], 0.9 + R() * 0.25);
  for (let i = 0; i < 10; i++) card([(R() - 0.5) * 1.02, -0.05 - R() * 0.14, 0.25 + R() * 0.03], 0.11 + R() * 0.05, (R() - 0.5) * 0.8, 0.15, 'leaf', 0.65 + R() * 0.3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I);
  floraCache.set(key, g); return g;
}

// ---------------------------------------------------------------- decals
// Era decals (decals.png, 4 × 4 cells): posters, notices, painted signs, stains, plaster fallen off the brick.
// On a wall: w.decals = [{ d, x, y, w, h, rot }] (x, y = centre on the face; rot in degrees); on the ground:
// desc.floorDecals = [{ d, x, z, y, w, h, rot }]. cell = [col, row, cols, rows]; size = default metres.
export const DECALS = {
  wanted: { cell: [0, 0, 1, 1], size: [0.5, 0.62] }, notice: { cell: [1, 0, 1, 1], size: [0.5, 0.65] }, playbill: { cell: [2, 0, 1, 1], size: [0.55, 0.72] },
  torn: { cell: [3, 0, 1, 1], size: [0.55, 0.68] }, ghost_sign: { cell: [0, 1, 2, 1], size: [2.6, 1.3] }, street_plate: { cell: [2, 1, 1, 1], size: [0.7, 0.7] },
  guild_notice: { cell: [3, 1, 1, 1], size: [0.5, 0.62] }, soot: { cell: [0, 2, 1, 1], size: [1.3, 2.2] }, damp: { cell: [1, 2, 1, 1], size: [1.6, 1.4] },
  moss: { cell: [2, 2, 1, 1], size: [0.9, 0.9] }, brick_showing: { cell: [3, 2, 1, 1], size: [1.1, 1.0] }, apothecary: { cell: [0, 3, 2, 1], size: [2.4, 1.2] },
  chalk: { cell: [2, 3, 1, 1], size: [0.6, 0.6] }, coal_hole: { cell: [3, 3, 1, 1], size: [0.65, 0.65] },
};
function decalQuads(list, place) {
  const P = [], N = [], U = [], I = [];
  list.forEach((d, i) => {
    const D = DECALS[d.d]; if (!D) return;
    const [c, r, cw, ch] = D.cell, w = d.w || D.size[0], h = d.h || D.size[1], a = (d.rot || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const u0 = c / 4, u1 = (c + cw) / 4, v0 = 1 - (r + ch) / 4, v1 = 1 - r / 4, b = P.length / 3;
    for (const [k1, k2, u, v] of [[-0.5, -0.5, u0, v0], [0.5, -0.5, u1, v0], [0.5, 0.5, u1, v1], [-0.5, 0.5, u0, v1]]) {
      const lx = k1 * w * ca - k2 * h * sa, ly = k1 * w * sa + k2 * h * ca, [p, n] = place(d, lx, ly, i);
      P.push(...p); N.push(...n); U.push(u, v);
    }
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); return g;
}
export const decalGeometry = list => decalQuads(list, (d, lx, ly, i) => [[d.x + lx, d.y + ly, 0.004 + i * 0.0015], [0, 0, 1]]);
const floorDecalGeometry = list => decalQuads(list, (d, lx, ly, i) => [[d.x + lx, (d.y || 0) + 0.012 + i * 0.001, d.z - ly], [0, 1, 0]]);

// ---------------------------------------------------------------- fences and gates
// the stretches [t0, t1] along a fence that lie inside a wall's footprint (and below its top)
export function fenceCuts(kit, f, walls) {
  const r = f.rot || 0, d = [Math.cos(r), -Math.sin(r)], L = f.length || 4, out = [], fy = f.base || 0;
  for (const w of walls || []) {
    if (w.shape === 'gable' || (w.base || 0) > fy + 0.3 || (w.base || 0) + (w.height || 3) < fy + 0.3) continue;
    const wr = w.rot || 0, wd = [Math.cos(wr), -Math.sin(wr)], wn = [Math.sin(wr), Math.cos(wr)], T = (w.thick || kit.thick) + 0.04;
    // clip the fence line against the wall's footprint: 0 ≤ along ≤ width, −T ≤ out ≤ 0.02
    let t0 = 0, t1 = L;
    const clip = (p0, dp, lo, hi) => {                      // p0 + t·dp within [lo, hi]
      if (Math.abs(dp) < 1e-9) return p0 >= lo && p0 <= hi;
      let a = (lo - p0) / dp, b = (hi - p0) / dp; if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b); return t0 < t1;
    };
    const ox = f.x - w.x, oz = f.z - w.z;
    if (!clip(ox * wd[0] + oz * wd[1], d[0] * wd[0] + d[1] * wd[1], -0.02, w.width + 0.02)) continue;
    if (!clip(ox * wn[0] + oz * wn[1], d[0] * wn[0] + d[1] * wn[1], -T, 0.04)) continue;
    if (t1 - t0 > 0.05) out.push([t0 - 0.04, t1 + 0.04]);
  }
  return out;
}
// fence = { kind, x, z, rot, base, length, height, gates: [{ at, width, kind: 'single' | 'double', open }] }
// running along local +x from its origin. kinds: 'iron' (spear-topped railings), 'iron_wall' (railings on a low brick
// wall with a stone coping), 'picket' (painted timber), 'rail' (oak post-and-rail). Iron gates hang between
// brick piers with stone caps; timber ones between posts. Returns { geo: { material: geometry }, boxes }.
export const PROP_RADIUS = { prop_column: 0.15, prop_post: 0.09 };
export function fenceGeometry(kit, f) {
  const L = f.length || 4, kind = f.kind || 'iron', iron = kind.startsWith('iron');
  const H = f.height || (kind === 'iron_wall' ? 0.95 : kind === 'rail' ? 1.15 : 1.1), dwarf = kind === 'iron_wall' ? 0.6 : 0;
  const parts = {}, boxes = [], put = (k, g, m = new THREE.Matrix4()) => (parts[k] = parts[k] || []).push([g, m]);
  // a gateway fitted to a wall gap sets its own piers (pierW, pierH, pierVariant) so they cap the wall ends
  const pierW = f.pierW || (iron ? 0.46 : 0.14);
  // the runs of fence between gates (and the gate openings)
  const gates = (f.gates || []).map(g => ({ ...g, width: g.width || (g.kind === 'double' ? 2.6 : 1.1) })).sort((a, b) => a.at - b.at);
  let runs = []; let x = 0;
  for (const g of gates) { const a = g.at - g.width / 2 - pierW, b = g.at + g.width / 2 + pierW; if (a > x + 0.05) runs.push([x, a]); x = Math.max(x, b); }
  if (L > x + 0.05) runs.push([x, L]);
  // stretches that pass through a wall are left out (fenceCuts), so railings never poke through masonry
  for (const [c0, c1] of f.cuts || []) runs = runs.flatMap(([a, b]) => (c1 <= a || c0 >= b) ? [[a, b]] : [[a, c0], [c1, b]].filter(([p, q]) => q - p > 0.12));
  const zc = kind === 'iron_wall' ? -0.15 : 0;
  // a plinth wrapped round a pier's foot, mitred at its four corners (when the walls it caps have one)
  const piersPlinth = (px, pz) => {
    const v = f.pierPlinth === true ? null : f.pierPlinth, key = v && kit.trims.plinth.variants?.[v] && kit.materials.plinths ? 'plinths' : 'trims', h = pierW / 2;
    for (const [sx, sz, rot] of [[-h, h, 0], [h, h, Math.PI / 2], [h, -h, Math.PI], [-h, -h, -Math.PI / 2]])
      put(key, trimGeometry(kit, 'plinth', pierW, [1, 1], key === 'plinths' ? v : null), new THREE.Matrix4().makeRotationY(rot).setPosition(px + sx, 0, pz + sz));
  };
  // --- pieces
  const bar = (B, x0, y0, y1, w = 0.016, z = zc) => B.box([x0, (y0 + y1) / 2, z], [w / 2, 0, 0], [0, (y1 - y0) / 2, 0], [0, 0, w / 2]);
  const rail = (B, x0, x1, y, h = 0.035, t = 0.02, z = zc) => B.box([(x0 + x1) / 2, y, z], [(x1 - x0) / 2, 0, 0], [0, h / 2, 0], [0, 0, t / 2]);
  const spear = (B, x0, y0, s = 0.03, z = zc) => {                 // a little pyramid
    const t = [x0, y0 + s * 2.4, z], p = [[x0 - s, y0, z - s], [x0 + s, y0, z - s], [x0 + s, y0, z + s], [x0 - s, y0, z + s]];
    for (let i = 0; i < 4; i++) B.quad(p[i], p[(i + 1) % 4], t, t, [[0, 0], [1, 0], [0.5, 1], [0.5, 1]]);
  };
  const railing = (B, x0, x1, yb, h, arch = 0) => {               // spear-topped bars between two rails
    rail(B, x0, x1, yb + 0.1); rail(B, x0, x1, yb + h - 0.14 + (arch ? 0 : 0));
    const n = Math.max(1, Math.round((x1 - x0) / 0.12));
    for (let i = 0; i <= n; i++) { const xx = x0 + i * (x1 - x0) / n, top = yb + h + arch * Math.sin(Math.PI * i / n); bar(B, xx, yb + 0.04, top); spear(B, xx, top); }
  };
  if (iron) {
    const I = meshBuilder(), Br = meshBuilder(), St = meshBuilder();
    for (const [a, b] of runs) {
      if (dwarf) {
        put('wall:brick', wallGeometry(kit, { width: b - a, height: dwarf, variant: 'brick', thick: 0.3 }), new THREE.Matrix4().makeTranslation(a, 0, 0));
        St.box([(a + b) / 2, dwarf + 0.04, -0.15], [(b - a) / 2 + 0.03, 0, 0], [0, 0.04, 0], [0, 0, 0.19], 1);
      }
      railing(I, a + 0.06, b - 0.06, dwarf, H);
      const np = Math.max(1, Math.round((b - a) / 2.4));
      for (let i = 0; i <= np; i++) { const xx = a + 0.04 + i * (b - a - 0.08) / np; bar(I, xx, dwarf, dwarf + H + 0.06, 0.06); I.box([xx, dwarf + H + 0.12, zc], [0.045, 0, 0], [0, 0.05, 0], [0, 0, 0.045]); spear(I, xx, dwarf + H + 0.17, 0.04); }
      boxes.push({ c: [(a + b) / 2, (dwarf + H) / 2, zc], s: [b - a, dwarf + H, dwarf ? 0.3 : 0.08] });
    }
    for (const g of gates) {
      const ph = f.pierH || H + dwarf + 0.45, pv = 'wall:' + (kit.walls[f.pierVariant] ? f.pierVariant : 'brick');
      for (const s of [-1, 1]) {                                     // brick piers with a stone cap and a ball
        const px = g.at + s * (g.width / 2 + pierW / 2);
        (pv === 'wall:brick' ? Br : (parts._pier = parts._pier || meshBuilder())).box([px, ph / 2, zc], [pierW / 2, 0, 0], [0, ph / 2, 0], [0, 0, pierW / 2], 2.75);
        St.box([px, ph + 0.05, zc], [pierW / 2 + 0.05, 0, 0], [0, 0.05, 0], [0, 0, pierW / 2 + 0.05], 1);
        St.box([px, ph + 0.2, zc], [0.11, 0, 0], [0, 0.1, 0], [0, 0, 0.11], 1);
        boxes.push({ c: [px, ph / 2, zc], s: [pierW, ph, pierW] });
        if (f.pierPlinth) piersPlinth(px, zc);
      }
      const leaves = g.kind === 'double' ? [[g.at - g.width / 2, g.width / 2, 1], [g.at + g.width / 2, g.width / 2, -1]] : [[g.at - g.width / 2, g.width, 1]];
      for (const [hx, lw, dir] of leaves) {                          // each leaf built at its hinge, then swung
        const B = meshBuilder(), gh = H + dwarf * 0.6;
        bar(B, 0.02, 0.05, gh + 0.06, 0.04, 0); bar(B, lw - 0.02, 0.05, gh + 0.02, 0.04, 0);
        rail(B, 0, lw, 0.1, 0.04, 0.025, 0); rail(B, 0, lw, gh * 0.55, 0.04, 0.025, 0);
        const n = Math.max(2, Math.round(lw / 0.12)), arch = g.kind === 'double' ? 0.22 : 0.15;
        for (let i = 0; i <= n; i++) { const t = i / n, top = gh + arch * (dir > 0 ? Math.sin(Math.PI / 2 * t) : Math.sin(Math.PI / 2 * t)); bar(B, 0.02 + t * (lw - 0.04), 0.06, top, 0.016, 0); spear(B, 0.02 + t * (lw - 0.04), top, 0.03, 0); }
        const mm = new THREE.Matrix4().makeTranslation(hx, 0, zc).multiply(new THREE.Matrix4().makeRotationY(dir > 0 ? (g.open ? -1.35 : 0) : Math.PI + (g.open ? 1.35 : 0)));
        put('iron', B.done(), mm);
      }
      if (!g.open) boxes.push({ c: [g.at, (H + dwarf) / 2, zc], s: [g.width, H + dwarf, 0.08] });
    }
    put('iron', I.done()); if (!Br.empty()) put('wall:brick', Br.done()); if (!St.empty()) put('wall:flags', St.done());
    if (parts._pier) { const pb = parts._pier; delete parts._pier; put('wall:' + f.pierVariant, pb.done()); }
  } else {
    const Tm = meshBuilder(), paint = kind === 'picket';
    const post = (xx, h, w) => Tm.box([xx, h / 2, 0], [w / 2, 0, 0], [0, h / 2, 0], [0, 0, w / 2], 1);
    const run = (B, a, b, gate) => {
      if (paint) {
        rail(B, a, b, 0.25, 0.07, 0.03, -0.03); rail(B, a, b, H - 0.3, 0.07, 0.03, -0.03);
        const n = Math.max(1, Math.round((b - a) / 0.13));
        for (let i = 0; i <= n; i++) { const xx = a + i * (b - a) / n; B.box([xx, (H - 0.05) / 2, 0], [0.036, 0, 0], [0, (H - 0.05) / 2, 0], [0, 0, 0.01], 1); spear(B, xx, H - 0.05, 0.036, 0); }
        if (gate) { const d = Math.hypot(b - a, H - 0.55), A = Math.atan2(H - 0.55, b - a); B.box([(a + b) / 2, H / 2, -0.03], [Math.cos(A) * d / 2, Math.sin(A) * d / 2, 0], [-Math.sin(A) * 0.035, Math.cos(A) * 0.035, 0], [0, 0, 0.015], 1); }
      } else {
        for (const y of gate ? [0.3, 0.55, 0.8, 1.05] : [0.35, 0.7, 1.0]) rail(B, a, b, y, 0.1, 0.05, 0);
        if (gate) { const d = Math.hypot(b - a, 0.75), A = Math.atan2(0.75, b - a); B.box([(a + b) / 2, 0.67, 0.03], [Math.cos(A) * d / 2, Math.sin(A) * d / 2, 0], [-Math.sin(A) * 0.05, Math.cos(A) * 0.05, 0], [0, 0, 0.02], 1); }
      }
    };
    const R = paint ? meshBuilder() : Tm;
    for (const [a, b] of runs) {
      run(R, a, b, false);
      const np = Math.max(1, Math.round((b - a) / (paint ? 2 : 2.5)));
      for (let i = 0; i <= np; i++) (paint ? ((xx) => R.box([xx, H / 2, 0], [0.045, 0, 0], [0, H / 2, 0], [0, 0, 0.045], 1)) : (xx => post(xx, H + 0.1, 0.14)))(a + 0.05 + i * (b - a - 0.1) / np);
      boxes.push({ c: [(a + b) / 2, H / 2, 0], s: [b - a, H, 0.1] });
    }
    for (const g of gates) {
      if (f.pierW) {                                                    // fitted to a wall gap: masonry piers on the wall ends
        const ph = f.pierH || H + 0.45, P = meshBuilder(), S2 = meshBuilder();
        for (const s of [-1, 1]) { const px = g.at + s * (g.width / 2 + pierW / 2); P.box([px, ph / 2, 0], [pierW / 2, 0, 0], [0, ph / 2, 0], [0, 0, pierW / 2], 2.75);
          S2.box([px, ph + 0.05, 0], [pierW / 2 + 0.05, 0, 0], [0, 0.05, 0], [0, 0, pierW / 2 + 0.05], 1); boxes.push({ c: [px, ph / 2, 0], s: [pierW, ph, pierW] });
          if (f.pierPlinth) piersPlinth(px, 0); }
        put('wall:' + (kit.walls[f.pierVariant] ? f.pierVariant : 'brick'), P.done()); put('wall:flags', S2.done());
      } else for (const s of [-1, 1]) post(g.at + s * (g.width / 2 + 0.07), H + 0.25, 0.16);
      const leaves = g.kind === 'double' ? [[g.at - g.width / 2, g.width / 2, 1], [g.at + g.width / 2, g.width / 2, -1]] : [[g.at - g.width / 2, g.width, 1]];
      for (const [hx, lw, dir] of leaves) {
        const B = meshBuilder(); run(B, 0.03, lw - 0.03, true);
        put(paint ? 'paint' : 'timber', B.done(), new THREE.Matrix4().makeTranslation(hx, 0, 0).multiply(new THREE.Matrix4().makeRotationY(dir > 0 ? (g.open ? -1.35 : 0) : Math.PI + (g.open ? 1.35 : 0))));
      }
      if (!g.open) boxes.push({ c: [g.at, H / 2, 0], s: [g.width, H, 0.1] });
    }
    put('timber', Tm.done()); if (paint) put('paint', R.done());
  }
  const geo = {}; for (const k in parts) geo[k] = mergeGeometries(parts[k]);
  return { geo, boxes };
}

function mergeGeometries(list) {
  let nv = 0, ni = 0;
  for (const [g] of list) { nv += g.attributes.position.count; ni += g.index.count; }
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), U = new Float32Array(nv * 2);
  const I = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  const hasC = !!list[0][0].attributes.color, C = hasC ? new Float32Array(nv * 3) : null;
  const hasW = list.some(e => e[2] || e[0].attributes.aWear), Wr = hasW ? new Float32Array(nv * 3) : null;
  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  let ov = 0, oi = 0;
  for (const [g, m, e2] of list) {
    nm.getNormalMatrix(m);
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv, idx = g.index;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m); P.set([v.x, v.y, v.z], (ov + i) * 3);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); N.set([v.x, v.y, v.z], (ov + i) * 3);
      U[(ov + i) * 2] = u.getX(i); U[(ov + i) * 2 + 1] = u.getY(i);
      if (hasW) { const w = e2 || (g.attributes.aWear ? [g.attributes.aWear.getX(i), g.attributes.aWear.getY(i), g.attributes.aWear.getZ(i)] : null); if (w) { Wr[(ov + i) * 3] = w[0]; Wr[(ov + i) * 3 + 1] = w[1]; Wr[(ov + i) * 3 + 2] = w[2]; } }
      if (hasC) { const c = g.attributes.color; C[(ov + i) * 3] = c.getX(i); C[(ov + i) * 3 + 1] = c.getY(i); C[(ov + i) * 3 + 2] = c.getZ(i); }
    }
    for (let i = 0; i < idx.count; i++) I[oi + i] = idx.getX(i) + ov;
    ov += p.count; oi += idx.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  if (hasC) g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  if (hasW) g.setAttribute('aWear', new THREE.BufferAttribute(Wr, 3));
  g.setIndex(new THREE.BufferAttribute(I, 1));
  g.computeBoundingSphere();
  return g;
}

// Solid boxes for a wall, split round its doors (windows stay solid). World-space centres, wall-space sizes.
function wallColliders(kit, w, m) {
  const T = kit.thick, out = [];
  const doors = (w.openings || []).map(o => [o, kit.features[o.feature]]).filter(([, f]) => f && f.door)
    .map(([o, f]) => { const xs = f.outline.map(p => p[0] + o.x), ys = f.outline.map(p => p[1] + (o.y || 0));
      return [Math.min(...xs), Math.max(...xs), Math.max(...ys)]; }).sort((a, b) => a[0] - b[0]);
  const box = (x0, x1, y0, y1) => {
    if (x1 - x0 < 0.01 || y1 - y0 < 0.01) return;
    const c = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, -T / 2).applyMatrix4(m);
    out.push({ center: c, size: new THREE.Vector3(x1 - x0, y1 - y0, T), rot: w.rot || 0 });
  };
  let x = 0;
  for (const [l, r, top] of doors) { box(x, l, 0, w.height); box(l, r, top, w.height); x = r; }
  box(x, w.width, 0, w.height);
  return out;
}

// ---- batch 3: the guild's civic pieces (pediments, columns, porticos, turrets, finials) and banners ----
// a lathe: profile [[r, y], …] turned round (cx, cz) in n sides; UVs in metres / tile
function lathe(m, cx, cz, prof, n = 12, tile = 1, y0 = 0) {
  for (let k = 0; k < prof.length - 1; k++) {
    const [ra, ya] = prof[k], [rb, yb] = prof[k + 1], s = Math.hypot(rb - ra, yb - ya);
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, P = (r, y, a) => [cx + Math.sin(a) * r, y0 + y, cz + Math.cos(a) * r];
      const u0 = i / n * 2 * Math.PI * Math.max(ra, rb) / tile, u1 = (i + 1) / n * 2 * Math.PI * Math.max(ra, rb) / tile;
      m.quad(P(ra, ya, a0), P(ra, ya, a1), P(rb, yb, a1), P(rb, yb, a0), [[u0, ya / tile], [u1, ya / tile], [u1, (ya + s) / tile], [u0, (ya + s) / tile]]);
    }
  }
}
const GILT = () => new THREE.MeshStandardMaterial({ color: 0xd8b25a, roughness: 0.42, metalness: 0.45 });
function ensureMats(kit) {
  if (!kit.materials.gilt) kit.materials.gilt = GILT();
  if (!kit.materials.crystal) kit.materials.crystal = new THREE.MeshStandardMaterial({ color: 0x7fe6ff, emissive: 0x2fb8e6, emissiveIntensity: 1.2, roughness: 0.15, metalness: 0.1, flatShading: true });
}
const cloth = (kit, hex) => {
  const k = 'cloth:' + hex;
  if (!kit.materials[k]) { kit.materials[k] = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex).convertSRGBToLinear(), roughness: 0.88, metalness: 0, side: THREE.DoubleSide }); kit.materials[k].defines = { WEAR_TATTER: '' }; }
  return k;
};
// emblems: star-shaped outlines fanned from their centre, drawn on a plane facing +z (or −z with back)
const EMBLEMS = {
  crest: () => [[-0.5, 0.5], [-0.5, 0.05], [-0.42, -0.28], [-0.22, -0.5], [0, -0.6], [0.22, -0.5], [0.42, -0.28], [0.5, 0.05], [0.5, 0.5], [0, 0.5]],
  star: () => { const p = []; for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.22 : 0.55; p.push([Math.cos(a) * r, Math.sin(a) * r]); } return p; },
  sun: () => { const p = []; for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12, r = i % 2 ? 0.34 : 0.55; p.push([Math.cos(a) * r, Math.sin(a) * r]); } return p; },
  moon: () => { const p = []; for (let i = 0; i <= 12; i++) { const a = -Math.PI * 0.8 + i / 12 * Math.PI * 1.6; p.push([Math.cos(a) * 0.5, Math.sin(a) * 0.5]); } for (let i = 12; i >= 0; i--) { const a = -Math.PI * 0.62 + i / 12 * Math.PI * 1.24; p.push([0.22 + Math.cos(a) * 0.4, Math.sin(a) * 0.42]); } return p; },
  tower: () => [[-0.4, -0.55], [0.4, -0.55], [0.3, 0.25], [0.42, 0.25], [0.42, 0.55], [0.26, 0.55], [0.26, 0.42], [0.08, 0.42], [0.08, 0.55], [-0.08, 0.55], [-0.08, 0.42], [-0.26, 0.42], [-0.26, 0.55], [-0.42, 0.55], [-0.42, 0.25], [-0.3, 0.25]],
};
// draw an emblem (size s, centre c in the plane, z offset fn) as a fan; moon/key aren't star-shaped so use strips
function emblem(m, kind, cx, cy, s, zf, back = false) {
  const pts = (EMBLEMS[kind] || EMBLEMS.crest)().map(([x, y]) => [cx + x * s, cy + y * s]);
  const c = kind === 'moon' ? [cx - 0.3 * s, cy] : [cx, cy];
  if (kind === 'moon') {   // a crescent: quads between the outer and inner arcs
    for (let i = 0; i < 12; i++) { const a = pts[i], b = pts[i + 1], d = pts[25 - i], e = pts[24 - i], P = q => [q[0], q[1], zf(q[0], q[1])];
      back ? m.quad(P(a), P(d), P(e), P(b), [[0, 0], [0, 1], [1, 1], [1, 0]]) : m.quad(P(a), P(b), P(e), P(d), [[0, 0], [1, 0], [1, 1], [0, 1]]); }
    return;
  }
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], C = [c[0], c[1], zf(c[0], c[1])], A = [a[0], a[1], zf(a[0], a[1])], Bq = [b[0], b[1], zf(b[0], b[1])];
    back ? m.quad(C, Bq, A, C, [[0.5, 0.5], [1, 0], [0, 0], [0.5, 0.5]]) : m.quad(C, A, Bq, C, [[0.5, 0.5], [0, 0], [1, 0], [0.5, 0.5]]);
  }
}
// finials: 'ball' (gilt ball on a neck), 'spike' (iron spike), 'crystal' (a glowing guild crystal in an iron cup)
function finial(B, kind, x, y, z, s = 1) {
  if (kind === 'none') return;
  if (kind === 'crystal') {
    lathe(B.iron, x, z, [[0.02, 0], [0.05 * s, 0.04 * s], [0.11 * s, 0.14 * s], [0.09 * s, 0.16 * s], [0, 0.16 * s]], 8, 1, y);
    const c = B.crystal, h0 = y + 0.12 * s, R = 0.11 * s, top = h0 + 0.52 * s, bot = h0 + 0.12 * s, mid = h0 + 0.3 * s;
    for (let i = 0; i < 6; i++) { const a0 = i / 6 * Math.PI * 2, a1 = (i + 1) / 6 * Math.PI * 2, P = (a, yy, r) => [x + Math.cos(a) * r, yy, z + Math.sin(a) * r];
      c.quad(P(a0, mid, R), P(a1, mid, R), [x, top, z], [x, top, z], [[0, 0], [1, 0], [0.5, 1], [0.5, 1]]);
      c.quad(P(a1, mid, R), P(a0, mid, R), [x, bot - 0.04 * s, z], [x, bot - 0.04 * s, z], [[0, 0], [1, 0], [0.5, 1], [0.5, 1]]); }
    return;
  }
  if (kind === 'spike') { lathe(B.iron, x, z, [[0.035 * s, 0], [0.035 * s, 0.25 * s], [0.07 * s, 0.3 * s], [0.035 * s, 0.35 * s], [0.006, 0.75 * s]], 8, 1, y); return; }
  lathe(B.iron, x, z, [[0.03 * s, 0], [0.03 * s, 0.18 * s]], 8, 1, y);
  const prof = []; for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + i / 8 * Math.PI; prof.push([Math.cos(a) * 0.12 * s, 0.3 * s + Math.sin(a) * 0.12 * s]); }
  lathe(B.gilt, x, z, prof, 10, 1, y);
}
// a round boss facing +z: a disc at zf with its rim back to zb
function disc(m, cx, cy, r, zf, zb, n = 20) {
  for (let i = 0; i < n; i++) { const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, P = (a, z) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z];
    m.quad([cx, cy, zf], P(a0, zf), P(a1, zf), [cx, cy, zf], [[0.5, 0.5], [1, 0], [0, 0], [0.5, 0.5]]); m.quad(P(a0, zb), P(a1, zb), P(a1, zf), P(a0, zf), [[0, 0], [0.1, 0], [0.1, 0.05], [0, 0.05]]); }
}
function builders() { const B = {}; for (const k of ['ashlar', 'slate', 'shingle', 'boards', 'timber', 'iron', 'lead', 'gilt', 'crystal', 'civic', 'glass']) B[k] = meshBuilder(); return B; }
function partsOf(B, extra = {}) {
  const KEY = { ashlar: 'wall:ashlar', slate: 'wall:slate', shingle: 'wall:shingle', boards: 'wall:boards' }, out = {};
  for (const [k, m] of Object.entries(B)) if (!m.empty()) out[KEY[k] || k] = m.done();
  for (const k in extra) if (extra[k]) out[k] = out[k] ? mergeGeometries([[out[k], new THREE.Matrix4()], [extra[k], new THREE.Matrix4()]]) : extra[k];
  return out;
}

// a column on the ground at (x, z): order 'ionic' (attic base, slim fluted shaft, scroll capital) or 'plain'
// (Tuscan: a plinth, a plain tapering shaft, a round cushion and a square abacus); h = overall height
function column(B, order, x, z, h, y0 = 0, s = 1) {
  const st = B.ashlar, ionic = order === 'ionic', r = (ionic ? 0.17 : 0.2) * s;
  st.box([x, y0 + 0.07 * s, z], [r * 1.45, 0, 0], [0, 0.07 * s, 0], [0, 0, r * 1.45], 1.2);                     // plinth
  const bt = ionic ? [[r * 1.35, 0], [r * 1.38, 0.04], [r * 1.3, 0.08], [r * 1.12, 0.1], [r * 1.2, 0.14], [r * 1.18, 0.17], [r * 1.02, 0.2]] : [[r * 1.3, 0], [r * 1.32, 0.05], [r * 1.2, 0.1], [r * 1.02, 0.13]];
  lathe(st, x, z, bt.map(([a, b]) => [a, b * s]), 16, 1.2, y0 + 0.14 * s);
  const capH = (ionic ? 0.3 : 0.26) * s, sb = y0 + 0.14 * s + bt[bt.length - 1][1] * s, st1 = y0 + h - capH, prof = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; prof.push([r * (1 - 0.16 * Math.pow(t, 1.6)), sb + (st1 - sb) * t]); }   // entasis
  if (ionic) {   // fluting: 20 flutes as a scalloped shaft
    const n = 40;
    for (let k = 0; k < prof.length - 1; k++) for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, ra = prof[k][0], rb = prof[k + 1][0], f = i % 2 ? 0.93 : 1, g = (i + 1) % 2 ? 0.93 : 1;
      const P = (rr, y, a) => [x + Math.sin(a) * rr, y, z + Math.cos(a) * rr];
      st.quad(P(ra * f, prof[k][1], a0), P(ra * g, prof[k][1], a1), P(rb * g, prof[k + 1][1], a1), P(rb * f, prof[k + 1][1], a0), [[i / n * 1.2, prof[k][1] / 1.2], [(i + 1) / n * 1.2, prof[k][1] / 1.2], [(i + 1) / n * 1.2, prof[k + 1][1] / 1.2], [i / n * 1.2, prof[k + 1][1] / 1.2]]);
    }
  } else lathe(st, x, z, prof.map(([a, b]) => [a, b - 0]), 16, 1.2, 0);
  const rt = prof[prof.length - 1][0];
  if (ionic) {
    lathe(st, x, z, [[rt * 1.05, 0], [rt * 1.12, 0.03 * s], [rt * 1.25, 0.09 * s], [rt * 1.2, 0.12 * s]], 16, 1.2, st1);
    // the volutes: a cushion along x ending in two scroll rolls, and a thin moulded abacus over them
    const vy = st1 + 0.16 * s, vr = 0.085 * s, vx = rt * 1.25 + 0.02 * s;
    st.box([x, vy + 0.02 * s, z], [vx, 0, 0], [0, vr * 0.75, 0], [0, 0, rt * 1.05], 1.2);
    for (const sx of [-1, 1]) for (let i = 0; i < 10; i++) {
      const a0 = i / 10 * Math.PI * 2, a1 = (i + 1) / 10 * Math.PI * 2, P = (a, zz) => [x + sx * vx + Math.cos(a) * vr, vy + Math.sin(a) * vr, z + zz];
      st.quad(P(a0, rt * 1.1), P(a1, rt * 1.1), P(a1, -rt * 1.1), P(a0, -rt * 1.1), [[0, 0], [0.1, 0], [0.1, 0.3], [0, 0.3]]);
      for (const zz of [rt * 1.1, -rt * 1.1]) zz > 0 ? st.quad([x + sx * vx, vy, z + zz], P(a0, zz), P(a1, zz), [x + sx * vx, vy, z + zz], [[0.5, 0.5], [1, 0], [0, 0], [0.5, 0.5]]) : st.quad([x + sx * vx, vy, z + zz], P(a1, zz), P(a0, zz), [x + sx * vx, vy, z + zz], [[0.5, 0.5], [1, 0], [0, 0], [0.5, 0.5]]);
    }
    st.box([x, y0 + h - 0.025 * s, z], [vx + vr * 0.6, 0, 0], [0, 0.025 * s, 0], [0, 0, rt * 1.3], 1.2);
  } else {
    lathe(st, x, z, [[rt * 1.02, 0], [rt * 1.06, 0.05 * s], [rt * 1.08, 0.07 * s], [rt * 1.35, 0.15 * s], [rt * 1.38, 0.16 * s]], 16, 1.2, st1);
    st.box([x, y0 + h - 0.05 * s, z], [rt * 1.5, 0, 0], [0, 0.05 * s, 0], [0, 0, rt * 1.5], 1.2);
  }
}
export function columnParts(kit, order, h) { ensureMats(kit); const B = builders(); column(B, order, 0, 0, h); return partsOf(B); }

// a pediment on a wall or over a portico: { x (centre), y (its foot), width, pitch = 20, crest = 'crest' | none,
// finial }. The raking cornice runs up both sides over a stone tympanum; z0 = its front face, depth = how far
// back it runs (a wall's thickness, or a portico's depth, when it gets a slate roof on top too).
export function pedimentGeometry(kit, pd, z0 = 0, depth = 0.3, roof = false) {
  ensureMats(kit);
  const B = builders(), W = pd.width || 4, tp = Math.tan((pd.pitch || 20) * Math.PI / 180), cx = pd.x || 0, y = pd.y || 0;
  const ov = 0.18, hw = W / 2 + ov, ya = y + 0.14, apex = ya + hw * tp, at = kit.walls.ashlar.tile, trims = [];
  const sheet = kit.trims.raking?.sheet === 'civic' && kit.materials.civic ? 'civic' : 'trims';
  // horizontal cornice along the foot, then the two rakes (the profile's foot is laid along the slope)
  trims.push([trimGeometry(kit, 'raking', W + 2 * ov, [0, 0]), new THREE.Matrix4().makeTranslation(cx - hw, y - 0.24, z0)]);
  const L = hw / Math.cos(Math.atan(tp)), a = Math.atan(tp);
  trims.push([trimGeometry(kit, 'raking', L, [0, 0]), new THREE.Matrix4().makeTranslation(cx - hw, ya - 0.12, z0).multiply(new THREE.Matrix4().makeRotationZ(a))]);
  trims.push([trimGeometry(kit, 'raking', L, [0, 0]), new THREE.Matrix4().makeTranslation(cx, apex - 0.12, z0).multiply(new THREE.Matrix4().makeRotationZ(-a))]);
  // tympanum (front), its back face and the top of the triangle (slate on a portico, lead on a wall)
  const tw = W / 2, tA = [cx - tw, y + 0.12, z0 + 0.01], tB = [cx + tw, y + 0.12, z0 + 0.01], tC = [cx, y + 0.12 + tw * tp, z0 + 0.01], ux = v => (v[0]) / at[0], uy = v => v[1] / at[1];
  B.ashlar.quad(tA, tB, tC, tC, [[ux(tA), uy(tA)], [ux(tB), uy(tB)], [ux(tC), uy(tC)], [ux(tC), uy(tC)]]);
  const zb = z0 - depth, bA = [cx - hw, ya, zb], bB = [cx + hw, ya, zb], bC = [cx, apex + 0.24, zb];
  B.ashlar.quad(bB, bA, bC, bC, [[ux(bB), uy(bB)], [ux(bA), uy(bA)], [ux(bC), uy(bC)], [ux(bC), uy(bC)]]);
  const top = roof ? B.slate : B.lead, st = roof ? kit.walls.slate.tile : [1, 1], f0 = z0 + 0.05;
  for (const sx of [-1, 1]) {
    const e0 = [cx + sx * hw, ya + 0.26, f0], e1 = [cx + sx * hw, ya + 0.26, zb], k0 = [cx, apex + 0.26, f0], k1 = [cx, apex + 0.26, zb], sl = Math.hypot(hw, apex - ya);
    sx < 0 ? top.quad(e0, e1, k1, k0, [[0, 0], [depth / st[0], 0], [depth / st[0], sl / st[1]], [0, sl / st[1]]]) : top.quad(e1, e0, k0, k1, [[0, 0], [depth / st[0], 0], [depth / st[0], sl / st[1]], [0, sl / st[1]]]);
  }
  if (roof) B.lead.box([cx, apex + 0.3, (f0 + zb) / 2], [0, 0.05, 0], [0.05, 0, 0], [0, 0, (f0 - zb) / 2], 1);
  if (pd.crest !== 'none') {   // the guild crest in the tympanum, on a round stone boss
    const cy = y + 0.12 + tw * tp * 0.38, cs = Math.min(0.55, tw * tp * 0.42);
    disc(B.ashlar, cx, cy, cs, z0 + 0.08, z0);
    emblem(B.gilt, pd.crest || 'crest', cx, cy, cs * 0.75, () => z0 + 0.095);
  }
  if (pd.finial && pd.finial !== 'none') finial(B, pd.finial, cx, apex + 0.3, (f0 + zb) / 2, 1.1);
  return partsOf(B, { [sheet]: mergeGeometries(trims) });
}

// a portico (a platform of kind 'portico'): { x, z, rot, base, width = 4.4, depth = 2.6, height = 3.4 (the columns),
// order = 'ionic' | 'plain', columns = 4, pitch = 18, crest, finial }. Its origin is the middle of its back edge,
// against the wall, running out along +z: a stepped stone podium, a row of columns, an entablature and a
// pediment with a slate roof back to the wall.
export function porticoGeometry(kit, p) {
  ensureMats(kit);
  const W = p.width || 4.4, D = p.depth || 2.6, H = p.height || 3.4, n = Math.max(2, p.columns || 4), ph = 0.36, B = builders(), boxes = [];
  const at = kit.walls.ashlar.tile[0];
  B.ashlar.box([0, ph / 2, (D + 0.35) / 2], [W / 2 + 0.3, 0, 0], [0, ph / 2, 0], [0, 0, (D + 0.35) / 2], at);
  for (let i = 0; i < 2; i++) { const h = ph * (2 - i) / 3; B.ashlar.box([0, h / 2, D + 0.35 + 0.17 + i * 0.34], [W / 2 + 0.1 - i * 0.1, 0, 0], [0, h / 2, 0], [0, 0, 0.17], at); }
  boxes.push({ c: [0, ph / 2, (D + 0.35) / 2], s: [W + 0.6, ph, D + 0.35] });
  const cz = D, xs = []; for (let i = 0; i < n; i++) xs.push(-W / 2 + 0.3 + (W - 0.6) * i / (n - 1));
  for (const x of xs) { column(B, p.order || 'ionic', x, cz, H, ph); boxes.push({ c: [x, ph + H / 2, cz], s: [0.45, H, 0.45] }); }
  for (const x of [xs[0], xs[n - 1]]) B.ashlar.box([x, ph + H / 2, 0.06], [0.2, 0, 0], [0, H / 2, 0], [0, 0, 0.06], at);   // pilasters on the wall
  const ey = ph + H, eh = 0.93, ez = D + 0.22, ex = W / 2 + 0.28;
  B.ashlar.box([0, ey + eh / 2, ez / 2], [ex, 0, 0], [0, eh / 2, 0], [0, 0, ez / 2], at);
  const sheet = kit.materials.civic ? 'civic' : 'trims', T = [];
  T.push([trimGeometry(kit, 'entablature', 2 * ex, [1, 1]), new THREE.Matrix4().makeTranslation(-ex, ey, ez)]);
  T.push([trimGeometry(kit, 'entablature', ez, [1, 0]), new THREE.Matrix4().makeTranslation(ex, ey, ez).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2))]);
  T.push([trimGeometry(kit, 'entablature', ez, [0, 1]), new THREE.Matrix4().makeTranslation(-ex, ey, 0).multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2))]);
  const ped = pedimentGeometry(kit, { x: 0, y: ey + eh + 0.24, width: 2 * ex + 0.2, pitch: p.pitch || 18, crest: p.crest, finial: p.finial ?? 'ball' }, ez + 0.36, ez + 0.36, true);
  const geo = partsOf(B, { [sheet]: mergeGeometries(T) });
  for (const k in ped) geo[k] = geo[k] ? mergeGeometries([[geo[k], new THREE.Matrix4()], [ped[k], new THREE.Matrix4()]]) : ped[k];
  return { geo, boxes };
}

// a turret on a roof ridge (a chimney entry with turret: 'cupola' | 'bell'): { x, z, rot, base (the ridge top),
// size = 1.3, finial = 'ball' | 'spike' | 'crystal' | 'none' }. A boarded base astride the ridge, then an
// octagonal louvred lantern under a lead ogee dome (cupola), or an open frame with a bell under a shingle spire.
export function turretGeometry(kit, c) {
  ensureMats(kit);
  const s = c.size || 1.3, B = builders(), bh = 0.35, sink = 1.0;
  B.boards.box([0, (bh - sink) / 2, 0], [s / 2, 0, 0], [0, (bh + sink) / 2, 0], [0, 0, s / 2], 2.5);
  B.timber.box([0, bh + 0.04, 0], [s / 2 + 0.06, 0, 0], [0, 0.05, 0], [0, 0, s / 2 + 0.06], 1);
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.timber.box([x * (s / 2 - 0.03), (bh - sink) / 2, z * (s / 2 - 0.03)], [0.05, 0, 0], [0, (bh + sink) / 2, 0], [0, 0, 0.05], 1);
  let top;
  if ((c.turret || 'cupola') === 'cupola') {
    const R = s * 0.4, h = s * 0.72, y0 = bh + 0.09, A = i => i / 8 * Math.PI * 2 + Math.PI / 8;
    for (let i = 0; i < 8; i++) {
      const a = A(i), b = A(i + 1), px = Math.sin(a) * R, pz = Math.cos(a) * R;
      B.timber.box([px, y0 + h / 2, pz], [0.045, 0, 0], [0, h / 2, 0], [0, 0, 0.045], 1);
      const mx = (Math.sin(a) + Math.sin(b)) / 2 * R, mz = (Math.cos(a) + Math.cos(b)) / 2 * R, tx = (Math.sin(b) - Math.sin(a)) / 2 * R, tz = (Math.cos(b) - Math.cos(a)) / 2 * R, nl = Math.hypot(mx, mz), nx = mx / nl, nz = mz / nl;
      for (let k = 0; k < 5; k++) { const yy = y0 + 0.12 + k * (h - 0.2) / 5; B.timber.box([mx * 0.97, yy, mz * 0.97], [tx * 0.9, 0, tz * 0.9], [nx * 0.06, -0.045, nz * 0.06], [0, 0.01, 0], 1); }
      B.timber.box([mx, y0 + h + 0.04, mz], [tx * 1.08, 0, tz * 1.08], [0, 0.05, 0], [nx * 0.07, 0, nz * 0.07], 1);
      B.timber.box([mx, y0 + 0.03, mz], [tx * 1.08, 0, tz * 1.08], [0, 0.04, 0], [nx * 0.05, 0, nz * 0.05], 1);
    }
    lathe(B.lead, 0, 0, [[R * 1.18, 0], [R * 1.18, 0.05], [R * 1.05, 0.12], [R * 0.95, 0.3], [R * 0.6, 0.52], [R * 0.25, 0.66], [0.06, 0.74], [0.05, 0.8]].map(([r, y]) => [r, y * s / 1.3]), 8, 1, y0 + h + 0.08);
    top = y0 + h + 0.08 + 0.8 * s / 1.3;
  } else {
    const q = s * 0.36, h = s * 0.85, y0 = bh + 0.09;
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.timber.box([x * q, y0 + h / 2, z * q], [0.06, 0, 0], [0, h / 2, 0], [0, 0, 0.06], 1);
    for (const [ax, az] of [[1, 0], [0, 1]]) for (const sg of [-1, 1]) B.timber.box([az * sg * q, y0 + h - 0.06, ax * sg * q], [ax * (q + 0.06), 0, az * (q + 0.06)], [0, 0.06, 0], [az * 0.06, 0, ax * 0.06], 1);
    B.timber.box([0, y0 + h - 0.06, 0], [q, 0, 0], [0, 0.05, 0], [0, 0, 0.05], 1);
    const by = y0 + h - 0.12, br = s * 0.2;   // the bell, hung from the headstock
    lathe(B.iron, 0, 0, [[0.03, 0], [br * 0.45, -0.04], [br * 0.55, -br * 0.5], [br * 0.68, -br * 0.95], [br, -br * 1.25], [br * 0.92, -br * 1.32], [0.0, -br * 1.32]].map(([r, y]) => [r, y]), 14, 1, by);
    const e = s * 0.55, ry = y0 + h, ap = ry + s * 0.95, st = kit.walls.shingle.tile;
    for (let i = 0; i < 4; i++) {
      const a0 = i * Math.PI / 2 + Math.PI / 4, a1 = a0 + Math.PI / 2, P = a => [Math.sin(a) * e * Math.SQRT2, ry - 0.05, Math.cos(a) * e * Math.SQRT2], sl = Math.hypot(e, ap - ry);
      B.shingle.quad(P(a0), P(a1), [0, ap, 0], [0, ap, 0], [[0, 0], [2 * e / st[0], 0], [e / st[0], sl / st[1]], [e / st[0], sl / st[1]]]);
      B.timber.quad(P(a1), P(a0), [0, ry - 0.02, 0], [0, ry - 0.02, 0], [[0, 0], [1, 0], [0.5, 1], [0.5, 1]]);
    }
    top = ap - 0.04;
  }
  finial(B, c.finial || (c.turret === 'bell' ? 'spike' : 'ball'), 0, top, 0, s / 1.3);
  return partsOf(B);
}

// banners and hanging signs on a wall: { kind = 'banner' | 'sign', x, y (the top / the bracket), width = 0.8,
// length = 1.8, color = '#7a1f22', emblem = 'crest' | 'star' | 'sun' | 'moon' | 'tower' | 'none', tail = true }
export function bannerGeometry(kit, b) {
  ensureMats(kit);
  const B = builders(), col = cloth(kit, b.color || '#7a1f22'), C = meshBuilder(), em = b.emblem || 'crest';
  if ((b.kind || 'banner') === 'banner') {
    const W = b.width || 0.8, L = b.length || 1.8, x0 = b.x - W / 2, top = b.y, NX = 6, NY = 10;
    const z = (x, y) => 0.11 + 0.022 * Math.sin((top - y) * 3.2 + x * 1.7) * Math.min(1, (top - y) * 2);
    const yb = t => top - L + (b.tail !== false ? 0.22 * L * (1 - Math.abs(2 * t - 1)) : 0);
    for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) {
      const t0 = i / NX, t1 = (i + 1) / NX, xa = x0 + W * t0, xb = x0 + W * t1, P = (x, t, v) => { const y = top + (yb(t) - top) * v; return [x, y, z(x, y)]; };
      C.quad(P(xa, t0, (j + 1) / NY), P(xb, t1, (j + 1) / NY), P(xb, t1, j / NY), P(xa, t0, j / NY), [[t0, 1 - (j + 1) / NY], [t1, 1 - (j + 1) / NY], [t1, 1 - j / NY], [t0, 1 - j / NY]]);
    }
    // a hem sleeve and the iron rod with its two wall brackets and gilt knobs
    B.iron.box([b.x, top + 0.03, 0.11], [W / 2 + 0.12, 0, 0], [0, 0.018, 0], [0, 0, 0.018], 1);
    for (const sx of [-1, 1]) { B.iron.box([b.x + sx * (W / 2 + 0.04), top + 0.03, 0.055], [0.015, 0, 0], [0, 0.015, 0], [0, 0, 0.055], 1); }
    for (const sx of [-1, 1]) { const prof = []; for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + i / 6 * Math.PI; prof.push([Math.cos(a) * 0.035, Math.sin(a) * 0.035]); } lathe(B.gilt, b.x + sx * (W / 2 + 0.14), 0.11, prof, 8, 1, top + 0.03); }
    if (em !== 'none') emblem(B.gilt, em, b.x, top - L * 0.38, W * 0.36, (x, y) => z(x, y) + 0.008);
    return { ...partsOf(B), [col]: C.done() };
  }
  // a hanging sign: an iron arm out from the wall with a scroll brace, a painted board on two rings
  const S = builders(), Cs = meshBuilder(), Lr = 1.05, bw = 0.62, bh = 0.5;
  S.iron.box([0, 0, Lr / 2], [0.02, 0, 0], [0, 0.02, 0], [0, 0, Lr / 2], 1);
  const br = Math.hypot(0.55, 0.45), ba = Math.atan2(0.45, 0.55);
  S.iron.box([0, -0.225, 0.3], [0.015, 0, 0], [0, Math.sin(ba) * br / 2, Math.cos(ba) * br / 2], [0, 0.012, -0.0], 1);
  S.iron.box([0, -0.2, 0.012], [0.05, 0, 0], [0, 0.25, 0], [0, 0, 0.012], 1);   // wall plate
  finial(S, 'ball', 0, -0.015, Lr + 0.02, 0.5);
  const zc = 0.25 + bw / 2 + 0.12, ty = -0.12;
  for (const dz of [-bw / 2 + 0.08, bw / 2 - 0.08]) S.iron.box([0, -0.06, zc + dz], [0.008, 0, 0], [0, 0.06, 0], [0, 0, 0.008], 1);
  S.boards.box([0, ty - bh / 2, zc], [0.025, 0, 0], [0, bh / 2, 0], [0, 0, bw / 2], 2.5);
  for (const sx of [1, -1]) {   // the painted faces and the emblem on both sides
    const xf = sx * 0.027, P = (z, y) => [xf, y, z];
    sx > 0 ? Cs.quad(P(zc + bw / 2 - 0.04, ty - bh + 0.04), P(zc - bw / 2 + 0.04, ty - bh + 0.04), P(zc - bw / 2 + 0.04, ty - 0.04), P(zc + bw / 2 - 0.04, ty - 0.04), [[0, 0], [1, 0], [1, 1], [0, 1]])
      : Cs.quad(P(zc - bw / 2 + 0.04, ty - bh + 0.04), P(zc + bw / 2 - 0.04, ty - bh + 0.04), P(zc + bw / 2 - 0.04, ty - 0.04), P(zc - bw / 2 + 0.04, ty - 0.04), [[0, 0], [1, 0], [1, 1], [0, 1]]);
  }
  const E = meshBuilder(); if (em !== 'none') { emblem(E, em, 0, 0, 0.36, () => 0.032); emblem(E, em, 0, 0, 0.36, () => -0.032, true); }
  const m = new THREE.Matrix4().makeTranslation(b.x, b.y, 0), out = {};
  const put = (k, g) => { g.applyMatrix4(m); out[k] = out[k] ? mergeGeometries([[out[k], new THREE.Matrix4()], [g, new THREE.Matrix4()]]) : g; };
  for (const [k, g] of Object.entries(partsOf(S))) put(k, g);
  put(col, Cs.done());
  if (!E.empty()) { const g = E.done(); g.applyMatrix4(new THREE.Matrix4().makeTranslation(0, ty - bh / 2, zc).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2))); put('gilt', g); }
  return out;
}
