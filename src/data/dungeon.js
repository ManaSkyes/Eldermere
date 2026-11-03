// src/data/dungeon.js — the dungeon map: a grid of 10 m × 10 m × 10 m cells, in layers 10 m apart.
//
// Each placed piece sits on one cell of one layer and is written as a code: part, theme, variant.
//   C J 1  →  Corridor, Jungle, variant 1      R D 2  →  Room, Dungeon, variant 2
//   J J 1  →  Junction, Jungle, variant 1      (part letter first, theme letter second)
// A piece has a height in layers (1–4: 10, 20, 30 or 40 m) and a rotation (0, 90, 180, 270°). A tall piece
// fills the same cell on the layers above it, so nothing else can be placed there.
//
// Colours show how much of a piece is left from this layer up: red 10 m, yellow 20 m, green 30 m,
// blue 40 m. A 40 m room is blue on its own layer, green one layer up, yellow two up, red three up.
//
// The editor (src/editor/dungeonEditor.js) draws and edits this; the game will build the 3D dungeon
// from the same data.

export const CELL = 10;                        // metres per cell, each way
export const MAX_HEIGHT = 4;                   // layers a single piece can span

// open: the sides a piece opens on, facing north (rotation turns them). 'room': walled all round, opening
// wherever it meets another room (they merge into one big space) or a passage that opens into it.
export const PARTS = {
  C: { name: 'Corridor', text: 'A straight passage: open ahead and behind, walls to the sides.', open: ['N', 'S'] },
  R: { name: 'Room', text: 'An open space. Rooms side by side join into one; passages that meet it make a doorway.', open: 'room' },
  J: { name: 'Junction', text: 'A T: open ahead and to both sides, a wall behind.', open: ['N', 'E', 'W'] },
  X: { name: 'Crossing', text: 'Open on all four sides.', open: ['N', 'E', 'S', 'W'] },
  T: { name: 'Turn', text: 'A corridor that bends: open ahead and to the right.', open: ['N', 'E'] },
  S: { name: 'Stairs', text: 'Climbs as many layers as it is tall: walk in from behind at the bottom; at the top it comes out into the cell ahead, on the layer above (red 10 m climbs one layer, yellow 20 m two). Keep the cell above it clear for headroom.', open: ['S'], stairs: true },
  E: { name: 'Entrance', text: 'Where the dungeon begins: open ahead only.', open: ['N'] },
  D: { name: 'Dead end', text: 'A passage that stops: open ahead only.', open: ['N'] },
  K: { name: 'Checkpoint', text: 'A straight passage with a resting place: touch it and you come back here when you fall.', open: ['N', 'S'], checkpoint: true },
  B: { name: 'Boss', text: 'The heart of the dungeon (a room).', open: 'room' },
  H: { name: 'Building', text: 'A house or shop (solid; town themes). Any size: set cells wide × deep in the creator. Its front door faces the way it is turned. Taller pieces get more floors.', open: [] },
  L: { name: 'Landmark', text: 'A big public building (town themes): guild hall, temple, market hall, clock tower. Set its size (cells wide × deep) in the creator; 3×3 suits most. Its front faces the way it is turned.', open: [] },
  Y: { name: 'Skyline', text: 'A tall plain block for the background (town themes): fills the view behind the streets. Few details, many floors. Any size.', open: [] },
  F: { name: 'Filler', text: 'Dead space between and behind the streets (town themes): gardens, yards, empty lots, sheds, plain stone, trees. Any size (cells wide × deep).', open: [] },
  W: { name: 'Canal', text: 'A channel of water running ahead and behind, walkways either side (town themes). Swim in it; canals end in a wall where nothing continues them.', open: ['N', 'S'] },
};
// Named variants by theme, then part (anything not listed builds as variant 1, "plain"). The 3D shapes for
// each are in src/game/dungeonBuild.js.
export const VARIANTS = {
  D: {
    R: { 1: 'Plain room', 2: 'Pillared hall', 3: 'Brazier room (with fallen stone)', 4: 'Crypt (sarcophagi)' },
    C: { 1: 'Plain corridor', 2: 'Ribbed vault', 3: 'Half-collapsed (rubble, a beam to duck)', 4: 'Pit (a gap to jump)' },
    J: { 1: 'Plain junction', 2: 'Fountain junction' },
    X: { 1: 'Plain crossing', 2: 'Crossing with a pillar', 3: 'Chandelier crossing' },
    T: { 1: 'Plain turn', 2: 'Turn with a shrine niche' },
    S: { 1: 'Plain stairs', 2: 'Grand stairs (wide, with balustrades)' },
    E: { 1: 'Plain entrance', 2: 'Gatehouse (portcullis)', 3: 'Brazier gate (banners)' },
    D: { 1: 'Plain dead end', 2: 'Statue alcove', 3: 'Treasure nook (a chest)' },
    K: { 1: 'Waystone (a glowing rune stone)', 2: 'Campfire (a fire ringed with stones, a bedroll)', 3: 'Spirit shrine (an altar with a crystal)' },
  },
  T: {
    C: { 1: 'Street', 2: 'Lamplit street', 3: 'Market street (stalls)' },
    J: { 1: 'Street junction', 2: 'Lamplit junction', 3: 'Market junction' },
    X: { 1: 'Crossroads', 2: 'Lamplit crossroads', 3: 'Market crossroads' },
    T: { 1: 'Street corner', 2: 'Lamplit corner', 3: 'Market corner' },
    D: { 1: 'Cul-de-sac (a big planter)', 2: 'Lamplit cul-de-sac' },
    E: { 1: 'Town arrival (you start here)' },
    K: { 1: 'Waystone street' },
    R: { 1: 'Plaza (benches, planters)', 2: 'The Great Crystal', 3: 'Warp circle (five pads)', 4: 'Garden (a tree, flower beds)', 5: 'Fountain (a basin you can wade in)' },
    S: { 1: 'Stone steps (balustrades, lamps)' },
    H: { 1: 'Timber-and-plaster house', 2: 'Shop (awning, sign)', 3: 'Brick townhouse (balcony)', 4: "Artificer's workshop (crystal pipes)", 5: 'Tavern (gallery, big sign)', 6: 'Manor (porch, dormers; 2×2 suits)', 7: 'Tower house (turret)', 8: 'Row houses (one per 5 m of width)' },
    L: { 1: 'Guild hall (portico, banners)', 2: 'Temple (colonnade, pyramid roof)', 3: 'Market hall (open arcade)', 4: 'Clock tower' },
    Y: { 1: 'Tall row', 2: 'Tower block', 3: 'Tenement (flat roof)' },
    F: { 1: 'Walled garden', 2: 'Storage yard (fence, crates, shed)', 3: 'Overgrown lot', 4: 'Back sheds (a jumble of outbuildings)', 5: 'Stone block (plain masonry, ivy)', 6: 'Tree grove' },
    W: { 1: 'Canal', 2: 'Canal with a bridge' },
  },
  O: {
    C: { 1: 'Street', 2: 'Lamplit street', 3: 'Market street (stalls)' },
    J: { 1: 'Street junction', 2: 'Lamplit junction', 3: 'Market junction' },
    X: { 1: 'Crossroads', 2: 'Lamplit crossroads', 3: 'Market crossroads' },
    T: { 1: 'Street corner', 2: 'Lamplit corner', 3: 'Market corner' },
    D: { 1: 'Cul-de-sac (a big planter)', 2: 'Lamplit cul-de-sac' },
    E: { 1: 'Town arrival (you start here)' },
    K: { 1: 'Waystone street' },
    R: { 1: 'Plaza (benches, planters)', 2: 'The Great Crystal', 3: 'Warp circle (five pads)', 4: 'Garden (a tree, flower beds)', 5: 'Fountain (a basin you can wade in)' },
    S: { 1: 'Stone steps (balustrades, lamps)' },
    H: { 1: 'Timber-and-plaster house', 2: 'Shop (awning, sign)', 3: 'Brick townhouse (balcony)', 4: "Artificer's workshop (crystal pipes)", 5: 'Tavern (gallery, big sign)', 6: 'Manor (porch, dormers; 2×2 suits)', 7: 'Tower house (turret)', 8: 'Row houses (one per 5 m of width)' },
    L: { 1: 'Guild hall (portico, banners)', 2: 'Temple (colonnade, pyramid roof)', 3: 'Market hall (open arcade)', 4: 'Clock tower' },
    Y: { 1: 'Tall row', 2: 'Tower block', 3: 'Tenement (flat roof)' },
    F: { 1: 'Walled garden', 2: 'Storage yard (fence, crates, shed)', 3: 'Overgrown lot', 4: 'Back sheds (a jumble of outbuildings)', 5: 'Stone block (plain masonry, ivy)', 6: 'Tree grove' },
    W: { 1: 'Canal', 2: 'Canal with a bridge' },
  },
};
export function variantName(p) { return VARIANTS[p.theme]?.[p.part]?.[p.variant] || (p.variant === 1 ? 'Plain' : `Variant ${p.variant} (not built yet: builds as 1)`); }
export const variantsOf = (theme, part) => Object.keys(VARIANTS[theme]?.[part] || { 1: 1 }).map(Number);
export const SIDES = ['N', 'E', 'S', 'W'];
const STEP = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }, BACK = { N: 'S', E: 'W', S: 'N', W: 'E' };
const isRoom = p => PARTS[p.part]?.open === 'room';
// the sides a (non-room) piece opens on, turned by its rotation
export function openSides(p) {
  const o = PARTS[p.part]?.open; if (!Array.isArray(o)) return [];
  const k = ((p.rot || 0) / 90) | 0;
  return o.map(sd => SIDES[(SIDES.indexOf(sd) + k) % 4]);
}
// What each side of the cell is, on this layer:
//   'wall'   solid
//   'open'   joined to the neighbour (both open to each other, or room to room)
//   'loose'  open, but nothing joins it there yet (a passage leading nowhere, or into a neighbour's wall)
// Stairs: a flight of height h based on layer L climbs from L to L + h. You walk in from its back at the
// bottom; at the top it comes out into the cell AHEAD of it, on layer L + h (that cell needs a floor that
// opens toward the stairs). The cell above the flight itself (layer L + h, same cell) is its headroom.
const faceOf = p => SIDES[(((p.rot || 0) / 90) | 0) % 4];
// the flight arriving into this cell on this layer: { piece, base, sx, sy, from: the side it comes in on }, or null
export function stairsArriving(d, x, y, l) {
  if (COV && COV.d === d) {                                                                 // (indexed: every flight's top, once)
    if (!COV.stairs) { COV.stairs = new Map(); for (const [k, p] of Object.entries(d.cells)) { if (!PARTS[p.part]?.stairs) continue; const [sx, sy, b] = k.split(',').map(Number), f = faceOf(p), tk = `${sx + STEP[f][0]},${sy + STEP[f][1]},${b + p.height}`; if (!COV.stairs.has(tk)) COV.stairs.set(tk, { piece: p, base: b, sx, sy, from: BACK[f] }); } }
    return COV.stairs.get(`${x},${y},${l}`) || null;
  }
  for (const f of SIDES) {
    const sx = x - STEP[f][0], sy = y - STEP[f][1];
    for (let b = l - 1; b >= l - MAX_HEIGHT; b--) {
      const p = d.cells[key(sx, sy, b)];
      if (p && PARTS[p.part]?.stairs && b + p.height === l && faceOf(p) === f) return { piece: p, base: b, sx, sy, from: BACK[f] };
    }
  }
  return null;
}
// the flight whose headroom this cell is (the cell right above its top), or null
export function stairsBelow(d, x, y, l) {
  if (COV && COV.d === d) { if (!COV.below) { COV.below = new Map(); for (const [k, p] of Object.entries(d.cells)) { if (!PARTS[p.part]?.stairs) continue; const [sx, sy, b] = k.split(',').map(Number), tk = `${sx},${sy},${b + p.height}`; if (!COV.below.has(tk)) COV.below.set(tk, { piece: p, base: b }); } } return COV.below.get(`${x},${y},${l}`) || null; }
  for (let b = l - 1; b >= l - MAX_HEIGHT; b--) { const p = d.cells[key(x, y, b)]; if (p && PARTS[p.part]?.stairs && b + p.height === l) return { piece: p, base: b }; }
  return null;
}
export function sidesAt(d, x, y, l) {
  const c = coverAt(d, x, y, l); if (!c) return null;
  const out = {}, me = c.piece;
  if (PARTS[me.part]?.stairs && c.base !== l) { for (const sd of SIDES) out[sd] = 'wall'; return out; }   // the stairwell, above the entry
  for (const sd of SIDES) {
    const n = coverAt(d, x + STEP[sd][0], y + STEP[sd][1], l);
    const arr = !n && stairsArriving(d, x, y, l);
    const nb = n?.piece || (arr && arr.from === sd ? { part: 'C', rot: 0, _stairs: true } : null);   // stairs coming up on this side count as a passage opening back
    const meOpen = isRoom(me) ? null : openSides(me).includes(sd);
    const nbOpen = !nb ? false : nb._stairs ? true : isRoom(nb) ? null : openSides(nb).includes(BACK[sd]);
    if (isRoom(me)) out[sd] = nb && (isRoom(nb) || nbOpen) ? 'open' : 'wall';            // rooms join rooms, and doorways where passages meet them
    else if (!meOpen) out[sd] = 'wall';
    else out[sd] = nb && (nbOpen || nbOpen === null) ? 'open' : 'loose';                 // a passage meets a passage that opens back, or a room
  }
  return out;
}
// Themes come in three groups (the creator's theme dropdown): the overworld (the hub: outer area, town,
// building interiors), interior dungeons (underground: dungeon, cave, ruins, ice, fire) and exterior dungeons
// (out under the sky: jungle, swamp, canyon). The Dungeon and Town themes have their own pieces (the Outer area
// uses the town's for now); the others build in the Dungeon style until theirs exist.
export const THEME_GROUPS = { overworld: 'Overworld', interior: 'Interior dungeons', exterior: 'Exterior dungeons' };
export const THEMES = {
  O: { name: 'Outer area', color: '#7aa85a', group: 'overworld' },
  T: { name: 'Town', color: '#c8a070', group: 'overworld' },
  H: { name: 'Interiors', color: '#b07a50', group: 'overworld' },
  D: { name: 'Dungeon', color: '#8a8f9c', group: 'interior' },
  C: { name: 'Cave', color: '#8a6f55', group: 'interior' },
  R: { name: 'Ruins', color: '#b0a27a', group: 'interior' },
  I: { name: 'Ice', color: '#9fd0e8', group: 'interior' },
  F: { name: 'Fire', color: '#d0683a', group: 'interior' },
  J: { name: 'Jungle', color: '#5f9a4a', group: 'exterior' },
  S: { name: 'Swamp', color: '#6a7a4a', group: 'exterior' },
  K: { name: 'Canyon', color: '#c07a4a', group: 'exterior' },
};
export const groupOfTheme = (d, k) => themesOf(d)[k]?.group || 'interior';
// how much is left above: 1..4 layers
export const HEIGHT_COLORS = { 1: '#e0574a', 2: '#e8c44a', 3: '#5fbf6a', 4: '#4f8fe0' };
export const HEIGHT_NAMES = { 1: '10 m', 2: '20 m', 3: '30 m', 4: '40 m' };
// Low pieces: one layer tall, but the ceiling comes down to 5 m (solid rock above) for tight spaces. Not stairs
// (a flight always climbs whole layers). Drawn pink in the editor.
export const LOW_COLOR = '#e98ab4', LOW_H = 5;
export const isLow = p => !!p.low && p.height === 1 && !PARTS[p.part]?.stairs;
export const heightName = p => isLow(p) ? '5 m (low)' : HEIGHT_NAMES[p.height];

