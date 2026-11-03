# Professions (life skills)

Life skills are ordinary skills (`group: 'profession'` in `src/rpg/stats.js`). They start at 100,
grow with use, and get starting bonuses from race, background, education and class like any other
skill. `src/data/professions.js` adds what the number means: a rank, a trade title, and where the
work can be done.

This is the design layer only. Recipes, gathering nodes, camps and workshops come once there is a
playable area and a character controller.

## Ranks

The same thresholds apply to every skill. Values are stored as decimals and ranked by the whole
number shown.

| Rank | Value |
|---|---|
| Unskilled | 0 – 200 |
| Apprentice | 201 – 500 |
| Journeyman | 501 – 1,000 |
| Expert | 1,001 – 5,000 |
| Master | 5,001 – 10,000 |
| Guru | 10,001 – 1,000,000 |

An average citizen (100) is Unskilled. A strong starting specialty, such as a smith's apprentice
background plus the Blacksmith specialty, starts around Apprentice.

## Trade titles

Each profession names its ranks in the trade's own words, using real titles where the trade has
them. Unskilled is always "Unskilled". Otherwise the pattern is "Apprentice / Journeyman / Expert /
Master / Guru" plus the trade.

| Profession | Apprentice | Journeyman | Expert | Master | Guru |
|---|---|---|---|---|---|
| Herbalism | Forager | Simpler | Herbalist | Master Herbalist | Grand Herbalist |
| Mining | Putter | Hewer | Overman | Mine Captain | Grand Delver |
| Logging | Swamper | Bucker | Faller | Woods Boss | Grand Forester |
| Skinning | Apprentice Skinner | Skinner | Fellmonger | Master Skinner | Grand Skinner |
| Fishing | Deckhand | Fisher | Skipper | Master Fisher | Grand Angler |
| Crystal harvesting | *(generic)* | | | | |
| Smithing | Striker | Journeyman Smith | Smith | Master Smith | Grand Smith |
| Leatherworking | Tanner's Apprentice | Journeyman Leatherworker | Currier | Master Leatherworker | Grand Leatherworker |
| Tailoring | Seamster | Journeyman Tailor | Cutter | Master Tailor | Grand Couturier |
| Woodworking | Sawyer | Journeyman Carpenter | Wright | Master Wright | Grand Wright |
| Cooking | Kitchen Hand | Cook | Sous-chef | Chef | Grand Chef |
| Alchemy | Apprentice Alchemist | Journeyman Alchemist | Adept | Master Alchemist | Grand Alchemist |
| Gemcutting | Apprentice Lapidary | Journeyman Lapidary | Lapidary | Master Lapidary | Grand Lapidary |
| Scribing | Copyist | Scribe | Scrivener | Master Scribe | Grand Scribe |
| Enchanting | Apprentice Enchanter | Journeyman Enchanter | Enchanter | Master Enchanter | Grand Enchanter |
| Talisman crafting | *(generic, "Talisman Scribe")* | | | | |
| Trading | Peddler | Chapman | Trader | Merchant | Merchant Prince |
| Farming | Farmhand | Husbandman | Yeoman | Master Farmer | Grand Farmer |
| Taming | Groom | Handler | Trainer | Master Trainer | Beastmaster |

