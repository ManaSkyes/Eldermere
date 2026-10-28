// src/game/townBuild.js — the Town theme (T, and the Outer area O until it has its own): open-air pieces in the
// Palm Brinks spirit (Dark Cloud 2), pushed toward fantasy and early magic-punk: cobbled streets with raised
// pavements, crystal lampposts, flower boxes under shuttered windows, timber-and-plaster houses with tiled gable
// roofs, canals with bridges, and the town's heart, the Great Crystal, ringed by warp pads.
//
// Called by buildDungeonShapes (src/game/dungeonBuild.js) for each town piece, with a kit of its helpers.
// No rock and no ceilings: town pieces are under the sky. A town piece above layer 0 with nothing under it
// stands on a stone retaining block down to the ground, so higher streets read as terraces.
//
//   streets   C J X T D E K — the road runs down the middle band and out along each open side; the rest of
//             the cell is pavement, a kerb's height up. 1 plain · 2 lamplit · 3 market (stalls and awnings)
//   plaza     R — paved square. 1 benches and planters · 2 the Great Crystal on its dais · 3 warp circle
//             (five pads in the crystal-dust colours, beams of light) · 4 garden (a tree, flower beds) · 5 fountain
//             (a two-tier fountain in a basin you can wade in)
//   stairs    S — broad open stone steps with balustrades, lamps at top and bottom
//   buildings H (houses), L (landmarks), Y (skyline) — any size (fw × fd cells); built by src/game/buildings.js.
//             Their front (door) faces the way they're turned.
//   filler    F — dead space, any size: garden, yard, empty lot, sheds, stone block, trees (src/game/fillers.js)
//   canal     W — runs ahead/behind: a 4 m channel of swimmable water, walkways either side. 1 canal ·
//             2 canal with a bridge across
// Any side of a town cell that has nothing next to it gets a stone parapet, so you can't walk off the map.

import { footOf } from '../data/dungeon.js';
import { terrainOf } from '../data/terrain.js';
import { carvedFn } from '../data/water.js';
import { buildBuilding } from './buildings.js';
import { buildFiller } from './fillers.js';

const TC = {
  road: '#9a8c7a', pave: '#c2b49c', kerb: '#d0c2a6', gutter: '#7a6e60', plaza: '#cdbf9f', parapet: '#bfae8e', cap: '#d2c2a2', found: '#9a8a72',
  plaster: '#ece0c4', timber: '#5a3b24', plinth: '#a49278', brick: '#b0634a', quoin: '#d4c4a4', glass: '#ffd98e', glassDim: '#3c4a5a',
  door: '#6a3e22', iron: '#2f2b28', copper: '#c07a40', roofs: ['#b4553a', '#a4483a', '#5f6f8f', '#7a5a8a', '#b86a3a'],
  shutters: ['#3f7a5a', '#3a5f8a', '#9a3a32', '#c08a3a', '#6a4a8a'], flowers: ['#e04a6a', '#f0c040', '#e86a3a', '#c060d0', '#f2f2f2'], leaf: '#4f8a3a',
  awning: [['#c8443a', '#f0e6d0'], ['#3a6aa8', '#f0e6d0'], ['#3f8a5a', '#f0e6d0'], ['#c08a2a', '#6a3a22']], water: '#3a6a8a', wood: '#7a5232', bench: '#6a4428',
};
const DUST = ['#5fe08a', '#f2d65a', '#6fb6ff', '#ff6a5a', '#b67aff'];   // the crystal-dust colours: green, yellow, blue, red, purple
const LAMP = '#ffdca0';

// a crystal lamppost at (px, pz) standing at height Y (cell/map metres): a stepped base, an iron post, a copper
// cap and a caged crystal. Shared with the drawn roads (src/game/pathBuild.js).
export function makeLamppost(k, px, pz, Y, color = LAMP, hgt = 3.6) {
  const { box, trim, prism, lamp } = k;
  box(px - 0.28, Y, pz - 0.28, px + 0.28, Y + 0.35, pz + 0.28, TC.parapet);
  box(px - 0.09, Y + 0.35, pz - 0.09, px + 0.09, Y + hgt, pz + 0.09, TC.iron);
  trim(px - 0.16, Y + hgt - 0.05, pz - 0.16, px + 0.16, Y + hgt + 0.05, pz + 0.16, TC.copper, { tex: 6 });
  for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) trim(px + ox * 0.15 - 0.02, Y + hgt + 0.05, pz + oz * 0.15 - 0.02, px + ox * 0.15 + 0.02, Y + hgt + 0.55, pz + oz * 0.15 + 0.02, TC.iron, { tex: 6 });
  prism({ type: 'gable', min: [px - 0.22, Y + hgt + 0.55, pz - 0.22], max: [px + 0.22, Y + hgt + 0.8, pz + 0.22], axis: 'x', color: TC.copper, tex: 6 });
  lamp(px, Y + hgt + 0.3, pz, color, Y);
}

