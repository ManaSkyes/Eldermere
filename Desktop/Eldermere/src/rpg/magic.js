// src/rpg/magic.js — spells: per-spell mastery, casting modes, and how a cast comes out.
//
// Every spell has its own mastery level (c.spells[id]):
//   0         can't be cast without backfiring
//   1..99     learning: more control, more power, fewer backfires
//   100       complete mastery
//   101..1000 bonus levels: the spell has become part of the caster. It needs no staff, book or
//             focus, voiceless casting loses every penalty, and each point lowers the mana cost
//             further. (Lirien sits around 120 in her lunar magic.)
//
// Spells (src/data/spells.js) carry a difficulty and a power, both 0..100:
//   0       safe for a child
//   1..10   ordinary magic; 10 is city-wide destruction
//   11..20  what only the highest ranks in the world can do
//   21+     ritual magic needing many skilled mages
//
// Casting modes (traditional magic):
//   incantation  spoken chant: full power, longer cast, cheaper
//   voiceless    much faster, weaker, more expensive (until the spell passes 100)
import { SKILLS, train, spendMana, effectiveMain } from './stats.js';
import { RANKS, rankOf } from '../data/professions.js';
import { nodeRank } from '../data/skillTrees.js';

export const MASTERY = { core: 100, max: 1000 };

// Focuses: anything that channels a spell. Below mastery 101 a cast without one is weaker and riskier.
export const FOCUS_TYPES = ['staff', 'orb', 'book', 'bracelet', 'magic weapon', 'tattoo', 'wand', 'circle', 'ritual site'];

// How a spell was learned. Self-practice is the most dangerous way: more backfires until mastered.
export const LEARN_METHODS = {
  teacher:  { name: 'Taught',       backfire: 0.75 },
  scroll:   { name: 'From a scroll or book', backfire: 1.0 },
  self:     { name: 'Self-practice', backfire: 1.5 },
};
export function learnSpell(c, spellId, method = 'scroll') {
  c.spells = c.spells || {}; c.spellSources = c.spellSources || {};
  if (!(spellId in c.spells)) c.spells[spellId] = 0;
  // a teacher's guidance outranks a scroll, which outranks working it out alone
  const order = ['self', 'scroll', 'teacher'], cur = c.spellSources[spellId];
  if (!cur || order.indexOf(method) > order.indexOf(cur)) c.spellSources[spellId] = method;
  return c;
}
export const knowsSpell = (c, spellId) => spellId in (c.spells ?? {});

// Prepared spells: the ones held ready in mind to cast (the spell wheel and the hotbar draw from them).
// How many you can hold rests on Intelligence and Mind: 3 at an average 100, one more every 20 points,
// up to 30 (at about 640).
export const PREPARE = { base: 3, per: 20, max: 30 };
export function preparedMax(c) {
  const m = effectiveMain(c), g = (m.intelligence + m.mind) / 2;
  return Math.max(1, Math.min(PREPARE.max, Math.round(PREPARE.base + (g - 100) / PREPARE.per)));
}
export function preparedOf(c) {
  c.prepared = (c.prepared || []).filter(id => knowsSpell(c, id));
  return c.prepared;
}
// prepare a spell, or let it go if it's already prepared
export function togglePrepared(c, spellId) {
  const list = preparedOf(c), i = list.indexOf(spellId);
  if (i >= 0) { list.splice(i, 1); return { ok: true, prepared: false }; }
  if (!knowsSpell(c, spellId)) return { ok: false, reason: 'You don\'t know that spell.' };
  if (list.length >= preparedMax(c)) return { ok: false, reason: `You can hold ${preparedMax(c)} spells prepared. Let one go first.` };
  list.push(spellId); return { ok: true, prepared: true };
}

export const MODES = {
  incantation: { power: 1.0, mana: 0.8, time: 1.0 },
  voiceless:   { power: 0.6, mana: 1.5, time: 0.3 },
};
const NO_FOCUS = { power: 0.7, backfire: 1.5 };   // casting a spell below 101 without a staff, book or focus

export function spellTier(level) {
  if (level <= 0) return 'Safe';
  if (level <= 5) return 'Common';
  if (level <= 9) return 'Dangerous';
  if (level <= 10) return 'Catastrophic';
  if (level <= 20) return 'Legendary';
  return 'Ritual';
}

export const masteryOf = (c, spellId) => c.spells?.[spellId] ?? 0;

// Backfire: the school and the casting skill each cut the chance as they grow past 100, measured against
// the spell's tier: skill 100 + span·(1 + difficulty) halves it (Fire 400 halves a tier-1 spell's chance;
// a tier-3 spell needs Fire 700). Voiceless casting is riskier (×1.3) until Voiceless skill makes up for it.
export const BACKFIRE = { school: 150, casting: 250, voiceless: 1.3 };
export const backfireSkill = (skill, difficulty, span) => 1 / (1 + Math.max(0, skill - 100) / (span * (1 + Math.max(0, difficulty))));

