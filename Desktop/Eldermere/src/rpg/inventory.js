// src/rpg/inventory.js — the pack: material stacks graded by quality, and unique items.
//
// Materials stack by id. Each stack keeps:
//   unknown: true qualities of units not yet appraised (hidden from the player)
//   grades:  { 0: n, 10: n, ... 100: n } appraised units by grade
// Hovering a stack shows its grades (stackSummary). Crafting uses only appraised units.
//
// Unique items (crafted gear, anything with its own material, quality, enchantments or wear) are
// kept one by one: { uid, item, material, quality, durability, maxDurability, enchantments, maker }.
import { grade, GRADES, GRADE_NAMES, appraise } from './quality.js';
import { MATERIALS } from '../data/materials.js';

export function createInventory() { return { stacks: {}, items: [] }; }

function stackOf(inv, id) { return inv.stacks[id] || (inv.stacks[id] = { unknown: [], grades: {} }); }

// Add units of a material. Quality rounds to the nearest 10; a result of 0 (raw quality 0..4)
// is a failure and creates no item. known: true if quality is already known; otherwise it is
// stored unappraised. Returns the number of units actually added.
export function addMaterial(inv, id, quality, count = 1, known = false) {
  const g = grade(quality);
  if (g === 0 || count <= 0) return 0;
  const st = stackOf(inv, id);
  if (known) st.grades[g] = (st.grades[g] || 0) + count;
  else for (let i = 0; i < count; i++) st.unknown.push(quality);
  return count;
}

// Try to appraise every unknown unit of a stack. Returns { appraised, failed, ruined }.
// `failed` remains unappraised for another attempt; `ruined` rounded to quality 0 and is discarded.
export function appraiseStack(inv, c, id, rand = Math.random) {
  const st = inv.stacks[id]; if (!st) return { appraised: 0, failed: 0, ruined: 0 };
  const still = []; let appraised = 0, ruined = 0;
  for (const q of st.unknown) {
    const g = appraise(c, id, q, rand);
    if (g === null) still.push(q);
    else if (g === 0) ruined++;
    else { st.grades[g] = (st.grades[g] || 0) + 1; appraised++; }
  }
  const failed = still.length; st.unknown = still;
  return { appraised, failed, ruined };
}

export const countOf = (inv, id, minGrade = 0) => Object.entries(inv.stacks[id]?.grades || {}).reduce((t, [g, n]) => t + (+g >= minGrade ? n : 0), 0);

// Take appraised units, best grades first unless `lowest` is set. Returns the grades taken
// (e.g. [70, 70, 60]) or null if there aren't enough.
export function takeMaterial(inv, id, count = 1, { minGrade = 0, lowest = false } = {}) {
  const st = inv.stacks[id]; if (!st || countOf(inv, id, minGrade) < count) return null;
  const order = GRADES.filter(g => g >= minGrade); if (!lowest) order.reverse();
  const taken = [];
  for (const g of order) while (taken.length < count && (st.grades[g] || 0) > 0) { st.grades[g]--; taken.push(g); }
  for (const g of Object.keys(st.grades)) if (!st.grades[g]) delete st.grades[g];
  return taken;
}

// What hovering a stack shows: total, unappraised count, and each grade held.
export function stackSummary(inv, id) {
  const st = inv.stacks[id] || { unknown: [], grades: {} };
  const grades = GRADES.filter(g => st.grades[g]).reverse().map(g => ({ grade: g, name: GRADE_NAMES[g], count: st.grades[g] }));
  return { id, name: MATERIALS[id]?.name ?? id, unappraised: st.unknown.length, total: st.unknown.length + grades.reduce((t, x) => t + x.count, 0), grades };
}

// ---- unique items ----
let nextUid = 1;
export function addItem(inv, item) {
  const it = { uid: item.uid || `${Date.now().toString(36)}-${(nextUid++).toString(36)}`, enchantments: [], ...item };
  inv.items.push(it); return it;
}
export const removeItem = (inv, uid) => { const i = inv.items.findIndex(x => x.uid === uid); return i < 0 ? null : inv.items.splice(i, 1)[0]; };
