# Dungeon creator

`dungeon-editor.html` (also **Dungeon creator** on the title screen). The map data is `src/data/dungeon.js`,
the editor `src/editor/dungeonEditor.js`. The game will build 3D dungeons from the same data.

## The grid

- Each cell is **10 m × 10 m × 10 m**. Layers are 10 m apart (ground is layer 0; layers can go up and down).
- A cell holds one **piece**, written as a code: **part, theme, variant**.
  - `CJ1`: Corridor, Jungle, variant 1 · `RJ1`: Room, Jungle 1 · `JJ1`: Junction, Jungle 1 · `CD1`: Corridor, Dungeon 1.
  - Parts: C Corridor, R Room, J Junction (T), X Crossing, T Turn, S Stairs, E Entrance, D Dead end, K Checkpoint, B Boss.
  - Themes: D Dungeon, J Jungle, C Cave, R Ruins, I Ice, F Fire. Add your own (a letter, a name, a colour)
    in the editor; custom themes are saved with that dungeon.
- A piece has a **height** (10, 20, 30 or 40 m: 1–4 layers) and a **facing** (N, E, S, W).
- A tall piece fills the same cell on the layers above it, so nothing else can go there.

## Walls and openings

Each tile's grey edges are its **walls**; the gaps are where it opens. Facing north, a piece opens:

| Part | Opens |
|---|---|
| Corridor, Checkpoint | ahead and behind (N, S) |
| Stairs | behind (S), where you walk in at the bottom (see Stairs) |
| Junction | ahead and both sides (N, E, W): a T |
| Crossing | all four sides |
| Turn | ahead and right (N, E) |
| Entrance, Dead end | ahead only (N) |
| Room, Boss | walled all round, except where it meets another room (they join into one big space, no wall between) or a passage that opens into it (a doorway) |

