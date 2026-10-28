// src/data/materials.js — raw and processed materials.
//
// The world is Earth, a thousand years after two gods clashed and magic soaked into everything.
// Plants, animals and minerals are their real-world selves with those properties amplified many
// times over, plus new kinds that formed since. Most animals from before are gone or changed;
// what lives now descends from them (Nyluths are wolves and dogs returned to their origins, still
// clever, and shaped by magic for millennia).
//
// Rule of thumb: the harder something is to gather or work in real life, the harder it is here.
//
// Every material has:
//   id, name, category, kind, tier (0..10: how hard to gather and work; see TIERS), source
//   (the gathering skill), and properties for its kind (0..100 scales unless noted).
// Entries marked `proposed: true` are invented here as starting points; rename or replace freely.

// Tier ladder, matched to guild and monster ranks so materials line up with where they're found.
export const TIERS = [
  { tier: 0, rank: 'Black',  note: 'common, found around towns' },
  { tier: 1, rank: 'Black',  note: 'common in the wild' },
  { tier: 2, rank: 'Wood',   note: 'needs some skill or a short trip' },
  { tier: 3, rank: 'Bronze', note: 'uncommon; low dungeon floors' },
  { tier: 4, rank: 'Silver', note: 'rare; mid dungeon floors' },
  { tier: 5, rank: 'Gold',   note: 'very rare; deep floors and dangerous regions' },
  { tier: 6, rank: 'Crystal', note: 'exceptional; the deepest floors' },
  { tier: 7, rank: 'Disaster', note: 'from disaster-class monsters and burst dungeons' },
  { tier: 8, rank: 'Cataclysmic', note: 'legendary; almost never seen' },
  { tier: 9, rank: 'Apocalyptic', note: 'story only' },
];
// The rank of skill a tier asks for to work it well (lower ranks can try, with poor results).
export const TIER_RANK = ['unskilled', 'unskilled', 'apprentice', 'apprentice', 'journeyman', 'expert', 'expert', 'master', 'master', 'guru'];

const m = (id, name, category, kind, tier, source, props = {}, extra = {}) => ({ id, name, category, kind, tier, source, props, ...extra });

