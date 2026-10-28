# Skill trees

Every skill has its own tree (`src/data/skillTrees.js`), shown on the book's **Skill trees** tab,
grouped as Weapons, Combat, Magic, Life skills and General. Clicking a skill's name on any other page
of the book opens its tree.

- **Written:** the mace, Fire, athletics and swimming (see `CONTROLS.md` for the athletics moves). Athletics' Clamber
  and Vault are known from the start ("Known" in the book) and cost no points.
- **Placeholder trees:** every other skill gets a generic tree from its group's template (below),
  marked "Placeholder tree" in the book, to be replaced one by one.
- **Reset:** "Reset tree" refunds every point in that tree and reopens both paths (click twice to
  confirm).

## How nodes are bought

- **Gate:** each node needs a minimum skill in that weapon (rank thresholds: Apprentice 201,
  Journeyman 501, Expert 1001, Master 5001).
- **Points:** earned by using the weapon: one per 50 skill gained up to 1000 (18 points), then one
  per 500 beyond. Each rank of a node costs one point.
- **Prerequisites:** some nodes need an earlier one.
- **Sides and opposites:** each tree has two sides. Every side node has an opposite on the other side
  (same rank tier, same row); buying one locks only its opposite, nothing else. A requirement on a side
  node is also met by its opposite, so a lockout never spreads down the tree. Unpaired side nodes are
  never locked. Reset refunds everything.
- **Kinds:** active techniques (a move with its own input) and passive bonuses. Combat isn't built
  yet, so effects are stored as data for it to read.

## Mace

Paths: **Crusher** (break armor and bodies; offense) or **Warden** (guard, turn blows aside, punish;
defense).

| Gate | Node | Kind | Ranks | Path | Effect |
|---|---|---|---|---|---|
| 150 | Heavy swing | Passive | 3 | — | Mace damage +4% per rank |
| 150 | Bone breaker | Passive | 2 | — | Stagger +10% per rank |
| 200 | Overhead smash | Active | 1 | — | Hold attack to charge: up to 1.8× damage, heavy stagger; 20 stamina. Needs Heavy swing |
| 250 | Armor crack | Passive | 3 | Crusher | −5% target armor per rank, stacks 3×, 8 s |
| 400 | Ground slam | Active | 1 | Crusher | Damage and knockdown in a 3 m circle; 35 stamina |
| 250 | Guarded grip | Passive | 3 | Warden | Blocking costs 10% less stamina per rank |
| 400 | Counter bash | Active | 1 | Warden | Stunning counter right after a well-timed block |
| 550 | Momentum | Passive | 3 | — | Consecutive hits: +4% attack speed per rank, up to 3 stacks |
| 700 | Concussive blow | Active | 1 | — | Dazes for 2 s; large foes and bosses resist. Needs Overhead smash |
| 1200 | Shatter | Active | 1 | Crusher | Breaks a raised shield or cracked armor outright |
| 1200 | Bulwark | Passive | 1 | Warden | Guard up: allies within 4 m take 10% less damage |
| 1500 | Iron will | Passive | 2 | — | Stagger resistance +15% per rank with a mace |
| 5001 | Earthshaker | Active | 1 | either capstone | Leaping smash that splits the ground in a line, knocking all down |

One path's full set costs 18 points, all earned by Mace 1000; Earthshaker waits for Master.

## Fire

**How trees are laid out from here on:** actives are core techniques (the middle column, everyone on the
path gets them); passives sit on the two sides and are what you choose between (each locks its opposite).
Two actives that would use the same input, or change the same thing in different big ways, are a
one-or-the-other pair (`oneOf`): buying one locks the other.

Paths: **Pyromancer** (burns that bite deeper, last longer and spread; offense) or **Flamekeeper** (a
steady chant: safer, quicker, cheaper fire; control).

