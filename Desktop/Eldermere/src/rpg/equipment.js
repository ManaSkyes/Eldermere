// src/rpg/equipment.js — equipment slots, items and species fit rules. Pure game data: no rendering.
//
//   const gear = createEquipment(() => speciesTraits);    // traits: what the body has right now (see traitsOf)
//   gear.equip('breastplate')  -> { ok: true, replaced: ['jerkin'] }  or  { ok: false, reason: '...' }
//   gear.unequip('chest');  gear.equipped();  gear.on('change', fn);  gear.validate();
//
// Layers, inner to outer: bottom, top (clothes), then legs, chest, arms, hands, feet, head (armor).
// Base underclothes are always worn: a tank when no top is worn, shorts when no bottom is worn.
//
// Species rules (item.rules), checked against the body's traits:
//   horns:  'cutout' (the item is made with holes for them) | 'block' (can't be worn with horns)
//   ears:   'hide' (animal ears are tucked under) | 'block'
//   muzzle: 'block' (doesn't fit a beak or snout)
//   claws:  'hide' (claws hidden, as in soft gloves) | 'show' (they come through, as in gauntlets)
//   webbing:'hide'    hair: 'hide'
// When a transformation makes a worn item stop fitting, validate() takes it off and reports why.
//
// Item fields beyond the basics:
//   skill:    the skill using it trains (weapons, and gathering tools used as improvised weapons)
//   tool:     { skill } — the profession it is a tool for (see TOOL_TIERS for quality)
//   provides: a camp station it sets up (see STATIONS in src/data/professions.js)
//   focus:    a magic focus type (see FOCUS_TYPES in src/rpg/magic.js)
//   carried:  lives in the pack, never worn or held (kits, crafting tools)
//   standIn:  the 3D model shown is a stand-in until the item's own model exists

export const SLOTS = {
  bottom: { name: 'Bottoms', layer: 0 },
  top: { name: 'Top', layer: 2 },
  legs: { name: 'Leg armor', layer: 1 },
  chest: { name: 'Chest armor', layer: 3 },
  arms: { name: 'Arm armor', layer: 4 },
  hands: { name: 'Hands', layer: 5 },
  feet: { name: 'Feet', layer: 6 },
  head: { name: 'Head', layer: 7 },
  back: { name: 'Back', layer: 8 },
  mainHand: { name: 'Main hand', layer: 9 },
  offHand: { name: 'Off hand', layer: 10 },
  wrist: { name: 'Wrist', layer: 11 },
};

// Quality of a tool (or any crafted item). A tool's quality scales what the work yields and how good
// and how fast it is; it never changes how fast the skill itself is learned. Working without the right
// tool counts as improvised, when the work allows it at all.
export const TOOL_TIERS = {
  improvised: { name: 'Improvised', quality: 0.3 },
  crude:      { name: 'Crude',      quality: 0.6 },
  common:     { name: 'Common',     quality: 1.0 },
  fine:       { name: 'Fine',       quality: 1.25 },
  masterwork: { name: 'Masterwork', quality: 1.5 },
};