// ---------- Plants ----------
// props: potency (how strong its effect is), element (magic affinity, if any), plus kind-specific:
//   food: nourish, flavor;  fiber: strength, softness;  ink: color;  wood: hardness, flex, density
export const PLANTS = [
  // food
  m('wheat', 'Wheat', 'plant', 'food', 0, 'farming', { nourish: 40, flavor: 20 }),
  m('potato', 'Potato', 'plant', 'food', 0, 'farming', { nourish: 45, flavor: 15 }),
  m('onion', 'Onion', 'plant', 'food', 0, 'herbalism', { nourish: 10, flavor: 45 }),
  m('wildBerry', 'Wild berries', 'plant', 'food', 0, 'herbalism', { nourish: 15, flavor: 40 }),
  m('pepper', 'Ember pepper', 'plant', 'food', 2, 'herbalism', { nourish: 5, flavor: 80, potency: 30, element: 'fire' }, { proposed: true, note: 'a chili whose heat became real warmth' }),
  // alchemy
  m('yarrow', 'Yarrow', 'plant', 'herb', 0, 'herbalism', { potency: 25, use: 'stops bleeding, closes small wounds' }),
  m('chamomile', 'Chamomile', 'plant', 'herb', 0, 'herbalism', { potency: 20, use: 'calms, eases sleep and pain' }),
  m('mint', 'Mint', 'plant', 'herb', 0, 'herbalism', { potency: 15, use: 'clears the head; a base for tonics' }),
  m('valerian', 'Valerian', 'plant', 'herb', 1, 'herbalism', { potency: 35, use: 'deep sleep; sedatives' }),
  m('nightshade', 'Nightshade', 'plant', 'herb', 2, 'herbalism', { potency: 55, use: 'poison; in tiny doses, a painkiller', element: 'dark' }),
  m('moonpetal', 'Moonpetal', 'plant', 'herb', 3, 'herbalism', { potency: 60, use: 'restores mana; blooms only under moonlight', element: 'lunar' }, { proposed: true }),
  m('sunroot', 'Sunroot', 'plant', 'herb', 3, 'herbalism', { potency: 60, use: 'restores stamina; warms the body', element: 'light' }, { proposed: true }),
  m('bloodmoss', 'Bloodmoss', 'plant', 'herb', 4, 'herbalism', { potency: 75, use: 'rapid healing; grows where much blood was spilled', element: 'life' }, { proposed: true }),
  // fiber
  m('flax', 'Flax', 'plant', 'fiber', 0, 'herbalism', { strength: 45, softness: 40 }, { note: 'spun into linen' }),
  m('cotton', 'Cotton', 'plant', 'fiber', 1, 'herbalism', { strength: 35, softness: 70 }),
  m('hemp', 'Hemp', 'plant', 'fiber', 0, 'herbalism', { strength: 60, softness: 20 }, { note: 'rope, sacking, sailcloth' }),
  m('silkweed', 'Silkweed', 'plant', 'fiber', 3, 'herbalism', { strength: 55, softness: 85, potency: 20 }, { proposed: true, note: 'a milkweed whose floss now spins like silk' }),
  // ink and dye
  m('oakGall', 'Oak gall', 'plant', 'ink', 0, 'herbalism', { color: 'black', potency: 15 }, { note: 'iron-gall ink, the scribe\'s standard' }),
  m('woad', 'Woad', 'plant', 'ink', 1, 'herbalism', { color: 'blue', potency: 15 }),
  m('madder', 'Madder root', 'plant', 'ink', 1, 'herbalism', { color: 'red', potency: 15 }),
  // wood
  m('pine', 'Pine', 'plant', 'wood', 0, 'logging', { hardness: 25, flex: 40, density: 40 }),
  m('ash', 'Ash', 'plant', 'wood', 1, 'logging', { hardness: 50, flex: 70, density: 55 }, { note: 'the best wood for hafts and spears' }),
  m('oak', 'Oak', 'plant', 'wood', 1, 'logging', { hardness: 60, flex: 40, density: 65 }),
  m('yew', 'Yew', 'plant', 'wood', 2, 'logging', { hardness: 55, flex: 90, density: 60 }, { note: 'longbows' }),
  m('ironwood', 'Ironwood', 'plant', 'wood', 4, 'logging', { hardness: 85, flex: 35, density: 95 }),
  m('elderwood', 'Elderwood', 'plant', 'wood', 5, 'logging', { hardness: 65, flex: 75, density: 50, potency: 70, conduct: 70 }, { proposed: true, note: 'trees older than cities; carries mana well (staves, wands)' }),
];

