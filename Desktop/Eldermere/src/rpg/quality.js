// src/rpg/quality.js — material quality: rolled when gathered, hidden until appraised, then worked
// in steps of 10.
//
// Quality runs 0..100. A gathered material's true quality is unknown until it's appraised.
// Appraised quality rounds to the nearest 10 (55 -> 60, 54 -> 50), so a stack holds at most 11
// grades instead of 101 separate items.
import { RANKS, rankOf, PROFESSIONS } from '../data/professions.js';
import { MATERIALS, TIER_RANK } from '../data/materials.js';
import { effectiveMain, train } from './stats.js';

export const GRADES = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
export const grade = q => Math.max(0, Math.min(100, Math.floor(q / 10 + 0.5) * 10));
export const GRADE_NAMES = { 0: 'Ruined', 10: 'Poor', 20: 'Poor', 30: 'Rough', 40: 'Fair', 50: 'Average', 60: 'Good', 70: 'Fine', 80: 'Superb', 90: 'Exquisite', 100: 'Perfect' };

const rankIdx = v => RANKS.indexOf(rankOf(v));
const reqIdx = tier => RANKS.findIndex(r => r.id === TIER_RANK[Math.max(0, Math.min(TIER_RANK.length - 1, tier))]);
const gauss = (rand) => { let u = 0, v = 0; while (!u) u = rand(); while (!v) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// How a skill compares to what a material's tier asks for: points added to the quality roll.
// Each rank above the requirement +12, each rank below -15, plus up to +8 for progress within the rank.
export function skillEdge(skillValue, tier) {
  const d = rankIdx(skillValue) - reqIdx(tier), r = rankOf(skillValue), i = RANKS.indexOf(r);
  const next = RANKS[i + 1]?.min ?? r.min * 10, within = Math.min(1, (skillValue - r.min) / Math.max(1, next - r.min));
  return (d >= 0 ? 12 * d : 15 * d) + 8 * within;
}

// The quality of a material as it's gathered (or of a product as it's made).
//   skill: the skill value used; tier: the material's tier
//   region: 0..1 how rich the place is (0.5 ordinary; a pristine forest or deep vein is higher)
//   tool: tool quality (TOOL_TIERS: 0.3 improvised .. 1.5 masterwork)
//   perf: the performance multiplier for the work (1 = average body for it)
//   luck: the character's Luck; bonus: any other flat points (gear, effects, buffs)
// Returns the true quality 0..100 (keep it hidden until appraised).
export function rollQuality({ skill, tier = 0, region = 0.5, tool = 1, perf = 1, luck = 100, bonus = 0, spread = 15 }, rand = Math.random) {
  const mean = 40 + skillEdge(skill, tier) + (region - 0.5) * 40 + (tool - 1) * 30 + (perf - 1) * 20 + (luck - 100) / 20 + bonus;
  return Math.max(0, Math.min(100, mean + gauss(rand) * spread));
}

// Gathering one unit for a character: rolls the quality from their skill, stats, tool and the region,
// and trains the skill (task rank = the tier's rank). Returns the hidden quality.
export function gatherQuality(c, materialId, { region = 0.5, tool = 1, bonus = 0, practice = 'active', train: doTrain = true } = {}, rand = Math.random) {   // (train: false — the caller trains once for the whole job)
  const mat = MATERIALS[materialId]; if (!mat) throw new Error(`Unknown material: ${materialId}`);
  const skillId = mat.source, m = effectiveMain(c), perfStats = PROFESSIONS[skillId]?.perf;
  const perf = perfStats ? perfStats.reduce((t, s) => t + m[s], 0) / perfStats.length / 100 : 1;
  const q = rollQuality({ skill: c.skills[skillId] ?? 100, tier: mat.tier, region, tool, perf, luck: m.luck, bonus }, rand);
  if (doTrain && c.skills[skillId] !== undefined) train(c, skillId, 1, { practice, taskRank: TIER_RANK[mat.tier] });
  return q;
}

// Appraising: Appraisal against the material's tier. Fails leave it unknown (try again later);
// success reveals its grade. Every attempt trains Appraisal.
//   fail chance: 50% at the tier's rank, -15% per rank above (min 2%), +20% per rank below (max 95%)
export function appraiseChance(appraisal, tier) {
  const d = rankIdx(appraisal) - reqIdx(tier);
  return 1 - Math.max(0.02, Math.min(0.95, d >= 0 ? 0.5 - 0.15 * d : 0.5 - 0.2 * d));
}
export function appraise(c, materialId, trueQuality, rand = Math.random) {
  const tier = MATERIALS[materialId]?.tier ?? 0;
  const ok = rand() < appraiseChance(c.skills.appraisal ?? 100, tier);
  train(c, 'appraisal', ok ? 1 : 0.5);
  return ok ? grade(trueQuality) : null;
}
