# Skills outside professions

Professions are in `PROFESSIONS.md` and main stats in `STATS.md`. Every skill uses the same rank
names (Unskilled through Guru), but they level in three different ways.

| Group | Levels by | Intelligence | Performance | Specialization |
|---|---|---|---|---|
| Professions | rank curve | half (physical) / full | trade's `perf` stats | yes |
| Weapons | rank curve | half | weapon's `perf` stats | only from Master |
| Combat | rank curve | half | `perf` stats | no |
| Magic schools | rank curve | full | governing stat | no |
| Spells | own mastery 0–1000 | gift (INT + school stat, cubed) | school rank | no |
| General | use, like main stats | by type | — | no |

All of them feed main stats as they're used (performance stats if the skill has them, otherwise
governing stats), within the body's limits.

## Weapons

Weapons level exactly like professions: the same time per rank, and active practice ×5 (an actual
fight). Passive practice comes later with training grounds. Each weapon's performance stats match
what it asks of the body:

| Weapon | Performance |
|---|---|
| Mace, Warhammer, Club, Great axe | Strength, Endurance |
| Greatsword | Strength, Dexterity |
| Longsword, Axe, Spear, Bow | Dexterity, Strength |
| Crossbow | Dexterity, Strength |
| Shortsword, Quarterstaff | Dexterity, Speed |
| Dagger, Rapier | Finesse, Speed |
| Glaive | Finesse, Strength |
| Throwing weapons, Whip | Finesse, Dexterity |
| Unarmed | Strength, Speed |
| Shield | Endurance, Strength |

**Specialization:** plenty of real weapon masters exist, so there's no cost below Master. From
Master up, it's 2.0 less 0.1 for every other weapon at or above that rank (floor 0.5).

The sample elf (STR 45, FIN 130, SPD 127), active fighting, to Apprentice / Journeyman / Expert /
Master / Guru:
- Rapier, Dagger ×1.27: 2 m / 19 m / 1.3 h / 5.2 h / 17 h
- Longsword, Greatsword, Bow ×0.73: 3 m / 34 m / 2.2 h / 9 h / 30 h
- Warhammer ×0.53: 3 m / 48 m / 3 h / 12 h / 41 h

## Combat (new)

Parry (Dexterity, Finesse), Evasion (Speed, Finesse), Heavy armor (Strength, Endurance) and Light
armor (Dexterity, Speed). Armor skills train by moving and taking hits while wearing that armor.

## General skills

These grow like main stats: a steady gain per use (0.2, so 1 with active practice), scaled by
Intelligence for mental and hybrid skills. Gains fall off past a limit set by the character's own
governing stats, 4× their average (minimum 150). A sharp mind takes Literacy far; a frail body
plateaus at Athletics sooner.

Sample elf, active uses:

| Skill | Limit | 100 uses | 500 | 2,000 |
|---|---|---|---|---|
| Literacy | 380 | 194 | 436 | 677 |
| Sneak | 514 | 199 | 505 | 847 |
| Athletics | 216 | 182 | 315 | 447 |
| Persuasion | 388 | 195 | 440 | 688 |

**Changes:**
- Incantation is now governed by Mind and Charisma, because there is power in words.
- Attunement grows slowly as mana is spent: `spendMana(c, amount)`, about 1 point per 100 mana.
- **New:** Persuasion (Charisma, Intelligence), Intimidation (Charisma, Strength), Deception
  (Charisma, Mind), Performance (Charisma, Finesse), Swimming (Endurance, Strength), Climbing
  (Strength, Dexterity), and Riding (hidden placeholder until mounts).

## Magic

Magic has two layers:
- **Schools** (Fire, Lunar, …): familiarity with an element. A school grows whenever one of its
  spells is cast, and each school rank makes its spells learn 25% faster (Unskilled ×1 up to Guru
  ×2.25).
- **Spells:** each has its own mastery in `c.spells`.

### Mastery

| Mastery | Meaning |
|---|---|
| 0 | Can't be cast without backfiring |
| 1–99 | Learning. Backfire chance is (1 − mastery/100)²: 56% at 25, 25% at 50, 6% at 75. Power rises from 40% to 100% |
| 100 | Complete mastery |
| 101–1,000 | Bonus levels. The spell is part of the caster: no staff, book or focus needed, voiceless loses every penalty, and mana cost keeps falling (83% at 120, 50% at 200, 10% at 1,000) |

