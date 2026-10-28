// src/data/recipes.js — what can be made, from what, where.
//
// A recipe:
//   skill, tier (sets the task rank, so trivial recipes teach little), station (STATIONS id in
//   src/data/professions.js), inputs: [{ role, ids: [material ids] | match: 'prefix', count, weight }],
//   output: { material, count } for stackable goods, or { item } for unique gear (src/rpg/equipment.js).
// Inputs with a higher `weight` matter more to the result's quality (the blade's metal more than
// the grip's leather). `from: 'input role'` on an output passes that input's material through
// (leather keeps its hide's toughness; a sword keeps its steel's edge).
// This is a starting set to prove the system; the full recipe book grows with each trade.

export const CONSUMABLES = {
  healingSalve: { name: 'Healing salve', kind: 'medicine', effect: { heal: 120 } },
  manaTonic: { name: 'Mana tonic', kind: 'potion', effect: { mana: 80 } },
  heartyStew: { name: 'Hearty stew', kind: 'food', effect: { stamina: 60, regen: 1.2, minutes: 30 } },
  bandage: { name: 'Bandage', kind: 'medicine', effect: { heal: 40, stopsBleeding: true } },
};

export const RECIPES = {
  // ---- smithing ----
  smeltCopper: { name: 'Smelt copper', skill: 'smithing', tier: 0, station: 'forge',
    inputs: [{ role: 'ore', ids: ['copperOre'], count: 2, weight: 3 }, { role: 'fuel', ids: ['charcoal', 'coal'], count: 1, weight: 1 }],
    output: { ingot: 'copper', count: 1 } },
  smeltTin: { name: 'Smelt tin', skill: 'smithing', tier: 1, station: 'forge',
    inputs: [{ role: 'ore', ids: ['tinOre'], count: 2, weight: 3 }, { role: 'fuel', ids: ['charcoal', 'coal'], count: 1, weight: 1 }],
    output: { ingot: 'tin', count: 1 } },
  smeltIron: { name: 'Smelt iron', skill: 'smithing', tier: 1, station: 'forge',
    inputs: [{ role: 'ore', ids: ['ironOre'], count: 3, weight: 3 }, { role: 'fuel', ids: ['charcoal', 'coal'], count: 2, weight: 1 }, { role: 'flux', ids: ['limestone'], count: 1, weight: 0.5 }],
    output: { ingot: 'iron', count: 1 } },
  // alloys are mixed by composition with makeAlloy() in src/rpg/crafting.js
  // weapons: forgeItem() works for any metal weapon: the ingot count comes from the item's weight
  // ---- leatherworking ----
  tanHide: { name: 'Tan a hide', skill: 'leatherworking', tier: 0, station: 'tannery',
    inputs: [{ role: 'hide', match: 'hide', count: 1, weight: 4 }, { role: 'salt', ids: ['salt'], count: 1, weight: 0.5 }, { role: 'lime', ids: ['limestone'], count: 1, weight: 0.5 }],
    output: { leather: 'hide', count: 1 } },
  // ---- tailoring ----
  weaveLinen: { name: 'Weave linen', skill: 'tailoring', tier: 0, station: 'tailorShop',
    inputs: [{ role: 'fiber', ids: ['flax'], count: 4, weight: 1 }], output: { material: 'linen', count: 1 } },
  weaveCotton: { name: 'Weave cotton cloth', skill: 'tailoring', tier: 1, station: 'tailorShop',
    inputs: [{ role: 'fiber', ids: ['cotton'], count: 4, weight: 1 }], output: { material: 'cottonCloth', count: 1 } },
  bandage: { name: 'Bandages', skill: 'tailoring', tier: 0, station: 'repairKit',
    inputs: [{ role: 'cloth', ids: ['linen', 'cottonCloth'], count: 1, weight: 1 }], output: { material: 'bandage', count: 3 } },
  // ---- alchemy ----
  healingSalve: { name: 'Healing salve', skill: 'alchemy', tier: 0, station: 'alchemyKit',
    inputs: [{ role: 'herb', ids: ['yarrow'], count: 2, weight: 2 }, { role: 'soother', ids: ['chamomile'], count: 1, weight: 1 }],
    output: { material: 'healingSalve', count: 2 } },
  manaTonic: { name: 'Mana tonic', skill: 'alchemy', tier: 3, station: 'alchemyLab',
    inputs: [{ role: 'herb', ids: ['moonpetal'], count: 2, weight: 3 }, { role: 'base', ids: ['mint'], count: 1, weight: 1 }],
    output: { material: 'manaTonic', count: 1 } },
  // ---- cooking ----
  heartyStew: { name: 'Hearty stew', skill: 'cooking', tier: 0, station: 'campfire',
    inputs: [{ role: 'meat', match: 'meat', count: 1, weight: 2 }, { role: 'veg', ids: ['potato'], count: 1, weight: 1 }, { role: 'flavor', ids: ['onion', 'pepper'], count: 1, weight: 1 }],
    output: { material: 'heartyStew', count: 2 } },
  // ---- scribing ----
  ironGallInk: { name: 'Iron-gall ink', skill: 'scribing', tier: 0, station: 'writingKit',
    inputs: [{ role: 'gall', ids: ['oakGall'], count: 2, weight: 2 }], output: { material: 'ink', count: 1 } },
  magicInk: { name: 'Crystal ink', skill: 'scribing', tier: 2, station: 'scriptorium',
    inputs: [{ role: 'ink', ids: ['ink'], count: 1, weight: 1 }, { role: 'dust', ids: ['crystalDust'], count: 1, weight: 3 }], output: { material: 'magicInk', count: 1 } },
};
