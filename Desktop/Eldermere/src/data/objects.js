import { BUILTIN } from './creatures.js';
// src/data/objects.js — things placed inside a map in the creator's Object mode: enemies, traps, loot,
// furniture, lights, markers. The map stays the layout (src/data/dungeon.js); objects sit on top of it.
//
// Each placed object: { id, type, x, z, layer, rot, ...properties }
//   x, z    metres from the map's top-left corner (cell x·10 … x·10+10)
//   rot     degrees, 0 = facing north (map up), clockwise
//   mount   'floor' or 'wall' (wall: x, z sit on the wall's face, rot faces out of it, h is the height up it)
// and by kind:
//   enemies     kind (the type key), count, stats (only what differs from the type), behaviour
//               ('stand' | 'wander' | 'patrol'), patrol: [{ x, z }], patrolMode ('loop' | 'back')
//   containers  contents: [{ item, qty }], gold, locked, lock (1–100)
//   traps       damage, trigger ('timer' | 'linked' | 'near'), interval (s), radius (m, for 'near'),
//               triggers: [ids of the trigger objects that set it off] (for 'linked')
//   triggers    w, d (a box trigger's size), h (how high it reaches), who ('player' | 'enemies' | 'anyone'),
//               rearm ('once' | 'always'), cooldown (s): it fires when someone steps in or on it, then again
//               every `cooldown` seconds while they stay; 0 = on the whole time someone's in or on it (and off
//               the moment they leave). A trip wire's w is its span. (Older saves: delay = cooldown.)
//   lights      lit
//   sounds      track, kind ('ambience' | 'music' | 'effect'), volume (0–100), fade (m over the area's edge),
//               loop, priority (music: the higher area wins where they overlap), radius (sound sources),
//               gap (s between plays of a sound that doesn't loop)
//   particles   density (0–100), color, h (how high: fog depth, how far smoke rises), w, d (areas),
//               radius (how far a point's particles spread)
//
// Each type: name, category, footprint (w across × d deep, metres, facing north), a glyph, and how it's placed:
//   snap    the grid it snaps to in metres (0 = free placement); hold Ctrl while placing to flip it
//   turn    rotation step in degrees (R / Shift+R)
//   mount   'floor', 'wall' (goes on a wall face) or 'both' (on a wall when you place it within 0.8 m of
//           one, otherwise on the floor; switchable in its properties)
//   wallH   default height up the wall, metres
// Furniture and street clutter are built into the map as scenery (src/game/props.js); traps and triggers work
// in src/game/dungeonObjects.js, enemies in src/game/enemies.js.

export const OBJECT_CATS = {
  enemy: { name: 'Enemies', color: '#c0392b' },
  trap: { name: 'Traps', color: '#e07a1a' },
  trigger: { name: 'Triggers', color: '#8e44ad', tab: 'trap' },     // shown on the Traps tab
  loot: { name: 'Loot', color: '#c9a640' },
  furniture: { name: 'Furniture', color: '#7a5434' },
  street: { name: 'Street', color: '#5a7a3a' },
  light: { name: 'Lights', color: '#f0a020' },
  marker: { name: 'Markers', color: '#2a6fd0' },
  sound: { name: 'Sounds', color: '#16a085' },
  particle: { name: 'Particles', color: '#7f8c8d' },
};
const E = { cat: 'enemy', snap: 0.5, turn: 90, w: 0.9, d: 0.9, shape: 'round', mount: 'floor' };
const T = { cat: 'trap', snap: 0.5, turn: 90, mount: 'floor' };
const R = { cat: 'trigger', snap: 0.5, turn: 90, mount: 'floor' };
const L = { cat: 'loot', snap: 0.5, turn: 90, mount: 'floor', container: true };
const F = { cat: 'furniture', snap: 0, turn: 15, mount: 'floor' };
const G = { cat: 'light', snap: 0.5, turn: 90 };
const ST = { cat: 'street', snap: 0.5, turn: 15, mount: 'floor' };
const S = { cat: 'sound', snap: 0.5, turn: 90, mount: 'floor' };
const P = { cat: 'particle', snap: 0.5, turn: 90, mount: 'floor' };
const M = { cat: 'marker', snap: 0.5, turn: 90, w: 0.8, d: 0.8, shape: 'diamond', mount: 'floor' };

