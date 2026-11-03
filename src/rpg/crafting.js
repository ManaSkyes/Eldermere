// src/rpg/crafting.js — making things: recipe checks, output quality, alloys, forged gear, and the
// stats a crafted item gets from its material and quality.
import { RECIPES, CONSUMABLES } from '../data/recipes.js';
import { MATERIALS, METALS, TIER_RANK } from '../data/materials.js';
import { PROFESSIONS, STATIONS, stationLevel } from '../data/professions.js';
import { ITEMS } from './equipment.js';
import { alloy } from './alloys.js';
import { effectiveMain, train } from './stats.js';
import { skillEdge, grade } from './quality.js';
import { countOf, takeMaterial, addMaterial, addItem } from './inventory.js';

// Materials made by crafting that aren't in the catalog (ingots of a composition, leathers of a hide,
// consumables) are described here, per inventory, so stacks know what they hold.
function describe(inv, id, def) { (inv.meta = inv.meta || {})[id] = def; return id; }
export const materialInfo = (inv, id) => inv.meta?.[id] || MATERIALS[id] || (CONSUMABLES[id] && { name: CONSUMABLES[id].name, ...CONSUMABLES[id] });

// Which inventory ids can fill an input.
function candidates(inv, input) {
  const ids = Object.keys(inv.stacks);
  if (input.ids) return input.ids;
  return ids.filter(id => (materialInfo(inv, id)?.kind === input.match) || id.endsWith('.' + input.match));
}
function pick(inv, input, minGrade) {
  for (const id of candidates(inv, input)) if (countOf(inv, id, minGrade) >= input.count) return id;
  return null;
}

// Can this be made here, with what's in the pack? Returns { ok, reason?, level, picks }.
// stations: ids available (a workshop, or camp stations from kits). Simple stations cap quality.
export function canCraft(inv, recipeId, stations = [], { minGrade = 0 } = {}) {
  const r = RECIPES[recipeId]; if (!r) return { ok: false, reason: `Unknown recipe: ${recipeId}` };
  let level = null;
  for (const st of stations) { const l = stationLevel(r.skill, st) || (st === r.station ? 'full' : null); if (l === 'full' || (l && !level)) level = l; }
  const name = STATIONS[r.station]?.name ?? r.station;
  if (!level && !stations.includes(r.station)) return { ok: false, reason: `Needs a ${name.toLowerCase()}.` };
  level = level || 'full';
  // workshop recipes need the workshop; camp recipes can be made at camp (capped) or in the workshop
  if (STATIONS[r.station]?.kind === 'workshop' && level !== 'full') return { ok: false, reason: `Needs a ${name.toLowerCase()}; this can't be done at camp.` };
  const picks = {};
  for (const input of r.inputs) {
    const id = pick(inv, input, minGrade);
    if (!id) return { ok: false, reason: `Missing ${input.count} × ${input.ids ? input.ids.map(i => materialInfo(inv, i)?.name ?? i).join(' or ') : input.match} (appraised).` };
    picks[input.role] = id;
  }
  return { ok: true, level, picks };
}

// Output quality: the inputs' grades (weighted) and the work itself, half and half-ish.
//   work = 40 + skill edge over the tier + tool + body; a simple (camp) station caps at 60.
export function craftQuality(c, skillId, tier, inputGrades, { tool = 1, level = 'full', rand = Math.random } = {}) {
  const m = effectiveMain(c), perfStats = PROFESSIONS[skillId]?.perf;
  const perf = perfStats ? perfStats.reduce((t, s) => t + m[s], 0) / perfStats.length / 100 : 1;
  let wsum = 0, gsum = 0; for (const { g, w } of inputGrades) { gsum += g * w; wsum += w; }
  const inputs = wsum ? gsum / wsum : 50;
  const work = 40 + skillEdge(c.skills[skillId] ?? 100, tier) + (tool - 1) * 30 + (perf - 1) * 20;
  const noise = (rand() + rand() + rand() - 1.5) * 8;
  let q = 0.55 * inputs + 0.45 * work + noise;
  if (level === 'simple') q = Math.min(q, 60);
  return Math.max(0, Math.min(100, q));
}

function consume(inv, r, picks) {
  const grades = [];
  for (const input of r.inputs) for (const g of takeMaterial(inv, picks[input.role], input.count)) grades.push({ g, w: input.weight ?? 1 });
  return grades;
}

