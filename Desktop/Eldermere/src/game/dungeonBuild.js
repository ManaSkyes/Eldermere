// src/game/dungeonBuild.js — turns a dungeon map (src/data/dungeon.js) into a place you can walk: physics
// shapes (boxes, drawn by the test grounds' builder), torches on the walls, and the lights that follow you.
// The Dungeon theme, with its variants (VARIANTS in src/data/dungeon.js; an unknown variant builds as 1).
//
// Each 10 m cell is carved out of solid rock:
//   rooms     the whole cell is open, walled on the sides that don't join another room; a doorway (4 m wide,
//             4.5 m tall) where a passage opens into it; its ceiling at its full height
//   passages  (corridor, junction, crossing, turn, entrance, dead end) a 4 m wide, 4.5 m tall channel from
//             the middle out to each side it opens on; everything else is rock. A side that opens onto
//             nothing is capped with a wall.
//   stairs    a 4 m wide flight of 0.4 m steps up the cell, from the back edge (the way in) to the front edge,
//             climbing its height; it comes out at the top into the cell ahead
// Torches hang only on walls and features (pillars, rib arches, the gatehouse...), never in mid-air; braziers
// stand on the floor. Only the torches nearest you cast light (lightDungeon), the rest just burn.
//
// World placement: cell (x, y, layer) → x·10, layer·10, y·10 from `origin` (map north is −z, as in the game).
import { PARTS, SIDES, coverAt, sidesAt, openSides, stairsArriving, eachPiece, isLow, LOW_H, layerRange } from '../data/dungeon.js';
import { buildTownPiece } from './townBuild.js';
import { buildPaths, preparePaths } from './pathBuild.js';
import { buildProps } from './props.js';
import { buildGround } from './ground.js';
import { buildBridges } from './bridgeBuild.js';
import { createRiverWater } from '../gfx/water.js';
import { createFoliage } from '../gfx/foliage.js';
const TOWN_THEMES = new Set(['T', 'O']);

export const BUILD = { cell: 10, pass: 4, passH: 4.5, lowPassH: 3.4, wall: 0.6, floor: 0.5, step: 0.4, torchH: 2.9, lowTorchH: 2.4 };
// warm, saturated stone in the PS2-era style (the painted textures in src/game/testGrounds.js carry the detail)
export const COLORS = { floor: '#928471', wall: '#a59479', rock: '#8f806c', roof: '#776b5c', step: '#ab9c82', pillar: '#b5a488', trim: '#c0ae8e', rubble: '#8a7860', iron: '#3e3a36', statue: '#bcae92', basin: '#7c6c5a', wood: '#6a4428', banner: '#9a2c26', water: '#3a6a8a', gold: '#d8b048' };
const isRoom = p => PARTS[p.part]?.open === 'room';
const faceOf = p => SIDES[(((p.rot || 0) / 90) | 0) % 4];
const FACE_YAW = { N: 0, E: -Math.PI / 2, S: Math.PI, W: Math.PI / 2 };   // the game's yaw that looks that way
const OUT = { N: [0, 1], S: [0, -1], W: [1, 0], E: [-1, 0] };              // from a wall on that side, into the cell

