# Monsters — plan

Status: parts 1–3 built (25-Oct): the creature builder, the Monster lab, the bat and Umbrafiend bodies, locomotion and the move language with their first moves. The rest is plan.

## Today

`src/game/enemies.js` + `src/data/objects.js`: six fighting archetypes (melee, brute, ranged, caster, vermin, boss),
each with variants (skeleton, goblin, ogre, rats...). Bodies are block figures with no skeleton or animation.
Behaviour: guard / wander / patrol, sight and hearing, chase, a telegraphed strike, knockback, stun, slow, bleed,
knockdown, launch. The target interface (`{ pos, radius, height, alive, hit(dmg, info) }`) is what combat, the
specials and spells already use — monsters keep it, so everything the player can do works on them from day one.

## Decisions

- **Bodies:** a creature builder, the same idea as the character (a rig and a skinned mesh made in code), built
  from **body plans** with sliders. Every monster is a preset.
- **First monsters:** the book's — **Nocturian bats** and **Umbrafiends** (Selune's night creatures).
- **Combat depth:** Souls-like. Per-monster move sets with readable wind-ups, combos, poise and stagger, reactions to
  perfect blocks and deflects, weak points on the big ones.
- **Ranks:** the classification guide (below): hazard scale with guild-rank equivalents, plus variants (the same
  creature at several ranks: a Wood wolf, a Silver alpha).

## Design guide: how the world classifies monsters

From the classification guide (a world document outside the story). Every monster in the game carries all four:
a **classification**, a **hazard scale** (with its guild-rank equivalent, which sets its strength), and an
**activity level** (when and how it appears). See also docs/GUILD.md for the guild's own ranks and crest.

### Classifications (what it is)

| Type | Orders (highest first) |
|---|---|
| **Essence Tiers** | **Primeval Essence** — ancient, almost god-like, integral to mythology · **Mystic Essence** — alters its environment through magic or sheer presence; legends · **Spectral Essence** — ghostly, between planes, bound to places or artifacts · **Wild Essence** — common but formidable beasts of the wilds, any size |
| **Celestial Hierarchy** | **Stellar Dominions** — cosmic, the energies of stars and the void · **Solar Regents** — radiant, strength from sunlight · **Lunar Sentinels** — night creatures empowered by the moon, stealthy · **Terrestrial Guardians** — earth-bound protectors of sacred or cursed places |
| **Elemental Circles** | **Corefire** — fire, lava, heat; volatile, aggressive · **Deepsea** — leviathans to sirens · **Stormwind** — wind and storm, harbingers · **Stoneheart** — golems to subterranean horrors |
| **Arcane Orders** | **Archmagi Beasts** — intelligent masters of several magics · **Sorcerer Fiends** — specialised magic to deceive or overpower · **Witchkin Spirits** — tricksters, dark or forbidden magic · **Runebound Minions** — lesser things made or controlled by runes and spells |
| **Mythic Classes** | **Titanic Overlords** — the rarest, pivotal in world events · **Draconic Majesties** — dragons and dragon-kin · **Beastly Sovereigns** — alphas that lead packs and hordes |

In the game the classification also sets defaults: resistances and weaknesses (Spectral: hard to touch with plain
steel; Corefire: burns, fears frost; Lunar Sentinels: stronger at night), and which magic schools bite hardest.

### Hazard scale (how dangerous it is) and guild-rank equivalent (how strong it is in the game)

| Hazard | Guild-rank equivalent | Threat | Rough strength |
|---|---|---|---|
| **Safe** | Wood | No threat; prey, hunted for food or materials | ×0.6 |
| **Nuisance** | Wood | An annoyance: crops, small children | ×1 |
| **Menace** | Bronze – Silver | Common beasts, minor magical creatures; isolated incidents | ×1.8 – ×3 |
| **Dread** | Gold – Crystal | Threatens towns, trade routes, small cities: cunning predators, rogue constructs, lesser demons | ×5 – ×8 |
| **Tempest** | above Crystal | Besieges cities, decimates armies; elemental or dark magic (Dreadhoof was tempest-class) | ×14+ |
| **Cataclysmic** | above Crystal | Its presence disrupts the natural order; can end the world (one sleeps in the southern sea) | not a fight |

**Black** (unranked / secret / unknown) is not a strength: a monster the guild hasn't classified shows "?" for its
hazard and rank until identified (Monster Lore). Its true rank is any of the above.

Terms from the story's dialogue, read onto this scale: "Disaster rank" = **Dread**, "Cataclysm-class" (takes the
whole guild) = **Tempest**, "Apocalyptic" = **Cataclysmic** (the correct name).

### Activity level (when it's about)

| Activity | Minimum hazard | Meaning in the game |
|---|---|---|
| **Active** | Safe+ | acts of its own will — the default |
| **Controlled** | Safe+ | can't act of its own will: summoned, bound, constructs (the gate golems) — follows its master or orders |
| **Solar** | Safe+ | only appears in the day |
| **Lunar** | Safe+ | only appears at night |
| **Hibernation** | Safe+ | only during certain events or seasons |
| **Ephemeral Flare** | Dread+ | a temporary surge: celestial events, magical anomalies, spawning cycles — rarer, stronger spawns |
| **Ancient Slumber** | Tempest+ | dormant; can awaken (a set-piece, not a spawn) |

Spawning reads this: Lunar monsters only at night, Solar only by day, Flares on events.

## The creature builder

- `src/rpg/creatureRig.js` — bones from a body plan: spine segments, neck, head and jaw, limbs (2, 4, 6, 8), wings,
  tail. Rest pose from proportions (length, girth, limb length, stance width).
- `src/rpg/creatureMesh.js` — a skinned mesh swept along the bones: each segment a ring profile with radius curves
  (girth, taper, bulges), fur/scale/chitin/bone looks in the material, wing membranes between finger bones, horns,
  spikes, teeth as attached parts. Detail levels like the character (meshLod).
- Body plans: **biped**, **quadruped**, **winged** (bat: membrane arms), **many-legged** (spiders), **serpent**,
  **shade** (no hard silhouette: a body core inside a smoky, flickering shell — the Umbrafiend).
