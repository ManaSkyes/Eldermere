# Materials, quality and crafting

The world is Earth, a thousand years after two gods clashed. Magic has soaked into everything, so
plants, animals and minerals are their real selves with those properties amplified many times over,
plus new kinds that formed since. The harder something is to gather or work in real life, the harder
it is here.

| File | What it holds |
|---|---|
| `src/data/materials.js` | the catalog |
| `src/rpg/alloys.js` | alloys from compositions |
| `src/rpg/quality.js` | gathering quality, appraisal, grades |
| `src/rpg/inventory.js` | stacks and unique items |
| `src/data/recipes.js` | recipes |
| `src/rpg/crafting.js` | crafting, forging, item stats, repair |

Entries marked `proposed` are invented starting points; rename or replace them freely.

## Tiers

Material tiers follow the guild and monster ranks, so a material's tier matches where it's found.
The tier sets the skill rank needed to gather and work it well. Lower ranks can still try, with poor
results.

| Tier | Rank | Skill wanted |
|---|---|---|
| 0–1 | Black | Unskilled |
| 2 | Wood | Apprentice |
| 3 | Bronze | Apprentice |
| 4 | Silver | Journeyman |
| 5–6 | Gold, Crystal | Expert |
| 7–8 | Disaster, Cataclysmic | Master |
| 9 | Apocalyptic | Guru (story only) |

## Plants

Real plants amplified, plus a few new ones.
- **Food:** wheat, potato, onion, wild berries, ember pepper (a chili whose heat became real warmth)
- **Alchemy:** yarrow, chamomile, mint, valerian, nightshade; new kinds moonpetal (mana), sunroot
  (stamina), bloodmoss (rapid healing)
- **Fiber:** flax (linen), cotton, hemp, silkweed (a milkweed that now spins like silk)
- **Ink and dye:** oak gall (iron-gall ink), woad (blue), madder (red). Crystal dust makes magic
  ink.
- **Wood:** pine, ash (hafts), oak, yew (bows), ironwood, elderwood (carries mana; staves and
  wands)

## Animals

Creatures are listed by what they descend from. Their monster rank sets the tier of everything
taken from them. Parts: hide or pelt, bone, sinew, meat, scales, membrane, fangs and claws, fat,
venom, eyes, and essences from magical creatures. Each part becomes a material such as
`nyluth.pelt`, and hides keep their creature's toughness, flex and warmth through tanning.

| Creature | Descends from | Rank |
|---|---|---|
| Field hare | rabbits | Black |
| Antlered stag | deer | Black |
| Razorback | boar | Wood |
| Nyluth | wolves and dogs | Wood (alpha: Bronze) |
| Nocturian bat | bats | Wood |
| Glass serpent | snakes | Bronze |
| Stonepelt bear | bears | Silver |
| Umbrafiend | born of shadow; leaves only essence | Silver |
| River fish | fish | Black |

Nyluths, Nocturian bats and Umbrafiends are from the book; the rest are proposals.

## Ores, metals and alloys

Every real ore exists: copper, tin, zinc, lead, iron, silver, gold, nickel, bauxite (aluminium),
platinum, rutile (titanium) and wolframite (tungsten). Titanium and tungsten are near-impossible to
work without magic, as in real life.

Other ground products: charcoal and coal (fuel, and the carbon for steel), limestone (flux, tanning
lime), clay, granite, salt, sulfur, quicksilver, and crystal dust (ground from mana-rich stone).

**Metal properties:** hardness, toughness, edge, density (100 = iron), conduct (carries mana),
corrosion resistance, and warding.

**Alloys** (`alloy(composition)`): a composition goes in, properties come out.
- Inside a named alloy's ranges, its strengths apply. They're strongest at the ideal mix and fade
  toward the edges.
- Each alloy can trade properties along its key ingredient. Steel at 0.2% carbon is mild and tough;
  at 0.8% hard and keen; at 2% brittle.
- Mixes outside every range are unrefined, weaker than their parts.

| Alloy | Mix | Note |
|---|---|---|
| Orichalcum | copper 60–80%, zinc 20–40% | brass: golden, corrosion-proof, soft for a weapon |
| Bronze | copper 85–92%, tin 8–15% | the first true weapon metal |
| Pewter | mostly tin | tableware |
| Damascus | iron with 0.1–0.5% carbon, **folded** | between iron and steel; needs the folding process |
| Steel | iron with 0.2–2% carbon | the carbon decides everything |
| Electrum | gold and silver | carries mana beautifully |
| Moonsilver *(proposed)* | silver with 5–15% crystal dust | wards against shadow |
| Mithril | aluminium with 10–30% crystal dust | the first magical metal: light and harder than steel |

