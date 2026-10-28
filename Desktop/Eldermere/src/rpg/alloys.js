// src/rpg/alloys.js — alloys from compositions.
//
//   const a = alloy({ iron: 99.2, carbon: 0.8 });          // steel
//   alloy({ iron: 99.75, carbon: 0.25 }, { process: 'folded' })   // damascus
//   a.name -> 'Steel', a.props -> { hardness, toughness, edge, density, conduct, corrosion, ... }
//
// A composition is parts by weight of metals (src/data/materials.js METALS) plus the additives
// below. If it falls inside a named alloy's ranges, the alloy's strengths apply, strongest at its
// ideal mix and fading toward the edges, and the alloy's trade-off (e.g. more carbon: harder but
// more brittle steel) shifts the result. Outside every range it's an unnamed mix: just the
// weighted average of its parts, usually worse than any of them.
//
// Ladder (weakest to strongest in practice): copper, orichalcum (brass), bronze, iron, damascus,
// steel, then the magical metals starting with mithril.
import { METALS } from '../data/materials.js';

// Additives that aren't metals.
export const ADDITIVES = {
  carbon:      { name: 'Carbon',       props: { hardness: 0, toughness: 0, edge: 0, density: 20, conduct: 0, corrosion: 0 }, from: ['charcoal', 'coal'] },
  crystalDust: { name: 'Crystal dust', props: { hardness: 20, toughness: 10, edge: 10, density: 30, conduct: 80, corrosion: 50 }, from: ['crystalDust'], magic: true },
};
const PART = id => METALS[id] || ADDITIVES[id];
const KEYS = ['hardness', 'toughness', 'edge', 'density', 'conduct', 'corrosion', 'warding'];

// parts: { component: [min, ideal, max] } in percent. boost: multipliers at the ideal mix.
// vary: { by, effects } — along component `by`, from its min (-1) to max (+1), add effects * t.
// process: a working method the alloy needs besides its mix (damascus must be folded).
export const ALLOYS = {
  orichalcum: { name: 'Orichalcum', tier: 1, note: 'brass: golden, easy to cast, resists corrosion; soft for a weapon',
    parts: { copper: [60, 70, 80], zinc: [20, 30, 40] },
    boost: { hardness: 2.4, edge: 2.0, corrosion: 1.4, conduct: 1.2 },
    vary: { by: 'zinc', effects: { hardness: 6, toughness: -6 } } },
  bronze: { name: 'Bronze', tier: 1, note: 'the first true weapon metal',
    parts: { copper: [85, 88, 92], tin: [8, 12, 15] },
    boost: { hardness: 3.2, edge: 3.0, toughness: 1.1, corrosion: 1.3 },
    vary: { by: 'tin', effects: { hardness: 8, toughness: -10 } } },
  pewter: { name: 'Pewter', tier: 1, note: 'tableware and trinkets',
    parts: { tin: [85, 92, 99], copper: [0, 6, 10], lead: [0, 2, 5] },
    boost: { hardness: 2.0, corrosion: 1.1 } },
  damascus: { name: 'Damascus', tier: 2, process: 'folded', note: 'folded, layered iron: a step up from plain iron toward steel, with the telltale banding',
    parts: { iron: [99.5, 99.75, 99.9], carbon: [0.1, 0.25, 0.5] },
    boost: { hardness: 1.4, edge: 1.5, toughness: 1.25 },
    vary: { by: 'carbon', effects: { hardness: 6, edge: 6, toughness: -5 } } },
  steel: { name: 'Steel', tier: 3, note: 'iron and carbon; the carbon decides everything',
    parts: { iron: [98, 99.2, 99.8], carbon: [0.2, 0.8, 2.0] },
    boost: { hardness: 1.9, edge: 2.0, toughness: 1.15 },
    // mild steel bends, high-carbon steel takes a razor edge and shatters
    vary: { by: 'carbon', effects: { hardness: 10, edge: 10, toughness: -18 } } },
  electrum: { name: 'Electrum', tier: 4, note: 'gold and silver; carries mana beautifully',
    parts: { gold: [45, 60, 80], silver: [20, 40, 55] },
    boost: { hardness: 1.8, conduct: 1.15 } },
  moonsilver: { name: 'Moonsilver', tier: 4, proposed: true, note: 'silver bound with crystal dust; wards against shadow and the undead',
    parts: { silver: [85, 90, 95], crystalDust: [5, 10, 15] },
    boost: { hardness: 2.5, edge: 2.5, conduct: 1.2, warding: 1.5 } },
  mithril: { name: 'Mithril', tier: 5, magic: true, note: 'the first magical metal: aluminium and magic dust, light as a feather and harder than steel',
    parts: { aluminium: [70, 80, 90], crystalDust: [10, 20, 30] },
    boost: { hardness: 5.5, edge: 5.8, toughness: 1.8, conduct: 2.0 },
    vary: { by: 'crystalDust', effects: { conduct: 12, toughness: -8 } } },
};

