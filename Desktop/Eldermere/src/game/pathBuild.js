// src/game/pathBuild.js — builds the drawn paths (src/data/paths.js): for each 10 m cell a road passes through
// (and that has no grid piece on that layer), a fine height grid (20 cm) shaped by the distance to the nearest
// carriageway — a gently crowned road, a sunken gutter, the kerb, the pavement — drawn as one smooth mesh.
// Which material each pixel gets (cobbles, gutter, kerb stone, paving) is decided in the shader from that same
// distance, so the edges follow the curve exactly instead of stepping with the grid.
//
// Collision: the ground under the road as a few flat boxes per cell (road level and pavement level, on a 50 cm
// grid, merged into rectangles), hidden — the mesh is what you see.
//
//   buildPaths(d, origin, kit) → { surfaces: [{ positions, normals, pd }] (plain triangles), shapes: [...] }
// kit: box, trim, prism, lamp (as buildDungeonShapes gives the town pieces), coverAt
import { pathsOf, pathField, samplePath, ROAD } from '../data/paths.js';
import { makeLamppost } from './townBuild.js';
import { footOf } from '../data/dungeon.js';
import { carvedFn } from '../data/water.js';
import { PATH_KINDS } from '../data/paths.js';

const C = 10, N = 50, H = C / N;           // cell size, grid steps per cell, grid spacing
const SKIRT = 0.5;                          // how far the edge of the paving drops (the slab's thickness)

// height above the layer's floor for a point pd metres from the carriageway edge (negative: in the road)
export function roadHeight(f) {
  if (!f) return null;
  if (f.pd > f.outer) return null;                                        // past the pavement
  if (f.pd < -ROAD.gutter) return ROAD.crown * Math.min(1, Math.max(0, f.centre)) ** 0.7;   // the crowned road
  if (f.pd < 0) return -ROAD.gutterD;                                      // the gutter
  return ROAD.kerbH;                                                       // kerb and pavement
}

const GAP = 3;
// the per-cell road cache (buildPaths) and object ids for its keys
const cellCache = new Map(), ids = new WeakMap(); let nextId = 1;
// a road's own settings (everything but its points: widths, kind, paint, bridges, lamps…), as text, once per build
let sigMemo = new WeakMap();
const roadSig = p => { let v = sigMemo.get(p); if (v === undefined) { const { points, ...rest } = p; v = JSON.stringify(rest); sigMemo.set(p, v); queueMicrotask(() => { sigMemo = new WeakMap(); }); } return v; };
const idOf = o => { if (!o) return 0; let v = ids.get(o); if (!v) ids.set(o, v = nextId++); return v; };
const smooth01 = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };                              // pavement grows to meet a built cell up to this far away

