# Equipment, tools and focuses

All item data is in `src/rpg/equipment.js`, and weapon models in `src/rpg/weapons.js`. A held item
marked `standIn` shows the nearest existing model until its own exists. Every weapon, gathering tool
and focus now has its own model. Nothing is a stand-in anymore.

A model can borrow another weapon's poses and animations with `pose`: the glaive uses the spear's,
the throwing knives the dagger's, and the crossbow holds like the bow.

## Item fields

| Field | Meaning |
|---|---|
| `skill` | the skill that using it trains |
| `tool: { skill }` | the profession it's a tool for |
| `provides` | the camp station it sets up |
| `focus` | the magic focus type it counts as |
| `carried` | lives in the pack; never worn or held |
| `standIn` | the 3D model shown is temporary |

Armor trains its armor skill: the jerkin, gloves and boots train Light armor; the breastplate,
pauldrons, gauntlets, greaves and helms train Heavy armor.

## Robes

Three full-length robes with long sleeves, falling loose from the chest. Each fills top and bottom:
- **Mage's robe:** deep blue, high closed collar.
- **Cleric's vestments:** pale linen, the fullest drape.
- **Scholar's robe:** brown, a little shorter, plain neck.

Mages, clerics and scholars now start in them instead of the long dress. The viewer's outfit presets
add "Mage" and "Cleric".

## Weapons

Every weapon skill now has an item. Unarmed needs none.

| Item | Skill | Hands | Model |
|---|---|---|---|
| Arming sword | Longsword | 1 | yes |
| Shortsword | Shortsword | 1 | yes |
| Rapier | Rapier | 1 | yes |
| Greatsword | Greatsword | 2 | yes |
| Hand axe | Axe | 1 | yes |
| Great axe | Great axe | 2 | yes |
| Flanged mace | Mace | 1 | yes |
| Warhammer | Warhammer | 2 | yes |
| Club | Club | 1 | yes |
| Dagger | Dagger | 1 | yes |
| Spear | Spear | 2 | yes |
| Glaive | Glaive | 2 | yes |
| Staff | Quarterstaff (also a focus) | 2 | yes |
| Whip | Whip | 1 | yes |
| Throwing knives | Throwing weapons | 1 | yes |
| Longbow | Bow | 2 | yes |
| Crossbow | Crossbow | 2 | yes |
| Round shield | Shield | off | yes |
| Parrying dagger | Parry | off | yes |

## Tools

**Quality tiers** (`TOOL_TIERS`):

| Tier | Quality |
|---|---|
| Improvised | 0.3 |
| Crude | 0.6 |
| Common | 1.0 |
| Fine | 1.25 |
| Masterwork | 1.5 |

A tool's quality scales what the work yields, how good it is and how fast it goes. It never changes
how fast the skill is learned. Tiers belong to item instances (`{ id, tier }`); base items default to
Common.

**Needing a tool:**
- **Required** (`needsTool` in `professions.js`): mining, logging, skinning, fishing, crystal
  harvesting, smithing, leatherworking, tailoring, woodworking, gemcutting, alchemy, scribing,
  enchanting.
- **Bare hands work** at the Improvised tier: herbalism, cooking.
- A workshop supplies Common tools for its trade. Carrying a better tool of your own raises the
  quality.

**Gathering tools** are held while working and work as improvised weapons:
- Pickaxe: mining; trains Warhammer when swung
- Woodcutter's axe: logging; Great axe
- Skinning knife: skinning; Dagger
- Sickle: herbalism; Dagger
- Fishing rod: fishing
- Crystal chisel and mallet: crystal harvesting; Club

**Crafting tools** are carried and used at a station:
- Smith's hammer and tongs
- Leatherworker's awl and knives
- Needles and shears
- Saw, plane and chisels
- Pot and pan
- Lapidary's loupe and files
- Quills and ink
- Etching stylus and chalk (enchanting)

**Camp kits** are carried. Each sets up a camp station:
- Camp kit: campfire
- Repair kit
- Portable alchemy kit: also an alchemy tool
- Writing kit: also a scribing tool

**Other carried tools:** lockpicks, trap tools, healer's kit (First aid).

**Helpers:** `toolsFor(skill)`, `bestTool(skill, owned)`, `stationsFrom(owned)`.

## Magic focuses

Staff, wand (main hand), orb and spellbook (off hand), and focus bracelet (new Wrist slot; a gold
band just above the left wrist, hidden under long sleeves). Tattoos are
a body detail rather than an item, and magic weapons gain `focus` through enchanting. `focusOf(worn)`
returns the focus held, and `gear.stats().focus` reports it.

## Starting kits

The stand-ins are replaced with real items:
- Crossbowman: crossbow
- Berserker: great axe
- Brute: warhammer
- Duelist: rapier
- Skirmisher: shortsword and throwing knives
- Windblade: shortsword

Trades start with their tools: the blacksmith carries smith's tools, the cook cookware and a camp
kit, the herbalist a sickle and alchemy kit, the scribe quills, rogues lockpicks, medics a healer's
kit. The creator lists carried items separately under "In the pack".
