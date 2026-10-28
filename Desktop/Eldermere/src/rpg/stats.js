// src/rpg/stats.js
// Core stat system: main stats, sub stats/skills, professions, derived stats,
// use-based growth with soft caps. 100 = an average untrained citizen.
// Profession ranks, titles and stations: src/data/professions.js.
import { PROFESSIONS, RANKS, rankOf, baseRate, taskFactor, specialization } from '../data/professions.js';

export const MAIN_STATS = [
  'strength', 'endurance', 'dexterity', 'finesse', 'intelligence',
  'mind', 'spirit', 'charisma', 'speed', 'luck',
];

// Main stats: a soft cap "knee"; at the knee gains are halved, at 2x the knee they're ~1/17.
// Each character's knee is their own natural potential (see below); this is the fallback.
// Skills follow the rank curve in src/data/professions.js instead (time per rank, not a knee).
export const SOFT_CAP = { main: 500 };
const SOFT_CAP_SHARPNESS = 4;

// Fraction of a skill gain that spills into its governing main stats.
const MAIN_STAT_SPILLOVER = 0.1;

// type: 'physical' (Int has no effect), 'mental' (full Int effect), 'hybrid' (half Int effect)
// gov:  governing main stats; they scale the skill and grow slowly when it's used
// start: baseline for an untrained citizen (defaults to 100)
// hidden: tracked and saved, but not shown to the player until discovered or until its system exists
const def = (group, type, gov, extra = {}) => ({ group, type, gov, ...extra });

