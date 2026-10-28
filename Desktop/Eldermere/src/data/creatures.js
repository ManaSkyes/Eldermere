// src/data/creatures.js — the built-in creature library: monsters authored in the Creature workshop's own format
// (what its Export gives: { scratch, genus, name, locomotion, hover, spec, meta, resist, stats, variants }), shipped
// with the game so every browser has them. Made in the workshop → Export → pasted here (or written by Claude straight
// in this format). The workshop can open any of them (Edit a copy) to make your own versions.
//
// variants: the same creature at another size and strength — [{ id, name, scale (body size ×), stats (× hp, speed,
// aggro), damage (×), rank, hazard, note }]; each becomes its own monster ('<id>_<variant id>') in the lists.
export const BUILTIN = {
  nyluth: {
 "scratch": true,
 "genus": "canine",
 "name": "Nyluth",
 "locomotion": "walk",
 "hover": 0,
 "spec": {
  "chains": [
   {
    "name": "spine",
    "role": "spine",
    "label": "back: hips, waist, chest, shoulders",
    "pts": [
     [
      0,
      0.74,
      -0.5
     ],
     [
      0,
      0.72,
      -0.18
     ],
     [
      0,
      0.78,
      0.14
     ],
     [
      0,
      0.8,
      0.42
     ]
    ],
    "r": [
     [
      0.13,
      0.15
     ],
     [
      0.11,
      0.13
     ],
     [
      0.15,
      0.2
     ],
     [
      0.15,
      0.19
     ]
    ],
    "color": "#3e3a36",
    "sides": 12,
    "seg": 3,
    "joints": [
     "hips",
     "waist",
     "chest",
     "shoulders"
    ],
    "belly": "#8a8070"
   },
   {
    "name": "neck",
    "role": "neck",
    "label": "neck",
    "pts": [
     [
      0,
      0.8,
      0.42
     ],
     [
      0,
      0.86,
      0.62
     ],
     [
      0,
      0.9,
      0.78
     ]
    ],
    "r": [
     [
      0.12,
      0.15
     ],
     [
      0.09,
      0.11
     ],
     [
      0.08,
      0.09
     ]
    ],
    "color": "#3e3a36",
    "sides": 12,
    "seg": 3,
    "parent": "spine:3",
    "joints": [
     "base",
     "mid",
     "nape"
    ],
    "belly": "#8a8070"
   },
   {
    "name": "head",
    "role": "head",
    "label": "head: back of skull, brow, stop, nose (long narrow muzzle)",
    "pts": [
     [
      0,
      0.9,
      0.78
     ],
     [
      0,
      0.94,
      0.88
     ],
     [
      0,
      0.915,
      0.98
     ],
     [
      0,
      0.875,
      1.2
     ]
    ],
    "r": [
     [
      0.085,
      0.09
     ],
     [
      0.095,
      0.085
     ],
     [
      0.055,
      0.055
     ],
     [
      0.03,
      0.028
     ]
    ],
    "color": "#3e3a36",
    "sides": 12,
    "seg": 3,
    "parent": "neck:2",
    "joints": [
     "back of skull",
     "brow",
     "stop",
     "nose"
    ],
    "belly": "#8a8070"
   },
   {
    "name": "front",
    "role": "leg",
    "label": "front legs (hip, knee, ankle, paw, toes)",
    "pts": [
     [
      0.11,
      0.78,
      0.4
     ],
     [
      0.12,
      0.44,
      0.43
     ],
     [
      0.11,
      0.14,
      0.38
     ],
     [
      0.11,
      0.03,
      0.44
     ],
     [
      0.11,
      0.01,
      0.52
     ]
    ],
    "r": [
     [
      0.06,
      0.09
     ],
     [
      0.04,
      0.045
     ],
     [
      0.03,
      0.03
     ],
     [
      0.032,
      0.025
     ],
     [
      0.03,
      0.015
     ]
    ],
    "color": "#3e3a36",
    "sides": 12,
    "seg": 3,
    "parent": "spine:3",
    "mirror": true,
    "joints": [
     "shoulder",
     "elbow",
     "wrist",
     "paw",
     "claws"
    ],
    "belly": "#8a8070"
   },
   {
    "name": "hind",
    "role": "leg",
    "label": "hind legs (hip, knee, ankle, paw, toes)",
    "pts": [
     [
      0.1,
      0.74,
      -0.48
     ],
     [
      0.12,
      0.46,
      -0.36
     ],
     [
      0.11,
      0.2,
      -0.56
     ],
     [
      0.11,
      0.03,
      -0.5
     ],
     [
      0.11,
      0.01,
      -0.42
     ]
    ],
    "r": [
     [
      0.08,
      0.11
     ],
     [
      0.05,
      0.06
     ],
     [
      0.03,
      0.03
     ],
     [
      0.032,
      0.025
     ],
     [
      0.03,
      0.015
     ]
    ],
    "color": "#3e3a36",
    "sides": 12,
    "seg": 3,
    "parent": "spine:0",
    "mirror": true,
    "joints": [
     "hip",
     "stifle",
     "hock",
     "paw",
     "claws"
    ],
    "belly": "#8a8070"
   },
   {
    "name": "jaw",
    "role": "jaw",
    "label": "lower jaw (the bite): hinge, middle, chin",
    "pts": [
     [
      0,
      0.86,
      0.84
     ],
     [
      0,
      0.835,
      0.98
     ],
     [
      0,
      0.835,
      1.15
     ]
    ],
    "r": [
     [
      0.055,
      0.03
     ],
     [
      0.04,
      0.022
     ],
     [
      0.024,
      0.014
     ]
    ],
    "color": "#3e3a36",
    "sides": 12,
    "seg": 3,
    "parent": "head:0",
    "joints": [
     "hinge",
     "middle",
     "chin"
    ],
    "belly": "#8a8070"
   },
   {
    "name": "tail",
    "role": "tail",
    "label": "bushy tail, carried low",
    "pts": [
     [
      0,
      0.74,
      -0.5
     ],
     [
      0,
      0.66,
      -0.72
     ],
     [
      0,
      0.52,
      -0.9
     ],
     [
      0,
      0.4,
      -1.02
     ],
     [
      0,
      0.32,
      -1.1
     ]
    ],
    "r": [
     [
      0.05,
      0.05
     ],
     [
      0.06,
      0.06
     ],
     [
      0.055,
      0.055
     ],
     [
      0.04,
      0.04
     ],
     [
      0.015,
      0.015
     ]
    ],
    "color": "#24211f",
    "sides": 12,
    "seg": 3,
    "parent": "spine:0",
    "belly": "#8a8070"
   },
   {
    "name": "ear",
    "role": "ear",
    "label": "ears (tall, pointed, flat)",
    "pts": [
     [
      0.05,
      0.975,
      0.84
     ],
     [
      0.075,
      1.09,
      0.81
     ]
    ],
    "r": [
     [
      0.04,
      0.011
     ],
     [
      0.003,
      0.003
     ]
    ],
    "color": "#24211f",
    "sides": 12,
    "seg": 3,
    "parent": "head:1",
    "mirror": true,
    "belly": "#8a8070"
   }
  ],
  "parts": [
   {
    "bone": "head:2",
    "kind": "sphere",
    "at": [
     0.042,
     0.945,
     0.95
    ],
    "r": 0.016,
    "emissive": "#c8ffb0",
    "mirror": true
   },
   {
    "bone": "head:2",
    "kind": "glow",
    "at": [
     0.046,
     0.945,
     0.965
    ],
    "r": 0.06,
    "color": "#9aff80",
    "opacity": 0.75,
    "mirror": true
   },
   {
    "bone": "head:3",
    "kind": "sphere",
    "at": [
     0,
     0.885,
     1.215
    ],
    "r": 0.02,
    "color": "#121010"
   },
   {
    "bone": "neck:0",
    "kind": "sphere",
    "at": [0, 0.84, 0.47],
    "r": 0.11,
    "scale": [1.15, 1.05, 1.5],
    "color": "#24211f"
   },
   {
    "bone": "head:3",
    "kind": "cone",
    "at": [
     0.024,
     0.85,
     1.13
    ],
    "r": 0.008,
    "len": 0.03,
    "dir": [
     0,
     -1,
     0.2
    ],
    "color": "#e8e0d0",
    "mirror": true
   }
  ],
  "look": {
   "rough": 0.95,
   "fur": {
    "length": 0.032, "density": 85, "shells": 6, "tip": "#7a7064", "tipMix": 0.25
   }
  }
 },
 "meta": {
  "group": "pack",
  "plan": "quadruped",
  "classification": [
   "Essence Tiers",
   "Wild Essence"
  ],
  "hazard": "Menace",
  "rank": [
   "Wood",
   "Wood"
  ],
  "activity": "Lunar",
  "voice": "chirper",
  "lore": "Eldermere Chronicles, ch. 3. Wolf-like pack hunters of the grasslands. They stalk unseen through the grass at night and surround their prey before it knows they are there, circling and calling to each other in bird-like chirps (\"not birds\"). Pale green eyes, very sensitive to light: a burst of light sends them howling and blind. Keep them at range \u2014 up close they are deadly. A pack is led by an alpha standing almost 2 m tall that can cover 10 m in a blink; when the alpha howls, the pack retreats into the brush."
 },
 "resist": {
  "light": 1.6,
  "lunar": 1.3
 },
 "stats": {
  "hp": 34,
  "speed": 6.2,
  "aggro": 16
 },
 "variants": [
  {
   "id": "alpha",
   "name": "Alpha nyluth",
   "scale": 1.75,
   "stats": {
    "hp": 3,
    "speed": 1.15,
    "aggro": 1.3
   },
   "damage": 1.8,
   "rank": [
    "Bronze",
    "Bronze"
   ],
   "hazard": "Menace",
   "note": "pack leader, almost 2 m tall; lunges 10 m in a blink"
  }
 ]
},
  // the first animal (not a monster): passive, harvestable (harvest: what skinning it gives — src/game/harvest.js)
  yuribor: {
 "scratch": true,
 "genus": "boar",
 "name": "Yuribor",
 "locomotion": "walk",
 "hover": 0,
 "spec": {
  "chains": [
   {
    "name": "spine",
    "role": "spine",
    "label": "back: rump, loin, hump, withers",
    "pts": [
     [
      0,
      2.55,
      -1.75
     ],
     [
      0,
      2.75,
      -0.7
     ],
     [
      0,
      3.35,
      0.45
     ],
     [
      0,
      3.15,
      1.35
     ]
    ],
    "r": [
     [
      0.62,
      0.62
     ],
     [
      0.7,
      0.75
     ],
     [
      0.92,
      1.1
     ],
     [
      0.85,
      1
     ]
    ],
    "color": "#5a4632",
    "sides": 14,
    "seg": 3,
    "joints": [
     "rump",
     "loin",
     "hump",
     "withers"
    ],
    "belly": "#7a6448"
   },
   {
    "name": "neck",
    "role": "neck",
    "label": "thick neck, carried low",
    "pts": [
     [
      0,
      3,
      1.35
     ],
     [
      0,
      2.55,
      2
     ],
     [
      0,
      2.1,
      2.45
     ]
    ],
    "r": [
     [
      0.75,
      0.85
     ],
     [
      0.6,
      0.7
     ],
     [
      0.5,
      0.55
     ]
    ],
    "color": "#3e2f22",
    "sides": 14,
    "seg": 3,
    "parent": "spine:3",
    "joints": [
     "base",
     "mid",
     "poll"
    ],
    "belly": "#7a6448"
   },
   {
    "name": "head",
    "role": "head",
    "label": "head: back of skull, brow, muzzle, nose (broad, low)",
    "pts": [
     [
      0,
      2.1,
      2.45
     ],
     [
      0,
      2.05,
      2.75
     ],
     [
      0,
      1.85,
      3.05
     ],
     [
      0,
      1.6,
      3.25
     ]
    ],
    "r": [
     [
      0.48,
      0.5
     ],
     [
      0.52,
      0.5
     ],
     [
      0.36,
      0.38
     ],
     [
      0.26,
      0.24
     ]
    ],
    "color": "#3e2f22",
    "sides": 14,
    "seg": 3,
    "parent": "neck:2",
    "joints": [
     "back of skull",
     "brow",
     "muzzle",
     "nose"
    ],
    "belly": "#7a6448"
   },
   {
    "name": "front",
    "role": "leg",
    "label": "front legs (shoulder, elbow, knee, fetlock, hoof)",
    "pts": [
     [
      0.6,
      3,
      1.2
     ],
     [
      0.63,
      1.55,
      1.3199999999999998
     ],
     [
      0.6,
      0.55,
      1.15
     ],
     [
      0.6,
      0.1,
      1.3199999999999998
     ],
     [
      0.6,
      0.02,
      1.5
     ]
    ],
    "r": [
     [
      0.38,
      0.5
     ],
     [
      0.24,
      0.28
     ],
     [
      0.15,
      0.15
     ],
     [
      0.17,
      0.15
     ],
     [
      0.17,
      0.08
     ]
    ],
    "color": "#3e2f22",
    "sides": 14,
    "seg": 3,
    "parent": "spine:3",
    "mirror": true,
    "joints": [
     "shoulder",
     "elbow",
     "knee",
     "fetlock",
     "hoof"
    ],
    "belly": "#7a6448"
   },
   {
    "name": "hind",
    "role": "leg",
    "label": "hind legs (hip, stifle, hock, fetlock, hoof)",
    "pts": [
     [
      0.5,
      2.55,
      -1.6
     ],
     [
      0.53,
      1.55,
      -1.85
     ],
     [
      0.5,
      0.55,
      -1.4500000000000002
     ],
     [
      0.5,
      0.1,
      -1.48
     ],
     [
      0.5,
      0.02,
      -1.3
     ]
    ],
    "r": [
     [
      0.4,
      0.5
     ],
     [
      0.24,
      0.28
     ],
     [
      0.13,
      0.13
     ],
     [
      0.15,
      0.13
     ],
     [
      0.15,
      0.07
     ]
    ],
    "color": "#5a4632",
    "sides": 14,
    "seg": 3,
    "parent": "spine:0",
    "mirror": true,
    "joints": [
     "hip",
     "stifle",
     "hock",
     "fetlock",
     "hoof"
    ],
    "belly": "#7a6448"
   },
   {
    "name": "jaw",
    "role": "jaw",
    "label": "lower jaw (a grazer\u2019s)",
    "pts": [
     [
      0,
      1.8,
      2.6
     ],
     [
      0,
      1.6,
      2.95
     ],
     [
      0,
      1.47,
      3.2
     ]
    ],
    "r": [
     [
      0.3,
      0.2
     ],
     [
      0.24,
      0.16
     ],
     [
      0.17,
      0.12
     ]
    ],
    "color": "#5a4632",
    "sides": 14,
    "seg": 3,
    "parent": "head:0",
    "joints": [
     "hinge",
     "middle",
     "chin"
    ],
    "belly": "#7a6448"
   },
   {
    "name": "tail",
    "role": "tail",
    "label": "tail with a tuft",
    "pts": [
     [
      0,
      2.5,
      -1.85
     ],
     [
      0,
      2.1,
      -2
     ],
     [
      0,
      1.6,
      -2.05
     ],
     [
      0,
      1.2,
      -2.08
     ],
     [
      0,
      0.95,
      -2.1
     ]
    ],
    "r": [
     [
      0.1,
      0.1
     ],
     [
      0.07,
      0.07
     ],
     [
      0.05,
      0.05
     ],
     [
      0.06,
      0.06
     ],
     [
      0.1,
      0.1
     ]
    ],
    "color": "#5a4632",
    "sides": 14,
    "seg": 3,
    "parent": "spine:0",
    "belly": "#7a6448"
   },
   {
    "name": "ear",
    "role": "ear",
    "label": "ears (small, sideways)",
    "pts": [
     [
      0.42,
      2.25,
      2.55
     ],
     [
      0.66,
      2.3,
      2.45
     ]
    ],
    "r": [
     [
      0.06,
      0.12
     ],
     [
      0.02,
      0.04
     ]
    ],
    "color": "#5a4632",
    "sides": 14,
    "seg": 3,
    "parent": "head:1",
    "mirror": true,
    "belly": "#7a6448"
   },
   {
    "name": "horn",
    "role": "horn",
    "label": "horns (curve out, up and forward) \u2014 absorb and nullify magic",
    "parent": "head:1",
    "mirror": true,
    "pts": [
     [
      0.42,
      2.38,
      2.7
     ],
     [
      0.95,
      2.45,
      2.65
     ],
     [
      1.25,
      2.85,
      2.75
     ],
     [
      1.15,
      3.25,
      3
     ]
    ],
    "r": [
     [
      0.16,
      0.16
     ],
     [
      0.12,
      0.12
     ],
     [
      0.08,
      0.08
     ],
     [
      0.02,
      0.02
     ]
    ],
    "color": "#d8ccb0",
    "sides": 10,
    "seg": 4,
    "joints": [
     "base",
     "sweep",
     "rise",
     "tip"
    ]
   }
  ],
  "parts": [
   {
    "bone": "head:3",
    "kind": "sphere",
    "at": [
     0,
     1.62,
     3.42
    ],
    "r": 0.17,
    "color": "#1c1612"
   },
   {
    "bone": "head:1",
    "kind": "sphere",
    "at": [
     0.4,
     2.12,
     2.9
    ],
    "r": 0.06,
    "color": "#100c0a",
    "mirror": true
   },
   {
    "bone": "spine:3",
    "kind": "sphere",
    "at": [
     0,
     2.9,
     1.7
    ],
    "r": 0.95,
    "scale": [
     1.05,
     1.15,
     0.9
    ],
    "color": "#3e2f22"
   },
   {
    "bone": "neck:1",
    "kind": "sphere",
    "at": [
     0,
     1.75,
     2.1
    ],
    "r": 0.45,
    "scale": [
     0.8,
     1.3,
     0.8
    ],
    "color": "#3e2f22"
   }
  ],
  "look": {
   "rough": 1,
   "fur": {
    "length": 0.12,
    "density": 22,
    "shells": 6,
    "tip": "#8a7258",
    "tipMix": 0.3
   }
  }
 },
 "meta": {
  "group": "pack",
  "temper": "passive",
  "plan": "quadruped",
  "classification": [
   "Essence Tiers",
   "Wild Essence"
  ],
  "hazard": "Safe",
  "rank": [
   "Wood",
   "Wood"
  ],
  "activity": "Active",
  "voice": "beast",
  "lore": "The \"Great Plains Walker\", native to the grasslands of Eldermere. Like a bison but far larger \u2014 up to 12 ft at the shoulder \u2014 with a humped back, a pair of great curved horns, and a thick shaggy coat that changes colour with the seasons. Grazes the tall grass, shrubs, bark and the odd fruit; a steady energy that makes it the preferred beast of burden for long caravan routes and for working great machinery where magic fails. Its horns absorb magic and can nullify it within a certain range \u2014 once hunted for them, now prized in unstable magic regions (and an accidental danger to elementals). Passive: it grazes and wanders, and runs if attacked."
 },
 "resist": {
  "fire": 0.15,
  "frost": 0.15,
  "storm": 0.15,
  "earth": 0.15,
  "light": 0.15,
  "lunar": 0.15,
  "dark": 0.15,
  "arcane": 0.15
 },
 "stats": {
  "hp": 260,
  "speed": 4.5,
  "aggro": 10
 },
 "harvest": {
  "creature": "yuribor",
  "stages": [
   { "id": "skin", "verb": "skin", "skill": "skinning", "tool": "skin", "yields": { "hide": [1, 3] }, "time": 10 },
   { "id": "butcher", "verb": "butcher", "skill": "butchering", "tool": "butcher", "yields": { "meat": [3, 12], "horn": [0, 2] }, "time": 12 }
  ]
 }
},
};
