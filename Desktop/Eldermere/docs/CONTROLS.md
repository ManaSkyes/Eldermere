# Player controller and test grounds

From the character screen, **Enter the test grounds** opens a field of labeled obstacles for testing
movement. Click to capture the mouse; Escape pauses. Leaving saves the character, since sprinting
and jumping train Athletics.

| File | What it does |
|---|---|
| `src/game/input.js` | actions, rebindable keys, mouse look, settings |
| `src/game/physics.js` | the body (a capsule) against boxes and ramps |
| `src/game/controller.js` | first-person movement, from the character's stats |
| `src/game/testGrounds.js` | the test field |
| `src/game/play.js` | the play screen: scene, HUD, pause menu, controls menu |

## Controls (all rebindable, two keys per action)

| Action | Default |
|---|---|
| Move | W A S D, or the arrow keys |
| Jump | Space |
| Sprint | Left Shift (hold, or toggle in settings) |
| Crouch | Left Ctrl or C (hold, or toggle) |
| Sit / stand | X (moving or jumping also stands you up) |
| Dodge roll | Left Alt (needs the Dodge roll node) |
| Walk slowly | Caps Lock |
| Third-person view | M (toggle), or the mouse wheel: scroll out from first person to a camera 1.4–7 m behind you, all the way in for first person |
| Vanish | V (crouching; needs the Vanish node) |
| Back to checkpoint | T (on the obstacle course) |
| Reset your pose (a body stuck in a twist: drops its action, bones back to rest, hair/cape restarted) | K |
| Spell wheel | Q (hold, move the mouse toward a spell, let go to ready it) |
| Cast the readied spell | mouse buttons, by what's in your hands (see Fire magic) |
| Ready the next prepared spell | Z |
| Cast a spell from the hotbar | hold its number (spoken) |
| Attack | Left mouse |
| Block / aim | Right mouse |
| Interact | E |
| Draw / sheathe | R |
| Inventory (pack) | Tab or I |
| Hotbar | 1–9 |

Escape always releases the mouse in a browser, so it's the pause key and can't be rebound.
Settings: mouse sensitivity, field of view, head bob (0–2, default a faint 1), fullscreen, invert Y,
and toggle crouch and sprint. Key bindings and settings are saved in the browser.

**Browser shortcuts:** an ordinary web page can't block Ctrl+W, Ctrl+T or Ctrl+N, so crouch-walking
with Ctrl+W would close the tab. To keep those keys:
- **Fullscreen (on by default):** clicking to play goes fullscreen and claims every letter, digit and
  modifier key with the browser's Keyboard Lock API, so Ctrl+W crouch-walks. This works in Chrome and
  Edge; Firefox and Safari don't offer it. Escape still pauses (and leaves fullscreen); fullscreen
  ends when you leave the test grounds.
- **In a window:** the game blocks every shortcut the browser lets it (Ctrl+S, Ctrl+D, Alt menus),
  and closing the page asks "Leave site?" first, so a stray Ctrl+W can be cancelled. C also crouches.
- Alt+F4 always belongs to the operating system. Packaging the game as a desktop app later
  (Electron or Tauri, with the same code) removes every limit.

## The character book (Tab or I)

A leather journal with five ribbon tabs (`src/ui/book.js`). Tab, I or Esc closes it.

| Tab | Shows |
|---|---|
| Character | equipment slots (left), your character in a framed box (right; drag to turn), and the pack below |
| Body | lineage shares, overall masculine/feminine, build sliders, and each part's lineage mix and masculine/feminine share |
| Attributes | main stats (with limit colors and buttons to assign level points), sub stats (health, mana and stamina show their refill rate, e.g. 123 (+6.2/s)), general skills |
| Skill trees | every skill's tree, grouped; buy nodes with points earned from that skill, reset to refund (`SKILL_TREES.md`). Skill names on other pages link here |
| Life skills | gathering and crafting professions with value, trade title and progress; Trade and reputation (Bartering, and standing with each city and town) |
| Combat | combat level and XP, combat skills, weapon skills, the weapon in hand |
| Magic | MP, focus, casting skills (attunement, incantation, voiceless, mana control and sense), schools, known spells |

- **Equipment:** click a worn item to take it off into the pack; click a wearable item in the pack to
  put it on (whatever it replaces goes to the pack). The body updates at once.
- **The character box** is the game's own 3D render of you, head included, drawn into that part of
  the screen; there's no second 3D view.
- **Pack size** (`src/rpg/carry.js`): 10 slots plus 1 per 20 points of Strength + Endurance, plus 1
  per 100 Athletics past 100. Weight: the pack's 10 kg plus 0.25 × Strength + 0.05 × Endurance,
  scaled a little by Athletics. An average citizen gets 20 slots and 40 kg. Each unique item or
  material stack takes a slot.
- **Overloaded:** past the weight limit you move slower (down to 35% at double the limit), can't
  sprint once a quarter over, and jump lower. The HUD notes it.
- **Starting kit:** carried kits (tool sets) go in the pack on the first visit.
- **Tester's case:** the test potions sit in their own list below the pack, weightless and taking no
  slots (1,020 potions would weigh 300 kg). Click to drink; drag to the hotbar or hover and press
  1–9 to assign. Right-click a hotbar slot to clear it.
- **Hotbar:** nine slots along the bottom of the screen. Press 1–9 to use a slot's item.
- **Saved:** the pack and hotbar are part of the save. The pack uses the inventory system from
  `MATERIALS.md`, so potions stack like any material.

## Transformation potions (test kit)

The test grounds keep twenty of every potion, topped back up each visit. Each changes one feature by 10% of its range.

| Group | Potions | What they change |
|---|---|---|
| Race | an essence for every lineage (18) | every body part 10% toward that lineage; the human essence moves back toward human |
| Body | Tonic of the moon, Tonic of the sun | the whole body 10% more feminine or masculine |
| Parts | feminizing and masculinizing salves for face, neck, chest, torso, waist, hips, arms, hands, legs, feet | one part 10% more feminine or masculine |
| Features | draughts up and down for height, muscle, weight, chest size, proportions | that body slider by 10% |

- **Gradual:** a potion's change plays out over 3 seconds, easing in and out. Drinking another
  mid-change carries on from wherever the body is. Stats update when the change finishes.
- **Stats follow the body.** After a potion, the character's natural values are recalculated from
  the new body. Trained progress is kept, as in `STATS.md`: a 30% feline body raised Finesse
  100 → 110 and Speed 100 → 113 and lowered Strength to 95.
- **Gender** is identity and no potion changes it; the masculine and feminine potions change the
  body.
- **Saved look:** leaving the test grounds saves the new appearance.
- Potions are defined in `src/data/potions.js`, each with an `apply(body)` function, so new ones are
  a few lines each.

## Mirror

A full-length mirror stands a few steps from the start (`src/game/mirror.js`, the standard planar
reflector).
- It shows your whole self, face and hair included. Your head is hidden only for your own
  first-person view's render, then shown again, so hair physics, the mirror and anything else always
  see a normal head.
- Drink a potion in front of it to watch yourself change.

## Health, mana and resting

- **HUD:** health (red), mana (blue) and stamina (gold) bars above the screen's bottom edge; hover a
  bar for its value and rate.
- **Regeneration:** HP, MP and stamina refill on their own (rates in `STATS.md`).
- **Sitting** (X): rest on the ground for 3× regeneration ("Resting" shows under the bars). You
  can't move or jump while seated; moving stands you up. The camera drops to seated eye height.
- **Two sitting poses**, blended by how feminine the body is: masculine sits cross-legged with
  hands toward the knees, feminine sits with knees drawn up together, feet flat in front and hands crossed over the knees.
  Both shift their weight and turn their heads now and then. Bodies in
  between blend the two.
- **Test:** the Draining tonic in the Tester's case halves your HP and MP so you can watch them
  refill.

## Athletics moves

From the Athletics tree (`SKILL_TREES.md`). Every move gets faster as Athletics rises (√(Athletics/100)).

| Move | Rank | How | Cost |
|---|---|---|---|
| Vault | Unskilled (known) | Run at anything waist high or lower (≤ 58% of your height) and jump: over it, or onto it if it's deep | 6 stamina |
| Clamber | Unskilled (known) | Jump at a ledge and **hold jump**: grab anything up to head height above where you jumped from (with room on top) and haul up, slowly. Tap jump instead and you fly past, keeping your momentum | 15 stamina |
| Dodge roll | Apprentice 201 (point, core) | Left Alt: roll the way you're moving, keeping momentum; roll with crouch held to slide | 15 stamina |
| Wall jump | Athletics 300 (point) | In the air beside a wall, **facing away from it** (or along it), jump to kick off; chain between walls to climb a shaft by turning to face the next wall each time. Facing into a wall, jump grabs or runs up instead | 10 stamina |
| Quick climb | Athletics 401 (point; needs Clamber) | Clamber twice as fast, up to 125% of your height, and grab ledges from anywhere in a jump (hold jump) | — |
| Cat's catch | Climber path | Hold jump while falling past a ledge to catch it, or while wall running (or just after) to pull up onto the wall's top. Reaches 1.5× your height above you | — |
| Wall run | Journeyman (point; needs Wall jump) | Sprint alongside a wall and jump: run along it for about a second; jump to leap off. Or run straight at a wall and hold jump: run up it (about 2 m higher than a jump), and grab the top if it's in reach | 10 stamina/s (15 running up) |
| Skywalker | Master, Climber side | Press jump in mid-air for a second jump, once per time off the ground; it turns you toward where you're steering | 12 stamina |

