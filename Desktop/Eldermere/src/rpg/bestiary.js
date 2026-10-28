// src/rpg/bestiary.js — what your character has learned about each creature (the journal's Bestiary tab).
//
// Kept on the character (c.bestiary, saved with it), filled in as you go:
//   killing one (or catching it, for fish) unlocks its page and records the level and health you met it at;
//   striking it with a damage type reveals how it takes that type (only types you've actually used);
//   each harvest stage you've done on it (skin, butcher, ...) reveals the most that stage can give.
//   c.bestiary[id] = { kills, minLv, maxLv, minHp, maxHp, res: { slash: true, ... }, stages: { skin: true, ... }, first }
const entry = (c, id) => ((c.bestiary ||= {})[id] ||= { kills: 0, minLv: null, maxLv: null, minHp: null, maxHp: null, res: {}, stages: {} });
const lo = (a, b) => a == null ? b : Math.min(a, b), hi = (a, b) => a == null ? b : Math.max(a, b);

// a kill (or a catch): unlocks the page; level and health as met
export function learnKill(c, id, { level = null, hp = null } = {}) {
  const e = entry(c, id); e.kills++; e.first ||= Date.now();
  if (level != null) { e.minLv = lo(e.minLv, level); e.maxLv = hi(e.maxLv, level); }
  if (hp != null) { e.minHp = lo(e.minHp, Math.round(hp)); e.maxHp = hi(e.maxHp, Math.round(hp)); }
  return e;
}
// struck with a damage type: how it takes that type is now known
export function learnHit(c, id, type) { if (type) entry(c, id).res[type] = true; }
// a harvest stage done on it: what that stage can give is now known
export function learnStage(c, id, stage) { if (stage) entry(c, id).stages[stage] = true; }
export const known = (c, id) => !!c.bestiary?.[id]?.kills;
export const knownIds = c => Object.keys(c.bestiary || {}).filter(id => c.bestiary[id].kills > 0);