Below 101, casting without a focus costs 30% power and makes backfires 1.5× as likely.

### Casting modes

| Mode | Power | Mana | Cast time |
|---|---|---|---|
| Incantation | 100% | 80% | full chant |
| Voiceless | 60% | 150% | 30% |

The casting skills soften their mode. Incantation shortens the chant (half the time at 400).
Voiceless removes up to half its penalties by 1,000. At 101+ voiceless has no penalties at all.

### Difficulty and power

Every spell has a difficulty and a power from 0 to 100:
- **0:** safe for a child
- **1–10:** ordinary magic, up to city-wide destruction at 10
- **11–20:** only the highest ranks in the world
- **21+:** ritual magic needing many skilled mages

`spellTier(n)` names them: Safe, Common, Dangerous, Catastrophic, Legendary, Ritual.

### How long mastery takes

**To 100:**
- **Difficulty:** gentle at first, then steeper with every step. About 250 casts at difficulty 0,
  500 at 2, 4,900 at 5 and 2,000,000 at 10, for an average caster with an Unskilled school.
- **Gift:** the caster's Intelligence and the school's stat (Mind or Spirit), averaged, measured
  against what the spell demands (100 at difficulty 0, rising gently to ~134 at 10), then cubed.
  Since casting never raises Intelligence or Mind, the gap between a gifted mage and a barbarian
  holds unless they study and meditate.
- **School:** each school rank makes its spells learn 25% faster, up to ×2.25 at Guru.
- Backfires teach half as much.

**101 and up:** every spell costs the same whatever its difficulty (the gift is judged as if it
were difficulty 0), slowing as mastery climbs.

Simulated casts to reach 100:

| Caster | Difficulty 0 (then to 120) | 2 | 5 | 10 (Guru school) |
|---|---|---|---|---|
| Mage (INT 140, MIND 160) | 61 (+833) | 137 | 1,341 | ~640,000 |
| Sample elf (INT 95, MIND 115) | 176 (+2,314) | 374 | 3,650 | ~1.9 million |
| Average (100 / 100) | 204 (+2,673) | 432 | 4,210 | ~2.2 million |
| Barbarian (INT 70, MIND 70) | 563 (+7,437) | 1,215 | 12,000 | ~6.3 million |

Mastering a difficulty-10 spell is possible, but it's insanity.

### Mana

MP is meant to balloon. A difficulty-0 spell costs 0–50 mana and a difficulty-10 spell 10,000 or
more. Mages should cast mastered spells as constantly as a warrior swings a sword.

### Learning spells

Spells are learned the traditional ways: `learnSpell(c, id, method)`.

| Method | Backfire chance until mastered |
|---|---|
| A teacher | ×0.75 |
| A scroll or book | ×1 |
| Self-practice | ×1.5 (the most dangerous) |

The best method used counts.

**Focuses:** staves, orbs, books, bracelets, magic weapons, tattoos, wands, circles and ritual
sites (`FOCUS_TYPES`).

### Backfires

Each spell defines its own backfire in its own terms: a fire bolt explodes in the caster's hands; a
body-shaping spell shapes the wrong thing. Severity scales with the spell's power. The spell
definition carries `backfire: { kind, text }`.

### Kinds of magic

- **Traditional:** spellbooks and chants, by incantation or voiceless casting, as above.
- **Lunar (spirit):** what people call faith is spirit magic, drawing on the caster's own spirit
  or the spirits of a place. The gods of this world are only kind of real. It uses the same rules,
  governed by Spirit.
- **Enchanting and Talisman crafting:** trades that level like any profession, but you must know
  the spell you put into the object. How well it works depends on both the craft and the spell
  (`imbueEffectiveness(c, craft, spellId)`, the geometric mean of craft/1,000 and spell
  mastery/100). Bonus mastery adds up to +50%.
- **Blood and Forgotten magic:** story magic. Their strengths are set by events and the story and
  never grow with use.

Each cast also trains the school and the casting skill used (at passive pace, harder spells
teaching more) and attunement through the mana spent. No specialization applies: there's far too
much magic to learn to punish breadth.

### Code

- `castProfile(c, spell, { mode, focus })` returns power, mana, cast time, backfire chance and
  whether the spell is innate.
- `trainCast(c, spell, { mode, focus }, backfired)` applies the growth after a cast.
- Spells are defined in `src/data/spells.js`. The three there are generic test examples, not lore.
  Real spells get designed one by one as the game needs them.
