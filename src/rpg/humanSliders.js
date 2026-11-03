// src/rpg/humanSliders.js — friendly names for the detail sliders.
// Slider ids come from the converted MakeHuman targets (data/human/human.json -> modifiers).
// Anything missing here falls back to a generated name, so new targets still show up.

export const LABELS = {
  // Head
  'head-age': 'Age lines', 'head-angle': 'Tilt', 'head-back-scale-depth': 'Back of head', 'head-fat': 'Fullness',
  'head-diamond': 'Shape: diamond', 'head-invertedtriangular': 'Shape: inverted triangle', 'head-oval': 'Shape: oval',
  'head-rectangular': 'Shape: rectangular', 'head-round': 'Shape: round', 'head-square': 'Shape: square', 'head-triangular': 'Shape: triangular',
  'head-scale-depth': 'Depth', 'head-scale-horiz': 'Width', 'head-scale-vert': 'Height', 'head-trans-forward': 'Forward position', 'head-trans-up': 'Vertical position',
  'forehead-nubian': 'Forehead: rounded', 'forehead-scale-vert': 'Forehead: height', 'forehead-temple': 'Forehead: temples', 'forehead-trans-forward': 'Forehead: slope',
  // Brows
  'eyebrows-angle': 'Angle', 'eyebrows-trans-forward': 'Prominence', 'eyebrows-trans-up': 'Height',
  // Eyes
  'eye-bag': 'Under-eye bags', 'eye-bag-height': 'Bag height', 'eye-bag-out': 'Bag position', 'eye-corner1': 'Inner corner', 'eye-corner2': 'Outer corner',
  'eye-epicanthus': 'Epicanthic fold', 'eye-eyefold-angle': 'Lid fold angle', 'eye-eyefold': 'Lid fold shape', 'eye-eyefold-up': 'Lid fold height',
  'eye-height1': 'Opening (inner)', 'eye-height2': 'Opening (middle)', 'eye-height3': 'Opening (outer)', 'eye-push1': 'Depth (inner)', 'eye-push2': 'Depth (outer)',
  'eye-scale': 'Size', 'eye-trans-up': 'Height', 'eye-trans-out': 'Spacing',
  // Nose
  'nose-base': 'Base height', 'nose-compression': 'Compression', 'nose-curve': 'Bridge curve', 'nose-flaring': 'Nostril flare', 'nose-greek': 'Straight profile',
  'nose-hump': 'Hump', 'nose-nostrils-angle': 'Nostril angle', 'nose-nostrils-width': 'Nostril width', 'nose-point': 'Tip height', 'nose-point-width': 'Tip width',
  'nose-scale-depth': 'Projection', 'nose-scale-horiz': 'Width', 'nose-scale-vert': 'Length', 'nose-septumangle': 'Septum angle',
  'nose-trans-forward': 'Forward position', 'nose-trans-up': 'Vertical position', 'nose-volume': 'Volume',
  'nose-width1': 'Bridge width (top)', 'nose-width2': 'Bridge width (middle)', 'nose-width3': 'Bridge width (bottom)',
  // Mouth
  'mouth-angles': 'Corners', 'mouth-cupidsbow': "Cupid's bow", 'mouth-cupidsbow-width': "Cupid's bow width", 'mouth-dimples': 'Dimples', 'mouth-laugh-lines': 'Laugh lines',
  'mouth-lowerlip-ext': 'Lower lip corners', 'mouth-lowerlip-height': 'Lower lip height', 'mouth-lowerlip-middle': 'Lower lip middle', 'mouth-lowerlip-volume': 'Lower lip fullness',
  'mouth-lowerlip-width': 'Lower lip width', 'mouth-philtrum-volume': 'Philtrum', 'mouth-scale-depth': 'Projection', 'mouth-scale-horiz': 'Width', 'mouth-scale-vert': 'Height',
  'mouth-trans-forward': 'Forward position', 'mouth-trans-up': 'Vertical position', 'mouth-upperlip-ext': 'Upper lip corners', 'mouth-upperlip-height': 'Upper lip height',
  'mouth-upperlip-middle': 'Upper lip middle', 'mouth-upperlip-volume': 'Upper lip fullness', 'mouth-upperlip-width': 'Upper lip width',
  // Cheeks and chin
  'cheek-bones': 'Cheekbones', 'cheek-inner': 'Inner cheek', 'cheek-trans-up': 'Cheek height', 'cheek-volume': 'Cheek fullness',
  'chin-bones': 'Jaw width', 'chin-cleft': 'Chin cleft', 'chin-height': 'Chin height', 'chin-jaw-drop': 'Jaw drop', 'chin-prognathism': 'Jaw projection',
  'chin-prominent': 'Chin prominence', 'chin-triangle': 'Pointed chin', 'chin-width': 'Chin width',
  // Ears
  'ear-flap': 'Flap', 'ear-lobe': 'Lobe', 'ear-rot-forward': 'Rotation', 'ear-scale': 'Size', 'ear-scale-depth': 'Depth', 'ear-scale-vert': 'Height',
  'ear-shape-pointed': 'Shape: pointed', 'ear-shape-round': 'Shape: round', 'ear-shape-square': 'Shape: square', 'ear-shape-triangle': 'Shape: triangle',
  'ear-trans-forward': 'Forward position', 'ear-trans-up': 'Vertical position', 'ear-wing': 'Stick-out',
  // Neck
  'neck-back-scale-depth': 'Back of neck', 'neck-double': 'Double chin', 'neck-scale-depth': 'Depth', 'neck-scale-horiz': 'Width', 'neck-scale-vert': 'Length',
  'neck-trans-forward': 'Forward position', 'neck-trans-up': 'Vertical position',
  // Torso
  'torso-muscle-dorsi': 'Back muscles', 'torso-muscle-pectoral': 'Chest muscles', 'torso-scale-depth': 'Depth', 'torso-scale-horiz': 'Width', 'torso-scale-vert': 'Length',
  'torso-trans-forward': 'Forward position', 'torso-trans-up': 'Vertical position', 'torso-vshape': 'V shape',
  'stomach-navel': 'Navel height', 'stomach-navel-out': 'Navel depth', 'stomach-tone': 'Stomach tone',
  // Hips and legs
  'hip-scale-depth': 'Hip depth', 'hip-scale-horiz': 'Hip width', 'hip-scale-vert': 'Hip height', 'hip-trans-forward': 'Hip tilt', 'hip-trans-up': 'Hip position', 'hip-waist': 'Waist height',
  'buttocks-volume': 'Glutes', 'leg-valgus': 'Knees in ↔ out',
  'upperleg-fat': 'Thigh fat', 'upperleg-muscle': 'Thigh muscle', 'upperleg-scale-depth': 'Thigh depth', 'upperleg-scale-horiz': 'Thigh width', 'upperleg-scale-vert': 'Thigh length',
  'lowerleg-fat': 'Calf fat', 'lowerleg-muscle': 'Calf muscle', 'lowerleg-scale-depth': 'Calf depth', 'lowerleg-scale-horiz': 'Calf width', 'lowerleg-scale-vert': 'Shin length',
  // Arms and hands
  'upperarm-fat': 'Upper arm fat', 'upperarm-muscle': 'Upper arm muscle', 'upperarm-scale-depth': 'Upper arm depth', 'upperarm-scale-horiz': 'Upper arm width',
  'upperarm-scale-vert': 'Upper arm length', 'upperarm-shoulder-muscle': 'Shoulder muscle',
  'lowerarm-fat': 'Forearm fat', 'lowerarm-muscle': 'Forearm muscle', 'lowerarm-scale-depth': 'Forearm depth', 'lowerarm-scale-horiz': 'Forearm width', 'lowerarm-scale-vert': 'Forearm length',
  'hand-fingers-diameter': 'Finger thickness', 'hand-fingers-distance': 'Finger spacing', 'hand-fingers-length': 'Finger length', 'hand-scale': 'Hand size', 'hand-trans-out': 'Hand position',
  // Feet
  'foot-scale': 'Size', 'foot-scale-depth': 'Length', 'foot-scale-horiz': 'Width', 'foot-scale-vert': 'Height', 'foot-trans-forward': 'Forward position', 'foot-trans-up': 'Vertical position', 'foot-trans-out': 'Spacing',
  // Measurements
  'measure-ankle-circ': 'Ankles', 'measure-bust-circ': 'Bust', 'measure-calf-circ': 'Calves', 'measure-frontchest-dist': 'Front chest width', 'measure-hips-circ': 'Hips',
  'measure-knee-circ': 'Knees', 'measure-lowerarm-length': 'Forearm length', 'measure-lowerleg-height': 'Shin length', 'measure-napetowaist-dist': 'Back length',
  'measure-neck-circ': 'Neck', 'measure-neck-height': 'Neck length', 'measure-shoulder-dist': 'Shoulder width', 'measure-thigh-circ': 'Thighs', 'measure-underbust-circ': 'Underbust',
  'measure-upperarm-circ': 'Upper arms', 'measure-upperarm-length': 'Upper arm length', 'measure-upperleg-height': 'Thigh length', 'measure-waist-circ': 'Waist',
  'measure-waisttohip-dist': 'Waist to hip', 'measure-wrist-circ': 'Wrists',
};

export function labelFor(id) {
  if (LABELS[id]) return LABELS[id];
  const s = id.split('-').slice(1).join(' ').replace(/scale horiz/, 'width').replace(/scale vert/, 'height').replace(/scale depth/, 'depth').replace(/trans /, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Target weights for the detail sliders: values -1..1 (or 0..1 for one-sided shapes).
export function detailWeights(modifiers, values, W = {}) {
  for (const m of modifiers) {
    const v = values[m.id] || 0;
    if (!v) continue;
    for (const t of m.pos) W[t] = (W[t] || 0) + Math.max(0, v);
    for (const t of m.neg) W[t] = (W[t] || 0) + Math.max(0, -v);
  }
  return W;
}