| Gate | Node | Kind | Ranks | Path | Effect |
|---|---|---|---|---|---|
| 200 | Overcast | Active | 1 | core | Keep holding a spoken fire spell after it's ready: up to +60% power over 1 s, for up to +80% mana. Let go to throw it (it goes by itself after the extra second) |
| 400 | Detonate | Active | 1 | core | With your fireball in flight, press the cast button again to burst it where it is |
| 700 | Twin bolt | Active | 1 | core, one or the other | Fire bolts leave as two, a little apart: each 75% damage, 50% more mana |
| 700 | Piercing bolt | Active | 1 | core, one or the other | Fire bolts burn through up to 3 targets, 25% less damage after each |
| 5001 | Inferno | Active | 1 | core capstone | A fireball spoken in full leaves the ground ablaze for 6 s; anything in it keeps burning. Needs Conflagration or Quickfire |
| 150 | Searing | Passive | 3 | Pyromancer | Burns deal 15% more per rank |
| 250 | Lingering flame | Passive | 2 | Pyromancer | Burns last 1 s longer per rank |
| 300 | Wide blast | Passive | 2 | Pyromancer | Fireballs burst 15% wider per rank |
| 600 | Wildfire | Passive | 1 | Pyromancer | Burning foes set others within 2 m alight (half strength) |
| 800 | Volatile | Passive | 2 | Pyromancer | Fire spells +10% damage per rank to anything already burning |
| 1500 | Conflagration | Passive | 1 | Pyromancer | Burns stack, up to 3 |
| 150 | Steady flame | Passive | 3 | Flamekeeper | Fire backfires 10% less often per rank |
| 250 | Fluent chant | Passive | 2 | Flamekeeper | Spoken fire spells cast 8% faster per rank |
| 300 | Ember thrift | Passive | 2 | Flamekeeper | Fire spells cost 8% less mana per rank |
| 600 | Unbroken chant | Passive | 1 | Flamekeeper | A long fire cast let go early unravels instead of backfiring (the mana spent so far is lost) |
| 800 | Fireward | Passive | 1 | Flamekeeper | Your own fire can't hurt you; fire backfires hurt half |
| 1500 | Quickfire | Passive | 2 | Flamekeeper | Quick (voiceless) fire casts 15% faster per rank |

Opposites (one locks the other): Searing / Steady flame, Lingering flame / Fluent chant, Wide blast /
Ember thrift, Wildfire / Unbroken chant, Volatile / Fireward, Conflagration / Quickfire.
Every node is wired: mana, cast time and backfire in `src/rpg/magic.js` (schoolMods), everything that
happens once fire is thrown in `src/game/spellcast.js`.

## Generic templates

Each has 13 nodes in the mace's shape (three openers, two nodes per path at Apprentice, two shared at
Journeyman, a capstone per path and a shared passive at Expert, and a Master technique).

| Group | Path A | Path B | Example nodes |
|---|---|---|---|
| Weapons | Aggressor (offense) | Duelist (technique) | Drills, Power strike, Sweeping arc / Riposte, Executioner / Unbroken |
| Combat skills | Stalwart (toughness) | Nimble (agility) | Brace, Iron hide / Light on your feet, Bastion / Ghost |
| Magic schools and casting skills | Potency (power) | Control (precision) | Overcast, Surge / Quicken, Unleash / Harmony |
| Life skills | Artisan (quality) | Industrious (quantity) | Focused work, Masterwork / Batch work, Signature / Bounty |
| General skills | Specialist (power) | Practical (consistency) | Knack, Flair / Steady, Virtuoso / Reliable |

## Testing

The test grounds have a **weapon rack** near the start (E to open): take any weapon into the pack,
then wear it from the Character page. The Skill trees tab has a "+100 (test)" button to raise the
selected skill.

## Climbing
Written by hand (src/data/skillTrees.js). Core: Climb (innate), Steady hold (150, ×3), Wet grip (201),
Dyno (300), Side leap (501), Push off (550), Spider (1200). Alpinist: Chalked hands (300, ×2), Catch
yourself (600), Enduring grip (600, ×2), Overhang (1200), Unfalling (5001). Free climber: Quick hands
(300, ×2), Ice climber (600), Resting hold (600), Fluid climber (1200), Lizard (5001). Opposites pair by
tier and row (Chalked hands ↔ Quick hands, Catch yourself ↔ Ice climber, Enduring grip ↔ Resting hold,
Overhang ↔ Fluid climber, Unfalling ↔ Lizard). Effects are read by src/game/controller.js.

## Sneak
Written by hand. Core: Wall hug (innate), Soft steps (150, ×3), Poles and pipes (150, also Athletics 150),
Tightrope (201, also Athletics 201), Spire landing (300, needs Poles and pipes, also Athletics 300), Wire
runner (401, needs Tightrope, also Athletics 401), Cloaked dodge (501), Ghost walker (1200). Shadow: Stillness (300, ×2), Wall shadow (600), Light feet (600), Unseen (1200), Vanish
(5001). Acrobat: Wire slide (300, also Athletics 300), Pole swing (600), Spire hop (600), Cat's balance
(1200), Shadow dancer (5001). Nodes may carry `also: { skill: level }` (hybrid), checked by canBuy.