export const SKILLS = {
  // ---- Weapons ----
  // Level like professions: rank curve, Intelligence at half, performance from `perf`, and
  // specialization that only starts to bite at Master (many real weapon masters exist).
  mace:         def('weapon', 'physical', ['strength'],  { perf: ['strength', 'endurance'] }),
  warhammer:    def('weapon', 'physical', ['strength'],  { perf: ['strength', 'endurance'] }),
  club:         def('weapon', 'physical', ['strength'],  { perf: ['strength', 'endurance'] }),
  greataxe:     def('weapon', 'physical', ['strength'],  { perf: ['strength', 'endurance'] }),
  crossbow:     def('weapon', 'physical', ['strength'],  { perf: ['dexterity', 'strength'] }),
  unarmed:      def('weapon', 'physical', ['strength', 'speed'], { perf: ['strength', 'speed'] }),
  greatsword:   def('weapon', 'physical', ['dexterity'], { perf: ['strength', 'dexterity'] }),
  longsword:    def('weapon', 'physical', ['dexterity'], { perf: ['dexterity', 'strength'] }),
  shortsword:   def('weapon', 'physical', ['dexterity'], { perf: ['dexterity', 'speed'] }),
  axe:          def('weapon', 'physical', ['dexterity'], { perf: ['dexterity', 'strength'] }),
  spear:        def('weapon', 'physical', ['dexterity'], { perf: ['dexterity', 'strength'] }),
  bow:          def('weapon', 'physical', ['dexterity'], { perf: ['dexterity', 'strength'] }),
  quarterstaff: def('weapon', 'physical', ['dexterity'], { perf: ['dexterity', 'speed'] }),
  dagger:       def('weapon', 'physical', ['finesse'],   { perf: ['finesse', 'speed'] }),
  rapier:       def('weapon', 'physical', ['finesse'],   { perf: ['finesse', 'speed'] }),
  glaive:       def('weapon', 'physical', ['finesse'],   { perf: ['finesse', 'strength'] }),
  throwing:     def('weapon', 'physical', ['finesse'],   { perf: ['finesse', 'dexterity'] }),
  whip:         def('weapon', 'physical', ['finesse'],   { perf: ['finesse', 'dexterity'] }),
  shield:       def('weapon', 'physical', ['endurance'], { perf: ['endurance', 'strength'] }),

  // ---- Combat (not weapons): level like weapons, no specialization ----
  parry:        def('combat', 'physical', ['dexterity', 'finesse'],   { perf: ['dexterity', 'finesse'] }),
  evasion:      def('combat', 'physical', ['speed', 'finesse'],       { perf: ['speed', 'finesse'] }),
  heavyArmor:   def('combat', 'physical', ['strength', 'endurance'],  { perf: ['strength', 'endurance'] }),  // trained by moving and taking hits in it
  lightArmor:   def('combat', 'physical', ['dexterity', 'speed'],     { perf: ['dexterity', 'speed'] }),

  // ---- Magic schools ----
  // Lunar is spirit magic: what people call faith draws on the caster's own spirit or the spirits
  // of a place. (The gods of this world are only kind of real.)
  // A school is familiarity with an element. It grows whenever one of its spells is cast, and makes
  // every spell of that school learn faster. Each spell has its own mastery (src/rpg/magic.js).
  // Rank curve, full Intelligence, performance from the governing stat, no specialization.
  lunar:       def('magic', 'mental', ['spirit']),
  holy:        def('magic', 'mental', ['spirit']),
  light:       def('magic', 'mental', ['spirit']),
  dark:        def('magic', 'mental', ['spirit']),
  life:        def('magic', 'mental', ['spirit']),
  void:        def('magic', 'mental', ['mind']),
  fire:        def('magic', 'mental', ['mind']),
  water:       def('magic', 'mental', ['mind']),
  earth:       def('magic', 'mental', ['mind']),
  wind:        def('magic', 'mental', ['mind']),
  lightning:   def('magic', 'mental', ['mind']),
  enhancement: def('magic', 'mental', ['mind']),
  spatial:     def('magic', 'mental', ['intelligence']),
  // Story magic: set strengths granted by events and the story, never trained by use.
  blood:       def('story', 'mental', ['spirit'], { hidden: true }),
  forgotten:   def('story', 'mental', ['intelligence'], { hidden: true }),

  // ---- General skills ----
  // Grow like main stats: a steady gain per use that falls off past a limit set by the character's
  // own governing stats (see generalLimit). Ranks still name them.
  attunement:   def('general', 'mental',   ['mind', 'spirit'], { start: 10 }), // magic training; scales MP; grows as mana is spent
  incantation:  def('general', 'mental',   ['mind', 'charisma']),   // there is power in words
  voiceless:    def('general', 'mental',   ['spirit', 'mind']),
  manaControl:  def('general', 'mental',   ['mind']),
  manaSense:    def('general', 'mental',   ['spirit']),
  lockpicking:  def('general', 'physical', ['finesse']),
  sneak:        def('general', 'physical', ['finesse', 'speed']),
  athletics:    def('general', 'physical', ['strength', 'endurance']),
  swimming:     def('general', 'physical', ['endurance', 'strength']),
  climbing:     def('general', 'physical', ['strength', 'dexterity']),
  calligraphy:  def('general', 'hybrid',   ['finesse', 'intelligence']),
  literacy:     def('general', 'mental',   ['intelligence']),
  runicScript:  def('general', 'mental',   ['intelligence']),
  awareness:    def('general', 'hybrid',   ['mind', 'speed']),
  trapHandling: def('general', 'hybrid',   ['finesse', 'intelligence']),
  survival:     def('general', 'hybrid',   ['endurance', 'intelligence']),
  firstAid:     def('general', 'hybrid',   ['finesse', 'intelligence']),
  monsterLore:  def('general', 'mental',   ['intelligence']),
  appraisal:    def('general', 'mental',   ['intelligence', 'luck']),
  bartering:    def('general', 'mental',   ['charisma']),
  persuasion:   def('general', 'mental',   ['charisma', 'intelligence']),
  intimidation: def('general', 'hybrid',   ['charisma', 'strength']),
  deception:    def('general', 'mental',   ['charisma', 'mind']),
  performance:  def('general', 'hybrid',   ['charisma', 'finesse']),   // music, dance, storytelling
  riding:       def('general', 'physical', ['dexterity', 'endurance'], { hidden: true }),   // placeholder until mounts

  // ---- Professions: gathering ----
  herbalism:         def('profession', 'hybrid',   ['intelligence']),
  mining:            def('profession', 'physical', ['strength', 'endurance']),
  logging:           def('profession', 'physical', ['strength', 'endurance']),
  skinning:          def('profession', 'physical', ['finesse']),
  butchering:        def('profession', 'physical', ['finesse']),
  fishing:           def('profession', 'physical', ['finesse', 'luck']),
  crystalHarvesting: def('profession', 'hybrid',   ['finesse', 'spirit']),

  // ---- Professions: crafting ----
  smithing:         def('profession', 'hybrid', ['strength', 'intelligence']),
  leatherworking:   def('profession', 'hybrid', ['dexterity', 'intelligence']),
  tailoring:        def('profession', 'hybrid', ['finesse', 'intelligence']),
  woodworking:      def('profession', 'hybrid', ['dexterity', 'intelligence']),
  cooking:          def('profession', 'hybrid', ['finesse', 'intelligence']),
  gemcutting:       def('profession', 'hybrid', ['finesse', 'intelligence']),
  alchemy:          def('profession', 'mental', ['intelligence', 'mind']),
  scribing:         def('profession', 'mental', ['intelligence', 'mind']),   // was scrollMaking
  enchanting:       def('profession', 'mental', ['intelligence', 'mind']),
  talismanCrafting: def('profession', 'mental', ['intelligence', 'mind'], { hidden: true }), // a rare discovery

  // ---- Professions: trade ----
  // Trade is Bartering (a general skill) plus reputation with each place (src/data/reputation.js).
  // The old trading profession is kept for saves and folded into Bartering on load.
  trading:          def('profession', 'mental', ['charisma', 'intelligence'], { hidden: true }),

  // ---- Professions: placeholders (tracked for events and saves; no system yet) ----
  farming:          def('profession', 'physical', ['endurance', 'intelligence'], { hidden: true }),
  taming:           def('profession', 'hybrid',   ['spirit', 'charisma'], { hidden: true }),
};

