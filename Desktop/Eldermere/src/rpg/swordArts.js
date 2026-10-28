// src/rpg/swordArts.js — the arming sword, moved the way it was really fought.
//
// Built from the medieval one-handed sword (Fiore dei Liberi's sword in one hand, the I.33 sword-and-buckler manuscript,
// Meyer's one-handed cuts): the body fights, not the arm. Every cut starts from the feet: a step or a lunge carries the
// weight forward, the hips turn into the blow and the chest turns further, the arm extends last — and the head stays on
// the opponent while the body turns under it. The blade travels on the real lines: fendente (descending, forehand and
// backhand), sottano (rising), mezano (horizontal), punta (the thrust, from a lunge).
//
// The stance (a bladed guard, left foot forward, weight a little low and back, the sword held in a high guard by the
// right shoulder with the point toward the opponent's face — between Fiore's posta di finestra and the German ochs)
// is the base every move eases out of and back to.
//
// Keys (t: share of the move's duration), on top of the arm aims used everywhere (R, L: upper-arm and forearm directions,
// relative to the chest; aimR: where the blade points) — the full-body channels:
//   hip    [x, drop, z, yaw, pitch]   the pelvis: moved (decimetres: +x the character's left, +z forward), lowered,
//                                     turned (+yaw brings the right hip forward) and tipped forward (+pitch)
//   chest  [twist, lean, side]        the spine above the pelvis: turned further (+ right shoulder forward), bent forward,
//                                     bent sideways (+ toward the left)
//   feet   { L: [x, z, yaw], R: [...] } where each foot is planted (decimetres from where it stands at rest) and which
//                                     way it points (+ toes turned toward the left); the legs reach them (two-bone IK)
// The head turns back against the hips and chest, so the eyes stay forward.

const STANCE = {
  // ready (the relaxed one-handed carry, as in Dark Souls / Elden Ring): the sword low at the right hip, arm easy, the
  // blade angled forward and down — ready to come up into any cut without being held up the whole time
  R: [[-0.22, -0.95, 0.2], [-0.12, -0.55, 0.83]], aimR: [-0.05, -0.45, 0.9],
  L: [[0.16, -1, 0.05], [0.08, -0.85, 0.5]],                                       // the empty hand loose at the side
  hip: [0, 0.15, -0.05, -0.2, 0.04], chest: [0.1, 0.04, 0],                         // a light blade turn, knees soft
  feet: { L: [0.2, 1.0, 0.1], R: [-0.3, -0.9, -0.5] },
};
// a step-in (the lead foot moves forward, the rear foot follows a little) and a pass (the rear foot steps past)
const STEP = { L: [0.25, 3.0, 0.1], R: [-0.35, -0.9, -0.7] };
const LUNGE = { L: [0.25, 4.2, 0.05], R: [-0.35, -1.6, -0.8] };
const PASS = { L: [0.3, 1.2, 0.5], R: [-0.25, 3.4, -0.25] };

export const SWORD_STANCE = STANCE;

// The shield arm (a round shield on the left forearm). It is never just parked in front: held forward-left and angled,
// it covers the left side and the face while leaving a lane for the sword on the right. As the sword works, it covers
// what the cut leaves open: up over the head while the sword chambers high, tucked to the chest as the cut lands (the
// arm never flings back), swung out of the way of a backhand, punched forward to lead a thrust or a bash.
// (Keys give it as Ls; without Ls a key holds the guard. Standing or walking it rests down by the side; blocking raises it.)
export const SHIELD_POSES = {
  rest: [[0.2, -0.97, 0.12], [0.05, -0.55, 0.83]],   // not fighting: down by the left side, held at the thigh
  guard: [[0.28, -0.62, 0.73], [-0.8, 0.33, 0.5]],
  tuck: [[0.3, -0.7, 0.65], [-0.7, 0.3, 0.65]],
  block: [[0.25, -0.65, 0.72], [-0.82, 0.3, 0.48]],   // blocking: flat in front of the chest, face square to the enemy, rim under the chin
  high: [[0.25, -0.65, 0.72], [-0.82, 0.3, 0.48]],     // covering while the sword winds up: the same flat block
  open: [[0.75, -0.55, 0.35], [0.1, 0.3, 0.95]],
  punch: [[0.22, -0.3, 0.93], [-0.4, 0.25, 0.88]],
};

