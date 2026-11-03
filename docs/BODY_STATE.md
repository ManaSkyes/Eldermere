# Body state — reference for story events and stats

The character's body is one data object (`src/rpg/bodyState.js`). Everything visual is computed
from it; everything gameplay reads it. In the viewer it is `viewer.body` (and `window.eldermereBody`
for console testing).

## Parts
head, face, muzzle (nose and mouth), ears, eyes, horns, hair, skinFace, skinBody, neck, chest,
torso, waist, hips, arms, hands, legs, feet, tail, wings, voice (data only), nether (data only).

Each part: `{ species: { key: weight }, sex: -1..1, size: -1..1, traits: {} }`.
Species keys are `race:subrace`, e.g. `human:common`, `elf:dark`, `therian:feline`,
`draconian:sun scale`, `piscine:river`. A part's weights always sum to 1; human fills what's left.

## Changing the body (events, items, curses, potions)
```js
body.setSpecies('ears', 'therian:feline', 1)      // fully feline ears
body.shift('skinBody', 'draconian:ash scale', 0.1)// 10% more scaled (other species shrink to fit)
body.setSpecies('eyes', 'human:common', 1)        // eyes back to human
body.setSex('chest', 0.8)                         // one part's sex, -1 masc .. +1 fem
body.shiftSex('hips', -0.2)
body.setSize('horns', 0.5)                        // part size, -1..1
body.setTrait('tail', 'style', 'fox')             // free-form data for anything else
body.preset('elf:soul', 0.5)                      // every part at once (a race preset / full change)
```

## Reacting and reading
```js
body.on('change', e => { /* e.part, e.field ('species' | 'sex' | 'size' | 'trait:x'), e.before, e.after */ })
body.totals()   // { species: { key: share of the whole body }, sex: -1..1, parts: copy }
body.toJSON() / body.load(data)   // save games
```
Totals weight each part by how much it counts (BODY_PARTS in bodyState.js): head 3, torso 2,
skin (body) 2, face 2 ... voice 0.5. Tune those weights to tune how far "one race" a character is.

## What is drawn from which part
- head: species head shape · face: brow, jaw, cheek shapes · muzzle: nose/mouth shape, beak, tusks
- ears: ear shape, cat/boar ears, head fins, elven ears · horns: horns · eyes: pupils and eye color
- skinFace / skinBody: scales, fur, feathers (amount per region)
- torso, chest, arms, legs, hips, neck: body proportions; the chest also has its own sex
- tail, wings, hair, voice, nether: tracked now; tail and wings get visuals in a later step

## Testing transformations in the viewer (Body parts panel)
- Pick a species, then drag **Transformation progress**: parts change in order
  (eyes, ears, face skin, muzzle, voice, face, head, horns, hair, hands, body skin, neck, arms,
  chest, torso, waist, hips, nether, legs, feet, tail, wings), each over its own stretch.
- **Play transformation** runs it 0 → 100% over 8 seconds; **Reset to human** starts over.
- **Sex transformation (masc → fem)** moves sex part by part (face and chest first, then hips, the rest).
- **Each part** has its own slider for the picked species; the readout shows that part and the
  whole-body totals. Every slider calls the same API story events use.