export function buildTownPiece(k, p, x, y, b) {
  const { C, A, B, box, trim, prism, ramp, lamp, d } = k;
  const cx = x * C, cz = y * C, Y = b * C + (p.elev || 0), Y0 = Y,   // elev: raised within its layer (0.25 m steps)
    v = p.variant || 1, part = p.part;
  const rnd = n => k.rnd(x, y, n + b * 13);
  const pick = (arr, n) => arr[Math.floor(rnd(n) * arr.length) % arr.length];
  const nbAt = sd => k.coverAt(d, x + (sd === 'E') - (sd === 'W'), y + (sd === 'S') - (sd === 'N'), b);
  const isTown = n => n && (n.piece.theme === 'T' || n.piece.theme === 'O');
  const isBuilding = n => n && 'HLY'.includes(n.piece.part);
  const face = k.faceOf(p);
  // local frame (as the stairs use): u across 0..10 (left to right looking forward), w from the back edge (0) to
  // the front edge (10). Forward is the way the piece faces.
  // big buildings (H L Y) cover fw × fd cells: UW across the front, WD deep; SX × SZ in world metres
  const big = 'HLYF'.includes(part), [fw0, fd0] = big ? [p.fw || 1, p.fd || 1] : [1, 1], UW = fw0 * C, WD = fd0 * C;
  const [sxC, szC] = big ? footOf(p) : [1, 1], SX = sxC * C, SZ = szC * C;
  const rect = (u0, u1, w0, w1) => {
    if (face === 'N') return [cx + u0, cz + WD - w1, cx + u1, cz + WD - w0];
    if (face === 'S') return [cx + UW - u1, cz + w0, cx + UW - u0, cz + w1];
    if (face === 'E') return [cx + w0, cz + u0, cx + w1, cz + u1];
    return [cx + WD - w1, cz + UW - u1, cx + WD - w0, cz + UW - u0];
  };
  const lpt = (u, w) => { const r = rect(u, u, w, w); return [r[0], r[1]]; };
  const lbox = (u0, u1, w0, w1, y0, y1, color, tex = 0, solid = true) => { const [x0, z0, x1, z1] = rect(u0, u1, w0, w1); (solid ? box : trim)(x0, y0, z0, x1, y1, z1, color, { tex }); };
  const fwd = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[face];          // world direction of +w (toward the front)
  const acrossAxis = face === 'N' || face === 'S' ? 'x' : 'z';                    // world axis of u
  const HIGH = { N: { '+w': '-z', '-w': '+z' }, S: { '+w': '+z', '-w': '-z' }, E: { '+w': '+x', '-w': '-x' }, W: { '+w': '-x', '-w': '+x' } }[face];
  const lgable = (u0, u1, w0, w1, y0, y1, color, endColor, along = 'u', tex = 2, endTex = 3) => { const [x0, z0, x1, z1] = rect(u0, u1, w0, w1); const axis = along === 'u' ? acrossAxis : (acrossAxis === 'x' ? 'z' : 'x'); prism({ type: 'gable', min: [x0, y0, z0], max: [x1, y1, z1], axis, color, endColor, tex: axis === 'x' ? 2 : 7, endTex }); };
  const lwedge = (u0, u1, w0, w1, y0, y1, color, high, tex = 6) => { const [x0, z0, x1, z1] = rect(u0, u1, w0, w1); prism({ type: 'wedge', min: [x0, y0, z0], max: [x1, y1, z1], high: HIGH[high], thick: 0.08, color, tex }); };

  // ---- shared bits ----
  // the ground: cobbles (or paving) over a slab; above layer 0 with nothing under it, a retaining block to the ground
  const ground = (color, tex, u0 = 0, u1 = UW, w0 = 0, w1 = WD) => lbox(u0, u1, w0, w1, Y - 0.5, Y, color, tex);
  // what it stands on: above layer 0 with nothing under it, a retaining block down to the ground; raised within
  // its layer, a block from the layer's floor up (its sides are the retaining walls where the neighbours are lower)
  // With terrain, it reaches down to the lowest ground under it (so a tile on a slope never shows a gap below its
  // downhill edge); TER: the terrain, OX / OZ: where the piece really is (moved off the grid)
  const TER = terrainOf(d), OX = cx + (p.ox || 0), OZ = cz + (p.oz || 0);
  const terrMin = () => { const G = carvedFn(d); let m = Infinity; for (let a = 0; a <= SX; a += 2) for (let c = 0; c <= SZ; c += 2) m = Math.min(m, G(OX + a, OZ + c)); return m - 0.06; };
  {
    const below = b > 0 ? k.coverAt(d, x, y, b - 1) : null; let bot = null;
    if (b > 0 && !below) { let lo = b - 1; while (lo > k.lo && !k.coverAt(d, x, y, lo - 1)) lo--; bot = lo * C; }
    else if (p.elev > 0) bot = b * C - 0.5;
    if (TER && !below) bot = Math.min(bot ?? Y - 0.5, terrMin() - 0.3);
    if (bot != null && bot < Y - 0.5) box(cx, bot, cz, cx + SX, Y - 0.5, cz + SZ, TC.found, { tex: 0 });
  }
  // a crystal lamppost at (wx, wz) in cell metres: a stepped base, an iron post, a bracket and a caged crystal
  const lamppost = (px, pz, color = LAMP, hgt = 3.6, Y = Y0) => makeLamppost(k, px, pz, Y, color, hgt);
  // a flower box: a wooden trough with flowers (u along the wall); centred at world (px, py, pz), long along `axis`
  const flowerBox = (px, py, pz, len, axis, seed) => {
    const [hx, hz] = axis === 'x' ? [len / 2, 0.18] : [0.18, len / 2];
    trim(px - hx, py, pz - hz, px + hx, py + 0.26, pz + hz, TC.wood, { tex: 4 });
    trim(px - hx + 0.04, py + 0.26, pz - hz + 0.04, px + hx - 0.04, py + 0.36, pz + hz - 0.04, TC.leaf, { tex: 6 });
    const n = Math.max(2, Math.round(len / 0.3));
    if (k.plant) { const m = Math.max(1, Math.round(len / 0.45)); for (let i = 0; i < m; i++) { const t = (i + 0.5) / m - 0.5; k.plant('flower', px + (axis === 'x' ? t * len : 0), py + 0.3, pz + (axis === 'x' ? 0 : t * len), 0.65 + rnd(seed + i + 9) * 0.25, rnd(seed + i) * 6.28, Math.floor(rnd(seed + i + 3) * 6)); } return; }   // (the shared flower models: src/gfx/foliage.js)
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n - 0.5, c = TC.flowers[Math.floor(rnd(seed + i) * 5)], s = 0.07 + rnd(seed + i + 9) * 0.04;
      const fx = px + (axis === 'x' ? t * len : (rnd(seed + i + 3) - 0.5) * 0.15), fz = pz + (axis === 'x' ? (rnd(seed + i + 3) - 0.5) * 0.15 : t * len);
      trim(fx - s, py + 0.34, fz - s, fx + s, py + 0.44 + rnd(seed + i + 5) * 0.08, fz + s, c, { tex: 6 }); }
  };
  // a planter: a stone tub of flowers on the ground
  const planter = (px, pz, s, seed, Y = Y0) => {
    box(px - s, Y, pz - s, px + s, Y + 0.6, pz + s, TC.parapet);
    trim(px - s - 0.06, Y + 0.6, pz - s - 0.06, px + s + 0.06, Y + 0.68, pz + s + 0.06, TC.cap);
    if (k.plant) { trim(px - s + 0.08, Y + 0.6, pz - s + 0.08, px + s - 0.08, Y + 0.64, pz + s - 0.08, '#4a3628', { tex: 6 });   // the soil, and the shared plant models (src/gfx/foliage.js)
      if (s >= 0.75) k.plant('bush', px, Y + 0.62, pz, s * 0.9, rnd(seed) * 6.28, Math.floor(rnd(seed + 1) * 3));
      const n = Math.max(3, Math.round(s * s * 10)); for (let i = 0; i < n; i++) { const a = i / n * 6.28 + rnd(seed + i), d = s >= 0.75 ? s * 0.7 : (i ? s * 0.5 : 0); k.plant('flower', px + Math.cos(a) * d, Y + 0.63, pz + Math.sin(a) * d, 0.7 + rnd(seed + i + 9) * 0.25, rnd(seed + i) * 6.28, Math.floor(rnd(seed + i + 3) * 6)); }
      return; }
    trim(px - s + 0.08, Y + 0.6, pz - s + 0.08, px + s - 0.08, Y + 0.85, pz + s - 0.08, TC.leaf, { tex: 6 });
    for (let i = 0; i < 6; i++) { const fx = px + (rnd(seed + i) - 0.5) * s * 1.4, fz = pz + (rnd(seed + i + 7) - 0.5) * s * 1.4, c = TC.flowers[Math.floor(rnd(seed + i + 3) * 5)];
      trim(fx - 0.09, Y + 0.82, fz - 0.09, fx + 0.09, Y + 1.0, fz + 0.09, c, { tex: 6 }); }
  };
  const bench = (px, pz, axis, Y = Y0) => {
    const [hx, hz] = axis === 'x' ? [0.8, 0.22] : [0.22, 0.8];
    box(px - hx, Y, pz - hz, px + hx, Y + 0.45, pz + hz, TC.bench, { tex: 4 });
    for (const s of [-1, 1]) { const ox = axis === 'x' ? s * (hx - 0.1) : 0, oz = axis === 'x' ? 0 : s * (hz - 0.1); trim(px + ox - 0.08, Y, pz + oz - 0.08, px + ox + 0.08, Y + 0.44, pz + oz + 0.08, TC.iron, { tex: 6 }); }
  };
  const crate = (px, pz, s, py = Y) => { box(px - s, py, pz - s, px + s, py + s * 2, pz + s, TC.wood, { tex: 4 }); trim(px - s - 0.02, py + s * 0.9, pz - s - 0.02, px + s + 0.02, py + s * 1.1, pz + s + 0.02, TC.timber, { tex: 4 }); };
  const barrel = (px, pz) => { box(px - 0.32, Y, pz - 0.32, px + 0.32, Y + 0.95, pz + 0.32, TC.wood, { tex: 4 }); for (const h of [0.15, 0.75]) trim(px - 0.34, Y + h, pz - 0.34, px + 0.34, Y + h + 0.06, pz + 0.34, TC.iron, { tex: 6 }); };
  // a side is bare when nothing is built beyond it: no piece, and no drawn road reaching into that cell
  const STEPX = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
  // the town piece next door and its floor's real height: on this layer, or the one above or below (a tile sat on
  // the terrain or a road can land on the next layer, raised a little); the closest in height wins. null if none
  const nbTown = sd => {
    const nx = x + STEPX[sd][0], ny = y + STEPX[sd][1]; let best = null;
    for (const l of [b, b + 1, b - 1]) {
      const c = k.coverAt(d, nx, ny, l); if (!c || c.base !== l || !isTown(c)) continue;
      const abs = l * C + (c.piece.elev || 0); if (!best || Math.abs(abs - Y) < Math.abs(best.abs - Y)) best = { piece: c.piece, abs };
    }
    return best;
  };
  const nbY = sd => nbTown(sd)?.abs ?? null;
  const nbTownAt = (cx2, cy2) => [b, b + 1, b - 1].some(l => { const c = k.coverAt(d, cx2, cy2, l); return c && c.base === l; });
  const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' }, STEP_UP = 0.42, RAMP_MAX = 1.0, STAIR_MAX = 3.0;
  const opensTo = (pc, sd) => {
    if ('CJXTDEK'.includes(pc.part)) return k.openSides(pc).includes(sd);
    if (pc.part === 'R' || pc.part === 'B') return true;
    const f = k.faceOf(pc);
    if (pc.part === 'W') return sd === f || sd === OPP[f];
    if ('HLY'.includes(pc.part)) return sd === f;
    return false;
  };
  // the band along a side that a ramp or stairs can take (streets: the road band; plazas: the middle half), or null
  const bandOf = pc => 'CJXTDEK'.includes(pc.part) ? [A, B] : pc.part === 'R' || pc.part === 'B' ? [2.5, 7.5] : null;
  // Where two pieces' sides should join (a street's open side, a plaza, a canal's ends, a house's front) but their
  // heights differ, the joint follows the same slope rules as the roads:
  //   up to a step (0.42 m) nothing · up to 1 m a ramp · up to 3 m stairs · more than that a wall (the higher
  //   piece's retaining wall, with a parapet along its top)
  // The ramp or stairs are built on the LOWER piece, rising to the edge, in the band (road band / middle of a
  // plaza); the higher piece puts a parapet along the rest of that side. Pairs that can't take a ramp or stairs
  // (a canal's end, a house's front) still get the red safeguard wall, as does a drawn road arriving at the wrong
  // height, so a mistake shows at a glance.
  const joint = sd => {
    const n = nbTown(sd);
    if (n) {
      if (!opensTo(p, sd) || !opensTo(n.piece, OPP[sd])) return false;
      const dh = n.abs - Y; if (Math.abs(dh) <= STEP_UP) return false;
      if (Math.abs(dh) > STAIR_MAX) return 'wall';
      if (!bandOf(p) || !bandOf(n.piece)) return dh < 0 ? 'high' : 'low';
      return dh > 0 ? { up: dh } : 'top';
    }
    if ('CJXTDEK'.includes(part)) { const h = k.pathRoad?.(x, y, b, sd); if (h !== false && h != null && Math.abs(b * C + h - Y) > STEP_UP) return 'road'; }
    return false;
  };
  const mismatch = sd => { const j = joint(sd); return j === 'high' || j === 'low' || j === 'road' ? j : false; };
  // bare: nothing beyond (no piece, no drawn road), or a piece more than 0.6 m lower that doesn't join it by steps
  const bare = sd => { const j = joint(sd); if (j && j !== 'wall') return false; const n = nbTown(sd); return (!n && !nbAt(sd) && !k.pathNear?.(x + STEPX[sd][0], y + STEPX[sd][1], b)) || (n != null && n.abs < Y - 0.6); };
  const warnWall = sd => {                                                              // the red wall, along the side (short of the corners)
    const t = 0.3, H = 1.4, a0 = 0.5, a1 = C - 0.5, col = '#a8261b';
    if (sd === 'N') box(cx + a0, Y, cz, cx + a1, Y + H, cz + t, col, { tex: 6 });
    if (sd === 'S') box(cx + a0, Y, cz + C - t, cx + a1, Y + H, cz + C, col, { tex: 6 });
    if (sd === 'W') box(cx, Y, cz + a0, cx + t, Y + H, cz + a1, col, { tex: 6 });
    if (sd === 'E') box(cx + C - t, Y, cz + a0, cx + C, Y + H, cz + a1, col, { tex: 6 });
  };
  // a box in a side's own frame: a0..a1 along the side, d0..d1 in from its edge
  const sideBox = (sd, a0, a1, d0, d1, y0, y1, col, extra = {}, solid = true) => {
    const f = solid ? box : trim;
    if (sd === 'N') f(cx + a0, y0, cz + d0, cx + a1, y1, cz + d1, col, extra);
    if (sd === 'S') f(cx + a0, y0, cz + C - d1, cx + a1, y1, cz + C - d0, col, extra);
    if (sd === 'W') f(cx + d0, y0, cz + a0, cx + d1, y1, cz + a1, col, extra);
    if (sd === 'E') f(cx + C - d1, y0, cz + a0, cx + C - d0, y1, cz + a1, col, extra);
  };
  // the ramp or stairs up to a higher neighbour, on this (lower) piece, with a low wall each side
  const transition = (sd, up) => {
    const [a0, a1] = bandOf(p), top = Y + up;
    let depth;
    if (up <= RAMP_MAX) {
      depth = up / 0.25;                                                                 // the roads' steepest walkable grade
      const [s0, s1] = sd === 'N' || sd === 'S' ? [a0, a1] : [a0, a1], dirs = { N: '-z', S: '+z', W: '-x', E: '+x' };
      const r = sd === 'N' ? [cx + s0, cz, cx + s1, cz + depth] : sd === 'S' ? [cx + s0, cz + C - depth, cx + s1, cz + C] : sd === 'W' ? [cx, cz + s0, cx + depth, cz + s1] : [cx + C - depth, cz + s0, cx + C, cz + s1];
      ramp([r[0], Y, r[1]], [r[2], top, r[3]], dirs[sd]);
    } else {
      const n = Math.ceil(up / 0.18), tread = 0.3; depth = n * tread;
      for (let j = 0; j < n; j++) sideBox(sd, a0, a1, j * tread, (j + 1) * tread, Y - 0.05, Y + (n - j) * up / n, TC.pave, { tex: 8 });
    }
    for (const [w0, w1] of [[a0 - 0.3, a0], [a1, a1 + 0.3]]) { sideBox(sd, w0, w1, 0, depth, Y, top + 0.9, TC.parapet, { tex: 0 }); sideBox(sd, w0 - 0.04, w1 + 0.04, 0, depth, top + 0.9, top + 1.0, TC.cap, { tex: 0 }, false); }
  };
  // on the higher piece: a parapet along the side except the band where the steps arrive
  const topParapet = (sd, nbBand) => {
    const [a0, a1] = nbBand;
    const [lo, hi] = sd === 'N' || sd === 'S' ? ['W', 'E'] : ['N', 'S'], e0 = bare(lo) ? 0.45 : 0, e1 = bare(hi) ? C - 0.45 : C;   // stop short of a parapet round the corner
    for (const [s0, s1] of [[e0, a0 - 0.3], [a1 + 0.3, e1]]) if (s1 - s0 > 0.05) { sideBox(sd, s0, s1, 0, 0.45, Y, Y + 1.0, TC.parapet, { tex: 0 }); sideBox(sd, s0, s1, -0.05, 0.5, Y + 1.0, Y + 1.1, TC.cap, { tex: 0 }, false); }
  };
  for (const sd of ['N', 'E', 'S', 'W']) {
    const j = joint(sd);
    if (j === 'high' || j === 'road') warnWall(sd);
    else if (j && j.up) transition(sd, j.up);
    else if (j === 'top') topParapet(sd, bandOf(nbTown(sd).piece));
  }
  // (Uphill ground beside a tile no longer needs a retaining wall: the ground warps down to meet the tile's floor;
  // src/game/ground.js)
  // a parapet along a bare side (so you can't walk off). N and S run the full side; W and E stop short of a
  // bare N or S side so the corners never overlap (overlapping boxes flicker where their faces meet)
  const parapet = sd => {
    const t = 0.45, H = 1.0, seg = (a0, a1, c0, c1, y0, y1, col, solid = true) => (solid ? box : trim)(a0, y0, c0, a1, y1, c1, col, { tex: 0 });
    const side = sd === 'W' || sd === 'E', u0 = side && bare('N') ? t : 0, u1 = side && bare('S') ? C - t : C;
    const run = (y0, y1, col, inset, solid) => {
      const a0 = side && u0 ? u0 + inset : u0, a1 = side && u1 < C ? u1 - inset : u1;   // the W / E caps also stop short of the N / S caps
      if (sd === 'N') seg(cx + a0, cx + a1, cz - inset, cz + t + inset, y0, y1, col, solid);
      if (sd === 'S') seg(cx + a0, cx + a1, cz + C - t - inset, cz + C + inset, y0, y1, col, solid);
      if (sd === 'W') seg(cx - inset, cx + t + inset, cz + a0, cz + a1, y0, y1, col, solid);
      if (sd === 'E') seg(cx + C - t - inset, cx + C + inset, cz + a0, cz + a1, y0, y1, col, solid);
    };
    run(Y, Y + H, TC.parapet, 0, true); run(Y + H, Y + H + 0.1, TC.cap, 0.05, false);
  };
  const edges = () => { for (const sd of ['N', 'E', 'S', 'W']) if (bare(sd)) parapet(sd); };

  // ---- streets ----
  if ('CJXTDEK'.includes(part)) {
    const open = k.openSides(p);
    for (const sd of ['N', 'E', 'S', 'W']) { const h = k.pathRoad?.(x, y, b, sd); if (!open.includes(sd) && h !== false && h != null && Math.abs(b * C + h - Y) <= STEP_UP) open.push(sd); }   // a drawn road arriving on this side opens the street to it
    const band = i => i === 0 ? [0, A] : i === 1 ? [A, B] : [B, C], EDGE = { N: [1, 0], S: [1, 2], W: [0, 1], E: [2, 1] };
    const road = new Set(['1,1', ...open.map(sd => EDGE[sd].join(','))]);
    // The pavement stands a kerb's height (KH) above the road. No two boxes overlap or share a face: each 3×3
    // square is carved into its own pieces (a pavement square loses a kerb strip on each side facing road, a road
    // square a sunken gutter strip on each side facing pavement), so nothing flickers along the lip.
    const KH = 0.3, KW = 0.28, GW = 0.4, GD = 0.07;
    const isRoad = (i, j) => i >= 0 && i <= 2 && j >= 0 && j <= 2 && road.has(`${i},${j}`);
    // split [x0,x1]×[z0,z1] into an inner rectangle and non-overlapping strips of width w on the given sides
    const carve = (x0, x1, z0, z1, sides, w) => {
      const ix0 = x0 + (sides.W ? w : 0), ix1 = x1 - (sides.E ? w : 0), strips = [];
      if (sides.W) strips.push([x0, ix0, z0, z1]); if (sides.E) strips.push([ix1, x1, z0, z1]);
      if (sides.N) strips.push([ix0, ix1, z0, z0 + w]); if (sides.S) strips.push([ix0, ix1, z1 - w, z1]);
      return { inner: [ix0, ix1, z0 + (sides.N ? w : 0), z1 - (sides.S ? w : 0)], strips };
    };
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const [x0, x1] = band(i), [z0, z1] = band(j), here = isRoad(i, j);
      // sides where this square meets the other kind (inside the cell)
      const meet = (di, dj) => { const i2 = i + di, j2 = j + dj; if (i2 < 0 || i2 > 2 || j2 < 0 || j2 > 2) return false; return isRoad(i2, j2) !== here; };
      const sides = { W: meet(-1, 0), E: meet(1, 0), N: meet(0, -1), S: meet(0, 1) };
      if (here) {
        const { inner, strips } = carve(x0, x1, z0, z1, sides, GW);
        box(cx + inner[0], Y - 0.5, cz + inner[2], cx + inner[1], Y, cz + inner[3], TC.road, { tex: 1 });
        for (const [a, b2, c, e] of strips) box(cx + a, Y - 0.5, cz + c, cx + b2, Y - GD, cz + e, TC.gutter, { tex: 8 });   // the gutter
      } else {
        const { inner, strips } = carve(x0, x1, z0, z1, sides, KW);
        box(cx + inner[0], Y - 0.5, cz + inner[2], cx + inner[1], Y + KH, cz + inner[3], TC.pave, { tex: 8 });
        for (const [a, b2, c, e] of strips) box(cx + a, Y - 0.5 - GD, cz + c, cx + b2, Y + KH, cz + e, TC.kerb, { tex: 8 });   // the kerb stones, down into the gutter
      }
    }
    edges();
    const PY = Y + KH;   // pavement level
    const closed = ['N', 'E', 'S', 'W'].filter(sd => !open.includes(sd));
    const sideMid = sd => ({ N: [5, 1.5], S: [5, 8.5], W: [1.5, 5], E: [8.5, 5] })[sd];
    if (v === 2 || part === 'E') {                                                        // lamplit: lampposts on two opposite corners
      const cs = (x + y) % 2 ? [[1.6, 1.6], [8.4, 8.4]] : [[8.4, 1.6], [1.6, 8.4]];
      for (const [px, pz] of cs) lamppost(cx + px, cz + pz, LAMP, 3.6, PY);
    } else if ((x * 7 + y * 3 + b) % 3 === 0) lamppost(cx + 1.6, cz + 1.6, LAMP, 3.6, PY);   // the odd lamp on plain streets
    if (v === 3) {                                                                        // market: a stall on each closed side
      for (const sd of closed) {
        const [mx, mz] = sideMid(sd), cl = pick(TC.awning, 31 + sd.charCodeAt(0)), alongX = sd === 'N' || sd === 'S';
        const out = { N: 1, S: -1, W: 1, E: -1 }[sd];   // toward the road
        const sx = alongX ? 1.6 : 0.7, sz = alongX ? 0.7 : 1.6, X0 = cx + mx, Z0 = cz + mz;
        box(X0 - sx, PY, Z0 - sz, X0 + sx, PY + 0.95, Z0 + sz, TC.wood, { tex: 4 });     // the counter
        for (let i = 0; i < 4; i++) { const t = (i + 0.5) / 4 - 0.5, c = TC.flowers[(i + x) % 5];
          const fx = X0 + (alongX ? t * sx * 1.8 : 0), fz = Z0 + (alongX ? 0 : t * sz * 1.8);
          trim(fx - 0.18, PY + 0.95, fz - 0.18, fx + 0.18, PY + 1.15, fz + 0.18, i % 2 ? c : '#d8a040', { tex: 6 }); }   // wares: fruit and flowers
        for (const s of [-1, 1]) { const px = X0 + (alongX ? s * (sx - 0.05) : -out * (sx - 0.05)), pz = Z0 + (alongX ? -out * (sz - 0.05) : s * (sz - 0.05));
          trim(px - 0.05, PY, pz - 0.05, px + 0.05, PY + 2.45, pz + 0.05, TC.timber, { tex: 4 }); }
        // a striped awning sloping down toward the road
        const n = 6;
        for (let i = 0; i < n; i++) {
          const a0 = -1 + 2 * i / n, a1 = -1 + 2 * (i + 1) / n, col = cl[i % 2];
          const min = alongX ? [X0 + a0 * (sx + 0.2), PY + 2.0, Z0 - sz - 0.5] : [X0 - sx - 0.5, PY + 2.0, Z0 + a0 * (sz + 0.2)];
          const max = alongX ? [X0 + a1 * (sx + 0.2), PY + 2.5, Z0 + sz + 0.5] : [X0 + sx + 0.5, PY + 2.5, Z0 + a1 * (sz + 0.2)];
          prism({ type: 'wedge', min, max, high: { N: '-z', S: '+z', W: '-x', E: '+x' }[sd], thick: 0.06, color: col, tex: 6 });
        }
        crate(X0 + (alongX ? sx + 0.5 : 0), Z0 + (alongX ? 0 : sz + 0.5), 0.3, PY);
      }
    } else {
      // planters and benches on the closed sides' pavement (not where a lamp stands)
      closed.forEach((sd, i) => { const [mx, mz] = sideMid(sd); if (rnd(40 + i) < 0.55) planter(cx + mx, cz + mz, 0.5, 50 + i * 9, PY); else bench(cx + mx, cz + mz, sd === 'N' || sd === 'S' ? 'x' : 'z', PY); });
    }
    if (part === 'D') { const sd = { N: 'S', S: 'N', E: 'W', W: 'E' }[open[0]], [mx, mz] = sideMid(sd); planter(cx + mx, cz + mz, 0.8, 77, PY); }   // the dead end: a big planter
    if (part === 'K') {                                                                   // a waystone on the pavement, a crystal set in it
      const sd = closed.includes('E') ? 'E' : closed[0] || 'E', [mx, mz] = sideMid(sd), [ox, oz] = { N: [0, 1], S: [0, -1], W: [1, 0], E: [-1, 0] }[sd];
      const rune = k.waystone(cx + mx, PY, cz + mz, ox, oz);
      const id = k.checkpoint('the waystone', cx + mx, PY, cz + mz, cx + 5, cz + 5, 'waystone');
      k.glows.push({ ...rune, cp: id, kind: 'rune' });
    }
    return;
  }

  // ---- the plaza ----
  if (part === 'R' || part === 'B') {
    box(cx, Y - 0.5, cz, cx + C, Y, cz + C, TC.plaza, { tex: 8 });
    edges();
    const lampEdges = ['N', 'E', 'S', 'W'].filter(sd => bare(sd));
    for (const sd of lampEdges) { const [px, pz] = { N: [5, 1.2], S: [5, 8.8], W: [1.2, 5], E: [8.8, 5] }[sd]; lamppost(cx + px, cz + pz); }
    if (v === 2) {                                                                         // the Great Crystal on a stepped dais
      for (const [s, h] of [[4.2, 0.3], [3.3, 0.6], [2.4, 0.9]]) box(cx + 5 - s, Y, cz + 5 - s, cx + 5 + s, Y + h, cz + 5 + s, h === 0.9 ? TC.cap : TC.parapet, { tex: 8 });
      for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { box(cx + 5 + ox * 2.1 - 0.25, Y + 0.9, cz + 5 + oz * 2.1 - 0.25, cx + 5 + ox * 2.1 + 0.25, Y + 2.0, cz + 5 + oz * 2.1 + 0.25, TC.cap); k.lamp(cx + 5 + ox * 2.1, Y + 2.25, cz + 5 + oz * 2.1, DUST[(ox + 1 + (oz + 1) / 2 * 3) % 5]); }
      box(cx + 4.2, Y + 0.9, cz + 4.2, cx + 5.8, Y + 9.0, cz + 5.8, '#000000', { hidden: true });   // the crystal is solid
      k.crystals.push({ ...k.W0(cx + 5, Y + 1.4, cz + 5), r: 1.0, h: 8 });
    } else if (v === 3) {                                                                  // the warp circle: five pads, beams of light
      box(cx + 1.2, Y, cz + 1.2, cx + 8.8, Y + 0.08, cz + 8.8, TC.cap, { tex: 8 });
      DUST.forEach((col, i) => { const a = i / 5 * Math.PI * 2 - Math.PI / 2, px = cx + 5 + Math.cos(a) * 2.8, pz = cz + 5 + Math.sin(a) * 2.8;
        box(px - 0.75, Y + 0.08, pz - 0.75, px + 0.75, Y + 0.16, pz + 0.75, TC.quoin, { tex: 6 });
        k.pads.push({ ...k.W0(px, Y + 0.16, pz), r: 0.8, color: col, beam: true }); });
      k.pads.push({ ...k.W0(cx + 5, Y + 0.08, cz + 5), r: 1.4, color: '#bfe6ff' });
    } else if (v === 4) {                                                                  // garden: a tree in a raised bed, flower beds
      box(cx + 3.6, Y, cz + 3.6, cx + 6.4, Y + 0.5, cz + 6.4, TC.parapet); trim(cx + 3.7, Y + 0.5, cz + 3.7, cx + 6.3, Y + 0.56, cz + 6.3, '#5a4030');
      if (k.plant) { k.plant('tree', cx + 5, Y + 0.55, cz + 5, 1.0, rnd(cx * 3 + cz) * 6.28, Math.floor(rnd(cx + cz * 7) * 3)); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; k.plant(i % 2 ? 'flower' : 'grass', cx + 5 + Math.cos(a) * 1.0, Y + 0.55, cz + 5 + Math.sin(a) * 1.0, 0.8, a, i); } }
      else { box(cx + 4.75, Y + 0.5, cz + 4.75, cx + 5.25, Y + 4.2, cz + 5.25, TC.timber, { tex: 4 });
        for (const [s, h, oy] of [[2.2, 1.4, 3.6], [1.6, 1.2, 4.8], [0.9, 0.9, 5.8]]) trim(cx + 5 - s, Y + oy, cz + 5 - s, cx + 5 + s, Y + oy + h, cz + 5 + s, '#4f8a3a', { tex: 6 }); }
      for (const [px, pz] of [[2, 2], [8, 2], [2, 8], [8, 8]]) planter(cx + px, cz + pz, 0.7, px * 3 + pz);
    } else if (v === 5) {                                                                  // fountain: a basin you can wade in, a two-tier fountain
      const o = cx + 5, q = cz + 5, wl = Y + 0.45;
      box(cx + 1.8, Y, cz + 1.8, cx + 8.2, Y + 0.25, cz + 2.0, TC.parapet, { tex: 8 }); box(cx + 1.8, Y, cz + 8.0, cx + 8.2, Y + 0.25, cz + 8.2, TC.parapet, { tex: 8 });   // a low step round it
      box(cx + 1.8, Y, cz + 2.0, cx + 2.0, Y + 0.25, cz + 8.0, TC.parapet, { tex: 8 }); box(cx + 8.0, Y, cz + 2.0, cx + 8.2, Y + 0.25, cz + 8.0, TC.parapet, { tex: 8 });
      for (const [a0, a1, b0, b1] of [[2.0, 8.0, 2.0, 2.4], [2.0, 8.0, 7.6, 8.0], [2.0, 2.4, 2.4, 7.6], [7.6, 8.0, 2.4, 7.6]]) {   // the rim
        box(cx + a0, Y, cz + b0, cx + a1, Y + 0.6, cz + b1, TC.parapet); trim(cx + a0 - 0.05, Y + 0.6, cz + b0 - 0.05, cx + a1 + 0.05, Y + 0.7, cz + b1 + 0.05, TC.cap); }
      trim(cx + 2.4, Y + 0.01, cz + 2.4, cx + 7.6, Y + 0.03, cz + 7.6, '#5a7a7a', { tex: 6 });   // the basin's floor, darker under the water
      box(o - 0.45, Y, q - 0.45, o + 0.45, Y + 1.6, q + 0.45, TC.cap);                                                 // the column
      trim(o - 1.3, Y + 1.6, q - 1.3, o + 1.3, Y + 1.85, q + 1.3, TC.parapet); trim(o - 1.15, Y + 1.85, q - 1.15, o + 1.15, Y + 1.9, q + 1.15, TC.water, { tex: 6 });   // the lower dish
      trim(o - 0.25, Y + 1.9, q - 0.25, o + 0.25, Y + 2.8, q + 0.25, TC.cap);
      trim(o - 0.7, Y + 2.8, q - 0.7, o + 0.7, Y + 2.98, q + 0.7, TC.parapet); trim(o - 0.58, Y + 2.98, q - 0.58, o + 0.58, Y + 3.02, q + 0.58, TC.water, { tex: 6 });   // the upper dish
      trim(o - 0.12, Y + 3.0, q - 0.12, o + 0.12, Y + 3.5, q + 0.12, TC.copper, { tex: 6 }); k.lamp(o, Y + 3.75, q, DUST[2]);   // a blue crystal on top
      const jet = '#cfeeff';
      for (const [ox, oz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {                         // streams falling from each dish into the next
        trim(o + ox * 0.66 - 0.05, Y + 1.9, q + oz * 0.66 - 0.05, o + ox * 0.66 + 0.05, Y + 2.9, q + oz * 0.66 + 0.05, jet, { tex: 6 });
        trim(o + ox * 1.26 - 0.07, wl, q + oz * 1.26 - 0.07, o + ox * 1.26 + 0.07, Y + 1.75, q + oz * 1.26 + 0.07, jet, { tex: 6 });
        trim(o + ox * 1.26 - 0.25, wl, q + oz * 1.26 - 0.25, o + ox * 1.26 + 0.25, wl + 0.04, q + oz * 1.26 + 0.25, '#f2fbff', { tex: 6 });   // foam where it lands
      }
      k.water.push({ x0: k.origin.x + cx + 2.4, z0: k.origin.z + cz + 2.4, x1: k.origin.x + cx + 7.6, z1: k.origin.z + cz + 7.6, y: k.origin.y + wl });
      k.swim.push({ min: [k.origin.x + cx + 2.4, k.origin.y + Y, k.origin.z + cz + 2.4], max: [k.origin.x + cx + 7.6, k.origin.y + wl, k.origin.z + cz + 7.6] });
      for (const [px, pz] of [[1.1, 1.1], [8.9, 1.1], [1.1, 8.9], [8.9, 8.9]]) planter(cx + px, cz + pz, 0.55, px * 5 + pz);
    } else {                                                                               // benches and planters
      planter(cx + 5, cz + 5, 0.9, 11);
      bench(cx + 2.6, cz + 5, 'z'); bench(cx + 7.4, cz + 5, 'z'); bench(cx + 5, cz + 2.6, 'x'); bench(cx + 5, cz + 7.4, 'x');
    }
    return;
  }

  // ---- open stone steps ----
  if (part === 'S') {
    const n = Math.round(p.height * C / 0.4), depth = C / n, rise = p.height * C / n, a0 = 2, a1 = 8;
    ground(TC.road, 1);
    for (let i = 0; i < n; i++) lbox(a0, a1, i * depth, (i + 1) * depth, Y, Y + (i + 1) * rise, TC.pave, 8);
    for (const [s0, s1] of [[a0 - 0.5, a0], [a1, a1 + 0.5]]) {                             // solid side walls with a balustrade on top
      for (let i = 0; i < n; i++) { const t2 = Y + (i + 1) * rise; lbox(s0, s1, i * depth, (i + 1) * depth, Y, t2 + 0.9, TC.parapet); lbox(s0 - 0.05, s1 + 0.05, i * depth, (i + 1) * depth, t2 + 0.9, t2 + 1.0, TC.cap, 0, false); }
    }
    for (const u of [a0 - 0.25, a1 + 0.25]) { const [px, pz] = lpt(u, depth / 2); lamppost(px, pz, LAMP, 2.0, Y + rise + 0.95); }
    for (const sd of ['N', 'E', 'S', 'W']) if (bare(sd) && sd !== { N: 'S', S: 'N', E: 'W', W: 'E' }[face] && sd !== face) parapet(sd);
    return;
  }

  // ---- canal ----
  if (part === 'W') {
    const wl = Y - 1.2, bed = Y - 3.6, c0 = 3, c1 = 7;                                     // water level, bed, channel across
    lbox(0, c0, 0, C, Y - 0.5, Y, TC.pave, 8); lbox(c1, C, 0, C, Y - 0.5, Y, TC.pave, 8);    // walkways
    lbox(0, c0, 0, C, bed, Y - 0.5, TC.found); lbox(c1, C, 0, C, bed, Y - 0.5, TC.found);    // banks
    lbox(c0, c1, 0, C, bed - 0.5, bed, TC.found);                                           // the bed
    const bridge = v === 2, bw0 = 3.6, bw1 = 6.4;
    for (const [r0, r1] of bridge ? [[0, bw0], [bw1, C]] : [[0, C]]) {                           // low walls along the water (broken where the bridge lands)
      for (const [s0, s1] of [[c0 - 0.35, c0], [c1, c1 + 0.35]]) lbox(s0, s1, r0, r1, Y, Y + 0.7, TC.parapet);
      lbox(c0 - 0.4, c0 + 0.05, r0, r1, Y + 0.7, Y + 0.8, TC.cap, 0, false); lbox(c1 - 0.05, c1 + 0.4, r0, r1, Y + 0.7, Y + 0.8, TC.cap, 0, false);
    }
    lbox(c0, c0 + 0.12, 0, C, wl - 0.3, wl + 0.15, '#6a7a6a', 6, false); lbox(c1 - 0.12, c1, 0, C, wl - 0.3, wl + 0.15, '#6a7a6a', 6, false);   // a mossy tide line
    // a canal that ends (front or back opens onto something that isn't canal): a wall across
    for (const [sd, w0, w1] of [[face, C - 0.4, C], [{ N: 'S', S: 'N', E: 'W', W: 'E' }[face], 0, 0.4]]) { const n = nbAt(sd); if (!n || n.piece.part !== 'W') lbox(c0, c1, w0, w1, bed, Y, TC.found); }
    { const [x0, z0, x1, z1] = rect(c0, c1, 0, C); k.water.push({ x0: k.origin.x + x0, z0: k.origin.z + z0, x1: k.origin.x + x1, z1: k.origin.z + z1, y: k.origin.y + wl, canal: true });
      k.swim.push({ min: [k.origin.x + x0, k.origin.y + bed, k.origin.z + z0], max: [k.origin.x + x1, k.origin.y + wl, k.origin.z + z1] }); }
    if (v === 2) {                                                                          // a hump-backed stone bridge across the middle
      const w0 = bw0, w1 = bw1, rise = 0.6, mid = 0.6;                                      // the deck rises over the water
      // a ramp up from each walkway, a flat crown over the middle
      const [ax0, az0, ax1, az1] = rect(c0 - 1.2, c0 + mid, w0, w1), [bx0, bz0, bx1, bz1] = rect(c1 - mid, c1 + 1.2, w0, w1), [mx0, mz0, mx1, mz1] = rect(c0 + mid, c1 - mid, w0, w1);
      const up = { N: '+x', S: '-x', E: '+z', W: '-z' }[face], down = { '+x': '-x', '-x': '+x', '+z': '-z', '-z': '+z' }[up];
      ramp([ax0, Y, az0], [ax1, Y + rise, az1], up); ramp([bx0, Y, bz0], [bx1, Y + rise, bz1], down);
      box(mx0, Y - 0.3, mz0, mx1, Y + rise, mz1, TC.pave, { tex: 8 });
      lbox(c0 + 0.6, c1 - 0.6, w0, w1, wl + 1.2, Y - 0.3, TC.parapet, 0, false);           // the arch's spandrel (open below)
      for (const [ww0, ww1] of [[w0 - 0.35, w0], [w1, w1 + 0.35]]) { lbox(c0 - 0.35, c1 + 0.35, ww0, ww1, Y - 0.3, Y + rise + 0.8, TC.parapet); lbox(c0 - 0.4, c1 + 0.4, ww0 - 0.05, ww1 + 0.05, Y + rise + 0.8, Y + rise + 0.9, TC.cap, 0, false); }
      for (const u of [c0 - 1.0, c1 + 1.0]) { const [px, pz] = lpt(u, w0 - 0.6); lamppost(px, pz); }
    } else if ((x + y) % 2) { const [px, pz] = lpt(1.4, 5); lamppost(px, pz); }
    for (const sd of ['N', 'E', 'S', 'W']) if (bare(sd) && (sd !== face && sd !== { N: 'S', S: 'N', E: 'W', W: 'E' }[face])) parapet(sd);
    return;
  }

  // ---- buildings (src/game/buildings.js) ----
  if (big) {
    // a side is open (windows on it) when no building stands along it; checked cell by cell along that side
    const sideCells = side => {                                                         // world side the local left/right faces
      const sd = side === 'left' ? { N: 'W', S: 'E', E: 'N', W: 'S' }[face] : { N: 'E', S: 'W', E: 'S', W: 'N' }[face], out = [];
      if (sd === 'W' || sd === 'E') for (let j = 0; j < szC; j++) out.push([sd === 'W' ? x - 1 : x + sxC, y + j]);
      else for (let i = 0; i < sxC; i++) out.push([x + i, sd === 'N' ? y - 1 : y + szC]);
      return out;
    };
    const sideOpen = side => !sideCells(side).some(([cx2, cy2]) => isBuilding(k.coverAt(d, cx2, cy2, b)));
    (part === 'F' ? buildFiller : buildBuilding)({ plant: k.plant, p, Y, UW, WD, lbox, lpt, lgable, lwedge, box, trim, lamp, rnd, pick, flowerBox, barrel, crate, bench, TC, DUST, LAMP, acrossAxis, sideOpen, ground,
      lpyramid: (u0, u1, w0, w1, y0, y1, color, tex = 2) => { const [x0, z0, x1, z1] = rect(u0, u1, w0, w1); prism({ type: 'pyramid', min: [x0, y0, z0], max: [x1, y1, z1], color, tex }); } });
    if (fw0 === 1 && fd0 === 1) for (const sd of ['N', 'E', 'S', 'W']) if (bare(sd) && sd === face) parapet(sd);    // only the street side could be walked off
    return;
  }

  // anything else in the town theme: plain paving
  ground(TC.plaza, 8); edges();
}
