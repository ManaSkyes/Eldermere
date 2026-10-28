// src/data/fill.js — dynamic filler: dead space painted with a round brush (the creator's Ground mode), on a 1 m
// grid, one mask per layer. Built in the game by src/game/ground.js (with the terrain, as one surface).
//
//   d.fill = { w, h, layers: { [layer]: string } }   w, h: the map in metres; each character is one square metre,
//                                                     row by row: '.' nothing · 'a' auto · 'g' greenery · 'y' yard
//                                                     · 'r' rubble / overgrown · 's' back sheds
// Auto takes after the nearest tiles (a street: sheds and yards; a garden or grove: greenery; an overgrown lot:
// rubble), blended with some randomness where different tiles are near.
export const FILL_KINDS = { a: 'Auto (match nearby)', g: 'Greenery', y: 'Yard', r: 'Rubble / overgrown', s: 'Back sheds' };
export const FILL_COLORS = { a: '#b8a0d8', g: '#5a9a40', y: '#b08a58', r: '#8a8a70', s: '#b4553a' };
const C = 10;
// the fill sized to the map (a resized map keeps what overlaps); null if there is none
export function fillOf(d, create = false) {
  const w = d.w * C, h = d.h * C;
  if (!d.fill) { if (!create) return null; d.fill = { w, h, layers: {} }; }
  const f = d.fill;
  if (f.w !== w || f.h !== h) {
    for (const [l, s] of Object.entries(f.layers)) { let out = ''; for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) out += x < f.w && z < f.h ? s[z * f.w + x] : '.'; f.layers[l] = out; }
    f.w = w; f.h = h;
  }
  return f;
}
export const fillAt = (f, l, x, z) => { const s = f?.layers[l]; if (!s || x < 0 || z < 0 || x >= f.w || z >= f.h) return '.'; return s[(z | 0) * f.w + (x | 0)]; };
// paint (kind) or erase ('.') a disc of radius r metres at (x, z) on layer l; returns true if anything changed
export function paintFill(d, l, x, z, r, kind) {
  const f = fillOf(d, true); let s = f.layers[l] || '.'.repeat(f.w * f.h); const a = s.split(''); let changed = false;
  for (let j = Math.max(0, Math.floor(z - r)); j <= Math.min(f.h - 1, Math.ceil(z + r)); j++) for (let i = Math.max(0, Math.floor(x - r)); i <= Math.min(f.w - 1, Math.ceil(x + r)); i++) {
    if (Math.hypot(i + 0.5 - x, j + 0.5 - z) > r) continue; const k = j * f.w + i; if (a[k] !== kind) { a[k] = kind; changed = true; }
  }
  if (!changed) return false;
  s = a.join(''); if (/^\.*$/.test(s)) delete f.layers[l]; else f.layers[l] = s;
  if (!Object.keys(f.layers).length) delete d.fill;
  return true;
}
