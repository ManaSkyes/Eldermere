# Building kit

Town style: dry Victorian Tudor, early steam. Red brick ground floors with sandstone dressings; timber-framed gables and slate roofs to come. Matte throughout.

## Two kinds of piece

| Kind | What it is | Cost |
|---|---|---|
| **Wall type** | A surface: `brick`, `brick_cracked`, `brick_pale`, `brick_pale_cracked`, `cobble` (coursed rubble), `plaster` (aged), `plaster_fresh`, `plaster_cracked`, `ashlar` (coursed cut sandstone, weathered grey-brown), `ashlar_rustic` (chamfered blocks with deep channel joints, for civic ground floors), `slate` (roofs), `flags` (flagstone paving, for platforms, steps and later roads). `timber_close` and `timber_cross` (plus `_fresh` and `_cracked` versions of each, for the plaster between the timbers) are plaster plus an oak frame laid out per wall: posts, plates at every floor, a sill rail, trimmers, headers and sills round each opening, studs that stop at openings, and braces only in clear bays. Any wall can be `shape: 'gable'` with a `pitch`, any length and height (half, quarter and so on), or an L wall: `notch: { corner: 'tl'|'tr'|'bl'|'br', w, h }`, a square cut out of one corner. That lets mismatched or cracked patches be stacked into a facade. Features can't be placed in a notch, and the timber frame works round it. One seamless tiling texture per type (2.5 m × 3 m per tile, colour with AO folded in, plus a normal map). The wall itself is generated in code, any width and height. | One texture pair per type |
| **Feature** | A modelled piece that sits in a wall: `feat_window` (arched), `feat_door` (arched, with fanlight), `feat_window_rect` (lintel and keystone). Each carries the **outline** of the opening it needs. | About 100 tris each; all features share one atlas |