function normalize(comp) {
  const total = Object.values(comp).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries(comp).filter(([, v]) => v > 0).map(([k, v]) => [k, v / total * 100]));
}
function average(comp) {
  const out = Object.fromEntries(KEYS.map(k => [k, 0]));
  for (const [id, pct] of Object.entries(comp)) {
    const p = PART(id)?.props; if (!p) throw new Error(`Unknown alloy component: ${id}`);
    for (const k of KEYS) out[k] += (p[k] ?? 0) * pct / 100;
  }
  return out;
}
// How well a composition matches an alloy: null if outside, else 0..1 (1 at the ideal).
function match(def, comp) {
  const ids = Object.keys(comp);
  if (ids.some(id => !(id in def.parts))) return null;
  let worst = 1;
  for (const [id, [lo, ideal, hi]] of Object.entries(def.parts)) {
    const v = comp[id] ?? 0;
    if (v < lo - 1e-9 || v > hi + 1e-9) return null;
    const span = v < ideal ? ideal - lo : hi - ideal;
    worst = Math.min(worst, span > 0 ? 1 - Math.abs(v - ideal) / span : 1);
  }
  return worst;
}

// The result of melting a composition together.
export function alloy(composition, { process = null } = {}) {
  const comp = normalize(composition), base = average(comp);
  let best = null;
  for (const [id, def] of Object.entries(ALLOYS)) {
    if ((def.process || null) !== process && def.process) continue;   // needs its working method
    const fit = match(def, comp);
    if (fit !== null && (!best || fit > best.fit)) best = { id, def, fit };
  }
  const props = { ...base };
  let name, tier, id = null, purity = 0, magic = false;
  if (best) {
    const { def, fit } = best;
    id = best.id; name = def.name; tier = def.tier; magic = !!def.magic;
    purity = fit;
    const strength = 0.5 + 0.5 * fit;                       // even an edge-of-range mix keeps half the benefit
    for (const [k, mult] of Object.entries(def.boost)) props[k] = base[k] * (1 + (mult - 1) * strength);
    if (def.vary) {
      const [lo, , hi] = def.parts[def.vary.by], v = comp[def.vary.by] ?? 0;
      const t = hi > lo ? (v - lo) / (hi - lo) * 2 - 1 : 0;
      for (const [k, e] of Object.entries(def.vary.effects)) props[k] += e * t;
    }
  } else {
    const ids = Object.keys(comp);
    if (ids.length === 1) { id = ids[0]; name = PART(ids[0]).name; tier = METALS[ids[0]]?.tier ?? 0; purity = 1; }
    else {
      name = 'Unrefined ' + ids.sort((a, b) => comp[b] - comp[a]).slice(0, 2).map(i => PART(i).name.toLowerCase()).join('-') + ' mix';
      tier = Math.max(...ids.map(i => METALS[i]?.tier ?? 0));
      for (const k of ['hardness', 'toughness', 'edge']) props[k] *= 0.85;   // impurities weaken it
    }
  }
  for (const k of KEYS) if (k !== 'density') props[k] = Math.max(0, Math.min(100, props[k]));
  for (const k of KEYS) props[k] = Math.round(props[k] * 10) / 10;
  return { id, name, tier, magic, purity: Math.round(purity * 100) / 100, composition: comp, props };
}