// garment: which garment (see clothing.js GARMENTS) shows it. slots: items that fill more than one slot.
export const ITEMS = {
  trousers: { name: 'Trousers', slot: 'bottom', garment: 'trousers', armor: 0, weight: 1 },
  tunic: { name: 'Tunic', slot: 'top', garment: 'tunic', armor: 0, weight: 1 },
  dress: { name: 'Long dress', slot: 'top', slots: ['top', 'bottom'], garment: 'dress', armor: 0, weight: 1.5 },
  robe: { name: "Mage's robe", slot: 'top', slots: ['top', 'bottom'], garment: 'robe', armor: 0, weight: 2 },
  vestments: { name: "Cleric's vestments", slot: 'top', slots: ['top', 'bottom'], garment: 'vestments', armor: 0, weight: 2 },
  scholarRobe: { name: "Scholar's robe", slot: 'top', slots: ['top', 'bottom'], garment: 'scholarRobe', armor: 0, weight: 1.8 },
  jerkin: { name: 'Leather jerkin', slot: 'chest', garment: 'jerkin', armor: 3, weight: 4, skill: 'lightArmor' },
  breastplate: { name: 'Steel breastplate', slot: 'chest', garment: 'breastplate', armor: 8, weight: 12, skill: 'heavyArmor' },
  pauldrons: { name: 'Pauldrons and bracers', slot: 'arms', garment: 'pauldrons', armor: 4, weight: 5, skill: 'heavyArmor' },
  gloves: { name: 'Leather gloves', slot: 'hands', garment: 'gloves', armor: 1, weight: 0.5, skill: 'lightArmor', rules: { claws: 'hide', webbing: 'hide' } },
  gauntlets: { name: 'Steel gauntlets', slot: 'hands', garment: 'gauntlets', armor: 3, weight: 2, skill: 'heavyArmor', rules: { claws: 'show', webbing: 'hide' } },
  greaves: { name: 'Steel greaves', slot: 'legs', garment: 'greaves', armor: 4, weight: 6, skill: 'heavyArmor' },
  shoes: { name: 'Shoes', slot: 'feet', shoes: true, armor: 0, weight: 0.5 },
  boots: { name: 'Leather boots', slot: 'feet', garment: 'boots', shoes: true, armor: 1, weight: 1.5, skill: 'lightArmor' },
  cape: { name: 'Short cape', slot: 'back', cape: 'cape', armor: 0, weight: 1 },
  longcape: { name: 'Long cloak', slot: 'back', cape: 'longcape', armor: 0, weight: 2 },
  hood: { name: 'Hood', slot: 'head', garment: 'hood', armor: 0, weight: 0.5, rules: { horns: 'cutout', ears: 'hide', hair: 'hide' } },
  helmet: { name: 'Open helm', slot: 'head', garment: 'helmet', armor: 4, weight: 3, skill: 'heavyArmor', rules: { horns: 'cutout', ears: 'hide', hair: 'hide' } },
  greathelm: { name: 'Great helm', slot: 'head', garment: 'greathelm', armor: 6, weight: 5, skill: 'heavyArmor', rules: { horns: 'block', ears: 'hide', muzzle: 'block', hair: 'hide' } },

  // ---- Weapons (models in weapons.js). damage, speed (attacks per second), reach (dm); two-handed ones fill both hands
  sword: { name: 'Arming sword', slot: 'mainHand', weapon: 'sword', skill: 'shortsword', damage: 8, speed: 1.2, reach: 9, weight: 3 },
  shortsword: { name: 'Shortsword', slot: 'mainHand', weapon: 'shortsword', skill: 'shortsword', damage: 6, speed: 1.5, reach: 7, weight: 2 },
  rapier: { name: 'Rapier', slot: 'mainHand', weapon: 'rapier', skill: 'rapier', damage: 6, speed: 1.6, reach: 10, weight: 1.5 },
  greatsword: { name: 'Greatsword', slot: 'mainHand', slots: ['mainHand', 'offHand'], weapon: 'greatsword', skill: 'greatsword', damage: 15, speed: 0.7, reach: 13, weight: 7 },
  axe: { name: 'Hand axe', slot: 'mainHand', weapon: 'axe', skill: 'axe', damage: 9, speed: 1.0, reach: 7, weight: 3 },
  greataxe: { name: 'Great axe', slot: 'mainHand', slots: ['mainHand', 'offHand'], weapon: 'greataxe', skill: 'greataxe', damage: 17, speed: 0.6, reach: 11, weight: 8 },
  mace: { name: 'Flanged mace', slot: 'mainHand', weapon: 'mace', skill: 'mace', damage: 9, speed: 0.9, reach: 7, weight: 4 },
  warhammer: { name: 'Warhammer', slot: 'mainHand', slots: ['mainHand', 'offHand'], weapon: 'warhammer', skill: 'warhammer', damage: 16, speed: 0.6, reach: 11, weight: 8 },
  club: { name: 'Club', slot: 'mainHand', weapon: 'club', skill: 'club', damage: 7, speed: 1.0, reach: 7, weight: 2.5 },
  dagger: { name: 'Dagger', slot: 'mainHand', weapon: 'dagger', skill: 'dagger', damage: 4, speed: 2.0, reach: 4, weight: 1 },
  spear: { name: 'Spear', slot: 'mainHand', slots: ['mainHand', 'offHand'], weapon: 'spear', skill: 'spear', damage: 10, speed: 0.9, reach: 18, weight: 4 },
  glaive: { name: 'Glaive', slot: 'mainHand', slots: ['mainHand', 'offHand'], weapon: 'glaive', skill: 'glaive', damage: 12, speed: 0.8, reach: 17, weight: 5 },
  staff: { name: 'Staff', slot: 'mainHand', slots: ['mainHand', 'offHand'], weapon: 'staff', skill: 'quarterstaff', focus: 'staff', damage: 5, speed: 1.0, reach: 14, weight: 3 },
  whip: { name: 'Whip', slot: 'mainHand', weapon: 'whip', skill: 'whip', damage: 3, speed: 1.3, reach: 25, weight: 1 },
  throwingKnives: { name: 'Throwing knives', slot: 'mainHand', weapon: 'throwdagger', skill: 'throwing', damage: 4, speed: 1.4, reach: 150, weight: 1.5 },
  bow: { name: 'Longbow', slot: 'offHand', slots: ['mainHand', 'offHand'], weapon: 'bow', skill: 'bow', damage: 9, speed: 0.8, reach: 300, weight: 2 },
  crossbow: { name: 'Crossbow', slot: 'offHand', slots: ['mainHand', 'offHand'], weapon: 'crossbow', skill: 'crossbow', damage: 14, speed: 0.35, reach: 300, weight: 5 },
  shield: { name: 'Round shield', slot: 'offHand', weapon: 'shield', skill: 'shield', armor: 5, block: 0.8, stability: 0.5, weight: 6 },   // block: share of a blocked blow's damage stopped · stability: share of its stamina cost absorbed
  offdagger: { name: 'Parrying dagger', slot: 'offHand', weapon: 'offdagger', skill: 'parry', damage: 3, speed: 2.0, reach: 4, block: 0.15, weight: 1 },

  // ---- Magic focuses: below mastery 101, a spell cast without one is weaker and riskier (tattoos are
  // a body detail, not an item; magic weapons get `focus` from enchanting)
  wand: { name: 'Wand', slot: 'mainHand', weapon: 'wand', focus: 'wand', weight: 0.3 },
  orb: { name: 'Orb', slot: 'offHand', weapon: 'orb', focus: 'orb', weight: 1 },
  spellbook: { name: 'Spellbook', slot: 'offHand', weapon: 'spellbook', focus: 'book', weight: 1.5 },
  bracelet: { name: 'Focus bracelet', slot: 'wrist', garment: 'bracelet', focus: 'bracelet', weight: 0.2 },

  // ---- Gathering tools: held while working, and usable as improvised weapons
  pickaxe: { name: 'Pickaxe', slot: 'mainHand', slots: ['mainHand', 'offHand'], weapon: 'pickaxe', tool: { skill: 'mining' }, skill: 'warhammer', damage: 8, speed: 0.7, reach: 9, weight: 4 },
  woodaxe: { name: "Woodcutter's axe", slot: 'mainHand', slots: ['mainHand', 'offHand'], weapon: 'woodaxe', tool: { skill: 'logging' }, skill: 'greataxe', damage: 10, speed: 0.7, reach: 10, weight: 4 },
  butcherKnife: { name: 'Butcher knife', slot: 'mainHand', weapon: 'skinknife', tool: { skill: 'butchering' }, skill: 'dagger', damage: 4, speed: 1.5, reach: 4, weight: 0.8 },
  skinningKnife: { name: 'Skinning knife', slot: 'mainHand', weapon: 'skinknife', tool: { skill: 'skinning' }, skill: 'dagger', damage: 3, speed: 1.8, reach: 4, weight: 0.5 },
  sickle: { name: 'Sickle', slot: 'mainHand', weapon: 'sickle', tool: { skill: 'herbalism' }, skill: 'dagger', damage: 4, speed: 1.5, reach: 5, weight: 0.8 },
  fishingRod: { name: 'Fishing rod', slot: 'mainHand', slots: ['mainHand', 'offHand'], weapon: 'fishingRod', tool: { skill: 'fishing' }, weight: 1.5 },
  crystalChisel: { name: 'Crystal chisel and mallet', slot: 'mainHand', weapon: 'chisel', tool: { skill: 'crystalHarvesting' }, skill: 'club', damage: 3, speed: 1.2, reach: 4, weight: 1.5 },

  // ---- Crafting tools: carried, used at a station
  smithTools: { name: "Smith's hammer and tongs", carried: true, tool: { skill: 'smithing' }, weight: 4 },
  leatherTools: { name: "Leatherworker's awl and knives", carried: true, tool: { skill: 'leatherworking' }, weight: 1 },
  sewingKit: { name: 'Needles and shears', carried: true, tool: { skill: 'tailoring' }, weight: 0.5 },
  woodTools: { name: 'Saw, plane and chisels', carried: true, tool: { skill: 'woodworking' }, weight: 3 },
  cookware: { name: 'Pot and pan', carried: true, tool: { skill: 'cooking' }, weight: 2.5 },
  lapidaryTools: { name: "Lapidary's loupe and files", carried: true, tool: { skill: 'gemcutting' }, weight: 0.5 },
  quill: { name: 'Quills and ink', carried: true, tool: { skill: 'scribing' }, weight: 0.3 },
  enchantingTools: { name: 'Etching stylus and chalk', carried: true, tool: { skill: 'enchanting' }, weight: 0.5 },

  // ---- Camp kits: carried; each sets up a camp station for simple work away from town
  campKit: { name: 'Camp kit', carried: true, provides: 'campfire', weight: 4 },
  repairKit: { name: 'Repair kit', carried: true, provides: 'repairKit', weight: 3 },
  alchemyKit: { name: 'Portable alchemy kit', carried: true, provides: 'alchemyKit', tool: { skill: 'alchemy' }, weight: 3 },
  writingKit: { name: 'Writing kit', carried: true, provides: 'writingKit', tool: { skill: 'scribing' }, weight: 1 },

  // ---- Other skill tools: carried
  lockpicks: { name: 'Lockpicks', carried: true, tool: { skill: 'lockpicking' }, weight: 0.1 },
  trapTools: { name: 'Trap tools', carried: true, tool: { skill: 'trapHandling' }, weight: 1 },
  healerKit: { name: "Healer's kit", carried: true, tool: { skill: 'firstAid' }, weight: 1.5 },
};
// back slot items with `cape` are simulated cloth (see tailCape.js), not garments
export const BASE = { top: 'tank', bottom: 'shorts' };     // garments worn when the slot is empty
export const OUTFIT_PRESETS = {
  'Tank and shorts': ['shoes'],
  'Tunic and trousers': ['trousers', 'tunic', 'shoes'],
  'Long dress': ['dress', 'shoes'],
  'Mage': ['robe', 'shoes', 'longcape', 'staff'],
  'Cleric': ['vestments', 'shoes', 'cape', 'staff'],
  'Ranger': ['trousers', 'tunic', 'jerkin', 'gloves', 'boots', 'hood', 'longcape', 'bow'],
  'Knight': ['trousers', 'tunic', 'breastplate', 'pauldrons', 'gauntlets', 'greaves', 'boots', 'helmet', 'cape', 'sword', 'shield'],
};