Rotation turns the openings with the piece. An opening with nothing joining it (empty space next to it, or a
neighbour's wall) is marked with an **orange dashed line**, so loose ends show while you build. The wedge
points the way a piece faces (rooms have none).

## Stairs

A flight of stairs **climbs as many layers as it is tall**: red (10 m) one layer, yellow (20 m) two, green
three, blue four. You walk in at the bottom from its back (the side opposite the way it faces) and climb
toward the way it faces; at the top it comes out **into the cell ahead of it, on the layer above its top**.
That cell needs a floor that opens toward the stairs (a corridor, junction, turn or room facing back
at them).

- On the arrival layer, that cell shows a small **stairs badge** (steps and a blue arrow the way you step
  off). With nothing there yet it's an orange dashed box, "stairs up: needs a floor".
- The cell right above the flight's top is its **headroom**: shown with a blue dashed outline ("stair
  headroom"), red ("blocks the stairs!") if something's built in it.
- Built in 3D, a flight is 4 m wide, 0.4 m steps, rock either side and a roof 4.5 m above its top. Taller
  flights are steeper (two layers in one 10 m cell is a ladder-steep climb); switchbacks can come later.

## Themes and new maps

Themes are grouped (the Theme dropdown picks the group; its themes show as buttons below; a theme you add joins
the group showing):

| Group | Themes |
|---|---|
| Overworld | O Outer area, T Town, H Interiors (buildings) |
| Interior dungeons | D Dungeon, C Cave, R Ruins, I Ice, F Fire |
| Exterior dungeons | J Jungle, S Swamp, K Canyon |

Only the Dungeon theme has its own pieces so far; the rest build in the Dungeon style until theirs exist.

**New** asks what kind of map, then a flavour, which sets its Global settings (sky, fog, light, torches, weather,
look), the theme to paint with, and a name (`MAP_PRESETS` in `src/data/globals.js`):
- **Overworld:** outer area by day, dusk or night; town by day; town in the evening with the lamps lit.
- **Interior:** a house by day, a firelit tavern, a cellar or storeroom.
- **Inside dungeon:** dark dungeon (the deepest places), moody ruins, lit halls, damp cave, ice cavern, fire depths.
- **Outside dungeon:** jungle by day, swamp at dusk (with rain), canyon in the afternoon (with dust).
- Or a blank map with the defaults.

## Modes: Layout and Objects

The top bar switches between **Layout** (paint the pieces) and **Objects** (place things inside them); **M**
toggles. Cells are drawn big (160 px by default; the wheel zooms) with their **true footprint**, made by the same
code that builds the game: floors (tinted with the height colour), walls and rock (dark), pillars, rubble and
other waist-high things (tan), stair steps (lighter as they climb), torches (orange dots), checkpoints (blue
rings). Each cell keeps its code and height in a tag in the corner, its height colour round its edge, and an
orange dash on a side that opens onto nothing. Zoomed far out it falls back to the plain coloured tiles.

**Objects mode** (the palette on the left has tabs: Enemies, Traps (with Triggers), Loot, Furniture, Street, Lights,
Markers; catalogue in `src/data/objects.js`; saved in the dungeon as `objects`, each with its type, x and z
in metres from the map's top-left, layer, facing, and its properties). A faint metre grid shows over the cells
(half metres zoomed in).
- Click floor to place the chosen object; click an object to select it and drag it; Shift+click places on top
  of another; right-click deletes; R / Shift+R turns; Del removes; Esc deselects. Objects can't go inside walls
  or where there's no floor.
- **Snapping depends on the object:** enemies, traps, loot, lights and markers snap to a 0.5 m grid and turn in
  quarter turns; furniture is placed freely and turns 15° at a time. Hold Ctrl to flip it.
- **On walls.** Wall torches and dart launchers go on walls; spike traps and fire jets go on a wall when you place
  them within 0.8 m of one (otherwise on the floor; switchable in their properties). A wall thing snaps onto the
  nearest wall face (along it on the 0.5 m grid), faces out of it, and has a height up the wall. Dragging slides
  it along the wall or hops it to another.
- **Properties (right panel).** Selecting an enemy, container, trap or light swaps the layers list for its
  properties (Esc or Close puts the layers back):
  - *Enemies:* type (melee, ranged, caster, brute, vermin swarm, boss), a name, how many (drawn as a badge),
    behaviour when idle (stand guard, wander, patrol a route), and stats: level, health, damage per hit, armour,
    move speed, sight, hearing, attack range. Stats start from the type (`ENEMY_TYPES`); only the ones you
    change are saved (shown in bold); "Reset to type" clears them. Changing the type resets them.
  - *Patrol routes:* set behaviour to Patrol, press Edit route, then click the map to add points (numbered,
    drawn as a dashed route from the enemy, looping round or there and back); drag a point to move it,
    right-click removes it; Done or Esc when finished.
  - *Containers* (chest, urn, item on the floor, barrel, crate, and the rooms' own chests): contents (any item
    the game knows, typed or picked from the list: `weapon:…`, `item:…`, `potion:…`, `mat:…`, with a count),
    gold, locked and lock difficulty.
  - *Traps:* floor or wall, height up the wall, damage, and what sets it off: a timer (every so many
    seconds), anyone coming near (within a radius, then a reset time), or **its triggers**. For triggers, press
    Bind triggers, then click empty floor to place a new trigger (of the type chosen under New triggers) bound to
    the trap, or click an existing trigger to bind or unbind it; Done or Esc when finished. A trap can have
    several triggers and a trigger can set off several traps; bindings are drawn as dotted purple lines.
  - *Triggers* (on the Traps tab): **box trigger** (an area; set its width, depth and how high it reaches),
    **pressure plate**, **trip wire** (stretches across the passage from wall to wall through where you place
    it, across the way it faces; R turns it, dragging re-stretches it). Each: set off by the player, enemies or
    anyone; once only, or every time with a **cooldown**: it fires when someone steps in or on it, then again every
    cooldown seconds while they stay (0 = on the whole time someone is in or on it, off when they leave); a list of the traps it sets off (→ selects one,
    ✕ unbinds), and Bind traps to click traps to bind or unbind.
  - **Bind mode** (the 🔗 button at the top of the Traps tab, or B): for wiring many traps at once. Click a trap,
    then click each trigger it should answer to; or click a trigger, then each trap it should set off. Clicking a
    bound pair again unbinds it. The chosen one stays chosen (purple outline) until you click another of the
    same kind or empty floor; nothing gets placed or moved. B or Esc leaves. Deleting a trigger unbinds it. Rugs and box
    triggers sit under other things: clicking there picks what's on top.
  - *Lights:* height up the wall, lit at the start.
- **The rooms' own things.** The torches, standing braziers (brazier room, brazier gate) and the treasure nook's
  chest that pieces come with are selectable too (dashed outline): drag to move (torches stay on walls), right-
  click or Remove to take them out. Changes are saved in the dungeon as `presets` and the game builds from them.
  Fires that are part of a feature (chandelier, shrine bowl, campfire) stay put. If you change the layout round a
  cell, its torches can renumber, so a moved torch there may jump back.
- **Sounds** tab: ambience areas and music areas (big boxes; set the sound, volume, size, how far over the edge it
  fades in, whether it loops, and for music a priority where areas overlap) and sound sources (a point heard
  within a radius; loops or plays every so many seconds). Sounds are names for now (pick a suggestion or type a
  file name): there are no sound files yet.
- **Particles** tab: fog and dust motes over an area (size, depth or height, density, colour), and smoke, embers,
  steam and dripping water from a point (how far they spread, how high, density, colour). Point sounds and
  emitters show their reach as a dashed circle.
- **Traps and triggers work in the play test** (`src/game/dungeonObjects.js`). Triggers watch for the player:
  stepping in or on one fires it, then again every cooldown while you stay (cooldown 0: held on the whole time
  you're there); once-only triggers work the first time. A fire is a short burst of every trap bound to it;
  holding keeps them going. Traps on a timer or "anyone near" run on their own.
  - Spike trap: floor spikes shoot up / wall spikes stab out, hurting on contact.
  - Fire jet: flame roars up from a floor grate or shoots out of a wall nozzle (with a light), burning while
    you're in it.
  - Dart launcher: a dart flies out of the wall each fire (every 0.7 s while held); it sticks in what it hits.
  - Swinging blade: hung on a chain from the ceiling overhead, it swings across the passage while on, then
    settles.
  - Collapsing floor: the tile shakes and crumbles away, coming back after a while (you can't fall through yet:
    that needs holes in floors).
  - Pressure plates sink under you; trip wires dip.
  Damage is in health points (the player has 500+), once per moment per trap.
- **Enemies work in the play test** (`src/game/enemies.js`). Six archetypes (how they fight), each with variants
  (what they are; `ENEMY_VARIANTS` in `src/data/objects.js`): pick the archetype, then the variant, in the
  enemy's properties. A variant scales the archetype's stats and sets its simple model and missile.

  | Archetype | Variants | Fights by |
  |---|---|---|
  | Melee | skeleton, goblin raider, bandit, armoured knight | closing in, winding up, striking |
  | Ranged | skeleton archer, goblin slinger, crossbowman | keeping its distance, loosing arrows / stones / bolts |
  | Caster | fire cultist, frost witch, imp | keeping its distance, slower fire or frost orbs |
  | Brute | ogre, stone golem, cave troll | heavy, slow wind-ups |
  | Vermin | rats, bats, spiders (three per count) | rushing in and nipping |
  | Boss | bone king, flame warden, ancient colossus | heavy blows, and now and then a ground slam (a red ring shows where) |

  They stand guard, wander or walk their patrol until they notice you: by sight (in front, nothing in the way,
  within their sight range shrunk by how dark it is where you stand and how hidden you are: crouching,
  keeping still, Sneak skill; in the dark they have to be within a few metres) or by hearing (your noise, the
  same noise the stealth meter shows). Once they're fighting they keep better track of you.
  - **Perception** (a stat, ×1 by default) scales both their **vision** and **hearing** (two separate stats, in
    metres). Variants lean one way or the other: bats barely see but hear far, skeletons and knights hear less,
    goblins hear more, golems are dull.
  - **The shadow flask** (beside your stamina vial) has two colours. The purple liquid is how hidden you are right
    now: the light on you times your stance and Sneak (crouching, keeping still, skill); fuller = harder to see
    (hover it for the numbers; enemies see you within their vision × (1 − how full it is)). The red core is the
    most any enemy nearby has on you: up to half, someone's suspicious; above half, someone's hunting you (the
    flask's rim turns red).
  - **Slipping away.** A hunting enemy's hold on you (the red core) wears down while you stay hidden, even when
    it's near enough to see you, and faster the more hidden you are and the better your Sneak: the drain is
    (hidden)² × (Sneak/100)^1.6, so a low-Sneak character barely shakes anyone, a skilled one melts into the dark.
    Out of sight it fades on its own, slowly. Below half it no longer knows where you are and searches where it
    last saw you; at zero it gives up and walks home. Being seen in the light, getting close (within 2.5 m),
    hitting it, or making a loud noise brings its hold back up.
  - **Sneak levels** from being crouched near enemies who don't know you're there (more the more hidden you are),
    and from slipping away from ones that were hunting you ("They lost you.").
  - **Hit from where they can't see you,** they go looking that way (roughly where you are), and friends within
    10 m come too; when they get there and find nothing they look around before giving up.
  - **Spells are loud** to enemies (not to you): casting carries about 24 m (a fireball 30 m; voiceless casting
    is quieter), a fireball's burst 20 m around where it lands, and a **backfire 48 m**. Walls muffle it. Anyone who
    hears it comes to look.
  - **Ranged enemies miss** more the more hidden you are, and more at range. Then they chase where they last saw you, give
  up after a while and walk home. A raised guard blocks their blows and missiles; a dodge roll avoids them.
  Your weapons and spells hurt them (armour softens blows; numbers float up), with a health bar over them once
  they're hurt or after you; at zero they collapse and fade. Falling back to a checkpoint resets them.
  Traps hurt them like they hurt you, triggers set to "enemies" or "anyone" fire for them (so they can spring
  your traps on themselves), and they fall to their deaths in pits.
  Archetype stats are on the game's scale (melee 45 health, 45 damage; boss 600 / 150). They don't path
  round corners yet: they head straight for you and slide along walls.
- Loot, furniture, sounds and particles are still placement only.

## Global (the whole map's settings)

The third mode, **Global** (G), sets things for the whole map (`src/data/globals.js`; saved in the dungeon as
`globals`, only what differs from the defaults). The sheet shows the map's background colour. Changed settings
are bold; hover one for help. One-click **presets**: Dark dungeon (the default), Lit halls, Damp cave, Day
outdoors, Night outdoors (they set their fields and leave the rest). Reset all puts the defaults back.

| Section | Settings | In the play test now? |
|---|---|---|
| Setting | kind of place (underground, indoors, outdoors) | stored |
| Sky and fog | background colour, fog colour, where fog starts and ends, view distance (nothing past it is drawn) | yes |
| Area lighting | ambient light colour, light from below, ambient strength; sun or moon on/off, its colour, strength, time of day (where it sits), shadows | yes |
| Torches | light colour, brightness ×, reach ×, how many real lights at once | yes |
| Clouds and weather | cloud cover and colour, weather (clear, rain, storm, snow, falling ash, dust storm) and strength, wind direction and speed | later (marked *later*) |
| Rules | gravity ×, when you fall (back to the last checkpoint or to the start), default music and ambience | gravity and falling yes; music later |

In the game these apply inside the map's area (its sky region); outside it the test grounds keep their own sky.

## Low pieces (5 m)

10 m is very tall for tight spaces, so any one-layer piece except stairs can be **low**: the **5 m** height
button (pink on the map). It still takes one 10 m layer, but its ceiling comes down and rock fills the rest:
a low room's ceiling is at 5 m, a low passage is 3.4 m tall (instead of 4.5 m) with its torches at 2.4 m, and
a low chandelier hangs higher on a shorter chain. Picking (Alt+click) keeps it.

## Look (PS2-era style)

The dungeon aims for the PS2-era feel (Dark Cloud 2 as the touchstone), with modern lighting:
- **Hand-painted stone** (`paintStone` / `paintFlags` in `src/game/testGrounds.js`): warm blocks of varying length
  (0.75–1.5 m, 0.75 m rows), each with a painted light along its top and left edge and shadow along its bottom
  and right, soft brush dabs (warm lights, cool violet darks), chipped corners and the odd painted crack; floors
  are big flagstones painted the same way. On top, the world-space weathering: broad lighter and darker patches,
  grime creeping up the walls (cool and violet, like painted shadow), damp, worn floor paths and stains.
  Colours (`COLORS` in `src/game/dungeonBuild.js`) are warm and a little saturated.
- **Chunkier geometry:** skirting along the foot of every wall and a cornice under passage ceilings (and low
  rooms'), stone frames with a lintel round every doorway into a room, a square pilaster in each inside corner
  of a room, and a wooden beam across the ceiling of each passage cell. The trim is drawn but not solid, so it
  never catches your feet or wall runs; the pilasters are solid.
- **Glow and colour grade** (`src/gfx/postfx.js`): fires, braziers, crystals and brightly lit stone bloom softly;
  the picture is tone-mapped and graded (warm, neutral, cool, dusk or none) with a slight vignette. Per map in the
  Global tab (Look: glow strength, colour grade); on or off in the game's settings ("Glow and colour grading").
- **Darkness depends on the dungeon:** the Global presets run from Dark dungeon (near black, for the deepest
  places) through Moody ruins (readable, violet shadow) to lit halls and outdoors.

## Colours

The colour shows how much of the piece is left **from this layer up**: red 10 m, yellow 20 m, green 30 m,
blue 40 m. A 40 m room is blue on its own layer, green one layer up, yellow two up and red three up.
On the upper layers it's striped and marked "↑ below", since it starts lower down. The layer below shows
as faint dashed outlines, to line things up with. The small square in each tile's corner is its theme colour.

## Using it

| Do | How |
|---|---|
| Paint the brush | left mouse (drag to paint a run); painting over a piece replaces it |
| Erase | right mouse, or the Erase tool (E) |
| Pick up a cell's piece as the brush | Alt+click, or the Pick tool (I) |
| Rotate the brush | R (Shift+R the other way), or the Facing buttons |
| Height | 1–4, or the Height buttons |
| Change layer | [ and ], PageUp / PageDown, or click a layer in the list (it shows how many cells each holds) |
| Zoom / pan | mouse wheel / middle-drag or Space+drag |
| Undo / redo | Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z) |
| Save | Ctrl+S or Save (kept in the browser by name; Load lists them) |
| Files | Export downloads a `.dungeon.json`; Import loads one |

The map size (in cells) is set at the top; shrinking it drops pieces outside. The status bar shows the
cell under the mouse and what fills it.

## Variants (Dungeon theme)

The variant number picks the piece's look and features. The editor lists the built variants for the brush's
part and theme (click one), and the brush card and status bar name them. A variant that isn't built yet
builds as variant 1.

| Part | 2 | 3 | 4 |
|---|---|---|---|
| Room | **Pillared hall**: four pillars on plinths, torches on two of them (crosswise) facing the middle | **Brazier room**: a fire basin in the middle, broken stone lying about (cover to crouch behind) | **Crypt**: two rows of sarcophagi, two torches on each wall |
| Corridor | **Ribbed vault**: pilasters and an arch every half cell, torches on the ribs | **Half-collapsed**: a rubble heap to climb and a fallen beam at 1.3 m to duck under | **Pit**: a 2.5 m gap, 4 m deep with stakes at the bottom, to jump |
| Junction | **Fountain**: a basin of rippling water against the wall behind, a stream pouring from the spout, a torch over it | | |
| Crossing | **Pillar** in the middle with a torch on each face | **Chandelier**: a ring of fire hung on a chain over the middle, a column at each corner | |
| Turn | **Shrine niche**: an offering bowl with a small fire in the outer corner | | |
| Stairs | **Grand stairs**: 6 m wide with balustrades along both sides (the openings stay 4 m) | | |
| Entrance | **Gatehouse**: a stone frame and a raised portcullis at the mouth | **Brazier gate**: two braziers flanking the way in, red banners on the walls | |
| Checkpoint | **Campfire**: a ring of stones round a fire, a bedroll | **Spirit shrine**: an altar with a floating, turning crystal | |
| Dead end | **Statue alcove**: a statue on a plinth at the end, a torch either side | **Treasure nook**: a chest on a dais (for loot, later) | |

Variant 1 of every part is the plain version.

## Town pieces (Town theme T; the Outer area O uses them for now)

Palm Brinks (Dark Cloud 2) in spirit, pushed toward fantasy and early magic-punk. Built by `src/game/townBuild.js`.
Town pieces are open-air: no rock, no ceilings. A side with nothing next to it gets a stone parapet so you
can't walk off. A town piece above layer 0 with nothing under it stands on a retaining block down to the
ground, so higher streets read as terraces.

| Part | Variants |
|---|---|
| C J X T D (streets) | Parapets: N and S sides run full length, W and E stop short of them, so corners never overlap. 1 street · 2 lamplit (crystal lampposts) · 3 market (striped stalls on the closed sides). The road runs down the middle band and out each open side, with a sunken gutter; the rest is pavement on a 0.3 m kerb, with planters or benches. D ends in a big planter. |
| E | Town arrival: you start here. |
| K | Waystone street: a checkpoint waystone on the pavement. |
| R (plaza) | 1 benches and planters · 2 the Great Crystal on a stepped dais (solid, slowly turning, colour drifting, shards orbiting, its own light; dust-coloured lamps on the dais corners) · 3 warp circle (five pads in the crystal-dust colours, green yellow blue red purple, with beams of light) · 4 garden (a tree, flower beds) · 5 fountain (a two-tier fountain with a blue crystal on top, streams falling into a stone basin you can wade in, 0.45 m deep; planters in the corners). Lampposts along open edges. |
| S | Open stone steps with balustrades, lamps at the bottom. |
| H (Building) | Any size (see *Big buildings* below); solid; its front door faces the way it's turned. 1 timber-and-plaster house (jettied upper floors) · 2 shop (a shop front per 10 m of width: display window, striped awning, hanging sign) · 3 brick townhouse (three floors, iron balcony, quoins, slate roof) · 4 artificer's workshop (copper pipes, a glowing crystal tank, a crystal on the roof) · 5 tavern (a timber gallery across the front on posts, a big hanging sign, benches and a barrel outside) · 6 manor (brick, a columned porch with a pediment, a cross gable over the middle, dormers; 2×2 suits it) · 7 tower house (a square turret with a pointed roof on the front corner) · 8 row houses (one narrow house per 5 m of width, each its own colours, height and roof). All: shuttered windows (some lit) with flower boxes, lanterns by the doors, chimneys (more on wider houses). Taller pieces add floors; wider ones add bays of windows and doors. Side walls get windows where no building is next door. |
| L (Landmark) | Big public buildings, any size (3×3 suits most). 1 guild hall (tall stone hall, a columned portico with steps and a pediment, banners between the windows, a crystal on the roof) · 2 temple (a stepped base, columns all the way round, a pyramid roof, a crystal light inside and on top) · 3 market hall (an open arcade of columns below, a timber-framed hall above) · 4 clock tower (a tall stone tower, a clock face on each side, a spire with a crystal; 1×1 is fine, taller layers make it taller). |
| F (Filler) | Dead space between and behind the streets, any size. 1 walled garden (stone walls, lawn, trees, flower beds, a bench, a gate) · 2 storage yard (timber fence, crates and barrels, a lean-to shed) · 3 overgrown lot (broken low wall, long grass, bushes, rubble, a dead tree) · 4 back sheds (a jumble of outbuildings, roofs at different heights; fills a block solid) · 5 stone block (plain masonry up to its height, buttresses, ivy, grass on top: cliffs and level changes) · 6 tree grove. |
| Y (Skyline) | Plain tall blocks to fill the view behind the streets (less detail: bands of windows between pilasters, few trims). 1 tall row (narrow fronts of different heights) · 2 tower block (pyramid roof) · 3 tenement (flat roof with a parapet, chimneys). Make them 2–4 layers tall. |
| W (Canal) | Runs ahead and behind. 1 canal: a 4 m channel of swimmable water, walkways and low walls either side · 2 canal with a hump-backed stone bridge across. A canal ends in a wall where no canal continues it. |

Crystal lamps are lights like torches (they share the light pool) but don't flicker and carry their own colour.
The town's surfaces use painted materials: cobbles (road), paving (pavements, plazas), plaster, timber, brick
and roof tiles. Pick a map preset under Overworld → Town (day or evening) for the sky.

### Big buildings (any size)

H, L and Y pieces can cover more than one cell: set **Size** (cells wide along the front × deep, up to 5 × 5)
in the brush panel, or for a selected piece in Select. The piece is stored at its corner cell (lowest x and y);
the cells it covers can't hold anything else on its layers. Zoomed out it shows as one block with its code in the
corner and an orange line along its front; the ghost under the mouse shows the whole footprint (red if it doesn't
fit). Turning or resizing a placed one only works if it still fits. Roads stop at the whole footprint.

### Street clutter (Objects mode, Street tab)

Hand cart, market stall, street bench, planter, flower pots, sign post, notice board, well, water trough, hay
bales, stacked crates, barrel group, laundry line, crystal lamppost. They're built into the map as scenery
(`src/game/props.js`), solid where you'd expect (the cart's bed, the well's ring, the stall's counter), and stand
on whatever is under them: a raised street, a road's pavement, the terrain. The Furniture tab's pieces (table,
chair, bed, bookshelf, barrel, crate, rug, candle stand, weapon rack) are built the same way now. Props turn to
any angle (R / Shift+R, 15° steps): at a quarter turn they're plain boxes; otherwise turned solids, with hidden
upright boxes for collision a little inside each solid part.

## Paths (curved roads)

Roads drawn as smooth curves over the map, free of the 10 m grid. Data: `d.paths` (`src/data/paths.js`); built by
`src/game/pathBuild.js`. Canals and rivers will be drawn the same way (next).

- **Paths mode** (P, or the Paths tab): click empty ground to start a road, then click to add points. Finish with
  Enter, a double-click, a right-click, or by clicking the last point again.
- **Connecting:** a point dropped near another point snaps onto it, and one dropped near a road's centre line
  snaps onto the line. A green ring shows when it will connect. Finishing on another road's end joins the two
  into one road; landing on a road's middle makes a junction.
- **Points:** click a point to select it (it turns orange) and drag to move it. It snaps to 0.5 m; hold Ctrl for
  free placement. End points are drawn as squares.
- **Hotkeys:**

  | Key | Does |
  |---|---|
  | N | new road (it can start on another road) |
  | A, or Alt+click | add a point on a road |
  | C | continue drawing from the selected end |
  | F | flip the road's direction |
  | Del | delete the selected point |
  | Shift+Del | delete the whole road |
  | Tab / Shift+Tab | select the next / previous point |
  | Arrows | nudge the point 0.5 m (Shift: 0.1 m) |
  | = / − | road wider / narrower (Shift: pavement) |
  | L | lamps on / off |
  | Esc | cancel, then deselect |

- **Joining grid streets:** a point near the middle of a town street's open side (or a plaza's side) facing empty
  ground snaps to that street's mouth, and a lead-in point is added 2.5 m straight out, so the road leaves the
  street square-on. A grid street with a road arriving on a closed side opens its road toward it.
- **Adding points never warps the road:** each stretch is a cubic curve; a point added on a road splits it
  exactly (the new point and its neighbours keep their tangents). Moving a point puts it and its neighbours'
  facing sides back to automatic smoothing.
- **Meeting the town:** the paving widens to meet built cells within 3 m of it, and town pieces don't put a
  parapet on a side where a road builds next door.
- **Road kinds:** Street (4 m carriageway, 2.5 m pavements; the same as the grid streets), Avenue (8 m, 3.5 m
  pavements, lamps on both sides), Boulevard (12 m, 4 m pavements, a planted middle: trees in stone planters every
  12 m with a lamp between each pair), Grand avenue (the boulevard's 12 m and 4 m pavements with nothing down the
  middle). Widths go up to 24 m; any road can have the planted middle (or have it turned off).
- **Pavements meet house fronts:** within 3 m of a tile whose floor is a little higher or lower than the pavement
  (up to 1.2 m: a road sloping past a level house front), the paving eases to the tile's floor, so no low wall or step
  is left along the front.
- **Bridges (automatic):** where a road crosses painted water, or a dip of 2.5 m or more with steep sides (a ravine,
  a gorge; a gentle valley the road can follow isn't bridged), it bridges it from crest to crest: outward from the
  gap while the bank climbs more steeply than 1 in 5, so a road meeting a cliff over a river starts its bridge at the
  cliff top instead of dipping down first (src/data/paths.js bridgesOf, worked out from the plain terrain). The deck
  runs straight from end to end with a slight arch on longer spans, as a 0.9 m slab, and the water runs on
  underneath (carved, swimmable; the ground isn't pulled up to the deck). src/game/bridgeBuild.js adds the rest:
  stone (parapets, piers about every 12 m on the bed, arches between) or timber (post-and-rail fences, trestle
  bents about every 6 m). Parapets, piers and posts are solid; arches are for looks.
  Each end of the deck takes the road's height 3 m beyond it and the road runs level over those 3 m (a landing), so
  a bridge never lands on a narrow crest and drops away just after; the deck is laid before the road's smoothing,
  so the road beside a bridge isn't pulled down toward the gap.
- **Road paint (Paths mode, R):** brush a surface and/or a bridge style onto stretches of roads; drag along a road
  to paint that stretch, right-drag to put it back to the road's own. Surfaces: cobbles, flagstones (down the
  carriageway), a dirt track or gravel (the whole width, ruts down the middle), wooden planks. Bridge styles: Auto,
  Stone arches, Timber trestle, None (the road follows the ground). Either can be left as it is ('Leave as it is').
  Stored as p.paint = { mat: [[s0, s1, key]], br: [[s0, s1, style]] } (metres along the road); the selected road's
  panel sets the whole road's own surface and bridge style (p.mat, p.bridgeStyle). Painted stretches show on the
  roads in the creator (the surface down the middle, the bridge style as a dashed edge). A bridge takes the style
  painted at its middle. The surface rides to the shader in the road's pd attribute (100 per material).
  A dirt track or gravel has no kerb or pavement (the road surface right across); where it runs into a paved
  stretch the pavement narrows in from nothing over 4 m (starting with a small step up), and where a dirt or gravel
  road meets a paved street its surface cuts the pavement cleanly (no scraps of kerb at the junction); planks have no gutter. A bridge's
  deck has an underside (it isn't see-through from below).
  No lamps along a dirt track or gravel, and no road details (grates, manholes, patches) on a bridge, a dirt track,
  gravel or planks.
- **Pulling up onto roofs:** an edge with a walkable slope rising behind it (a roof's eave) counts as somewhere to
  stand, and a step up just behind the edge you're holding (the eave over the wall top) is the edge you pull up onto.
- **Roofs are solid:** every gable or hipped roof (houses, landmarks, fillers, props) has two hidden slopes up to its
  ridge (a hipped roof counts as a gable along its longer side), so you can land, stand and run on roofs. Tiny caps
  (dormers, finials) are left out.
- **Roads across layers:** a road climbs and dips through the layers, so it meets tiles a layer above or below its
  own as well as on it: it stops at them, its paving eases to their floor, and those tiles see it as a road beside
  them (no edge wall on a raised or sunken tile's road side).
- **Pavements merge:** where two roads' pavements come within 3.5 m of each other (and are within 1.5 m in height),
  the gap between them is paved over, sloping from one road's height to the other's, so there's never a strip of
  ground (or a hole) between close roads.
- **Details along the road** (on by default, per road): drain grates in the gutters every 16–22 m, staggered,
  plus a pair at every low point; manhole covers in the carriageway every 26–40 m; worn and relaid patches of
  cobbles, and darker or cracked slabs on the pavements. Laid on the surface (they follow slopes), never on
  steps or inside a piece, seeded from the road so they're the same every build. Decoration only.
- **Seam where a road meets a grid street:** a road ending right at a piece runs on to the piece's edge, so there's
  no crack between the drawn road and the grid street.
- **Per road:** carriageway width (default 4 m, the same as the grid streets), pavement width (default 2.5 m), lamps on or off.
- **What gets built:** a gently crowned cobbled road with a sunken gutter each side, a 0.3 m kerb and paved
  pavements, all following the curve. Crystal lampposts every 14 m, alternating sides.
- **Junctions build themselves:** everything is worked out from the distance to the nearest carriageway, so
  where roads meet or cross they simply join.
- **Grid pieces win:** a road never builds inside a cell that has a piece on its layer. It stops cleanly at that
  cell's edge, with a stone side where the heights differ. Road faces are drawn one-sided, so where they meet a
  piece back to back they don't flicker.
- **How it's made:** a 20 cm height grid per cell, with each triangle cut exactly along the kerb line and the
  pavement edge, so the kerb is a true vertical face. The material (cobbles, gutter, kerb, paving) is picked per
  pixel from the distance to the road edge. Collision is a few hidden flat boxes per cell (50 cm grid, merged).

## Heights (Eldermere is on a mountain)

Height can now change in small steps instead of only by whole 5 m and 10 m layers. Part 1 is in; the terrain
heightmap and automatic stairs and ramps between streets come next.

- **Select tool (V, Layout):** click a piece to select it without painting over it. Drag it to another cell, or
  use the arrow keys to move it a cell at a time (everything about it comes along; it won't drop onto another
  piece). Change its variant, raise it (Q / E), turn it (R), copy it to the brush, or delete it (Del). Erase is
  now X (E raises, as in Paths mode).
- **Off the grid (1 m snapping):** press F in Layout (or use the Snap button; Ctrl flips it while held) to paint
  and move pieces on the 1 m grid instead of whole cells. A piece keeps its cell and is nudged 0–9 m within it
  (`ox`, `oz` on the cell); the builder makes it as usual and moves everything it made over. Joins with
  neighbours (walls, parapets) still goes by its cell, so pieces placed off the grid don't open into each other.
  Roads do follow the real square: a road stops exactly at a piece's edge, wherever it sits, with a side face down
  to the slab's foot there, and its paving reaches out to meet the piece.
- **Height from roads (H, on by default):** a town tile painted or moved next to a drawn road takes the road's
  height. It looks just outside its sides for a road, the side it faces first, then its back, then the others.
  Streets and canals match the road surface (their road and pavements line up); plazas, buildings and the rest
  match the road's pavement (kerb height). Heights round to 0.25 m. A tile keeps following its road (`snap` on
  the cell) when the road is redrawn or re-heighted, until you raise or lower it by hand. In Select,
  "Snap to road height" turns following back on.
- **Past 9.75 m:** raising a tile past 9.75 m moves it up a layer (the rest becomes its raise there), and below 0
  down one, if that cell is free. Raising the brush past 9.75 m switches you to painting on the layer above. Road
  points can go from −10 m to 39.75 m; a road whose points are all 10 m or more up moves up a layer (and below
  its floor, down one), and the view follows it. Tiles snapping to roads look at roads on any layer and land on
  whichever layer the height puts them.
- **No lag on height changes:** the creator's footprint is rebuilt a moment after edits pause, not on every key
  press, and road fields are worked out once per set of roads.
- **Raised pieces (town themes):** in Layout, the "Raise" control (or Q / E, the same keys as for road points; Shift for 1 m) lifts the
  pieces you paint 0–9.75 m within their layer, in 0.25 m steps. Stored as `elev` on the cell. A raised piece
  stands on a stone block from its layer's floor; the block's sides are retaining walls where the neighbours
  are lower. A town piece puts a parapet on any side whose neighbour is more than 0.6 m lower. The tile label
  shows "+2 m" and so on.
- **Road heights:** each road point can have a height (`y`, metres above its layer's floor). Select a point and
  use Q / E (Shift: 1 m) or the "Point height" box. The road climbs evenly between points; the paving, kerbs,
  lamps and collision all follow. A stretch steeper than 1 in 4 (MAX_GRADE) is built as stone steps, with
  risers of about 0.18 m; the panel says when a road has any. A raised road's sides go down to the layer floor
  as retaining walls.
- **The gutter is cut exactly too:** the lip between the cobbles and the gutter is a small vertical face, so slopes
  and steps don't stretch the cobbles where they meet level ground.
- **Clean steps:** the side faces (kerb, gutter lip, pavement edge) are split at every riser so each piece sits
  at its own tread's height (no gaps, no crooked edge). Risers and side faces get a fixed material well inside one
  band, so pixels never flicker between cobbles and gutter stone. Road meshes receive shadows but don't cast them.
- **Steps are cut exactly:** on a stepped stretch the surface is cut along each riser into flat treads, with a
  vertical riser face between them (and the kerbs, pavement edges and collision follow the treads).
- **Joints between tiles (auto ramps and stairs):** where two town pieces' sides join (a street's open side, a
  plaza) at different heights, the joint follows the same slope rules as the roads: up to a step (0.42 m)
  nothing; up to 1 m a ramp (the roads' steepest grade, 1 in 4); up to 3 m stairs (0.18 m risers, 0.3 m treads);
  more than that a plain wall (the higher piece's retaining wall, a parapet along its top). The ramp or stairs are
  built on the lower piece, rising to the edge, in the road band (a plaza: its middle half), with a low wall each
  side; the higher piece puts a parapet along the rest of that side. Neighbours on the layer above or below count
  too (a tile on the terrain can land just over a layer line).
- **Safeguard, red walls:** pairs that can't take a ramp or stairs (a canal's end, a house's front) but differ by
  more than a step still get a red wall on the higher side, as does a drawn road arriving at a grid street at the
  wrong height (and the street doesn't open to it).
- **Features check for room:** road lamps aren't placed on or beside steps, nor where anything solid already
  stands (another lamp, a wall, a stall); they try again a metre further on.
- **Branches:** Shift+drag any point of a road (or select a middle point and press C) to pull a new road out of it.
  Dragging a point without Shift moves it, and bends its own road. Where two roads meet, their heights are blended
  over about 2 m so a level branch joins a sloping road without kinking (roads more than 0.75 m apart in height,
  one passing over the other, aren't blended, and steps are never blended into a slope).
- **Joins start level:** a road whose end sits on another road (a branch, or a road joined into one) keeps that
  road's height until it's clear of its paving, and only then starts to climb. Before, the climb was measured
  from the other road's centre line, so the two tore apart at its edge.
- **Roads across layers in the creator:** each stretch of a road is drawn on the layer its height puts it on, so a
  road on the ground that reaches 10 m shows on Layer 1 from there (and faintly on the layer above it). Points
  show, and can be picked and moved, on the layer their height puts them on; point labels still give the height
  from the road's own layer.
- **Slope arrows:** zoomed in, every stretch that climbs gets an arrow pointing uphill with its grade and rise
  (green gentle under 8 %, amber under 18 %, orange steep, red when it's built as steps).
- **Road ends and side walls:** a road's flat end gets a wall across it, and every outside wall of a road (its
  sides and ends) runs right down to the ground (layer 0's floor), not just its own layer's floor, so a raised road
  never floats. Its collision reaches the ground too.
- **More layers:** the Layers list shows every layer a piece or a road reaches, plus two spare above and one
  below (Up / Down still go further).
- **Connecting at height:** a point that snaps onto another point, a road, or a street's mouth takes that
  height, converted to its own road's layer (heights are measured from each road's layer, so a road on Layer 1
  meeting one on the ground lines up at the same real height). Joining two roads on different layers converts
  the heights the same way and then settles the joined road on the right layer. New points carry on at the last point's height.
- **One look:** drawn roads now use the same material as the grid streets (texture 9 in the shared shader), so
  cobbles, gutter, kerb and paving match exactly.

## Ground mode (terrain, surface, filler, climate, water, foliage)

The **Ground** mode (**T**) paints everything about the ground with one round brush (size: radius, **[ ]**). Tabs:
- **Shape** (keys 1–4): sculpt the terrain, a heightmap under and around the map (the mountain the town stands on,
  hills, dips). *Add terrain* starts it flat at a height you pick; **Raise**, **Lower**, **Smooth**, **Flatten**,
  with a strength. Right-click: the opposite (raise ↔ lower); Alt+click takes the height for Flatten. Heights go
  from −10 m to 39.75 m above layer 0's floor, a sample every 2 m (`src/data/terrain.js`, `d.terrain`).
- **Surface** (5): what the ground is made of, per 1 m square: Auto, Grass, Rough grass, Dirt, Mud, Sand, Gravel,
  Rock, Snow, Cobbles. Auto: grass, rock where steep, and what the climate makes of it. Right-click: back to auto.
- **Filler** (6): dead space filled with scenery (see *Dynamic filler* below), on the current layer.
- **Climate** (7): **Moisture** and **Temperature**, 0–9 (5 normal), per 2 m. Dry ground goes yellow, then sandy;
  wet ground deep green; cold brings frost, then snow on the flat (on auto ground).
- **Water** (8): **rivers, ponds and lakes**. *Paint water* lays 2 m squares (right-click dries them); each connected
  body of water lies at one level: by default (auto) the lowest ground anywhere under it, so a long river is level
  end to end and carves its channel down through higher ground; tick *Fixed level* to choose it (Alt+click takes
  the ground's height). The bed deepens away from the banks (0.5 m at the edge to 2.5 m); the banks slope down to
  the water over 6 m, and ground lower than the water beside it is raised to a lip so the water never hangs over a
  hole. The surface reaches under the banks, so the waterline follows the ground. *Draw flow* lays the way the water
  runs: click along a river (Enter, double-click or Esc to finish; right-click a line to delete it), with a speed.
  Every square of the bodies it crosses runs along its nearest part, fading out past its ends (a lake at the end of
  a river lies still) and more than 12 m to the side. In the game the ripples drift with the current and the current
  carries you while you swim (half as much while wading).
  The carving is worked out once (`src/data/water.js`) and everything uses the carved ground: roads following the
  ground, tiles settling on it, foundations and road walls reaching down to it. Water squares under a road or a
  piece hold no water and aren't carved, but still belong to their body, so a road across a river doesn't split it
  or lift its level: the road crosses on its own level (a causeway, until bridges exist), with water either side.
  The water never spreads past the body onto ground that's been cut below it (by a road beside it, say).
- **Foliage** (9): what grows and how thick (tall grass, wildflowers, bushes, reeds, trees, pines; density 1–9),
  per 2 m. Stored for now; the game will grow it later.
The paint layers are in `src/data/ground.js` (`d.ground`). The map shows the terrain as a colour ramp (blue below 0,
greens, yellows, browns, white at the top; a legend in the panel), hill-shaded, with contour lines every metre,
bold and numbered every 5 m, and the active tab's layer over it. Those pictures are drawn once and reused until
something changes, so big maps stay quick.

In the game everything above is **one ground surface** (`src/game/ground.js`): indexed meshes on a 2 m grid, one per
20 m chunk, painted by the shader (texture 10) from a splat map (1 texel per square metre: surface, moisture,
temperature, wetness; neighbouring squares blend), with an earth skirt round the map's edge. It **warps** to meet
what stands on it: within 4 m of a piece it bends to the piece's floor (and is left out under it, unless the piece
is a cellar more than 4 m under it); within 3.5 m of a road it meets the road's edge (the pavement's top), cut down
or built up to it, so there's no trench or wall along a road; under the paving it's left out (unless the road runs
well above it). So a tile or road on
uneven ground never has the ground poking through it or a hole beside it, and no retaining walls are needed.
Collision is a 1 m grid of columns.

**Tiles sit on the ground.** With terrain on the map, a town tile sits on it by default: its floor goes to the
terrain's average height under it (to 0.25 m, moving to the layer above or below if need be), and follows when
you sculpt. A tile that follows a road takes the road's height instead. To take a tile off the ground, select it
and turn off *Sits on the ground* (raising or lowering it by hand does that too); turn it back on to drop it back.

### How everything handles height (with terrain)

- **Town tiles** (any size): sit on the terrain by default (see above); a tile with a road beside it takes the road's
  height instead, so plazas, parks, streets and house fronts line up with the roads (they re-settle whenever roads
  change, and when a map is opened in the creator). Their foundation reaches down to the lowest
  ground under them, so a tile on a slope never shows a gap below its downhill edge, and the ground warps to meet
  its floor all round (within 4 m), uphill and down. Terrain is left out under a piece unless the piece is more than
  4 m below it (a cellar). Neighbouring tiles at different heights join by ramps, stairs or a wall (Heights section).
- **Roads:** follow the terrain by default: their height comes from the ground along their length (every 4 m,
  averaged across the road and smoothed; steps where it's steeper than 1 in 4), and their ends keep their point's
  height where they sit on another road. Untick *Follows the ground* in the road's panel to set it free (its points
  then decide, starting from the shape the ground gave it); changing a point's height (Q / E, the box) does that
  too. A road following the ground whose end sits on another road takes that road's height there, so junctions and
  branches meet level. The ground meets a road's edge at the pavement's height (from either side) and is left out
  under the paving. Their side walls and collision reach down to the terrain where it dips below them, and the ground warps to
  just under their paving within 3.5 m.
- **Props** (furniture, street clutter): stand on the highest solid ground under their middle in their layer
  (street, road, terrain, filler); a corner can lift them a little (a kerb), but never onto a wall or roof. If
  nothing is there, the ground in the 10 m below (terrain dipping under the layer's floor).
- **Filler:** on terrain where the terrain is in its layer; otherwise it makes its own ground, its height blended
  smoothly from the tiles and roads around it (it tapers between them, no cliffs; tiles just over the layer line
  count), with a skirt down to the terrain or the lowest layer along any edge with nothing beyond.

## Dynamic filler (Ground mode, Fill brush)

Dead space painted with a round brush (the **Filler** tab, key 6 in the Ground mode), on a 1 m grid, on the current layer
(PgUp / PgDn change layer). Right-click erases. Kinds: **Auto** (match nearby), **Greenery**, **Yard**, **Rubble /
overgrown**, **Back sheds**. The creator shows painted squares in the kind's colour.

In the game (`src/game/ground.js`, with the terrain; data in `src/data/fill.js`, stored as `d.fill`) it keeps out
of pieces by itself and reaches 2 m in under a road's edge (dipped below the paving, so there's never a gap along a
curve), and becomes:
- **Greenery:** grass; bushes, flowers, and trees where there's greenery all round.
- **Yard:** packed earth; crates and barrels; a timber fence where it meets open space.
- **Rubble:** long grass, rubble piles, weeds, the odd bush; bits of broken low wall along its edge.
- **Back sheds:** cobbles; small outbuildings on a 4 m grid wherever a whole 4 × 4 m square is sheds.

**Auto** takes after the nearest town tiles, weighted by distance (streets and buildings: sheds and yards; gardens
and groves: greenery; an overgrown lot: rubble; plazas: greenery and yards), picked with smooth noise so the kinds
blend in patches between different tiles. Big features (trees, sheds) only appear where enough of one kind is
together, so blend zones stay small-scale. No edges except where they make sense (yard fences, rubble walls).
The ground sits on the terrain where there is terrain on that layer; otherwise its height is blended from the tiles
and roads around it.

## Torches

Torches hang **only on walls and features**: on room walls (one in the middle of each plain wall, a pair
beside each doorway), on a corridor's side wall (alternating sides cell to cell), on the walls of junctions,
turns and dead ends, along stair walls (rising with the steps), and on pillars and ribs. Braziers stand on
the floor. Each torch is a wall plate, an iron bracket and a leaning wooden stick with a burning head.

**The ones that matter light up.** A pool of 12 real lights follows you. About eight times a second they're
handed to the torches that matter most: the nearest, with ones ahead of you counting more than ones to the
side (about 1.5× as far) or behind (about 2×); anything within 5 m always stays lit. A torch only burns
while it holds a light: it flares up as you approach (in about 0.2 s) and gutters out as it drops off the
list. Unlit torches are cold sticks, with no flame showing in the distance. So a big dungeon costs no more
than a small one.

## Checkpoints

Touch a checkpoint (walk within about 2.4 m) to make it yours: its rune or crystal glows bright. When your
health hits zero you come back standing beside your last checkpoint at full health. Every dungeon starts
with one: a **waystone behind you at the entrance**, already yours when you arrive. The **Checkpoint (K)**
part is a straight passage with its resting place against the left wall: variant 1 **Waystone** (a standing
stone with a glowing rune), 2 **Campfire**, 3 **Spirit shrine**.

**Pits kill.** Falling into a pit corridor's gap takes all your health, back to your checkpoint.

- **The ground near roads, pieces and water** is built on a 1 m grid (2 m elsewhere), and only the squares entirely
  under a piece or the paving are left out, so its edge follows a curved road or a plaza's edge closely instead of
  leaving square gaps. A skirt hides the seam where the fine and coarse grids meet.
- **Water shores are rounded:** after carving, the bed and banks are blurred so the shore follows a smooth curve
  rather than the 2 m painted squares (a painted diagonal's zig-zag straightens out, sharp outside corners round
  over). A straight stretch of shore always stays under the water, so a 2 m stream never closes up, and ground lower
  than the water is lifted to a lip within 4 m of it.

- **Water surface (v2):** each body is one mesh on a 1 m grid, drawn by its own shader (`src/gfx/water.js`).
  Every corner knows its depth, its distance from the shore and the current there. Colour goes by depth (clear
  and green in the shallows, so the bed shows through; dark blue-green in the deep), ripples are carried along
  by the current without stretching (two copies half a cycle apart, cross-faded) with a slow wind layer on top,
  the sky is reflected more at grazing angles with a sun glint, and foam forms along the shore and over fast
  shallows. The light follows the sky colour (darker at night).
- **Deep ground:** the terrain goes down to −40 m (four layers under the ground floor). Raise or lower while you're
  on another layer jumps the ground straight to that layer's floor first (on layer −1, lower drops it to −10 m at once,
  then carries on down; on layer 2, raise lifts it to 20 m). The earth's skirts and collision reach under the lowest
  ground, swimmable water reaches the deepest bed, and really deep water is darker.
  Filler never lays a plate over painted water, or over ground dug below the ground floor from layer 0 or under (a
  pond or pit isn't capped by filler at the layer's height).
- **Auto level fills the hollow:** an auto body's level is where it would spill: the lowest ground round its shore
  (its edge squares), so a sculpted pond or lake fills with real depth (darker in the middle). Where that's no higher
  than the lowest ground under it (a channel on flat ground) it's that lowest ground, and the bed is carved down as
  before. Squares at the map's edge don't count as shore (water painted off the map carries on beyond it). A river
  with a flow line follows its line downhill, filling its channel up to the lowest of its banks close by (within
  10 m) rather than lying at the bottom.
- **Smooth shores:** the surface isn't drawn over the painted squares: it spreads from them across whatever ground
  lies under the water (at most a square further, never under a road or piece), so its edge is the ground's own
  smooth contour. The banks round the water are kept a little above it, so the water never sheets over them.
- **Rivers run downhill (waterfalls and rapids):** a body with a flow line through it no longer lies at one level.
  Along the line its surface follows the lowest ground downstream (never rising), smoothed into pools. Where it
  drops at least 2 m in all (in steps of 1 m or more, within 4 m) with water backing it (level for 4 m before the
  lip) it falls; smaller or unbacked drops are smoothed into rapids instead: a streaming curtain from the upper surface to the lower, with churned white
  water below. On a steady slope it runs as rapids: rougher, white, and up to 2.5× faster. Squares off the line (a
  lake at the end, a wide bay) take the level of the nearest point on it. Bodies with no flow line, or with a fixed
  level, stay flat at one level as before. Swimming follows the steps (the current can carry you over a fall).
- **Cliffs (src/game/rock.js):** ground steeper than about 45° (fully by 56°) stops being a slope and becomes rock.
  Its squares are cut to a quarter metre and pushed in and out along the slope by a rock shape (broad bulges and
  hollows, knobs, strata that step out as small ledges); the ground shader paints it as stratified rock with
  cracks and moss on the ledges (no more paving texture on steep ground). Never under roads or pieces.
- **Every cliff is climbable:** each stretch of cliff facing one way (8 directions) is a climbing face like the
  test grounds' cliff (u along it, v up it; foot and top follow the ground). Its collision columns carry the face,
  so walking into a cliff and climbing works as on the test cliff. Rock under a waterfall is wet (slippery). Cliff faces are always painted as rock (moss only on ledges that face
  straight up). Leaving the rock (letting go, stepping down) steps the body straight out from the face if it's inside
  the cliff's collision, so it never pops out behind.
  A cliff square's collision is solid up to the top of the cliff behind it: one climbable wall at the foot, not a
  stair of 1 m columns.
- **Waterfalls:** each drop on a river's line is one sheet as wide as the river at its lip. It leaves the edge on
  a falling arc, one profile for the whole sheet (from the rock at its middle; it never wraps round the rock at
  the sides, it fades where that rock stands in front); streaks stream down, speeding up as they
  fall, clearer near the lip and white lower down, soft at the sides. Two drops in a row make one fall.
  At the lip the bed rises to just under the surface over the last few metres (shallow water runs over the edge, no
  deep pool right up to the drop), and the upper surface stops where the ground falls away (no flat shelf of water
  hanging out over the drop).
- **Spray (src/gfx/water.js):** mist rises off the foot of every fall and droplets are thrown out of it; white flecks
  hop along over rapids and in the wake of boulders. Particles loop in the shader (no cost on the CPU).
- **Shores:** the ground under and beside the water is sand and gravel (patches of each), thinning out up the bank
  over about 5 m and 1.5 m of height, darker where it's wet. The ground shader also has fine detail now (grain,
  blade streaks and tufts in grass, small bare spots, specks in gravel and dirt, ripples in sand).
- **Water sound (src/game/audio.js):** one steady river bed near flowing water (louder and brighter where it runs
  rough), a fall's roar, and gurgles: short random splashes where the water breaks on boulders and stones (from
  clutter). The beds drift slowly at random, never a regular wobble. Kept game-sized: a river is heard within about
  20 m (from a road along its bank), a fall within about 35 m, at modest volume; each pans toward its side.
- **Clutter (Ground mode, Clutter tab, key 0):** a density per 2 m square; what appears depends on where it lands
  (src/game/clutter.js). In water: stones and driftwood along the edges and in the shallows, stones on the bed, and
  now and then a big boulder out in deep water standing out of it (solid, climbable) with foam round it and a white
  wake downstream in a current. On land, by surface: scree on rock and cliffs, pebbles and shells on sand, pebbles
  on gravel, pale rocks on snow, stones and sticks on dirt and grass, the odd fallen log. Never on roads or pieces.
- **Currents:** a flow line's speed is the speed mid-stream; it falls off across the water (a parabola) to nothing
  at the banks. Swimming uses the same field: the current carries you at its local speed.
- **Swimming in a current:** still water refills stamina as before; a slow current stops the refill and drains a
  little; faster water drains faster (less for a skilled swimmer; rough conditions, set later by the weather,
  make it worse). Out of stamina in a current you're swept along and lose health (up to 6% a second).

- **In the creator:** painted water shows faintly in every mode (not only Ground mode), so features can be judged
  against it. Roads show their stretches on other layers faintly (a road follows the ground through the layers), and
  the selected road always shows its points, so a road drawn from another layer can still be seen and joined.
- **Shadows** follow you in whole shadow-map texels (no shimmer) with a normal bias (no dark acne patches on faces
  lit at a slant); zero-area faces are skipped (they'd have no normal and draw black).

## Foliage (plants)

- **Trees, pines, dead trees and bushes: src/gfx/trees.js (the tree system).** Each species is grown by a small
  branching program: a curved trunk with root flare, primary limbs, secondaries (and twigs on dead trees), each a
  tapered bark tube; leaves are alpha-cut cards carrying a painted spray of hundreds of leaves (or needles), lit as one
  soft crown, darker inside it. Species: oak, elm, birch (tree variants 0–2); pine, spruce (pine 0–1); a dead oak and a
  snag (dead 0–1); a plain, a flowering and a berry bush (bush 0–2). All textures live in one painted atlas, so a
  species is one material. Three levels of detail, crossfaded by a screen-door dither: near (the full tree, ~1,100–
  1,300 triangles for broadleaf, ~2,200 for pines, casting shadows) to 45 m (bushes 30); mid (trunk, main limbs, a
  quarter of the cards at twice the size, ~250–320 triangles) to 130 m; far, an impostor: one quad showing a picture
  of the tree from the nearest of 16 angles, with its lighting directions baked alongside so the sun still lights it
  properly (pictures taken once when the map loads). Drawn as one instanced mesh per species and level (about 30 draw
  calls for every tree on the map, plus near ones in the shadow pass): each frame, just before drawing, the CPU sorts
  every tree into its level by camera distance and drops those out of view (keeping any within 45 m for their
  shadows). Wind: the trunk leans gently with the gusts, each main limb sways slowly on its own rhythm with its
  branches, leaves flutter sideways (never in and out, so the crown doesn't seem to breathe).
- **Tree viewer (tree-viewer.html, open it from the game folder's local server like index.html):** one species at a
  time, built up stage by stage (roots, trunk, branches, leaves), at each level of detail, with a wind slider; drag
  to orbit, wheel to zoom.
- **Grass and small plants: src/gfx/foliage.js:** grass (a patch of ~34 blades over a square metre per plant), tall
  grass (a patch with seed heads), wildflowers (six colours, with leaves and centres), reeds, cattails, lily pads
  (some flowering), and under water eelgrass ribbons and pondweed. One instanced mesh per kind, variant and level of
  detail for the whole map (about 30 draw calls), refilled from the 32 m chunks in view when the camera moves or turns. Every place that
  made a plant before (filler greenery, the tree grove, walled garden and overgrown-lot fillers with lawns of grass
  patches; plaza planters with soil, flowers and a bush in the big ones; the garden plaza's tree; a boulevard's trees,
  flower boxes) uses these two systems. Plants follow a piece nudged off the grid (ox/oz).
- **Grass levels of detail and fading:** grass has three (the full ~34-blade patch to 22 m, 13 wider blades to 50 m,
  6 to 95 m), tall grass likewise (to 100 m). Each step crossfades, and grass and small plants grow up out of the
  ground at the edge of their range instead of popping. Small plants use a cheaper
  per-vertex lit material; blades share their corners (indexed), and chunks out of view or range aren't drawn.
- **Wind (physics clusters, two layers):** far off, the wind is a formula in the shader: a small repeating noise texture
  (gust strength, sideways sway) rolls across the map along the wind, and every plant reads it once a touch upwind by
  its own random amount, so a patch of dozens of blades bends as one and neighbours a moment apart. No CPU work per
  frame. Near the player (out to ~30 m) a real spring grid of 64 × 1 m cells, 30 updates a second and scrolling with
  the player, adds each cell's lag and overshoot chasing the gusts, and pushes plants aside where you walk (grass,
  reeds, flowers; not trees), springing back after you pass (~0.6 ms per update). The shader blends the grid in toward
  the player so there's no seam. Open for the weather: the play loop's dungeon lights expose foliage.wind = { dirX,
  dirZ, strength (0..1, more for storms), gust (0..1), speed (m/s the gusts travel) }, and foliage.pushers (a list of
  { x, z, r } for anything else that should push plants aside: enemies, spells).
- **Where they grow (src/game/foliagePlace.js):** painted (Ground mode, Foliage tab: tall grass, wildflowers,
  bushes, reeds, trees, pines, with a density) always grows; painted grass in water grows as eelgrass. Where nothing's
  painted and "Grow on their own" is on (d.ground.passive, on by default): still water gets thick reeds and cattails in
  the shallows, lily pads further out, and stones and old logs along its edge; the bed of still or slow water (0.6–9 m
  deep) gets meadows of eelgrass and pondweed; slow water's banks get reeds and tall grass; open country at least a
  block (10 m) from any building gets grass everywhere (lusher where it's moist, yellower where dry), wildflowers,
  bushes, and woods in patches (pines where it's cold). Never on roads, pieces, filler, cliffs, cobbles, bare rock,
  snow (passive) or fast water, and kept back from roads and buildings (grass and flowers 1 m, bushes 2 m, trees 3 m).
  Plants sit on the ground as drawn (the fine 1 m grid near roads and water), sunk a little on slopes. Each spot is
  a hash of its square, so a map always grows the same plants.

## Performance notes

- The creator draws roads first and works them out after: while a road is being drawn, dragged or painted, only its
  lines are redrawn (heights, bridges, the carved ground and tiles that follow roads wait, using the last full
  result); when the edit ends (mouse up, Enter) everything is worked out once, a moment after the last drawing. The
  map's pieces are indexed once per frame for drawing (instead of searched for every cell), road samples are kept
  until a road's points change, and the ground's checksums are worked out once per frame.
- Street lamps keep clear of another road's carriageway at a junction (and of a dirt or gravel road's whole width).

- In the game, the player only checks the shapes within 12 m of it each frame (a grid of the map's shapes), so a big
  town with thousands of boxes doesn't slow movement down.
- The creator builds its footprint without the ground and props (they aren't drawn there), and draws the ground's
  pictures once per change.

## Play test

**▶ Play test** (top bar) opens the game in a new tab with your latest character, standing at the
dungeon's entrance (E; without one, at the first piece). The dungeon is built east of the test grounds;
inside it's dark: unlit stone is near black and the gloom closes in within about 30 m, so you see by the torches.

**Sky regions.** The sky, fog and ambient light come from the region the camera is in. Outdoors it's the blue
sky; anywhere inside a dungeon's bounds the sky is black, so a long hall fades into darkness, never into blue.

How it's built (`src/game/dungeonBuild.js`), proof-of-concept Dungeon style:
- **Rooms:** the whole cell open, walls where it doesn't join another room, a doorway (4 m × 4.5 m) where
  a passage opens into it, the ceiling at its full height.
- **Passages** (corridor, junction, crossing, turn, entrance, dead end): a 4 m wide, 4.5 m tall channel
  from the middle out to each open side, cut through solid rock. Open sides leading nowhere are capped.
- **Stairs:** as above.
- Stone-block walls and floors; torches as above.


## Creator speed: moving, turning and placing pieces (25-Oct-z13)

- After every edit the creator rebuilds the map's footprint, and the roads were the slow part (seconds on a big town):
  every road cell was worked out again even when the piece moved was nowhere near it. Now each road cell's result is
  kept (src/game/pathBuild.js `cellCache`), keyed by the roads and terrain (the road field), the carved ground under
  it (sampled) and the pieces within 7 m of it; only cells near the piece you moved, turned or placed are rebuilt.
  On a 50 × 50 town with 9 roads a rebuild went from ~6.4 s to ~0.45 s on the test machine (much less on a real one).
- The layer list's piece counts are worked out with the cell index (was ~0.3 s per edit).
- The rebuild waits 120 ms after an edit (was 250 ms).
- **Snap modes show:** with 1 m snapping (F, or Ctrl held) a fine 1 m grid is drawn over the cells round the mouse,
  and the select tool highlights the metre under it instead of the whole cell.


## Road editing speed, slivers, other layers (25-Oct-z15)

- **Road edits rebuilt everything:** a road cell's cache key was the whole road field, so moving one road point
  rebuilt every road cell on the map. It's now the road segments that can reach the cell (their line, widths, heights
  and the road's own settings), plus the carved ground and pieces near it: editing a road rebuilds only the cells along
  it. And a bug in the dirt-track taper (src/data/paths.js `bareAt`): 'no dirt on this road' (null) was treated as 'not
  worked out yet', so it was worked out again on every one of millions of lookups. A road point edit on a 50 × 50 town
  went from ~6.2 s to ~1.3 s on the test machine (much less on a real one).
- (A 'no pavement slivers' rule — filling pavement between carriageways closer than 1.6 m — was tried and reverted:
  it warped pavements that were forming correctly.)
- **Pieces on every other layer** are drawn on the map in the creator: a soft shaded footprint with its height (purple
  above the layer you're on, grey below), so the town's buildings are always in view.
