# Main stats

Every character has three layers of main stats. `effectiveMain(c)` adds them up, and everything
else (derived stats, how fast skills grow) reads the total.

| Layer | Field | Comes from | Limited by the body? | Touched by effects? |
|---|---|---|---|---|
| Trained | `c.main` | creation, then growth from use | yes | — |
| Effects | `c.effects` | professions, ailments, gear, transformations | — | — |
| Levels | `c.levelPoints` | combat levels, assigned freely | **never** | **never** |

## Trained stats and natural limits

Stats grow from use. Each use of a skill adds a little to the stats it exercises: a profession
builds its performance stats (smithing builds Strength and Endurance), and other skills build their
governing stats. Active practice gives five times as much as passive.

People have upper limits, and here they come from the body. A stat's **potential** is 4× its
natural value, the value from race and body alone (species shares, build, age), before background,
education or class. The minimum is 150. Past the potential, gains fall off steeply: half speed at
the potential, about 1/17 at twice it. It's a soft limit, so dedication can push past it, slowly.

| Character | Natural | Potential |
|---|---|---|
| Average human, Strength | 100 | 400 |
| Sample elf, Strength | 45 | 180 |
| Sample elf, Endurance | 63 | 252 |

### Transformations keep progress

Progress belongs to the character, not the body. A trained stat is stored as how far it sits
between the body's natural value and its potential, so changing bodies rescales it and changing
back restores it exactly. Example: a Draconian at 500 Strength (natural 140) becomes a small elf
(natural 70) and drops to 250, the elf's equivalent. Back as a Draconian they're at 500 again, or
higher if they trained in the meantime (10 points of elf training came back as 512).

`setBody(c, natural)` does this. It runs at creation and on every transformation.

### Limits on the sheet

Limits stay hidden. A stat's number turns yellow at 80% of the limit and red at 95%
(`limitState(c, stat)` returns 'ok', 'near' or 'at').

### Intelligence and Mind

Using a skill grows the stats it exercises, with one exception: casting magic never raises
Intelligence or Mind, any more than shouting the quadratic formula makes you smarter. Casting and
the casting skills (Attunement, Incantation, Voiceless casting, Mana control, Mana sense) raise
Spirit instead, the body's side of magic, and Attunement raises MP. Intelligence and Mind grow
through:
- `study(c, hours)`: Intelligence
- `meditate(c, hours)`: Mind, plus half as much Spirit

Both run about 6 points an hour passive, ×5 active, within the limits. Skills like Literacy still
build Intelligence as they're studied.

Example: the sample elf smithing. Strength 45 → 102 after 10 passive hours, 228 at 50, 285 at 100
and 342 at 200, slowing all the way. An average human doing the same reaches 614 by 200 hours.

## Effects

`c.effects` is a list of `{ id, name, main: { strength: -20, ... } }`. Professions, ailments,
equipment and transformations add and remove entries freely. They change the effective value but
never the trained one. The total can't drop below 1.

## Combat levels

In combat, the world's magic shapes a person as they see fit. It's little known, and it's why some
fighters at the battle between Dreadhoof and the guild showed power far beyond what hard work
explains. In game terms:

- Each level grants `POINTS_PER_LEVEL` (currently 5) points the player assigns to any main stat.
- Level points are a flat bonus on top of everything. Natural limits, effects and ailments never
  reduce or alter them, and once assigned they never change.
- They do count toward performance: a leveled fighter is a stronger smith.
- Combat XP comes only from killing or subduing monsters, and from quests that grant combat XP
  outright: `awardCombatXp(c, xp, 'kill' | 'subdue' | 'quest')`. Anything else is rejected.
- `xpToNext(level)` is a placeholder curve (100 × level^1.5). `assignPoints(c, stat, n)` spends points.
- Combat formulas (damage, hit, crits, defense) wait until there are enough systems to tune them by
  feel.

## Saves

`src/rpg/save.js`:
- **Slots:** saves live in browser storage as slots, listed newest first on the Load screen. The
  title screen offers Continue (newest), New game, Load game and Import save.
- **Files:** browser storage can be cleared, so any save can be written to a `.json` file ("Save to
  file", on the Load screen and after creation) and imported back. An import always gets a new slot.
- **Versions:** every save carries a version (now 3). Loading runs each migration in order, then
  `upgradeCharacter()`, so old saves pick up new skills, limits, levels and spells. The single save
  from before slots becomes the first slot automatically.

## Health, mana and stamina regeneration

Rates per second, from `derived()` in `src/rpg/stats.js`:

| | Rate | Average body |
|---|---|---|
| HP | max HP / 300 × √(Endurance/100) | 3.3/s, full in about 5 minutes |
| MP | max MP / 60 × √(Spirit/100) × √(Mana control/100) | full in about a minute |
| Stamina | (Endurance + Speed) / 40 | 5/s |

**Resting:** sitting (outside a camp) triples all three. Camps will add their own bonus later.
Current HP and MP are kept in the save (`save.vitals`).

## Movement training
Athletics and Swimming train at the normal active pace from moving. Moving builds Endurance only (never
Strength), with 2% of the usual spill (`statScale`), and the gain shrinks with the room left below the
body's limit (`approach`): fast when far below it, ever slower (logarithmic) as it nears, stopping there.
Nonstop sprinting and jumping for an hour: about +16 Endurance at 100 (limit 400), about +5 at 300.

## Progress bars
Skill and main stat bars fill toward the next whole point; the thin red line under a skill's bar is its
progress through the current rank (hover for both).