// ---------- Lookups for skills and work ----------
// Every tool for a skill, e.g. toolsFor('scribing') -> ['quill', 'writingKit'].
export const toolsFor = skill => Object.keys(ITEMS).filter(id => ITEMS[id].tool?.skill === skill);
// The best quality available for a skill from what's worn and carried. owned: [{ id, tier }] or ids.
// Returns { item, tier, quality }; without a tool, the improvised tier (item null).
export function bestTool(skill, owned) {
  let best = { item: null, tier: 'improvised', quality: TOOL_TIERS.improvised.quality };
  for (const o of owned) {
    const id = typeof o === 'string' ? o : o.id, tier = (typeof o === 'string' ? null : o.tier) || 'common';
    if (ITEMS[id]?.tool?.skill !== skill) continue;
    const q = TOOL_TIERS[tier]?.quality ?? 1;
    if (q > best.quality) best = { item: id, tier, quality: q };
  }
  return best;
}
// Camp stations the carried kits can set up.
export const stationsFrom = owned => [...new Set(owned.map(o => ITEMS[typeof o === 'string' ? o : o.id]?.provides).filter(Boolean))];
// A focus in hand or on the wrist.
export const focusOf = worn => Object.values(worn).map(id => ITEMS[id]?.focus).find(Boolean) || null;

