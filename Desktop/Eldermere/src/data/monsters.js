import { BUILTIN } from './creatures.js';
// src/data/monsters.js — the monsters: what each one is (classification, hazard and rank, activity, resistances) and
// how its body is built (a body plan and sliders → a spec for src/rpg/creature.js). docs/MONSTERS.md is the guide.
//
//   stats { hp, poise, speed, aggro, radius, height }, zones { name: { bones, mult } }, and per move damage, power (how
//   hard to block), reach (m round its hitbox bones), range [min, max] (when it chooses it), cooldown, type
//   group: 'swarm' (20–30 at once, must cost nothing) | 'pack' (5–10) | 'pair' (2–4) | 'solo' | 'boss' — sets its budget
//   MONSTERS[id] = { name, group, plan, hover (flying height, m), classification: [type, order], hazard, rank: [lowest, highest], activity, resist,
//                    params: { key: [min, max, default, label] }, spec(p) → creature spec, idle(C, t, p) }
//   resist: damage multipliers by type (missing = 1): slash, pierce, blunt, crush, fire, frost, storm, earth, light,
//           lunar, dark… (0 = immune)
// Ranks run Wood, Bronze, Silver, Gold, Crystal (and above: Tempest, Cataclysmic on the hazard scale); Black means
// the guild hasn't classified it.

export const HAZARDS = ['Safe', 'Nuisance', 'Menace', 'Dread', 'Tempest', 'Cataclysmic'];
export const RANKS = ['Wood', 'Bronze', 'Silver', 'Gold', 'Crystal'];
export const PHYSICAL = ['slash', 'pierce', 'blunt', 'crush'];
export const ILLUMINATING = ['fire', 'lunar', 'light'];

// a shade's eyes: deep black orbs that glow darkness (a halo of black round them, the faintest violet edge)
const voidEyes = (bone, at, r) => [
  { bone, kind: 'sphere', at, r, emissive: '#000000', mirror: true },
  { bone, kind: 'glow', at: [at[0] * 1.05, at[1], at[2] + r * 0.6], r: r * 3.2, color: '#000000', opacity: 0.85, dark: true, mirror: true },
  { bone, kind: 'glow', at: [at[0] * 1.05, at[1], at[2] + r * 0.4], r: r * 2.2, color: '#5a2aa0', opacity: 0.35, mirror: true },
];
const sc = (s, pts) => pts.map(p => p.map(v => v * s));
const scr = (s, rs) => rs.map(r => r.map(v => v * s));