// Worked out before the pieces are built (they ask it whether a road reaches them): per layer, the roads'
// distance field, which cells get road surface, and the classifier every point is built from.
//   near(x, y, l)        a drawn road builds in cell (x, y)
//   road(x, y, l, side)  a carriageway arrives at that side of cell (x, y): its height there, else false
export function preparePaths(d, kit) {
  const layers = new Map();
  for (const layer of new Set(pathsOf(d).filter(p => p.points.length >= 2).map(p => p.layer))) {
    const F = pathField(d, layer); if (F.empty) continue;
    const bc = new Map(), built = (x, y) => { const k = x * 4096 + y; let v = bc.get(k); if (v === undefined) { v = x >= 0 && y >= 0 && x < d.w && y < d.h && !!kit.coverAt(d, x, y, layer); bc.set(k, v); } return v; };
    // Where the pieces really are: each piece's square on this layer (moved over by its ox / oz if it's off the
    // grid). Roads stop at these squares, not at whole cells, so off-grid tiles meet the road with no gap or overlap.
    const rects = [];
    for (const [k, pc] of Object.entries(d.cells)) {
      const [x, y, b] = k.split(',').map(Number); if (layer < b - 1 || layer >= b + pc.height + 1) continue;   // (and pieces a layer above or below: a road climbs and dips through the layers, and meets them too)
      const rx = x * C + (pc.ox || 0), rz = y * C + (pc.oz || 0), [fx, fz] = footOf(pc); rects.push([rx, rz, rx + fx * C, rz + fz * C, b * C + (pc.elev || 0)]);   // (with its floor's height)
    }
    const rb = new Map(); for (const r of rects) for (let i = Math.floor(r[0] / C) - 1; i <= Math.floor(r[2] / C) + 1; i++) for (let j = Math.floor(r[1] / C) - 1; j <= Math.floor(r[3] / C) + 1; j++) { const kk = i * 4096 + j; (rb.get(kk) || rb.set(kk, []).get(kk)).push(r); }
    // signed distance to the pieces (negative inside one; Infinity if none is near)
    const sdPieces = (x, z) => {
      let out = Infinity, inside = 0;
      for (const r of rb.get(Math.floor(x / C) * 4096 + Math.floor(z / C)) || []) {
        const dx = Math.max(r[0] - x, 0, x - r[2]), dz = Math.max(r[1] - z, 0, z - r[3]);
        if (dx === 0 && dz === 0) { inside = Math.max(inside, Math.min(x - r[0], r[2] - x, z - r[1], r[3] - z)); out = Math.min(out, 0); } else out = Math.min(out, Math.hypot(dx, dz));
      }
      return inside > 0 ? -inside : out;   // (exactly on a piece's edge: 0, not 'nowhere near')
    };
    // the floor of the nearest piece outside (x, z), and how far it is
    const nearFloor = (x, z) => { let best = null; for (const r of rb.get(Math.floor(x / C) * 4096 + Math.floor(z / C)) || []) { const dd = Math.hypot(Math.max(r[0] - x, 0, x - r[2]), Math.max(r[1] - z, 0, z - r[3])); if (!best || dd < best.d) best = { d: dd, floor: r[4] }; } return best; };
    // f3: how far a point is from anything the road must stop at (pieces, the map's edge); negative inside them
    const free = (x, z) => Math.min(sdPieces(x, z), x, z, d.w * C - x, d.h * C - z);
    const covered = (i, j) => rects.some(r => r[0] <= i * C && r[1] <= j * C && r[2] >= (i + 1) * C && r[3] >= (j + 1) * C);   // a whole cell under one piece
    const occupied = (x, y) => x < 0 || y < 0 || x >= d.w || y >= d.h || covered(x, y);
    // f1: distance from the carriageway edge (the kerb line); f2: distance past the paving's outer edge, which
    // reaches out to meet built cells nearby (GAP); c: how far toward the road's centre line
    const MERGE = 3.5;
    const classify = (x, z) => {
      const f = F.at(x, z, 4); if (!f) return null;
      const de = Math.max(0, sdPieces(x, z)), past = f.pd - f.outer;                 // the paving reaches out to meet pieces within GAP
      // past a flat end: outside (the end wall). Right next to a piece the road runs on to the piece's edge instead
      // (a road ending at a grid street's mouth would otherwise stop a hair short and leave a seam)
      const sp = sdPieces(x, z), ep = (f.ep ?? -Infinity) - (sp < 1.2 ? 1.2 : 0);
      let f2 = Math.max(Math.min(past, Math.max(de - GAP, past - 4)), ep);
      let h = f.h || 0;
      // the pavement meets a piece's floor: within GAP of a tile a little higher or lower (a road sloping past a
      // level house front), the paving eases to the tile's height, so no low wall or step is left along the front
      if (f.pd >= 0 && !f.r) { const nf = nearFloor(x, z); if (nf && nf.d < GAP) { const dh = nf.floor - 0.03 - (layer * C + ROAD.kerbH + h); if (Math.abs(dh) > 0.005 && Math.abs(dh) < 1.2) h += dh * (1 - smooth01(nf.d / GAP));   /* (3 cm under the tile's floor: never level with it, so the two never flicker) */ } }
      if (f.past2 !== undefined && (past + f.past2 - MERGE) / 2 < f2) {               // two pavements less than MERGE apart join up,
        f2 = (past + f.past2 - MERGE) / 2;                                            // sloping from one road's height to the other's across the gap
        if (past > 0) h += (f.h2 - h) * Math.min(0.5, past / Math.max(1e-3, past + Math.max(0, f.past2)));
      }
      // where the paving meets a tile whose floor is above it, it runs on a few centimetres under the tile's edge, so
      // there's no hairline gap with the paving's edge wall showing through it
      let f3 = free(x, z); if (f3 < 0.3 && f3 > -0.3) { const nf = nearFloor(x, z); if (nf && nf.d < 0.3 && nf.floor >= layer * C + ROAD.kerbH + h - 0.005) f3 += 0.1; }
      const mt = f.mat || 0, f1 = f.f1 ?? f.pd;   // (dirt track or gravel: the road surface right across, tapering into a pavement; src/data/paths.js)
      return { f1, f2, c: f.centre, h, y0: f.y0 || 0, r: f.r || 0, f3, br: f.br || null, mat: mt };
    };
    const cells = new Set();
    for (const sg of F.segs) {
      const r = sg.outer + 4.3;
      for (let i = Math.floor((Math.min(sg.ax, sg.bx) - r) / C); i <= Math.floor((Math.max(sg.ax, sg.bx) + r) / C); i++)
        for (let j = Math.floor((Math.min(sg.az, sg.bz) - r) / C); j <= Math.floor((Math.max(sg.az, sg.bz) + r) / C); j++) {
          const key = `${i},${j}`; if (occupied(i, j) || cells.has(key)) continue;
          let hit = false;                                                   // a quick look: any surface in this cell?
          for (let a = 0; a <= 10 && !hit; a++) for (let b2 = 0; b2 <= 10 && !hit; b2++) { const q = classify(i * C + a, j * C + b2); if (q && q.f2 < 0 && q.f3 > -0.5) hit = true; }
          if (hit) cells.add(key);
        }
    }
    layers.set(layer, { F, cells, classify, occupied, built, free, rects });
  }
  return {
    layers,
    near: (x, y, l) => [l, l - 1, l + 1].some(pl => !!layers.get(pl)?.cells.has(`${x},${y}`)),   // (a road on the next layer up or down counts: it may climb to meet this tile)
    road: (x, y, l, sd) => {
      for (const pl of [l, l - 1, l + 1]) { const h = roadOn(pl, x, y, sd); if (h !== false) return h + (pl - l) * C; }   // (as a height above this tile's layer)
      return false;
    },
  };
  function roadOn(l, x, y, sd) {
      const L = layers.get(l); if (!L) return false;
      const [nx, nz] = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[sd];
      if (!L.cells.has(`${x + nx},${y + nz}`)) return false;
      for (let k = 2; k <= 8; k++) {                                          // just outside the side's middle 6 m
        const u = k, px = sd === 'N' || sd === 'S' ? x * C + u : (sd === 'E' ? (x + 1) * C + 0.3 : x * C - 0.3), pz = sd === 'E' || sd === 'W' ? y * C + u : (sd === 'S' ? (y + 1) * C + 0.3 : y * C - 0.3);
        const f = L.F.at(px, pz); if (f && f.pd < 0) return f.hq ?? f.h ?? 0;   // the road's height where it arrives (a number; 0 counts)
      }
      return false;
  }
}