// Older saves used other ids for some skills.
const RENAMED = { scrollMaking: 'scribing' };

// ---------- Character creation ----------

// A character has three layers of main stats:
//   main       trained: creation, then growth from use. Limited by the body (`potential`).
//   effects    temporary or situational changes from professions, ailments, gear, transformations.
//   levels     points from combat levels, assigned freely by the player. The world's magic shapes
//              you in battle as you choose. These are a flat bonus that nothing else ever touches,
//              ignored by limits and effects alike.
// effectiveMain(c) is what everything else reads.

export function baseCharacter() {
  const main = Object.fromEntries(MAIN_STATS.map(s => [s, 100]));
  const skills = Object.fromEntries(
    Object.entries(SKILLS).map(([id, d]) => [id, d.start ?? 100])
  );
  return {
    main, skills,
    spells: {},                                    // spell id -> mastery 0..1000 (src/rpg/magic.js)
    natural: Object.fromEntries(MAIN_STATS.map(s => [s, 100])),                     // what this body gives
    potential: Object.fromEntries(MAIN_STATS.map(s => [s, naturalPotential(100)])),
    effects: [],                                   // [{ id, name, main: { strength: -20, ... } }]
    level: 1, xp: 0,
    levelPoints: Object.fromEntries(MAIN_STATS.map(s => [s, 0])),
    unspentPoints: 0,
    reputation: {},                                // place id -> -1000..1000 (src/data/reputation.js)
  };
}

// ---------- Natural limits ----------
// Everyone can train far past where they started, but the body sets where it gets hard.
// A stat's potential is a multiple of its natural value (100 plus what race and body give it,
// before any history or training). Past the potential, gains fall off steeply.
export const POTENTIAL = { multiple: 4, min: 150 };
export function naturalPotential(natural) { return Math.max(POTENTIAL.min, natural * POTENTIAL.multiple); }

// Setting the body. Progress belongs to the character, not the body: a trained stat is stored as
// how far it sits between the body's natural value and its potential, so changing bodies rescales it,
// and changing back restores it exactly. A Draconian at 500 Strength who becomes a small elf drops
// to the elf's equivalent, and returns to 500 as a Draconian (or higher, if they trained meanwhile).
// natural: { strength: 100 + body/race modifier, ... }. Call at creation and on every transformation.
export function setBody(c, natural) {
  for (const s of MAIN_STATS) {
    const oldNat = c.natural?.[s] ?? 100, oldSpan = (c.potential?.[s] ?? naturalPotential(oldNat)) - oldNat;
    const progress = (c.main[s] - oldNat) / oldSpan;                 // 0 at natural, 1 at potential
    const nat = natural[s] ?? 100, pot = naturalPotential(nat);
    c.natural[s] = nat; c.potential[s] = pot;
    c.main[s] = nat + progress * (pot - nat);
  }
  return c;
}