// Make a recipe. Returns { ok, quality, made } or { ok: false, reason }.
export function craft(c, inv, recipeId, { stations = [], tool = 1, practice = 'active', rand = Math.random } = {}) {
  const r = RECIPES[recipeId], chk = canCraft(inv, recipeId, stations);
  if (!chk.ok) return chk;
  const picks = chk.picks, grades = consume(inv, r, picks);
  const q = craftQuality(c, r.skill, r.tier, grades, { tool, level: chk.level, rand });
  train(c, r.skill, 1 + r.tier * 0.5, { practice, taskRank: TIER_RANK[r.tier] });
  const out = r.output; let made;
  if (out.ingot) made = describe(inv, `ingot.${out.ingot}`, { name: `${METALS[out.ingot].name} ingot`, kind: 'ingot', tier: METALS[out.ingot].tier, alloy: alloy({ [out.ingot]: 100 }) });
  else if (out.leather) { const hide = picks.hide, src = MATERIALS[hide]; made = describe(inv, `leather.${src?.creature ?? hide}`, { name: `${src?.name.replace(/ (hide|pelt|wing membrane)$/, '') ?? hide} leather`, kind: 'leather', tier: src?.tier ?? 0, props: { ...(src?.props || {}) } }); }
  else made = out.material;
  addMaterial(inv, made, q, out.count ?? 1, true);
  return { ok: true, quality: grade(q), made, count: out.count ?? 1 };
}

// Mix an alloy: composition in percent (e.g. { iron: 99.2, carbon: 0.8 }) for a batch of ingots.
// Metals come from their ingots (one ingot per ingot's worth); carbon from charcoal or coal (one per
// ingot per 1%); crystal dust one unit per ingot's worth. process: 'folded' for damascus.
export function makeAlloy(c, inv, composition, batch = 1, { process = null, stations = [], tool = 1, practice = 'active', rand = Math.random } = {}) {
  if (!stations.includes('forge')) return { ok: false, reason: 'Needs a smithy.' };
  const a = alloy(composition, { process });
  const need = [];
  for (const [part, pct] of Object.entries(a.composition)) {
    if (part === 'carbon') need.push({ ids: ['charcoal', 'coal'], count: Math.max(1, Math.ceil(batch * pct)) });
    else if (part === 'crystalDust') need.push({ ids: ['crystalDust'], count: Math.max(1, Math.ceil(batch * pct / 100)) });
    else need.push({ ids: [`ingot.${part}`], count: Math.max(1, Math.ceil(batch * pct / 100)) });
  }
  const picks = need.map(n => n.ids.find(id => countOf(inv, id) >= n.count));
  const miss = need.findIndex((n, i) => !picks[i]);
  if (miss >= 0) return { ok: false, reason: `Missing ${need[miss].count} × ${need[miss].ids.join(' or ')}.` };
  const grades = []; need.forEach((n, i) => takeMaterial(inv, picks[i], n.count).forEach(g => grades.push({ g, w: 1 })));
  const tier = a.tier + (process ? 1 : 0);
  const q = craftQuality(c, 'smithing', tier, grades, { tool, rand });
  train(c, 'smithing', 1 + tier * 0.5, { practice, taskRank: TIER_RANK[tier] });
  // ingots of the same alloy but a different mix are different stacks (mild vs high-carbon steel)
  const key = Object.entries(a.composition).map(([k, v]) => `${k}${Math.round(v * 10) / 10}`).join('-');
  const id = describe(inv, `ingot.${a.id ?? 'mix'}@${key}`, { name: `${a.name} ingot`, kind: 'ingot', tier, alloy: a });
  addMaterial(inv, id, q, batch, true);
  return { ok: true, quality: grade(q), made: id, alloy: a };
}