export const OBJECTS = {
  // enemies: what stands (or walks) here when you arrive; the type sets the starting stats
  // enemies: by group (docs/MONSTERS.md: how many come at once); each group's variants are the monsters
  // (src/data/monsters.js) — a placed swarm or pack is `count` of them
  swarm: { ...E, name: 'Swarm', glyph: '∴', w: 1.5, d: 1.5 },
  pack: { ...E, name: 'Pack', glyph: '⚔', w: 1.6, d: 1.6 },
  // traps (some go on walls)
  spikes: { ...T, name: 'Spike trap', glyph: '▲', w: 2, d: 2, mount: 'both', wallH: 0.6, wallW: 2, dmg: 120 },
  darts: { ...T, name: 'Dart launcher', glyph: '→', w: 0.6, d: 0.3, mount: 'wall', wallH: 1.2, dmg: 60 },
  blade: { ...T, name: 'Swinging blade', glyph: '⟋', w: 3.5, d: 0.4, dmg: 250 },
  fireJet: { ...T, name: 'Fire jet', glyph: '♨', w: 1, d: 1, mount: 'both', wallH: 1.0, wallW: 0.5, dmg: 70 },
  collapse: { ...T, name: 'Collapsing floor', glyph: '▦', w: 2, d: 2, dmg: 0 },
  // triggers: set off the traps bound to them
  zone: { ...R, name: 'Box trigger (an area)', glyph: '⬚', w: 2, d: 2, resize: true, flat: true },
  pressurePlate: { ...R, name: 'Pressure plate', glyph: '▢', w: 1, d: 1 },
  tripwire: { ...R, name: 'Trip wire (wall to wall)', glyph: '', w: 4, d: 0.12, span: true },
  // loot (containers)
  chest: { ...L, name: 'Chest', glyph: '▣', w: 1.2, d: 0.7 },
  urn: { ...L, name: 'Urn / pot', glyph: '◍', w: 0.6, d: 0.6, shape: 'round' },
  item: { ...L, name: 'Item on the floor', glyph: '✧', w: 0.5, d: 0.5, shape: 'round' },
  // furniture (free placement; barrels and crates hold things)
  table: { ...F, name: 'Table', glyph: 'T', w: 2.0, d: 1.0 },
  chair: { ...F, name: 'Chair', glyph: 'h', w: 0.5, d: 0.5 },
  bed: { ...F, name: 'Bed', glyph: 'B', w: 1.0, d: 2.0 },
  bookshelf: { ...F, name: 'Bookshelf', glyph: '▤', w: 1.8, d: 0.4 },
  barrel: { ...F, name: 'Barrel', glyph: 'o', w: 0.7, d: 0.7, shape: 'round', container: true },
  crate: { ...F, name: 'Crate', glyph: '⊠', w: 0.9, d: 0.9, container: true },
  rug: { ...F, name: 'Rug', glyph: '', w: 2.5, d: 1.6, flat: true },
  candles: { ...F, name: 'Candle stand', glyph: 'i', w: 0.4, d: 0.4, shape: 'round' },
  rack: { ...F, name: 'Weapon rack', glyph: '‖', w: 1.6, d: 0.4 },
  // lights (the rooms' own torches and braziers are these too)
  torch: { ...G, name: 'Wall torch', glyph: '♦', w: 0.4, d: 0.4, mount: 'wall', wallH: 2.9, wallW: 0.7 },
  brazier: { ...G, name: 'Brazier', glyph: '☀', w: 1.0, d: 1.0, shape: 'round', mount: 'floor' },
  // sounds: big areas of ambience or music (fading in over their edge), and sounds from a point
  ambience: { ...S, name: 'Ambience area', glyph: '♒', w: 12, d: 12, resize: true, flat: true },
  music: { ...S, name: 'Music area', glyph: '♫', w: 20, d: 20, resize: true, flat: true },
  soundPoint: { ...S, name: 'Sound source', glyph: '♪', w: 0.6, d: 0.6, shape: 'round', radius: 8 },
  // particles: fog and dust over an area; smoke, embers, steam and drips from a point
  fog: { ...P, name: 'Fog (area)', glyph: '≋', w: 10, d: 10, resize: true, flat: true },
  dust: { ...P, name: 'Dust motes (area)', glyph: '⁘', w: 6, d: 6, resize: true, flat: true },
  smoke: { ...P, name: 'Smoke', glyph: '☁', w: 0.6, d: 0.6, shape: 'round', radius: 2 },
  embers: { ...P, name: 'Embers / sparks', glyph: '⁂', w: 0.6, d: 0.6, shape: 'round', radius: 1.5 },
  steam: { ...P, name: 'Steam vent', glyph: '♨', w: 0.6, d: 0.6, shape: 'round', radius: 1 },
  drips: { ...P, name: 'Dripping water', glyph: '⸽', w: 0.6, d: 0.6, shape: 'round', radius: 3 },
  // street clutter (town themes): built into the map as scenery (src/game/props.js), solid where you'd expect
  cart: { ...ST, name: 'Hand cart', glyph: '⊟', w: 1.6, d: 2.8 },
  stall: { ...ST, name: 'Market stall', glyph: '⌂', w: 3, d: 2 },
  sbench: { ...ST, name: 'Street bench', glyph: '⎵', w: 1.8, d: 0.6 },
  planterBox: { ...ST, name: 'Planter', glyph: '✿', w: 1.2, d: 1.2 },
  flowerpots: { ...ST, name: 'Flower pots', glyph: '❀', w: 0.9, d: 0.5 },
  signpost: { ...ST, name: 'Sign post', glyph: '⇆', w: 0.5, d: 0.5 },
  notice: { ...ST, name: 'Notice board', glyph: '▭', w: 1.6, d: 0.3 },
  well: { ...ST, name: 'Well', glyph: '◎', w: 2.2, d: 2.2 },
  trough: { ...ST, name: 'Water trough', glyph: '▬', w: 2, d: 0.8 },
  hay: { ...ST, name: 'Hay bales', glyph: '≡', w: 1.4, d: 1.0 },
  crates: { ...ST, name: 'Stacked crates', glyph: '⊞', w: 1.6, d: 1.2 },
  barrels: { ...ST, name: 'Barrel group', glyph: '⁘', w: 1.6, d: 1.6 },
  laundry: { ...ST, name: 'Laundry line', glyph: '⌇', w: 4, d: 0.3 },
  slamp: { ...ST, name: 'Crystal lamppost', glyph: '¥', w: 0.6, d: 0.6 },
  // markers
  start: { ...M, name: 'Player start', glyph: '★' },
  exit: { ...M, name: 'Exit / level change', glyph: '⇧' },
};
export const objectsIn = cat => Object.entries(OBJECTS).filter(([, o]) => o.cat === cat).map(([k]) => k);
// the tabs of the creator's palette (a category with `tab` shows on another's tab)
export const OBJECT_TABS = Object.keys(OBJECT_CATS).filter(c => !OBJECT_CATS[c].tab);
export const catsOnTab = tab => Object.keys(OBJECT_CATS).filter(c => c === tab || OBJECT_CATS[c].tab === tab);
// a trap's trigger setting from older saves ('always' / 'step')
export const trapTrigger = o => ({ always: 'timer', step: 'linked' }[o.trigger] || o.trigger || 'timer');