export function buildPaths(d, origin, kit, prep = preparePaths(d, kit)) {
  const surfaces = [], shapes = [];
  for (const [layer, L] of prep.layers) {
    const { F, cells, classify, occupied } = L, Y = layer * C;
    const BOT = Y > 0 ? -Y - SKIRT : -SKIRT;                                  // side walls reach right down to the ground, not just this layer's floor
    const TB = carvedFn(d), botAt = q => q.br ? (q.h ?? 0) - 0.9 : TB ? Math.min(BOT, TB(q.x, q.z) - Y - 0.4) : BOT;   // with terrain: down to it (a dip under a road), not just to 0; a bridge: its deck, 0.9 m thick
    for (const key of cells) {
      const [ci, cj] = key.split(',').map(Number), x0 = ci * C, z0 = cj * C, V = N + 1;
      // A cell's road depends only on the roads and terrain (the field F, the carved ground TB) and the pieces within a
      // few metres of it. So its result is kept, and when a piece is moved, turned or added somewhere else (the
      // creator rebuilds the whole map after every edit) this cell is reused instead of worked out again.
      const R = 7, near = L.rects.filter(r => r[2] > x0 - R && r[0] < x0 + C + R && r[3] > z0 - R && r[1] < z0 + C + R).map(r => r.join(',')).join(';');
      const tbk = TB ? [0, 0.5, 1].flatMap(a => [0, 0.5, 1].map(b => Math.round(TB(x0 + a * C, z0 + b * C) * 100))).join(',') : '';   // (the carved ground under it, sampled)
      // (the road segments that can reach this cell — their line, widths, heights and painted surfaces — rather than
      // the whole road field: editing one road leaves the cells along the others as they were)
      const sk = F.segs.filter(sg => { const rr = sg.outer + 8; return Math.max(sg.ax, sg.bx) > x0 - rr && Math.min(sg.ax, sg.bx) < x0 + C + rr && Math.max(sg.az, sg.bz) > z0 - rr && Math.min(sg.az, sg.bz) < z0 + C + rr; })
        .map(sg => { const a = sg.stAt(sg.as), b = sg.stAt(sg.bs); return `${sg.ax.toFixed(2)},${sg.az.toFixed(2)},${sg.bx.toFixed(2)},${sg.bz.toFixed(2)},${sg.as.toFixed(1)},${sg.total.toFixed(1)},${sg.half},${sg.outer},${a.lin.toFixed(3)},${b.lin.toFixed(3)},${a.r || 0},${roadSig(sg.p)}`; }).join(';');
      const ck = `${sk}|${tbk}|${layer}|${key}|${origin.x},${origin.y},${origin.z}|${near}`, hit = cellCache.get(ck);
      if (hit) { surfaces.push(...hit.surfaces); shapes.push(...hit.shapes); continue; }
      const s0 = surfaces.length, h0 = shapes.length;
      // per grid point: f1 = distance from the carriageway edge (the kerb line, 0), f2 = distance past the
      // pavement's outer edge (0 at the edge), c = how far toward the road's centre line
      const G1 = new Float32Array(V * V), G2 = new Float32Array(V * V), GC = new Float32Array(V * V), GH = new Float32Array(V * V), GY = new Float32Array(V * V), GR = new Float32Array(V * V), G3 = new Float32Array(V * V), GB = new Uint8Array(V * V), GM = new Uint8Array(V * V); let any = false;
      for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
        const f = classify(x0 + i * H, z0 + j * H), k = j * V + i;
        if (!f) { G1[k] = 9; G2[k] = 9; GC[k] = 0; G3[k] = 9; continue; }
        G1[k] = f.f1; G2[k] = f.f2; GC[k] = f.c; GH[k] = f.h; GY[k] = f.y0; GR[k] = f.r; G3[k] = f.f3; GB[k] = f.br ? 1 : 0; GM[k] = f.mat || 0; if (G2[k] < 0 && f.f3 > 0) any = true;
      }
      if (!any) continue;
      // Each grid triangle is cut exactly along the kerb line and the pavement's edge (marching triangles), so
      // the kerb is a true vertical face that follows the curve, not a saw-tooth across the grid
      const pos = [], nor = [], pd = [];
      // every triangle is wound to face its intended way (up, or the face's outward normal), so the material can
      // skip back faces: two faces back to back where the road meets a piece then never flicker against each other
      const tri = (a, b, c) => {
        const wx = a.nx ?? 0, wy = a.down ? -1 : a.nx == null ? 1 : 0, wz = a.nz ?? 0;
        const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
        const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
        if (gx * wx + gy * wy + gz * wz < 0) { const t = b; b = c; c = t; }
        const mt = Math.max(a.mat || 0, b.mat || 0, c.mat || 0) * 100; for (const q of [a, b, c]) { pos.push(origin.x + q.x, origin.y + Y + q.y, origin.z + q.z); nor.push(wx, wy, wz); pd.push(q.pd + mt); }   // (the surface's material rides along in pd: 100 per material)
      };
      const lerpV = (a, b, t) => { const o = {}; for (const k in a) o[k] = typeof a[k] === 'number' && k !== 'y0' && k !== 'r' && k !== 'mat' ? a[k] + (b[k] - a[k]) * t : a[k]; return o; };
      const clip = (poly, key, below) => {                                   // keep the part where v[key] < 0 (below) or >= 0
        const out = [];
        for (let n = 0; n < poly.length; n++) {
          const a = poly[n], b = poly[(n + 1) % poly.length], ina = below ? a[key] < 0 : a[key] >= 0, inb = below ? b[key] < 0 : b[key] >= 0;
          if (ina) out.push(a);
          if (ina !== inb) { const t = a[key] / (a[key] - b[key]); const m = lerpV(a, b, t); m[key] = 0; out.push(m); }
        }
        return out;
      };
      const roadY = q => q.f1 < -ROAD.gutter ? ROAD.crown * Math.min(1, Math.max(0, q.c)) ** 0.7 : -ROAD.gutterD;
      const fan0 = (poly, yOf) => { for (let n = 1; n < poly.length - 1; n++) tri(...[poly[0], poly[n], poly[n + 1]].map(q => ({ x: q.x, z: q.z, y: yOf(q), pd: q.f1, mat: q.mat }))); };
      // the tread height at a point (on a slope, just its height)
      const hq = q => q.r ? q.y0 + q.r * Math.round((q.h - q.y0) / q.r) : q.h;
      // a surface polygon at height off(q) + the road's height. On steps, it's cut exactly along each riser
      // (where the even slope is halfway between two treads) into flat treads, with a vertical riser between
      // pdv: the material its risers get, well inside one band (a corner's own distance can sit right on a
      // threshold, and the pixels then flicker between two materials)
      const fan = (poly, off, pdv = poly[0].f1) => {
        const st = poly.find(q => q.r); if (!st) return fan0(poly, q => off(q) + q.h);
        const { y0, r } = st, U = poly.map(q => ({ ...q, y0, r, u: (q.h - y0) / r }));
        const k0 = Math.round(Math.min(...U.map(q => q.u))), k1 = Math.round(Math.max(...U.map(q => q.u)));
        for (let kk = k0; kk <= k1; kk++) {
          let sl = U.map(q => ({ ...q, w: q.u - (kk - 0.5) })); sl = clip(sl, 'w', false); if (sl.length < 3) continue;
          sl = sl.map(q => ({ ...q, w: q.u - (kk + 0.5) })); sl = clip(sl, 'w', true); if (sl.length < 3) continue;
          fan0(sl, q => off(q) + y0 + r * kk);
          if (kk < k1) face(U.map(q => ({ ...q, w: (q.u - (kk + 0.5)) * Math.sign(r) })), 'w', q => off(q) + y0 + r * kk, q => off(q) + y0 + r * (kk + 1), pdv, false);   // the riser up to the next tread
        }
      };
      // a vertical face along the line where `key` crosses 0 in this polygon, from y0 to y1
      const face = (poly, key, y0f, y1f, pdv, split = true) => {
        const cut = [];
        for (let n = 0; n < poly.length; n++) { const a = poly[n], b = poly[(n + 1) % poly.length]; if ((a[key] < 0) !== (b[key] < 0)) cut.push(lerpV(a, b, a[key] / (a[key] - b[key]))); }
        if (cut.length < 2) return;
        const [p, q] = cut, inner = poly.find(v => v[key] < 0) || poly[0];       // the face looks toward the low side
        let nx = -(q.z - p.z), nz = q.x - p.x; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
        if ((inner.x - p.x) * nx + (inner.z - p.z) * nz < 0) { nx = -nx; nz = -nz; }
        const quad = (p, q) => { const A = { x: p.x, z: p.z, y: y0f(p), pd: pdv, nx, nz, mat: p.mat }, B = { x: q.x, z: q.z, y: y0f(q), pd: pdv, nx, nz, mat: p.mat }, A2 = { ...A, y: y1f(p) }, B2 = { ...B, y: y1f(q) }; tri(A, B, B2); tri(A, B2, A2); };
        // On steps, a side face (kerb, gutter lip, pavement edge) is split where it crosses each riser, and each
        // piece takes its own tread's height: one slanted strip across a riser left gaps and a crooked edge
        const st = split && (p.r ? p : q.r ? q : null);
        if (!st) return quad(p, q);
        const { y0, r } = st, up = (p.h - y0) / r, uq = (q.h - y0) / r, ts = [0];
        for (let k = Math.ceil(Math.min(up, uq) - 0.5); k + 0.5 < Math.max(up, uq); k++) { const t = (k + 0.5 - up) / (uq - up); if (t > 1e-4 && t < 1 - 1e-4) ts.push(t); }
        ts.push(1); ts.sort((a, b) => a - b);
        for (let n = 0; n < ts.length - 1; n++) {
          const k = Math.round(up + (uq - up) * (ts[n] + ts[n + 1]) / 2), hk = y0 + r * k;
          const a = { ...lerpV(p, q, ts[n]), h: hk, r: 0 }, b = { ...lerpV(p, q, ts[n + 1]), h: hk, r: 0 };
          quad(a, b);
        }
      };
      const P = (i, j) => { const k = j * V + i; return { x: x0 + i * H, z: z0 + j * H, f1: G1[k], f2: G2[k], c: GC[k], h: GH[k], y0: GY[k], r: GR[k], g: GM[k] === 4 ? -1 : G1[k] + ROAD.gutter, f3: G3[k], br: GB[k], mat: GM[k] }; };   // (planks: no gutter)   // g: distance past the gutter's inner edge
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const a = P(i, j), b = P(i + 1, j), c = P(i, j + 1), e = P(i + 1, j + 1);
        for (const t0 of [[a, c, e], [a, e, b]]) {
          if (t0.every(q => q.f2 >= 0)) continue;
          // cut away whatever lies inside a piece (or off the map), exactly along its edge, with a side face there
          // from the road down to the slab's foot, looking into the piece
          const tf = clip(t0, 'f3', false); if (tf.length < 3) continue;
          const t = clip(tf, 'f2', true); if (t.length < 3) continue;          // the surface: inside the paving's outline (its sides and the flat ends)
          if (t.length !== tf.length || tf.some(q => q.f2 >= 0))                   // the outline's wall, down to the ground
            face(tf.map(q => ({ ...q, f2: -q.f2 })), 'f2', q => hq(q) + (q.f1 < 0 ? roadY(q) : ROAD.kerbH), botAt, 1.0);
          if (t.length !== t0.length || t0.some(q => q.f3 < 0)) { const surf = clip(t0, 'f2', true); if (surf.length >= 3 && surf.some(q => q.f3 >= 0) && surf.some(q => q.f3 < 0))
            face(surf, 'f3', botAt, q => hq(q) + (q.f1 < 0 ? roadY(q) : ROAD.kerbH), 0.6); }
          const road = clip(t, 'f1', true);
          if (road.length >= 3) {                                            // the cobbles and the gutter, cut exactly along the gutter's edge, with its little lip between
            const cob = clip(road, 'g', true), gut = clip(road, 'g', false);
            const crownY = q => ROAD.crown * Math.min(1, Math.max(0, q.c)) ** 0.7;
            if (cob.length >= 3) fan(cob, crownY, -1);
            if (gut.length >= 3) fan(gut, () => -ROAD.gutterD, -0.2);
            if (cob.length >= 3 && gut.length >= 3) face(road.map(q => ({ ...q, g: -q.g })), 'g', q => hq(q) - ROAD.gutterD, q => hq(q) + crownY(q), -0.2);   // the lip: gutter stone
          }
          if (t.some(q => q.br)) for (let n = 1; n < t.length - 1; n++) tri(...[t[0], t[n], t[n + 1]].map(q => ({ x: q.x, z: q.z, y: botAt(q), pd: 1, mat: q.mat, down: true })));   // a bridge's deck: its underside
          const side = clip(t, 'f1', false), pave = side;
          if (pave.length >= 3) fan(pave, () => ROAD.kerbH, 1);
          if (road.length >= 3 && side.length >= 3) face(t, 'f1', q => hq(q) - ROAD.gutterD, q => hq(q) + ROAD.kerbH, 0.15);                       // the kerb

        }
      }
      surfaces.push({ positions: new Float32Array(pos), normals: new Float32Array(nor), pd: new Float32Array(pd) });
      // collision: a 50 cm grid of road / pavement squares, merged into rectangles
      const G = 20, g = C / G, cls = new Int32Array(G * G);   // per square: 0 nothing, else its kind and height (2 cm steps) as one number
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const f = classify(x0 + (i + 0.5) * g, z0 + (j + 0.5) * g); cls[j * G + i] = !f || f.f2 >= 0 || f.f3 < 0 ? 0 : (f.f1 >= 0 ? 2 : 1) * 100000 + Math.round(((f.r ? f.y0 + f.r * Math.round((f.h - f.y0) / f.r) : f.h) + (f.f1 >= 0 ? ROAD.kerbH : 0)) * 50) + 50000; }
      const used = new Uint8Array(G * G);
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
        const c = cls[j * G + i]; if (!c || used[j * G + i]) continue;
        let w = 1; while (i + w < G && cls[j * G + i + w] === c && !used[j * G + i + w]) w++;
        let h = 1; grow: while (j + h < G) { for (let q = 0; q < w; q++) if (cls[(j + h) * G + i + q] !== c || used[(j + h) * G + i + q]) break grow; h++; }
        for (let a = 0; a < h; a++) for (let q = 0; q < w; q++) used[(j + a) * G + i + q] = 1;
        { const top = ((c % 100000) - 50000) / 50, cq = classify(x0 + (i + w / 2) * g, z0 + (j + h / 2) * g), onBr = !!cq?.br;   // (a bridge's deck: a slab, not down to the ground; the ground builder leaves it alone)
          shapes.push({ type: 'box', hidden: true, surface: 'stone', path: true, ...(onBr ? { bridge: true } : {}), min: [origin.x + x0 + i * g, origin.y + Y + (onBr ? top - 1.0 : botAt({ x: x0 + (i + w / 2) * g, z: z0 + (j + h / 2) * g })), origin.z + z0 + j * g], max: [origin.x + x0 + (i + w) * g, origin.y + Y + top, origin.z + z0 + (j + h) * g] }); }
      }
      cellCache.set(ck, { surfaces: surfaces.slice(s0), shapes: shapes.slice(h0) }); if (cellCache.size > 6000) cellCache.delete(cellCache.keys().next().value);
    }
    // lamps along each road, alternating sides, on the pavement by the kerb
    for (const p of pathsOf(d)) {
      if (p.layer !== layer || p.points.length < 2 || p.lamps === false || p.pave < 1) continue;
      const S = samplePath(p, 0.5), pairs = PATH_KINDS[p.kind]?.pairs || p.road >= 7, every = pairs ? 16 : 14, off = p.road / 2 + ROAD.kerb + 0.55;
      let next = 4, side = 1;
      for (const q of S) {
        if (q.s < next) continue;
        if (pairs) side = q.s % (2 * every) < every ? 1 : -1;                   // wide roads: lamps on both sides (staggered, one side then the other)
        const lx = q.x - q.tz * off * side, lz = q.z + q.tx * off * side, retry = () => { next = q.s + 1; };   // no room here: try a metre on
        if (L.free(lx, lz) < 0.5 || kit.nearLight?.(lx, lz, 5)) { retry(); continue; }   // (and not within 5 m of another light: a lamp, a door lantern)
        const f = F.at(lx, lz); if (!f || f.pd < ROAD.kerb + 0.2 || (f.f1 ?? f.pd) < ROAD.kerb + 0.2) { retry(); continue; }        // not in another road
        if ([[0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]].some(([ax, az]) => { const g = F.at(lx + ax, lz + az); return g && g.p !== p && (g.f1 ?? g.pd) < 0.05; })) { retry(); continue; }   // nor right beside another road's carriageway (a junction's corner)
        if (f.mat === 2 || f.mat === 3 || f.bare > 0.05) { retry(); continue; }                                  // no lamps along a dirt track or gravel (no pavement to stand on)
        // not on or beside steps (a lamp would stand half on a tread), and clear of anything solid already there
        const nearSteps = [-2, -1, 0, 1, 2].some(dd => { const g = F.at(lx + q.tx * dd, lz + q.tz * dd); return g && g.r; });
        const base = Y + ROAD.kerbH + (f.h || 0);
        if (nearSteps || kit.blocked?.(lx - 0.4, lz - 0.4, lx + 0.4, lz + 0.4, base + 0.05, base + 4.5)) { retry(); continue; }
        next = q.s + (pairs ? every / 2 : every); side = -side;
        makeLamppost(kit, lx, lz, base);
      }
    }
    for (const p of pathsOf(d)) if (p.layer === layer && p.points.length >= 2) roadDetails(p, L, Y, kit);
  }
  return { surfaces, shapes };
}

