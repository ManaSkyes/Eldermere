// src/data/genera.js — genus silhouettes for the Creature workshop: the default form of each common kind of creature,
// as a featureless body you can tell apart in pure black on white (a wolf from a cat from a deer). Start a monster
// from one, then reshape it, add or remove limbs and bones, label them, colour it, give it its stats.
//
// Each genus → { name, plan, locomotion, spec } where spec is a creature-builder spec (src/rpg/creature.js): chains of
// joints (metres; y up, +z forward, ground at 0) with radii [width, height] per joint; mirror: true makes .L/.R.
// Every chain carries a role (spine, neck, head, jaw, tail, leg, arm, wing, fin, tentacle, horn, ear, antenna, other)
// and a label, so a body passed on later reads plainly. locomotion: 'walk' (legs placed on the ground), 'fly' (wing
// chain named 'arm'), 'float' (hovers), 'slither' (glides along the ground), 'swim'.
const GREY = '#6e6a74', DARK = '#4a4650';
const lerp = (a, b, t) => a + (b - a) * t;
const R = (a, b, n) => Array.from({ length: n }, (_, i) => { const v = lerp(a, b, n > 1 ? i / (n - 1) : 0); return [v, v]; });
const ch = (name, role, label, pts, r, o = {}) => ({ name, role, label, pts, r, color: GREY, sides: 10, seg: 3, ...o });

