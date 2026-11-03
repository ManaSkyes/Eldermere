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
- Parts live in collection `Parts`, named `<Slot>_<name>`. Done so far: `Base_short`, `Front_curtain` (first pass).

## Status
- 15 parts exported (data/hair/parts.json/.bin, strand_atlas.png); `src/rpg/hairParts.js` combines the chosen parts into one skinned draw, fitted to each head (`fitHead`).
- Styles, not free mixing (2026-11-02): `HAIR_STYLES` in hairParts.js = parts modelled together (crop, buzz, penelo, ashe, balthier, fran, from the reference sheet); `HAIR_ADDONS` = twin braids, long ponytail. Each hair vertex is bound to its 4 nearest neutral head vertices and follows the actual head surface (not just a scale). The Base cap is drawn solid except its hairline edge.
- Creator: Hair system = Classic / New parts; parts mode shows a Style picker and Add-on toggles and hides the classic style, length, look, movement and detail controls. Colour, tip blend, Shine and the motion tests (shake / turn / jump / run) are shared.
- Swing: ponytail, braids, side locks (one chain per side) and back pieces get a 4-joint spring chain in world space (inertia, a little gravity, pulled back to the style, kept out of the head sphere and the neck/shoulder/back capsules). The shader blends the joint offsets along each strand's `t`. Bob is stiff, ponytail loosest.
- Shine: Kajiya-Kay, two lobes (white shifted to the root, tinted toward the tip), jittered per strand by atlas G, dimmed by depth B. Tangents come from the UV v direction.

## Still to do
1. More parts (curtain fringe, top knot, buns, long straight back, mohawk / undercut, curly volume).
2. Per-part overrides: length / volume / curl, colour per part, extension anchor and mirror.
3. LOD and a dithered cut-out for the far cards; shell-only shadows.
4. Replace the classic hair in the game once the parts cover enough styles.
