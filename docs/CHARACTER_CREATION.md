# Character creation

`index.html` is the game. The creator (`src/ui/creator.js`) walks through Race, Gender, Appearance, Background, Education, Class and Name, with the 3D character and a live stat sheet beside every step. `human-test.html` remains the developer tester with every panel.

## Where starting stats come from

All main stats start at 100 (the average citizen). Modifiers stack in this order:

1. **The body** (`src/rpg/morphStats.js`), read from the 3D body:
   - **Species:** each race and lineage's modifiers (`src/data/creation.js`), weighted by how much of the body is that species (part-weighted shares from `bodyState.totals()`). A full-blooded body gets exactly the race's modifiers; a half-transformed one gets half.
   - **Body sex:** symmetric around androgynous. Per unit of masculinity: Strength +6, Endurance +4, Finesse −6, Spirit −4, and the reverse for femininity. Every body part counts by its weight, so the more features lean one way, and the further, the bigger the bonuses and penalties.
   - **Build:** per step from average to the slider's end (0.5 → 1, or 0.5 → 0 reversed):

     | Slider | Effect at the high end |
     |---|---|
     | Muscle | Strength +12, Endurance +4, Finesse −8, Speed −8 |
     | Weight | Endurance +12, Strength +6, Speed −10, Dexterity −8 |
     | Height | Strength +8, Endurance +2, Finesse −6, Speed −4 |
     | Proportions | Charisma +8, Finesse +2, Endurance −5, Strength −5 |

   - **Age:** life stages per race (`LIFESPAN`; e.g. humans 18–90 years, elves 100–900). Young (the first fifth of the slider) fades from Speed +6, Luck +4, Mind −5, Intelligence −5. Past the middle it grows toward Intelligence +8, Mind +8, Spirit +4, Strength −8, Endurance −6, Speed −6 at the oldest.
   - **Features:** every detail slider (Body and Face tabs) and chest size and firmness add a small zero-sum effect, chosen by what the slider shapes (`DETAIL_RULES` in `morphStats.js`). For example, muscle and girth push toward Strength, leg length toward Speed, finger length toward Finesse, the mouth and lips toward Charisma, and the forehead toward Intelligence. Sliders that only move or turn a feature have no effect.
   - Lineage skills (e.g. Draconian Fire) are weighted by species share the same way.
2. **Background**, then **Education**, then **Class** and **Specialty** (unchanged).

Every axis is zero-sum at its extremes, matching the creation balance rule. The sheet's "From your body" breakdown shows each part.

## Gender

Gender is identity: pronouns (he/him, she/her, they/them) and the body you start with (masculine, feminine or androgynous). It has no stat modifiers of its own. The body decides stats, so a transformation changes stats but never identity.

## Starting kit

`startingKit(class, specialty)` in `src/data/creation.js` lists what each class arrives wearing and carrying (item ids from `src/rpg/equipment.js`). Some items are stand-ins until their own models exist: the long dress for robes, the arming sword for a rapier, the mace for hammers, the longbow for a crossbow, and the hand axe for a great axe.

## The save

`version: 2` adds:
- `choices.pronouns`
- `appearance`: the viewer's `save()` — sliders, details, body state, race look, skin, hair, gear
- `gear`: the starting kit

Stats are computed once at creation and stored, as before.

## Viewer API (creator mode)

`startViewer(THREE, human, { canvas, controls, mode: 'creator' })` returns:

| Call | Does |
|---|---|
| `setRace(raceId, lineageIndex)` | Sets the race and lineage |
| `setBodySex(0..1)` | Eases the body between masculine (0) and feminine (1) |
| `morph()` | Returns `{ params, bodySex, totals, raceId }` for the stat rules |
| `onChange(fn)` | Calls `fn` after the body changes |
| `equip(ids)` | Equips a list of item ids |
| `setView('full' \| 'face')` | Switches the camera |
| `save()` | Returns the look, for the save file |
| `dispose()` | Stops the renderer |

In creator mode, controls are grouped into Body, Face, Hair and Skin tabs. Developer panels (body-part transformations, performance, poses, equipment) are hidden, and the canvas sizes to its own box.

## Single-file builds

`python3 tools/build_preview.py index.html out.html` bundles a page with every module (each in its own scope), inlines the stylesheet, and embeds the body data compressed. It works for `human-test.html` too.
