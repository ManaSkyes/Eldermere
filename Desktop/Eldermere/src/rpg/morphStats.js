// src/rpg/morphStats.js — stats from the body itself.
//
// The body (not a menu pick) decides these starting modifiers, so a transformation later changes
// stats the same way character creation does:
//   - species: each race and lineage's modifiers, weighted by how much of the body is that species
//     (part-weighted, from bodyState.totals()). A full-blooded body gets exactly the race's modifiers.
//   - sex: symmetric around androgynous. Masculine features push toward Strength and Endurance,
//     feminine toward Finesse and Spirit. Every part counts by its weight, so the more (and the more
//     strongly) features lean one way, the bigger the bonuses and penalties.
//   - build: muscle, weight, height and proportions (sliders 0..1, 0.5 = average).
//   - age: life stages per race. Youth is quick and lucky but unseasoned; age brings knowledge and
//     will at the cost of the body.
// Every axis is zero-sum at its extremes, matching the creation balance rule.

export const SEX_MODS = { strength: 6, endurance: 4, finesse: -6, spirit: -4 };   // per unit of masculinity (-1 fem .. 1 masc)

// per unit of slider distance from average (-1 at 0, +1 at 1)
export const BUILD_MODS = {
  muscle: { name: 'Muscle', mods: { strength: 12, endurance: 4, finesse: -8, speed: -8 } },
  weight: { name: 'Weight', mods: { endurance: 12, strength: 6, speed: -10, dexterity: -8 } },
  height: { name: 'Height', mods: { strength: 8, endurance: 2, finesse: -6, speed: -4 } },
  proportions: { name: 'Proportions', mods: { charisma: 8, finesse: 2, endurance: -5, strength: -5 } },
};

// years at the young end of the age slider (0) and the old end (1)
export const LIFESPAN = {
  human: { young: 18, old: 90 }, elf: { young: 100, old: 900 }, solcaste: { young: 20, old: 160 },
  draconian: { young: 20, old: 250 }, therian: { young: 16, old: 70 }, piscine: { young: 18, old: 140 },
};
const YOUTH = { speed: 6, luck: 4, mind: -5, intelligence: -5 };                       // at the young end
const ELDER = { intelligence: 8, mind: 8, spirit: 4, strength: -8, endurance: -6, speed: -6 };   // at the old end

// Detail sliders (the Body and Face tabs): each slider adds a small zero-sum effect, chosen by what it shapes.
// First matching rule wins; values are per full slider (signed sliders -1..1, others 0..1).
// Sliders that only move or turn a feature have no effect.
export const DETAIL_RULES = [
  [/trans-|angle|rot-|-push|valgus|navel|epicanthus|eyefold|corner|height\d|septum|nostrils-angle|head-(oval|round|square|rectangular|triangular|invertedtriangular|diamond)|ear-shape|chin-triangle/, {}],
  [/muscle|pectoral|dorsi|vshape/, { strength: 3, endurance: 1, finesse: -2, speed: -2 }],
  [/-fat|stomach|double|buttocks/, { endurance: 2, strength: 1, speed: -2, dexterity: -1 }],
  [/measure-shoulder|torso-scale-horiz/, { strength: 3, finesse: -3 }],
  [/waist|hips-circ|hip-scale/, { endurance: 2, speed: -2 }],
  [/bust|frontchest|torso-scale-depth/, { endurance: 2, finesse: -2 }],
  [/torso-scale-vert|napetowaist/, { endurance: 2, speed: -2 }],
  [/upperleg-scale-vert|upperleg-height|lowerleg-scale-vert|lowerleg-height/, { speed: 3, endurance: -3 }],
  [/thigh|calf|knee|ankle|upperleg|lowerleg/, { strength: 2, speed: -2 }],
  [/arm-length|upperarm-scale-vert|lowerarm-scale-vert/, { dexterity: 3, strength: -3 }],
  [/fingers-length|fingers-distance/, { finesse: 3, strength: -3 }],
  [/fingers-diameter|hand-scale|wrist/, { strength: 2, finesse: -2 }],
  [/upperarm|lowerarm/, { strength: 2, dexterity: -2 }],
  [/foot/, { endurance: 1, speed: -1 }],
  [/neck/, { endurance: 2, charisma: -2 }],
  [/forehead/, { intelligence: 2, charisma: -2 }],
  [/head-/, { endurance: 1, finesse: -1 }],
  [/eyebrows/, { mind: 1, charisma: -1 }],
  [/eye-scale/, { spirit: 2, endurance: -2 }],
  [/eye-bag/, { mind: 1, speed: -1 }],
  [/eye/, { mind: 1, luck: -1 }],
  [/ear/, { spirit: 2, endurance: -2 }],
  [/chin|jaw|cheek-bones/, { endurance: 2, finesse: -2 }],
  [/mouth|lip|cupid|dimple|cheek|philtrum/, { charisma: 2, mind: -2 }],
  [/nose/, { mind: 1, charisma: -1 }],
];
// the chest sliders (0..1, average 0.5; the others are signed and only move it)
export const CHEST_MODS = { bust: { charisma: 2, endurance: 1, speed: -2, finesse: -1 }, firmness: { charisma: 1, luck: -1 } };
export function detailMods(details = {}, params = {}) {
  const out = {};
  for (const [id, v] of Object.entries(details)) {
    if (!v) continue;
    const rule = DETAIL_RULES.find(([re]) => re.test(id));
    if (rule) add(out, rule[1], v);
  }
  for (const [k, mods] of Object.entries(CHEST_MODS)) add(out, mods, ((params[k] ?? 0.5) - 0.5) * 2);
  return out;
}