// Enemy types: the stats an enemy starts with. A placed enemy keeps only the stats you change.
export const ENEMY_STATS = {
  level: { name: 'Level', min: 1, max: 100, step: 1 },
  hp: { name: 'Health', min: 1, max: 100000, step: 1 },
  damage: { name: 'Damage per hit', min: 0, max: 5000, step: 1 },
  armor: { name: 'Armour', min: 0, max: 1000, step: 1 },
  speed: { name: 'Move speed (m/s)', min: 0, max: 15, step: 0.1 },
  perception: { name: 'Perception ×', min: 0.1, max: 4, step: 0.05 },
  sight: { name: 'Vision (m)', min: 0, max: 100, step: 1 },
  hearing: { name: 'Hearing (m)', min: 0, max: 100, step: 1 },
  reach: { name: 'Attack range (m)', min: 0.5, max: 60, step: 0.5 },
};
// Archetype stats, on the game's scale: the player has 500+ health and lands about 5–15 a blow.
export const ENEMY_TYPES = {
  swarm: { level: 1, hp: 26, damage: 9, armor: 0, speed: 4.5, perception: 1.2, sight: 12, hearing: 20, reach: 0.6 },
  pack: { level: 4, hp: 70, damage: 14, armor: 0, speed: 5.6, perception: 1, sight: 14, hearing: 14, reach: 2 },
};
// Variants: what an archetype is. `mods` multiply the archetype's stats; `look` is for the simple models
// (src/game/enemies.js): body colour, trim colour, eye glow, size, and a shape ('man', 'beast', 'rat', 'bat',
// 'spider'); `weapon` what it carries; `shot` its missile (ranged and casters).
export const ENEMY_VARIANTS = {
  swarm: {
    nocturianBat: { name: 'Nocturian bats', monster: 'nocturianBat' },
  },
  pack: {
    umbrafiend: { name: 'Umbrafiends', monster: 'umbrafiend' },
  },
};
// creatures from the Creature workshop join their base monster's group (see src/data/monsters.js loadCustom)
try { const C = { ...BUILTIN, ...(JSON.parse(localStorage.getItem('eldermere.creatures')) || {}) }; const BASE_GROUP = { nocturianBat: 'swarm', umbrafiend: 'pack' };
  for (const [id, c] of Object.entries(C)) { const g = c.scratch ? (c.meta?.group === 'swarm' ? 'swarm' : 'pack') : BASE_GROUP[c.base]; if (g) { ENEMY_VARIANTS[g][id] = { name: c.name || id, monster: id }; for (const v of c.variants || []) ENEMY_VARIANTS[g][`${id}_${v.id}`] = { name: v.name, monster: `${id}_${v.id}` }; } } } catch { /* no storage */ }
