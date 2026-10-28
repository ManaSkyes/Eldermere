# Character rework

The character is the most expensive thing on screen (about 2.2 ms of GPU time in third person, much of it the hair),
and body and transformation are central to the game, so the whole character is being redone, step by step.

## Plan

1. **Hair system** (in progress)
   - 1a. Renderer and physics (done, 25-Oct-z27): src/rpg/hairCards.js.
   - 1b. Hair lab, in the character creator's hair section (started 25-Oct-z28; was planned as hair-lab.html): build and tune styles from guides; presets; creator sliders for length, volume,
     curl, parting and colours; physics tuning; motion tests (head shake, run, wind).
   - 1c. More styles (braids, buns, ponytails, curls, short cuts), brows and lashes on the same system.
2. **Detail levels** (done, 25-Oct-z30): lighter body and clothing meshes by distance (third person, NPCs).
3. **Skin and face shading** (started 25-Oct-z30: translucency): cost and look; eyes, brows, lashes.
4. **Cloth and gear physics** (started 25-Oct-z31: inertia): capes, skirts, straps on the same guide-physics approach as the hair.
5. **Animation and pose** (started 25-Oct-z32):
   - 5a. Free third-person camera (done).
   - 5b. Everyday moves + Animation lab (started: src/rpg/moves.js).
   - 5c. Weapon combos: start at 2 hits, grow with the weapon skill to (at 5000) 10 light weapons, 8 one-handers,
     6 polearms and staves, 5–4 two-handers; light and heavy chains, heavy presses branch the light chain.
   - 5d. Interactions in the world (chests, ground items, levers, stations) using the moves.

## Hair (1a)

- **Guides**: one strand per scalp root, grown for the chosen style by src/rpg/hair.js (`buildHairCards(..., { copies: 1 })`).
  Only the guides are simulated: a few hundred points, on the CPU, at a fixed 60 Hz.
- **Cards**: wide cards laid around each guide, in three layers drawn in order: a dense base card per guide, a looser
  mid card (lifted, shifted, twisted a little), and a few sparse or flyaway cards. 2.5-4 cm wide (the old cards were
  about 1 cm, so they were sub-pixel at a distance: most of their cost was wasted shading).
- **GPU motion**: each card vertex knows its guide and point (`hairRef`); the guides' offsets (in the head's rest space)
  are one small float texture (points × guides), read in the vertex shader. The CPU never touches card vertices per
  frame (the old system rewrote ~25,000 vertices every frame). The shadow pass uses the same vertex patch, with the
  strand alpha (customDepthMaterial).
- **Look**: a strand atlas painted once (dense, medium, sparse, flyaway columns); root-to-tip colour; a touch darker at
  the roots; two strand highlights along the hair's direction (Kajiya-Kay: sharp white + broad tinted, shifted per
  strand), added to every light (sun, moon, torches); alpha coverage kept in the distant mip levels.
- **Detail levels** (`hairLOD(metres)`): under 2.2 m all layers; to 7 m base and mid; beyond that the base cards only,
  widened 35% so the hair keeps its volume. The game sets it from the camera's distance to the head.