// four legs: spine, neck, head (and jaw), front/hind legs, tail
function quad(o) {
  const { len = 1, h = 0.6, girth = 0.16, neck = 0.3, neckUp = 0.6, head = 0.28, headR = 0.09, legR = 0.05, tail = 0.5, tailR = 0.05, spread = 0.12, low = 0, ears = 0, horns = 0, tusks = 0, jaw = true } = o;
  const z0 = -len / 2, z1 = len / 2, sy = h, legH = h - low;
  const leg = (z, back) => [[spread, sy, z], [spread + 0.01, legH * 0.55, z + (back ? -0.08 : 0.04)], [spread, legH * 0.18, z + (back ? 0.04 : -0.02)], [spread, 0.03, z + 0.06], [spread, 0.01, z + 0.14]];
  const nx = z1 + neck * (1 - neckUp), ny = sy + neck * neckUp;
  const chains = [
    ch('spine', 'spine', 'back, hips to shoulders', [[0, sy, z0], [0, sy * 1.02, lerp(z0, z1, 0.33)], [0, sy * 1.04, lerp(z0, z1, 0.66)], [0, sy * 1.05, z1]], R(girth * 0.9, girth, 4)),
    ch('neck', 'neck', 'neck', [[0, sy * 1.05, z1], [0, lerp(sy, ny, 0.5), lerp(z1, nx, 0.5)], [0, ny, nx]], R(girth * 0.6, headR * 1.1, 3), { parent: 'spine:3' }),
    // the head: back of the skull, the brow (widest), the stop where the muzzle starts (narrower, lower), the nose
    ch('head', 'head', 'head: back of skull, brow, stop, nose', [[0, ny, nx], [0, ny + headR * 0.25, nx + head * 0.3], [0, ny + headR * 0.05, nx + head * 0.55], [0, ny - headR * 0.12, nx + head]], [[headR * 0.9, headR * 0.95], [headR * 1.05, headR * 0.95], [headR * 0.62, headR * 0.6], [headR * 0.34, headR * 0.3]], { parent: 'neck:2', joints: ['back of skull', 'brow', 'stop', 'nose'] }),
    ch('front', 'leg', 'front legs (hip, knee, ankle, paw, toes)', leg(z1 - 0.05, false), R(legR, legR * 0.5, 5), { parent: 'spine:3', mirror: true }),
    ch('hind', 'leg', 'hind legs (hip, knee, ankle, paw, toes)', leg(z0 + 0.05, true), R(legR * 1.15, legR * 0.5, 5), { parent: 'spine:0', mirror: true }),
  ];
  if (jaw) chains.push(ch('jaw', 'jaw', 'lower jaw: hinge, middle, chin', [[0, ny - headR * 0.35, nx + head * 0.2], [0, ny - headR * 0.55, nx + head * 0.55], [0, ny - headR * 0.5, nx + head * 0.92]], [[headR * 0.55, headR * 0.3], [headR * 0.42, headR * 0.22], [headR * 0.26, headR * 0.15]], { parent: 'head:0', joints: ['hinge', 'middle', 'chin'] }));
  if (tail > 0) chains.push(ch('tail', 'tail', 'tail, base to tip', Array.from({ length: 5 }, (_, i) => [0, sy - i * 0.04 * (o.tailDroop ?? 1), z0 - tail * i / 4]), R(tailR, tailR * 0.25, 5), { parent: 'spine:0' }));
  // ears: flat triangles (broad across, thin front to back), set on the back of the skull
  if (ears) chains.push(ch('ear', 'ear', 'ears (base, tip)', [[headR * 0.55, ny + headR * 0.75, nx + head * 0.18], [headR * 0.75, ny + headR * 0.75 + ears, nx + head * 0.1]], [[headR * 0.45, headR * 0.12], [0.004, 0.003]], { parent: 'head:1', mirror: true, sides: 6 }));
  if (horns) chains.push(ch('horn', 'horn', 'horns / antlers', [[headR * 0.5, ny + headR * 0.7, nx + head * 0.15], [headR * 0.5 + horns * 0.4, ny + headR * 0.7 + horns * 0.7, nx], [headR * 0.5 + horns * 0.7, ny + headR * 0.7 + horns, nx - horns * 0.3]], R(0.025, 0.006, 3), { parent: 'head:0', mirror: true, color: DARK }));
  if (tusks) chains.push(ch('tusk', 'horn', 'tusks', [[headR * 0.5, ny - headR * 0.3, nx + head * 0.75], [headR * 0.7, ny + tusks * 0.5, nx + head * 0.85 + tusks * 0.3]], R(0.02, 0.006, 2), { parent: 'head:1', mirror: true, color: '#ddd8c8' }));
  const parts = [{ bone: 'head:3', kind: 'sphere', at: [0, ny - headR * 0.05, nx + head + headR * 0.08], r: headR * 0.22, color: '#1a1716' }];   // the nose
  return { chains, parts };
}
// two legs, upright: spine (pelvis to chest), neck, head, arms, legs
function biped(o) {
  const { hgt = 1.75, girth = 0.15, arm = 0.7, legF = 0.5, head = 0.11, spread = 0.1, hunch = 0, tail = 0, ears = 0, wide = 1 } = o;
  const hip = hgt * legF, chest = hgt * 0.78, neckTop = hgt * 0.86, ah = chest - 0.02;
  const chains = [
    ch('spine', 'spine', 'spine, pelvis to chest', [[0, hip, 0], [0, lerp(hip, chest, 0.5), hunch * 0.3], [0, chest, hunch * 0.6]], [[girth * wide, girth * 0.8], [girth * 0.85 * wide, girth * 0.7], [girth * wide, girth * 0.8]]),
    ch('neck', 'neck', 'neck', [[0, chest, hunch * 0.6], [0, neckTop, hunch]], R(head * 0.5, head * 0.45, 2), { parent: 'spine:2' }),
    ch('head', 'head', 'head (base to crown/face)', [[0, neckTop, hunch], [0, neckTop + head, hunch + head * 0.2], [0, neckTop + head * 1.6, hunch + head * 0.1]], [[head * 0.8, head * 0.8], [head, head], [head * 0.6, head * 0.6]], { parent: 'neck:1' }),
    ch('arm', 'arm', 'arms (shoulder, elbow, wrist, hand)', [[girth * wide + 0.04, ah, hunch * 0.6], [girth * wide + 0.08, ah - arm * 0.45, hunch * 0.6], [girth * wide + 0.09, ah - arm * 0.88, hunch * 0.6 + 0.05], [girth * wide + 0.09, ah - arm, hunch * 0.6 + 0.07]], R(girth * 0.4, girth * 0.25, 4), { parent: 'spine:2', mirror: true }),
    ch('leg', 'leg', 'legs (hip, knee, ankle, foot, toes)', [[spread * wide, hip, 0], [spread * wide, hip * 0.52, 0.03], [spread * wide, 0.08, 0], [spread * wide, 0.02, 0.08], [spread * wide, 0.01, 0.16]], R(girth * 0.55, girth * 0.3, 5), { parent: 'spine:0', mirror: true }),
  ];
  if (tail) chains.push(ch('tail', 'tail', 'tail', Array.from({ length: 5 }, (_, i) => [0, hip - i * 0.1 * tail, -0.1 - tail * i / 4]), R(girth * 0.4, 0.01, 5), { parent: 'spine:0' }));
  if (ears) chains.push(ch('ear', 'ear', 'ears', [[head * 0.8, neckTop + head, hunch], [head * 0.8 + ears, neckTop + head + ears * 0.5, hunch - ears * 0.3]], R(0.03, 0.005, 2), { parent: 'head:1', mirror: true }));
  return { chains };
}
// many legs (insects, spiders, crabs, centipedes): a body chain and pairs of jointed legs splayed out
function legsy(o) {
  const { body = 0.5, h = 0.25, girth = 0.12, pairs = 3, legLen = 0.5, legR = 0.02, abdomen = 0, pincers = 0, sting = 0, antennae = 0 } = o;
  const zs = [-body / 2, -body / 6, body / 6, body / 2];
  const chains = [ch('body', 'spine', 'body (rear to front)', zs.map((z, i) => [0, h + (i === 3 ? 0.02 : 0), z]), R(girth, girth * 0.8, 4))];
  if (abdomen) chains.push(ch('abdomen', 'spine', 'abdomen', [[0, h, -body / 2], [0, h + abdomen * 0.3, -body / 2 - abdomen * 0.6], [0, h + abdomen * 0.2, -body / 2 - abdomen]], [[girth, girth], [girth * 1.8, girth * 1.6], [girth, girth]], { parent: 'body:0' }));
  for (let k = 0; k < pairs; k++) {
    const z = lerp(body / 2.2, -body / 2.2, pairs > 1 ? k / (pairs - 1) : 0.5), fan = (k / Math.max(1, pairs - 1) - 0.5) * 0.6;
    const pt = (dx, y, dz) => [girth * 0.8 + dx, y, z + dz];
    chains.push(ch(`leg${k + 1}`, 'leg', `legs, pair ${k + 1} from the front (hip, knee, ankle, tip)`, [pt(0, h, 0), pt(legLen * 0.4, h + legLen * 0.35, fan * legLen * 0.3), pt(legLen * 0.8, legLen * 0.25, fan * legLen * 0.6), pt(legLen * 0.95, 0.01, fan * legLen * 0.7)], R(legR, legR * 0.5, 4), { parent: 'body:1', mirror: true, sides: 6 }));
  }
  chains.push(ch('head', 'head', 'head', [[0, h + 0.02, body / 2], [0, h, body / 2 + girth * 1.2]], R(girth * 0.8, girth * 0.5, 2), { parent: 'body:3' }));
  if (pincers) chains.push(ch('claw', 'arm', 'pincers / claws (shoulder, elbow, claw, tip)', [[girth, h, body / 2], [girth + pincers * 0.4, h + 0.05, body / 2 + pincers * 0.3], [girth + pincers * 0.5, h + 0.02, body / 2 + pincers * 0.8], [girth + pincers * 0.45, h, body / 2 + pincers]], [[legR * 1.5, legR * 1.5], [legR * 2, legR * 2], [legR * 3.5, legR * 2.5], [legR, legR]], { parent: 'body:3', mirror: true }));
  if (sting) chains.push(ch('tail', 'tail', 'stinger tail, base to sting', Array.from({ length: 6 }, (_, i) => { const a = i / 5 * Math.PI * 0.95; return [0, h + Math.sin(a) * sting, -body / 2 - Math.sin(a * 0.6) * sting * 0.6 + (a > 1.6 ? (a - 1.6) * sting * 0.3 : 0)]; }), R(girth * 0.7, girth * 0.25, 6), { parent: 'body:0' }));
  if (antennae) chains.push(ch('antenna', 'antenna', 'antennae', [[girth * 0.3, h + 0.04, body / 2 + girth], [girth * 0.6, h + antennae * 0.5, body / 2 + girth + antennae * 0.5], [girth, h + antennae * 0.7, body / 2 + girth + antennae]], R(0.008, 0.003, 3), { parent: 'head:1', mirror: true, sides: 5 }));
  return { chains };
}
// a long body (serpents, worms, eels, fish): joints along a line, head at the front
function long(o) {
  const { len = 2.5, n = 8, girth = 0.08, y = null, head = 0.12, headR = 0.07, fins = 0, taper = 0.3 } = o;
  const yy = y ?? girth;
  const chains = [ch('spine', 'spine', 'body, tail tip to neck', Array.from({ length: n }, (_, i) => [0, yy, -len / 2 + len * i / (n - 1)]), Array.from({ length: n }, (_, i) => { const t = i / (n - 1), v = girth * (taper + (1 - taper) * Math.sin(Math.PI * Math.min(1, t * 1.3))); return [v, v * 0.9]; }), { sides: 10 })];
  chains.push(ch('head', 'head', 'head', [[0, yy, len / 2], [0, yy, len / 2 + head]], [[headR, headR * 0.8], [headR * 0.5, headR * 0.4]], { parent: `spine:${n - 1}` }));
  if (fins) {
    chains.push(ch('fin', 'fin', 'side fins', [[girth * 0.8, yy, len * 0.15], [girth + fins, yy - fins * 0.3, len * 0.1 - fins * 0.5]], R(0.02, 0.005, 2), { parent: `spine:${Math.floor(n * 0.6)}`, mirror: true }));
    chains.push(ch('dorsal', 'fin', 'back fin', [[0, yy + girth * 0.8, 0], [0, yy + girth + fins, -fins * 0.5]], R(0.02, 0.005, 2), { parent: `spine:${Math.floor(n / 2)}` }));
  }
  return { chains };
}
// wings added to a body: a wing chain named 'arm' (what the flight motion moves), fingers, and the membrane between
function wings(spec, o) {
  const { at = 'spine:2', x = 0.1, y = 1, z = 0, span = 1, fingers = true, membrane = true } = o;
  spec.chains.push(ch('arm', 'wing', 'wings (shoulder, elbow, wrist, tip)', [[x, y, z], [x + span * 0.35, y + 0.05, z - 0.05], [x + span * 0.65, y + 0.02, z - 0.02], [x + span, y, z - 0.08]], R(0.035, 0.012, 4), { parent: at, mirror: true }));
  if (fingers) for (const [k, a] of [[2, -0.3], [3, -0.6]]) spec.chains.push(ch(`f${k}`, 'wing', `wing finger ${k - 1}`, [[x + span * 0.65, y + 0.02, z - 0.02], [x + span * (0.8 - 0.1 * k / 3), y - 0.05, z + a * span * 0.4]], R(0.012, 0.005, 2), { parent: 'arm:2', mirror: true, sides: 5 }));
  if (membrane) (spec.webs ||= []).push({ mirror: true, a: [['arm', 0], ['arm', 1], ['arm', 2], ['arm', 3]], b: [['spine', 0], ['spine', 0], ['f3', 1], ['f2', 1]], color: '#3a3440', edge: '#2a2430', sag: 0.02 * span });
  return spec;
}
const look = (o = {}) => ({ rough: 0.85, ...o });