Arming sword at average quality, by metal:

| Metal | Damage | Weight | Durability | Enchant slots |
|---|---|---|---|---|
| Orichalcum | 5.9 | 3.1 | 81 | 1 |
| Iron | 8.0 | 3.0 | 100 | 1 |
| Bronze | 9.5 | 3.2 | 101 | 1 |
| Damascus | 11.6 | 3.0 | 127 | 1 |
| Steel | 15.1 | 3.0 | 125 | 1 |
| Mithril | 18.6 | 1.6 | 124 | 3 |

## Gems

**Mundane gems** are real stones whose lattice has trapped some magic. Each leans toward an element:
quartz, amethyst, garnet, jade, topaz, aquamarine, emerald, sapphire, ruby, moonstone, onyx and
diamond.

**Magic gems** (mana stones) are measured by purity, their mana content, from 51 to 100%. Below
51% it's just a mundane stone. The gem type sets the element; purity and size set the strength.

| Size | Value | Mana capacity |
|---|---|---|
| Small | 1 | 1 |
| Medium | 4 | 5 |
| Large | 20 | 30 |
| Colossal | 2,000 | 5,000 (like the stone before the guild hall) |

## Quality

Quality runs 0–100.
- **Gathered materials are unknown until appraised.** Appraised quality rounds to the nearest 10
  (55 → 60, 54 → 50), so a stack holds at most 11 grades. Hovering a stack shows each grade and
  how many are still unappraised.
- **Gathering roll:** 40, plus the skill edge over the tier (+12 per rank above, −15 per rank
  below, up to +8 within the rank), the region's richness (±20), the tool (−21 to +15), the body
  (performance stats), Luck, and any bonuses. Spread ±15.

  | Gatherer | Average quality |
  |---|---|
  | Unskilled, tier 1 | 44 |
  | Journeyman, tier 1 | 68 |
  | Expert, tier 4 | 54 |
  | Apprentice, tier 4 | 27 |
  | Expert, tier 1, rich region, fine tool | 95 |

- **Appraisal:** 50% success at the tier's rank, better above it and much worse below. A failed
  attempt leaves the material unknown, to try again later. Every attempt trains Appraisal.
- **Crafting** uses only appraised materials.
- Grade names: Ruined, Poor, Rough, Fair, Average, Good, Fine, Superb, Exquisite, Perfect.

## Crafting

- **Recipes** list their skill, tier, station and inputs. Each input has a weight; a blade's metal
  matters more than its grip.
- **Workshop recipes** need the workshop (tanning needs a tannery). **Camp recipes** work at camp,
  capped at quality 60, or in the workshop.
- **Output quality** is about 55% the inputs' weighted grade and 45% the work: skill edge over the
  tier, tool and body. Crafting trains the skill, with trivial recipes teaching less.
- **Starting recipes:** smelt copper, tin and iron; tan a hide; weave linen and cotton; bandages;
  healing salve; mana tonic; hearty stew; iron-gall ink; crystal ink.
- **`makeAlloy(c, inv, composition, batch, { process })`:**
  - Metals come from ingots, carbon from charcoal or coal, and the magic part from crystal dust.
  - Different mixes of one alloy are separate stacks, so mild and high-carbon steel don't merge.
- **`forgeItem(c, inv, item, ingot)`:** forges any metal item. The number of ingots follows its
  weight, and weapons and armor also need a piece of leather.

## Crafted items

Crafted gear is a unique item: `{ item, material, quality, durability, maxDurability, enchantments,
maker }`. `itemStats(item, material, quality)` works out:
- **Damage:** edged weapons use the metal's edge; blunt weapons use its hardness and mass.
- **Armor:** from hardness and toughness.
- **Weight:** from density.
- **Durability:** from toughness.
- **Enchantment slots (0–4):** from quality, plus one for a conductive material and one for a
  magical one.
- **Focus power:** any conductive metal can serve as a focus.

Quality scales damage, armor and durability from 60% at quality 0 to 140% at 100.

**Wear and repair:** items wear with use. A repair kit restores up to 70% in the field; a workshop
restores fully. Each repair costs one point of maximum durability for good.

## Not yet connected

- The inventory isn't part of the save yet.
- Starting kits are still lists of item names, not crafted items.
- Regions don't exist yet, so region richness is a number passed in.
- Gathering nodes and the active-practice minigames come with the playable area.