export const SWORD_CLIPS = {
  // 1 · fendente dritto: the forehand cut, high right to low left, on a step forward
  swFendente: { dur: 0.78, hit: [0.36, 0.56], keys: [
    { t: 0.24, R: [[-0.5, 0.6, -0.3], [-0.15, 0.7, -0.7]], aimR: [-0.25, 0.45, -0.85], hip: [0, 0.4, -0.45, -0.55, 0.05], chest: [-0.25, 0.02, 0] },   // chambered back over the shoulder, weight back, coiled
    { t: 0.44, R: [[-0.08, 0.1, 0.99], [0.2, -0.1, 0.97]], aimR: [0.4, -0.35, 0.85], hip: [0.05, 0.6, 0.85, 0.1, 0.18], chest: [0.35, 0.15, 0.05], feet: { L: STEP.L, R: STEP.R } },   // the blow: hips and chest turned in, arm long
    { t: 0.6, R: [[0.3, -0.45, 0.84], [0.55, -0.6, 0.58]], aimR: [0.6, -0.65, 0.35], hip: [0.05, 0.62, 0.75, 0.2, 0.22], chest: [0.45, 0.25, 0.1], feet: { L: STEP.L, R: STEP.R } },   // through to the low left
  ] },
  // 2 · fendente riverso: the backhand cut, high left to low right, the hips turning back
  swRiverso: { dur: 0.74, hit: [0.35, 0.55], keys: [
    { t: 0.24, R: [[0.3, 0.6, 0.35], [0.55, 0.55, -0.35]], aimR: [0.5, 0.45, -0.75], hip: [0, 0.4, 0, 0.05, 0.05], chest: [0.35, 0.05, 0.05] },
    { t: 0.44, R: [[-0.3, 0.05, 0.95], [-0.55, -0.2, 0.8]], aimR: [-0.7, -0.35, 0.6], hip: [-0.05, 0.55, 0.6, -0.4, 0.15], chest: [-0.3, 0.12, -0.05], feet: { L: [0.4, 2.6, 0.2], R: STEP.R } },
    { t: 0.6, R: [[-0.7, -0.35, 0.6], [-0.85, -0.45, 0.25]], aimR: [-0.8, -0.55, 0.1], hip: [-0.05, 0.58, 0.5, -0.5, 0.2], chest: [-0.4, 0.2, -0.08], feet: { L: [0.4, 2.6, 0.2], R: STEP.R } },
  ] },
  // 3 · punta: the thrust, from the hand drawn back to the hip, on a long lunge — the rear leg drives straight
  swPunta: { dur: 0.8, hit: [0.38, 0.58], targets: 1, arc: 0.4, keys: [
    { t: 0.26, R: [[-0.3, -0.7, -0.6], [0.05, 0.05, 1]], aimR: [0, 0.05, 1], L: [[0.5, -0.4, 0.75], [0.1, 0, 1]], hip: [0, 0.45, -0.5, -0.6, 0.05], chest: [-0.2, 0.05, 0] },
    { t: 0.46, R: [[-0.05, 0.02, 1], [0, 0, 1]], aimR: [0, -0.02, 1], L: [[0.55, -0.55, -0.6], [0.35, -0.75, -0.55]], hip: [0.05, 0.95, 2.2, 0.15, 0.25], chest: [0.35, 0.2, 0], feet: LUNGE },
    { t: 0.62, R: [[-0.05, 0, 1], [0, -0.02, 1]], aimR: [0, -0.05, 1], L: [[0.55, -0.55, -0.6], [0.35, -0.75, -0.55]], hip: [0.05, 0.92, 2.1, 0.15, 0.25], chest: [0.35, 0.2, 0], feet: LUNGE },
  ] },
  // 4 · sottano: the rising forehand, from low right behind up through the opponent's arm or face
  swSottano: { dur: 0.76, hit: [0.36, 0.56], keys: [
    { t: 0.26, R: [[-0.5, -0.7, -0.35], [-0.3, -0.85, -0.4]], aimR: [-0.3, -0.65, -0.7], hip: [0, 0.6, -0.3, -0.55, 0.12], chest: [-0.3, 0.2, -0.1] },
    { t: 0.46, R: [[0.05, 0.3, 0.95], [0.3, 0.55, 0.78]], aimR: [0.45, 0.78, 0.45], hip: [0.05, 0.45, 0.8, 0.15, 0.05], chest: [0.35, 0.02, 0.08], feet: { L: STEP.L, R: STEP.R } },
    { t: 0.62, R: [[0.35, 0.65, 0.62], [0.45, 0.8, 0.35]], aimR: [0.4, 0.85, -0.1], hip: [0.05, 0.38, 0.7, 0.2, 0], chest: [0.45, -0.05, 0.12], feet: { L: STEP.L, R: STEP.R } },
  ] },
  // 5 · mezano dritto: the horizontal forehand at the neck or flank, the whole body turning through it
  swMezano: { dur: 0.8, hit: [0.38, 0.58], keys: [
    { t: 0.26, R: [[-0.85, 0.15, -0.2], [-0.6, 0.15, -0.75]], aimR: [-0.5, 0.05, -0.85], hip: [0, 0.45, -0.3, -0.6, 0.05], chest: [-0.35, 0.05, 0] },
    { t: 0.46, R: [[-0.1, 0.1, 0.99], [0.35, 0.05, 0.94]], aimR: [0.85, 0, 0.5], hip: [0.05, 0.55, 0.7, 0.2, 0.1], chest: [0.4, 0.08, 0], feet: { L: STEP.L, R: STEP.R } },
    { t: 0.62, R: [[0.55, 0.05, 0.83], [0.85, 0, 0.45]], aimR: [0.85, 0, -0.45], hip: [0.05, 0.55, 0.6, 0.3, 0.1], chest: [0.55, 0.1, 0], feet: { L: STEP.L, R: STEP.R } },
  ] },
  // 6 · mezano riverso: the horizontal backhand, back the other way
  swMezanoRiv: { dur: 0.78, hit: [0.36, 0.56], keys: [
    { t: 0.26, R: [[0.45, 0.2, 0.55], [0.8, 0.15, -0.4]], aimR: [0.6, 0.05, -0.8], hip: [0, 0.45, 0.1, 0.1, 0.05], chest: [0.45, 0.05, 0] },
    { t: 0.46, R: [[-0.35, 0.1, 0.93], [-0.75, 0.05, 0.65]], aimR: [-0.85, 0, 0.45], hip: [-0.05, 0.55, 0.6, -0.4, 0.1], chest: [-0.35, 0.08, 0], feet: { L: [0.4, 2.6, 0.2], R: STEP.R } },
    { t: 0.62, R: [[-0.8, 0.05, 0.6], [-0.9, 0, 0.2]], aimR: [-0.8, 0, -0.5], hip: [-0.05, 0.55, 0.5, -0.55, 0.1], chest: [-0.5, 0.1, 0], feet: { L: [0.4, 2.6, 0.2], R: STEP.R } },
  ] },
  // finisher · a full passing fendente: the right foot steps past the left, the whole weight falling into the cut
  swPassFendente: { dur: 1.0, hit: [0.4, 0.58], keys: [
    { t: 0.26, R: [[-0.4, 0.75, -0.3], [-0.1, 0.65, -0.75]], aimR: [-0.15, 0.45, -0.88], hip: [0, 0.35, -0.5, -0.6, 0], chest: [-0.35, -0.05, 0] },
    { t: 0.46, R: [[-0.1, 0.05, 0.99], [0.15, -0.2, 0.97]], aimR: [0.3, -0.5, 0.8], hip: [-0.1, 0.75, 2.2, 0.55, 0.2], chest: [0.3, 0.2, 0.05], feet: PASS },
    { t: 0.64, R: [[0.25, -0.5, 0.83], [0.45, -0.7, 0.55]], aimR: [0.5, -0.75, 0.35], hip: [-0.1, 0.8, 2.1, 0.65, 0.28], chest: [0.4, 0.3, 0.08], feet: PASS },
    { t: 0.82, R: [[0.2, -0.45, 0.87], [0.4, -0.6, 0.7]], aimR: [0.45, -0.6, 0.5], hip: [-0.05, 0.6, 1.2, 0.3, 0.15], chest: [0.3, 0.2, 0.05], feet: { L: [0.3, 1.5, 0.4], R: [-0.3, 1.0, -0.4] } },   // recovering: the right foot coming back
  ] },
  // heavy 1 · the wrath cut (a full-power fendente from high over the head, straight down the middle, on a pass)
  swHeavyFendente: { dur: 1.15, hit: [0.44, 0.62], keys: [
    { t: 0.32, R: [[-0.15, 0.95, -0.2], [0, 0.55, -0.83]], aimR: [0, 0.25, -0.97], L: [[0.45, -0.2, 0.85], [0.1, 0.2, 0.97]], hip: [0, 0.3, -0.6, -0.45, -0.08], chest: [-0.2, -0.15, 0] },   // up over the head, leaning back
    { t: 0.5, R: [[-0.05, -0.15, 0.99], [0, -0.55, 0.83]], aimR: [0, -0.75, 0.65], L: [[0.5, -0.65, -0.45], [0.3, -0.85, -0.4]], hip: [-0.05, 1.0, 2.0, 0.45, 0.35], chest: [0.15, 0.35, 0], feet: PASS },   // down with the whole body
    { t: 0.68, R: [[0.05, -0.4, 0.92], [0.1, -0.75, 0.65]], aimR: [0.1, -0.85, 0.4], L: [[0.5, -0.65, -0.45], [0.3, -0.85, -0.4]], hip: [-0.05, 1.05, 1.9, 0.5, 0.4], chest: [0.2, 0.4, 0], feet: PASS },
    { t: 0.86, R: [[-0.2, -0.3, 0.93], [0, 0.1, 1]], aimR: [0, 0.3, 0.95], hip: [0, 0.55, 1.0, 0.1, 0.12], chest: [0.1, 0.12, 0], feet: { L: [0.3, 1.5, 0.4], R: [-0.3, 1.0, -0.4] } },
  ] },
  // heavy 2 · the long thrust (a lunge as far as the legs go, the body low behind the point)
  swHeavyPunta: { dur: 1.05, hit: [0.42, 0.62], targets: 1, arc: 0.4, keys: [
    { t: 0.32, R: [[-0.35, -0.65, -0.65], [0.05, 0.1, 0.99]], aimR: [0, 0.1, 1], L: [[0.45, -0.3, 0.85], [0.1, 0.1, 1]], hip: [0, 0.6, -0.7, -0.7, 0.05], chest: [-0.25, 0.08, 0] },
    { t: 0.52, R: [[-0.03, 0, 1], [0, -0.03, 1]], aimR: [0, -0.06, 1], L: [[0.6, -0.5, -0.62], [0.4, -0.7, -0.6]], hip: [0.05, 1.25, 3.0, 0.2, 0.35], chest: [0.4, 0.3, 0], feet: { L: [0.25, 5.2, 0.05], R: [-0.35, -1.7, -0.85] } },
    { t: 0.72, R: [[-0.03, 0, 1], [0, -0.03, 1]], aimR: [0, -0.06, 1], L: [[0.6, -0.5, -0.62], [0.4, -0.7, -0.6]], hip: [0.05, 1.2, 2.9, 0.2, 0.35], chest: [0.4, 0.3, 0], feet: { L: [0.25, 5.2, 0.05], R: [-0.35, -1.7, -0.85] } },
  ] },
  // heavy 3 · a rising cut on a pass, from low behind the right leg up through the middle
  swHeavySottano: { dur: 1.1, hit: [0.42, 0.6], keys: [
    { t: 0.3, R: [[-0.45, -0.75, -0.45], [-0.25, -0.85, -0.45]], aimR: [-0.25, -0.6, -0.75], hip: [0, 0.85, -0.5, -0.6, 0.25], chest: [-0.35, 0.3, -0.12] },
    { t: 0.5, R: [[0, 0.45, 0.89], [0.15, 0.75, 0.64]], aimR: [0.25, 0.9, 0.35], hip: [-0.1, 0.5, 2.0, 0.5, 0], chest: [0.3, -0.05, 0.05], feet: PASS },
    { t: 0.68, R: [[0.15, 0.85, 0.5], [0.2, 0.9, 0.2]], aimR: [0.15, 0.85, -0.45], hip: [-0.1, 0.4, 1.9, 0.55, -0.05], chest: [0.35, -0.1, 0.05], feet: PASS },
    { t: 0.86, R: [[-0.3, 0.2, 0.93], [-0.1, 0.6, 0.79]], aimR: [0, 0.7, 0.7], hip: [0, 0.4, 1.0, 0.1, 0.05], chest: [0.1, 0, 0], feet: { L: [0.3, 1.5, 0.4], R: [-0.3, 1.0, -0.4] } },
  ] },
  // heavy 4 · a full turning mezano (the hips and chest wind right round, the cut comes level through the middle)
  swHeavyMezano: { dur: 1.15, hit: [0.44, 0.62], keys: [
    { t: 0.32, R: [[-0.85, 0.1, -0.4], [-0.45, 0.1, -0.88]], aimR: [-0.3, 0, -0.95], hip: [0, 0.55, -0.5, -0.85, 0.05], chest: [-0.5, 0.05, 0] },
    { t: 0.52, R: [[-0.05, 0.05, 1], [0.4, 0, 0.92]], aimR: [0.9, 0, 0.42], hip: [-0.05, 0.75, 1.6, 0.45, 0.12], chest: [0.5, 0.1, 0], feet: PASS },
    { t: 0.7, R: [[0.65, 0, 0.76], [0.9, 0, 0.35]], aimR: [0.75, 0, -0.65], hip: [-0.05, 0.75, 1.5, 0.7, 0.12], chest: [0.7, 0.12, 0], feet: PASS },
    { t: 0.88, R: [[0.3, -0.2, 0.93], [0.4, 0.2, 0.9]], aimR: [0.3, 0.4, 0.85], hip: [0, 0.5, 0.9, 0.2, 0.08], chest: [0.3, 0.05, 0], feet: { L: [0.3, 1.5, 0.4], R: [-0.3, 1.0, -0.4] } },
  ] },
  // guard counter · riposte from the sword's bind: the blade turns the blow aside, the point comes straight in on a step
  swRiposte: { dur: 0.62, hit: [0.3, 0.52], targets: 1, arc: 0.4, keys: [
    { t: 0.16, R: [[-0.3, 0.05, 0.95], [0.45, 0.55, 0.7]], aimR: [0.65, 0.6, 0.45], hip: [0, 0.4, 0, -0.2, 0.05], chest: [0.05, 0.05, 0] },   // still in the bind, beating it aside
    { t: 0.36, R: [[-0.05, 0, 1], [0, -0.02, 1]], aimR: [0, -0.05, 1], hip: [0.05, 0.75, 1.6, 0.15, 0.2], chest: [0.3, 0.15, 0], feet: STEP },   // the point in
    { t: 0.55, R: [[-0.05, 0, 1], [0, -0.02, 1]], aimR: [0, -0.05, 1], hip: [0.05, 0.72, 1.5, 0.15, 0.2], chest: [0.3, 0.15, 0], feet: STEP },
  ] },
  // guard counter · off the shield: the shield punches the blow away on a step, the sword cuts in over it
  swShieldCounter: { dur: 0.86, hit: [0.4, 0.6], keys: [
    { t: 0.2, Ls: SHIELD_POSES.punch, R: [[-0.5, 0.6, -0.3], [-0.15, 0.7, -0.7]], aimR: [-0.25, 0.45, -0.85], hip: [0.05, 0.5, 1.0, -0.35, 0.12], chest: [-0.15, 0.08, 0], feet: STEP },   // bash, sword chambered
    { t: 0.42, Ls: SHIELD_POSES.tuck, R: [[-0.08, 0.1, 0.99], [0.2, -0.1, 0.97]], aimR: [0.4, -0.35, 0.85], hip: [0.05, 0.65, 1.3, 0.15, 0.2], chest: [0.35, 0.15, 0.05], feet: STEP },   // the cut over the shield
    { t: 0.6, Ls: SHIELD_POSES.tuck, R: [[0.3, -0.45, 0.84], [0.55, -0.6, 0.58]], aimR: [0.6, -0.65, 0.35], hip: [0.05, 0.65, 1.2, 0.2, 0.22], chest: [0.45, 0.25, 0.1], feet: STEP },
  ] },
  // ---- specials (the shortsword tree swaps these in for the heavy attack; see SWORD_SPECIALS) ----
  // closing thrust: the legionary's gap closer — coil low behind the point, then drive forward on a long running lunge
  swClosingThrust: { dur: 0.95, hit: [0.38, 0.62], targets: 1, arc: 0.4, keys: [
    { t: 0.18, R: [[-0.3, -0.7, -0.6], [0.05, 0.05, 1]], aimR: [0, 0.05, 1], hip: [0, 0.6, -0.4, -0.6, 0.15], chest: [-0.2, 0.15, 0] },
    { t: 0.44, R: [[-0.03, 0, 1], [0, -0.03, 1]], aimR: [0, -0.06, 1], hip: [0.05, 1.25, 3.0, 0.2, 0.35], chest: [0.4, 0.3, 0], feet: { L: [0.25, 5.2, 0.05], R: [-0.35, -1.7, -0.85] } },
    { t: 0.66, R: [[-0.03, 0, 1], [0, -0.03, 1]], aimR: [0, -0.06, 1], hip: [0.05, 1.2, 2.9, 0.2, 0.35], chest: [0.4, 0.3, 0], feet: { L: [0.25, 5.2, 0.05], R: [-0.35, -1.7, -0.85] } },
  ] },
  // pommel strike: the blade drawn back over the shoulder, the pommel punched into the face on a step
  swPommelStrike: { dur: 0.7, hit: [0.3, 0.5], keys: [
    { t: 0.18, R: [[-0.6, 0.1, -0.4], [0.3, 0.4, 0.85]], aimR: [0, 0.5, -0.85], hip: [0, 0.4, -0.3, -0.5, 0.05], chest: [-0.3, 0.05, 0] },
    { t: 0.38, R: [[-0.1, 0.25, 0.96], [0.1, 0.35, 0.93]], aimR: [0, 0.55, -0.83], hip: [0.05, 0.6, 1.4, 0.2, 0.15], chest: [0.4, 0.1, 0], feet: STEP },
    { t: 0.55, R: [[-0.1, 0.25, 0.96], [0.1, 0.35, 0.93]], aimR: [0, 0.55, -0.83], hip: [0.05, 0.58, 1.3, 0.2, 0.15], chest: [0.4, 0.1, 0], feet: STEP },
  ] },
  // hamstring cut: chamber high, then drop right under their guard and cut level across the legs
  swHamstring: { dur: 0.85, hit: [0.4, 0.6], keys: [
    { t: 0.24, R: [[-0.7, 0.4, -0.3], [-0.4, 0.5, -0.75]], aimR: [-0.5, 0.4, -0.75], hip: [0, 0.5, -0.3, -0.55, 0.1], chest: [-0.3, 0.05, 0] },
    { t: 0.46, R: [[-0.1, -0.6, 0.8], [0.35, -0.55, 0.75]], aimR: [0.8, -0.35, 0.45], hip: [0.05, 2.2, 1.8, 0.25, 0.5], chest: [0.35, 0.45, 0.05], feet: LUNGE },
    { t: 0.62, R: [[0.4, -0.65, 0.65], [0.75, -0.5, 0.45]], aimR: [0.85, -0.3, -0.4], hip: [0.05, 2.1, 1.7, 0.35, 0.5], chest: [0.5, 0.45, 0.05], feet: LUNGE },
  ] },
  // whirling cut: wound right round, the body uncoils and the blade travels level through a wide circle
  swWhirlingCut: { dur: 1.1, hit: [0.36, 0.66], targets: 5, arc: 2.8, keys: [
    { t: 0.25, R: [[-0.85, 0.15, -0.45], [-0.4, 0.1, -0.9]], aimR: [-0.2, 0, -0.98], hip: [0, 0.6, -0.4, -1.0, 0.05], chest: [-0.6, 0.05, 0] },
    { t: 0.45, R: [[-0.05, 0.05, 1], [0.4, 0, 0.92]], aimR: [0.9, 0, 0.42], hip: [-0.05, 0.75, 1.2, 0.4, 0.1], chest: [0.5, 0.1, 0], feet: PASS },
    { t: 0.62, R: [[0.75, 0, 0.6], [0.95, 0, 0.2]], aimR: [0.6, 0, -0.8], hip: [-0.05, 0.75, 1.2, 0.9, 0.1], chest: [0.8, 0.12, 0], feet: PASS },
    { t: 0.82, R: [[0.3, -0.2, 0.93], [0.4, 0.2, 0.9]], aimR: [0.3, 0.4, 0.85], hip: [0, 0.5, 0.9, 0.3, 0.08], chest: [0.3, 0.05, 0], feet: { L: [0.3, 1.5, 0.4], R: [-0.3, 1.0, -0.4] } },
  ] },
  // thousand cuts: a flurry of cuts, forehand and backhand, looping for as long as attack is held (one loop = a pair)
  swFlurrySlash: { dur: 0.5, hit: [0.12, 0.78], hits: [[0.12, 0.32], [0.56, 0.78]], keys: [
    { t: 0.06, R: [[-0.5, 0.55, -0.1], [-0.2, 0.7, -0.6]], aimR: [-0.3, 0.5, -0.8], hip: [0, 0.5, 0.6, -0.35, 0.1], chest: [-0.2, 0.08, 0], feet: STEP },
    { t: 0.3, R: [[0.15, -0.3, 0.94], [0.45, -0.5, 0.74]], aimR: [0.6, -0.6, 0.45], hip: [0.05, 0.55, 0.9, 0.15, 0.15], chest: [0.35, 0.15, 0.05], feet: STEP },
    { t: 0.52, R: [[0.3, 0.6, 0.35], [0.55, 0.55, -0.35]], aimR: [0.5, 0.45, -0.75], hip: [0, 0.5, 0.6, 0.1, 0.1], chest: [0.3, 0.08, 0.05], feet: STEP },
    { t: 0.76, R: [[-0.5, -0.3, 0.8], [-0.75, -0.4, 0.5]], aimR: [-0.75, -0.5, 0.3], hip: [-0.05, 0.55, 0.9, -0.35, 0.15], chest: [-0.35, 0.15, -0.05], feet: STEP },
  ] },
  // ---- follow-ups (a perfect light or heavy right after a special) ----
  // extended lunge: the rear foot comes up under you and you push off into an even longer thrust
  swExtendedLunge: { dur: 0.8, hit: [0.3, 0.56], targets: 1, arc: 0.35, keys: [
    { t: 0.12, R: [[-0.2, -0.4, 0.3], [0.05, 0.05, 1]], aimR: [0, 0.05, 1], hip: [0.05, 0.8, 1.0, -0.2, 0.2], chest: [0.1, 0.2, 0], feet: { L: [0.25, 1.5, 0.05], R: [-0.3, 1.0, -0.6] } },
    { t: 0.38, R: [[-0.03, 0, 1], [0, -0.03, 1]], aimR: [0, -0.06, 1], hip: [0.05, 1.35, 3.4, 0.2, 0.4], chest: [0.45, 0.32, 0], feet: { L: [0.25, 5.8, 0.05], R: [-0.35, -1.8, -0.85] } },
    { t: 0.62, R: [[-0.03, 0, 1], [0, -0.03, 1]], aimR: [0, -0.06, 1], hip: [0.05, 1.3, 3.3, 0.2, 0.4], chest: [0.45, 0.3, 0], feet: { L: [0.25, 5.8, 0.05], R: [-0.35, -1.8, -0.85] } },
  ] },
  // closing strike slash: a leap, the sword up over the head, and a diving cut on landing
  swClosingSlash: { dur: 1.0, hit: [0.44, 0.62], targets: 2, keys: [
    { t: 0.22, R: [[-0.15, 0.95, -0.2], [0, 0.55, -0.83]], aimR: [0, 0.25, -0.97], hip: [0, 0.2, 0.4, -0.4, -0.1], chest: [-0.2, -0.15, 0] },
    { t: 0.5, R: [[-0.05, -0.15, 0.99], [0, -0.55, 0.83]], aimR: [0, -0.75, 0.65], hip: [-0.05, 1.0, 2.0, 0.45, 0.35], chest: [0.15, 0.35, 0], feet: PASS },
    { t: 0.68, R: [[0.05, -0.4, 0.92], [0.1, -0.75, 0.65]], aimR: [0.1, -0.85, 0.4], hip: [-0.05, 1.05, 1.9, 0.5, 0.4], chest: [0.2, 0.4, 0], feet: PASS },
    { t: 0.86, R: [[-0.2, -0.3, 0.93], [0, 0.1, 1]], aimR: [0, 0.3, 0.95], hip: [0, 0.55, 1.0, 0.1, 0.12], chest: [0.1, 0.12, 0], feet: { L: [0.3, 1.5, 0.4], R: [-0.3, 1.0, -0.4] } },
  ] },
  // rising slash: out of the hamstring crouch, an upward cut that rises with the body
  swRisingSlash: { dur: 0.8, hit: [0.3, 0.52], keys: [
    { t: 0.12, R: [[0.3, -0.75, 0.55], [0.6, -0.6, 0.5]], aimR: [0.75, -0.4, 0.5], hip: [0.05, 1.8, 1.4, 0.3, 0.45], chest: [0.45, 0.4, 0], feet: LUNGE },
    { t: 0.4, R: [[-0.3, 0.6, 0.75], [-0.2, 0.85, 0.45]], aimR: [-0.4, 0.85, 0.2], hip: [0, 0.3, 1.0, -0.3, -0.05], chest: [-0.3, -0.1, 0], feet: STEP },
    { t: 0.6, R: [[-0.45, 0.7, 0.55], [-0.3, 0.9, 0.2]], aimR: [-0.4, 0.85, -0.3], hip: [0, 0.3, 0.9, -0.4, -0.05], chest: [-0.4, -0.12, 0], feet: STEP },
  ] },
  // guard push: up out of the crouch through their guard, both hands (hilt and off hand or shield) driving forward
  swGuardPush: { dur: 0.85, hit: [0.32, 0.52], targets: 2, keys: [
    { t: 0.15, R: [[-0.3, -0.6, 0.5], [0.3, 0.1, 0.95]], aimR: [0, 0.85, 0.5], L: [[0.3, -0.6, 0.5], [-0.3, 0.1, 0.95]], Ls: SHIELD_POSES.tuck, hip: [0.05, 1.5, 1.2, 0.1, 0.35], chest: [0.1, 0.35, 0] },
    { t: 0.4, R: [[-0.15, -0.15, 0.98], [0.15, 0.15, 0.98]], aimR: [0, 0.85, 0.5], L: [[0.15, -0.15, 0.98], [-0.15, 0.15, 0.98]], Ls: SHIELD_POSES.punch, hip: [0.05, 0.5, 2.2, 0, 0.1], chest: [0, 0.05, 0], feet: PASS },
    { t: 0.58, R: [[-0.15, -0.15, 0.98], [0.15, 0.15, 0.98]], aimR: [0, 0.85, 0.5], L: [[0.15, -0.15, 0.98], [-0.15, 0.15, 0.98]], Ls: SHIELD_POSES.punch, hip: [0.05, 0.5, 2.1, 0, 0.1], chest: [0, 0.05, 0], feet: PASS },
  ] },
  // tornado jab: the turn of the whirling cut carried on into a driving forward thrust
  swTornadoJab: { dur: 0.75, hit: [0.3, 0.52], targets: 1, arc: 0.4, keys: [
    { t: 0.14, R: [[-0.3, -0.7, -0.6], [0.05, 0.05, 1]], aimR: [0, 0.05, 1], hip: [0, 0.6, 0.8, 0.6, 0.1], chest: [0.5, 0.1, 0], feet: PASS },
    { t: 0.38, R: [[-0.03, 0, 1], [0, -0.03, 1]], aimR: [0, -0.06, 1], hip: [0.05, 0.95, 2.2, 0.1, 0.28], chest: [0.35, 0.25, 0], feet: LUNGE },
    { t: 0.56, R: [[-0.03, 0, 1], [0, -0.03, 1]], aimR: [0, -0.06, 1], hip: [0.05, 0.92, 2.1, 0.1, 0.28], chest: [0.35, 0.25, 0], feet: LUNGE },
  ] },
  // sky piercer: sink right down, then explode upward with the point driving straight up through them
  swSkyPiercer: { dur: 1.1, hit: [0.42, 0.6], targets: 1, arc: 0.6, keys: [
    { t: 0.3, R: [[-0.4, -0.8, -0.3], [-0.1, -0.9, 0.4]], aimR: [0, -0.3, 0.95], hip: [0, 1.8, 0.2, -0.4, 0.3], chest: [-0.2, 0.35, 0] },
    { t: 0.5, R: [[-0.1, 0.95, 0.3], [0, 1, 0.05]], aimR: [0, 1, 0.1], hip: [0, 0.1, 0.8, 0.1, -0.15], chest: [0.1, -0.2, 0], feet: STEP },
    { t: 0.72, R: [[-0.1, 0.95, 0.3], [0, 1, 0.05]], aimR: [0, 1, 0.1], hip: [0, 0.1, 0.8, 0.1, -0.15], chest: [0.1, -0.2, 0], feet: STEP },
    { t: 0.9, R: [[-0.2, -0.3, 0.93], [0, 0.1, 1]], aimR: [0, 0.3, 0.95], hip: [0, 0.4, 0.6, 0, 0.05], chest: [0.05, 0, 0], feet: STEP },
  ] },
  // guard counters from the tree
  // shield rush: a running shield bash — shoulder behind the shield on a full pass, the sword kept back
  swShieldRush: { dur: 0.8, hit: [0.22, 0.44], keys: [
    { t: 0.12, Ls: SHIELD_POSES.tuck, R: [[-0.5, -0.5, -0.4], [-0.1, 0.4, 0.9]], aimR: [-0.1, 0.8, 0.5], hip: [0, 0.6, 0.2, -0.5, 0.15], chest: [-0.35, 0.15, 0] },
    { t: 0.3, Ls: SHIELD_POSES.punch, R: [[-0.5, -0.5, -0.4], [-0.1, 0.4, 0.9]], aimR: [-0.1, 0.8, 0.5], hip: [-0.05, 0.8, 2.4, -0.45, 0.3], chest: [-0.4, 0.25, 0], feet: PASS },
    { t: 0.5, Ls: SHIELD_POSES.punch, R: [[-0.5, -0.5, -0.4], [-0.1, 0.4, 0.9]], aimR: [-0.1, 0.8, 0.5], hip: [-0.05, 0.75, 2.3, -0.4, 0.28], chest: [-0.35, 0.22, 0], feet: PASS },
  ] },
  // winding thrust: from the bind, the hand winds up high and the point drops down past their guard into the face
  swWindingThrust: { dur: 0.72, hit: [0.36, 0.56], targets: 1, arc: 0.4, keys: [
    { t: 0.14, R: [[-0.3, 0.35, 0.88], [0.2, 0.6, 0.77]], aimR: [0.55, 0.3, 0.78], hip: [0, 0.4, 0, -0.2, 0.05], chest: [0.05, 0.05, 0] },
    { t: 0.3, R: [[-0.25, 0.55, 0.8], [0.05, 0.45, 0.9]], aimR: [0.1, -0.45, 0.89], hip: [0, 0.5, 0.5, -0.05, 0.1], chest: [0.15, 0.08, 0] },
    { t: 0.46, R: [[-0.05, 0.3, 0.95], [0, 0.1, 1]], aimR: [0, -0.4, 0.92], hip: [0.05, 0.75, 1.6, 0.15, 0.2], chest: [0.3, 0.15, 0], feet: STEP },
    { t: 0.62, R: [[-0.05, 0.3, 0.95], [0, 0.1, 1]], aimR: [0, -0.4, 0.92], hip: [0.05, 0.72, 1.5, 0.15, 0.2], chest: [0.3, 0.15, 0], feet: STEP },
  ] },
};