// ---------- Animal materials ----------
// Creatures are listed by what they descend from. Materials per creature come from these parts:
//   hide/pelt (toughness, flex, warmth), bone (hardness), sinew (strength, flex), meat (nourish),
//   scales, feathers, fangs/claws, and essences from magical creatures.
// rank: guild monster rank, which sets the tier of everything taken from it.
export const CREATURES = [
  { id: 'rabbit', name: 'Field hare', from: 'rabbits', rank: 'Black', tier: 0, parts: ['pelt', 'meat'], props: { toughness: 10, flex: 80, warmth: 60 }, proposed: true },
  { id: 'deer', name: 'Antlered stag', from: 'deer', rank: 'Black', tier: 1, parts: ['hide', 'meat', 'bone', 'sinew', 'antler'], props: { toughness: 30, flex: 70, warmth: 40 }, proposed: true },
  { id: 'boar', name: 'Razorback', from: 'wild boar', rank: 'Wood', tier: 2, parts: ['hide', 'meat', 'bone', 'tusk'], props: { toughness: 55, flex: 40, warmth: 45 }, proposed: true },
  { id: 'nyluth', name: 'Nyluth', from: 'wolves and dogs', rank: 'Wood', tier: 2, parts: ['pelt', 'bone', 'sinew', 'fang', 'eye'], props: { toughness: 45, flex: 65, warmth: 70 }, note: 'pack hunters, chirping calls, light-sensitive pale green eyes; alphas near 2 m' },
  { id: 'alphaNyluth', name: 'Alpha nyluth', from: 'wolves and dogs', rank: 'Bronze', tier: 3, parts: ['pelt', 'bone', 'sinew', 'fang', 'eye'], props: { toughness: 60, flex: 65, warmth: 75 } },
  { id: 'nocturianBat', name: 'Nocturian bat', from: 'bats', rank: 'Wood', tier: 2, parts: ['membrane', 'fang', 'bone'], props: { toughness: 25, flex: 90, warmth: 10 }, note: 'winged night hunters around Selune' },
  { id: 'bear', name: 'Stonepelt bear', from: 'bears', rank: 'Silver', tier: 4, parts: ['pelt', 'meat', 'bone', 'claw', 'fat'], props: { toughness: 75, flex: 45, warmth: 85 }, proposed: true },
  { id: 'serpent', name: 'Glass serpent', from: 'snakes', rank: 'Bronze', tier: 3, parts: ['scales', 'fang', 'venom'], props: { toughness: 50, flex: 80, warmth: 5 }, proposed: true },
  { id: 'umbrafiend', name: 'Umbrafiend', from: 'none (born of shadow)', rank: 'Silver', tier: 4, parts: ['umbralEssence'], props: {}, note: 'incorporeal; leaves only essence. Rare in Eldermere now' },
  { id: 'yuribor', name: 'Yuribor', from: 'bison', rank: 'Wood', tier: 2, parts: ['hide', 'meat', 'horn'], props: { toughness: 70, flex: 40, warmth: 90 }, note: 'the Great Plains Walker: a beast of burden; its horns absorb magic' },
  { id: 'fish', name: 'River fish', from: 'fish', rank: 'Black', tier: 0, parts: ['meat', 'scales'], props: { toughness: 5, flex: 50 } },
];
// What each part becomes, and which skill takes it.
export const PARTS = {
  pelt: { name: 'pelt', kind: 'hide', source: 'skinning' }, hide: { name: 'hide', kind: 'hide', source: 'skinning' },
  membrane: { name: 'wing membrane', kind: 'hide', source: 'skinning' }, scales: { name: 'scales', kind: 'scales', source: 'skinning' },
  bone: { name: 'bone', kind: 'bone', source: 'skinning' }, antler: { name: 'antler', kind: 'bone', source: 'skinning' },
  tusk: { name: 'tusk', kind: 'bone', source: 'skinning' }, fang: { name: 'fangs', kind: 'trophy', source: 'skinning' },
  claw: { name: 'claws', kind: 'trophy', source: 'skinning' }, sinew: { name: 'sinew', kind: 'sinew', source: 'skinning' },
  meat: { name: 'meat', kind: 'food', source: 'butchering' }, horn: { name: 'horn', kind: 'bone', source: 'butchering' }, fat: { name: 'fat', kind: 'reagent', source: 'skinning' },
  eye: { name: 'eyes', kind: 'reagent', source: 'skinning' }, venom: { name: 'venom', kind: 'reagent', source: 'skinning' },
  umbralEssence: { name: 'umbral essence', kind: 'essence', source: 'crystalHarvesting' },
};
// Every creature part as a material id: 'nyluth.pelt', 'deer.sinew', ...
export const ANIMAL_MATERIALS = CREATURES.flatMap(cr => cr.parts.map(p =>
  m(`${cr.id}.${p}`, `${cr.name} ${PARTS[p].name}`, 'animal', PARTS[p].kind, cr.tier, PARTS[p].source, { ...cr.props }, { creature: cr.id })));