export function buildDungeonShapes(d, origin = { x: 0, y: 0, z: 0 }, opts = {}) {   // opts.light: skip the ground and props (the creator's footprint doesn't draw them)
  const C = BUILD.cell, A = (C - BUILD.pass) / 2, B = A + BUILD.pass;      // the middle band: 3..7 m
  const shapes = [], torches = []; let spawn = null;
  const checkpoints = [], glows = [], water = [], streams = [], hazards = [];
  const W0 = (x, y, z) => ({ x: origin.x + x, y: origin.y + y, z: origin.z + z });
  // a checkpoint: touch near (x, z); you come back standing at (sx, sz)
  const checkpoint = (name, x, Y, z, sx, sz, kind) => { const id = `dg${checkpoints.length}`; checkpoints.push({ id, name, ...W0(x, Y, z), r: 2.4, spawn: W0(sx, Y + 0.05, sz), kind }); return id; };
  // a waystone: a standing stone with a glowing rune on its face (nx, nz)
  const waystone = (x, Y, z, nx, nz) => {
    box(x - 0.55, Y, z - 0.55, x + 0.55, Y + 0.3, z + 0.55, COLORS.wall);
    box(x - 0.3, Y + 0.3, z - 0.3, x + 0.3, Y + 2.0, z + 0.3, COLORS.statue);
    box(x - 0.22, Y + 2.0, z - 0.22, x + 0.22, Y + 2.25, z + 0.22, COLORS.statue);
    return { ...W0(x + nx * 0.31, Y + 1.35, z + nz * 0.31), nx, nz };
  };
  // With something built on top of a piece, its rock and walls stop just under the upper piece's floor slab
  // (capY), instead of running up to the floor's top surface, where the two would flicker against each other.
  let capY = Infinity;
  const box = (x0, y0, z0, x1, y1, z1, color, extra = {}) => {
    if (y0 < capY - 0.01 && y1 > capY) y1 = capY;
    if (x1 - x0 < 0.01 || y1 - y0 < 0.01 || z1 - z0 < 0.01) return;
    shapes.push({ type: 'box', min: [origin.x + x0, origin.y + y0, origin.z + z0], max: [origin.x + x1, origin.y + y1, origin.z + z1], color, surface: 'stone', dungeon: true, ...extra });
  };
  // trim: skirting, cornices, door frames. Drawn, but not solid (in `decor`, not `shapes`), so they never snag
  // your feet or your wall runs
  const decor = [];
  const trim = (x0, y0, z0, x1, y1, z1, color = COLORS.trim, extra = {}) => {
    if (x1 - x0 < 0.01 || y1 - y0 < 0.01 || z1 - z0 < 0.01) return;
    decor.push({ type: 'box', min: [origin.x + x0, origin.y + y0, origin.z + z0], max: [origin.x + x1, origin.y + y1, origin.z + z1], color, surface: 'stone', dungeon: true, trim: true, ...extra });
  };
  const SK = { h: 0.35, d: 0.12 }, CO = { h: 0.28, d: 0.16 }, FR = { w: 0.4, d: 0.16 };   // skirting, cornice, door frame sizes
  // a run of skirting (and optionally a cornice at `topY`) along a wall face: the face is at `at` on the axis
  // ('x' or 'z'), running u0..u1 along the other, `out` +1 / -1 the way into the room
  const wallTrim = (axis, at, out, u0, u1, Y, topY) => {
    const lo = Math.min(at, at + out * SK.d), hi = Math.max(at, at + out * SK.d), clo = Math.min(at, at + out * CO.d), chi = Math.max(at, at + out * CO.d);
    if (axis === 'x') { trim(lo, Y, u0, hi, Y + SK.h, u1); if (topY != null) trim(clo, topY - CO.h, u0, chi, topY, u1); }
    else { trim(u0, Y, lo, u1, Y + SK.h, hi); if (topY != null) trim(u0, topY - CO.h, clo, u1, topY, chi); }
  };
  // a torch on a wall face at (x, y, z) in cell coordinates, sticking out along (nx, nz)
  // Presets: the rooms' own torches, standing braziers and chests can be moved or removed in the creator.
  // Each gets a stable id (kind, cell, layer, its number in that cell); d.presets[id] holds the change:
  // { removed: true } or { x, z, rot, layer, h } (wall torches: h up the wall; others: on the floor). The
  // presets as finally placed are listed in `presets` (in map metres, without the origin) for the creator.
  const changes = d.presets || {}, presets = [], counts = {};
  const presetId = (kind, x, y, z) => { const k = `${kind}:${Math.floor(x / C)},${Math.floor(z / C)},${Math.floor((y + 0.01) / C)}`; counts[k] = (counts[k] || 0) + 1; return `${k}#${counts[k]}`; };
  const torch = (x, y, z, nx, nz) => {
    const id = presetId('torch', x, y - BUILD.torchH, z), ch = changes[id];
    if (ch?.removed) return;
    if (ch && ch.x != null) { x = ch.x; z = ch.z; y = ch.layer * C + ch.h; const a = ch.rot * Math.PI / 180; nx = Math.round(Math.sin(a) * 1000) / 1000; nz = Math.round(-Math.cos(a) * 1000) / 1000; }
    const layer = Math.floor((y - 0.6) / C);
    presets.push({ id, type: 'torch', mount: 'wall', x, z, layer, h: y - layer * C, rot: ((Math.round(Math.atan2(nx, -nz) * 180 / Math.PI) % 360) + 360) % 360, preset: true });
    torches.push({ x: origin.x + x, y: origin.y + y, z: origin.z + z, nx, nz, id });
  };
  // a brazier on a stone stand (size: the stand's width, hgt: its height)
  const standBrazier = (x, Y, z, size, hgt) => {
    const id = presetId('brazier', x, Y, z), ch = changes[id];
    if (ch?.removed) return;
    if (ch && ch.x != null) { x = ch.x; z = ch.z; Y = ch.layer * C; }
    const r = size / 2;
    box(x - r, Y, z - r, x + r, Y + hgt, z + r, COLORS.basin);
    box(x - r + 0.15, Y + hgt, z - r + 0.15, x + r - 0.15, Y + hgt + 0.12, z + r - 0.15, COLORS.iron);
    presets.push({ id, type: 'brazier', mount: 'floor', x, z, layer: Math.round(Y / C), rot: 0, preset: true });
    torches.push({ x: origin.x + x, y: origin.y + Y + hgt + 0.4, z: origin.z + z, brazier: true, id });
  };
  // a chest (rot: which way its front faces)
  const chest = (x, Y, z, rot) => {
    const id = presetId('chest', x, Y, z), ch = changes[id];
    if (ch?.removed) return;
    if (ch && ch.x != null) { x = ch.x; z = ch.z; Y = ch.layer * C + (ch.h || 0); rot = ch.rot; }
    const side = (rot / 90) % 2 === 1, w = side ? 0.35 : 0.6, dd = side ? 0.6 : 0.35;
    box(x - w, Y, z - dd, x + w, Y + 0.7, z + dd, COLORS.wood);
    box(x - w - 0.03, Y + 0.7, z - dd - 0.03, x + w + 0.03, Y + 0.9, z + dd + 0.03, COLORS.wood);   // the lid
    box(x - w - 0.04, Y + 0.35, z - dd - 0.04, x + w + 0.04, Y + 0.45, z + dd + 0.04, COLORS.iron);   // a band
    presets.push({ id, type: 'chest', mount: 'floor', x, z, layer: Math.floor((Y + 0.01) / C), h: Y - Math.floor((Y + 0.01) / C) * C, rot, preset: true });
  };
  const brazier = (x, y, z) => torches.push({ x: origin.x + x, y: origin.y + y, z: origin.z + z, brazier: true });
  // a square of the cell's 3×3 grid (i, j in 0..2: x band, z band), at cell (cx, cz)
  const band = k => k === 0 ? [0, A] : k === 1 ? [A, B] : [B, C];
  const sq = (cx, cz, i, j, y0, y1, color) => { const [a, b] = band(i), [c, e] = band(j); box(cx + a, y0, cz + c, cx + b, y1, cz + e, color); };
  const EDGE = { N: [1, 0], S: [1, 2], W: [0, 1], E: [2, 1] };
  // a little seeded noise per cell, so rubble and such differ cell to cell but stay the same every build
  const rnd = (x, y, k) => { const s = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };

  // the town theme's pieces (src/game/townBuild.js) get these helpers
  const crystals = [], pads = [], swim = [];
  const waterMeshes = [], waterFalls = [], waterFx = { mist: [], spray: [], fleck: [] }, waterSounds = [], plants = [];
  // a plant (drawn by src/gfx/foliage.js): kind, where (this map's metres), size, turn, variant, tint. Trees stand on a
  // solid trunk; everything else you walk through
  const plant = (k, x, y, z, s = 1, r = 0, v = 0, c = null) => {
    plants.push({ k, x: origin.x + x, y: origin.y + y, z: origin.z + z, s, r, v, c });
    if (k === 'tree' || k === 'pine' || k === 'dead') { const w = 0.24 * s; shapes.push({ type: 'box', hidden: true, surface: 'wood', min: [origin.x + x - w, origin.y + y, origin.z + z - w], max: [origin.x + x + w, origin.y + y + 3 * s, origin.z + z + w] }); }
  };
  const town = { C, A, B, d, origin, box, trim, rnd, coverAt, faceOf, openSides, waystone, checkpoint, glows, crystals, pads, water, swim, waterMeshes, waterFalls, waterFx, waterSounds, plants, plant, W0, lo: layerRange(d).lo,
    prism: s => {
      const mn = s.min.map((v, i) => v + [origin.x, origin.y, origin.z][i]), mx = s.max.map((v, i) => v + [origin.x, origin.y, origin.z][i]);
      decor.push({ ...s, min: mn, max: mx, surface: 'stone', dungeon: true, trim: true });
      // a roof you can land on: two hidden slopes up to its ridge (a hipped roof: as a gable along its longer side).
      // Little ones (a dormer's cap, a finial) are left out
      const wx = mx[0] - mn[0], wz = mx[2] - mn[2]; if (wx * wz < 2 || mx[1] - mn[1] < 0.3 || (s.type !== 'gable' && s.type !== 'pyramid')) return;
      const ax = s.type === 'gable' ? s.axis : (wx >= wz ? 'x' : 'z'), R2 = { type: 'ramp', hidden: true, surface: 'stone', roof: true };
      if (ax === 'x') { const zm = (mn[2] + mx[2]) / 2; shapes.push({ ...R2, min: [mn[0], mn[1], mn[2]], max: [mx[0], mx[1], zm], rise: '+z' }, { ...R2, min: [mn[0], mn[1], zm], max: [mx[0], mx[1], mx[2]], rise: '-z' }); }
      else { const xm = (mn[0] + mx[0]) / 2; shapes.push({ ...R2, min: [mn[0], mn[1], mn[2]], max: [xm, mx[1], mx[2]], rise: '+x' }, { ...R2, min: [xm, mn[1], mn[2]], max: [mx[0], mx[1], mx[2]], rise: '-x' }); }
    },
    ramp: (min, max, rise) => shapes.push({ type: 'ramp', min: [origin.x + min[0], origin.y + min[1], origin.z + min[2]], max: [origin.x + max[0], origin.y + max[1], origin.z + max[2]], rise, color: '#c2b49c', surface: 'stone', dungeon: true }),
    lamp: (x, y, z, color, ground) => torches.push({ x: origin.x + x, y: origin.y + y, z: origin.z + z, lamp: true, color, ...(ground != null ? { ground: origin.y + ground } : {}) }) };
  // a convex solid given as triangles (corners [x, y, z] in map metres): props turned to any angle (src/game/props.js)
  town.tris = (pts, color, tex = 0) => { const P = pts.map(q => [q[0] + origin.x, q[1] + origin.y, q[2] + origin.z]); const xs = P.map(q => q[0]), ys = P.map(q => q[1]), zs = P.map(q => q[2]);
    decor.push({ type: 'tris', pts: P, min: [Math.min(...xs), Math.min(...ys), Math.min(...zs)], max: [Math.max(...xs), Math.max(...ys), Math.max(...zs)], color, tex, surface: 'stone', dungeon: true, trim: true }); };
  // a flat-lying decoration (road details): convex, corners [x, y, z] in map metres, drawn on top only
  town.poly = (pts, color, tex = 0) => { const P = pts.map(q => [q[0] + origin.x, q[1] + origin.y, q[2] + origin.z]); const xs = P.map(q => q[0]), ys = P.map(q => q[1]), zs = P.map(q => q[2]);
    decor.push({ type: 'poly', pts: P, min: [Math.min(...xs), Math.min(...ys), Math.min(...zs)], max: [Math.max(...xs), Math.max(...ys) + 0.001, Math.max(...zs)], color, tex, surface: 'stone', dungeon: true, trim: true }); };
  // where the drawn roads go, worked out first: town pieces drop their walls toward a road, and grid streets open to one
  const pathPrep = preparePaths(d, { coverAt });
  town.pathNear = pathPrep.near; town.pathRoad = pathPrep.road;
  town.nearLight = (x, z, r) => torches.some(t => Math.hypot(t.x - (origin.x + x), t.z - (origin.z + z)) < r);   // (a street lamp keeps 5 m from any other light: src/game/pathBuild.js)
  // is anything solid in this box (map metres)? Features ask before they're placed, so a lamp never stands in a wall or a stair
  town.blocked = (x0, z0, x1, z1, y0, y1) => shapes.some(sh => !sh.hidden && sh.max[0] > origin.x + x0 && sh.min[0] < origin.x + x1 && sh.max[2] > origin.z + z0 && sh.min[2] < origin.z + z1 && sh.max[1] > origin.y + y0 && sh.min[1] < origin.y + y1);

  // Pieces can sit off the 10 m grid, nudged by ox / oz metres (the creator's 1 m snapping): everything a piece
  // makes is built as usual and then moved over. (How it joins its neighbours still goes by its own cell.)
  const lists = { shapes, decor, torches, checkpoints, glows, water, swim, crystals, pads, presets, hazards, streams, plants };
  const shiftOut = (o, dx, dz, world) => {
    if (o.min && o.max) { o.min = [o.min[0] + dx, o.min[1], o.min[2] + dz]; o.max = [o.max[0] + dx, o.max[1], o.max[2] + dz]; }
    if (o.x0 != null) { o.x0 += dx; o.x1 += dx; o.z0 += dz; o.z1 += dz; }
    if (o.x != null && o.min == null) { o.x += dx; o.z += dz; }
    if (o.spawn) { o.spawn = { ...o.spawn, x: o.spawn.x + dx, z: o.spawn.z + dz }; }
    void world;
  };
  eachPiece(d, (p, x, y, b) => {
    const mark = Object.fromEntries(Object.entries(lists).map(([k, a]) => [k, a.length])), hadSpawn = !!spawn;
    buildPiece(p, x, y, b);
    const dx = p.ox || 0, dz = p.oz || 0;
    if (dx || dz) {
      for (const [k, a] of Object.entries(lists)) for (let i = mark[k]; i < a.length; i++) shiftOut(a[i], dx, dz);
      if (spawn && !hadSpawn) { spawn.x += dx; spawn.z += dz; }
    }
  });
  function buildPiece(p, x, y, b) {
    const cx = x * C, cz = y * C, Y = b * C, h = p.height, top = (b + h) * C;
    const info = PARTS[p.part] || {};
    if (TOWN_THEMES.has(p.theme)) {                                    // open-air town pieces
      capY = Infinity; buildTownPiece(town, p, x, y, b);
      if (p.part === 'E' && !spawn) { const f = faceOf(p); spawn = { x: origin.x + cx + C / 2, y: origin.y + Y + (p.elev || 0) + 0.05, z: origin.z + cz + C / 2, yaw: FACE_YAW[f] }; }
      return;
    }
    { const pieceTop = b + h + (info.stairs ? 1 : 0); capY = coverAt(d, x, y, pieceTop) ? pieceTop * C - BUILD.floor : Infinity; }
    if (!(p.part === 'C' && p.variant === 4)) box(cx, Y - BUILD.floor, cz, cx + C, Y, cz + C, COLORS.floor);   // the floor (a pit corridor makes its own)
    if (isRoom(p)) buildRoom(p, x, y, b, cx, cz, Y, top);
    else if (info.stairs) buildStairs(p, x, y, b, cx, cz, Y, top);
    else buildPassage(p, x, y, b, cx, cz, Y, top);
    if (p.part === 'E' && !spawn) {                                    // the start: you begin here, and a waystone behind you is your first checkpoint
      const f = faceOf(p), [ox, oz] = OUT[{ N: 'S', S: 'N', E: 'W', W: 'E' }[f]];
      spawn = { x: origin.x + cx + C / 2, y: origin.y + Y + 0.05, z: origin.z + cz + C / 2, yaw: FACE_YAW[f] };
      const sx = cx + 5 - ox * 1.3, sz = cz + 5 - oz * 1.3;
      const rune = waystone(sx, Y, sz, ox, oz);
      spawn.checkpoint = checkpoint('the entrance', sx, Y, sz, cx + C / 2, cz + C / 2, 'waystone');
      glows.push({ ...rune, cp: spawn.checkpoint, kind: 'rune' });
    }
  }
  capY = Infinity;
  // the drawn paths (roads), free of the grid (src/game/pathBuild.js)
  const paths = buildPaths(d, origin, town, pathPrep); shapes.push(...paths.shapes);
  if (!opts.light) buildBridges(d, origin, town, shapes);                                   // the bridges' parapets, piers and arches (src/game/bridgeBuild.js)
  // the ground (src/game/ground.js): the terrain and the dynamic filler as one surface, kept out of pieces and
  // tucked under road edges
  const ground = opts.light ? null : buildGround(d, town, shapes, origin, layerRange(d).lo); if (ground) shapes.push(...ground.shapes);
  // furniture and street clutter from Object mode, standing on whatever is under them (src/game/props.js)
  if (!opts.light) buildProps(d, town, shapes, origin);

  // ---- rooms ----
  //   1 plain · 2 pillared hall (four pillars, a torch on each, facing the middle) · 3 brazier room (a fire
  //   basin in the middle, broken stone lying about for cover)
  function buildRoom(p, x, y, b, cx, cz, Y, top) {
    const W = BUILD.wall, v = p.variant;
    for (let l = b; l < b + p.height; l++) {
      const sides = sidesAt(d, x, y, l), y0 = l * C, y1 = (l + 1) * C;
      for (const sd of SIDES) {
        const kind = sides[sd];
        const n = coverAt(d, x + (sd === 'E') - (sd === 'W'), y + (sd === 'S') - (sd === 'N'), l);
        const arr = !n && stairsArriving(d, x, y, l);
        const door = kind === 'open' && ((n && !isRoom(n.piece) && n.base === l) || (arr && arr.from === sd));
        if (kind === 'open' && !door) continue;                                         // joins another room
        // a wall along this side; with a doorway in its middle at floor level if a passage opens here
        const along = (u0, u1, v0, v1) => {                                              // u along the side, y range
          if (sd === 'N') box(cx + u0, v0, cz, cx + u1, v1, cz + W, COLORS.wall);
          if (sd === 'S') box(cx + u0, v0, cz + C - W, cx + u1, v1, cz + C, COLORS.wall);
          if (sd === 'W') box(cx, v0, cz + u0, cx + W, v1, cz + u1, COLORS.wall);
          if (sd === 'E') box(cx + C - W, v0, cz + u0, cx + C, v1, cz + u1, COLORS.wall);
        };
        // a torch on this wall, u along it
        const wallTorch = u => {
          const [ox, oz] = OUT[sd], ty = y0 + BUILD.torchH;
          const px = sd === 'W' ? W : sd === 'E' ? C - W : u, pz = sd === 'N' ? W : sd === 'S' ? C - W : u;
          torch(cx + px, ty, cz + pz, ox, oz);
        };
        if (door) { along(0, A, y0, y1); along(B, C, y0, y1); along(A, B, y0 + BUILD.passH, y1); if (l === b) { wallTorch(A - 0.9); wallTorch(B + 0.9); } }   // torches either side of the doorway
        else { along(0, C, y0, y1); if (l === b && v !== 2) { if (v === 4) { wallTorch(2.5); wallTorch(7.5); } else wallTorch(C / 2); } }
        if (l === b) {                                                                   // skirting and a cornice along the wall; a stone frame round a doorway
          const axis = sd === 'W' || sd === 'E' ? 'x' : 'z', at = sd === 'W' ? cx + W : sd === 'E' ? cx + C - W : sd === 'N' ? cz + W : cz + C - W, out = sd === 'W' || sd === 'N' ? 1 : -1, o0 = axis === 'x' ? cz : cx;
          const roofY = isLow(p) ? Y + LOW_H : null;
          if (door) {
            wallTrim(axis, at, out, o0, o0 + A - FR.w, Y, roofY); wallTrim(axis, at, out, o0 + B + FR.w, o0 + C, Y, roofY);
            const f0 = Math.min(at, at + out * FR.d), f1 = Math.max(at, at + out * FR.d), H = BUILD.passH;
            const post = (u0, u1) => axis === 'x' ? trim(f0, Y, o0 + u0, f1, Y + H + 0.1, o0 + u1) : trim(o0 + u0, Y, f0, o0 + u1, Y + H + 0.1, f1);
            post(A - FR.w, A); post(B, B + FR.w);
            if (axis === 'x') trim(f0, Y + H, o0 + A - FR.w - 0.1, f1 + out * 0.04, Y + H + 0.45, o0 + B + FR.w + 0.1); else trim(o0 + A - FR.w - 0.1, Y + H, f0, o0 + B + FR.w + 0.1, Y + H + 0.45, f1 + out * 0.04);   // the lintel
          } else wallTrim(axis, at, out, o0, o0 + C, Y, roofY);
        }
      }
    }
    // the ceiling, unless the floor of something above covers it; a low room's comes down to 5 m, rock above
    const roof = isLow(p) ? Y + LOW_H : top;
    // a square pilaster in each inside corner where two walls meet (solid: it's part of the wall)
    { const base = sidesAt(d, x, y, b), walled = sd => base[sd] !== 'open' || !!(() => { const n = coverAt(d, x + (sd === 'E') - (sd === 'W'), y + (sd === 'S') - (sd === 'N'), b); return n && !isRoom(n.piece) && n.base === b; })();
      const P = 0.5;
      for (const [a, c2, px, pz] of [['N', 'W', W, W], ['N', 'E', C - W - P, W], ['S', 'W', W, C - W - P], ['S', 'E', C - W - P, C - W - P]])
        if (walled(a) && walled(c2)) box(cx + px, Y, cz + pz, cx + px + P, roof, cz + pz + P, COLORS.pillar); }
    if (isLow(p)) box(cx, roof, cz, cx + C, top, cz + C, COLORS.roof);
    else if (!coverAt(d, x, y, b + p.height)) box(cx, top, cz, cx + C, top + BUILD.floor, cz + C, COLORS.roof);
    if (v === 2) {                                                                       // pillared hall
      const s = 0.6;
      const lit = (x + y) % 2 ? [[7.4, 2.6], [2.6, 7.4]] : [[2.6, 2.6], [7.4, 7.4]];             // torches on two of the four, crosswise
      for (const [px, pz] of [[2.6, 2.6], [7.4, 2.6], [2.6, 7.4], [7.4, 7.4]]) {
        box(cx + px - s, Y, cz + pz - s, cx + px + s, roof, cz + pz + s, COLORS.pillar);
        box(cx + px - s - 0.15, Y, cz + pz - s - 0.15, cx + px + s + 0.15, Y + 0.5, cz + pz + s + 0.15, COLORS.wall);   // a plinth
        const tx = Math.sign(5 - px), tz = Math.sign(5 - pz);                                   // the face toward the middle
        if (!lit.some(q => q[0] === px && q[1] === pz)) continue;
        if (Math.abs(5 - px) > Math.abs(5 - pz)) torch(cx + px + tx * s, Y + BUILD.torchH, cz + pz, tx, 0); else torch(cx + px, Y + BUILD.torchH, cz + pz + tz * s, 0, tz);
      }
    } else if (v === 4) {                                                                // crypt: two rows of sarcophagi
      for (const px of [2.6, 7.4]) for (const pz of [3.0, 7.0]) {
        box(cx + px - 0.55, Y, cz + pz - 1.15, cx + px + 0.55, Y + 0.85, cz + pz + 1.15, COLORS.statue);
        box(cx + px - 0.62, Y + 0.85, cz + pz - 1.22, cx + px + 0.62, Y + 1.0, cz + pz + 1.22, COLORS.pillar);   // the lid
      }
    } else if (v === 3) {                                                                // brazier room
      standBrazier(cx + 5, Y, cz + 5, 1.6, 0.9);
      for (let k = 0; k < 4; k++) {                                                        // fallen stone: cover to crouch behind
        const rx = 1.5 + rnd(x, y, k) * 7, rz = 1.5 + rnd(x, y, k + 9) * 7;
        if (Math.abs(rx - 5) < 1.8 && Math.abs(rz - 5) < 1.8) continue;
        const w = 0.6 + rnd(x, y, k + 3) * 0.9, hh = 0.5 + rnd(x, y, k + 5) * 0.8;
        box(cx + rx - w / 2, Y, cz + rz - w / 2, cx + rx + w / 2, Y + hh, cz + rz + w / 2, COLORS.rubble);
      }
    }
  }

  // ---- passages ----
  //   corridor   1 plain · 2 ribbed vault (pilasters and an arch every half cell, torches on the ribs) ·
  //              3 half-collapsed (a rubble heap to climb and a fallen beam to duck under; one torch)
  //   crossing   2 a pillar in the middle with a torch on each face
  //   entrance   2 gatehouse (a raised portcullis in a stone frame at the mouth)
  //   dead end   2 statue alcove (a statue at the end, a torch either side)
  function buildPassage(p, x, y, b, cx, cz, Y, top) {
    const low = isLow(p), open = openSides(p), ceil = Y + (low ? BUILD.lowPassH : BUILD.passH) + (p.height - 1) * C, sides = sidesAt(d, x, y, b), v = p.variant;
    for (const [i, j] of [[0, 0], [2, 0], [0, 2], [2, 2]]) sq(cx, cz, i, j, Y, top, COLORS.rock);   // corners: rock
    for (const sd of SIDES) {
      const [i, j] = EDGE[sd];
      if (!open.includes(sd)) { sq(cx, cz, i, j, Y, top, COLORS.rock); continue; }
      sq(cx, cz, i, j, ceil, top, COLORS.roof);
      if (sides[sd] === 'loose') {                                                          // leads nowhere: capped
        const W = BUILD.wall;
        if (sd === 'N') box(cx + A, Y, cz, cx + B, ceil, cz + W, COLORS.wall);
        if (sd === 'S') box(cx + A, Y, cz + C - W, cx + B, ceil, cz + C, COLORS.wall);
        if (sd === 'W') box(cx, Y, cz + A, cx + W, ceil, cz + B, COLORS.wall);
        if (sd === 'E') box(cx + C - W, Y, cz + A, cx + C, ceil, cz + B, COLORS.wall);
      }
    }
    sq(cx, cz, 1, 1, ceil, top, COLORS.roof);                                                // the middle
    // trim: skirting and a cornice wherever the open channel meets rock (or a cap wall)
    { const O = new Set(['1,1', ...open.map(sd => EDGE[sd].join(','))]);
      for (const k of O) {
        const [i, j] = k.split(',').map(Number), [x0, x1] = band(i), [z0, z1] = band(j);
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const i2 = i + di, j2 = j + dj;
          if (i2 >= 0 && i2 <= 2 && j2 >= 0 && j2 <= 2) { if (O.has(`${i2},${j2}`)) continue; }
          else { const sd = di === 1 ? 'E' : di === -1 ? 'W' : dj === 1 ? 'S' : 'N'; if (sides[sd] !== 'loose') continue; }   // the cell's edge: only where it's capped
          const capOff = (i2 < 0 || i2 > 2 || j2 < 0 || j2 > 2) ? BUILD.wall : 0;
          if (di) wallTrim('x', cx + (di > 0 ? x1 - capOff : x0 + capOff), -di, cz + z0, cz + z1, Y, ceil);
          else wallTrim('z', cz + (dj > 0 ? z1 - capOff : z0 + capOff), -dj, cx + x0, cx + x1, Y, ceil);
        }
      }
      if (!(p.part === 'C' && v === 2) && !(p.part === 'X' && v === 3)) {                    // a beam across the ceiling over the middle
        const ns = open.includes('N') || open.includes('S');
        if (ns) trim(cx + A, ceil - 0.4, cz + 4.75, cx + B, ceil, cz + 5.25, COLORS.wood); else trim(cx + 4.75, ceil - 0.4, cz + A, cx + 5.25, ceil, cz + B, COLORS.wood);
      } }
    const ty = Y + (low ? BUILD.lowTorchH : BUILD.torchH);
    // the channel's own walls: where a closed side faces the middle square (a torch can hang there)
    const closed = SIDES.filter(sd => !open.includes(sd));
    const torchOnMiddle = sd => { const [ox, oz] = OUT[sd]; if (sd === 'N' || sd === 'S') torch(cx + C / 2, ty, sd === 'N' ? cz + A : cz + B, ox, oz); else torch(sd === 'W' ? cx + A : cx + B, ty, cz + C / 2, ox, oz); };
    const along = open.includes('N') || open.includes('S') ? 'z' : 'x';                       // which way a straight corridor runs

    if (p.part === 'C' && v === 2) {                                                         // ribbed vault
      for (const t of [2.5, 7.5]) {
        if (along === 'z') {
          box(cx + A, Y, cz + t - 0.3, cx + A + 0.4, ceil, cz + t + 0.3, COLORS.pillar); box(cx + B - 0.4, Y, cz + t - 0.3, cx + B, ceil, cz + t + 0.3, COLORS.pillar);
          box(cx + A, ceil - 0.5, cz + t - 0.27, cx + B, ceil, cz + t + 0.27, COLORS.pillar);   // a hair narrower than the pilasters, so their faces don't fight
          torch(cx + A + 0.4, ty, cz + t + (t < 5 ? 0.6 : -0.6), 1, 0);
        } else {
          box(cx + t - 0.3, Y, cz + A, cx + t + 0.3, ceil, cz + A + 0.4, COLORS.pillar); box(cx + t - 0.3, Y, cz + B - 0.4, cx + t + 0.3, ceil, cz + B, COLORS.pillar);
          box(cx + t - 0.27, ceil - 0.5, cz + A, cx + t + 0.27, ceil, cz + B, COLORS.pillar);
          torch(cx + t + (t < 5 ? 0.6 : -0.6), ty, cz + A + 0.4, 0, 1);
        }
      }
    } else if (p.part === 'C' && v === 3) {                                                  // half-collapsed
      if (along === 'z') {
        box(cx + A, Y, cz + 2.2, cx + A + 2.6, Y + 0.9, cz + 4.4, COLORS.rubble);                // a heap against one wall
        box(cx + A, Y, cz + 2.6, cx + A + 1.6, Y + 1.5, cz + 3.8, COLORS.rubble);
        box(cx + A, Y + 1.3, cz + 6.4, cx + B, Y + 1.75, cz + 6.9, COLORS.iron);                // a fallen beam: duck
        torch(cx + B, ty, cz + 8.4, -1, 0);
      } else {
        box(cx + 2.2, Y, cz + A, cx + 4.4, Y + 0.9, cz + A + 2.6, COLORS.rubble);
        box(cx + 2.6, Y, cz + A, cx + 3.8, Y + 1.5, cz + A + 1.6, COLORS.rubble);
        box(cx + 6.4, Y + 1.3, cz + A, cx + 6.9, Y + 1.75, cz + B, COLORS.iron);
        torch(cx + 8.4, ty, cz + B, 0, -1);
      }
    } else if (p.part === 'C' && v !== 4) {                                                  // plain: one torch, alternating sides
      const left = (x + y) % 2 === 0;
      if (along === 'z') torch(left ? cx + A : cx + B, ty, cz + C / 2, left ? 1 : -1, 0);
      else torch(cx + C / 2, ty, left ? cz + A : cz + B, 0, left ? 1 : -1);
    } else if (p.part === 'X' && v === 2) {                                                  // crossing with a pillar
      const s = 0.7; box(cx + 5 - s, Y, cz + 5 - s, cx + 5 + s, ceil, cz + 5 + s, COLORS.pillar);
      for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) torch(cx + 5 + ox * s, ty, cz + 5 + oz * s, ox, oz);
    } else if (p.part === 'X') {
      // no walls in the middle: torches on the corner rock facing in, two of them
      torch(cx + A, ty, cz + A - 0.6, 1, 0); torch(cx + B, ty, cz + B + 0.6, -1, 0);
    } else if (p.part === 'E' && v === 2) {                                                  // gatehouse at the mouth
      const sd = faceOf(p), mouth = { N: [cx + A, cz, cx + B, cz + 0.8], S: [cx + A, cz + C - 0.8, cx + B, cz + C], W: [cx, cz + A, cx + 0.8, cz + B], E: [cx + C - 0.8, cz + A, cx + C, cz + B] }[sd];
      const ns = sd === 'N' || sd === 'S';
      if (ns) { box(mouth[0], Y, mouth[1], mouth[0] + 0.5, ceil, mouth[3], COLORS.pillar); box(mouth[2] - 0.5, Y, mouth[1], mouth[2], ceil, mouth[3], COLORS.pillar); }
      else { box(mouth[0], Y, mouth[1], mouth[2], ceil, mouth[1] + 0.5, COLORS.pillar); box(mouth[0], Y, mouth[3] - 0.5, mouth[2], ceil, mouth[3], COLORS.pillar); }
      box(mouth[0], ceil - 0.7, mouth[1], mouth[2], ceil, mouth[3], COLORS.pillar);                  // the lintel
      box(mouth[0] + (ns ? 0.5 : 0.3), ceil - 1.2, mouth[1] + (ns ? 0.3 : 0.5), mouth[2] - (ns ? 0.5 : 0.3), ceil - 0.7, mouth[3] - (ns ? 0.3 : 0.5), COLORS.iron);   // the raised portcullis
      for (const sdW of closed.filter(s2 => s2 !== sd)) torchOnMiddle(sdW);
    } else if (p.part === 'D' && v === 2) {                                                  // statue alcove
      const back = closed.find(sd => sd === { N: 'S', S: 'N', E: 'W', W: 'E' }[faceOf(p)]) || closed[0];
      const [ox, oz] = OUT[back], mx = cx + 5 - ox * 1.2, mz = cz + 5 - oz * 1.2;
      box(mx - 0.7, Y, mz - 0.7, mx + 0.7, Y + 0.8, mz + 0.7, COLORS.wall);                        // plinth
      box(mx - 0.35, Y + 0.8, mz - 0.25, mx + 0.35, Y + 2.3, mz + 0.25, COLORS.statue);            // the figure
      box(mx - 0.22, Y + 2.3, mz - 0.22, mx + 0.22, Y + 2.75, mz + 0.22, COLORS.statue);
      for (const sdW of closed.filter(s2 => s2 !== back)) torchOnMiddle(sdW);
    } else if (p.part === 'C' && v === 4) {                                                  // pit: a 2.5 m gap, 4 m deep, to jump
      const pit = [3.8, 6.3], deep = 4;
      const R = (a0, a1, b0, b1, y0, y1, color) => along === 'z' ? box(cx + b0, y0, cz + a0, cx + b1, y1, cz + a1, color) : box(cx + a0, y0, cz + b0, cx + a1, y1, cz + b1, color);
      R(0, pit[0], 0, C, Y - BUILD.floor, Y, COLORS.floor); R(pit[1], C, 0, C, Y - BUILD.floor, Y, COLORS.floor);
      R(pit[0], pit[1], 0, A, Y - BUILD.floor, Y, COLORS.floor); R(pit[0], pit[1], B, C, Y - BUILD.floor, Y, COLORS.floor);
      R(pit[0], pit[1], A, B, Y - deep - 0.5, Y - deep, COLORS.floor);                         // the bottom
      { const [a0, a1] = [pit[0], pit[1]], m = along === 'z' ? [cx + A, cz + a0, cx + B, cz + a1] : [cx + a0, cz + A, cx + a1, cz + B];   // falling in kills
        hazards.push({ kind: 'pit', min: [origin.x + m[0], origin.y + Y - deep - 0.2, origin.z + m[1]], max: [origin.x + m[2], origin.y + Y - 1.6, origin.z + m[3]] }); }
      R(pit[0] - 0.5, pit[0], A, B, Y - deep, Y - BUILD.floor, COLORS.rock); R(pit[1], pit[1] + 0.5, A, B, Y - deep, Y - BUILD.floor, COLORS.rock);
      R(pit[0], pit[1], A - 0.5, A, Y - deep, Y - BUILD.floor, COLORS.rock); R(pit[0], pit[1], B, B + 0.5, Y - deep, Y - BUILD.floor, COLORS.rock);
      for (let k = 0; k < 6; k++) { const a = pit[0] + 0.3 + (k % 3) * 0.8, bb = A + 0.6 + Math.floor(k / 3) * 2.4; R(a, a + 0.18, bb, bb + 0.18, Y - deep, Y - deep + 0.6, COLORS.iron); }   // stakes
      if (along === 'z') torch(cx + A, ty, cz + 2.4, 1, 0); else torch(cx + 2.4, ty, cz + A, 0, 1);
    } else if (p.part === 'J' && v === 2) {                                                  // fountain against the wall behind
      const back = closed[0], [ox, oz] = OUT[back];
      const mx = cx + 5 - ox * 1.4, mz = cz + 5 - oz * 1.4;                                    // the basin's middle, against that wall
      const w = ox ? 0.8 : 1.6, dd = oz ? 0.8 : 1.6;
      const r = 0.15;                                                                          // the basin: a rim round a sunken floor, holding water
      box(mx - w, Y, mz - dd, mx + w, Y + 0.2, mz + dd, COLORS.basin);
      box(mx - w, Y, mz - dd, mx + w, Y + 0.7, mz - dd + r, COLORS.basin); box(mx - w, Y, mz + dd - r, mx + w, Y + 0.7, mz + dd, COLORS.basin);
      box(mx - w, Y, mz - dd, mx - w + r, Y + 0.7, mz + dd, COLORS.basin); box(mx + w - r, Y, mz - dd, mx + w, Y + 0.7, mz + dd, COLORS.basin);
      water.push({ x0: origin.x + mx - w + r, z0: origin.z + mz - dd + r, x1: origin.x + mx + w - r, z1: origin.z + mz + dd - r, y: origin.y + Y + 0.58 });
      const spx = mx - ox * 0.6, spz = mz - oz * 0.6;
      box(spx - 0.25, Y + 0.2, spz - 0.25, spx + 0.25, Y + 2.2, spz + 0.25, COLORS.statue);       // the spout
      box(spx + ox * 0.25, Y + 1.7, spz + oz * 0.25, spx + ox * 0.45, Y + 1.82, spz + oz * 0.45, COLORS.statue);   // its lip
      streams.push({ x: origin.x + spx + ox * 0.5, z: origin.z + spz + oz * 0.5, y0: origin.y + Y + 1.74, y1: origin.y + Y + 0.58, nx: ox, nz: oz });
      torchOnMiddle(back);                                                                     // a torch over the fountain
    } else if (p.part === 'X' && v === 3) {                                                  // chandelier
      const hy = ceil - (low ? 0.9 : 1.6);
      box(cx + 4.95, hy + 0.2, cz + 4.95, cx + 5.05, ceil, cz + 5.05, COLORS.iron);            // the chain
      box(cx + 4.1, hy, cz + 4.1, cx + 5.9, hy + 0.12, cz + 5.9, COLORS.iron);                 // the ring
      brazier(cx + 5, hy + 0.35, cz + 5);
      for (const [px, pz] of [[A, A], [B, A], [A, B], [B, B]]) box(cx + px - 0.35, Y, cz + pz - 0.35, cx + px + 0.35, ceil, cz + pz + 0.35, COLORS.pillar);   // corner columns
    } else if (p.part === 'T' && v === 2) {                                                  // shrine niche in the outer corner
      const [c1, c2] = closed, [o1x, o1z] = OUT[c1], [o2x, o2z] = OUT[c2];
      const nx = cx + 5 - (o1x + o2x) * 1.4, nz = cz + 5 - (o1z + o2z) * 1.4;                   // toward the closed corner
      box(nx - 0.6, Y, nz - 0.6, nx + 0.6, Y + 1.0, nz + 0.6, COLORS.wall);
      box(nx - 0.3, Y + 1.0, nz - 0.3, nx + 0.3, Y + 1.25, nz + 0.3, COLORS.gold);              // an offering bowl
      brazier(nx, Y + 1.45, nz);
      torchOnMiddle(c1);
    } else if (p.part === 'E' && v === 3) {                                                  // brazier gate with banners
      const sd = faceOf(p), ns = sd === 'N' || sd === 'S', mz = sd === 'N' ? 1.6 : sd === 'S' ? 8.4 : 5, mxp = sd === 'W' ? 1.6 : sd === 'E' ? 8.4 : 5;
      for (const k of [-1, 1]) {
        const bx = cx + (ns ? 5 + k * 1.4 : mxp), bz = cz + (ns ? mz : 5 + k * 1.4);
        standBrazier(bx, Y, bz, 0.7, 1.0);
      }
      for (const sdW of closed) { const [ox, oz] = OUT[sdW];                                    // banners on the side walls
        if (sdW === 'N' || sdW === 'S') { const z = sdW === 'N' ? cz + A : cz + B; box(cx + 4.3, Y + 1.2, z - (oz < 0 ? 0.06 : 0), cx + 5.7, ceil - 0.4, z + (oz > 0 ? 0.06 : 0), COLORS.banner); }
        else { const x2 = sdW === 'W' ? cx + A : cx + B; box(x2 - (ox < 0 ? 0.06 : 0), Y + 1.2, cz + 4.3, x2 + (ox > 0 ? 0.06 : 0), ceil - 0.4, cz + 5.7, COLORS.banner); } }
    } else if (p.part === 'D' && v === 3) {                                                  // treasure nook: a chest on a dais
      const back = closed.find(sd => sd === { N: 'S', S: 'N', E: 'W', W: 'E' }[faceOf(p)]) || closed[0];
      const [ox, oz] = OUT[back], mx = cx + 5 - ox * 1.1, mz = cz + 5 - oz * 1.1;
      box(cx + A, Y, cz + A, cx + B, Y + 0.25, cz + B, COLORS.wall);                              // the dais
      chest(mx, Y + 0.25, mz, ((Math.round(Math.atan2(ox, -oz) * 180 / Math.PI) % 360) + 360) % 360);   // facing out of the nook
      for (const sdW of closed.filter(s2 => s2 !== back)) torchOnMiddle(sdW);
    } else if (p.part === 'K') {                                                             // checkpoint: a resting place against one side wall
      const L = (u, w) => along === 'z' ? [cx + A + u, cz + w] : [cx + w, cz + A + u];          // u out from the left wall, w along the passage
      const [nx, nz] = along === 'z' ? [1, 0] : [0, 1];
      const name = `${['the waystone', 'the campfire', 'the shrine'][(v - 1) % 3] || 'the waystone'}`;
      const [sx, sz] = L(2.9, 5);                                                              // where you come back: the far side of the passage
      if (v === 2) {                                                                           // campfire: a ring of stones, a fire, a bedroll
        const [fx, fz] = L(1.2, 4.2);
        for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, rx = fx + Math.cos(a) * 0.62, rz = fz + Math.sin(a) * 0.62; box(rx - 0.13, Y, rz - 0.13, rx + 0.13, Y + 0.22, rz + 0.13, COLORS.rubble); }
        box(fx - 0.4, Y, fz - 0.07, fx + 0.4, Y + 0.12, fz + 0.07, COLORS.wood); box(fx - 0.07, Y + 0.08, fz - 0.4, fx + 0.07, Y + 0.2, fz + 0.4, COLORS.wood);
        torches.push({ ...W0(fx, Y + 0.45, fz), brazier: true, campfire: true });
        const [bx, bz] = L(0.55, 7.2), bw = along === 'z' ? [0.45, 1.0] : [1.0, 0.45];
        box(bx - bw[0], Y, bz - bw[1], bx + bw[0], Y + 0.12, bz + bw[1], COLORS.banner);           // the bedroll
        checkpoint(name, fx, Y, fz, sx, sz, 'campfire');
      } else if (v === 3) {                                                                    // spirit shrine: an altar, a crystal on it
        const [ax, az] = L(0.6, 5);
        box(ax - 0.6, Y, az - 0.6, ax + 0.6, Y + 0.95, az + 0.6, COLORS.wall);
        box(ax - 0.7, Y + 0.95, az - 0.7, ax + 0.7, Y + 1.05, az + 0.7, COLORS.pillar);
        const id = checkpoint(name, ax, Y, az, sx, sz, 'shrine');
        glows.push({ ...W0(ax, Y + 1.5, az), nx, nz, cp: id, kind: 'crystal' });
        torchOnMiddle(along === 'z' ? 'E' : 'S');
      } else {                                                                                 // waystone
        const [wx, wz] = L(0.45, 5);
        const rune = waystone(wx, Y, wz, nx, nz);
        const id = checkpoint(name, wx, Y, wz, sx, sz, 'waystone');
        glows.push({ ...rune, cp: id, kind: 'rune' });
        torchOnMiddle(along === 'z' ? 'E' : 'S');
      }
    } else {
      // everything else: a torch on a wall facing the middle, if there is one (junctions, turns, entrances, dead ends)
      const sd = closed[(x + y) % Math.max(1, closed.length)];
      if (sd) torchOnMiddle(sd);
    }
  }

  // ---- stairs ----
  function buildStairs(p, x, y, b, cx, cz, Y, topY) {
    // local frame: u across (0..10, left to right facing forward), v along (0 at the back edge, 10 at the front)
    const f = faceOf(p);
    const rect = (u0, u1, v0, v1) => {
      if (f === 'N') return [cx + u0, cz + C - v1, cx + u1, cz + C - v0];
      if (f === 'S') return [cx + C - u1, cz + v0, cx + C - u0, cz + v1];
      if (f === 'E') return [cx + v0, cz + u0, cx + v1, cz + u1];
      return [cx + C - v1, cz + C - u1, cx + C - v0, cz + C - u0];                       // W
    };
    const lpt = (u, v) => { const r = rect(u, u, v, v); return [r[0], r[1]]; };
    const lbox = (u0, u1, v0, v1, y0, y1, color) => { const [x0, z0, x1, z1] = rect(u0, u1, v0, v1); box(x0, y0, z0, x1, y1, z1, color); };
    const roofY = topY + BUILD.passH, capY = topY + C;                                       // the flight's roof; the headroom layer above
    const grand = p.variant === 2, a0 = grand ? 2 : A, a1 = grand ? 8 : B;                       // grand stairs: 6 m wide
    lbox(0, a0, 0, C, Y, capY, COLORS.rock); lbox(a1, C, 0, C, Y, capY, COLORS.rock);        // rock either side of the flight
    if (grand) {                                                                              // the openings stay 4 m: narrow in at both ends
      lbox(a0, A, 0, 0.8, Y, capY, COLORS.wall); lbox(B, a1, 0, 0.8, Y, capY, COLORS.wall);
      lbox(a0, A, C - 0.8, C, Y, capY, COLORS.wall); lbox(B, a1, C - 0.8, C, Y, capY, COLORS.wall);
    }
    const n = Math.round(p.height * C / BUILD.step), depth = C / n, rise = p.height * C / n;
    for (let i = 0; i < n; i++) lbox(a0, a1, i * depth, (i + 1) * depth, Y, Y + (i + 1) * rise, COLORS.step);
    if (grand) for (let i = 0; i < n; i += 1) { const v0 = i * depth, top2 = Y + (i + 1) * rise;                       // balustrades along both sides
      lbox(a0, a0 + 0.3, v0, v0 + depth, top2, top2 + 0.9, COLORS.pillar); lbox(a1 - 0.3, a1, v0, v0 + depth, top2, top2 + 0.9, COLORS.pillar); }
    lbox(A, B, 0, BUILD.wall, Y + BUILD.passH, capY, COLORS.wall);                           // above the way in
    lbox(a0, a1, 0, C, roofY, capY, COLORS.roof);                                            // the roof over the flight
    const ahead = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }[f];
    if (!coverAt(d, x + ahead[0], y + ahead[1], b + p.height)) lbox(A, B, C - BUILD.wall, C, topY, roofY, COLORS.wall);   // nothing to arrive in: walled off
    // torches on the side walls, low and high, facing across the flight
    const across = { N: [1, 0], S: [-1, 0], E: [0, 1], W: [0, -1] }[f];                    // +u in world terms
    for (const [vv, side] of [[2.5, 'L'], [7.5, 'R']]) {
      const [wx, wz] = lpt(side === 'L' ? a0 : a1, vv), hy = Y + vv / C * (topY - Y) + BUILD.torchH;
      torch(wx, hy, wz, side === 'L' ? across[0] : -across[0], side === 'L' ? across[1] : -across[1]);
    }
  }

  // the dungeon's extent in the world, for its sky region (black, close fog)
  let lo = 0, hi = 1; eachPiece(d, (p, x, y, l) => { lo = Math.min(lo, l); hi = Math.max(hi, l + p.height); });
  const bounds = { min: [origin.x - 2, origin.y + lo * C - 8, origin.z - 2], max: [origin.x + d.w * C + 2, origin.y + hi * C + 2, origin.z + d.h * C + 2] };
  // a Player start object (Object mode) wins over the entrance piece: you begin on it, facing its way, and its spot
  // is your first checkpoint
  const startObj = (d.objects || []).find(o => o.type === 'start');
  if (startObj) {
    const Y = (startObj.layer || 0) * C + (startObj.y || 0);
    spawn = { x: origin.x + startObj.x, y: origin.y + Y + 0.6, z: origin.z + startObj.z, yaw: Math.PI - (startObj.rot || 0) * Math.PI / 180 };
    spawn.checkpoint = checkpoint('the start', startObj.x, Y, startObj.z, startObj.x, startObj.z, 'waystone');
  }
  return { shapes, decor, torches, spawn, checkpoints, glows, water, waterMeshes, waterFalls, waterFx, waterSounds, plants, streams, hazards, bounds, presets, crystals, pads, swim, pathSurfaces: ground ? [...paths.surfaces, ...ground.surfaces] : paths.surfaces, groundSplat: ground?.splat || null };
}