// A school's tree nodes that change how a cast comes out (mana, cast time, backfire). Fire's live here;
// what fire does once thrown (burns, blasts...) is src/game/spellcast.js.
export function schoolMods(c, school, voiceless) {
  const r = id => nodeRank(c, school, id) || 0;
  if (school === 'fire') return {
    mana: 1 - 0.08 * r('emberThrift'),
    time: voiceless ? 1 - 0.15 * r('quickfire') : 1 - 0.08 * r('fluentChant'),
    backfire: 1 - 0.1 * r('steadyFlame'),
  };
  return { mana: 1, time: 1, backfire: 1 };
}

// How a cast would come out, before rolling for a backfire.
// opts.mode: 'incantation' | 'voiceless'; opts.focus: holding a staff, book or other focus.
export function castProfile(c, spell, opts = {}) {
  const L = masteryOf(c, spell.id), core = Math.min(L, MASTERY.core) / MASTERY.core, bonus = Math.max(0, L - MASTERY.core);
  const innate = L > MASTERY.core;
  const mode = MODES[opts.mode ?? 'incantation'];
  const s = c.skills;
  // the casting skills soften their mode: Incantation shortens the chant; Voiceless trims its penalties
  const chant = 1 / Math.sqrt(Math.max(10, s.incantation) / 100);
  const vSkill = Math.min(0.5, Math.max(0, (s.voiceless - 100) / 1800));   // up to half the penalty gone at 1000
  const voiceless = opts.mode === 'voiceless';
  let power = mode.power, mana = mode.mana, time = mode.time * (voiceless ? 1 : chant);
  if (voiceless && !innate) { power += (1 - power) * vSkill; mana -= (mana - MODES.incantation.mana) * vSkill; }
  if (voiceless && innate) { power = 1; mana = MODES.incantation.mana; }
  const focus = innate || opts.focus;
  // backfire: mostly the spell's own mastery, then how far the school (Fire...) and the casting skill used
  // (Incantation or Voiceless) have grown past what this spell asks of them (see backfireSkill)
  const castSkill = voiceless ? s.voiceless : s.incantation;
  let backfire = L >= MASTERY.core ? 0 : Math.pow(1 - core, 2) * (LEARN_METHODS[c.spellSources?.[spell.id]]?.backfire ?? 1)
    * backfireSkill(s[spell.school] ?? 100, spell.difficulty, BACKFIRE.school) * backfireSkill(castSkill ?? 100, spell.difficulty, BACKFIRE.casting) * (voiceless ? BACKFIRE.voiceless : 1);
  if (!focus) { power *= NO_FOCUS.power; backfire = Math.min(1, backfire * NO_FOCUS.backfire); }
  const sm = schoolMods(c, spell.school, voiceless);
  mana *= sm.mana; time *= sm.time; backfire *= sm.backfire;
  return {
    mastery: L,
    power: spell.power * (0.4 + 0.6 * core) * power,
    mana: spell.mana * mana / (1 + bonus / 100),             // 120 -> 83%, 200 -> 50%, 1000 -> 10%
    castTime: spell.castTime * time,
    backfire: Math.min(1, backfire),                          // chance 0..1; what happens is the spell's own `backfire`
    innate,
  };
}

// Casts needed to go 0 -> 100 for an average caster (Intelligence and the school's stat at 100,
// school Unskilled, before the gift requirement). Gentle at first and steeper with every step:
// about 2,500 casts at difficulty 0, 3,100 at 1, 5,000 at 2, 9,300 at 3, 48,000 at 5 and 20 million at
// 10 (about an hour of steady casting to master a tier-1 spell like Fire bolt). Mastering a level-10
// spell is possible, but it's insanity.
export const MASTER_CASTS = { base: 2500, shape: 1.6, scale: 10.2 };
export function castsToMaster(difficulty) {
  return MASTER_CASTS.base * Math.pow(10, Math.pow(Math.max(0, difficulty), MASTER_CASTS.shape) / MASTER_CASTS.scale);
}

// The caster's gift: Intelligence (learning) and the school's governing stat (Mind or Spirit),
// measured against what the spell demands, then cubed so stats matter enormously. The demand rises
// gently with difficulty (100 at difficulty 0, ~116 at 5, ~134 at 10). Casting never raises these
// stats; study and meditation do.
export const GIFT = { base: 100, perLevel: 1.03, power: 3, min: 0.02, max: 20 };
export function giftRequired(difficulty) { return GIFT.base * Math.pow(GIFT.perLevel, difficulty); }
export function magicAptitude(c, spell, difficulty = spell.difficulty) {
  const m = effectiveMain(c), gov = SKILLS[spell.school]?.gov?.[0] ?? 'mind';
  const gift = (m.intelligence + m[gov]) / 2;
  return Math.min(GIFT.max, Math.max(GIFT.min, Math.pow(gift / giftRequired(difficulty), GIFT.power)));
}

