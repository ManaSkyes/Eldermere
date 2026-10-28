// src/data/professions.js — life skills: ranks, trade titles, and where each one can be practiced.
//
// A profession is a skill in src/rpg/stats.js (group 'profession'). This file adds what the
// number means to the player: a rank, a title in the trade's own words, and where the work happens.
// Design notes: docs/PROFESSIONS.md.

// ---------- Ranks ----------
// The same thresholds for every skill. `min` is the first whole value of the rank.
export const RANKS = [
  { id: 'unskilled',  name: 'Unskilled',  min: 0 },
  { id: 'apprentice', name: 'Apprentice', min: 201 },
  { id: 'journeyman', name: 'Journeyman', min: 501 },
  { id: 'expert',     name: 'Expert',     min: 1001 },
  { id: 'master',     name: 'Master',     min: 5001 },
  { id: 'guru',       name: 'Guru',       min: 10001 },
];
export const SKILL_MAX = 1000000;

// The rank for a skill value (values are floats; ranks use the whole number shown to the player).
export function rankOf(value) {
  const v = Math.floor(value);
  let r = RANKS[0];
  for (const x of RANKS) if (v >= x.min) r = x;
  return r;
}

// Progress through the current rank, 0..1 (Guru measures toward SKILL_MAX).
export function rankProgress(value) {
  const v = Math.floor(value), i = RANKS.indexOf(rankOf(v));
  const lo = RANKS[i].min, hi = i + 1 < RANKS.length ? RANKS[i + 1].min : SKILL_MAX;
  return Math.min(1, (v - lo) / (hi - lo));
}

// ---------- Growth curve ----------
// Skill grows by rank, not by raw number: each rank has a target play time for a focused player
// (average stats, specialization 2.0). Early ranks come fast, later ones slow, the way real skill
// does, compressed so a game respects the player's time.
// hours: focused play to clear the rank. USES_PER_HOUR: meaningful uses (a craft, a gather,
// a hit) in an hour of doing only that.
export const USES_PER_HOUR = 120;
export const RANK_HOURS = {
  unskilled: 0.25,     // 15 minutes to Apprentice
  apprentice: 2,
  journeyman: 6,
  expert: 25,
  master: 75,          // ~108 hours from nothing to Guru, doing one trade
};
// Guru has no ceiling in practice: gains keep shrinking in proportion to the value.
// 10,001 -> 20,000 is about another 150 focused hours.
const GURU_RATE = 0.42;
const FOCUSED = 2;     // the modifiers the hours above assume (specialization 2.0, everything else 1.0)

// Skill points per meaningful use, before modifiers, at a value.
export function baseRate(value) {
  const r = rankOf(value), i = RANKS.indexOf(r);
  if (r.id === 'guru') return GURU_RATE * (RANKS[i].min / Math.max(value, RANKS[i].min));
  const width = RANKS[i + 1].min - r.min;
  return width / (RANK_HOURS[r.id] * USES_PER_HOUR * FOCUSED);
}

// A task below your rank teaches less: each rank under yours divides the gain by about 3.
// A task above your rank teaches a little more (whether it succeeds is the recipe's business).
export function taskFactor(value, taskRankId) {
  if (!taskRankId) return 1;
  const d = RANKS.findIndex(x => x.id === taskRankId) - RANKS.indexOf(rankOf(value));
  return d < 0 ? Math.pow(0.35, -d) : 1 + 0.25 * d;
}

// ---------- Specialization ----------
// Focus pays: 2.0, less 0.1 for every OTHER profession at or above this one's rank
// (Unskilled never counts). Someone who only smiths, or whose smithing is their best trade,
// keeps the full 2.0. Floor 0.5, so even a jack of all trades still learns.
export const SPECIALIZATION = { max: 2, step: 0.1, min: 0.5 };
export function specialization(skills, skillId) {
  // an Unskilled trade is judged against Apprentice: picking up a new trade while holding many
  // others is slower, but a first trade is always full speed
  const target = Math.max(1, RANKS.indexOf(rankOf(skills[skillId] ?? 0)));
  let others = 0;
  for (const id of Object.keys(PROFESSIONS)) {
    if (id === skillId) continue;
    if (RANKS.indexOf(rankOf(skills[id] ?? 0)) >= target) others++;
  }
  return Math.max(SPECIALIZATION.min, SPECIALIZATION.max - SPECIALIZATION.step * others);
}