export function ageInfo(raceId, age) {
  const L = LIFESPAN[raceId] || LIFESPAN.human;
  const years = Math.round(L.young + (L.old - L.young) * Math.pow(age, 1.4));
  const stage = age < 0.2 ? 'Young' : age < 0.55 ? 'Prime' : age < 0.8 ? 'Seasoned' : 'Elder';
  return { years, stage };
}

const add = (into, mods, k = 1) => { for (const [s, v] of Object.entries(mods)) into[s] = (into[s] || 0) + v * k; return into; };
const round = mods => Object.fromEntries(Object.entries(mods).map(([k, v]) => [k, Math.round(v)]).filter(([, v]) => v !== 0));

// species key ('therian:feline') -> the creation data's race and lineage modifiers.
// viewerRaces: races.js RACES (ids and lineage order); creationRaces: creation.js RACES (same ids and order)
export function speciesModsFor(key, viewerRaces, creationRaces) {
  const [rid, subName] = key.split(':');
  const vr = viewerRaces.find(r => r.id === rid), cr = creationRaces.find(r => r.id === rid);
  if (!vr || !cr) return {};
  const si = Math.max(0, vr.subraces.findIndex(s => s.name.toLowerCase() === subName));
  const sub = cr.subs[si] || cr.subs[0];
  return add(add({}, cr.mods.main || {}), sub.mods.main || {});
}

// body: { params, bodySex (-1 masc .. 1 fem, as bodyState.bodySex()), totals (bodyState.totals()), raceId }
// Returns { main: { stat: delta }, parts: [{ name, mods }] } (parts: the breakdown, for the stat sheet)
export function bodyMods(body, viewerRaces, creationRaces) {
  const parts = [];
  // species, weighted by the body
  const sp = {};
  for (const [key, share] of Object.entries(body.totals.species || {})) if (share > 0.001) add(sp, speciesModsFor(key, viewerRaces, creationRaces), share);
  parts.push({ name: 'Species', mods: round(sp) });
  // sex: masculinity is the negative of bodySex
  parts.push({ name: 'Body sex', mods: round(add({}, SEX_MODS, -body.bodySex)) });
  // build
  const p = body.params;
  const build = {};
  for (const [k, def] of Object.entries(BUILD_MODS)) add(build, def.mods, ((p[k] ?? 0.5) - 0.5) * 2);
  parts.push({ name: 'Build', mods: round(build) });
  parts.push({ name: 'Features', mods: round(detailMods(body.details, p)) });
  // age
  const a = p.age ?? 0, ag = {};
  add(ag, YOUTH, Math.max(0, (0.2 - a) / 0.2));
  add(ag, ELDER, Math.max(0, (a - 0.55) / 0.45));
  parts.push({ name: `Age (${ageInfo(body.raceId, a).stage.toLowerCase()})`, mods: round(ag) });
  const main = {};
  for (const x of parts) add(main, x.mods);
  return { main: round(main), parts };
}

// species skill modifiers (lineage skills), weighted the same way
export function speciesSkills(totals, viewerRaces, creationRaces) {
  const out = {};
  for (const [key, share] of Object.entries(totals.species || {})) {
    if (share <= 0.001) continue;
    const [rid, subName] = key.split(':');
    const vr = viewerRaces.find(r => r.id === rid), cr = creationRaces.find(r => r.id === rid);
    if (!vr || !cr) continue;
    const si = Math.max(0, vr.subraces.findIndex(s => s.name.toLowerCase() === subName));
    const sub = cr.subs[si] || cr.subs[0];
    add(out, cr.mods.skills || {}, share); add(out, sub.mods.skills || {}, share);
  }
  return round(out);
}