// what each blow deals (docs/WEAPONS.md: damage types) and how high it lands (metres: where on a creature it strikes —
// the hit zone; default 1.1)
const CLIP_TYPE = { pierce: ['swPunta', 'swHeavyPunta', 'swRiposte', 'swClosingThrust', 'swExtendedLunge', 'swTornadoJab', 'swWindingThrust', 'swSkyPiercer'],
  blunt: ['swPommelStrike', 'swShieldRush', 'swGuardPush'] };
const CLIP_AIM = { swHamstring: 0.35, swHeavySottano: 0.8, swSottano: 0.9, swHeavyFendente: 1.5, swPassFendente: 1.4, swPommelStrike: 1.5, swSkyPiercer: 1.6, swClosingSlash: 1.4, swRisingSlash: 1.0 };

const SHIELD_PLAN = {
  swFendente: ['high', 'tuck', 'tuck'], swRiverso: ['open', 'open', 'open'], swPunta: ['punch', 'tuck', 'tuck'],
  swSottano: ['high', 'tuck', 'tuck'], swMezano: ['guard', 'tuck', 'tuck'], swMezanoRiv: ['open', 'open', 'open'],
  swPassFendente: ['high', 'tuck', 'tuck', 'guard'], swHeavyFendente: ['high', 'tuck', 'tuck', 'guard'],
  swHeavyPunta: ['punch', 'tuck', 'tuck'], swHeavySottano: ['guard', 'tuck', 'tuck', 'guard'], swHeavyMezano: ['guard', 'tuck', 'tuck', 'guard'],
  swRiposte: ['tuck', 'tuck', 'tuck'],
  swClosingThrust: ['punch', 'tuck', 'tuck'], swPommelStrike: ['tuck', 'tuck', 'tuck'], swHamstring: ['high', 'tuck', 'tuck'],
  swWhirlingCut: ['guard', 'tuck', 'tuck', 'guard'], swFlurrySlash: ['tuck', 'tuck', 'tuck', 'tuck'], swExtendedLunge: ['tuck', 'tuck', 'tuck'], swClosingSlash: ['high', 'tuck', 'tuck', 'guard'],
  swRisingSlash: ['tuck', 'tuck', 'tuck'], swTornadoJab: ['tuck', 'tuck', 'tuck'], swSkyPiercer: ['guard', 'tuck', 'tuck', 'guard'], swWindingThrust: ['tuck', 'tuck', 'tuck', 'tuck'],
};
for (const [clip, plan] of Object.entries(SHIELD_PLAN)) SWORD_CLIPS[clip].keys.forEach((k, i) => { if (!k.Ls) k.Ls = SHIELD_POSES[plan[i] || 'guard']; });