// ---------- Minerals: ores, metals, stone, dust ----------
// Metals props: hardness, toughness, edge (how keen an edge it holds), density (weight; 100 = iron),
// conduct (how well it carries mana), corrosion (resistance). workTier: forge skill needed.
export const ORES = [
  m('copperOre', 'Copper ore', 'mineral', 'ore', 0, 'mining', {}, { yields: 'copper' }),
  m('tinOre', 'Cassiterite (tin ore)', 'mineral', 'ore', 1, 'mining', {}, { yields: 'tin' }),
  m('zincOre', 'Sphalerite (zinc ore)', 'mineral', 'ore', 1, 'mining', {}, { yields: 'zinc' }),
  m('leadOre', 'Galena (lead ore)', 'mineral', 'ore', 1, 'mining', {}, { yields: 'lead' }),
  m('ironOre', 'Iron ore', 'mineral', 'ore', 1, 'mining', {}, { yields: 'iron' }),
  m('silverOre', 'Silver ore', 'mineral', 'ore', 3, 'mining', {}, { yields: 'silver' }),
  m('goldOre', 'Gold ore', 'mineral', 'ore', 4, 'mining', {}, { yields: 'gold' }),
  m('nickelOre', 'Nickel ore', 'mineral', 'ore', 3, 'mining', {}, { yields: 'nickel' }),
  m('bauxite', 'Bauxite (aluminium ore)', 'mineral', 'ore', 4, 'mining', {}, { yields: 'aluminium', note: 'refining it takes magic or great skill' }),
  m('platinumOre', 'Platinum ore', 'mineral', 'ore', 5, 'mining', {}, { yields: 'platinum' }),
  m('titaniumOre', 'Rutile (titanium ore)', 'mineral', 'ore', 6, 'mining', {}, { yields: 'titanium', note: 'nearly impossible to work without magic' }),
  m('tungstenOre', 'Wolframite (tungsten ore)', 'mineral', 'ore', 7, 'mining', {}, { yields: 'tungsten' }),
];
// Pure metals (smelted from ore). Alloys are made from these in src/rpg/alloys.js.
export const METALS = {
  copper:    { name: 'Copper',    tier: 0, props: { hardness: 15, toughness: 55, edge: 15, density: 113, conduct: 45, corrosion: 50 } },
  tin:       { name: 'Tin',       tier: 1, props: { hardness: 5,  toughness: 30, edge: 5,  density: 93,  conduct: 20, corrosion: 70 } },
  zinc:      { name: 'Zinc',      tier: 1, props: { hardness: 12, toughness: 20, edge: 8,  density: 91,  conduct: 20, corrosion: 55 } },
  lead:      { name: 'Lead',      tier: 1, props: { hardness: 3,  toughness: 40, edge: 2,  density: 144, conduct: 5,  corrosion: 75 } },
  iron:      { name: 'Iron',      tier: 1, props: { hardness: 35, toughness: 55, edge: 35, density: 100, conduct: 15, corrosion: 15 } },
  silver:    { name: 'Silver',    tier: 3, props: { hardness: 15, toughness: 45, edge: 15, density: 133, conduct: 75, corrosion: 60, warding: 60 } },
  gold:      { name: 'Gold',      tier: 4, props: { hardness: 8,  toughness: 50, edge: 8,  density: 245, conduct: 85, corrosion: 100 } },
  nickel:    { name: 'Nickel',    tier: 3, props: { hardness: 30, toughness: 60, edge: 30, density: 113, conduct: 20, corrosion: 75 } },
  aluminium: { name: 'Aluminium', tier: 4, props: { hardness: 15, toughness: 45, edge: 15, density: 34,  conduct: 40, corrosion: 70 } },
  platinum:  { name: 'Platinum',  tier: 5, props: { hardness: 25, toughness: 60, edge: 20, density: 273, conduct: 90, corrosion: 100 } },
  titanium:  { name: 'Titanium',  tier: 6, props: { hardness: 70, toughness: 80, edge: 60, density: 57,  conduct: 30, corrosion: 95 } },
  tungsten:  { name: 'Tungsten',  tier: 7, props: { hardness: 95, toughness: 35, edge: 70, density: 245, conduct: 10, corrosion: 80 } },
};
// Additives and other ground products.
export const MINERALS = [
  m('charcoal', 'Charcoal', 'mineral', 'fuel', 0, 'logging', { heat: 50, carbon: true }, { note: 'fuel, and the carbon that turns iron into steel' }),
  m('coal', 'Coal', 'mineral', 'fuel', 1, 'mining', { heat: 65, carbon: true }),
  m('limestone', 'Limestone', 'mineral', 'flux', 0, 'mining', {}, { note: 'flux for smelting; lime for tanning and mortar' }),
  m('clay', 'Clay', 'mineral', 'stone', 0, 'mining', {}),
  m('granite', 'Granite', 'mineral', 'stone', 1, 'mining', { hardness: 70 }),
  m('salt', 'Salt', 'mineral', 'reagent', 0, 'mining', {}, { note: 'curing meat and hides' }),
  m('sulfur', 'Sulfur', 'mineral', 'reagent', 2, 'mining', {}),
  m('quicksilver', 'Quicksilver', 'mineral', 'reagent', 3, 'mining', {}, { note: 'from cinnabar; alchemy and gilding' }),
  // magic dust: what crystal harvesting grinds out of mana-rich stone (and what mithril needs)
  m('crystalDust', 'Crystal dust', 'mineral', 'dust', 2, 'crystalHarvesting', { potency: 40, conduct: 80 }, { note: 'colors by element; mixed into talisman ink' }),
];