// Torches: a bracket, a stick and a flame on each; braziers a bigger fire. A small pool of real lights is
// handed out to the torches that matter most (nearest, and in front of you more than behind), re-sorted a few
// times a second. A torch is only burning while it holds a light: it flares up as you come, and gutters out
// as you leave it behind (faster for ones behind you). Also here: the fountains' water, and the checkpoints'
// glowing runes and crystals (brighter on the one you last touched).
export function lightDungeon(THREE, scene, dg, { pool = 12, reach = 38, color = '#ffaa60', bright = 1, range = 1 } = {}) {
  const torches = dg.torches;
  const tex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
    const grd = g.createRadialGradient(32, 40, 0, 32, 36, 30); grd.addColorStop(0, 'rgba(255,245,210,1)'); grd.addColorStop(0.25, 'rgba(255,180,80,0.95)'); grd.addColorStop(0.6, 'rgba(255,100,20,0.45)'); grd.addColorStop(1, 'rgba(255,60,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv);
  })();
  const wood = new THREE.MeshStandardMaterial({ color: '#4a3424', roughness: 0.9 }), iron = new THREE.MeshStandardMaterial({ color: '#2e2c2a', roughness: 0.6, metalness: 0.6 });
  const stickG = new THREE.CylinderGeometry(0.035, 0.05, 0.55, 6), bracketG = new THREE.BoxGeometry(0.08, 0.08, 0.32), plateG = new THREE.BoxGeometry(0.22, 0.32, 0.04), headG = new THREE.CylinderGeometry(0.07, 0.055, 0.12, 8);
  const COLD = new THREE.Color('#2a1a12'), HOT = new THREE.Color('#ff8a30'), lampG = new THREE.OctahedronGeometry(0.11);
  const glowTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); const grd = g.createRadialGradient(32, 32, 0, 32, 32, 30); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })();
  // the torches' plates, brackets and sticks never move or change, so they're baked into two meshes for the
  // whole dungeon (two draw calls instead of three per torch)
  const ironParts = [], woodParts = [];
  const bake = (into, geo, o) => { o.updateMatrix(); const g = geo.toNonIndexed(); g.applyMatrix4(o.matrix); into.push(g); };
  const merged = (parts, mat) => {
    if (!parts.length) return;
    const n = parts.reduce((a, g) => a + g.attributes.position.count, 0), pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
    for (const g of parts) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; g.dispose(); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.computeBoundingSphere();
    { const tm = new THREE.Mesh(geo, mat); tm.userData.probe = 'torches'; tm.userData.noLampShadow = true; scene.add(tm); }
  };
  const list = torches.map((t, i) => {
    const g = new THREE.Group();
    let flameAt, head = null;
    if (t.brazier) flameAt = new THREE.Vector3(t.x, t.y, t.z);
    else if (t.lamp) {                                               // a crystal lamp (town lampposts, door lanterns): a glowing crystal in a cage
      head = new THREE.Mesh(lampG, new THREE.MeshBasicMaterial({ color: COLD.clone() })); head.position.set(t.x, t.y, t.z); head.scale.set(1, 1.6, 1); head.userData.noLampShadow = true; g.add(head);   /* (the crystal holds the light: it mustn't shadow it) */
      flameAt = head.position.clone();
    } else {
      // the stick leans out from the wall a little; the flame sits on its tip
      const out = new THREE.Vector3(t.nx, 0, t.nz).normalize(), base = new THREE.Vector3(t.x, t.y, t.z).addScaledVector(out, 0.02);
      const plate = new THREE.Object3D(); plate.position.copy(base); plate.lookAt(base.clone().add(out)); bake(ironParts, plateG, plate);
      const br = new THREE.Object3D(); br.position.copy(base).addScaledVector(out, 0.16); br.lookAt(base.clone().addScaledVector(out, 2)); bake(ironParts, bracketG, br);
      const stick = new THREE.Object3D(); stick.position.copy(base).addScaledVector(out, 0.3).add(new THREE.Vector3(0, 0.12, 0));
      stick.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(out.x * 0.35, 1, out.z * 0.35).normalize()); bake(woodParts, stickG, stick);
      head = new THREE.Mesh(headG, new THREE.MeshBasicMaterial({ color: COLD.clone() })); head.position.copy(stick.position).add(new THREE.Vector3(out.x * 0.1, 0.27, out.z * 0.1)); g.add(head);
      flameAt = head.position.clone().add(new THREE.Vector3(0, 0.2, 0));
    }
    scene.add(g);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: t.lamp ? glowTex : tex, color: t.lamp ? (t.color || '#ffe2a0') : '#ffffff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    flame.position.copy(flameAt); flame.visible = false; scene.add(flame);
    const big = t.brazier ? (t.campfire ? 1.1 : 1) : 0;
    if (t.lamp) return { t, flame, head, hot: new THREE.Color(t.color || '#ffe2a0'), at: flameAt, light: null, k: 0, vis: 0, want: false, seed: i * 2.17, sx: 0.9, sy: 0.9, steady: true, base: 2.4 * bright, dist: 22 * range };
    return { t, flame, head, hot: HOT, at: flameAt, light: null, k: 0, want: false, seed: i * 2.17, sx: big ? 0.9 * big : 0.4, sy: big ? 1.2 * big : 0.6, base: (t.brazier ? 1.8 : 1.0) * bright, dist: (t.brazier ? 18 : 14) * range };
  });
  merged(ironParts, iron); merged(woodParts, wood);
  const lights = Array.from({ length: Math.min(pool, list.filter(o => !o.steady).length) },   /* (torches only: street lamps light the surfaces their own way, below) */ () => { const l = new THREE.PointLight(color, 0, 13, 2); scene.add(l); return { l, owner: null }; });
  // Street lamps don't take these real lights (which shine through walls and cost every lit pixel each): the lamps
  // nearest you — weighted to the way you look, out to ~90 m — are lit by the surfaces' own lamp light instead
  // (src/gfx/weathering.js setLamps: a cone down with spread, blocked by buildings and roofs, dimmed by the weather).
  // Only those lamps glow; the rest stand dark until you come nearer.
  const LAMPS = 32, lampList = list.filter(o => o.steady), litLamps = [];

  // water: a rippling sheet in each basin, and the stream that pours into it
  const ripple = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
    g.fillStyle = '#2a5a78'; g.fillRect(0, 0, 64, 64);
    for (let k = 0; k < 40; k++) { g.strokeStyle = `rgba(170,220,255,${0.08 + Math.random() * 0.18})`; g.lineWidth = 1 + Math.random(); g.beginPath(); const y = Math.random() * 64; g.moveTo(0, y); for (let x = 0; x <= 64; x += 8) g.lineTo(x, y + Math.sin(x * 0.3 + k) * 2); g.stroke(); }
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  })();
  const waterMat = new THREE.MeshStandardMaterial({ map: ripple, color: '#9fd0ff', emissive: '#0c2a3a', transparent: true, opacity: 0.8, roughness: 0.05, metalness: 0.3, depthWrite: false });
  // rivers and lakes (src/game/ground.js): the ripples tile every 4 m, and where the water runs (w.flow, m/s) they
  // drift its way: one material per direction and speed, scrolled in update()
  const flowMats = new Map();
  const flowMat = fl => { const k = fl ? `${fl.x},${fl.z}` : 'still'; let fm = flowMats.get(k); if (!fm) { const tx = ripple.clone(); tx.needsUpdate = true; fm = { mat: waterMat.clone(), tex: tx, fl }; fm.mat.map = tx; flowMats.set(k, fm); } return fm.mat; };
  for (const w of dg.water || []) {
    const big = w.x1 - w.x0 > 2.5 || w.z1 - w.z0 > 2.5 || w.flow !== undefined, geo = new THREE.PlaneGeometry(w.x1 - w.x0, w.z1 - w.z0);
    if (big) { const uv = geo.attributes.uv; for (let n = 0; n < uv.count; n++) uv.setXY(n, (w.x0 + uv.getX(n) * (w.x1 - w.x0)) / 4, (-w.z1 + uv.getY(n) * (w.z1 - w.z0)) / 4); }   // world-tied ripples: neighbouring strips line up
    const m = new THREE.Mesh(geo, big ? flowMat(w.flow) : waterMat); m.rotation.x = -Math.PI / 2;
    m.position.set((w.x0 + w.x1) / 2, w.y, (w.z0 + w.z1) / 2); m.renderOrder = 2; scene.add(m);
  }
  const rivers = createRiverWater(THREE, scene, dg.waterMeshes, dg.waterFalls, dg.waterFx);
  const flora = createFoliage(THREE, scene, dg.plants);                                    // trees, grass, flowers, reeds... (src/gfx/foliage.js)                       // rivers and lakes: their own shader (src/gfx/water.js)
  const fall = ripple.clone(); fall.needsUpdate = true; fall.rotation = Math.PI / 2;
  const fallMat = new THREE.MeshBasicMaterial({ map: fall, color: '#b8e4ff', transparent: true, opacity: 0.65, depthWrite: false, side: THREE.DoubleSide });
  for (const s of dg.streams || []) {
    const h = s.y0 - s.y1, m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, h), fallMat);
    m.position.set(s.x + s.nx * 0.08, (s.y0 + s.y1) / 2, s.z + s.nz * 0.08); m.rotation.y = Math.atan2(s.nx, s.nz) + Math.PI / 2; scene.add(m);
    const m2 = m.clone(); m2.rotation.y += Math.PI / 2; scene.add(m2);
  }

  // checkpoint glows: a rune on a waystone, a crystal on a shrine; one soft blue light on the nearest
  const glows = (dg.glows || []).map(gw => {
    const mat = new THREE.MeshBasicMaterial({ color: '#6fb6ff' });
    let m;
    if (gw.kind === 'crystal') { m = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), mat); m.scale.set(0.8, 1.4, 0.8); }
    else { m = new THREE.Mesh(new THREE.BoxGeometry(gw.nx ? 0.02 : 0.32, 0.5, gw.nz ? 0.02 : 0.32), mat); }
    m.position.set(gw.x, gw.y, gw.z); scene.add(m);
    return { ...gw, m, mat };
  });
  const cpLight = new THREE.PointLight('#6fb6ff', 0, 9, 1.6); scene.add(cpLight);

  // the great crystal(s): a tall, faceted, glowing crystal that turns slowly, with shards orbiting it and its own
  // light; its colour drifts through the crystal-dust hues
  const crystals = (dg.crystals || []).map(cr => {
    const g = new THREE.Group(); g.position.set(cr.x, cr.y, cr.z); scene.add(g);
    const geo = new THREE.CylinderGeometry(cr.r, cr.r, cr.h * 0.6, 6, 1); const top = new THREE.ConeGeometry(cr.r, cr.h * 0.25, 6), bot = new THREE.ConeGeometry(cr.r, cr.h * 0.15, 6);
    const mat = new THREE.MeshStandardMaterial({ color: '#bfe6ff', emissive: '#4a8aff', emissiveIntensity: 1.6, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88 });
    const body = new THREE.Mesh(geo, mat); body.position.y = cr.h * 0.15 + cr.h * 0.3; g.add(body);
    const tp = new THREE.Mesh(top, mat); tp.position.y = cr.h * 0.75 + cr.h * 0.125; g.add(tp);
    const bt = new THREE.Mesh(bot, mat); bt.rotation.x = Math.PI; bt.position.y = cr.h * 0.075; g.add(bt);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#8ac8ff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
    halo.scale.set(cr.h * 0.7, cr.h * 1.0, 1); halo.position.y = cr.h * 0.5; g.add(halo);
    const shards = Array.from({ length: 6 }, (_, k) => { const m = new THREE.Mesh(new THREE.OctahedronGeometry(cr.r * 0.22), mat); m.scale.set(0.7, 1.5, 0.7); g.add(m); return { m, a: k / 6 * Math.PI * 2, y: cr.h * (0.3 + 0.4 * ((k * 37) % 6) / 6), r: cr.r * 2.2 + (k % 2) * cr.r * 0.6 }; });
    const light = new THREE.PointLight('#8ac8ff', 2.4, Math.max(24, cr.h * 3.5), 1.4); light.position.set(cr.x, cr.y + cr.h * 0.6, cr.z); scene.add(light);
    return { g, mat, halo, shards, light, body, cr };
  });
  // warp pads: rune circles set in the ground that glow (where travellers arrive)
  const padTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d'); g.translate(64, 64);
    g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 58, 0, Math.PI * 2); g.stroke(); g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 46, 0, Math.PI * 2); g.stroke();
    g.font = '14px serif'; g.fillStyle = 'rgba(255,255,255,0.9)'; g.textAlign = 'center'; g.textBaseline = 'middle'; const rn = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃ';
    for (let k = 0; k < 12; k++) { g.save(); g.rotate(k / 12 * Math.PI * 2); g.fillText(rn[k], 0, -52); g.restore(); }
    g.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; g.lineTo(Math.cos(a) * 30, Math.sin(a) * 30); } g.closePath(); g.stroke(); return new THREE.CanvasTexture(cv); })();
  const pads = (dg.pads || []).map(pd => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(pd.r * 2, pd.r * 2), new THREE.MeshBasicMaterial({ map: padTex, color: pd.color || '#7fd8ff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(pd.x, pd.y + 0.03, pd.z); scene.add(m);
    let beam = null;
    if (pd.beam) { beam = new THREE.Mesh(new THREE.CylinderGeometry(pd.r * 0.35, pd.r * 0.5, 7, 16, 1, true), new THREE.MeshBasicMaterial({ color: pd.color || '#7fd8ff', transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); beam.position.set(pd.x, pd.y + 3.5, pd.z); scene.add(beam); }
    return { m, pd, beam };
  });

  let sortT = 0, active = [], poolDirty = false;
  // how lit a point is by the torches burning near it (about 1 right by a torch, ~0.4 at 6 m, 0 out of reach)
  function lightAt(pt) {
    let sum = 0;
    for (const L of lights) { const l = L.l; if (!l.intensity) continue; const d = l.position.distanceTo(pt); if (d < l.distance) sum += l.intensity * Math.pow(1 - d / l.distance, 1.7); }
    for (const o of litLamps) { const d = o.at.distanceTo(pt); if (d < o.dist) sum += o.base * 0.5 * o.k * Math.pow(1 - d / o.dist, 1.7); }   // (the lamps' light: for stealth)
    if (glowLight?.intensity) { const d = glowLight.position.distanceTo(pt); if (d < glowLight.distance) sum += glowLight.intensity * 0.6 * Math.pow(1 - d / glowLight.distance, 1.7); }
    return sum;
  }
  let glowLight = null;
  const fwd = new THREE.Vector3();
  // street lamps (steady lights) burn from dusk to dawn (src/gfx/sky.js says when); with them out and no torches on the
  // map, the pool of real lights leaves the shaders altogether (each one costs every lit pixel)
  let lampsOn = true; const torchesToo = list.some(o => !o.steady);
  const setLamps = on => { lampsOn = !!on; sortT = 0; const show = lampsOn || torchesToo; for (const L of lights) L.l.visible = show; };
  return {
    setLamps, get lampsOn() { return lampsOn; }, litLamps,                    // (litLamps: the street lamps burning now — src/gfx/weathering.js lights the surfaces with them)
    lightAt, setExtraLight(l) { glowLight = l; }, foliage: flora,   // (foliage.wind: for the weather to set)
    // fwdDir: which way you're looking (a Vector3), activeCp: the id of your checkpoint
    update(t, player, dt = 0.016, fwdDir = null, activeCp = null) {
      sortT -= dt;
      if (sortT <= 0 && player) {
        sortT = 0.12;
        if (fwdDir) fwd.set(fwdDir.x, 0, fwdDir.z).normalize(); else fwd.set(0, 0, 0);
        // how much a torch matters: its distance, stretched for ones off to the side and more for ones behind
        const score = o => {
          const dx = o.at.x - player.x, dy = (o.at.y - player.y) * 1.4, dz = o.at.z - player.z, dd = Math.hypot(dx, dy, dz);
          if (dd < 5) return dd;                                                     // right beside you: always lit
          const dot = fwd.lengthSq() ? (dx * fwd.x + dz * fwd.z) / Math.max(0.01, Math.hypot(dx, dz)) : 1;
          return dd * (dot > 0.3 ? 1 : 1 + (0.3 - dot) * 1.6);                         // ahead 1×, to the side ~1.5×, behind ~2.1×
        };
        for (const o of list) { o.s = o.steady && !lampsOn ? Infinity : score(o); o.want = false; }   // (street lamps only burn from dusk to dawn)
        const near = list.filter(o => !o.steady && o.s < reach).sort((a, b) => a.s - b.s);
        for (let i = 0; i < near.length && i < lights.length; i++) near[i].want = true;
        // (lamps already burning hold their place against newcomers — a 30% lead — so turning your head doesn't make the
        // ones at the edge of the 32 swap back and forth)
        for (const o of lampList) o.s2 = o.s * (o.k > 0.3 ? 0.7 : 1);
        const nearL = lampList.filter(o => o.s2 < reach * 2.4).sort((a, b) => a.s2 - b.s2);
        for (let i = 0; i < nearL.length && i < LAMPS; i++) nearL[i].want = true;
        active = list.filter(o => o.want || o.k > 0);                                   // only these need anything done each frame
      }
      for (const o of active) {
        // light up the wanted torches as lights come free; let the others gutter out and give theirs back
        if (o.steady) { o.k = o.want ? Math.min(1, o.k + dt * 2) : Math.max(0, o.k - dt * 2); }   // a lamp: lit by the surfaces' lamp light, no real light
        else {
          if (o.want && !o.light) { const L = lights.find(x => !x.owner); if (L) { L.owner = o; o.light = L; L.l.position.copy(o.at); L.l.distance = o.dist; L.l.color.set(o.t.color || color); } }
          if (o.want && o.light) o.k = Math.min(1, o.k + dt * 5);
          else { o.k = Math.max(0, o.k - dt * 4); if (o.k === 0 && o.light) { o.light.owner = null; o.light.l.intensity = 0; o.light = null; } } }
        const f = o.steady ? 0.96 + 0.04 * Math.sin(t * 1.3 + o.seed) : 0.88 + 0.12 * Math.sin(t * 9 + o.seed) * Math.sin(t * 5.3 + o.seed * 1.7);
        const kv = o.k;
        o.flame.visible = kv > 0.01;
        if (o.flame.visible) { o.flame.material.opacity = kv; o.flame.scale.set(o.sx * f * (0.4 + 0.6 * kv), o.sy * (0.92 + 0.16 * f) * (0.4 + 0.6 * kv), 1); }
        if (o.head) o.head.material.color.copy(COLD).lerp(o.hot, kv);
        if (o.light) o.light.l.intensity = o.base * f * o.k;
      }
      // the ones lighting the surfaces: wanted ones first (nearest first), then any still fading out — never more than 32,
      // so a burning lamp never loses its place to one going out
      litLamps.length = 0; for (const o of active) if (o.steady && o.k > 0.01) litLamps.push(o);
      if (litLamps.length > LAMPS) { litLamps.sort((a, b) => (b.want - a.want) || (a.s2 - b.s2)); litLamps.length = LAMPS; }
      // checkpoint glows: pulse; the active one bright, the rest dim
      let best = null, bd = 22;
      for (const gw of glows) {
        const on = gw.cp === activeCp, pulse = 0.75 + 0.25 * Math.sin(t * 2.2 + gw.x);
        gw.mat.color.setRGB(0.25 + (on ? 0.25 : 0), 0.45 + (on ? 0.3 : 0), on ? 1 : 0.7).multiplyScalar(on ? pulse * 1.1 : 0.55 + 0.1 * pulse);
        if (gw.kind === 'crystal') { gw.m.rotation.y = t * 0.8; gw.m.position.y = gw.y + Math.sin(t * 1.5) * 0.06; }
        const dd = player ? Math.hypot(gw.x - player.x, gw.y - player.y, gw.z - player.z) : 99;
        if (dd < bd) { bd = dd; best = gw; }
      }
      if (best) { cpLight.position.set(best.x + best.nx * 0.5, best.y, best.z + best.nz * 0.5); cpLight.intensity = (best.cp === activeCp ? 1.2 : 0.6) * (1 - bd / 22); } else cpLight.intensity = 0;
      // water flows
      for (const C of crystals) {
        const hue = (0.58 + 0.08 * Math.sin(t * 0.13)) % 1, pulse = 0.85 + 0.15 * Math.sin(t * 1.1);
        C.mat.emissive.setHSL(hue, 0.8, 0.45); C.halo.material.color.setHSL(hue, 0.7, 0.7); C.light.color.setHSL(hue, 0.6, 0.7); C.light.intensity = 2.4 * pulse;
        C.body.rotation.y = t * 0.12; C.halo.material.opacity = 0.22 + 0.08 * pulse;
        for (const s2 of C.shards) { const a = s2.a + t * 0.35; s2.m.position.set(Math.cos(a) * s2.r, s2.y + Math.sin(t * 0.8 + s2.a) * 0.3, Math.sin(a) * s2.r); s2.m.rotation.y = t; }
      }
      for (const P of pads) { P.m.rotation.z = t * 0.2; P.m.material.opacity = 0.6 + 0.25 * Math.sin(t * 1.7 + P.pd.x); if (P.beam) P.beam.material.opacity = 0.06 + 0.03 * Math.sin(t * 2.3 + P.pd.z); }
      rivers.update(t); flora.update(t, player);
      ripple.offset.x = (t * 0.03) % 1; ripple.offset.y = (t * 0.02) % 1; fall.offset.x = (-t * 1.2) % 1;
      for (const fm of flowMats.values()) { if (fm.fl) { fm.tex.offset.x = (-fm.fl.x * t / 4) % 1; fm.tex.offset.y = (fm.fl.z * t / 4) % 1; } else { fm.tex.offset.x = (t * 0.03) % 1; fm.tex.offset.y = (t * 0.02) % 1; } }
    },
  };
}
