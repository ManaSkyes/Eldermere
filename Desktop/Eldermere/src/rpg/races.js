// src/rpg/races.js — race and subrace presets, layered on top of the player's own sliders.
//
// A race is a set of offsets: body (macro) params, face/body detail sliders (MakeHuman modifier
// ids), custom morph targets, plus suggested skin tones and the parts that species adds
// (horns, tails, ears, fins, scales, fur: not built yet, listed as `parts`).
// Everything is scaled by the race strength (0..1), which is what transformations and
// half-bloods use: a half-elf is the elf layer at about half strength.

export const RACES = [
  {
    id: 'human', name: 'Human', skins: ['#f6e0d2', '#e8c4ae', '#d6a888', '#b98563', '#8d5b3d', '#62402b'],
    subraces: [
      { name: 'Common' },
      { name: 'Stout', macro: { weight: 0.15, muscle: 0.1, height: -0.12 } },
      { name: 'Half-elf', macro: { height: 0.06, weight: -0.05 }, custom: { 'race-ears-long': 0.4 }, details: { 'ear-shape-pointed': 0.5, 'cheek-bones': 0.2 } },
      { name: 'Half-Solcaste', macro: { height: -0.25, muscle: 0.12 }, custom: { 'race-brow-heavy': 0.4, 'race-jaw-broad': 0.4 }, details: { 'measure-shoulder-dist': 0.3 } },
    ],
  },
  {
    id: 'elf', name: 'Elf', base: { macro: { height: 0.15, weight: -0.12 }, custom: { 'race-ears-long': 1 }, details: { 'ear-shape-pointed': 1, 'cheek-bones': 0.4, 'chin-triangle': 0.3, 'eye-corner2': 0.3 } },
    skins: ['#f4e4d8', '#e6cdb6', '#c9a98c'],
    subraces: [
      { name: 'Nature', skins: ['#e9d6bc', '#d4b896', '#b89a74'] },
      { name: 'Soul', skins: ['#f6ece6', '#ece0e6', '#e0d6e8'] },
      { name: 'Dark', skins: ['#6b5a66', '#4e4250', '#3a3240'], macro: { muscle: 0.05 } },
    ],
  },
  {
    id: 'solcaste', name: 'Solcaste', base: { macro: { height: -0.6, proportions: -0.35, muscle: 0.25, weight: 0.15 }, custom: { 'race-brow-heavy': 0.8, 'race-jaw-broad': 0.8 },
      details: { 'measure-shoulder-dist': 0.6, 'neck-scale-horiz': 0.5, 'nose-scale-horiz': 0.3, 'hand-scale': 0.3 } },
    skins: ['#e2b896', '#c8946c', '#a87654'],
    subraces: [
      { name: 'Coastal', skins: ['#d8b090', '#c09070', '#a07858'] },
      { name: 'Dunes', skins: ['#c08a60', '#a87048', '#8a5a3a'] },
      { name: 'Deep', skins: ['#b0a8a0', '#8e8680', '#6e6862'], macro: { weight: 0.05 } },
    ],
  },
  {
    id: 'draconian', name: 'Draconian', base: { macro: { height: 0.12, muscle: 0.2 }, custom: { 'species-draconian': 1 },
      details: { 'neck-scale-horiz': 0.3, 'nose-scale-depth': -1, 'nose-volume': -0.6, 'nose-scale-horiz': -0.4, 'mouth-upperlip-volume': -0.8, 'mouth-lowerlip-volume': -0.8, 'ear-scale': -0.8, 'eyebrows-trans-forward': 0.6, 'hand-fingers-diameter': -0.3, 'hand-fingers-length': 0.25 } },
    parts: ['tail'], attach: { horns: { size: 1 }, claws: { size: 1 }, tailReptile: { size: 1 } }, hornColor: '#2e2620',
    cover: { type: 'scales', face: 0.85, body: 1 }, eyes: { pupil: 'slit', color: '#e0a020' },
    skins: ['#c8a060', '#8a6a4a', '#5a7a6a'],
    subraces: [
      { name: 'Sun scale', skins: ['#d8a848', '#c08838', '#a87030'] },
      { name: 'Ash scale', skins: ['#6a6460', '#4a4644', '#2e2c2c'] },
      { name: 'Sea scale', skins: ['#4a8a8a', '#3a6a7a', '#2a5060'] },
    ],
  },
  {
    id: 'therian', name: 'Therian', parts: ['tail'], hornColor: '#e8dcc0',
    skins: ['#e0c0a0', '#b08868', '#7a5a44'],
    subraces: [
      { name: 'Feline', custom: { 'species-feline': 1 }, details: { 'eye-corner2': 0.5, 'eye-scale': 0.4, 'nose-scale-depth': -0.5, 'mouth-upperlip-volume': -0.5, 'ear-scale': -1 }, macro: { weight: -0.1 }, attach: { catEars: { size: 1 }, tailCat: { size: 1 } }, cover: { type: 'fur', face: 1, body: 1, pattern: 1, length: 0.09 }, eyes: { pupil: 'slit', color: '#9ac040' } },
      { name: 'Boar', custom: { 'species-boar': 1 }, details: { 'nose-scale-horiz': 0.8, 'nose-scale-depth': -0.6, 'neck-scale-horiz': 0.8, 'eye-scale': -0.4, 'ear-scale': -1 }, macro: { weight: 0.25, muscle: 0.2 }, attach: { boarEars: { size: 1 }, tusks: { size: 1 }, tailPig: { size: 1 } }, cover: { type: 'fur', face: 0.55, body: 1, size: 0.4, length: 0.05 }, eyes: { pupil: 'horizontal', color: '#6a4020' } },
      { name: 'Avian', custom: { 'species-avian': 1 }, details: { 'nose-scale-depth': -1, 'nose-volume': -1, 'mouth-upperlip-volume': -1, 'mouth-lowerlip-volume': -1, 'eye-scale': 0.3, 'ear-scale': -1, 'hand-fingers-diameter': -0.5, 'hand-fingers-length': 0.15 }, macro: { weight: -0.2, height: 0.05 }, parts: [], attach: { beak: { size: 1 }, beakLower: { size: 1 }, armWings: { size: 1 }, claws: { size: 0.85 } }, hornColor: '#d8a040', cover: { type: 'feathers', face: 1, body: 1, length: 0.14 }, eyes: { pupil: 'wide', color: '#e8c030' } },
    ],
  },
  {
    id: 'piscine', name: 'Piscine', base: { custom: { 'species-piscine': 1 }, details: { 'neck-scale-horiz': 0.3, 'eye-scale': 0.35, 'nose-scale-depth': -0.6, 'nose-volume': -0.4, 'mouth-upperlip-volume': -0.3, 'ear-scale': -1 } },
    parts: ['gills'], attach: { finEars: { size: 1 }, webbing: { size: 1 } },
    cover: { type: 'fishscales', face: 0.6, body: 1 }, eyes: { pupil: 'wide', color: '#30a0b0' },
    skins: ['#8ab8c0', '#6a98a8', '#4a7888'],
    subraces: [
      { name: 'Deep water', skins: ['#4a6a8a', '#3a5070', '#283a58'] },
      { name: 'Coastal', skins: ['#8ac0b8', '#6aa0a0', '#4a8888'] },
      { name: 'River', skins: ['#9ab890', '#7a9a78', '#5a7a60'] },
    ],
  },
];

// Combined offsets for a race + subrace: { macro, details, custom, parts, skins }.
export function raceLayer(raceIndex, subIndex) {
  const r = RACES[raceIndex], s = r.subraces[subIndex] || {};
  const merge = (a = {}, b = {}) => { const o = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = (o[k] || 0) + v; return o; };
  return {
    macro: merge(r.base?.macro, s.macro), details: merge(r.base?.details, s.details), custom: merge(r.base?.custom, s.custom),
    parts: [...(r.parts || []), ...(s.parts || [])], skins: s.skins || r.skins,
    attach: { ...(r.attach || {}), ...(s.attach || {}) }, hornColor: s.hornColor || r.hornColor || '#d8ccb0',
    cover: s.cover || r.cover || null, eyes: s.eyes || r.eyes || null,
  };
}