- **Physics** (makeGuideSim): points in world space. Most of the head's motion carries the hair rigidly (55%); the rest
  becomes swing, so walking, turning and stopping move it the way inertia does; a big jump in one frame (low frame
  rate, teleport) is carried completely, so it can't whip. Heavy damping; bend stiffness (the style's shape relative to
  the point above, turned with the head: stiff at the roots, free at the tips); a weak pull back to the whole style;
  a little gravity; wind (the game passes the weather's wind); exact segment lengths; collisions with the skull
  (ellipsoid) and the neck, shoulders, torso and arms (only where the style itself isn't resting inside them).

## Hair lab and physics fixes (25-Oct-z28)

- **Physics:** the head's movement is now carried completely, so walking or running at a steady pace doesn't stream
  long hair back (the damping used to act on the hair's absolute speed: at a run it dragged everything behind). Only
  speeding up, slowing down, jumping and landing throw it (`inertia`, from the head's smoothed acceleration, clamped).
  Turning is carried in part (`follow`, 0.6) and the rest swings. The ends of long hair are damped hardest (0.14 at the
  root to 0.32 at the tip) so they settle instead of flailing. At most two physics steps a frame (no catch-up spiral at
  low frame rates); only the neck/shoulder and torso capsules are tested (arms and legs never reach the hair). A broken
  step (a non-finite offset) puts the hair back on its style instead of making it vanish.
- **Hair lab** (creator → Hair): look — Volume (card width), Density (how many mid and flyaway cards), Curl, Wave (the
  hair is grown again); movement — Follow turns, Inertia, Stiffness, Damping, Gravity (live); Test wind; motion tests
  (Shake head, Turn, Jump, Run); Detail level preview (Auto, Near, Mid, Far); cards / triangles / guides readout. All of it
  is saved with the character (appearance.hair: len, look, phys — lengths weren't saved before).
- **The creator holds still:** no idle sway (the Hair lab's tests move the model on purpose; Walk and Wave still animate).
- **Edit look:** saved characters have an Edit look button on the load screen: the creator opens on the Appearance
  step with that character; only the look and name change (stats, gear and progress are kept).

## Fixes (25-Oct-z29)

- **Hair drifting off the head / bald in a level / parts vanishing:** the hair was bound to the skeleton with the
  character's world position at the moment it was grown. In the creator that's the origin, but a regrow in a level
  (a head-shape change, loading the look) bound it wherever the character stood, so it sat off the head or far away.
  It's now bound exactly like the body (the body's bind matrix).
- **Turning on the spot** (the mouse turning you): the character's own turning is carried 90% (only 10% becomes swing),
  its movement 100%; the head's motion on the body (the animation) is carried with 'follow' as before.
- **Detail levels** step further out (all layers to ~5 m, base and mid to ~14 m) with a margin either side, so a third-
  person camera hovering at a boundary no longer flips cards on and off.
- **Creator layout:** on wide screens the character fills the left side, full height; narrower, it sits above the sheet
  in the right column; the full-body view frames head to feet.

## Bald in levels, detail levels, skin translucency (25-Oct-z30)

- **The real cause of the bald hair** (in levels, and after Bald → Hair in the creator): whenever the body is updated
  (a slider, gear put on, loading the look, Bald/Hair), the skeleton is refitted to the new shape and every skinned
  mesh is re-bound with its current place in the world (src/rpg/humanViewer.js update). The hair wasn't in that list,
  so it kept the old binding and ended up a body-length below the head (inside the body). It's re-bound with the rest
  now, and its physics starts again from the style.
- **Hair physics after a pause** (hidden by Bald, a hood, first person, a background tab): starts again from the style
  (a gap of more than 0.25 s), instead of flinging stale points across the body.
- **Detail levels for the body and clothes** (src/rpg/meshLod.js): a lower level is just a different triangle list over
  the same vertices — vertices gathered into 2 cm cells (to ~18 m) and 4.2 cm cells (beyond), each drawn by one of its own
  vertices; collapsed triangles dropped. Shared vertex data means sliders, morphs, fitting, skinning and transformations
  move every level for free. Built on first use, with a margin either side of each step. The game sets it from the
  camera's distance (third person; first person stays full). The fur/feather shells keep their own triangle lists.
- **Skin translucency:** the skin's diffuse light wraps past the shadow line, more in red than green and blue (a cheap
  subsurface scattering: the soft, warm terminator of real skin instead of a hard plastic edge). Creator → Skin →
  Translucency (0..1.6, default 1); saved with the look.
- **F8 panel:** a hair status line (cards, guides, shown/hidden, detail levels) and the last shader error, if any
  material failed to compile (a failed material simply isn't drawn).

## Cloth inertia (25-Oct-z31)

- Skirts (src/rpg/springBones.js) and capes (src/rpg/tailCape.js) were simulated in the character's own space, so they
  only ever followed the body's shape: walking off, stopping or landing didn't move them. The body's acceleration
  (src/rpg/humanViewer.js bodyAccel: the root's world motion, smoothed, clamped to 30 m/s², turned into the
  character's space) now pushes them the other way — more toward a skirt's hem; the whole cape — so they lag a start,
  swing forward at a stop and lift on a landing. Steady walking adds nothing.

## Free camera, everyday moves (25-Oct-z32)

- **Third person, weapons away:** the camera circles the character all the way round (the mouse); the keys move you
  relative to the camera (forward is always away from it), and the body turns to face where it's going — never
  backing up. The head leads into a turn (up to ~50° ahead of the body) and, standing still, glances toward where the
  camera looks (within ~100°, eased). The body stays on its spot as the camera circles (first person still eases the
  body back under the eyes).
- **Weapons out or a spell readied:** as before — the body squares to the camera and strafes / backpedals.
- **Everyday moves** (src/rpg/moves.js): the attacks' key language (arm aims, chest turn) plus lean, squat and head
  channels, props in the hand (a potion bottle that empties, food, a pouch) and named events. Drink, pick up, open a
  chest, use/press, pull a lever, kneel and look, eat, throw, shrug, point. A move's squat folds the legs and lowers
  the hips so the feet stay down.
- **In the game:** drinking a potion plays the drink; the potion takes hold at the swallow (straight away if the hands
  are busy). The rest wait for the world's interactables (chests, ground items, levers: step 5d).
- **Animation lab** (creator → Pose): play any move once or looped, change its speed, scrub through it by hand.

## Weapon combos (25-Oct-z33)

- **src/rpg/combos.js:** every weapon starts with a 2-hit chain that grows with its skill (front-loaded curve) to, at
  5000: light weapons 10 (dagger, rapier, whip, parrying dagger, throwing knives) · one-handers 8 (shortsword, arming
  sword, hand axe, mace, club) · polearms and staves 6 (spear, glaive, staff) · greatsword 5 · great axe, warhammer,
  pickaxe 4. E.g. a sword: 2 at 100, 3 at 500, 4 at 1000, 5 at 2500, 8 at 5000.
- **Chains:** tap = the light chain (forehand, backhand, thrust, rising cut, backhand, sweep, forehand... and a heavier
  finisher), each step a little faster and harder; hold = the heavy chain (overhead, sweep, rising), about half as long;
  holding during a light chain **branches** it into that step's heavy move — early branches carry on (the next tap
  continues from the next step), the last ends the chain. A press near the end of a swing (or within ~0.5 s after it)
  carries the chain on; otherwise it starts again. A mace with Overhead smash still charges its heavy from neutral.
- **New moves** (src/rpg/humanViewer.js ATTACKS): one-handed thrust, rising cut, sweep; dagger backhand and rising
  stab; two-handed backhand, rising cut, sweep, overhead; spear sweep and overhead.
- **Combo preview** (creator → Pose → Animation lab): put a weapon in the main hand, pick a skill, play the light,
  heavy or a mixed chain (L L H...).

## Arming sword art (25-Oct-z34)

- **src/rpg/swordArts.js:** the arming sword's own whole-body moves, after the medieval longsword/arming-sword cuts
  (fendente = downward cut, riverso = backhand, punta = thrust, sottano = rising cut, mezano = horizontal cut).
  Guard: left foot forward, right back and turned out, knees bent, hips turned ~20° and dropped, sword high at the right.
- Keys add body channels to the arm aims: `hip: [x, drop, z, yaw, pitch]` (dm / rad; +yaw brings the right hip
  forward), `chest: [twist, lean, side]`, `feet: { L: [x, z, yaw], R: [...] }` (dm from the rest feet). Steps (STEP),
  lunges (LUNGE) and passing steps (PASS) move the feet; two-bone leg IK keeps them planted and flat, the head stays level.
- Light chain: Fendente, Riverso, Punta, Sottano, Mezano, Mezano riverso, … finisher Passing fendente.
  Heavy: Heavy fendente, Lunging punta, Heavy sottano, Heavy mezano.
- Other weapons still use the arm-only moves; each gets its own art next (one at a time, down the list).

## Shield arm and guard counter (25-Oct-z35)

- **Shield arm** (src/rpg/swordArts.js SHIELD_POSES): guard (forward-left, angled — covers the left side and face, leaves
  the sword a lane on the right), tuck (to the chest as a cut lands), high (over the head while the sword chambers),
  open (swung out of a backhand's way), punch (leading a thrust or bash). Keys give the shield's pose as `Ls`;
  SHIELD_PLAN sets it per key for the sword moves. Any weapon with a shield holds the guard by default.
- **Guard counter** (src/game/combat.js): block a blow, then press attack while the guard is up → swRiposte (blocked
  on the blade) or swShieldCounter (blocked on the shield: bash and a cut over it). Other weapons use their thrust/rise
  (combos.js counterMove). Limits: 0.6 s window after the block (1.0 s after a perfect block — guard raised ≤0.25 s
  before the blow), 12 stamina, 2 s cooldown. ×1.6 damage (×2 perfect), ×1.5 stagger, "Counter" text on the hit.
- **Blocking by what you block with:** a shield's `block` = share of damage stopped, `stability` = share of the stamina
  cost absorbed (Round shield 0.8 / 0.5, placeholders until shield items get real stats). A weapon guard: GUARD in
  combat.js (one-hand 0.6 / 0.2, two-hand 0.75 / 0.35, dagger 0.45 / 0.1…). A perfect block stops everything at half cost.

## Perfect combos and the ready carry (25-Oct-z36)

- **Perfect combos** (src/rpg/combos.js COMBO_TIMING, src/game/combat.js judge): no more free spamming. Each press is
  judged against a window centred on the end of the current swing: inside → the next step with a damage bonus;
  earlier → the next step, no bonus; later → the chain is over (the next press starts it again). Window half-width /
  bonus by class: light (daggers, rapier) ±0.07 s / +50% · one-handers ±0.10 s / +40% · polearms ±0.12 s / +32% ·
  greatsword ±0.14 s / +25% · great axe, warhammer ±0.16 s / +20%. The animations are unchanged.
- **Feedback:** the reticle gets a target ring and a wave that grows out from the middle and meets it at the window's
  centre; the target ring brightens while the window is open and glows softly on a perfect press (no hard flash).
  A two-note chime (audio.perfect) on a perfect combo press and on a perfect block.
- **Ready carry** (SWORD_STANCE): standing and walking with the sword out it's held low at the right hip, blade angled
  forward and down (the Souls one-handed carry); the bladed guard and full-body moves start from it. The shield rests
  down by the left side (SHIELD_POSES.rest) and only comes up to block or as the moves use it.

## z37 tweaks

- The shield block pose (humanViewer BLOCKS.shield) and the high cover (SHIELD_POSES.high) are pushed out to arm's
  length with the rim below the eyes — held close they clipped the face.
- audio.perfect: a softer mid-pitched metallic "ting" after Phantasy Star Universe's just-attack (bell partials that
  fade fast over a quick airy swell), 659 Hz for a combo press, 523 Hz for a perfect block — replaces the high chime.
- z38: audio.perfect rebuilt from a PSU clip's spectrum: a glassy partial cluster (3.6–7.8 kHz, strongest 4.15 and 7.8,
  the top gliding up ~2.5%) that swells in over 0.11 s, holds 0.09 s and cuts in 0.07 s; quiet; block ×0.85 pitch.
- z39: audio.perfect gets the body found under the shimmer (≈495 Hz + octave 985 Hz, the loudest part), the shimmer
  turned down, and the clip's timing (swell 0.2 s, hold 0.12 s, cut 0.05 s). Web Audio clock: frame rate doesn't touch it.
- z40: shield block = SHIELD_POSES.block (flat in front of the chest, face square on, rim under the chin; "high" uses
  the same). audio.perfect rebuilt from a clean clip: the ~495 Hz "body" was the music's chord and is gone; the effect
  is 9 partials 3.6–7.8 kHz swelling ~25 dB (exponential) over 0.36 s, each gliding up 1.5%, high ones first, then a
  35 ms cut.

## Shortsword skill tree and specials (25-Oct-z41)

- The arming sword (ITEMS.sword) now trains **Shortsword**; the Shortsword item uses the same art (combos BY_WEAPON,
  readyKey). Tree in src/data/skillTrees.js (`shortsword`), effects in src/game/combat.js (`R(nodeId)` reads ranks).
- **Lockouts:** side nodes pair by tier *and kind* — a passive only locks a passive, an active an active; an extra node
  with no counterpart stays open. (This pairing rule now applies to every tree.)
- **Core:** Blade drills (+3% dmg/rank ×3), Economy of motion (−5% stamina ×2), Closing thrust (special, 200),
  Flowing blade (+3% speed ×3).
- **Striker (left):** Keen eye (perfect window +10%/rank) · Clean strikes (perfect bonus +5%/rank) · Pommel strike ·
  Hamstring cut · Finesse (specials +10%/rank) · Whirling cut · Flowing steel (extender) · Thousand cuts (5001).
- **Guardian (right):** Steady guard (perfect block +0.04 s/rank) · Braced (+5% block, −8% block stamina /rank) ·
  Shield rush (shield-block counter: bash, 1.5 s stun) · Winding thrust (blade-block counter, 2.2×/2.6×) · Quick
  recovery (counter −0.4 s cooldown, +0.1 s window /rank) · Deflect (perfect melee block staggers the attacker 0.9 s) ·
  Hold the line (−15% damage through the guard /rank) · Unbroken guard (5001 extender).
- **Specials replace the heavy by position** (src/rpg/swordArts.js SWORD_SPECIALS): heavy after 0 lights → Closing
  thrust (gap closer, dash 8 m/s over 12–46% of the move, 1.6×) · 1 → Pommel strike (0.9×, stun 0.8 s, ×3 stagger) ·
  2 → Hamstring cut (1.3×, target at half speed 4 s) · 3 → Whirling cut (1.4×, 2.8 rad half-arc) · 4+ → Thousand cuts
  (3 separate hits of 0.75×). Unlearned positions keep the normal heavy. A perfect press into a special gets the bonus.
- **Extenders:** Flowing steel — after a special, a perfect light press goes into the next learned special. Unbroken
  guard — after a guard counter, a perfect press goes into the first learned special. The timing ring shows when one
  is available.
- **Enemies** (src/game/enemies.js): `info.stun` (bosses ÷3, brutes ÷1.6) freezes them; `info.slow` scales their
  movement; a deflected blow stuns the attacker.
- New clips: swClosingThrust, swPommelStrike, swHamstring, swWhirlingCut, swFlurry (multi-hit `hits` windows),
  swShieldRush, swWindingThrust.

## Skill gain, recovery and fixes (25-Oct-z42)

- **Skill gain** (combat.js MELEE.xp*): a tenth of before. Hit = 0.1 (× charge), block = 0.04; a perfect hit (the swing
  entered with a perfect press, or a counter off a perfect block) or perfect block gets it all, an ordinary one half;
  hits on training dummies a tenth more.
- **Recovery** (COMBO_TIMING.rec: light 0.25 s, one-hand 0.35, polearm 0.45, greatsword 0.55, heavy 0.6): when a swing
  ends with nothing to carry the chain on, a press lands after the chain's last step, or the chain lapses (too late:
  60%), main-hand attacks wait. Blocking, the off hand and guard counters are free. The crosshair dims meanwhile.
- **Specials past a short chain:** a learned special at the next position keeps the chain open after its last light
  (whirling cut needed a 4-long chain before). A light press there ends the combo instead.
- **Weapons out, standing:** the idle's weight shifting is held square (IDLE_SQUARE) under the fighting stance.
- **Tree header:** "Max combo: N light · M heavy" for weapon skills.

## Targets per swing and Shortsword tree part 2 (25-Oct-z43)

- **Targets per swing** (combat.js sweep): each swing reaches at most N foes, the ones nearest the blade's line first
  (angle + 0.25 × distance). N: the move's `targets`, else by class (CLASS_TARGETS: light 1, one-hand 2, polearm 2,
  greatsword 4, heavy 3). Thrusts (punta, heavy punta, riposte, closing thrust, extended lunge, tornado jab, winding
  thrust) reach 1 in a narrow arc (0.35–0.4 rad); the whirling cut 5 (+1/rank); a multi-hit move counts per window.
- **Skill gain** halved again: hit 0.05, block 0.02 (perfect full, ordinary half, dummies a tenth).
- **Tree** (src/data/skillTrees.js): center gains Apprentice's / Journeyman's / Expert's / Master's timing (+5% perfect
  window per rank, ×3 each, chained), Footwork (+6% move speed while attacking), Second breath (perfect hits give back
  2 stamina/rank), Quick reset (−15% recovery/rank). Actives have 3 ranks (perRank in SWORD_MOVES, moveAtRank()).
  New `pair: false` = a side extra that locks nothing; Rising slash and Guard push are a oneOf pair.
- **Follow-ups** (SWORD_MOVES light/heavy): a perfect light / heavy right after a special goes into its follow-up if
  learned, before Flowing steel. Closing thrust → Extended lunge (pierces 30% armor +10%/rank, dash 9 m/s) /
  Closing strike slash (leap, 40% +15%/rank chance of a 1 s stagger). Hamstring cut → Rising slash (bleed 3% of the
  blow per second, 5 s +1/rank) or Guard push (knockdown 1.5 s +0.3/rank; brutes, bosses and big foes only stagger).
  Whirling cut → Tornado jab (thrust; its own follow-ups are Extended lunge / Closing strike slash) / Sky piercer
  (launch 1.2 s +0.3/rank, ends the combo).
- **Thousand cuts:** a channel — swFlurrySlash (a forehand and backhand, two hit windows) loops while attack is held,
  9 stamina a loop, until released or out of stamina; ends the combo (recovery follows).
- **Guard side without a shield:** counters are tap or hold (decided within 0.2 s). Tap: Winding thrust if learned (any
  block), else riposte / shield counter. Hold: Rush if learned — swShieldRush, a shield bash or (no shield) a shoulder
  barge — else the plain counter. Deflect scales 0.9 s +0.3/rank.
- **Enemies:** bleed (ticks each second), knockdown (tipped flat), launch (thrown up and down), pierce (ignores armor).
- z44: Guard push moves to the Guardian (right) side, still a one-or-the-other pair with Rising slash.