- `src/data/monsters.js` — presets: body plan + sliders + materials + move set + rank variants + lore.
- **Monster lab** (a page like the Animation lab): build and pose a creature, play its moves, set its rank.

## Movement and animation

- **Procedural locomotion:** legs placed by gait phase (walk, trot, gallop, skitter) with two-bone IK and feet planted
  on the ground; body bob and sway from the gait; wings flap cycles with glides; a shade drifts and coils.
- **Moves:** keyframes in the same language as the sword art (`t`, channels) but creature channels: spine curl/twist,
  neck, head, jaw, each limb, tail, wings, plus root motion (lunges, leaps, swoops).
- Procedural layers on top: breathing, head tracking the target, hit flinches, stagger, death.

## Monster combat

Each move: wind-up (the readable tell), active frames, recovery; hitboxes on bones (jaw, claws, tail, wing edge,
body slam), damage, poise damage, tracking (how much it turns during the wind-up), range, cooldown, follow-ups.

- **Poise:** hits wear it down; at zero the monster staggers (a big opening). Perfect blocks and deflects hit poise hard.
- **Reactions:** a perfectly blocked bite recoils; a deflect staggers; big ones shrug off small hits (hyper armor
  during heavy moves).
- **Hit zones:** per bone (head, body, limbs, wings) with damage multipliers; weak points on big monsters (glowing
  cores, an exposed belly after a stagger).
- **Phases:** big monsters change move sets as health drops.
- **Damage types:** physical — **slash, pierce, blunt, crush**; magic — fire, frost, storm, earth, light (holy),
  lunar, dark/shadow, and the rest of the schools. Each monster has a multiplier per type (0 = immune). Every
  weapon move says which physical type it deals (a thrust pierces, a cut slashes, a pommel strike is blunt...).
- **Illuminating magic:** fire, lunar and light are the schools that give off light — what shadow creatures fear.

## Knowledge and mastery (what you know about a creature)