| **Trim** | A profile on a tiling trim sheet (`trims_color.jpg`), swept along any length in code: `string_course`, `cornice`, `plinth`. The plinth has variants on its own sheet (`plinths_color.jpg`): `clean`, `mossy`, `cracked`, `chipped` (`variant` on a trim entry). Ends can be mitred for outside (+1) or inside (−1) corners, or capped flat (0). | One shared texture pair |
| **Corner** | `feat_quoin`: alternating long and short stones, a 0.6 m unit stacked up a corner to any height | 24 tris per unit |
| **Vine** | Ivy grown in code from a seed: `{ x, y, width, height, seed, out, density }` in a wall's `vines` list. Stems climb from the foot, branch, and creep round openings. Patches that touch or overlap on a wall grow as one plant (`planVines()`): roots only where nothing grows below, and stems cross freely between them. A patch on an upper wall that sits on one below carries its main stems on, at crossing points fixed to the wall line, so ivy climbs a whole facade without seams. Leaves are alpha-tested cards (`ivy.png`: three leaf shapes and a stem) with per-leaf tint. `out` lifts the patch off the wall face, so set it to about 0.09 where a plinth sits underneath. | About 6–7k tris for a 2.5 × 3 m patch |
| **Roof** | `roofs: [{ x, z, rot, base, width, depth, pitch, eave, verge }]`: a gable roof with slate slopes, timber fascia and soffit, a lead roll ridge, bargeboards and apex finials | About 60 tris |
| **Chimney** | `chimneys: [{ x, z, rot, base, height, width, depth, pots, variant }]`: a brick stack, stone corbel and cap (string course trims), and clay pots | About 200 tris |
| **Timber features** | `feat_window_timber` (Tudor casement: oak frame, mullion and transom, diamond leaded lights) and `feat_door_timber` (oak plank door in a heavy oak frame, strap hinges, ring handle) | About 30 tris each |
| **Props** | Free-standing: `prop_column` (Tuscan stone porch column) and `prop_post` (oak post on a stone pad). Set them in `desc.props: [{ prop, x, z, rot, base, height }]`; height stretches them. Dropped under a porch roof or awning in the lab, they stand at its front edge at the right height. | 156 / 36 tris |
| **Platforms and steps** | `desc.platforms: [{ kind: 'platform' or 'steps', x, z, rot, base, width, depth, height, material: 'stone' or 'oak' }]`. The origin is the middle of the back edge, and the piece runs out along local +z. Steps go down in risers of about 16 cm on 30 cm treads. Every block gets a collider. | Generated |
| **Canopies** | `w.canopies: [{ kind: 'porch' or 'awning', x, y, width, depth, pitch, color }]`. A porch is a slate lean-to on exposed rafters, with a wall plate, a front beam (`canopyFront(c)` gives where posts go), a fascia and verge boards with real thickness, brackets, and a lead flashing. An awning is striped canvas (green, red, blue or ochre) with a scalloped valance, iron arms and a roller box. | Generated |
| **Wall details** | Mounts: `feat_flowerbox` (painted window box on iron brackets, snaps under the nearest sill; empty for now, but `flowers: 'red'|'pink'|'white'|'mixed'` and `flowerGeometry()` with `flora.png` are ready for the foliage pass), `feat_lantern` (gas wall lantern), `feat_sign` (hanging shop sign). `w.pipes: [{ x }]` adds a cast-iron downpipe with a hopper head, holdfasts and a shoe. Ground-floor doors get a stone doorstep automatically (`step: false` turns it off). | Small |
| **Fences and gates** | `desc.fences: [{ kind, x, z, rot, base, length, height, gates: [{ at, width, kind: 'single' or 'double', open }] }]`. Kinds: `iron` (spear-topped railings), `iron_wall` (railings on a low brick wall with a stone coping), `picket` (painted), `rail` (oak post-and-rail). Iron gates hang between brick piers with stone caps and balls; timber gates hang between posts (a braced picket gate, a five-bar gate). Gates can stand open, and only closed gates block. Fences cut themselves out wherever they pass through a wall (`fenceCuts()`). A gateway fitted to a wall gap (`pierW`, `pierH`, `pierVariant`) puts its piers on the wall ends instead. | About 1,500 tris per 10 m of iron |
| **Decals** | `decals.png` (generated by `decals.py`), 14 era decals: wanted poster, public notice, theatre playbill, torn poster, painted coal-merchant sign, enamel street nameplate, "Adventurers wanted", soot streak, damp stain, moss patch, plaster fallen off (brick showing), apothecary lettering, chalk marks, and a coal-hole cover for the ground. On walls: `w.decals: [{ d, x, y, w, h, rot }]`; on the ground: `desc.floorDecals`. They're blended, sit just off the surface, and cast no shadow. | 2 tris each, 1 draw call |
| **Post mounts** | `prop.mounts: [{ feature: 'feat_lantern' or 'feat_sign', side: 0–3, y }]`: a lantern or sign fixed to a porch column or post, on the side facing where it was dropped | |
| **Guild & civic** | `feat_window_grand` (tall round-arched window with keystone, block jambs, a sill on corbels, an apron panel and a 12-pane sash under a fanlight, for 4–4.5 m storeys), `feat_door_grand` (oak double doors with raised panels and iron studs under a radial fanlight, in a stone surround), `feat_pilaster` (flat Tuscan pilaster, stretched to the storey with `sy`), and the balustrade parapet (`w.balustrades: [{ x0, x1, y }]`: 1.2 m bays stretched to fill the run). Civic trims go on their own sheet (`civic_color.jpg`): `entablature` (architrave, frieze and cornice), `band` (stone sill band) and `raking` (for pediments, coming next). | Moderate |
| **Mount** | A feature that cuts nothing and sits on the wall face: `feat_shutters` (fits `feat_window_rect`) | 24 tris |

| **Wooden town (batch 1)** | Wall types `boards` (board and batten), `weatherboard` (overlapping clapboards), `daub` (wattle and daub between crooked studs). Roof covers: `roofs[].cover = 'thatch'` (a deep straw coat, straw at the eaves and verges, a thick ridge roll, no bargeboards) or `'shingle'` (oak shingles, a board ridge). `w.jetty` (m): that storey stands out from the one below, with a bressumer, joist ends, a soffit and braced brackets on knee posts (`jettyGeometry`); in the lab, `box.jetty` jetties every upper storey on all four sides. Features made in code (`addCodeFeatures`, plank leaves in the board texture, tarred-oak frames, iron fittings): `feat_door_stable`, `feat_door_board`, `feat_shopfront` (a drop-down counter on chains and a propped-up upper shutter), and mounts `feat_shutters_plank` / `feat_shutters_louvre` (folded open either side of a window; they snap onto the nearest window). Shells: jettied timber house, tall jettied house, thatched cottage, weatherboard house, board-and-batten barn, stone and timber house. Tones in the Blender material: 19 boards, 20 weatherboard, 21 thatch, 22 shingle, 23 daub (`kit10.py`, `bake10(var)`). | Small: code features are ~100–400 tris |