// ---------- Gems ----------
// Mundane gems: real stones whose lattice has trapped some magic over the centuries.
// Magic gems (mana stones): purity is mana content, 51..100%; below 51 it is just a mundane stone.
// Sizes: small, medium, large, colossal (like the one before the guild hall).
export const GEM_SIZES = {
  small:    { name: 'Small',    value: 1,    capacity: 1 },
  medium:   { name: 'Medium',   value: 4,    capacity: 5 },
  large:    { name: 'Large',    value: 20,   capacity: 30 },
  colossal: { name: 'Colossal', value: 2000, capacity: 5000, note: 'city-scale; the guild hall\'s stone' },
};
export const GEMS = [
  m('quartz', 'Quartz', 'gem', 'gem', 0, 'mining', { hardness: 70, element: 'light' }),
  m('amethyst', 'Amethyst', 'gem', 'gem', 1, 'mining', { hardness: 70, element: 'mind' }),
  m('garnet', 'Garnet', 'gem', 'gem', 1, 'mining', { hardness: 70, element: 'fire' }),
  m('jade', 'Jade', 'gem', 'gem', 2, 'mining', { hardness: 60, element: 'life' }),
  m('topaz', 'Topaz', 'gem', 'gem', 3, 'mining', { hardness: 80, element: 'lightning' }),
  m('aquamarine', 'Aquamarine', 'gem', 'gem', 3, 'mining', { hardness: 78, element: 'water' }),
  m('emerald', 'Emerald', 'gem', 'gem', 4, 'mining', { hardness: 78, element: 'wind' }),
  m('sapphire', 'Sapphire', 'gem', 'gem', 4, 'mining', { hardness: 90, element: 'water' }),
  m('ruby', 'Ruby', 'gem', 'gem', 5, 'mining', { hardness: 90, element: 'fire' }),
  m('moonstone', 'Moonstone', 'gem', 'gem', 3, 'mining', { hardness: 60, element: 'lunar' }),
  m('onyx', 'Onyx', 'gem', 'gem', 2, 'mining', { hardness: 70, element: 'dark' }),
  m('diamond', 'Diamond', 'gem', 'gem', 6, 'mining', { hardness: 100, element: 'holy' }),
  // magic gems: the type sets the element; purity and size set the strength
  m('manaStone', 'Mana stone', 'gem', 'magicGem', 3, 'crystalHarvesting', { element: 'neutral' }, { note: 'raw mana crystal; any element' }),
  m('lunarStone', 'Lunar crystal', 'gem', 'magicGem', 4, 'crystalHarvesting', { element: 'lunar' }, { proposed: true }),
  m('emberStone', 'Ember crystal', 'gem', 'magicGem', 4, 'crystalHarvesting', { element: 'fire' }, { proposed: true }),
  m('voidStone', 'Void crystal', 'gem', 'magicGem', 6, 'crystalHarvesting', { element: 'void' }, { proposed: true }),
];
export const MAGIC_PURITY_MIN = 51;

// ---------- Processed materials (made by crafting from the above) ----------
export const PROCESSED = [
  m('linen', 'Linen cloth', 'processed', 'cloth', 0, 'tailoring', { strength: 45, softness: 40 }, { from: ['flax'] }),
  m('cottonCloth', 'Cotton cloth', 'processed', 'cloth', 1, 'tailoring', { strength: 35, softness: 70 }, { from: ['cotton'] }),
  m('silkCloth', 'Silkweed cloth', 'processed', 'cloth', 3, 'tailoring', { strength: 55, softness: 85, potency: 20 }, { from: ['silkweed'] }),
  m('leather', 'Leather', 'processed', 'leather', 0, 'leatherworking', {}, { from: ['any hide'], note: 'keeps the props of the hide it was tanned from' }),
  m('ink', 'Ink', 'processed', 'ink', 0, 'scribing', {}, { from: ['any ink plant'] }),
  m('magicInk', 'Crystal ink', 'processed', 'ink', 2, 'scribing', { potency: 40, conduct: 80 }, { from: ['ink', 'crystalDust'], note: 'for talismans and spell scrolls' }),
  m('ingot', 'Ingot', 'processed', 'ingot', 0, 'smithing', {}, { from: ['ore, or metals for an alloy'], note: 'carries a metal or alloy composition' }),
  m('plank', 'Plank', 'processed', 'plank', 0, 'woodworking', {}, { from: ['any wood'] }),
];

// Everything in one lookup.
export const MATERIALS = Object.fromEntries([...PLANTS, ...ANIMAL_MATERIALS, ...ORES, ...MINERALS, ...GEMS, ...PROCESSED].map(x => [x.id, x]));