// ---------- Stations ----------
// field:    no station; anywhere the resource or material is
// camp:     a campsite the player sets up (campfire, bedroll, portable kit)
// workshop: a building in a town (or a rare dungeon room with the right fixtures)
export const STATIONS = {
  campfire:      { name: 'Campfire',          kind: 'camp' },
  alchemyKit:    { name: 'Portable alchemy kit', kind: 'camp' },
  writingKit:    { name: 'Writing kit',       kind: 'camp' },
  repairKit:     { name: 'Repair kit',        kind: 'camp' },
  forge:         { name: 'Smithy',            kind: 'workshop' },
  tannery:       { name: 'Tannery',           kind: 'workshop' },
  tailorShop:    { name: "Tailor's workshop", kind: 'workshop' },
  woodshop:      { name: 'Carpentry workshop', kind: 'workshop' },
  kitchen:       { name: 'Kitchen',           kind: 'workshop' },
  alchemyLab:    { name: 'Alchemy laboratory', kind: 'workshop' },
  lapidaryBench: { name: "Lapidary's bench",  kind: 'workshop' },
  scriptorium:   { name: 'Scriptorium',       kind: 'workshop' },
  enchantCircle: { name: 'Enchanting circle', kind: 'workshop' },
};

// ---------- Professions ----------
// titles: the Apprentice..Guru titles for this trade (Unskilled is always "Unskilled").
//         Real-world trade titles where they exist, otherwise "<Rank> <trade noun>".
// camp:   stations that allow simple work away from town; workshop: the full station.
// where:  gathering only — where the resource is found.
// perf:   the stats the work itself leans on (a smith's arm, a cook's hands); they set the
//         performance modifier alongside Intelligence, which sets how fast the trade is learned.
// needsTool: true — the work can't be done without its tool (see toolsFor in src/rpg/equipment.js).
//         false — bare hands work, at the improvised tier. A workshop supplies common-tier tools for its
//         trade; carrying a better tool of your own raises the quality.
// status: 'active' (in the game's design now), 'towns' (needs towns), 'placeholder' (tracked, hidden, no system yet)
const generic = noun => ['Apprentice', 'Journeyman', 'Expert', 'Master', 'Guru'].map(r => `${r} ${noun}`);