// Brings a saved character up to date: renamed skills move to their new id, skills added since the
// save start at their baseline, and characters from before limits and levels get them.
export function upgradeCharacter(c) {
  for (const [from, to] of Object.entries(RENAMED)) {
    if (from in c.skills) { if (!(to in c.skills)) c.skills[to] = c.skills[from]; delete c.skills[from]; }
  }
  for (const [id, d] of Object.entries(SKILLS)) if (!(id in c.skills)) c.skills[id] = d.start ?? 100;
  const fresh = baseCharacter();
  if (!c.potential || !c.natural) {                // best guess: what they have now is natural
    c.natural = { ...c.main }; c.potential = Object.fromEntries(MAIN_STATS.map(s => [s, naturalPotential(c.main[s])]));
  }
  for (const k of ['spells', 'effects', 'level', 'xp', 'levelPoints', 'unspentPoints', 'reputation']) if (c[k] === undefined) c[k] = fresh[k];
  // trade became Bartering: any trading skill already earned carries over
  if (!c.tradeFolded) { c.skills.bartering = Math.max(c.skills.bartering ?? 100, c.skills.trading ?? 100); c.tradeFolded = true; }
  return c;
}

// modifier: { main: { strength: +20, ... }, skills: { smithing: +80, ... } }
export function applyModifier(c, mod) {
  for (const [k, v] of Object.entries(mod.main ?? {})) c.main[k] = Math.max(1, c.main[k] + v);
  for (const [k, v] of Object.entries(mod.skills ?? {})) c.skills[k] = Math.max(0, c.skills[k] + v);
  return c;
}

// choices: modifier objects applied in order. The first is the body (race, species shares,
// build, age); it alone sets natural potential. Background, education and class are history.
export function createCharacter(choices) {
  const c = baseCharacter();
  const natural = Object.fromEntries(MAIN_STATS.map(s => [s, 100 + ((choices[0]?.main ?? {})[s] ?? 0)]));
  setBody(c, natural);                             // the body first (main still at 100 here: rescales to natural)
  applyModifier(c, { skills: choices[0]?.skills });  // the body's skills (lineage talents)
  for (const mod of choices.slice(1)) applyModifier(c, mod);
  return c;
}

// ---------- Effective stats ----------

export function effectiveMain(c) {
  const out = {};
  for (const s of MAIN_STATS) {
    let v = c.main[s];
    for (const e of c.effects ?? []) v += e.main?.[s] ?? 0;
    out[s] = Math.max(1, v) + (c.levelPoints?.[s] ?? 0);   // level points sit on top, untouched
  }
  return out;
}

// How close a trained stat is to the body's limit, for the sheet's color (limits stay hidden):
// 'ok' (white), 'near' (80%+, yellow), 'at' (95%+, red).
export function limitState(c, stat) {
  const f = c.main[stat] / (c.potential?.[stat] ?? SOFT_CAP.main);
  return f >= 0.95 ? 'at' : f >= 0.8 ? 'near' : 'ok';
}

// ---------- Combat levels ----------
// XP and the level curve belong to the combat system (not built yet). Each level grants points the
// player assigns freely; once assigned they never change.
// XP comes only from killing or subduing monsters, and from quests that grant combat XP outright.
// The level curve is a placeholder until combat exists.
export const POINTS_PER_LEVEL = 5;
export const XP_SOURCES = ['kill', 'subdue', 'quest'];
export const xpToNext = level => Math.round(100 * Math.pow(level, 1.5));   // placeholder
export function gainLevel(c) { c.level++; c.unspentPoints += POINTS_PER_LEVEL; return c; }
export function awardCombatXp(c, amount, source) {
  if (!XP_SOURCES.includes(source)) throw new Error(`Combat XP only comes from ${XP_SOURCES.join(', ')}`);
  c.xp += amount;
  let levels = 0;
  while (c.xp >= xpToNext(c.level)) { c.xp -= xpToNext(c.level); gainLevel(c); levels++; }
  return levels;
}
export function assignPoints(c, stat, n = 1) {
  n = Math.min(n, c.unspentPoints);
  if (n <= 0 || !MAIN_STATS.includes(stat)) return 0;
  c.levelPoints[stat] += n; c.unspentPoints -= n;
  return n;
}

// ---------- Derived stats ----------

