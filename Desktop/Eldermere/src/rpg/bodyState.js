// src/rpg/bodyState.js — the character's body as data: every part tracked on its own.
//
// Each part has: species weights ({ 'human:common': 0.4, 'therian:feline': 0.6 }), sex from
// -1 (masculine) to +1 (feminine), size (-1..1, 0 = normal), and free-form traits. Parts that
// are never drawn (voice, nether) are tracked the same way, for stats and story.
// Story events and items change the body through this API; the renderer reads it; stats read
// the totals (race composition and sex score, weighted by how much each part counts).
//
//   body.shift('ears', 'therian:feline', 0.2)      // ears 20% more feline (others shrink to fit)
//   body.setSex('chest', 0.8)                       // chest strongly feminine
//   body.on('change', e => ...)                     // { part, field, before, after }
//   body.totals()                                   // { species: { key: share }, sex, parts }

// Parts and how much each counts toward the totals. `visible: false` parts are data only.
export const BODY_PARTS = {
  head: { name: 'Head', weight: 3 },          face: { name: 'Face', weight: 2 },
  muzzle: { name: 'Nose and mouth', weight: 1.5 }, ears: { name: 'Ears', weight: 1 },
  eyes: { name: 'Eyes', weight: 1 },          horns: { name: 'Horns', weight: 0.5 },
  hair: { name: 'Hair', weight: 0.5 },        skinFace: { name: 'Skin (face)', weight: 1 },
  skinBody: { name: 'Skin (body)', weight: 2 }, neck: { name: 'Neck', weight: 0.5 },
  chest: { name: 'Chest', weight: 1 },        torso: { name: 'Torso', weight: 2 },
  waist: { name: 'Waist', weight: 0.7 },      hips: { name: 'Hips', weight: 1 },
  arms: { name: 'Arms', weight: 1 },          hands: { name: 'Hands', weight: 0.7 },
  legs: { name: 'Legs', weight: 1.5 },        feet: { name: 'Feet', weight: 0.7 },
  tail: { name: 'Tail', weight: 1 },          wings: { name: 'Wings', weight: 1 },
  voice: { name: 'Voice', weight: 0.5, visible: false }, nether: { name: 'Nether', weight: 1, visible: false },
};
export const HUMAN = 'human:common';
// parts whose sex counts toward the overall body shape (the rest only count in the sex score)
const BODY_SHAPE_PARTS = ['torso', 'waist', 'hips', 'arms', 'legs', 'neck', 'face', 'head'];

export function createBodyState(init = {}) {
  const parts = {};
  for (const id of Object.keys(BODY_PARTS)) {
    const p = init.parts?.[id];
    parts[id] = { species: { ...(p?.species || { [HUMAN]: 1 }) }, sex: p?.sex ?? 0, size: p?.size ?? 0, traits: { ...(p?.traits || {}) } };
  }
  const listeners = new Set();
  const emit = (part, field, before, after) => { for (const f of listeners) f({ part, field, before, after }); };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const norm = sp => {
    // keep the weights summing to 1: what isn't any other species is human
    let other = 0; for (const [k, v] of Object.entries(sp)) if (k !== HUMAN) { sp[k] = clamp(v, 0, 1); other += sp[k]; }
    if (other > 1) { for (const k of Object.keys(sp)) if (k !== HUMAN) sp[k] /= other; other = 1; }
    sp[HUMAN] = 1 - other;
    for (const k of Object.keys(sp)) if (sp[k] < 1e-4 && k !== HUMAN) delete sp[k];
    return sp;
  };
  const body = {
    parts,
    get: id => parts[id],
    species: (id, key) => parts[id].species[key] || 0,
    // set how much of a part is one species (the rest rebalances; human fills what's left)
    setSpecies(id, key, amount) {
      const before = { ...parts[id].species };
      if (key === HUMAN) {
        // more human: scale every other species down to fit
        const others = Object.entries(before).filter(([k]) => k !== HUMAN), sum = others.reduce((t, [, v]) => t + v, 0) || 1;
        for (const [k, v] of others) parts[id].species[k] = v / sum * (1 - clamp(amount, 0, 1));
      } else {
        const rest = Object.entries(before).filter(([k]) => k !== HUMAN && k !== key), restSum = rest.reduce((t, [, v]) => t + v, 0);
        const a = clamp(amount, 0, 1);
        if (restSum + a > 1) for (const [k, v] of rest) parts[id].species[k] = v / restSum * (1 - a);
        parts[id].species[key] = a;
      }
      norm(parts[id].species); emit(id, 'species', before, { ...parts[id].species });
    },
    shift(id, key, delta) { body.setSpecies(id, key, body.species(id, key) + delta); },
    setSex(id, v) { const b = parts[id].sex; parts[id].sex = clamp(v, -1, 1); emit(id, 'sex', b, parts[id].sex); },
    shiftSex(id, d) { body.setSex(id, parts[id].sex + d); },
    setSize(id, v) { const b = parts[id].size; parts[id].size = clamp(v, -1, 1); emit(id, 'size', b, parts[id].size); },
    setTrait(id, k, v) { const b = parts[id].traits[k]; parts[id].traits[k] = v; emit(id, 'trait:' + k, b, v); },
    // apply to many parts at once (a race preset, a full transformation)
    setAll(fn) { for (const id of Object.keys(parts)) fn(id, parts[id]); emit('*', 'all', null, null); },
    preset(key, strength) {
      body.setAll((id, p) => { p.species = key === HUMAN || key.startsWith('human:') ? { [key]: 1 } : norm({ [key]: strength }); if (key.startsWith('human:') && key !== HUMAN) p.species = norm({ [key]: strength }); });
    },
    setSexAll(v) { body.setAll((id, p) => { p.sex = clamp(v, -1, 1); }); },
    // overall body sex (for the whole-body shape), and the totals stats read
    bodySex() { return BODY_SHAPE_PARTS.reduce((t, id) => t + parts[id].sex * BODY_PARTS[id].weight, 0) / BODY_SHAPE_PARTS.reduce((t, id) => t + BODY_PARTS[id].weight, 0); },
    totals() {
      const species = {}; let W = 0, sex = 0;
      for (const [id, def] of Object.entries(BODY_PARTS)) {
        W += def.weight; sex += parts[id].sex * def.weight;
        for (const [k, v] of Object.entries(parts[id].species)) species[k] = (species[k] || 0) + v * def.weight;
      }
      for (const k of Object.keys(species)) species[k] /= W;
      return { species, sex: sex / W, parts: JSON.parse(JSON.stringify(parts)) };
    },
    on(type, fn) { if (type === 'change') listeners.add(fn); return () => listeners.delete(fn); },
    toJSON() { return { parts: JSON.parse(JSON.stringify(parts)) }; },
    load(data) { const n = createBodyState(data); for (const id of Object.keys(parts)) parts[id] = n.parts[id]; emit('*', 'load', null, null); },
  };
  return body;
}