export const MONSTERS = {
  // ---- Nocturian bat: kin of the Umbrafiends — a bat-shaped creature of darkness and smoke ----
  nocturianBat: {
    name: 'Nocturian bat', group: 'swarm', plan: 'winged', hover: 1.5, roost: 4.5, tower: { attack: 20, circle: 20, show: 60 },   // tower (bats only): a big swarm fights in three bands — 20 attacking, 20 circling above, the rest a reserve ring higher still (60 of them drawn)
    focus: 1.5,   // roost: how high (above hover) a swarm hangs while idle, looking down
    classification: ['Essence Tiers', 'Spectral Essence'], hazard: 'Nuisance', rank: ['Wood', 'Bronze'], activity: 'Lunar',
    resist: { slash: 0.05, pierce: 0.05, blunt: 0.05, crush: 0.05, fire: 2, lunar: 2, light: 2, dark: 0, shadow: 0 },   // (the Umbrafiends' kind: darkness and smoke)
    lore: 'Kin of the Umbrafiends: a bat-shaped knot of darkness the size of a hound, smoke trailing off wings wider than a man is tall. Hunts in packs at night, dropping on its prey from the dark. Steel barely touches it; light tears it apart.',
    params: { size: [0.6, 1.6, 1, 'Size'], wings: [0.7, 1.4, 1, 'Wingspan'], ears: [0.5, 1.8, 1, 'Ears'], girth: [0.8, 1.8, 1.3, 'Body'], smoke: [0, 1, 0.7, 'Smoke'] },
    spec(p) {
      const s = p.size, w = p.wings, g = p.girth, e = p.ears;
      const W = (x, y, z) => [x * w, y, z];                                                   // wing points stretch with the span
      const c = '#07040c', fin = [0.55, 1];
      const finger = (name, pts) => ({ name, parent: 'arm:2', mirror: true, pts: sc(s, pts), r: scr(s, [[0.011, 0.011], [0.008, 0.008], [0.004, 0.004]]), color: c, sides: 8, fade: fin });
      return {
        chains: [
          { name: 'spine', pts: sc(s, [[0, 0, -0.18], [0, 0.01, 0], [0, 0.02, 0.14]]), r: scr(s, [[0.07 * g, 0.06 * g], [0.1 * g, 0.09 * g], [0.085 * g, 0.08 * g]]), color: c, sides: 16, seg: 5 },
          { name: 'head', parent: 'spine:2', pts: sc(s, [[0, 0.03, 0.14], [0, 0.05, 0.22], [0, 0.04, 0.3]]), r: scr(s, [[0.07, 0.065], [0.065, 0.06], [0.022, 0.02]]), color: c, sides: 14, seg: 5 },
          { name: 'jaw', parent: 'head:1', pts: sc(s, [[0, 0.015, 0.21], [0, 0.005, 0.285]]), r: scr(s, [[0.03, 0.012], [0.011, 0.007]]), color: c },
          { name: 'ear', parent: 'head:1', mirror: true, pts: sc(s, [[0.035, 0.08, 0.21], [0.035 + 0.025 * e, 0.08 + 0.09 * e, 0.2], [0.035 + 0.035 * e, 0.08 + 0.16 * e, 0.18]]), r: scr(s, [[0.03 * e, 0.012], [0.034 * e, 0.01], [0.004, 0.003]]), color: c, sides: 10, fade: [0.5, 1] },
          { name: 'arm', parent: 'spine:2', mirror: true, pts: sc(s, [[0.06, 0.03, 0.1], W(0.32, 0.05, 0.02), W(0.62, 0.06, 0.12)]), r: scr(s, [[0.04, 0.034], [0.02, 0.018], [0.014, 0.014]]), color: c, sides: 10, seg: 5 },
          finger('f2', [W(0.62, 0.06, 0.12), W(0.85, 0.06, 0.2), W(1.05, 0.05, 0.16)]),
          finger('f3', [W(0.62, 0.06, 0.12), W(0.9, 0.05, 0.02), W(1.12, 0.04, -0.12)]),
          finger('f4', [W(0.62, 0.06, 0.12), W(0.78, 0.04, -0.15), W(0.86, 0.03, -0.38)]),
          finger('f5', [W(0.62, 0.06, 0.12), W(0.62, 0.04, -0.25), W(0.5, 0.03, -0.45)]),
          { name: 'leg', parent: 'spine:0', mirror: true, pts: sc(s, [[0.05, -0.02, -0.14], [0.1, -0.05, -0.26], [0.12, -0.06, -0.36]]), r: scr(s, [[0.028, 0.024], [0.014, 0.014], [0.006, 0.006]]), color: c, sides: 10, fade: [0.2, 1] },
          { name: 'tail', parent: 'spine:0', pts: sc(s, [[0, 0, -0.18], [0, -0.01, -0.3], [0, -0.02, -0.42]]), r: scr(s, [[0.02, 0.02], [0.012, 0.012], [0.004, 0.004]]), color: c, sides: 8, fade: [0, 1] },
        ],
        webs: [
          { mirror: true, solid: 'membrane', a: [['f2', 0], ['f2', 1], ['f2', 2]], b: [['f3', 0], ['f3', 1], ['f3', 2]], sag: 0.01 * s },
          { mirror: true, solid: 'membrane', a: [['f3', 0], ['f3', 1], ['f3', 2]], b: [['f4', 0], ['f4', 1], ['f4', 2]], sag: 0.015 * s },
          { mirror: true, solid: 'membrane', a: [['f4', 0], ['f4', 1], ['f4', 2]], b: [['f5', 0], ['f5', 1], ['f5', 2]], sag: 0.015 * s },
          { mirror: true, solid: 'membrane', a: [['f5', 0], ['f5', 1], ['f5', 2]], b: [['arm', 0], ['spine', 0], ['leg', 2]], sag: 0.02 * s, rows: 8, cols: 10 },
          { mirror: true, solid: 'membrane', a: [['arm', 0], ['arm', 1], ['arm', 2]], b: [['arm', 0], ['f5', 0]] },
          { mirror: true, solid: 'membrane', a: [['leg', 0], ['leg', 1], ['leg', 2]], b: [['tail', 0], ['tail', 1], ['tail', 2]], sag: 0.01 * s },
        ],
        parts: [
          ...voidEyes('head:1', [0.034 * s, 0.065 * s, 0.25 * s], 0.014 * s),
          { bone: 'spine:1', kind: 'glow', at: [0, 0.01 * s, 0.02 * s], r: 0.12 * s, color: '#7a40ff', opacity: 0.35 },    // a small core in its chest
        ],
        look: { shade: true, cheap: true, smoke: p.smoke, rim: '#2a1250', body: '#030206', smokeColor: '#0c0616', webColor: '#0a0612', wispRise: 0.22, wispSize: 0.45 },   // cheap: a swarm creature's look (solid cut-out wings, a third of the smoke, no halos)
      };
    },
    // flight (src/rpg/creatureMotion.js): hovering wingbeats; flying forward, nose down, slower deeper beats
    flight: { beat: 5.2, slow: 1.6, amp: 0.75, cruise: 6, pitch: -0.25, fingers: ['f2', 'f3', 'f4', 'f5'], erratic: [0.35, 0.22, 0.25] }, maxSpeed: 8,
    // fighting (at Wood rank; higher ranks scale these): health, poise (how much battering before it staggers), speed;
    // hit zones (the nearest zone's bone to where a blow lands takes it, × its multiplier)
    // its voice (src/game/audio.js MON): wing beats, hurt, death; moves name their own sounds (sfx: [[u, name]])
    voice: { flap: 'batFlap', hurt: 'batHurt', die: 'batDie' },
    stats: { hp: 26, poise: 14, speed: 4.5, aggro: 12, radius: 0.35, height: 0.5 },
    zones: { head: { bones: ['head:1'], mult: 1.5 }, body: { bones: ['spine:1'], mult: 1 }, wing: { bones: ['arm.L:1', 'arm.R:1', 'f3.L:1', 'f3.R:1'], mult: 0.6 } },
    // idle life on top of the flight: ears twitching, the head looking round, the jaw working
    idle(C, t, p) {
      const b = C.bones, calm = 1 - 0.7 * (p.moving || 0);
      for (const sd of ['L', 'R']) { const k = sd === 'L' ? 1 : -1; b[`ear.${sd}:0`].rotation.set(0, 0, k * 0.08 * Math.sin(t * 3.1 + k)); }
      b['head:0'].rotation.set(0.1 * Math.sin(t * 0.9) * calm, 0.25 * Math.sin(t * 0.6) * calm, 0);
      b['jaw:0'].rotation.x = 0.15 + 0.15 * Math.max(0, Math.sin(t * 1.3));
    },
    moves: {
      // the swoop bite: climb, fold the wings and dive with the jaws already open, bite as it strikes, and carry on past
      // you, beating back up the far side (keepRoot: it stays where the swoop took it, then turns for another pass)
      swoop: { dur: 1.5, keepRoot: true, sfx: [[0.24, 'batSwoop'], [0.5, 'batBite']], hit: [0.5, 0.64], hitbox: ['head:2'], damage: 9, power: 0.8, reach: 0.6, range: [2.5, 6], cooldown: 2.5, lunge: { travel: 1.6, stop: 0.3, min: 0.8, max: 3.5 }, keys: [
        { t: 0.22, root: [0, 0.4, -0.4, 0.3], rot: { 'head:0': [-0.15, 0, 0] } },
        { t: 0.46, root: [0, -0.85, 1.15, -0.7], flap: 0, rot: { 'arm.L:0': [0, 0.5, -0.4], 'arm.R:0': [0, -0.5, 0.4], 'arm.L:1': [0, 0.6, 0], 'arm.R:1': [0, -0.6, 0], 'jaw:0': [0.7, 0, 0], 'head:0': [-0.35, 0, 0] } },
        { t: 0.56, root: [0, -1.1, 1.6, -0.35], flap: 0.2, rot: { 'arm.L:0': [0, 0.3, -0.2], 'arm.R:0': [0, -0.3, 0.2], 'jaw:0': [0.0, 0, 0], 'head:0': [0.3, 0, 0] } },
        { t: 0.66, root: [0, -1.0, 2.0, -0.1], flap: 0.5, rot: { 'jaw:0': [0.05, 0, 0], 'head:0': [0.15, 0, 0] } },
        { t: 0.84, root: [0, -0.4, 2.85, 0.35], flap: 1 },
        { t: 1, root: [0, 0, 3.3, 0], flap: 1 },
      ] },
      // a screech that dazes: head back, jaws wide, wings thrown up and held
      // the aura (fx): a swell of darkness from its head; whatever it washes over hears half as well and sees a tenth as far
      screech: { dur: 1.4, sfx: [[0.24, 'batScreech']], hit: [0.3, 0.75], hitbox: ['aura'], range: [0, 5], cooldown: 9, fx: [{ kind: 'aura', bone: 'head:1', from: 0.28, to: 0.85, radius: 6, effect: { hearing: 0.5, sight: 0.05, seconds: 8 } }], keys: [
        { t: 0.25, root: [0, 0.12, -0.1, 0.35], flap: 0.2, rot: { 'head:0': [-0.6, 0, 0], 'jaw:0': [0.9, 0, 0], 'arm.L:0': [0, 0, 0.55], 'arm.R:0': [0, 0, -0.55] } },
        { t: 0.75, root: [0, 0.12, -0.1, 0.35], flap: 0.2, rot: { 'head:0': [-0.6, 0, 0], 'jaw:0': [0.9, 0, 0], 'arm.L:0': [0, 0, 0.55], 'arm.R:0': [0, 0, -0.55] } },
      ] },
    },
  },
  // ---- Umbrafiend: a beast made of shadow ----
  umbrafiend: {
    name: 'Umbrafiend', group: 'pack', plan: 'shade', focus: 0.9,
    classification: ['Essence Tiers', 'Spectral Essence'], hazard: 'Menace', rank: ['Bronze', 'Silver'], activity: 'Lunar',
    resist: { slash: 0.05, pierce: 0.05, blunt: 0.05, crush: 0.05, fire: 2, lunar: 2, light: 2, dark: 0, shadow: 0 },
    lore: 'A beast of living shadow. Steel passes through it like smoke; only light truly wounds it. It sinks into the dark and rises behind its prey. A core burns inside it.',
    params: { size: [0.7, 1.6, 1, 'Size'], legs: [0.8, 1.3, 1, 'Leg length'], tail: [0.5, 1.6, 1, 'Tail'], smoke: [0, 1, 0.65, 'Smoke'], core: [0, 2, 1, 'Core glow'] },
    // A dark, bony frame like the bat's — a long skull, a spine of thin vertebrae, a cage of ribs, thin jointed legs —
    // and where its flesh would be, a purple aura: a rolling cloud in the shape of its body round the bones, the core
    // burning inside the ribs.
    spec(p) {
      const s = p.size, L = p.legs, T = p.tail, lift = (L - 1) * 0.9;              // longer legs raise the body
      const Y = y => y + lift, c = '#07040c';
      const leg = (x, top, z0, z1, z2) => [[x, Y(top), z0], [x + 0.02, 0.6 * L, z1], [x, 0.25 * L, z2], [x, 0.03, z2 + 0.08], [x, 0.01, z2 + 0.18]];   // hip, knee, ankle, paw, toes
      const legR = [[0.055, 0.06], [0.04, 0.04], [0.03, 0.03], [0.024, 0.02], [0.008, 0.006]];
      // ribs: from the spine, out, down round the chest and in under it (shorter toward the back)
      const rib = (i, parent, z, yS, k) => ({ name: `rib${i}`, parent, mirror: true, color: c, sides: 8, seg: 5,
        pts: sc(s, [[0.04, Y(yS), z], [0.2 * k, Y(yS - 0.05), z], [0.27 * k, Y(yS - 0.26 * k), z + 0.03], [0.21 * k, Y(yS - 0.48 * k), z + 0.06], [0.07, Y(yS - 0.58 * k), z + 0.08]]),
        r: scr(s, [[0.024, 0.024], [0.02, 0.02], [0.018, 0.018], [0.015, 0.015], [0.01, 0.01]]) });
      const ribs = [rib(0, 'spine:1', -0.12, 1.02, 0.8), rib(1, 'spine:2', 0.06, 1.06, 0.92), rib(2, 'spine:2', 0.24, 1.08, 1), rib(3, 'spine:3', 0.42, 1.1, 0.95)];
      return {
        chains: [
          { name: 'spine', pts: sc(s, [[0, Y(0.95), -0.6], [0, Y(1.0), -0.2], [0, Y(1.08), 0.2], [0, Y(1.1), 0.5]]), r: scr(s, [[0.06, 0.07], [0.065, 0.075], [0.07, 0.08], [0.065, 0.075]]), color: c, sides: 12, seg: 6, aura: scr(s, [[0.21, 0.24], [0.25, 0.3], [0.29, 0.37], [0.25, 0.32]]) },
          { name: 'neck', parent: 'spine:3', pts: sc(s, [[0, Y(1.12), 0.5], [0, Y(1.25), 0.75], [0, Y(1.3), 0.9]]), r: scr(s, [[0.06, 0.07], [0.05, 0.055], [0.055, 0.06]]), color: c, sides: 12, seg: 5, aura: scr(s, [[0.19, 0.22], [0.14, 0.16], [0.13, 0.14]]) },
          { name: 'head', parent: 'neck:2', pts: sc(s, [[0, Y(1.3), 0.88], [0, Y(1.32), 1.02], [0, Y(1.24), 1.32]]), r: scr(s, [[0.1, 0.1], [0.095, 0.085], [0.035, 0.035]]), color: c, sides: 14, seg: 5, aura: scr(s, [[0.14, 0.14], [0.13, 0.12], [0.06, 0.06]]) },
          { name: 'jaw', parent: 'head:0', pts: sc(s, [[0, Y(1.2), 0.96], [0, Y(1.13), 1.27]]), r: scr(s, [[0.045, 0.022], [0.022, 0.012]]), color: c, sides: 8 },
          { name: 'horn', parent: 'head:0', mirror: true, pts: sc(s, [[0.06, Y(1.38), 0.92], [0.15, Y(1.5), 0.8], [0.2, Y(1.55), 0.6]]), r: scr(s, [[0.026, 0.026], [0.016, 0.016], [0.003, 0.003]]), color: c, sides: 8, fade: [0.7, 1] },
          { name: 'scapula', parent: 'spine:3', mirror: true, pts: sc(s, [[0.05, Y(1.12), 0.48], [0.18, Y(1.0), 0.44]]), r: scr(s, [[0.035, 0.04], [0.045, 0.05]]), color: c, sides: 8 },
          { name: 'pelvis', parent: 'spine:0', mirror: true, pts: sc(s, [[0.04, Y(0.95), -0.58], [0.17, Y(0.9), -0.56]]), r: scr(s, [[0.04, 0.045], [0.05, 0.055]]), color: c, sides: 8 },
          { name: 'front', parent: 'scapula:1', mirror: true, pts: sc(s, leg(0.18, 1.0, 0.44, 0.5, 0.42)), r: scr(s, legR), color: c, sides: 10, seg: 5, fade: [0.72, 1], aura: scr(s, [[0.12, 0.14], [0.08, 0.085], [0.05, 0.05], [0.03, 0.03], [0.01, 0.01]]), auraFade: [0.55, 1] },
          { name: 'hind', parent: 'pelvis:1', mirror: true, pts: sc(s, leg(0.17, 0.9, -0.56, -0.4, -0.65)), r: scr(s, legR.map(r => r.map(v => v * 1.1))), color: c, sides: 10, seg: 5, fade: [0.72, 1], aura: scr(s, [[0.14, 0.17], [0.08, 0.085], [0.05, 0.05], [0.03, 0.03], [0.01, 0.01]]), auraFade: [0.55, 1] },
          { name: 'tail', parent: 'spine:0', pts: sc(s, [[0, Y(0.95), -0.6], [0, Y(0.9), -0.6 - 0.35 * T], [0, Y(0.75), -0.6 - 0.7 * T], [0, Y(0.65), -0.6 - 1.0 * T], [0, Y(0.6), -0.6 - 1.25 * T]]), r: scr(s, [[0.045, 0.045], [0.035, 0.035], [0.026, 0.026], [0.018, 0.018], [0.006, 0.006]]), color: c, sides: 8, seg: 5, fade: [0.65, 1], aura: scr(s, [[0.11, 0.11], [0.08, 0.08], [0.06, 0.06], [0.04, 0.04], [0.01, 0.01]]), auraFade: [0.4, 1] },
          ...ribs,
        ],
        parts: [
          ...voidEyes('head:1', [0.062 * s, Y(1.36) * s, 1.07 * s], 0.026 * s),
          { bone: 'spine:2', kind: 'sphere', at: [0, Y(0.82) * s, 0.2 * s], r: 0.08 * s, emissive: '#9a60ff' },
          { bone: 'spine:2', kind: 'glow', at: [0, Y(0.82) * s, 0.2 * s], r: 0.4 * s * p.core, color: '#8040ff', opacity: 0.6 * Math.min(1, p.core) },
        ],
        look: { shade: true, smoke: p.smoke, coreGlow: p.core, rim: '#2a1250', body: '#030206', smokeColor: '#0c0616', aura: '#1e0c40', auraGlow: '#5a28b8', wispRise: 0.45, wispSize: 0.8, puffK: 0.6 },   // puffK: a pack creature's smoke, thinner but denser puffs (8 up close was a lot of overdraw)
      };
    },
    // four legs (src/rpg/creatureMotion.js): a walk that turns into a trot; it prowls low, head down
    gait: { stride: 0.8, trotAt: 2.6, lift: 0.12, crouch: 0.07, lean: 0.03, headLow: 0.14,
      legs: [{ chain: 'hind.L', walk: 0, trot: 0.5 }, { chain: 'front.L', walk: 0.25, trot: 0 }, { chain: 'hind.R', walk: 0.5, trot: 0 }, { chain: 'front.R', walk: 0.75, trot: 0.5 }] },
    maxSpeed: 7,
    voice: { step: 'fiendStep', growl: 'fiendGrowl', hurt: 'fiendHurt', die: 'fiendDie' },
    stats: { hp: 70, poise: 34, speed: 5.6, aggro: 14, radius: 0.5, height: 1.4, len: 0.6 },
    zones: { core: { bones: ['spine:2'], mult: 2.5, at: [0, -0.25, 0] }, head: { bones: ['head:1'], mult: 1.4 }, body: { bones: ['spine:1', 'spine:3'], mult: 1 }, legs: { bones: ['front.L:1', 'front.R:1', 'hind.L:1', 'hind.R:1'], mult: 0.7 }, tail: { bones: ['tail:2'], mult: 0.5 } },
    // idle life: slow breaths, the head swinging to look, the tail coiling, the core pulsing
    idle(C, t, p) {
      const b = C.bones, br = Math.sin(t * 1.4), calm = 1 - 0.7 * (p.moving || 0);
      b['spine:1'].rotation.x = 0.02 * br; b['spine:2'].rotation.x = -0.03 * br; b['spine:2'].scale.set(1 + 0.03 * br, 1 + 0.04 * br, 1);
      b['neck:0'].rotation.set((-0.05 + 0.04 * Math.sin(t * 0.7)) * calm, 0.3 * Math.sin(t * 0.45) * calm, 0);
      b['head:0'].rotation.set(0.08 * Math.sin(t * 0.9) * calm, 0.15 * Math.sin(t * 0.45 + 0.4) * calm, 0.05 * Math.sin(t * 0.6) * calm);
      b['jaw:0'].rotation.x = 0.06 + 0.1 * Math.max(0, Math.sin(t * 0.8));
      C.chain('tail').forEach((bn, i) => { bn.rotation.set(0.05 * Math.sin(t * 1.1 - i * 0.7), 0.35 * Math.sin(t * 1.3 - i * 0.8) * calm, 0); });
      for (const g of C.glows) g.material.opacity = (g.userData.base ??= g.material.opacity) * (0.75 + 0.25 * Math.sin(t * 2.3));
    },
    moves: {
      // a lunging bite: rear back, jaws wide, then drive forward and snap
      bite: { dur: 0.95, sfx: [[0.47, 'fiendBite']], hit: [0.45, 0.6], hitbox: ['head:2', 'jaw:1'], damage: 12, power: 1, reach: 0.55, range: [0, 1.9], cooldown: 1.2, keys: [
        { t: 0.35, root: [0, -0.05, -0.12, -0.06], rot: { 'neck:0': [-0.3, 0, 0], 'head:0': [-0.15, 0, 0], 'jaw:0': [0.55, 0, 0], 'spine:2': [-0.05, 0, 0] } },
        { t: 0.52, root: [0, -0.02, 0.32, 0.08], rot: { 'neck:0': [0.25, 0, 0], 'head:0': [0.2, 0, 0], 'jaw:0': [0.02, 0, 0] } },
        { t: 0.72, root: [0, 0, 0.2, 0.04], rot: { 'neck:0': [0.15, 0, 0], 'head:0': [0.1, 0, 0], 'jaw:0': [0.05, 0, 0] } },
      ] },
      // a tiger's swipe, exaggerated: it rears up on its hind legs, the left forepaw thrown high and wide, then the whole body
      // drops and twists into a huge raking sweep across in front of it, lunging forward with it
      // (z58: a LEAPING claw — it springs in from a few metres and rakes as it lands; a claw that hits your guard leaves it stunned)
      claw: { dur: 1.1, sfx: [[0.36, 'fiendClaw']], hit: [0.42, 0.58], hitbox: ['front.L:3', 'front.L:2'], damage: 16, power: 1.4, reach: 0.65, range: [1.4, 4.2], cooldown: 2.2, stunOnBlock: 1.3, lunge: { travel: 1.7, stop: 0.9, min: 0.4, max: 1.8 }, keepRoot: true, keys: [
        { t: 0.3, root: [0, 0.32, 0.25, -0.4], ikLegs: { 'front.L': 0, 'front.R': 0.25 }, rot: { 'front.L:0': [-2.0, 0, 0.7], 'front.L:1': [-0.3, 0, 0], 'front.R:0': [-0.6, 0, 0], 'front.R:1': [0.5, 0, 0], 'spine:3': [0, 0.3, 0], 'spine:2': [0, 0.15, 0], 'neck:0': [-0.25, -0.35, 0], 'jaw:0': [0.4, 0, 0] } },
        { t: 0.47, root: [0, 0.12, 1.25, 0.18], ikLegs: { 'front.L': 0, 'front.R': 0.7 }, rot: { 'front.L:0': [-0.7, 0, -0.6], 'front.L:1': [0.6, 0, 0], 'spine:3': [0, -0.35, 0], 'spine:2': [0, -0.15, 0], 'neck:0': [0.2, 0.35, 0], 'jaw:0': [0.15, 0, 0] } },
        { t: 0.6, root: [0, -0.02, 1.6, 0.1], ikLegs: { 'front.L': 0 }, rot: { 'front.L:0': [0.15, 0, -0.75], 'front.L:1': [0.3, 0, 0], 'spine:3': [0, -0.25, 0], 'neck:0': [0.1, 0.2, 0] } },
        { t: 0.82, root: [0, 0, 1.7, 0.03], ikLegs: { 'front.L': 0.6 }, rot: { 'front.L:0': [0.05, 0, -0.2] } },
        { t: 0.95, root: [0, 0, 1.7, 0] },
      ] },
      // a pounce: crouch, spring, sail through the air legs tucked, land two metres on
      pounce: { dur: 1.3, sfx: [[0.32, 'fiendPounce'], [0.74, 'fiendLand']], hit: [0.5, 0.75], hitbox: ['head:2', 'front.L:3', 'front.R:3'], damage: 18, power: 1.6, reach: 0.7, range: [2.6, 4.2], cooldown: 4, lunge: { travel: 2.2, stop: 0.9, min: 0.7, max: 1.8 }, keepRoot: true, keys: [
        { t: 0.3, root: [0, -0.15, -0.1, 0.05], rot: { 'neck:0': [0.1, 0, 0] } },
        { t: 0.55, root: [0, 0.55, 1.2, -0.12], ik: 0, rot: { 'front.L:0': [-0.7, 0, 0], 'front.R:0': [-0.7, 0, 0], 'front.L:1': [0.5, 0, 0], 'front.R:1': [0.5, 0, 0], 'hind.L:0': [0.6, 0, 0], 'hind.R:0': [0.6, 0, 0], 'jaw:0': [0.5, 0, 0], 'neck:0': [-0.15, 0, 0] } },
        { t: 0.75, root: [0, -0.08, 2.2, 0.08], ik: 1, rot: { 'jaw:0': [0.05, 0, 0] } },
        { t: 0.9, root: [0, 0, 2.2, 0] },
      ] },
      // sinking into the dark: it melts down through the floor (rise: back up out of it, somewhere else)
      sink: { dur: 1.2, sfx: [[0.15, 'fiendSink']], then: 'rise', keys: [
        { t: 0.4, root: [0, -0.5, 0, 0.1], rot: { 'neck:0': [0.3, 0, 0] } },
        { t: 0.75, root: [0, -1.7, 0, 0], ik: 0 },
        { t: 0.95, root: [0, -1.7, 0, 0], ik: 0 },
      ] },
      // shadow bullet (special): it lifts its head and opens its jaws; a ball of dark energy gathers in its mouth, then it
      // fires it straight ahead and the head jerks back with the shot
      shadowBullet: { dur: 1.2, sfx: [[0.14, 'fiendCharge'], [0.62, 'fiendFire']], damage: 14, power: 0.9, range: [4, 13], cooldown: 5, type: 'dark', fx: [{ kind: 'orb', bone: 'head:2', from: 0.14, fire: 0.62, size: 0.11, speed: 19 }], keys: [
        { t: 0.18, root: [0, 0.02, -0.08, -0.05], rot: { 'neck:0': [-0.35, 0, 0], 'head:0': [-0.1, 0, 0], 'jaw:0': [0.55, 0, 0] } },
        { t: 0.58, root: [0, -0.02, -0.12, -0.02], rot: { 'neck:0': [-0.15, 0, 0], 'head:0': [0.05, 0, 0], 'jaw:0': [0.65, 0, 0], 'spine:2': [0.05, 0, 0] } },
        { t: 0.66, root: [0, 0.02, -0.22, -0.1], rot: { 'neck:0': [-0.45, 0, 0], 'head:0': [-0.2, 0, 0], 'jaw:0': [0.4, 0, 0] } },
        { t: 0.85, root: [0, 0, -0.06, 0], rot: { 'jaw:0': [0.1, 0, 0] } },
      ] },
      rise: { dur: 1.0, sfx: [[0.05, 'fiendRise']], keys: [
        { t: 0, root: [0, -1.7, 0, 0], ik: 0 },
        { t: 0.15, root: [0, -1.7, 0, 0], ik: 0 },
        { t: 0.55, root: [0, 0.08, 0, -0.08], ik: 1, rot: { 'neck:0': [-0.25, 0, 0], 'jaw:0': [0.4, 0, 0] } },
        { t: 0.8, root: [0, 0, 0, 0], rot: { 'jaw:0': [0.1, 0, 0] } },
      ] },
    },
  },
};