export function derived(c) {
  const m = effectiveMain(c), s = c.skills;
  return {
    maxHp:         500 + 3 * m.endurance + 2 * m.strength,
    maxMp:         (0.7 * m.mind + 0.3 * m.spirit) * (s.attunement / 100),
    maxStamina:    m.endurance,
    staminaRegen:  (m.endurance + m.speed) / 40, // per second
    // per second; an average body refills HP in about 5 minutes and MP in about a minute.
    // Resting (sitting outside a camp) triples every regeneration rate: see REST in src/game/play.js.
    hpRegen:       (500 + 3 * m.endurance + 2 * m.strength) / 300 * Math.sqrt(m.endurance / 100),
    mpRegen:       (0.7 * m.mind + 0.3 * m.spirit) * (s.attunement / 100) / 60 * Math.sqrt(m.spirit / 100) * Math.sqrt((s.manaControl ?? 100) / 100),
    carryKg:       0.25 * m.strength + 0.05 * m.endurance,
    defense:       m.endurance / 10,
    magicTol:      m.mind / 10,
    lightDarkTol:  m.spirit / 10,
    mentalLoadCap: m.mind,
    actionSpeed:   Math.sqrt(m.speed / 100),
  };
}

// ---------- Use-based growth ----------

export function softCapFactor(value, knee) {
  return 1 / (1 + Math.pow(value / knee, SOFT_CAP_SHARPNESS));
}

// How fast Intelligence lets a skill be learned. Physical skills: none, except professions, where
// learning the trade always takes some wits (half effect). Mental: full; hybrid: half.
function intMultiplier(m, type, profession = false) {
  const full = Math.sqrt(m.intelligence / 100);
  if (type === 'physical') return profession ? 1 + (full - 1) * 0.5 : 1;
  return type === 'mental' ? full : 1 + (full - 1) * 0.5;
}

// How well the body can do the work: the skill's performance stats, averaged.
// A smith with weak arms learns slower; a cook with quick hands learns faster.
function perfStats(skillId) { return PROFESSIONS[skillId]?.perf ?? SKILLS[skillId].perf ?? null; }
function perfMultiplier(m, skillId) {
  const d = SKILLS[skillId], perf = perfStats(skillId) ?? (d.group === 'magic' ? d.gov : null);
  if (!perf) return 1;
  return Math.max(0.2, perf.reduce((t, s) => t + m[s], 0) / perf.length / 100);   // linear: half the strength, half the pace
}

// Practice: 'passive' is busy work that runs while idle (helping out at a local smithy, a training
// ground) and is the pace RANK_HOURS describes. 'active' is the player doing it for real: the
// minigame and a real product, or an actual fight.
export const PRACTICE = { passive: 1, active: 5 };

// Weapons: no specialization cost until Master. From Master up, the same rule as professions:
// 2.0 less 0.1 for every other weapon at or above this one's rank, floor 0.5.
export function weaponSpecialization(skills, skillId) {
  const ri = RANKS.indexOf(rankOf(skills[skillId] ?? 0)), masterI = RANKS.findIndex(r => r.id === 'master');
  if (ri < masterI) return 2;
  let others = 0;
  for (const [id, d] of Object.entries(SKILLS)) {
    if (id !== skillId && d.group === 'weapon' && RANKS.indexOf(rankOf(skills[id] ?? 0)) >= ri) others++;
  }
  return Math.max(0.5, 2 - 0.1 * others);
}

// How a skill levels: 'rank' (time per rank, with modifiers) or 'use' (like a main stat).
const CURVE = { profession: 'rank', weapon: 'rank', combat: 'rank', magic: 'rank', general: 'use', story: 'use' };

// General skills: the limit where gains start falling off, from the governing stats.
// 4x their average (minimum 150): a sharp mind can take Literacy far, a dull one plateaus sooner.
export function generalLimit(c, skillId, m = effectiveMain(c)) {
  const gov = SKILLS[skillId].gov;
  return Math.max(150, 4 * gov.reduce((t, s) => t + m[s], 0) / gov.length);
}
export const GENERAL_RATE = 0.2;    // points per use before modifiers (active practice makes it 1)

// Every modifier on a skill's growth, for display ("why is this slow?") and for train().
// Uses effective stats, so level points and effects count toward how well you work.
export function growthModifiers(c, skillId) {
  const d = SKILLS[skillId], m = effectiveMain(c), g = d.group;
  const rankCurve = CURVE[g] === 'rank';
  return {
    intelligence: intMultiplier(m, d.type, g !== 'general' && g !== 'magic'),   // trades and weapons: wits help a little even when physical
    performance: rankCurve ? perfMultiplier(m, skillId) : 1,
    specialization: g === 'profession' ? specialization(c.skills, skillId)
                  : g === 'weapon' ? weaponSpecialization(c.skills, skillId)
                  : rankCurve ? 2 : 1,                 // magic and combat never split focus
    limit: rankCurve ? null : generalLimit(c, skillId, m),
  };
}

