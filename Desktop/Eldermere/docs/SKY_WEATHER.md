# Sky, light and weather

## Time of day (src/gfx/sky.js) — built 25-Oct-t

Outdoors the day runs on a 24-hour clock with **eight core looks**, each holding for its stretch of the day:

| Look | From | Sky / light | Lamps |
|---|---|---|---|
| Night | 0:00 | deep blue, stars, moonlight (soft, cool shadows) | lit |
| Before dawn | 4:30 | violet horizon, fading stars, low moon | lit |
| Dawn | 6:00 | orange horizon, low warm sun, long shadows | out |
| Morning | 8:30 | clear blue, warm white sun | out |
| Noon | 11:30 | brightest, sun high, neutral grade | out |
| Afternoon | 15:00 | warm, slightly hazy | out |
| Dusk | 18:00 | orange-pink horizon, low red sun | lit |
| Evening | 20:00 | violet, first stars, moon rising | lit |

When the clock passes into the next look the light eases over to it (20 s by default) and then holds — no constant
slide, and the sun (or moon) only moves at each change, so shadows stay still and crisp in between. Each look sets:
the sky dome's top and horizon colours, the fog (colour and distance), the sun or moon (colour, strength,
direction), the ambient light (sky and ground colours, strength), the stars, the glow strength and the colour grade.

- **The sky dome:** a gradient from horizon to top, a darker haze below the horizon, the sun's disc with a glow, the
  moon's disc at night, twinkling stars. Drawn behind everything; fog blends far ground into the horizon colour.
- **Lamps** (street lamps) burn from dusk to dawn. With them out and no torches on the map, the pool of real lights
  is switched off altogether, so daytime pixels don't pay for lights at all.
- **Maps:** outdoor maps use the clock (creator Global tab → *Time of day*: start hour, *Time passes*, how many
  real minutes a day lasts, how long the change between looks takes). The map's own fog distance scales the looks'
  fog (a map with far fog sees further on every look). Underground and indoor maps keep their own fixed light (the
  *Sky and fog* and *Area lighting* fields), inside their bounds.
- **In the game:** the F8 panel has a time slider (jumps straight to that look) and a *Time passes* switch.

## The lab (sky-lab.html)

A test scene (grass, trees, bushes, flowers, houses, a road, a street lamp) with the clock under your hand: a time
slider, a button per look, *Time passes* with the day's length, and how long the change between looks takes. Drag
to look round, wheel to zoom. Weather joins it here as it's built.

## Weather (src/gfx/weather.js) — 25-Oct-u, reworked 25-Oct-w

Four layers that work together but can each be set on their own:

- **Weather** — what's in the air and its tint on the light. Each kind also brings its own clouds, wind and fog.
- **Clouds** — a type and a cover. *With the weather* follows the weather; pick a type to take it over (fog under
  clear skies, clouds with no rain…). Types: clear, high streaks (cirrus), scattered, big heaps (cumulus), broken,
  overcast, low grey sheet (stratus), storm clouds, magic. Drawn on the sky dome: billowy domain-warped heaps lit on
  the sun's side and darker underneath, and cirrus drawn out along the wind; white in sunlight, dim at night.
- **Wind** — strength 0–2 (0.25 a breeze, 0.5 windy, 1 a gale, 2 a storm) and gusts; the map sets where from. It bends
  the grass and trees (up to 2: hard), drifts the clouds and slants what's falling. *With the weather* or set it.
- **Fog** — thickness (1 the map's own, 0.25 thin, 2 thick, 8 a wall). *With the weather* or set it. (The drifting
  mist puffs are gone: they clumped into white blobs.)

Kinds: Clear · Cloudy · Drizzle · Rain · Downpour · Thunderstorm · Snow flurries · Snow · Heavy snow · Blizzard
(horizontal snow, whiteout) · Sleet (rain and wet snow) · Fog · Sandstorm · Dust storm · Windstorm (leaves and debris)
· Magic flare-up (rising motes, violet light and clouds).

- **No flashes, ever.** Lightning is a bolt you see far off (220–900 m): cloud to ground, or across the clouds,
  jagged with branches. It brightens over 60 ms, flickers softly two or three times, fades over a second, and
  lights its own cloud from inside; the land's light lifts only faintly. Thunder follows by its distance (softened:
  a low crack close by, a rolling rumble far off).