// the spec for a monster with its sliders (missing ones at their defaults)
export function monsterSpec(id, p = {}) {
  const M = MONSTERS[id], q = {};
  for (const [k, [, , d]] of Object.entries(M.params)) q[k] = p[k] ?? d;
  return { spec: M.spec(q), params: q };
}

// ---- creatures made in the Creature workshop (monster-lab.html → Workshop) ----
// Saved in this browser (localStorage 'eldermere.creatures') as { id: { name, base, spec, stats, lore } }: a body of
// its own on a base monster's behaviour, moves and voice (the base's bones keep their names, so its moves still
// fit; new limbs are for looks). They're added to MONSTERS here, and to the creator's Enemies tab (src/data/objects.js).
export const CUSTOM_KEY = 'eldermere.creatures';
export function loadCustom() { try { return JSON.parse(localStorage.getItem(CUSTOM_KEY)) || {}; } catch { return {}; } }
export function saveCustom(all) { try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(all)); return true; } catch { return false; } }
// A monster made from scratch (a genus silhouette, src/data/genera.js): no hand animation — its walking comes from
// the limbs labelled 'leg' (feet placed on the ground), its flying from a wing chain named 'arm', its attacks from
// generic moves (a bite, a lunge; a flyer's swoop) that use only body motion and, where they exist, the head, neck
// and jaw. meta: { group, plan, classification, hazard, rank, activity, lore, voice }, resist, stats, locomotion.
const VOICES = { chirper: { step: 'fiendStep', growl: 'nylChirp', hurt: 'nylYelp', die: 'nylHowl' }, beast: { step: 'fiendStep', growl: 'fiendGrowl', hurt: 'fiendHurt', die: 'fiendDie' }, flyer: { flap: 'batFlap', hurt: 'batHurt', die: 'batDie' }, none: {} };
export function makeMonster(c) {
  const S = c.spec, meta = c.meta || {}, chains = S.chains || [], loc = c.locomotion || 'walk';
  const has = n => chains.some(x => x.name === n);
  const legs = [], legChains = chains.filter(x => x.role === 'leg' && x.pts.length >= 3);
  legChains.forEach((x, k) => { const l = (k * 0.27) % 1, t = k % 2 ? 0.5 : 0; if (x.mirror) { legs.push({ chain: x.name + '.L', walk: l, trot: t }, { chain: x.name + '.R', walk: (l + 0.5) % 1, trot: (t + 0.5) % 1 }); } else legs.push({ chain: x.name, walk: l, trot: t }); });
  const legH = legChains.length ? Math.max(...legChains.map(x => x.pts[0][1])) : 0.5;
  const top = Math.max(0.3, ...chains.flatMap(x => x.pts.map(q => q[1])));
  const fly = loc === 'fly' && has('arm');
  const hb = ['head:2', 'head:1', 'jaw:1', 'spine:3', 'body:3', 'body:1', 'mantle:0', 'spine:1'];
  const moves = fly ? { swoop: JSON.parse(JSON.stringify(MONSTERS.nocturianBat.moves.swoop)) } : {
    bite: { dur: 0.9, sfx: [[0.45, 'fiendBite']], hit: [0.45, 0.62], hitbox: hb, damage: 10, power: 1, reach: 0.6, range: [0, 1.8], cooldown: 1.4, keys: [
      { t: 0.35, root: [0, -0.04, -0.12, -0.06], rot: { 'neck:0': [-0.3, 0, 0], 'head:0': [-0.15, 0, 0], 'jaw:0': [0.5, 0, 0] } },
      { t: 0.52, root: [0, 0, 0.32, 0.08], rot: { 'neck:0': [0.25, 0, 0], 'head:0': [0.2, 0, 0], 'jaw:0': [0.02, 0, 0] } },
      { t: 0.75, root: [0, 0, 0.15, 0.03] }] },
    lunge: { dur: 1.2, sfx: [[0.3, 'fiendPounce'], [0.72, 'fiendLand']], hit: [0.45, 0.72], hitbox: hb, damage: 14, power: 1.3, reach: 0.7, range: [2, 4.5], cooldown: 3.5, lunge: { travel: 2, stop: 0.9, min: 0.5, max: 1.8 }, keepRoot: true, keys: [
      { t: 0.3, root: [0, -0.1, -0.1, 0.05] }, { t: 0.55, root: [0, 0.35 * Math.min(1, top), 1.1, -0.1], ik: 0 }, { t: 0.75, root: [0, 0, 2, 0.05], ik: 1 }, { t: 0.9, root: [0, 0, 2, 0] }] },
  };
  if (c.damage && c.damage !== 1) for (const mv of Object.values(moves)) if (mv.damage) mv.damage *= c.damage;   // (a variant's strength)
  const st = c.stats || {}, girth = Math.max(0.05, ...chains.filter(x => x.role === 'spine').flatMap(x => x.r.map(r => r[0])));
  return {
    name: c.name || 'Creature', custom: true, scratch: true, genus: c.genus, group: fly && meta.group === 'swarm' ? 'swarm' : meta.group === 'swarm' ? 'pack' : (meta.group || 'pack'),
    plan: meta.plan || 'quadruped', hover: c.hover || 0, focus: top * 0.6 + (c.hover || 0),
    classification: meta.classification || ['Unclassified', '—'], hazard: meta.hazard || 'Unknown', rank: meta.rank || ['Wood', 'Wood'], activity: meta.activity || 'Any', resist: c.resist || {}, lore: meta.lore || '',
    params: {}, spec: () => JSON.parse(JSON.stringify(S)),
    gait: legs.length >= 2 ? { stride: 0.9 * legH + 0.2, trotAt: 1.5 + 2 * legH, lift: 0.15 * legH, crouch: 0.04, lean: 0.02, headLow: 0.1, legs } : undefined,
    flight: fly ? { beat: 5, slow: 1.5, amp: 0.7, cruise: 6, pitch: -0.2, fingers: chains.filter(x => /^f\d/.test(x.name)).map(x => x.name), erratic: meta.group === 'swarm' ? [0.3, 0.2, 0.2] : null } : undefined,
    maxSpeed: 8, roost: fly && meta.group === 'swarm' ? 4 : 0, voice: VOICES[meta.voice || (fly ? 'flyer' : 'beast')] || {},
    stats: { hp: st.hp ?? 40, poise: st.poise ?? 20, speed: st.speed ?? (fly ? 4.5 : 4), aggro: st.aggro ?? 14, radius: st.radius ?? Math.max(0.25, girth * 2.5), height: st.height ?? top, len: (chains.find(x => x.role === 'spine')?.pts.length || 2) * 0.15 },
    zones: { head: { bones: ['head:1', 'head:0'], mult: 1.4 }, body: { bones: ['spine:1', 'body:1', 'mantle:1'], mult: 1 } },
    idle(C, t) { const b = C.bones['spine:1'] || C.bones['body:1'] || C.bones['mantle:1']; if (b) { const k = Math.sin(t * 1.5); b.scale.set(1 + 0.02 * k, 1 + 0.03 * k, 1); } const j = C.bones['jaw:0']; if (j) j.rotation.x = 0.05 + 0.06 * Math.max(0, Math.sin(t * 0.8)); },
    moves, levels: c.levels || null, harvest: c.harvest || null, temper: meta.temper || 'hostile',   // harvest: its body stays to be skinned; temper 'passive': grazes, runs if attacked
  };
}
// a variant: the same creature at another size and strength (an alpha, a runt, an elder)
export function variantRecord(c, v) {
  const k = v.scale || 1, S = JSON.parse(JSON.stringify(c.spec));
  for (const ch of S.chains) { ch.pts.forEach(q => { q[0] *= k; q[1] *= k; q[2] *= k; }); ch.r.forEach(r => { r[0] *= k; r[1] *= k; }); ch.aura?.forEach(r => { r[0] *= k; r[1] *= k; }); }
  for (const P of S.parts || []) { P.at = P.at.map(x => x * k); P.r *= k; if (P.len) P.len *= k; }
  const st = { ...(c.stats || {}) }; for (const [s, m] of Object.entries(v.stats || {})) st[s] = (st[s] ?? ({ hp: 40, speed: 4, aggro: 14 })[s] ?? 1) * m;
  return { ...c, name: v.name, spec: S, stats: st, hover: (c.hover || 0) * k, damage: (c.damage || 1) * (v.damage || 1), variants: null, variantOf: c.name,
    meta: { ...(c.meta || {}), rank: v.rank || c.meta?.rank, hazard: v.hazard || c.meta?.hazard, lore: (c.meta?.lore || '') + (v.note ? ` — ${v.name}: ${v.note}` : '') } };
}
function addVariants(id, c) {
  for (const v of c.variants || []) { const r = variantRecord(c, v), M = makeMonster(r); M.source = r; M.variantScale = v.scale || 1;
    if (v.scale && v.scale !== 1) for (const mv of Object.values(M.moves)) { for (const key of mv.keys || []) if (key.root) { key.root[1] *= v.scale; key.root[2] *= v.scale; } if (mv.lunge) mv.lunge = { ...mv.lunge, travel: mv.lunge.travel * v.scale, stop: mv.lunge.stop * v.scale }; if (mv.reach) mv.reach *= v.scale; if (mv.range) mv.range = mv.range.map(x => x * v.scale); }   // (a bigger body reaches and leaps further)
    MONSTERS[`${id}_${v.id}`] = M; }
}
export function registerCustom() {
  for (const [id, c] of Object.entries(BUILTIN)) if (!MONSTERS[id]) { try { MONSTERS[id] = makeMonster(c); MONSTERS[id].source = c; MONSTERS[id].builtin = true; addVariants(id, c); } catch (e) { console.warn('creature', id, e); } }
  for (const [id, c] of Object.entries(loadCustom())) {
    if (c.scratch) { try { const was = MONSTERS[id]; MONSTERS[id] = makeMonster(c); MONSTERS[id].source = c; if (was?.builtin) MONSTERS[id].overrides = true; addVariants(id, c); } catch (e) { console.warn('creature', id, e); } continue; }
    const B = MONSTERS[c.base]; if (!B || (B.custom && !B.base)) continue;   // (id === base: your edit of one of the game's own monsters, in its place)
    MONSTERS[id] = { ...B, levels: c.levels || B.levels || null, name: c.name || id, custom: true, base: c.base, spec: () => JSON.parse(JSON.stringify(c.spec)), stats: { ...B.stats, ...(c.stats || {}) }, lore: c.lore || B.lore };
  }
}
registerCustom();   // (built-ins always; the browser's saved ones where there's storage)