// ---------------------------------------------------------------------------------------
// Resolve the body state into what the renderer needs. `layers` maps species keys to race
// layers (macro / details / custom / attach / cover / eyes); each feature reads the part it
// belongs to.
// ---------------------------------------------------------------------------------------
const detailPart = k => k.startsWith('ear-') ? 'ears' : (k.startsWith('nose-') || k.startsWith('mouth-')) ? 'muzzle'
  : (k.startsWith('eye') ) ? 'eyes' : k.startsWith('neck-') ? 'neck' : k.startsWith('measure-') ? 'torso' : k.startsWith('hand-') ? 'hands' : 'face';
const customPart = k => k === 'race-ears-long' ? 'ears' : k.startsWith('species-') ? 'head' : k === 'race-snout' ? 'muzzle' : 'face';
const attachPart = k => k.startsWith('tail') ? 'tail' : k === 'horns' ? 'horns' : /Ears$/.test(k) ? 'ears' : k.startsWith('wings') ? 'wings' : (k === 'webbing' || k === 'claws') ? 'hands' : k === 'armWings' ? 'arms' : 'muzzle';
const BODY_MACRO_PARTS = ['torso', 'chest', 'arms', 'legs', 'hips', 'neck'];

export function resolveBody(body, layers) {
  const R = { macro: {}, details: {}, custom: {}, attach: {}, cover: null, eyes: null, hornColor: '#d8ccb0' };
  const w = (part, key) => body.species(part, key);
  const bodyW = key => BODY_MACRO_PARTS.reduce((t, p) => t + w(p, key), 0) / BODY_MACRO_PARTS.length;
  let bestCover = null, bestCoverW = 0, bestEyes = null, bestEyesW = 0.5, bestHorn = 0;
  for (const [key, L] of Object.entries(layers)) {
    const bw = bodyW(key);
    for (const [k, v] of Object.entries(L.macro)) R.macro[k] = (R.macro[k] || 0) + v * bw;
    for (const [k, v] of Object.entries(L.details)) R.details[k] = (R.details[k] || 0) + v * w(detailPart(k), key);
    for (const [k, v] of Object.entries(L.custom)) R.custom[k] = (R.custom[k] || 0) + v * w(customPart(k), key);
    for (const [k, a] of Object.entries(L.attach)) R.attach[k] = (R.attach[k] || 0) + a.size * w(attachPart(k), key);
    if (L.cover) {
      const cw = w('skinFace', key) + w('skinBody', key);
      if (cw > bestCoverW) { bestCoverW = cw; bestCover = { ...L.cover, face: L.cover.face * w('skinFace', key), body: L.cover.body * w('skinBody', key) }; }
    }
    if (L.eyes && w('eyes', key) > bestEyesW) { bestEyesW = w('eyes', key); bestEyes = L.eyes; }
    const hw = Math.max(w('horns', key), w('muzzle', key));
    if (Object.keys(L.attach).length && hw > bestHorn) { bestHorn = hw; R.hornColor = L.hornColor; }
  }
  R.cover = bestCover; R.eyes = bestEyes;
  // sex: the whole-body shape follows the body parts; the chest has its own
  R.fem = (body.bodySex() + 1) / 2; R.chestFem = (body.parts.chest.sex + 1) / 2;
  return R;
}
