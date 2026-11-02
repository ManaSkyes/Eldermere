# Hair parts (rebuild, started Nov 2026)

Replaces the zone system in `src/rpg/hair.js` + `src/rpg/hairCards.js`. The target is **FF12 quality**: clean, clumped locks; soft volume; a modest budget. Goal: **< 1 ms** (the current hair costs ~4 ms).

## Slots (they mix freely)
| Slot | What | Pilot pieces |
|---|---|---|
| Base (always on) | opaque shell: hairline + coverage | buzzed, short, medium |
| Top | crown volume / direction | slicked back, messy, side part |
| Front | bangs | none, curtain, blunt, side-swept, wispy |
| Sides | temples / side locks | faded, cheek locks, long side locks |
| Back | nape / back length | short, shaggy (wolf cut), long layered |
| Extensions (0–3, placeable, mirrorable) | attached pieces | ponytail, twin tails (forward over the shoulders or back), bun |
| Ties | at an extension anchor | band, ribbon |

Styles are combinations, for example:
- **Wolf cut:** medium base + messy top + wispy/curtain front + shaggy sides + shaggy back.
- **Forward twin pigtails:** any base + front, plus twin tails anchored behind the ears, resting forward.
- **Short male cuts:** mostly base + top + sides.

## Blender (`art/blender/hair.blend`)
- `Head_Neutral`: the neutral MakeHuman head, exported from `data/human`, in metres, Blender axes (x, −game z, game y) / 10. The game shrink-wraps hair onto each character's real head.
- `StrandAtlas` → `art/blender/hair_tex/strand_atlas.png`, 2048², rendered from groomed hair curves (collection `Atlas`).
  - 8 columns of 256 px: 0 sheet (tiles), 1 dense, 2 medium, 3 sparse, 4 flyaway, 5 tapered lock, 6 wavy, 7 curly.
  - Channels: R = root→tip, G = strand id, B = depth (layer), A = coverage. The game shader turns these into colour, shine and self-shadow, so one atlas serves every hair colour.
- Text block `hair_kit.py`:
  - `scalp(yaw, pitch)`, `hairline_z` (the game's hairline formula).
  - `grow()`: guide strands that hug the head, then hang under gravity.
  - `ribbon()`: cards along guides.
  - `shell_cap()`: opaque cap whose strand tips fray the hairline.
  - Every vertex carries `col` (atlas column), `gid` (guide; −1 = rigid shell), `t` (root→tip), and a UV (u across / around, v root→tip; u tiles inside the column).
- Parts live in collection `Parts`, named `<Slot>_<name>`. `STYLES` and `show(name)` in `hair_kit.py` preview reference looks.
- Done (first pass), all from FF12 references:
  - **Bases:** `Base_short`, `Base_medium`, `Base_buzz`.
  - **Fronts:** `Front_blunt` (+ `_under`), `Front_sideswept`.
  - **Sides:** `Sides_longlocks`, `Sides_wavy`.
  - **Backs:** `Back_bob` (+ `_under`), `Back_wavy`.
  - **Top:** `Top_sweptback`.
  - **Extensions:** `Ext_braid_L/R`, `Ext_ponytail_long`.
- Style recipes:
  - penelo = short + blunt + long locks + braids
  - ashe = medium + bob + side-swept
  - balthier = buzz + swept-back top
  - fran = medium + wavy sides + wavy back + long ponytail
- Known issues:
  - The long ponytail arcs too far back, and a few strands snap sideways at the cut neck (the head mesh ends there). The game's physics and body collision should settle it; refine after export.
  - Penelo still needs braid roots, a smoother back, a crown braid band and feather ties (tie accessory).

## Still to do
1. The remaining pilot parts, with guides exported for physics (the existing guide simulation in `hairCards.js` is kept).
2. Exporter: per part, vertices in game decimetres + col/gid/t/uv, its guides, its slot and anchor.
3. Game renderer:
   - Combine the chosen parts into one draw.
   - Shell: opaque, casts the shadow.
   - Cards: dithered cut-out, no shadow.
   - Kajiya-Kay shine from the atlas id and depth.
   - Root/tip colour plus per-part overrides; LOD.
   - Clamp u inside each column, so neighbouring columns don't bleed into seams.
4. Creator UI: a slot picker, extension anchor and mirror, per-part length / volume / curl; save format.