| **Wooden town (batch 2)** | Windows: `feat_window_lattice` (small leaded light, diamond cames), `feat_window_lattice2` (two lights and a mullion), `feat_window_square` (small timber window with cross bars); glass is its own material. Dormers: `roofs[].dormers: [{ x, width, height, wall }]` on the front slope (a window in a wall-textured front, cheeks back to the slope, a small gable roof in the main roof's cover); in the lab, drop **Dormer** on a gable roof. Lean-tos: `roofs[].kind = 'lean'` (one slope, its high edge against a wall, board cheeks); the lab's **Lean-to shed** dropped on a wall adds two side walls, a front wall and the roof (`addLeanTo`). Outside stair: `platforms[].kind = 'stair'` (oak treads on stringers rising along the wall to a landing, posts and a handrail; colliders per tread). Street props (`desc.props`, keep their own size): `prop_barrel`, `prop_crate`, `prop_crates`, `prop_woodpile`, `prop_well` (a stone ring, windlass, bucket and a small shingle roof). | ~100–1,000 tris each |
| **Guild & civic (batch 3)** | Pediments: `walls[].pediments: [{ x, y, width, pitch = 20, crest, finial }]` — a raking cornice (`raking` trim) up both sides and along the foot, an ashlar tympanum with a round boss and a gilt emblem, a lead top back over the wall (`pedimentGeometry`). Columns: `prop_column_ionic` (attic base, fluted shaft with entasis, scroll capital) and `prop_column_plain` (Tuscan); unlike other code props they stretch to `props[].height` by regenerating (`columnParts`). Porticos: `platforms[].kind = 'portico'` `{ width, depth, height, order: 'ionic' \| 'plain', columns, pitch, crest, finial }` — stepped podium, column row, wall pilasters, an `entablature` round three sides and a pediment with a slate roof back to the wall (`porticoGeometry`). Venetian window: `feat_window_venetian` (arched centre light with voussoirs and keystone, two lower side lights under lintels, lead glazing bars). Turrets: `chimneys[]` entries with `turret: 'cupola' \| 'bell'` `{ size, finial }` sit on the ridge (`base` = ridge top) — a boarded base astride the ridge, then an octagonal louvred lantern under a lead ogee dome, or an open frame with an iron bell under a shingle spire (`turretGeometry`). Finials: `ball` (gilt), `spike` (iron), `crystal` (an emissive guild crystal in an iron cup). Banners: `walls[].banners: [{ kind: 'banner' \| 'sign', x, y, width, length, color, emblem, tail }]` — swallow-tailed cloth on an iron rod, or a painted board on a wall bracket; emblems `crest`, `star`, `sun`, `moon`, `tower`, `none`. Cloth materials are made per colour (`cloth:#rrggbb`). Also: a thatched roof's dormers are eyebrow dormers (the straw swells over a low window), and the woodpile is split logs, end grain out. | ~300–3,000 tris each |
| **Wear** | `desc.wear` or any part's `wear` (walls, trims, roofs, chimneys/turrets, props, platforms, fences, corners): `[weathering, damage, growth]`, each 0–1. Written per vertex as `aWear` and read by a shader patch on every kit material (`wearify`): weathering bleaches and greys, runs rain streaks down vertical faces, stains the foot, rusts iron; damage cracks, chips (pale with a dark rim), scorches at high values and tatters banner cloth; growth spreads moss over tops, slopes, crevices and the wall foot, with lichen specks. World-space noise, so patterns run across seams. In the lab: the Wear sliders on any selected part, with Apply to whole building / everything. | no extra geometry |
| **Roof depth** | Slate and shingle slopes are laid as overlapping courses matched to the textures' rows (slate 0.25 m, shingle 0.18 m; each butt stands 2–3.5 cm proud). The roof's damage (`wear[1]`) splits courses into single tiles, drops some (dark battens show through) and slips others down the slope, and sags the roof between the gables. Thatch is a lumpy coat with a fuller eave, flattened at its edges to meet the verge and eave faces. | slate/shingle ~400 tris per slope new; ~2–3k damaged |
| **Wall damage & growth** | A wall's damage over 0.3 drops rubble (rough blocks in its own material) in front of and behind its foot (ground storey only, `rubbleGeometry`). Over 0.45 ragged breaches open (one, two over 0.7), clear of openings and ends; and the top storey of a *roofless* building crumbles back in stepped courses, never below what its windows need (`wall._ruin`, set by buildFromKit). Chips and cracks also tilt the shading normal for relief. Growth over 0.35 brings ivy up walls that have none (deterministic patches; set `vines` yourself to override). | rubble ~12 tris a block; ivy as before |

**Wall joins** (`joinWalls()`, run by `buildFromKit` unless `autoJoin: false`):
- Where two walls' ends meet at a corner, both are mitred: the back face stops short at an outside corner, or runs on at an inside one. Tops and faces then never overlap or flicker.
- A wall running straight on from another, or ending against another's face, drops its end cap.
- Trims running into a joined end mitre to match.
- In the lab, drawn walls snap to existing wall ends, and a moved wall clicks onto a nearby wall end.

`featureFits()` skips any opening that would poke outside its wall (for example above a gable's slope) instead of cutting it.

Placing a feature cuts its outline into the wall it sits in: the front, the back, and a brick reveal round the hole. That works on any flat wall face, at any position, for any outline shape (arched, square, or anything later). Stone surrounds run the full wall depth, so they line the opening.

## Game side: `src/game/buildKit.js`

- `loadBuildKit()` loads `data/buildkit/buildkit.json`, `.bin` and the textures.
- `wallGeometry(kit, { width, height, variant, openings: [{ feature, x, y }] })` returns one wall with its holes cut.
- `buildFromKit(kit, { walls: [{ x, z, rot, base, width, height, variant, openings }], trims: [{ trim, x, z, rot, base, length, ends }], corners: [{ x, z, rot, base, height }] })` returns `{ group, colliders }`. Mounts go in a wall's `openings` list like any feature. A corner sits at a wall's left front end, with the same x, z and rot as that wall. Trims don't break at doors by themselves yet; the editor will split them.
  - `group` holds one merged mesh per material (one per wall type used, plus one for all features).
  - `colliders` are solid boxes split round the doors; windows stay solid.

The test building (two storeys, five walls, eleven features, plinth, string course, cornice, four quoined corners) comes to 4 meshes and about 3,000 triangles, built in roughly 35 ms. Grime toward the foot of the building is added in the shader, by building-local height, so tiles stack on any number of floors.

Axes, wall-local: x runs along the wall from its left end, y is up from the wall base, z points out of the front face. The front is at z = 0 and the back at −thick (0.45 m).

## Blender: `art/blender/buildkit.blend`

Text blocks, in order: `kit.py` (shared constants and helpers), `kit_bake.py` (material and bake helpers), `kit2.py` (features and brick generator), `kit3.py` (tiling wall bake and export), `kit4.py` (trims, quoins, shutters; `run4()` rebakes features and trims), `kit5.py` (plaster and slate tiles; `export_all()` writes the JSON with every wall type), `kit6.py` (timber features), `kit7.py` (props and wall details; `rebake7()` rebakes every feature and exports), `kit8.py` (pale brick, cobble, plaster and flag tiles: `bake_walls8()`; plinth variants: `bake_plinths()`; then `export8()`).

To rebuild everything, run `exec(bpy.data.texts['kit3.py'].as_string(), ns); ns['run']()` in its own namespace. That rebakes and exports to `data/buildkit/`.

- A new wall type is an entry in the `bake_wall_tiles({...})` call, plus `meta['walls']`.
- A new feature needs a `feat_*` builder (a hi and a low version), a slot in `FEAT_SLOTS`, and an outline in `outlines()`.

## Building lab: `building-lab.html`

It opens from the **Building lab** button in the dungeon editor's top bar.

- **Asset library (bottom bar):** thumbnails rendered from the real parts. Filter with **Style** (All / Tudor / Victorian / Common) and **Type**:
  - Shells: whole box houses.
  - Walls: 2.5, 5 and 7.5 m, and gable.
  - Windows and doors.
  - Roofs: a gable roof dropped on a building.
  - Guild & civic: grand window and doors, pilaster (stands on the storey, stretched to its height), balustrade parapet (dropped on a wall, it runs along the top of that building's top storey), entablature and stone band. The shell **Adventurers' Guild hall** is a 15 × 10 m hall with two 4.5 m storeys: a rusticated ground floor, ashlar above, grand doors centred, arched windows in bays, pilasters between them, a band and an entablature, and a gable roof.
  - Porches & awnings: columns, posts, slate porch roof, striped awning.
  - Trims: plinth (clean, mossy, cracked, chipped), string course and cornice. Dropped on a wall, they apply to the whole building's storey as separate pieces, and each piece can be selected, shortened, split, re-varied or deleted. That lets you mix plinth variants along one wall.
  - Porches: platforms (flagstone or oak) snap against a wall; steps snap down from a platform's front; columns and posts stand on a platform and reach the porch roof's front beam.
  - Fences & gates: drag on the ground with a fence armed to draw one (it snaps to wall ends), or drop it for 5 m. Drop a gate on a fence to add it there, or on the ground for a gateway. A fence's properties list its gates (position, width, leaves, open).
  - Gates for a wall gap (iron or oak): drop one between two wall ends that face each other, up to 6 m apart. It puts a pier on each wall end (as thick as the wall, 25 cm taller, in the wall's texture) and hangs the gate between them, single or double by width. If you move the walls, **Refit to the gap** in its properties re-measures it. The piers take the lower wall's height, and if either wall has a plinth, they wrap it round their foot in the same variant.
  - Decals: drop on a wall and drag to move; Q / E turn 15°.
  - Lanterns and signs dropped on a column or post mount on that side (Q / E move them round).
  - Decoration: shutters, window box, wall lantern, hanging sign, downpipe, quoins, ivy, chimney.
  - Walls include 1.25 and 0.625 m lengths, half- and quarter-height walls, and L walls with the notch in each corner (the notch is editable in the wall's properties).

  Drag a part into the scene, or click it to arm it and then click where it goes (Esc stops). A blue outline shows the wall it will go on.
- **Wall textures:** walls are texture-dynamic. A wall's properties have a **Texture** dropdown (brick, cracked brick, plaster, close-studded or braced timber), plus "use this texture on its storey". New walls take the current Style's texture.
- **Moving:**
  - Drag anything to move it. Windows, doors and ivy slide along their wall (hold Shift to move freely up and down). Walls, chimneys, quoins and roofs move on a level plane, snapping to 25 cm.
  - Shift-drag a wall to move the whole building.
  - Q / E turn the selection 90°; R flips a wall.
- **Other controls:**
  - Draw wall: drag on the ground at the chosen storey.
  - Delete; Ctrl+Z / Ctrl+Y.
  - Orbit with a left-drag on empty space, pan with a right-drag, zoom with the wheel.
- **Saving:** Save and Load use browser storage, and the last draft reopens on its own. Download JSON writes `{ building, desc }`, where `desc` is ready for `buildFromKit`. Import reads it back.

## Next

- Timber window and door surrounds for the timber walls; the stone ones work there but are more formal than Tudor.
- Roof and gable pieces.
- Placing saved buildings in towns (the town editor / `townBuild.js`).
- Variants of the parts a full town needs.

Note: `ivy.png` is generated by a Python script (procedural leaves), not baked in Blender.

`oak_color.jpg` and `oak_normal.png` (the tiling timber grain) are generated by a Python script like `ivy.png`. The plaster and slate tiles are baked in `kit5.py` (`plaster_tile`, `slate_tile`).

Any placed feature can be stretched with `o.sx` / `o.sy` (pilasters use this). `kit9.py` holds the guild pieces: `ashlar_tile`, `bake_civic`, `rebake9`, `export9`.