export const PROFESSIONS = {
  // ---- Gathering ----
  herbalism: { category: 'gathering', status: 'active', needsTool: false, perf: ['finesse', 'mind'],
    titles: ['Forager', 'Simpler', 'Herbalist', 'Master Herbalist', 'Grand Herbalist'],
    where: 'Plants in the wild and on overgrown dungeon floors' },
  mining: { category: 'gathering', status: 'active', needsTool: true, perf: ['strength', 'endurance'],
    titles: ['Putter', 'Hewer', 'Overman', 'Mine Captain', 'Grand Delver'],
    where: 'Ore veins in mines, caves and stone dungeon floors' },
  logging: { category: 'gathering', status: 'active', needsTool: true, perf: ['strength', 'endurance'],
    titles: ['Swamper', 'Bucker', 'Faller', 'Woods Boss', 'Grand Forester'],
    where: 'Trees outside town and on forest dungeon floors' },
  skinning: { category: 'gathering', status: 'active', needsTool: true, perf: ['finesse'],
    titles: ['Apprentice Skinner', 'Skinner', 'Fellmonger', 'Master Skinner', 'Grand Skinner'],
    where: 'Beasts and monsters after a kill' },
  butchering: { category: 'gathering', status: 'active', needsTool: true, perf: ['finesse'],
    titles: ['Apprentice Butcher', 'Butcher', 'Flesher', 'Master Butcher', 'Grand Butcher'],
    where: 'A skinned carcass: meat, horn and bone' },
  fishing: { category: 'gathering', status: 'active', needsTool: true, perf: ['finesse', 'luck'],
    titles: ['Deckhand', 'Fisher', 'Skipper', 'Master Fisher', 'Grand Angler'],
    where: 'Rivers, lakes, the coast and flooded dungeon floors' },
  crystalHarvesting: { category: 'gathering', status: 'active', needsTool: true, perf: ['finesse', 'spirit'],
    titles: generic('Crystal Harvester'),
    where: 'Crystal veins where mana runs thick, mostly in dungeons' },

  // ---- Crafting ----
  smithing: { category: 'crafting', status: 'active', needsTool: true, perf: ['strength', 'endurance'],
    titles: ['Striker', 'Journeyman Smith', 'Smith', 'Master Smith', 'Grand Smith'],
    camp: ['repairKit'], workshop: 'forge',
    campNote: 'Field repairs and sharpening only; anything new needs a smithy' },
  leatherworking: { category: 'crafting', status: 'active', needsTool: true, perf: ['dexterity', 'strength'],
    titles: ["Tanner's Apprentice", 'Journeyman Leatherworker', 'Currier', 'Master Leatherworker', 'Grand Leatherworker'],
    camp: ['repairKit'], workshop: 'tannery',
    campNote: 'Field repairs, simple straps and pouches' },
  tailoring: { category: 'crafting', status: 'active', needsTool: true, perf: ['finesse', 'dexterity'],
    titles: ['Seamster', 'Journeyman Tailor', 'Cutter', 'Master Tailor', 'Grand Couturier'],
    camp: ['repairKit'], workshop: 'tailorShop',
    campNote: 'Mending and simple cloth goods' },
  woodworking: { category: 'crafting', status: 'active', needsTool: true, perf: ['dexterity', 'strength'],
    titles: ['Sawyer', 'Journeyman Carpenter', 'Wright', 'Master Wright', 'Grand Wright'],
    camp: ['campfire'], workshop: 'woodshop',
    campNote: 'Arrows, stakes, torches and simple hafts' },
  cooking: { category: 'crafting', status: 'active', needsTool: false, perf: ['finesse', 'dexterity'],
    titles: ['Kitchen Hand', 'Cook', 'Sous-chef', 'Chef', 'Grand Chef'],
    camp: ['campfire'], workshop: 'kitchen',
    campNote: 'Roasts, stews and trail food; feasts and fine dishes need a kitchen' },
  alchemy: { category: 'crafting', status: 'active', needsTool: true, perf: ['mind', 'finesse'],
    titles: ['Apprentice Alchemist', 'Journeyman Alchemist', 'Adept', 'Master Alchemist', 'Grand Alchemist'],
    camp: ['alchemyKit', 'campfire'], workshop: 'alchemyLab',
    campNote: 'Simple potions, salves and tinctures' },
  gemcutting: { category: 'crafting', status: 'active', needsTool: true, perf: ['finesse', 'mind'],
    titles: ['Apprentice Lapidary', 'Journeyman Lapidary', 'Lapidary', 'Master Lapidary', 'Grand Lapidary'],
    workshop: 'lapidaryBench' },
  scribing: { category: 'crafting', status: 'active', needsTool: true, perf: ['finesse', 'mind'],
    titles: ['Copyist', 'Scribe', 'Scrivener', 'Master Scribe', 'Grand Scribe'],
    camp: ['writingKit'], workshop: 'scriptorium',
    campNote: 'Simple scrolls and copies' },
  enchanting: { category: 'crafting', status: 'active', needsTool: true, perf: ['mind', 'spirit'],
    titles: ['Apprentice Enchanter', 'Journeyman Enchanter', 'Enchanter', 'Master Enchanter', 'Grand Enchanter'],
    workshop: 'enchantCircle' },
  talismanCrafting: { category: 'crafting', status: 'active', perf: ['spirit', 'mind'], hidden: true,   // a rare discovery, never a starting class
    titles: generic('Talisman Scribe') },

  // ---- Trade ----
  trading: { category: 'trade', status: 'towns', perf: ['charisma', 'luck'],
    titles: ['Peddler', 'Chapman', 'Trader', 'Merchant', 'Merchant Prince'],
    where: 'Carrying goods between towns for profit' },

  // ---- Placeholders: tracked from day one so events and saves can use them, no system yet ----
  farming: { category: 'gathering', status: 'placeholder', perf: ['endurance', 'strength'], hidden: true,
    titles: ['Farmhand', 'Husbandman', 'Yeoman', 'Master Farmer', 'Grand Farmer'],
    where: 'Owned land (needs land ownership)' },
  taming: { category: 'gathering', status: 'placeholder', perf: ['spirit', 'charisma'], hidden: true,
    titles: ['Groom', 'Handler', 'Trainer', 'Master Trainer', 'Beastmaster'],
    where: 'Beasts and mounts (out of scope for now)' },
};

// The title shown for a profession at a value, e.g. titleFor('smithing', 620) -> 'Journeyman Smith'.
export function titleFor(skillId, value) {
  const r = rankOf(value), p = PROFESSIONS[skillId];
  if (r.id === 'unskilled' || !p) return r.name;
  return p.titles[RANKS.indexOf(r) - 1];
}

// Whether a station is enough for a profession: 'full', 'simple' (camp work only) or null.
export function stationLevel(skillId, stationId) {
  const p = PROFESSIONS[skillId];
  if (!p) return null;
  if (p.workshop === stationId) return 'full';
  if ((p.camp || []).includes(stationId)) return 'simple';
  return null;
}