// ---- details along a road: drain grates in the gutters (and extra ones at low points), manhole covers down the
// middle, patches of worn or relaid cobbles, cracked paving slabs; a boulevard's planted middle strip. All
// decoration (not solid, except the planters and trees), seeded from the road's id so they're the same every build,
// laid on the surface (each corner at the road's height there), never on steps or inside a piece. (Colours here
// are darker than they look: the town's vertex colours come out lighter on screen.)
function roadDetails(p, L, Y, kit) {
  if (!kit.poly) return;
  const { F } = L, S = samplePath(p, 0.5); if (S.length < 4) return;
  let seed = 0; for (const ch of p.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const hq = f => f.r ? f.y0 + f.r * Math.round((f.h - f.y0) / f.r) : f.h;
  const surf = (x, z, zone) => {                                                  // the surface height there, if it's that zone of this road
    const f = F.at(x, z); if (!f || f.p !== p || f.r || L.free(x, z) < 0.3 || f.br || (f.mat || 0) >= 2) return null;   // (none on a bridge, a dirt track, gravel or planks)
    const inGut = f.pd > -ROAD.gutter && f.pd < 0, inRoad = f.pd <= -ROAD.gutter, inPave = f.pd > ROAD.kerb && f.pd < f.outer;
    if ((zone === 'gutter' && !inGut) || (zone === 'road' && !inRoad) || (zone === 'pave' && !inPave)) return null;
    return hq(f) + (inRoad ? ROAD.crown * Math.min(1, Math.max(0, f.centre)) ** 0.7 : inGut ? -ROAD.gutterD : ROAD.kerbH);
  };
  // a flat-lying shape: corners (u across, v along) around (q, offset across), lifted `lift` above the surface
  const lay = (q, across, corners, zone, lift, color, tex) => {
    const pts = [];
    for (const [u, v] of corners) {
      const x = q.x - q.tz * (across + u) + q.tx * v, z = q.z + q.tx * (across + u) + q.tz * v, y = surf(x, z, zone);
      if (y == null) return false; pts.push([x, Y + y + lift, z]);
    }
    kit.poly(pts, color, tex); return true;
  };
  const ngon = (n, r, wob = 0) => Array.from({ length: n }, (_, k) => { const a = k / n * Math.PI * 2, rr = r * (1 - wob / 2 + wob * rnd()); return [Math.cos(a) * rr, Math.sin(a) * rr]; });
  const rect = (w, l) => [[-w / 2, -l / 2], [w / 2, -l / 2], [w / 2, l / 2], [-w / 2, l / 2]];
  const total = S[S.length - 1].s, half = p.road / 2, at = s0 => S[Math.min(S.length - 1, Math.round(s0 / 0.5))];
  const details = p.details !== false;
  // drain grates in both gutters, every 18 m or so, staggered; and at each low point along the road
  if (details) {
    const grate = (q, side) => { const ac = side * (half - ROAD.gutter / 2);
      if (lay(q, ac, rect(0.4, 0.78), 'gutter', 0.012, '#26221d', 6)) lay(q, ac, rect(0.3, 0.66), 'gutter', 0.022, '#070605', 6); };
    for (let s0 = 6 + rnd() * 6; s0 < total - 2; s0 += 16 + rnd() * 6) grate(at(s0), rnd() < 0.5 ? 1 : -1);
    const H = S.map(q => { const f = F.at(q.x, q.z); return f && f.p === p ? f.h : null; });
    for (let i = 3; i < S.length - 3; i++) if (H[i] != null && H[i - 3] != null && H[i + 3] != null && H[i] < H[i - 3] - 0.05 && H[i] <= H[i + 3] - 0.05 && H[i] <= H[i - 1] && H[i] <= H[i + 1]) { grate(S[i], 1); grate(S[i], -1); }
    // manhole covers down the middle (a boulevard's sit in each carriageway)
    for (let s0 = 10 + rnd() * 10; s0 < total - 4; s0 += 26 + rnd() * 14) {
      const q = at(s0), ac = p.median ? (rnd() < 0.5 ? 1 : -1) * half / 2 : (rnd() - 0.5) * half * 0.4;
      if (lay(q, ac, ngon(10, 0.52), 'road', 0.012, '#3a332b', 6)) lay(q, ac, ngon(10, 0.42), 'road', 0.022, '#14110e', 6);
    }
    // worn patches and relaid cobbles on the carriageway; cracked or darker slabs on the pavements
    for (let s0 = 2 + rnd() * 4; s0 < total - 1; s0 += 3 + rnd() * 7) {
      const q = at(s0);
      if (rnd() < 0.7) { const c = rnd() < 0.5 ? '#867868' : '#aa9a86'; lay(q, (rnd() - 0.5) * (half - 0.8) * 2, ngon(7, 0.5 + rnd() * 0.8, 0.5), 'road', 0.006, c, 1); }
      if (p.pave >= 1 && rnd() < 0.45) { const side = rnd() < 0.5 ? 1 : -1, ac = side * (half + ROAD.kerb + 0.4 + rnd() * (p.pave - 0.8)), c = rnd() < 0.5 ? '#a89a84' : '#d2c6ae', w = 0.6 + rnd() * 0.6;
        lay(q, ac, rect(w, w * (0.8 + rnd() * 0.5)), 'pave', 0.006, c, 8); }
    }
  }
  // a boulevard's middle: stone planters with a tree, and a lamp between each pair
  if (p.median) {
    for (let s0 = 6; s0 < total - 4; s0 += 12) {
      const q = at(s0), f = F.at(q.x, q.z); if (!f || f.p !== p || f.r || L.free(q.x, q.z) < 1.5) continue;
      const y = Y + hq(f) + ROAD.crown, x = q.x, z = q.z;
      if (kit.blocked?.(x - 0.9, z - 0.9, x + 0.9, z + 0.9, y + 0.05, y + 5)) continue;
      kit.box(x - 0.8, y, z - 0.8, x + 0.8, y + 0.55, z + 0.8, '#bfae8e');                      // the planter
      kit.trim(x - 0.88, y + 0.55, z - 0.88, x + 0.88, y + 0.62, z + 0.88, '#d2c2a2');
      kit.trim(x - 0.7, y + 0.55, z - 0.7, x + 0.7, y + 0.7, z + 0.7, '#5a4030');
      if (kit.plant) kit.plant('tree', x, y + 0.6, z, 0.75, s0 * 1.7, Math.round(s0 / 12) % 3);   // the tree (src/gfx/foliage.js)
      else { kit.box(x - 0.16, y + 0.6, z - 0.16, x + 0.16, y + 3.4, z + 0.16, '#5a3b24', { tex: 4 }); for (const [r, h, oy] of [[1.7, 1.1, 3.0], [1.25, 1.0, 3.9], [0.7, 0.8, 4.7]]) kit.trim(x - r, y + oy, z - r, x + r, y + oy + h, z + r, '#4f8a3a', { tex: 6 }); }
      if (s0 + 6 < total - 2) { const q2 = at(s0 + 6), f2 = F.at(q2.x, q2.z); if (f2 && f2.p === p && !f2.r && L.free(q2.x, q2.z) > 1) makeLamppost(kit, q2.x, q2.z, Y + hq(f2) + ROAD.crown); }
    }
  }
}