Knowledge is per creature (every Nocturian bat shares it) and comes three ways: **reading** (books, the bestiary),
**quests** (the guild briefs you before it sends you — it won't send you in unprepared if it can help it), and
**fighting** it.

**Learning damage types by experiment.** Each damage type has three states for each creature:

| State | How | Shows as |
|---|---|---|
| unknown | — | nothing |
| **sensed** | hit it once with that type | the direction only: "takes greatly reduced / reduced / normal / more / much more damage" |
| **known** | **kill** it with that type (the killing blow's type) | the exact value |
| **immune** | hit it once with a type it's immune to | known at once (no kill needed: it can't be killed that way) |

Every physical type (slash, pierce, blunt, crush) and every magic school is learned separately, so full mastery
means experimenting: different weapons, different spells. Books and quest briefings can hand you entries directly.

**Mastery** of a creature rises with how much you know (damage types sensed and known, first kill, kills, its moves
seen) and gives bonuses against it: more damage dealt, less damage taken (amounts to tune; later the Monster Lore
skill can add to them and to how fast knowledge comes).

**Over its head** — what you see depends on your knowledge and mastery:
- **Health:** only a coloured bar (how hurt it looks) until you've killed one; after the first kill the bar drains
  with real health.
- **Its weakest known damage types** (the best ones you've found).
- **Its classification symbol** — after the first kill, or from reading about it.
- Hazard / guild rank comes from knowledge too; a creature you know nothing about reads as Black ("?").

## Behaviour (AI)

A state machine with move choice scored by range, angle, the player's state (guarding, recovering, healing), and
cooldowns: approach, circle and strafe, feint, attack, retreat. Packs share roles (rushers, flankers, a leader that
holds back). Flyers swoop, climb out of reach, and come again. Monster Lore reveals ranks, weak points and tells.

## The first two

- **Nocturian bat** — kin of the Umbrafiends (made of darkness and smoke, the same resistances), Spectral Essence, Nuisance–Menace (Wood–Bronze), activity Lunar; winged, packs: flits in the air out of sword reach, swoops for a bite, screeches to
  daze, latches on; grounded briefly after a swoop — the moment to hit it. Lunar magic is strong against it.
- **Umbrafiend** — Spectral Essence, Menace (Bronze–Silver), activity Lunar; shade body: a shadow beast that drifts, lunges with claws of smoke, sinks into the floor
  to reappear behind you; a core inside that's the real target. **Resistances:** physical (all four types) −95%;
  illuminating magic (fire, lunar, light) ×2; other magic ×1; dark/shadow magic: immune.

## Build order (one part at a time, each tested before the next)

1. The rig and mesh builder, the Monster lab, and the two bodies (bat, Umbrafiend) standing and posed.
2. Locomotion (flying, drifting; then legs for the quadruped plan) and the move language.
3. Combat: moves with hitboxes, poise and stagger, hit zones, reactions to blocks and deflects.
4. Behaviour: the bat's swoops and the Umbrafiend's sinking ambush; packs.
5. Classification, hazard and rank, variants, activity (spawning by time and event), Monster Lore and the Black rank.
6. The dungeon editor places them; the old archetypes move onto the new bodies one by one.

## Answered

- Umbrafiends: physical −95%, illuminating magic ×2, other magic ×1, dark/shadow immune.
- Overhead info: by knowledge and mastery (see "Knowledge and mastery"), not shown outright.

## Part 1 — built (25-Oct)

- **src/rpg/creature.js** `buildCreature(THREE, spec)`: chains of joints → bones (axis-aligned at rest, so a
  rotation turns a segment and everything past it about its joint in the creature's axes); a skinned body swept as
  elliptical rings along each chain (half-width / half-height per joint, eased across joints, capped ends, lighter
  underside, a little colour grain), weights blended across joints; mirrored chains (`.L` / `.R`); **webs** —
  membranes between two rails of joints, resampled by length and skinned to both (bat wings, the tail membrane);
  **parts** — rigid pieces on bones (eyes, glows, fangs, claws, horns, spines, the core). Returns `{ root, bones,
  chain(name), rest(), update(t), dispose() }`. Binds after the rest matrices are computed.
- **Shade look** (Umbrafiend): a near-black, slightly see-through body with a faint violet rim and rolling dark
  noise; two smoke shells puffed out in the bind pose (noise displacement, flickering alpha, skinned with the body);
  rising wisps (points that start at random bones and drift up); the core glows through.
- **src/data/monsters.js**: `MONSTERS` with classification, hazard, rank range, activity, resistances, lore, sliders,
  `spec(p)` and `idle(C, t, p)`; `monsterSpec(id, params)`.
  - Nocturian bat: winged plan, ~2.2 m span; sliders size, wingspan, ears, body, fangs; idle: hovering wingbeats.
  - Umbrafiend: shade plan (four-legged), ~1.1 m at the shoulder; sliders size, leg length, tail, smoke, core glow;
    resistances physical −95%, fire/lunar/light ×2, dark/shadow immune; idle: breathing, looking round, tail coiling.
- **monster-lab.html**: pick a monster, its card (classification, hazard and rank, activity, resistances, lore),
  sliders that rebuild the body live, idle motion, bones, night/day, turntable; drag to orbit, wheel to zoom.

### Umbrafiend kind: style (25-Oct)

Everything in the Umbrafiend category — the Umbrafiend itself, the Nocturian bat, and whatever joins them — is made of
darkness and smoke: energy beings, so their features meld rather than being built from hard parts.
- **Limbs thin into smoke:** a chain's `fade: [from, to]` makes the body solid up to `from` (share of its length)
  and gone by `to`; where it thins, the edge frays and moves, and the smoke shells puff out further. Umbrafiend legs
  dissolve from the knee down, the tail from a third along, horn tips; the bat's legs, tail, ear and finger tips.
- **Eyes deep, glowing black:** black orbs with a halo of darkness (a normal-blended black glow) and the faintest
  violet edge (`voidEyes`).
- **A fin of smoke** along the Umbrafiend's back, haunches to neck, in place of spikes (a web with `solid: 'fin'`:
  solid at the spine, smoke at the top edge; rail points can carry offsets).
- **Smoke wings:** the bat's membranes are smoke between its finger bones (`solid: 'membrane'`): solid along the bones,
  wispy and moving between them. No fangs or claws — the shape is the creature.
- Smoother bodies (more sides and rings per bone); wisps sized and risen per creature (`wispSize`, `wispRise`).
- **Bony frame (25-Oct, the bat's look for the whole kind):** an undead, skeletal build — thin dark bones with smoke
  stretched between them. The Umbrafiend: a long skull and jaw, a spine of thin vertebrae, four ribs a side with smoke
  between them (and back along the flank to the hip) and the core glowing inside the cage, shoulder blades and pelvis,
  thin jointed legs whose paws dissolve, a thin tail fading at the tip, and its fin is now smoke stretched between
  five spines of the back, like the bat's wing between its fingers.
- **Aura body (25-Oct):** the fin and the smoke between the ribs are gone. Where the Umbrafiend's flesh would be, a
  purple aura: a cloud in the shape of its body (`chain.aura` radii round the same bones, `auraFade` for limbs) — a
  deep violet haze densest where you look into it, soft at the edges and rolling upward, and a faint glow round it;
  the dark skeleton and the core show through.

## Part 2 — built (25-Oct): movement and moves

- **src/rpg/creatureMotion.js** `createMotion(C, M)` → `update(dt, { speed })`, `play(name, { loop })`, `stop()`,
  `action`, `root` (the root-motion offset this frame, for the game to move the creature by). Layers each frame:
  rest → idle life (`M.idle(C, t, { moving })`, damped while moving) → locomotion → the move's rotations (added) →
  legs planted by two-bone IK (knees bend forward, paws keep their rest angle to the ground), blended with the move's
  own leg pose by its `ik` / `ikLegs` weights.
- **Four legs** (`M.gait`: stride, trotAt, lift, crouch, lean, headLow, legs with walk/trot phases): a lateral walk
  (one foot at a time) that blends into a trot as speed rises; each foot plants and holds still while the body passes
  over it, then swings forward with a lift; the body lowers and bobs, the spine sways, the head drops, the tail swings.
- **Wings** (`M.flight`: beat, slow, amp, cruise, pitch, fingers): hovering beats; flying forward the beats slow and
  deepen, the body pitches nose-down and the legs trail. A move's `flap` (0..1) folds or holds the wings.
- **Moves** (`M.moves`): `{ dur, hit: [from, to], hitbox: [bones], keepRoot, keys: [{ t, rot: { bone: [x, y, z] },
  root: [x, y, z, pitch], ik, ikLegs, flap }] }` — rotations added to bones, root motion moves and pitches the body,
  `keepRoot` ends where it went. `hit` / `hitbox` are for part 3 (combat).
  - Umbrafiend: **bite** (rear back, lunge, snap), **claw** (left forepaw raised and raked down), **pounce** (crouch,
    spring 2.2 m legs tucked, land), **sink** (melts down through the floor), **rise** (up out of it).
  - Nocturian bat: **swoop** (climb, fold the wings, dive, snap at the bottom, beat back up), **bite** (hovering
    lunge), **screech** (head back, jaws wide, wings thrown up and held — the daze).
- **Monster lab:** a Speed slider (walk → trot; hover → fly), a button per move, loop, and "show root motion"; the
  ground slides under it while it moves in place.

### Part 2 fixes and additions (25-Oct)

- **Root motion that stays:** a `keepRoot` move (the pounce) commits where it went when it ends (`mo.onCommit(dx, dz)`
  — the game moves the creature, the lab moves it and the camera follows); no more snapping back. `then` chains a
  move straight into the next (sink → rise, which starts underground: a key at t 0 means it starts there).
- **Claw → a tiger's swipe, exaggerated:** it rears up on its hind legs with the left forepaw thrown high and wide,
  then drops and twists into a huge raking sweep across its front, lunging forward 0.4 m.
- **Shadow bullet (Umbrafiend special):** head lifts, jaws open, a ball of dark energy (black heart, violet rim, rolling
  noise) gathers in its mouth over ~0.8 s, then fires straight ahead at 11 m/s and the head jerks back. `fx: [{ kind:
  'orb', bone, from, fire, size, speed }]`; firing calls `mo.onEvent('fire', { pos, dir, speed, kind })` for combat.
- **Bat: swoop and bite are one move** — it dives with its jaws already open and bites as it strikes, then beats back
  up (the separate hovering bite is gone).
- **Bat: erratic flight** (`flight.erratic: [x, y, z]` metres): like a real bat it darts to a new spot every 0.35–1.1 s
  on a springy path, banking and pitching into each dart; held still during a dive.
- **Bat: screech aura:** a swell of darkness out to 6 m from its head (`fx: [{ kind: 'aura', ... }]`), with
  `effect: { hearing: 0.5, sight: 0.1, seconds: 8 }` — whatever it washes over hears half as well and sees a tenth as
  far for 8 s. `mo.onEvent('aura', { pos, radius, effect })` hands it to the game (part 3/4: on the player, muffled
  sound and a closing darkness; on enemies, their hearing and sight ranges).

## Part 3 — built (25-Oct): combat

- **src/game/monsterActors.js** `createMonsterActors(THREE, scene, { shapes, floatText })` → `spawn(id, { x, y, z, yaw,
  rank, params })`, `targets` (joined to the player's weapons and spells in play.js), `update(dt, player, hooks)`.
  The **F8 panel** has "Spawn in front of you: Umbrafiend / Nocturian bat"; `eldermerePlay.monsters` for tests.
- **Ranks scale them:** `RANK_K` Wood 1, Bronze 1.8, Silver 3, Gold 5, Crystal 8 — health and damage ×k, poise ×√k;
  a spawn without a rank takes the creature's lowest (Umbrafiend Bronze, bat Wood).
- **Stats** per monster (`stats`: hp, poise, speed, aggro, radius, height) and per move (damage, power — how hard it is
  to block —, reach round its hitbox bones, range it's chosen at, cooldown, type).
- **Damage types:** a blow's `info.type` (weapons: slash / pierce / blunt / crush; spells by their kind → fire, frost,
  lunar, light, dark…) × the monster's `resist` (0 = immune: "Immune" in grey; resisted numbers lilac, weaknesses gold).
- **Hit zones:** combat sends where the blow lands (`info.aim`: ahead of you at the move's height — the hamstring cut
  low, overheads high); the zone with the nearest bone takes it × its multiplier. Umbrafiend: core 2.5× (inside the
  ribs), head 1.4×, body 1×, legs 0.7×, tail 0.5×. Bat: head 1.5×, body 1×, wings 0.6×.
- **Poise:** each blow takes `stagger × 10` (× its resistance, at least a quarter; +3 for a perfect hit); it steadies
  12% of its poise a second. At zero: **staggered** (open), poise back to full. Stuns hold the stagger; knockdowns
  tip it flat; launches throw it up (REACTIONS in src/rpg/creatureMotion.js — root now has roll: [x, y, z, pitch,
  roll]). Slows, bleeds and small knockback away from the blow too. At zero health it's **slain**: the smoke thins,
  it sinks and fades.
- **Its attacks:** during a move's hit window its hitbox bones strike you if within `reach` (+ your body). Blockable
  (`combat.tryBlock` — your guard's damage and stamina rules): a **perfect block** knocks half its poise off and
  makes it recoil; a **deflect** staggers it for the deflect's time; what gets past the guard still hurts.
  **Lunges** (`lunge: { travel, stop, min, max }`): the swoop and the pounce stretch their root motion to arrive where
  you are.
- **Shadow bullets** are handed over at the moment they fire and fly as projectiles: walls stop them, they hit you
  (blockable), dark damage.
- **Screech:** inside the aura you're blinded and muffled for 8 s — the fog closes to a tenth of its distance and
  darkens, a dark vignette, and sound drops to half with a muffling filter (`debuff` in play.js, `audio.muffle`).
- **The brain (stand-in until part 4):** notices you by sight within its aggro range, turns to face you, closes in
  (the bat hangs back about 3 m), picks a move whose range fits and whose cooldown is ready, walks home after losing
  you for 6 s. Monsters pause with the game.

### Part 3 fixes (27-Oct, z46): swoop, sounds, performance

- **Bat swoop passes through:** `keepRoot` with the last key at ground level ~3.3 m on (stretched by the lunge reach),
  so it dives, bites and carries on past you, then turns for another pass — no snap back to where it started.
- **Sounds** (src/game/audio.js `monster(name, gain, pan)`, all made in code): each monster has a `voice` (bat: wing
  beats on each downstroke, hurt squeak, death; fiend: soft footfalls, a growl now and then in a fight, hurt, death)
  and each move lists its own `sfx: [[u, name]]` (swoop whoosh + bite snap, screech, fiend bite/claw/pounce + landing,
  shadow bullet charge hum + fire + impact, sink/rise rumble). Loudness falls with distance; pan follows the camera.
- **Performance** (one creature was costing ~100 fps): the shade's noise is a small tiling texture instead of maths per
  pixel; the shade body is opaque (cut-out edges); one smoke shell and one aura layer instead of several; the smoke,
  aura and webs skip the puddle reflections; 70 wisps (was 160) read straight from the bone matrices; the leg IK updates
  matrices once per frame, not once per leg; the health bar redraws only when health changes; ground height only
  when it moves; line of sight four times a second.

### Performance pass 2 (27-Oct, z47): built to run 50+
- One bat was 22 objects (14 skinned meshes) and ~70 draws a frame, never culled off screen. Now:
  - the smoke shells, aura meshes and wisps are gone: a shade's smoke is particles (docs/PARTICLES.md), one draw for
    every monster on the map. The Umbrafiend's body is a dense purple cloud again.
  - wing membranes of one kind are merged into one mesh (bat: 2 skinned meshes, was 14).
  - creatures are culled off screen (bounds grown for their moves); parts don't go in the puddle mirror.
  - skeletons are posed and their matrices worked out once a frame (`C.sync()`), not again by each render pass.
  - detail by distance (monsterActors): near and on screen every frame; further every 2nd frame; off screen or far
    every 4th, with no foot IK; past 110 m not drawn. Ticks staggered across monsters.
  - the rest-pose reset writes bone fields directly (it was a sixth of a monster's frame); walls checked a few times
    a second.
- Test: 50 monsters crowding the player, all fighting: ~4 ms CPU a frame here (idle 2.7 ms); particles 0.5 ms.

### Budgets and detail tiers (27-Oct, z49)
**Groups** (`group` in src/data/monsters.js) set what a creature may cost:
- **swarm** — 20–30 engaged at once at no visible cost (Nocturian bat). Uses the cheap look (`look.cheap`): solid
  cut-out wings (no blending, no overdraw), a third of the smoke, no halo sprites.
- **pack** — 5–10 at once (Umbrafiend). **pair** — 2–4. **solo** — can be richer, usually alongside others.
  **boss** — solo or duo; summons designed case by case.

**Detail tiers** (monsterActors, every frame):
- 0 — engaged and close, or mid-attack: full animation every frame, feet placed, attacks checked.
- 1 — on screen within 35 m: animated every 2nd frame (feet only within 15 m), 60% smoke.
- 2 — on screen, 35–80 m: animated every 6th frame, no feet, a trickle of smoke.
- 3 — asleep: off screen or past 80 m. Not drawn, not animated, no smoke (the particle body is skipped), no sounds;
  its brain runs only while hunting or heading home, otherwise twice a second. A move already started still finishes.
- Health bars only while fighting within 30 m. Ground/sight/wall checks use nearby shapes only (play.js grid).
- Geometry is built once per distinct spec and shared (20 bats = one set of buffers; later spawns are nearly free).
- A flyer's dive is held 0.4 m above the ground under it (no more bats through the terrain).
- Measured here: 50 idle monsters far away 0.12 ms a frame in total; 25 bats engaged around you 1.4 ms; particles
  0.16 ms.

### In the creator (27-Oct, z50) — Part A of swarms
- Object mode's Enemies tab now has the groups: **Swarm** (Nocturian bats) and **Pack** (Umbrafiends); the old
  placeholder archetypes are gone. Old maps' enemies become a Pack (placement and patrol kept). A placed group
  spawns `count` monsters round its spot; its stats (health, speed, vision, damage) scale the monster's own.
- The **Player start** object now starts you there (facing its way; its spot is your first checkpoint).
- Shadow bullets aim at you, up or down a slope (within 60° of where it faces). Screech sight ×0.05 (was ×0.1).
- Umbrafiend smoke 60% as many puffs, each denser (overdraw with 8 up close); leg IK reads matrices directly.
- Next (Part B): swarm behaviour — circling, erratic, then swoops; patrols; starting high and diving on sight with a
  downward vision cone; regrouping when they lose you. Umbrafiend landing on slopes and stairs (body follows the
  ground, legs reach it).

### Part B (27-Oct, z51): group brains, swarms, joining, slopes
- **The far-away cost** was the scene graph: every monster's ~100 bones stayed in the scene, and three.js walks all
  of them in every render pass (main view, mirror, cover...) whether drawn or not. Now a monster that isn't drawn is
  taken out of the scene entirely. Only monsters within 40 m are handed to your weapons and spells each frame.
  Drawn within 55 m (was 80). Groups more than 70 m away that aren't hunting you sleep: no members updated at all.
  Test: 300 monsters in 30 groups far away — 0.03 ms a frame in total.
- **Group brains** (monsterActors): one brain per placed swarm or pack (a lone spawn is a group of one): sight, state
  (idle / patrol / fight / return), route and attack timing are worked out once for the group; members only do their
  own place in it. Hit one and the whole group comes.
- **Swarms** (bats): roost high (`roost`, 4.5 m over hover) circling slowly; their sight looks down and round them,
  not up; on seeing you they pour down and circle you as one mass at 3–6 m, the ring swinging the other way every
  second or two; the group sends members in to swoop one at a time (up to 3 at once in a big swarm), and one may
  screech. Lost you for 6 s → back to the route (or home), gathering, then roosting/patrolling again.
- **Packs** (Umbrafiends): follow their route in loose formation; in a fight spread round you on the way in, then
  close and choose moves.
- **Patrols**: the creator's route (loop or there-and-back) and Wander are used; the group waits for stragglers.
- **Joining**: two groups of the same monster (swarms within 8 m, packs within 6 m) that meet while awake become one
  group — one brain, its route kept. (Two idle patrols crossing keep their own routes.)
- **Slopes**: four-legged monsters tilt to the ground (front and back sampled), and a leap lands on the ground where
  it comes down — the arc bends up a hill or a stair, or down into a dip.
- **Creator**: middle-click an object (without dragging) to copy it — type, facing, all its settings, not its route —
  and click to place copies; in Layout mode middle-click picks the piece. Middle-drag still pans. New swarms default to
  8 monsters, packs to 3.

### z52
- Health bars: only the 5 nearest monsters fighting you show one.
- A flyer (bat) whose swoop hits a raised guard (shield or weapon) bounces off ~1 m and hangs stunned for 1 s
  (1.4 s on a perfect block or deflect): the opening for a counter. It stays where the dive had it.
- Swarm attack rate grows with its size: about every 0.6 s for 8 bats, 0.3 s for 24, up to 1 + size/5 diving at once
  (only divers count, not stunned ones). Test: 24 bats, ~22 swoops in 10 s, every one blocked and bounced.

### z53 — swarm towers
- A swarm in a fight stacks into layers of 20: the bottom layer circles low and does all the attacking; each layer
  above wheels higher (≈2.4 m + 2 m a layer) and a little wider, alternate layers turning opposite ways — a circling
  tower. As bottom bats die, the next ones drop down to take their places (layers are recounted every frame).
- The attack rate is still the whole swarm's (bigger = faster), carried by the bottom layer: each of its bats comes
  round faster (cooldown ÷ swarm size/20), up to 1 + size/5 diving at once (max 8). Screeches only from the bottom.
- Detail: layer 1 animates at most every 2nd frame, layer 2+ every 6th with a trickle of smoke.
- Test: 60 bats → 20 low (~0.6 m), 20 at ~4.5 m, 20 at ~6.3 m; ~51 swoops in 10 s, all from the bottom layer.
- (z53b) The tower is the bat's own (`tower: { layer: 20 }` in its data), not every swarm's: a swarm without it (rats
  later) keeps one layer. Each swarm creature gets its own behaviour when it's made.

### z54 — the tower, tuned for 300
- Layers pack closer the more there are (gap = min(2 m, 9.6 m ÷ layers)), so the whole tower stays within ~12 m up
  where you can see it, widening as it rises (a funnel). 300 bats: 15 layers from ~0.6 m to ~11.8 m.
- Detail by layer: the bottom two full, the next two one step down (every 2nd frame), the rest two steps (every 6th).
- Cost: 300 bats fighting went from 27 ms to 4.8 ms of logic a frame here. Flyers re-check the ground only every
  1.5 m moved (upper layers not at all); the diving count is worked out once per swarm, not by every bat; hot checks
  use the motion's move name (`mo.actName`) instead of building the action object each time.

### z55 — three bands instead of a growing tower
- A bat swarm (`tower: { attack: 20, circle: 20, show: 60 }`) fights in three bands, never more:
  1. **Attacking** (20, low, 0.2–1.5 m): the only band with a brain — circling, swooping, screeching.
  2. **Circling** (20, ~3.6 m, ~6 m out): for show, turning with the swarm.
  3. **Reserve** (the rest, ~6.5 m, ~9 m out, turning the other way): for show; only 60 of them are drawn.
- When attackers fall, the next bats drop down a band and take their places. Bands 2–3 have no AI, no ground checks,
  no attacks; band 2 animates every 2nd frame, band 3 every 6th.
- Test: 300 bats → 20 / 20 / 260 at 0.5 / 3.5 / 6.5 m; 2.5 ms of logic a frame here (was 4.8).

### z56
- Only a swarm's attacking band gives off smoke; the circling and reserve bands none (300 bats: ~18 smoking).
- Bats flung metres away and back: the bat's darting spring was integrated in one big step when a bat was animated
  every few frames, and it blew up. Now in 1/60 s steps. Also a monster coming into view is placed at once, not drawn
  for a few frames where it was when it went out of sight.
- (Combat) a dodge roll no longer sheathes your weapons.

### z58 — Umbrafiends hunt like ambush predators
- **Posts, not a stampede:** in a fight each pack member takes a post round you — its share of the circle, 5–9 m
  out — runs to it, then prowls and watches you, shifting to a new post every 2–4.5 s.
- **Attack turns:** the pack sends the nearest free member in, one at a time (up to 3 for a big pack), more often the
  bigger it is; it closes fast and leaps, claws or bites. The rest hold their posts; now and then one spits a shadow
  bullet from its post (the pack takes turns at that too). An attacker that can't land its strike in 3.5 s goes back.
- **Keeping apart:** not physics — a few times a second each steers its target off any packmate within 1.8 m. Test:
  6 fiends, never closer than 1.5 m once spread out.
- **Faster:** speed 5.6 m/s (was 4); shadow bullets fly at 19 m/s (was 11) and charge in 0.74 s (was 1).
- **Leaping claw:** springs in from 1.4–4.2 m and rakes as it lands (it stays where it lands). Blocking it stuns the
  fiend for 1.3 s (1.8 s on a perfect block). Any leap cut short by a reaction now stays where it got to.
- **Detail:** the 8 nearest of a fighting pack get full detail (and any attacking), the next 8 a step down, the rest
  two; legs only placed while moving or attacking. Test: 60 fiends in a fight, 4 ms of logic a frame here.

### z59 — walkers move with weight
- Four-legged monsters only move the way they face: they turn into a new direction (a sharp turn slows them, at a run
  they turn wide, standing they spin on the spot), build up speed and shed it with momentum, and ease off arriving.
  No more strafing backwards away from you — to go the other way they stop, wheel round and run, which is when you
  catch them. At a post they stop first, then turn to watch you. (Test: 0% of their movement sideways or backwards.)
- Bats keep their free darting flight.

### z60 — walkers respect walls
- Walkers are kept out of walls, trees and crates (the same push-out the player uses, against the shapes within
  2.5 m, fetched a few times a second). Walking into something, they pick a way round — a few directions either side,
  the first clear one, held for a moment; barely getting anywhere for 1.5 s, they give up on that spot and pick
  another.
- Posts are chosen where you can see them from where you stand (not inside a house or behind a tree).
- Leaps (pounce, leaping claw) are shortened — or not taken — when the landing is behind a wall; after any leap the
  body is pushed out of whatever it landed in.
- The ground and slope under a walker are read from the shapes it already has round it: 60 fiends fighting went from
  ~5 ms to ~1.8 ms of logic a frame here.

## Creature workshop (27-Oct, z62) — make monsters without code
- In the Monster lab (monster-lab.html; the creator's top bar has a **Creature workshop** link): **Edit a copy of this
  monster**, then:
  - **Limbs**: pick a limb from the list or click a joint on the body; move the joint (across / up / forward), set its
    width and height, give it an aura (smoky flesh, on shade bodies) or a smoky tip, change its colour.
  - **Add a limb** from any joint — horns, extra legs, tails, spines, wings' spars — on both sides or one; add or
    remove joints on new limbs; remove new limbs (the base monster's own limbs can be reshaped, not removed: its
    attacks and walking use them).
  - **Parts**: spheres, horns/spikes (length and direction), glows (and dark "void" glows for eyes), on any joint.
  - **Look**: smoke amount and the shade colours (body, rim, smoke, aura, aura glow). **Stats**: health, speed, sight.
  - **Save** (this browser), **Export / Import** (.json, to share or back up), **Delete**.
- A workshop creature keeps its base's behaviour, moves and voice (bat → a Swarm flyer; Umbrafiend → a Pack prowler)
  and appears in the creator's Enemies tab under that group, and in the game.
- Saved creatures live in the browser (localStorage `eldermere.creatures`): a map that uses one needs it saved in the
  browser that plays it. (Later: carry a map's custom creatures inside the map file.)
- Next for the workshop: drag joints in 3D, webs (wing membranes) between limbs, more base behaviours as monsters are
  added, and the Building workshop (a block modeller for buildings and props).

### Workshop part 2 (z63) — new monsters from genus silhouettes
- **New monster from a silhouette** (Workshop → choose a genus → Start): 30 featureless default forms you can tell
  apart in silhouette (src/data/genera.js): canine, feline, cervine/equine, boar, bear, rodent, humanoid, goblinoid,
  giant, ape, bird, bat, dragon, wyvern, serpent, lizard, crocodilian, tortoise, frog, fish, eel, spider, insect,
  scorpion, centipede, crab, octopus/squid, slime, worm, wraith. Reshape, add and remove any limbs and joints.
- **Labels for every limb and joint**: a label (what it is) and a role (spine, neck, head, jaw, tail, leg, arm, wing,
  fin, tentacle, horn, ear, antenna, other) per limb, and a name per joint (knee, claw tip...). They're saved in the
  creature's file (`chains[].label`, `.role`, `.joints[]`) so a body read later says what each bone is.
- **Identity**: comes as (swarm / pack / pair / solo / boss), moves by (walk / fly / float / slither / swim, hover
  height), classification type and order, hazard, rank range, activity, sounds (beast / flyer / silent), lore notes.
  **Resistances** per damage type (× damage; 0 immune, 2 weak). **Material**: per-limb colour, underside colour,
  facets; roughness and web glow, or a shade body (darkness and smoke). **Stats**: health, speed, sight.
- **No hand animation needed**: walking comes from limbs with role *leg* (feet placed on the ground, gait phases
  worked out), flying from a wing limb named *arm* (bird, bat, dragon genera have it), attacks are generic moves —
  bite and lunge (walkers), swoop (flyers) — using body motion and the head / neck / jaw where present.
- In the game they join the creator's Enemies tab (swarm flyers under Swarm; everything else under Pack for now —
  separate Pair / Solo / Boss tabs to come) and use the pack AI (posts, attack turns), or the swarm AI for flyers.
- Known rough edges: the many-legged silhouettes' feet are placed by the same IK as four-legged ones (knees bend
  forward, so spider legs bunch forward when walking); slither / swim / float have no special motion yet (they glide).

### Workshop part 3 (z65) — faster editing
- **Undo / Redo** (buttons, Ctrl+Z / Ctrl+Y or Ctrl+Shift+Z): every change, a slider drag counting as one.
- **Whole-limb tools** (the limbs and parts growing from it come along): Thicker / Thinner, Longer / Shorter (from
  its first joint), nudge ← → ↑ ↓ fwd back, Duplicate (placed a little behind), and **both sides** on/off.
- **Whole body bigger / smaller** (joints, sizes, parts, hover).
- **Copy creature brief**: a plain-text description — identity, classification, resistances, stats, look, every limb
  with its role, label, parent, colour and each joint's name, position and size, the parts and membranes — copied to
  the clipboard. Paste it to Claude to have a creature worked on, or keep it as notes. (Export still gives the .json.)
- Legs splayed out sideways (spiders, insects, crabs) now bend their knees up and out when walking, not forward.

### The Nyluth — the first creature made with the workshop system (z66)
- **Nyluth** (Eldermere Chronicles ch. 3) from the canine silhouette: a lean, long-legged wolf-like hunter (~0.8 m at
  the shoulder), deep chest and tucked waist, long neck carried low, long narrow muzzle with a big jaw and fangs, tall
  pointed ears, a bushy low tail, dark brown-grey fur with a paler underside and a darker ruff, **glowing pale green
  eyes**. Pack (posts round you, attack turns), Essence Tiers / Wild Essence, Menace, Wood, activity Lunar; sounds:
  **chirper** — bird-like chirps and trills while the pack circles ("not birds"), a yelp when hurt, a howl when it
  falls. Weak to light ×1.6 and lunar ×1.3 (its light-sensitive eyes). Health 34, fast (6.2 m/s), sight 16 m.
- **Alpha nyluth** (a variant): ×1.75 size (~1.3 m at the shoulder, ears near 1.9 m), ×3 health, ×1.8 damage,
  ×1.15 speed, Bronze; its leap reaches and travels further with its size.
- **What the workshop couldn't do, now built:**
  - **Built-in creature library** (src/data/creatures.js): creatures in the workshop's own export format shipped with
    the game, so every browser has them. Made in the workshop → Export → pasted there (or written by Claude in that
    format). They appear in the lab, the F8 spawn list (now lists every monster) and the creator's Enemies tab.
  - **Variants**: `variants: [{ id, name, scale, stats ×, damage ×, rank, hazard, note }]` — the same creature at
    another size and strength, each its own monster (`nyluth_alpha`), moves scaled to the body.
  - **Chirper voice** (audio.js `nylChirp`, `nylYelp`, `nylHowl`), selectable in the workshop.
  - The workshop opens built-ins and variants as copies ("Edit a copy (built-in)") to save as your own.
  - Fixed for every creature: limb, part and membrane colours were read in the wrong colour space and came out
    washed-out pale — they now show as picked.
- Not yet: real fur (it's smooth-shaded colour), shying away from light in its behaviour, the alpha's retreat howl
  calling the pack off.

### z67 — fur, better canine heads, no more twisted joints
- **Twisted / pinched joints fixed** (every creature): the rings that make a limb's surface were oriented afresh at
  each ring, and flipped wherever a limb bent back on itself (a hock, a knee) — a candy-wrapper twist. They're now
  carried along the chain (parallel transport), so the surface follows the bone without flipping.
- **Fur** (`look.fur: { length, density, shells, tip, tipMix }`; workshop Look → fur, with length, density, layers,
  tip colour, tip lightening): shells of the skin pushed out along its normals, cutting away all but the strands that
  reach each layer — fat at the root, fine at the tip, lighter at the ends. Cut out, not blended; shown only up close
  (detail tiers 0–1). The Nyluth has it.
- **Canine heads** (all four-legged silhouettes): back of skull, brow (widest), stop (where the muzzle starts), nose;
  a three-joint jaw (hinge, middle, chin); flat triangular ears set on the back of the skull; a nose. The Nyluth's
  head redone the same way (long narrow muzzle, glowing eyes set at the brow).

### z68 — edit in place
- The workshop opens any monster two ways: **Edit this monster** (saving writes back to it) or **Edit a copy** (saves
  as a new creature). Your own creatures save over themselves. The game's own monsters (the Nocturian bat, the
  Umbrafiend) and built-ins (the Nyluth and its alpha) save as an **override in this browser** that takes their place
  everywhere — the lab, the creator, the game — with **Revert to the original** to drop it. Export an override to make
  it permanent (pasted into src/data/creatures.js, or handed to Claude).

### z69 — level chart
- Workshop (right panel) → **Level chart**: a creature's health, damage (× its moves' damage), speed, poise, sight
  and armour at every level 1–100.
  - **Auto-generated**: each stat's level-1 value and growth % — *growing* (× a level, the default: health ×80 by
    level 100, damage ×30) or *steady* (+ a level).
  - **Set by hand**: pick a level (slider, or click the chart) and type in the "at level" column; that level is exact
    and the curve bends to pass through it (level 1 stays the base; between hand-set levels the ratio to the curve
    eases from one to the next; past the last it keeps that ratio). Hand-set levels show as dots; ✕ clears one.
  - The chart draws the chosen stat over 1–100 with the current level marked.
- In the game a placed monster with a level chart takes its numbers from the creator's **Level** field (instead of
  the rank's scaling). Armour takes a tenth of its value off every blow. Saved with the creature (`levels` in its
  record) and in its brief / export.
- (z70) **Combat exp** on the level chart: what killing it gives your character level. It follows the character's
  own level curve (level^1.5, `xpToNext` in src/rpg/stats.js), so the same number of same-level kills earns a level
  at 1 as at 80 — the default (health × 0.35 at level 1) is about 8 same-level kills a level; its growth % adds on
  top; hand-set levels work as for the other stats. Monsters without a chart give health × 0.35 × rank. Killing a
  monster now awards it (`awardCombatXp`, source 'kill'): "+N exp" over it, and "Level up!" with the points to spend.

## z71 — the Yuribor and skinning (first harvestable animal)
- **Yuribor** ("Great Plains Walker") is in the built-in library (`src/data/creatures.js`), made from the boar genus: a humped back, big curved horns and a shaggy fur coat. It lives in packs, its temper is `passive` and its danger is Safe. All magic resistances are 0.15 (the horns nullify magic, though for now that is only resistances and not an aura).
- **Passive temper** (monsterActors): it ignores sight. Hitting it makes the whole group flee for about 7 s at 1.25× speed. When it stands idle it wanders.
- **Corpses**: a monster with a `harvest` block doesn't vanish when it dies. It rolls onto its side and stays until it's harvested or you go past view range (VIS+10). The API is `monsters.corpses()` / `monsters.harvested(A)`.
- **Skinning** (`src/game/harvest.js`): walk up to the body.
  - **Tap E (manual)**: a knife appears in the right hand, sawing, and Dead-by-Daylight style skill checks run until the job is done. Hit the marked arc; the bright core is a "great" hit. A miss costs 0.6 s of progress. At low skill the checks come often, the needle is fast and the arc is thin.
  - **Hold E (auto)**: no checks and 30% slower. The result comes from Skinning rank plus some luck.
  - Your hit ratio, or for auto your skill, sets both how many items you get (between the yield range's min and max) and a quality bonus. Items go into the inventory as `yuribor.hide` / `yuribor.meat`, with quality hidden until appraised. Walking away cancels.
- To make a harvestable creature, give its record `harvest: { creature, yields: { part: [min,max] }, time }` and add the creature with those parts to `CREATURES` in `src/data/materials.js`.

## z72 — harvest stages, Space checks, material cards
- A `harvest` block can now have stages: `harvest: { creature, stages: [{ id, verb, skill, tool: 'skin'|'butcher', yields: { part: [min,max] }, time }] }`. Finishing a stage moves the body to the next one, and after the last stage the body is gone. The Yuribor has two: skin (hide 1–2, Skinning) and butcher (meat 6–12, horn 0–2, the new **Butchering** skill). Records using the older `{ yields, time }` form still work as a single skinning stage.
- Every stage plays the same minigame. Skill checks are on **Space**, and jumping is locked while you work. A miss no longer costs progress, but missing every check is a total failure and gives nothing. Each stage uses its own knife: the curved skinner or the broad butcher knife (`butcherKnife` item added).
- The HUD (ring and progress bar) only shows while you're working.
- Harvested materials come in with their quality known. Hovering a material stack in the pack shows a card listing each quality held (0–100 in steps of 10, with its name) and how many of each. All qualities share one slot.
- **z73 balance changes:**
  - **Score:** each job gets a score from 0 to 1. Manual uses your hit ratio, auto uses 0.1 + 0.4·rank + luck. On top of that: +0.12·rank (skill), + perks (`character.perks[skill]`, a placeholder for skill-tree nodes), + 0.08·(Finesse−100)/100, + 0.03·(Luck−100)/100.
  - **Quantity:** lerped across the yield range by the score, with random rounding. Auto always gives at least 1 of each part.
  - **Quality bonus:** (score−0.55)·40.
  - **Ranges:** the Yuribor's hide is now 1–3 and meat 3–12.
  - **Training:** the skill trains once per job, not per piece: 0.12–0.24 for manual, 0.1 for auto, about 4–8 points a job at 100. A little Finesse comes with it. Skinning and Butchering are now both governed by Finesse.

## z74 — skill from checks, and the Bestiary
- **Skill gain per check:** each good hit gives 0.03 of training and each great hit 0.05. Misses give nothing. An auto job counts as three good hits (0.09). A small amount of Finesse comes with each.
- **Bestiary** (journal tab; `src/rpg/bestiary.js`, saved in `character.bestiary`):
  - **Unlocking a page:** killing a creature unlocks its page and records the level and health you met it at. It goes through the monster hooks `killed` / `struck` in play.js; for fishing, call `learnKill` when you catch one.
  - **Resistances:** hitting it with a damage type reveals how it takes that type. Types you haven't used show ???.
  - **Harvest drops:** doing a harvest stage reveals that stage's maximum drops.
- **Left page:** a selector and arrows, then name, classification, lore, encounters (slain, levels met, health met), nature (rank, activity, group, speed, sight), resistances and harvest.
- **Right page:** the creature's model in its own lit scene, slowly turning and draggable, with a disabled "Regions encountered" button that waits for the map.