// the arming sword's chains (src/rpg/combos.js): the light chain in order (the last is the finisher) and the heavy moves
export const SWORD_CHAIN = {
  light: ['swFendente', 'swRiverso', 'swPunta', 'swSottano', 'swMezano', 'swMezanoRiv', 'swFendente', 'swRiverso', 'swPunta', 'swPassFendente'],
  heavy: ['swHeavyFendente', 'swHeavyPunta', 'swHeavySottano', 'swHeavyMezano', 'swHeavyFendente'],
  counter: { weapon: 'swRiposte', shield: 'swShieldCounter' },
};

// The shortsword tree's moves (src/data/skillTrees.js shortsword): specials (at: how many light attacks come before the
// heavy they replace) and follow-ups (light / heavy: the node whose move a perfect light / perfect heavy right after this
// one flows into). damage: × the weapon's blow · stamina · targets: most foes one swing can hit · arc: its half-angle ·
// dash: the body driven forward (m/s over that share of the move) · jump: upward push · stun / knockdown / launch (s) ·
// slow { k, t } · bleed { k: share of the blow per second, t } · pierce: share of armor ignored · staggerChance ·
// channel: loops while attack is held · ends: nothing can follow it. perRank: what each rank past the first adds.
export const SWORD_MOVES = {
  closingThrust: { clip: 'swClosingThrust', at: 0, damage: 1.6, stamina: 18, targets: 1, arc: 0.35, dash: { from: 0.12, to: 0.46, speed: 8 }, light: 'extendedLunge', heavy: 'closingSlash', perRank: { damage: 0.1, dash: 1.5 } },
  pommelStrike: { clip: 'swPommelStrike', at: 1, damage: 0.9, stamina: 14, targets: 1, arc: 0.6, stun: 0.8, stagger: 3, perRank: { stun: 0.25 } },
  hamstring: { clip: 'swHamstring', at: 2, damage: 1.3, stamina: 16, targets: 2, slow: { k: 0.5, t: 4 }, light: 'risingSlash', heavy: 'guardPush', perRank: { slowT: 1, slowK: -0.1 } },
  whirlingCut: { clip: 'swWhirlingCut', at: 3, damage: 1.4, stamina: 22, targets: 5, arc: 2.8, light: 'tornadoJab', heavy: 'skyPiercer', perRank: { targets: 1, damage: 0.05 } },
  thousandCuts: { clip: 'swFlurrySlash', at: 4, damage: 0.6, stamina: 9, targets: 2, channel: true, ends: true, perRank: { damage: 0.1, speed: 0.12 } },
  extendedLunge: { clip: 'swExtendedLunge', damage: 1.5, stamina: 14, targets: 1, arc: 0.35, dash: { from: 0.08, to: 0.4, speed: 9 }, pierce: 0.3, perRank: { damage: 0.1, pierce: 0.1 } },
  closingSlash: { clip: 'swClosingSlash', damage: 1.5, stamina: 18, targets: 2, dash: { from: 0.1, to: 0.42, speed: 6 }, jump: 4.5, staggerChance: 0.4, perRank: { staggerChance: 0.15 } },
  risingSlash: { clip: 'swRisingSlash', damage: 1.2, stamina: 14, targets: 2, bleed: { k: 0.03, t: 5 }, perRank: { bleedT: 1 } },
  guardPush: { clip: 'swGuardPush', damage: 0.7, stamina: 16, targets: 2, knockdown: 1.5, perRank: { knockdown: 0.3 } },
  tornadoJab: { clip: 'swTornadoJab', damage: 1.3, stamina: 14, targets: 1, arc: 0.4, dash: { from: 0.15, to: 0.4, speed: 5 }, light: 'extendedLunge', heavy: 'closingSlash', perRank: { damage: 0.1 } },
  skyPiercer: { clip: 'swSkyPiercer', damage: 2.0, stamina: 24, targets: 1, arc: 0.6, launch: 1.2, ends: true, perRank: { launch: 0.3 } },
};
for (const [node, m] of Object.entries(SWORD_MOVES)) m.node = node;
export const SWORD_SPECIALS = Object.values(SWORD_MOVES).filter(m => m.at !== undefined);
// a move at a rank: its numbers with the ranks past the first added
export function moveAtRank(m, r = 1) {
  const k = Math.max(0, r - 1), P = m.perRank || {}, out = { ...m, rank: r };
  if (P.damage) out.damage = m.damage * (1 + P.damage * k);
  if (P.stun) out.stun = m.stun + P.stun * k;
  if (P.dash && m.dash) out.dash = { ...m.dash, speed: m.dash.speed + P.dash * k };
  if (m.slow) out.slow = { k: Math.max(0.2, m.slow.k + (P.slowK || 0) * k), t: m.slow.t + (P.slowT || 0) * k };
  if (P.targets) out.targets = m.targets + P.targets * k;
  if (P.pierce) out.pierce = Math.min(0.9, m.pierce + P.pierce * k);
  if (P.staggerChance) out.staggerChance = Math.min(1, m.staggerChance + P.staggerChance * k);
  if (m.bleed) out.bleed = { k: m.bleed.k, t: m.bleed.t + (P.bleedT || 0) * k };
  if (P.knockdown) out.knockdown = m.knockdown + P.knockdown * k;
  if (P.launch) out.launch = m.launch + P.launch * k;
  out.speed = 1 + (P.speed || 0) * k;
  return out;
}
// guard counters the tree adds: tap (Winding thrust, off any block) and hold (Rush: a shield bash, or a shoulder barge
// with no shield). Without them a tap or hold is the plain counter for what blocked (riposte / shield bash and cut).
export const SWORD_COUNTERS = {
  tap: { node: 'windingThrust', clip: 'swWindingThrust', damage: 2.2, perfectDamage: 2.6, targets: 1, arc: 0.4, perRank: { damage: 0.15 } },
  hold: { node: 'shieldRush', clip: 'swShieldRush', damage: 0.8, perfectDamage: 1.0, stun: 1.5, stagger: 3, targets: 2, perRank: { stun: 0.3 } },
};
for (const [name, c] of Object.entries(SWORD_CLIPS)) { c.type ??= Object.keys(CLIP_TYPE).find(k => CLIP_TYPE[k].includes(name)) || 'slash'; c.aimH ??= CLIP_AIM[name]; }
// the shield counter's bash is blunt for its first part (its cut slashes; the whole move counts as its bash)
SWORD_CLIPS.swShieldCounter.type = 'blunt';