// ---- level stats (the workshop's Level chart): a creature's numbers at every level 1–100 ----
// levels: { curve: 'exp' | 'linear', base: { hp, damage, speed, poise, aggro, armor } (at level 1), growth: { stat: per
// level (exp: ×(1+g) a level; linear: +g×base a level) }, set: { level: { stat: value } } (set by hand) }.
// A hand-set value is exact at its level; between hand-set levels the curve is bent to pass through them (the ratio to
// the curve eased from one to the next), so the shape holds. damage is a multiplier of its moves' damage.
export const LEVEL_STATS = [['hp', 'Health'], ['damage', 'Damage ×'], ['speed', 'Speed (m/s)'], ['poise', 'Poise'], ['aggro', 'Sight (m)'], ['armor', 'Armour'], ['exp', 'Combat exp']];   // exp: what killing it gives your character level
export function defaultLevels(stats = {}) {
  return { curve: 'exp', base: { hp: stats.hp ?? 40, damage: 1, speed: stats.speed ?? 4, poise: stats.poise ?? 20, aggro: stats.aggro ?? 14, armor: 0, exp: Math.max(1, Math.round((stats.hp ?? 40) * 0.35)) },
    growth: { hp: 0.045, damage: 0.035, speed: 0.002, poise: 0.03, aggro: 0.003, armor: 0.04, exp: 0 }, set: {} };
}
export function levelValue(lv, stat, L) {
  if (stat === 'exp' && lv.base?.exp == null) { lv.base.exp = Math.max(1, Math.round((lv.base.hp ?? 40) * 0.35)); lv.growth.exp ??= 0; }   // (charts made before exp)
  const b = lv.base?.[stat] ?? 0, g = lv.growth?.[stat] ?? 0;
  // (exp follows the character's own level curve — level^1.5, src/rpg/stats.js xpToNext — so the same number of
  // same-level kills earns a level at 1 as at 80; its growth % adds on top of that)
  if (stat === 'exp') { const ex = l => b * Math.pow(l, 1.5) * Math.pow(1 + g, l - 1); const set0 = lv.set || {}; if (set0[L]?.exp != null) return set0[L].exp; let lo = 0, hi = null; for (const k of Object.keys(set0).map(Number)) { if (set0[k].exp == null) continue; if (k < L && k > lo) lo = k; if (k > L && (hi == null || k < hi)) hi = k; } const rt = l => l === 0 ? 1 : set0[l].exp / Math.max(1e-6, ex(l)); if (hi == null) return ex(L) * rt(lo); const t = (L - Math.max(1, lo)) / Math.max(1, hi - Math.max(1, lo)), sm = t * t * (3 - 2 * t); return ex(L) * (rt(lo) + (rt(hi) - rt(lo)) * sm); }
  const auto = l => lv.curve === 'linear' ? (stat === 'armor' && !b ? g * 10 * (l - 1) : b * (1 + g * (l - 1))) : (stat === 'armor' && !b ? 10 * (Math.pow(1 + g, l - 1) - 1) : b * Math.pow(1 + g, l - 1));
  const set = lv.set || {};
  if (set[L]?.[stat] != null) return set[L][stat];
  let lo = null, hi = null;
  for (const k of Object.keys(set).map(Number)) { if (set[k][stat] == null) continue; if (k < L && (lo == null || k > lo)) lo = k; if (k > L && (hi == null || k < hi)) hi = k; }
  const a = auto(L), ratio = l => l === 0 ? 1 : set[l][stat] / Math.max(1e-6, auto(l));
  if (lo == null && hi == null) return a;
  if (lo == null) lo = 0;   // (level 1 stays the base: below the first hand-set level the curve eases from it)
  if (hi == null) return a * ratio(lo);
  if (lo === 0) { const t = (L - 1) / Math.max(1, hi - 1), sm = t * t * (3 - 2 * t); return a * (1 + (ratio(hi) - 1) * sm); }
  const t = (L - lo) / (hi - lo), s = t * t * (3 - 2 * t); return a * (ratio(lo) + (ratio(hi) - ratio(lo)) * s);
}
export function statsAtLevel(M, L) {
  const lv = M.levels; if (!lv) return null; L = Math.max(1, Math.min(100, Math.round(L || 1)));
  const o = {}; for (const [k] of LEVEL_STATS) o[k] = levelValue(lv, k, L); return o;
}