// Forge a metal item (weapon, armor or tool) from ingots. Ingot count follows the item's weight.
// A leather grip or strap (any leather) is used if the item is a weapon or armor that needs one.
export function forgeItem(c, inv, itemId, ingotId, { stations = [], tool = 1, practice = 'active', rand = Math.random } = {}) {
  const base = ITEMS[itemId], info = materialInfo(inv, ingotId);
  if (!base) return { ok: false, reason: `Unknown item: ${itemId}` };
  if (!info?.alloy) return { ok: false, reason: 'That is not a metal ingot.' };
  if (!stations.includes('forge')) return { ok: false, reason: 'Needs a smithy.' };
  const ingots = Math.max(1, Math.round((base.weight || 2) / 1.5));
  if (countOf(inv, ingotId) < ingots) return { ok: false, reason: `Needs ${ingots} × ${info.name}.` };
  const grip = (base.damage || base.armor) ? Object.keys(inv.stacks).find(id => materialInfo(inv, id)?.kind === 'leather' && countOf(inv, id) > 0) : null;
  if ((base.damage || base.armor) && !grip) return { ok: false, reason: 'Needs a piece of leather for the grip or straps.' };
  const grades = takeMaterial(inv, ingotId, ingots).map(g => ({ g, w: 4 }));
  if (grip) grades.push(...takeMaterial(inv, grip, 1).map(g => ({ g, w: 1 })));
  const tier = info.tier ?? 0, q = Math.round(craftQuality(c, 'smithing', tier, grades, { tool, rand }));
  train(c, 'smithing', 2 + tier, { practice, taskRank: TIER_RANK[tier] });
  const material = { id: ingotId, name: info.alloy.name, props: info.alloy.props, magic: info.alloy.magic, tier };
  const stats = itemStats(itemId, material, q);
  return { ok: true, quality: q, item: addItem(inv, { item: itemId, material, quality: q, durability: stats.durability, maxDurability: stats.durability, maker: c.name || null }) };
}

// ---------- What a crafted item's material and quality do to its stats ----------
const BLUNT = new Set(['mace', 'warhammer', 'club']);
// quality 0 -> 60%, 50 -> 100%, 100 -> 140%
export const qualityFactor = q => 0.6 + 0.8 * (q / 100);

export function itemStats(itemId, material, quality) {
  const base = ITEMS[itemId], p = material?.props || {}, qf = qualityFactor(quality ?? 50);
  const out = { ...base };
  if (base.damage) {
    // edged weapons cut with their edge; blunt ones hit with hardness and mass
    const cut = BLUNT.has(base.skill) ? (p.hardness ?? 35) / 35 * 0.7 + (p.density ?? 100) / 100 * 0.3 : (p.edge ?? 35) / 35;
    out.damage = Math.round(base.damage * cut * qf * 10) / 10;
  }
  if (base.armor) out.armor = Math.round(base.armor * ((p.hardness ?? 35) / 35 * 0.6 + (p.toughness ?? 55) / 55 * 0.4) * qf * 10) / 10;
  if (base.weight && p.density) out.weight = Math.round(base.weight * (0.3 + 0.7 * p.density / 100) * 10) / 10;   // the metal is ~70% of the weight
  out.durability = Math.round(100 * ((p.toughness ?? 55) / 55) * qf);
  out.enchantSlots = enchantSlots(material, quality);
  if (p.conduct >= 60) out.focusPower = Math.round(p.conduct * qf) / 100;                       // conductive metals can serve as a focus
  return out;
}

// Room for enchantments: better quality and mana-carrying materials hold more (0..4).
export function enchantSlots(material, quality) {
  const p = material?.props || {};
  return Math.min(4, Math.floor((quality ?? 0) / 35) + ((p.conduct ?? 0) >= 60 ? 1 : 0) + (material?.magic ? 1 : 0));
}

// Wear and repair. Repairing needs the trade's station (or a repair kit for field repairs, which
// can't restore the last 30%) and costs a little of the item's maximum each time.
export function wear(inst, amount = 1) { inst.durability = Math.max(0, inst.durability - amount); return inst.durability; }
export function repair(c, inst, { stations = [] } = {}) {
  const full = stations.includes('forge') || stations.includes('tannery') || stations.includes('tailorShop');
  if (!full && !stations.includes('repairKit')) return { ok: false, reason: 'Needs a repair kit or a workshop.' };
  const cap = full ? inst.maxDurability : Math.floor(inst.maxDurability * 0.7);
  if (inst.durability >= cap) return { ok: false, reason: full ? 'It is already in good repair.' : 'Field repairs can\'t do more; it needs a workshop.' };
  inst.maxDurability = Math.max(1, inst.maxDurability - 1);                                        // each repair costs a little for good
  inst.durability = Math.min(cap, inst.maxDurability);
  train(c, 'smithing', 0.5, { practice: 'active' });
  return { ok: true, durability: inst.durability };
}