// maps saved before the monsters: the old archetypes become the nearest group (their placement and patrol kept)
const LEGACY_ENEMY = { melee: 'pack', ranged: 'pack', caster: 'pack', brute: 'pack', boss: 'pack' };
export function migrateEnemies(list) {
  for (const o of list || []) {
    if (LEGACY_ENEMY[o.type]) { o.type = LEGACY_ENEMY[o.type]; o.variant = Object.keys(ENEMY_VARIANTS[o.type])[0]; o.stats = {}; }
    else if (ENEMY_VARIANTS[o.type] && !ENEMY_VARIANTS[o.type][o.variant]) { o.variant = Object.keys(ENEMY_VARIANTS[o.type])[0]; o.stats = {}; }
  }
  return list;
}
export const variantOf = o => { const v = ENEMY_VARIANTS[o.type] || {}; return v[o.variant] || Object.values(v)[0] || null; };
export const variantKeyOf = o => (ENEMY_VARIANTS[o.type]?.[o.variant] ? o.variant : Object.keys(ENEMY_VARIANTS[o.type] || {})[0]);
// an enemy's stats: the archetype's, times its variant's, then anything set on the placed enemy
export function baseStatsOf(o) {
  const base = { ...(ENEMY_TYPES[o.type] || {}) }, m = variantOf(o)?.mods || {};
  for (const [k, f] of Object.entries(m)) if (base[k] != null) base[k] = Math.round(base[k] * f * 10) / 10;
  return base;
}
export const statsOf = o => ({ ...baseStatsOf(o), ...(o.stats || {}) });

// what properties panel a type gets (null: none; the right side keeps the layers)
// suggested names for sounds (any text works: a file name or a sound's id, once the game has them)
export const SOUND_SUGGESTIONS = ['dungeon drone', 'cave drips', 'distant wind', 'fire crackle', 'chains rattling', 'rats skittering', 'water flowing', 'whispers', 'music: exploration', 'music: tension', 'music: combat', 'music: boss', 'music: safe room'];
export function panelOf(type) {
  const t = OBJECTS[type]; if (!t) return null;
  if (t.cat === 'enemy') return 'enemy';
  if (t.container) return 'container';
  if (t.cat === 'trap') return 'trap';
  if (t.cat === 'light') return 'light';
  if (t.cat === 'trigger') return 'trigger';
  if (t.cat === 'sound') return 'sound';
  if (t.cat === 'particle') return 'particle';
  return null;
}

// snap a value to the type's grid (or not); flip: Ctrl held
export function snapTo(type, v, flip = false) {
  const s = OBJECTS[type]?.snap || 0, step = flip ? (s ? 0 : 0.5) : s;
  return step ? Math.round(v / step) * step : Math.round(v * 100) / 100;
}
// footprint on the map: on a wall it's a thin strip along the face
export function sizeOf(o) {
  const t = OBJECTS[o.type] || { w: 1, d: 1 };
  return o.mount === 'wall' ? { w: t.wallW || t.w, d: 0.3 } : { w: o.w ?? t.w, d: o.d ?? t.d };
}
// the object's corners on the map (metres), for drawing; a wall object's strip sits just out from the wall
export function corners(o) {
  const { w, d } = sizeOf(o), a = (o.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), off = o.mount === 'wall' ? d / 2 : 0;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => { const x = u * w / 2, z = v * d / 2 - off; return [o.x + x * c - z * s, o.z + x * s + z * c]; });
}
export function hitObject(o, x, z) {
  const { w, d } = sizeOf(o), a = -(o.rot || 0) * Math.PI / 180, dx = x - o.x, dz = z - o.z;
  let lx = dx * Math.cos(a) - dz * Math.sin(a), lz = dx * Math.sin(a) + dz * Math.cos(a);
  if (o.mount === 'wall') lz += d / 2;
  return Math.abs(lx) <= Math.max(0.3, w / 2) && Math.abs(lz) <= Math.max(0.3, d / 2);
}
// facing (degrees) from a wall's outward normal, and back
export const rotOfNormal = (nx, nz) => ((Math.round(Math.atan2(nx, -nz) * 180 / Math.PI) % 360) + 360) % 360;
export const normalOfRot = rot => { const a = rot * Math.PI / 180; return [Math.round(Math.sin(a) * 1000) / 1000, Math.round(-Math.cos(a) * 1000) / 1000]; };
