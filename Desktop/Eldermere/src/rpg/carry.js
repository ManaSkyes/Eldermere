// src/rpg/carry.js — how much a character can carry: pack slots and weight.
//
// Weight: the derived carrying capacity (Strength, a little Endurance; src/rpg/stats.js), plus the
// pack's own 10 kg, scaled a little by Athletics (knowing how to carry a load).
// Slots: 10, plus one for every 20 points of Strength + Endurance, plus one per 100 Athletics past 100.
// An average citizen (100s everywhere): 40 kg and 20 slots.
// Over the weight limit you can still move, slower: see the controller (encumbrance).
import { effectiveMain, derived } from './stats.js';
import { ITEMS } from './equipment.js';
import { MATERIALS } from '../data/materials.js';
import { POTIONS } from '../data/potions.js';

export const CARRY = { packKg: 10, baseSlots: 10, statsPerSlot: 20, athleticsPerSlot: 100, materialKg: 0.2 };

export function capacity(c) {
  const m = effectiveMain(c), d = derived(c), ath = c.skills.athletics ?? 100;
  return {
    kg: (CARRY.packKg + d.carryKg) * Math.pow(Math.max(1, ath) / 100, 0.2),
    slots: CARRY.baseSlots + Math.floor((m.strength + m.endurance) / CARRY.statsPerSlot) + Math.max(0, Math.floor((ath - 100) / CARRY.athleticsPerSlot)),
  };
}

// What's carried: worn gear, unique items and material stacks. The test grounds' potions weigh nothing.
export function loadOf(inv, worn = {}) {
  let kg = 0;
  for (const id of new Set(Object.values(worn))) kg += ITEMS[id]?.weight || 0;
  for (const it of inv.items) kg += ITEMS[it.id]?.weight ?? MATERIALS[it.material]?.weight ?? 0.5;
  for (const [id, st] of Object.entries(inv.stacks)) {
    if (POTIONS[id]) continue;
    const n = st.unknown.length + Object.values(st.grades).reduce((t, x) => t + x, 0);
    kg += n * (MATERIALS[id]?.weight ?? CARRY.materialKg);
  }
  return { kg };
}

// Movement multiplier from load: full speed up to the limit, then slower, down to 35% at double.
export const encumbrance = (kg, cap) => kg <= cap ? 1 : Math.max(0.35, 1 - (kg / cap - 1) * 0.65);
