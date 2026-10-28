// src/data/weaponTrees.js — a skill tree for each weapon.
//
// A node is bought with a point once its weapon skill gate is reached (and its prerequisites are met).
// Points come from using the weapon: one per 50 skill gained up to 1000, then one per 500 beyond.
// Node kinds: 'active' (a technique with its own input, used in combat), 'passive' (always on).
// Branches: nodes with a `branch` are paths that exclude each other; buying the first node of one
// closes the other (respec later, at a trainer). Combat isn't built yet, so effects are data.
//
//   gate:     minimum weapon skill (ranks: 201 Apprentice, 501 Journeyman, 1001 Expert, 5001 Master)
//   ranks:    how many times it can be bought (one point each)
//   needs:    [nodeId, ...] (any one of them, at rank 1+, satisfies `needsAny`)
//   effect:   per rank, for the combat system to read later

export const POINTS = { per: 50, until: 1000, perAfter: 500, from: 100 };
export function weaponPoints(skill) {
  const v = Math.floor(skill);
  const early = Math.floor((Math.min(v, POINTS.until) - POINTS.from) / POINTS.per);
  const late = v > POINTS.until ? Math.floor((v - POINTS.until) / POINTS.perAfter) : 0;
  return Math.max(0, early) + late;
}

const node = (id, name, kind, gate, text, extra = {}) => ({ id, name, kind, gate, text, ranks: 1, ...extra });

export const WEAPON_TREES = {
  mace: {
    name: 'Mace',
    intro: 'Weight and will. The mace breaks what blades glance off.',
    branches: {
      crusher: { name: 'Crusher', text: 'Break armor and bodies. Offense.' },
      warden:  { name: 'Warden', text: 'Guard, turn blows aside, punish. Defense.' },
    },
    nodes: [
      node('heavySwing', 'Heavy swing', 'passive', 150, 'Mace damage +4% per rank.', { ranks: 3, effect: { damagePct: 4 } }),
      node('boneBreaker', 'Bone breaker', 'passive', 150, 'Your hits stagger 10% more per rank.', { ranks: 2, effect: { staggerPct: 10 } }),
      node('overheadSmash', 'Overhead smash', 'active', 200, 'Hold attack to charge an overhead blow: up to 1.8× damage and a heavy stagger. 20 stamina.', { needs: ['heavySwing'], effect: { charge: 1.8, stamina: 20 } }),

      node('armorCrack', 'Armor crack', 'passive', 250, 'Hits crack armor: −5% of the target\'s armor per rank, stacking 3 times for 8 s.', { ranks: 3, branch: 'crusher', effect: { armorShredPct: 5, stacks: 3, seconds: 8 } }),
      node('groundSlam', 'Ground slam', 'active', 400, 'Slam the ground: damage and knockdown in a 3 m circle. 35 stamina.', { branch: 'crusher', needs: ['armorCrack'], effect: { radius: 3, stamina: 35 } }),
      node('guardedGrip', 'Guarded grip', 'passive', 250, 'Blocking with a mace (or mace and shield) costs 10% less stamina per rank.', { ranks: 3, branch: 'warden', effect: { blockCostPct: -10 } }),
      node('counterBash', 'Counter bash', 'active', 400, 'Right after a well-timed block, a stunning counterstrike.', { branch: 'warden', needs: ['guardedGrip'], effect: { stunSeconds: 1.5 } }),

      node('momentum', 'Momentum', 'passive', 550, 'Each hit within 2 s of the last: attack speed +4% per rank, up to 3 stacks.', { ranks: 3, effect: { speedPct: 4, stacks: 3 } }),
      node('concussiveBlow', 'Concussive blow', 'active', 700, 'A blow to the head that dazes for 2 s. Large foes and bosses resist.', { needs: ['overheadSmash'], effect: { dazeSeconds: 2 } }),

      node('shatter', 'Shatter', 'active', 1200, 'Break a raised shield, or armor already cracked, outright.', { branch: 'crusher', needs: ['groundSlam'] }),
      node('bulwark', 'Bulwark', 'passive', 1200, 'While your guard is up, allies within 4 m take 10% less damage.', { branch: 'warden', needs: ['counterBash'], effect: { allyReductionPct: 10, radius: 4 } }),
      node('ironWill', 'Iron will', 'passive', 1500, 'Stagger resistance +15% per rank while holding a mace.', { ranks: 2, effect: { staggerResistPct: 15 } }),

      node('earthshaker', 'Earthshaker', 'active', 5001, 'A leaping smash that splits the ground in a line, knocking down all it touches.', { needsAny: ['shatter', 'bulwark'] }),
    ],
  },
};

// ---- state on the character: c.weaponTrees[weapon] = { nodes: { id: rank }, branch } ----
export const treeState = (c, weapon) => ((c.weaponTrees ??= {})[weapon] ??= { nodes: {}, branch: null });
export function pointsSpent(c, weapon) { return Object.values(c.weaponTrees?.[weapon]?.nodes || {}).reduce((t, n) => t + n, 0); }
export function pointsFree(c, weapon) { return weaponPoints(c.skills[weapon] ?? 100) - pointsSpent(c, weapon); }

// Whether a node can be bought now, and if not, why: { ok, reason }
export function canBuy(c, weapon, nodeId) {
  const tree = WEAPON_TREES[weapon], n = tree?.nodes.find(x => x.id === nodeId); if (!n) return { ok: false, reason: 'Unknown technique.' };
  const st = treeState(c, weapon), have = st.nodes[nodeId] ?? 0;
  if (have >= n.ranks) return { ok: false, reason: 'Fully learned.' };
  if ((c.skills[weapon] ?? 0) < n.gate) return { ok: false, reason: `Needs ${tree.name} ${n.gate}.` };
  if (n.branch && st.branch && st.branch !== n.branch) return { ok: false, reason: `You follow the ${tree.branches[st.branch].name} path.` };
  if (n.needs && !n.needs.every(id => (st.nodes[id] ?? 0) > 0)) return { ok: false, reason: `Needs ${n.needs.map(id => tree.nodes.find(x => x.id === id).name).join(' and ')}.` };
  if (n.needsAny && !n.needsAny.some(id => (st.nodes[id] ?? 0) > 0)) return { ok: false, reason: `Needs ${n.needsAny.map(id => tree.nodes.find(x => x.id === id).name).join(' or ')}.` };
  if (pointsFree(c, weapon) <= 0) return { ok: false, reason: 'No points. Use the weapon to earn more.' };
  return { ok: true };
}
export function buyNode(c, weapon, nodeId) {
  const r = canBuy(c, weapon, nodeId); if (!r.ok) return r;
  const n = WEAPON_TREES[weapon].nodes.find(x => x.id === nodeId), st = treeState(c, weapon);
  st.nodes[nodeId] = (st.nodes[nodeId] ?? 0) + 1;
  if (n.branch && !st.branch) st.branch = n.branch;
  return { ok: true };
}
