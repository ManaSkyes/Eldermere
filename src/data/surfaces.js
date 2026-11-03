// src/data/surfaces.js — what the ground is made of: how loud it is to move on, how it sounds, and how it
// moves you. Shapes carry `surface` (src/game/testGrounds.js); anything unmarked is stone.
//   noise:  multiplies the loudness of steps, landings and slides on it (see NOISE in src/game/controller.js)
//   sound:  which footstep the audio plays (src/game/audio.js)
//   grip:   slide friction multiplier (lower slides further);  speed: walking speed multiplier
//   climb:  present on surfaces you can climb (see the climbing section of docs/CONTROLS.md)
export const SURFACES = {
  grass: { name: 'Grass', noise: 0.75, sound: 'grass', grip: 1.0, speed: 1 },
  stone: { name: 'Stone', noise: 1.0, sound: 'stone', grip: 1.0, speed: 1 },
  wood:  { name: 'Wood', noise: 1.2, sound: 'wood', grip: 0.9, speed: 1 },
  metal: { name: 'Metal', noise: 1.5, sound: 'metal', grip: 0.8, speed: 1 },
  sand:  { name: 'Sand', noise: 0.6, sound: 'sand', grip: 1.4, speed: 0.92 },
  mud:   { name: 'Mud', noise: 0.85, sound: 'mud', grip: 0.6, speed: 0.85 },
  water: { name: 'Shallow water', noise: 1.4, sound: 'water', grip: 1.0, speed: 1 },
  // climbable walls (src/game/controller.js, climbing). climb: how hard it is to hold (difficulty), how
  // fast you move on it, how much stamina it takes, and how slippery it is
  climbStone: { name: 'Rough stone', noise: 1.0, sound: 'stone', grip: 1.0, speed: 1, climb: { difficulty: 0.8, speed: 1, drain: 1, slip: 1 } },
  vines:      { name: 'Vines', noise: 1.1, sound: 'grass', grip: 1.0, speed: 1, climb: { difficulty: 0.5, speed: 1.2, drain: 0.8, slip: 1, baseSlip: 0.025 } },   // vines can tear: a small chance whatever your grip
  wetStone:   { name: 'Wet stone', noise: 1.1, sound: 'stone', grip: 0.7, speed: 1, climb: { difficulty: 1.5, speed: 0.75, drain: 1.3, slip: 1.3, wet: true, slide: 0.3 } },   // slide: m/s you sink when not climbing up
  ice:        { name: 'Ice', noise: 1.2, sound: 'stone', grip: 0.3, speed: 1, climb: { difficulty: 2.4, speed: 0.5, drain: 1.7, slip: 1.6, ice: true, slide: 0.7 } },
};
export const surfaceOf = id => SURFACES[id] || SURFACES.stone;