export const GENERA = {
  canine: { name: 'Canine (wolf, dog, fox)', plan: 'quadruped', locomotion: 'walk', spec: () => ({ ...quad({ len: 0.85, h: 0.55, head: 0.26, ears: 0.1, tail: 0.45, tailDroop: 0.6 }), look: look() }) },
  feline: { name: 'Feline (great cat, lynx)', plan: 'quadruped', locomotion: 'walk', spec: () => ({ ...quad({ len: 1.05, h: 0.6, girth: 0.17, neck: 0.22, neckUp: 0.4, head: 0.2, headR: 0.1, ears: 0.05, tail: 0.85, tailDroop: 0.3 }), look: look() }) },
  cervine: { name: 'Cervine & equine (deer, horse, elk)', plan: 'quadruped', locomotion: 'walk', spec: () => ({ ...quad({ len: 1.2, h: 1.1, girth: 0.22, neck: 0.6, neckUp: 0.75, head: 0.4, headR: 0.1, legR: 0.05, tail: 0.2, ears: 0.12, horns: 0.45 }), look: look() }) },
  boar: { name: 'Boar & swine', plan: 'quadruped', locomotion: 'walk', spec: () => ({ ...quad({ len: 1.0, h: 0.55, girth: 0.26, neck: 0.12, neckUp: 0.1, head: 0.38, headR: 0.13, legR: 0.055, tail: 0.15, ears: 0.08, tusks: 0.1 }), look: look() }) },
  bear: { name: 'Bear (and other heavy beasts)', plan: 'quadruped', locomotion: 'walk', spec: () => ({ ...quad({ len: 1.3, h: 0.85, girth: 0.34, neck: 0.25, neckUp: 0.2, head: 0.35, headR: 0.15, legR: 0.1, tail: 0.08, ears: 0.06, spread: 0.18 }), look: look() }) },
  rodent: { name: 'Rodent (rat, giant rat)', plan: 'quadruped', locomotion: 'walk', spec: () => ({ ...quad({ len: 0.45, h: 0.18, girth: 0.09, neck: 0.06, neckUp: 0.2, head: 0.14, headR: 0.05, legR: 0.018, tail: 0.5, tailR: 0.012, tailDroop: 0.2, ears: 0.04, spread: 0.05 }), look: look() }) },
  humanoid: { name: 'Humanoid (human, elf, undead)', plan: 'biped', locomotion: 'walk', spec: () => ({ ...biped({}), look: look() }) },
  goblinoid: { name: 'Goblinoid (goblin, kobold, imp)', plan: 'biped', locomotion: 'walk', spec: () => ({ ...biped({ hgt: 1.05, girth: 0.11, arm: 0.5, head: 0.11, hunch: 0.06, ears: 0.12 }), look: look() }) },
  giant: { name: 'Giant (ogre, troll, golem)', plan: 'biped', locomotion: 'walk', spec: () => ({ ...biped({ hgt: 3.0, girth: 0.38, arm: 1.4, legF: 0.42, head: 0.17, hunch: 0.25, wide: 1.2, spread: 0.18 }), look: look() }) },
  ape: { name: 'Ape (gorilla, yeti)', plan: 'biped', locomotion: 'walk', spec: () => ({ ...biped({ hgt: 1.6, girth: 0.26, arm: 1.05, legF: 0.38, head: 0.13, hunch: 0.35, wide: 1.1 }), look: look() }) },
  bird: { name: 'Bird (raptor, crow, roc)', plan: 'winged', locomotion: 'fly', hover: 1.6, spec: () => { const s = { ...biped({ hgt: 0.55, girth: 0.12, arm: 0.01, legF: 0.4, head: 0.07, hunch: 0.1 }), look: look() }; s.chains = s.chains.filter(c => c.name !== 'arm'); s.chains.push(ch('tail', 'tail', 'tail feathers', [[0, 0.24, -0.08], [0, 0.2, -0.32]], [[0.06, 0.015], [0.1, 0.01]], { parent: 'spine:0' })); return wings(s, { at: 'spine:2', x: 0.08, y: 0.42, span: 0.7, fingers: false, membrane: false }); } },
  bat: { name: 'Bat', plan: 'winged', locomotion: 'fly', hover: 1.5, spec: () => wings({ chains: [ch('spine', 'spine', 'body', [[0, 0, -0.1], [0, 0, 0.0], [0, 0.01, 0.08]], R(0.06, 0.07, 3)), ch('neck', 'neck', 'neck', [[0, 0.01, 0.08], [0, 0.02, 0.12]], R(0.05, 0.05, 2), { parent: 'spine:2' }), ch('head', 'head', 'head', [[0, 0.02, 0.12], [0, 0.03, 0.18], [0, 0.02, 0.22]], R(0.05, 0.02, 3), { parent: 'neck:1' }), ch('ear', 'ear', 'ears', [[0.025, 0.06, 0.15], [0.04, 0.12, 0.14]], R(0.015, 0.004, 2), { parent: 'head:0', mirror: true }), ch('leg', 'leg', 'hind legs', [[0.03, -0.02, -0.1], [0.05, -0.04, -0.18], [0.05, -0.05, -0.24]], R(0.012, 0.006, 3), { parent: 'spine:0', mirror: true })], look: look() }, { at: 'spine:2', x: 0.04, y: 0.02, z: 0.06, span: 0.65 }) },
  dragon: { name: 'Dragon (four legs, wings)', plan: 'winged', locomotion: 'walk', spec: () => wings({ ...quad({ len: 2.4, h: 1.2, girth: 0.4, neck: 1.0, neckUp: 0.6, head: 0.6, headR: 0.18, legR: 0.12, tail: 2.6, tailR: 0.16, horns: 0.3, spread: 0.3 }), look: look() }, { at: 'spine:3', x: 0.3, y: 1.35, z: 0.9, span: 2.6 }) },
  wyvern: { name: 'Wyvern (two legs, wings)', plan: 'winged', locomotion: 'walk', spec: () => { const s = quad({ len: 1.6, h: 1.0, girth: 0.3, neck: 0.8, neckUp: 0.55, head: 0.5, headR: 0.14, legR: 0.1, tail: 2.0, tailR: 0.12, spread: 0.22 }); s.chains = s.chains.filter(c => c.name !== 'front'); s.look = look(); return wings(s, { at: 'spine:3', x: 0.22, y: 1.1, z: 0.6, span: 2.0 }); } },
  serpent: { name: 'Serpent (snake, naga tail)', plan: 'serpentine', locomotion: 'slither', spec: () => ({ ...long({ len: 3, n: 10, girth: 0.09, head: 0.16, headR: 0.08 }), look: look() }) },
  lizard: { name: 'Lizard (salamander, drake)', plan: 'quadruped', locomotion: 'walk', spec: () => ({ ...quad({ len: 0.8, h: 0.2, girth: 0.11, neck: 0.12, neckUp: 0.15, head: 0.2, headR: 0.06, legR: 0.03, tail: 0.9, tailR: 0.06, tailDroop: 0.3, spread: 0.16 }), look: look() }) },
  crocodilian: { name: 'Crocodilian (crocodile, basilisk)', plan: 'quadruped', locomotion: 'walk', spec: () => ({ ...quad({ len: 1.8, h: 0.35, girth: 0.22, neck: 0.15, neckUp: 0.05, head: 0.7, headR: 0.1, legR: 0.06, tail: 2.0, tailR: 0.16, tailDroop: 0.1, spread: 0.25 }), look: look() }) },
  tortoise: { name: 'Tortoise & turtle', plan: 'quadruped', locomotion: 'walk', spec: () => { const s = quad({ len: 0.7, h: 0.3, girth: 0.12, neck: 0.25, neckUp: 0.3, head: 0.14, headR: 0.06, legR: 0.06, tail: 0.1, spread: 0.24 }); s.parts = [...(s.parts || []), { bone: 'spine:1', kind: 'sphere', at: [0, 0.38, 0.05], r: 0.45, scale: [1, 0.55, 1.2], color: '#5a5040' }]; s.look = look(); return s; } },
  frog: { name: 'Frog & toad', plan: 'quadruped', locomotion: 'walk', spec: () => { const s = quad({ len: 0.3, h: 0.16, girth: 0.12, neck: 0.04, neckUp: 0.4, head: 0.12, headR: 0.1, legR: 0.03, tail: 0, spread: 0.1, jaw: true }); const hind = s.chains.find(c => c.name === 'hind'); hind.pts = [[0.1, 0.16, -0.12], [0.2, 0.14, 0.0], [0.16, 0.05, -0.2], [0.18, 0.01, -0.05], [0.2, 0.01, 0.06]]; s.look = look(); return s; } },
  fish: { name: 'Fish (shark, piranha)', plan: 'aquatic', locomotion: 'swim', hover: 0.8, spec: () => ({ ...long({ len: 1.2, n: 6, girth: 0.16, y: 0, head: 0.18, headR: 0.12, fins: 0.18, taper: 0.15 }), look: look() }) },
  eel: { name: 'Eel (sea serpent)', plan: 'aquatic', locomotion: 'swim', hover: 0.8, spec: () => ({ ...long({ len: 2.2, n: 10, girth: 0.07, y: 0, head: 0.14, headR: 0.07, fins: 0.04 }), look: look() }) },
  spider: { name: 'Spider (arachnid)', plan: 'multi-legged', locomotion: 'walk', spec: () => ({ ...legsy({ body: 0.3, h: 0.3, girth: 0.12, pairs: 4, legLen: 0.6, legR: 0.018, abdomen: 0.45 }), look: look() }) },
  beetle: { name: 'Insect (beetle, ant, mantis)', plan: 'multi-legged', locomotion: 'walk', spec: () => ({ ...legsy({ body: 0.6, h: 0.22, girth: 0.16, pairs: 3, legLen: 0.4, legR: 0.02, antennae: 0.25 }), look: look() }) },
  scorpion: { name: 'Scorpion', plan: 'multi-legged', locomotion: 'walk', spec: () => ({ ...legsy({ body: 0.6, h: 0.18, girth: 0.13, pairs: 4, legLen: 0.4, legR: 0.016, pincers: 0.4, sting: 0.5 }), look: look() }) },
  centipede: { name: 'Centipede (crawler)', plan: 'multi-legged', locomotion: 'walk', spec: () => ({ ...legsy({ body: 1.6, h: 0.12, girth: 0.07, pairs: 8, legLen: 0.2, legR: 0.01, antennae: 0.2 }), look: look() }) },
  crab: { name: 'Crab (crustacean)', plan: 'multi-legged', locomotion: 'walk', spec: () => { const s = legsy({ body: 0.4, h: 0.25, girth: 0.25, pairs: 4, legLen: 0.55, legR: 0.025, pincers: 0.45 }); s.chains[0].r = [[0.25, 0.1], [0.3, 0.12], [0.3, 0.12], [0.22, 0.1]]; s.look = look(); return s; } },
  octopus: { name: 'Octopus & squid (tentacled)', plan: 'tentacled', locomotion: 'float', hover: 0.4, spec: () => ({ chains: [ch('mantle', 'spine', 'mantle (body), base to top', [[0, 0.3, 0], [0, 0.65, -0.1], [0, 0.95, -0.25]], [[0.22, 0.2], [0.26, 0.24], [0.12, 0.1]]), ch('head', 'head', 'head / eyes', [[0, 0.3, 0.05], [0, 0.32, 0.2]], R(0.18, 0.12, 2), { parent: 'mantle:0' }), ...[0, 1, 2, 3].map(k => { const a = (k + 0.5) / 4 * Math.PI * 0.9; return ch(`arm${k + 1}`, 'tentacle', `tentacles, pair ${k + 1}`, Array.from({ length: 5 }, (_, i) => [Math.sin(a) * (0.12 + i * 0.12), 0.28 - i * 0.07, Math.cos(a) * (0.12 + i * 0.12) * 0.6]), R(0.05, 0.01, 5), { parent: 'mantle:0', mirror: true }); })], look: look() }) },
  slime: { name: 'Slime (ooze, blob)', plan: 'amorphous', locomotion: 'slither', spec: () => ({ chains: [ch('body', 'spine', 'blob (back to front)', [[0, 0.25, -0.15], [0, 0.3, 0], [0, 0.25, 0.15]], [[0.3, 0.22], [0.38, 0.3], [0.3, 0.22]], { sides: 16 })], look: look({ rough: 0.2 }) }) },
  worm: { name: 'Worm (grub, giant worm)', plan: 'serpentine', locomotion: 'slither', spec: () => ({ ...long({ len: 2, n: 9, girth: 0.14, head: 0.12, headR: 0.13, taper: 0.7 }), look: look() }) },
  wraith: { name: 'Wraith (ghost, floating spirit)', plan: 'floating', locomotion: 'float', hover: 0.5, spec: () => { const s = biped({ hgt: 1.8, girth: 0.14, arm: 0.75, hunch: 0.15 }); s.chains = s.chains.filter(c => c.name !== 'leg'); s.chains.push(ch('tail', 'tail', 'trailing wisp (the lower body)', [[0, 0.9, 0], [0, 0.6, -0.12], [0, 0.35, -0.25], [0, 0.15, -0.4]], [[0.16, 0.13], [0.13, 0.11], [0.08, 0.07], [0.02, 0.02]], { parent: 'spine:0', fade: [0.4, 1] })); s.look = look({ shade: true, smoke: 0.8, body: '#0a0810', rim: '#3a2860', smokeColor: '#100a1a' }); return s; } },
};
export const ROLES = ['spine', 'neck', 'head', 'jaw', 'tail', 'leg', 'arm', 'wing', 'fin', 'tentacle', 'horn', 'ear', 'antenna', 'other'];
