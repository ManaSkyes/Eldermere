// src/data/potions.js — transformation potions. Each changes the body by 10% of a feature's range.
//
// A potion's apply(body, { vitals, character }) gets the 3D character's body API (src/rpg/humanViewer.js in game mode):
//   body.body       the body state (src/rpg/bodyState.js): per-part species, masculine/feminine
//   body.params     the body sliders (height, muscle, weight, bust, ...; 0..1)
// After drinking, stats follow the new body (natural limits move, progress is kept): see play.js.
//
// Gender is identity and never changes with a potion; the masculine/feminine potions change the body.
import { BODY_PARTS, HUMAN } from '../rpg/bodyState.js';
import { RACES } from '../rpg/races.js';

const STEP = 0.1;                                   // 10% of a feature's range
const SEX_STEP = 0.2;                               // body sex runs -1..1, so 10% is 0.2
const colors = { human: '#d9b38c', elf: '#7fc29b', solcaste: '#d9a441', draconian: '#c0503a', therian: '#b58a5a', piscine: '#4aa3c9' };

export const POTIONS = {};
const add = (id, p) => { POTIONS[id] = { id, kind: 'potion', ...p }; };

// ---- race: every part 10% toward a lineage ----
RACES.forEach(r => r.subraces.forEach(sub => {
  const key = `${r.id}:${sub.name.toLowerCase()}`, name = sub.name.toLowerCase().includes(r.name.toLowerCase()) ? sub.name : `${sub.name} ${r.name.toLowerCase()}`;
  add(`race.${key}`, {
    name: `Essence: ${name}`, group: 'Race', color: colors[r.id] || '#aaa',
    text: `Every part of you becomes 10% more ${name}.`,
    apply(b) { for (const id of Object.keys(BODY_PARTS)) key === HUMAN ? b.body.setSpecies(id, HUMAN, b.body.species(id, HUMAN) + STEP) : b.body.shift(id, key, STEP); },
  });
}));

// ---- masculine / feminine: the whole body, or one part ----
add('sex.fem', { name: 'Tonic of the moon (feminine)', group: 'Body', color: '#e7a6c8', text: 'Your whole body becomes 10% more feminine.',
  apply(b) { for (const id of Object.keys(BODY_PARTS)) b.body.shiftSex(id, SEX_STEP); } });
add('sex.masc', { name: 'Tonic of the sun (masculine)', group: 'Body', color: '#7fa6e0', text: 'Your whole body becomes 10% more masculine.',
  apply(b) { for (const id of Object.keys(BODY_PARTS)) b.body.shiftSex(id, -SEX_STEP); } });
// parts whose masculine/feminine shape is drawn on the model
for (const id of ['face', 'neck', 'chest', 'torso', 'waist', 'hips', 'arms', 'hands', 'legs', 'feet']) {
  const part = BODY_PARTS[id].name.toLowerCase();
  add(`part.fem.${id}`, { name: `Feminizing salve: ${part}`, group: 'Parts', color: '#f0bcd6', text: `Your ${part} become 10% more feminine.`, apply(b) { b.body.shiftSex(id, SEX_STEP); } });
  add(`part.masc.${id}`, { name: `Masculinizing salve: ${part}`, group: 'Parts', color: '#9cbbe8', text: `Your ${part} become 10% more masculine.`, apply(b) { b.body.shiftSex(id, -SEX_STEP); } });
}

// ---- body features: the body sliders, 10% up or down ----
for (const [param, more, less, label] of [['height', 'Growth', 'Shrinking', 'height'], ['muscle', 'Bull\'s', 'Wasting', 'muscle'], ['weight', 'Hearty', 'Lean', 'weight'], ['bust', 'Fullness', 'Flattening', 'chest size'], ['proportions', 'Grace', 'Coarse', 'proportions']]) {
  add(`param.${param}.up`, { name: `${more} draught (+${label})`, group: 'Features', color: '#c9d77a', text: `Raises your ${label} by 10%.`, apply(b) { b.setParam(param, (b.params[param] ?? 0.5) + STEP); } });
  add(`param.${param}.down`, { name: `${less} draught (−${label})`, group: 'Features', color: '#8c9a5a', text: `Lowers your ${label} by 10%.`, apply(b) { b.setParam(param, (b.params[param] ?? 0.5) - STEP); } });
}

// ---- testing: drain health and mana so regeneration and resting can be seen ----
add('test.drain', { name: 'Draining tonic (test)', group: 'Test', color: '#5a4a6a', text: 'Drains half your health and mana, to watch them refill.',
  apply(b, ctx) { if (ctx?.vitals) { ctx.vitals.hp *= 0.5; ctx.vitals.mp *= 0.5; } } });

// One of everything, for testing.
export const TEST_KIT = Object.keys(POTIONS);