- **Particles** move by how far their air has travelled (summed frame by frame), so a change of wind or weather never
  throws them about (the rain no longer rises into the sky when it eases to cloud).
- **Sound** is softer and lower: rain is a gentle wash (no high hiss, no repeating chirps), wind a low roar with slow
  drifts, sand a dry mid hiss.
- **Controls:** creator Global tab (weather and strength, clouds and cover, wind with the weather or a strength, fog
  with the weather or a thickness, wind direction); F8 in the game (the same, live); sky-lab.html (the same, plus
  ?sky in the address looks up at the sky).

### 25-Oct-x

- **Fog:** Thin, Normal, Thick (thick closes right in: the fog starts ~5 m off and nothing shows past ~18 m), or a custom
  thickness in the creator.
- **Clouds darken with the weather:** rain clouds grey, storm clouds dark (they took the weather's tint and weight).
- **Wind sound:** its own twelve seconds of deep noise (the shared one-second loop was audibly repeating), swelling
  and dropping with slow random gusts.
- **Aurora** (a feature of its own): two rippling curtains of light low over the sky, rays and all. With the weather:
  magic flare-ups of medium strength and up (violet and cyan, faintly by day too), snow flurries and snow on clear
  nights (green and violet). Or a map sets it Never / Every night (Global tab → *Aurora*); F8 and the lab too.
- **Magic flare-ups by strength** (25% / 50% / 75% in the creator; Low / Medium / High in the lab):
  - Low: motes of light rising, each glowing its own colour (violet, cyan, gold, pink, green), a violet tinge.
  - Medium: and auroras, and slow arcs of magic across the far sky (a coloured curve fading in and out over a few
    seconds).
  - High: and rocks floating up round you, bobbing and turning (up to 44); and casting a spell crystallizes power:
    a cluster of glowing crystals grows out of the ground beside you, stands a minute, then sinks away (up to 12).

## Surfaces (25-Oct-y) — src/gfx/weathering.js

What the weather does to the world's surfaces. Made in play.js (and sky-lab) next to the weather; every solid material
in the scene gets it (`weatherizeScene`), chained after its own shader patch.

- **Cover.** Every 1.5 s, or after moving 12 m, the scene round the camera (96 m square, 512²) is drawn from straight
  above into a depth picture (RGBA-packed). It gives the height of the highest thing over each spot. Anything lower
  is under cover. Not drawn into it: particles, lines, see-through things (water, glass), the sky, skinned bodies and
  small plants (`userData.noCover`).
- **Rain and snow stop at roofs and trees.** The rain, snow and sand particles read the same picture
  (`weather.useCover(weathering)`) and vanish below the cover.
- **Wet.** Rain soaks in over ~40 s and dries over ~4 min. Wet surfaces are darker and glossier; under cover only damp.
- **Puddles.** After it's been wet a while (and rain is above light), puddles fill over ~1.5 min in hollows of a noise
  pattern, on level ground in the open only: dark, glossy, tinted by the sky toward the horizon, with rings from the
  rain. They drain over ~5 min.
- **Snow.** Builds over ~3 min of steady snow (faster in heavy snow) and melts over ~6. It settles on what faces up
  (roofs, ground, tree and bush tops, grass partly), patchy at first, then a blanket. Ground under eaves and trees
  stays bare.
- **Plants** (instanced Lambert or alpha-cut materials) soak less, get no puddles and a lighter snow.
- **Testing:** the F8 panel and the sky lab have a "Surfaces" select (with the weather / dry / wet / puddles / light
  snow / deep snow) to see a look at once instead of waiting for it to build up.

Also in 25-Oct-y:
- Magic flare-up tiers are in the weather menus as their own entries (low / medium / high). The creator's Global tab
  hides the strength slider for them.
- Fog is one always-visible select in the Global tab: with the weather / thin / normal / thick / custom. (Older maps
  that unticked "fog with the weather" are read as normal.)
- Auroras are brighter and more saturated, with a soft glow at the base of each curtain, and cloud cover dims them less.

## Rain detail, temperature, light (25-Oct-z)

- **Puddle ripples** are three layers of drops, each cell with its own spot, size and timing; a drop lands only some of
  the time (more in heavy rain), so rings never march together. A tiny splash dot shows where each lands.
- **Splashes:** where rain lands on whatever is on top (ground, roofs, a cart), a crown of 4 droplets and a small
  burst, gone in a fifth of a second. All on the GPU (3500 splashes round you, standing on the cover picture's height).
- **Gutters:** water gathers along the foot of a kerb first (a step up of 6–45 cm close by, read from the cover
  picture), filling over ~3 min and spreading out from the kerb; it drains last.
- **Temperature** (°C) decides drying and melting, with the sun and the wind. Each weather has one (rain 10, snow −4,
  clear 17, sandstorm 33…; `TEMP` in weather.js) that the air moves toward slowly (~1° per 7 s); a map can set its own
  (Global tab: "Temperature with the weather" unticked). Snow only lies below about 2°C and never melts below 0 (a
  little in strong sun). Warm sun dries a street in a minute or two; near freezing it stays wet for an hour.
- **Spells' patches:** `weathering.addPatch('wet' | 'snow', x, z, radius, amount)` leaves a wet or snowy patch (up to
  8) that dries or melts by the same temperature rules — for water and frost spells later.
- **Light with the weather:** the weather's colours keep the time of day's brightness (a rain tint greys the day and
  the dark, and never lifts a night sky to grey). Overcast by day makes the sun weak and grey and lights the ground
  from the whole sky; overcast by night hides the moon. Nights are darker (moon 0.2, sky light 0.11) and clouds at
  night are dim.
- F8 shows the temperature and wet / puddle / gutter / snow levels, with a temperature slider (auto or set).

## Relief and roughness (25-Oct-z2) — src/game/testGrounds.js (weatherStone)

Every painted texture on the shared ground/road/building material now gives its own roughness and relief, with no
extra textures: each sample is compared with a blurred copy of itself (a coarse mip level, `tSam`). A texel brighter
than its neighbourhood stands proud (a cobble's face, a brick, a plank's grain); a darker one sits in a gap (grout, a
crack). Proud bits are a little smoother (worn), gaps rougher, and the difference bumps the lighting (a derivative
bump, fading out past ~50 m where it would only shimmer). Each material has its own base roughness (roof tiles 0.62,
cobbles 0.74, wood 0.8, plaster 0.9, ground 0.93, metal/glass 0.45…). The procedural surfaces (the ground's grass,
dirt, rock; dirt and gravel roads with their ruts) take theirs from their own noise. Wet surfaces now keep this
variation (roughness scaled down rather than replaced), so the grain still shows in the rain.

Fix (25-Oct-z3): splashes are fixed in the world (wrapped into the 36 m round you, like the rain) instead of offset
from the camera, which made them slide along with you; the random hashes no longer use sin() of big numbers (GPUs lose
precision there and the spots stopped changing), and the shader clocks wrap every 900 s.

## Puddle reflections (25-Oct-z5) — src/gfx/reflections.js

An option (pause → Controls/options → Reflections), saved with the other settings:
- **Mirror view** (default): the scene drawn a second time, mirrored in the level of the ground you're standing on, at
  half resolution, without grass, rain or shadow updates, with an oblique near plane so nothing below the ground gets
  in. Sharp and steady; lamps glow in the puddles at night. Puddles on another level fall back to the sky colour.
- **Screen-space:** the last frame's colours and distances are copied at half size (postfx `afterScene`); each puddle
  pixel follows its reflected ray (28 growing steps) until it passes behind something. Any height, no second drawing,
  but only what's on screen reflects (fades at the screen edges). Needs "Glow and colour grading" on; the scene is
  then drawn without multisampling (it needs a depth picture).
- **Off:** the sky colour only.
Nothing extra is drawn when there are no puddles. The reflection is added as light of its own (not lit again), stirred
by the rain and the ripples. Splashes are capped at a few pixels and faded right by the camera, and their colour
follows the light (no glowing blobs at night); wet surfaces get specular anti-aliasing (no sparkle when moving).

## Snow depth map (25-Oct-z6) — part 3a

Snow is now a depth map in metres (512² over the same 96 m as the cover picture, on the GPU), replacing the per-face
mask that looked boxy. It lies on whatever is on top (the cover picture is exactly that), so anything under cover gets
none. Ten times a second a pass: adds what's falling (a little uneven), sheds it off slopes steeper than ~45° and off
edges, lets it settle sideways between neighbours at the same height (rounded edges, no stair steps; snow doesn't flow
off a roof onto the street), and melts it by the temperature in patches. When the area re-centres (you moved 12 m) the
depth moves with the world; new ground starts at the area's average. Surfaces read it with smooth filtering: thin snow
is patchy and greyer, deep snow a bright blanket whose drifts shade the light; the shelter test is softened over four
samples so eaves don't cut a stair-stepped line. Rates: steady snow ~10 cm in a minute and a half; melting ~5 cm a
minute at 10°C in sun. Still to come (3b): raised snow you can see the thickness of, and voxels close round the player.

Also: the glow pass averages the whole 4×4 block of pixels under each of its own, weighted down by brightness, so a
single glint on wet stone can't blow up into a blinking disc (the "disco" effect); broken pixels (NaN) are dropped
there. Puddles are flat (they lose the stone's bumps), wet stone keeps half of them, and specular anti-aliasing is
stronger.

## Snow drifts, melt, footsteps, reflection heights (25-Oct-z7)

- **Flicker fixed:** the area (cover picture and snow map) now re-centres on a 3 m grid (16 snow texels), so the snow
  moves by whole texels instead of being resampled (blurred, shifting) each time, and the snow step runs in the same
  frame as the re-centre (there was a frame where the snow and the area disagreed).
- **Where snow gathers:** never evenly. The wind (its direction and strength from the weather) scours open ground and
  drops its load in the lee of walls and buildings, piling some against their windward faces; narrow places between
  tall things (alleys, yards, corners) catch more; and it falls in big soft patches with clumps in them ("hot zones").
  Each material keeps its own share (`wxSnowK` in testGrounds' weatherStone): a road's carriageway 0.4, cobbles 0.6,
  paving and pavements 0.7, dirt tracks 0.75, open ground 1.1. The F8 / lab previews show the shape it would build to.
- **Thickness:** on the open ground (the painted terrain) the snow raises the surface by its depth in the vertex
  shader (it banks up against walls). Roads and roofs only shade it, so no gaps open at their edges. (Voxels close
  round the player are still to come.)
- **Melting** makes water: wet ground, puddles filling, gutters running, while it melts.
- **Footsteps** follow the ground: the painted terrain's kind under your feet (grass, dirt, sand, gravel, mud, rock,
  snow, cobbles), then the weather on it: a soft squish when wet, a splash now and then while there are puddles, a
  crunch in snow (its depth read from the snow map under you), deeper and muffling the ground beneath when it's deep.
  New sounds: gravel, dirt, snow, wet, splash.
- **Mirror reflections at every height:** for water at height y the mirror (taken at your level h) is looked up at
  (x, 2h − y, z), which is exact; the clip plane sits 1.2 m below your level. Kerbs, ditches and steps no longer change
  what the puddles show when you step up or down. Range: 1.2 m below to 3 m above you.

## Ice, footprints, weather underfoot (25-Oct-z8)

- **Mirror reflections fixed:** a `//` comment had swallowed the line that set the mirror's clip plane, so Mirror view
  drew nothing useful. (Also: the character viewer's 'sheenRoughness' warning removed — r128 has no such property.)
- **No snow gaps at roads:** the snow sim shed snow off anything steep, and a kerb's or road edge's small step counted
  as steep, clearing a strip along every road. Now only real slopes (both sides falling the same way) shed; steps don't.
- **Ice:** below 0°C lying water freezes — puddles first, over a minute or two, faster the colder; above 0 it thaws.
  Frozen puddles are pale frosted ice with cracks, no ripples and a duller mirror; frozen wet stone gets a thin frost.
  Frozen water doesn't dry away. `weathering.state.ice`; F8 / lab "Surfaces → Ice" previews it.
- **Footprints:** a fine map (16 m round you, 3 cm texels) of pressed-down snow. Each footfall in snow stamps a boot
  print (30 × 12 cm, left and right of your line, along your heading); the prints have walls in the lighting and a
  packed, shaded floor; new snow fills them back in over about a minute, melting softens them. `weathering.footstep()`.
- **Weather underfoot** (`player.state.env`, from play.js `groundEnv`, 5× a second: snow depth under you, ice, wet):
  - snow slows you, the deeper the slower (about half speed knee-deep), and stops a slide quickly;
  - on ice you can't push off or stop quickly, and moving over it there's a chance your feet go and you slide (more
    the faster you go, less crouched or walking); a forced slip holds for a moment and runs until you've nearly
    stopped ("Your feet go out from under you on the ice");
  - slides go further on wet stone and much further on ice.

## Slips, steady mirror, blocked snow, trenches, crowns, faster snow (25-Oct-z9)

- **Slipping** is a roll every step (~0.75 m) on slick ground, by slickness, slope and Athletics (0 → 5000, straight
  between), scaled by how wet / snowy / icy it is (src/game/controller.js):

  | per step        | flat | shallow (~15°) | steep (30°+) |
  |-----------------|------|----------------|--------------|
  | wet/snow, 0     | 10%  | 50%            | 80%          |
  | wet/snow, 5000  | 0%   | 1%             | 2%           |
  | ice, 0          | 50%  | 80%            | 100%         |
  | ice, 5000       | 3%   | 6%             | 9%           |

  Slope comes from a ramp's own slope or the ground's height around you (steps and kerbs don't count). A slip throws
  you into a slide that holds for a moment ("You slip" / "…on the ice").
- **Steady mirror level:** the mirror follows the street / ground level you're on (terrain and roads), not every crate,
  step or wall you stand on, jump or slide onto; its clip plane sits 0.3 m below (lower brought the undersides of the
  street's own slabs into view, which changed with crouching).
- **Blown snow, sand and debris are blocked by buildings:** besides the roof test, each particle's path is traced back
  upwind (three points); if it runs through a building, the particle is in the lee and isn't drawn.
- **Pushing through deep snow:** over 12 cm, each step also cuts a trench your legs push (76 × 60 cm), with the snow
  heaped up along its edges (the footprint map's second channel).
- **Tree crowns:** drawn alone from above into their own picture (userData.canopy, src/gfx/trees.js). Under a crown a
  tenth of the snow and rain gets through, so the tree fills up layer by layer and the ground under it slowly whitens;
  under a roof none does.
- **Performance (thick snow):** the ground's share of the snow (wind lee and scour, alleys, patches, slopes, which
  neighbours are level) is worked out once per cover redraw (1.5 s) into catchRT, so the 10-a-second snow pass reads
  6 texels instead of ~33. Surfaces work out the drifts' and prints' slopes from neighbouring pixels (derivatives)
  instead of 8 extra lookups, and soften the shelter test with 2 samples instead of 4; flakes right at your eye are
  capped in size (they were filling large parts of the screen).

## The snow you stand in (25-Oct-z10)

- **Near snow mesh** (src/gfx/weathering.js, "the snow you stand in"): a real surface 24 m round you, a vertex every
  12 cm, snapped to its own grid so it doesn't swim. Each vertex lies on the top surface (the cover picture, smoothed
  across level ground, sharp at steps) raised by the snow's depth, minus prints and trenches, plus the snow heaped
  beside them; its normals come from its neighbours. At an edge (a kerb, a road's side, a wall's foot) it drops like a
  wall — no more floating slabs with gaps under them. Across tall things (posts, walls, eaves: a jump over 0.6 m to a
  neighbour) and under tree crowns it isn't drawn; the surfaces' own shaded snow shows there. Its rim fades over the
  last 3 m into the shaded snow beyond. The old per-surface vertex raise is gone.
- **Prints and trenches deform it:** boot prints dent it; wading through deep snow cuts a trench with the snow heaped
  along its edges. They fill back in only while it's snowing (and soften while it melts); when it stops they stay.
- **Each surface's share is in the simulation now:** every 1.5 s the scene is drawn from above with each material
  writing how much snow it keeps (`uKPass`; a road's carriageway 0.4, cobbles 0.6, paving 0.7, open ground 1.1) into
  kRT, and the catch map multiplies it in. The near mesh, the shaded snow and footsteps all agree.
- **Build-up:** each spot can hold 0.675 m × its share (50% more than before; drifts up to ~1.2 m). It builds to half
  of that in about 3 minutes of steady snow, to three quarters over the next quarter hour, and the last quarter over
  about an hour — at blizzard intensity. Build-up scales with how hard it's falling: snow takes about twice as long,
  heavy snow about 1.2×, flurries about 6× (and a stronger or weaker weather setting moves it accordingly). F8 / lab previews show that share of the full depth.

## Rain by intensity, dust (25-Oct-z11)

- **Rain fills by how hard it falls** (rainK: 1 = a downpour, rain ~0.6, drizzle ~0.2), staged like the snow: a
  downpour soaks the ground in ~20 s, fills the puddles to half in under a minute, three quarters in a few more, full in
  about six; the gutters follow, slower. Lighter rain takes as much longer as it's lighter.
- **Dust:** a sand or dust storm lays a thin coat (its own colour, eased toward the storm's) over everything out in it
  — most on what faces up, some on walls, none underneath, patchy, thinner under cover; the surface still shows
  through and goes matte. Wind without dust in it slowly scours it off (~7 min in a strong wind); rain washes it away in
  under half a minute. F8 / lab "Surfaces → Dust"; `weathering.state.dust`.

## No box round you; snow by walls (25-Oct-z12)

- **The snow surface covers the whole snowy area:** instead of a 24 m box, the mesh's grid is dense close to you (a
  vertex every ~9 cm) and stretched out to the snow map's edge 48 m away (~65 cm spacing there): offset =
  48·(0.25u + 0.75u|u|). It thins into the shaded snow only at the very rim (38–48 m, in the fog), so there's no edge
  round you as you walk. Where snow is thin the mesh breaks up with exactly the same pattern as the surfaces' shaded
  snow, so the two always agree.
- **Snow by buildings:** sheltered spots (under eaves, beside walls) take snow spreading in from the open ground at
  about the same level nearby, thinning over ~1.8 m; it may creep a little into ground floors (interiors are instanced).

## Dust on walls (25-Oct-z13)

Dust settles on walls too (blown sideways; floors still most), and a roof shelters what's under it, not the wall below
it. It builds as fast and as thick as the storm is strong: a storm at half strength coats things half as thick.

## Snow surface fixed to the world; drifts against things; no bare patches (25-Oct-z14)

- **No more swimming:** the stretched grid wasn't fixed to the world — every step you took moved all its vertices to
  new spots, so the ground (and especially edges) reshaped as you walked, and it was all redone each frame. Now the
  surface is three nested square grids (a vertex every 19, 38 and 75 cm; 24, 48 and 96 m across), each snapped to twice
  its own spacing: nothing under it moves as you walk, the rings just step along (one cell of overlap between rings,
  no cracks). Normals from two neighbours instead of four (cheaper).
- **Drifts against things:** next to anything standing up (more than 45 cm above the ground within 1.8 m — walls,
  planters, posts, crates, bushes) the surface stays down at that ground's level with the snow drifting in against
  it, thinning over ~1.8 m (it may run a little into ground floors). No hard edges at buildings, no sheets of snow
  floating over planters, no spikes at posts; the tops of those things keep the shaded snow.
- **No bare patches:** surfaces that weren't weathered (made later, or of another kind) used to write their own
  colours into the snow-share picture — dark ones read as 'keeps no snow'. They're drawn plain grey (share 1) there now.

## Stutters, slip cooldowns, lamps, cloud shadows, sand, props (25-Oct-z17)

- **Micro-stutters fixed:** the snow depth under you was read back from the GPU with a plain read five times a second,
  which stalls everything until the GPU catches up. Now it's asynchronous (a pixel buffer and a fence, WebGL2): the
  request goes in, the answer is picked up a frame or two later. The heavy passes no longer land in one frame: the
  cover is redrawn every 4 s (or when you've moved 12 m), the snow-share picture only when the area moved (or every
  12 s), and the catch map on the next frame — one job per frame.
- **Faster snow:** the snow surface's vertices only do the "something standing up nearby" search when there is
  something (and the outer ring never); their slope neighbours use the quick height unless they're beside something.
  The sheltered-spot spread looks 4 ways × 2 steps (was 8 × 3). The puddle mirror isn't drawn while snow lies over
  the puddles (melting).
- **Slip cooldowns:** after a slip, no slip for 20 s on wet ground or snow, 10 s on ice (src/game/controller.js).
- **Lamps across the plaza:** every street lamp glows at night whether or not it holds one of the real lights, and
  each casts a soft pool of light on the ground under it (one instanced mesh, additive); where a lamp holds a real light
  the pool gives way to it. Lamps are worth a real light from 1.8× further off; their lights are brighter with a
  natural falloff (decay 2, reach 22 m). (src/game/dungeonBuild.js lightDungeon; lamps know their ground height.)
- **Cloud shadows:** the sun's direct light (not the sky's) is dimmed where a cloud is between the sun and the point: a
  cloud layer 600 m up, its pattern drifting with the wind, its gaps set by the cover; strongest for scattered and
  broken clouds, fading out toward overcast (which already dims the sun). On every weathered surface (Lambert ones in
  their vertex lighting) and the snow surface.
- **Sand lies thicker** than dust (×1.45, up to 0.74 coverage); **dust piles on windward walls** (up to ×1.8; the lee
  side less).
- **Props** (the plain material, tex 6): a fine grain of their own — wear, dents, streaks — for relief and colour, and
  roughness 0.62 (was 0.45: they looked flat and shiny).

## Cliff relief (25-Oct-z18)

Cliffs — the terrain too steep for grass (src/game/testGrounds.js, the ground branch), and the test grounds' climbing
cliff (src/game/cliff.js) — get their own relief and roughness from the rock: the strata stepping out as ledges, the
grain, fissures cut in, fine pitting; duller, rougher stone (0.84) with the cracks rougher still.

## Street lamps, reworked (25-Oct-z19)

- Street lamps no longer take three.js's real point lights (which shine through walls, and each costs every lit
  pixel). The 32 lamps nearest you — weighted to the way you look, out to ~90 m — are lit by the surfaces' own lamp
  light (src/gfx/weathering.js `wxLamps`, fed by `setLamps(dungeonLights.litLamps)` each frame): a cone of light down
  from the lantern with a soft edge and a little spill sideways, falling off over 14 m, facing-aware, and **blocked by
  buildings and roofs** — the line to the lamp is checked against the cover picture at four points starting just off
  the surface. On every weathered surface and the snow surface.
- Only the lit lamps glow; the others stand dark until you come nearer (the light pools of z17 are gone).
- **Weather dims them:** rain up to −30%, falling snow −20%, dust −25%, so the weather reads stronger at night.
- The real point lights are now only for torches and braziers — a town with none has no point lights in its shaders.
  Stealth still counts the lamps' light (lightAt).
- **No lamp within 5 m of another light:** a street lamp isn't placed within 5 m of any light already there (door
  lanterns, other lamps; src/game/pathBuild.js via `kit.nearLight`).
- Still to come: characters aren't lit by the lamps yet (they aren't weathered surfaces) — a follow-up.

## Still to come

- Snow rework (part 3; the approach to choose: see ROADMAP).
- Cloud shadows moving over the land; snow and puddles feeding footstep sounds.
- Lighting: cheaper handling of many lights at night, window glow in buildings after dusk.

## Lanterns, steady lamps, the book's freeze, third person (25-Oct-z20)

- **Wall lanterns light properly.** The lamp light now knows two kinds (uLampC.w): street lamps (on a post) and
  lanterns on walls. A lantern glows all round it — the wall behind it and the ground below light too (wrapped
  lighting, a wide soft cone, ~10 m). The occlusion check ignores whatever covers the lamp itself close around it
  (the eave or porch roof it hangs under, its own cap) — before, that roof blocked every line to the lantern.
- **Street lamps:** brighter (5 vs 3.2), a wider spread (full from ~37° off straight down, 25% spill to the side),
  reach 18 m (was 14).
- **No more flicker:** lamps already burning keep their place against newcomers (a 30% lead in the ranking), so
  turning your head doesn't swap the ones at the edge of the 32; and when more than 32 are lit (some fading out), the
  wanted ones always get the slots — before, list order decided, so a lit lamp could drop out frame to frame.
- One copy of the lamp shader (LAMP_GLSL in src/gfx/weathering.js) shared by the surfaces and the near snow.
- **Tab freeze on first open fixed:** the book's figure was drawn tone-mapped straight to the screen, with fog
  removed — a different shader setup for every material, so the whole level's shaders compiled again (3–5 s). It's
  now drawn like the scene (linear, into a picture, fog pushed away rather than removed) and graded onto the screen
  (postfx.renderInset).
- **Third person:** the hair cards no longer cast shadows (the scalp does) and stay out of the puddles' mirror; the
  camera's wall check no longer allocates every frame.

## Lamp shadow cubes, characters lit by lamps (25-Oct-z21)

- The lamps' occlusion no longer reads the cover picture (a height map from above can't tell an eave or an upper
  floor from a solid wall: walls under overhangs came out in dark patches, alley shadows were stair-stepped at the
  cover's 19 cm texels, and posts and signs left square shadows). Each lit lamp now has its **own shadow cube**: six
  128² faces of what it sees, out to 20 m (distances, MeshDistanceMaterial), in one atlas of 40 tiles (3072×1280).
- The town doesn't move, so a lamp's cube is drawn once, when it's first lit — two faces a frame, so a lamp is ready
  three frames after it lights — and kept while there's room (the tile used longest ago by a lamp not lit goes
  first). A lamp gives no light on the surfaces until its cube is ready.