// Call whenever a skill is used. `amount` = how meaningful the use was
// (e.g. 1 for a normal hit or craft, 3 for a kill or a hard recipe, 0.2 for a missed swing).
// opts.practice: 'active' (default) or 'passive'.
// opts.taskRank: the rank of the task ('apprentice', ...); tasks below your rank teach less.
// Returns { skillGain, mainGains }.
// opts.stats: which main stats this use builds (instead of the skill's own list)
// opts.approach: taper gains toward the body's limit (potential) and stop there
// opts.statScale: how much of the usual spill into main stats this use gives (movement uses a small share:
// it happens constantly, so full spill would build a body in minutes)
export function train(c, skillId, amount = 1, opts = {}) {
  const d = SKILLS[skillId];
  if (!d) throw new Error(`Unknown skill: ${skillId}`);
  if (d.group === 'story') return { skillGain: 0, mainGains: {} };   // set by the story, never by use
  const practice = PRACTICE[opts.practice ?? 'active'] ?? 1;

  const m = growthModifiers(c, skillId), v = c.skills[skillId];
  const skillGain = m.limit === null
    ? amount * practice * baseRate(v) * taskFactor(v, opts.taskRank) * m.intelligence * m.performance * m.specialization
    : amount * practice * GENERAL_RATE * m.intelligence * softCapFactor(v, m.limit);
  c.skills[skillId] = Math.min(1000000, v + skillGain);

  // Main stats grow from use only, and only the trained layer. A skill exercises what the work
  // leans on (smithing builds Strength and Endurance; a greatsword, Strength and Dexterity), or its
  // governing stats. Intelligence never boosts physical stats. Gains fall off past the body's potential.
  // Magic never makes you smarter: casting (and the casting skills) never raise Intelligence or Mind.
  // Spirit is the body's side of magic, so it grows instead. Study and meditation raise the mind.
  const casting = opts.casting || CASTING.has(skillId) || d.group === 'magic';
  let grows = opts.stats ?? perfStats(skillId) ?? d.gov;
  if (casting) { grows = grows.filter(st => st !== 'intelligence' && st !== 'mind'); if (!grows.length) grows = ['spirit']; }
  const mainGains = {};
  for (const stat of grows) {
    const pot = c.potential?.[stat] ?? SOFT_CAP.main;
    // approach: gains shrink in proportion to the room left below the body's limit, so the stat climbs
    // quickly at first and ever more slowly (logarithmically) as it nears it, never passing it
    const room = opts.approach ? Math.max(0, (pot - c.main[stat]) / pot) : softCapFactor(c.main[stat], pot);
    const g = amount * practice * MAIN_STAT_SPILLOVER * (opts.statScale ?? 1) / grows.length * room;
    c.main[stat] += g;
    mainGains[stat] = g;
  }
  return { skillGain, mainGains };
}

// Skills practiced by casting: their use never raises Intelligence or Mind.
const CASTING = new Set(['attunement', 'incantation', 'voiceless', 'manaControl', 'manaSense']);

// Raising a main stat directly (the trained layer, within the body's limits).
export function trainStat(c, stat, amount) {
  const g = amount * softCapFactor(c.main[stat], c.potential?.[stat] ?? SOFT_CAP.main);
  c.main[stat] += g;
  return g;
}
// The only ways to grow Intelligence and Mind on purpose. hours of real effort; 'active' (default)
// is the player doing it (a lesson, a puzzle, a meditation minigame), 'passive' runs while idle.
// Same pace as a stat built by physical work: about 6 per passive hour at average.
export const STUDY_RATE = 6;
export function study(c, hours, practice = 'active') { return trainStat(c, 'intelligence', hours * STUDY_RATE * (PRACTICE[practice] ?? 1)); }
export function meditate(c, hours, practice = 'active') {
  const k = hours * STUDY_RATE * (PRACTICE[practice] ?? 1);
  return { mind: trainStat(c, 'mind', k), spirit: trainStat(c, 'spirit', k * 0.5) };
}

// Attunement grows slowly as mana is spent (about 1 point per 100 mana at average stats).
export function spendMana(c, amount) { return train(c, 'attunement', amount / 20, { practice: 'passive', casting: true }); }

// Values are stored as floats so small gains accumulate; show them floored.
export const display = v => Math.floor(v);
