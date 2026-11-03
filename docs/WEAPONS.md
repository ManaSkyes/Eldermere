# Weapons — design guide

How every weapon is built, so the next ones follow the arming sword / shortsword. The change log with numbers is in
docs/CHARACTER.md (z33–z44); skill trees in docs/SKILL_TREES.md and src/data/skillTrees.js.

## Animation: real combat, the whole body

- Each weapon gets its own art from how it was really fought (the arming sword: Fiore, I.33, Meyer). Body pose to
  swing: feet step, lunge and pass, hips and chest turn into the blow, the arm extends last, the head stays level.
  No stiff-backed arm swings.
- One file per weapon family (src/rpg/swordArts.js is the model): a ready carry (how it's held standing and walking),
  the light chain, the heavy moves, counters, specials and follow-ups. Keys use the arm aims plus the full-body
  channels (`hip`, `chest`, `feet`); the shield arm has its own channel (`Ls`).
- Order: the arming sword first, then down the list one weapon at a time.

## Combos

- Length grows with skill (at 5000: light weapons 10, one-handers 8, polearms 6, greatsword 5, great axe/hammer 4).
- Light, heavy and mixed chains (a heavy press branches the light chain).
- **Perfect combos:** the next press timed to the end of the swing (the reticle's ring) for +20–50% damage —
  lighter weapons tighter window, bigger bonus. Early continues without the bonus; late ends the chain.
- **Recovery** after a combo ends or breaks: the main hand waits; blocks, the off hand and counters are free.
- **Targets per swing:** a shortsword reaches 1–2 foes, the ones nearest the blade; thrusts 1; wide moves more.

## Guard

- Blocking with a shield (its `block` stops damage, `stability` absorbs stamina) or the weapon itself (weaker).
- Perfect block (guard raised just before the blow), guard counters (tap / hold), deflect. A guard counter counts as the chain's
  1st attack: the next press (in its timing window, perfect bonus and all) carries on from attack 2 — a light, or a
  heavy / the special learned for after 1 light (z57). The guard side of every
  tree must work without a shield.

## Skill trees (per weapon)

- Center: core passives and actives, timing nodes in every rank. Left: offense (perfect-combo bonuses, specials and
  their follow-ups). Right: defense (perfect block, counters, mitigation). Side nodes lock their counterpart in the
  same tier — passive for passive, active for active; an extra with no counterpart stays open.
- **Specials** replace the heavy at a point in the light chain (after 0, 1, 2, 3, 4+ lights). **Follow-ups**: a
  perfect light or perfect heavy right after a special. Actives have ranks that scale their effects.

## Damage types on every move (done for the shortsword, z45)

Monsters (docs/MONSTERS.md) take damage by type, and the player learns their resistances by experiment, so every
blow must say what it deals:

- **Physical types: slash, pierce, blunt, crush.** Every weapon move declares one (or a split), in its clip or move
  data (e.g. `type: 'pierce'`). Rough guide: cuts slash; thrusts, lunges and jabs pierce; pommel strikes, shield
  bashes, shoves and hilt blows are blunt; crush is for heavy weapons' overheads and slams (mace, hammer, great axe,
  a shield bash from a big shield). A weapon may also have a default type for moves that don't say.
- **Magic types** come from the spell's school (fire, frost, storm, earth, light, lunar, dark/shadow...).
- **Combat must pass the type in the hit** (`info.type`) so monsters can apply their multipliers and the knowledge
  system can record "hit with" / "killed with".
- Shortsword moves to tag first (all of src/rpg/swordArts.js): fendente, riverso, sottano, mezano, the passing cut,
  the heavies and the whirling cut — slash; punta, heavy punta, riposte, closing thrust, extended lunge, tornado jab,
  winding thrust, sky piercer — pierce; pommel strike, shield counter's bash, rush (shield bash / shoulder barge),
  guard push — blunt; closing strike slash, rising slash, hamstring cut, thousand cuts — slash.

- **Done (z45):** src/rpg/swordArts.js tags every clip (`type`, and `aimH` — how high it lands, for hit zones);
  combat.js sends `info.type` and `info.aim` with every hit, and gives other weapons a default type (`WEAPON_TYPE`:
  maces, clubs, staves blunt; warhammer crush; spears, daggers, rapier pierce; axes, glaive, whip slash). Each new
  weapon art tags its own clips.

## Swing trails (z61)
- Every player swing leaves a pale ghost in the air (src/gfx/swingTrail.js): a ribbon from the blade's forte to its
  tip, laid while the blow is live (just before its hit window to just after) and gone within ~0.2 s, densest along
  the edge. Colour by what it deals: steel (slash/pierce/blunt/crush) pale silver; elements their own hue and a little
  glow (fire orange, frost ice-blue, storm yellow, light gold, lunar pale blue, dark violet, earth tan, arcane pink) —
  ready for enchanted weapons (`lastSwing.element`). Setting `swingTrails: false` turns it off.