// Bonus levels (101+) cost the same for every spell, whatever its difficulty: their benefit is
// smaller and safer than reaching 100. Over a thousand casts from 100 to 120 for an average caster,
// slowing as mastery climbs.
export const BONUS_RATE = 0.006;
// a spell spoken in full teaches this many times what a voiceless cast does (mastery, school, Incantation)
export const SPOKEN_BONUS = 2;

// The road to 100 is quick at first and slows toward the end: each cast teaches PACE.total / (1 +
// b·(L/100)^p) times the even rate, so the total stays castsToMaster() but the share runs about 25% of
// the casts for 0 → 50, 25% for 50 → 75 and 50% for 75 → 100. (A cast teaches 2.3× the even rate at 0,
// 0.37× near 100.)
export const PACE = { b: 5.33, p: 3 };
export const masteryPace = L => (1 + PACE.b / (PACE.p + 1)) / (1 + PACE.b * Math.pow(Math.min(MASTERY.core, Math.max(0, L)) / MASTERY.core, PACE.p));

// How much one cast teaches the spell's school (and the casting skill used): weight grows steeply with
// the spell's tier, and fades once the skill is past what the spell can teach (ceiling), falling off
// hard beyond it. Difficulty 0: weight 0.03, ceiling 120 · 1: 0.09, 260 · 3: 0.28, 550 · 5: 0.53, 860 ·
// 10: 1.4, 1,680. (A tier-1 spell alone takes a school to about 250; going further needs harder spells.)
export const TIER_TEACH = { weight: 0.03, weightPow: 1.6, ceiling: 120, ceilingPow: 1.1, fade: 3 };
export function schoolTeach(difficulty, skill) {
  const d = Math.max(0, difficulty), T = TIER_TEACH;
  const w = T.weight * Math.pow(1 + d, T.weightPow), ceil = T.ceiling * Math.pow(1 + d, T.ceilingPow);
  return w / (1 + Math.pow(Math.max(0, skill) / ceil, T.fade));
}

// After a cast resolves. Raises the spell's mastery, its school, the casting skill used, and
// attunement (from the mana spent). backfired: the cast went wrong (still teaches, half as much).
// No specialization: there is far too much magic to learn to punish breadth.
export function trainCast(c, spell, opts = {}, backfired = false) {
  c.spells = c.spells || {};
  const L = masteryOf(c, spell.id);
  // a strong school makes its spells come easier: +25% per school rank (Unskilled 1.0 .. Guru 2.25)
  const affinity = 1 + 0.25 * RANKS.indexOf(rankOf(c.skills[spell.school] ?? 100));
  // bonus levels judge the gift as if the spell were difficulty 0: past 100 every spell evens out
  // a spell spoken in full (incantation) takes longer and teaches twice as much as a voiceless one;
  // opts.full false: the chant was broken off partway, so no bonus
  const spoken = opts.mode !== 'voiceless' && opts.full !== false ? SPOKEN_BONUS : 1;
  const k = magicAptitude(c, spell, L < MASTERY.core ? spell.difficulty : 0) * affinity * (backfired ? 0.5 : 1) * spoken;
  const gain = L < MASTERY.core
    ? (MASTERY.core / castsToMaster(spell.difficulty)) * k * masteryPace(L)
    : BONUS_RATE * Math.pow(MASTERY.core / L, 3) * k;
  c.spells[spell.id] = Math.min(MASTERY.max, L < MASTERY.core ? Math.min(MASTERY.core, L + gain) : L + gain);

  const prof = castProfile(c, spell, opts);
  // School and casting skill: a spell teaches them by its tier (TIER_TEACH), and less and less once
  // they've outgrown it, so cantrips can't carry a school far. A cast takes longer than a swing, but
  // there are far fewer of them, so this is passive pace.
  const casting = opts.mode === 'voiceless' ? 'voiceless' : 'incantation';
  if (SKILLS[spell.school]) train(c, spell.school, schoolTeach(spell.difficulty, c.skills[spell.school] ?? 100) * (backfired ? 0.5 : 1) * spoken, { practice: 'passive' });
  train(c, casting, schoolTeach(spell.difficulty, c.skills[casting] ?? 100) * spoken, { practice: 'passive' });
  spendMana(c, prof.mana);
  return { gain, mastery: c.spells[spell.id] };
}

// Enchanting and talisman crafting put a spell into an object. Both are trades that level like any
// profession, but you must know the spell, and the result depends on both the craft and the spell:
// a master enchanter with a half-learned spell, or a spell master with clumsy hands, both fall short.
// Returns 0 (can't) .. ~1 (full strength), more with bonus mastery.
export function imbueEffectiveness(c, craftSkill, spellId) {
  if (!knowsSpell(c, spellId)) return 0;
  const craft = Math.min(1.5, (c.skills[craftSkill] ?? 0) / 1000);                    // Journeyman's top (1,000) = full craft
  const spell = Math.min(MASTERY.core, masteryOf(c, spellId)) / MASTERY.core
              + Math.max(0, masteryOf(c, spellId) - MASTERY.core) / 900 * 0.5;        // bonus levels add up to +50%
  return Math.sqrt(craft * spell);                                                      // both matter equally
}
