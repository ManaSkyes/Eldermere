// src/data/ground.js — the ground's paint layers, painted in the creator's Ground mode and used by the ground
// builder (src/game/ground.js) and the shader (texture 10):
//
//   d.ground = { w, h,                        the map in metres
//     mat:   string, 1 m squares              the surface: '.' auto (by slope and climate) or a GROUND_MATS key
//     moist: string, 2 m squares, '0'–'9'     moisture (5 = normal): wet is lush and muddy, dry is yellow and sandy
//     temp:  string, 2 m squares, '0'–'9'     temperature (5 = mild): cold brings frost, then snow on the flat
//     fol:   string, 2 m squares, '0'–'9'     foliage density (0 = none)      } foliage: data only for now (the game
//     folT:  string, 2 m squares              foliage type (FOLIAGE keys)     } doesn't draw it yet)
//     clut:  string, 2 m squares, '0'–'9'     clutter density: rocks, debris, boulders, by where it lands (src/game/clutter.js)
//     water: { 'i,j': 'a' | level }           water, per 2 m square (wres: 2). Each connected body of water sits at
//                                             one level: 'a' (auto) is the lowest ground anywhere under the body
//                                             (it carves the ground down to its bed, however long it is); a number
//                                             fixes the level (metres above layer 0's floor). See src/game/ground.js
//     flows: [{ id, points: [{ x, z }], speed }]   the way the water runs: a line drawn along a river; every
//                                             square of the bodies it crosses runs along it (m/s), fading out past
//                                             its ends, so a lake at the end of a river lies still
//   }
// Strings are row by row; a layer that's never been painted isn't stored (defaults apply).
export const GROUND_MATS = { '.': 'Auto (slope & climate)', g: 'Grass', h: 'Rough grass', d: 'Dirt', m: 'Mud', s: 'Sand', v: 'Gravel', r: 'Rock', w: 'Snow', c: 'Cobbles' };
export const MAT_INDEX = { '.': 0, g: 1, d: 2, r: 3, s: 4, v: 5, m: 6, w: 7, c: 8, h: 9 };
export const MAT_COLORS = { '.': '#9ab07a', g: '#4f8a3a', h: '#7a8a48', d: '#8a6a44', m: '#5a4630', s: '#d8c890', v: '#9a948a', r: '#7a7670', w: '#f2f4f8', c: '#9a8c7a' };
export const FOLIAGE = { g: 'Tall grass', f: 'Wildflowers', b: 'Bushes', r: 'Reeds', t: 'Trees', n: 'Pines' };
export const FOL_COLORS = { g: '#6aa040', f: '#e070a0', b: '#3a7a30', r: '#8aa060', t: '#2f6a2a', n: '#1f4a30' };
export const LAYER_RES = { mat: 1, moist: 2, temp: 2, fol: 2, folT: 2, clut: 2 }, WATER_RES = 2;
const DEFAULT = { mat: '.', moist: '5', temp: '5', fol: '0', folT: '.', clut: '0' };
const C = 10;
const dims = (d, res) => [Math.ceil(d.w * C / res), Math.ceil(d.h * C / res)];
// the paint layers, sized to the map (a resized map keeps what overlaps); null if there are none
export function groundOf(d, create = false) {
  if (!d.ground) { if (!create) return null; d.ground = { w: d.w * C, h: d.h * C }; }
  const g = d.ground;
  if (g.w !== d.w * C || g.h !== d.h * C) {
    for (const [k, res] of Object.entries(LAYER_RES)) {
      if (!g[k]) continue; const [ow, oh] = [Math.ceil(g.w / res), Math.ceil(g.h / res)], [nw, nh] = dims(d, res); let out = '';
      for (let j = 0; j < nh; j++) for (let i = 0; i < nw; i++) out += i < ow && j < oh ? g[k][j * ow + i] : DEFAULT[k];
      g[k] = out;
    }
    g.w = d.w * C; g.h = d.h * C;
  }
  if (g.water && g.wres !== WATER_RES) {                                                   // older maps: a level per 4 m square → four 2 m squares each
    const old = g.water; g.water = {};
    for (const [k, v] of Object.entries(old)) { const [i, j] = k.split(',').map(Number); for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++) g.water[`${i * 2 + a},${j * 2 + b}`] = v; }
  }
  if (g.water) g.wres = WATER_RES;
  return g;
}
// one layer's value at (x, z) metres (the default where unpainted)
export function groundAt(g, key, x, z) {
  if (!g || !g[key]) return DEFAULT[key];
  const res = LAYER_RES[key], w = Math.ceil(g.w / res), i = Math.floor(x / res), j = Math.floor(z / res);
  if (i < 0 || j < 0 || i >= w || j >= Math.ceil(g.h / res)) return DEFAULT[key];
  return g[key][j * w + i];
}
export const flowsOf = d => groundOf(d)?.flows || [];
export const waterAt = (g, x, z) => g?.water?.[`${Math.floor(x / WATER_RES)},${Math.floor(z / WATER_RES)}`] ?? null;
// paint a disc (radius r m) of one layer at (x, z); value null erases (back to the default). Returns true if changed
export function paintGround(d, key, x, z, r, value) {
  const g = groundOf(d, true);
  if (key === 'water') {
    let changed = false; g.water = g.water || {};
    for (let j = Math.floor((z - r) / WATER_RES); j <= Math.floor((z + r) / WATER_RES); j++) for (let i = Math.floor((x - r) / WATER_RES); i <= Math.floor((x + r) / WATER_RES); i++) {
      if (i < 0 || j < 0 || i * WATER_RES >= g.w || j * WATER_RES >= g.h || Math.hypot((i + 0.5) * WATER_RES - x, (j + 0.5) * WATER_RES - z) > r + WATER_RES * 0.35) continue;
      const k = `${i},${j}`; if (value == null) { if (k in g.water) { delete g.water[k]; changed = true; } } else if (g.water[k] !== value) { g.water[k] = value; changed = true; }
    }
    g.wres = WATER_RES; if (!Object.keys(g.water).length) { delete g.water; delete g.wres; }
    return changed;
  }
  const res = LAYER_RES[key], [w, h] = dims(d, res), v = value ?? DEFAULT[key];
  const a = (g[key] || DEFAULT[key].repeat(w * h)).split(''); let changed = false;
  for (let j = Math.max(0, Math.floor((z - r) / res)); j <= Math.min(h - 1, Math.floor((z + r) / res)); j++) for (let i = Math.max(0, Math.floor((x - r) / res)); i <= Math.min(w - 1, Math.floor((x + r) / res)); i++) {
    if (Math.hypot((i + 0.5) * res - x, (j + 0.5) * res - z) > r + res * 0.35) continue; const k = j * w + i; if (a[k] !== v) { a[k] = v; changed = true; }
  }
  if (!changed) return false;
  const s = a.join(''); if (s === DEFAULT[key].repeat(w * h)) delete g[key]; else g[key] = s;
  return true;
}