- Read with a filtered 2×2 compare: soft shadow edges instead of stair-steps. Not in the cubes: the lamps' own
  crystals and torch brackets (userData.noLampShadow), leaves, glass, particles, bodies.
- **Characters are lit by the lamps** (weathering.lampLit / lampLitScene: skinned bodies' standard and physical
  materials get the same lamp light, shadowed the same way; checked every 2 s for new bodies and gear).

## Performance pass, part 1: far shadows, the measuring tool (25-Oct-z25)

- **Far shadows:** a second sun shadow map (sunFar: 2048², ±170 m, no light of its own) — every lit material reads the
  two as one (wxSunShadow, patched into three.js's light chunks at start-up): the near map where it reaches, the far
  map beyond, faded across the near map's last 6%. The far map is redrawn only when you've moved 15 m or a second
  has passed — it costs almost nothing.
- **The near map sits ahead of you:** its 80 m box is centred 18 m in front of the camera (22 m behind, 58 m ahead),
  so the sharp shadows cover what you're looking at.
- **Third-person camera:** the wall check tests only the shapes within reach of the camera's arm (it tested every
  shape in the town at 20 points: ~9 ms a frame). The mouse wheel zooms it (docs/CONTROLS.md).
- **Performance panel (F8):** the game's own time broken down by part; the GPU timed with a timer query where the
  browser has one (gl.finish() doesn't wait in most browsers); and **Measure each part** — each part of the scene
  switched off in turn (~1 s each), the GPU's and CPU's time compared with everything on, sorted by cost.

## Rain performance (25-Oct-z44)

- **Puddle mirror** (src/gfx/reflections.js, planar): the list of things it leaves out (rain, sparkles, grass, hair
  cards) is no longer found by walking the whole scene every frame. A scan walks 2,500 objects a frame and starts a
  fresh pass every ~2 s (the first pass runs at once). It also lists small meshes (bounding radius under 1.2 m) and
  mid-sized ones (under 4 m), dropped from the mirror past 28 m and 70 m: a few pixels in the half-size mirror picture
  but a draw call each. No per-frame allocations (shared vector and hidden list).
- **Cover and lamp shadows** (src/gfx/weathering.js): the cover pass (every 4 s or 12 m) walked the scene twice and
  the lamp-shadow pass every 5 s: steady hitches. Both now read lists from one shared scan (3,000 objects a frame,
  fresh every ~1.5 s): `sceneLists.cover`, `.lamp`, `.mesh`.
- **Less garbage:** the rain/snow particle tables and colours are made once (weather.js PF), the splash colour and
  the passes' clear colour are reused.
