# Weapon skill trees

Every weapon has its own tree (`src/data/weaponTrees.js`), shown on the book's **Weapons** tab.
The mace is written first; the rest follow down the weapon list.

## How nodes are bought

- **Gate:** each node needs a minimum skill in that weapon (rank thresholds: Apprentice 201,
  Journeyman 501, Expert 1001, Master 5001).
- **Points:** earned by using the weapon: one per 50 skill gained up to 1000 (18 points), then one
  per 500 beyond. Each rank of a node costs one point.
- **Prerequisites:** some nodes need an earlier one.
- **Branches:** two paths per tree that exclude each other. Buying the first node of one closes the
  other. (Respec at a trainer, later.)
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

## Testing

The test grounds have a **weapon rack** near the start (E to open): take any weapon into the pack,
then wear it from the Character page. The Weapons tab has a "+100 (test)" button to raise the
selected weapon's skill.