export const codeOf = p => `${p.part}${p.theme}${p.variant}`;
export const ELEV_THEMES = 'TO';                                    // themes whose pieces can be raised in 0.25 m steps
export function parseCode(code) {
  const m = /^([A-Z])([A-Z])(\d+)$/.exec(String(code).trim().toUpperCase());
  return m ? { part: m[1], theme: m[2], variant: +m[3] } : null;
}
const key = (x, y, l) => `${x},${y},${l}`;

export function createDungeon(name = 'New dungeon', w = 24, h = 24) {
  return { version: 1, name, w, h, cells: {}, themes: {}, notes: '' };   // themes: custom themes added in the editor
}
export const themesOf = d => ({ ...THEMES, ...(d.themes || {}) });

// the piece whose base is exactly this cell, or null
export const pieceAt = (d, x, y, l) => d.cells[key(x, y, l)] || null;
// Buildings can cover more than one cell: fw cells along their front and fd deep (FOOT_PARTS only). A piece is
// stored at its anchor, the corner cell with the lowest x and y; footOf gives the cells it covers on the map
// (sx along x, sy along y), which swap when it's turned a quarter.
export const FOOT_PARTS = 'HLYF', MAX_FOOT = 5;
export const footOf = p => { const fw = p.fw || 1, fd = p.fd || 1; return ((p.rot || 0) / 90) % 2 ? [fd, fw] : [fw, fd]; };
// what fills this cell: the piece itself, a tall one from below, or a big one from a neighbouring anchor.
// { piece, base (its layer), left (layers from here up), x, y (asked), ax, ay (its anchor) }
// the cells a piece covers on the map (1 × 1 for anything but a big building)
export const pieceFoot = p => FOOT_PARTS.includes(p.part) ? footOf(p) : [1, 1];
// Inside withCoverCache(d, fn) (the creator's drawing: thousands of questions, the map unchanged meanwhile) coverAt
// answers from an index of each layer built once, instead of searching every time
let COV = null;
export function withCoverCache(d, fn) { const prev = COV; COV = { d, layers: new Map(), stairs: null }; try { return fn(); } finally { COV = prev; } }
function coverLayer(d, l) {
  const own = new Map(), big = new Map();
  for (const [k, p] of Object.entries(d.cells)) {
    const [x, y, b] = k.split(',').map(Number); if (!(b <= l && b + p.height > l)) continue;
    const ck = x * 65536 + y, cur = own.get(ck); if (!cur || cur.base < b) own.set(ck, { piece: p, base: b, left: b + p.height - l, x, y, ax: x, ay: y });
    if (p.fw > 1 || p.fd > 1) { const [sx, sy] = footOf(p); for (let dx = 0; dx < sx; dx++) for (let dy = 0; dy < sy; dy++) if (dx || dy) { const bk = (x + dx) * 65536 + (y + dy); if (!big.has(bk)) big.set(bk, { piece: p, base: b, left: b + p.height - l, x: x + dx, y: y + dy, ax: x, ay: y }); } }
  }
  for (const [bk, v] of big) if (!own.has(bk)) own.set(bk, v);
  return own;
}
export function coverAt(d, x, y, l) {
  if (COV && COV.d === d) { let m = COV.layers.get(l); if (!m) COV.layers.set(l, m = coverLayer(d, l)); return m.get(x * 65536 + y) || null; }
  for (let b = l; b > l - MAX_HEIGHT; b--) {
    const p = d.cells[key(x, y, b)];
    if (p && b + p.height > l) return { piece: p, base: b, left: b + p.height - l, x, y, ax: x, ay: y };
  }
  // a big piece anchored up to MAX_FOOT − 1 cells back (west and north) whose footprint reaches here
  for (let dx = 0; dx < MAX_FOOT; dx++) for (let dy = 0; dy < MAX_FOOT; dy++) {
    if (!dx && !dy) continue;
    for (let b = l; b > l - MAX_HEIGHT; b--) {
      const p = d.cells[key(x - dx, y - dy, b)]; if (!p || !(p.fw > 1 || p.fd > 1) || b + p.height <= l) continue;
      const [sx, sy] = footOf(p); if (dx < sx && dy < sy) return { piece: p, base: b, left: b + p.height - l, x, y, ax: x - dx, ay: y - dy };
    }
  }
  return null;
}
// can a piece of this height (and footprint, sx × sy cells) go here? (no other piece in the way on its layers;
// the piece already anchored at this very cell and layer doesn't count: painting over it replaces it)
export function canPlace(d, x, y, l, height, foot = [1, 1]) {
  const [sx, sy] = foot;
  if (x < 0 || y < 0 || x + sx > d.w || y + sy > d.h) return { ok: false, reason: 'Outside the map.' };
  for (let i = 0; i < sx; i++) for (let j = 0; j < sy; j++) for (let k = 0; k < height; k++) {
    const c = coverAt(d, x + i, y + j, l + k);
    if (c && !(c.base === l && c.ax === x && c.ay === y)) return { ok: false, reason: `${codeOf(c.piece)} (from layer ${c.base}) is in the way on layer ${l + k}.` };
  }
  return { ok: true };
}
export function place(d, x, y, l, piece) {
  const big = FOOT_PARTS.includes(piece.part) && ((piece.fw || 1) > 1 || (piece.fd || 1) > 1);
  const r = canPlace(d, x, y, l, piece.height, big ? footOf(piece) : [1, 1]); if (!r.ok) return r;
  d.cells[key(x, y, l)] = { part: piece.part, theme: piece.theme, variant: piece.variant, height: piece.height, rot: piece.rot || 0 };
  if (big) { d.cells[key(x, y, l)].fw = piece.fw || 1; d.cells[key(x, y, l)].fd = piece.fd || 1; }
  if (isLow(piece)) d.cells[key(x, y, l)].low = true;
  if (piece.ox || piece.oz) { d.cells[key(x, y, l)].ox = Math.round(piece.ox || 0); d.cells[key(x, y, l)].oz = Math.round(piece.oz || 0); }   // nudged off the grid, 0–9 m
  if (piece.elev > 0) d.cells[key(x, y, l)].elev = Math.min(9.75, Math.round(piece.elev * 4) / 4);   // raised within the layer (town pieces)
  return { ok: true };
}
// erase whatever fills this cell (a tall piece is erased from its base)
export function erase(d, x, y, l) {
  const c = coverAt(d, x, y, l); if (!c) return false;
  delete d.cells[key(c.ax, c.ay, c.base)]; return true;
}
export function eachPiece(d, fn) {
  for (const [k, p] of Object.entries(d.cells)) { const [x, y, l] = k.split(',').map(Number); fn(p, x, y, l); }
}
// the layers in use (lowest to highest, counting tall pieces' upper layers)
export function layerRange(d) {
  let lo = 0, hi = 0;
  eachPiece(d, (p, x, y, l) => { lo = Math.min(lo, l); hi = Math.max(hi, l + p.height - 1); });
  return { lo, hi };
}
export function countOn(d, l) { let n = 0; for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) if (coverAt(d, x, y, l)) n++; return n; }
// grow or shrink the map; pieces outside the new size are dropped
export function resize(d, w, h) {
  d.w = w; d.h = h;
  for (const k of Object.keys(d.cells)) { const [x, y] = k.split(',').map(Number); if (x >= w || y >= h) delete d.cells[k]; }
}
