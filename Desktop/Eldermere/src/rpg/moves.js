// src/rpg/moves.js — the character's everyday actions (drinking, picking things up, opening a chest, using things).
//
// Same language as the weapon attacks in src/rpg/humanViewer.js: each key, at a share t of the move's duration, aims
// the arms (R, L: [upper arm direction, forearm direction], character space: +x the character's left, +y up, +z
// forward) and can add:
//   yaw    the chest's turn (radians)            lean   the spine bending forward (radians)
//   squat  the legs folding (0 standing .. 1.2)  head   the head tipping back (+) or down (-) (radians)
// Between keys everything eases; before the first key it eases from the stance, after the last back to it.
// prop: something shown in a hand for part of the move ({ kind, hand, from, to } as shares of the duration).
// events: named moments (the game hears them: 'drink' when the potion takes effect, 'take' when the item is in hand).
// The creator's Animation lab plays any of them.

const DOWN = [[-0.16, -1, 0.02], [-0.06, -1, 0.28]], DOWNL = [[0.16, -1, 0.02], [0.06, -1, 0.28]];
export const MOVES = {
  drink: { name: 'Drink a potion', dur: 2.1, prop: { kind: 'potion', hand: 'R', from: 0.04, to: 0.94 }, events: [{ t: 0.55, name: 'drink' }],
    keys: [
      { t: 0.2, R: [[-0.3, -0.75, 0.6], [0.25, 0.35, 0.9]] },                                  // bottle up in front of the chest
      { t: 0.38, R: [[-0.3, -0.2, 0.93], [0.6, 0.75, 0.25]], head: 0.25 },                     // to the lips
      { t: 0.7, R: [[-0.26, 0.05, 0.96], [0.55, 0.82, -0.05]], head: 0.55 },                      // tipped up, head back
      { t: 0.86, R: [[-0.3, -0.7, 0.65], [0.25, 0.3, 0.92]], head: 0.05 },                      // down again
    ] },
  pickup: { name: 'Pick something up', dur: 1.5, prop: { kind: 'item', hand: 'R', from: 0.48, to: 0.95 }, events: [{ t: 0.48, name: 'take' }],
    keys: [
      { t: 0.3, R: [[-0.2, -0.8, 0.56], [-0.05, -0.75, 0.66]], L: [[0.25, -0.85, 0.45], [0.2, -0.6, 0.75]], lean: 0.55, squat: 0.95, head: -0.45 },
      { t: 0.48, R: [[-0.18, -0.88, 0.45], [-0.03, -0.85, 0.52]], L: [[0.25, -0.85, 0.45], [0.2, -0.6, 0.75]], lean: 0.62, squat: 1.05, head: -0.5 },
      { t: 0.75, R: [[-0.3, -0.75, 0.55], [0.2, 0.25, 0.95]], lean: 0.1, squat: 0.15, head: -0.15 },   // stood up, looking at it
    ] },
  open: { name: 'Open a chest', dur: 1.9, events: [{ t: 0.55, name: 'open' }],
    keys: [
      { t: 0.28, R: [[-0.25, -0.65, 0.72], [0.05, -0.45, 0.89]], L: [[0.25, -0.65, 0.72], [-0.05, -0.45, 0.89]], lean: 0.45, squat: 0.65, head: -0.4 },
      { t: 0.42, R: [[-0.25, -0.7, 0.67], [0.05, -0.55, 0.83]], L: [[0.25, -0.7, 0.67], [-0.05, -0.55, 0.83]], lean: 0.5, squat: 0.72, head: -0.4 },
      { t: 0.65, R: [[-0.25, -0.2, 0.95], [0.05, 0.4, 0.92]], L: [[0.25, -0.2, 0.95], [-0.05, 0.4, 0.92]], lean: 0.25, squat: 0.55, head: -0.2 },   // the lid up
      { t: 0.82, R: [[-0.22, -0.75, 0.62], [0.1, -0.3, 0.95]], L: [[0.22, -0.75, 0.62], [-0.1, -0.3, 0.95]], lean: 0.4, squat: 0.6, head: -0.45 },   // looking in
    ] },
  use: { name: 'Use / press', dur: 1.1, events: [{ t: 0.45, name: 'use' }],
    keys: [
      { t: 0.35, R: [[-0.2, -0.35, 0.92], [0.02, -0.1, 1]], lean: 0.08 },
      { t: 0.5, R: [[-0.18, -0.3, 0.94], [0.02, -0.05, 1]], lean: 0.12, yaw: -0.08 },
    ] },
  lever: { name: 'Pull a lever', dur: 1.5, events: [{ t: 0.6, name: 'use' }],
    keys: [
      { t: 0.3, R: [[-0.2, 0.25, 0.95], [0.1, 0.4, 0.9]], L: [[0.2, 0.25, 0.95], [-0.1, 0.4, 0.9]], lean: 0.05 },
      { t: 0.65, R: [[-0.25, -0.6, 0.76], [0.1, -0.35, 0.93]], L: [[0.25, -0.6, 0.76], [-0.1, -0.35, 0.93]], lean: -0.12, squat: 0.3 },   // pulled down, leaning back
    ] },
  kneel: { name: 'Kneel and look', dur: 2.6,
    keys: [
      { t: 0.25, R: [[-0.2, -0.85, 0.5], [0, -0.8, 0.6]], L: [[0.3, -0.7, 0.3], [0.25, -0.2, 0.95]], lean: 0.4, squat: 1.15, head: -0.5 },
      { t: 0.75, R: [[-0.2, -0.85, 0.5], [0.05, -0.75, 0.66]], L: [[0.3, -0.7, 0.3], [0.25, -0.2, 0.95]], lean: 0.42, squat: 1.15, head: -0.55, yaw: 0.15 },
    ] },
  eat: { name: 'Eat', dur: 2.4, prop: { kind: 'food', hand: 'R', from: 0.04, to: 0.94 }, events: [{ t: 0.5, name: 'eat' }],
    keys: [
      { t: 0.2, R: [[-0.3, -0.7, 0.65], [0.4, 0.55, 0.75]] },
      { t: 0.3, R: [[-0.32, -0.55, 0.78], [0.55, 0.78, 0.3]], head: -0.05 },
      { t: 0.42, R: [[-0.3, -0.7, 0.65], [0.4, 0.55, 0.75]] },
      { t: 0.55, R: [[-0.32, -0.55, 0.78], [0.55, 0.78, 0.3]], head: -0.05 },
      { t: 0.68, R: [[-0.3, -0.7, 0.65], [0.4, 0.55, 0.75]] },
    ] },
  throw: { name: 'Throw', dur: 1.0, prop: { kind: 'item', hand: 'R', from: 0, to: 0.5 }, events: [{ t: 0.5, name: 'release' }],
    keys: [
      { t: 0.35, R: [[-0.5, 0.6, -0.6], [0.1, 0.9, -0.4]], L: [[0.3, -0.3, 0.9], [0, 0, 1]], yaw: 0.45, lean: -0.1 },   // wound back
      { t: 0.55, R: [[-0.2, -0.1, 0.97], [0, -0.2, 0.98]], L: [[0.35, -0.8, 0.4], [0.1, -0.9, 0.3]], yaw: -0.35, lean: 0.2 },   // through
    ] },
  shrug: { name: 'Shrug', dur: 1.2,
    keys: [{ t: 0.4, R: [[-0.6, -0.75, 0.25], [-0.2, 0.2, 0.95]], L: [[0.6, -0.75, 0.25], [0.2, 0.2, 0.95]], head: 0.1 },
           { t: 0.6, R: [[-0.6, -0.75, 0.25], [-0.2, 0.2, 0.95]], L: [[0.6, -0.75, 0.25], [0.2, 0.2, 0.95]], head: 0.1 }] },
  point: { name: 'Point', dur: 1.6,
    keys: [{ t: 0.3, R: [[-0.2, 0.05, 0.98], [0, 0.1, 1]], yaw: -0.1 }, { t: 0.7, R: [[-0.2, 0.05, 0.98], [0, 0.1, 1]], yaw: -0.1 }] },
};
export const MOVE_DOWN = { R: DOWN, L: DOWNL };