- **Facing rules:** climbing (clamber, quick climb, running up a wall) only works toward what you're
  facing. A wall beside you allows a vault (strafing over something low) or a wall run along it; a wall
  behind you allows nothing but a wall jump off it.
- **Grabbing:** holding jump reaches about 1.1 m straight ahead (where you're facing, or moving if
  that's nearly the same way) and pulls you to the edge. It ignores walls beside you, so they stay free
  for wall runs. Right after running up a wall, everyone gets 20% more reach, so nearly reaching the top
  still pulls you up. Clambers and vaults carry your speed out
  (fully with Free runner).
- The camera leans away from the wall during a wall run.
- **Tree layout:** left (Climber path) is climbing and jumping: Iron grip, Cat's catch, Momentum,
  Featherfall, Skywalker. Center is the core moves. Right (Combatant path) is athletics in a fight:
  Battle wind, Shoulder charge, Lunge, Sure-footed, Unstoppable. Each side node locks only
  its opposite on the other side (same row), e.g. Battle wind locks Iron grip. The fight-side moves are data until combat exists.
- **Course:** east of the steps in the test grounds: a 0.9 m rail and a 0.95 m block to vault,
  1.65 m and 2.1 m ledges to clamber, a 3.2 m block to run up and clamber, a 6 m shaft for wall jumps, and a long 2.6 m wall (deep enough to stand on) for wall runs and grabbing its top.
  Use the Skill trees tab's "+100 (test)" on Athletics to reach Apprentice and Journeyman, then buy the
  moves.

## Ledge hang and shimmy
- Holding jump in the air grabs a ledge in front of you. **Moving into it** (forward held), or coming off
  a wall run-up or wall run, pulls straight up as before. **Not moving into it**, you catch the edge and hang.
- Hanging (keys are relative to the wall, wherever you look): **forward or jump** pulls up · **left / right** shimmy along the edge while it continues at the
  same height (stops at corners and anything in the way) · **back or crouch** lets go · **back + jump**
  kicks off away from the wall (needs Wall jump).
- **Any edge your hands reach** can be caught: arms overhead are about 1.3× your height above your feet
  (1.5× with Cat's catch, which also catches you falling fast). Thin edges count: a lip on a wall, the
  top of a thin wall or fence. A ledge out of clamber reach is caught and hung from instead.
- Pulling up puts you on top when there's room to stand; on a thin wall you climb over and drop down
  the far side (you pull up, step off the far edge and fall naturally); under a lip with wall above it you can only hang and shimmy.
- Grip tires: about 2.5 stamina a second (Iron grip and a lighter pack help, shimmying costs a bit more).
  At zero you fall. You only hang where there's a real drop below; low ledges are always climbed.
- Test pieces east of the athletics course: a 2.8 m thin wall and a lip at 3 m on a 6 m wall.

## Falls
- Safe up to 4 m, plus 3 m per rank of **Featherfall** (Athletics, Climber side). Past that, 6% of max
  health per metre. Shallow water softens it; landing in deep water is always safe.
- **Roll out of it:** press dodge just before you land (needs Dodge roll) for half damage, and you roll
  on keeping your speed.
- At zero health you black out and wake back at the start with half health (no death yet). A red flash
  and a message show each fall's damage.

## Carried weight
- What you carry, compared with your capacity (Character page): over capacity you're slower, as before.
- **Water:** past 30% of capacity you sink (about 1.3 m/s at full capacity). Treading (jump) still lifts
  you but drains stamina; drop gear or you'll drown.
- **Climbing:** clambers and vaults slow down with load (a full pack: clambering takes 1.6× as long), grip
  tires faster while hanging and shimmying is slower.

## Surfaces
Every shape has a material (src/data/surfaces.js): grass, stone (default), wood, metal, sand, mud, water.
Each has its own footstep and landing sound, a noise level, slide grip and walking speed:
| Surface | Noise | Slide | Walk |
|---|---|---|---|
| Grass | 0.75× | normal | full |
| Stone | 1× | normal | full |
| Wood | 1.2× | a little further | full |
| Metal | 1.5× | further | full |
| Sand | 0.6× | shorter | 92% |
| Mud | 0.85× | much further | 85% |
| Shallow water | 1.4× | — | wading |
Test grounds: a strip of each north of the start (z 26–32), the vault rail is metal, the pool stairs are
wood, the lake beach is sand, and there's a 10° mud slope beside the slide slopes.

## Sneak and noise
How far your sound carries (shown above the hotbar, in metres) is your movement × the surface × your
weight × gear rattle × Sneak (src/rpg/stealth.js):
- **Movement:** still 0 · crouch-walk ~1.5 m · stroll 3 · walk 5 · sprint 12 · slide 10 · wall run 12 ·
  swim 3 (hard 8). Spikes: jump 8, wall jump 10, roll 9, vault 7, clamber 6, splash 6+, and landings
  from 3 m up to 30 m for a big fall. Big movement is loud by default.
- **Weight:** (body mass ÷ 70 kg)^0.4. **Gear:** worn and sheathed gear rattles while you move, +3% per kg.
- **Sneak skill:** crouched × (Sneak/100)^-0.3, standing × (Sneak/100)^-0.15 (Sneak 1000: crouched half as loud).
- **Hearing:** only inside your noise radius (closer fills awareness faster). Walls between you and the
  listener halve the radius.
- **Sight:** needs a clear line from its eyes to your head or chest (walls and cover block it; crouching
  behind low cover hides you), inside a 120° cone out to 25 m × your visibility (crouching halves it,
  standing still takes off 40%, Sneak takes off more). 0.3 = suspicious, 1 = detected; it fades slowly
  when it stops noticing you.
- **Sentry** (test grounds, 40 m north of the start, facing the start, with a 1.2 m and a 2.5 m cover wall in front of it (crouch close behind the low one to hide)): its head goes green → yellow →
  red, and the eye on the HUD shows its awareness and whether it hears or sees you.
- Not yet: weapons drawn versus sheathed (there's no draw state yet), light and shadow, NPC reactions.

## Third-person view

The mouse wheel sets how far behind you the camera sits (1.4 m up to 7 m, eased); scrolling all the way in returns to first person. M switches between first person and the last distance you chose. The camera still pulls in ahead of walls.
M toggles a camera behind your right shoulder, following your aim and stopping short of walls. Your
whole body (head included) shows. Everything else works the same.

## Walk and run
The legs track narrowly under the body (no more wide stance) and the style blends with how feminine the
body is: masculine walks keep the feet about hip width apart with more shoulder swing and a heavier
bounce; feminine walks land the feet close to one line, with hip sway and drop over the standing leg and
arms closer in. Running narrows both.

Standing still blends the same way: masculine feet wider than the hips, weight even, chest up, arms
slightly out; feminine weight on one leg (that leg straight under the body, the other knee bent and
resting forward), hips over the standing leg, arms in close, swapping sides every so often. Starting
off eases from the stance into the stride (about a fifth of a second). Stopping finishes the step (the
legs settle to passing each other) and eases the run/walk mix down, then back to the stance.

Jumping and landing: in the air the pose follows your vertical speed. Rising, the lead knee drives up and
the arms swing forward; falling, the legs reach down to land and the arms go out for balance. Landing
sinks into a squat sized by the impact and springs back over about a third of a second. Crouching uses
the same squat (hips and knees folded, feet flat, chest forward), so feet stay on the ground.

## Sliding and rolling

- **Slide:** hold crouch while moving faster than a walk on the ground (sprinting, running downhill,
  landing from a jump, or coming out of a dodge roll with crouch held). It's momentum-based: a
  sprint-jump landed with crouch held slides straight on, and a roll with crouch held flows into a slide. You drop
  into a feet-first slide at crouch height. Friction slows you on the flat (about 12 m from a sprint)
  and quickly uphill; downhill, gravity keeps or builds your speed (about 16 m/s on 20°, capped at
  20 m/s on 30° and steeper). Steer a little; jump out of a slide to keep its momentum. Stamina doesn't recover while sliding or rolling.
- **Air momentum:** in the air you steer but don't brake, so speed carries through jumps unless you push
  against your motion. The slide ends
  when it slows to walking speed, and you're back on your feet (crouch-walking if crouch is still held).
- **Dodge roll** (Athletics core, 201; Left Alt): a quick roll in the direction you're moving (backward
  if no direction is held), about 2 m from a standstill. It keeps your momentum: rolling out of a sprint
  stays at sprint speed; 15 stamina, 0.6 s between rolls. The first third of a second is
  invulnerable (for combat, later). The camera dips a little and tips slightly the way you roll (nods forward, tips back, or tilts to the side); your body is hidden for the half second so the camera isn't inside it.
- **Test slopes:** in the far west (x −120 to −72, z 60 to 96): 30 m runs at 10°, 20°, 30° and 40° with a
  landing at the top of each. Walk up, turn around, sprint, crouch.

## Water

Water volumes are boxes that aren't solid (`testGroundsWater()`; `waterAt` in `physics.js`).
The test grounds' pool is west of the start: 1 m walls, 2.4 m high, with stairs up the north side.
Inside: a 2.1 m deep end, a ramp, and a shallow shelf (0.7 m of water).
The **lake** in the east (x 70–110, z −40–40) is 40 × 80 m (about 19 pools) and 7.75 m deep, with a beach
sloping in along its west side, for speed and diving tests. The field grew to 300 × 300 m to fit it.

| | |
|---|---|
| Wading | Water slows walking (down to half speed at chest depth) and weakens jumps; footsteps splash. Landing in water makes no thud |
| Swimming | Deeper than chest height (62% of your height). Move where you look; near the surface you stay up unless you look clearly down (past about 25°) to dive; jump to rise, crouch to sink; sprint to swim hard (12 stamina/s). About 1.8 m/s at Swimming 100 (2.9 hard). Swimming skill adds 20% per doubling, capped at 2×: 1.2× at 200, 1.66× at 1000, 2× from 5000. Strength adds up to 1.5× |
| Floating | At the surface you bob with your eyes just above it. Underwater you have neutral buoyancy: you hold your depth until you swim up (jump) or down (crouch). Stamina refills at half rate while treading water |
| Breath | About 25 s underwater at average Endurance and Swimming (×√Endurance; Swimming adds 30% per doubling, capped at 3×: 50 s at 1000, 68 s at 5000). The breath bar shows under the stamina bar; it refills twice as fast above water |
| Drowning | Out of breath underwater: lose 8% of max health a second |
| Climbing out | At the surface, face the edge and hold jump (clamber) |
| Training | Swimming grows with distance swum (1 per 5 m, 1.5 swimming hard) |

- **Body:** treading water is upright, sculling. Swimming forward lays the body flat in a front crawl
  (alternating arm strokes, flutter kick, a little body roll), head-down when diving.
- **Swimming tree** (Skill trees tab): center Steady breath, Strong stroke, Surface dive (crouch at the
  surface to plunge), Leap out (+25% reach climbing out), Easy treading, Fluid motion. Left, Diver:
  Deep lungs, Dolphin kick (sprint underwater for a burst), Calm heart, Last gasp (6 s grace before
  drowning), Breath of the deep (3× breath). Right, Racer: Racing stroke, Efficient kick, Porpoise
  (swimming hard at the surface, jump to leap forward), Waterborne, Torpedo. Waterborne and Torpedo are
  data for now; everything else works.
- **Water surface:** drawn as a single see-through plane (the old box's sides z-fought with the pool walls).
- **Underwater view:** a blue tint and thick blue fog while the camera is under the surface.
- **Sound:** a splash on entering (size and fall speed set how big), strokes as you swim (muffled
  under), and splashing footsteps when wading.

## Weapons on your body

- **Sheaths:** most weapons now ride on the back, clear of the arms (swords, axes, maces, clubs,
  rapiers, and the two-handers). Knives, tools, wands, orbs and books stay at the hip. A second back
  weapon crosses the first; a shield hangs outside them.
- **Arms and collisions:** arms are still kept out of the body, armor and sheathed weapons, but the
  correction now eases in over a few frames instead of snapping, so an arm brushing a weapon no
  longer twitches.

## Sound

Made in code (Web Audio), no sound files. Volume is in Controls.
- **Footsteps:** quiet (a quarter of the other sounds), two per stride, timed to the walk. Heavier and bigger bodies sound lower, louder and
  thuddier; sprinting is firmer; crouching and slow walking are soft. Grass brushes, stone clicks.
- **Jump:** a short breath of effort, pitched by how masculine or feminine the body is (and a little
  by size).
- **Landing:** a thud whose depth follows size and weight and whose force follows the fall speed.
- Sound starts on the first click into the game (browsers require a click first).

## Weapon rack

Near the start, opposite the mirror. Walk up and face it, press E: every weapon, grouped by skill,
with damage, speed, reach and weight. Click one to put it in your pack.

## Your body

Looking down shows your own body: the same model, clothes and gear as the creator, restored from the
save. It walks when you move, easing into a run with speed: strides lengthen, knees lift, the
elbows bend and drive back, and the body leans in. The legs keep a natural cadence (about 1.3
strides a second strolling, under 2 at a sprint) and move by distance, so feet don't skate.
- **Head:** hidden only for your own camera's render, so the camera can sit at the eyes. Hair, horns
  and ears go with it. Mirrors and the head's physics still see it.
- **Body position:** it eases back as you look down, as if your neck bent forward, so you see your
  chest, arms and feet but never the inside of your neck.
- **Eye height:** from the model itself.
- **Loading:** the body loads in the background; you can move before it arrives.

The creator's saved look now restores (`viewer.load(save.appearance)`): race and lineage, body
sliders, body-part state, skin, hair and gear. It was saved before but never read back.

## Performance

- When a map is played from the creator, only the map is built: the test grounds' field, cliff, course, racks,
  mirror, dummies and sentries are left out. (Entering the test grounds from the character screen still has them.)

- The title screen's animated background stops while you play. It had been redrawing behind the
  game every frame, the main cause of the low frame rate.
- **Render scale** (50–100%) and **Shadows** (on/off) are in Controls. Lower render scale is the
  biggest speedup on a weak GPU.
- **Reflections** (Controls): Mirror view (sharp puddle reflections of the level you stand on; draws the scene a
  second time at half size, only while there are puddles), Screen-space (any height, on-screen things only), or Off.
- There is no frame cap; the game runs at your screen's refresh rate when the GPU keeps up.
- Draw calls are kept low: buildings and props are merged per 32 m block, the ground and roads per 64 m block, and
  trees and plants are one mesh per kind and detail level for the whole map. Their buffers are only refilled when
  the camera moves half a metre or turns about 8° (culled a third wider than the screen, so turning shows no gaps).
- **F8 — performance panel.** Opens a panel and frees the mouse. It shows fps, frame time (ms), a frame's draw
  calls and triangles (shadows included), how many point lights the shaders carry, and the shader count. Switch
  anything off on its own: lamp and torch lights, crystal and checkpoint lights, sun shadows, buildings casting
  shadows, trees and bushes, grass/flowers/reeds, buildings/props/rocks, ground and roads, water, the glow pass,
  and resolution (100/75/50/25%). Click the game to play on with the panel showing; F8 (when the mouse is free) or
  Escape closes it and switches everything back on. If lowering resolution helps most, the cost is the pixels
  (lighting and shading), not the number of things drawn. Turning lights or shadows off rebuilds the shaders, so
  expect a short hitch the first time. Outdoors it also has the weather (magic flare-up low / medium / high among
  them), clouds, wind, fog, aurora, and Surfaces (dry / wet / puddles / light or deep snow, to see them at once).
- If it's still slow, check that the browser uses your dedicated GPU: in Windows, Settings → Display
  → Graphics → your browser → High performance.

## Movement

| | Value |
|---|---|
| Walk | 4.2 m/s at Speed 100 (√(Speed/100); a Speed-180 character walks about 5.7) |
| Sprint | × 1.7 at average Athletics and Dexterity, up to × 2.4; forward or diagonal only, on the ground |
| Crouch | × 0.5; fits under 1.3 m |
| Slow walk | × 0.45 |
| Jump | 1.05 m at average stats; Strength matters most, then Dexterity and Athletics (Strength 250 jumps about 1.4 m) |
| Gravity | 22 m/s², a little heavier than real so jumps feel crisp |
| Step up | 0.42 m without jumping (0.4 m steps walk on; 0.55 m needs a jump) |
| Steepest walkable slope | 46° (40° ramps climb; 55° ramps slide you back) |
| On a too-steep slope | you slide down it, steering sideways but never climbing; stepping off the top slides you to the bottom |

- **Stamina:** the maximum comes from Endurance, raised a little by Athletics, and the refill from
  Endurance and Speed, faster with Athletics ((Athletics/100)^0.35: about 1.5× at 300, 1.9× at 600). Sprinting costs 9 a second at average stats, less with more Endurance and
  Athletics. A jump costs 12. Stamina refills 0.8 seconds after you stop spending it. Running it dry leaves you exhausted, unable
  to sprint until it's back to 25%.
- **Coyote time and jump buffer:** you can still jump 0.1 s after running off an edge, and a jump
  pressed up to 0.12 s before landing still happens.
- **Training:** sprinting trains Athletics (1 per 10 m) and so does jumping (0.3 per jump).
- **Eye height:** from the saved body's height slider.
- **Stairs and rough ground:** the body steps up at once, but the camera eases up to it over about
  a quarter second, so climbing feels like climbing. Smooth ramps don't trigger it, and jumps and
  falls aren't smoothed.
- **Camera:** a faint head bob (about 7 mm at a sprint, no roll), adjustable or off in Controls. Physics runs in small fixed steps so collisions stay solid
  at low frame rates.

## Test grounds

- Steps of 0.3, 0.4, 0.55, 1.0 and 1.6 m
- 0.2 m stairs up to a 2 m platform
- Ramps of 20°, 40° and 55°
- A 1.3 m beam to crouch under
- A 3.2 m gap: sprinting jumps make it, walking jumps fall short
- A wall and a row of pillars to slide along
- A low wall around the field's edge

Each was checked with scripted runs.

## Vaults
A vault carries you forward at your own speed (at least a brisk jog): you rise quickly to clear the top,
pass over it still moving, and leave the far side in the air, falling and landing under normal physics
with your momentum kept (90%, all of it with Free runner). Vaulting onto a deep block ends on top.

## Move animations
- **Vault:** a speed vault. The left hand plants on the top and slides back under you as you pass, the
  legs tuck together and swing over to the right, the right arm stays low and forward; then the legs
  reach down to land.
- **Dodge roll:** tucked into a ball (knees to chest, arms round the shins, head down) and the whole body
  turns once around its middle in the roll's direction: forward, back or sideways. Seen in third person;
  first person shows it through the camera.
- **Slide:** feet first, sitting on the ground (not sunk into it), lead leg out, one hand trailing and the
  other resting forward toward the knee.

## Air control (Athletics, passive)
Steering in the air gets stronger with Athletics, no node needed: push in the air × (Athletics/100)^0.4
(1× at 100, 1.3× at 200, 2.5× at 1000, capped at 4× around 3200). Above 100 you can also curve your
momentum mid-jump, turning the speed you carry toward where you steer without losing or gaining any.
Steering hard right through a sprint jump:
| Athletics | Sideways drift | Momentum turned |
|---|---|---|
| 100 | 0.6 m | 16° |
| 300 | 1.4 m | 32° |
| 1000 | 3.0 m | 58° |
| 5000 | 5.3 m | 90° |
Pulling straight back still brakes, as before.

## Climbing (Climbing skill)
Test walls: four 8 m walls east of the thin edges (x 52): rough stone, vines, wet stone, ice.
- **Grab on:** jump at a climbable wall and hold jump (or press jump standing right at it).
- **On the wall** (keys relative to the wall, wherever you look): forward/back climb up and down,
  left/right move across (stopping where the climbable face ends). Climb down to the ground to step off.
  At the top you pull over onto it when there's room to stand. Crouch lets go; back + jump kicks off.
- **Grip** = (Climbing/100)^0.35 against the surface's difficulty. Past your grip you slip now and then
  (a short drop and 6 stamina); out of stamina you fall.

| Surface | Difficulty | Speed | Stamina | At Climbing 100 | At 1000 |
|---|---|---|---|---|---|
| Vines | 0.5 | 1.2× | 0.8× | easy, 8 m in ~7 s | ~6 s |
| Rough stone | 0.8 | 1× | 1× | easy, ~8 s | ~7 s |
| Wet stone | 1.5 | 0.75× | 1.3× | slips, ~12 s | ~8 s, no slips |
| Ice | 2.4 | 0.5× | 1.7× | slips constantly, nearly impossible | ~14 s, occasional slips |

- **Slick walls pull you down:** on wet stone and ice you sink whenever you aren't climbing up (holding
  still, moving across or climbing down): wet stone 0.3 m/s, ice 0.7 m/s at Climbing 100, half that around
  1000 (never under 15%). Wet grip / Ice climber halve it on their surface; Unfalling stops it.
- **Vines can tear:** a small chance to slip whatever your grip (about once a minute of climbing at 100,
  a little less with skill).
- Stamina: about 4 a second moving (× surface, less with skill, Iron grip and a light pack), 1.5 holding still.
- Carried weight slows climbing like clambering and drains more stamina.
- Training: every 2 m climbed trains Climbing (more on harder surfaces). Climbing builds Strength and
  Endurance, at the same small share as movement, tapering toward the body's limit.
- Noise: about 2.5 m while moving (× surface). Falls from a wall count from where you let go.

**Climbing tree.** Core: Climb (innate) · Steady hold 150 (holding still −20%/rank, ×3) · Wet grip 201 ·
Dyno 300 (jump to lunge 1.5 m up) · **Side leap 501** · **Push off 550** · Spider 1200 (+30% speed).
Alpinist (left): Chalked hands 300 · Catch yourself 600 · Enduring grip 600 · Overhang 1200 · Unfalling 5001.
Free climber (right): Quick hands 300 · Ice climber 600 · Resting hold 600 · Fluid climber 1200 · Lizard 5001.

**Wall to wall.**
- **Side leap** (jump + left/right on a wall, 10 stamina): leaps up to 3 m sideways to the furthest wall in
  reach, more of this one or the next across a gap (the test walls have 2 m gaps). With nothing in reach
  you leap off into the air that way; hold jump to catch a wall you reach. Never through a wall.
- **Push off** (back + jump, 8 stamina): anyone can hop off a wall; with Push off you're thrown twice as far
  and holding jump catches the wall you're thrown at, like the far side of a chimney (test grounds: two
  rough-stone walls 2.5 m apart, at the end of the row of climbing walls).
- Both have a leap sound: the push against the wall, a rush of air and a grunt.

## The cliff (natural climbing)
North of the start (x −40 to 0, z ≈ 118, facing the start): a 24 m natural cliff face with a plateau on top
(src/game/cliff.js). One noise-shaped surface, drawn as a smooth mesh, with collision made of box columns
that follow it (merged runs, about 400 boxes) so climbing, ledges, standing and falls all work as usual.
- **Rock:** rough stone almost everywhere; vines over the lower left (as you face it); a smooth slab
  (no holds: side leap or jump past it); a wet streak running the full height; an ice band across the top
  on the right.
- **Following the rock:** the face bulges and recedes; while climbing, your hands look for a hold at their
  height (about 0.75–0.95 of your height) up to 0.75 m ahead and you follow the face in and out.
- **Shelves:** seven ledges about a metre deep. Climbing up under one pulls you up onto it; from a shelf,
  jump at the wall above to grab on again. Some are level with each other (B → C: a 3.5 m running jump),
  some higher (A → B: 2.5 m across and 1.5 m up, catch the edge).
- **Smooth rock and overhangs** stop you: no hold, so you stay put until you go around.
- At the top you pull over onto the plateau.
- **Extreme features** (src/game/cliff.js FEATURES): a big round bulge in the vines (sticks out 2.6 m,
  climb up its underside and over), a buttress rising from the ground beside the wet streak, a huge
  overhanging bulge high on the right under the ice (3 m out), and a deep alcove (3.5 m in). Where a shelf
  sits right under the big bulge there's no room to stand: go round it.
- **Climbing on the rock itself:** on natural rock you climb the surface directly (src/game/cliff.js
  CLIFF_FIELD: a point and normal for every spot on the face). You stay pressed to it at chest height and
  the body turns and tilts with it: lying into a slab, hanging back under an overhang. Over a bulge, into a
  hollow, up an underside: no stops. Speed is measured along the rock, so a steep bulge takes longer, and
  rock that faces downward costs up to 2.5× the stamina to hang on to (and slips more).
- What stops you: smooth rock (the slab), the ends of the face, a shelf with no room to stand on it, and the
  top (where you pull over onto the plateau). Moving diagonally into something slides you along it.
- **No standing on rock steps:** the small steps in the face aren't ground. Climbing down only lets you off
  onto real ground or a shelf, and falling down the face won't perch you on a bump.
- **Shelves overhead:** you reach out around the shelf's front edge first, then haul up onto it, never
  through it. Shelves count as in the way from just over head height.
- **Catching yourself mid-fall:** grabbing a wall while falling skids you down the face before your grip
  holds. Braking ≈ 14 m/s² × grip ÷ (surface difficulty + 0.3), stronger with Catch yourself; it costs
  stamina. Run out of holds mid-skid and you fall; hit the ground still skidding and you land (fall
  damage from what's left). Falling at 8 m/s: about 2.5 m on rough stone at Climbing 100, 1 m at 1000;
  wet stone and ice skid further.

## Climbing leaps (Dyno, Side leap) — the animation
Conan Exiles style, in three beats (about 0.17 s, the flight, 0.18 s):
- **Coil:** feet drawn up high on the rock, elbows down pulling the chest in, head tucked, a small dip
  toward the rock.
- **Spring:** legs drive straight with toes pointed, both arms reach high, back arched, eyes on the hold.
  On a side leap the leading arm reaches out toward where you're going and the legs swing the other way,
  so the body makes a diagonal line, leaning into the leap.
- **Catch:** hands bite, a short sag as the elbows give, knees come up to find the rock, then back to
  climbing. Works the same on the flat walls and the cliff.

## Athletics wall jumps — kicks and their animation
- **Side to side** (walls left and right, e.g. the shaft): jump at the wall beside you. The foot nearest the
  wall plants and drives (leg out to that side), the other knee comes up, the body leans away, the far arm
  swings up and away and the near arm drives down; then you tuck into the air pose. Chaining up the shaft
  alternates left and right.
- **Head-on kick-off** (new): facing a wall you're touching in the air, or while running up it, press jump
  to kick back off it with both feet (Wall jump node, 10 stamina, 6 m/s back). Legs drive straight into the
  wall, back arches, arms thrown up and back, then the knees tuck.
- **Wall behind you:** legs push back, arms fling forward and up.
- **No bouncing up one wall:** you can't kick off the same surface twice in a row. Landing, or kicking off a
  different wall, frees it (so the shaft still chains, wall to wall). A wall made of several pieces counts as
  one surface (same facing, within 1.5 m of your last kick). Applies to side kicks, head-on kick-offs and
  jumps off a wall run.
- Each kick plays for about half a second, then blends into the jump/fall pose.

## Thief's routes (Sneak, Sly Cooper style)
Routes you have the technique for **sparkle** when you're within 9 m. Press **E** near one to take it, or
hold **jump** in the air as you reach it (passing over a spire catches it). On a route the movement keys
work along it from where you're looking; **jump** leaps off toward where you look, **crouch** lets go.
| Route | Technique (Sneak tree) | Also needs | Moves |
|---|---|---|---|
| Wall hug | Wall hug (innate) | — | E beside a wall: back to it, sidle along (also ledges too narrow to walk); E or step away to leave |
| Poles and drainpipes | Poles and pipes 150 | Athletics 150 | forward/back climb, left/right circle round; up onto a spire at the top |
| Horizontal pipes | Poles and pipes 150 | Athletics 150 | hang and shimmy |
| Tightropes and wires | Tightrope 201 | Athletics 201 | walk it, arms out; step off at the end; crouch on a downhill wire to slide (Wire slide) |
| Spires | Spire landing 300 (after Poles and pipes) | Athletics 300 | perch; jump to leap spire to spire |
| Wire running | Wire runner 401 (after Tightrope) | Athletics 401 | crouch low and silent, or sprint along tightropes |

- **Twirl:** mid-air, press **E** or **jump** with a spire, rope or pipe within about 4.5 m (from your chest;
  up to about 4 m above you): one fast spin, knees and feet together, with a lift that carries you over it
  and lands you **on top** of it. Never at poles (grab those: E, or hold jump close by) and never when a
  ledge is in reach ahead (hold jump to grab it). Costs 4 stamina.
- **Only ahead:** twirls and hops only go to routes in front of you (within about 55° of where you look), and
  the route you just left is ignored until you're 1.6 m clear of it or have landed, so jumping off a wire
  never pulls you back onto it.
- **Stepping onto ropes and pipes:** walk off a roof onto a rope's or pipe's end at the same level, or come
  down on one, and you're on it (with Tightrope), no button needed.
- **Narrow ledges:** hanging from a ledge too narrow to stand on with a wall behind it, W pulls you up into a
  wall hug on it; hugging on one, S (when you aren't sidling with it) lowers you to hang from its edge.
- **Cloaked dodge** (Sneak 501): anyone who hasn't already spotted you can't see or hear your dodge roll,
  so you can roll from cover to cover. Needs Dodge roll (Athletics) to roll at all.
- **Mini hop:** when the route is already within about 2.8 m of your chest, the twirl is a quick little hop
  onto it instead (no spin, about a third of a second, 2 stamina).
- **Wire slide:** both hands up on the wire, leaning back, feet first and together down the slope, the body
  placed so the hands stay on the wire.
- **Rope crouch:** crouched low on the line, one foot ahead of the other (back heel up), arms out, swaying.
- **Ropes and pipes, top or hanging:** both can be walked on top (Tightrope) or hung from (Poles and pipes).
  You take the top coming from above, and hang coming from below. Looking across one, **W** climbs up to walk
  on top and **S** drops to hang below (looking along it, W/S move you along it).
- **Spire perch:** crouched deep, knees and feet pressed together, up on the balls of the feet on the tip,
  arms low and forward.
- **No teleports:** the twirl is a real flight, an arc from where you were to the landing spot, spinning once
  and settling as you arrive. Climbing up onto a rope or pipe hauls you up beside it and over; dropping to
  hang swings you off the side and lowers you; moving from one route to another (pole → pipe, pipe → pole,
  spire → pole, E to a nearby one) is a short tucked hop.
- **Crouching on a rope or pipe top:** anyone can crouch low on it (half speed, quieter; crouch again to
  stand). Wire runner makes it silent and faster, and lets you sprint along it.
- **Landing:** a thud whose depth follows size and weight and whose force follows the fall speed.
- Sound starts on the first click into the game (browsers require a click first).

## Weapon rack

Near the start, opposite the mirror. Walk up and face it, press E: every weapon, grouped by skill,
with damage, speed, reach and weight. Click one to put it in your pack.

## Your body

Looking down shows your own body: the same model, clothes and gear as the creator, restored from the
save. It walks when you move, easing into a run with speed: strides lengthen, knees lift, the
elbows bend and drive back, and the body leans in. The legs keep a natural cadence (about 1.3
strides a second strolling, under 2 at a sprint) and move by distance, so feet don't skate.
- **Head:** hidden only for your own camera's render, so the camera can sit at the eyes. Hair, horns
  and ears go with it. Mirrors and the head's physics still see it.
- **Body position:** it eases back as you look down, as if your neck bent forward, so you see your
  chest, arms and feet but never the inside of your neck.
- **Eye height:** from the model itself.
- **Loading:** the body loads in the background; you can move before it arrives.

The creator's saved look now restores (`viewer.load(save.appearance)`): race and lineage, body
sliders, body-part state, skin, hair and gear. It was saved before but never read back.

## Performance

- The title screen's animated background stops while you play. It had been redrawing behind the
  game every frame, the main cause of the low frame rate.
- **Render scale** (50–100%) and **Shadows** (on/off) are in Controls. Lower render scale is the
  biggest speedup on a weak GPU.
- There is no frame cap; the game runs at your screen's refresh rate when the GPU keeps up.
- **F8 — performance probe.** Each press switches one thing off and shows it in the corner with that frame's
  draw calls and triangles: all on → no lamp lights → no shadows → no plants → no glow pass → half resolution →
  off. Whichever step brings the fps back most is what to optimise. If half resolution helps most, the cost is
  the pixels (lighting and shading), not the number of things drawn. (Shadows redraw every caster, so they
  roughly double the draw calls.)
- If it's still slow, check that the browser uses your dedicated GPU: in Windows, Settings → Display
  → Graphics → your browser → High performance.

## Movement

| | Value |
|---|---|
| Walk | 4.2 m/s at Speed 100 (√(Speed/100); a Speed-180 character walks about 5.7) |
| Sprint | × 1.7 at average Athletics and Dexterity, up to × 2.4; forward or diagonal only, on the ground |
| Crouch | × 0.5; fits under 1.3 m |
| Slow walk | × 0.45 |
| Jump | 1.05 m at average stats; Strength matters most, then Dexterity and Athletics (Strength 250 jumps about 1.4 m) |
| Gravity | 22 m/s², a little heavier than real so jumps feel crisp |
| Step up | 0.42 m without jumping (0.4 m steps walk on; 0.55 m needs a jump) |
| Steepest walkable slope | 46° (40° ramps climb; 55° ramps slide you back) |
| On a too-steep slope | you slide down it, steering sideways but never climbing; stepping off the top slides you to the bottom |

- **Stamina:** the maximum comes from Endurance, raised a little by Athletics, and the refill from
  Endurance and Speed, faster with Athletics ((Athletics/100)^0.35: about 1.5× at 300, 1.9× at 600). Sprinting costs 9 a second at average stats, less with more Endurance and
  Athletics. A jump costs 12. Stamina refills 0.8 seconds after you stop spending it. Running it dry leaves you exhausted, unable
  to sprint until it's back to 25%.
- **Coyote time and jump buffer:** you can still jump 0.1 s after running off an edge, and a jump
  pressed up to 0.12 s before landing still happens.
- **Training:** sprinting trains Athletics (1 per 10 m) and so does jumping (0.3 per jump).
- **Eye height:** from the saved body's height slider.
- **Stairs and rough ground:** the body steps up at once, but the camera eases up to it over about
  a quarter second, so climbing feels like climbing. Smooth ramps don't trigger it, and jumps and
  falls aren't smoothed.
- **Camera:** a faint head bob (about 7 mm at a sprint, no roll), adjustable or off in Controls. Physics runs in small fixed steps so collisions stay solid
  at low frame rates.

## Test grounds

- Steps of 0.3, 0.4, 0.55, 1.0 and 1.6 m
- 0.2 m stairs up to a 2 m platform
- Ramps of 20°, 40° and 55°
- A 1.3 m beam to crouch under
- A 3.2 m gap: sprinting jumps make it, walking jumps fall short
- A wall and a row of pillars to slide along
- A low wall around the field's edge

Each was checked with scripted runs.

## Vaults
A vault carries you forward at your own speed (at least a brisk jog): you rise quickly to clear the top,
pass over it still moving, and leave the far side in the air, falling and landing under normal physics
with your momentum kept (90%, all of it with Free runner). Vaulting onto a deep block ends on top.

## Move animations
- **Vault:** a speed vault. The left hand plants on the top and slides back under you as you pass, the
  legs tuck together and swing over to the right, the right arm stays low and forward; then the legs
  reach down to land.
- **Dodge roll:** tucked into a ball (knees to chest, arms round the shins, head down) and the whole body
  turns once around its middle in the roll's direction: forward, back or sideways. Seen in third person;
  first person shows it through the camera.
- **Slide:** feet first, sitting on the ground (not sunk into it), lead leg out, one hand trailing and the
  other resting forward toward the knee.

## Air control (Athletics, passive)
Steering in the air gets stronger with Athletics, no node needed: push in the air × (Athletics/100)^0.4
(1× at 100, 1.3× at 200, 2.5× at 1000, capped at 4× around 3200). Above 100 you can also curve your
momentum mid-jump, turning the speed you carry toward where you steer without losing or gaining any.
Steering hard right through a sprint jump:
| Athletics | Sideways drift | Momentum turned |
|---|---|---|
| 100 | 0.6 m | 16° |
| 300 | 1.4 m | 32° |
| 1000 | 3.0 m | 58° |
| 5000 | 5.3 m | 90° |
Pulling straight back still brakes, as before.

## Climbing (Climbing skill)
Test walls: four 8 m walls east of the thin edges (x 52): rough stone, vines, wet stone, ice.
- **Grab on:** jump at a climbable wall and hold jump (or press jump standing right at it).
- **On the wall** (keys relative to the wall, wherever you look): forward/back climb up and down,
  left/right move across (stopping where the climbable face ends). Climb down to the ground to step off.
  At the top you pull over onto it when there's room to stand. Crouch lets go; back + jump kicks off.
- **Grip** = (Climbing/100)^0.35 against the surface's difficulty. Past your grip you slip now and then
  (a short drop and 6 stamina); out of stamina you fall.

| Surface | Difficulty | Speed | Stamina | At Climbing 100 | At 1000 |
|---|---|---|---|---|---|
| Vines | 0.5 | 1.2× | 0.8× | easy, 8 m in ~7 s | ~6 s |
| Rough stone | 0.8 | 1× | 1× | easy, ~8 s | ~7 s |
| Wet stone | 1.5 | 0.75× | 1.3× | slips, ~12 s | ~8 s, no slips |
| Ice | 2.4 | 0.5× | 1.7× | slips constantly, nearly impossible | ~14 s, occasional slips |

- **Slick walls pull you down:** on wet stone and ice you sink whenever you aren't climbing up (holding
  still, moving across or climbing down): wet stone 0.3 m/s, ice 0.7 m/s at Climbing 100, half that around
  1000 (never under 15%). Wet grip / Ice climber halve it on their surface; Unfalling stops it.
- **Vines can tear:** a small chance to slip whatever your grip (about once a minute of climbing at 100,
  a little less with skill).
- Stamina: about 4 a second moving (× surface, less with skill, Iron grip and a light pack), 1.5 holding still.
- Carried weight slows climbing like clambering and drains more stamina.
- Training: every 2 m climbed trains Climbing (more on harder surfaces). Climbing builds Strength and
  Endurance, at the same small share as movement, tapering toward the body's limit.
- Noise: about 2.5 m while moving (× surface). Falls from a wall count from where you let go.

**Climbing tree.** Core: Climb (innate) · Steady hold 150 (holding still −20%/rank, ×3) · Wet grip 201 ·
Dyno 300 (jump to lunge 1.5 m up) · **Side leap 501** · **Push off 550** · Spider 1200 (+30% speed).
Alpinist (left): Chalked hands 300 · Catch yourself 600 · Enduring grip 600 · Overhang 1200 · Unfalling 5001.
Free climber (right): Quick hands 300 · Ice climber 600 · Resting hold 600 · Fluid climber 1200 · Lizard 5001.

**Wall to wall.**
- **Side leap** (jump + left/right on a wall, 10 stamina): leaps up to 3 m sideways to the furthest wall in
  reach, more of this one or the next across a gap (the test walls have 2 m gaps). With nothing in reach
  you leap off into the air that way; hold jump to catch a wall you reach. Never through a wall.
- **Push off** (back + jump, 8 stamina): anyone can hop off a wall; with Push off you're thrown twice as far
  and holding jump catches the wall you're thrown at, like the far side of a chimney (test grounds: two
  rough-stone walls 2.5 m apart, at the end of the row of climbing walls).
- Both have a leap sound: the push against the wall, a rush of air and a grunt.

## The cliff (natural climbing)
North of the start (x −40 to 0, z ≈ 118, facing the start): a 24 m natural cliff face with a plateau on top
(src/game/cliff.js). One noise-shaped surface, drawn as a smooth mesh, with collision made of box columns
that follow it (merged runs, about 400 boxes) so climbing, ledges, standing and falls all work as usual.
- **Rock:** rough stone almost everywhere; vines over the lower left (as you face it); a smooth slab
  (no holds: side leap or jump past it); a wet streak running the full height; an ice band across the top
  on the right.
- **Following the rock:** the face bulges and recedes; while climbing, your hands look for a hold at their
  height (about 0.75–0.95 of your height) up to 0.75 m ahead and you follow the face in and out.
- **Shelves:** seven ledges about a metre deep. Climbing up under one pulls you up onto it; from a shelf,
  jump at the wall above to grab on again. Some are level with each other (B → C: a 3.5 m running jump),
  some higher (A → B: 2.5 m across and 1.5 m up, catch the edge).
- **Smooth rock and overhangs** stop you: no hold, so you stay put until you go around.
- At the top you pull over onto the plateau.
- **Extreme features** (src/game/cliff.js FEATURES): a big round bulge in the vines (sticks out 2.6 m,
  climb up its underside and over), a buttress rising from the ground beside the wet streak, a huge
  overhanging bulge high on the right under the ice (3 m out), and a deep alcove (3.5 m in). Where a shelf
  sits right under the big bulge there's no room to stand: go round it.
- **Climbing on the rock itself:** on natural rock you climb the surface directly (src/game/cliff.js
  CLIFF_FIELD: a point and normal for every spot on the face). You stay pressed to it at chest height and
  the body turns and tilts with it: lying into a slab, hanging back under an overhang. Over a bulge, into a
  hollow, up an underside: no stops. Speed is measured along the rock, so a steep bulge takes longer, and
  rock that faces downward costs up to 2.5× the stamina to hang on to (and slips more).
- What stops you: smooth rock (the slab), the ends of the face, a shelf with no room to stand on it, and the
  top (where you pull over onto the plateau). Moving diagonally into something slides you along it.
- **No standing on rock steps:** the small steps in the face aren't ground. Climbing down only lets you off
  onto real ground or a shelf, and falling down the face won't perch you on a bump.
- **Shelves overhead:** you reach out around the shelf's front edge first, then haul up onto it, never
  through it. Shelves count as in the way from just over head height.
- **Catching yourself mid-fall:** grabbing a wall while falling skids you down the face before your grip
  holds. Braking ≈ 14 m/s² × grip ÷ (surface difficulty + 0.3), stronger with Catch yourself; it costs
  stamina. Run out of holds mid-skid and you fall; hit the ground still skidding and you land (fall
  damage from what's left). Falling at 8 m/s: about 2.5 m on rough stone at Climbing 100, 1 m at 1000;
  wet stone and ice skid further.

## Climbing leaps (Dyno, Side leap) — the animation
Conan Exiles style, in three beats (about 0.17 s, the flight, 0.18 s):
- **Coil:** feet drawn up high on the rock, elbows down pulling the chest in, head tucked, a small dip
  toward the rock.
- **Spring:** legs drive straight with toes pointed, both arms reach high, back arched, eyes on the hold.
  On a side leap the leading arm reaches out toward where you're going and the legs swing the other way,
  so the body makes a diagonal line, leaning into the leap.
- **Catch:** hands bite, a short sag as the elbows give, knees come up to find the rock, then back to
  climbing. Works the same on the flat walls and the cliff.

## Athletics wall jumps — kicks and their animation
- **Side to side** (walls left and right, e.g. the shaft): jump at the wall beside you. The foot nearest the
  wall plants and drives (leg out to that side), the other knee comes up, the body leans away, the far arm
  swings up and away and the near arm drives down; then you tuck into the air pose. Chaining up the shaft
  alternates left and right.
- **Head-on kick-off** (new): facing a wall you're touching in the air, or while running up it, press jump
  to kick back off it with both feet (Wall jump node, 10 stamina, 6 m/s back). Legs drive straight into the
  wall, back arches, arms thrown up and back, then the knees tuck.
- **Wall behind you:** legs push back, arms fling forward and up.
- **No bouncing up one wall:** you can't kick off the same surface twice in a row. Landing, or kicking off a
  different wall, frees it (so the shaft still chains, wall to wall). A wall made of several pieces counts as
  one surface (same facing, within 1.5 m of your last kick). Applies to side kicks, head-on kick-offs and
  jumps off a wall run.
- Each kick plays for about half a second, then blends into the jump/fall pose.

## Thief's routes (Sneak, Sly Cooper style)
Routes you have the technique for **sparkle** when you're within 9 m. Press **E** near one to take it, or
hold **jump** in the air as you reach it (passing over a spire catches it). On a route the movement keys
work along it from where you're looking; **jump** leaps off toward where you look, **crouch** lets go.
| Route | Technique (Sneak tree) | Also needs | Moves |
|---|---|---|---|
| Wall hug | Wall hug (innate) | — | E beside a wall: back to it, sidle along (also ledges too narrow to walk); E or step away to leave |
| Poles and drainpipes | Poles and pipes 150 | Athletics 150 | forward/back climb, left/right circle round; up onto a spire at the top |
| Horizontal pipes | Poles and pipes 150 | Athletics 150 | hang and shimmy |
| Tightropes and wires | Tightrope 201 | Athletics 201 | walk it, arms out; step off at the end; crouch on a downhill wire to slide (Wire slide) |
| Spires | Spire landing 300 (after Poles and pipes) | Athletics 300 | perch; jump to leap spire to spire |
| Wire running | Wire runner 401 (after Tightrope) | Athletics 401 | crouch low and silent, or sprint along tightropes |

- **Twirl:** mid-air, press **E** or **jump** with a usable route within about 4.5 m (measured from your
  chest; up to about 4 m above you): one fast spin, balled up, with a lift that homes you onto it. You land
  with a quick dip (a perch sinks a little deeper). Costs 4 stamina.
- **Landing:** taking any route from the air plays a short landing dip instead of snapping straight to the pose.
- **Auto-transfer:** climbing to the top of a pole moves you straight on to a spire on it, or a pipe or wire
  leaving it; shimmying to a pipe's end moves you onto a pole there; back (or crouch) on a spire that tops a
  pole climbs down onto the pole.
- **Wire runner** (Sneak 401, also Athletics 401, after Tightrope): on a tightrope, crouch to move low and
  silent (crouch again to stand; jump to get off), and sprint to run along it (2.6× the rope walk, sprint
  stamina). Crouch while moving downhill on a wire still starts a Wire slide.
- **Stealth:** on a route you make 60% of the noise, and are 75% as visible (hugging a wall: 50%, 25% with
  Wall shadow). Ghost walker makes route movement silent. Moving along routes trains Sneak (and Athletics
  for the hybrid ones) and builds Dexterity a little.
- Poles and pipes tire your grip like hanging; ropes and walls don't.
- **Sneak tree.** Core: Wall hug · Soft steps 150 (×3) · Poles and pipes 150 · Tightrope 201 · Spire landing
  300 · Wire runner 401 · Cloaked dodge 501 · Ghost walker 1200. Shadow: Stillness 300 · Wall shadow 600 · Light feet 600 · Unseen 1200 · Vanish
  5001. Acrobat: Wire slide 300 · Pole swing 600 · Spire hop 600 · Cat's balance 1200 · Shadow dancer 5001.
  Hybrid techniques need another skill too (shown on the node).
- **Sneak course** (west of the pool, x −72 to −44, z 8 to 48): two roofs joined by a tightrope, a wire down
  to a low roof, a pole with a spire, three spires to hop, a pipe between posts, and a wall with a 33 cm
  ledge between two roofs (now 10 cm: too narrow to walk, wide enough to edge along) with two window boxes jutting
  out above it: they block the wall hug, so S to hang, shimmy under, W back up.
- **Test training** (weapon rack, E): +100 Sneak, Athletics, Climbing or Swimming, to try techniques.

## Wall run — the animation
Mirror's Edge style: a full running stride with the feet planted on the wall and the body leaning away from
it (easing in over the first moment), the arm nearest the wall reaching forward and up along it, the far arm
pumping wide for balance, the head tipped toward where you're going.

Route animations (rope crouch, wall hug, pipe shimmy) now follow actual movement, so silent movement (Wire
runner, Ghost walker) still animates; the rope crouch shuffles one foot after the other.

## The obstacle course (Athletics 5000 + Sneak 5000)

South of the start (walk toward −Z from spawn, past z −56). Built for a character with both skills maxed;
every major move is needed. T sends you back to your last checkpoint at any time.

**Athletics, over lava** (touching lava: burned, sent back to the checkpoint)
1. **Start** (checkpoint): the timer starts when you cross the line.
2. Runway: jump the spike strip (spikes stab and bounce you), vault the rail, then crouch *before* the
   tunnel and slide under it (1.4 m). Let go of crouch once you're clear and you're up and running at full speed.
3. Jump and wall run along the wall over the lava pit to the **Landing** (checkpoint).
4. Wall-jump shaft: the platform is 13.5 m up, too high to run up. Kick side to side up the shaft, then lean
   in and catch the edge. **High platform** (checkpoint).
5. Sprint, jump, double jump (Skywalker) across the 9 m gap and catch the **Tower** edge, 2 m higher (checkpoint).

**Sneak, over poison** (poison hurts while you're in it and for 2.5 s after; the screen tints green)
6. Wire slide down from the tower to the **First roof** (checkpoint).
7. Tightrope to the next roof under sentry 1 (crouch low on the rope). **Pole roof** (checkpoint).
8. Jump to the pole's spire, hop spire to spire (watched by sentry 2) onto the **Ledge roof** (checkpoint).
9. Hug the wall along the 10 cm ledge (sentry 3 watches). At each window box: S to hang, shimmy under
   (A/D while facing the wall), W to pull back up. **Pipe roof** (checkpoint).
10. Jump to the pipe, shimmy along it onto the pole, slide down into the **Garden** (checkpoint).
11. Sentry 4 sweeps the garden. Crouch behind the crates (hidden; standing, you're seen) and roll between
    them (Cloaked dodge), or Vanish (V). Reach the **FINISH** dais: time and best time are shown.

**Sentries** turn red when they spot you, face you and shoot an arrow every 1.4 s while they can see you
(12% of your health per hit). Arrows lead a moving target and stick in walls. A dodge roll's invulnerable
window lets an arrow pass through you. After 3 s without seeing you, a sentry goes back to searching.
Course sentries have sharper eyes than the test sentry (2.2×). At Sneak 5000: standing still and upright on
the rope, sentry 1 spots you in a few seconds; crouched and moving on a route, you're much harder to see.

Blacking out (0 health) wakes you at the last checkpoint with full health. Hazards, sentries and arrows
pause while the game is paused.

## Looking around (head, chest, body)

Where you look and where your body faces are separate now.
- **Standing still:** turning the view turns the head first, then the chest twists to follow. Past
  about 85° the feet step round until the body faces the look again. Looking up or down tips the head.
- **Moving:** the movement keys always go by where you're looking. The hips face the way you're
  actually moving, up to 75° off your look: W+D is a diagonal walk, A or D alone is a crabbing walk.
  The chest and head stay turned toward your look.
- **Moving away from your look** (S, S+A, S+D): you walk backward instead of turning your back.
- **Third person:** turn the camera freely. The character doesn't spin with it; the head and chest
  follow, and the body only turns when the look gets too far round, or when you move.
- **Turning on the spot:** when the body catches up to the look, it steps round with small quiet steps.
- The crab-walk (A or D alone) is the non-combat sidestep. A proper combat strafe will come with combat mode.

**Running up a wall (head-on wall run):** facing the wall, the feet plant on it in turn, one knee
driving high as the other leg pushes down, and the opposite hand slaps the wall above. The body leans
into the wall with the head tipped back. Near the end of the run-up both hands reach up for the top.

## Melee combat (mace first)

Take a mace from the weapon rack (E at the rack), wear it from the Character page (Tab), then:
- **R** draws or sheathes it. Climbing, swimming, routes and sitting put it away.
- **Tap left mouse:** a forehand swing. **Tap again late in the swing** to chain the backhand, and keep alternating.
- **Hold left mouse:** with the Mace node *Overhead smash*, the mace rises overhead and charges for up
  to 1 s. Release to bring it down for up to 1.8× damage and a heavy stagger. Without the node, holding
  gives a plain heavy blow (1.3×).
- **Hold right mouse:** block. Blocked blows cost stamina instead of health (Guarded grip: −10% per rank).
- **Guard counter:** block a blow, then left-click while still guarding (within ~0.6 s, ~1 s after a perfect block — guard raised just before the hit): a riposte, or with a shield a bash and cut. 12 stamina, 2 s cooldown. A shield stops more of a blocked blow's damage and stamina cost than a weapon does.
- **Perfect combos:** time each next attack to the end of the swing — when the ring growing round the reticle meets the outer ring — for +20–50% damage (tighter window on light weapons, bigger bonus). Early still continues the combo without the bonus; too late ends it. A chime marks a perfect press (and a perfect block).
- **Specials (Shortsword tree):** learned specials replace the heavy (hold attack) depending on how many light attacks came before it — none: Closing thrust; 1: Pommel strike; 2: Hamstring cut; 3: Whirling cut; 4+: Thousand cuts (keep holding: a flurry until you let go). Right after a special, a perfect light or perfect heavy flows into its follow-up if learned (Extended lunge / Closing strike slash, Rising slash or Guard push, Tornado jab / Sky piercer); otherwise Flowing steel takes a perfect light into the next special.
- **Counters:** tap attack after a block for the quick counter (Winding thrust if learned); hold it for Rush (a shield bash, or a shoulder barge with no shield).
  A blow can only be blocked from the front. Sentry arrows can already be blocked this way.
- Swinging slows you to about half speed; guarding to 60%.
- Stamina per swing: light 8, heavy 14, charged up to 20.
- **Combat stance:** with a weapon drawn, the body squares up to your look and the legs step whichever
  way you move: a true strafe, backpedal and diagonals. Sheathed, you keep the relaxed crab-walk.
- **Damage:** the weapon's own damage × √(skill ÷ 100) × √(Strength ÷ 100) × nodes. Mace skill 400
  doubles it. Heavy swing gives +4% per rank, Momentum quickens chained hits, Bone breaker adds stagger.
- Every hit trains Mace (charged hits more).

**Training dummies:** three straw dummies stand just past the weapon rack. They rock with each blow,
float the damage (gold for a fully charged smash, orange for fire) and never break.

## Fire magic

Spells are learned (teacher, scroll or self-practice) and each has its own mastery (see MAGIC in the docs).
The first two fire spells:

| Spell | Difficulty | Mana | Cast time | What it does |
|---|---|---|---|---|
| Fire bolt | 1 | 8 | 1.4 s | A fast dart of flame, straight where you look. Sets the target burning (1.5/s for 3 s). |
| Fireball | 3 | 26 | 2.6 s | A slower ball that bursts on impact: full damage on what it hits, less out to 2.6 m, burning (2.5/s for 4 s). Walls shelter. It can catch you too. |

- **Two ways to cast:** a **quick cast** is voiceless: about 3× quicker, weaker and dearer until the
  spell passes mastery 100, and once started it finishes by itself. A **long cast** is spoken: full power,
  the cheapest mana, the longest cast (Incantation shortens it), and you hold the button until it goes.
- **How the hands are set decides the buttons** (the first click draws the focus if it's put away):

  | Main hand | Off hand | Left mouse | Right mouse |
  |---|---|---|---|
  | focus (wand, staff…) | empty | quick cast | hold: long cast (let go early: it unravels, no mana spent) |
  | focus | shield (or a weapon) | tap: quick · hold: long | the shield blocks |
  | focus | focus (orb, spellbook) | tap: quick · hold: long (right hand) | tap: quick · hold: long (left hand) |
  | weapon | focus | the weapon, as usual | tap: quick · hold: long |
  | empty | focus | — | tap: quick · hold: long |
  | empty | empty, focus bracelet worn | quick cast (bare-handed) | hold: long cast |
  | weapon | empty, focus bracelet worn | the weapon | tap: quick · hold: long |

  **No focus at all:** you can't cast, unless the spell is mastered past 100 (then it's part of you and
  your bare hands will do).
  On a tap-or-hold button, a press shorter than 0.15 s is always a tap, so a click is never read as a
  hold. **A long cast on a tap-or-hold button let go before it's done backfires, whatever your skill**,
  and costs the mana spent so far. Watch the cast bar: a spoken cast is slow at low Incantation (Fire
  bolt takes about 4 s at Incantation 10, 1.4 s at 100).
- The casting hand is the one holding the focus (right for a main-hand focus, left for an off-hand one).
- **Hold Q** for the spell wheel: your prepared spells round a ring (it grows with how many you hold,
  up to 30). Move the mouse toward one and let go to ready it; the view doesn't turn while it's open.
  **Z** steps to the next prepared spell. The readied spell shows beside the crosshair.
- **Hotbar:** hover a known spell (Magic page or bookshelf) and press 1–9, or drag it onto a slot.
  Holding that number speaks the spell straight away. Right-click a slot to clear it.
  The cast bar shows what's gathering.
- Casting hands gather in front of the chest, glowing brighter as the spell builds, then the casting hand
  thrusts to throw. With a weapon drawn, the free left hand casts.
- Speaking slows you to 55% speed; voiceless to 80%.
- Mana, backfire chance and power come from the spell's mastery, your focus (casting without a staff,
  wand or other focus below mastery 101 is weaker and riskier), and the mode. A **backfire** bursts in your hand.
- **Damage:** the spell's base × its power (mastery, mode, focus) × √(Fire ÷ 100) × √(Mind ÷ 100).
- Each cast trains the spell's mastery, Fire, the casting skill (Incantation or Voiceless) and Attunement.

## Spells: learning and preparing

- **Spell bookshelf** (left of the start, facing it; E): every spell, by school. **Study** a book to learn
  its spell (and prepare it, if there's room). Test grounds only: studied spells start at mastery 25,
  and **+25 mastery** pushes one along for testing.
- **Focus rack** (right of the start, past the weapon rack; E): staff, wand, orb, spellbook and focus
  bracelet. A focus makes spells stronger and safer until you master them past 100. It also has test
  training buttons for Fire, Attunement, Incantation, Voiceless and Mana control.
- **Preparing:** on the Magic page, the **✦ Prepare** button beside your MP opens the list of spells you
  know; click one to prepare it or let it go. Only prepared spells can be cast (the wheel and the hotbar
  draw from them).
- **How many you can hold prepared:** 3 at an average Intelligence and Mind (100), one more for every 20
  points of their average, up to 30 (at about 640).

## How fast magic is learned

- **Spell mastery 0 → 100** for an average caster (Intelligence and Mind 100, school Unskilled): about
  2,500 casts at difficulty 0, 3,100 for Fire bolt (difficulty 1, about an hour of steady casting),
  9,300 for Fireball (difficulty 3), 48,000 at difficulty 5. A higher gift and a higher school rank
  speed this up; backfired casts teach half.
- **The school** (Fire) learns by the spell's tier: a tier-1 spell teaches little and stops teaching much
  once Fire is past about 250; a tier-3 spell keeps teaching to about 550; tier 5 to about 860; tier 10
  to about 1,700. To rise in a school you have to move on to harder spells.
  Simulated: 300 Fire bolts take Fire from 100 to about 200, 3,000 to about 330.
- Incantation and Voiceless casting learn the same way, by the tier of the spells you cast with them.
- **A spell spoken in full teaches twice as much** as a voiceless one (its mastery, the school and
  Incantation): it takes longer, so it's worth more. A chant broken off partway gets no bonus.
  Casting only spoken, Fire bolt takes about 1,550 casts to master; only voiceless, about 3,100.
- **The road to 100 is quick, then slow:** about a third of the casts take a spell from 0 to 50, a quarter
  from 50 to 75, and the rest (over 40%) from 75 to 100.
- **Backfire chance** comes from the spell's mastery first ((1 − mastery/100)², so 25% at 50, 6% at 75),
  then is cut by the school and the casting skill used: each halves it once it's 100 + a span × (1 +
  difficulty) (school span 150, casting span 250). Fire 400 halves a tier-1 spell's chance; a tier-3
  spell needs Fire 700. Voiceless casting is 1.3× riskier until Voiceless skill makes up for it, and
  casting without a focus is 1.5× riskier.
  Simulated (average caster, Fire 100, Fire bolt from 0): mastery 25 after ~540 casts (backfire 53%),
  50 after ~1,000 (22%), 75 after ~1,700 (4%), 100 after ~3,100.

## The HUD (bottom left)

A red **health potion** with a blue **mana potion** just behind it (each shows its number and empties as
you lose it; hover for exact values and regeneration), a tall yellow **stamina vial** to their left, and a
pale blue **breath vial** beside it that appears only when you're short of air. To their right, a box shows
the **readied spell**: its school rune, name and mana cost (dimmed if no focus is in hand). The hotbar
stays at the bottom, moving right on narrower screens so the two never overlap.