Real-world sources: putter and hewer (coal mining), mine captain (Cornish mining), swamper, bucker
and faller (logging crews), fellmonger (hide dealer), striker (the smith's sledge-swinger), currier
(leather finisher), cutter (senior tailor), sawyer, simpler (herbalist), lapidary, scrivener,
peddler and chapman (traveling traders), yeoman, groom.

## Where the work happens

A life skill is done where it makes sense. Every recipe will carry a station requirement.

- **Field:** gathering, wherever the resource is. No station.
- **Camp:** a campsite the player sets up (campfire, bedroll, portable kits). Simple recipes only.
- **Workshop:** a town building, or a rare dungeon room with the right fixtures. Every recipe.

| Profession | Camp (simple work) | Workshop |
|---|---|---|
| Smithing | Repair kit: field repairs and sharpening | Smithy |
| Leatherworking | Repair kit: repairs, straps, pouches | Tannery |
| Tailoring | Repair kit: mending, simple cloth goods | Tailor's workshop |
| Woodworking | Campfire: arrows, stakes, torches, hafts | Carpentry workshop |
| Cooking | Campfire: roasts, stews, trail food | Kitchen |
| Alchemy | Alchemy kit + campfire: simple potions, salves | Alchemy laboratory |
| Scribing | Writing kit: simple scrolls and copies | Scriptorium |
| Gemcutting | — | Lapidary's bench |
| Enchanting | — | Enchanting circle |

| Gathering | Found |
|---|---|
| Herbalism | Plants in the wild and on overgrown dungeon floors |
| Mining | Ore veins in mines, caves and stone floors |
| Logging | Trees outside town and on forest floors |
| Skinning | Beasts and monsters after a kill |
| Fishing | Rivers, lakes, the coast, flooded floors |
| Crystal harvesting | Crystal veins where mana runs thick, mostly in dungeons |

`stationLevel(skill, station)` returns `'full'`, `'simple'` or `null`.

## Status

- **Active:** every gathering and crafting profession above.
- **Scribing:** renamed from Scroll making. Old saves are moved over by `upgradeCharacter()`.
- **Talisman crafting:** hidden until discovered. It is never a starting class.
- **Trading:** visible now; its system comes with towns. Merchant backgrounds and the Merchant
  class give it a head start.
- **Farming and Taming:** placeholders. They are tracked and saved, and some backgrounds already
  raise them (Farmhand: Farming; Caravan born and Desert nomad: Taming). They stay hidden until
  land ownership and beasts exist.
- **Processing** is deliberately left out. Smelting ore, tanning hides and sawing planks are part
  of each craft.

## Cooking additions

- **Backgrounds:** Tavern cook (Cooking +70) and Street food vendor (Cooking +50, Bartering +40)
- **Education:** Kitchen apprenticeship (Cooking +50)
- **Class:** Artisan → Cook specialty (Cooking +80), starting with a knife

Other new specialties: Scholar → Scribe (Scribing +60).

## Growth

Skills grow by rank, not by raw number. Each rank has a target play time for someone doing only
that one thing with average stats (`RANK_HOURS` in `professions.js`). One "use" is one meaningful
action (a craft, a gather, a hit), assumed to be about 120 an hour.

**Practice.** Most professions have two ways to practice:
- **Passive:** busy work that runs while the player is idle, such as helping out at a local smithy.
  The times below are passive pace.
- **Active:** the player does it, through the minigame, making a real product. Every gain, skill
  and main stat, is ×5 (`PRACTICE` in `stats.js`). `train()` defaults to active; pass
  `{ practice: 'passive' }` for idle work.

| Rank to clear | Focused hours | Running total |
|---|---|---|
| Unskilled → Apprentice | 0.25 | 15 min |
| Apprentice → Journeyman | 2 | ~2 h |
| Journeyman → Expert | 6 | ~8 h |
| Expert → Master | 25 | ~33 h |
| Master → Guru | 75 | ~108 h |
| Guru | open-ended | 10,001 → 20,000 is about 150 more hours |

Active practice divides every time by 5: about 22 active hours to Guru, before main-stat growth speeds it up.

The skill cap is 1,000,000. Main stats keep their own soft cap (knee 500).

Each use gives: `amount × base rate for the rank × task × Intelligence × performance × specialization`

- **Task:** a recipe or node below your rank teaches less, about a third as much per rank under.
  One above your rank teaches 25% more per rank. It is optional (`train(c, id, 1, { taskRank: 'journeyman' })`).
- **Intelligence** is how fast the trade is learned: √(INT / 100). Mental trades get the full
  effect. Hybrid trades and physical gathering get half, because even mining takes some learning.
  Weapons and other non-trade physical skills still ignore Intelligence.
- **Performance** is what the body brings to the work: the average of the trade's `perf` stats,
  divided by 100. It's linear, so half the strength means half the pace (minimum 0.2).
- **Specialization** (professions only): 2.0, minus 0.1 for every other profession at or above
  this one's rank. Unskilled never counts. The floor is 0.5. Your best trade, or your only one,
  keeps 2.0. An Unskilled trade is compared against Apprentice, so a first trade always learns at
  full speed.

`growthModifiers(c, id)` returns the three modifiers, so a UI can show why a skill is slow.

| Profession | Performance stats |
|---|---|
| Herbalism | Finesse, Mind |
| Mining, Logging, Smithing | Strength, Endurance |
| Skinning | Dexterity, Finesse |
| Fishing | Finesse, Luck |
| Crystal harvesting | Finesse, Spirit |
| Leatherworking, Woodworking | Dexterity, Strength |
| Tailoring, Cooking | Finesse, Dexterity |
| Gemcutting, Scribing | Finesse, Mind |
| Alchemy | Mind, Finesse |
| Enchanting | Mind, Spirit |
| Talisman crafting | Spirit, Mind |
| Trading | Charisma, Luck |
| Farming | Endurance, Strength |
| Taming | Spirit, Charisma |

### Sample character

STR 45, END 63, DEX 103, FIN 130, INT 95, MIND 115, SPI 119, CHA 99, SPD 127, LUCK 103. One trade
at a time, main stats held fixed. Cumulative hours to Apprentice / Journeyman / Expert / Master / Guru:

| Trade | Modifier | Hours |
|---|---|---|
| Crystal harvesting | ×1.23 | 7 m / 1.7 / 6.6 / 27 / 88 |
| Herbalism, Gemcutting | ×1.21 | 7 m / 1.7 / 6.7 / 27 / 89 |
| Alchemy, Scribing | ×1.19 | 7 m / 1.8 / 6.8 / 28 / 91 |
| Tailoring, Cooking, Skinning, Fishing | ×1.15 | 7 m / 1.8 / 7.0 / 29 / 94 |
| Enchanting | ×1.14 | 7 m / 1.8 / 7.1 / 29 / 95 |
| *Average citizen, any trade* | ×1.00 | 8 m / 2.1 / 8.1 / 33 / 108 |
| Trading | ×0.98 | 8 m / 2.1 / 8.2 / 34 / 110 |
| Leatherworking, Woodworking | ×0.73 | 11 m / 2.9 / 11 / 45 / 148 |
| Smithing, Mining, Logging | ×0.53 | 15 m / 4.0 / 15 / 62 / 203 |

The same character smithing while holding other trades at the same rank:
- 4 others: 15 m / 4.9 / 19 / 78 / 253
- 9 others: 15 m / 7.0 / 28 / 113 / 369

In play the weak smith gets faster over time, because smithing builds Strength and Endurance (see
`docs/STATS.md`). With main stats allowed to grow, the same elf reaches Guru in about 55 passive
hours (11 active). Strength goes 45 → 102 by Expert and 285 after 100 hours, slowing as it passes
the elf's natural limit of 180.

## Trade and reputation (replaces the Trading profession)

Trade is now **Bartering** (the general skill: haggling) plus **reputation** with each city and town.
The old `trading` skill is hidden and kept for saves; on load, any trading skill already earned
carries over into Bartering (the higher of the two).

Reputation (`src/data/reputation.js`) runs from −1000 to 1000 per place, starting at 0. Quests,
trade and crimes in a place move it. Price effects stack with Bartering.

| Tier | From | Prices | Effect |
|---|---|---|---|
| Hated | −1000 | refused | Shops refuse you; gates closed; guards attack on sight |
| Hostile | −600 | +40% | Guards confront you; most guilds turn you away |
| Unfriendly | −300 | +15% | Guards watch you; fewer quests |
| Neutral | −50 | — | Ordinary prices and quests |
| Friendly | 50 | −5% | Rumors and small favors |
| Honored | 300 | −10% | Guild quests and better stock |
| Revered | 600 | −15% | Housing for sale; minor offenses forgiven |
| Exalted | 900 | −20% | A citizen's rights: rare stock, council favors |

Places so far: Eldermere, Thalrendor and Athalond (cities); Selune's Grace, Faldale and Crystal Cove (towns). See `WORLD.md`.