const slotsOf = item => item.slots || [item.slot];
const TRAIT_NAMES = { horns: 'horns', ears: 'animal ears', muzzle: 'a beak or snout' };

export function createEquipment(traits = () => ({})) {
  const worn = {};                                          // slot -> item id
  const listeners = [];
  const emit = (e) => listeners.forEach(f => f(e));
  // why an item can't be worn by this body right now, or null
  function blocked(id) {
    const item = ITEMS[id], t = traits(), r = item.rules || {};
    if (item.carried) return `${item.name} goes in your pack.`;
    for (const k of ['horns', 'ears', 'muzzle']) if (r[k] === 'block' && t[k]) return `${item.name} doesn't fit ${TRAIT_NAMES[k]}.`;
    return null;
  }
  function equip(id) {
    const item = ITEMS[id];
    if (!item) return { ok: false, reason: `Unknown item: ${id}` };
    const why = blocked(id); if (why) return { ok: false, reason: why };
    const replaced = new Set();
    for (const s of slotsOf(item)) if (worn[s]) replaced.add(worn[s]);
    for (const r of replaced) for (const s of slotsOf(ITEMS[r])) delete worn[s];
    for (const s of slotsOf(item)) worn[s] = id;
    emit({ type: 'change', equipped: id, replaced: [...replaced] });
    return { ok: true, replaced: [...replaced] };
  }
  function unequip(slot) {
    const id = worn[slot]; if (!id) return null;
    for (const s of slotsOf(ITEMS[id])) delete worn[s];
    emit({ type: 'change', unequipped: id });
    return id;
  }
  // after the body changes: take off anything that no longer fits
  function validate() {
    const removed = [];
    for (const id of new Set(Object.values(worn))) { const why = blocked(id); if (why) { for (const s of slotsOf(ITEMS[id])) delete worn[s]; removed.push({ id, reason: why }); } }
    if (removed.length) emit({ type: 'change', removed });
    return removed;
  }
  const equipped = () => ({ ...worn });
  // garments to show, inner to outer, with base underclothes filling empty top/bottom
  function garments() {
    const out = [];
    const order = Object.keys(SLOTS).sort((a, b) => SLOTS[a].layer - SLOTS[b].layer);
    const seen = new Set();
    for (const s of order) {
      const id = worn[s];
      if (!id) { if (BASE[s]) out.push({ garment: BASE[s], slot: s }); continue; }
      if (seen.has(id)) continue; seen.add(id);
      if (ITEMS[id].garment) out.push({ garment: ITEMS[id].garment, slot: s, item: id });
    }
    return out;
  }
  // combined rules of everything worn (e.g. { hair: 'hide', claws: 'show' })
  function rules() {
    const r = {};
    for (const id of new Set(Object.values(worn))) for (const [k, v] of Object.entries(ITEMS[id].rules || {})) r[k] = r[k] === 'hide' ? 'hide' : v;
    return r;
  }
  function stats() {
    let armor = 0, weight = 0;
    for (const id of new Set(Object.values(worn))) { armor += ITEMS[id].armor || 0; weight += ITEMS[id].weight || 0; }
    const main = worn.mainHand && ITEMS[worn.mainHand], off = worn.offHand && ITEMS[worn.offHand];
    const weapon = main && main.damage ? { name: main.name, damage: main.damage, speed: main.speed, reach: main.reach, skill: main.skill } : null;
    const block = (off && off.block) || 0;
    return { armor, weight, weapon, block, focus: focusOf(worn) };
  }
  // ids that can't be worn (carried kits, blocked items) are skipped and reported
  function setAll(ids) { for (const s of Object.keys(worn)) delete worn[s]; const fails = []; for (const id of ids) { if (ITEMS[id]?.carried) continue; const r = equip(id); if (!r.ok) fails.push(r.reason); } emit({ type: 'change' }); return fails; }
  return {
    equip, unequip, validate, equipped, garments, rules, stats, setAll, blocked,
    wears: id => Object.values(worn).includes(id),
    hasShoes: () => Object.values(worn).some(id => ITEMS[id].shoes),
    on(type, fn) { if (type === 'change') listeners.push(fn); },
    toJSON: () => ({ ...worn }),
    load(o) { for (const s of Object.keys(worn)) delete worn[s]; Object.assign(worn, o || {}); emit({ type: 'change' }); },
  };
}

// What a resolved body has, for the rules (R: resolveBody() output)
export function traitsOf(R) {
  const a = R.attach || {};
  return {
    horns: (a.horns || 0) > 0.05,
    ears: (a.catEars || 0) + (a.boarEars || 0) + (a.finEars || 0) > 0.05,
    muzzle: (a.beak || 0) > 0.3 || (a.tusks || 0) > 0.3 || Object.entries(R.custom || {}).some(([k, v]) => k !== 'species-piscine' && k.startsWith('species-') && v > 0.4),
  };
}
